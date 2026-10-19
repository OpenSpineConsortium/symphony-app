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

- `e2e2/signin.test.mjs`: 135 checks of the sign-in and the console's foot, run against a mocked
  api.github.com, a mocked GitHub authorize page and a mocked sign-in service at
  https://signin.example.test. Some checks run both ways in, Sign in with GitHub and a pasted
  token. P1 to P22 (site pull request #78, 2026-10-19) hold the work a button starts, spoken at
  the deck's foot, and the phone: a followed run with its link, steps, log tail and end, a failed
  run, a refused start as a plain line, a task kept through a message, the token sign-in drawn in
  the foot with the dialog closed at once, every tab fitting a phone with Refresh holding the page,
  a long message leaving Clear reachable; reads of a run retried before giving up, a run left when
  the page goes to another repository, a second Refresh never letting go early, the person's own
  run preferred to another's, a second Add Token refused while one saves, a tile's save keeping the
  Token run's marks; a lend into an organization's pool by someone who is not its owner, said as
  lent or saved with its slot (P20), the Token workflow run in the organization's repository that
  has it when the chosen one has none (P21), and a token side panel width kept from a wide window
  leaving the tiles their room on a narrow one, a phone held sideways and a wide one (P22). P24
  (site branch claude/lend-list-hidden, 2026-10-19) holds the organization variable SYMPHONY_LEND_TO
  readable by no repository's workflows: written for selected repositories with none selected, and
  a list an older page left readable by the private repositories, or by all, closed, its value kept,
  when an owner opens the Tokens tab, a close GitHub refuses let go without a word, and the last
  repository taken off deleting the list.
- `e2e2/panel.test.mjs`: the panel's walkthrough on both pages.
- `e2e2/hostile.test.mjs`: 13 hostile-input checks.
- `e2e2/assistant.test.mjs`: 21 checks of the panel's assistant (site branch claude/assistant-panel,
  2026-10-18): who may ask (write access, and the repository's workflow carrying
  .github/symphony/assistant.md), the label and the issue made once and only on a press, the
  question's state block and its size, the conditional polling (If-None-Match and a 304) and where
  it stops (a 403, three failed reads, the time limit), the action's three comment shapes as its
  source writes them (the first comment, Claude's checklist, the header that ends a run or says it
  failed), the answer's vocabulary and what the renderer never lets through, whose comment is the
  answer, the issue read again before each question and replaced when closed, one press at a time,
  a sign-in changed under the page, a watch read on after a sign-in, and Stop watching; its cadence
  constants are shortened in the served script, and a check may serve its own.
