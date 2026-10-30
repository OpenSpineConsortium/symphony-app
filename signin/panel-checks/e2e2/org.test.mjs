// Checks of the control panel's Organization tab (site branch claude/project-thread-kwvrqv,
// 2026-10-29, the owner's ask that the panel show every repository of the organization and how
// they depend on each other and interact, the interfaces and not only the tasks) against a mocked
// GitHub API: a tab of its own in the console's rail after Dependencies, with its ARIA; the words
// it says once it has read the owner's repositories, the open repository's map
// (.github/symphony/organization.json) and the task links that cross repositories; the reads it
// makes and the ones it never makes (the blockers the Dependencies draw read already, nothing under
// the rate limit's reserve, at most ORG_READS_MAX a press, the rest behind Read more); the chart
// text it hands the drawing library, byte for byte, grouped by the map's groups with the four
// classes and the names written as entities, so a hostile name is inert; the chips that cut the
// chart, the table and the cards to one group or one kind, and the three agreeing; the table of
// interfaces with each name linked where GitHub lists it; one card per repository, a repository
// GitHub lists that the map does not know said so, one the map names that GitHub does not list said
// to be out of reach, and Open in the panel switching the console to it; a node pressed naming its
// repository and marking its card; a repository with no map, a map that is not JSON, a listing
// GitHub refuses, a Refresh reading again, and a tab left and opened again reading nothing more.
// Each check states what the page promises; a FAIL is a defect. Every token is a stand-in.
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

