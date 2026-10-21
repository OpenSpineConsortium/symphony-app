// Checks of the control panel's Explore tab as a planning canvas (site branch
// claude/explore-brainstorm, 2026-10-21; the owner's ask that Explore "have claude suggest new
// connections between the dependency", "suggest new nodes" and "push the alterations in the
// dependencies to the actual tasks"), against a mocked GitHub API: an epic's sub-issues and the
// issue outside it that blocks one of them drawn as cards, GitHub's blocked-by links as lines, the
// question Ask Claude for ideas puts in the Claude box and posts only on Ask, the answer's `link` and
// `node` lines drawn as ideas with Accept, Edit and Dismiss, Connect joining two cards, unlinking a
// pair joined on GitHub and refusing a loop, the push writing as the person in order (the issue, its
// place under the epic, then the links, each by the issue's id) and stopping at a refusal with the
// rest kept, Undo taking a push back, a hostile title drawn as text, and the tab fitting a laptop and
// a phone with no page scroll. Each check states what the page promises; a FAIL is a defect. Every
// token is a stand-in.
//
// The mutants that prove the checks bite are e2e2/mutants/b*.json, each with the checks that must
// catch it (.only) and this file named as its suite (.suite); e2e2/run-mutants.sh runs them.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
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

// the shipped script with its two sign-in constants emptied, so the token box shows, and the
// assistant's cadence shortened to milliseconds; a mutant's replacement goes in as written
let script = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(script.includes(a), 'mutant text not found: ' + a.slice(0, 60)); script = script.replace(a, () => b); }
script = script.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
for (const [name, value] of Object.entries({ ASSISTANT_POLL_MS: 300, ASSISTANT_SLOW_MS: 300, ASSISTANT_AFTER_MS: 1200 })) {
  const line = new RegExp('var ' + name + ' = [0-9]+;');
  assert.ok(line.test(script), 'the constant ' + name + ' was not found in the script');
  script = script.replace(line, 'var ' + name + ' = ' + value + ';');
}

