"""Asks the live sign-in service the three things the control panel's sign-in needs of it.

The page reports "The sign-in service could not be reached" for every answer a browser hides from
it: no answer at all, and also any answer without the Access-Control-Allow-Origin header naming the
page, which is what a Worker that throws sends. So this reads the service as the page would, from
outside Cloudflare: its index, the preflight of a sign-in with the page's Origin, and a sign-in
with no code, which the Worker must refuse in JSON, with the header, and before asking GitHub.
With CLOUDFLARE_API_TOKEN it also reads from Cloudflare whether the Worker's workers.dev address
is switched on. It changes nothing and ends non-zero when the page could not sign in.
"""

import json
import os
import sys
import urllib.error
import urllib.request

SERVICE = os.environ.get("SIGNIN_SERVICE", "https://symphony-signin.openspineconsortium.workers.dev")
ORIGIN = os.environ.get("SIGNIN_ORIGIN", "https://openspineconsortium.com")
API = "https://api.cloudflare.com/client/v4"
SCRIPT = "symphony-signin"


def call(method, path, body=None, origin=None, extra=None):
    """the status, the headers in lower case and the text of one answer, or None when none came"""
    request = urllib.request.Request(SERVICE + path, data=body, method=method)
    request.add_header("User-Agent", "symphony-signin-health")
    if origin:
        request.add_header("Origin", origin)
    for name, value in (extra or {}).items():
        request.add_header(name, value)
    try:
        with urllib.request.urlopen(request, timeout=30) as answer:
            return answer.status, {k.lower(): v for k, v in answer.headers.items()}, answer.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, {k.lower(): v for k, v in error.headers.items()}, error.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return None, {}, type(error).__name__ + ": " + str(getattr(error, "reason", error))[:200]


def readings():
    """each reading as (what was asked, whether it is as the page needs, what came back)"""
    out = []
    status, headers, text = call("GET", "/")
    out.append(("the index answers 200", status == 200 and "symphony-signin" in text, f"{status} {text[:160]}"))
    status, headers, text = call("OPTIONS", "/exchange", origin=ORIGIN,
                                 extra={"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    allowed = headers.get("access-control-allow-origin")
    out.append(("the preflight of a sign-in allows the page", status in (200, 204) and allowed == ORIGIN,
                f"{status}, Access-Control-Allow-Origin {allowed}"))
    status, headers, text = call("POST", "/exchange", body=b"{}", origin=ORIGIN, extra={"Content-Type": "application/json"})
    allowed = headers.get("access-control-allow-origin")
    try:
        word = json.loads(text).get("error")
    except (ValueError, AttributeError):
        word = None
    out.append(("a sign-in with no code is refused in JSON the page can read",
                status is not None and 400 <= status < 500 and allowed == ORIGIN and bool(word),
                f"{status}, Access-Control-Allow-Origin {allowed}, {text[:160]}"))
    return out


def cloudflare_subdomain(token):
    """whether Cloudflare serves the Worker on workers.dev, or why that could not be read"""
    def ask(path):
        request = urllib.request.Request(API + path)
        request.add_header("Authorization", "Bearer " + token)
        with urllib.request.urlopen(request, timeout=30) as answer:
            return json.loads(answer.read().decode("utf-8")).get("result")
    try:
        accounts = ask("/accounts") or []
        named = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
        account = named or (accounts[0]["id"] if len(accounts) == 1 else "")
        if not account:
            return None, f"the token reaches {len(accounts)} accounts"
        result = ask(f"/accounts/{account}/workers/scripts/{SCRIPT}/subdomain") or {}
        return bool(result.get("enabled")), json.dumps(result)[:160]
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as error:
        return None, type(error).__name__


def main():
    good = True
    for what, ok, seen in readings():
        print(("ok    " if ok else "WRONG ") + what + ": " + seen)
        good = good and ok
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if token:
        enabled, seen = cloudflare_subdomain(token)
        print(("ok    " if enabled else "WRONG " if enabled is False else "?     ") + "Cloudflare serves it on workers.dev: " + seen)
        good = good and enabled is not False
    return 0 if good else 1


if __name__ == "__main__":
    sys.exit(main())