// GitHub's REST objects: an issue of the open repository, one of another repository, the two summaries
function issue(n, title, labels, extra) {
  return Object.assign({
    number: n, title, state: 'open', html_url: 'https://github.com/acme/demo/issues/' + n, repository_url: 'https://api.github.com/repos/acme/demo',
    labels: labels.map((name) => ({ name })), updated_at: now,
  }, extra || {});
}
function elsewhere(repo, n, title, extra) {
  return Object.assign({ number: n, title, state: 'open', html_url: 'https://github.com/' + repo + '/issues/' + n, repository_url: 'https://api.github.com/repos/' + repo, labels: [], updated_at: now }, extra || {});
}
const deps = (blocked_by, total_blocked_by) => ({ issue_dependencies_summary: { blocked_by, blocking: 0, total_blocked_by, total_blocking: 0 } });
const subs = (completed, total) => ({ sub_issues_summary: { total, completed, percent_completed: total ? Math.round(100 * completed / total) : 0 } });
// a repository as GET /orgs/{org}/repos lists it
function record(name, extra) {
  return Object.assign({
    id: 1000 + name.length, name, full_name: 'acme/' + name, html_url: 'https://github.com/acme/' + name, private: false, visibility: 'public', fork: false, archived: false,
    open_issues_count: 2, pushed_at: now, default_branch: 'main', owner: { login: 'acme', id: 77, type: 'Organization' },
  }, extra || {});
}
const LISTED = [record('demo'), record('lib', { open_issues_count: 3 }), record('secret', { private: true, visibility: 'private', open_issues_count: 1 }), record('extra', { archived: true, open_issues_count: 0 })];
// the open repository's map: four repositories, one of them (hidden) not listed by GitHub for the
// viewer, a system outside GitHub, four interfaces, and an edge to a node that is not there, which
// the page leaves out and counts
const MAP = {
  about: 'a map', owner: 'acme', written: '2026-10-29', edge_reads: 'from depends on to',
  kinds: { vendors: 'takes a copy of', 'runs-on': 'runs its jobs on', reads: 'reads from' },
  groups: { core: 'the core', tools: 'the tools', systems: 'outside GitHub' },
  nodes: [
    { name: 'demo', group: 'core', visibility: 'public', role: 'the project' },
    { name: 'lib', group: 'tools', visibility: 'public', role: 'the library' },
    { name: 'secret', group: 'core', visibility: 'private', role: 'the record' },
    { name: 'hidden', group: 'tools', visibility: 'internal', role: 'out of reach' },
    { name: 'the grid', group: 'systems', kind: 'system', role: 'a cluster' },
  ],
  edges: [
    { from: 'demo', to: 'lib', kind: 'vendors', what: 'tools/lib', by: 'tools/VENDORED' },
    { from: 'demo', to: 'the grid', kind: 'runs-on', what: 'the jobs', by: 'grid.yml' },
    { from: 'secret', to: 'demo', kind: 'reads', what: 'the board', by: 'README' },
    { from: 'hidden', to: 'lib', kind: 'vendors', what: 'tools/lib', by: 'VENDORED' },
    { from: 'ghost', to: 'lib', kind: 'vendors', what: 'dropped', by: 'nothing' },
  ],
};
const CLASSES = [
  '  classDef public fill:#ffffff,stroke:#0e8a16,color:#000000',
  '  classDef internal fill:#e3f0ff,stroke:#1d76db,color:#000000',
  '  classDef private fill:#fff8d6,stroke:#fbca04,color:#000000',
  '  classDef system fill:#eeeeee,stroke:#999999,color:#666666',
];
// what the page must hand the drawing for the whole map, and for the group tools: its nodes and
// what their edges touch
const ALL_TEXT = [
  'flowchart TD',
  '  subgraph g1["core (2)"]',
  '    i1["demo"]:::public',
  '    i3["secret"]:::private',
  '  end',
  '  subgraph g2["tools (2)"]',
  '    i2["lib"]:::public',
  '    i4["hidden"]:::internal',
  '  end',
  '  subgraph g3["systems (1)"]',
  '    i5(["the grid"]):::system',
  '  end',
  '  i1 -->|vendors| i2',
  '  i1 -->|runs-on| i5',
  '  i3 -->|reads| i1',
  '  i4 -->|vendors| i2',
].concat(CLASSES).join('\n');
const TOOLS_TEXT = [
  'flowchart TD',
  '  subgraph g1["core (1)"]',
  '    i1["demo"]:::public',
  '  end',
  '  subgraph g2["tools (2)"]',
  '    i2["lib"]:::public',
  '    i4["hidden"]:::internal',
  '  end',
  '  i1 -->|vendors| i2',
  '  i4 -->|vendors| i2',
].concat(CLASSES).join('\n');
// the open repository's issues: an epic whose sub-issues the Dependencies draw reads, one of them
// in another repository and one blocked from another repository, so the draw meets two links; and
// a blocked issue under no epic, whose blocker the Organization tab reads itself
function fixture() {
  const i20 = issue(20, 'Draw the board', ['epic'], Object.assign(subs(1, 3), deps(0, 0)));
  const i21 = issue(21, 'Read the summary', ['todo'], { state: 'closed' });
  const i22 = issue(22, 'Render the section', ['todo'], deps(1, 1));
  const i24 = issue(24, 'Write the docs', ['todo'], deps(1, 1));
  const i99 = issue(99, 'Settle the colours', ['todo']);
  return {
    open: [i20, i22, i24, i99],
    subIssues: { 20: [i21, i22, elsewhere('acme/lib', 5, 'Cut the library')] },
    blockedBy: { 22: [elsewhere('acme/secret', 7, 'Keep the record', { state: 'closed' })], 24: [elsewhere('acme/lib', 9, 'Release the library')] },
  };
}
const board = '# Board\n\nAs of commit 0123abc on main. Rewritten by .github/workflows/board.yml; do not edit by hand.\n\n## Claims (open claude/<issue> branches and docs/agents/claims/<issue>.md)\n\n| Issue | Branch | Worker | PR | Files it touches |\n| --- | --- | --- | --- | --- |\n';
const owner = { id: 77, login: 'acme', type: 'Organization' };
// the routes of the open repository and of the organization: opts.map is the map file's content
// (an object, a string as written, or null for no file), opts.listed the organization's listing
function routesOf(f, opts) {
  opts = opts || {};
  const routes = {
    'GET /user': { login: 'tester' },
    'GET /repos/acme/demo': { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner },
    'GET /repos/acme/demo/issues': f.open,
    'GET /repos/acme/demo/contents/STATE.md': { encoding: 'base64', content: b64(board) },
    'GET /repos/acme/demo/branches/board': { commit: { commit: { committer: { date: now } } } },
    'GET /repos/acme/demo/contents/.github/symphony/workers': [],
    'GET /repos/acme/demo/actions/runs': { workflow_runs: [] },
    'GET /repos/acme/demo/pulls': [],
    'GET /orgs/acme/repos': 'listed' in opts ? opts.listed : LISTED,
  };
  if (opts.map !== null) routes['GET /repos/acme/demo/contents/.github/symphony/organization.json'] = { encoding: 'base64', content: b64(typeof opts.map === 'string' ? opts.map : JSON.stringify(opts.map || MAP)) };
  for (const n of Object.keys(f.subIssues)) routes['GET /repos/acme/demo/issues/' + n + '/sub_issues'] = f.subIssues[n];
  for (const n of Object.keys(f.blockedBy)) routes['GET /repos/acme/demo/issues/' + n + '/dependencies/blocked_by'] = f.blockedBy[n];
  return routes;
}
const blockedByReads = (calls) => calls.filter((c) => /\/issues\/[0-9]+\/dependencies\/blocked_by$/.test(c.key)).map((c) => c.key.replace('GET /repos/acme/demo/issues/', '#').replace('/dependencies/blocked_by', ''));
const writes = (calls) => calls.filter((c) => !/^GET /.test(c.key)).map((c) => c.key);

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
  // every scrollIntoView the page makes, so a check can tell what it brought into view
  await context.addInitScript(() => {
    window.__scrolled = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
      window.__scrolled.push(this.tagName + ':' + (this.textContent || '').trim().slice(0, 40));
      return original.apply(this, arguments);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/symphony/control/', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(BASE + (opts.path || '/symphony/control/?repo=acme/demo'), { waitUntil: 'load' });
  return { context, page, calls, errors };
}
// signs in with the pasted token and opens the tab named, the Organization tab unless told otherwise
async function signIn(page, tab) {
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  if (tab !== null) await toTab(page, tab || 'organization');
}
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
  await page.waitForFunction((t) => (document.getElementById('og-state') || { textContent: '' }).textContent.includes(t), text, { timeout: 15000 });
  return words(page);
}
const texts = (page, selector) => page.$$eval(selector, (es) => es.map((e) => e.textContent.trim()));
const rows = (page, box) => page.$$eval(box + ' tbody tr', (trs) => trs.map((tr) => Array.from(tr.children).map((td) => td.textContent.trim().replace(/\s+/g, ' '))));
const heading = (page, box) => page.$eval(box + ' h3', (h) => h.textContent);
// the texts handed the drawing for this tab's chart, told from the Dependencies tab's by the classes
// only the map's chart carries, in the order they were drawn
const orgCharts = (page) => page.evaluate(() => (window.__charts || []).filter((t) => /\n  classDef public /.test(t)));
const drawn = (page, n) => page.waitForFunction((k) => (window.__charts || []).filter((t) => /\n  classDef public /.test(t)).length >= k, n, { timeout: 15000 });
const cardOf = (page, full) => page.$$eval('#og-repos .og__card', (cards, name) => {
  const c = cards.find((x) => x.querySelector('.og__name').textContent.trim() === name);
  return c ? { id: c.id, on: c.classList.contains('og__card--on'), facts: c.querySelector('.og__facts').textContent, role: (c.querySelector('.og__role') || {}).textContent || '', edges: Array.from(c.querySelectorAll('.og__edges')).map((p) => p.textContent), gap: Array.from(c.querySelectorAll('.og__gap')).map((p) => p.textContent), button: (c.querySelector('button') || {}).textContent || '', linked: !!c.querySelector('.og__name a') } : null;
}, full);
const DONE = '3 task links cross from acme/demo into 2 other repositories.';

