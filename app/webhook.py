"""The App's webhook server: POST /webhook for GitHub, GET /health.

GitHub gives a delivery ten seconds before it counts it failed, and a
handler makes several API calls, so the server answers 202 as soon as the
signature holds and the body is JSON, and the event is handled after, on
a worker thread. There is one worker, so events are handled in the order
they arrived and the check run made last on a commit is made by the event
handled last (app/handlers.py reads the pull request afresh for the same
reason); the request threads stay free to answer GitHub meanwhile.

The signature, X-Hub-Signature-256, is the HMAC-SHA256 of the raw body
under WEBHOOK_SECRET, compared in constant time before the body is
parsed, so a forged or garbled delivery costs nothing past the check and
gets 401.

The log is passive and complete: every delivery, accepted or refused,
is one JSON line on stdout with its delivery id, event, action,
repository, duration_ms and outcome, which is what a container platform
collects. No secret, token, signature or payload body is ever logged; the
default access log of http.server is silenced for that reason too, since
the JSON line already says everything it would.

Run it as `python3 -m app.webhook` (the Docker image's entrypoint), with
the settings in the environment or in the env file scripts/register.py
wrote (--env-file .sdlc-app.env).
"""

import argparse
import hashlib
import hmac
import json
import os
import queue
import signal
import sys
import threading
import time
import traceback
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app import envfile, handlers
from app.github import Client, InstallationTokens, urllib_transport
from app.jwt import APP_ID_VARIABLE, AppKey, SigningError, app_jwt

DEFAULT_PORT = 3000
# GitHub caps a webhook payload at 25 MB; anything longer is not GitHub.
MAX_BODY = 25 * 1024 * 1024
SECRET_VARIABLE = "WEBHOOK_SECRET"
# How long a stopping server waits for the events it already accepted.
DRAIN_SECONDS = 8
WRITE_LOCK = threading.Lock()


def print_line(record):
    """Write one log record as one JSON line; the lock keeps two threads'
    lines from interleaving."""
    line = json.dumps(record, sort_keys=False)
    with WRITE_LOCK:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def log_record(delivery, event, action, repository, started, outcome):
    return {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "delivery": delivery,
        "event": event,
        "action": action,
        "repository": repository,
        "duration_ms": round((time.monotonic() - started) * 1000),
        "outcome": outcome,
    }


def signature_of(secret, body):
    return "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()


def signature_matches(secret, body, header):
    """Whether X-Hub-Signature-256 is the body's HMAC under the secret.
    Both sides are compared as bytes, so a header with characters outside
    ASCII is a mismatch rather than a TypeError."""
    if not header:
        return False
    expected = signature_of(secret, body).encode("ascii")
    return hmac.compare_digest(expected, header.encode("utf-8", "replace"))


class Worker:
    """One thread that runs the accepted events in arrival order."""

    def __init__(self):
        self.jobs = queue.Queue()
        self.thread = threading.Thread(target=self.run, name="symphony-app-worker", daemon=True)
        self.thread.start()

    def submit(self, job):
        self.jobs.put(job)

    def run(self):
        while True:
            job = self.jobs.get()
            try:
                if job is None:
                    return
                job()
            except Exception:
                # run_event handles a handler's failure itself; this is
                # for a failure past it, such as a log write, which must
                # not end the one thread every later event waits on.
                traceback.print_exc(file=sys.stderr)
            finally:
                self.jobs.task_done()

    def wait(self):
        """Block until every job submitted so far has run (the tests' hook)."""
        self.jobs.join()

    def stop(self, timeout=DRAIN_SECONDS):
        self.jobs.put(None)
        self.thread.join(timeout)


class WebhookServer(ThreadingHTTPServer):
    """dispatch(event, payload) handles one event and returns its outcome;
    log(record) writes one log record."""

    daemon_threads = True

    def __init__(self, address, secret, dispatch, log=print_line):
        if not secret:
            raise ValueError(f"{SECRET_VARIABLE} is empty; the server verifies every delivery with it")
        self.secret = secret.encode("utf-8")
        self.dispatch = dispatch
        self.log = log
        self.worker = Worker()
        super().__init__(address, WebhookRequestHandler)

    def accept(self, delivery, event, payload, started):
        self.worker.submit(lambda: self.run_event(delivery, event, payload, started))

    def run_event(self, delivery, event, payload, started):
        try:
            outcome = self.dispatch(event, payload)
        except Exception as error:
            # The type and message say what failed; the traceback, on
            # stderr, says where. Neither carries the payload or a token.
            outcome = f"error: {type(error).__name__}: {error}"
            traceback.print_exc(file=sys.stderr)
        repository = (payload.get("repository") or {}).get("full_name")
        self.log(log_record(delivery, event, payload.get("action"), repository, started, outcome))

    def refuse(self, delivery, event, started, outcome):
        self.log(log_record(delivery, event, None, None, started, outcome))


