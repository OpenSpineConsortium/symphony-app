// Checks of sign-in by code (site branch claude/sign-in-by-code, 2026-10-19), the way into the
// control panel installed as a Home Screen app, where a sign-in that leaves for GitHub's page may
// come back to the browser rather than into the app: GitHub's device flow through the sign-in
// service's routes /device and /device/token, against a mocked service and GitHub. In the app the
// one button signs in by code and a line says so; in a browser a second, quieter button offers the
// same. Each check states what the page promises; a FAIL is a defect.
//
// The app is played by giving the page navigator.standalone, as iOS gives an installed page; a
// browser has none. The page asks for the token no faster than the interval the service names, at
// least five seconds, so the checks wait in real time.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const SERVICE = 'https://signin.example.test';
const ORIGIN = new URL(BASE).origin;
const now = new Date().toISOString();
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 4).join('\n     ')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
// a mutant, for proving a check bites: pairs of [text, replacement] applied to the script
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(real.includes(a), 'mutant text not found: ' + a.slice(0, 60)); real = real.replace(a, b); }
// as signin.test.mjs does: the mocked service and client id for the configured page, none for the other
const SERVICE_LINE = /var SIGNIN_SERVICE = '[^']*';/;
const CLIENT_LINE = /var CLIENT_ID = '[^']*';/;
assert.ok(SERVICE_LINE.test(real) && CLIENT_LINE.test(real), 'the two constants were not found in the script');
const configured = real.replace(SERVICE_LINE, "var SIGNIN_SERVICE = '" + SERVICE + "';").replace(CLIENT_LINE, "var CLIENT_ID = 'Iv1.testclient';");
real = real.replace(SERVICE_LINE, "var SIGNIN_SERVICE = '';").replace(CLIENT_LINE, "var CLIENT_ID = '';");

function repoRoutes(repo) {
  return {
    'GET /user': { login: 'tester' },
    ['GET /repos/' + repo]: { full_name: repo, default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
    ['GET /repos/' + repo + '/issues']: [],
    ['GET /repos/' + repo + '/contents/STATE.md']: { raw: '# Board\n\nNothing claimed.\n' },
    ['GET /repos/' + repo + '/branches/board']: { commit: { commit: { committer: { date: now } } } },
    ['GET /repos/' + repo + '/contents/.github/symphony/workers']: [],
    ['GET /repos/' + repo + '/actions/runs']: { workflow_runs: [] },
    ['GET /repos/' + repo + '/pulls']: [],
  };
}
const CODE = 'WDJB-MJHT';
const DEVICE = 'dc_3584d83530557fdd1f46af8289938c8ef79f9dc5';
const deviceOk = (over) => ({ status: 200, body: Object.assign({ device_code: DEVICE, user_code: CODE, verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 }, over || {}) });
const pending = { status: 400, body: { error: 'authorization_pending', error_description: 'The authorization request is still pending.' } };
const token = { status: 200, body: { access_token: 'ghu_TOKEN', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } };
// the app: iOS gives an installed page navigator.standalone
const IN_APP = () => { Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }); };

