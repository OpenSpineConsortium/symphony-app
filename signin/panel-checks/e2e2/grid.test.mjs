// The Grid tab (site branch claude/grid-accounts, 2026-10-21, the owner's "i want to be able to do
// everything from the damn contriol board, see my account usasge, reset, intiiate claude swap, turn
// on auto mode"): the Claude accounts on the grid drawn from the branch grid that symphony-template's
// grid-accounts.yml writes, each press a dispatch of that workflow, and a sign-in's link sealed for a
// key the page makes for that one press. GitHub is mocked; the sealed link is made here with Node's
// crypto the way scripts/grid-accounts.sh makes it with openssl (RSA-OAEP SHA-256 over an AES-256-CBC key).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
let real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(real.includes(a), 'mutant text not found: ' + a.slice(0, 60)); real = real.replace(a, b); }
real = real.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inH = (h) => new Date(Date.now() + h * 3600000).toISOString().replace(/\.\d+Z$/, 'Z');
const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

let passed = 0, failed = 0;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '-', String(e && e.message || e).split('\n')[0]); }
}

function list(extra) {
  return Object.assign({
    v: 1, auto: false, usage_job: 'idle',
    worker: { name: 'phone', state: 'online', account: '1', node: 'asx15', link: 'https://claude.ai/code?environment=env_1' },
    accounts: [
      { slot: '1', current: true, who: { signed_in: true, email: 'gr***@gmail.com', plan: 'max' }, use: { windows: { five_hour: { utilization: 0.42, resetsAt: inH(2) }, seven_day: { utilization: 0.95, resetsAt: inH(72) } }, read_at: now }, login: { state: 'none' } },
      { slot: '2', current: false, who: { signed_in: true, email: 'wo***@wayne.edu', plan: 'pro' }, use: { windows: { five_hour: { utilization: 0.1, resetsAt: inH(4) }, seven_day: { utilization: 0.2, resetsAt: inH(100) } }, read_at: now }, login: { state: 'none' } },
    ],
  }, extra || {});
}

