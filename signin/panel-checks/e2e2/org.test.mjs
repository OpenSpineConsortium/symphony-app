// Checks of the control panel's Organization tab (site branch claude/project-thread-bg380j,
// 2026-10-30, the owner's ask of 2026-10-29 read again: an organizational dependency tab, the
// Dependencies tab's chart over every repository of the organization from GitHub's own sub-issue
// and blocked-by links, no map file) against a mocked GitHub API: a tab of its own in the
// console's rail after Dependencies, with its ARIA; the words it says once it has listed the
// owner's repositories and read each one's open issues, the sub-issues of every open goal and
// epic and the blockers of each epic's tasks; the reads it makes, in order, the open repository
// first, and the ones it never makes (an archived repository, one with nothing open, a blocked
// issue under no epic, a write); the chart text it hands the drawing library, byte for byte, a box
// per repository, a box per epic, the goals above their epics, the blockers' arrows and the five
// state classes; the chips that cut the chart to one repository or one goal or epic, flipped in
// place; the tables of goals and epics, of links that cross repositories and of repositories; a
// node pressed naming its issue; the cap of a press and Read more, the rate limit's reserve, a
// listing GitHub refuses, a read that fails, a list cut at its pages, a hostile title, a Refresh
// reading again, a tab left and opened again reading nothing more and one reopened while the
// listing is in flight, a record that cannot be read, and a person's own repositories listed under
// the viewer. Each check states what the page promises; a FAIL is a defect. Every token is a
// stand-in.
//
// The console shows one tab at a time, so each check opens the Organization tab by its rail button,
// as graph.test.mjs opens the Dependencies tab, and console-tabs.mjs opens any other tab a press
// names. The window is a laptop's, 1366 x 657.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

// the shipped script with its two sign-in constants emptied, so the page shows the pasted token
let script = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(script.includes(a), 'mutant text not found: ' + a.slice(0, 60)); script = script.replace(a, () => b); }
script = script.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");

const resp = (status, body, extra) => Object.assign({ __r: true, status, body }, extra || {});
const VENDOR = '**/assets/js/vendor/mermaid.min.js*';
// a stand-in for the drawing library that records the text it is handed and draws nothing
const STUB = "window.mermaid = { initialize: function (c) { window.__init = c; }, render: function (id, text) { (window.__charts = window.__charts || []).push(text); return Promise.resolve({ svg: '<svg data-stub=\"1\"></svg>' }); } };";
const stubRoute = [VENDOR, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: STUB })];
const EXPOSE = 'ETag, Link, X-RateLimit-Remaining';