- `e2e2/graph.test.mjs`: 42 checks of the panel's Dependencies tab (site branch
  claude/graph-section, 2026-10-18; a section of the long page until the console): the chart text
  the page hands the drawing, byte for byte the two blocks symphony-protocol's board writes for its
  fixture board-epics.json (board-epics-STATE.md, copied into the check from symphony-protocol
  468fc44, and compared with a checkout by A0 where `SYMPHONY_PROTOCOL` names one), the block it
  writes for a hostile title, four titles that spell a Mermaid directive, two that hold `$$...$$`,
  which Mermaid typesets as math, and four the board folds to ASCII, "%" and "$" written as `#37;`
  and `#36;` by both (F2, and A1, which renders it again with that checkout's own
  `board.mermaid_block`; F draws them with the real library, the formulas as words), and the four blocks the
  library writes for a wider scenario (M: a second page of sub-issues, a pull request and another
  repository's issues listed under an epic, a deleted issue, a task under two epics, an issue
  labelled goal and epic), the reads made and never made (one sub_issues read per page per open
  epic or goal with sub-issues, one blocked_by read per sub-issue of an epic whose summary counts a
  blocker, none for a goal's children or an epic whose summary says none, nothing written), the
  vendored Mermaid loaded from the served site only when there is a chart, drawing both charts
  while the tab is hidden and showing them whole once it opens, the tab itself (U: in the rail
  right after Tasks, with its ARIA, opened on load by the address #dependencies, by its rail
  button, by the arrow keys and by a link), a node pressed and Centre its row opening the Tasks tab
  with the task's row centred inside that tab's own box and the words on the message line too, the
  board's own charts drawn in the Board tab and a node there doing the same (R), handed to the
  drawing as the board's own bytes (R2: the fixture's two blocks, F's and M's, and a block whose
  titles hold every printable ASCII character between them, a node of each class and the fold's
  percent and dollar signs, pasted and compared with the checkout by A2; R3 hands the Board tab
  that checkout's own render of it, so the tab's gate is held to the lines the library writes now),
  drawn only where every line of a block is one the board writes, any other block shown as text
  that reads on its ground (4.5 to 1) and nothing planted on the branch board (a picture or a
  form from elsewhere, fields under the page's own ids, a directive, a link) making an element or a
  request (X), a title opening an HTML comment hiding nothing after it and a heading's escaped
  pipe read as a pipe (Y), the charts' edges, arrowheads and words showing on their ground inside
  the dark console (C and R, by contrast ratio; `NOCSS=1` serves the stylesheet without the rule
  that gives the ground, and C and R fail then), a press on a task the tables do not hold staying
  in this tab with its words here and on the message line (W), the assistant's "show
  dependencies", asked from the Ask Claude bar on another tab, opening this tab at its first chart
  and the next question naming the section (V), the window left at 0 in each of those presses at
  1366 x 657, where the page could scroll (asserted), the tables alone when the drawing
  script cannot load, a hostile title inert and a title holding a Mermaid directive drawn whole, a
  403, a 429, the cap and the rate limit's reserve each said in words with nothing half drawn (the
  cap lowered in the served script), no read at all once the open issues' answer says the token is
  under the reserve, a Refresh included (G5), nothing drawn without an epic, Refresh redrawing the new
  count, a goal listed with the epics, a repository switched mid-draw, the tables' words, the
  repository's record unread, a repository renamed, a claim shown by its open pull request (and a
  fork's not), one chart that cannot be drawn among others, the last repository taken off the
  list, and an open list cut short, and the focus strip (AA to AE): where there are two charts or
  more, a strip of chips shows one epic's chart at a time, a zoomed-out goals chart, or All, the
  first chart shown by default and the rest hidden, a chip showing its chart and hiding the others
  with aria-pressed following, the choice kept per repository in this browser and restored on load
  and on Refresh, no strip for a single chart, and a kept choice that is gone falling back to the
  first. Each check opens the Dependencies tab by its rail button before
  it reads or presses inside it, and a press that crosses tabs is read at once with page.evaluate,
  which opens nothing, so the page and not console-tabs.mjs is seen opening the tab. A check that
  wants the drawing recorded instead of made serves a stand-in for the library on its route.
