# The control panel's browser checks

From the thread "Symphony control website" of the claude.ai Project "symphony", 2026-10-16. These
checks ran in that thread's session while it built "Sign in with GitHub" as the first way into the
control panel and the cost page (OpenSpineConsortium/openspineconsortium.github.io, site pull
requests #20, #22 and #23; master 009109c). They are kept here, beside the sign-in service they
test, so a later session on any account can run them again. Their findings and the design are in
symphony-template's docs/research/control-panel.md.

CI does not run them. They need Playwright with Chromium and a checkout of the site, and
scripts/check.sh runs only signin/test_worker.mjs. Every token in them is a stand-in such as
ghu_TEST or github_pat_X.

## What is here

- `e2e2/signin.test.mjs`: 112 checks of the sign-in, run against a mocked api.github.com, a mocked
  GitHub authorize page and a mocked sign-in service at https://signin.example.test. Some checks
  run both ways in, Sign in with GitHub and a pasted token.
- `e2e2/panel.test.mjs`: the panel's walkthrough on both pages.
- `e2e2/hostile.test.mjs`: 13 hostile-input checks.
- `e2e2/assistant.test.mjs`: 20 checks of the panel's assistant (site branch claude/assistant-panel,
  2026-10-18): who may ask (write access, and the repository's workflow carrying
  .github/symphony/assistant.md), the label and the issue made once and only on a press, the
  question's state block and its size, the conditional polling (If-None-Match and a 304) and where
  it stops (a 403, three failed reads, the time limit), the action's three comment shapes as its
  source writes them (the first comment, Claude's checklist, the header that ends a run or says it
  failed), the answer's vocabulary and what the renderer never lets through, whose comment is the
  answer, the issue read again before each question and replaced when closed, one press at a time,
  a sign-in changed under the page, a watch read on after a sign-in, and Stop watching; its cadence
  constants are shortened in the served script, and a check may serve its own.
- `e2e2/graph.test.mjs`: 24 checks of the panel's Dependencies section (site branch
  claude/graph-section, 2026-10-18): the chart text the page hands the drawing, byte for byte the
  two blocks symphony-protocol's board writes for its fixture board-epics.json (board-epics-STATE.md
  at fea34c6, copied into the check, and compared with a checkout by A0 where `SYMPHONY_PROTOCOL`
  names one), and the four blocks the library writes for a wider scenario (M: a second page of
  sub-issues, a pull request and another repository's issues listed under an epic, a deleted
  issue, a task under two epics, an issue labelled goal and epic), the reads made and never made
  (one sub_issues read per page per open epic or goal with sub-issues, one blocked_by read per
  sub-issue of an epic whose summary counts a blocker, none for a goal's children or an epic whose
  summary says none, nothing written), the vendored Mermaid loaded from the served site only when
  there is a chart and drawing both charts with their nodes and classes, a node pressed and Centre
  its row centring the task's row, the tables alone when the drawing script cannot load, a hostile
  title inert and a title holding a Mermaid directive drawn whole, a 403, a 429, the cap and the
  rate limit's reserve each said in words with nothing half drawn (the cap lowered in the served
  script), nothing drawn without an epic, Refresh redrawing the new count, a goal listed with the
  epics, a repository switched mid-draw, the tables' words, the repository's record unread, a
  repository renamed, a claim shown by its open pull request (and a fork's not), one chart that
  cannot be drawn among others, the board's own charts drawn in the Board box, the last repository
  taken off the list, and an open list cut short. A check that wants the drawing recorded instead
  of made serves a stand-in for the library on its route.
- `e2e2/mutants/`: 107 mutants. Each `.json` is a list of [text, replacement] pairs applied to
  assets/js/symphony-panel.js. Its `.json.only` names the checks that must catch it, and its
  `.json.suite` the check file they are in, signin.test.mjs where there is none.
  `e2e2/run-mutants.sh` runs them. The 79 of the sign-in (`m*`) were caught against master
  009109c; the 28 of the Dependencies section (`g*`) against site branch claude/graph-section on
  2026-10-18.
- `e2e2/shots.mjs`: the screenshots of the gate, before and after the two constants are set.
- `review-signin/` and `review2/` to `review5/`: the five adversarial reviews of the sign-in, each
  with its report (`report.txt`) and its own reproductions. The reports name the session's
  scratchpad, where they were written; the same files are here under the same folder names. In
  the fourth review, the first variant of R1 fails on purpose. It expects a tab to be signed out,
  and the page now goes on with the renewed token.
- `run-suite.sh` and `round6-*.sh`: the runners of the last round.

## Running them

1. Clone the site to /home/user/openspineconsortium.github.io. The runners serve that folder, and
   the checks read the script from it unless `SITE` names another.
2. In each folder you run from, link Playwright:
   `mkdir -p node_modules && ln -s /opt/node-tools/node_modules/playwright node_modules/playwright`.
   In a cloud session, Playwright finds Chromium under /opt/pw-browsers.
3. Run one suite: `PORT=8077 bash run-suite.sh e2e2 signin.test.mjs out.log`. Every check prints
   PASS or FAIL.
   - `ONLY=I11b,G7` runs only the checks whose names start with those prefixes, each followed by
     a colon.
   - `MUTANT=mutants/m33_noended.json` runs the checks against that mutant.
   - `e2e2/run-mutants.sh` expects a server already on port 8077, or on the address `BASE`
     names, and reports each mutant as KILLED, SURVIVED, STALE or ERROR; name mutants to run only
     those, by their paths from e2e2/ (`bash run-mutants.sh mutants/g*.json` there runs the
     Dependencies section's).

The site sets the two constants to the live service and SymphonyBoard's Client ID (site pull
request #24). The checks set them for themselves, whatever the shipped script holds: the
configured page gets the mocked service and `Iv1.testclient`, and the unconfigured page, which the
pasted-token checks of `hostile.test.mjs` and `panel.test.mjs` use, gets both emptied. `SITE`
names the site's checkout for every check file and for `run-suite.sh`.