// GitHub's REST objects: an issue of a repository, the two summaries, a repository as a listing gives it
function issueOf(repo, n, title, labels, extra) {
  return Object.assign({
    number: n, title, state: 'open', html_url: 'https://github.com/' + repo + '/issues/' + n, repository_url: 'https://api.github.com/repos/' + repo,
    labels: labels.map((name) => ({ name })), updated_at: now,
  }, extra || {});
}
const deps = (blocked_by, total_blocked_by) => ({ issue_dependencies_summary: { blocked_by, blocking: 0, total_blocked_by, total_blocking: 0 } });
const subs = (completed, total) => ({ sub_issues_summary: { total, completed, percent_completed: total ? Math.round(100 * completed / total) : 0 } });
function record(name, extra) {
  return Object.assign({
    id: 1000 + name.length, name, full_name: 'acme/' + name, html_url: 'https://github.com/acme/' + name, private: false, visibility: 'public', fork: false, archived: false,
    open_issues_count: 2, pushed_at: now, default_branch: 'main', owner: { login: 'acme', id: 77, type: 'Organization' },
  }, extra || {});
}
const owner = { id: 77, login: 'acme', type: 'Organization' };
const board = '# Board\n\nAs of commit 0123abc on main. Rewritten by .github/workflows/board.yml; do not edit by hand.\n\n## Claims (open claude/<issue> branches and docs/agents/claims/<issue>.md)\n\n| Issue | Branch | Worker | PR | Files it touches |\n| --- | --- | --- | --- | --- |\n';
// the organization: four repositories listed, the open one first in the reads, then lib and secret
// by GitHub's order, extra archived and never read
const LISTED = [record('lib', { open_issues_count: 5 }), record('demo'), record('secret', { private: true, visibility: 'private', open_issues_count: 1 }), record('extra', { archived: true, open_issues_count: 3 })];
// the issues: in demo a goal (#1) whose epics are #20 here and lib#30, the epic #20 with a closed
// task, an open task blocked from secret and a task in lib, a blocked issue under no epic (#24),
// whose blockers no read brings, and a plain one; in lib the epic #30 with two tasks, one blocked
// by lib#9, and the task #5 that demo's epic holds; in secret one plain issue, its closed #7 met
// only as a blocker
function fixture() {
  const demo = (n, t, l, x) => issueOf('acme/demo', n, t, l, x), lib = (n, t, l, x) => issueOf('acme/lib', n, t, l, x), secret = (n, t, l, x) => issueOf('acme/secret', n, t, l, x);
  const i1 = demo(1, 'Ship the console', ['goal'], subs(1, 2));
  const i20 = demo(20, 'Draw the board', ['epic'], Object.assign(subs(1, 3), deps(0, 0)));
  const i21 = demo(21, 'Read the summary', ['todo'], { state: 'closed' });
  const i22 = demo(22, 'Render the section', ['todo'], deps(1, 1));
  const i24 = demo(24, 'Write the docs', ['todo'], deps(1, 1));
  const i99 = demo(99, 'Settle the colours', ['todo']);
  const l5 = lib(5, 'Cut the library', ['todo'], deps(0, 0));
  const l9 = lib(9, 'Release the library', []);
  const l30 = lib(30, 'Cut the library', ['epic'], subs(0, 2));
  const l31 = lib(31, 'Split the modules', ['todo']);
  const l32 = lib(32, 'Tag the release', ['todo'], deps(1, 1));
  const s7 = secret(7, 'Keep the record', [], { state: 'closed' });
  const s8 = secret(8, 'Rotate the key', ['todo']);
  return {
    open: { 'acme/demo': [i1, i20, i22, i24, i99], 'acme/lib': [l5, l9, l30, l31, l32], 'acme/secret': [s8] },
    subIssues: { 'acme/demo#1': [i20, l30], 'acme/demo#20': [i21, i22, l5], 'acme/lib#30': [l31, l32] },
    blockedBy: { 'acme/demo#22': [s7], 'acme/lib#32': [l9], 'acme/demo#24': [l9] },
  };
}
// the routes of the open repository, the console's own reads, and the organization's
function routesOf(f, opts) {
  opts = opts || {};
  const routes = {
    'GET /user': { login: 'tester' },
    'GET /repos/acme/demo': { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner },
    'GET /repos/acme/demo/contents/STATE.md': { encoding: 'base64', content: b64(board) },
    'GET /repos/acme/demo/branches/board': { commit: { commit: { committer: { date: now } } } },
    'GET /repos/acme/demo/contents/.github/symphony/workers': [],
    'GET /repos/acme/demo/actions/runs': { workflow_runs: [] },
    'GET /repos/acme/demo/pulls': [],
    'GET /orgs/acme/repos': 'listed' in opts ? opts.listed : LISTED,
  };
  for (const repo of Object.keys(f.open)) routes['GET /repos/' + repo + '/issues'] = f.open[repo];
  for (const k of Object.keys(f.subIssues)) routes['GET /repos/' + k.replace('#', '/issues/') + '/sub_issues'] = f.subIssues[k];
  for (const k of Object.keys(f.blockedBy)) routes['GET /repos/' + k.replace('#', '/issues/') + '/dependencies/blocked_by'] = f.blockedBy[k];
  return routes;
}
// the tab's own reads, in order: the listing, each repository's issues, the sub-issues, the blockers
const orgReads = (calls) => calls.filter((c) => /\/orgs\/|\/user\/repos|\/users\/|\/issues(\?|$)|\/sub_issues|\/blocked_by/.test(c.url)).map((c) => c.key.replace(/^GET \/(repos\/)?/, '').replace('/dependencies/blocked_by', ' blockers').replace('/sub_issues', ' subs').replace('/issues/', '#').replace(/\/issues$/, ' issues'));
const writes = (calls) => calls.filter((c) => !/^GET /.test(c.key)).map((c) => c.key);

