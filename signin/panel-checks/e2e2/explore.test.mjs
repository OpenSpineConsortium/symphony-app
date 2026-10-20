// Checks of the control panel's Explore tab (site branch claude/explore-tab, 2026-10-18; the owner's
// ask of that evening for a tab where one clicks, or points and scrolls, into an epic, then an issue,
// and on down to the logs of the workers' Claude runs) against a mocked GitHub API: the levels the
// tab draws from what the console read (the repository, a goal, its epic, the epic's tasks with their
// states, the open tasks in no epic), the levels it reads only when one goes into them (a task's pull
// request or its claim branch, the runs on that branch, a run's jobs and steps, a job's log, read
// once), a step's log cut to that step's lines by the times the job's steps carry, the step that
// runs Claude marked, the colour codes taken out and every line written as text, the wheel going in
// over a tile and out again, Backspace, Enter and the trail, the outline, a log the browser cannot
// read said in words with GitHub's link, an address that is not https never linked, a hostile title
// inert, and no read made once the token is under the reserve. Each check states what the page
// promises; a FAIL is a defect. Every token is a stand-in.
//
// The mutants that prove the checks bite are e2e2/mutants/x*.json, each with the checks that must
// catch it (.only) and this file named as its suite (.suite); e2e2/run-mutants.sh runs them.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const now = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 4).join('\n     ')); }
}

// the shipped script with its two sign-in constants emptied, so the token box shows; a mutant's
// replacement goes in as written
let script = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(script.includes(a), 'mutant text not found: ' + a.slice(0, 60)); script = script.replace(a, () => b); }
script = script.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");

// GitHub's log storage stands in as a server of this test's own on another origin, since Chromium
// sends a redirected request to the network and not through a route; it answers a plain read and
// records what it was sent
const stored = [];
const storage = http.createServer((q, r) => {
  stored.push({ method: q.method, headers: q.headers });
  if (q.method === 'OPTIONS') { r.writeHead(403); r.end(); return; }
  r.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  r.end(LOG_TEXT());
});
await new Promise((ok) => storage.listen(0, '127.0.0.1', ok));
const STORAGE = 'http://127.0.0.1:' + storage.address().port;
const resp = (status, body, extra) => Object.assign({ __r: true, status, body }, extra || {});
const HOSTILE = '<img src=x onerror="window.__pwned=1">';
function issue(n, title, labels, extra) {
  return Object.assign({
    number: n, title, state: 'open', html_url: 'https://github.com/acme/demo/issues/' + n, repository_url: 'https://api.github.com/repos/acme/demo',
    labels: labels.map((name) => ({ name })), updated_at: now,
  }, extra || {});
}
const subs = (completed, total) => ({ sub_issues_summary: { total, completed, percent_completed: total ? Math.round(100 * completed / total) : 0 } });
// a goal (#30) over an epic (#20) over three tasks (#21 closed, #22 claimed with a draft pull
// request, #23 todo with none), and three open tasks in no epic
const OPEN = [
  issue(20, 'Draw the board', ['epic'], subs(1, 3)),
  issue(22, 'Render the section', ['claimed', 'worker:alice']),
  issue(23, 'Write the body', ['todo']),
  issue(24, HOSTILE, ['todo']),
  issue(25, 'Fix the build', ['blocker']),
  issue(30, 'Ship the graph', ['goal', 'todo'], subs(0, 1)),
  issue(99, 'Settle the colours', ['todo']),
];
const SUB_ISSUES = { 20: [issue(21, 'Read the summary', ['todo'], { state: 'closed' }), OPEN[1], OPEN[2]], 30: [OPEN[0]] };
const PULLS = [{ number: 40, title: 'Render the section', draft: true, html_url: 'https://github.com/acme/demo/pull/40', body: 'Closes #22', head: { ref: 'claude/22', sha: 'abc', repo: { full_name: 'acme/demo' } }, base: { ref: 'main' }, user: { login: 'alice' }, updated_at: now }];
const RUN = { id: 501, name: 'workers', run_number: 7, status: 'completed', conclusion: 'success', event: 'push', created_at: now, html_url: 'https://github.com/acme/demo/actions/runs/501' };
function job(htmlUrl) {
  return {
    id: 601, name: 'work', status: 'completed', conclusion: 'failure', html_url: htmlUrl || 'https://github.com/acme/demo/actions/runs/501/job/601',
    steps: [
      { number: 1, name: 'Set up job', status: 'completed', conclusion: 'success', started_at: '2026-10-18T10:00:00Z', completed_at: '2026-10-18T10:00:04Z' },
      { number: 2, name: 'Run Claude', status: 'completed', conclusion: 'failure', started_at: '2026-10-18T10:00:05Z', completed_at: '2026-10-18T10:00:29Z' },
      { number: 3, name: 'Notify', status: 'completed', conclusion: 'skipped', started_at: '2026-10-18T10:00:20Z', completed_at: '2026-10-18T10:00:20Z' },
      { number: 4, name: 'Post', status: 'completed', conclusion: 'success', started_at: '2026-10-18T10:00:30Z', completed_at: '2026-10-18T10:00:31Z' },
    ],
  };
}
// a line before the first step, a step's last line in the second the next starts, a skipped step
// that starts in the same second as the next, and a line with no time
const LOG_TEXT = () => LOG;
const LOG = [
  '2026-10-18T09:59:59.9000000Z early line',
  '2026-10-18T10:00:01.1234567Z ##[group]Runner',
  '2026-10-18T10:00:02.0000000Z setup line',
  '2026-10-18T10:00:05.1000000Z ##[error]setup said late',
  '2026-10-18T10:00:05.2000000Z ##[group]Run claude',
  '2026-10-18T10:00:06.5000000Z \x1b[32mclaude says hi<script>window.__pwned=2</script>\x1b[0m',
  'a line with no time, the step\'s own',
  '2026-10-18T10:00:10.0000000Z ##[error]bad thing',
  '2026-10-18T10:00:25.0000000Z still thinking',
  '2026-10-18T10:00:30.1000000Z ##[error]Process completed with exit code 1.',
  '2026-10-18T10:00:30.2000000Z ##[group]Run post',
  '2026-10-18T10:00:31.0000000Z post line',
].join('\n');
// a step's log far taller than any window, with one error in its middle
const LONG_LOG = ['2026-10-18T10:00:05.2000000Z ##[group]Run claude'].concat(Array.from({ length: 400 }, (_, i) => '2026-10-18T10:00:06.0000000Z ' + (i === 200 ? '##[error]the one error' : 'line ' + i))).join('\n');

