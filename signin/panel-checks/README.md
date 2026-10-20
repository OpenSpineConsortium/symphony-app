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

- `e2e2/signin.test.mjs`: 160 checks of the sign-in and the console's foot, run against a mocked
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
  P25 to P38 (site branch claude/panel-resize-autohide, 2026-10-19, after the owner's "i should be
  able to resize all 3, when im in the control panel the top nav panel should hide and reappear when
  the mouse is over it, like windows does with its taskbar") hold the message foot as the third part
  a person sizes, and the site's bar hiding itself on the control page. The foot's grip lies along
  its top, its bottom on the foot's top edge, a separator with a quiet bar, over none of the
  message's words, that a mouse drags, up to grow the foot and down to shrink it, the stage giving
  up or taking back exactly what the foot takes (P25); a finger drags it on a phone either way up
  without scrolling the page, the grip a thumb's, 96 to 160 px wide about its bar, and over none of
  the message's words, the foot's buttons or the empty foot's placeholder (P26); the arrow keys step
  it by 16 px and a double-click puts it back as tall as its message (P27); its size is kept across
  a reload, read back only as a number in the part's bounds with the rest of the record kept, held
  to what the window leaves, and a window made shorter takes the foot down and gives it back (P28);
  it is held between one line of message with Clear and its buttons, whole and pressable, and what
  leaves the stage 180 px, at 1280 x 800, 1440 x 900 and 1920 x 1080, at the smallest and the
  largest text, on a phone upright and sideways, while the Ask Claude bar grows, and in a narrow
  window by the mouse or on a phone by a finger with the smallest or the largest text saved, which
  neither applies, a grip dragged past the window's top calling no bar (P29, and P41 for any press
  held there); the grip follows the pointer under every text size, and a finger on a phone whatever
  text size a computer saved (P30); and a long task box, a failed run of fourteen steps with its
  log, keeps a small foot its size, its first line showing, Clear pressable and the rest scrolled
  inside the message box, fills a foot sized tall past the box's usual cap, and grows a foot nobody
  sized to that cap as before (P31). On a computer every one of them finds the deck filling the
  window with no page scroll either way; a phone's page scrolls under its sticky foot by design
  (P6), so there the page is held to the window's width, the foot to the window's bottom and the
  drags to scroll nothing. The bar is hidden from the start, wholly above the window, the deck
  starting at the window's top or the Home Screen app's top inset, with neither the hot strip nor
  the phone's handle over a control of the deck or the words of its title (P32); the pointer at the
  top edge brings it back over the deck, which does not move, and it stays while the pointer is over
  it, though the focus passes through it and out, or over a section strip it dropped, goes a moment
  after the pointer leaves and not at once, comes for a pointer leaving the window across the top
  and not for one passing just under the edge or leaving by a side near the top, goes after its wait
  when a pointer grazes the edge and is back on the deck before the bar is under it, and is opaque
  over the deck (P33); Tab from the page's start brings it, it goes after its wait when the focus
  leaves and stays while the focus moves in it, and Escape sends it away at once with the focus
  (P34); on a phone the handle, a tab in the site's colours at the top centre, shows it for a tap or
  a swipe down, a tap outside sends it at once and four seconds do too, a touch in the bar starts
  the wait again, the menu opened from it holds it past that wait and closes with it, the menu
  opened and closed by two taps on its button leaves the bar to go after its wait, since a tap's
  focus is no keyboard's, and a swipe down on the handle with the page scrolled shows the bar and
  scrolls nothing (P35); full screen hides the bar, the strip and the handle, and leaving it gives
  them back (P36); where less motion is asked the bar shows with no slide, on a computer and on a
  phone, and slides otherwise (P37); and the rest of the site, /symphony/, the cost page and the
  home page, keeps its bar at the top with no strip and no handle (P38). P39 to P48 (the same branch
  and day, after its adversarial review) hold what that review found: the foot's grip lies in the
  gap above the foot and in the Ask Claude bar's bottom padding, over none of the foot's buttons and
  none of the bar's content at any text size, sized or not, so a press just inside a button's top
  edge is the button's and a double press on A+ leaves the foot its size (P39); on a fresh load with
  the script slow to come, the bar is above the window from the first frame the page paints and
  never slides, and the deck never moves, on a computer and on a phone (P40); a text selection or a
  press run up to the window's top, or a pointer leaving across the top just after a move with a
  button held, brings no bar, and the edge still brings it to a pointer with no button held (P41); a
  grip pressed while the focus is in the shown bar sends the bar away with the focus, so Enter
  follows no link nobody sees (P42); where the page scrolls, the foot rests on the window's bottom
  on every phone tab at the page's top, and its grip stays under the finger or the mouse at every
  step of a drag as well as after it, on a short tab and with the page scrolled past the deck's end,
  on a phone either way up, a tablet upright and a narrow window (P43); a thumb swiping up beside
  the grip's middle scrolls the page and leaves the foot its size (P44); on a touch-first screen
  with a mouse too, the mouse leaving across the top brings the bar and the mouse resting on it
  keeps it past a touch's wait (P45: the screen is made by a stub of matchMedia, since Chromium's
  emulation answers no hover feature as such a screen does, and the strip along the top is held by
  reading the stylesheet's own rule, shown under (any-hover: hover), which nothing in Chromium can
  show on such a screen); the handle's whole press area is the tab a person sees, so a tap just
  below it presses what is there and shows no bar (P46); on a tablet either way up the grip is a
  thumb's, over none of the buttons, the message's words or the placeholder, which stands where a
  message's words do, and a finger drags it (P47); and each grip says its part's size and the bounds
  it is held to as a separator, and the new size as a drag or the arrow keys change it, the foot's,
  the side column's and a token's panel's, which the script draws later (P48). `CSS_MUTANT` names a
  list of pairs for control.css, served in its place, as `MUTANT` names one for the script.