class WebhookRequestHandler(BaseHTTPRequestHandler):
    server_version = "symphony-app"
    sys_version = ""

    def do_GET(self):
        if self.route() == "/health":
            self.answer(200, "ok")
        else:
            self.answer(404, "not found")

    def do_POST(self):
        started = time.monotonic()
        if self.route() != "/webhook":
            self.answer(404, "not found")
            return
        delivery = self.headers.get("X-GitHub-Delivery")
        event = self.headers.get("X-GitHub-Event")
        body = self.read_body(delivery, event, started)
        if body is None:
            return
        if not signature_matches(self.server.secret, body, self.headers.get("X-Hub-Signature-256")):
            self.answer(401, "the signature does not match")
            self.server.refuse(delivery, event, started, "refused: the signature does not match")
            return
        try:
            payload = json.loads(body)
        except ValueError:
            payload = None
        if not isinstance(payload, dict) or not event:
            self.answer(400, "not a GitHub event")
            self.server.refuse(delivery, event, started, "refused: not a JSON event")
            return
        self.answer(202, "accepted")
        self.server.accept(delivery, event, payload, started)

    def read_body(self, delivery, event, started):
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY:
            self.answer(413 if length > MAX_BODY else 411, "a webhook has a Content-Length up to 25 MB")
            self.server.refuse(delivery, event, started, "refused: no usable Content-Length")
            return None
        return self.rfile.read(length)

    def route(self):
        return urllib.parse.urlsplit(self.path).path

    def answer(self, status, text):
        body = (text + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        """Silence http.server's access log; the JSON lines replace it."""


@dataclass(frozen=True)
class Config:
    port: int
    app_id: str
    key: AppKey
    secret: str = field(repr=False)

    @classmethod
    def from_environment(cls, environ):
        """The settings, or SystemExit naming (never showing) what is missing."""
        problems = [f"{name} is not set" for name in (SECRET_VARIABLE, APP_ID_VARIABLE) if not environ.get(name)]
        try:
            key = AppKey.from_environment(environ)
        except SigningError as error:
            problems.append(str(error))
        if problems:
            raise SystemExit("symphony-app cannot start: " + "; ".join(problems))
        return cls(port=int(environ.get("PORT") or DEFAULT_PORT), app_id=environ[APP_ID_VARIABLE],
                   key=key, secret=environ[SECRET_VARIABLE])


def dispatcher(config, transport=urllib_transport):
    """dispatch(event, payload) for the server: the handlers, given a client
    for the event's installation on a token the shared cache keeps."""
    tokens = InstallationTokens(lambda: app_jwt(config.app_id, config.key), transport)

    def client_for(installation_id):
        return Client(tokens, installation_id, transport)

    def dispatch(event, payload):
        return handlers.handle(event, payload, client_for, app_id=config.app_id)

    return dispatch


def stop_on_sigterm(signum, frame):
    """docker stop sends SIGTERM, which a process running as PID 1 would
    otherwise ignore until the SIGKILL ten seconds later."""
    raise SystemExit(0)


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python3 -m app.webhook", description=__doc__.splitlines()[0])
    parser.add_argument("--env-file", help="read settings from this file, as scripts/register.py writes it; "
                                           "the environment wins over it")
    args = parser.parse_args(argv)
    if args.env_file:
        envfile.load_into_environment(args.env_file)
    config = Config.from_environment(os.environ)
    server = WebhookServer(("", config.port), config.secret, dispatcher(config))
    signal.signal(signal.SIGTERM, stop_on_sigterm)
    print_line({"time": datetime.now(timezone.utc).isoformat(timespec="seconds"), "event": "start",
                "outcome": f"listening on port {server.server_address[1]} for App {config.app_id}"})
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        server.worker.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
