# sdlc-app

The backend of the GitHub App "OpenSpine SDLC" (slug openspine-sdlc), which serves the claim protocol of
[OpenSpineConsortium/sdlc-template](https://github.com/OpenSpineConsortium/sdlc-template)
(its docs/agents/PROTOCOL.md says what a claim is). Python 3.12's standard
library and the openssl binary are all it needs: no package is installed,
here or in the image.

## Where this repository fits

sdlc-app is one of the repositories around the claim protocol of
OpenSpineConsortium/sdlc-protocol. That repository's ECOSYSTEM.md,
https://github.com/OpenSpineConsortium/sdlc-protocol/blob/main/ECOSYSTEM.md,
draws all of them, says which modules each one takes and how a change to
the protocol reaches each. Here the App takes two of them,
protocol_check.py and claims.py, into app/vendor, for the check run
`sdlc/protocol`. The copy is never edited here: a pull request in
sdlc-protocol already runs this repository's check on its change (the job
`downstream (sdlc-app)`, which reads this private repository with the
App's token), and once it merges, that repository's sync workflow opens
the pull request `sdlc-protocol/sync` here. The owner merges it, since
GitHub Free offers auto-merge only on public repositories.
app/vendor/README.md says the rest.

## What the App does

Now, in two stages:

1. **An identity for the template's workflows.** A push, a comment or an
   issue made with an Action's own GITHUB_TOKEN starts no other workflow;
   that is GitHub's guard against loops, and it is why template-init's first
   commit in a new copy starts neither the Checks nor the Board. A token
   made from this App does start them. Stage 1 needs no server: the
   workflow makes the token itself with actions/create-github-app-token,
   from the App's id and private key.
2. **The protocol check as the App's own check run.** On every pull request
   the webhook server runs the check the template's CI runs today
   (`problems_for` from sdlc-protocol, vendored under app/vendor/) and
   records it as the check run `sdlc/protocol` on the head commit: success,
   or failure with each problem on a line. A ruleset can require that check
   by name and by the App as its source, which no workflow in the
   repository can forge, and it takes the protocol check out of the
   customer's Actions minutes.

Every other event (issues, issue comments, pushes, check suites) is logged
and ignored in this stage: the board's rendering and the release of idle
claims stay in Actions (board.yml and the coordinator routine in
sdlc-template).

Later, each as a stage of its own: the board and the releases on these
webhooks instead of Actions runs; an MCP server, so the protocol is offered
in the claude.ai connector directory; and licensing, saying which
installations may use the App.

## Layout

| Path | What it is |
| --- | --- |
| app/jwt.py | The App's JWT, RS256, signed by `openssl dgst -sha256 -sign` |
| app/github.py | A REST client on urllib: installation tokens (cached), the calls the handlers make |
| app/webhook.py | The server: `POST /webhook`, `GET /health`, one JSON log line per delivery |
| app/handlers.py | What each event does: the `sdlc/protocol` check run on a pull request |
| app/envfile.py | The env file register.py writes and the server reads |
| app/vendor/ | protocol_check.py and claims.py from sdlc-protocol, with its `__init__.py` and vendoring.py, and VENDORED, the record they are held to (vendor/README.md) |
| manifest.json | The App's manifest: name, permissions, events |
| scripts/register.py | Registers the App for an organization by GitHub's manifest flow |
| scripts/check.sh | The checks; CI's job `check` runs it |
| Dockerfile | python:3.12-slim, a non-root user, the server as entrypoint |

## Stage 1: the App as the workflows' identity

### Register the App

With the script, as an owner of the organization:

    python3 scripts/register.py --org OpenSpineConsortium

It serves a page on http://localhost:3010 whose button sends manifest.json
to `https://github.com/organizations/<org>/settings/apps/new` with a random
state. GitHub asks you to confirm, then sends the browser back to
`/registered` with a one-time code; the script checks the state, exchanges
the code (`POST /app-manifests/{code}/conversions`) and writes the App's
id, slug, webhook secret and private key to `.sdlc-app.env`, mode 0600,
ignored by git and by docker. It then prints the next steps with the exact
commands. Without `--webhook-url` the webhook stays off, which is what
stage 1 wants; `--repo OWNER/NAME` (repeatable) names the repositories the
printed commands are for.

By hand, at `https://github.com/organizations/<org>/settings/apps/new`:

- GitHub App name `sdlc`; homepage URL
  https://github.com/OpenSpineConsortium/sdlc-template.
- Webhook: untick Active (stage 2 turns it on).
- Repository permissions: Contents read and write, Issues read and write,
  Pull requests read and write, Checks read and write; Metadata read-only
  comes with them.
- Events: Issues, Issue comment, Pull request, Push, Check suite. GitHub
  delivers them only once the webhook is active; if the form hides them
  while it is off, tick them in stage 2.
- Where it can be installed: only on this account.
- Create it, note the App ID at the top of its page, and under "Private
  keys" generate one. The browser downloads a .pem; keep it outside the
  repository (`*.pem` is ignored here so a stray copy is never committed).

### Install it

From the App's page, Install App, on the organization: the repositories it
serves, sdlc-template and its copies. "All repositories" also covers a copy
made later, from its first push.

### Set the two repository settings

For each repository whose workflows use the App:

    gh variable set SDLC_APP_ID --repo OWNER/NAME --body <App ID>
    python3 scripts/register.py --print-key | gh secret set SDLC_APP_PRIVATE_KEY --repo OWNER/NAME

or, with a key downloaded by hand,
`gh secret set SDLC_APP_PRIVATE_KEY --repo OWNER/NAME < path/to/key.pem`.
`--print-key` writes the key only into a pipe and refuses a terminal, so it
never lands on screen. A copy made from the template runs template-init on
its first push, before anyone can set a repository variable; for copies to
have the App from that first run, set both at the organization instead,
with `--org <org> --visibility all` in place of `--repo OWNER/NAME`.

### Change the workflows in sdlc-template

A job that should start other workflows makes the token first and uses it
where it used GITHUB_TOKEN. The step is skipped where the variable is not
set, and the fallback keeps such a copy working as it does today:

```yaml
      - uses: actions/create-github-app-token@v1
        id: app-token
        if: vars.SDLC_APP_ID != ''
        with:
          app-id: ${{ vars.SDLC_APP_ID }}
          private-key: ${{ secrets.SDLC_APP_PRIVATE_KEY }}

      - uses: actions/checkout@v7
        with:
          # git push in later steps uses the token checkout was given.
          token: ${{ steps.app-token.outputs.token || github.token }}

      - name: A step that pushes, comments or opens issues
        env:
          GITHUB_TOKEN: ${{ steps.app-token.outputs.token || secrets.GITHUB_TOKEN }}
```

The place it matters today is template-init.yml: with the App's token its
commit starts the first Checks and Board runs, and the setup issue it opens
starts the Board, instead of both waiting for the six-hourly fallback or a
person. board.yml keeps GITHUB_TOKEN for its push to the branch `board`: that
push starting no workflow is what keeps the Board from starting itself
again. The App has no `workflows` permission, so, like GITHUB_TOKEN, its
token cannot change a file under .github/workflows/.

## Stage 2: the webhook backend

### Run the server

With the env file register.py wrote:

    docker build -t sdlc-app .
    docker run --rm --env-file .sdlc-app.env -p 3000:3000 sdlc-app

or without docker, `python3 -m app.webhook --env-file .sdlc-app.env`. The
settings, from the environment or the file (the environment wins):

| Variable | What it is |
| --- | --- |
| `WEBHOOK_SECRET` | The secret GitHub signs each delivery with; required |
| `SDLC_APP_ID` | The App's id, the JWT's issuer; required |
| `SDLC_APP_PRIVATE_KEY` | The PEM itself, real newlines or escaped as `\n` (the env file's form) |
| `SDLC_APP_PRIVATE_KEY_PATH` | Or a path to the PEM; wins over the text when both are set |
| `PORT` | The port to listen on; 3000 if unset |

The server answers `202` as soon as the signature (X-Hub-Signature-256,
HMAC-SHA256 under `WEBHOOK_SECRET`, compared in constant time before the
body is parsed) holds, and handles the event after on its worker thread, so
GitHub's ten-second delivery timeout is never at risk; a bad signature gets
`401`. `GET /health` answers `200`, and the image's HEALTHCHECK uses it.

### Expose /webhook

For local testing, a [smee.io](https://smee.io) channel relays GitHub's
deliveries to your machine: open https://smee.io/new for a channel URL, then

    npx smee-client --url https://smee.io/<channel> --target http://localhost:3000/webhook

In production, any HTTPS endpoint in front of the container's port 3000.

### Turn the webhook on

In the App's settings (`https://github.com/organizations/<org>/settings/apps/<slug>`):
Webhook URL the smee channel or the production URL, Webhook secret the
`WEBHOOK_SECRET` from the env file, Active ticked, and the events above
ticked. GitHub sends a `ping` at once; the server's log shows it with the
outcome `pong`.

### Require the check

In the repository's ruleset for the default branch (Settings, Rules), under
"Require status checks to pass", add `sdlc/protocol` and choose the sdlc
App as its source. In the ruleset's JSON (sdlc-template's
docs/setup/ruleset-main.json) that is one more entry in
`required_status_checks`:

    { "context": "sdlc/protocol", "integration_id": <App ID> }

Keep CI's own protocol step until the App's check has run on real pull
requests. Then ci.yml in sdlc-template can drop the step "Hold a claude/
pull request to the claim protocol" and the event types `ready_for_review`,
`converted_to_draft` and `edited`, which it has only for that step; that
is where the minutes are saved, since an edit of a pull request's body
then no longer starts a whole CI run.

### The log

One JSON line on stdout per delivery, accepted or refused, and one at
start; nothing else is written to stdout, and no secret, token, signature
or payload body is ever in it. A handler's traceback, when one fails, goes
to stderr.

    {"time": "2026-10-10T01:18:52+00:00", "delivery": "5f0c...", "event": "pull_request", "action": "edited", "repository": "OpenSpineConsortium/example", "duration_ms": 412, "outcome": "sdlc/protocol failure on 0123456: 1 problem with the claim protocol"}

The outcomes: `sdlc/protocol success|failure on <sha>`, `unchanged: ...`
when the commit already has the same verdict (a redelivery, a title edit),
`ignored: ...` for the events this stage leaves to Actions, `pong`,
`refused: ...` for a bad signature, a missing length or a body that is no event, and
`error: <type>: <message>` when a call to GitHub failed.

## Checks

    bash scripts/check.sh

holds the vendored copy of sdlc-protocol to app/vendor/VENDORED with the
copy's own `vendoring.py verify`, so a hand edit fails before any test,
then runs the tests under tests/ with python3.12 (set `PYTHON` for
another), including the text rules every file keeps (ASCII, LF, a newline
at the end) and tests/test_vendor.py, which holds the record to a release
and, where a clone of sdlc-protocol sits beside this repository, the copy
to the library's files at the recorded commit. The JWT tests make an RSA
key with `openssl genrsa` and verify each signature with
`openssl dgst -verify`. CI runs the same script as the job `check`.

## What was not verified live

No App is registered yet, so these have run only against the fakes in
tests/: the manifest flow and its conversion call, the installation token
exchange, the reads of a pull request and a claim file, and the creation of
the check run. What did run for real: the JWT signed by openssl and
verified with it; the image built from python:3.12-slim (openssl present)
and run with an env file as register.py writes it, answering `ping` with
`202` and `/health` with `200`, signing a JWT inside the container as its
non-root user with no key file left behind, and stopping on `docker stop`
in well under a second.

Open until the first registration:

- GitHub App names are unique across GitHub, and `sdlc` may be taken; the
  form then asks for another, and the slug in the env file follows it.
- Whether the conversion returns a webhook secret for a manifest whose
  webhook is off; register.py makes one when it does not.
- Whether the "new App" form shows the events while the webhook is off.
- Whether smee's relay keeps the body byte for byte, which the signature
  needs; if deliveries through smee alone get `401`, that is the place to look.
- The "Re-run" button on the check sends a `check_run` or `check_suite`
  rerequest, which this stage ignores; a push or an edit of the body runs
  the check again.
- actions/create-github-app-token is written against `@v1`; v2 and v3
  exist, and their inputs should be checked before moving to one.