- `e2e2/panel.test.mjs`: the panel's walkthrough on both pages.
- `e2e2/hostile.test.mjs`: 13 hostile-input checks.
- `e2e2/assistant.test.mjs`: 26 checks of the panel's assistant (site branch claude/assistant-panel,
  2026-10-18): who may ask (write access, and the repository's workflow carrying
  .github/symphony/assistant.md), the label and the issue made once and only on a press, the
  question's state block and its size, the conditional polling (If-None-Match and a 304) and where
  it stops (a 403, three failed reads, the time limit), the action's three comment shapes as its
  source writes them (the first comment, Claude's checklist, the header that ends a run or says it
  failed), the answer's vocabulary and what the renderer never lets through, whose comment is the
  answer, the issue read again before each question and replaced when closed, one press at a time,
  a sign-in changed under the page, a watch read on after a sign-in, and Stop watching; its cadence
  constants are shortened in the served script, and a check may serve its own.
- `e2e2/graph.test.mjs`: 89 checks of the panel's Dependencies tab (site branch
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
  zoomed and leaving the plain wheel to the board (BK). From the zoom's review (BL to BU, the same
  day, after four reviewers' thirty-five findings): on a phone held either way the page held still
  while the tab is shown, a finger drawn up or down the tab's head, its tiles, a card's tools or the
  foot and the wheel moving nothing, a pinch off the stage zooming the chart and never the page, the
  tab brought back whole when the phone turns, and held either way the site's header taking none of
  the screen, hidden above it until its handle brings it, and held sideways the stage at least two
  fifths of the screen (BL); the tab's help never scrolling, in pages of
  paragraphs under arrows where it does not fit, at 1366 x 768 at 100% and 170%, 1920 x 1080 and
  on a phone held either way, and closed by Escape from inside it (BM); a card's list a stage of
  its own, laid out as a table at the width that draws its rows largest, or as cards in columns
  where that draws them a good deal larger, never smaller than as a table at the list's own width,
  zoomed by its + and the wheel and by a pinch, panned by a drag and drawn whole by Whole chart, the
  page never zooming (BN); a focus's card with a title of four hundred characters keeping its
  state, its link and Centre its row inside it and above the title, the title giving way, the
  floating tools never over the card, and every neighbour a button the keyboard reaches (BO); the
  mouse's zoom about its pointer at every step, a wheel in lines as one in pixels, double clicks at
  350 and 450 ms still one, a right click opening nothing and Ctrl with + or - the browser's (BP);
  a chart drawn top to bottom or left to right, whichever its stage draws larger, and a hub's focus
  a quarter larger at the least (BQ); on a phone the finger left after a pinch panning, a finger's
  press drawing no ring while the keyboard's way to the stage draws one, two quick taps on two
  nodes apart two presses, the state line opened and cut by a tap, and the tiles back when a focus
  is left by Previous (BR); All in pages whose cells are 150 by 110 at the least, turned by its
  arrows and a swipe (BS); a short tab's tiles saying their numbers, a heading of any length on two
  lines at the most with its whole in its tooltip, and the key folding where it would be cut or the
  tab is short, at 1280 x 800 too (BT); and a zoomed chart kept inside its edges when its stage
  changes size, a focus drawn once kept, a swipe between two neighbours the same way going to the
  nearer, and a short swipe on one tile turning the tiles' page and pressing nothing (BU). From
  the merge with site pull request #93 (the foot the person sizes and the site's bar that hides
  itself, 2026-10-19), BV to BY: on a phone held either way the bar's handle at the window's top
  centre, over nothing of the tab but the rail's own button, a tap or a swipe down from it bringing
  the bar over the deck with nothing under it moving and the bar going after its wait, a swipe down
  a chart bringing none, and the phone turned while the bar shows keeping the rail at the window's
  top and the tab its height (BV); a foot the person sized leaving the tab 280 px and staying under
  it on a phone, given its size back on another tab, dragged with the window held still, kept to
  two rows with its message over Clear on a short screen, and on a laptop at 100% and 150% dragged
  to the window's top still leaving the tab its least with every chart whole (BW); one Escape doing
  one thing: with the keyboard in the bar it sends the bar away and leaves the help open, and with
  the bar brought by the pointer it first leaves a focus, folds the key or closes the help, from
  inside the tab and from the page, and only the next one sends the bar away (BX); and every chart
  fitted whole, nothing past its box or under the foot, through a foot sized up and down, the side
  column widened and narrowed, the window made smaller and larger, and the bar shown and gone,
  which moves no chart (BY). Five were rewritten for the merge, since it changed on purpose what
  they measured: the deck now takes the whole window under a bar that floats over it, so at
  1280 x 800 the tiles fit one page and the key no longer folds, and AR, BT and BU, which need the
  tiles in pages or the key folded, run at 1280 x 720; AJ reads one row within a pixel, since the
  window brought to the rail now leaves the mouse over a tile, whose hover lifts it one; and BL
  asks the header to stand above the window's top, where the bar's own hiding puts it, in place of
  being taken out of the page held sideways. Six were made stricter where a mutant got past
  them: D puts the window 40 px down the room the check gives the page before Centre its row,
  since the deck now fills the window from its top, where a window at its own top could only move
  up to centre the row and so never moved; AM drags from a node and back the way the picture can
  still follow, since the taller stage leaves the picture against its far edge after the drags past
  each corner, so the node no longer came back under the pointer; BL puts the window off the rail before each turn and asks the turn to bring the rail back
  to the window's top, since the page above the rail now keeps its height either way up, so a turn
  that left the window where it was had nothing to show; AY holds the node under the pointer still both ways, since the merged deck draws the wide
  chart with that node at the stage's middle across, where a zoom about the middle leaves it; AZ
  reads each scroll of a stage as it comes, before the stage's own listener puts it back, so the
  keys that scroll a box are seen if they scroll it for a moment; and AV asks a short tab, a phone's
  held sideways, to keep its card's heading at no height with its words kept for a reader. Two
  helpers and six checks were rewritten for that review: assertWhole, which every check of a whole
  picture goes through, now
  asks the fit and the centring of the part of the stage the floating tools leave (it let a
  sideways phone's charts shrink by two fifths unseen), and a focus is held to its growth by
  assertFocus in BB and BK; the overflow every check reads leaves the page's height out only where
  the tab holds the page (it left it out on every phone) and reads the key's line too; AI, whose
  chart now turns, asks a chart far larger than its stage, grows the window and shrinks it again,
  and zooms by a finger's double tap; AN asks a chart larger than its stage in its layout; AR, on
  the narrow window that is now one long page the tab holds, asks that the wheel moves nothing; L
  names the list under each chart for the List in its place; and the suite's header says what the
  tab now does. Seventeen checks were rewritten for the zoom,
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
- `e2e2/folders.test.mjs`: 57 checks of the console's Folders tab, /symphony/control/#folders
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
  repository name wraps in the Track step's head with Track inside the Track dialog at 1366 x 657
  and 390 x 844 (N6b, N6c); and folders.html is gone, linked from nowhere, while #folders opens
  the tab. B, C, D, E3, I and L scan every request, the console, #msg, the markup, the fields, the
  address and the storage for the drive's tokens, which go only to Graph's Authorization header,
  to /drive/token and, sealed, into the secret. Its mutants
  are `e2e2/mutants/f*.json`, 58, run as the section below says. X1 to X4 hold the list drawn
  as a file explorer (site branch claude/folders-explorer, 2026-10-18): the folder tree, Back,
  Forward, Up and the keyboard, Details' four columns and the status bar; a Word file opened for
  editing in Word at its d.docs.live.net address on a personal drive and at the address OneDrive
  gives on a work drive, never an address that is not https, other files on OneDrive's page, and
  the right-click menu; Large icons, sorting with folders first, and the search box. NC1 to NC3
  hold the tab as the owner asked on 2026-10-20 (a native File Explorer view of the drive, the right
  side panel removed, the connector's saved catalog never offered; site branch claude/folders-native):
  with no drive a private repository holding a catalog.json shows only the connect prompt, never
  reads the file and says nothing of a catalog or a connector (NC1); at 1440 x 900 the tab is its
  one-line head over the explorer, which fills the rest, with no side column and no page scroll
  (NC2); and Track in a repository opens the dialog that holds what is ticked and the two steps,
  Escape closing it with the explorer as it was (NC3). CAT1 to CAT9, the saved catalog drawn when no
  drive was connected (claude/folders-catalog, 2026-10-18), were retired with that route.
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
- `e2e2/notebooks.test.mjs`: 36 checks of the console's Notebooks tab, /symphony/control/#notebooks
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
  a sign-in again holds, and the x on an internal repository's notebook). N27 to N32 (site branch
  claude/make-private, 2026-10-19, after the owner's "Add the button"): Make private on a public
  notebook repository asks once, saying what GitHub erases, then changes the repository as the
  person and says it is private by GitHub's answer; an internal repository's confirmation says what
  becomes of its forks; a person GitHub says does not administer the repository gets no button; a
  refusal is said in GitHub's words with the access it needs, and a rate limit is not taken for
  missing access; the button waits while GitHub is asked, and a sign-out on the way leaves no lock;
  GitHub's answer, not the press, says what the repository is now. N33 to N36, from its review: a
  side panel drawn again while the change is on its way shows the button waiting and a press of it
  sends nothing, before a sign-out and after a sign-in again; a change answered after a sign-out and
  a sign-in again frees no lock a later change holds; a Refresh while the change is on its way reads
  the repository again once GitHub answers, so the card says it is private; and a change answered
  once the page shows another owner's repository marks nothing there and draws the freed lock. N27,
  N29 and N30 grew there too (the confirmation says what a public repository loses on GitHub's
  plans; a person who does not administer the repository is pointed at no button and no settings
  page; a 403 and a 404 get the access words, in SymphonyBoard's words when signed in with GitHub),
  and the mocked GitHub keeps each notebook repository's visibility, so a change it answers is read
  back as it now is.
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
  place alone. Since the site's bar hides itself on the control page (site branch
  claude/panel-resize-autohide, 2026-10-19), H5 and H6 open the header's drawer as a person then
  does, by tapping the handle at the top, which slides the bar back, and pressing the menu button
  once the bar is whole in the window; they failed on that branch only because the button stood
  above the window, where the hidden bar keeps it. Run it with `SITE=<the site's checkout>
  BASE=<the site's address> node app.test.mjs`.
- `e2e2/code.test.mjs`: 29 checks of sign-in by code (site branch claude/sign-in-by-code,
  2026-10-19), the Home Screen app's way in: GitHub's device flow through the sign-in service's
  routes /device and /device/token, against a mocked service that answers as signin/worker.js
  does. The site ships it switched off, `CODE_SIGNIN = false` in the panel's script, the owner's
  switch (signin/README.md, step 9), since ticking SymphonyBoard's "Enable Device Flow" lets
  anyone start a SymphonyBoard code and talk a person into typing it. The suite serves the script
  from `SITE` with the switch on for every check of the code way and off for K17, whatever the
  site ships, as app.test.mjs serves it with a mutant's pairs. The app is played by
  navigator.standalone, as iOS gives an installed page, and by the display mode standalone, as an
  install through the manifest reports itself (K26); the page asks no faster than the interval
  named, so the checks wait in real time (about seven minutes). K1: in a browser, a second
  button after Sign in with GitHub, none on an unconfigured page, the same on the cost page. K2
  and K3: in the app the one button shows the code, asks at the pace named and signs in for the
  tab, or kept on the browser; the service names seven seconds in K2, above the page's floor of
  five, so a page that asks at its floor whatever is named fails it. K4 and K5: slow_down's
  longer interval, the service's own limit asked again more slowly, and a moment out of reach
  asked again at the same pace, neither faster nor slower. K6 to K9: GitHub's expired_token and
  access_denied, an App with Device Flow unticked, a service with no device routes yet, and an
  answer with no code, each ending with words and the token box. K10 to K13: Cancel with an
  answer on its way, a token that arrives after Cancel, a new code after Cancel, and the
  browser's two ways. K14: the link that copies the code and opens GitHub's page. K15: the cost
  page. K16: a code that runs out at the time named though GitHub never says so. K17 to K29 hold
  what the adversarial review of the branch found that day. K17: the switch off, as the site
  ships it: in a browser and in the app, iOS's and the manifest's, on both pages, no code offered,
  the redirect's words, no code among what the page lists as sent, and the app's press leaving
  for GitHub's page and coming back signed in with nothing asked of /device. K18: a token pasted
  while a code is up ends the code once GitHub accepts it, before GitHub has named it, so its
  token never takes the paste's place, and Forget after it leaves the gate free and nothing signs
  the page in again. K19: the panel opening by a kept sign-in found at load, in the app, or by
  GitHub's return, in a browser, ends a code started while it opened, with its words: GitHub's
  return on the control page and on the cost page with the code up, and with the ask for a code
  still out, each leave neither the code's words nor "Asking GitHub for a code..." on the panel. K20: Forget
  pressed at the gate while a code is up, as a browser that reads no :has() shows it there, ends
  the code. K21: Keep me signed in read when the token comes, ticked or unticked while the code is
  up. K22: a token that comes after Cancel, or after a paste took the page, revoked through
  /revoke. K23: the gate's words, the code's way in the app on both pages and the redirect's in a
  browser, and the code's requests named in "What this page keeps and sends". K24: the code and
  Copy it and open GitHub in sight on a 390 x 844 phone, clear of the status line, on both pages,
  and a keyboard's focus carried on to the box and back to the button after Cancel. K25: on the
  cost page, whose own line stands above the sign-in box, how the code ended said under the box
  too, in sight on a phone. K26: the app installed through the manifest. K27: a pace under five
  seconds named, and the floor of five kept. K28: the warning beside the code, to type it only on
  github.com/login/device and only a code this page started, with GitHub naming SymphonyBoard
  there. K29: the site ships the switch off, read from the script as `SITE` holds it before the
  suite turns it either way, since nothing else in any suite would see a pull request that turns
  it on; the owner's pull request that turns it on comes with one here that turns K29 round
  (signin/README.md, step 9). GitHub's 5xx and 429 while the person types the code are the
  service's to answer, as github_unreachable, which K5 holds the page asks again at the same
  pace; test_worker.mjs holds the service's side.
- `e2e2/mutants/`: 537 mutants. Each `.json` is a list of [text, replacement] pairs applied to
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
  p19, below, went for the same reason. From the zoom's review, against site branch
  claude/dependencies-zoom on 2026-10-19, twenty-seven more, g156 to g182, each caught: the page
  never held on a phone (BL, AV) and a phone's turn leaving the window where it was (BL); Escape
  deaf inside the help, and the help never paged (BM); the list at its own width alone with no
  cards, and the list no stage, never zoomed nor joined by a finger on its card (BN); the focus's
  card never fitted, its title before its link, the floating tools' room ignored, and its
  neighbours named as words (BO); the mouse's double click as quick as a finger's, a wheel's lines
  counted as pixels, a right click opening a focus, and Ctrl with + zooming the chart (BP); one
  layout only, and a focus never grown (BQ, BB); no pan after a pinch, two taps apart taken for a
  double tap, the state line deaf to a tap, a tile pressed from a focus keeping it, and a finger's
  mark kept once the stage lets the keyboard go (BR); All's cells of any size (BS); a focus drawn
  again each time, the farther of two neighbours the same way, the tiles' swipe pressing the tile
  it ends on, and a resize leaving a zoomed chart off its edges (BU); and the stage's hold of the
  pointer put off to its first move again (AM). Seventeen were rewritten for the review, their
  text having moved: g56 and g96 (the restyle, now made once for every chart, so g96 leaves the
  Board's charts unrestyled by the layout they never turn to), g113 (the clamp, which now centres
  too), g124 (the focus's bound, beside its floor), g126 (the swipe's step), g128 (Whole chart,
  now the list's too), g129 (All's grid, now of the page shown), g130 (a press under All), g133
  (the list's fit, now the stage's), g136 (a chart's bound), g141 (a finger's double tap, now
  AI's, since the mouse's double click is the browser's own), g143 and g144 (the resize, now
  against the fit its floor sets; g144 is caught by AI's window made smaller again), g148 (the
  card's +), g152 (the tiles' swipe, a turn now shared with the help) and g155 (a lone node's
  words). One was retired: g146 (All's cell heading guessed at 34 px), since All's cells now have a
  least size and come in pages, so the heading's height chose another grid at none of 56 screens
  and text sizes tried (1280 x 800, 1366 x 768, 1440 x 900 and 1920 x 1080, 100% to 170%, six and
  twelve epics), where no check can see it. The stylesheet's part of the zoom, which no mutant of the
  script reaches, is proved by the twenty-five changed copies of assets/css/control.css under
  `e2e2/styles/`, each a `.json` of pairs that `CSSEDIT` applies, with its `.only` and `.suite`, run
  by the same runner and each seen failing its check: the tiles (s01) or the card's heading (s02)
  keeping their room from a focus on a phone (BB), the focus's title cut at two lines on a short
  tab, as the zoom's branch had it (s03, BB), the stage left to scroll, which Page Down then scrolls
  (s04, AZ), the stage left to the browser's own touch handling, whose pinch zooms the page (s05,
  BA), the tab's box no longer held to the deck (s06, AV), one button size on every screen (s07, AW),
  the key never folded (s08, BI), the card's heading kept on a short tab (s09, AV) and the focus's
  fade where less motion is asked (s10, BJ; the script itself sets no glide then, so the fade is
  the stylesheet's own part); and from the zoom's review, s11 to s22: the body left to scroll on a
  phone (BL, AV), the tab's touch left to the browser (BL), the site's header kept on a phone held
  sideways (BL; since the merge with the bar that hides itself, s13 drops the bar's own hiding,
  which now keeps the header off the held page, the rule it first took away having gone), a
  finger's ring drawn round the stage (BR), a card's heading unclamped (BT), the short tiles'
  number unsaid (BT), the help's head left sticky over it (BM), the list's zoom hidden
  (BN), a short tab's full tiles on one row (BL), the focus's card unbounded under the stage (BO),
  the cards in one column (BN) and the arrows' words kept out of sight from the keyboard (BO); s03
  was rewritten as the short form's focus title cut to one line whatever its room (BB), since the
  rule it changed is gone. m7 (E5's 404 unsaid) was already STALE before the zoom, its text gone
  from the script, and is left as it was. From the merge with site pull request #93, against site
  branch claude/dependencies-zoom on 2026-10-19, eight more, g183 to g190, each caught: the held
  page keeping room for a bar that floats over it (BV); the foot left only the stage's 180 px while
  the tab is shown, a sized foot not held when the tab opens, no least for the tab on a computer,
  and a phone's least counting the tab and not the rail above it (BW); Escape in the bar heard
  by the tab too, Escape outside it taken by the bar after the tab took it, and the bar hearing it
  before the tab (BX); and three more changed stylesheets: the header given up again on a sideways
  phone, so its handle goes with it (s23, BV), a sized foot's message held to one row (s24, BW),
  and the held page left to the browser's scroll anchoring, which carries the rail off the window's
  top after a turn (s25, BV). Three were aimed again at the text the merge left: p44 (the foot's
  room unkept, now the least the tab asks, P29), p57 (Escape ignored, now in both of the bar's
  listeners, P34) and s13 (above); g111 (the stage's resize unwatched) now names BY too. Seven got
  past their checks on the merge and are caught again by the stricter checks above: g116 (the wheel
  about the stage's middle, AY), whose node the merged deck put at the middle across, g157 (a
  phone's turn leaving the window where it was, BL), g33 (the window not put back after a press
  crosses tabs, D) and g78 (a drag that comes back to where it began taken for a press, AM), and
  three that got past them at the zoom's own heads too, before the merge: s04 (the stage left to scroll,
  AZ), which the stage's listener putting back a scroll hid, s09 (the card's heading kept on a short
  tab, AV), whose stage now fits its chart either way, and s05 (BA), aimed now at both rules that
  keep a finger's touch for the stage, its own and the tab's, since the tab's, from the zoom's
  review, holds every stage in it alone and the Board's stage sets its own.
  The 58 of the Folders tab (`f*`, each with a `.json.suite` naming
  folders.test.mjs) were caught against site branch claude/folders-explorer on 2026-10-18, the first
  48 also against the site's script at commit 044b8b3, f06 rewritten for the explorer's name cell;
  f56 to f63, the saved catalog's, were retired with it on 2026-10-20, and f64 to f66 (the catalog
  read again, the catalog offered in words, the explorer narrowed) and f45 with the steps' new
  names were caught against site branch claude/folders-native that day (NC3 is held by the check
  alone, since the dialog is markup no line of the script carries).
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
  of the script reaches). The nine of Make private (n40 to n48: no confirmation, the catalog's
  repository changed in place of the notebook's, the change not recorded, the lock kept after the answer or past a sign-out, the button for a person who does not
  administer, the access words for a rate limit, the answer ignored, and an internal repository told
  as a public one) were caught against site branch claude/make-private at 7d3255f on 2026-10-19.
  The eleven from its review (n49 to n59: the lock tied to no sign-in, a button drawn again live and
  its press let through, the waiting unsaid, a late answer freeing a later change's lock, a
  Refresh's repository not read again, an answer recorded under another owner, the freed lock not
  drawn, the access words for a 422 alone, a SymphonyBoard sign-in told of a token, a person who
  does not administer told to press here, and what a public repository loses on a free plan
  unsaid) were caught against site branch claude/make-private at 2901ee5 on 2026-10-19, where n11,
  which Make private's nb.admin had left stale, was brought up to nbForget as it stands and caught
  again (N12), and n31, whose text Make private's own refusal had come to match first, was aimed at
  the write's refusal again and caught again (N21); all 59 of the Notebooks tab are caught there.
  With site pull requests #90 and #91 merged into that branch at b9c9674 the same day, m51 and m63
  (H10, I10) were aimed at the https:// address the classic tokens' page is now written with, and
  p11 (P4) at the note now drawn with its addresses as links, and all three were caught again.
  The two of the Home Screen app (`h*`, each naming app.test.mjs, for H8: the button offered where
  the browser has no full screen call, and only the standard call looked for, which would hide it
  from Safari before 16.4) were caught against site branch claude/home-screen-app at 79d4b83 on
  2026-10-19, after its adversarial review, where app.test.mjs, signin.test.mjs, panel.test.mjs and
  hostile.test.mjs pass whole; H1 to H7 hold the build's head and the stylesheet, which no mutant of
  the script reaches.
  The 31 of the foot and the bar (p41 to p71, for P25 to P38) were caught against site branch
  claude/panel-resize-autohide at 2d22660 on 2026-10-19, that branch's work with master merged in,
  where every other suite passes too: the foot's grip never drawn or dragged the wrong way (P25);
  the foot's bounds unheld, the stage's 180 px unkept, a phone's least foot without its buttons, and
  the Ask Claude bar's growth unwatched (P29); a window made shorter not taking the foot down, and a
  kept size read whatever its value (P28); a sized foot never marked as sized (P31); the drag's scale
  taken from the saved text size, which a phone does not use (P30); the bar never set to hide, its
  hot strip never drawn, and a strip that takes the pointer a browser makes up as the page loads
  (P32); the bar never shown, gone at once, gone under the pointer or from a section strip, and deaf
  to a pointer leaving across the top (P33); the focus ignored, Escape ignored, and Escape leaving the
  focus in the hidden bar (P34); and the handle never drawn, its tap or its swipe dead, a tap outside
  ignored, a touch's bar kept for good, the open menu not holding the bar or left open after it, a
  touch in the bar not starting the wait again, its aria-expanded unsaid, and every pointer taken for
  one that hovers (P35).
  The 12 from that branch's adversarial review (p72 to p83) were caught against it at 41217a9 on
  2026-10-19, where every suite passes: a phone's room for the foot taken from the text size a
  computer saved, which a phone does not apply (P29); the blur that sends the focus out of the bar
  as it hides, removed, which leaves the focus in the hidden bar after a grip's press (P42, as p73)
  and after Escape (P34, as p58, aimed again at that line, since hideBar now does for every way the
  bar goes what Escape did for itself); a drag with a button held, and a pointer leaving across the
  top just after one, bringing the bar (P41); the page left where it is while the grip is dragged,
  and the page scrolled by a glide that catches the pointer up only once the drag is over (P43); the
  hover asked of the main pointer alone (P45); the grips' sizes unsaid, and a grip the script draws
  later unsaid when it takes the focus (P48); the strip's pointerleave dead, and a pointer leaving by
  a side taken for one leaving across the top (P33); and every focus in the bar holding it, a tap's
  too (P35). p43, whose text the new sayGrips matched first, was aimed again at sizeWithin's line,
  and caught again (P29). m7_no404 reports STALE: its text left the script before this branch, on
  master as here.
  The 48 of sign-in by code (`k*`, each naming code.test.mjs) were caught against site branch
  claude/sign-in-by-code at 201a419 on 2026-10-19, with the switch turned on by the suite as it
  serves the script. k01 to k30 came with the code way (two were written and dropped as
  equivalent, the turn checked again when a refusal comes back after Cancel and the timer cleared
  by Cancel, since the ask itself checks the turn before it sends anything, so neither leaves a
  request a check could see; k11 and k29 are those two). k31 to k48 came with the fixes of the
  adversarial review the same day: the switch off still offering a code, or the app's press still
  taking it (K17); a paste, the panel opening, or Forget leaving a code asking (K18 to K20); Keep
  me signed in read at the press (K21); a late token left alive (K22); the gate's words for the
  app shown in a browser, and the code's requests left out of what the page sends (K23); the box
  out of sight on a phone, a keyboard's focus dropped or left on a hidden button (K24); the cost
  page's words unseen under its box (K25); the manifest's display mode not read (K26); no floor
  under the pace named (K27); no warning beside the code (K28); the pace the service names
  ignored, and a moment out of reach asked more slowly (K2, K5). k03, k12, k13 and k15 were
  pointed again at the checks that hold them since the words and the box changed: k03 at K2,
  k12 at K11, k13 at K10 and k15 at K6. The service's side, GitHub's 5xx and 429 as
  github_unreachable, is test_worker.mjs's, whose test failed with the line removed and with the
  refusal's own words no longer kept, each tried by hand. k49 and k50 came with the second
  review of those fixes the same day: GitHub's return ending the code in storeSignin and leaving
  its words on the signed-in panel (K19, whose case of GitHub's return checked the box and the asks
  but not the words, and each of its three cases of GitHub's return catches it alone), and the
  site shipping the switch on (K29); k33, whose line in storeSignin that fix rewrote, was aimed
  at it as it now reads and caught again (K18).
- `e2e2/css-mutants/`: 28 lists of pairs for the stylesheet control.css, each with its `.json.only`,
  for the part of the foot and the bar that is the stylesheet's, which no mutant of the script
  reaches; `run-mutants.sh` serves a path under css-mutants/ in place of control.css through
  `CSS_MUTANT`. Each was caught by its check against the same branch the same day: the page keeping
  the bar's padding over the deck, the bar never hidden, the phone's section strip standing in the
  page or never hidden, the handle under the Home Screen app's top inset (P32); the bar see-through
  over the deck and the hot strip never shown (P33); the handle never shown (P35); full screen
  leaving the strip and the handle (P36); the bar sliding where less motion is asked (P37); a sized
  foot not held to its size and its message box held to the usual cap (P31); a phone's sized foot
  not laid out as message over buttons (P29); and the phone's grip too thin for a thumb, no room
  kept for it at the foot's top, so that it lies over the message's words, the grips scrolling the
  page under a finger, and the grip's quiet bar not drawn (P26 and P25; c15, whose rule the review's
  fix rewrote, aimed again at it as it now reads). The 11 from the branch's adversarial review (c18
  to c28) were caught against it at 41217a9 the same day: the foot's grip back over the buttons'
  top edge (P39); the deck short of the window until the script sets its height, so it jumps as the
  page loads (P40); a phone's deck no taller than its tab, so the foot stands above the window's
  bottom (P43); a phone's grip the foot's whole width, so a thumb beside it sizes the foot (P44);
  the strip along the top drawn only where the main pointer hovers (P45); the handle's tab smaller
  than its press area (P46); a tablet's grip too thin for a thumb, no room kept for it at the foot's
  top, and the tablet's placeholder left above a message's line (P47); the handle letting the page
  pan under a swipe (P35); and the phone's placeholder left under the grip's bar (P26).
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
     `CSS_MUTANT=css-mutants/c02_bar_never_hidden.json` the checks of signin.test.mjs against that
     stylesheet, and `CSSEDIT=styles/s01_near_keeps_tiles.json` the graph suite against its
     changed stylesheet.
   - `e2e2/run-mutants.sh` expects a server already on port 8077, or on the address `BASE`
     names, and reports each mutant as KILLED, SURVIVED, STALE or ERROR; name mutants to run only
     those, by their paths from e2e2/ (`bash run-mutants.sh mutants/g*.json styles/*.json` there
     runs the Dependencies tab's and its stylesheet's, `mutants/f*.json` the Folders tab's,
     `mutants/n*.json` the Notebooks tab's, `mutants/h*.json` the Home Screen app's,
     `mutants/k*.json` sign-in by code's, `css-mutants/*.json` the foot's and the bar's
     stylesheet's, with `SITE` set as for the checks); named none, it runs every one under
     mutants/, css-mutants/ and styles/, each served the way its folder says.

The site sets the two constants to the live service and SymphonyBoard's Client ID (site pull
request #24). The checks set them for themselves, whatever the shipped script holds: the
configured page gets the mocked service and `Iv1.testclient`, and the unconfigured page, which the
pasted-token checks of `hostile.test.mjs` and `panel.test.mjs` use, gets both emptied. A third
constant beside them, `CODE_SIGNIN`, switches sign-in by code on; the site ships it false, and
`code.test.mjs` serves it true for the checks of the code way and false for K17, whatever the
shipped script holds, while the other suites leave it as shipped. `SITE`
names the site's checkout for every check file and for `run-suite.sh`.