const browser = await chromium.launch();
// one fresh browser, the token kept for acme/demo, the Grid tab opened; state.accounts is what the
// branch grid holds now, and each dispatch is recorded and may change it
async function open(state, viewport, opts = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  const calls = [], dispatched = [];
  // nothing leaves for any other host: a link the page should never offer is never fetched either
  await context.route((u) => u.protocol === 'https:' && u.host !== 'api.github.com', (route) => route.abort());
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: real }));
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    calls.push({ key, query: url.search });
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const raw = (obj) => route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', body: JSON.stringify(obj) });
    if (key === 'GET /user') return json(200, { login: 'tester' });
    if (key === 'GET /repos/acme/demo') return json(200, { full_name: 'acme/demo', default_branch: 'main', private: true, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' }, permissions: { admin: true, push: true, pull: true } });
    if (key === 'GET /repos/OpenSpineConsortium/symphony-template') return json(200, { full_name: 'OpenSpineConsortium/symphony-template', default_branch: 'main', private: false, id: 9, owner: { id: 8, login: 'OpenSpineConsortium' } });
    if (opts.home && key === 'GET /repos/OpenSpineConsortium/symphony-template/contents/accounts.json') return raw(state.accounts);
    if (key === 'GET /repos/acme/demo/contents/accounts.json') return state.accounts ? raw(state.accounts) : json(404, { message: 'Not Found' });
    const own = key.match(/^GET \/repos\/acme\/demo\/contents\/answers\/([A-Za-z0-9_-]+)\.json$/);
    if (own) return state.answers && state.answers[own[1]] ? raw(state.answers[own[1]]) : json(404, { message: 'Not Found' });
    const logged = key.match(/^GET \/repos\/acme\/demo\/contents\/logs\/([A-Za-z0-9_-]+)\.json$/);
    if (logged) return state.logs && state.logs[logged[1]] ? raw(state.logs[logged[1]]) : json(404, { message: 'Not Found' });
    if (key === 'GET /repos/acme/demo/contents/link.json') return state.link ? raw(state.link) : json(404, { message: 'Not Found' });
    if (key === 'POST /repos/acme/demo/actions/workflows/grid-accounts.yml/dispatches' || (opts.home && key === 'POST /repos/OpenSpineConsortium/symphony-template/actions/workflows/grid-accounts.yml/dispatches')) {
      if (opts.home) calls[calls.length - 1].home = true;
      const body = req.postDataJSON();
      dispatched.push(body);
      if (state.onDispatch) await state.onDispatch(body);
      return route.fulfill({ status: 204, body: '' });
    }
    if (key === 'GET /repos/acme/demo/issues' || key === 'GET /repos/acme/demo/pulls') return json(200, []);
    if (key === 'GET /repos/acme/demo/actions/runs') return json(200, { workflow_runs: [] });
    return json(404, { message: 'Not Found' });
  });
  await context.addInitScript((noGridRepo) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('symphony_panel_token', 'github_pat_TESTER');
    localStorage.setItem('symphony_panel_repos', JSON.stringify(['acme/demo']));
    if (!noGridRepo) localStorage.setItem('symphony_grid_repo', 'acme/demo');
    sessionStorage.setItem('seeded', '1');
  }, !!opts.home);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo#grid');
  await page.waitForFunction(() => /^acme\/demo, default/.test((document.getElementById('cp-summary') || {}).textContent || ''), null, { timeout: 15000 });
  if (await page.evaluate(() => document.getElementById('tab-grid').hidden)) await page.click('.console__rail [data-tab="grid"]');
  return { context, page, calls, dispatched, errors };
}
const tiles = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#gr-tiles .tok__open')).map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
const writes = (calls) => calls.filter((c) => !c.key.startsWith('GET ') && !/dispatches$/.test(c.key));

// the run's answer to a request, as scripts/grid-accounts.sh writes accounts.json
const answer = (request, l, rc) => ({ v: 1, at: now, request, rc: rc || 0, said: ['HPCW-GRID-GATE accounts ok 0'], list: l });

function seal(url, spkiB64) {
  const pub = crypto.createPublicKey({ key: Buffer.from(spkiB64, 'base64'), format: 'der', type: 'spki' });
  const aes = crypto.randomBytes(32), iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', aes, iv);
  const data = Buffer.concat([c.update(url, 'utf8'), c.final()]);
  const key = crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aes);
  return { key: key.toString('base64'), iv: iv.toString('base64'), data: data.toString('base64') };
}