- `e2e2/folders.test.mjs`: 58 checks of the console's Folders tab, /symphony/control/#folders
  (site branch claude/folders-page, 2026-10-18; the tab took the place of the page folders.html
  before that page shipped), against a mocked Microsoft consent page, a mocked Microsoft Graph,
  the mocked service's three `/drive` routes and a mocked GitHub that keeps what Track writes as
  GitHub keeps it: drive.json per branch, read by ?ref, a write over it refused without its sha
  (422) or with another (409); the secret, set once saved; the branches, one made or set back by
  force holding the default branch's files; and the open pull requests. The repository is private
  unless a check says otherwise. It loads the console signed in, as the other suites do, installs
  `console-tabs.mjs`, and opens the tab through its rail button or its address. A to L keep the
  page's checks in meaning: a provider the service has not set up, with the three steps and the
  filled button the next step's; Connect with PKCE, where every Connect names the console's own
  address, with its trailing slash, to Microsoft and to /drive/connect, also when the console
  was opened as index.html, and the code has left the address before it is exchanged; the drive
  drawn from Graph and ticked, a hostile name as text, and Untick clearing the box on view;
  Track sealing the refresh token, writing drive.json exactly as tools/drive_sync.py reads it,
  dated on either side of midnight, starting the sync and dropping the tokens, with a 403 on the
  secret's write said as the token's missing permission, two presses, a refused first run whose
  words point at the runs link drawn in the tab, refused folder names, Track again over a file
  that is there (D3), a file that cannot be written (E5) and a connection Microsoft gave no
  refresh token (E6); a sign-in that GitHub refuses even whether the secret is set, told so as
  the tab opens with Track not offered, in a pasted token's words and in SymphonyBoard's with an
  organization's installations page or the person's (E2 to E2c); a public repository, written
  into only once its box, never ticked beforehand, is ticked (P); a tracked repository's box, the
  connect-again day counted from today, and a connection that ran out or is near its end (F to
  F4); a return nobody here issued, cleaned and not spoken of, as the sign-in's F8 holds; a drive
  state that differs; Microsoft refusing; a default branch that takes only pull requests, where
  symphony/drive is made from its head, set back by force when it is there, never committed on
  when it cannot be, and an open pull request is linked rather than a second opened (I to I3);
  "Find the repository I just made", which asks GitHub about each new repository, since GitHub's
  list of them leaves out the template; no drive-sync.yml; and the renewal through /drive/token.
  H1 to H4 hold the two returns on one page apart both ways round: a GitHub sign-in is the
  sign-in handler's and opens Command, a drive return is the tab's and opens Folders, each
  forgets the other's pending state, and a state that matches neither is refused once. N1 to N8,
  V1 and V2 are what the tab adds to the console: a drive return opens the tab by itself with the
  address clean; the tab asks the service and reads its files only once it is opened, and once;
  Forget the token, another tab's token for another account, or a pasted token GitHub stops
  taking drops the drive; the bar's repository is followed, with nothing of the last one's shown
  and a late answer about it dropped; what the person ticked goes with them to another repository
  while what one repository's file ticked stays with it (V1), and a list drawn before the file
  comes shows the file's ticks once it does (V2); hostile names in the drive, the repository's
  file and GitHub's list stay text; with no repository listed, a drive is connected, the
  repository just made is found and tracked into (N8); at 1366 x 657 the tab keeps its words
  inside itself and the window stays at 0 after Connect's return and after Track, and a long
  repository name wraps in the third step's head with Track inside the side column at 1366 x 657
  and 390 x 844 (N6b, N6c); and folders.html is gone, linked from nowhere, while #folders opens
  the tab. B, C, D, E3, I and L scan every request, the console, #msg, the markup, the fields, the
  address and the storage for the drive's tokens, which go only to Graph's Authorization header,
  to /drive/token and, sealed, into the secret. Its mutants
  are `e2e2/mutants/f*.json`, 63, run as the section below says. X1 to X4 hold the list drawn
  as a file explorer (site branch claude/folders-explorer, 2026-10-18): the folder tree, Back,
  Forward, Up and the keyboard, Details' four columns and the status bar; a Word file opened for
  editing in Word at its d.docs.live.net address on a personal drive and at the address OneDrive
  gives on a work drive, never an address that is not https, other files on OneDrive's page, and
  the right-click menu; Large icons, sorting with folders first, and the search box. CAT1 to
  CAT9 hold the saved catalog drawn in the same explorer when no drive is connected (site branch
  claude/folders-catalog, 2026-10-18): a private repository's catalog.json on its drive-catalog
  branch, read with the person's GitHub token and nothing asked of Microsoft, drawn read-only
  with every tick disabled and neither Track nor an Office app in the menu; a file opened at its
  web address in the browser and one the catalog gave no address said so, with nothing written to
  GitHub; a public repository never read, its catalog.json left alone; a connected drive taking
  the saved catalog's place so tracking works again; a hostile name kept as text; the keyboard's
  Space never ticking in the read-only catalog; choosing another private repository drawing that
  repository's own catalog, with a late answer about the last one dropped; and two folders that
  share an id keeping their own children, never merging or looping.
- `e2e2/explore.test.mjs`: 10 checks of the console's Explore tab, /symphony/control/#explore
  (site branch claude/explore-tab, 2026-10-18), against a mocked GitHub: a goal over an epic over
  three tasks, a draft pull request on one task's claim branch, one run with one job of four steps,
  a skipped one among them, and a log whose lines test the edges of each step by time. XP1 to XP7:
  the tab after Dependencies and nothing below a task read until one goes in; the levels down to
  a task and their states; a pull request, its runs, a job and its steps each read once, and Read
  again; a step's own lines, the Claude step marked, the colour codes out and every line as text;
  the wheel, including one long glide moving one level, Enter, Backspace and a claim branch with
  no pull request; a log the browser cannot read and an address that is not https; a hostile title
  and the reserve. XP8 serves the log as GitHub does, a redirect to its storage on another origin
  (a local server of the check's own, so Chromium's checks on private addresses are off for this
  suite alone), and holds that the storage is asked one plain read with no token and no header of
  GitHub's. XP9 switches the repository while the tab is open, and XP10 holds that an epic whose
  sub-issues could not be read says so.
