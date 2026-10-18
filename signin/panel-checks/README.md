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
- `e2e2/folders.test.mjs`: 16 checks of the panel's Folders page (site branch claude/folders-page,
  2026-10-18), against a mocked Microsoft consent page, a mocked Microsoft Graph and the mocked
  service's three `/drive` routes: a provider the service has not set up (Connect unpressable, said
  in one line); Connect with PKCE and the page as the redirect, the return exchanged at
  /drive/connect with the verifier the challenge was made from, the code gone from the address, the
  tokens in no storage, and the GitHub sign-in's handler never seeing the drive's code (a GitHub
  return on the same page still reaches /exchange); the drive drawn from Graph with $select and
  $top, a folder opened, files and folders ticked and unticked, a hostile name shown as text; Track
  sealing the refresh token for the repository's public key (a sealed box of the right length,
  never the token), writing drive.json exactly as tools/drive_sync.py reads it, starting the sync
  and dropping the tokens; a 403 on the secret's write or its public key said as the Secrets
  permission waiting on the owner with nothing else written; a default branch that takes only pull
  requests getting the file on symphony/drive with a pull request; a tracked repository's box with
  the connect-again day 90 days on, Sync now, and the Run workflow link on a 403; a return with a
  state the page never issued, one whose state differs, and Microsoft refusing the consent; Refresh
  listing a repository made from the template; a repository with no drive-sync.yml; and an access
  token that ran out renewed through /drive/token. Its mutants are `e2e2/mutants/f0*.json`, eight,
  each with its `.only`, run by hand as the section below says; every one was caught.
- `e2e2/mutants/`: 79 mutants of the sign-in checks (`m*.json`), beside the eight Folders ones
  above (`f0*.json`). Each `.json` is a list of [text, replacement] pairs applied to
  assets/js/symphony-panel.js. Its `.json.only` names the checks that must catch it.
  `e2e2/run-mutants.sh` runs them. Every one was caught against master 009109c.
- `e2e2/console-tabs.mjs`: since the panel became a console of tabs (site pull request #40,
  2026-10-18), one tab shows at a time; each suite installs this once after launching the browser,
  and every page action, visibility read and locator action on a selector first opens the tab that
  holds it, as a person presses its rail button.
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
   - `e2e2/run-mutants.sh` expects a server already on port 8077 and reports each mutant as
     KILLED, SURVIVED, STALE or ERROR. It drives signin.test.mjs alone; a Folders mutant runs as
     `MUTANT=mutants/f01_state_unchecked.json ONLY=$(cat mutants/f01_state_unchecked.json.only)
     node folders.test.mjs` from e2e2 with the server up, and is caught when a check prints FAIL.

The site sets the two constants to the live service and SymphonyBoard's Client ID (site pull
request #24). The checks set them for themselves, whatever the shipped script holds: the
configured page gets the mocked service and `Iv1.testclient`, and the unconfigured page, which the
pasted-token checks of `hostile.test.mjs` and `panel.test.mjs` use, gets both emptied. `SITE`
names the site's checkout for every check file and for `run-suite.sh`.
