#!/usr/bin/env python3
"""Register the GitHub App "sdlc" for an organization, by GitHub's manifest flow.

GitHub makes an App from a manifest (manifest.json) in three steps: a
form POSTs the manifest to the organization's "new App" page, the owner
confirms it there, and GitHub sends the browser back to redirect_url with
a one-time code, which POST /app-manifests/{code}/conversions turns into
the App's id, slug, webhook secret and private key. This script serves the
form and the return on http://localhost:3010, so the key goes from GitHub
straight into .sdlc-app.env (mode 0600, ignored by git and by docker) and
is never shown on a screen or pasted anywhere.

The state sent with the form is random and checked on return, so a code
that did not come from this run's form is refused before it is used. The
client id and client secret the conversion also returns are for signing
users in, which this App does not do; they are not written, and GitHub
lets the owner make a new client secret whenever one is needed.

    python3 scripts/register.py --org OpenSpineConsortium
    python3 scripts/register.py --org OpenSpineConsortium --webhook-url https://sdlc.example.org/webhook
    python3 scripts/register.py --print-key | gh secret set SDLC_APP_PRIVATE_KEY --repo OWNER/NAME

Without --webhook-url the App's webhook stays off (stage 1, tokens only);
stage 2 turns it on later in the App's settings (README.md).
"""

import argparse
import hmac
import html
import json
import secrets
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# scripts/ is no package; the repository root on the path makes app importable.
sys.path.insert(0, str(ROOT))

from app import envfile
from app.github import API, API_VERSION, USER_AGENT, GitHubError, github_message, urllib_transport
from app.jwt import pem_text

PORT = 3010
MANIFEST = ROOT / "manifest.json"
ENV_FILE = ROOT / ".sdlc-app.env"


def manifest_for(webhook_url=None, port=PORT, path=MANIFEST):
    """The manifest to send: the file's, with the webhook on at the URL
    given or left off, and the return address on this script's port."""
    manifest = json.loads(Path(path).read_text(encoding="utf-8"))
    if webhook_url:
        manifest["hook_attributes"] = {"url": webhook_url, "active": True}
    manifest["redirect_url"] = f"http://localhost:{port}/registered"
    return manifest


def new_app_url(org, state):
    return (f"https://github.com/organizations/{urllib.parse.quote(org, safe='')}/settings/apps/new"
            f"?state={urllib.parse.quote(state, safe='')}")


def form_page(org, state, manifest):
    """The page whose one button POSTs the manifest to GitHub."""
    value = html.escape(json.dumps(manifest), quote=True)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Register the sdlc App</title></head>
<body style="font-family: sans-serif; max-width: 40em; margin: 3em auto">
<h1>Register the sdlc App for {html.escape(org)}</h1>
<p>The button sends this manifest to GitHub, which asks you to confirm the App's name, permissions and events.
GitHub then sends you back here, and the terminal says what comes next.</p>
<pre style="background: #f4f4f4; padding: 1em; overflow: auto">{html.escape(json.dumps(manifest, indent=2))}</pre>
<form action="{html.escape(new_app_url(org, state), quote=True)}" method="post">
<input type="hidden" name="manifest" value="{value}">
<button type="submit">Create the App on GitHub</button>
</form>
</body></html>
"""


def convert(code, transport=urllib_transport, api=API):
    """Exchange the one-time code for the App's credentials. The call needs
    no authentication: the code, valid for an hour, is the credential."""
    url = f"{api}/app-manifests/{urllib.parse.quote(code, safe='')}/conversions"
    headers = {"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT,
               "X-GitHub-Api-Version": API_VERSION}
    reply = transport("POST", url, headers, None)
    if reply.status >= 400:
        raise GitHubError("POST", "/app-manifests/{code}/conversions", reply.status, github_message(reply.body))
    return json.loads(reply.body)


def env_values(app):
    """What .sdlc-app.env holds, and whether the webhook secret was made
    here: GitHub may leave it empty for an App whose webhook is off, and
    the server will need one the day the webhook goes on."""
    secret = app.get("webhook_secret")
    made_here = not secret
    values = {
        "SDLC_APP_ID": str(app["id"]),
        "SDLC_APP_SLUG": app["slug"],
        "WEBHOOK_SECRET": secret or secrets.token_hex(32),
        "SDLC_APP_PRIVATE_KEY": envfile.one_line(app["pem"]),
    }
    return values, made_here


def next_steps(org, values, env_path, repos, secret_made_here):
    app_id, slug = values["SDLC_APP_ID"], values["SDLC_APP_SLUG"]
    lines = [
        f"Registered the App {slug} (id {app_id}) for {org}. Its id, slug, webhook secret and private key",
        f"are in {env_path} (mode 0600, ignored by git and docker); keep that file, it is the only copy of the key.",
        "",
        "1. Install the App on the repositories it serves (sdlc-template and its copies):",
        f"   https://github.com/apps/{slug}/installations/new",
        "",
        "2. Stage 1, a token for each repository's workflows: set the variable and the secret, then make the",
        "   workflow change README.md describes (Stage 1). For each repository:",
    ]
    for repo in repos:
        lines += [f"   gh variable set SDLC_APP_ID --repo {repo} --body {app_id}",
                  f"   python3 scripts/register.py --env-file {env_path} --print-key"
                  f" | gh secret set SDLC_APP_PRIVATE_KEY --repo {repo}"]
    lines += [
        "",
        "3. Stage 2, the webhook backend: start the server with the env file,",
        f"   docker build -t sdlc-app . && docker run --rm --env-file {env_path} -p 3000:3000 sdlc-app",
        f"   (or python3 -m app.webhook --env-file {env_path}), expose its /webhook, then in the App's settings",
        f"   (https://github.com/organizations/{org}/settings/apps/{slug}) set the webhook URL, tick Active,",
        "   and set the webhook secret to the WEBHOOK_SECRET in the env file (README.md, Stage 2).",
    ]
    if secret_made_here:
        lines.append("   GitHub returned no webhook secret for an App whose webhook is off; the one in the env file "
                     "was made here.")
    return "\n".join(lines)


class Registration:
    """One run of the flow: the state it sent, and what the return does.
    convert is an argument so the tests fake GitHub's conversion call."""

    def __init__(self, org, env_path, repos, state=None, convert=convert):
        self.org = org
        self.env_path = Path(env_path)
        self.repos = repos
        self.state = state or secrets.token_urlsafe(24)
        self.convert = convert
        self.steps = None

    @property
    def done(self):
        return self.steps is not None

    def finish(self, query):
        """The answer to GitHub's return, as (status, text): the state is
        checked before the code is used, and the env file written only
        from a conversion that succeeded."""
        values = urllib.parse.parse_qs(query)
        state = (values.get("state") or [""])[0]
        code = (values.get("code") or [""])[0]
        if not hmac.compare_digest(state.encode("utf-8"), self.state.encode("utf-8")):
            return 400, ("The state does not match the form this script served, so the code was not used. "
                         "Start again from the page the terminal names.")
        if not code:
            return 400, "GitHub sent no code; nothing was registered here."
        env, made_here = env_values(self.convert(code))
        envfile.write(self.env_path, env, header="The sdlc App's credentials, written by scripts/register.py.\n"
                                                 "Never commit, copy or print this file.")
        self.steps = next_steps(self.org, env, self.env_path, self.repos, made_here)
        return 200, f"Registered the App {env['SDLC_APP_SLUG']}. The terminal says what comes next; close this tab."