- `e2e2/notebooks.test.mjs`: 26 checks of the console's Notebooks tab, /symphony/control/#notebooks
  (site pull request #82, 2026-10-19), against a mocked GitHub that keeps notebooks.json and
  catalog.json on the branch drive-catalog as GitHub does: read as objects with their sha, a file
  over 1 MB by its blob, written over only with the sha it has (422 without one, 409 with another).
  N1 to N9: the cards counted as the template's tools/notebook.py counts them, the side panel and
  its https-only links, + with its dialog, the gear, the x and the last one deleting the file, a
  public repository, no catalog, no proposal and one that does not hold together, the access a
  refused write needs, another repository in the bar, and the phone. N10 to N18, from the first
  review: a write goes over the sha drawn with the cards, never one read afresh, and a 409 or 422
  reads the organizer's version; a rewritten catalog stops the write; the lock and the outcome
  across a repository switch and a Refresh; a public notebook repository; a repository whose record
  cannot be read; a notebook named add; a catalog of a thousand files over 1 MB; the side panel's
  kept width on a narrow window. N19 to N23, from the second: a token refused mid-write leaves no
  lock; an internal repository is no private one; a ruleset's 409 and a rate limit are said in
  GitHub's words; a delete of a file already gone reads it again; "read again" is said only when it
  is. N24 to N26, from the third: a refusal whose sha cannot be read again frees the lock, a refused
  read before the write asks for no write access, and a write that lands after a sign-out and a
  sign-in again frees no lock a later write holds; N19 and N20 grew there too (the lock a write after
  a sign-in again holds, and the x on an internal repository's notebook).
- `e2e2/code.test.mjs`: 16 checks of sign-in by code (site branch claude/sign-in-by-code,
  2026-10-19), the Home Screen app's way in: GitHub's device flow through the sign-in service's
  routes /device and /device/token, against a mocked service that answers as signin/worker.js
  does. The app is played by navigator.standalone, as iOS gives an installed page, and the page
  asks no faster than the interval named, so the checks wait in real time (about four minutes).
  K1: in a browser, a second button after Sign in with GitHub, none on an unconfigured page, the
  same on the cost page. K2 and K3: in the app the one button shows the code, asks at the pace
  named and signs in for the tab, or kept on the browser. K4 and K5: slow_down's longer interval,
  the service's own limit asked again more slowly, and a moment out of reach asked again. K6 to
  K9: GitHub's expired_token and access_denied, an App with Device Flow unticked, a service with
  no device routes yet, and an answer with no code, each ending with words and the token box.
  K10 to K13: Cancel with an answer on its way, a token that arrives after Cancel, a new code
  after Cancel, and the browser's two ways. K14: the link that copies the code and opens GitHub's
  page. K15: the cost page. K16: a code that runs out at the time named though GitHub never says
  so.
- `e2e2/mutants/`: 334 mutants. Each `.json` is a list of [text, replacement] pairs applied to
  assets/js/symphony-panel.js. Its `.json.only` names the checks that must catch it, and its
  `.json.suite` the check file they are in, signin.test.mjs where there is none.
  `e2e2/run-mutants.sh` runs them. The seven of the Ask Claude bar's button "Ask in claude.ai"
  (`a*`, check O of assistant.test.mjs: the question dropped, the same tab, the state dropped, no
  cut, the encoded form unbounded, the referrer sent, a cut by code unit) were caught against the site branch claude/ask-in-claude. The 79 of the sign-in (`m*`) were caught against master
  009109c; the 54 of the Dependencies tab (`g*`, five of them for the tab: show dependencies
  opening no tab and leaving the charts' box where it was, the message line unsaid, the focus
  opening no tab, and the window not put back; eleven from the tab's second review: the message
  line said only when the press leaves the tab, a press always opening the Tasks tab, the board's
  blocks drawn whatever they hold, "$" written raw, the board's classes or quotes lost on the way
  to the drawing, the ASCII fold dropped, a draw not started from the open issues' count, a
  comment stripped across lines, a heading's escaped pipe left escaped, and the section unsaid;
  two from its third review: a block shown as text keeping the chart's light ground and dark ink,
  and the Board tab's gate narrowed to refuse brackets, the backslash, braces and the tilde; four
  from its fourth: the reserve held to the count the draw began from and not the newest any read
  gave (G6), an earlier draw's failure left in the summary (G6), a raw "#" let through the gate (X),
  and a Board chart that could not be drawn losing its text (R4); g41, the draw not seeded from the
  open issues' count, was retired, since every read now updates the count it starts from) against
  site branch claude/graph-section on 2026-10-18 after that review's fold, where the 79 were caught
  again; and five from the focus strip (g51 to g55: the default chart not the first (AA), the other
  charts not hidden (AB), the choice not kept across a press and a Refresh (AC), the strip shown for
  a single chart (AD), and a gone choice not falling back to the first (AE)) against site branch
  claude/dependencies-focus on 2026-10-19. The 63 of the Folders tab (`f*`, each with a `.json.suite` naming
  folders.test.mjs) were caught against site branch claude/folders-explorer on 2026-10-18, the
  first 48 also against the site's script at commit 044b8b3, f06 rewritten for the explorer's
  name cell; f56 to f63, the saved catalog's, against site branch claude/folders-catalog the
  same day, f60 to f63 for CAT7 to CAT9 (CAT5 and CAT6 are held by the checks alone, since a
  connect reloads the page and a name is kept as text by the shared drawing, so no single line of
  the catalog carries them). The 24 of the Explore tab (`x*`, each naming explore.test.mjs) were caught
  against site branch claude/explore-tab on 2026-10-18, after its adversarial review. The 33 of
  the foot and the phone (`p*`, for P1 to P21; P22 is a stylesheet's, which no mutant of the
  script reaches, and was seen to fail with the old rule) were caught against site branch
  claude/panel-feedback at f025b08 on 2026-10-19, where every other suite passes too; p34 to p40,
  for P24 (the list written readable by the private repositories, an open list left open, the
  close rewriting the value, a closed list closed again, a list open to all left open, a refused
  close thrown, and the emptied list kept), against site branch claude/lend-list-hidden on
  2026-10-19. The 39 of
  the Notebooks tab (`n*`, each naming notebooks.test.mjs) were caught against site branch
  claude/notebooks at 1656fbb on 2026-10-19 after its third review, n35 to n39 for its findings, where
  every other suite passes too; N6 to N9 and N18 have no mutant of their own (N9 and N18 hold the stylesheet, which no mutant of the script reaches). The 28 of sign-in by
  code (`k*`, each naming code.test.mjs) were caught against site branch claude/sign-in-by-code at
  8ace034 on 2026-10-19; two more were written and dropped as equivalent, the turn checked again
  when a refusal comes back after Cancel and the timer cleared by Cancel, since the ask itself
  checks the turn before it sends anything, so neither leaves a request a check could see.
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
   - `e2e2/run-mutants.sh` expects a server already on port 8077, or on the address `BASE`
     names, and reports each mutant as KILLED, SURVIVED, STALE or ERROR; name mutants to run only
     those, by their paths from e2e2/ (`bash run-mutants.sh mutants/g*.json` there runs the
     Dependencies tab's, `mutants/f*.json` the Folders tab's, `mutants/n*.json` the Notebooks
     tab's, `mutants/k*.json` sign-in by code's).

The site sets the two constants to the live service and SymphonyBoard's Client ID (site pull
request #24). The checks set them for themselves, whatever the shipped script holds: the
configured page gets the mocked service and `Iv1.testclient`, and the unconfigured page, which the
pasted-token checks of `hostile.test.mjs` and `panel.test.mjs` use, gets both emptied. `SITE`
names the site's checkout for every check file and for `run-suite.sh`.