await check('G1: the tab draws each account with its e-mail, plan, five-hour and seven-day use, the one in use ringed, the worker line, and writes nothing', async () => {
  const { context, page, calls, dispatched, errors } = await open({ accounts: answer('', list()) });
  await page.waitForSelector('#gr-tile-2');
  const t = await tiles(page);
  assert.match(t[0], /^1 gr\*\*\*@gmail\.com Claude max, 1 worker 5h 42% 7d 95% In use$/, t[0]);
  assert.match(t[1], /^2 wo\*\*\*@wayne\.edu Claude pro 5h 10% 7d 20% Ready$/, t[1]);
  assert.match(t[2], /Sign in another/);
  const facts = await page.evaluate(() => ({
    current: document.querySelector('#gr-tile-1').parentElement.classList.contains('gr--current'),
    full: document.querySelectorAll('#gr-tile-1 .tok__bar--full').length,
    worker: document.querySelector('.gr__worker').textContent.replace(/\s+/g, ' ').trim(),
    auto: document.getElementById('gr-auto').textContent,
    query: null,
  }));
  assert.equal(facts.current, true, 'the account in use is not ringed');
  assert.equal(facts.full, 1, 'the seven-day window at 95% is not drawn full');
  assert.match(facts.worker, /Worker phone: online, on account 1, asx15 Open the session/);
  assert.equal(facts.auto, 'Auto mode: off');
  assert.ok(calls.some((c) => c.key === 'GET /repos/acme/demo/contents/accounts.json' && /ref=grid/.test(c.query)), 'the branch grid was not read');
  assert.deepEqual(dispatched, [], 'opening the tab started a run');
  assert.deepEqual(writes(calls), []);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G2: a tile opens its side panel with each window and when it resets; Use this account starts one run for that slot and ends once the grid answers that request', async () => {
  const state = { accounts: answer('', list()) };
  state.onDispatch = async (body) => { await sleep(300); const l = list(); l.accounts[0].current = false; l.accounts[1].current = true; l.worker.account = '2'; state.accounts = answer(body.inputs.request, l); };
  const { context, page, dispatched, errors } = await open(state);
  await page.click('#gr-tile-2');
  const side = await page.evaluate(() => document.getElementById('gr-side').textContent.replace(/\s+/g, ' '));
  assert.match(side, /Five hours/); assert.match(side, /resets in 4 h/); assert.match(side, /Seven days/); assert.match(side, /resets in 4 days/);
  await page.click('#gr-use');
  await page.waitForFunction(() => /In use/.test(document.getElementById('gr-tile-2').textContent), null, { timeout: 15000 });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].ref, 'main');
  assert.equal(dispatched[0].inputs.action, 'use');
  assert.equal(dispatched[0].inputs.slot, '2');
  assert.match(dispatched[0].inputs.request, /^p[a-z0-9]+$/);
  assert.equal(await page.evaluate(() => document.getElementById('gr-auto').disabled), false, 'the buttons stayed held after the answer');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G3: auto mode turns on with one press and the chip says so once the grid answers; the buttons are held while it runs', async () => {
  const state = { accounts: answer('', list()) };
  state.onDispatch = async (body) => { setTimeout(() => { state.accounts = answer(body.inputs.request, list({ auto: true })); }, 2500); };
  const { context, page, dispatched, errors } = await open(state);
  await page.click('#gr-auto');
  await page.waitForFunction(() => document.getElementById('gr-usage').disabled);
  await page.waitForFunction(() => document.getElementById('gr-auto').textContent === 'Auto mode: on', null, { timeout: 15000 });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].inputs.action, 'auto-on');
  assert.equal(await page.evaluate(() => document.getElementById('gr-auto').getAttribute('aria-pressed')), 'true');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G4: Sign in another sends a fresh public key, opens only the link sealed for it as Anthropic\'s sign-in, and a code goes back as its own run', async () => {
  const state = { accounts: answer('', list()) };
  state.onDispatch = async (body) => {
    if (body.inputs.action === 'login') {
      assert.ok(body.inputs.key && body.inputs.key.length > 300, 'no public key was sent');
      const l = list(); l.accounts.push({ slot: '3', current: false, login: { state: 'link', line: 'Open the link and sign in.' } });
      state.link = { request: body.inputs.request, sealed: seal('https://claude.ai/oauth/authorize?code=true&state=S', body.inputs.key) };
      state.accounts = answer(body.inputs.request, l);
    } else if (body.inputs.action === 'code') {
      const l = list(); l.accounts.push({ slot: '3', current: false, who: { signed_in: true, email: 'th***@x.org', plan: 'max' }, login: { state: 'signed-in' } });
      state.accounts = answer(body.inputs.request, l);
    }
  };
  const { context, page, dispatched, errors } = await open(state);
  await page.click('#gr-add');
  await page.waitForSelector('#gr-link', { timeout: 15000 });
  assert.equal(await page.getAttribute('#gr-link', 'href'), 'https://claude.ai/oauth/authorize?code=true&state=S');
  assert.equal(dispatched[0].inputs.action, 'login');
  assert.equal(dispatched[0].inputs.slot, '3');
  assert.ok(!JSON.stringify(dispatched[0]).includes('claude.ai'), 'the link went out in the inputs');
  await page.fill('#gr-code', 'abcdEFGH1234#state-S');
  await page.click('#gr-send');
  await page.waitForFunction(() => /th\*\*\*@x\.org/.test((document.getElementById('gr-tile-3') || {}).textContent || ''), null, { timeout: 15000 });
  assert.equal(dispatched[1].inputs.action, 'code');
  assert.equal(dispatched[1].inputs.code, 'abcdEFGH1234#state-S');
  assert.equal(await page.inputValue('#gr-code').catch(() => ''), '', 'the code stayed in the box');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G5: a sealed link to any page but Anthropic\'s is never offered, and one sealed for another key is not opened', async () => {
  for (const which of ['host', 'key']) {
    const state = { accounts: answer('', list()) };
    state.onDispatch = async (body) => {
      const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
      const l = list(); l.accounts.push({ slot: '3', current: false, login: { state: 'link', line: 'Open the link and sign in.' } });
      state.link = { request: body.inputs.request, sealed: seal(which === 'host' ? 'https://example.org/oauth' : 'https://claude.ai/oauth/x', which === 'key' ? other : body.inputs.key) };
      state.accounts = answer(body.inputs.request, l);
    };
    const { context, page, errors } = await open(state);
    await page.click('#gr-add');
    await sleep(5000);
    assert.equal(await page.locator('#gr-link').count(), 0, which + ': a link was offered');
    if (which === 'key') assert.match(await page.textContent('#gr-note'), /could not be opened/);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await check('G6: with nothing on the branch grid the tab says what to do and Refresh asks the grid', async () => {
  const state = { accounts: null };
  state.onDispatch = async (body) => { state.accounts = answer(body.inputs.request, list()); };
  const { context, page, dispatched, errors } = await open(state);
  await page.waitForFunction(() => /Nothing read from the grid yet for acme\/demo/.test(document.getElementById('gr-tiles').textContent));
  await page.click('#gr-refresh');
  await page.waitForSelector('#gr-tile-1', { timeout: 15000 });
  assert.equal(dispatched[0].inputs.action, 'list');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G7: on a phone the tab fits the window, tiles and side panel alike', async () => {
  const { context, page, errors } = await open({ accounts: answer('', list()) }, { width: 390, height: 844 });
  await page.waitForSelector('#gr-tile-2');
  await page.click('#gr-tile-2');
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, side: document.getElementById('gr-side').getBoundingClientRect().width }));
  assert.ok(m.sw <= m.iw, 'the page is wider than the phone: ' + m.sw + '/' + m.iw);
  assert.ok(m.side > 0 && m.side <= m.iw, 'the side panel does not fit: ' + m.side);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G8: the grid is the same whatever repository the panel has open: with acme/demo open and nothing kept, the tab reads and presses OpenSpineConsortium/symphony-template, and says so', async () => {
  const state = { accounts: answer('', list()) };
  state.onDispatch = async (body) => { state.accounts = answer(body.inputs.request, list({ auto: true })); };
  const { context, page, calls, dispatched, errors } = await open(state, null, { home: true });
  await page.waitForSelector('#gr-tile-2');
  assert.ok(!calls.some((c) => c.key === 'GET /repos/acme/demo/contents/accounts.json'), 'the open repository was read for the grid');
  assert.match(await page.textContent('#gr-tiles'), /through OpenSpineConsortium\/symphony-template\./);
  await page.click('#gr-auto');
  await page.waitForFunction(() => document.getElementById('gr-auto').textContent === 'Auto mode: on', null, { timeout: 15000 });
  assert.equal(dispatched.length, 1);
  assert.ok(calls.some((c) => c.home && /symphony-template\/actions\/workflows\/grid-accounts\.yml\/dispatches$/.test(c.key)), 'the press did not go to symphony-template');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G9: every worker shows with its account and its own Stop; Start a worker on an account sends that slot and the name, and the new worker shows once the grid answers', async () => {
  const two = (extra) => list(Object.assign({ workers: [
    { name: 'phone', state: 'online', account: '1', pinned: null, node: 'asx15', link: 'https://claude.ai/code?environment=env_1', age_s: 20 },
  ] }, extra || {}));
  const state = { accounts: answer('', two()) };
  state.onDispatch = async (body) => {
    await sleep(300);
    const l = two();
    if (body.inputs.action === 'worker-start') l.workers.unshift({ name: body.inputs.name, state: 'queued', account: body.inputs.slot, pinned: body.inputs.slot, node: '', link: '', age_s: 1 });
    state.accounts = answer(body.inputs.request, l);
  };
  const { context, page, dispatched, errors } = await open(state);
  await page.waitForSelector('#gr-worker-phone');
  assert.match(await page.textContent('#gr-worker-phone'), /Worker phone: online, on account 1, asx15/);
  assert.ok(await page.locator('#gr-stop-phone').count() === 1, 'no Stop for the worker');
  await page.click('#gr-tile-2');
  await page.fill('#gr-wname', 'teamb');
  await page.click('#gr-start');
  await page.waitForSelector('#gr-worker-teamb', { timeout: 15000 });
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].inputs.action, 'worker-start');
  assert.equal(dispatched[0].inputs.slot, '2');
  assert.equal(dispatched[0].inputs.name, 'teamb');
  assert.match(await page.textContent('#gr-worker-teamb'), /on account 2 \(kept there\).*claims as grid-teamb/);
  assert.match(await page.textContent('#gr-side'), /Worker teamb runs on this account/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G10: Stop asks first and sends the worker\'s name alone; a name the gate would refuse is never sent', async () => {
  const l = list({ workers: [{ name: 'teamb', state: 'online', account: '2', pinned: '2', node: 'asx3', link: 'https://claude.ai/code?environment=env_2', age_s: 5 }] });
  const state = { accounts: answer('', l) };
  state.onDispatch = async (body) => { const m = JSON.parse(JSON.stringify(l)); m.workers[0].state = 'stopped'; state.accounts = answer(body.inputs.request, m); };
  const { context, page, dispatched, errors } = await open(state);
  await page.waitForSelector('#gr-stop-teamb');
  page.once('dialog', (d) => d.dismiss());
  await page.click('#gr-stop-teamb');
  await sleep(300);
  assert.equal(dispatched.length, 0, 'Stop ran without asking');
  page.once('dialog', (d) => d.accept());
  await page.click('#gr-stop-teamb');
  await page.waitForFunction(() => /stopped/.test(document.getElementById('gr-worker-teamb').textContent), null, { timeout: 15000 });
  assert.equal(dispatched.length, 1);
  assert.deepEqual([dispatched[0].inputs.action, dispatched[0].inputs.slot, dispatched[0].inputs.name], ['worker-stop', '', 'teamb']);
  assert.equal(await page.locator('#gr-stop-teamb').count(), 0, 'a stopped worker still offers Stop');
  await page.click('#gr-tile-1');
  await page.fill('#gr-wname', 'a b');
  await page.click('#gr-start');
  await sleep(300);
  assert.equal(dispatched.length, 1, 'a bad name was sent');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G11: a run another overtook on accounts.json is still followed to its end, through its own answer under answers/', async () => {
  const l = list({ workers: [] });
  const state = { accounts: answer('', l), answers: {} };
  state.onDispatch = async (body) => {
    await sleep(300);
    const m = list({ workers: [{ name: 'teamc', state: 'queued', account: body.inputs.slot, pinned: body.inputs.slot, node: '', link: '', age_s: 1 }] });
    // another page's run wrote accounts.json last; this run's answer is only under answers/
    state.accounts = answer('someone-else', l);
    state.answers[body.inputs.request] = answer(body.inputs.request, m);
  };
  const { context, page, dispatched, errors } = await open(state);
  await page.waitForSelector('#gr-tile-2');
  await page.click('#gr-tile-2');
  await page.fill('#gr-wname', 'teamc');
  await page.click('#gr-start');
  await page.waitForSelector('#gr-worker-teamc', { timeout: 15000 });
  assert.equal(dispatched.length, 1);
  assert.match(await page.textContent('#gr-worker-teamc'), /on account 2/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G12: Start with a count sends the count and the stem, a count of one sends none, and a stem too long for the numbers is never sent', async () => {
  const state = { accounts: answer('', list({ workers: [] })) };
  state.onDispatch = async (body) => { await sleep(200); state.accounts = answer(body.inputs.request, list({ workers: [] })); };
  const { context, page, dispatched, errors } = await open(state);
  await page.waitForSelector('#gr-tile-2');
  await page.click('#gr-tile-2');
  await page.fill('#gr-wname', 'team');
  await page.selectOption('#gr-wcount', '3');
  await page.click('#gr-start');
  await page.waitForFunction(() => !document.getElementById('gr-start') || !document.getElementById('gr-start').disabled, null, { timeout: 15000 });
  assert.equal(dispatched.length, 1);
  assert.deepEqual([dispatched[0].inputs.action, dispatched[0].inputs.slot, dispatched[0].inputs.name, dispatched[0].inputs.count], ['worker-start', '2', 'team', '3']);
  await sleep(300);
  await page.fill('#gr-wname', 'x'.repeat(22));
  await page.selectOption('#gr-wcount', '2');
  await page.click('#gr-start');
  await sleep(300);
  assert.equal(dispatched.length, 1, 'a stem of 22 was sent for several workers');
  await page.selectOption('#gr-wcount', '1');
  await page.fill('#gr-wname', 'solo');
  await page.click('#gr-start');
  await page.waitForFunction(() => document.getElementById('gr-start') && !document.getElementById('gr-start').disabled, null, { timeout: 15000 });
  assert.equal(dispatched.length, 2);
  assert.equal(dispatched[1].inputs.count, undefined, 'a count of one was sent');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G13: a running worker the grid has not heard from in a quarter of an hour is flagged, counted from when the grid last answered; a fresh one and a stopped one are not', async () => {
  const old = new Date(Date.now() - 20 * 60000).toISOString().replace(/\.\d+Z$/, 'Z');
  const l = list({ workers: [
    { name: 'fresh', state: 'online', account: '1', pinned: null, node: 'asx1', link: '', age_s: 10 },
    { name: 'silent', state: 'online', account: '2', pinned: '2', node: 'asx2', link: '', age_s: 30 },
    { name: 'ended', state: 'stopped', account: '2', pinned: '2', node: '', link: '', age_s: 99999 },
  ] });
  const state = { accounts: Object.assign(answer('', l), { at: now }) };
  state.accounts.list.workers[1].age_s = 16 * 60;
  const { context, page, errors } = await open(state);
  await page.waitForSelector('#gr-worker-silent');
  assert.match(await page.textContent('#gr-worker-silent'), /not heard from in 16 min/);
  assert.ok(await page.locator('#gr-worker-silent .gr__dot--warn').count() === 1, 'the silent worker is not flagged');
  assert.doesNotMatch(await page.textContent('#gr-worker-fresh'), /not heard/);
  assert.ok(await page.locator('#gr-worker-fresh .gr__dot--go').count() === 1);
  assert.doesNotMatch(await page.textContent('#gr-worker-ended'), /not heard/);
  await context.close();
  // an answer read twenty minutes ago counts its age on top of the worker's own
  state.accounts = Object.assign(answer('', list({ workers: [{ name: 'fresh', state: 'online', account: '1', pinned: null, node: 'asx1', link: '', age_s: 10 }] })), { at: old });
  const second = await open(state);
  await second.page.waitForSelector('#gr-worker-fresh');
  assert.match(await second.page.textContent('#gr-worker-fresh'), /not heard from in 20 min/);
  assert.deepEqual(errors.concat(second.errors), []);
  await second.context.close();
});

await check('G14: each account says how many live workers it carries, and one already carrying a worker still offers Start, saying the window is shared', async () => {
  const l = list({ workers: [
    { name: 'main', state: 'online', account: null, pinned: null, node: 'asx1', link: '', age_s: 5 },
    { name: 'b1', state: 'online', account: '2', pinned: '2', node: 'asx2', link: '', age_s: 5 },
    { name: 'b2', state: 'queued', account: '2', pinned: '2', node: '', link: '', age_s: 5 },
    { name: 'gone', state: 'stopped', account: '2', pinned: '2', node: '', link: '', age_s: 5 },
  ] });
  const state = { accounts: answer('', l) };
  const { context, page, errors } = await open(state);
  await page.waitForSelector('#gr-tile-2');
  const t = await tiles(page);
  assert.match(t[0], /Claude max, 1 worker /, t[0]);
  assert.match(t[1], /Claude pro, 2 workers /, t[1]);
  await page.click('#gr-tile-2');
  await page.waitForSelector('#gr-start');
  assert.match(await page.textContent('#gr-side'), /shares this account's five-hour window/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G15: Console shows what a grid job printed: a sign-in\'s output from the account, a worker\'s from its line, the usage job\'s from the Console, each as text and never as markup', async () => {
  const l = list({ workers: [{ name: 'teamb', state: 'online', account: '2', pinned: '2', node: 'asx3', link: '', age_s: 5 }] });
  const state = { accounts: answer('', l), logs: {} };
  state.onDispatch = async (body) => {
    await sleep(200);
    const i = body.inputs;
    const file = i.slot ? 'login-' + i.slot : i.name ? 'worker-' + i.name : 'usage';
    state.logs[file] = { v: 1, what: file, request: i.request, rc: 0, at: now, lines: ['--- the job\'s output (last 120 lines)', 'out of ' + file, '<img src=x onerror=alert(1)>'], said: [] };
    state.accounts = answer(i.request, l);
  };
  const { context, page, dispatched, errors } = await open(state);
  await page.waitForSelector('#gr-console');
  await page.click('#gr-tile-2');
  await page.click('#gr-log-slot');
  await page.waitForFunction(() => /out of login-2/.test((document.getElementById('gr-log') || {}).textContent || ''), null, { timeout: 15000 });
  assert.deepEqual([dispatched[0].inputs.action, dispatched[0].inputs.slot], ['log', '2']);
  assert.match(await page.textContent('#gr-console'), /Sign-in of account 2, read/);
  assert.equal(await page.locator('#gr-log img').count(), 0, 'a line of output became markup');
  assert.ok(await page.evaluate(() => document.getElementById('gr-console').open), 'the Console stayed shut');
  await page.click('#gr-log-teamb');
  await page.waitForFunction(() => /out of worker-teamb/.test((document.getElementById('gr-log') || {}).textContent || ''), null, { timeout: 15000 });
  assert.deepEqual([dispatched[1].inputs.action, dispatched[1].inputs.slot, dispatched[1].inputs.name], ['log', '', 'teamb']);
  await page.click('#gr-log-usage');
  await page.waitForFunction(() => /out of usage/.test((document.getElementById('gr-log') || {}).textContent || ''), null, { timeout: 15000 });
  assert.deepEqual([dispatched[2].inputs.action, dispatched[2].inputs.slot, dispatched[2].inputs.name], ['log', '', undefined]);
  assert.match(await page.textContent('#gr-console'), /Usage job, read/);
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log(failed ? 'FAILED ' + failed + ' of ' + (passed + failed) : 'ALL PASSED (' + passed + ')');
process.exit(failed ? 1 : 0);