const resp = (status, body, extra) => Object.assign({ __r: true, status, body }, extra || {});
const HOSTILE = '<img src=x onerror="window.__pwned=1">';
const HOSTILE2 = '<svg onload="window.__pwned=2"></svg>';
function issue(n, title, labels, extra) {
  return Object.assign({
    id: 9000 + n, number: n, title, state: 'open', html_url: 'https://github.com/acme/demo/issues/' + n, repository_url: 'https://api.github.com/repos/acme/demo',
    labels: labels.map((name) => ({ name })), updated_at: now,
  }, extra || {});
}
const subs = (completed, total) => ({ sub_issues_summary: { total, completed, percent_completed: 0 } });
const deps = (open, total) => ({ issue_dependencies_summary: { blocked_by: open, total_blocked_by: total, blocking: 0, total_blocking: 0 } });
// an epic (#20) over three tasks: #21 to do, #22 claimed, #23 to do and blocked by #22 and by #25,
// which is in no epic; a second epic (#30) over #31, whose title is hostile
const OPEN = [
  issue(20, 'Live demo', ['epic'], subs(0, 3)),
  issue(21, 'Freeze the frames', ['todo']),
  issue(22, 'Overlay renderer', ['claimed', 'worker:alice']),
  issue(23, 'Record the sweep', ['todo'], deps(2, 2)),
  issue(25, 'Latency probe', ['todo']),
  issue(30, 'Data catalog', ['epic'], subs(0, 1)),
  issue(31, HOSTILE, ['todo']),
];
const byNumber = (n) => OPEN.find((x) => x.number === n);
const SUB_ISSUES = { 20: [21, 22, 23].map(byNumber), 30: [byNumber(31)] };
const BLOCKED_BY = { 23: [byNumber(22), byNumber(25)] };
const board = '# Board\n\nRendered ' + now + '.\n\n## Queue\n\nNone.\n';
function baseRoutes() {
  const r = {
    'GET /user': { login: 'tester' },
    'GET /repos/acme/demo': { full_name: 'acme/demo', html_url: 'https://github.com/acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
    'GET /repos/acme/demo/issues': OPEN,
    'GET /repos/acme/demo/contents/STATE.md': { encoding: 'base64', content: b64(board) },
    'GET /repos/acme/demo/contents/.github/symphony/workers': [],
    'GET /repos/acme/demo/contents/.github/symphony/assistant.md': { encoding: 'base64', content: b64('# The assistant\n') },
    'GET /repos/acme/demo/collaborators/tester/permission': { permission: 'write', role_name: 'write', user: { login: 'tester' } },
    'GET /repos/acme/demo/actions/secrets': { total_count: 1, secrets: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN', created_at: now, updated_at: now }] },
    'GET /repos/acme/demo/actions/runs': { workflow_runs: [] },
    'GET /repos/acme/demo/pulls': [],
  };
  for (const n of Object.keys(SUB_ISSUES)) r['GET /repos/acme/demo/issues/' + n + '/sub_issues'] = SUB_ISSUES[n];
  for (const n of Object.keys(BLOCKED_BY)) r['GET /repos/acme/demo/issues/' + n + '/dependencies/blocked_by'] = BLOCKED_BY[n];
  return r;
}
// the assistant issue #50 the page remembers, and Claude's answer on it once a question is posted
const FINISHED = '**Claude finished @tester\'s task in 1m 2s** —— [View job](https://github.com/acme/demo/actions/runs/9)\n\n---\n\n';
function withAnswer(routes, blockLines) {
  const asked = [];
  routes['GET /repos/acme/demo/issues/50'] = issue(50, 'Assistant: tester', ['assistant']);
  routes['GET /repos/acme/demo/labels/assistant'] = { name: 'assistant' };
  routes['POST /repos/acme/demo/issues/50/comments'] = (url, req, call) => { asked.push(call.body.body); return { id: 1001, created_at: '2026-10-21T10:00:00Z', updated_at: '2026-10-21T10:00:00Z', user: { login: 'tester', type: 'User' }, body: call.body.body }; };
  routes['GET /repos/acme/demo/issues/50/comments'] = () => asked.length
    ? [{ id: 1001, created_at: '2026-10-21T10:00:00Z', updated_at: '2026-10-21T10:00:00Z', user: { login: 'tester', type: 'User' }, body: asked[0] },
      { id: 2001, created_at: '2026-10-21T10:01:00Z', updated_at: '2026-10-21T10:02:00Z', user: { login: 'claude[bot]', type: 'Bot' }, body: FINISHED + 'Two ideas for #20.\n\n```symphony\n' + blockLines.join('\n') + '\n```\n' }]
    : [];
  return asked;
}

const browser = await chromium.launch();
await consoleTabs(browser);
const LAPTOP = { width: 1366, height: 657 }, PHONE = { width: 390, height: 844 };
async function open(routes, opts) {
  opts = opts || {};
  const view = opts.view || LAPTOP, phone = view.width <= 900;
  const context = await browser.newContext(phone ? { viewport: view, isMobile: true, hasTouch: true } : { viewport: view });
  const calls = [];
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    let body;
    try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
    const call = { key, url: req.url(), body };
    calls.push(call);
    let r = routes[key];
    if (typeof r === 'function') r = r(url, req, call);
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag, Link, X-RateLimit-Remaining' };
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) });
    const spec = r.__r ? r : { status: 200, body: r };
    if (/raw\+json/.test(req.headers()['accept'] || '') && spec.body && spec.body.encoding === 'base64') return route.fulfill({ status: spec.status, contentType: 'application/vnd.github.raw+json', headers, body: Buffer.from(spec.body.content, 'base64').toString('utf8') });
    if (spec.status === 204) return route.fulfill({ status: 204, headers, body: '' });
    return route.fulfill({ status: spec.status, contentType: 'application/json', headers, body: JSON.stringify(spec.body) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  await context.route('**/assets/js/vendor/mermaid.min.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: "window.mermaid={initialize:function(){},render:function(){return Promise.resolve({svg:'<svg></svg>'});}};" }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/symphony/control/');
  await page.evaluate((st) => { localStorage.clear(); sessionStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, opts.storage || { symphony_panel_assistant: '{"acme/demo":50}' });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  return { context, page, calls, errors };
}
async function toExplore(page) {
  if (await page.isVisible('#cp-back')) await page.click('#cp-back');
  await page.click('#rail-explore');
  await page.waitForFunction(() => !document.getElementById('tab-explore').hidden && location.hash === '#explore', null, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelectorAll('#bs-canvas .bs__card').length > 0, null, { timeout: 8000 });
}
const cards = (page) => page.$$eval('#bs-canvas .bs__card', (cs) => cs.map((c) => ({ key: c.getAttribute('data-key'), where: (/bs__card--(github|pending|idea)/.exec(c.className) || [])[1], title: c.querySelector('.bs__title').textContent, kind: c.querySelector('.bs__kind').textContent })));
const edges = (page) => page.$$eval('#bs-canvas .bs__edge', (es) => es.map((e) => e.getAttribute('data-from') + '>' + e.getAttribute('data-to') + ':' + (/bs__edge--(github|pending|idea|unlink)/.exec(e.getAttribute('class')) || [])[1]).sort());
const tray = (page) => page.$$eval('#bs-pending .bs__item b', (bs) => bs.map((b) => b.textContent));
// SHOTS names a folder to keep a picture of what a check sees, for a person to look at
const shot = (page, name) => process.env.SHOTS ? page.screenshot({ path: process.env.SHOTS + '/' + name + '.png' }) : null;
const writes = (calls) => calls.filter((c) => !/^GET /.test(c.key));
const card = (page, key) => '#bs-canvas .bs__card[data-key="' + key + '"]';
async function pressIn(page, key, label) {
  await page.click(card(page, key) + ' button:text-is("' + label + '")');
}
async function connect(page, a, b) {
  if ((await page.getAttribute('#bs-connect', 'aria-pressed')) !== 'true') await page.click('#bs-connect');
  await page.click(card(page, a) + ' .bs__title');
  await page.click(card(page, b) + ' .bs__title');
}
async function answered(page, routes) {
  await page.click('#bs-ideas');
  await page.waitForFunction(() => document.getElementById('dlg-claude').open, null, { timeout: 12000 });
  await page.click('#cp-as-ask');
  await page.waitForFunction(() => /Show it on Explore|drawn on the Explore tab/.test(document.getElementById('cp-as-actions').textContent), null, { timeout: 12000 });
  await page.click('#dlg-claude .cpdlg__close');
  await page.waitForFunction(() => !document.getElementById('dlg-claude').open);
  await page.waitForFunction(() => document.querySelector('#bs-canvas .bs__card--idea'), null, { timeout: 8000 });
}

await check('BS1: the tab sits after Dependencies and draws the first epic\'s tasks and the issue outside it that blocks one, with GitHub\'s links, writing nothing', async () => {
  const { context, page, calls, errors } = await open(baseRoutes());
  try {
    const rail = await page.$$eval('.console__rail [data-tab]', (bs) => bs.map((b) => b.getAttribute('data-tab')));
    assert.equal(rail.indexOf('dependencies') + 1, rail.indexOf('explore'), 'Explore is not just after Dependencies: ' + rail.join(','));
    await toExplore(page);
    const chips = await page.$$eval('#bs-epics .chip', (cs) => cs.map((c) => c.textContent + ':' + c.getAttribute('aria-pressed')));
    assert.deepEqual(chips, ['#20 Live demo:true', '#30 Data catalog:false']);
    const c = await cards(page);
    assert.deepEqual(c.map((x) => x.key + ':' + x.where).sort(), ['i21:github', 'i22:github', 'i23:github', 'i25:github']);
    assert.match(c.find((x) => x.key === 'i22').kind, /#22 claimed/);
    assert.match(c.find((x) => x.key === 'i23').kind, /#23 to do/);
    assert.deepEqual(await edges(page), ['i22>i23:github', 'i25>i23:github']);
    // every link runs left to right: a blocker stands in a column before what it blocks
    const x = await page.$$eval('#bs-canvas .bs__card', (cs) => Object.fromEntries(cs.map((e) => [e.getAttribute('data-key'), parseFloat(e.style.left)])));
    assert.ok(x.i22 < x.i23 && x.i25 < x.i23, 'a blocker is not left of what it blocks: ' + JSON.stringify(x));
    assert.match(await page.textContent('#bs-status'), /^4 tasks on GitHub\.$/);
    assert.equal(await page.isDisabled('#bs-push'), true);
    assert.deepEqual(writes(calls).map((w) => w.key), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('BS2: Ask Claude for ideas fills the Claude box with a question naming the epic and the two line forms, and posts nothing until Ask', async () => {
  const routes = baseRoutes();
  const asked = withAnswer(routes, []);
  const { context, page, calls, errors } = await open(routes);
  try {
    await toExplore(page);
    await page.click('#bs-ideas');
    await page.waitForFunction(() => document.getElementById('dlg-claude').open, null, { timeout: 12000 });
    const q = await page.inputValue('#cp-as-q');
    assert.match(q, /epic #20 \(Live demo\)/);
    assert.match(q, /"link #A blocks #B why \.\.\."/);
    assert.match(q, /"node TITLE under #20 blocks #X why \.\.\."/);
    await sleep(400);
    assert.deepEqual(writes(calls).map((w) => w.key), [], 'something was written before Ask');
    await page.click('#cp-as-ask');
    await page.waitForFunction(() => document.getElementById('cp-as-q').value === '', null, { timeout: 8000 });
    assert.equal(asked.length, 1);
    assert.match(asked[0], /^@claude Help me plan epic #20/);
    assert.match(asked[0], /focus: #20/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('BS3: the answer\'s link and node lines are drawn as ideas; Accept moves a node with its links to the changes, Dismiss drops a link, and nothing is written', async () => {
  const routes = baseRoutes();
  withAnswer(routes, ['link #21 blocks #22 why the overlay reads the frames', 'node Witness frames under #20 blocks #23 after #21 why nothing owns them', 'link #31 blocks #30', 'tab explore']);
  const { context, page, calls, errors } = await open(routes);
  try {
    await toExplore(page);
    await answered(page, routes);
    const c = await cards(page);
    const idea = c.find((x) => x.where === 'idea');
    assert.ok(idea, 'no idea card: ' + JSON.stringify(c));
    assert.equal(idea.title, 'Witness frames');
    assert.match(idea.kind, /Claude's idea/);
    assert.deepEqual((await edges(page)).filter((e) => /idea/.test(e)), ['i21>' + idea.key + ':idea', 'i21>i22:idea', idea.key + '>i23:idea'].sort());
    // a link that touches no card of this epic is not drawn here
    assert.ok(!(await edges(page)).some((e) => /i31|i30/.test(e)), 'a link of another epic was drawn');
    assert.match(await page.textContent('#bs-canvas .bs__ideas'), /#21 blocks #22 the overlay reads the frames/);
    await shot(page, 'explore-ideas');
    await pressIn(page, idea.key, 'Accept');
    assert.deepEqual(await tray(page), ['New task under #20', '"Witness frames" blocks #23', '#21 blocks "Witness frames"']);
    assert.equal((await cards(page)).find((x) => x.key === idea.key).where, 'pending');
    await page.click('#bs-canvas .bs__ideas button:text-is("Dismiss")');
    assert.equal(!!(await page.$('#bs-canvas .bs__ideas')), false, 'the dismissed link is still offered');
    assert.match(await page.textContent('#bs-push'), /^Push 3 changes to GitHub$/);
    assert.deepEqual(writes(calls).map((w) => w.key), ['POST /repos/acme/demo/issues/50/comments']);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('BS4: Connect joins two cards as a change, a pair joined on GitHub is offered for unlinking, and a link that would close a loop is refused in words', async () => {
  const { context, page, calls, errors } = await open(baseRoutes());
  try {
    await toExplore(page);
    await connect(page, 'i21', 'i25');
    assert.deepEqual(await tray(page), ['#21 blocks #25']);
    await connect(page, 'i22', 'i23');
    assert.deepEqual(await tray(page), ['#21 blocks #25', 'Remove: #22 blocks #23']);
    assert.ok((await edges(page)).includes('i22>i23:unlink'));
    // #23 waits on #25, which now waits on #21, so #23 blocking #21 closes a loop
    await connect(page, 'i23', 'i21');
    assert.match(await page.textContent('#msg'), /would close a loop/);
    assert.deepEqual(await tray(page), ['#21 blocks #25', 'Remove: #22 blocks #23']);
    // the same pair pressed again takes the change back
    await connect(page, 'i21', 'i25');
    assert.deepEqual(await tray(page), ['Remove: #22 blocks #23']);
    await page.keyboard.press('Escape');
    assert.equal(await page.getAttribute('#bs-connect', 'aria-pressed'), 'false');
    assert.deepEqual(writes(calls).map((w) => w.key), []);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

function pushRoutes(fail) {
  const routes = baseRoutes();
  routes['POST /repos/acme/demo/issues'] = (url, req, call) => resp(201, issue(40, call.body.title, call.body.labels));
  routes['POST /repos/acme/demo/issues/20/sub_issues'] = resp(201, issue(20, 'Live demo', ['epic']));
  routes['POST /repos/acme/demo/issues/23/dependencies/blocked_by'] = resp(201, issue(23, 'Record the sweep', ['todo']));
  routes['POST /repos/acme/demo/issues/40/dependencies/blocked_by'] = fail ? resp(422, { message: 'Validation Failed' }) : resp(201, issue(40, 'x', []));
  routes['DELETE /repos/acme/demo/issues/23/dependencies/blocked_by/9022'] = resp(200, issue(23, 'Record the sweep', ['todo']));
  routes['POST /repos/acme/demo/issues/22/dependencies/blocked_by'] = resp(201, issue(22, 'x', []));
  routes['DELETE /repos/acme/demo/issues/23/dependencies/blocked_by/9040'] = resp(200, issue(23, 'x', []));
  routes['DELETE /repos/acme/demo/issues/40/dependencies/blocked_by/9021'] = resp(200, issue(40, 'x', []));
  routes['DELETE /repos/acme/demo/issues/20/sub_issue'] = resp(200, issue(20, 'Live demo', ['epic']));
  routes['PATCH /repos/acme/demo/issues/40'] = resp(200, issue(40, 'x', [], { state: 'closed' }));
  return routes;
}
async function planned(page) {
  await page.click('#bs-node');
  await page.fill('#bs-node-title', 'Witness frames');
  await page.fill('#bs-node-why', 'The frames every checkpoint draws');
  await page.click('#bs-node-save');
  const ref = (await cards(page)).find((x) => x.where === 'pending').key;
  await connect(page, ref, 'i23');
  await connect(page, 'i21', ref);
  await connect(page, 'i22', 'i23');
  await page.click('#bs-connect');
  return ref;
}

await check('BS5: Push writes as the person, the issue first, then its place under the epic, the unlink and the links by issue id; Undo takes each back in reverse', async () => {
  const { context, page, calls, errors } = await open(pushRoutes(false));
  try {
    await toExplore(page);
    await planned(page);
    assert.deepEqual(await tray(page), ['New task under #20', '"Witness frames" blocks #23', '#21 blocks "Witness frames"', 'Remove: #22 blocks #23']);
    await shot(page, 'explore-changes');
    await page.click('#bs-push');
    await page.waitForFunction(() => /^Pushed 4 changes/.test(document.getElementById('bs-status').textContent), null, { timeout: 8000 });
    const w = writes(calls);
    assert.deepEqual(w.map((x) => x.key), [
      'POST /repos/acme/demo/issues',
      'POST /repos/acme/demo/issues/20/sub_issues',
      'DELETE /repos/acme/demo/issues/23/dependencies/blocked_by/9022',
      'POST /repos/acme/demo/issues/23/dependencies/blocked_by',
      'POST /repos/acme/demo/issues/40/dependencies/blocked_by',
    ]);
    assert.deepEqual(w[0].body.labels, ['todo']);
    assert.equal(w[0].body.title, 'Task: Witness frames');
    assert.match(w[0].body.body, /The frames every checkpoint draws/);
    assert.deepEqual(w[1].body, { sub_issue_id: 9040 });
    assert.deepEqual(w[3].body, { issue_id: 9040 });
    assert.deepEqual(w[4].body, { issue_id: 9021 });
    assert.deepEqual(await tray(page), []);
    assert.equal(await page.isVisible('#bs-undo'), true);
    const before = w.length;
    await page.click('#bs-undo');
    await page.waitForFunction(() => /The last push is undone/.test(document.getElementById('bs-status').textContent), null, { timeout: 8000 });
    const u = writes(calls).slice(before);
    assert.deepEqual(u.map((x) => x.key), [
      'DELETE /repos/acme/demo/issues/40/dependencies/blocked_by/9021',
      'DELETE /repos/acme/demo/issues/23/dependencies/blocked_by/9040',
      'POST /repos/acme/demo/issues/23/dependencies/blocked_by',
      'DELETE /repos/acme/demo/issues/20/sub_issue',
      'PATCH /repos/acme/demo/issues/40',
    ]);
    assert.deepEqual(u[2].body, { issue_id: 9022 });
    assert.deepEqual(u[3].body, { sub_issue_id: 9040 });
    assert.deepEqual(u[4].body, { state: 'closed', state_reason: 'not_planned' });
    assert.equal(await page.isVisible('#bs-undo'), false);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('BS6: a push GitHub refuses part way stops there, says what was done, keeps the rest to push, and Undo takes back only what was written', async () => {
  const { context, page, calls, errors } = await open(pushRoutes(true));
  try {
    await toExplore(page);
    await planned(page);
    await page.click('#bs-push');
    await page.waitForFunction(() => /^Pushed 3 changes, then stopped: /.test(document.getElementById('bs-status').textContent), null, { timeout: 8000 });
    // the new task is #40 now, so the link left to push names it by its number
    assert.deepEqual(await tray(page), ['#21 blocks #40']);
    assert.equal(await page.isDisabled('#bs-push'), false);
    const before = writes(calls).length;
    await page.click('#bs-undo');
    await page.waitForFunction(() => /The last push is undone/.test(document.getElementById('bs-status').textContent), null, { timeout: 8000 });
    assert.deepEqual(writes(calls).slice(before).map((x) => x.key), [
      'DELETE /repos/acme/demo/issues/23/dependencies/blocked_by/9040',
      'POST /repos/acme/demo/issues/23/dependencies/blocked_by',
      'DELETE /repos/acme/demo/issues/20/sub_issue',
      'PATCH /repos/acme/demo/issues/40',
    ]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('BS7: a hostile title, an issue\'s or an idea\'s, is drawn as text', async () => {
  const routes = baseRoutes();
  withAnswer(routes, ['node ' + HOSTILE2 + ' under #30 why ' + HOSTILE]);
  const { context, page, errors } = await open(routes);
  try {
    await toExplore(page);
    await page.click('#bs-epics .chip:nth-child(2)');
    await page.waitForFunction(() => document.querySelector('#bs-canvas .bs__card[data-key="i31"]'));
    await answered(page, routes);
    const titles = (await cards(page)).map((x) => x.title);
    assert.ok(titles.includes(HOSTILE) && titles.includes(HOSTILE2), 'the hostile titles are not drawn as text: ' + JSON.stringify(titles));
    assert.equal(await page.evaluate(() => window.__pwned || 0), 0);
    assert.equal(await page.$('#bs-canvas img'), null);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('BS8: on a laptop and on a phone the tab fits the window with no page scroll, the cards inside the canvas and the push button in view', async () => {
  for (const view of [LAPTOP, PHONE]) {
    const { context, page, errors } = await open(baseRoutes(), { view });
    try {
      await toExplore(page);
      await shot(page, 'explore-' + view.width);
      const m = await page.evaluate(() => {
        const r = (id) => document.getElementById(id).getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, sy: document.documentElement.scrollHeight - window.innerHeight, canvas: r('bs-canvas').width, push: r('bs-push').bottom, ih: window.innerHeight };
      });
      assert.ok(m.sw <= m.iw, view.width + ': the page scrolls sideways: ' + JSON.stringify(m));
      assert.ok(m.canvas > 200, view.width + ': the canvas is ' + m.canvas + 'px wide');
      if (view === LAPTOP) assert.ok(m.push <= m.ih, 'the push button is below the window: ' + JSON.stringify(m));
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

await check('BS9: a link of Claude\'s that would close a loop is refused on Accept in words and never reaches the changes', async () => {
  const routes = baseRoutes();
  // #23 already waits on #22 on GitHub, so #23 blocking #22 would close a loop
  withAnswer(routes, ['link #23 blocks #22 why backwards', 'node Spare frames under #20 why nothing owns them']);
  const { context, page, calls, errors } = await open(routes);
  try {
    await toExplore(page);
    await answered(page, routes);
    await page.click('#bs-canvas .bs__ideas button:text-is("Accept")');
    assert.match(await page.textContent('#msg'), /would close a loop/);
    assert.deepEqual(await tray(page), []);
    assert.ok(await page.$('#bs-canvas .bs__ideas'), 'the refused idea is no longer offered');
    assert.deepEqual(writes(calls).map((w) => w.key), ['POST /repos/acme/demo/issues/50/comments']);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});


await check('BS10: an idea GitHub already holds is not offered: a task of that title under its epic, or a link on GitHub; and an idea card is accepted before Connect takes it', async () => {
  const routes = baseRoutes();
  withAnswer(routes, ['node Task: Freeze the frames under #20 why again', 'link #22 blocks #23 why again', 'node Spare frames under #20 why new']);
  const { context, page, calls, errors } = await open(routes);
  try {
    await toExplore(page);
    await answered(page, routes);
    const ideas = (await cards(page)).filter((x) => x.where === 'idea');
    assert.deepEqual(ideas.map((x) => x.title), ['Spare frames']);
    assert.equal(!!(await page.$('#bs-canvas .bs__ideas')), false, 'a link GitHub holds is offered');
    await page.click('#bs-connect');
    await page.click(card(page, ideas[0].key) + ' .bs__title');
    assert.match(await page.textContent('#msg'), /Accept the new task first/);
    await page.click(card(page, 'i21') + ' .bs__title');
    await page.click(card(page, 'i22') + ' .bs__title');
    assert.deepEqual(await tray(page), ['#21 blocks #22']);
    assert.deepEqual(writes(calls).map((w) => w.key), ['POST /repos/acme/demo/issues/50/comments']);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('BS11: a task whose issue was opened but not placed under its epic is placed, not opened again, on the next Push, and one Undo takes back both pushes', async () => {
  const routes = pushRoutes(false);
  let placed = 0;
  routes['POST /repos/acme/demo/issues/20/sub_issues'] = () => (++placed === 1 ? resp(502, { message: 'Server Error' }) : resp(201, issue(20, 'Live demo', ['epic'])));
  const { context, page, calls, errors } = await open(routes);
  try {
    await toExplore(page);
    await planned(page);
    await page.click('#bs-push');
    await page.waitForFunction(() => /^Pushed 0 changes, then stopped: /.test(document.getElementById('bs-status').textContent), null, { timeout: 8000 });
    await page.click('#bs-push');
    await page.waitForFunction(() => /^Pushed 4 changes to GitHub/.test(document.getElementById('bs-status').textContent), null, { timeout: 8000 });
    assert.equal(writes(calls).filter((w) => w.key === 'POST /repos/acme/demo/issues').length, 1, 'the task was opened twice');
    assert.equal(placed, 2);
    const before = writes(calls).length;
    await page.click('#bs-undo');
    await page.waitForFunction(() => /The last push is undone/.test(document.getElementById('bs-status').textContent), null, { timeout: 8000 });
    assert.ok(writes(calls).slice(before).some((w) => w.key === 'PATCH /repos/acme/demo/issues/40'), 'the first push\'s issue was not closed');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});


await browser.close();
console.log(results.filter((r) => r.startsWith('PASS')).length + ' pass, ' + results.filter((r) => r.startsWith('FAIL')).length + ' fail');
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