// the routes; the runs list answers by branch, so the console's own Runs read gets none
function routes(opts) {
  opts = opts || {};
  const r = {
    'GET /user': { login: 'tester' },
    'GET /repos/acme/demo': { full_name: 'acme/demo', html_url: 'https://github.com/acme/demo', description: 'A demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
    'GET /repos/acme/demo/issues': OPEN,
    'GET /repos/acme/demo/contents/STATE.md': resp(404, { message: 'Not Found' }),
    'GET /repos/acme/demo/contents/.github/symphony/workers': [],
    'GET /repos/acme/demo/pulls': PULLS,
    'GET /repos/acme/demo/actions/runs': (url) => ({ workflow_runs: url.searchParams.get('branch') === 'claude/22' ? [RUN] : [] }),
    'GET /repos/acme/demo/actions/runs/501/jobs': { jobs: [job(opts.jobUrl)] },
    'GET /repos/acme/demo/actions/jobs/601/logs': opts.log === 'abort' ? { __abort: true } : opts.log === 'redirect' ? { __redirect: STORAGE + '/job-logs/601?sig=x' } : { __text: opts.log === 'long' ? LONG_LOG : LOG },
  };
  for (const n of Object.keys(SUB_ISSUES)) r['GET /repos/acme/demo/issues/' + n + '/sub_issues'] = SUB_ISSUES[n];
  // the Dependencies tab's last read, the goal's, says how many calls are left, so the reads after
  // it go by that count
  if (opts.left) r['GET /repos/acme/demo/issues/30/sub_issues'] = resp(200, SUB_ISSUES[30], { headers: { 'X-RateLimit-Remaining': String(opts.left) } });
  return r;
}

// the storage stand-in is on this machine, which Chromium's checks on private addresses would refuse
// a public page; GitHub's storage is public, so the checks are switched off for this suite alone
const browser = await chromium.launch({ args: ['--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,LocalNetworkAccessChecks'] });
await consoleTabs(browser);
// VIEW=WxH runs the checks in another window, as the screenshots for a person do
const VIEW = process.env.VIEW ? { width: Number(process.env.VIEW.split('x')[0]), height: Number(process.env.VIEW.split('x')[1]) } : { width: 1366, height: 657 };
// a phone is a window with touch, as Chromium plays an iPhone held upright or sideways
const PHONE = { width: 390, height: 844 }, SIDEWAYS = { width: 844, height: 390 }, WIDE = { width: 1440, height: 900 };
async function open(rt, storage, view) {
  view = view || VIEW;
  const phone = view.width <= 900 || view.height <= 520;
  const context = await browser.newContext(phone ? { viewport: view, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: view });
  const calls = [];
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    calls.push({ key, url: req.url() });
    let r = rt[key];
    if (typeof r === 'function') r = await r(url, req);
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag, Link, X-RateLimit-Remaining' };
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) });
    if (r.__abort) return route.abort('failed');
    if (r.__redirect) return route.fulfill({ status: 302, headers: Object.assign(headers, { Location: r.__redirect }), body: '' });
    if (r.__text !== undefined) return route.fulfill({ status: 200, contentType: 'text/plain', headers, body: r.__text });
    const spec = r.__r ? r : { status: 200, body: r };
    Object.assign(headers, spec.headers || {});
    return route.fulfill({ status: spec.status, contentType: 'application/json', headers, body: JSON.stringify(spec.body) });
  });
  stored.length = 0;
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  await context.route('**/assets/js/vendor/mermaid.min.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: "window.mermaid={initialize:function(){},render:function(){return Promise.resolve({svg:'<svg></svg>'});}};" }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/symphony/control/');
  await page.evaluate((st) => { localStorage.clear(); sessionStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, storage || {});
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  return { context, page, calls, errors, stored };
}
async function toExplore(page) {
  await page.click('#rail-explore');
  await page.waitForFunction(() => !document.getElementById('tab-explore').hidden && location.hash === '#explore', null, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelectorAll('#ex-stage .ex__tile').length > 0, null, { timeout: 8000 });
}
const tiles = (page) => page.$$eval('#ex-stage .ex__tile', (ts) => ts.map((t) => ({ kind: t.querySelector('.ex__kind').firstChild.textContent, title: t.querySelector('.ex__title').textContent, state: (/ex__s--([a-z]+)/.exec(t.className) || [])[1], claude: !!t.querySelector('.ex__claude') })));
const trail = (page) => page.$eval('#ex-path', (n) => Array.from(n.children).filter((c) => !c.classList.contains('ex__sep')).map((c) => c.textContent));
async function goIn(page, title) {
  const before = await trail(page);
  const i = (await tiles(page)).findIndex((t) => t.title === title);
  assert.ok(i >= 0, 'no tile ' + title + ' among ' + JSON.stringify((await tiles(page)).map((t) => t.title)));
  await page.click('#ex-stage .ex__tile[data-ex="' + i + '"]');
  await page.waitForFunction((n) => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === n, before.length + 1, { timeout: 8000 });
}
// SHOTS names a folder to keep a picture of each level a check passes through, for a person to look at
const shot = (page, name) => process.env.SHOTS ? page.screenshot({ path: process.env.SHOTS + '/' + name + '.png' }) : null;
const settled = (page) => page.waitForFunction(() => !/Reading/.test(document.getElementById('ex-status').textContent), null, { timeout: 8000 });
const lines = (page) => page.$$eval('#ex-stage .ex__line', (ls) => ls.map((l) => ({ text: l.textContent, cls: l.className.replace('ex__line', '').trim() })));
const below = (calls) => calls.filter((c) => /\/actions\/runs\?|\/actions\/runs\/[0-9]+\/jobs|\/actions\/jobs\/[0-9]+\/logs/.test(c.url) && /branch=|jobs|logs/.test(c.url)).map((c) => c.url.replace('https://api.github.com', ''));

