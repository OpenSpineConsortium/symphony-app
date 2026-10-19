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

- `e2e2/signin.test.mjs`: 136 checks of the sign-in and the console's foot, run against a mocked
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
  leaving the tiles their room on a narrow one, a phone held sideways and a wide one (P22). P23
  (site branch claude/dependencies-look, 2026-10-19, after the owner's "the buttons for tokens ect,
  should scale to the screen size so multiple fit on the page") holds the Tokens tiles to the
  window: at 1280 and 1920 px the nine tiles fill one row and that row reaches the box's end, and at
  those widths and at 2560 px, where nine tiles fill less than a row, each tile is 104 to 377 px wide
  and never a tall square and the columns grow with the window; P6 holds the Command tab's readouts and buttons three and two to a row on a phone.
  P24 (site branch claude/lend-list-hidden, 2026-10-19) holds the organization variable
  SYMPHONY_LEND_TO readable by no repository's workflows: written for selected repositories with
  none selected, and a list an older page left readable by the private repositories, or by all,
  closed, its value kept, when an owner opens the Tokens tab, a close GitHub refuses let go without
  a word, and the last repository taken off deleting the list.
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
- `e2e2/graph.test.mjs`: 75 checks of the panel's Dependencies tab (site branch
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
  button, by the arrow keys and by a link), a node pressed opening its focus and its Centre its row opening
  the Tasks tab with the task's row centred inside that tab's own box and the words on the message line too, the
  board's own charts drawn in the Board tab and a node there opening in focus under its chart, its
  Centre its row doing the same (R), handed to the
  drawing as the board's own bytes (R2: the fixture's two blocks, F's and M's, and a block whose
  titles hold every printable ASCII character between them, a node of each class and the fold's
  percent and dollar signs, pasted and compared with the checkout by A2; R3 hands the Board tab
  that checkout's own render of it, so the tab's gate is held to the lines the library writes now),
  drawn only where every line of a block is one the board writes, any other block shown as text
  that reads on its ground (4.5 to 1) and nothing planted on the branch board (a picture or a
  form from elsewhere, fields under the page's own ids, a directive, a link) making an element or a
  request (X), a title opening an HTML comment hiding nothing after it and a heading's escaped
  pipe read as a pipe (Y), the charts' edges, arrowheads and words showing on their ground inside
  the dark console (C and R, by contrast ratio), Centre its row pressed on a task the tables do not hold staying
  in this tab with its words here and on the message line (W), the assistant's "show
  dependencies", asked from the Ask Claude bar on another tab, opening this tab at its first chart
  and the next question naming the section (V), the window left at 0 in each of those presses at
  1366 x 657, where the page could scroll (asserted), each card's list shown in its chart's place when the
  drawing script cannot load, a hostile title inert and a title holding a Mermaid directive drawn whole, a
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
  first, and the console's look (AF to AI, with A, D, E and Q, after the owner's "dependencies still
  doesnt look very good, i want it to look more modern" of 2026-10-19): Mermaid told to draw in its
  neo look in the deck's colours, its labels wrapped at 190 px, with its list of settings no
  directive may change pinned (A; the neo look turns arrows at rounded corners whatever curve is
  asked, so none is), each chart a card with its heading, an epic's bar of closed tasks named for
  its card with its ARIA, a pill per state of the card's own issues (an epic's sub-issues in this
  repository), one for its sub-issues in another repository, which the bar counts and the chart
  does not draw (AQ), so the pills add up to the bar, and one for the blockers from outside the epic, its list behind a Chart
  and List switch named for its card (until the zoom, a list folded under it), and the key, a swatch per state drawn with the edge its nodes have and the
  three arrows, in two sets, shown with the charts (AF), the key hidden while there is nothing to
  draw, while a Refresh reads again and after a Refresh that finds nothing (AG), hidden where the
  drawing script cannot load (E) or no chart could be drawn (Q), every node of the six states drawn
  by the real Mermaid keeping none of the board's light colours on its own elements, shaded and
  edged by its state (blocked thick, claimed dotted, closed dashed and struck through, in review on
  a lit fill and open with a thin pale edge), no two states told apart by hue alone (each pair
  differs in its edge's dash, by a pixel of its edge's width, in its words' line, or by 1.4 to 1 in
  the lightness of its edge or its fill, which R5 holds on the Board tab too), its box rounded, no label wider or taller than its box
  though the site's face, served 160% wide, comes 1.5 s after the drawing script, and the arrows
  left unfilled (AH), the wait for that face bounded at 2.5 s, the charts drawn within 5.5 s of the
  script where the face never comes (AP), the same look on the Board tab's charts, every state (R5), a block
  shown as text there giving up the chart's class (X), a node pressed opening its focus, whose Centre its row
  opens the Tasks tab, as a row of the list does (D; until the zoom, the list folded before it was
  opened), and a chart wider than its stage opening whole on a phone, though it was drawn in a hidden
  tab, drawn whole again when the window changes and keeping a zoom the person made (AI; until the
  zoom, opened at its middle and left where the person scrolled it). The tiles and the moves between charts (AJ to AO, after the owner's "make the epics more
  intuitive and navigating that page more fluent" of 2026-10-19): a bar on each tile of its chart's
  own issues by state, All every epic's tasks, the tiles sharing a row on a laptop and on a phone
  one row that never scrolls, a page of them at a time, with the chosen tile's page brought into
  view (until the zoom, a row that scrolled sideways), a kept one too when the tab
  opens after a draw made on another tab (AJ), Previous and Next on each card stepping to the chart
  beside it with the keyboard kept on the card shown (AK), the arrow keys moving from tile to tile,
  Home and End across every tile to the first and the last, and a key at either end, which moves
  nowhere, changing nothing (AL), a chart zoomed in dragged with the mouse like a map, both ways, and
  stopping at its edges, nothing scrolling, a drag pressing no node (AM), Whole chart on every card,
  quiet while the chart is whole and lit once it is zoomed or in focus, and drawing it whole again,
  though drawn in a hidden tab or a hidden card (AN; until the zoom, Fit, shown only on a chart
  wider than its card),
  and a chosen chart fading in, none on load and none where less motion is asked (AO). From the
  look's second review (AQ to AU, 2026-10-19): an epic's sub-issue in another repository in a pill
  of its own (AQ); on a laptop the tiles one compact row however many epics there are, the charts'
  box keeping three fifths of the deck or more at 1280 x 800 with a goal and twelve epics, a page
  of tiles at a time turned by its arrows, a swipe across it and the arrow keys past a page's end,
  and the wheel left to the page where the page scrolls as a whole (AR; until the zoom, a row that
  the wheel turned sideways, its ends fading); a card's tools, Chart and List, the zoom's buttons
  and Previous and Next, in one place on every card however long its heading, however many its
  pills and whatever its chart's size, so Next pressed again and again by the mouse steps through
  every chart, and on a phone the tools on one row at the top of the card (AS); a press whose
  release never comes ended by the first move made with no button held, nothing moving with the
  bare mouse moved across the stage, and the next press and drag the person's own (AT); and the
  tiles' and the cards' small words at 4.5 to 1 on their ground, at rest and under the pointer
  (AU). The zoom (AV to BK, site branch claude/dependencies-zoom, 2026-10-19, after the owner's "I
  want all the nodes visible without scrolling, I literally never in any case want to scroll, I'd
  prefer to need to zoom but scrolling shouldn't be allowed" of that day): nothing in the tab
  holding more than its box (the page, the deck, the tab and its box, the tiles' row, every card,
  stage and list) at 1280 x 800, 1366 x 768, 1440 x 900 and 1920 x 1080 at every text size from 70%
  to 170% with the first chart and All, every chart at 70%, 100% and 170%, and on a phone held either
  way, 390 x 844 and 844 x 390, where the tab lies wholly between the header and the foot and the
  page is no wider than the screen, every chart and All with every node inside its stage (AV); the
  tiles sharing their row's width, in their full form where each has 168 px and compact otherwise,
  never under 80 px, 24 epics in two rows on a 1920 x 1080 monitor and in pages on a 1366 x 768
  laptop, and every button on a card one height, at least 3 px taller on the monitor than on the
  laptop, at least 32 px on a phone and none off the screen (AW); each chart opened whole, a small
  one at its own size and never enlarged, a large one shrunk to its stage's 12 px padding (AX); the
  zoom by the wheel and by ctrl and the wheel about the pointer, by + and - on the card and on the
  keys, back whole by 0, and in twice about a node by a double click that opens no focus, bounded at
  the whole view and at three times the chart's size, every turn of the wheel it takes kept from the
  page (AY); the pan by the arrow keys, 60 px a press, and by one finger, stopping 12 px inside every
  edge, and Page Down, End and Space, which scroll a box that scrolls, scrolling nothing (AZ); a pinch
  sent as two fingers through Chromium's DevTools protocol, spread about the point between them to
  three times the size, closed back whole and out of a focus, the page itself never zoomed (BA); a
  press opening the node's focus, the node and its neighbours one arrow away and only those, larger
  than the whole chart drew them, its card with its number, state, worker, whole title, its arrows
  in words, a link opening a new tab and Centre its row, and a node no arrow joins saying so, on a
  laptop and on a phone held either way, where the tiles and the card's heading give their room to
  the focus and come back with the whole chart (BB); a swipe, an arrow key and a press moving the
  focus to the neighbour that way, the picture moved as a map is (BC); Escape, Whole chart, - and the
  wheel outward going back whole (BD); a drag, a short swipe or a pinch ending on a node opening
  nothing (BE); All's grid fitting the charts' box with each chart whole, the grid the page chooses
  the one that draws the smallest chart largest of every number of columns at 100% and 170% on a
  1280 x 800 laptop, and a press on a cell, by the mouse or a finger, opening that chart (BF); a swipe
  across a whole chart stepping to the chart beside it (BG); Chart and List switching a card in
  place, the list fitted whole as the chart is and never scrolling (BH); the key folded behind its
  Key button on a phone (BI); no glide and no fade where less motion is asked (BJ); and the Board
  tab's charts whole on their stages, zoomed by + and the trackpad's pinch, holding the finger once
  zoomed and leaving the plain wheel to the board (BK). Seventeen checks were rewritten for the zoom,
  each to say what the page now promises in place of what it took away: D (a node pressed opens its
  focus in this tab, whose Centre its row opens the Tasks tab, as a row of the list does), E and Q
  (the list shown in the chart's place with its Chart switch off where the chart cannot be drawn, in
  place of the folded list opened), R (a node on the Board tab opens in focus under its chart first),
  X (the zoom's buttons over the board's charts, six, are the page's own, and nothing planted makes
  an element still), T (the state line's words for a press), V (the tab's box left unscrolled), W
  (Centre its row on a task the tables do not hold), AF and AQ (the Chart and List switch and the
  list's rows in place of the folded list), AI (a chart wider than its stage opened whole on a phone,
  drawn whole again when the window changes, and a zoom kept), AJ and AR (the tiles in pages, turned
  by their arrows, a swipe and the keys, never scrolling), AM (a drag panning a zoomed chart by its
  transform within its edges, nothing scrolling), AN (Whole chart in Fit's place), AS (the tools' row
  with Chart and List and the zoom), and AT, whose bare mouse now crosses the stage: it left the stage
  at its first step before, so the moves never reached it and the check passed whatever the page did.
  In signin.test.mjs P12 holds the tab at the screen's height it was given, with the chart's box held
  through Refresh and the page never moving, since on a phone the tab is now sized to the screen.
  `NOCSS=1` serves the stylesheet without its rules for a chart's nodes, the half of the look no
  mutant of the script reaches, and AH and R5 fail then (until the console's look it took the
  chart's light ground away and C and R failed). AR's compact row, the phone's half of AS and AU
  hold the rest of the stylesheet's part, which no mutant reaches either, and were seen to fail
  with the rules from before the look's second review. `CSSEDIT=<file>` serves the stylesheet with
  that file's [text, replacement] pairs applied, as `MUTANT` does to the script; the zoom's part of
  the stylesheet is proved by the files under `e2e2/styles/` (below). Each check opens the Dependencies tab by its rail
  button before it reads or presses inside it, and a press that crosses tabs is read at once with
  page.evaluate,
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
- `e2e2/app.test.mjs`: 8 checks of the control panel as a Home Screen app (site branch claude/home-
  screen-app, 2026-10-19, after the owner's "Build way 1", the first of the three ways in symphony-
  template's docs/research/native-ios-app.md), against the page as the site serves it, signed out,
  with every request off the site's origin refused, so it needs no mocked GitHub; the panel's script
  is served from `SITE`, with a mutant's pairs where `MUTANT` names one. H1: the page names a
  manifest that Chromium reads with no error and finds installable, its start, scope and id the
  panel's own address, standalone, its icons PNGs of the sizes they say, one for any use and one
  maskable, the largest 512 px. H2: iOS's 180 px touch icon, the head lines that open the page as an
  app named Symphony under iOS's light status bar, and a viewport that covers the screen. H3: where a
  screen has no safe areas, a computer's 1280 and 1000 px wide or a phone's, the deck, the status
  line, the header with its own padding, and the section strip, the breadcrumb and the footer with
  theirs are where they were. H4 to H7, with safe areas played through Chromium's
  Emulation.setSafeAreaInsetsOverride, and H8 hold what the adversarial review of the branch found
  that day: held upright, the status line's words and buttons stand clear of the home bar, by its
  own padding (H4); held sideways at 844 x 390, the header's bar and the deck's dark ground run to
  the screen's edges while the brand, the menu button and the opened drawer's links, the deck's
  content, the section strip, the Ask Claude drawer with its Close and its words, the breadcrumb and
  the footer keep inside the notch on either side, and the visible status line's words and buttons
  stand clear of the home bar (H5); a large phone held sideways, 932 x 430 with 59 px insets and
  956 x 440 with 62 px, wider than 900 px but too narrow inside its insets for the header's one row,
  keeps the header's drawer, with the brand, the menu button, the drawer's links, the strip, the
  breadcrumb and the footer inside the insets and the page no wider than the screen, while a short
  window on a computer, 1280 x 500 with a pointer that hovers, keeps the row (H6); a tablet held
  sideways, 1180 x 820 with a 20 px home bar, keeps the deck's desktop layout, whose own foot pads
  the home bar, so the status line's words stand clear of it (H7); and the Full screen button is
  hidden where the browser has neither requestFullscreen nor webkitRequestFullscreen, as on an
  iPhone, which has no F11 either, and shown on a computer and on a phone that has both, or WebKit's
  older call alone, as Safari before 16.4 has (H8). The manifest, the head and the stylesheet are
  the build's and no mutant of the panel's script reaches them, so each of their lines the checks
  hold was taken out of a served copy by hand on 2026-10-19 and seen to fail its check: display, the maskable icon
  and the scope (H1), the status bar's style, the covering viewport and the touch icon's size (H2),
  the manifest's link (H1); the header's own padding at each width and the strip's, the
  breadcrumb's and the footer's at a phone's (H3); the status line's inset, taken out (H4 and H5)
  or kept to a narrow window (H5); the header's padding by the insets (H5 and H6), its drawer's at
  900 px and below (H5), the drawer of a large phone held sideways, its menu button, and the
  hovering pointer that keeps a computer's row (H6); the strip's, the breadcrumb's and the footer's
  padding by the insets, each alone (H5 and H6); the Ask Claude drawer's (H5); the deck's left side
  (H5); the deck's foot kept to the phone layout (H7); and the rule that hides the Full screen
  button once the script marks it hidden (H8). Two changes no check sees: a fallback given to env(), which Chromium and Safari never
  use since both define every inset, and the deck's foot padded by the home bar in the phone layout
  too, which only widens the dark band under the status line, since H4 holds the status line's
  place alone. Run it with `SITE=<the site's checkout> BASE=<the site's address> node
  app.test.mjs`.
- `e2e2/mutants/`: 392 mutants. Each `.json` is a list of [text, replacement] pairs applied to
  assets/js/symphony-panel.js. Its `.json.only` names the checks that must catch it, and its
  `.json.suite` the check file they are in, signin.test.mjs where there is none.
  `e2e2/run-mutants.sh` runs them. The seven of the Ask Claude bar's button "Ask in claude.ai"
  (`a*`, check O of assistant.test.mjs: the question dropped, the same tab, the state dropped, no
  cut, the encoded form unbounded, the referrer sent, a cut by code unit) were caught against the site branch claude/ask-in-claude. The 79 of the sign-in (`m*`) were caught against master
  009109c; the 140 of the Dependencies tab (`g*`, five of them for the tab: show dependencies
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
  claude/dependencies-focus on 2026-10-19; thirteen from the console's look (g56 to g68: the nodes
  not restyled, restyled on the node alone and not its parts, not rounded (AH), the classic look
  (A), the list open from the start (AF), not opened for a chart not drawn (Q) or for the drawing
  script not loaded (E), the key never shown (AF) or kept through a Refresh's read, by the strip's clearing that a Refresh
  and every draw go through (AG), the bar's
  aria-valuenow given the total (AF), the closed pill dropped (AF), a wide chart not opened at its
  middle, and opened at its middle again after the person scrolled it (AI)); sixteen from the tiles
  and the moves (g69 to g84: the tile bar's segments even (AJ), All counting the goals (AJ), the
  pressed tile left out of view on a phone (AJ), a step that selects nothing or loses the keyboard,
  All's class unset (AK), the arrow keys dead or Home and End stepping one (AL), no drag, a drag
  that presses a node or one with no threshold (AM), Fit never shown, never fitting or never checked
  once drawn (AN), no fade or a fade on load (AO)); twelve from the look's review (g85 to g98 but
  g95, and g97, retired as g64 again: the secure list short of themeVariables (A), the key kept after the drawing script
  failed (E) or with no chart drawn (Q), the pills counting the blockers from outside the epic (AF),
  no pill for them (AF), the bar named for no card (AF) or read as a percentage (AF), the list's
  toggle named for no card (AF), the site's face not waited for (AH), waited for with no bound (AP),
  the Board tab's charts not restyled (R5), and the tiles' bars counting the blockers from outside
  (AJ)) against site branch claude/dependencies-look on 2026-10-19, where every other suite passes
  too; and thirteen from its second review (g100 to g112: no pill for an epic's sub-issues in
  another repository (AQ), the kept tile not brought into view when the tab opens after the draw
  (AJ), the strip deaf to the wheel, its ends never marked, or the wheel taken from the page where
  the page scrolls as a whole (AR), Previous and Next out of the tools' row or Fit back among the
  pills (AS), End stepping one, or a key at either end still pressing its tile (AL), a drag moving
  the tab's box where the page scrolls (AM), a press whose release never came still dragging (AT),
  Fit's box never watched for a resize (AN), and the wait for the site's face made 6 s (AP)) against
  the same branch the same day. Four were rewritten for that branch, since
  their text had moved: g22 (one chart's failure failing the rest, now that the failure opens the
  chart's list), g27 (the words for no repository listed), g29 (show dependencies scrolling only)
  and g52 (the strip not hiding the other charts), and two more for the second review, g64 (the
  strip's clearing now drops its faded ends too) and g75 (the strip's keys added through its own
  name); and g45 (a block shown as text keeping the
  chart's class), which the dark chart ground let survive, is caught again by X, which now asks that
  such a block keep no chart's class. No mutant has graphRestyle reach the arrows: it would take off
  only the fill:none Mermaid also gives them in its own stylesheet, so nothing it changed could be
  seen, and AH's look at the arrows guards the console's stylesheet instead. From the zoom, against
  site branch claude/dependencies-zoom at 633a192 with this suite's site fix on 2026-10-19,
  forty-three more, g113 to g155, each caught: the pan unclamped (AZ); the zoom out past the whole
  view, its bound and the step back to whole taken together, since either alone draws it whole
  (AY); the zoom in past three times (AY); the wheel about the stage's middle and not the pointer
  (AY); the trackpad's pinch as slow as the wheel (AY); the Board tab's plain wheel zooming (BK); no
  pinch, and a pinch about the stage's middle (BA); a gesture's release pressing the node under it
  (BE); a focus's neighbours one way only, a focus drawing the whole chart, and a focus never
  enlarged (BB); a step to the neighbour the other way (BC); a swipe moving as a scroll does and not
  as a map (BC, BG); Escape ignored on the stage and on the card, and Whole chart keeping the focus
  (BD); All's grid unset, and a press under All opening nothing (BF); a swipe stepping nowhere (BG);
  the list shown beside the chart, and the list not fitted (BH); the key never folded (BI); the
  glide where less motion is asked (BJ); a small chart enlarged (AX); the whole view drawn at the
  chart's own size (AV); the tiles never paged (AW); the phone's tab not given the screen's height,
  and the short form never set (AV); no double tap, the key + dead, and the card's zoom buttons dead
  (AY); a resize throwing the person's zoom away, and one keeping the old fit (AI); the focus taking
  no room from the tiles on a phone, and the room never given back (BB); All's cell heading guessed
  at 34 px, as the zoom's branch had it (AV, at 150% on a 1280 x 800 laptop, where it left a stage
  too small for its chart); every turn of the wheel the zoom takes let through to the page (AY);
  Whole chart lit while whole in a focus (AN); the Board stage holding the finger while whole (BK);
  the tiles' swipe dead (AR); a focus's title cut at 60 characters, its link opening in the same
  tab, and a lone node unsaid (BB). Twelve were rewritten for the zoom, their text having changed:
  g60 (the list shown at the start, AF), g64 (the key kept through a Refresh's clearing, AG), g71
  (the chosen tile's page not brought into view, AJ), g74 (All's class unset, now caught by BF's
  grid), g77 and g79 (no pan, no threshold, AM), g78 (a drag that comes back to where it began
  taken for a press, AM; its old text, a drag's click swallowed, had come to name the tiles' swipe
  guard first, a line of another meaning), g98 (the tiles' bars counting the blockers from
  outside, AJ), g101 (the tiles laid out without following the kept tile, AJ), g106 (the tools in
  the pills' row, AS), g110 (the bare move's guard dropped, AT once its moves cross the stage) and
  g111 (the stage's resize unwatched, AN). Twelve were retired. Ten broke code the zoom took away:
  g67 and g68 (a wide chart opened at its middle and centred once, where a chart now opens whole:
  AI and AX), g80, g81 and g84 (Fit shown, toggled and watched, where Whole chart took its place: AN
  with g111 and g150), g92 (the folded list's summary named for its card, where Chart and List took
  its place: AF and BH), g102, g103 and g104 (the strip's wheel and its faded ends, where the tiles
  are paged and never scroll: AR with g138 and g152) and g109 (a drag choosing between the page and
  the tab's box, where the stage pans by a transform: AM with g77 and g113). Two broke what the
  layout now holds by itself: g30 (the charts' box scrolled back to its top, a box that no longer
  scrolls, V) and g99 (a hold through Refresh rounded to a whole pixel, where the tab on a phone is
  given the screen's height in whole pixels, so the rounded hold is the same height, P12); p17 and
  p19, below, went for the same reason. The stylesheet's part of the zoom, which no mutant of the
  script reaches, is proved by the ten changed copies of assets/css/control.css under
  `e2e2/styles/`, each a `.json` of pairs that `CSSEDIT` applies, with its `.only` and `.suite`, run
  by the same runner and each seen failing its check: the tiles (s01) or the card's heading (s02)
  keeping their room from a focus on a phone (BB), the focus's title cut at two lines on a short
  tab, as the zoom's branch had it (s03, BB), the stage left to scroll, which Page Down then scrolls
  (s04, AZ), the stage left to the browser's own touch handling, whose pinch zooms the page (s05,
  BA), the tab's box no longer held to the deck (s06, AV), one button size on every screen (s07, AW),
  the key never folded (s08, BI), the card's heading kept on a short tab (s09, AV) and the focus's
  fade where less motion is asked (s10, BJ; the script itself sets no glide then, so the fade is
  the stylesheet's own part). m7 (E5's 404 unsaid) was already STALE before the zoom, its text gone
  from the script, and is left as it was. The 63 of the Folders tab (`f*`, each with a `.json.suite` naming
  folders.test.mjs) were caught against site branch claude/folders-explorer on 2026-10-18, the first
  48 also against the site's script at commit 044b8b3, f06 rewritten for the explorer's name cell;
  f56 to f63, the saved catalog's, against site branch claude/folders-catalog the same day, f60 to
  f63 for CAT7 to CAT9 (CAT5 and CAT6 are held by the checks alone, since a connect reloads the page
  and a name is kept as text by the shared drawing, so no single line of the catalog carries them).
  The 24 of the Explore tab (`x*`, each naming explore.test.mjs) were caught against site branch
  claude/explore-tab on 2026-10-18, after its adversarial review. The 33 of the foot and the phone
  (`p*`, for P1 to P21; P22 and P23 are the stylesheet's, which no mutant of the script reaches, and
  were seen to fail with the old rules) were caught against site branch claude/panel-feedback at
  f025b08 on 2026-10-19, where every other suite passes too; p34 to p40, for P24 (the list written
  readable by the private repositories, an open list left open, the close rewriting the value, a
  closed list closed again, a list open to all left open, a refused close thrown, and the emptied
  list kept), against site branch claude/lend-list-hidden on 2026-10-19; p17 (the chart's box
  measured after the earlier hold let it go) was rewritten for the exact height the hold now takes
  and caught again against site branch claude/dependencies-look the same day, and was retired for the
  zoom with p19 (the tab not held through Refresh): the tab on a phone now has the screen's height
  set on it in whole pixels, which holds the tab and the charts' box in it whatever either hold does,
  so P12 sees the same heights with either mutant; p18 and P13's p20 still bite. The 39 of the Notebooks tab
  (`n*`, each naming notebooks.test.mjs) were caught against site branch claude/notebooks at 1656fbb
  on 2026-10-19 after its third review, n35 to n39 for its findings, where every other suite passes
  too; N6 to N9 and N18 have no mutant of their own (N9 and N18 hold the stylesheet, which no mutant
  of the script reaches).
  The two of the Home Screen app (`h*`, each naming app.test.mjs, for H8: the button offered where
  the browser has no full screen call, and only the standard call looked for, which would hide it
  from Safari before 16.4) were caught against site branch claude/home-screen-app at 79d4b83 on
  2026-10-19, after its adversarial review, where app.test.mjs, signin.test.mjs, panel.test.mjs and
  hostile.test.mjs pass whole; H1 to H7 hold the build's head and the stylesheet, which no mutant of
  the script reaches.
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
   - `MUTANT=mutants/m33_noended.json` runs the checks against that mutant, and
     `CSSEDIT=styles/s01_near_keeps_tiles.json` the graph suite against that changed stylesheet.
   - `e2e2/run-mutants.sh` expects a server already on port 8077, or on the address `BASE`
     names, and reports each mutant as KILLED, SURVIVED, STALE or ERROR; name mutants to run only
     those, by their paths from e2e2/ (`bash run-mutants.sh mutants/g*.json styles/*.json` there
     runs the Dependencies tab's and its stylesheet's, `mutants/f*.json` the Folders tab's, `mutants/n*.json` the Notebooks
     tab's, `mutants/h*.json` the Home Screen app's, with `SITE` set as for the checks).

The site sets the two constants to the live service and SymphonyBoard's Client ID (site pull
request #24). The checks set them for themselves, whatever the shipped script holds: the
configured page gets the mocked service and `Iv1.testclient`, and the unconfigured page, which the
pasted-token checks of `hostile.test.mjs` and `panel.test.mjs` use, gets both emptied. `SITE`
names the site's checkout for every check file and for `run-suite.sh`.