await check('A: the Organization tab stands in the rail after Dependencies with its ARIA, and opened it reads the owner\'s repositories, the map and the blockers the draw did not, making no write', async () => {
  const { page, calls, errors, context } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page, null);
  const rail = await page.$$eval('.console__rail [role=tab]', (bs) => bs.map((b) => b.getAttribute('data-tab')));
  assert.ok(rail.indexOf('organization') === rail.indexOf('dependencies') + 1, 'the rail: ' + rail.join());
  assert.deepEqual(await page.$eval('#rail-organization', (b) => [b.getAttribute('aria-controls'), b.getAttribute('role'), b.querySelector('.rail__name').textContent.trim()]), ['tab-organization', 'tab', 'Organization']);
  assert.deepEqual(await page.$eval('#tab-organization', (s) => [s.getAttribute('role'), s.getAttribute('aria-labelledby'), s.getAttribute('data-tab-panel')]), ['tabpanel', 'rail-organization', 'organization']);
  await toTab(page, 'organization');
  const said = await until(page, DONE);
  assert.ok(said.startsWith('4 repositories listed for acme as you: 3 public, 1 private or internal, 1 archived. The map of acme/demo, written 2026-10-29, names 4 repositories and 1 system outside GitHub with 4 interfaces (1 edge left out, not between two of its nodes). ' + DONE), said);
  assert.ok(!/\.\.\./.test(said) && !/not read yet/.test(said), said);
  assert.equal(calls.filter((c) => c.key === 'GET /orgs/acme/repos').length, 1, 'the listing is read once');
  const mapCall = calls.find((c) => c.key === 'GET /repos/acme/demo/contents/.github/symphony/organization.json');
  assert.ok(mapCall && /[?&]ref=main\b/.test(mapCall.url), 'the map is read from the default branch: ' + (mapCall && mapCall.url));
  assert.deepEqual(blockedByReads(calls).sort(), ['#22', '#24'], 'the draw read #22 and the tab read #24, once each');
  assert.ok(!calls.some((c) => /\/search\//.test(c.key)), 'no search API');
  assert.deepEqual(writes(calls), []);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('B: the chart text is the map grouped by its groups, a system as a stadium, the edges labelled by kind, the four classes, and the stage and its tools are shown', async () => {
  const { page, context } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  await drawn(page, 1);
  await sleep(300);
  assert.deepEqual(await orgCharts(page), [ALL_TEXT], 'the map is drawn once, whatever the words say meanwhile');
  assert.deepEqual(await page.$eval('#og-chart', (c) => [c.hidden, c.getAttribute('role'), c.getAttribute('aria-label')]), [false, 'group', 'The organization\'s map']);
  assert.equal(await page.$eval('#og-tools', (t) => t.hidden), false);
  await context.close();
});

await check('C: the chips cut the chart, the table and the cards to one group or one kind, agreeing, and a second press shows all again', async () => {
  const { page, context } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  assert.deepEqual(await texts(page, '#og-chips button.chip'), ['All', 'core2', 'tools2', 'systems1', 'reads1', 'runs-on1', 'vendors2']);
  assert.deepEqual(await texts(page, '#og-chips .og__sep'), ['by interface:']);
  assert.deepEqual(await page.$$eval('#og-chips button.chip', (bs) => bs.map((b) => b.getAttribute('aria-pressed'))), ['true', 'false', 'false', 'false', 'false', 'false', 'false']);
  assert.equal(await heading(page, '#og-edges'), 'Interfaces (4)');
  assert.equal(await heading(page, '#og-repos'), 'Repositories (5)');
  await page.click('#og-chips button.chip:nth-of-type(3)');
  await drawn(page, 2);
  assert.deepEqual((await orgCharts(page)).slice(1), [TOOLS_TEXT]);
  assert.equal(await heading(page, '#og-edges'), 'Interfaces touching tools (2)');
  assert.equal(await heading(page, '#og-repos'), 'Repositories of tools (2)');
  assert.deepEqual(await texts(page, '#og-repos .og__name'), ['acme/lib', 'acme/hidden']);
  assert.deepEqual(await page.$$eval('#og-chips button.chip', (bs) => bs.map((b) => b.getAttribute('aria-pressed'))), ['false', 'false', 'true', 'false', 'false', 'false', 'false']);
  await page.click('#og-chips button.chip:nth-of-type(3)');
  await drawn(page, 3);
  assert.equal((await orgCharts(page))[2], ALL_TEXT);
  assert.equal(await heading(page, '#og-repos'), 'Repositories (5)');
  await page.click('#og-chips button.chip:nth-of-type(5)');
  await drawn(page, 4);
  assert.equal(await heading(page, '#og-edges'), 'Interfaces of the kind reads (1)');
  assert.equal(await heading(page, '#og-repos'), 'Repositories joined by reads (2)');
  assert.deepEqual(await texts(page, '#og-repos .og__name'), ['acme/demo', 'acme/secret']);
  assert.deepEqual(await rows(page, '#og-edges'), [['secret', 'reads', 'demo', 'the board', 'README']]);
  const kindChart = (await orgCharts(page))[3];
  assert.ok(kindChart.includes('i3 -->|reads| i1') && !kindChart.includes('vendors') && !kindChart.includes('the grid'), kindChart);
  await context.close();
});

await check('D: the table of interfaces names each end as a link where GitHub lists it, a system as words, and says what passes and by what evidence', async () => {
  const { page, context } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  assert.deepEqual(await rows(page, '#og-edges'), [
    ['demo', 'vendors', 'lib', 'tools/lib', 'tools/VENDORED'],
    ['demo', 'runs-on', 'the grid', 'the jobs', 'grid.yml'],
    ['secret', 'reads', 'demo', 'the board', 'README'],
    ['hidden', 'vendors', 'lib', 'tools/lib', 'VENDORED'],
  ]);
  assert.deepEqual(await page.$$eval('#og-edges tbody tr', (trs) => trs.map((tr) => [tr.children[0].querySelector('a') ? tr.children[0].querySelector('a').getAttribute('href') : (tr.children[0].firstElementChild || {}).className || '', tr.children[2].querySelector('a') ? tr.children[2].querySelector('a').getAttribute('href') : (tr.children[2].firstElementChild || {}).className || ''])), [
    ['https://github.com/acme/demo', 'https://github.com/acme/lib'],
    ['https://github.com/acme/demo', 'og__system'],
    ['https://github.com/acme/secret', 'https://github.com/acme/demo'],
    ['', 'https://github.com/acme/lib'],
  ]);
  assert.deepEqual(await texts(page, '#og-edges thead th'), ['From', 'Interface', 'To', 'What passes', 'Evidence']);
  await context.close();
});

await check('E: one card per repository, the map\'s first, with what GitHub lists, its role, its edges and its task links; a repository the map does not know, one GitHub does not list, and Open in the panel on every other repository', async () => {
  const { page, context } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  assert.deepEqual(await texts(page, '#og-repos .og__name'), ['acme/demo', 'acme/lib', 'acme/secret', 'acme/hidden', 'acme/extra']);
  assert.deepEqual(await page.$$eval('#og-repos .og__card', (cs) => cs.map((c) => c.id)), ['og-card-1', 'og-card-2', 'og-card-3', 'og-card-4', '']);
  const demo = await cardOf(page, 'acme/demo');
  assert.ok(/^public, core, 2 open issues and pull requests, pushed /.test(demo.facts), demo.facts);
  assert.equal(demo.role, 'the project');
  assert.deepEqual(demo.edges, ['Depends on: lib (vendors), the grid (runs-on).', 'Depended on by: secret (reads).']);
  assert.deepEqual([demo.gap, demo.button, demo.linked], [[], '', true]);
  const lib = await cardOf(page, 'acme/lib');
  assert.deepEqual(lib.edges, ['Depended on by: demo (vendors), hidden (vendors).', '2 task links from acme/demo: 1 blocker and 1 sub-issue.']);
  assert.equal(lib.button, 'Open in the panel');
  const secret = await cardOf(page, 'acme/secret');
  assert.ok(/^private, core, 1 open issue or pull request, pushed /.test(secret.facts), secret.facts);
  assert.deepEqual(secret.edges, ['Depends on: demo (reads).', '1 task link from acme/demo: 1 blocker and 0 sub-issues.']);
  const hidden = await cardOf(page, 'acme/hidden');
  assert.deepEqual([hidden.facts, hidden.gap, hidden.button, hidden.linked], ['internal by the map, tools', ['Not listed by GitHub for you: out of your reach, or renamed.'], '', false]);
  assert.deepEqual(hidden.edges, ['Depends on: lib (vendors).', 'Not listed by GitHub for you: out of your reach, or renamed.']);
  const extra = await cardOf(page, 'acme/extra');
  assert.ok(/^public, archived, 0 open issues and pull requests, pushed /.test(extra.facts), extra.facts);
  assert.deepEqual([extra.role, extra.gap, extra.button], ['', ['Not in the map: listed by GitHub only.'], 'Open in the panel']);
  await context.close();
});

await check('F: the task links that cross repositories are tabled, the draw\'s and the tab\'s own, each end linked, a closed one said so', async () => {
  const { page, context } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  assert.equal(await heading(page, '#og-cross'), 'Task links that cross repositories (3)');
  assert.deepEqual(await rows(page, '#og-cross'), [
    ['#20 Draw the board', 'has the sub-issue', 'acme/lib#5 Cut the library'],
    ['#24 Write the docs', 'is blocked by', 'acme/lib#9 Release the library'],
    ['#22 Render the section', 'is blocked by', 'acme/secret#7 Keep the record (closed)'],
  ]);
  assert.deepEqual(await page.$$eval('#og-cross tbody tr', (trs) => trs.map((tr) => [tr.children[0].querySelector('a').getAttribute('href'), tr.children[2].querySelector('a').getAttribute('href')])), [
    ['https://github.com/acme/demo/issues/20', 'https://github.com/acme/lib/issues/5'],
    ['https://github.com/acme/demo/issues/24', 'https://github.com/acme/lib/issues/9'],
    ['https://github.com/acme/demo/issues/22', 'https://github.com/acme/secret/issues/7'],
  ]);
  assert.equal(await page.$('#og-more'), null, 'nothing waits, so no Read more');
  await context.close();
});

await check('G: a node pressed in the drawn chart names its repository, its role and its degree, and marks and brings its card into view', async () => {
  const { page, context, errors } = await open(routesOf(fixture()));
  await signIn(page);
  await until(page, DONE);
  await page.waitForSelector('#og-chart svg g.node', { timeout: 20000 });
  assert.equal(await page.$$eval('#og-chart g.node', (gs) => gs.length), 5);
  assert.deepEqual(await page.$$eval('#og-chart g.node', (gs) => gs.map((g) => ['public', 'internal', 'private', 'system'].find((c) => g.classList.contains(c)) || '').sort()), ['internal', 'private', 'public', 'public', 'system']);
  await page.click('#og-chart g.node[id*="-flowchart-i2-"]');
  await page.waitForFunction(() => document.getElementById('og-said').textContent !== '', null, { timeout: 8000 });
  assert.equal(await page.$eval('#og-said', (p) => p.textContent), 'lib, public: the library (depends on 0, depended on by 2).');
  assert.deepEqual(await page.$$eval('#og-repos .og__card--on', (cs) => cs.map((c) => c.id)), ['og-card-2']);
  assert.ok((await page.evaluate(() => window.__scrolled)).some((s) => /^ARTICLE:acme\/lib/.test(s)), 'the card was not brought into view');
  await page.click('#og-chart g.node[id*="-flowchart-i5-"]');
  await page.waitForFunction(() => /the grid/.test(document.getElementById('og-said').textContent), null, { timeout: 8000 });
  assert.equal(await page.$eval('#og-said', (p) => p.textContent), 'the grid, outside GitHub: a cluster (depends on 0, depended on by 1).');
  assert.deepEqual(await page.$$eval('#og-repos .og__card--on', (cs) => cs.map((c) => c.id)), [], 'a system has no card');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H: Open in the panel switches the console to that repository, whose Organization tab reads again and says it has no map', async () => {
  const routes = routesOf(fixture());
  routes['GET /repos/acme/lib'] = { full_name: 'acme/lib', default_branch: 'main', private: false, topics: [], id: 124, owner };
  routes['GET /repos/acme/lib/issues'] = [];
  routes['GET /repos/acme/lib/pulls'] = [];
  routes['GET /repos/acme/lib/actions/runs'] = { workflow_runs: [] };
  routes['GET /repos/acme/lib/contents/.github/symphony/workers'] = [];
  const { page, context, calls } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  await page.click('#og-card-2 button');
  const said = await until(page, 'No map: acme/lib has no .github/symphony/organization.json on main');
  assert.ok(said.startsWith('4 repositories listed for acme as you: 3 public, 1 private or internal, 1 archived. No map: acme/lib has no .github/symphony/organization.json on main, so only what GitHub lists is shown; add one as SchwingNet keeps it (its docs/research/organization-map.md). No task link crossing repositories has been read from acme/lib yet.'), said);
  assert.ok(calls.some((c) => c.key === 'GET /repos/acme/lib/contents/.github/symphony/organization.json'));
  assert.equal(await page.$eval('#og-chips', (b) => b.hidden), true);
  assert.equal(await page.$eval('#og-chart', (b) => b.hidden), true);
  assert.deepEqual(await texts(page, '#og-repos .og__name'), ['acme/demo', 'acme/lib', 'acme/secret', 'acme/extra']);
  assert.deepEqual(await page.$$eval('#og-repos .og__gap', (ps) => ps.map((p) => p.textContent)), []);
  assert.deepEqual(await page.$$eval('#og-repos .og__card button', (bs) => bs.map((b) => b.closest('.og__card').querySelector('.og__name').textContent.trim())), ['acme/demo', 'acme/secret', 'acme/extra']);
  await context.close();
});

await check('I: at most 40 blockers are read a press, the rest said in words and read by Read more', async () => {
  const f = { open: [], subIssues: {}, blockedBy: {} };
  for (let n = 100; n < 145; n++) { f.open.push(issue(n, 'Task ' + n, ['todo'], deps(1, 1))); f.blockedBy[n] = [elsewhere('acme/lib', 9, 'Release the library')]; }
  const { page, context, calls } = await open(routesOf(f), { extraRoutes: [stubRoute] });
  await signIn(page);
  const said = await until(page, '5 blocked issues not read yet; Read more reads the next 5.');
  assert.ok(said.includes('40 task links cross from acme/demo into 1 other repository. 5 blocked issues not read yet; Read more reads the next 5.'), said);
  assert.equal(blockedByReads(calls).length, 40);
  assert.deepEqual(blockedByReads(calls).slice(0, 2).concat(blockedByReads(calls).slice(-1)), ['#100', '#101', '#139'], 'by number');
  assert.equal(await heading(page, '#og-cross'), 'Task links that cross repositories (40)');
  assert.equal(await page.$eval('#og-more', (b) => b.textContent), 'Read 5 more');
  const lib = await cardOf(page, 'acme/lib');
  assert.deepEqual(lib.edges, ['Depended on by: demo (vendors), hidden (vendors).', '40 task links from acme/demo: 40 blockers and 0 sub-issues.']);
  await page.click('#og-more');
  await until(page, '45 task links cross from acme/demo into 1 other repository.');
  assert.equal(blockedByReads(calls).length, 45);
  assert.equal(await page.$('#og-more'), null);
  assert.ok(!/not read yet/.test(await words(page)));
  await context.close();
});

await check('J: under the rate limit\'s reserve, reached as the listing answers, the tab reads no blocker and says why, while the listing and the map are shown', async () => {
  const f = fixture();
  const routes = routesOf(f);
  routes['GET /orgs/acme/repos'] = resp(200, LISTED, { headers: { 'X-RateLimit-Remaining': '99', 'Access-Control-Expose-Headers': EXPOSE } });
  const { page, context, calls } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  const said = await until(page, 'Stopped: GitHub says this token has 99 calls left this hour, and the page keeps the last 100 for the rest of the console.');
  assert.ok(said.startsWith('4 repositories listed for acme as you'), said);
  assert.ok(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn')));
  // the draw may have read #22's blockers before the listing answered; the tab's own read, #24, never goes out
  assert.ok(blockedByReads(calls).every((k) => k === '#22'), blockedByReads(calls).join());
  assert.equal(await heading(page, '#og-edges'), 'Interfaces (4)');
  await context.close();
});

await check('K: a map that is not JSON, and one with no nodes and edges, are said so and leave the listing shown', async () => {
  let { page, context } = await open(routesOf(fixture(), { map: '{not json' }), { extraRoutes: [stubRoute] });
  await signIn(page);
  let said = await until(page, 'The map could not be read: the map is not JSON (');
  assert.ok(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn')));
  assert.ok(said.includes('No task link') || said.includes('task links cross'), said);
  assert.deepEqual(await texts(page, '#og-repos .og__name'), ['acme/demo', 'acme/lib', 'acme/secret', 'acme/extra']);
  assert.equal(await page.$eval('#og-chart', (b) => b.hidden), true);
  await context.close();
  ({ page, context } = await open(routesOf(fixture(), { map: { nodes: 'none' } }), { extraRoutes: [stubRoute] }));
  await signIn(page);
  said = await until(page, 'The map could not be read: the map has no nodes and edges lists.');
  assert.equal(await page.$eval('#og-edges', (b) => b.textContent), '');
  await context.close();
});

await check('L: a hostile name in the map is written into the chart as entities and into the table as text', async () => {
  const map = {
    nodes: [{ name: 'x"]; click', group: 'core', visibility: 'public', role: 'r' }, { name: '<b>bold</b>', group: 'core', visibility: 'public', role: '%%{init}' }],
    edges: [{ from: 'x"]; click', to: '<b>bold</b>', kind: 'a|b', what: '<i>w</i>', by: '$e' }],
  };
  const { page, context, errors } = await open(routesOf(fixture(), { map }), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  await drawn(page, 1);
  const chart = (await orgCharts(page))[0];
  assert.deepEqual(chart.split('\n').slice(0, 6), ['flowchart TD', '  subgraph g1["core (2)"]', '    i1["x#quot;]; click"]:::public', '    i2["#lt;b#gt;bold#lt;/b#gt;"]:::public', '  end', '  i1 -->|a#124;b| i2']);
  assert.deepEqual(await rows(page, '#og-edges'), [['x"]; click', 'a|b', '<b>bold</b>', '<i>w</i>', '$e']]);
  assert.equal(await page.$$eval('#og-edges b, #og-edges i, #og-repos b', (es) => es.length), 0);
  assert.deepEqual(await texts(page, '#og-chips button.chip'), ['All', 'core2', 'a|b1']);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('M: a listing GitHub refuses is said so, and the map is still drawn with every repository said to be unchecked', async () => {
  const { page, context } = await open(routesOf(fixture(), { listed: resp(403, { message: 'Forbidden' }) }), { extraRoutes: [stubRoute] });
  await signIn(page);
  const said = await until(page, DONE);
  assert.ok(/^The repositories of acme could not be listed \(.+\)\. The map of acme\/demo, written 2026-10-29, names 4 repositories/.test(said), said);
  assert.ok(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn')));
  await drawn(page, 1);
  assert.deepEqual(await texts(page, '#og-repos .og__name'), ['acme/demo', 'acme/lib', 'acme/secret', 'acme/hidden']);
  assert.deepEqual(await page.$$eval('#og-repos .og__gap', (ps) => ps.map((p) => p.textContent)), new Array(4).fill('Not checked against GitHub: its repositories could not be listed.'));
  assert.deepEqual(await page.$$eval('#og-repos .og__name a', (as) => as.length), 0);
  await context.close();
});

await check('N: Refresh reads the listing, the map and the blockers again; a tab left and opened again reads nothing more', async () => {
  const { page, context, calls } = await open(routesOf(fixture()), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  const before = calls.length;
  await toTab(page, 'dependencies');
  await toTab(page, 'organization');
  await sleep(500);
  assert.equal(calls.length, before, 'opening the tab again read: ' + calls.slice(before).map((c) => c.key).join());
  assert.equal(await words(page), await until(page, DONE));
  await page.click('#og-refresh');
  await page.waitForFunction((n) => document.querySelectorAll('#og-cross tbody tr').length === 3 && !/\.\.\./.test(document.getElementById('og-state').textContent) && performance.now() > n, 0, { timeout: 15000 });
  await until(page, DONE);
  const after = calls.slice(before).map((c) => c.key);
  assert.deepEqual(after.sort(), ['GET /orgs/acme/repos', 'GET /repos/acme/demo/contents/.github/symphony/organization.json', 'GET /repos/acme/demo/issues/24/dependencies/blocked_by']);
  assert.equal(await heading(page, '#og-cross'), 'Task links that cross repositories (3)');
  await context.close();
});

await check('O: the console\'s Refresh on a repository with no map reads it again and says so again, with no fault', async () => {
  const { page, context, calls, errors } = await open(routesOf(fixture(), { map: null }), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, 'No map: acme/demo has no .github/symphony/organization.json on main');
  const before = calls.length;
  await page.click('#cp-refresh');
  await page.waitForFunction((n) => performance.now() > n, 0);
  await until(page, 'No map: acme/demo has no .github/symphony/organization.json on main');
  await page.waitForFunction((n) => (window.__calls || 0) >= 0 && document.querySelectorAll('#og-repos .og__card').length === 4, 0, { timeout: 15000 });
  const after = calls.slice(before).map((c) => c.key);
  assert.ok(after.includes('GET /repos/acme/demo') && after.includes('GET /orgs/acme/repos') && after.includes('GET /repos/acme/demo/contents/.github/symphony/organization.json'), after.join());
  assert.deepEqual(errors, []);
  assert.equal(await page.$eval('#og-chart', (b) => b.hidden), true);
  assert.equal(await page.$eval('#og-chart', (b) => getComputedStyle(b).display), 'none');
  await context.close();
});

await check('P: a person\'s own repositories are listed under the viewer, which lists the private ones too, and another person\'s under that person with type=owner', async () => {
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
    const said = await until(page, 'No map: ' + login + '/mine has no');
    assert.ok(said.startsWith('1 repository listed for ' + login + ' as you: 0 public, 1 private or internal.'), said);
    const lists = calls.filter((c) => /\/repos(\?|$)/.test(c.url) && !/\/repos\//.test(c.url)).map((c) => c.url.replace('https://api.github.com', ''));
    await context.close();
    return lists;
  }
  assert.deepEqual(await run('tester'), ['/user/repos?affiliation=owner&per_page=100&sort=pushed']);
  assert.deepEqual(await run('other'), ['/users/other/repos?type=owner&per_page=100&sort=pushed']);
});

await check('Q: a group named constructor, a kind with brackets and a name that folds to nothing are drawn, the kind and the name as entities and a placeholder, with no fault', async () => {
  const map = {
    kinds: { 'runs (on) [x]': 'with brackets' },
    nodes: [{ name: 'constructor', group: 'constructor', visibility: 'public', role: 'r' }, { name: '\u65e5\u672c', group: 'toString', visibility: 'private', role: 'folds to nothing' }],
    edges: [{ from: 'constructor', to: '\u65e5\u672c', kind: 'runs (on) [x]', what: 'w', by: 'e' }],
  };
  const { page, context, errors } = await open(routesOf(fixture(), { map }), { extraRoutes: [stubRoute] });
  await signIn(page);
  await until(page, DONE);
  await drawn(page, 1);
  const chart = (await orgCharts(page))[0];
  assert.deepEqual(chart.split('\n').slice(0, 8), ['flowchart TD', '  subgraph g1["constructor (1)"]', '    i1["constructor"]:::public', '  end', '  subgraph g2["toString (1)"]', '    i2["unnamed"]:::private', '  end', '  i1 -->|runs #40;on#41; #91;x#93;| i2']);
  assert.deepEqual(await texts(page, '#og-chips button.chip'), ['All', 'constructor1', 'toString1', 'runs (on) [x]1']);
  await page.click('#og-chips button.chip:nth-child(2)');
  assert.equal(await heading(page, '#og-repos'), 'Repositories of constructor (1)');
  // the chip pressed keeps the keyboard, since the chips are flipped in place and never rebuilt
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'constructor1');
  assert.equal(await page.$eval('#og-chips button.chip:nth-child(2)', (b) => b.getAttribute('aria-pressed')), 'true');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('R: under the rate limit\'s reserve before the tab reads, the listing and the map wait and the words say why', async () => {
  const routes = routesOf(fixture());
  routes['GET /repos/acme/demo'] = resp(200, { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner }, { headers: { 'X-RateLimit-Remaining': '50', 'Access-Control-Expose-Headers': EXPOSE } });
  const { page, context, calls } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  const said = await until(page, 'The repositories of acme could not be listed (GitHub says this token has 50 calls left this hour');
  assert.ok(said.includes('The map could not be read: GitHub says this token has 50 calls left this hour'), said);
  assert.ok(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn')));
  assert.deepEqual(calls.filter((c) => /\/orgs\/acme\/repos|organization\.json/.test(c.key)), []);
  await context.close();
});

await check('S: a tab left and opened again while the listing is still being answered reuses the load, so the listing and the map are read once', async () => {
  const routes = routesOf(fixture());
  routes['GET /orgs/acme/repos'] = resp(200, LISTED, { delayMs: 1500 });
  const { page, context, calls } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  await sleep(300);
  await toTab(page, 'dependencies');
  await toTab(page, 'organization');
  await until(page, DONE);
  const reads = calls.map((c) => c.key).filter((k) => /\/orgs\/acme\/repos|organization\.json/.test(k)).sort();
  assert.deepEqual(reads, ['GET /orgs/acme/repos', 'GET /repos/acme/demo/contents/.github/symphony/organization.json']);
  await context.close();
});

await check('T: a repository whose record cannot be read is said so on the tab, in place of Reading', async () => {
  const routes = routesOf(fixture());
  routes['GET /repos/acme/demo'] = resp(500, { message: 'Server Error' });
  const { page, context, calls } = await open(routes, { extraRoutes: [stubRoute] });
  await signIn(page);
  const said = await until(page, 'Nothing to show: the record of acme/demo could not be read (');
  assert.ok(/The console's Refresh reads it again\.$/.test(said), said);
  assert.ok(await page.$eval('#og-state', (p) => p.classList.contains('admin__warn')));
  await toTab(page, 'dependencies');
  await toTab(page, 'organization');
  assert.ok((await words(page)).startsWith('Nothing to show: the record of acme/demo could not be read ('), await words(page));
  assert.deepEqual(calls.filter((c) => /\/orgs\/acme\/repos|organization\.json/.test(c.key)), []);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
