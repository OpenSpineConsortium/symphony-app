"""What the App does with each event GitHub delivers.

In this stage the App does one thing: on a pull request it runs the
protocol check the template's CI runs (tools/check_protocol.py there,
sdlc_protocol.protocol_check.problems_for here) and reports it as the
check run "sdlc/protocol" on the head commit. A check run created by the
App is a gate a ruleset can require by name and by the App's integration
id, which nothing else can forge, and it takes the protocol check out of
the customer's Actions minutes. The claim file's existence is read
through the API at the head commit, where CI reads it from a checkout.

Every other event (issues, issue comments, pushes, check suites) is
logged and ignored for now: the board's rendering and the release of idle
claims stay in Actions (board.yml and the coordinator routine in
sdlc-template) until a later stage moves them onto these webhooks.

A handler returns its outcome as a short line of text, which the server
writes into the event's log line; it never returns or logs a payload.
"""

from app.vendor.sdlc_protocol.claims import claim_path
from app.vendor.sdlc_protocol.protocol_check import claim_number, head_branch, problems_for

CHECK_NAME = "sdlc/protocol"
PULL_REQUEST_ACTIONS = {"opened", "synchronize", "reopened", "ready_for_review", "converted_to_draft", "edited"}
KEPT = "The pull request keeps the claim protocol."
IGNORED = "ignored: board rendering and releases stay in Actions in this stage"


def handle(event, payload, client_for, app_id=None):
    """The outcome of one delivery. client_for(installation_id) gives the
    API client for the installation the event came from."""
    if event == "ping":
        return "pong"
    if event != "pull_request":
        return IGNORED
    action = payload.get("action")
    if action not in PULL_REQUEST_ACTIONS:
        return f"ignored: pull_request {action} changes nothing the check reads"
    installation = (payload.get("installation") or {}).get("id")
    if not installation:
        return "ignored: the event names no installation"
    return check_pull_request(client_for(installation), payload, app_id)


def check_pull_request(client, payload, app_id=None):
    """Run the protocol check on the pull request as it is now, and record
    the verdict on its head commit unless the same verdict is there.

    The pull request is read again rather than taken from the payload: the
    server handles events in order, but GitHub does not promise to deliver
    them in order, and the check run GitHub shows for a commit is the last
    one made, so the last one must describe the newest state."""
    repo = payload["repository"]["full_name"]
    pull = client.pull_request(repo, payload["pull_request"]["number"])
    head_sha = pull["head"]["sha"]

    def claim_file_exists(number):
        return client.file_exists(repo, claim_path(number), head_sha)

    problems = problems_for(pull, claim_file_exists)
    conclusion, title, summary = verdict(pull, problems)
    if same_as_last(client.check_runs(repo, head_sha, name=CHECK_NAME, app_id=app_id),
                    conclusion, summary, app_id):
        return f"unchanged: {CHECK_NAME} {conclusion} on {head_sha[:7]}"
    client.create_check_run(repo, CHECK_NAME, head_sha, conclusion, title, summary)
    return f"{CHECK_NAME} {conclusion} on {head_sha[:7]}" + (f": {title}" if problems else "")


def verdict(pull, problems):
    """The conclusion, title and summary of the check run."""
    if problems:
        noun = "problem" if len(problems) == 1 else "problems"
        return ("failure", f"{len(problems)} {noun} with the claim protocol",
                "\n".join(f"- {problem}" for problem in problems))
    if claim_number(pull) is None:
        return "success", f"{head_branch(pull)} is not a claim branch", KEPT
    return "success", "Claim protocol kept", KEPT


def same_as_last(runs, conclusion, summary, app_id):
    """Whether the newest sdlc/protocol run of this App on the commit has
    this verdict already, so a redelivery or an edit of the title adds no
    second, identical run."""
    ours = [run for run in runs
            if run.get("name") == CHECK_NAME and (not app_id or str((run.get("app") or {}).get("id")) == str(app_id))]
    if not ours:
        return False
    last = max(ours, key=lambda run: run.get("id", 0))
    return (last.get("status") == "completed" and last.get("conclusion") == conclusion
            and (last.get("output") or {}).get("summary") == summary)
