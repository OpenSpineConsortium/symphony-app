"""Deploys signin/worker.js to the Cloudflare Worker symphony-signin.

The owner asked for no step of theirs after a merge, so a change to the sign-in service goes live
by itself: .github/workflows/deploy-signin.yml runs this on every push to main that changes the
Worker. It uploads the file through Cloudflare's API with the one secret CLOUDFLARE_API_TOKEN, a
token made once from Cloudflare's "Edit Cloudflare Workers" template (signin/README.md).

What the Worker's page in Cloudflare holds besides the code stays as it is: the upload first reads
the Worker's settings and sends back their compatibility date and flags, their observability (the
invocation logs the README turns off) and the kinds of every binding, so Cloudflare keeps the client
ids, the client secrets and any rate limiter it already holds. The account is the one the token
reaches, or CLOUDFLARE_ACCOUNT_ID where the token reaches several. Nothing here prints the token.
"""

import json
import os
import sys
import urllib.error
import urllib.request
import uuid

API = "https://api.cloudflare.com/client/v4"
SCRIPT = "symphony-signin"
SOURCE = os.path.join(os.path.dirname(__file__), "..", "signin", "worker.js")


class DeployError(Exception):
    pass


def ask(method, path, token, body=None, content_type=None):
    request = urllib.request.Request(API + path, data=body, method=method)
    request.add_header("Authorization", "Bearer " + token)
    if content_type:
        request.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(request, timeout=60) as answer:
            data = json.loads(answer.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise DeployError(method + " " + path + " answered " + str(error.code) + ": " + cloudflare_words(error))
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        raise DeployError(method + " " + path + " failed: " + type(error).__name__)
    if not data.get("success"):
        raise DeployError(method + " " + path + " was refused: " + errors_of(data))
    return data.get("result")


def cloudflare_words(error):
    try:
        return errors_of(json.loads(error.read().decode("utf-8")))
    except (ValueError, UnicodeDecodeError):
        return "no readable answer"


def errors_of(data):
    errors = data.get("errors") if isinstance(data, dict) else None
    if not isinstance(errors, list) or not errors:
        return "no reason given"
    return "; ".join(str(e.get("message", ""))[:200] for e in errors if isinstance(e, dict))


def pick_account(accounts, named):
    """the account to deploy to: the one named, else the only one the token reaches"""
    ids = [a.get("id") for a in accounts or [] if isinstance(a, dict) and a.get("id")]
    if named:
        if named not in ids:
            raise DeployError("the token does not reach the account CLOUDFLARE_ACCOUNT_ID names")
        return named
    if len(ids) != 1:
        raise DeployError("the token reaches " + str(len(ids)) + " accounts; set the repository variable CLOUDFLARE_ACCOUNT_ID to the one that holds " + SCRIPT)
    return ids[0]


def upload_metadata(settings):
    """the metadata that replaces the code alone, keeping what the Worker's settings hold"""
    settings = settings if isinstance(settings, dict) else {}
    kinds = sorted({b.get("type") for b in settings.get("bindings") or [] if isinstance(b, dict) and b.get("type")})
    metadata = {"main_module": "worker.js", "keep_bindings": kinds}
    for key in ("compatibility_date", "compatibility_flags", "observability"):
        if settings.get(key):
            metadata[key] = settings[key]
    return metadata


def multipart(metadata, source):
    """the form Cloudflare's script upload takes: the metadata, then the module"""
    boundary = "symphony-" + uuid.uuid4().hex
    parts = [
        ("metadata", "metadata.json", "application/json", json.dumps(metadata).encode("utf-8")),
        ("worker.js", "worker.js", "application/javascript+module", source),
    ]
    body = b""
    for name, filename, kind, content in parts:
        body += ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\nContent-Type: " + kind + "\r\n\r\n").encode("ascii")
        body += content + b"\r\n"
    body += ("--" + boundary + "--\r\n").encode("ascii")
    return body, "multipart/form-data; boundary=" + boundary


def deploy(token, named_account):
    account = pick_account(ask("GET", "/accounts", token), named_account)
    script = "/accounts/" + account + "/workers/scripts/" + SCRIPT
    metadata = upload_metadata(ask("GET", script + "/settings", token))
    with open(SOURCE, "rb") as handle:
        body, kind = multipart(metadata, handle.read())
    ask("PUT", script, token, body, kind)
    return metadata


def main():
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not token:
        print("::notice::CLOUDFLARE_API_TOKEN is not set, so the sign-in service was not deployed (signin/README.md)")
        return 0
    try:
        metadata = deploy(token, os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip())
    except DeployError as error:
        print("::error::" + str(error))
        return 1
    print("deployed " + SCRIPT + ", keeping its bindings of kind " + (", ".join(metadata["keep_bindings"]) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
