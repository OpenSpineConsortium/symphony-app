// Checks of the control panel's Dependencies section (site branch claude/graph-section, 2026-10-18)
// against a mocked GitHub API: the chart text the page builds from GitHub's REST objects, byte for
// byte the two blocks the protocol's board writes for the same state (symphony-protocol
// tests/fixtures/board-epics.json and board-epics-STATE.md at fea34c6, copied below), the reads it
// makes and the ones it never makes, the vendored Mermaid loaded from the site only when there is a
// chart and drawing both charts with their nodes and classes, a node pressed centring the task's
// row, the tables alone when the drawing script cannot load, a hostile title inert, each stop said
// in words with nothing half drawn (a 403, a 429, the cap, the rate limit's reserve), nothing drawn
// without an epic, a Refresh redrawing the new count, a goal listed with the epics and not as an
// other issue, a repository switched mid-load, a second page of sub-issues read and counted, pull
// requests and another repository's issues left out, a deleted issue read as none, the repository's
// record unread, a repository renamed, a claim shown by its pull request, one chart that cannot be
// drawn, the board's own charts drawn in the Board box, the last repository taken off the list and
// an open list cut short. Each check states what the page promises; a FAIL is a defect. Every token
// is a stand-in.
//
// The mutants that prove the checks bite are e2e2/mutants/g*.json, each with the checks that must
// catch it (.only) and this file named as its suite (.suite); e2e2/run-mutants.sh runs them.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(script.includes(a), 'mutant text not found: ' + a.slice(0, 60)); script = script.replace(a, b); }
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
const FIXTURE_COMMIT = 'fea34c6';
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
// the mocked API records every call; a route may be a function of the url, the request, the record
// and the route itself, may answer later (delayMs), and answers 204 and 304 with no body; the
// drawing script is served from the site unless a check routes it (opts.extraRoutes); every request
// the page makes, the dialogs it opens and the pages it opens are recorded
async function open(routes, opts) {
  opts = opts || {};
  const served = opts.constants ? withConstants(script, opts.constants) : script;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
async function signIn(page) {
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
}
const stateText = (page) => page.textContent('#cp-graph-state');
const waitGraph = (page, re, timeout) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('cp-graph-state').textContent), re.source, { timeout: timeout || 8000 });
const vendorLoads = (requests) => requests.filter((u) => /\/assets\/js\/vendor\/mermaid\.min\.js/.test(u)).length;
const headings = (page) => page.$$eval('#cp-graph h3', (hs) => hs.map((h) => h.textContent));

// the fenced Mermaid blocks of a board's text, the fences dropped
const mermaidBlocks = (text) => [...text.matchAll(/^```mermaid\n([\s\S]*?)\n```$/gm)].map((m) => m[1]);
if (process.env.SYMPHONY_PROTOCOL) {
  await check('A0: the pasted blocks are the library fixture\'s own, as the checkout named holds them', async () => {
    const golden = fs.readFileSync(process.env.SYMPHONY_PROTOCOL + '/tests/fixtures/board-epics-STATE.md', 'utf8');
    assert.deepEqual(mermaidBlocks(golden), [GOALS_TEXT, EPIC_20_TEXT], 'the library\'s fixture moved since ' + FIXTURE_COMMIT + ': paste its blocks again');
  });
} else console.log('SKIP A0: SYMPHONY_PROTOCOL names no checkout of symphony-protocol; the pasted blocks are from ' + FIXTURE_COMMIT);

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

await check('C: the vendored Mermaid, loaded once from the site, draws both charts with their nodes and classes', async () => {
  const { context, page, errors, requests } = await open(fixtureRoutes(fixture()));
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  const svgs = await page.$$eval('#cp-graph .control__chart svg', (list) => list.map((svg) => ({
    nodes: Array.from(svg.querySelectorAll('g.node')).map((g) => ({ id: g.id, classes: g.getAttribute('class'), text: g.textContent.trim() })),
    edges: svg.querySelectorAll('.edgePaths path').length,
    minWidth: svg.style.minWidth,
  })));
  console.log('     vendor loads:', vendorLoads(requests), '| charts:', svgs.length, '| nodes:', svgs.map((s) => s.nodes.length).join(','), '| first node:', JSON.stringify(svgs[0] && svgs[0].nodes[0]));
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
  assert.deepEqual(errors, []);
  await context.close();
});

