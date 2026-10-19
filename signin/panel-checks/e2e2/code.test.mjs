// Checks of sign-in by code (site branch claude/sign-in-by-code, 2026-10-19), the way into the
// control panel installed as a Home Screen app, where a sign-in that leaves for GitHub's page may
// come back to the browser rather than into the app: GitHub's device flow through the sign-in
// service's routes /device and /device/token, against a mocked service and GitHub. In the app the
// one button signs in by code and a line says so; in a browser a second, quieter button offers the
// same. Each check states what the page promises; a FAIL is a defect.
//
// The site ships the code way switched off (CODE_SIGNIN in the script, the owner's switch, since
// ticking SymphonyBoard's "Enable Device Flow" lets anyone start a SymphonyBoard code). The checks
// of the code way serve the script with the switch on, whatever the site ships, as app.test.mjs
// serves it from SITE; K17 serves it off and holds that no page then offers a code and the app
// signs in by GitHub's page as a browser does, and K29 holds that the site ships it off.
//
// The app is played two ways: by navigator.standalone, as iOS gives an installed page, and by the
// display mode standalone, as an install through the manifest reports itself (K26); a browser has
// neither. The page asks for the token no faster than the interval the service names, at least
// five seconds, so the checks wait in real time.
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
// the owner's switch for the code way: on for the checks of the code way, off for K17
const CODE_LINE = /var CODE_SIGNIN = (?:true|false);/;
assert.ok(CODE_LINE.test(real), 'the switch CODE_SIGNIN was not found in the script');
// the line as SITE holds it, a mutant's pairs applied, before the suite turns the switch either way (K29)
const shipped = real.match(CODE_LINE)[0];
console.log('the script as the site ships it has ' + shipped);
const codeOn = (s) => s.replace(CODE_LINE, 'var CODE_SIGNIN = true;');
const codeOff = (s) => s.replace(CODE_LINE, 'var CODE_SIGNIN = false;');
const withService = real.replace(SERVICE_LINE, "var SIGNIN_SERVICE = '" + SERVICE + "';").replace(CLIENT_LINE, "var CLIENT_ID = 'Iv1.testclient';");
const configured = codeOn(withService);
const configuredOff = codeOff(withService);
real = codeOn(real.replace(SERVICE_LINE, "var SIGNIN_SERVICE = '';").replace(CLIENT_LINE, "var CLIENT_ID = '';"));

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
// the app installed through the manifest (Android, a computer, a Safari web app): the display mode
// standalone, and no navigator.standalone
const IN_MANIFEST_APP = () => {
  const real = window.matchMedia.bind(window);
  const yes = (q) => ({ matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
  window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? yes(q) : real(q));
};
const PASTED = 'github_pat_PASTED';
const kept = { access_token: 'ghu_KEPT', refresh_token: 'ghr_KEPT', expires_at: Date.now() + 8 * 3600 * 1000, refresh_expires_at: Date.now() + 180 * 86400 * 1000 };

const browser = await chromium.launch();
await consoleTabs(browser);
// opts.device is the answer to /device, or a list of them in turn; opts.tokens the answers to
// /device/token in turn, the last repeated; opts.exchange the answer to /exchange; opts.userDelays
// how long GitHub takes to answer each GET /user in turn, the last repeated; opts.seed runs in the
// page once its storage is cleared, before the page is opened again; opts.phone opens it on a phone
async function open(opts) {
  const phone = opts.phone ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {};
  const context = await browser.newContext(Object.assign({ viewport: opts.viewport || (opts.phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }) }, phone));
  if (opts.clipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  const calls = [];
  const service = [];
  const authorize = [];
  const routes = opts.routes || repoRoutes('acme/demo');
  let users = 0;
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    calls.push({ key, url: req.url(), auth: req.headers()['authorization'] || '', at: Date.now() });
    if (key === 'GET /user' && opts.userDelays) await sleep(opts.userDelays[Math.min(users++, opts.userDelays.length - 1)]);
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
    } else if (path === '/exchange' && opts.exchange) answer = opts.exchange;
    else answer = token;
    if (typeof answer === 'function') answer = await answer(body);
    if (answer.delay) await sleep(answer.delay);
    if (answer.abort) return route.abort('connectionrefused');
    return route.fulfill({ status: answer.status, contentType: 'application/json', headers: cors, body: JSON.stringify(answer.body) });
  });
  if (opts.app) await context.addInitScript(IN_APP);
  if (opts.init) await context.addInitScript(opts.init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const path = opts.path || '/symphony/control/';
  await page.goto(BASE + path.split('?')[0]);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  if (opts.seed) await page.evaluate(opts.seed[0], opts.seed[1]);
  service.length = 0; calls.length = 0;
  await page.goto(BASE + path);
  return { context, page, calls, service, authorize, errors };
}
function gateFacts(page) {
  return page.evaluate(() => {
    const shown = (id) => { const e = document.getElementById(id); return !!(e && e.checkVisibility()); };
    const signin = document.getElementById('cp-signin');
    const other = document.getElementById('cp-signin-code');
    const way = document.getElementById('cp-token-way');
    const open = document.getElementById('cp-code-open');
    const how = (document.getElementById('cp-signin-how') || {}).textContent || '';
    const sent = document.getElementById('cp-sent-code');
    const warn = document.getElementById('cp-code-warn');
    return {
      signin: shown('cp-signin'), signinDisabled: !!(signin && signin.disabled),
      other: shown('cp-signin-code'), otherExists: !!other, otherDisabled: !!(other && other.disabled),
      otherAfterSignin: !!(signin && other && (signin.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING)),
      box: shown('cp-code-box'), boxExists: !!document.getElementById('cp-code-box'), code: (document.getElementById('cp-code') || {}).textContent || '',
      link: open ? [open.href, open.target, open.rel] : null,
      how, lead: /shows a code/.test(how), sentCode: !!(sent && !sent.hidden), sentExists: !!sent,
      warn: warn && warn.checkVisibility() ? warn.textContent : '',
      said: shown('cp-code-said') ? document.getElementById('cp-code-said').textContent : '',
      focus: document.activeElement ? document.activeElement.id : '',
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
  // the service names seven seconds, more than the page's own floor of five, so a page that asks at
  // its floor whatever the service names is caught
  const { context, page, service, calls, authorize, errors } = await open({ app: true, device: deviceOk({ interval: 7 }), tokens: [pending, pending, token] });
  try {
    const before = await gateFacts(page);
    assert.ok(before.signin && !before.other, 'the app shows the second button, which would do the same');
    assert.ok(before.lead && /opens outside the app/.test(before.how) && !/straight back/.test(before.how), 'the gate\'s words do not say the app signs in by code: ' + before.how);
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
    assert.ok(first >= 6900, 'the first ask for the token came ' + first + ' ms after the code, before the seven seconds named');
    assert.ok(gaps(p).every((g) => g >= 6900), 'asked faster than the interval named: ' + gaps(p).join(', '));
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
    // and asked again at that same pace, not more slowly after each failure
    assert.ok(g[1] < 11500 && g[2] < 11500, 'a failure slowed the pace: ' + g.join(', '));
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

// a token pasted into the gate's token box and offered with its button
async function paste(page, t) {
  await page.evaluate(() => { document.getElementById('cp-token-way').open = true; });
  await page.fill('#cp-token', t);
  await page.click('#cp-open');
}
async function untilPolled(service, n) {
  for (let i = 0; i < 120 && polled(service).length < n; i++) await sleep(100);
  assert.ok(polled(service).length >= n, 'no poll ' + n + ' went out');
}
// In the page: whether each node shows whole in the window, under no header or status line held to
// the window's edge, read where the person's eye would land, its middle
function inSight(ids) {
  return ids.map((id) => {
    const e = document.getElementById(id);
    const r = e.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { id, top: Math.round(r.top), bottom: Math.round(r.bottom), height: window.innerHeight, seen: r.top >= 0 && r.bottom <= window.innerHeight && !!at && (e === at || e.contains(at)) };
  });
}
const revoked = (service) => service.filter((s) => s.path === '/revoke').map((s) => s.body && s.body.access_token);

await check('K17: with CODE_SIGNIN off, as the site ships it, no page offers a code: in a browser and in the app, iOS\'s or the manifest\'s, Sign in with GitHub stands alone with the redirect\'s words, nothing the page lists as sent names a code, and the app\'s press leaves for GitHub\'s page and comes back signed in, asking the service for no code', async () => {
  for (const [label, opts] of [
    ['control page, browser', {}],
    ['control page, app (iOS)', { app: true }],
    ['control page, app (manifest)', { init: IN_MANIFEST_APP }],
    ['cost page, app (iOS)', { app: true, path: '/symphony/cost.html' }],
  ]) {
    const { context, page, service, authorize, errors } = await open(Object.assign({ script: configuredOff }, opts));
    try {
      const f = await gateFacts(page);
      console.log('      ' + label, JSON.stringify({ other: f.otherExists, box: f.boxExists, how: f.how.slice(0, 40), sent: f.sentCode }));
      assert.ok(f.signin && !f.signinDisabled, label + ': Sign in with GitHub is not there to press');
      assert.ok(!f.otherExists && !f.boxExists && !f.lead && !f.warn, label + ': a way by code shows: ' + JSON.stringify(f));
      assert.ok(/straight back here signed in/.test(f.how), label + ': the gate\'s words are not the redirect\'s: ' + f.how);
      assert.equal(f.sentExists, !opts.path, label + ': the page\'s list of what it sends is not where it was');
      assert.ok(!f.sentCode, label + ': the page lists a code among what it sends');
      await Promise.all([page.waitForURL((u) => u.origin === ORIGIN && u.searchParams.has('state')), page.click('#cp-signin')]);
      await signedIn(page);
      assert.equal(authorize.length, 1, label + ': Sign in with GitHub did not leave for GitHub\'s page');
      assert.equal(service.filter((x) => x.path === '/device' || x.path === '/device/token').length, 0, label + ': the service was asked about a code');
      assert.equal(service.filter((x) => x.path === '/exchange').length, 1, label + ': GitHub\'s return was not exchanged');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
});

await check('K18: a token pasted while a code is up ends the sign-in by code once GitHub accepts it, before GitHub has named it: no ask follows, the token the code would have earned never takes the paste\'s place, and Forget then leaves the gate with no code and its button free, and nothing signs the page in again', async () => {
  // GitHub answers the paste's first question at once and takes seven seconds to name it, so an ask
  // the code still had due falls inside that wait, as on a slow phone
  const { context, page, service } = await open({ app: true, tokens: [pending, token], userDelays: [0, 7000, 0] });
  try {
    await page.click('#cp-signin');
    await codeShown(page);
    await untilPolled(service, 1);
    await sleep(300);
    await paste(page, PASTED);
    await page.waitForFunction((t) => sessionStorage.getItem('symphony_panel_token') === t, PASTED);
    const n = polled(service).length;
    assert.ok(!(await gateFacts(page)).box, 'the code is still up once the paste was accepted');
    await signedIn(page, 20000);
    await sleep(5500);
    assert.equal(polled(service).length, n, 'the code was asked about after the paste was accepted');
    const where = await stored(page);
    assert.equal(where.sessionToken, PASTED, 'the paste was replaced');
    assert.equal(where.session, null, 'the code\'s token was kept');
    await page.click('#cp-signout');
    const g = await gateFacts(page);
    assert.ok(!g.box && !g.signinDisabled && !g.app, 'Forget left ' + JSON.stringify(g));
    await sleep(6000);
    assert.equal(polled(service).length, n, 'the code was asked about after Forget');
    assert.ok(!(await gateFacts(page)).app, 'the page signed itself in again after Forget');
    assert.deepEqual(await stored(page), { session: null, local: null, sessionToken: null, localToken: null });
  } finally { await context.close(); }
});

await check('K19: the page opening by another way ends a code started while it opened: a kept sign-in found at load, in the app, and GitHub\'s return, in a browser, each close the code, its words and its asks, and the sign-in that opened the page stays the page\'s', async () => {
  {
    // GitHub takes four seconds to name the kept sign-in, and the person presses meanwhile
    const { context, page, service } = await open({ app: true, tokens: [token], userDelays: [4000, 0], seed: [(rec) => localStorage.setItem('symphony_panel_oauth', JSON.stringify(rec)), kept] });
    try {
      await page.click('#cp-signin');
      await codeShown(page);
      await signedIn(page, 15000);
      const f = await gateFacts(page);
      assert.ok(!f.box && !f.signinDisabled, 'the code was left under the panel: ' + JSON.stringify(f));
      assert.ok(f.msg.indexOf(CODE) < 0, 'the code\'s words stayed on the panel: ' + f.msg);
      await sleep(7000);
      assert.equal(polled(service).length, 0, 'the code was asked about under the panel');
      const where = await stored(page);
      assert.equal(JSON.parse(where.local).access_token, 'ghu_KEPT', 'the kept sign-in was replaced');
      assert.equal(where.session, null, 'the code\'s token was kept');
    } finally { await context.close(); }
  }
  // GitHub's return signs the page in through storeSignin before the panel opens, so the code is
  // ended there and its words must go with it: on the control page with the code up, on the cost
  // page, whose line stands in sight above the box, and with the ask for a code still out, whose
  // "Asking GitHub for a code..." would otherwise stay on the signed-in panel
  for (const [label, path, device] of [
    ['control page, code up', '/symphony/control/', undefined],
    ['cost page, code up', '/symphony/cost.html', undefined],
    ['control page, ask for a code still out', '/symphony/control/', Object.assign({ delay: 5000 }, deviceOk())],
  ]) {
    const back = { status: 200, body: { access_token: 'ghu_EXCH', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_E', refresh_token_expires_in: 15897600 }, delay: device ? 2500 : 3000 };
    const state = { state: 'S1', verifier: 'V1', keep: false, back: '' };
    const { context, page, service } = await open({ path: path + '?code=C1&state=S1', exchange: back, device, tokens: [token], seed: [(st) => sessionStorage.setItem('symphony_panel_oauth_state', JSON.stringify(st)), state] });
    try {
      await page.click('#cp-signin-code');
      if (!device) await codeShown(page);
      else await said(page, /Asking GitHub for a code/);
      await signedIn(page, 15000);
      const f = await gateFacts(page);
      assert.ok(!f.box && !f.said, label + ': the code was left under the panel: ' + JSON.stringify(f));
      assert.ok(f.msg.indexOf(CODE) < 0 && !/Asking GitHub for a code/.test(f.msg), label + ': the code\'s words stayed on the panel: ' + f.msg);
      await sleep(device ? 8000 : 7000);
      assert.equal(polled(service).length, 0, label + ': the code was asked about after GitHub\'s return signed the page in');
      const later = await gateFacts(page);
      assert.ok(later.msg.indexOf(CODE) < 0 && !/Asking GitHub for a code/.test(later.msg), label + ': the code\'s words came back on the panel: ' + later.msg);
      assert.equal(JSON.parse((await stored(page)).session).access_token, 'ghu_EXCH', label + ': GitHub\'s return was not the page\'s sign-in');
    } finally { await context.close(); }
  }
});

await check('K20: Forget the token pressed while a code is up on the gate, as a browser that shows the status line\'s buttons there can, ends the code: it goes, the buttons come back, nothing more is asked and nothing signs the page in', async () => {
  const { context, page, service } = await open({ tokens: [pending, token] });
  try {
    await page.click('#cp-signin-code');
    await codeShown(page);
    // the console's stylesheet hides the button while the gate stands, where the browser reads :has()
    await page.evaluate(() => document.getElementById('cp-signout').click());
    const f = await gateFacts(page);
    assert.ok(!f.box && !f.signinDisabled && !f.otherDisabled, 'Forget left ' + JSON.stringify(f));
    await sleep(11000);
    assert.equal(polled(service).length, 0, 'the code was asked about after Forget');
    assert.ok(!(await gateFacts(page)).app, 'the code signed the page in after Forget');
    assert.deepEqual(await stored(page), { session: null, local: null, sessionToken: null, localToken: null });
  } finally { await context.close(); }
});

await check('K21: Keep me signed in is read when the token comes, since the page never left: ticked while the code is up, the sign-in is kept on the browser with its refresh token; unticked while the code is up, it is for this tab alone', async () => {
  {
    const { context, page } = await open({ app: true, tokens: [pending, token] });
    try {
      await page.click('#cp-signin');
      await codeShown(page);
      await page.check('#cp-keep');
      await signedIn(page);
      const where = await stored(page);
      assert.equal(where.session, null, 'ticked while the code was up, the sign-in stayed in the tab');
      assert.equal(JSON.parse(where.local).refresh_token, 'ghr_R2');
      assert.equal(await page.textContent('#cp-who'), 'Signed in as tester through GitHub, kept on this browser.');
    } finally { await context.close(); }
  }
  {
    const { context, page } = await open({ tokens: [pending, token] });
    try {
      await page.check('#cp-keep');
      await page.click('#cp-signin-code');
      await codeShown(page);
      await page.uncheck('#cp-keep');
      await signedIn(page);
      const where = await stored(page);
      assert.equal(where.local, null, 'unticked while the code was up, the sign-in was kept on the browser');
      assert.equal(JSON.parse(where.session).refresh_token, '', 'a sign-in for this tab put its refresh token in storage');
      assert.equal(await page.textContent('#cp-who'), 'Signed in as tester through GitHub, for this tab.');
    } finally { await context.close(); }
  }
});

await check('K22: a token GitHub gives for a code the page has let go of is revoked through the sign-in service: one that comes after Cancel, and one that comes after a paste took the page', async () => {
  {
    const { context, page, service } = await open({ app: true, tokens: [Object.assign({ delay: 3000 }, token)] });
    try {
      await page.click('#cp-signin');
      await codeShown(page);
      await untilPolled(service, 1);
      await page.click('#cp-code-cancel');
      await sleep(4500);
      assert.deepEqual(revoked(service), ['ghu_TOKEN'], 'the token that came after Cancel was not revoked');
      assert.deepEqual(await stored(page), { session: null, local: null, sessionToken: null, localToken: null });
    } finally { await context.close(); }
  }
  {
    const { context, page, service } = await open({ app: true, tokens: [Object.assign({ delay: 4000 }, token)] });
    try {
      await page.click('#cp-signin');
      await codeShown(page);
      await untilPolled(service, 1);
      await paste(page, PASTED);
      await signedIn(page);
      await sleep(5000);
      assert.deepEqual(revoked(service), ['ghu_TOKEN'], 'the token that came after the paste was not revoked');
      assert.equal((await stored(page)).sessionToken, PASTED, 'the late token took the paste\'s place');
    } finally { await context.close(); }
  }
});

await check('K23: the gate\'s words say what each way does: in the app, the words that said one press sends you straight back say the press shows a code to type on GitHub\'s page outside the app, on both pages; in a browser, where Sign in with GitHub still goes straight back, they stay; and what the page lists as sent names the code\'s requests', async () => {
  for (const [label, opts, how] of [
    ['control page, app', { app: true }, /^In this app, Sign in with GitHub shows a code: type it on GitHub.s page, which opens outside the app, allow SymphonyBoard, then come back here and the page signs you in\.$/],
    ['cost page, app', { app: true, path: '/symphony/cost.html' }, /^In this app, Sign in with GitHub shows a code: .* reads the file as you\.$/],
    ['control page, browser', {}, /^One press: GitHub asks, the first time only, whether SymphonyBoard may act as you, and sends you straight back here signed in\.$/],
  ]) {
    const { context, page } = await open(opts);
    try {
      const f = await gateFacts(page);
      assert.ok(how.test(f.how), label + ': the gate says ' + JSON.stringify(f.how));
      if (!opts.path) {
        assert.ok(f.sentCode, label + ': what the page sends does not name the code\'s requests');
        const sent = await page.evaluate(() => document.getElementById('cp-sent-code').textContent);
        assert.ok(/device code/.test(sent) && /every five seconds/.test(sent) && /client id alone/.test(sent), label + ': the list of what is sent says ' + sent);
      }
    } finally { await context.close(); }
  }
});

await check('K24: the code comes into sight: on a phone, the code and Copy it and open GitHub show whole in the window, clear of the status line, as soon as they appear, on the control page and on the cost page; and with a keyboard the focus goes on to Copy it and open GitHub, and back to the button after Cancel', async () => {
  for (const path of ['/symphony/control/', '/symphony/cost.html']) {
    const { context, page } = await open({ app: true, phone: true, path, tokens: [pending] });
    try {
      // a person who has just reached the button: it shows at the window's foot
      await page.evaluate(() => document.getElementById('cp-signin').scrollIntoView({ block: 'end' }));
      await page.tap('#cp-signin');
      await codeShown(page);
      await sleep(400);
      const seen = await page.evaluate(inSight, ['cp-code', 'cp-code-open']);
      console.log('      ' + path, JSON.stringify(seen));
      assert.ok(seen.every((x) => x.seen), path + ': out of sight on a phone: ' + JSON.stringify(seen));
    } finally { await context.close(); }
  }
  const { context, page } = await open({ tokens: [pending] });
  try {
    await page.focus('#cp-signin-code');
    await page.keyboard.press('Enter');
    await codeShown(page);
    assert.equal((await gateFacts(page)).focus, 'cp-code-open', 'the focus was not carried on to the code\'s box');
    await page.focus('#cp-code-cancel');
    await page.keyboard.press('Enter');
    const f = await gateFacts(page);
    assert.ok(!f.box, 'Cancel left the code up');
    assert.equal(f.focus, 'cp-signin-code', 'the focus was left on the hidden box');
  } finally { await context.close(); }
});

await check('K25: on the cost page, whose own line stands above the sign-in box, how a sign-in by code ended is said under the box too, in sight on a phone: an App with Device Flow unticked, and GitHub\'s cancel', async () => {
  for (const [label, opts, words] of [
    ['unticked', { device: { status: 502, body: { error: 'device_flow_disabled', error_description: 'x' } } }, /^Sign-in by code is not turned on for SymphonyBoard yet/],
    ['cancelled', { tokens: [pending, { status: 400, body: { error: 'access_denied', error_description: 'x' } }] }, /^GitHub says the sign-in was cancelled on its page/],
  ]) {
    const { context, page } = await open(Object.assign({ app: true, phone: true, path: '/symphony/cost.html' }, opts));
    try {
      await page.evaluate(() => document.getElementById('cp-signin').scrollIntoView({ block: 'end' }));
      await page.tap('#cp-signin');
      await page.waitForFunction((src) => { const l = document.getElementById('cp-code-said'); return l && !l.hidden && new RegExp(src).test(l.textContent); }, words.source, { timeout: 20000 });
      await sleep(400);
      const seen = await page.evaluate(inSight, ['cp-code-said']);
      assert.ok(seen[0].seen, label + ': the words are out of sight: ' + JSON.stringify(seen));
      const f = await gateFacts(page);
      assert.ok(!f.box && f.wayOpen, label + ': ' + JSON.stringify(f));
    } finally { await context.close(); }
  }
});

await check('K26: installed through the manifest (the display mode standalone, no navigator.standalone), the page is the app: one button, the app\'s words, and the press shows a code without leaving', async () => {
  const { context, page, authorize, errors } = await open({ init: IN_MANIFEST_APP, tokens: [pending] });
  try {
    const f = await gateFacts(page);
    assert.ok(f.signin && !f.other && f.lead, 'shown as a browser: ' + JSON.stringify(f));
    await page.click('#cp-signin');
    await codeShown(page);
    assert.equal(authorize.length, 0, 'the app left for GitHub\'s authorize page');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

await check('K27: a service that names a pace under five seconds is asked no faster than every five', async () => {
  const { context, page, service } = await open({ app: true, device: deviceOk({ interval: 1 }), tokens: [pending, token] });
  try {
    await page.click('#cp-signin');
    await signedIn(page);
    const ask = service.find((x) => x.path === '/device');
    const p = polled(service);
    const waits = [p[0].at - ask.at].concat(gaps(p));
    console.log('      waits:', waits.join(', '));
    assert.equal(p.length, 2);
    assert.ok(waits.every((w) => w >= 4900), 'asked faster than every five seconds: ' + waits.join(', '));
  } finally { await context.close(); }
});

await check('K28: beside the code, plain words say to type it only on github.com/login/device and only when this page started it, that GitHub names SymphonyBoard there, and what a code someone sends would do', async () => {
  const { context, page } = await open({ app: true, tokens: [pending] });
  try {
    await page.click('#cp-signin');
    await codeShown(page);
    const f = await gateFacts(page);
    const box = await page.evaluate(() => document.getElementById('cp-code-box').textContent);
    assert.ok(/GitHub names SymphonyBoard/.test(box), 'the box does not say GitHub names SymphonyBoard: ' + box);
    assert.ok(/only there, on github\.com\/login\/device/.test(f.warn) && /only one you started on this page/.test(f.warn) && /would sign them in as you/.test(f.warn), 'the warning beside the code says ' + JSON.stringify(f.warn));
  } finally { await context.close(); }
});

// The suite turns the switch itself, so nothing above shows what the site ships; this one does.
// Turning the code way on is the owner's choice, after a statement that describes it (symphony-app's
// signin/README.md, step 9), and the owner's pull request that turns it on comes with one that turns
// this check round, so no other pull request turns it on unnoticed.
await check('K29: the site ships the code way switched off: the script as SITE holds it has var CODE_SIGNIN = false;', async () => {
  assert.equal(shipped, 'var CODE_SIGNIN = false;', 'the site ships the code way switched on; that is the owner\'s switch alone (signin/README.md, step 9)');
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
