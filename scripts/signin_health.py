"""Asks the live sign-in service the three things the control panel's sign-in needs of it.

The page reports "The sign-in service could not be reached" for every answer a browser hides from
it: no answer at all, and also any answer without the Access-Control-Allow-Origin header naming the
page, which is what a Worker that throws sends. So this reads the service as the page would, from
outside Cloudflare: its index, the preflight of a sign-in with the page's Origin, and a sign-in
with no code, which the Worker must refuse in JSON, with the header, and before asking GitHub.
With CLOUDFLARE_API_TOKEN it also reads from Cloudflare whether the Worker's workers.dev address
is switched on, and how the Worker's calls of the last hours ended, minute by minute, so a sign-in
that failed in someone's browser shows whether it reached the Worker at all. It changes nothing and
ends non-zero when the page could not sign in.
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


GRAPHQL = """query($account: String!, $since: Time!, $until: Time!) { viewer { accounts(filter: {accountTag: $account}) {
  workersInvocationsAdaptive(limit: 500, filter: {scriptName: "%s", datetime_geq: $since, datetime_leq: $until},
                             orderBy: [datetimeMinute_ASC]) {
    sum { requests errors subrequests } quantiles { cpuTimeP50 wallTimeP99 } dimensions { datetimeMinute status } } } } }""" % SCRIPT


def cloudflare_account(token):
    """the account the token reaches, or None"""
    named = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if named:
        return named
    request = urllib.request.Request(API + "/accounts")
    request.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(request, timeout=30) as answer:
        accounts = json.loads(answer.read().decode("utf-8")).get("result") or []
    return accounts[0]["id"] if len(accounts) == 1 else None


def recent_calls(token, hours):
    """the Worker's calls of the last hours as lines, one per minute and outcome, or why not"""
    import datetime
    until = datetime.datetime.now(datetime.timezone.utc)
    since = until - datetime.timedelta(hours=hours)
    try:
        account = cloudflare_account(token)
        if not account:
            return ["?     the token reaches no single account"]
        body = json.dumps({"query": GRAPHQL, "variables": {"account": account, "since": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                                            "until": until.strftime("%Y-%m-%dT%H:%M:%SZ")}}).encode()
        request = urllib.request.Request(API + "/graphql", data=body, method="POST")
        request.add_header("Authorization", "Bearer " + token)
        request.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(request, timeout=30) as answer:
            data = json.loads(answer.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as error:
        return ["?     the Worker's recent calls could not be read: " + type(error).__name__ + " " + str(error)[:200]]
    if data.get("errors"):
        return ["?     the Worker's recent calls could not be read: " + json.dumps(data["errors"])[:300]]
    rows = data["data"]["viewer"]["accounts"][0]["workersInvocationsAdaptive"]
    lines = [f"calls of the last {hours} hours, by minute and outcome ({len(rows)} rows):"]
    for row in rows:
        d, s, q = row["dimensions"], row["sum"], row["quantiles"]
        lines.append(f"      {d['datetimeMinute']} {d['status']:<22} requests {s['requests']:>3} errors {s['errors']:>2}"
                     f" subrequests {s['subrequests']:>3} wall p99 {q['wallTimeP99'] / 1000:.0f} ms")
    return lines


def ask_json(token, method, path, body=None):
    request = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    request.add_header("Authorization", "Bearer " + token)
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as answer:
            return json.loads(answer.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return {"http_error": error.code, "body": error.read().decode("utf-8", "replace")[:400]}


def pick(event, *path):
    for key in path:
        if not isinstance(event, dict):
            return None
        event = event.get(key)
    return event


def recent_events(token, hours):
    """each recent call's time, route, answer and the Origin it came with, from Workers Logs; no body,
    no query and no address is printed"""
    import time
    now = int(time.time() * 1000)
    try:
        account = cloudflare_account(token)
        data = ask_json(token, "POST", f"/accounts/{account}/workers/observability/telemetry/query", {
            "queryId": "signin-health", "view": "events", "limit": 100,
            "timeframe": {"from": now - hours * 3600 * 1000, "to": now},
            "parameters": {"filters": [{"key": "$metadata.service", "operation": "eq", "type": "string", "value": SCRIPT}]}})
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as error:
        return ["?     the Worker's logs could not be read: " + type(error).__name__]
    events = pick(data, "result", "events", "events")
    if not isinstance(events, list):
        return ["?     the Worker's logs could not be read: " + json.dumps(data)[:400]]
    lines = [f"the Worker's logged calls of the last {hours} hours ({len(events)}):"]
    for event in sorted(events, key=lambda e: e.get("timestamp") or 0):
        request = pick(event, "$workers", "event", "request") or {}
        headers = request.get("headers") or {}
        url = str(request.get("url") or pick(event, "$metadata", "url") or "")
        route = url.split("?")[0].split("workers.dev")[-1]
        stamp = time.strftime("%H:%M:%S", time.gmtime((event.get("timestamp") or 0) / 1000))
        lines.append(f"      {stamp} {request.get('method') or ''} {route} -> "
                     f"{pick(event, '$workers', 'event', 'response', 'status')} {pick(event, '$workers', 'outcome')}"
                     f" wall {pick(event, '$workers', 'wallTimeMs')} ms origin {headers.get('origin')}")
    return lines


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
        hours = int(os.environ.get("SIGNIN_HOURS", "6"))
        for line in recent_calls(token, hours) + recent_events(token, hours):
            print(line)
    return 0 if good else 1


if __name__ == "__main__":
    sys.exit(main())
