"""Whether each of the owner's installations of the App holds what the App asks for.

GitHub gives an installation a permission the App adds later only once
someone accepts it on the installation's settings page, so an App that
asks for Administration can still be refused it on an installation that
was made before. The control panel's Share tab and the Settings workflow
of every copy need Administration, and nothing on the page says whether
the installation took it: this script reads it from GitHub. With the
App's JWT it reads the App's own permissions and every installation's,
names the permissions an installation of the owner's has not accepted,
with the page where they are accepted, and then asks GitHub, on that
installation's token, for the invitations of each of its repositories,
which only an installation holding Administration may read, so the
answer is GitHub's and not this script's reading of a list. Nothing is
written anywhere. An installation on any other account is counted and
never named, as the collector never names one.
"""

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# scripts/ is no package; the repository root on the path makes app importable.
sys.path.insert(0, str(ROOT))

from app.github import API, Api, GitHubError, InstallationTokens, urllib_transport
from app.jwt import APP_ID_VARIABLE, AppKey, SigningError, app_jwt

OWNERS_VARIABLE = "SYMPHONY_OWNER_ACCOUNTS"
# At most this many repositories of one installation are asked, enough for
# the owner's accounts and few enough calls to stay well under the limit.
PROBE_LIMIT = 50
LEVELS = {"read": 1, "write": 2, "admin": 3}


def short_of(wanted, granted):
    """The permissions granted holds below what wanted asks for, by name."""
    return sorted(name for name, level in wanted.items()
                  if LEVELS.get(granted.get(name), 0) < LEVELS.get(level, 0))


def settings_page(installation):
    account = installation["account"]
    if account.get("type") == "Organization":
        return f"https://github.com/organizations/{account['login']}/settings/installations/{installation['id']}"
    return f"https://github.com/settings/installations/{installation['id']}"


def probe(client, full_name):
    """GitHub's answer to reading the repository's invitations: 200 where
    the installation holds Administration, 403 where it does not."""
    try:
        client.request("GET", f"/repos/{full_name}/invitations", params={"per_page": 1})
        return 200
    except GitHubError as error:
        return error.status


def probe_installation(installation, tokens, transport, api):
    client = Api(lambda: tokens.token(installation["id"]), transport, api)
    repositories = client.get_all("/installation/repositories", key="repositories")[:PROBE_LIMIT]
    return [(repository["full_name"], probe(client, repository["full_name"])) for repository in repositories]


def report_installation(installation, app_permissions, tokens, transport, api):
    account = installation["account"]
    lines = [f"installation on {account['login']} ({account.get('type', 'account')}, "
             f"{installation.get('repository_selection', 'some')} repositories)"]
    missing = short_of(app_permissions, installation.get("permissions") or {})
    if missing:
        lines.append(f"  not accepted yet: {', '.join(missing)}; accept them at {settings_page(installation)}")
    else:
        lines.append("  holds every permission the App asks for")
    answers = probe_installation(installation, tokens, transport, api)
    refused = [name for name, status in answers if status != 200]
    lines.append(f"  invitations read on {len(answers) - len(refused)} of {len(answers)} repositories"
                 + (f"; refused on {', '.join(refused)}" if refused else ""))
    return lines, bool(missing or refused)


def report(app_jwt_source, owners, manifest, transport=urllib_transport, api=API):
    """The report's lines, and whether any installation of the owner's
    falls short."""
    app = Api(app_jwt_source, transport, api)
    registered = app.get("/app")
    app_permissions = registered.get("permissions") or {}
    lines = [f"{registered.get('name', 'The App')} asks for: "
             + ", ".join(f"{name} {level}" for name, level in sorted(app_permissions.items()))]
    behind = short_of(manifest, app_permissions)
    if behind:
        lines.append(f"the App's registration lacks what manifest.json asks for: {', '.join(behind)}; add them "
                     f"under Permissions & events at https://github.com/settings/apps/{registered.get('slug', '')}/permissions")
    tokens = InstallationTokens(app_jwt_source, transport, api)
    short = bool(behind)
    others = others_short = 0
    for installation in app.get_all("/app/installations"):
        if installation["account"]["login"].lower() not in owners:
            others += 1
            others_short += bool(short_of(app_permissions, installation.get("permissions") or {}))
            continue
        found, falls_short = report_installation(installation, app_permissions, tokens, transport, api)
        lines.extend(found)
        short = short or falls_short
    lines.append(f"{others} other installations, {others_short} of them yet to accept a permission")
    return lines, short


def owners_of(environ):
    names = (environ.get(OWNERS_VARIABLE) or "").replace(",", " ").split()
    return {name.lower() for name in names}


def main(argv=None, environ=None, transport=urllib_transport):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifest", default=str(ROOT / "manifest.json"))
    args = parser.parse_args(argv)
    environ = os.environ if environ is None else environ
    if not environ.get(APP_ID_VARIABLE):
        print(f"permissions: {APP_ID_VARIABLE} is not set", file=sys.stderr)
        return 2
    try:
        key = AppKey.from_environment(environ)
        manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))["default_permissions"]
        lines, short = report(lambda: app_jwt(environ[APP_ID_VARIABLE], key), owners_of(environ), manifest, transport)
    except (GitHubError, SigningError, OSError) as error:
        print(f"permissions: {error}", file=sys.stderr)
        return 2
    print("\n".join(lines))
    return 1 if short else 0


if __name__ == "__main__":
    sys.exit(main())
