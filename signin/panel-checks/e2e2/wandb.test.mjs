// The W&B tab (site branch claude/project-thread-wxs74i, 2026-10-21, the owner's "add wandb
// tracking/viewing as a tab under control panel ... integrate the wandb account i made into the
// style of the control panel"): the person's W&B projects, runs and charts read through the sign-in
// service's /wandb/graphql with a key kept on this browser under the GitHub login. GitHub and the
// service are mocked; the service answers as W&B's GraphQL API does (wandb/apis/public).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const SERVICE = 'https://signin.example.test';
let real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(real.includes(a), 'mutant text not found: ' + a.slice(0, 60)); real = real.replace(a, b); }
// the service is the test's; GitHub's sign-in stays off, so the panel is entered with a pasted token;
// a running run is read again in a second and a half here, in place of fifteen
real = real.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '" + SERVICE + "';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';")
  .replace('var WANDB_LIVE_MS = 15000;', 'var WANDB_LIVE_MS = 1500;');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

let passed = 0, failed = 0;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '-', String(e && e.message || e).split('\n')[0]); }
}

const hist = (key, n, f) => Array.from({ length: n }, (_, i) => ({ _step: i, [key]: f(i) }));
function wandbState(extra) {
  return Object.assign({
    viewer: { username: 'greg', entity: 'greg', teams: { edges: [{ node: { name: 'spine-lab' } }] } },
    projects: { greg: ['SchwingNet', 'scratch'], 'spine-lab': ['shared'] },
    runs: {
      'greg/SchwingNet': [
        { name: 'r1', displayName: 'v1-level-train', state: 'running', createdAt: '2026-10-21T19:00:00', heartbeatAt: new Date(Date.now() - 20000).toISOString().replace(/\.\d+Z$/, ''), historyLineCount: 12, group: 'run-7', jobType: 'train', summaryMetrics: JSON.stringify({ loss: 0.4321, 'val/acc': 0.875, _step: 11, _runtime: 300, 'system/gpu': 90, media: { _type: 'image-file' } }), user: { username: 'greg' } },
        { name: 'r0', displayName: 'v1-level-eval', state: 'crashed', createdAt: '2026-10-21T10:00:00', heartbeatAt: '2026-10-21T10:30:00', historyLineCount: 3, group: 'run-6', jobType: 'evaluate', summaryMetrics: '{"top1": 0.81}', user: { username: 'greg' } },
      ],
      'greg/scratch': [{ name: 's1', displayName: 'try', state: 'finished', createdAt: '2026-10-20T10:00:00', heartbeatAt: '2026-10-20T11:00:00', historyLineCount: 1, summaryMetrics: '{}', user: { username: 'greg' } }],
    },
    keys: { r1: { lastStep: 11, keys: { loss: { typeCounts: [{ type: 'number', count: 12 }] }, 'val/acc': { typeCounts: [{ type: 'number', count: 12 }] }, lr: { typeCounts: [{ type: 'number', count: 12 }] }, epoch: { typeCounts: [{ type: 'number', count: 12 }] }, 'val/f1': { typeCounts: [{ type: 'number', count: 12 }] }, _runtime: { typeCounts: [{ type: 'number', count: 12 }] }, 'system/gpu': { typeCounts: [{ type: 'number', count: 12 }] }, witness: { typeCounts: [{ type: 'image-file', count: 2 }] } } } },
    history: { loss: hist('loss', 12, (i) => 1 / (i + 1)), 'val/acc': hist('val/acc', 12, (i) => i / 12), 'val/f1': hist('val/f1', 12, (i) => i / 20), lr: hist('lr', 12, () => 0.001), epoch: hist('epoch', 12, (i) => i) },
    refuse: false,
  }, extra || {});
}