await check('D: a node pressed centres and marks the task\'s row in the tables above, and opens nothing', async () => {
  const { context, page, errors, opened } = await open(fixtureRoutes(fixture()));
  await signIn(page);
  await page.waitForSelector('#cp-graph svg', { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  await page.evaluate(() => { window.__scrolled.length = 0; });
  await page.click('#cp-graph g.node[id*="-flowchart-i22-"]');
  await page.waitForSelector('#cp-claimed tr[data-number="22"].control__focus', { timeout: 8000 });
  const said = await page.textContent('#cp-graph-said');
  const scrolled = await page.evaluate(() => window.__scrolled);
  console.log('     said:', said, '| scrolled:', JSON.stringify(scrolled), '| pages:', context.pages().length);
  assert.equal(said, 'Focused #22 (under Claimed).');
  assert.ok(scrolled.some((s) => /^TR:#22/.test(s)), 'the row was not centred: ' + JSON.stringify(scrolled));
  await sleep(800);
  assert.deepEqual(opened.map((p) => p.url()), []);
  assert.equal(context.pages().length, 1);
  assert.equal(await page.$$eval('#cp-app tr.control__focus', (rows) => rows.length), 1);
  // Centre its row, the button under the chart, does the same for a browsing Claude
  await page.click('#cp-graph tr:has(a[href$="/issues/23"]) button');
  await page.waitForFunction(() => /#23/.test(document.getElementById('cp-graph-said').textContent), null, { timeout: 8000 });
  console.log('     said after Centre its row:', await page.textContent('#cp-graph-said'), '| focused rows:', JSON.stringify(await page.$$eval('#cp-app tr.control__focus', (rows) => rows.map((r) => r.closest('table').id + ':' + r.getAttribute('data-number')))));
  assert.equal(await page.textContent('#cp-graph-said'), 'Focused #23 (under Queue).');
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

// Mermaid looks for a directive, %%{ ... }%%, anywhere in the text before it reads the entities, so a
// "%" goes as an entity too, the one the board does not write yet (the page's graphLabel): one title
// opening a directive, one holding a whole one, and a pair that opens one and closes it in a later
// node, each of which broke the chart or erased what lay between before.
const PERCENT_TITLES = { 43: '%%{init:{ broken', 44: '%%{init:{"theme":"dark"}}%% x', 45: 'Opens %%{init', 46: 'closes it }%% later' };
await check('F: a hostile title is drawn as text, makes no element, runs nothing and fetches nothing', async () => {
  const f = fixture();
  const hostile = '<img src=x onerror=alert(1)> "] <script>alert(2)</script> and more';
  const i42 = issue(42, hostile, ['todo']);
  const percent = Object.entries(PERCENT_TITLES).map(([n, title]) => issue(Number(n), title, ['todo']));
  f.open.push(issue(41, 'An epic " with a quote', ['epic'], subs(0, 5)), i42, ...percent);
  f.subIssues[41] = [i42, ...percent];
  const { context, page, errors, requests, dialogs } = await open(fixtureRoutes(f));
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
  assert.deepEqual((await headings(page)).slice(-1), ['Epic #41: An epic " with a quote (0/5)']);
  // every chart drawn, and each "%" title shown whole in its node
  assert.equal(await page.$$eval('#cp-graph .control__chart svg', (l) => l.length), 3);
  for (const [n, title] of Object.entries(PERCENT_TITLES)) {
    const text = await page.$eval('#cp-graph g.node[id*="-flowchart-i' + n + '-"]', (g) => g.textContent.trim());
    assert.equal(text, '#' + n + ' ' + title);
  }
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
  console.log('     repo:', await page.textContent('#cp-repo-name'), '| state:', state.slice(0, 60), '| graph text:', JSON.stringify(text.slice(0, 60)), '| demo reads after the switch:', dependencyReads(calls).filter((k) => /acme\/demo/.test(k)).length);
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
  assert.equal(state, 'Not drawn: GitHub says this token has 99 calls left this hour, and the page keeps the last 100 for its other sections; stopped at the issues blocking #22. Press Refresh once GitHub\'s hourly limit has reset.');
  assert.deepEqual(dependencyReads(calls), EXPECTED_READS.slice(0, 1));
  assert.equal(await page.$$eval('#cp-graph > *', (l) => l.length), 0);
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

await check('N: a repository whose record cannot be read leaves the section saying so, never reading', async () => {
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
  // the pull requests answer after the reads of the section, so the chart is drawn only once they are in
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

await check('R: the board\'s own charts are drawn in the Board box, never shown as text, and a node there centres its row', async () => {
  const routes = fixtureRoutes(fixture());
  const withCharts = board + '\n## Dependencies\n\nEach open epic\'s tasks as GitHub\'s sub-issues and blocked-by relations hold them.\n\n### Goals\n\n```mermaid\n' + GOALS_TEXT + '\n```\n\n### Epic #20: Draw the board (1/3)\n\n```mermaid\n' + EPIC_20_TEXT + '\n```\n';
  routes['GET /repos/acme/demo/contents/STATE.md'] = { encoding: 'base64', content: b64(withCharts) };
  const { context, page, errors, requests } = await open(routes);
  await signIn(page);
  await page.waitForFunction(() => document.querySelectorAll('#cp-board .control__chart svg').length === 2, null, { timeout: 15000 });
  await waitGraph(page, /^Drawn from 4 reads/, 15000);
  // the box's words, the drawn pictures left out, whose own styles name their classes
  const text = await page.$eval('#cp-board', (box) => { const copy = box.cloneNode(true); copy.querySelectorAll('svg').forEach((svg) => svg.remove()); return copy.textContent; });
  console.log('     board charts:', await page.$$eval('#cp-board .control__chart svg', (l) => l.length), '| raw text shown:', /flowchart|classDef/.test(text), '| vendor loads:', vendorLoads(requests));
  assert.ok(!/flowchart|classDef|==>/.test(text), 'the board box shows chart text: ' + text.slice(0, 200));
  assert.equal(await page.$$eval('#cp-board pre', (l) => l.length), 0);
  assert.deepEqual(await page.$$eval('#cp-board h4, #cp-board h3', (hs) => hs.map((h) => h.textContent)).then((hs) => hs.filter((h) => /Goals|Epic/.test(h))), ['Goals', 'Epic #20: Draw the board (1/3)']);
  assert.equal(vendorLoads(requests), 1);
  await page.click('#cp-board g.node[id*="-flowchart-i22-"]');
  await page.waitForSelector('#cp-claimed tr[data-number="22"].control__focus', { timeout: 8000 });
  assert.equal(await page.textContent('#cp-graph-said'), 'Focused #22 (under Claimed).');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S: the page says there is nothing to draw while no repository is chosen, before signing in and after the last one is taken off the list', async () => {
  const { context, page, errors } = await open(fixtureRoutes(fixture()), { extraRoutes: [stubRoute] });
  assert.equal(await stateText(page), 'Nothing to draw yet: no repository is chosen.');
  await signIn(page);
  await waitGraph(page, /^Drawn from 4 reads/);
  await page.click('#cp-forget-repo');
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
  assert.equal(state, 'Drawn from 4 reads of GitHub: 1 goal and 1 epic with sub-issues. A node\'s shade is its state; click one to centre its row in the tasks above. Only the first 500 open issues were read, so an epic or goal beyond them is not drawn.');
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
