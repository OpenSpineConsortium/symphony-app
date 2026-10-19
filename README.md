# symphony-app

The backend of the GitHub App "SymphonyBoard" (slug symphonyboard), which serves the claim protocol of
[OpenSpineConsortium/symphony-template](https://github.com/OpenSpineConsortium/symphony-template)
(its docs/agents/PROTOCOL.md says what a claim is). Python 3.12's standard
library and the openssl binary are all it needs: no package is installed,
here or in the image.

## Where this repository fits

symphony-app is one of the repositories around the claim protocol of
OpenSpineConsortium/symphony-protocol. That repository's ECOSYSTEM.md,
https://github.com/OpenSpineConsortium/symphony-protocol/blob/main/ECOSYSTEM.md,
draws all of them, says which modules each one takes and how a change to
the protocol reaches each. Here the App takes two of them,
protocol_check.py and claims.py, into app/vendor, for the check run
`sdlc/protocol`. The copy is never edited here: a pull request in
symphony-protocol already runs this repository's check on its change (the job
`downstream (symphony-app)`, which reads this private repository with the
App's token), and once it merges, that repository's sync workflow opens
the pull request `symphony-protocol/sync` here. The owner merges it: the
sync arms auto-merge only where ecosystem.json says so, and for this
repository it says `"auto_merge": false`.
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
   (`problems_for` from symphony-protocol, vendored under app/vendor/) and
   records it as the check run `sdlc/protocol` on the head commit: success,
   or failure with each problem on a line. A ruleset can require that check
   by name and by the App as its source, which no workflow in the
   repository can forge, and it takes the protocol check out of the
   customer's Actions minutes.

Every other event (issues, issue comments, pushes, check suites) is logged
and ignored in this stage: the board's rendering and the release of idle
claims stay in Actions (board.yml and the coordinator routine in
symphony-template).

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
| app/vendor/ | protocol_check.py and claims.py from symphony-protocol, with its `__init__.py` and vendoring.py, and VENDORED, the record they are held to (vendor/README.md) |
| manifest.json | The App's manifest: name, permissions, events |
| manifest-setup.json | The setup App's manifest: Administration and Metadata, the organization's Administration, Secrets and Variables, public, no webhook (The Setup App for the front door) |
| scripts/register.py | Registers the App, or with `--setup` the setup App, for an organization by GitHub's manifest flow |
| scripts/collect.py | Collects the field metrics projects share, daily from .github/workflows/collect.yml (Field metrics) |
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

- GitHub App name `SymphonyBoard`, as manifest.json has it (`sdlc` is
  held by the account @sdlc); homepage URL
  https://github.com/OpenSpineConsortium/symphony-template.
- Webhook: untick Active (stage 2 turns it on).
- Repository permissions: Contents read and write, Issues read and write,
  Pull requests read and write, Checks read and write, Workflows read and
  write, Actions read and write, Administration read and write, Secrets
  read and write (the control panel's Folders tab, and the Tokens tab on a
  personal account's repository); Metadata read-only comes with them.
- Organization permissions: Secrets read and write, Variables read and
  write, for the control panel's Tokens page.
- Events: Issues, Issue comment, Pull request, Push, Check suite. GitHub
  delivers them only once the webhook is active; if the form hides them
  while it is off, tick them in stage 2.
- Where it can be installed: only on this account.
- Create it, note the App ID at the top of its page, and under "Private
  keys" generate one. The browser downloads a .pem; keep it outside the
  repository (`*.pem` is ignored here so a stray copy is never committed).

### Install it

From the App's page, Install App, on the organization: the repositories it
serves, symphony-template and its copies. "All repositories" also covers a copy
made later, from its first push.

### Set the two repository settings

For each repository whose workflows use the App:

    gh variable set SDLC_APP_ID --repo OWNER/NAME --body <App ID>
    python3 scripts/register.py --print-key | gh secret set SDLC_APP_PRIVATE_KEY --repo OWNER/NAME

or, with a key downloaded by hand,
`gh secret set SDLC_APP_PRIVATE_KEY --repo OWNER/NAME < path/to/key.pem`.
`--print-key` writes the key only into a pipe and refuses a terminal, so it
never lands on screen.

The two can be set once at the organization for several repositories,
with `--org <org> --visibility selected --repos NAME,NAME` in place of
`--repo OWNER/NAME`, but only for selected repositories that the owner
alone writes to, never `--visibility all` or `private`. A secret visible
to all repositories, or to all private ones, reaches every repository
made in the organization afterwards, and the admin of such a copy, which
is whoever made it, can print it with a workflow of their own. The list
names repositories that exist, so a copy made from the template, which
runs template-init on its first push, runs it on GITHUB_TOKEN whoever made
it, and, as symphony-template's template-init.yml says, "a push, an issue or
a label made with GITHUB_TOKEN starts no workflow, so without the App
below the first Checks run comes with the first pull request, and the
first Board run at the next six-hourly fallback or the first issue or
pull request a person opens". Set the two on the copy, or add it to the
list, after that first push; the workflows that use the App have them
from their next run.

### Change the workflows in symphony-template

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
again. The App holds the `workflows` permission, since an adoption's pull
request brings files under .github/workflows/, so its token, unlike
GITHUB_TOKEN, can change a file there.

## The Setup App for the front door

A second App, "Symphony Setup", exists for one job the main App
must never do. The public front door,
[OpenSpineConsortium/symphony-start](https://github.com/OpenSpineConsortium/symphony-start),
adopts the template into a repository in one run of its workflow
.github/workflows/adopt.yml, and that run applies the repository settings
the template's scripts/setup-repo.sh applies by hand: the default
branch's ruleset, delete-branch-on-merge, auto-merge, and secret scanning
with push protection. Those take the Administration permission, which
the main App, installed for good on every repository it serves, uses for
one thing only since 2026-10-18: the control panel's Share tab invites a
person as a collaborator, as the person signed in (the owner's choice;
the Apps' privacy statement, version 17). No adoption run uses it there,
so the setup App holds Administration (write) and Metadata
(read) and, on an organization, the organization's Administration
(write), for the one box "Allow GitHub Actions to create and approve
pull requests" that a new organization holds off for its repositories
(the owner's choice of 2026-10-18; the Apps' privacy statement, version
14), and the organization's Secrets and Variables (write), to add the
repository adopted to the lists of repositories that read the requester's
own token slots of the organization's pool and the pool's two variables
(symphony-start#72; the Apps' privacy statement, version 32), and nothing
else, no webhook and no events, and an adopter
installs it on the one repository for that one run and uninstalls it
afterwards; the run mints its token for that repository alone, and the
repository's settings need no step by hand.

Register it with the same script, as an owner of the organization:

    python3 scripts/register.py --setup --org OpenSpineConsortium

It sends manifest-setup.json in place of manifest.json and writes the
credentials to `.sdlc-setup-app.env`, so the main App's `.sdlc-app.env`
is never overwritten; `--webhook-url` is refused with `--setup`, since
the App has no webhook. The manifest makes the App public, so any
account can install it. Its slug is `symphony-setup`, derived from
its name, unless GitHub assigns another, which the script's output, or the
App's settings page once it is renamed, then shows and symphony-start's
form link (`https://github.com/apps/<slug>/installations/new`), README
and tests/test_form.py (SETUP_APP_INSTALL) must then name. symphony-start's
README, For the owner, also has the owner install it on symphony-start
itself, and only there, so the workflow can probe a failed mint. The steps the script prints are the front door's
two settings, the variable and the secret adopt.yml reads:

    gh variable set SDLC_SETUP_APP_ID --repo OpenSpineConsortium/symphony-start --body <App ID>
    python3 scripts/register.py --env-file .sdlc-setup-app.env --print-key | gh secret set SDLC_SETUP_APP_PRIVATE_KEY --repo OpenSpineConsortium/symphony-start

(`--setup --print-key` reads the same file.) There is no stage 2 for it:
nothing in this repository's server uses the setup App, and its env file
is read only by `--print-key`.

## Stage 2: the webhook backend

### Run the server

With the env file register.py wrote:

    docker build -t symphony-app .
    docker run --rm --env-file .sdlc-app.env -p 3000:3000 symphony-app

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
"Require status checks to pass", add `sdlc/protocol` and choose the
Symphony App as its source. In the ruleset's JSON (symphony-template's
docs/setup/ruleset-main.json) that is one more entry in
`required_status_checks`:

    { "context": "sdlc/protocol", "integration_id": <App ID> }

Keep CI's own protocol step until the App's check has run on real pull
requests. Then ci.yml in symphony-template can drop the step "Hold a claude/
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

## Field metrics

Projects that use the App can share how the claim protocol fares in them,
as coordbench measures it on CooperBench, without their code or text
leaving them. A project's own workflow writes two files to its branch
`metrics`: METRICS.json, counts, durations and rates over thirty days, in
all, by work setting (what else was at work beside each pull request, and
whose: one Claude Code session's, one person's several sessions', several
people's) and in pairs of pull requests at work at the same time, with
what the work cost (economics: tokens, an estimated price at API list
prices, Claude's seconds, per merge) and that cost and speed for work done
alone set beside work done in parallel (coordination, with ratios over 1
where parallel did better), and, when a contributor runs the judge on
their own machine, JUDGE.json, how often each kind of communication
failure was found, in all and by work setting. scripts/collect.py, run
daily by .github/workflows/collect.yml, gathers them.

Reading the dataset. A line of metrics.jsonl is one repository's rolling
thirty days as its workflow last wrote them, so one repository's
consecutive lines overlap by 29 days. Take one line per repository per
thirty-day block, chosen by generated_at, not collected_at, since a run
that failed leaves the last record standing. by_setting's counts other
than open, and pairs', then add up across blocks, because each pull
request, and each pair, counts in the block where it ended; parallel's
conflict_marks, conflict_marks_unattributed and truncated add up the
same way, each mark and each ended pull request counting in the block
that holds it. parallel's other counts and by_setting's open describe
their block alone and are never summed: people and sessions are
distinct counts, the peaks are maxima, and a pull request open at the
end of one block can count again in the next. Compare settings within one repository's hash before pooling. A
line without parallel, by_setting and pairs comes from a copy of the
template made before the breakdown, or from a day whose breakdown reads
would have reached the board's reserve or failed; it is not broken out,
which is not the same as zero, and the line cannot say which. Nor is an absent file count: it is not known. Where the
workflow left changed files unread, parallel's files_unread is above 0
and the counts that need those files are left out: file_overlap in every
setting but workflow_agents and automation, which keep their 0, and
pairs' file_overlap, landings_file_overlap and
conflict_onsets_file_overlap. Read conflicts per landing (by_setting's
conflicted over landings_under, pairs' conflict_onsets over landings),
never as conflicted over pull_requests. judge.jsonl repeats a JUDGE.json
until someone judges again: deduplicate on generated_at, and leave out
lines whose limit is set. A judge line without window_days comes from a
judge before the breakdown, which did not record a limit: treat its limit
as not known, never as none. Wilson intervals belong to counts of pull
requests, never to pairs.

economics and coordination come and go with the breakdown, so a line
without them is not broken out either. economics is its block's bill
(the usage on commits made in it and the Actions runs recorded in it)
over the pull requests that ended in it: its tokens and dollars add up
across blocks, its rates per merge do not, and pull_requests_measured
beside pull_requests says how much of the work the bill covers, since
work done outside a session of the repository carries no usage. A line
without actions_runs_unread comes from a day whose Actions records could
not be listed, which counts only the records read before. estimated_usd
is the price of the tokens at the API list prices of prices_as_of,
whatever plan paid for them, so compare it only between lines with the
same prices_as_of. coordination's ratios are each over 1 where work done
in parallel did better, and are left out where a side has nothing to
divide; read them beside the sides' pull_requests, pool sides' sums
across blocks within one repository's hash and take ratios of the sums,
never averages of the ratios.

What is read: those two files at the ref `metrics` of every repository
the App is installed on, with a token that can only read, and no other
path. A repository without the branch has nothing to collect. A fork is
skipped unread: `gh repo fork` and the API copy every branch unless
told otherwise, `metrics` included, and in a fork, where Actions are
off until its owner turns them on, that branch is upstream's files
frozen on the day of the fork, which the collector would store a second
time under the fork's own hash. An archived repository is skipped too,
its files as frozen. Both are counted in the run's summary line as
forks and archived.

What is stored: a METRICS.json only when its `"sharing"` is exactly
`"on"`, and only then its JUDGE.json; of each, only the keys the format
names (scripts/collect.py lists them), a count, a duration or a rate only
when it is such a number, a time as the collector writes it again, and
protocol_version only as a release with or without its short commit
(`0.2.0 f530a66`). Two strings a project wrote can reach the dataset
besides: JUDGE.json's model and prompt_variant, each kept only when it is
one identifier of letters, digits, `.`, `_` and `-`, at most 64
characters, with an optional suffix such as `[1m]`, which is what the
template's judge writes there (`claude-opus-5-5`, `appF-7`). A shape is
all the collector can check, and a login has the same one: a project
that wrote its own name into those two, or into a number, would have it
stored. The repository becomes the HMAC-SHA256 of its node id under a
salt only the collector holds: its lines can be followed from day to
day, but without the salt nobody can tell whose they are. The salt
comes from the App's private key, which the collector has already:
HMAC-SHA256 of the PEM under the fixed label `sdlc-metrics-salt`, the
extract step of HKDF, so nothing of the key can be recovered from a hash
and the same key always gives the same salt, as a path, as text or with
its newlines escaped. It is the PEM's text that is hashed: a key
re-encoded, say from the PKCS#1 form GitHub downloads to PKCS#8, counts
as a new one. The secret SDLC_METRICS_SALT, when set and at least 32
characters, is used instead; set and shorter, it is refused and nothing
is collected. Rotating the App's private key, or setting or changing the
override, gives every repository a new hash, and the lines before and
after cannot be joined.
Nothing GitHub tells the collector about a repository, its name, owner,
installation or URL, is stored, and the log says counts only.

Where: one JSON line per repository and day, `{"repo": <hash>,
"collected_at": <UTC date>, ...}`, in data/metrics.jsonl and
data/judge.jsonl on this repository's branch `data`, committed with the
workflow's own GITHUB_TOKEN when a file changed; a second run on one day
replaces that day's lines.

The owner's steps, once. The App's id and key on this repository, unless
they are there already, as for any repository whose workflows use the
App:

    gh variable set SDLC_APP_ID --repo OpenSpineConsortium/symphony-app --body <App ID>
    python3 scripts/register.py --print-key | gh secret set SDLC_APP_PRIVATE_KEY --repo OpenSpineConsortium/symphony-app

There is no salt to make: the key gives it. Until the variable and the
secret are set, the workflow ends with a notice and collects nothing.
Last, make the App public, so that other accounts can install it: "Make
public" at
https://github.com/organizations/OpenSpineConsortium/settings/apps/symphonyboard/advanced.
To see a run without writing, `python3 scripts/collect.py --env-file
.sdlc-app.env --dry-run` prints the counts and the lines it would write.

A project turns sharing off with the file .github/sdlc-metrics holding
`off` on its default branch, or with the repository variable
SDLC_METRICS=off. Both are read by the project's own workflow, which then
writes `{"schema": "sdlc-metrics/1", "sharing": "off"}` and nothing else,
so the collector only ever sees `"sharing": "off"` and stores nothing of
that project. The collector has run only against the fake GitHub in
tests/test_collect.py so far (What was not verified live).

## Checks

    bash scripts/check.sh

holds the vendored copy of symphony-protocol to app/vendor/VENDORED with the
copy's own `vendoring.py verify`, so a hand edit fails before any test,
then runs the tests under tests/ with python3.12 (set `PYTHON` for
another), including the text rules every file keeps (ASCII, LF, a newline
at the end) and tests/test_vendor.py, which holds the record to a release
and the copy to the library's files at the recorded commit, in the clone
of symphony-protocol that SDLC_PROTOCOL names or else one beside this
repository. CI clones the library and names the clone, so there an edit
that rewrote VENDORED to match fails too, as does a commit the library
does not have. The JWT tests make an RSA
key with `openssl genrsa` and verify each signature with
`openssl dgst -verify`. CI runs the same script as the job `check`.

## What was not verified live

The App is registered, as SymphonyBoard (slug symphonyboard, id
5258276), through register.py's manifest flow, so that flow and its
conversion call have run for real; GitHub refused the name `sdlc`, which
the account @sdlc holds, hence the manifest's name and `--name`. As far
as this repository records, the rest has run only against the fakes in
tests/:

- the installation token exchange, and the narrowed request the collector
  makes, `{"permissions": {"contents": "read", "metadata": "read"}}`;
- the reads of a pull request and a claim file, and the creation of the
  check run;
- the collector's calls: `/app/installations` with the App's JWT, and
  on the narrowed token `/installation/repositories` and the contents API
  at the ref `metrics`;
- collect.yml's worktree of the branch `data`, started with no history
  on its first run, and its push there with GITHUB_TOKEN.

What did run for real besides the registration: the JWT signed by
openssl and verified with it; the image built from python:3.12-slim
(openssl present) and run with an env file as register.py writes it,
answering `ping` with `202` and `/health` with `200`, signing a JWT inside
the container as its non-root user with no key file left behind, and
stopping on `docker stop` in well under a second.

Still open:

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
- The setup App is registered as openspine-sdlc-setup; untried is whether
  renaming it to Symphony Setup gives it the slug
  `symphony-setup`, the one symphony-start's form link and
  tests/test_form.py (SETUP_APP_INSTALL) name, or whether GitHub assigns
  another.