const browser = await chromium.launch();
async function open(wb, viewport, opts = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  const asked = [], hosts = [];
  await context.route((u) => { if (u.protocol === 'https:') hosts.push(u.host); return u.protocol === 'https:' && u.host !== 'api.github.com' && u.host !== 'signin.example.test'; }, (route) => route.abort());
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: real }));
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (key === 'GET /user') return json(200, { login: opts.login || 'tester' });
    if (key === 'GET /repos/acme/demo') return json(200, { full_name: 'acme/demo', default_branch: 'main', private: true, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' }, permissions: { admin: true, push: true, pull: true } });
    if (key === 'GET /repos/acme/demo/issues') return json(200, []);
    if (key === 'GET /repos/acme/demo/pulls') return json(200, []);
    if (key === 'GET /repos/acme/demo/actions/runs') return json(200, { workflow_runs: [] });
    return json(404, { message: 'Not Found' });
  });
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  await context.route(SERVICE + '/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = req.postDataJSON();
    asked.push(body);
    const out = (status, data) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(data) });
    if (new URL(req.url()).pathname !== '/wandb/graphql') return out(404, { error: 'no_such_route' });
    if (wb.refuse || body.key !== KEY) return out(401, { error: 'wandb_refused_key', error_description: 'W&B refused the key (it answered 401); copy it again from https://wandb.ai/authorize' });
    if (wb.down) return out(502, { error: 'wandb_unreachable', error_description: 'W&B answered 503 for the moment; try again' });
    const q = body.query, v = body.variables || {};
    if (/query Viewer/.test(q)) return out(200, { data: { viewer: wb.viewer } });
    if (/query Projects/.test(q)) return out(200, { data: { models: { edges: (wb.projects[v.entity] || []).map((name) => ({ node: { name, entityName: v.entity } })) } } });
    if (/query Runs/.test(q) && wb.slow && wb.slow[v.project]) { const ms = wb.slow[v.project]; delete wb.slow[v.project]; await sleep(ms); }
    if (/query Runs/.test(q)) { const list = wb.runs[v.entity + '/' + v.project] || []; return out(200, { data: { project: { runCount: list.length + (wb.more || 0), runs: { edges: list.slice(0, v.first).map((node) => ({ node })) } } } }); }
    if (/query Keys/.test(q)) return out(200, { data: { project: { run: { historyKeys: JSON.stringify(wb.keys[v.name] || {}) } } } });
    if (/query History/.test(q)) return out(200, { data: { project: { run: { sampledHistory: v.specs.map((s) => { const k = JSON.parse(s).keys[1]; return wb.history[k] || []; }) } } } });
    return out(400, { errors: [{ message: 'unknown query' }] });
  });
  await context.addInitScript(([kept]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('symphony_panel_token', 'github_pat_TESTER');
    localStorage.setItem('symphony_panel_repos', JSON.stringify(['acme/demo']));
    if (kept) localStorage.setItem('symphony_panel_wandb', JSON.stringify(kept));
    sessionStorage.setItem('seeded', '1');
  }, [opts.kept || null]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo' + (viewport && viewport.width < 900 ? '' : '#wandb'));
  await page.waitForFunction(() => /^acme\/demo, default/.test((document.getElementById('cp-summary') || {}).textContent || ''), null, { timeout: 15000 });
  if (await page.evaluate(() => document.getElementById('tab-wandb').hidden)) await page.click('.console__rail [data-tab="wandb"]');
  return { context, page, asked, hosts, errors };
}
const kept = (login) => ({ [login || 'tester']: { key: KEY, connected: '2026-10-21' } });
const tiles = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#wb-runs .tok__open')).map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
const fits = (page) => page.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth }));