const browser = await chromium.launch();
await consoleTabs(browser);
// opts.device is the answer to /device, or a list of them in turn; opts.tokens the answers to
// /device/token in turn, the last repeated
async function open(opts) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
  if (opts.clipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  const calls = [];
  const service = [];
  const authorize = [];
  const routes = opts.routes || repoRoutes('acme/demo');
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    calls.push({ key, url: req.url(), auth: req.headers()['authorization'] || '' });
    const r = routes[key];
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
    if (r && typeof r.raw === 'string') return route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', body: r.raw });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: opts.script || configured }));
  await context.route('https://github.com/login/oauth/**', (route) => {
    const u = new URL(route.request().url());
    authorize.push(u);
    const back = u.searchParams.get('redirect_uri') + '?code=CODE1&state=' + encodeURIComponent(u.searchParams.get('state'));
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify(back) + ')</script>' });
  });
  await context.route('https://github.com/login/device', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Device activation</title>' }));
  let devices = 0;
  let polls = 0;
  await context.route(SERVICE + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const path = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
    service.push({ path, body, at: Date.now() });
    let answer;
    if (path === '/device') {
      const list = [].concat(opts.device || deviceOk());
      answer = list[Math.min(devices++, list.length - 1)];
    } else if (path === '/device/token') {
      const list = opts.tokens || [pending, token];
      answer = list[Math.min(polls++, list.length - 1)];
    } else answer = token;
    if (typeof answer === 'function') answer = await answer(body);
    if (answer.delay) await sleep(answer.delay);
    if (answer.abort) return route.abort('connectionrefused');
    return route.fulfill({ status: answer.status, contentType: 'application/json', headers: cors, body: JSON.stringify(answer.body) });
  });
  if (opts.app) await context.addInitScript(IN_APP);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + (opts.path || '/symphony/control/'));
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  service.length = 0; calls.length = 0;
  await page.goto(BASE + (opts.path || '/symphony/control/'));
  return { context, page, calls, service, authorize, errors };
}
function gateFacts(page) {
  return page.evaluate(() => {
    const shown = (id) => { const e = document.getElementById(id); return !!(e && e.checkVisibility()); };
    const signin = document.getElementById('cp-signin');
    const other = document.getElementById('cp-signin-code');
    const way = document.getElementById('cp-token-way');
    const open = document.getElementById('cp-code-open');
    const lead = document.querySelector('.control__codelead');
    return {
      signin: shown('cp-signin'), signinDisabled: !!(signin && signin.disabled),
      other: shown('cp-signin-code'), otherExists: !!other, otherDisabled: !!(other && other.disabled),
      otherAfterSignin: !!(signin && other && (signin.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING)),
      box: shown('cp-code-box'), code: (document.getElementById('cp-code') || {}).textContent || '',
      link: open ? [open.href, open.target, open.rel] : null,
      lead: !!(lead && lead.checkVisibility()), leadText: lead ? lead.textContent : '',
      wayOpen: !!(way && way.open), app: shown('cp-app'), msg: document.getElementById('msg').textContent,
    };
  });
}
const stored = (page) => page.evaluate(() => ({
  session: sessionStorage.getItem('symphony_panel_oauth'), local: localStorage.getItem('symphony_panel_oauth'),
  sessionToken: sessionStorage.getItem('symphony_panel_token'), localToken: localStorage.getItem('symphony_panel_token'),
}));
const signedIn = (page, timeout) => page.waitForSelector('#cp-app:not(.hidden)', { timeout: timeout || 30000 });
const codeShown = (page) => page.waitForFunction((c) => { const b = document.getElementById('cp-code-box'); return b && !b.hidden && document.getElementById('cp-code').textContent === c; }, CODE, { timeout: 10000 });
const said = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('msg').textContent), re.source, { timeout: 30000 });
const polled = (service) => service.filter((s) => s.path === '/device/token');
const gaps = (list) => list.slice(1).map((s, i) => s.at - list[i].at);