def handler_for(registration, manifest):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            route, _, query = self.path.partition("?")
            if route == "/":
                self.answer(200, form_page(registration.org, registration.state, manifest), "text/html")
            elif route == "/registered":
                try:
                    status, text = registration.finish(query)
                except Exception as error:
                    # The page says why; the flow stays open, so a second
                    # try from the form needs no restart.
                    status, text = 502, f"The conversion failed: {type(error).__name__}: {error}"
                self.answer(status, text + "\n", "text/plain")
            else:
                self.answer(404, "not found\n", "text/plain")

        def answer(self, status, text, kind):
            body = text.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", f"{kind}; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            """Quiet: the return URL carries the one-time code."""

    return Handler


def serve(registration, manifest, port=PORT):
    """Serve the form and the return on localhost until the App is made."""
    server = HTTPServer(("127.0.0.1", port), handler_for(registration, manifest))
    server.timeout = 1
    print(f"Open http://localhost:{port}/ in a browser signed in as an owner of {registration.org}, "
          "and press the button.", flush=True)
    try:
        while not registration.done:
            server.handle_request()
    finally:
        server.server_close()
    print(registration.steps)


def print_key(env_path):
    """Write the private key from the env file to stdout, for a pipe into
    gh secret set; refused on a terminal, where it would land on screen."""
    if sys.stdout.isatty():
        print("The key goes into a pipe, never onto the screen: "
              "python3 scripts/register.py --print-key | gh secret set SDLC_APP_PRIVATE_KEY --repo OWNER/NAME",
              file=sys.stderr)
        return 2
    key = envfile.read(env_path).get("SDLC_APP_PRIVATE_KEY")
    if not key:
        print(f"{env_path} holds no SDLC_APP_PRIVATE_KEY", file=sys.stderr)
        return 1
    sys.stdout.write(pem_text(key))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--org", help="the organization that owns the App")
    parser.add_argument("--webhook-url", help="the webhook's URL; without it the webhook stays off")
    parser.add_argument("--repo", action="append", dest="repos", metavar="OWNER/NAME",
                        help="a repository to print the stage 1 commands for (repeatable; "
                             "default ORG/sdlc-template)")
    parser.add_argument("--port", type=int, default=PORT, help=f"the local port (default {PORT})")
    parser.add_argument("--env-file", default=str(ENV_FILE), help="where the credentials go (default .sdlc-app.env)")
    parser.add_argument("--print-key", action="store_true", help="write the env file's private key to a pipe")
    args = parser.parse_args(argv)
    if args.print_key:
        return print_key(args.env_file)
    if not args.org:
        parser.error("--org is required to register")
    if Path(args.env_file).exists():
        print(f"{args.env_file} already exists and may hold another App's only key; "
              "move it away or give --env-file", file=sys.stderr)
        return 1
    registration = Registration(args.org, args.env_file, args.repos or [f"{args.org}/sdlc-template"])
    try:
        serve(registration, manifest_for(args.webhook_url, args.port), args.port)
    except KeyboardInterrupt:
        print("\nStopped; nothing was registered.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