await check('XP1: the tab sits in the rail right after Dependencies, and the repository\'s level shows its goal and the open tasks in no epic, nothing below a task read', async () => {
  const { context, page, calls, errors } = await open(routes());
  try {
    const rail = await page.$$eval('.console__rail [data-tab]', (bs) => bs.map((b) => b.getAttribute('data-tab')));
    assert.equal(rail.indexOf('dependencies') + 1, rail.indexOf('explore'), 'Explore is not just after Dependencies: ' + rail.join(','));
    await toExplore(page);
    await settled(page);
    await shot(page, 'explore-top');
    assert.deepEqual(await trail(page), ['acme/demo']);
    assert.deepEqual((await tiles(page)).map((t) => t.kind + '|' + t.title + '|' + t.state), ['Goal|#30 Ship the graph|todo', 'Group|Not in an epic|open']);
    assert.match(await page.textContent('#ex-github'), /Open on GitHub/);
    assert.equal(await page.getAttribute('#ex-github', 'href'), 'https://github.com/acme/demo');
    assert.deepEqual(below(calls), [], 'something below a task was read before anyone went into it');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP2: going in shows the epic, then its tasks with their states, the trail and the outline following', async () => {
  const { context, page, errors } = await open(routes());
  try {
    await toExplore(page);
    await goIn(page, '#30 Ship the graph');
    assert.deepEqual((await tiles(page)).map((t) => t.kind + '|' + t.title), ['Epic|#20 Draw the board']);
    await goIn(page, '#20 Draw the board');
    await shot(page, 'explore-epic');
    assert.deepEqual((await tiles(page)).map((t) => t.title + '|' + t.state), ['#21 Read the summary|closed', '#22 Render the section|claimed', '#23 Write the body|todo']);
    assert.deepEqual(await trail(page), ['acme/demo', '#30 Ship the graph', '#20 Draw the board']);
    const outline = await page.$$eval('#ex-tree .ex__nodename', (bs) => bs.map((b) => b.textContent));
    assert.ok(outline.includes('#22 Render the section') && outline.includes('Not in an epic'), 'the outline lacks a level: ' + JSON.stringify(outline));
    assert.equal(await page.textContent('#ex-tree .ex__current'), '#20 Draw the board');
    await page.click('#ex-path .ex__crumb >> nth=0');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 1);
    await goIn(page, 'Not in an epic');
    assert.deepEqual((await tiles(page)).map((t) => t.title.slice(0, 4)), ['#24 ', '#25 ', '#99 ']);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP3: a task leads to its pull request, the runs on its branch, a run\'s jobs and a job\'s steps, each read once when gone into, the Claude step marked', async () => {
  const { context, page, calls, errors } = await open(routes());
  try {
    await toExplore(page);
    await goIn(page, '#30 Ship the graph');
    await goIn(page, '#20 Draw the board');
    await goIn(page, '#22 Render the section');
    await settled(page);
    assert.deepEqual((await tiles(page)).map((t) => t.kind + '|' + t.title + '|' + t.state), ['Pull request|#40 Render the section|draft']);
    assert.deepEqual(below(calls), []);
    await goIn(page, '#40 Render the section');
    await settled(page);
    assert.deepEqual(below(calls), ['/repos/acme/demo/actions/runs?branch=claude%2F22&per_page=20']);
    assert.deepEqual((await tiles(page)).map((t) => t.kind + '|' + t.title + '|' + t.state), ['Run|workers #7|done']);
    await goIn(page, 'workers #7');
    await settled(page);
    const t = await tiles(page);
    assert.deepEqual(t.map((x) => x.kind + '|' + x.title + '|' + x.state + '|' + x.claude), ['Job|work|failed|true']);
    await goIn(page, 'work');
    await shot(page, 'explore-job');
    assert.deepEqual((await tiles(page)).map((x) => x.title + '|' + x.state + '|' + x.claude), ['1. Set up job|done|false', '2. Run Claude|failed|true', '3. Notify|skipped|false', '4. Post|done|false', 'The whole log|open|false']);
    // out to the pull request and back in: the runs and the jobs are not read again
    await page.click('#ex-path .ex__crumb >> nth=4');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 5);
    await goIn(page, 'workers #7');
    await goIn(page, 'work');
    assert.equal(below(calls).length, 2, 'a level was read twice: ' + JSON.stringify(below(calls)));
    // Read again reads the level afresh
    await page.click('#ex-path .ex__crumb >> nth=5');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 6);
    await page.click('#ex-head .ex__again');
    await settled(page);
    assert.equal(below(calls).length, 3, 'Read again did not read the jobs: ' + JSON.stringify(below(calls)));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

async function toJob(page) {
  await toExplore(page);
  for (const t of ['#30 Ship the graph', '#20 Draw the board', '#22 Render the section']) await goIn(page, t);
  await settled(page);
  for (const t of ['#40 Render the section', 'workers #7', 'work']) { await goIn(page, t); await settled(page); }
}

await check('XP4: a step shows its own lines of the job\'s log, by time, as text with the colour codes out; the log is read once for every step', async () => {
  const { context, page, calls, errors } = await open(routes());
  try {
    await toJob(page);
    await goIn(page, '2. Run Claude');
    await page.waitForSelector('#ex-stage .ex__line', { timeout: 8000 });
    assert.deepEqual(await lines(page), [{ text: 'Run claude', cls: 'ex__group' }, { text: 'claude says hi<script>window.__pwned=2</script>', cls: '' }, { text: 'a line with no time, the step\'s own', cls: '' }, { text: 'bad thing', cls: 'ex__error' }, { text: 'still thinking', cls: '' }, { text: 'Process completed with exit code 1.', cls: 'ex__error' }]);
    assert.match(await page.textContent('#ex-status'), /step that runs Claude/);
    await shot(page, 'explore-log');
    assert.equal(await page.$('#ex-stage script'), null);
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 7);
    await goIn(page, '1. Set up job');
    await page.waitForSelector('#ex-stage .ex__line', { timeout: 8000 });
    assert.deepEqual(await lines(page), [{ text: 'early line', cls: '' }, { text: 'Runner', cls: 'ex__group' }, { text: 'setup line', cls: '' }, { text: 'setup said late', cls: 'ex__error' }]);
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 7);
    await goIn(page, '3. Notify');
    await page.waitForFunction(() => /No line of the log falls in this step/.test(document.getElementById('ex-stage').textContent), null, { timeout: 8000 });
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 7);
    await goIn(page, '4. Post');
    await page.waitForSelector('#ex-stage .ex__line', { timeout: 8000 });
    assert.deepEqual((await lines(page)).map((l) => l.text), ['Run post', 'post line']);
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 7);
    await goIn(page, 'The whole log');
    await page.waitForSelector('#ex-stage .ex__line', { timeout: 8000 });
    assert.equal((await lines(page)).length, 12);
    assert.equal(calls.filter((c) => /\/logs$/.test(c.url)).length, 1, 'the log was read more than once');
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP5: zooming out past the whole level comes out one level for one turn of the wheel, the wheel over a card zooms and never goes in, Enter, Escape and Backspace move, and a task with no pull request leads to its claim branch', async () => {
  const { context, page, calls, errors } = await open(routes());
  try {
    await toExplore(page);
    await goIn(page, '#30 Ship the graph');
    await goIn(page, '#20 Draw the board');
    await page.hover('#ex-stage .ex__tile[data-ex="0"]');
    // a glide inward over a card zooms about it and goes into nothing
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -60); await sleep(30); }
    await sleep(400);
    assert.equal((await trail(page)).length, 3, 'a turn inward moved a level: ' + JSON.stringify(await trail(page)));
    assert.ok(await page.evaluate(() => { const m = /scale\(([0-9.]+)\)/.exec(document.querySelector('#ex-stage .ex__sheet').style.transform); return m && Number(m[1]) > 1.05; }), 'the wheel did not zoom in');
    // a glide outward: back to the whole level, then out of it, one level and no more
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 80); await sleep(30); }
    await sleep(400);
    assert.equal((await trail(page)).length, 2, 'one gesture outward did not move exactly one level: ' + JSON.stringify(await trail(page)));
    await page.focus('#ex-stage .ex__tile[data-ex="0"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 3, null, { timeout: 4000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 2, null, { timeout: 4000 });
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 1, null, { timeout: 4000 });
    await page.focus('#ex-stage .ex__tile[data-ex="0"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-ex')), '1', 'the right arrow did not move to the next card');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-ex')), '0');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-ex')), '1');
    await goIn(page, '#30 Ship the graph');
    await goIn(page, '#20 Draw the board');
    await goIn(page, '#23 Write the body');
    await settled(page);
    assert.deepEqual((await tiles(page)).map((t) => t.kind + '|' + t.title), ['Branch|claude/23']);
    await goIn(page, 'claude/23');
    await settled(page);
    assert.ok(below(calls).includes('/repos/acme/demo/actions/runs?branch=claude%2F23&per_page=20'));
    assert.match(await page.textContent('#ex-stage'), /No GitHub Actions run on this branch/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP6: a log the browser cannot read is said in words with GitHub\'s link, and an address that is not https is never linked', async () => {
  let { context, page, errors } = await open(routes({ log: 'abort' }));
  try {
    await toJob(page);
    await goIn(page, '2. Run Claude');
    await page.waitForFunction(() => /could not be read/.test(document.getElementById('ex-stage').textContent), null, { timeout: 8000 });
    assert.match(await page.textContent('#ex-stage'), /GitHub keeps this log where your browser may not read it from this page/);
    assert.equal(await page.getAttribute('#ex-stage a.ex__link', 'href'), 'https://github.com/acme/demo/actions/runs/501/job/601');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  ({ context, page, errors } = await open(routes({ log: 'abort', jobUrl: 'javascript:window.__pwned=3' })));
  try {
    await toJob(page);
    assert.equal(await page.isHidden('#ex-github'), true, 'a javascript: address was offered as Open on GitHub');
    await goIn(page, '2. Run Claude');
    await page.waitForFunction(() => /could not be read/.test(document.getElementById('ex-stage').textContent), null, { timeout: 8000 });
    assert.equal(await page.$('#ex-stage a'), null, 'a javascript: address was linked');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP7: a hostile title is drawn as text, and no read below a task is made once the token is under the reserve', async () => {
  const { context, page, calls, errors } = await open(routes({ left: 50 }));
  try {
    await toExplore(page);
    await goIn(page, 'Not in an epic');
    assert.ok((await tiles(page)).some((t) => t.title === '#24 ' + HOSTILE));
    assert.equal(await page.$('#ex-stage img'), null);
    await page.click('#ex-path .ex__crumb >> nth=0');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 1);
    for (const t of ['#30 Ship the graph', '#20 Draw the board', '#22 Render the section', '#40 Render the section']) await goIn(page, t);
    await settled(page);
    assert.match(await page.textContent('#ex-stage'), /calls left this hour/);
    assert.deepEqual(below(calls), []);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP8: a job\'s log GitHub sends from its storage is read there with no token and no header that asks the storage first', async () => {
  const { context, page, errors, stored } = await open(routes({ log: 'redirect' }));
  try {
    await toJob(page);
    await goIn(page, '2. Run Claude');
    await page.waitForSelector('#ex-stage .ex__line', { timeout: 8000 });
    assert.equal((await lines(page))[0].text, 'Run claude');
    assert.deepEqual(stored.map((r) => r.method), ['GET'], 'the storage was asked something other than one plain read: ' + JSON.stringify(stored.map((r) => r.method)));
    assert.equal(stored[0].headers['authorization'], undefined, 'the token went to the storage');
    assert.equal(stored[0].headers['x-github-api-version'], undefined, 'a header of GitHub\'s own went to the storage');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP9: choosing another repository while the tab is open shows that repository and nothing of the first', async () => {
  const rt = routes();
  rt['GET /repos/acme/beta'] = { full_name: 'acme/beta', html_url: 'https://github.com/acme/beta', default_branch: 'main', private: false, topics: ['symphony'], id: 124, owner: { id: 77, login: 'acme' } };
  // beta's issues come slowly, so the tab is seen between the switch and their answer
  rt['GET /repos/acme/beta/issues'] = () => sleep(2500).then(() => [Object.assign(issue(3, 'A task of beta', ['todo']), { html_url: 'https://github.com/acme/beta/issues/3', repository_url: 'https://api.github.com/repos/acme/beta' })]);
  rt['GET /repos/acme/beta/pulls'] = [];
  rt['GET /repos/acme/beta/contents/.github/symphony/workers'] = [];
  const { context, page, errors } = await open(rt, { symphony_panel_repos: JSON.stringify(['acme/demo', 'acme/beta']) });
  try {
    await toExplore(page);
    await goIn(page, '#30 Ship the graph');
    // the side column is folded while the tab is shown; a press on it brings the repository's box back
    const side = await page.$eval('.console__side', (n) => ({ w: n.clientWidth, h: n.clientHeight }));
    await page.click('.console__side', { position: { x: Math.floor(side.w / 2), y: side.h - 12 } });
    await page.waitForFunction(() => !document.getElementById('console').classList.contains('console--exwide'), null, { timeout: 4000 });
    await page.selectOption('#cp-repo', 'acme/beta');
    await sleep(800);
    assert.ok(!/acme\/demo|Ship the graph/.test(await page.textContent('#tab-explore')), 'the first repository is shown under the second while its issues are read');
    await page.waitForFunction(() => /acme\/beta/.test(document.getElementById('ex-path').textContent), null, { timeout: 8000 });
    await page.waitForFunction(() => document.querySelectorAll('#ex-stage .ex__tile').length > 0, null, { timeout: 8000 });
    assert.deepEqual(await trail(page), ['acme/beta']);
    assert.deepEqual((await tiles(page)).map((t) => t.title), ['Not in an epic']);
    assert.ok(!/acme\/demo|Ship the graph/.test(await page.textContent('#tab-explore')), 'the first repository is still shown');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP10: where the Dependencies tab could not read the sub-issues, an epic says so and is never called empty', async () => {
  const rt = routes();
  rt['GET /repos/acme/demo/issues/20/sub_issues'] = resp(500, { message: 'Server Error' });
  const { context, page, errors } = await open(rt);
  try {
    await toExplore(page);
    await page.waitForFunction(() => document.querySelectorAll('#ex-stage .ex__tile').length === 3, null, { timeout: 8000 });
    assert.deepEqual((await tiles(page)).map((t) => t.kind + '|' + t.title), ['Goal|#30 Ship the graph', 'Epic|#20 Draw the board', 'Group|Open tasks']);
    await goIn(page, '#20 Draw the board');
    const text = await page.textContent('#ex-stage');
    assert.match(text, /Its sub-issues could not be read/);
    assert.ok(!/add tasks on the issue/.test(text), 'an epic whose sub-issues were not read was called empty');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

// the scale the stage draws the level's cards at, from the sheet's transform
const scaleOf = (page) => page.evaluate(() => { const sh = document.querySelector('#ex-stage .ex__sheet'); const m = sh && /translate\(([-0-9.]+)px, ([-0-9.]+)px\) scale\(([0-9.]+)\)/.exec(sh.style.transform); return m ? { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) } : null; });
// what of the tab overflows: a box of it that scrolls or could, a card outside the stage, and the
// window scrolled sideways
const overflow = (page) => page.evaluate(() => {
  const out = [], stage = document.getElementById('ex-stage').getBoundingClientRect();
  for (const n of document.querySelectorAll('#tab-explore, #tab-explore *')) {
    const cs = getComputedStyle(n);
    if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1)) out.push('scrolls: ' + (n.id || n.className));
  }
  for (const t of document.querySelectorAll('#ex-stage .ex__tile')) {
    const r = t.getBoundingClientRect();
    if (r.left < stage.left - 1 || r.right > stage.right + 1 || r.top < stage.top - 1 || r.bottom > stage.bottom + 1) out.push('outside the stage: ' + t.textContent.slice(0, 30));
  }
  if (document.scrollingElement.scrollWidth > innerWidth + 1) out.push('the window pans sideways');
  return out;
});
const settle = () => sleep(450);

await check('XP11: at 1440 x 900, on a phone upright and on one sideways, the level is drawn whole with no box that scrolls, the tab taking most of the panel on a computer and the screen under the back bar on a phone', async () => {
  for (const [name, view] of [['wide', WIDE], ['phone', PHONE], ['sideways', SIDEWAYS]]) {
    const { context, page, errors } = await open(routes(), null, view);
    try {
      await toExplore(page);
      await goIn(page, '#30 Ship the graph');
      await goIn(page, '#20 Draw the board');
      await settle();
      await shot(page, 'explore-' + name);
      assert.deepEqual(await overflow(page), [], name);
      const m = await page.evaluate(() => {
        const tab = document.getElementById('tab-explore').getBoundingClientRect(), side = document.querySelector('.console__side').getBoundingClientRect(), ask = document.getElementById('cp-askbar').getBoundingClientRect();
        return { tab: [tab.left, tab.top, tab.right, tab.bottom], side: side.width, ask: ask.height, w: innerWidth, h: innerHeight, stage: document.getElementById('ex-stage').getBoundingClientRect().height };
      });
      if (name === 'wide') {
        assert.ok(m.side < 80, 'the side column did not fold: ' + m.side);
        assert.equal(m.ask, 0, 'the Ask Claude bar did not fold');
        assert.ok(m.tab[2] - m.tab[0] > 0.9 * m.w && m.stage > 0.6 * m.h, 'the tab takes too little of the window: ' + JSON.stringify(m));
      } else {
        // on a phone every tab fills the screen under the back bar (site branch
        // claude/project-thread-6cxgh2, the owner's square tab buttons): the console covers the
        // screen, the side column is not drawn and the tab takes the stage's whole width
        const deck = await page.evaluate(() => { const r = document.getElementById('console').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
        assert.ok(Math.abs(deck[0]) <= 1 && Math.abs(deck[1]) <= 1 && Math.abs(deck[2] - m.w) <= 1 && Math.abs(deck[3] - m.h) <= 1, name + ': the console does not take the whole screen: ' + JSON.stringify(deck));
        assert.ok(m.side === 0 && m.ask === 0 && m.tab[2] - m.tab[0] > 0.85 * m.w, name + ': the tab does not take the screen: ' + JSON.stringify(m));
        // held sideways the back bar and the foot share the little height, so two fifths there, as
        // the Dependencies tab keeps its stage (graph.test.mjs, BL)
        assert.ok(m.stage > (name === 'sideways' ? 0.4 : 0.5) * m.h, name + ': the stage is small: ' + JSON.stringify(m));
        // the site bar's handle is over no control of the tab
        const under = await page.evaluate(() => {
          const h = document.querySelector('.console__barhandle');
          if (!h || !h.getClientRects().length) return 'no handle';
          const r = h.getBoundingClientRect();
          return Array.from(document.querySelectorAll('#tab-explore button, #tab-explore a')).filter((b) => { const q = b.getBoundingClientRect(); return q.width && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; }).map((b) => b.textContent);
        });
        assert.deepEqual(under, [], name + ': the handle lies over a control');
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

await check('XP12: Panel, or a press on the folded side column or foot, brings them back; Panel folds them again, and another tab shows the console as it was', async () => {
  const { context, page, errors } = await open(routes());
  try {
    await toExplore(page);
    const sideW = () => page.$eval('.console__side', (n) => n.getBoundingClientRect().width);
    assert.ok(await sideW() < 80);
    assert.equal(await page.getAttribute('#ex-wide', 'aria-pressed'), 'false');
    await page.click('#ex-wide');
    assert.ok(await sideW() > 150, 'Panel did not bring the side column back');
    assert.ok(await page.isVisible('#cp-repo-shown'), 'the repository\'s box is not back');
    assert.equal(await page.getAttribute('#ex-wide', 'aria-pressed'), 'true');
    await page.click('#ex-wide');
    assert.ok(await sideW() < 80, 'Panel did not fold the side column again');
    // a press on the foot's empty part
    const foot = await page.$eval('.console__status', (n) => { const r = n.getBoundingClientRect(); return { x: r.right - 6, y: r.top + r.height / 2 }; });
    await page.mouse.click(foot.x, foot.y);
    assert.ok(await sideW() > 150, 'a press on the folded foot did not bring the panel back');
    await page.click('#ex-wide');
    await page.click('#rail-board');
    await page.waitForFunction(() => location.hash === '#board');
    assert.ok(await sideW() > 150, 'another tab kept the side column folded');
    assert.ok(await page.isVisible('#cp-refresh'), 'another tab kept the foot folded');
    await page.click('#rail-explore');
    await page.waitForFunction(() => location.hash === '#explore');
    assert.ok(await sideW() < 80, 'coming back to Explore did not fold the side column');
    // a press on the folded side column's grip unfolds and drags nothing
    const before = await page.evaluate(() => document.getElementById('console').style.getPropertyValue('--side-w'));
    const grip = await page.$eval('.console__split[data-split="side"]', (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x + 120, grip.y, { steps: 4 });
    await page.mouse.up();
    assert.ok(await sideW() > 150, 'a press on the folded grip did not bring the panel back');
    assert.equal(await page.evaluate(() => document.getElementById('console').style.getPropertyValue('--side-w')), before, 'the press that unfolded also dragged the grip');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  const p = await open(routes(), null, PHONE);
  try {
    await toExplore(p.page);
    // on a phone the tab already fills the screen under the back bar, folded or not, so it stays in
    // the stage either way and Panel changes nothing there
    assert.equal(await p.page.$eval('#tab-explore', (n) => getComputedStyle(n).position), 'static', 'the folded tab left the stage on a phone');
    await p.page.click('#ex-wide');
    assert.equal(await p.page.$eval('#tab-explore', (n) => getComputedStyle(n).position), 'static', 'Panel moved the tab out of the stage on a phone');
    assert.deepEqual(await overflow(p.page), []);
    assert.deepEqual(p.errors, []);
  } finally { await p.context.close(); }
});

await check('XP13: + and Whole zoom and draw the level whole again, - past the whole level comes out of it, a double click zooms, and the right arrow on the stage or a swipe goes to the level beside', async () => {
  const { context, page, errors } = await open(routes());
  try {
    await toExplore(page);
    await goIn(page, '#30 Ship the graph');
    await goIn(page, '#20 Draw the board');
    await settle();
    const k0 = (await scaleOf(page)).k;
    await page.click('#ex-zoom-in');
    await settle();
    assert.ok((await scaleOf(page)).k > k0 * 1.2, '+ did not zoom in');
    await page.click('#ex-zoom-whole');
    await settle();
    assert.ok(Math.abs((await scaleOf(page)).k - k0) < 1e-3, 'Whole did not draw the level whole');
    const box = await page.$eval('#ex-stage', (n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    await page.mouse.dblclick(box.r - 20, box.b - 20);
    await settle();
    assert.ok((await scaleOf(page)).k > k0 * 1.5, 'a double click did not zoom in');
    await page.click('#ex-zoom-whole');
    await settle();
    await goIn(page, '#22 Render the section');
    await settled(page);
    await page.focus('#ex-stage');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /#23 Write the body/.test(document.querySelector('#ex-path .ex__here').textContent), null, { timeout: 4000 });
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => /#22 Render the section/.test(document.querySelector('#ex-path .ex__here').textContent), null, { timeout: 4000 });
    // a swipe to the left, on the stage's ground, brings the next task in
    await settled(page);
    await page.mouse.move(box.r - 30, box.t + 30);
    await page.mouse.down();
    await page.mouse.move(box.l + 60, box.t + 34, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => /#23 Write the body/.test(document.querySelector('#ex-path .ex__here').textContent), null, { timeout: 4000 });
    assert.equal((await trail(page)).length, 4);
    await page.click('#ex-zoom-out');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 3, null, { timeout: 4000 });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP14: a log taller than the window opens at a size to read, on its error, and the wheel moves along it without leaving it', async () => {
  const { context, page, errors } = await open(routes({ log: 'long' }));
  try {
    await toJob(page);
    await goIn(page, '2. Run Claude');
    await page.waitForSelector('#ex-stage .ex__line', { timeout: 8000 });
    await settle();
    await shot(page, 'explore-long-log');
    const at = await scaleOf(page);
    assert.ok(at && Math.abs(at.k - 1) < 0.01, 'the log is not drawn at its own size: ' + JSON.stringify(at));
    const seen = await page.evaluate(() => { const e = document.querySelector('#ex-stage .ex__error').getBoundingClientRect(), s = document.getElementById('ex-stage').getBoundingClientRect(); return e.top >= s.top && e.bottom <= s.bottom; });
    assert.ok(seen, 'the error is not in view');
    await page.hover('#ex-stage');
    await page.mouse.wheel(0, 300);
    await settle();
    const after = await scaleOf(page);
    assert.ok(after.y < at.y - 100 && Math.abs(after.k - 1) < 0.01, 'the wheel did not move along the log: ' + JSON.stringify([at, after]));
    assert.equal((await trail(page)).length, 8, 'the wheel left the log');
    assert.deepEqual(await overflow(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP15: a level of few cards grows to fill the stage, and a level of many is drawn whole in more columns', async () => {
  const many = routes();
  const lots = Array.from({ length: 40 }, (_, i) => issue(200 + i, 'Task number ' + (200 + i), ['todo']));
  many['GET /repos/acme/demo/issues'] = OPEN.concat(lots);
  const { context, page, errors } = await open(many, null, WIDE);
  try {
    await toExplore(page);
    await goIn(page, '#30 Ship the graph');
    await settle();
    const one = await page.$eval('#ex-stage .ex__tile', (t) => t.getBoundingClientRect().width);
    assert.ok(one > 232 * 1.3, 'one card was not grown: ' + one);
    await page.click('#ex-path .ex__crumb >> nth=0');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 1);
    await goIn(page, 'Not in an epic');
    await settle();
    await shot(page, 'explore-many');
    assert.equal((await tiles(page)).length, 43);
    assert.ok(Number(await page.$eval('#ex-stage .ex__grid', (g) => g.style.getPropertyValue('--ex-cols'))) >= 6, 'many cards kept few columns');
    assert.deepEqual(await overflow(page), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});


await check('XP16: a short log keeps its place under the wheel, which never takes the person out of it, and its lines are copied whole from a button', async () => {
  const { context, page, errors } = await open(routes());
  try {
    await toJob(page);
    await goIn(page, '2. Run Claude');
    await page.waitForSelector('#ex-stage .ex__line', { timeout: 8000 });
    await settle();
    await page.hover('#ex-stage');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 200); await sleep(80); }
    await settle();
    assert.equal((await trail(page)).length, 8, 'the wheel left a short log');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('#ex-head button:has-text("Copy the lines")');
    await page.waitForFunction(() => /Copied/.test(document.getElementById('ex-status').textContent), null, { timeout: 4000 });
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /^Run claude/m);
    assert.doesNotMatch(copied, /##\[/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP17: a double click on a card goes one level, the arrows move between cards while zoomed in, and a held arrow on the stage steps sideways once', async () => {
  const { context, page, calls, errors } = await open(routes());
  try {
    await toExplore(page);
    const i = (await tiles(page)).findIndex((t) => t.title === '#30 Ship the graph');
    // a double click's two clicks, the second landing where the first was, on the next level's card
    await page.evaluate((i) => {
      const at = (n) => document.querySelector('#ex-stage .ex__tile[data-ex="' + n + '"]');
      at(i).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      at(0).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    }, i);
    await settle();
    assert.equal((await trail(page)).length, 2, 'a double click went past the card it was on');
    await goIn(page, '#20 Draw the board');
    await settle();
    await page.focus('#ex-stage .ex__tile[data-ex="0"]');
    await page.click('#ex-zoom-in');
    await page.click('#ex-zoom-in');
    await settle();
    await page.focus('#ex-stage .ex__tile[data-ex="0"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-ex')), '1', 'an arrow panned in place of moving to the next card');
    await page.click('#ex-zoom-whole');
    await page.click('#ex-path .ex__crumb >> nth=0');
    await page.waitForFunction(() => document.querySelectorAll('#ex-path > :not(.ex__sep)').length === 1);
    await goIn(page, 'Not in an epic');
    await settle();
    const loose = (await tiles(page)).map((t) => t.title);
    assert.ok(loose.length >= 3, 'too few loose tasks to hold an arrow over: ' + JSON.stringify(loose));
    await goIn(page, loose[0]);
    await settled(page);
    calls.length = 0;
    await page.focus('#ex-stage');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.up('ArrowRight');
    await settle();
    assert.equal(await page.textContent('#ex-path .ex__here'), loose[1], 'a held arrow stepped more than once');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP18: a log follows its box when Panel brings the side column back, its lines never running past the stage', async () => {
  const { context, page, errors } = await open(routes({ log: 'long' }), null, WIDE);
  try {
    await toJob(page);
    await goIn(page, '2. Run Claude');
    await page.waitForSelector('#ex-stage .ex__line', { timeout: 8000 });
    await settle();
    await page.click('#ex-wide');
    await settle();
    const m = await page.evaluate(() => { const s = document.getElementById('ex-stage').getBoundingClientRect(), h = document.querySelector('#ex-stage .ex__sheet--log').getBoundingClientRect(); return { stageR: s.right, sheetR: h.right }; });
    assert.ok(m.sheetR <= m.stageR + 1, 'the log runs past the stage: ' + JSON.stringify(m));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('XP19: signed out, a phone at the address #explore scrolls the sign-in card as it always does, and nothing of the fold applies', async () => {
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
    await page.goto(BASE + '/symphony/control/#explore');
    await sleep(500);
    // the console is fixed over a phone's screen, so the sign-in card scrolls inside itself
    const m = await page.evaluate(() => ({ body: getComputedStyle(document.getElementById('cp-gate')).overflowY, fixed: getComputedStyle(document.getElementById('tab-explore')).position, gate: !document.getElementById('cp-app').classList.contains('hidden') }));
    assert.equal(m.gate, false);
    assert.ok(m.body === 'auto' || m.body === 'scroll', 'the sign-in card cannot scroll');
    assert.notEqual(m.fixed, 'fixed');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await browser.close();
storage.close();
console.log(results.filter((r) => r.startsWith('PASS')).length + ' pass, ' + results.filter((r) => r.startsWith('FAIL')).length + ' fail');
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