let current = [], mark = 0;
const browser = await chromium.launch();
await consoleTabs(browser);
const VIEW = { width: 1366, height: 657 };
// the mocked API records every call; a route may be a function of the url, the request, the record
// and the route itself, and answers 204 and 304 with no body; the drawing script is served from the
// site unless a check routes it (opts.extraRoutes)
async function open(routes, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: opts.viewport || VIEW });
  await legacyHome(context);
  const calls = [];
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    const sent = req.headers();
    const call = { key, url: req.url(), auth: sent['authorization'], at: Date.now() };
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
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  if (opts.extraRoutes) for (const [pattern, handler] of opts.extraRoutes) await context.route(pattern, handler);
  current = calls;
  mark = 0;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/symphony/control/', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(BASE + (opts.path || '/symphony/control/?repo=acme/demo'), { waitUntil: 'load' });
  return { context, page, calls, errors };
}
// signs in with the pasted token, waits for the console's own Dependencies draw of the open
// repository to end, since its reads of the same issues would otherwise mix with the tab's, marks
// where the tab's reads begin, and opens the tab named, the Organization tab unless told otherwise
async function signIn(page, tab) {
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  await drawDone(page);
  mark = current.length;
  if (tab !== null) await toTab(page, tab || 'organization');
}
const drawDone = (page) => page.waitForFunction(() => !/\.\.\.$/.test((document.getElementById('cp-graph-state') || { textContent: '' }).textContent), null, { timeout: 15000 });
// the tab's own reads since the mark
const tabReads = () => orgReads(current.slice(mark));
async function toTab(page, name) {
  if (await page.isVisible('#cp-back')) {
    await page.click('#cp-back');
    await page.waitForFunction(() => document.getElementById('console').classList.contains('console--home'), null, { timeout: 8000 });
  }
  await page.click('#rail-' + name);
  await page.waitForFunction((n) => !document.getElementById('tab-' + n).hidden && location.hash === '#' + n, name, { timeout: 8000 });
}
const words = (page) => page.$eval('#og-state', (p) => p.textContent);
// the tab's words once they say what a check waits for
async function until(page, text) {
  try { await page.waitForFunction((t) => (document.getElementById('og-state') || { textContent: '' }).textContent.includes(t), text, { timeout: 15000 }); }
  catch (e) { throw new Error('waited for [' + text + '] but the words are [' + await words(page) + ']'); }
  return words(page);
}
const texts = (page, selector) => page.$$eval(selector, (es) => es.map((e) => e.textContent.trim()));
const rows = (page, box) => page.$$eval(box + ' tbody tr', (trs) => trs.map((tr) => Array.from(tr.children).map((td) => td.textContent.trim().replace(/\s+/g, ' '))));
const heading = (page, box) => page.$eval(box + ' h3', (h) => h.textContent);
// the texts handed the drawing for this tab's chart, told from the Dependencies tab's by the
// repository boxes only this tab draws, in the order they were drawn
const orgCharts = (page) => page.evaluate(() => (window.__charts || []).filter((t) => /\n  subgraph r1\[/.test(t)));
const drawn = (page, n) => page.waitForFunction((k) => (window.__charts || []).filter((t) => /\n  subgraph r1\[/.test(t)).length >= k, n, { timeout: 15000 });
// the chart drawn next, after a press: the tab draws as each repository lands, so a check counts
// from where it stands
async function nextChart(page, press) {
  const n0 = (await orgCharts(page)).length;
  await press();
  await drawn(page, n0 + 1);
  const charts = await orgCharts(page);
  return charts[charts.length - 1];
}
// the chart of the whole organization once every read has landed
async function lastChart(page) {
  await drawn(page, 1);
  await sleep(300);
  const charts = await orgCharts(page);
  return charts[charts.length - 1];
}
const CLASSES = [
  '  classDef todo fill:#ffffff,stroke:#0e8a16,color:#000000',
  '  classDef claimed fill:#fff8d6,stroke:#fbca04,color:#000000',
  '  classDef review fill:#e3f0ff,stroke:#1d76db,color:#000000',
  '  classDef blocked fill:#ffe7e7,stroke:#e99695,color:#000000',
  '  classDef closed fill:#eeeeee,stroke:#999999,color:#666666',
];
// what the page must hand the drawing for the whole organization: the nodes numbered by repository
// then number, a box per repository, a box per epic with the tasks of its own repository, the
// goal's thick arrows, the epic's arrow to its box and to its task elsewhere, the blockers' arrows
const ALL_TEXT = [
  'flowchart TD',
  '  subgraph r1["acme/demo"]',
  '    i1["#1 Ship the console (1/2)"]',
  '    i2["#20 Draw the board (1/3)"]',
  '    subgraph e2["Epic #20: Draw the board (1/3)"]',
  '      i3["#21 Read the summary"]:::closed',
  '      i4["#22 Render the section"]:::todo',
  '    end',
  '  end',
  '  subgraph r2["acme/lib"]',
  '    i5["#5 Cut the library"]:::todo',
  '    i6["#9 Release the library"]',
  '    i7["#30 Cut the library (0/2)"]',
  '    subgraph e7["Epic #30: Cut the library (0/2)"]',
  '      i8["#31 Split the modules"]:::todo',
  '      i9["#32 Tag the release"]:::todo',
  '    end',
  '  end',
  '  subgraph r3["acme/secret"]',
  '    i10["#7 Keep the record"]:::closed',
  '  end',
  '  i1 ==> i2',
  '  i1 ==> i7',
  '  i10 -.-> i4',
  '  i2 --> e2',
  '  i2 --> i5',
  '  i6 --> i9',
  '  i7 --> e7',
].concat(CLASSES).join('\n');
const DONE = 'Read 3 repositories of the 4 listed for acme as you in 8 reads of GitHub: 1 goal, 2 epics with sub-issues, 7 tasks, 2 blocked-by links, 3 links crossing repositories.';
const READS = ['orgs/acme/repos', 'acme/demo issues', 'acme/demo#1 subs', 'acme/demo#20 subs', 'acme/demo#22 blockers', 'acme/lib issues', 'acme/lib#30 subs', 'acme/lib#32 blockers', 'acme/secret issues'];

await check('A: the Organization tab stands in the rail after Dependencies with its ARIA, and opened it lists the repositories and reads each one whole in order, the open one first, the goals\' and epics\' sub-issues and the epics\' tasks\' blockers, nothing of an archived repository nor of a blocked issue under no epic, making no write', async () => {
  const { page, context, calls } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page, null);
  const rail = await page.$$eval('.console__rail [role=tab]', (bs) => bs.map((b) => b.getAttribute('data-tab')));
  assert.ok(rail.indexOf('organization') === rail.indexOf('dependencies') + 1, 'the rail: ' + rail.join());
  assert.deepEqual(await page.$eval('#rail-organization', (b) => [b.getAttribute('aria-controls'), b.querySelector('.rail__name').textContent.trim()]), ['tab-organization', 'Organization']);
  assert.deepEqual(await page.$eval('#tab-organization', (s) => [s.getAttribute('role'), s.getAttribute('aria-labelledby'), s.hidden]), ['tabpanel', 'rail-organization', true]);
  await toTab(page, 'organization');
  const said = await until(page, DONE);
  assert.equal(said, DONE);
  assert.ok(!(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn'))));
  assert.deepEqual(tabReads(), READS);
  assert.deepEqual(writes(calls), []);
  assert.equal(await page.$('#og-more'), null);
  await context.close();
});

await check('B: the chart text is the organization, byte for byte: a box per repository, a box per epic with its own tasks, the goal\'s thick arrows, the epic\'s arrow to its box and to its task elsewhere, the blockers\' arrows dotted once closed, the five classes, drawn once the reads end', async () => {
  const { page, context } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  assert.equal(await lastChart(page), ALL_TEXT);
  // drawn as each repository lands and never the same text twice: after demo, after lib, and
  // secret's read adds no node, so no third
  assert.equal((await orgCharts(page)).length, 2, 'drawn ' + (await orgCharts(page)).length + ' times');
  assert.equal(await page.$eval('#og-chart', (b) => b.hidden), false);
  assert.equal(await page.$eval('#og-tools', (b) => b.hidden), false);
  await context.close();
});

await check('C: the chips cut the chart to one repository with what its issues are joined to, or to one goal or epic with its tasks and their blockers, flipped in place so the chip pressed keeps the keyboard, and a second press shows all again', async () => {
  const { page, context } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  await drawn(page, 1);
  assert.deepEqual(await texts(page, '#og-chips button.chip'), ['All', 'acme/demo4', 'acme/lib5', 'acme/secret1', 'Goal demo#1', 'Epic demo#20', 'Epic lib#30']);
  assert.equal(await lastChart(page), ALL_TEXT);
  let chart = await nextChart(page, () => page.click('#og-chips button.chip:nth-child(3)'));
  assert.deepEqual(chart.split('\n').filter((l) => /^ +i[0-9]+\[|^  i[0-9]+ /.test(l)), ['    i1["#1 Ship the console (1/2)"]', '    i2["#20 Draw the board (1/3)"]', '    i5["#5 Cut the library"]:::todo', '    i6["#9 Release the library"]', '    i7["#30 Cut the library (0/2)"]', '      i8["#31 Split the modules"]:::todo', '      i9["#32 Tag the release"]:::todo', '  i1 ==> i2', '  i1 ==> i7', '  i2 --> i5', '  i6 --> i9', '  i7 --> e7']);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'acme/lib5');
  assert.equal(await page.$eval('#og-chips button.chip:nth-child(3)', (b) => b.getAttribute('aria-pressed')), 'true');
  chart = await nextChart(page, () => page.click('#og-chips button.chip:nth-child(7)'));
  assert.deepEqual(chart.split('\n').filter((l) => /^ +i[0-9]+\[|^  i[0-9]+ /.test(l)), ['    i2["#20 Draw the board (1/3)"]', '      i3["#21 Read the summary"]:::closed', '      i4["#22 Render the section"]:::todo', '    i5["#5 Cut the library"]:::todo', '    i10["#7 Keep the record"]:::closed', '  i10 -.-> i4', '  i2 --> e2', '  i2 --> i5']);
  assert.equal(await nextChart(page, () => page.click('#og-chips button.chip:nth-child(7)')), ALL_TEXT);
  assert.equal(await page.$eval('#og-chips button.chip:nth-child(1)', (b) => b.getAttribute('aria-pressed')), 'true');
  await context.close();
});

await check('D: the tables list the goals and epics with their progress, tasks, tasks elsewhere and blocked tasks, the links that cross repositories, and every repository with what was read of it, an archived one said not read', async () => {
  const { page, context } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  assert.equal(await heading(page, '#og-plans'), 'Goals and epics with sub-issues (3)');
  assert.deepEqual(await rows(page, '#og-plans'), [
    ['acme/demo#1', 'goal', 'Ship the console', '1/2', '2', '1', '0'],
    ['acme/demo#20', 'epic', 'Draw the board', '1/3', '3', '1', '0'],
    ['acme/lib#30', 'epic', 'Cut the library', '0/2', '2', '0', '1'],
  ]);
  assert.equal(await heading(page, '#og-cross'), 'Links that cross repositories (3)');
  assert.deepEqual(await rows(page, '#og-cross'), [
    ['acme/demo#1 Ship the console', 'has the epic', 'acme/lib#30 Cut the library'],
    ['acme/secret#7 Keep the record (closed)', 'blocks', 'acme/demo#22 Render the section'],
    ['acme/demo#20 Draw the board', 'has the sub-issue', 'acme/lib#5 Cut the library'],
  ]);
  assert.equal(await heading(page, '#og-repos'), 'Repositories (4)');
  assert.deepEqual(await rows(page, '#og-repos'), [
    ['acme/lib', '5', '0', '1', '5', 'read Open in the panel'],
    ['acme/demo', '5', '1', '1', '4', 'read'],
    ['acme/secret', '1', '0', '0', '1', 'read Open in the panel'],
    ['acme/extra', '', '0', '0', '0', 'archived, not read Open in the panel'],
  ]);
  assert.equal(await page.$$eval('#og-plans a, #og-cross a, #og-repos a', (as) => as.every((a) => /^https:\/\/github\.com\/acme\//.test(a.href))), true);
  await context.close();
});

await check('E: a node pressed in the drawn chart names its issue, its state, what blocks it and its sub-issues, with its link', async () => {
  const { page, context, errors } = await open(routesOf(fixture()));
  await signIn(page);
  await until(page, DONE);
  await page.waitForSelector('#og-chart svg g.node', { timeout: 20000 });
  // SHOT names a file for a picture of the drawn tab, for a person to look at; no check reads it
  if (process.env.SHOT) { await sleep(800); await page.screenshot({ path: process.env.SHOT, clip: { x: 0, y: 0, width: 1366, height: 657 } }); }
  assert.equal(await page.$$eval('#og-chart g.node', (gs) => gs.length), 10);
  assert.deepEqual(await page.$$eval('#og-chart g.node', (gs) => gs.map((g) => ['todo', 'claimed', 'review', 'blocked', 'closed'].find((c) => g.classList.contains(c)) || '').sort()), ['', '', '', '', 'closed', 'closed', 'todo', 'todo', 'todo', 'todo']);
  await page.click('#og-chart g.node[id*="-flowchart-i4-"]');
  await page.waitForFunction(() => document.getElementById('og-said').textContent !== '', null, { timeout: 8000 });
  assert.equal(await page.$eval('#og-said', (p) => p.textContent), 'acme/demo#22 Render the section, todo, unclaimed; blocked by acme/secret#7 (closed). Open on GitHub');
  assert.equal(await page.$eval('#og-said a', (a) => a.href), 'https://github.com/acme/demo/issues/22');
  await page.click('#og-chart g.node[id*="-flowchart-i1-"]');
  await page.waitForFunction(() => /Ship the console/.test(document.getElementById('og-said').textContent), null, { timeout: 8000 });
  assert.equal(await page.$eval('#og-said', (p) => p.textContent), 'acme/demo#1 Ship the console, open; 1 of 2 sub-issues closed. Open on GitHub');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F: at most 120 reads a press, the open repository first, the rest said in words and read by Read more', async () => {
  const f = { open: { 'acme/demo': [issueOf('acme/demo', 1, 'One', ['todo'])] }, subIssues: {}, blockedBy: {} };
  const listed = [];
  for (let i = 1; i <= 125; i++) {
    const name = 'r' + String(i).padStart(3, '0');
    listed.push(record(name, { open_issues_count: 1 }));
    f.open['acme/' + name] = [issueOf('acme/' + name, 1, 'Task of ' + name, ['todo'])];
  }
  const { page, context, calls } = await open(routesOf(f, { listed }), { extraRoutes: [stubRoute] });
  await signIn(page);
  const said = await until(page, 'Stopped at 120 reads for one press; 6 repositories not read yet. Read more reads on.');
  assert.ok(said.startsWith('Read 120 repositories of the 125 listed for acme as you in 120 reads of GitHub:'), said);
  const reads = tabReads();
  assert.equal(reads.length, 121);
  assert.deepEqual(reads.slice(0, 3), ['orgs/acme/repos', 'acme/demo issues', 'acme/r001 issues']);
  assert.equal(await page.$eval('#og-more', (b) => b.textContent), 'Read more');
  assert.equal(await page.$eval('#og-more', (b) => b.parentNode.textContent), '6 repositories not read yet. Read more');
  await page.click('#og-more');
  await until(page, 'Read 126 repositories of the 125 listed for acme as you in 126 reads of GitHub:');
  assert.equal(tabReads().length, 127);
  assert.equal(await page.$('#og-more'), null);
  await context.close();
});

await check('G: under the rate limit\'s reserve, reached as the listing answers, the tab reads nothing more and says why, and reached before it the listing waits too', async () => {
  let routes = routesOf(fixture());
  routes['GET /orgs/acme/repos'] = resp(200, LISTED, { headers: { 'X-RateLimit-Remaining': '99', 'Access-Control-Expose-Headers': EXPOSE } });
  let { page, context, calls } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  let said = await until(page, 'Stopped: GitHub says this token has 99 calls left this hour, and the page keeps the last 100 for the rest of the console. 3 repositories not read yet.');
  assert.ok(said.startsWith('Read 0 repositories of the 4 listed for acme as you in 0 reads of GitHub:'), said);
  assert.ok(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn')));
  assert.deepEqual(tabReads(), ['orgs/acme/repos']);
  assert.equal(await page.$eval('#og-more', (b) => b.textContent), 'Read more');
  await context.close();
  routes = routesOf(fixture());
  routes['GET /repos/acme/demo'] = resp(200, { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner }, { headers: { 'X-RateLimit-Remaining': '50', 'Access-Control-Expose-Headers': EXPOSE } });
  ({ page, context, calls } = await open(routes, { extraRoutes: [stubRoute] }));
  await signIn(page);
  said = await until(page, 'The repositories of acme could not be listed (GitHub says this token has 50 calls left this hour');
  assert.deepEqual(tabReads(), []);
  await context.close();
});

await check('H: a listing GitHub refuses is said so, and the open repository is read all the same', async () => {
  const { page, context, calls } = await open(routesOf(fixture(), { listed: resp(403, { message: 'Forbidden' }) }), { extraRoutes: [stubRoute] });
  await signIn(page);
  const said = await until(page, 'Read 1 repository in 4 reads of GitHub: 1 goal, 1 epic with sub-issues, 4 tasks, 1 blocked-by link, 3 links crossing repositories.');
  assert.ok(/^The repositories of acme could not be listed \(.+\), so only acme\/demo is read\. /.test(said), said);
  assert.ok(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn')));
  assert.deepEqual(tabReads(), READS.slice(0, 5));
  assert.deepEqual(await rows(page, '#og-repos'), [['acme/demo', '5', '1', '1', '4', 'read']]);
  await context.close();
});

await check('I: a read that fails stops the reads with its reason, Read more carries on from it, and a cut list is said so', async () => {
  const f = fixture();
  const routes = routesOf(f);
  let fails = 2; // the console's own draw of acme/demo reads it first and takes the first failure
  routes['GET /repos/acme/demo/issues/20/sub_issues'] = () => (fails-- > 0 ? resp(500, { message: 'Server Error' }) : f.subIssues['acme/demo#20']);
  routes['GET /repos/acme/lib/issues'] = (url) => {
    const p = Number(url.searchParams.get('page') || '1');
    return resp(200, p === 1 ? f.open['acme/lib'] : [issueOf('acme/lib', 100 + p, 'Filler ' + p, ['todo'])], { headers: { Link: '<https://api.github.com/repos/acme/lib/issues?state=open&per_page=100&page=' + (p + 1) + '>; rel="next"', 'Access-Control-Expose-Headers': EXPOSE } });
  };
  const { page, context, calls } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  let said = await until(page, 'Stopped: reading the sub-issues of acme/demo#20 failed (');
  assert.ok(said.includes('2 repositories not read yet.'), said);
  assert.ok(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn')));
  await page.click('#og-more');
  said = await until(page, 'Only the first 500 open issues of acme/lib were read.');
  assert.ok(said.startsWith('Read 3 repositories of the 4 listed for acme as you in 13 reads of GitHub: 1 goal, 2 epics with sub-issues, 7 tasks, 2 blocked-by links, 3 links crossing repositories.'), said);
  assert.equal(tabReads().filter((r) => r === 'acme/lib issues').length, 5);
  assert.deepEqual((await rows(page, '#og-repos'))[0], ['acme/lib', '9', '0', '1', '5', 'read, cut at 9 Open in the panel']);
  await context.close();
});

await check('J: a hostile title is written into the chart as entities and into the tables as text', async () => {
  const f = fixture();
  f.open['acme/demo'][1].title = 'x"]; click <b>bold</b> %%{init}';
  f.subIssues['acme/demo#1'][0].title = f.open['acme/demo'][1].title;
  const { page, context, errors } = await open(routesOf(f), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  const chart = await lastChart(page);
  assert.ok(chart.includes('\n    i2["#20 x#quot;]; click #lt;b#gt;bold#lt;/b#gt; #37;#37;{init} (1/3)"]\n'), chart);
  assert.ok(chart.includes('\n    subgraph e2["Epic #20: x#quot;]; click #lt;b#gt;bold#lt;/b#gt; #37;#37;{init} (1/3)"]\n'), chart);
  assert.deepEqual(await texts(page, '#og-chips button.chip'), ['All', 'acme/demo4', 'acme/lib5', 'acme/secret1', 'Goal demo#1', 'Epic demo#20', 'Epic lib#30']);
  assert.equal(await page.$eval('#og-chips button.chip:nth-child(7)', (b) => b.title), 'x"]; click <b>bold</b...');
  assert.equal((await rows(page, '#og-plans'))[1][2], 'x"]; click <b>bold</b> %%{init}');
  assert.equal(await page.$$eval('#og-plans b, #og-cross b, #og-chips b', (es) => es.length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('K: Refresh reads everything again; a tab left and opened again reads nothing more, and one opened again while the listing is in flight reuses the load', async () => {
  let routes = routesOf(fixture());
  let { page, context, calls } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  const before = calls.length;
  await toTab(page, 'dependencies');
  await toTab(page, 'organization');
  await sleep(500);
  assert.equal(calls.length, before, 'opening the tab again read: ' + calls.slice(before).map((c) => c.key).join());
  await page.click('#og-refresh');
  await page.waitForFunction((n) => performance.now() > n, 0);
  await until(page, DONE);
  assert.deepEqual(orgReads(calls.slice(before)), READS);
  await context.close();
  routes = routesOf(fixture());
  routes['GET /orgs/acme/repos'] = resp(200, LISTED, { delayMs: 1500 });
  ({ page, context, calls } = await open(routes, { extraRoutes: [stubRoute] }));
  await signIn(page);
  await sleep(300);
  await toTab(page, 'dependencies');
  await toTab(page, 'organization');
  await until(page, DONE);
  assert.deepEqual(tabReads().filter((r) => r === 'orgs/acme/repos'), ['orgs/acme/repos']);
  assert.deepEqual(tabReads().filter((r) => r === 'acme/demo issues'), ['acme/demo issues']);
  await context.close();
});

await check('L: a repository whose record cannot be read is said so on the tab, in place of Reading', async () => {
  const routes = routesOf(fixture());
  routes['GET /repos/acme/demo'] = resp(500, { message: 'Server Error' });
  const { page, context, calls } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  const said = await until(page, 'Nothing to draw: the record of acme/demo could not be read (');
  assert.ok(/The console's Refresh reads it again\.$/.test(said), said);
  assert.ok(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn')));
  await toTab(page, 'dependencies');
  await toTab(page, 'organization');
  assert.ok((await words(page)).startsWith('Nothing to draw: the record of acme/demo could not be read ('), await words(page));
  assert.deepEqual(tabReads(), []);
  await context.close();
});

await check('M: a person\'s own repositories are listed under the viewer, which lists the private ones too, and another person\'s under that person with type=owner', async () => {
  async function run(login) {
    const me = { id: 78, login, type: 'User' };
    const routes = {
      'GET /user': { login: 'tester' },
      ['GET /repos/' + login + '/mine']: { full_name: login + '/mine', default_branch: 'main', private: true, topics: ['symphony'], id: 125, owner: me },
      ['GET /repos/' + login + '/mine/issues']: [],
      ['GET /repos/' + login + '/mine/contents/STATE.md']: { encoding: 'base64', content: b64(board) },
      ['GET /repos/' + login + '/mine/branches/board']: { commit: { commit: { committer: { date: now } } } },
      ['GET /repos/' + login + '/mine/contents/.github/symphony/workers']: [],
      ['GET /repos/' + login + '/mine/actions/runs']: { workflow_runs: [] },
      ['GET /repos/' + login + '/mine/pulls']: [],
      'GET /user/repos': [Object.assign(record('mine', { private: true, visibility: 'private' }), { full_name: login + '/mine', owner: me })],
      ['GET /users/' + login + '/repos']: [Object.assign(record('mine', { private: true, visibility: 'private' }), { full_name: login + '/mine', owner: me })],
    };
    const { page, context, calls } = await open(routes, { extraRoutes: [stubRoute], path: '/symphony/control/?repo=' + login + '/mine' });
    await signIn(page);
    const said = await until(page, 'Nothing to draw: no open epic or goal with sub-issues in what was read.');
    assert.ok(said.startsWith('Read 1 repository of the 1 listed for ' + login + ' as you in 1 read of GitHub: 0 goals, 0 epics with sub-issues, 0 tasks'), said);
    const lists = calls.filter((c) => /\/repos(\?|$)/.test(c.url) && !/\/repos\//.test(c.url)).map((c) => c.url.replace('https://api.github.com', ''));
    await context.close();
    return lists;
  }
  assert.deepEqual(await run('tester'), ['/user/repos?affiliation=owner&per_page=100&sort=pushed']);
  assert.deepEqual(await run('other'), ['/users/other/repos?type=owner&per_page=100&sort=pushed']);
});

await browser.close();
console.log('\n' + results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