await check('K1: in a browser, a second button "Sign in with a code instead" follows Sign in with GitHub, with no code shown and nothing sent; an unconfigured page offers neither, and the cost page offers the same', async () => {
  for (const path of ['/symphony/control/', '/symphony/cost.html']) {
    const { context, page, service, calls, errors } = await open({ path });
    try {
      const f = await gateFacts(page);
      console.log('      ' + path, JSON.stringify(f));
      assert.ok(f.signin && !f.signinDisabled, path + ': Sign in with GitHub is not there to press');
      assert.ok(f.other && !f.otherDisabled && f.otherAfterSignin, path + ': no second way by code after it');
      assert.ok(!f.box && !f.lead, path + ': a code box or the app\'s line shows before any press');
      assert.deepEqual(f.link, ['https://github.com/login/device', '_blank', 'noopener noreferrer'], path + ': the link is not GitHub\'s own page, in a new tab');
      assert.equal(service.length + calls.length, 0, path + ': something was sent before a press');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  const { context, page } = await open({ script: real });
  try {
    const f = await gateFacts(page);
    assert.ok(f.signinDisabled && !f.otherExists && !f.box, 'an unconfigured page offers sign-in by code');
  } finally { await context.close(); }
});

await check('K2: in the app, Sign in with GitHub stays on the page: it shows the code to type on GitHub\'s page, asks for the token at the pace the service names until GitHub has it, and signs in for this tab', async () => {
  const { context, page, service, calls, authorize, errors } = await open({ app: true, tokens: [pending, pending, token] });
  try {
    const before = await gateFacts(page);
    assert.ok(before.signin && !before.other, 'the app shows the second button, which would do the same');
    assert.ok(before.lead && /code to type on GitHub/.test(before.leadText), 'no line says the app signs in by code');
    await page.click('#cp-signin');
    await codeShown(page);
    const shown = await gateFacts(page);
    console.log('      shown:', JSON.stringify(shown));
    assert.equal(shown.msg, 'Type ' + CODE + ' on GitHub\'s page; this page signs you in as soon as you have.');
    assert.ok(shown.signinDisabled, 'the button can be pressed again while the code is up');
    await signedIn(page);
    assert.equal(authorize.length, 0, 'the app left for GitHub\'s authorize page');
    assert.equal(new URL(page.url()).origin, ORIGIN, 'the app left the page');
    const asks = service.filter((s) => s.path === '/device');
    assert.equal(asks.length, 1);
    assert.deepEqual(asks[0].body, {}, 'the page sent something with its ask for a code');
    const p = polled(service);
    assert.equal(p.length, 3);
    assert.ok(p.every((s) => s.body && s.body.device_code === DEVICE && Object.keys(s.body).length === 1), 'a poll carried something other than the device code');
    const first = p[0].at - asks[0].at;
    console.log('      waits:', first, gaps(p).join(', '));
    assert.ok(first >= 4900, 'the first ask for the token came ' + first + ' ms after the code');
    assert.ok(gaps(p).every((g) => g >= 4900), 'asked faster than the interval: ' + gaps(p).join(', '));
    const where = await stored(page);
    assert.equal(where.local, null, 'kept on the browser though Keep me signed in was off');
    const rec = JSON.parse(where.session);
    assert.equal(rec.access_token, 'ghu_TOKEN');
    assert.equal(rec.refresh_token, '', 'a sign-in for this tab put its refresh token in storage');
    assert.equal(await page.textContent('#cp-who'), 'Signed in as tester through GitHub, for this tab.');
    const after = await gateFacts(page);
    assert.ok(!after.box, 'the code stays on the page after the sign-in');
    const authed = calls.filter((c) => c.auth);
    assert.ok(authed.length > 0 && authed.every((c) => c.auth === 'Bearer ghu_TOKEN'));
    assert.ok(calls.every((c) => !/ghu_|ghr_|dc_/.test(c.url)), 'a token or device code in a GitHub address');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('K3: in the app, Keep me signed in keeps the sign-in by code on the browser with its refresh token', async () => {
  const { context, page } = await open({ app: true, tokens: [token] });
  try {
    await page.check('#cp-keep');
    await page.click('#cp-signin');
    await signedIn(page);
    const where = await stored(page);
    assert.equal(where.session, null);
    assert.equal(JSON.parse(where.local).refresh_token, 'ghr_R2', 'a kept sign-in lost its refresh token');
    assert.equal(await page.textContent('#cp-who'), 'Signed in as tester through GitHub, kept on this browser.');
  } finally { await context.close(); }
});

await check('K4: GitHub\'s slow_down makes the page wait the longer interval it names before asking again', async () => {
  const slow = { status: 400, body: { error: 'slow_down', error_description: 'Too many requests have been made in the same timeframe.', interval: 12 } };
  const { context, page, service } = await open({ app: true, tokens: [slow, pending, token] });
  try {
    await page.click('#cp-signin');
    await signedIn(page);
    const g = gaps(polled(service));
    console.log('      gaps:', g.join(', '));
    assert.equal(g.length, 2);
    assert.ok(g[0] >= 11900, 'asked again ' + g[0] + ' ms after slow_down named 12 s');
    assert.ok(g[1] >= 11900, 'went back to the shorter pace after slow_down: ' + g[1] + ' ms');
  } finally { await context.close(); }
});

await check('K5: the service\'s own limit (too_many_requests) and a moment it or GitHub cannot be reached are asked again, the limit more slowly, and the sign-in goes on', async () => {
  const limited = { status: 429, body: { error: 'too_many_requests' } };
  const away = { status: 502, body: { error: 'github_unreachable', error_description: 'GitHub could not be reached; try again' } };
  const { context, page, service } = await open({ app: true, tokens: [limited, { abort: true }, away, token] });
  try {
    await page.click('#cp-signin');
    // five seconds to the first ask, then ten after the limit, and the same ten after each failure
    await signedIn(page, 60000);
    const g = gaps(polled(service));
    console.log('      gaps:', g.join(', '));
    assert.equal(polled(service).length, 4);
    assert.ok(g[0] >= 9900, 'asked again ' + g[0] + ' ms after the service\'s limit, no slower than before');
    assert.ok(g[1] >= 9900 && g[2] >= 9900, 'a failure brought the pace back up: ' + g.join(', '));
  } finally { await context.close(); }
});

for (const [id, error, words] of [
  ['K6', 'expired_token', /^The code ran out before it was typed on GitHub; press the button again for a new one\.$/],
  ['K7', 'access_denied', /^GitHub says the sign-in was cancelled on its page; press the button again to start over\.$/],
]) {
  await check(id + ': GitHub\'s ' + error + ' ends the sign-in with words that say what to do, the code gone, the buttons back, the token box open and nothing kept', async () => {
    const { context, page, service } = await open({ app: true, tokens: [pending, { status: 400, body: { error, error_description: 'x' } }] });
    try {
      await page.click('#cp-signin');
      await said(page, words);
      const f = await gateFacts(page);
      assert.ok(!f.box && !f.app, 'the code or the panel shows after the refusal');
      assert.ok(!f.signinDisabled, 'the button stays held');
      assert.ok(f.wayOpen, 'the token box is not offered');
      assert.equal(await page.evaluate(() => document.getElementById('msg').classList.contains('admin__warn')), true, 'not said as a warning');
      const n = polled(service).length;
      await sleep(6500);
      assert.equal(polled(service).length, n, 'the page went on asking after GitHub refused');
      assert.deepEqual(await stored(page), { session: null, local: null, sessionToken: null, localToken: null });
    } finally { await context.close(); }
  });
}

await check('K8: a SymphonyBoard with Device Flow unticked, or a sign-in service not yet given the routes, says so in words and offers the token, asking for nothing more', async () => {
  for (const [answer, words] of [
    [{ status: 502, body: { error: 'device_flow_disabled', error_description: 'Device Flow must be explicitly enabled for this App' } }, /^Sign-in by code is not turned on for SymphonyBoard yet \(the App's owner ticks "Enable Device Flow" in its settings\); use a token below meanwhile\.$/],
    [{ status: 404, body: { error: 'no_such_route' } }, /^The sign-in service does not offer sign-in by code yet; use a token below meanwhile\.$/],
  ]) {
    const { context, page, service } = await open({ app: true, device: answer });
    try {
      await page.click('#cp-signin');
      await said(page, words);
      const f = await gateFacts(page);
      assert.ok(!f.box && f.wayOpen && !f.signinDisabled);
      await sleep(5500);
      assert.equal(polled(service).length, 0, 'the page asked for a token with no code');
    } finally { await context.close(); }
  }
});

await check('K9: an answer from the service with no code in GitHub\'s form shows none, says so and offers the token', async () => {
  const { context, page, service } = await open({ app: true, device: deviceOk({ user_code: '<b>x</b>' }) });
  try {
    await page.click('#cp-signin');
    await said(page, /^The sign-in service answered without a code\. Press the button again, or use a token below\.$/);
    const f = await gateFacts(page);
    assert.ok(!f.box && f.code === '' && f.wayOpen);
    await sleep(5500);
    assert.equal(polled(service).length, 0);
  } finally { await context.close(); }
});

await check('K10: Cancel takes the code away, gives the buttons back, drops the answer on its way and asks for nothing more', async () => {
  // GitHub's answer to the first ask is still on its way when Cancel is pressed, so the page has a
  // pending answer to drop as well as a timer to stop
  const { context, page, service } = await open({ app: true, tokens: [Object.assign({ delay: 2500 }, pending)] });
  try {
    await page.click('#cp-signin');
    await codeShown(page);
    for (let i = 0; i < 80 && polled(service).length < 1; i++) await sleep(100);
    assert.equal(polled(service).length, 1, 'no poll went out');
    await page.click('#cp-code-cancel');
    const f = await gateFacts(page);
    assert.ok(!f.box && !f.signinDisabled && f.msg === '', 'Cancel left ' + JSON.stringify(f));
    const n = polled(service).length;
    await sleep(11000);
    assert.equal(polled(service).length, n, 'asked again after Cancel');
  } finally { await context.close(); }
});

await check('K11: a token that arrives after Cancel is dropped: the page stays signed out and keeps nothing', async () => {
  const { context, page, service } = await open({ app: true, tokens: [Object.assign({ delay: 3000 }, token)] });
  try {
    await page.click('#cp-signin');
    await codeShown(page);
    for (let i = 0; i < 80 && polled(service).length < 1; i++) await sleep(100);
    assert.equal(polled(service).length, 1, 'no poll went out');
    await page.click('#cp-code-cancel');
    await sleep(4500);
    const f = await gateFacts(page);
    assert.ok(!f.app && f.signin && !f.box, 'the late token signed the page in');
    assert.deepEqual(await stored(page), { session: null, local: null, sessionToken: null, localToken: null });
  } finally { await context.close(); }
});

await check('K12: a new code after Cancel is the only one asked about, the first code\'s polls stopped', async () => {
  const second = 'dc_secondsecondsecondsecondsecond0000000';
  const { context, page, service } = await open({ tokens: [pending, pending, token], device: [deviceOk(), deviceOk({ device_code: second, user_code: 'ABCD-2345' })] });
  try {
    await page.click('#cp-signin-code');
    await codeShown(page);
    await page.click('#cp-code-cancel');
    await page.click('#cp-signin-code');
    await page.waitForFunction(() => document.getElementById('cp-code').textContent === 'ABCD-2345');
    await signedIn(page);
    const p = polled(service);
    console.log('      polls:', p.map((s) => s.body.device_code.slice(0, 9)).join(', '));
    assert.ok(p.length >= 1 && p.every((s) => s.body.device_code === second), 'the first code was still asked about');
  } finally { await context.close(); }
});

await check('K13: in a browser, the code button signs in the same way; while a code is up both buttons are held, and after Cancel Sign in with GitHub leaves for GitHub with nothing more asked about the code', async () => {
  {
    const { context, page, authorize } = await open({ tokens: [token] });
    try {
      await page.click('#cp-signin-code');
      await signedIn(page);
      assert.equal(authorize.length, 0);
      assert.equal(await page.textContent('#cp-who'), 'Signed in as tester through GitHub, for this tab.');
    } finally { await context.close(); }
  }
  {
    const { context, page, service, authorize } = await open({ tokens: [pending] });
    try {
      await page.click('#cp-signin-code');
      await codeShown(page);
      const held = await gateFacts(page);
      assert.ok(held.signinDisabled && held.otherDisabled, 'a button can be pressed while the code is up');
      await page.click('#cp-code-cancel');
      const n = polled(service).length;
      await Promise.all([page.waitForURL((u) => u.origin === ORIGIN && u.searchParams.has('state')), page.click('#cp-signin')]);
      await signedIn(page);
      assert.equal(authorize.length, 1, 'Sign in with GitHub did not leave for GitHub');
      await sleep(5500);
      assert.equal(polled(service).length, n, 'the code was asked about after Sign in with GitHub');
      assert.equal(service.filter((s) => s.path === '/exchange').length, 1);
    } finally { await context.close(); }
  }
});

await check('K14: Copy it and open GitHub puts the code on the clipboard and opens GitHub\'s own page in a new tab, the code staying up', async () => {
  const { context, page } = await open({ app: true, tokens: [pending], clipboard: true });
  try {
    await page.click('#cp-signin');
    await codeShown(page);
    const [tab] = await Promise.all([context.waitForEvent('page'), page.click('#cp-code-open')]);
    await tab.waitForLoadState();
    assert.equal(tab.url(), 'https://github.com/login/device');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), CODE, 'the clipboard does not hold the code');
    assert.ok((await gateFacts(page)).box, 'the code went away when GitHub\'s page opened');
  } finally { await context.close(); }
});

await check('K15: the cost page signs in by code in the app as well', async () => {
  const routes = repoRoutes('acme/demo');
  const { context, page, service } = await open({ app: true, path: '/symphony/cost.html', routes, tokens: [token] });
  try {
    await page.click('#cp-signin');
    await page.waitForFunction(() => document.getElementById('cp-gate').hidden || document.getElementById('cp-gate').classList.contains('hidden') || !document.getElementById('cp-gate').checkVisibility(), null, { timeout: 30000 });
    assert.equal(service.filter((s) => s.path === '/device').length, 1);
    assert.equal(JSON.parse((await stored(page)).session).access_token, 'ghu_TOKEN');
  } finally { await context.close(); }
});

await check('K16: a code that runs out while nobody types it ends at the time the service named, with the words for a code run out, even where GitHub never says so', async () => {
  const { context, page, service } = await open({ app: true, device: deviceOk({ expires_in: 60 }), tokens: [pending] });
  try {
    await page.click('#cp-signin');
    await codeShown(page);
    const start = Date.now();
    await page.waitForFunction(() => /^The code ran out/.test(document.getElementById('msg').textContent), null, { timeout: 80000 });
    const took = Date.now() - start;
    console.log('      ended after', took, 'ms with', polled(service).length, 'polls');
    assert.ok(took >= 59000 && took <= 72000, 'ended after ' + took + ' ms, not at the minute the service named');
    assert.ok(!(await gateFacts(page)).box);
  } finally { await context.close(); }
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