await check('W1: with no key the tab offers Connect with the link to wandb.ai/authorize, asks the service nothing, keeps nothing, and fits the window', async () => {
  const { context, page, asked, errors } = await open(wandbState());
  await page.waitForSelector('#wb-key');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/wandb-connect.png' });
  const facts = await page.evaluate(() => ({
    rail: document.querySelector('#rail-wandb .rail__name').textContent,
    link: Array.from(document.querySelectorAll('.wb__connect a')).map((a) => a.href),
    type: document.getElementById('wb-key').type,
    forget: document.getElementById('wb-forget').hidden, open: document.getElementById('wb-open').hidden,
    kept: localStorage.getItem('symphony_panel_wandb'),
  }));
  assert.equal(facts.rail, 'W&B');
  assert.deepEqual(facts.link, ['https://wandb.ai/authorize']);
  assert.equal(facts.type, 'password', 'the key is typed in the open');
  assert.equal(facts.forget, true); assert.equal(facts.open, true);
  assert.equal(facts.kept, null);
  assert.deepEqual(asked, []);
  const f = await fits(page);
  assert.ok(f.sh <= f.ih + 1 && f.sw <= f.iw + 1, JSON.stringify(f));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W2: Connect checks the key with W&B, keeps it under the GitHub login, clears the box, chooses SchwingNet and draws its runs with their state and last numbers', async () => {
  const { context, page, asked, errors } = await open(wandbState());
  await page.fill('#wb-key', KEY);
  await page.click('#wb-connect');
  await page.waitForSelector('#wb-runs [data-run="r0"]');
  const t = await tiles(page);
  assert.match(t[0], /^v1-level-train run-7 \/ train loss 0\.4321 val\/acc 0\.875 Running, 12 steps logged, last heard just now$/, t[0]);
  assert.match(t[1], /^v1-level-eval run-6 \/ evaluate top1 0\.81 Crashed, started \d+ (hours|minutes) ago$/, t[1]);
  const facts = await page.evaluate(() => ({
    kept: JSON.parse(localStorage.getItem('symphony_panel_wandb')),
    box: (document.getElementById('wb-key') || { value: '' }).value,
    open: document.getElementById('wb-open').href, openHidden: document.getElementById('wb-open').hidden,
    project: document.getElementById('wb-project').value,
    options: Array.from(document.querySelectorAll('#wb-project option')).map((o) => o.textContent),
    live: document.querySelector('#wb-runs [data-run="r1"]').parentElement.classList.contains('wb--live'),
    url: location.href,
  }));
  assert.equal(facts.kept.tester.key, KEY);
  assert.equal(facts.box, '');
  assert.equal(facts.open, 'https://wandb.ai/greg/SchwingNet');
  assert.equal(facts.openHidden, false);
  assert.equal(facts.project, 'greg/SchwingNet');
  assert.deepEqual(facts.options, ['SchwingNet', 'scratch', 'spine-lab/shared']);
  assert.equal(facts.live, true);
  assert.ok(!facts.url.includes(KEY), 'the key is in the address');
  assert.ok(asked.every((b) => b.key === KEY), 'a call went out without the key');
  assert.ok(asked.every((b) => !/mutation|subscription/i.test(b.query)), 'a query would change something');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W3: a run opens its side panel: its link on wandb.ai, a chart for each of the first four numeric metrics, loss first, hidden keys and media left out, and its last numbers', async () => {
  const { context, page, asked, errors } = await open(wandbState(), null, { kept: kept() });
  await page.click('#wb-runs [data-run="r1"]');
  await page.waitForSelector('#wb-charts .wb__chart svg');
  const facts = await page.evaluate(() => ({
    link: document.querySelector('#wb-side .tok__owner a').href,
    charts: Array.from(document.querySelectorAll('#wb-charts .wb__cap .wb__k')).map((n) => n.textContent),
    chips: Array.from(document.querySelectorAll('#wb-side .wb__picker button')).map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    points: document.querySelector('#wb-charts polyline').getAttribute('points').split(' ').length,
    label: document.querySelector('#wb-charts svg').getAttribute('aria-label'),
    summary: Array.from(document.querySelectorAll('#wb-side .wb__summary tbody tr')).map((r) => r.innerText.replace(/\s+/g, ' ').trim()),
  }));
  assert.equal(facts.link, 'https://wandb.ai/greg/SchwingNet/runs/r1');
  assert.deepEqual(facts.charts, ['loss', 'val/acc', 'val/f1', 'lr']);
  assert.deepEqual(facts.chips, ['loss*', 'val/acc*', 'val/f1*', 'lr*', 'epoch']);
  assert.equal(facts.points, 12);
  assert.match(facts.label, /^loss over 12 steps, from 1 to 0\.0833/);
  assert.deepEqual(facts.summary, ['loss 0.4321', 'val/acc 0.875']);
  const h = asked.filter((b) => /query History/.test(b.query)).pop();
  assert.deepEqual(h.variables.specs.map((s) => JSON.parse(s)), ['loss', 'val/acc', 'val/f1', 'lr'].map((k) => ({ keys: ['_step', k], samples: 300 })));
  // a chip adds its chart, the oldest giving way, at most four
  await page.click('#wb-side .wb__picker button:has-text("epoch")');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#wb-charts .wb__cap .wb__k')).map((n) => n.textContent).join() === 'val/acc,val/f1,lr,epoch');
  // a pointer over a chart reads the nearest step
  const box = await page.locator('#wb-charts svg').first().boundingBox();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  assert.match(await page.locator('#wb-charts .wb__range').first().textContent(), /^step 11: 0\.9167$/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W4: a running run is read again while the tab is shown, and its new numbers drawn; nothing is read while another tab is shown', async () => {
  const wb = wandbState();
  const { context, page, asked, errors } = await open(wb, null, { kept: kept() });
  await page.waitForSelector('#wb-runs [data-run="r1"]');
  wb.runs['greg/SchwingNet'][0].summaryMetrics = JSON.stringify({ loss: 0.25 });
  await page.waitForFunction(() => /loss 0\.25/.test(document.querySelector('#wb-runs [data-run="r1"]').innerText.replace(/\s+/g, ' ')), null, { timeout: 8000 });
  await page.click('.console__rail [data-tab="board"]');
  await sleep(400);
  const before = asked.length;
  await sleep(3500);
  assert.equal(asked.length, before, 'W&B was read with the tab hidden');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W5: W&B refusing the kept key forgets it on this browser, says why, and offers Connect again', async () => {
  const { context, page, errors } = await open(wandbState({ refuse: true }), null, { kept: kept() });
  await page.waitForSelector('#wb-key');
  const facts = await page.evaluate(() => ({ kept: localStorage.getItem('symphony_panel_wandb'), note: document.getElementById('wb-note').textContent, shown: !document.getElementById('wb-note').hidden }));
  assert.equal(facts.kept, null);
  assert.equal(facts.shown, true);
  assert.match(facts.note, /W&B refused the key/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W6: a wrong key at Connect is refused with W&B\'s words and never kept; W&B being down leaves the key kept and says so', async () => {
  let { context, page, errors } = await open(wandbState());
  await page.fill('#wb-key', 'x'.repeat(40));
  await page.click('#wb-connect');
  await page.waitForFunction(() => /refused the key/.test(document.getElementById('wb-note').textContent));
  assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_wandb')), null);
  await page.fill('#wb-key', 'short');
  await page.click('#wb-connect');
  await page.waitForFunction(() => /not a W&B API key/.test(document.getElementById('wb-note').textContent));
  assert.deepEqual(errors, []);
  await context.close();
  ({ context, page, errors } = await open(wandbState({ down: true }), null, { kept: kept() }));
  await page.waitForFunction(() => /503/.test(document.getElementById('wb-note').textContent));
  assert.ok(await page.evaluate(() => !!localStorage.getItem('symphony_panel_wandb')), 'a W&B outage forgot the key');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W7: Forget W&B forgets this account\'s key and no other; Forget the token forgets every kept key', async () => {
  const both = Object.assign(kept(), kept('other'));
  let { context, page, errors } = await open(wandbState(), null, { kept: both });
  await page.waitForSelector('#wb-runs [data-run="r1"]');
  await page.click('#wb-forget');
  await page.waitForSelector('#wb-key');
  assert.deepEqual(Object.keys(JSON.parse(await page.evaluate(() => localStorage.getItem('symphony_panel_wandb')))), ['other']);
  await context.close();
  ({ context, page, errors } = await open(wandbState(), null, { kept: both }));
  await page.waitForSelector('#wb-runs [data-run="r1"]');
  await page.evaluate(() => document.getElementById('cp-signout').click());
  await page.waitForFunction(() => localStorage.getItem('symphony_panel_wandb') === null);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W8: another GitHub account on the same browser finds no key of the first', async () => {
  const { context, page, asked, errors } = await open(wandbState(), null, { kept: kept(), login: 'someone' });
  await page.waitForSelector('#wb-key');
  assert.deepEqual(asked, []);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W9: choosing another project reads its runs, keeps the choice, and the next opening comes back to it', async () => {
  const { context, page, errors } = await open(wandbState(), null, { kept: kept() });
  await page.waitForSelector('#wb-runs [data-run="r1"]');
  await page.selectOption('#wb-project', 'greg/scratch');
  await page.waitForSelector('#wb-runs [data-run="s1"]');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('symphony_panel_wandb')).tester.project), 'scratch');
  await page.reload();
  await page.waitForSelector('#wb-runs [data-run="s1"]');
  assert.equal(await page.evaluate(() => document.getElementById('wb-open').href), 'https://wandb.ai/greg/scratch');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W10: a run\'s name and metrics are drawn as text, never as markup, and a name in a link is escaped', async () => {
  const wb = wandbState();
  wb.runs['greg/SchwingNet'][0].displayName = '<img src=x onerror="window.pwned=1">';
  wb.runs['greg/SchwingNet'][0].name = 'a/b?c#d';
  wb.runs['greg/SchwingNet'][0].summaryMetrics = JSON.stringify({ '<b>x</b>': 1 });
  const { context, page, errors } = await open(wb, null, { kept: kept() });
  await page.waitForSelector('#wb-runs .tok__open');
  await page.click('#wb-runs .tok__open');
  await page.waitForSelector('#wb-side .tok__owner a');
  const facts = await page.evaluate(() => ({ pwned: !!window.pwned, imgs: document.querySelectorAll('#tab-wandb img, #tab-wandb b').length, link: document.querySelector('#wb-side .tok__owner a').href }));
  assert.equal(facts.pwned, false);
  assert.equal(facts.imgs, 0);
  assert.equal(facts.link, 'https://wandb.ai/greg/SchwingNet/runs/a%2Fb%3Fc%23d');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W12: a running run read again keeps the keyboard on the tile and the chip it was on', async () => {
  const { context, page, asked, errors } = await open(wandbState(), null, { kept: kept() });
  await page.click('#wb-runs [data-run="r1"]');
  await page.waitForSelector('#wb-side [data-key="epoch"]');
  await page.focus('#wb-side [data-key="epoch"]');
  const n = asked.filter((b) => /query Runs/.test(b.query)).length;
  await sleep(3500);
  assert.ok(asked.filter((b) => /query Runs/.test(b.query)).length > n, 'the run was not read again');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-key')), 'epoch');
  await page.focus('#wb-runs [data-run="r0"]');
  await sleep(3500);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-run')), 'r0');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('W13: a project left while its runs are on their way never has them drawn under the one chosen after it', async () => {
  const wb = wandbState();
  const { context, page, errors } = await open(wb, null, { kept: kept() });
  await page.waitForSelector('#wb-runs [data-run="r1"]');
  // the project's runs read again, slowly, and the other project chosen meanwhile
  wb.slow = { SchwingNet: 2500 };
  await page.click('#wb-refresh');
  await sleep(300);
  await page.selectOption('#wb-project', 'greg/scratch');
  await page.waitForSelector('#wb-runs [data-run="s1"]');
  await sleep(3000);
  const runs = await page.evaluate(() => Array.from(document.querySelectorAll('#wb-runs [data-run]')).map((b) => b.getAttribute('data-run')));
  assert.deepEqual(runs, ['s1']);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const [name, vp] of [['a phone', { width: 390, height: 844 }], ['a phone held sideways', { width: 844, height: 390 }], ['a laptop', { width: 1366, height: 768 }]]) {
  await check('W11: on ' + name + ' the tab fits the window with a run open, the page itself never scrolling and nothing wider than the window', async () => {
    const { context, page, errors } = await open(wandbState(), vp, { kept: kept() });
    await page.waitForSelector('#wb-runs [data-run="r1"]');
    await page.click('#wb-runs [data-run="r1"]');
    await page.waitForSelector('#wb-charts .wb__chart svg');
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/wandb-' + vp.width + 'x' + vp.height + '.png' });
    const f = await fits(page);
    assert.ok(f.sh <= f.ih + 1 && f.sw <= f.iw + 1, JSON.stringify(f));
    const wide = await page.evaluate(() => Array.from(document.querySelectorAll('#tab-wandb *')).filter((n) => n.getBoundingClientRect().right > innerWidth + 1).map((n) => n.className || n.tagName).slice(0, 3));
    assert.deepEqual(wide, []);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await browser.close();
console.log(failed ? 'FAILED ' + failed + ' of ' + (passed + failed) : 'ALL PASSED (' + passed + ')');
process.exit(failed ? 1 : 0);
