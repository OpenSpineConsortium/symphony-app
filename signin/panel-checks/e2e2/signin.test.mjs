// End-to-end checks of "Sign in with GitHub" as the panel's first way in, against a mocked GitHub
// and a mocked sign-in service. Each check states what the page promises; a FAIL is a defect.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const SERVICE = 'https://signin.example.test';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const now = new Date().toISOString();
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 4).join('\n     ')); }
}

let real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
// a mutant, for proving a check bites: pairs of [text, replacement] applied to the script
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(real.includes(a), 'mutant text not found: ' + a.slice(0, 60)); real = real.replace(a, b); }
// The site sets the two constants to the live service and client id; the checks set them to the
// mocked service for the configured page and empty them for the unconfigured one, so the same
// checks hold whatever the shipped script names.
const SERVICE_LINE = /var SIGNIN_SERVICE = '[^']*';/;
const CLIENT_LINE = /var CLIENT_ID = '[^']*';/;
assert.ok(SERVICE_LINE.test(real) && CLIENT_LINE.test(real), 'the two constants were not found in the script');
const configured = real.replace(SERVICE_LINE, "var SIGNIN_SERVICE = '" + SERVICE + "';").replace(CLIENT_LINE, "var CLIENT_ID = 'Iv1.testclient';");
real = real.replace(SERVICE_LINE, "var SIGNIN_SERVICE = '';").replace(CLIENT_LINE, "var CLIENT_ID = '';");
assert.notEqual(configured, real, 'the two constants were not set apart');

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

const browser = await chromium.launch();
await consoleTabs(browser);
// one fresh browser profile per check; the service and GitHub's authorize page are mocked
async function open(opts) {
  // a phone (opts.mobile) is a narrow window with touch, as Playwright emulates one
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, hasTouch: !!opts.mobile, isMobile: !!opts.mobile });
  const calls = [];
  const service = [];
  const authorize = [];
  const routes = opts.routes || repoRoutes('acme/demo');
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    let tab = null;
    try { tab = req.frame().page(); } catch (e) { tab = null; }
    calls.push({ key, url: req.url(), auth: req.headers()['authorization'] || '', tab });
    let r = routes[key];
    if (typeof r === 'function') r = await r(req);
    const headers = { 'Access-Control-Expose-Headers': 'Link' };
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) });
    if (r && r.status) return route.fulfill({ status: r.status, contentType: 'application/json', headers, body: JSON.stringify(r.body || {}) });
    if (r && typeof r.raw === 'string') return route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', headers, body: r.raw });
    if (r === null) return route.fulfill({ status: 204, headers, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(r) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: opts.script || real }));
  await context.route('https://github.com/login/oauth/**', (route) => {
    const u = new URL(route.request().url());
    authorize.push(u);
    const back = u.searchParams.get('redirect_uri') + (opts.denied
      ? '?error=access_denied&error_description=' + encodeURIComponent('The user has denied your application access.') + '&state=' + encodeURIComponent(u.searchParams.get('state'))
      : '?code=CODE1&state=' + encodeURIComponent(u.searchParams.get('state')));
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify(back) + ')</script>' });
  });
  await context.route(SERVICE + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': new URL(BASE).origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const path = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
    service.push({ path, body, origin: req.headers()['origin'] || '' });
    const answer = (opts.serviceFn && await opts.serviceFn(path, body)) || (opts.service && opts.service[path]) || { status: 200, body: { access_token: path === '/refresh' ? 'ghu_NEW' : 'ghu_TOKEN', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } };
    if (answer.delay) await new Promise((r) => setTimeout(r, answer.delay));
    if (answer.abort) return route.abort('connectionrefused');
    return route.fulfill({ status: answer.status, contentType: 'application/json', headers: cors, body: JSON.stringify(answer.body) });
  });
  if (opts.initScript) await context.addInitScript(opts.initScript);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // seed the storage on the site's origin, then load the page the check is about
  await page.goto(BASE + '/symphony/control/');
  await page.evaluate((s) => {
    localStorage.clear(); sessionStorage.clear();
    for (const k in (s.local || {})) localStorage.setItem(k, s.local[k]);
    for (const k in (s.session || {})) sessionStorage.setItem(k, s.session[k]);
  }, opts.storage || {});
  service.length = 0; calls.length = 0;
  if (!opts.noLoad) await page.goto(BASE + (opts.path || '/symphony/control/'));
  return { context, page, calls, service, authorize, errors };
}
async function gateFacts(page) {
  return page.evaluate(() => {
    const signin = document.getElementById('cp-signin');
    const token = document.getElementById('cp-token');
    const way = document.getElementById('cp-token-way');
    const off = document.getElementById('cp-signin-off');
    return {
      signinVisible: !!(signin && signin.checkVisibility()),
      signinDisabled: !!(signin && signin.disabled),
      offShown: !!(off && !off.classList.contains('hidden') && off.checkVisibility()),
      wayOpen: !!(way && way.open),
      tokenVisible: !!(token && token.checkVisibility()),
      signinFirst: !!(signin && token && (signin.compareDocumentPosition(token) & Node.DOCUMENT_POSITION_FOLLOWING)),
      tokenInsideWay: !!(way && token && way.contains(token)),
    };
  });
}

// A wait on #msg in a tab that is loading a new document starts once that document has loaded, as
// the other checks' waits do after page.goto: until the parser reaches #msg, in the console's
// status line at the foot of the body, there is no element to read, and a wait whose test throws
// ends at once. The panel's script runs after it, at the end of the body, so by the load the
// console is set up as well.
const ORIGIN = new URL(BASE).origin;
// Sign in with GitHub leaves for GitHub's authorize page, which sends the tab back with the state
const pressSigninAndReturn = (page) => Promise.all([page.waitForURL((u) => u.origin === ORIGIN && u.searchParams.has('state')), page.click('#cp-signin')]);
const onControlPage = (u) => u.origin === ORIGIN && u.pathname === '/symphony/control/';

await check('A1: unconfigured, the control page shows Sign in with GitHub first, unpressable, says why, token box open', async () => {
  const { context, page, service, errors } = await open({});
  const f = await gateFacts(page);
  console.log('     ', JSON.stringify(f));
  assert.ok(f.signinVisible && f.signinDisabled && f.offShown && f.wayOpen && f.tokenVisible && f.signinFirst && f.tokenInsideWay);
  assert.equal(service.length, 0, 'the page called the sign-in service unasked');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('A2: unconfigured, the cost page has the same gate', async () => {
  const { context, page, errors } = await open({ path: '/symphony/cost.html' });
  const f = await gateFacts(page);
  console.log('     ', JSON.stringify(f));
  assert.ok(f.signinVisible && f.signinDisabled && f.offShown && f.wayOpen && f.tokenVisible && f.signinFirst && f.tokenInsideWay);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('B1: configured, the button is pressable, the note hidden, the token folded away, nothing sent before the press', async () => {
  const { context, page, service, calls } = await open({ script: configured });
  const f = await gateFacts(page);
  console.log('     ', JSON.stringify(f));
  assert.ok(f.signinVisible && !f.signinDisabled && !f.offShown && !f.wayOpen && !f.tokenVisible && f.signinFirst);
  assert.equal(service.length, 0);
  assert.equal(calls.length, 0, 'GitHub was called before any sign-in');
  await page.click('#cp-token-way > summary');
  assert.ok(await page.isVisible('#cp-token'), 'the token box opens from its summary');
  await context.close();
});

await check('B2: one press signs in through GitHub, PKCE holds, ?repo= survives, the token stays in this tab', async () => {
  const routes = repoRoutes('acme/new');
  const { context, page, calls, service, authorize, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/new' });
  await page.click('#cp-signin');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  await page.waitForFunction(() => /^acme\/new, default/.test(document.getElementById('cp-summary').textContent));
  assert.equal(authorize.length, 1);
  const a = authorize[0];
  console.log('      authorize:', a.pathname, [...a.searchParams.keys()].join(','));
  assert.equal(a.origin + a.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(a.searchParams.get('client_id'), 'Iv1.testclient');
  assert.equal(a.searchParams.get('redirect_uri'), BASE + '/symphony/control/');
  assert.equal(a.searchParams.get('code_challenge_method'), 'S256');
  assert.match(a.searchParams.get('state'), /^[0-9a-f]{32}$/);
  const ex = service.filter((s) => s.path === '/exchange');
  assert.equal(ex.length, 1, 'one exchange');
  assert.equal(ex[0].body.code, 'CODE1');
  assert.equal(ex[0].body.redirect_uri, BASE + '/symphony/control/');
  const challenge = crypto.createHash('sha256').update(ex[0].body.code_verifier).digest('base64url');
  assert.equal(challenge, a.searchParams.get('code_challenge'), 'the verifier does not hash to the challenge');
  const where = await page.evaluate(() => ({
    search: location.search, local: localStorage.getItem('symphony_panel_oauth'), session: sessionStorage.getItem('symphony_panel_oauth'),
    pending: sessionStorage.getItem('symphony_panel_oauth_state'), who: document.getElementById('cp-who').textContent,
  }));
  console.log('      after:', where.search, '|', where.who);
  assert.equal(where.search, '?repo=acme%2Fnew', 'the page did not come back to the repository it was opened on');
  assert.equal(where.local, null, 'the token went to localStorage though Keep me signed in was off');
  assert.ok(where.session && JSON.parse(where.session).access_token === 'ghu_TOKEN');
  assert.equal(JSON.parse(where.session).refresh_token, '', 'a sign-in for this tab put its refresh token in storage');
  assert.equal(where.pending, null, 'the sign-in secret stayed behind');
  assert.equal(where.who, 'Signed in as tester through GitHub, for this tab.');
  const authed = calls.filter((c) => c.auth);
  assert.ok(authed.length > 0 && authed.every((c) => c.auth === 'Bearer ghu_TOKEN'));
  assert.ok(calls.every((c) => !/CODE1|ghu_|ghr_/.test(c.url)), 'a code or token in a GitHub address');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('B3: a dispatch the App may not make says what to do about it', async () => {
  const routes = repoRoutes('acme/demo');
  routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = { status: 403, body: { message: 'Resource not accessible by integration' } };
  routes['GET /repos/acme/demo/actions/runs'] = { status: 403, body: { message: 'Resource not accessible by integration' } };
  routes['GET /repos/acme/demo/commits/main/check-runs'] = { check_runs: [] };
  const { context, page } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo' });
  await page.click('#cp-signin');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  await page.waitForFunction(() => /cannot list Actions runs/.test(document.getElementById('cp-runs-note').textContent));
  const note = await page.textContent('#cp-runs-note');
  console.log('      runs note:', note);
  assert.match(note, /^The sign-in cannot list Actions runs \(403\)/);
  assert.match(note, /once SymphonyBoard holds Actions: read/);
  await page.click('#cp-run-workers');
  await page.waitForFunction(() => /403/.test(document.getElementById('msg').textContent));
  const msg = await page.textContent('#msg');
  console.log('      message:', msg);
  assert.match(msg, /The sign-in may not do this \(403: Resource not accessible by integration\)/);
  assert.match(msg, /once SymphonyBoard holds it/);
  await context.close();
});

await check('B4: Forget the token revokes it through the service and shows the sign-in again', async () => {
  const { context, page, service } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo' });
  await page.click('#cp-signin');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  await page.click('#cp-signout');
  await page.waitForFunction(() => /revoked at GitHub/.test(document.getElementById('msg').textContent));
  const rv = service.filter((s) => s.path === '/revoke');
  assert.equal(rv.length, 1);
  assert.equal(rv[0].body.access_token, 'ghu_TOKEN');
  const f = await gateFacts(page);
  assert.ok(f.signinVisible && !f.signinDisabled);
  const left = await page.evaluate(() => [localStorage.getItem('symphony_panel_oauth'), sessionStorage.getItem('symphony_panel_oauth'), localStorage.getItem('symphony_panel_token'), sessionStorage.getItem('symphony_panel_token')]);
  assert.deepEqual(left, [null, null, null, null]);
  await context.close();
});

await check('B5: Keep me signed in puts the sign-in in localStorage', async () => {
  const { context, page } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo' });
  await page.check('#cp-keep');
  await page.click('#cp-signin');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  const where = await page.evaluate(() => [!!localStorage.getItem('symphony_panel_oauth'), !!sessionStorage.getItem('symphony_panel_oauth'), document.getElementById('cp-who').textContent]);
  console.log('      ', JSON.stringify(where));
  assert.deepEqual(where, [true, false, 'Signed in as tester through GitHub, kept on this browser.']);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('symphony_panel_oauth'))).refresh_token, 'ghr_R2', 'a kept sign-in lost its refresh token');
  await context.close();
});

await check('B6: the cost page signs in and comes back to itself', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /repos/acme/demo/contents/METRICS.json'] = { status: 404, body: { message: 'Not Found' } };
  const { context, page, authorize, service } = await open({ script: configured, routes, path: '/symphony/cost.html', storage: { local: { symphony_panel_repos: JSON.stringify(['acme/demo']) } } });
  await page.click('#cp-signin');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  assert.equal(authorize[0].searchParams.get('redirect_uri'), BASE + '/symphony/cost.html');
  assert.equal(service.filter((s) => s.path === '/exchange')[0].body.redirect_uri, BASE + '/symphony/cost.html');
  assert.equal(await page.evaluate(() => location.search), '');
  await context.close();
});

await check('C1: GitHub refusing (access denied) says so, opens the token box and cleans the address', async () => {
  const { context, page, service } = await open({ script: configured, denied: true, path: '/symphony/control/?repo=acme/demo' });
  await pressSigninAndReturn(page);
  await page.waitForFunction(() => /did not sign you in/.test(document.getElementById('msg').textContent));
  const msg = await page.textContent('#msg');
  const f = await gateFacts(page);
  const search = await page.evaluate(() => location.search);
  console.log('      message:', msg, '| address:', search);
  assert.match(msg, /access_denied/);
  assert.ok(f.wayOpen && f.tokenVisible && !f.signinDisabled);
  assert.equal(new URLSearchParams(search).get('repo'), 'acme/demo', 'the address was not put back as it was');
  assert.ok(!/error|state|code/.test(search), 'GitHub\'s words stayed in the address');
  assert.equal(service.length, 0);
  await context.close();
});

await check('C2: a return whose state differs exchanges nothing', async () => {
  const pending = JSON.stringify({ state: 'a'.repeat(32), verifier: 'b'.repeat(64), keep: false, back: '?repo=acme/demo' });
  const { context, page, service } = await open({ script: configured, path: '/symphony/control/?code=STOLEN&state=' + 'c'.repeat(32), storage: { session: { symphony_panel_oauth_state: pending } } });
  await page.waitForFunction(() => /did not come back the way it left/.test(document.getElementById('msg').textContent));
  assert.equal(service.length, 0, 'a code with the wrong state was exchanged');
  const where = await page.evaluate(() => [location.search, sessionStorage.getItem('symphony_panel_oauth_state')]);
  console.log('      ', JSON.stringify(where));
  assert.ok(!/STOLEN/.test(where[0]), 'the code stayed in the address');
  assert.equal(where[1], null);
  await context.close();
});

await check('C3: the service refusing the code says so and offers the token', async () => {
  const { context, page } = await open({ script: configured, service: { '/exchange': { status: 502, body: { error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' } } }, path: '/symphony/control/' });
  await pressSigninAndReturn(page);
  await page.waitForFunction(() => /bad_verification_code/.test(document.getElementById('msg').textContent));
  const msg = await page.textContent('#msg');
  console.log('      message:', msg);
  assert.match(msg, /Press Sign in with GitHub to try again, or use a token\./);
  const f = await gateFacts(page);
  assert.ok(f.wayOpen && f.tokenVisible);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_oauth') || localStorage.getItem('symphony_panel_oauth')), null);
  await context.close();
});

await check('D1: an expired sign-in is renewed before the first call, and the new token is used', async () => {
  const record = JSON.stringify({ access_token: 'ghu_OLD', refresh_token: 'ghr_R', expires_at: Date.now() - 1000, refresh_expires_at: Date.now() + 86400000 });
  const { context, page, calls, service } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_oauth: record } } });
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  const rf = service.filter((s) => s.path === '/refresh');
  assert.equal(rf.length, 1, 'one renewal, however many calls');
  assert.equal(rf[0].body.refresh_token, 'ghr_R');
  const authed = calls.filter((c) => c.auth);
  assert.ok(authed.length > 0 && authed.every((c) => c.auth === 'Bearer ghu_NEW'), 'a call went out with the old token');
  await context.close();
});

// the review's findings, each as the page now promises it
const HOUR = 3600000;
const rec = (access, refresh, expiresIn) => JSON.stringify({ access_token: access, refresh_token: refresh, expires_at: Date.now() + expiresIn, refresh_expires_at: Date.now() + 100 * 24 * HOUR });
// GitHub's refresh tokens are single use: the first renewal of one wins, any later one is refused
function singleUse(delayFirst, delayRefused) {
  const spent = new Set();
  return (path, body) => {
    if (path !== '/refresh') return null;
    if (spent.has(body.refresh_token)) return { status: 400, delay: delayRefused || 0, body: { error: 'bad_refresh_token', error_description: 'The refresh token passed is incorrect or expired.' } };
    spent.add(body.refresh_token);
    return { status: 200, delay: delayFirst || 0, body: { access_token: 'ghu_NEW', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } };
  };
}
async function signedInFacts(page) {
  return page.evaluate(() => ({
    app: !document.getElementById('cp-app').classList.contains('hidden'),
    gate: !document.getElementById('cp-gate').classList.contains('hidden'),
    msg: document.getElementById('msg').textContent,
    local: localStorage.getItem('symphony_panel_oauth'),
    session: sessionStorage.getItem('symphony_panel_oauth'),
    pasted: sessionStorage.getItem('symphony_panel_token') || localStorage.getItem('symphony_panel_token'),
  }));
}

await check('E1: two tabs of a kept sign-in renew in turn: one renewal, both signed in with the new token', async () => {
  const { context, page, calls, service, errors } = await open({ script: configured, noLoad: true, serviceFn: singleUse(800), storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', -1000), symphony_panel_repos: JSON.stringify(['acme/demo']) } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([page, page2].map((p) => p.waitForSelector('#cp-app:not(.hidden)', { timeout: 15000 })));
  const rf = service.filter((x) => x.path === '/refresh');
  console.log('      renewals:', rf.length);
  assert.equal(rf.length, 1, 'the second tab spent the refresh token again');
  const authed = calls.filter((c) => c.auth);
  assert.ok(authed.length > 0 && authed.every((c) => c.auth === 'Bearer ghu_NEW'), 'a call went out with the old token');
  const kept = JSON.parse((await signedInFacts(page)).local);
  assert.equal(kept.refresh_token, 'ghr_R2');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E1b: in a browser with no lock, the tab GitHub refuses waits for the other tab\'s renewal and takes it', async () => {
  const { context, page, calls, service, errors } = await open({
    script: configured, noLoad: true, serviceFn: singleUse(900, 0),
    initScript: () => { Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true }); },
    storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', -1000), symphony_panel_repos: JSON.stringify(['acme/demo']) } },
  });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  assert.equal(await page.evaluate(() => typeof navigator.locks), 'undefined', 'the lock was not taken away');
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([page, page2].map((p) => p.waitForSelector('#cp-app:not(.hidden)', { timeout: 15000 })));
  const rf = service.filter((x) => x.path === '/refresh');
  console.log('      renewals:', rf.length);
  assert.equal(rf.length, 2, 'the race did not happen, so this check proves nothing');
  const f1 = await signedInFacts(page), f2 = await signedInFacts(page2);
  assert.ok(f1.app && f2.app && !f1.gate && !f2.gate, 'a tab was signed out by the other one\'s renewal');
  assert.equal(JSON.parse(f1.local).refresh_token, 'ghr_R2');
  const late = calls.filter((c) => c.auth && c.auth !== 'Bearer ghu_NEW');
  assert.equal(late.length, 0, 'a call went out with the old token');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E2: a tab-only sign-in renews into its own tab and leaves the one kept on the browser alone', async () => {
  const kept = rec('ghu_KEPT', 'ghr_K', 2 * HOUR);
  const { context, page, calls, errors } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_oauth: rec('ghu_TAB', 'ghr_T', -1000) }, local: { symphony_panel_oauth: kept } } });
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  const f = await signedInFacts(page);
  assert.equal(f.local, kept, 'the kept sign-in was changed');
  assert.equal(JSON.parse(f.session).access_token, 'ghu_NEW');
  assert.ok(calls.filter((c) => c.auth).every((c) => c.auth === 'Bearer ghu_NEW'));
  assert.match(await page.textContent('#cp-who'), /for this tab\.$/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E3: a revoked sign-in brings the sign-in box back, dropping only this tab\'s sign-in', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = (req) => (req.headers()['authorization'] === 'Bearer ghu_DEAD' ? { status: 401, body: { message: 'Bad credentials' } } : { login: 'tester' });
  const kept = rec('ghu_KEPT', 'ghr_K', 2 * HOUR);
  const { context, page, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_oauth: rec('ghu_DEAD', 'ghr_D', 2 * HOUR) }, local: { symphony_panel_oauth: kept } } });
  await page.waitForFunction(() => /401/.test(document.getElementById('msg').textContent));
  const f = await signedInFacts(page);
  console.log('      message:', f.msg);
  assert.match(f.msg, /refused the sign-in's token \(401\).*Press Sign in with GitHub again\./);
  assert.ok(f.gate && !f.app);
  assert.equal(f.session, null, 'the dead sign-in stayed');
  assert.equal(f.local, kept, 'the sign-in kept on the browser went with it');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E3b: a pasted token GitHub refuses mid-session brings the box back with the token field open', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /repos/acme/demo'] = { status: 401, body: { message: 'Bad credentials' } };
  const { context, page, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_token: 'github_pat_X' } } });
  await page.waitForFunction(() => /401/.test(document.getElementById('msg').textContent));
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  const f = await signedInFacts(page);
  const g = await gateFacts(page);
  console.log('      message:', f.msg);
  assert.match(f.msg, /GitHub refused the token \(401\)\. Paste one that is still valid, or press Sign in with GitHub\./);
  assert.ok(f.gate && !f.app && g.wayOpen && g.tokenVisible);
  assert.equal(f.pasted, 'github_pat_X', 'the token was dropped before a new one replaced it');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E4: a link carrying ?error= that this tab did not start puts no words of its on the page', async () => {
  const { context, page, service } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo&error=access_denied&error_description=' + encodeURIComponent('Call +1 555 0100 to restore your account') + '&state=' + 'd'.repeat(32) });
  await page.waitForSelector('#cp-gate:not(.hidden)');
  const f = await signedInFacts(page);
  const search = await page.evaluate(() => location.search);
  console.log('      message:', JSON.stringify(f.msg), '| address:', search);
  assert.ok(!/555|restore|access_denied/.test(f.msg), 'the link\'s words reached the page');
  assert.equal(search, '?repo=acme%2Fdemo');
  assert.equal(service.length, 0);
  await context.close();
});

await check('E4b: GitHub\'s words for a sign-in this tab started are cut to a line', async () => {
  const pending = JSON.stringify({ state: 'e'.repeat(32), verifier: 'f'.repeat(64), keep: false, back: '' });
  const { context, page } = await open({ script: configured, path: '/symphony/control/?error=' + 'x'.repeat(300) + '&error_description=' + 'y'.repeat(900) + '&state=' + 'e'.repeat(32), storage: { session: { symphony_panel_oauth_state: pending } } });
  await page.waitForFunction(() => /did not sign you in/.test(document.getElementById('msg').textContent));
  const msg = await page.textContent('#msg');
  console.log('      message length:', msg.length);
  assert.ok(msg.length < 400, 'the message carries the whole of GitHub\'s words');
  await context.close();
});

await check('E5: Add on a repository the sign-in cannot see offers SymphonyBoard\'s install page for it', async () => {
  const { context, page, errors } = await open({ script: configured, path: '/symphony/control/', storage: { session: { symphony_panel_oauth: rec('ghu_TOKEN', 'ghr_R', 2 * HOUR) } } });
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  await page.fill('#cp-add-name', 'acme/private');
  await page.click('#cp-add');
  await page.waitForFunction(() => /sees nothing at acme\/private/.test(document.getElementById('cp-add-answer').textContent));
  const links = await page.$$eval('#cp-add-answer a', (as) => as.map((a) => a.href));
  console.log('      links:', links.join(' '));
  assert.ok(links[0].startsWith('https://github.com/apps/symphonyboard/installations/new?state=acme%2Fprivate'));
  assert.ok(links.some((h) => /symphony-start\/issues\/new\?template=adopt\.yml/.test(h)));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E5b: the same 404 with a pasted token says the token does not reach it, with no install page', async () => {
  const { context, page } = await open({ script: configured, path: '/symphony/control/', storage: { session: { symphony_panel_token: 'github_pat_X' } } });
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  await page.fill('#cp-add-name', 'acme/private');
  await page.click('#cp-add');
  await page.waitForFunction(() => /404/.test(document.getElementById('msg').textContent));
  assert.match(await page.textContent('#msg'), /the token does not reach it/);
  assert.equal(await page.$$eval('#cp-add-answer a', (as) => as.length), 0);
  await context.close();
});

await check('E6: Forget the token during a renewal keeps the page signed out and revokes the renewed token too', async () => {
  const { context, page, service, errors } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo', serviceFn: (path) => (path === '/refresh' ? { status: 200, delay: 1500, body: { access_token: 'ghu_NEW', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } } : null), storage: { session: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', 2 * HOUR) } } });
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  // eight hours pass: the stored token is about to run out, and Refresh starts a renewal
  await page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  await page.click('#cp-refresh');
  await page.waitForFunction(() => true);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(service.filter((x) => x.path === '/refresh').length, 1, 'no renewal started');
  await page.click('#cp-signout');
  await new Promise((r) => setTimeout(r, 2500));
  const f = await signedInFacts(page);
  const revoked = service.filter((x) => x.path === '/revoke').map((x) => x.body.access_token).sort();
  console.log('      revoked:', revoked.join(','), '| message:', f.msg);
  assert.deepEqual(revoked, ['ghu_NEW', 'ghu_OLD']);
  assert.ok(f.gate && !f.app);
  assert.equal(f.session, null, 'the renewal brought the sign-in back');
  assert.equal(f.local, null);
  assert.match(f.msg, /^The token is forgotten in this tab and on this browser, and the sign-in's token is revoked at GitHub\./);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E7: a refused renewal of a tab-only sign-in signs that tab out and leaves the kept one', async () => {
  const kept = rec('ghu_KEPT', 'ghr_K', 2 * HOUR);
  const { context, page, errors } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo', service: { '/refresh': { status: 400, body: { error: 'bad_refresh_token' } } }, storage: { session: { symphony_panel_oauth: rec('ghu_TAB', 'ghr_DEAD', -1000) }, local: { symphony_panel_oauth: kept } } });
  await page.waitForFunction(() => /expired or was revoked/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const f = await signedInFacts(page);
  assert.ok(f.gate && !f.app);
  assert.equal(f.session, null);
  assert.equal(f.local, kept, 'the kept sign-in went with the tab\'s');
  assert.deepEqual(errors, []);
  await context.close();
});

// the second review's findings, each as the page now promises it
const kept = () => rec('ghu_KEPT', 'ghr_K', 2 * HOUR);
const repoList = JSON.stringify(['acme/demo']);
const appShown = (p) => p.waitForSelector('#cp-app:not(.hidden)', { timeout: 15000 });
const authedSince = (calls, n) => calls.slice(n).filter((c) => c.auth);
// every text #msg showed, in order, so a warning overwritten later is still seen
const msgRecorder = () => { window.__msgs = []; new MutationObserver(() => { const m = document.getElementById('msg'); const t = m && m.textContent; if (t && window.__msgs[window.__msgs.length - 1] !== t) window.__msgs.push(t); }).observe(document, { subtree: true, childList: true, characterData: true }); };

await check('F1: Forget the token in one tab signs out another tab using the kept sign-in, at once', async () => {
  const { context, page, calls, service, errors } = await open({ script: configured, noLoad: true, storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([appShown(page), appShown(page2)]);
  await page2.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  await page.click('#cp-signout');
  await page2.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  const n = calls.length;
  const f2 = await signedInFacts(page2);
  console.log('      other tab:', f2.msg);
  assert.ok(f2.gate && !f2.app);
  assert.equal(f2.msg, 'Signed out: the token this browser kept was forgotten in another tab, or GitHub refused it there. Sign in again to go on.');
  assert.equal(service.filter((x) => x.path === '/revoke').length, 1);
  await page2.evaluate(() => document.getElementById('cp-refresh').click());
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(authedSince(calls, n).length, 0, 'the signed-out tab still called GitHub');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F1b: a tab that missed the forgetting finds it at its next call and sends nothing', async () => {
  const { context, page, calls, errors } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  await appShown(page);
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  // a change made in the tab itself raises no storage event there, so only the next call can see it
  await page.evaluate(() => localStorage.removeItem('symphony_panel_oauth'));
  const n = calls.length;
  await page.click('#cp-refresh');
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  const f = await signedInFacts(page);
  console.log('      message:', f.msg);
  assert.equal(authedSince(calls, n).length, 0, 'a call went out with the forgotten token');
  assert.match(f.msg, /signed out now/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F1c: Forget the token in one tab leaves another tab\'s own sign-in for that tab', async () => {
  const { context, page, calls, errors } = await open({ script: configured, noLoad: true, storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await page2.goto(path);
  await page2.evaluate((r) => sessionStorage.setItem('symphony_panel_oauth', r), rec('ghu_TAB2', '', 2 * HOUR));
  await Promise.all([page.goto(path), page2.reload()]);
  await Promise.all([appShown(page), appShown(page2)]);
  await page.click('#cp-signout');
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 800));
  const f2 = await signedInFacts(page2);
  assert.ok(f2.app && !f2.gate, 'the other tab\'s own sign-in was signed out');
  const n = calls.length;
  await page2.click('#cp-refresh');
  await page2.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  const after = authedSince(calls, n);
  assert.ok(after.length > 0 && after.every((c) => c.auth === 'Bearer ghu_TAB2'));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F2: a sign-in for this tab renews from the open page, never from storage, and a reload past its eight hours asks for a new one', async () => {
  const chain = { ghr_R2: ['ghu_NEW', 'ghr_R3'], ghr_R3: ['ghu_NEW2', 'ghr_R4'] };
  const serviceFn = (path, body) => {
    if (path !== '/refresh') return null;
    const next = chain[body.refresh_token];
    if (!next) return { status: 400, body: { error: 'bad_refresh_token' } };
    delete chain[body.refresh_token];
    return { status: 200, body: { access_token: next[0], token_type: 'bearer', expires_in: 28800, refresh_token: next[1], refresh_token_expires_in: 15897600 } };
  };
  const { context, page, calls, service, errors } = await open({ script: configured, serviceFn, path: '/symphony/control/?repo=acme/demo' });
  await page.click('#cp-signin');
  await appShown(page);
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  // another tab signs in kept on the browser meanwhile; this tab's sign-in stands in front of it
  const other = kept();
  await page.evaluate((r) => localStorage.setItem('symphony_panel_oauth', r), other);
  const expire = () => page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  for (const [spent, access] of [['ghr_R2', 'ghu_NEW'], ['ghr_R3', 'ghu_NEW2']]) {
    await expire();
    const n = calls.length;
    await page.click('#cp-refresh');
    await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
    const rf = service.filter((x) => x.path === '/refresh');
    assert.equal(rf[rf.length - 1].body.refresh_token, spent, 'the renewal did not use the refresh token the page holds');
    const stored = JSON.parse(await page.evaluate(() => sessionStorage.getItem('symphony_panel_oauth')));
    assert.equal(stored.access_token, access);
    assert.equal(stored.refresh_token, '', 'the renewed refresh token went into storage');
    const after = authedSince(calls, n);
    assert.ok(after.length > 0 && after.every((c) => c.auth === 'Bearer ' + access));
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_oauth')), other, 'the sign-in kept on the browser was changed');
  await expire();
  const before = service.filter((x) => x.path === '/refresh').length;
  await page.reload();
  await page.waitForFunction(() => /ran out after its eight hours/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const f = await signedInFacts(page);
  console.log('      after the reload:', f.msg);
  assert.equal(service.filter((x) => x.path === '/refresh').length, before, 'a renewal went out after the reload');
  assert.ok(f.gate && !f.app);
  assert.equal(f.session, null);
  assert.equal(f.local, other);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const [name, answer] of [['502 github_refused', { status: 502, body: { error: 'github_refused' } }], ['500 failed', { status: 500, body: { error: 'failed' } }], ['no answer at all', { abort: true }]]) {
  await check('F3: a renewal the service cannot make now (' + name + ') keeps the sign-in, and Refresh renews it once the service is back', async () => {
    let down = true;
    const serviceFn = (path) => (path === '/refresh' && down ? answer : null);
    const { context, page, calls, errors } = await open({ script: configured, serviceFn, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', -1000), symphony_panel_repos: repoList } } });
    await page.waitForFunction(() => /could not be renewed/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
    const f = await signedInFacts(page);
    console.log('      message:', f.msg);
    assert.ok(f.app && !f.gate, 'a passing failure signed the page out');
    assert.ok(await page.isVisible('#cp-signout'), 'Forget the token is out of reach');
    const o = JSON.parse(f.local);
    assert.equal(o.refresh_token, 'ghr_R', 'the sign-in was dropped');
    assert.equal(calls.filter((c) => c.auth === 'Bearer ghu_OLD').length, 0, 'the run-out token was sent');
    down = false;
    await page.click('#cp-refresh');
    await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent), null, { timeout: 10000 });
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('symphony_panel_oauth'))).access_token, 'ghu_NEW');
    assert.ok(calls.filter((c) => c.auth).every((c) => c.auth === 'Bearer ghu_NEW'));
    assert.deepEqual(errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to fetch/.test(e)), []);
    await context.close();
  });
}

await check('F4: GitHub failing at load with anything but 401 opens the panel with its message, Refresh and Forget in reach', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = { status: 503, body: { message: 'Service Unavailable' } };
  const { context, page, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_token: 'github_pat_X' } } });
  await appShown(page);
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  const f = await signedInFacts(page);
  assert.ok(f.app && !f.gate);
  assert.ok(await page.isVisible('#cp-signout') && await page.isVisible('#cp-refresh'));
  assert.equal(f.pasted, 'github_pat_X');
  assert.deepEqual(errors, []);
  await context.close();
});

for (const keepIt of [false, true]) {
  await check('F5' + (keepIt ? 'b: a token pasted to keep replaces the sign-in the browser kept and has it revoked' : 'a: a token pasted for this tab leaves the sign-in the browser keeps for its other tabs'), async () => {
    const routes = repoRoutes('acme/demo');
    routes['GET /user'] = (req) => (req.headers()['authorization'] === 'Bearer ghu_TABDEAD' ? { status: 401, body: { message: 'Bad credentials' } } : { login: 'tester' });
    const other = kept();
    const { context, page, calls, service, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_oauth: rec('ghu_TABDEAD', '', 2 * HOUR) }, local: { symphony_panel_oauth: other } } });
    await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 10000 });
    await page.click('#cp-token-way > summary').catch(() => {});
    if (!(await page.isVisible('#cp-token'))) await page.evaluate(() => { document.getElementById('cp-token-way').open = true; });
    if (keepIt) await page.check('#cp-keep');
    await page.fill('#cp-token', 'github_pat_TAB');
    const n = calls.length;
    await page.click('#cp-open');
    await appShown(page);
    await page.waitForFunction(() => /^Signed in as tester/.test(document.getElementById('cp-who').textContent));
    const where = await page.evaluate(() => ({
      sToken: sessionStorage.getItem('symphony_panel_token'), lToken: localStorage.getItem('symphony_panel_token'),
      sOauth: sessionStorage.getItem('symphony_panel_oauth'), lOauth: localStorage.getItem('symphony_panel_oauth'), who: document.getElementById('cp-who').textContent,
    }));
    await new Promise((r) => setTimeout(r, 300));
    const revoked = service.filter((x) => x.path === '/revoke').map((x) => x.body.access_token);
    console.log('      ', JSON.stringify(where), '| revoked:', revoked.join(','));
    assert.ok(authedSince(calls, n).every((c) => c.auth === 'Bearer github_pat_TAB'));
    if (keepIt) {
      assert.deepEqual([where.sToken, where.lToken, where.sOauth, where.lOauth], [null, 'github_pat_TAB', null, null]);
      assert.deepEqual(revoked, ['ghu_KEPT']);
      assert.equal(where.who, 'Signed in as tester with a token, kept on this browser.');
    } else {
      assert.deepEqual([where.sToken, where.lToken, where.sOauth, where.lOauth], ['github_pat_TAB', null, null, other]);
      assert.deepEqual(revoked, []);
      assert.equal(where.who, 'Signed in as tester with a token, for this tab.');
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('F6: a copy of a signed-in tab (window.open, Duplicate) never spends the original\'s refresh token', async () => {
  const { context, page, calls, service, errors } = await open({ script: configured, serviceFn: singleUse(0, 0), path: '/symphony/control/?repo=acme/demo' });
  await page.click('#cp-signin');
  await appShown(page);
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  await page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  const [copy] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.open(location.href); })]);
  copy.on('pageerror', (e) => errors.push(String(e)));
  await copy.waitForURL(onControlPage);
  await copy.waitForFunction(() => /ran out after its eight hours/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  assert.equal(service.filter((x) => x.path === '/refresh').length, 0, 'the copy spent the refresh token');
  const n = calls.length;
  await page.click('#cp-refresh');
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  const rf = service.filter((x) => x.path === '/refresh');
  assert.equal(rf.length, 1);
  assert.equal(rf[0].body.refresh_token, 'ghr_R2');
  const after = authedSince(calls, n);
  assert.ok(after.length > 0 && after.every((c) => c.auth === 'Bearer ghu_NEW'), 'the original tab lost its sign-in');
  assert.ok((await signedInFacts(page)).app);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F7: Forget the token with a pasted token says GitHub keeps it valid and where to delete it, and revokes nothing', async () => {
  const { context, page, service } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_token: 'github_pat_X' } } });
  await appShown(page);
  await page.click('#cp-signout');
  await page.waitForSelector('#cp-gate:not(.hidden)');
  await new Promise((r) => setTimeout(r, 300));
  const msg = await page.textContent('#msg');
  console.log('      message:', msg);
  assert.equal(msg, 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access token itself stays valid at GitHub until it runs out or you delete it at github.com/settings/personal-access-tokens. The repositories you listed stay.');
  assert.equal(service.filter((x) => x.path === '/revoke').length, 0);
  await context.close();
});

await check('F8: Back to a sign-in\'s return address, with no sign-in pending, warns of nothing and opens the panel', async () => {
  const { context, page, service, errors } = await open({ script: configured, initScript: msgRecorder, path: '/symphony/control/?repo=acme/demo&code=OLDCODE&state=' + 'a'.repeat(32), storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  await appShown(page);
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  const seen = await page.evaluate(() => window.__msgs);
  const search = await page.evaluate(() => location.search);
  console.log('      messages:', JSON.stringify(seen), '| address:', search);
  assert.ok(!seen.some((t) => /state differs|did not come back/.test(t)), 'a warning for a sign-in nobody started');
  assert.equal(search, '?repo=acme%2Fdemo');
  assert.equal(service.length, 0);
  assert.equal((await gateFacts(page)).wayOpen, false);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F9: a token refused on the cost page brings the box back with the reason said', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /repos/acme/demo/contents/METRICS.json'] = { status: 401, body: { message: 'Bad credentials' } };
  const { context, page, errors } = await open({ script: configured, routes, path: '/symphony/cost.html', storage: { session: { symphony_panel_token: 'github_pat_X' }, local: { symphony_panel_repos: repoList } } });
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 10000 });
  await page.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  const msg = await page.textContent('#msg');
  console.log('      message:', msg);
  assert.match(msg, /GitHub refused the token \(401\)\. Paste one that is still valid, or press Sign in with GitHub\./);
  assert.ok((await gateFacts(page)).tokenVisible);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F10: in a browser with no lock, a renewal that takes six seconds still leaves both tabs signed in', async () => {
  const { context, page, calls, service, errors } = await open({
    script: configured, noLoad: true, serviceFn: singleUse(6000, 0),
    initScript: () => { Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true }); },
    storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', -1000), symphony_panel_repos: repoList } },
  });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([page, page2].map((p) => p.waitForSelector('#cp-app:not(.hidden)', { timeout: 40000 })));
  const rf = service.filter((x) => x.path === '/refresh');
  assert.equal(rf.length, 2, 'the race did not happen, so this check proves nothing');
  const f1 = await signedInFacts(page), f2 = await signedInFacts(page2);
  assert.ok(f1.app && f2.app && !f1.gate && !f2.gate, 'a tab was signed out by the other one\'s slow renewal');
  assert.equal(JSON.parse(f1.local).access_token, 'ghu_NEW');
  assert.equal(calls.filter((c) => c.auth && c.auth !== 'Bearer ghu_NEW').length, 0);
  assert.equal(service.filter((x) => x.path === '/revoke').length, 0, 'the winning renewal was revoked');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F11: a call GitHub refuses because another tab renewed the token meanwhile is made again with the new token', async () => {
  let armed = false;
  const routes = repoRoutes('acme/demo');
  routes['GET /repos/acme/demo/issues'] = async (req) => {
    const auth = req.headers()['authorization'];
    if (auth === 'Bearer ghu_B') return [];
    if (!armed) return [];
    // another tab renews while this request is on its way: GitHub has already let the old token go
    await req.frame().page().evaluate((r) => localStorage.setItem('symphony_panel_oauth', r), rec('ghu_B', 'ghr_B', 2 * HOUR));
    return { status: 401, body: { message: 'Bad credentials' } };
  };
  const { context, page, calls, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: rec('ghu_A', 'ghr_A', 2 * HOUR), symphony_panel_repos: repoList } } });
  await appShown(page);
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  armed = true;
  const n = calls.length;
  await page.click('#cp-refresh');
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent), null, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));
  const issues = calls.slice(n).filter((c) => c.key === 'GET /repos/acme/demo/issues').map((c) => c.auth);
  const f = await signedInFacts(page);
  console.log('      issues asked with:', issues.join(', '), '| message:', JSON.stringify(f.msg));
  assert.deepEqual(issues, ['Bearer ghu_A', 'Bearer ghu_B']);
  assert.ok(f.app && !f.gate);
  assert.ok(!/401/.test(f.msg), 'the refusal was shown though the call went through');
  assert.deepEqual(errors, []);
  await context.close();
});

// the third review's findings, each as the page now promises it
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loaded = (p) => p.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent), null, { timeout: 15000 });
const expireKept = (p) => p.evaluate(() => { const o = JSON.parse(localStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; localStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
const whoOf = (p) => p.evaluate(() => (document.getElementById('cp-who') || {}).textContent || '');
const revoked = (service) => service.filter((x) => x.path === '/revoke').map((x) => x.body.access_token);
const OTHER_TAB_SIGNED_OUT = 'Signed out: the token this browser kept was forgotten in another tab, or GitHub refused it there. Sign in again to go on.';
const noLock = () => { Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true }); };
const failFirstRenewal = () => {
  let first = true;
  return (path) => {
    if (path !== '/refresh') return null;
    if (first) { first = false; return { status: 502, delay: 2000, body: { error: 'github_unreachable' } }; }
    return { status: 200, body: { access_token: 'ghu_AFTER', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_AFTER', refresh_token_expires_in: 15897600 } };
  };
};

for (const v of [
  { name: 'the other tab\'s renewal made', serviceFn: singleUse(2000, 0), wait: 4000 },
  { name: 'the other tab\'s renewal failing before GitHub, its refresh token unspent', serviceFn: failFirstRenewal(), wait: 4000 },
  { name: 'in a browser with no lock, during the look for the other tab\'s renewal', serviceFn: singleUse(3000, 0), initScript: noLock, wait: 25000 },
]) {
  await check('G1: Forget the token while this tab waits on another tab\'s renewal sends no refresh token afterwards, and Forget\'s words stay (' + v.name + ')', async () => {
    const { context, page, service, errors } = await open({ script: configured, noLoad: true, serviceFn: v.serviceFn, initScript: v.initScript, storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', 2 * HOUR), symphony_panel_repos: repoList } } });
    const page2 = await context.newPage();
    page2.on('pageerror', (e) => errors.push(String(e)));
    const path = BASE + '/symphony/control/?repo=acme/demo';
    await Promise.all([page.goto(path), page2.goto(path)]);
    await Promise.all([loaded(page), loaded(page2)]);
    // eight hours pass with both tabs open; tab 1 renews, tab 2 waits its turn, then forgets
    await expireKept(page);
    await sleep(400);
    await page.click('#cp-refresh');
    await sleep(300);
    await page2.click('#cp-refresh');
    await sleep(500);
    const before = service.length;
    await page2.click('#cp-signout');
    await sleep(v.wait);
    const f1 = await signedInFacts(page), f2 = await signedInFacts(page2);
    const after = service.slice(before).filter((x) => x.path === '/refresh').map((x) => x.body.refresh_token);
    console.log('      refresh tokens sent after Forget:', JSON.stringify(after), '| tab 1:', f1.msg, '| tab 2:', f2.msg);
    assert.deepEqual(after, [], 'a refresh token went to the service after Forget');
    assert.ok(f1.gate && !f1.app && f2.gate && !f2.app, 'a tab stayed signed in');
    assert.match(f2.msg, /^The token is forgotten in this tab and on this browser, and the sign-in's token is revoked at GitHub\./);
    assert.equal(f1.msg, OTHER_TAB_SIGNED_OUT);
    assert.equal(f1.local, null);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('G2: a pasted token with a character no GitHub token has (a zero-width space) is refused with the reason, nothing sent, nothing kept', async () => {
  const { context, page, calls, service, errors } = await open({ script: configured, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_repos: repoList } } });
  await page.evaluate(() => { document.getElementById('cp-token-way').open = true; });
  await page.check('#cp-keep');
  await page.fill('#cp-token', 'github_pat_ABC\u200b');
  await page.click('#cp-open');
  await sleep(1000);
  const f = await signedInFacts(page);
  console.log('      message:', f.msg, '| GitHub calls:', calls.length);
  assert.ok(f.gate && !f.app, 'the panel opened with a token no request can carry');
  assert.equal(f.pasted, null, 'the unusable token was stored');
  assert.equal(calls.length, 0);
  assert.equal(service.length, 0);
  assert.match(f.msg, /a character no GitHub token has/);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const v of [
  { name: 'GitHub refuses it (401)', answer: { status: 401, body: { message: 'Bad credentials' } }, says: /^GitHub refused the token \(401\)\. Paste one that is still valid, or press Sign in with GitHub\.$/ },
  { name: 'GitHub fails to answer about it (500)', answer: { status: 500, body: { message: 'boom' } }, says: /^GitHub answered 500 when asked about the token, so nothing was changed/ },
]) {
  await check('G2: a token pasted to keep is asked about at GitHub first, and when ' + v.name + ' the sign-in the other tabs use stays, unrevoked', async () => {
    const routes = repoRoutes('acme/demo');
    for (const k of Object.keys(routes)) { const r = routes[k]; routes[k] = (req) => (req.headers()['authorization'] === 'Bearer github_pat_TYPO' ? v.answer : r); }
    const { context, page, calls, service, errors } = await open({ script: configured, noLoad: true, routes, storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
    const page2 = await context.newPage();
    page2.on('pageerror', (e) => errors.push(String(e)));
    const path = BASE + '/symphony/control/?repo=acme/demo';
    await Promise.all([page.goto(path), page2.goto(path)]);
    await Promise.all([loaded(page), loaded(page2)]);
    // tab 2's own sign-in box is back (its sign-in for the tab ran out, say), and a token is pasted there to keep
    await page2.evaluate(() => { document.getElementById('cp-app').classList.add('hidden'); document.getElementById('cp-gate').classList.remove('hidden'); document.getElementById('cp-token-way').open = true; });
    await page2.check('#cp-keep');
    await page2.fill('#cp-token', 'github_pat_TYPO');
    await page2.click('#cp-open');
    await sleep(1200);
    const n = calls.length;
    await page.click('#cp-refresh');
    await loaded(page);
    await sleep(300);
    const f1 = await signedInFacts(page), f2 = await signedInFacts(page2);
    const used = [...new Set(authedSince(calls, n).map((c) => c.auth))];
    console.log('      revoked:', JSON.stringify(revoked(service)), '| tab 1 calls with:', used.join(','), '| tab 2:', f2.msg);
    assert.deepEqual(revoked(service), [], 'the working sign-in was revoked for a token GitHub did not take');
    assert.ok(f1.app && !f1.gate, 'tab 1 lost its working sign-in');
    assert.deepEqual(used, ['Bearer ghu_KEPT']);
    assert.ok(f2.gate && !f2.app);
    assert.equal(f2.pasted, null, 'the token GitHub did not take was stored');
    assert.match(f2.msg, v.says);
    assert.match(f1.local || '', /ghu_KEPT/);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const where of ['/symphony/control/', '/symphony/cost.html']) {
  await check('G3: Forget the token in another tab while this tab\'s first /user is still out leaves this tab signed out, naming nobody (' + where + ')', async () => {
    let slow = false;
    const routes = repoRoutes('acme/demo');
    routes['GET /user'] = async () => { if (slow) await sleep(1500); return { login: 'tester' }; };
    const { context, page, calls, service, errors } = await open({ script: configured, routes, path: where, storage: { local: { symphony_panel_oauth: kept() } } });
    await appShown(page);
    slow = true;
    const page2 = await context.newPage();
    page2.on('pageerror', (e) => errors.push(String(e)));
    page2.goto(BASE + where);
    await page2.waitForFunction(() => !!document.getElementById('msg'));
    await sleep(500);
    const n = calls.length;
    await page.click('#cp-signout');
    await sleep(2500);
    const f2 = await signedInFacts(page2);
    const who2 = await whoOf(page2);
    console.log('      tab 2:', JSON.stringify({ app: f2.app, gate: f2.gate, who: who2, msg: f2.msg }), '| calls after Forget:', calls.length - n);
    assert.ok(f2.gate && !f2.app, 'tab 2 opened the panel after the token was forgotten');
    assert.equal(who2, '');
    assert.equal(f2.msg, OTHER_TAB_SIGNED_OUT);
    assert.deepEqual(revoked(service), ['ghu_KEPT']);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('G4: a token another tab keeps over this tab\'s kept sign-in makes this tab name the account it now acts as, and say so', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = (req) => ({ login: req.headers()['authorization'] === 'Bearer github_pat_OTHER' ? 'other-person' : 'tester' });
  const { context, page, calls, service, errors } = await open({ script: configured, noLoad: true, routes, initScript: msgRecorder, storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([loaded(page), loaded(page2)]);
  assert.match(await whoOf(page), /^Signed in as tester through GitHub/);
  await page2.evaluate(() => { document.getElementById('cp-app').classList.add('hidden'); document.getElementById('cp-gate').classList.remove('hidden'); document.getElementById('cp-token-way').open = true; });
  await page2.check('#cp-keep');
  await page2.fill('#cp-token', 'github_pat_OTHER');
  await page2.click('#cp-open');
  await page.waitForFunction(() => /other-person/.test(document.getElementById('cp-who').textContent), null, { timeout: 5000 });
  const n = calls.length;
  await page.click('#cp-refresh');
  await loaded(page);
  await sleep(300);
  const f1 = await signedInFacts(page);
  const who1 = await whoOf(page);
  const used = [...new Set(authedSince(calls, n).map((c) => c.auth))];
  const msgs = await page.evaluate(() => window.__msgs || []);
  console.log('      tab 1 says:', JSON.stringify(who1), '| calls with:', used.join(','), '| revoked:', JSON.stringify(revoked(service)));
  assert.equal(who1, 'Signed in as other-person with a token, kept on this browser.');
  assert.deepEqual(used, ['Bearer github_pat_OTHER']);
  assert.ok(msgs.some((m) => /^Now signed in as other-person, not tester: another tab of this browser kept that account's token/.test(m)), 'tab 1 never said the account changed: ' + JSON.stringify(msgs));
  assert.deepEqual(revoked(service), ['ghu_KEPT']);
  assert.ok(f1.app && !f1.gate);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G5: a kept sign-in GitHub refused in one tab signs the others out with words that hold for a refusal too', async () => {
  let dead = false;
  const routes = repoRoutes('acme/demo');
  for (const k of Object.keys(routes)) { const r = routes[k]; routes[k] = (req) => (dead && req.headers()['authorization'] === 'Bearer ghu_KEPT' ? { status: 401, body: { message: 'Bad credentials' } } : r); }
  const { context, page, errors } = await open({ script: configured, noLoad: true, routes, storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([loaded(page), loaded(page2)]);
  // the person revokes SymphonyBoard at github.com/settings/apps/authorizations; nobody presses Forget
  dead = true;
  await page.click('#cp-refresh');
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  await page2.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  const f1 = await signedInFacts(page), f2 = await signedInFacts(page2);
  console.log('      tab 1:', f1.msg, '| tab 2:', f2.msg);
  assert.match(f1.msg, /^GitHub refused the sign-in's token \(401\)/);
  assert.equal(f2.msg, OTHER_TAB_SIGNED_OUT);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G6: Forget the token, with this tab\'s own sign-in in front of a token pasted and kept on the browser, says that token stays valid at GitHub', async () => {
  const { context, page, service, errors } = await open({ script: configured, path: '/symphony/control/', storage: { session: { symphony_panel_oauth: rec('ghu_TAB', '', 2 * HOUR) }, local: { symphony_panel_token: 'github_pat_KEPT' } } });
  await appShown(page);
  await page.click('#cp-signout');
  await page.waitForFunction(() => /revoked at GitHub\.|could not be asked/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const f = await signedInFacts(page);
  console.log('      message:', f.msg, '| revoked:', JSON.stringify(revoked(service)));
  assert.equal(f.pasted, null);
  assert.equal(f.session, null);
  assert.deepEqual(revoked(service), ['ghu_TAB']);
  assert.match(f.msg, /^The token is forgotten in this tab and on this browser, and the sign-in's token is revoked at GitHub\. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it\. The personal access token itself stays valid at GitHub until it runs out or you delete it at github\.com\/settings\/personal-access-tokens\./);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G7: a sign-in for this tab that runs out mid-load sends no call with the sign-in the browser keeps for its other tabs', async () => {
  const routes = repoRoutes('acme/demo');
  const meta = routes['GET /repos/acme/demo'];
  routes['GET /repos/acme/demo'] = async () => { await sleep(3500); return meta; };
  const tabOnly = JSON.stringify({ access_token: 'ghu_TAB', refresh_token: '', expires_at: Date.now() + 4000, refresh_expires_at: Date.now() + 100 * 24 * HOUR });
  const { context, page, calls, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_oauth: tabOnly }, local: { symphony_panel_oauth: rec('ghu_OTHER_ACCOUNT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
  await page.waitForFunction(() => /ran out after its eight hours/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  await sleep(1500);
  const before = calls.length;
  await page.evaluate(() => document.getElementById('cp-refresh').click());
  await sleep(600);
  const f = await signedInFacts(page);
  const other = calls.filter((c) => c.auth === 'Bearer ghu_OTHER_ACCOUNT').map((c) => c.key);
  console.log('      calls with the kept token:', JSON.stringify(other), '| message:', f.msg);
  assert.deepEqual(other, []);
  assert.equal(calls.length, before, 'a call went out after this tab\'s sign-in ended');
  assert.ok(f.gate && !f.app);
  assert.match(f.local || '', /ghu_OTHER_ACCOUNT/, 'the sign-in the other tabs use was dropped');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G7b: a sign-in for this tab that runs out mid-load leaves the sign-in the browser keeps for its other tabs unrenewed, when that one is in its last minute', async () => {
  const routes = repoRoutes('acme/demo');
  const meta = routes['GET /repos/acme/demo'];
  routes['GET /repos/acme/demo'] = async () => { await sleep(3500); return meta; };
  const tabOnly = JSON.stringify({ access_token: 'ghu_TAB', refresh_token: '', expires_at: Date.now() + 4000, refresh_expires_at: Date.now() + 100 * 24 * HOUR });
  const { context, page, calls, service, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_oauth: tabOnly }, local: { symphony_panel_oauth: rec('ghu_OTHER_ACCOUNT', 'ghr_K', 50000), symphony_panel_repos: repoList } } });
  await page.waitForFunction(() => /ran out after its eight hours/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  await sleep(1500);
  const before = calls.length;
  await page.evaluate(() => document.getElementById('cp-refresh').click());
  await sleep(1500);
  const f = await signedInFacts(page);
  const renewals = service.filter((x) => x.path === '/refresh').length;
  const other = calls.filter((c) => c.auth === 'Bearer ghu_OTHER_ACCOUNT' || c.auth === 'Bearer ghu_NEW').map((c) => c.key);
  console.log('      renewals asked:', renewals, '| calls with the kept token or its renewal:', JSON.stringify(other), '| message:', f.msg);
  assert.equal(renewals, 0, 'this tab renewed the sign-in its other tabs use after its own ended');
  assert.deepEqual(other, []);
  assert.equal(calls.length, before, 'a call went out after this tab\'s sign-in ended');
  assert.ok(f.gate && !f.app);
  assert.match(f.local || '', /ghu_OTHER_ACCOUNT/, 'the sign-in the other tabs use was replaced');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G8: in a browser with no lock, a sign-in for this tab GitHub will not renew is signed out at once, with no wait for other tabs', async () => {
  const serviceFn = (path) => (path === '/refresh' ? { status: 400, body: { error: 'bad_refresh_token' } } : null);
  const { context, page, service, errors } = await open({ script: configured, initScript: noLock, serviceFn, path: '/symphony/control/?repo=acme/demo' });
  await page.click('#cp-signin');
  await appShown(page);
  await loaded(page);
  await page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  const at = Date.now();
  await page.click('#cp-refresh');
  await page.waitForFunction(() => /expired or was revoked/.test(document.getElementById('msg').textContent), null, { timeout: 40000 });
  const took = Date.now() - at;
  console.log('      signed out after', took, 'ms; renewals asked:', service.filter((x) => x.path === '/refresh').length);
  assert.ok(took < 5000, 'waited ' + took + ' ms for a renewal no other tab can make');
  assert.equal(service.filter((x) => x.path === '/refresh').length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});

// the fourth review's findings, each as the page now promises it: a call goes out only with a token
// the page has named, and a write only for the account the page named when it was asked for
const tabCalls = (calls, p, n) => calls.slice(n || 0).filter((c) => c.tab === p);
// the calls, in a tab's order, made with a token before GitHub was asked whose it is (none is the promise)
function unnamed(list, known) {
  const seen = new Set(known || []);
  const bad = [];
  for (const c of list) {
    if (!c.auth || seen.has(c.auth)) continue;
    if (c.key !== 'GET /user') bad.push(c.key + ' with ' + c.auth);
    seen.add(c.auth);
  }
  return bad;
}
const byLogin = (map) => (req) => {
  const a = req.headers()['authorization'];
  if (/DEAD/.test(a)) return { status: 401, body: { message: 'Bad credentials' } };
  return { login: map[a] || 'tester' };
};
const pasteIn = async (p, value, keepIt) => {
  if (!(await p.isVisible('#cp-token'))) await p.click('#cp-token-way > summary');
  if (keepIt) await p.check('#cp-keep');
  await p.fill('#cp-token', value);
  await p.click('#cp-open');
};
const storedIn = async (p, key, value) => { for (let i = 0; i < 300; i++) { if (await p.evaluate(([k, v]) => localStorage.getItem(k) === v, [key, value])) return; await sleep(10); } throw new Error(key + ' was never stored'); };
const pullFive = (routes) => {
  routes['GET /repos/acme/demo/pulls'] = [{ number: 5, title: 'Fix the footer', html_url: 'https://github.com/acme/demo/pull/5', head: { ref: 'claude/5', sha: 'abc123' }, base: { ref: 'main' }, draft: false, updated_at: now }];
  routes['GET /repos/acme/demo/commits/abc123/check-runs'] = { total_count: 1, check_runs: [{ name: 'check', status: 'completed', conclusion: 'success' }] };
  return routes;
};
// a tab whose own sign-in for the tab GitHub refused, its box up, beside a tab on the token the browser keeps
async function twoTabs(pasted, routes, opts) {
  const keptOne = pasted ? { symphony_panel_token: 'github_pat_TESTER' } : { symphony_panel_oauth: kept() };
  const deadOne = pasted ? { symphony_panel_token: 'github_pat_DEAD' } : { symphony_panel_oauth: rec('ghu_TABDEAD', '', 2 * HOUR) };
  const o = await open(Object.assign({ script: pasted ? real : configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, keptOne), session: deadOne } }, opts || {}));
  await o.page.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const tab1 = await o.context.newPage();
  tab1.on('pageerror', (e) => o.errors.push(String(e)));
  if (opts && opts.initScript) await tab1.addInitScript(opts.initScript);
  await tab1.goto(BASE + '/symphony/control/?repo=acme/demo');
  await loaded(tab1);
  return Object.assign(o, { tab1, tab2: o.page, keptToken: 'Bearer ' + (pasted ? 'github_pat_TESTER' : 'ghu_KEPT') });
}
const ways = [['Sign in with GitHub', false], ['pasted tokens', true]];

for (const [way, pasted] of ways) {
  await check('H1: a write GitHub refuses because another tab kept another account\'s token meanwhile is not made again as that account (' + way + ')', async () => {
    const flags = { kept: false };
    const routes = pullFive(repoRoutes('acme/demo'));
    routes['GET /user'] = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
    routes['PUT /repos/acme/demo/pulls/5/merge'] = async (req) => {
      if (req.headers()['authorization'] === 'Bearer github_pat_OTHER') return { merged: true };
      // the merge reaches GitHub just after the other tab's keep let this token go
      for (let i = 0; i < 300 && !flags.kept; i++) await sleep(20);
      await sleep(30);
      return { status: 401, body: { message: 'Bad credentials' } };
    };
    const { context, tab1, tab2, calls, errors, keptToken } = await twoTabs(pasted, routes);
    await tab1.waitForFunction(() => /passed/.test(document.querySelector('#cp-pulls tbody').textContent), null, { timeout: 5000 });
    await tab1.locator('#cp-pulls button', { hasText: 'Merge' }).click();
    await tab1.locator('#cp-pulls button', { hasText: 'Confirm: merge #5' }).click();
    await pasteIn(tab2, 'github_pat_OTHER', true);
    await storedIn(tab2, 'symphony_panel_token', 'github_pat_OTHER');
    flags.kept = true;
    await tab1.waitForFunction(() => /^The sign-in changed/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
    await sleep(300);
    const merges = calls.filter((c) => c.key === 'PUT /repos/acme/demo/pulls/5/merge').map((c) => c.auth);
    const msg = await tab1.textContent('#msg');
    console.log('      merges with:', JSON.stringify(merges), '| tab 1:', msg);
    assert.deepEqual(merges, [keptToken], 'the merge was made again');
    assert.equal(msg, 'The sign-in changed while this was on its way, so nothing was done: the page acts as other-person now, not tester. Press again to do it as other-person.');
    assert.equal(await whoOf(tab1), 'Signed in as other-person with a token, kept on this browser.');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [way, pasted] of ways) {
  await check('H2: a token another tab keeps while this tab is loading is named before any call carries it (' + way + ')', async () => {
    const gate = { armed: false, waiters: [] };
    const routes = repoRoutes('acme/demo');
    routes['GET /user'] = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
    const meta = routes['GET /repos/acme/demo'];
    routes['GET /repos/acme/demo'] = async () => { if (gate.armed) { await new Promise((r) => gate.waiters.push(r)); await sleep(100); } return meta; };
    const { context, tab1, tab2, calls, errors, keptToken } = await twoTabs(pasted, routes, { initScript: msgRecorder });
    gate.armed = true;
    const n = calls.length;
    await tab1.evaluate(() => document.getElementById('cp-refresh').click());
    for (let i = 0; i < 100 && !tabCalls(calls, tab1, n).some((c) => c.key === 'GET /repos/acme/demo'); i++) await sleep(20);
    await pasteIn(tab2, 'github_pat_OTHER', true);
    await storedIn(tab2, 'symphony_panel_token', 'github_pat_OTHER');
    gate.armed = false;
    gate.waiters.splice(0).forEach((r) => r());
    await loaded(tab1);
    await sleep(1000);
    const list = tabCalls(calls, tab1, n);
    const msgs = await tab1.evaluate(() => window.__msgs || []);
    console.log('      tab 1 names:', JSON.stringify(await whoOf(tab1)), '| unnamed calls:', JSON.stringify(unnamed(list, [keptToken])));
    assert.deepEqual(unnamed(list, [keptToken]), []);
    assert.ok(list.some((c) => c.auth === 'Bearer github_pat_OTHER' && c.key !== 'GET /user'), 'the load never went on with the new token, so this check proves nothing');
    assert.equal(await whoOf(tab1), 'Signed in as other-person with a token, kept on this browser.');
    assert.ok(msgs.some((m) => /^Now signed in as other-person, not tester/.test(m)), 'tab 1 never said the account changed: ' + JSON.stringify(msgs));
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const v of [
  { name: 'the renewal answers with a new token', refresh: { status: 200, delay: 2500, body: { access_token: 'ghu_TAB2', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_T2', refresh_token_expires_in: 15897600 } } },
  { name: 'the renewal is refused too', refresh: { status: 400, delay: 2500, body: { error: 'bad_refresh_token' } } },
]) {
  await check('H3: a call refused while this tab renews its own sign-in waits for the renewal, and nothing goes out with the sign-in the browser keeps for other tabs (' + v.name + ')', async () => {
    let refuse = false;
    const routes = repoRoutes('acme/demo');
    routes['POST /repos/acme/demo/issues'] = { number: 7, labels: [{ name: 'todo' }] };
    routes['GET /user'] = byLogin({ 'Bearer ghu_OTHER': 'other-person' });
    const pulls = routes['GET /repos/acme/demo/pulls'];
    // a call of this tab, out before the token's last minute, comes back refused while the renewal runs
    routes['GET /repos/acme/demo/pulls'] = async () => { if (refuse) { refuse = false; await sleep(1200); return { status: 401, body: { message: 'Bad credentials' } }; } return pulls; };
    const serviceFn = (path) => (path === '/refresh' ? v.refresh : null);
    const { context, page, calls, service, errors } = await open({ script: configured, routes, serviceFn, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_repos: repoList } } });
    await page.click('#cp-signin');
    await appShown(page);
    await loaded(page);
    // another tab keeps another account's sign-in on the browser
    await page.evaluate((r) => localStorage.setItem('symphony_panel_oauth', r), rec('ghu_OTHER', 'ghr_O', 2 * HOUR));
    await page.fill('#cp-task-title', 'Fix the footer');
    await page.fill('#cp-task-goal', 'The footer links work.');
    await page.fill('#cp-task-acceptance', 'Every footer link answers 200.');
    refuse = true;
    const n = calls.length;
    await page.click('#cp-refresh');
    for (let i = 0; i < 100 && !calls.slice(n).some((c) => c.key === 'GET /repos/acme/demo/pulls'); i++) await sleep(20);
    await page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
    await page.evaluate(() => document.getElementById('cp-task-queue').click());
    await sleep(4500);
    const f = await signedInFacts(page);
    const other = calls.filter((c) => c.auth === 'Bearer ghu_OTHER').map((c) => c.key);
    const pullsWith = calls.slice(n).filter((c) => c.key === 'GET /repos/acme/demo/pulls').map((c) => c.auth);
    console.log('      calls with the other sign-in:', JSON.stringify(other), '| pulls asked with:', JSON.stringify(pullsWith), '| message:', f.msg);
    assert.deepEqual(other, []);
    assert.match(f.local || '', /ghu_OTHER/, 'the sign-in the other tabs use was dropped');
    if (v.refresh.status === 200) {
      // GitHub lets the old token go once its refresh token is spent, so the refusal came from the renewal
      assert.deepEqual(pullsWith, ['Bearer ghu_TOKEN', 'Bearer ghu_TAB2']);
      assert.ok(f.app && !f.gate, 'the renewed sign-in was signed out');
      assert.equal(calls.filter((c) => c.key === 'POST /repos/acme/demo/issues').map((c) => c.auth).join(), 'Bearer ghu_TAB2');
    } else {
      assert.ok(f.gate && !f.app, 'the tab is not signed out');
      assert.equal(calls.filter((c) => c.key === 'POST /repos/acme/demo/issues').length, 0, 'the task was opened');
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [way, pasted] of ways) {
  await check('H4: a tab that follows another tab\'s new token and cannot ask GitHub whose it is names nobody, says so, and names it before its next call (' + way + ')', async () => {
    const fail = { armed: false, page: null };
    const routes = repoRoutes('acme/demo');
    const who = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
    routes['GET /user'] = (req) => {
      if (fail.armed && req.headers()['authorization'] === 'Bearer github_pat_OTHER' && req.frame().page() === fail.page) { fail.armed = false; return { status: 502, body: { message: 'Server Error' } }; }
      return who(req);
    };
    const { context, tab1, tab2, calls, errors, keptToken } = await twoTabs(pasted, routes);
    fail.page = tab1;
    fail.armed = true;
    await pasteIn(tab2, 'github_pat_OTHER', true);
    await tab1.waitForFunction(() => /could not be asked whose it is/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
    const msg = await tab1.textContent('#msg');
    const who1 = await whoOf(tab1);
    const n = calls.length;
    await tab1.evaluate(() => document.getElementById('cp-refresh').click());
    await loaded(tab1);
    await sleep(500);
    const list = tabCalls(calls, tab1, n);
    console.log('      tab 1 after the follow:', JSON.stringify({ msg, who: who1 }), '| then names:', JSON.stringify(await whoOf(tab1)), '| unnamed calls:', JSON.stringify(unnamed(list, [keptToken])));
    assert.equal(msg, 'Another tab of this browser kept a new token in place of the one this page had, and GitHub could not be asked whose it is (GitHub answered 502: Server Error.). The page asks again before its next call.');
    assert.equal(who1, '');
    assert.deepEqual(unnamed(list, [keptToken]), []);
    assert.equal(await whoOf(tab1), 'Signed in as other-person with a token, kept on this browser.');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('H5: a token pasted while the page still asks GitHub about the kept sign-in opens the panel once, as the pasted token\'s account', async () => {
  const slow = { on: true };
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = async (req) => { const a = req.headers()['authorization']; if (a === 'Bearer github_pat_OTHER') return { login: 'other-person' }; if (slow.on) await sleep(2500); return { login: 'tester' }; };
  const { context, page, calls, errors } = await open({ script: configured, routes, noLoad: true, storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await page.waitForSelector('#cp-gate:not(.hidden)');
  const n = calls.length;
  await pasteIn(page, 'github_pat_OTHER', false);
  await sleep(4000);
  const list = calls.slice(n).filter((c) => c.key !== 'GET /user');
  console.log('      names:', JSON.stringify(await whoOf(page)), '| repository read', list.filter((c) => c.key === 'GET /repos/acme/demo').length, 'times, with', JSON.stringify([...new Set(list.map((c) => c.auth))]));
  assert.equal(await whoOf(page), 'Signed in as other-person with a token, for this tab.');
  assert.deepEqual([...new Set(list.map((c) => c.auth))], ['Bearer github_pat_OTHER']);
  assert.equal(list.filter((c) => c.key === 'GET /repos/acme/demo').length, 1, 'the panel loaded more than once');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H6: a token pasted for this tab while the page renews the sign-in the browser keeps leaves that renewal kept for the other tabs', async () => {
  const { context, page, calls, service, errors } = await open({ script: configured, serviceFn: singleUse(2500, 0), noLoad: true, storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', -60000), symphony_panel_repos: repoList } } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await page.waitForSelector('#cp-gate:not(.hidden)');
  for (let i = 0; i < 100 && !service.some((s) => s.path === '/refresh'); i++) await sleep(20);
  await pasteIn(page, 'github_pat_TAB', false);
  await appShown(page);
  await sleep(3500);
  const f = await signedInFacts(page);
  const keptNow = JSON.parse(f.local || 'null');
  const used = [...new Set(calls.filter((c) => c.auth).map((c) => c.auth))];
  console.log('      revoked:', JSON.stringify(revoked(service)), '| kept record:', keptNow && keptNow.access_token + '/' + keptNow.refresh_token, '| this tab called with:', used.join(','));
  assert.deepEqual(revoked(service), []);
  assert.deepEqual([keptNow.access_token, keptNow.refresh_token], ['ghu_NEW', 'ghr_R2']);
  assert.deepEqual(used, ['Bearer github_pat_TAB']);
  assert.equal(await whoOf(page), 'Signed in as tester with a token, for this tab.');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H7: a paste GitHub never answers about gives the button back within the time the page waits, with the reason', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = () => new Promise(() => { /* GitHub never answers */ });
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/', storage: { local: { symphony_panel_repos: repoList } } });
  await pasteIn(page, 'github_pat_X', false);
  await sleep(500);
  const during = await page.evaluate(() => document.getElementById('cp-open').disabled);
  await page.waitForFunction(() => !document.getElementById('cp-open').disabled, null, { timeout: 25000 });
  const msg = await page.textContent('#msg');
  console.log('      disabled while asking:', during, '| then:', msg);
  assert.equal(during, true);
  assert.equal(msg, 'GitHub could not be reached to check the token, so nothing was changed; try again in a moment.');
  assert.equal((await signedInFacts(page)).pasted, null);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const [way, pasted] of ways) {
  await check('H8: a tab whose pasted token GitHub refused says nothing of being signed in when another tab keeps another account\'s token (' + way + ')', async () => {
    const dead = new Set();
    const routes = repoRoutes('acme/demo');
    for (const k of Object.keys(routes)) { const r = routes[k]; routes[k] = (req) => { const a = req.headers()['authorization']; if (dead.has(a)) return { status: 401, body: { message: 'Bad credentials' } }; if (k === 'GET /user') return { login: a === 'Bearer github_pat_B' ? 'other-person' : 'tester' }; return r; }; }
    const { context, page, calls, errors } = await open({ script: pasted ? real : configured, routes, noLoad: true, initScript: msgRecorder, storage: { local: { symphony_panel_token: 'github_pat_A', symphony_panel_repos: repoList } } });
    const page2 = await context.newPage();
    page2.on('pageerror', (e) => errors.push(String(e)));
    const path = BASE + '/symphony/control/?repo=acme/demo';
    await Promise.all([page.goto(path), page2.goto(path)]);
    await Promise.all([loaded(page), loaded(page2)]);
    dead.add('Bearer github_pat_A');
    await page.click('#cp-refresh');
    await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
    await page2.click('#cp-refresh');
    await page2.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
    const n = calls.length;
    await pasteIn(page2, 'github_pat_B', true);
    await appShown(page2);
    await sleep(1500);
    const f1 = await signedInFacts(page);
    const msgs = await page.evaluate(() => window.__msgs || []);
    console.log('      tab 1:', JSON.stringify({ gate: f1.gate, msg: f1.msg, who: await whoOf(page) }), '| calls since:', tabCalls(calls, page, n).length);
    assert.ok(f1.gate && !f1.app);
    assert.ok(!msgs.some((m) => /^Now signed in as/.test(m)), 'tab 1 said it was signed in under its sign-in box: ' + JSON.stringify(msgs));
    assert.equal(await whoOf(page), '');
    assert.equal(tabCalls(calls, page, n).length, 0, 'tab 1 called GitHub with its box up');
    assert.equal(f1.pasted, 'github_pat_B');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const where of ['/symphony/control/?repo=acme/demo', '/symphony/cost.html']) {
  await check('H9: a stored token no request can carry keeps the sign-in box, with the token box open and the reason, and sends nothing (' + where.split('?')[0] + ')', async () => {
    const { context, page, calls, errors } = await open({ script: configured, path: where, storage: { local: { symphony_panel_token: 'github_pat_ABC\u200b', symphony_panel_repos: repoList } } });
    await page.waitForFunction(() => /no request can carry it/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
    await sleep(300);
    const f = await signedInFacts(page);
    console.log('      message:', f.msg);
    assert.ok(f.gate && !f.app);
    assert.ok((await gateFacts(page)).tokenVisible, 'the token box is folded away');
    assert.equal(f.msg, 'The token kept here holds a character no GitHub token has (a space, or one outside plain ASCII that a copy brought along), so no request can carry it; paste the token again, copied afresh from GitHub.');
    assert.equal(calls.length, 0);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('H10: Forget the token says a tab signed in for itself keeps its sign-in, and names the page that deletes the token pasted', async () => {
  const { context, page, calls, errors } = await open({ script: real, noLoad: true, storage: { local: { symphony_panel_token: 'ghp_CLASSIC', symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await page2.goto(path);
  await page2.evaluate(() => sessionStorage.setItem('symphony_panel_token', 'github_pat_TAB2'));
  await Promise.all([page.goto(path), page2.reload()]);
  await Promise.all([loaded(page), loaded(page2)]);
  await page.click('#cp-signout');
  await page.waitForSelector('#cp-gate:not(.hidden)');
  await sleep(600);
  const msg = await page.textContent('#msg');
  const n = calls.length;
  await page2.click('#cp-refresh');
  await loaded(page2);
  console.log('      tab 1 says:', msg);
  assert.equal(msg, 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access token itself stays valid at GitHub until it runs out or you delete it at github.com/settings/tokens. The repositories you listed stay.');
  assert.ok(tabCalls(calls, page2, n).every((c) => c.auth === 'Bearer github_pat_TAB2'), 'the other tab lost its own token');
  assert.deepEqual(errors, []);
  await context.close();
});

for (const v of [
  { name: 'another account\'s token kept meanwhile', change: () => { localStorage.removeItem('symphony_panel_oauth'); localStorage.setItem('symphony_panel_token', 'github_pat_OTHER'); } },
  { name: 'the kept token forgotten meanwhile', change: () => { localStorage.removeItem('symphony_panel_oauth'); } },
]) {
  await check('H11: a page the browser brings back from its back-forward cache looks at storage at once (' + v.name + ')', async () => {
    const routes = repoRoutes('acme/demo');
    routes['GET /user'] = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
    const { context, page, calls, errors } = await open({ script: configured, routes, initScript: msgRecorder, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
    await loaded(page);
    // what another tab did while the page sat in the cache: written here, so no storage event comes
    await page.evaluate(v.change);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await sleep(800);
    const f = await signedInFacts(page);
    const msgs = await page.evaluate(() => window.__msgs || []);
    console.log('      page:', JSON.stringify({ app: f.app, msg: f.msg, who: await whoOf(page) }));
    if (/OTHER/.test(v.change.toString())) {
      assert.equal(await whoOf(page), 'Signed in as other-person with a token, kept on this browser.');
      assert.ok(msgs.some((m) => /^Now signed in as other-person, not tester/.test(m)));
    } else {
      assert.ok(f.gate && !f.app, 'the page stayed signed in on a forgotten token');
      assert.equal(f.msg, OTHER_TAB_SIGNED_OUT);
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const v of [{ name: 'tabs that take turns' }, { name: 'in a browser with no lock', initScript: noLock }]) {
  await check('H12: a call that went out with the old token while another tab renewed the sign-in is made again with the renewed one, and both tabs stay signed in (' + v.name + ')', async () => {
    const spent = { at: 0 };
    const T0 = Date.now();
    const held = { armed: false, waiters: [], log: [] };
    const routes = repoRoutes('acme/demo');
    const pulls = routes['GET /repos/acme/demo/pulls'];
    // GitHub lets the old token go once its refresh token is spent; this call of tab 2 is answered only after that
    routes['GET /repos/acme/demo/pulls'] = async (req) => {
      const a = req.headers()['authorization'];
      if (held.armed && a === 'Bearer ghu_OLD') { held.armed = false; held.log.push('held ' + (Date.now() - T0)); await new Promise((r) => held.waiters.push(r)); held.log.push('released ' + (Date.now() - T0)); }
      if (a === 'Bearer ghu_OLD' && spent.at) { held.log.push('401 ' + (Date.now() - T0)); return { status: 401, body: { message: 'Bad credentials' } }; }
      held.log.push('200 ' + a + ' ' + (Date.now() - T0));
      return pulls;
    };
    const renew = singleUse(1500, 0);
    const serviceFn = (path, body) => { if (path === '/refresh') held.log.push('refresh ' + (Date.now() - T0)); if (path === '/refresh' && !spent.at) { spent.at = Date.now(); setTimeout(() => held.waiters.splice(0).forEach((r) => r()), 300); } return renew(path, body); };
    const { context, page, calls, service, errors } = await open({ script: configured, routes, noLoad: true, serviceFn, initScript: v.initScript, storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', 2 * HOUR), symphony_panel_repos: repoList } } });
    const page2 = await context.newPage();
    page2.on('pageerror', (e) => errors.push(String(e)));
    const path = BASE + '/symphony/control/?repo=acme/demo';
    await Promise.all([page.goto(path), page2.goto(path)]);
    await Promise.all([loaded(page), loaded(page2)]);
    // tab 2's read of the pull requests is on its way when tab 1 renews the sign-in
    held.armed = true;
    const n = calls.length;
    await page2.click('#cp-refresh');
    for (let i = 0; i < 100 && !tabCalls(calls, page2, n).some((c) => c.key === 'GET /repos/acme/demo/pulls'); i++) await sleep(20);
    await expireKept(page);
    await page.click('#cp-refresh');
    await sleep(4000);
    await Promise.all([loaded(page), loaded(page2)]);
    const f1 = await signedInFacts(page), f2 = await signedInFacts(page2);
    const pullsWith = tabCalls(calls, page2, n).filter((c) => c.key === 'GET /repos/acme/demo/pulls').map((c) => c.auth);
    if (process.env.DEBUG) console.log('      route log:', JSON.stringify(held.log));
    if (process.env.DEBUG) console.log('      tab 2 calls:', JSON.stringify(tabCalls(calls, page2, n).map((c) => c.key + ' ' + c.auth)), '| tab 1 calls:', JSON.stringify(tabCalls(calls, page, n).map((c) => c.key + ' ' + c.auth)), '| f2:', JSON.stringify(f2));
    console.log('      tab 2 asked the pull requests with:', JSON.stringify(pullsWith), '| renewals:', service.filter((x) => x.path === '/refresh').length, '| revoked:', JSON.stringify(revoked(service)), '| tab 2:', f2.msg);
    assert.deepEqual(pullsWith, ['Bearer ghu_OLD', 'Bearer ghu_NEW']);
    assert.ok(f1.app && f2.app && !f1.gate && !f2.gate, 'a tab was signed out by a refusal the renewal caused');
    assert.equal(JSON.parse(f1.local).access_token, 'ghu_NEW');
    assert.deepEqual(revoked(service), []);
    // with no lock both tabs may renew, and the second renewal is refused and finds the first one's
    if (!v.initScript) assert.equal(service.filter((x) => x.path === '/refresh').length, 1);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('H13: both writes of Give go out for the account the page named when Give was pressed', async () => {
  const held = { armed: false, waiters: [] };
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
  routes['GET /repos/acme/demo/issues'] = [{ number: 9, title: 'Task: write the goal', html_url: 'https://github.com/acme/demo/issues/9', labels: [{ name: 'todo' }], updated_at: now }];
  routes['GET /repos/acme/demo/contents/.github/symphony/workers'] = [{ type: 'file', name: 'nightly.json' }];
  routes['GET /repos/acme/demo/contents/.github/symphony/workers/nightly.json'] = { raw: JSON.stringify({ name: 'nightly', runs: 'actions', about: 'Small fixes', area: ['docs/'], lands: 'owner', model: '', max_turns: 80, rounds: 6, account: '' }) };
  // the label is not there yet, and GitHub's answer saying so comes once the other tab has kept its token
  routes['GET /repos/acme/demo/labels/worker%3Anightly'] = async () => { if (held.armed) await new Promise((r) => held.waiters.push(r)); return { status: 404, body: { message: 'Not Found' } }; };
  routes['POST /repos/acme/demo/labels'] = { name: 'worker:nightly' };
  routes['POST /repos/acme/demo/issues/9/labels'] = [{ name: 'worker:nightly' }];
  const { context, tab1, tab2, calls, errors } = await twoTabs(false, routes);
  await tab1.waitForFunction(() => !!document.querySelector('#cp-queue tbody .card__gear'), null, { timeout: 5000 });
  await tab1.click('#cp-queue tbody .card__gear');
  await tab1.selectOption('#dlg-give', 'nightly');
  held.armed = true;
  await tab1.click('#dlg-give-go');
  for (let i = 0; i < 100 && !calls.some((c) => c.key === 'GET /repos/acme/demo/labels/worker%3Anightly'); i++) await sleep(20);
  await pasteIn(tab2, 'github_pat_OTHER', true);
  await tab1.waitForFunction(() => /other-person/.test(document.getElementById('cp-who').textContent), null, { timeout: 5000 });
  held.armed = false;
  held.waiters.splice(0).forEach((r) => r());
  await tab1.waitForFunction(() => /^The sign-in changed/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  await sleep(300);
  const writes = calls.filter((c) => c.key.startsWith('POST ')).map((c) => c.key + ' ' + c.auth);
  console.log('      writes:', JSON.stringify(writes), '| tab 1:', await tab1.textContent('#msg'));
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const v of [
  { name: 'forgotten in another tab while the page first asks GitHub whose the token is', atLoad: true },
  { name: 'forgotten in this tab, on a page GitHub could not name at first', atLoad: false },
]) {
  await check('H14: a tab whose sign-in is forgotten while its renewal is on its way takes up nothing another tab keeps meanwhile (' + v.name + ')', async () => {
    const fail = { first: !v.atLoad };
    const routes = repoRoutes('acme/demo');
    const who = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
    // without atLoad, GitHub cannot say at first whose the token is, so the page opens naming nobody
    routes['GET /user'] = (req) => { if (fail.first) { fail.first = false; return { status: 502, body: { message: 'Server Error' } }; } return who(req); };
    const start = v.atLoad ? rec('ghu_OLD', 'ghr_R', -1000) : rec('ghu_OLD', 'ghr_R', 2 * HOUR);
    const { context, page, calls, service, errors } = await open({ script: configured, routes, noLoad: true, serviceFn: singleUse(2500, 0), storage: { local: { symphony_panel_oauth: start, symphony_panel_repos: repoList } } });
    // another tab of the browser, on a page of the site that runs no panel
    const other = await context.newPage();
    other.on('pageerror', (e) => errors.push(String(e)));
    await other.goto(BASE + '/symphony/');
    await page.goto(BASE + '/symphony/control/?repo=acme/demo');
    if (!v.atLoad) {
      await loaded(page);
      assert.equal(await whoOf(page), '', 'the page named an account GitHub did not name');
      await expireKept(page);
      await page.click('#cp-refresh');
    }
    for (let i = 0; i < 200 && !service.some((s) => s.path === '/refresh'); i++) await sleep(20);
    assert.ok(service.some((s) => s.path === '/refresh'), 'the renewal never started, so this check proves nothing');
    if (v.atLoad) await other.evaluate(() => localStorage.removeItem('symphony_panel_oauth'));
    else await page.click('#cp-signout');
    await sleep(700);
    // another tab keeps a pasted token of another account before the renewal answers
    await other.evaluate(() => localStorage.setItem('symphony_panel_token', 'github_pat_OTHER'));
    await sleep(3500);
    const f = await signedInFacts(page);
    const withOther = tabCalls(calls, page).filter((c) => c.auth === 'Bearer github_pat_OTHER').map((c) => c.key);
    console.log('      calls with the token kept afterwards:', JSON.stringify(withOther), '| revoked:', JSON.stringify(revoked(service)), '| page:', JSON.stringify({ gate: f.gate, who: await whoOf(page), msg: f.msg }));
    assert.deepEqual(withOther, []);
    assert.ok(f.gate && !f.app, 'the page is not signed out');
    assert.equal(await whoOf(page), '');
    // the renewal that came after the sign-in was forgotten is nobody's, so it is revoked
    assert.ok(revoked(service).includes('ghu_NEW'), 'the renewed token was left valid');
    if (v.atLoad) assert.match(f.msg, /^(This page is signed out now|Signed out: )/);
    else assert.match(f.msg, /^The token is forgotten in this tab and on this browser, and the sign-in's token is revoked at GitHub\./);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [way, pasted] of ways) {
  await check('H4b: a token this tab took up from storage before it could be named is named when the other tab\'s storage event is looked at (' + way + ')', async () => {
    const fail = { armed: false };
    const routes = repoRoutes('acme/demo');
    const who = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
    routes['GET /user'] = (req) => {
      if (fail.armed && req.headers()['authorization'] === 'Bearer github_pat_OTHER') { fail.armed = false; return { status: 502, body: { message: 'Server Error' } }; }
      return who(req);
    };
    const keptOne = pasted ? { symphony_panel_token: 'github_pat_TESTER' } : { symphony_panel_oauth: kept() };
    const { context, page, calls, errors } = await open({ script: pasted ? real : configured, routes, initScript: msgRecorder, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, keptOne) } });
    await loaded(page);
    // what another tab keeps, written here so that the storage event comes only when the check sends it
    await page.evaluate(() => { localStorage.removeItem('symphony_panel_oauth'); localStorage.setItem('symphony_panel_token', 'github_pat_OTHER'); });
    fail.armed = true;
    // this tab's next call takes the new token up, and GitHub cannot say whose it is this once
    await page.click('#cp-refresh');
    await page.waitForFunction(() => /502/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
    const n = calls.length;
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'symphony_panel_token' })));
    await sleep(1200);
    const msg = await page.textContent('#msg');
    console.log('      names:', JSON.stringify(await whoOf(page)), '| says:', msg, '| asked since:', JSON.stringify(tabCalls(calls, page, n).map((c) => c.key)));
    assert.equal(await whoOf(page), 'Signed in as other-person with a token, kept on this browser.');
    assert.equal(msg, 'Now signed in as other-person, not tester: another tab of this browser kept that account\'s token in place of the one this page had.');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

// the fifth review's findings, and the theories it left that hold, each as the page now promises it:
// a call goes out with a token GitHub has named for the page, or, while it has named nobody, with a
// token of the tab's own; one question GitHub never answers holds nothing for good; a sign-out's
// words stay; and what is said is so
const TIMEOUT_WORDS = 'GitHub did not say within 20 seconds whose the token is; try again in a moment.';
const FORGET_SIGNIN = 'The token is forgotten in this tab and on this browser, and the sign-in\'s token is revoked at GitHub. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The repositories you listed stay.';
// every request the page sends, with the name the page showed and whether the panel was open as it sent it
const fetchRecorder = () => {
  window.__sent = [];
  const f = window.fetch;
  window.fetch = function (input, init) {
    try {
      const h = (init && init.headers) || {};
      const w = document.getElementById('cp-who');
      const app = document.getElementById('cp-app');
      window.__sent.push({ url: typeof input === 'string' ? input : input.url, method: (init && init.method) || 'GET', auth: h['Authorization'] || '', who: w ? w.textContent : '', app: !!(app && !app.classList.contains('hidden')) });
    } catch (e) { /* recording only */ }
    return f.apply(this, arguments);
  };
};
const throwingStorage = () => {
  if (location.search.indexOf('nostorage') < 0) return;
  const deny = () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); };
  Object.defineProperty(window, 'localStorage', { get: deny, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { get: deny, configurable: true });
};
const noTimeout = () => { Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true }); };

for (const v of [
  { name: 'GitHub then names the pasted token', second: { delay: 1000 } },
  { name: 'GitHub cannot say whose the pasted token is the second time (502)', second: { delay: 300, status: 502 } },
]) for (const [way, pasted] of ways) {
  await check('I1: a token pasted while the page still asks about the kept sign-in, its check back after the panel opened, closes the panel until GitHub names it, and nothing goes out with it under the kept account\'s name (' + v.name + ', ' + way + ')', async () => {
    const KEPT = pasted ? 'github_pat_TESTER' : 'ghu_KEPT';
    const routes = repoRoutes('acme/demo');
    let otherAsked = 0;
    routes['GET /user'] = async (req) => {
      const a = req.headers()['authorization'];
      if (a === 'Bearer ' + KEPT) { await sleep(1500); return { login: 'tester' }; }
      if (a === 'Bearer github_pat_OTHER') {
        otherAsked++;
        // the paste's check is slower than the kept sign-in's question
        if (otherAsked === 1) { await sleep(2500); return { login: 'other-person' }; }
        if (otherAsked === 2) { await sleep(v.second.delay); if (v.second.status) return { status: v.second.status, body: { message: 'Server Error' } }; }
        return { login: 'other-person' };
      }
      return { status: 401, body: { message: 'Bad credentials' } };
    };
    // the kept sign-in's load is still under way when the paste is kept
    const workers = routes['GET /repos/acme/demo/contents/.github/symphony/workers'];
    routes['GET /repos/acme/demo/contents/.github/symphony/workers'] = async () => { await sleep(1500); return workers; };
    routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = null;
    const stored = pasted ? { symphony_panel_token: KEPT } : { symphony_panel_oauth: rec(KEPT, 'ghr_K', 2 * HOUR) };
    const { context, page, errors } = await open({ script: pasted ? real : configured, routes, noLoad: true, initScript: fetchRecorder, storage: { local: Object.assign({ symphony_panel_repos: repoList }, stored) } });
    await page.goto(BASE + '/symphony/control/?repo=acme/demo');
    await page.waitForSelector('#cp-gate:not(.hidden)');
    // pressed at once, as a person who had the token ready would, before GitHub names the kept sign-in
    await page.evaluate(() => { document.getElementById('cp-token-way').open = true; document.getElementById('cp-token').value = 'github_pat_OTHER'; document.getElementById('cp-keep').checked = false; document.getElementById('cp-open').click(); });
    await page.waitForFunction(() => /tester/.test(document.getElementById('cp-who').textContent), null, { timeout: 5000 });
    for (let i = 0; i < 400 && !(await page.evaluate(() => sessionStorage.getItem('symphony_panel_token') === 'github_pat_OTHER')); i++) await sleep(10);
    const kept = await page.evaluate(() => ({ app: !document.getElementById('cp-app').classList.contains('hidden'), who: document.getElementById('cp-who').textContent, workers: document.getElementById('cp-run-workers').checkVisibility() }));
    await sleep(v.second.status ? 1500 : 2500);
    if (v.second.status) { await page.evaluate(() => document.getElementById('cp-refresh').click()); await sleep(1500); }
    const sent = await page.evaluate(() => window.__sent);
    const underTester = sent.filter((c) => c.auth === 'Bearer github_pat_OTHER' && !/\/user$/.test(c.url) && /tester/.test(c.who)).map((c) => c.method + ' ' + c.url);
    const who = await whoOf(page);
    const msg = await page.textContent('#msg');
    console.log('      once the paste was kept:', JSON.stringify(kept), '| its calls under the name tester:', JSON.stringify(underTester), '| at the end:', JSON.stringify({ who, msg }));
    assert.equal(kept.app, false, 'the panel the kept sign-in opened stayed open');
    assert.equal(kept.who, '');
    assert.equal(kept.workers, false, '"Run the workers now" could still be pressed');
    assert.deepEqual(underTester, []);
    if (v.second.status) { assert.equal(who, ''); assert.equal(msg, 'GitHub answered 502: Server Error.'); }
    else assert.equal(who, 'Signed in as other-person with a token, for this tab.');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('I2a: after this tab renews its sign-in, a GET /user GitHub never answers fails the reads within the time the page waits, with the reason, and the next Refresh asks again', async () => {
  const routes = repoRoutes('acme/demo');
  const stall = { on: true };
  routes['GET /user'] = (req) => {
    if (req.headers()['authorization'] === 'Bearer ghu_NEW' && stall.on) { stall.on = false; return new Promise(() => { /* GitHub never answers this one */ }); }
    return { login: 'tester' };
  };
  const { context, page, calls, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', 2 * HOUR), symphony_panel_repos: repoList } } });
  await loaded(page);
  await expireKept(page);
  const at = Date.now();
  await page.click('#cp-refresh');
  await page.waitForFunction((w) => document.getElementById('msg').textContent === w, TIMEOUT_WORDS, { timeout: 30000 });
  const took = Date.now() - at;
  const summary = await page.textContent('#cp-summary');
  await page.click('#cp-refresh');
  await loaded(page);
  console.log('      the reads failed after', took, 'ms:', summary.slice(0, 150), '| then names:', await whoOf(page));
  assert.ok(took >= 19000 && took < 26000, 'the page waited ' + took + ' ms');
  assert.equal(summary, 'Could not read acme/demo: the repository (' + TIMEOUT_WORDS + ').');
  assert.equal(await whoOf(page), 'Signed in as tester through GitHub, kept on this browser.');
  assert.equal(calls.filter((c) => c.key === 'GET /user' && c.auth === 'Bearer ghu_NEW').length, 2, 'the second Refresh did not ask again');
  assert.deepEqual(errors, []);
  await context.close();
});

for (const [way, pasted] of ways) {
  await check('I2b: a token pasted again after GitHub did not answer whose it is asks afresh and opens the panel as its account (' + way + ')', async () => {
    const routes = repoRoutes('acme/demo');
    let n = 0;
    routes['GET /user'] = (req) => {
      if (req.headers()['authorization'] !== 'Bearer github_pat_NEW') return { login: 'tester' };
      n++;
      // the check's question is answered; the page's next one about the same token never is
      if (n === 2) return new Promise(() => { /* never answered */ });
      return { login: 'tester' };
    };
    const { context, page, errors } = await open({ script: pasted ? real : configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_repos: repoList } } });
    await pasteIn(page, 'github_pat_NEW', false);
    for (let i = 0; i < 200 && n < 2; i++) await sleep(20);
    await sleep(500);
    const at = Date.now();
    await pasteIn(page, 'github_pat_NEW', false);
    await appShown(page);
    await loaded(page);
    const took = Date.now() - at;
    console.log('      opened', took, 'ms after the second press; GitHub was asked', n, 'times');
    assert.ok(took < 5000, 'the second press waited on the first question for ' + took + ' ms');
    assert.equal(await whoOf(page), 'Signed in as tester with a token, for this tab.');
    assert.equal(n, 4);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [way, pasted] of ways) {
  await check('I2c: on the cost page, a pasted token whose account GitHub then never names opens the page within the time the page waits, with the reason (' + way + ')', async () => {
    const routes = repoRoutes('acme/demo');
    let n = 0;
    routes['GET /user'] = (req) => { if (req.headers()['authorization'] === 'Bearer github_pat_NEW' && ++n === 2) return new Promise(() => { /* never answered */ }); return { login: 'tester' }; };
    const { context, page, calls, errors } = await open({ script: pasted ? real : configured, routes, path: '/symphony/cost.html', storage: { local: { symphony_panel_repos: repoList } } });
    const at = Date.now();
    await pasteIn(page, 'github_pat_NEW', false);
    await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 30000 });
    const took = Date.now() - at;
    await sleep(500);
    const msg = await page.textContent('#msg');
    const read = calls.some((c) => c.key === 'GET /repos/acme/demo/contents/METRICS.json');
    console.log('      opened after', took, 'ms:', msg, '| metrics read:', read);
    assert.ok(took >= 19000 && took < 26000, 'the page waited ' + took + ' ms');
    assert.equal(msg, TIMEOUT_WORDS);
    assert.ok(read, 'the page read nothing');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [way, pasted] of ways) {
  await check('I2d: a tab whose question about a token another tab kept is never answered says so within the time the page waits, and its next Refresh asks again and reads (' + way + ')', async () => {
    const routes = repoRoutes('acme/demo');
    const held = { on: false, page: null };
    routes['GET /user'] = (req) => {
      if (req.headers()['authorization'] === 'Bearer github_pat_NEW' && held.on && req.frame().page() === held.page) { held.on = false; return new Promise(() => { /* never answered */ }); }
      return { login: 'tester' };
    };
    const keptOne = pasted ? { symphony_panel_token: 'github_pat_OLD' } : { symphony_panel_oauth: kept() };
    const { context, page: tab1, calls, errors } = await open({ script: pasted ? real : configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, keptOne) } });
    await loaded(tab1);
    const tab2 = await context.newPage();
    tab2.on('pageerror', (e) => errors.push(String(e)));
    await tab2.goto(BASE + '/symphony/');
    held.page = tab1;
    held.on = true;
    await tab2.evaluate(() => { localStorage.removeItem('symphony_panel_oauth'); localStorage.setItem('symphony_panel_token', 'github_pat_NEW'); });
    await tab1.waitForFunction(() => /could not be asked whose it is/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
    const msg = await tab1.textContent('#msg');
    const n = calls.length;
    await tab1.evaluate(() => document.getElementById('cp-refresh').click());
    await loaded(tab1);
    console.log('      tab 1 said:', msg, '| then names:', await whoOf(tab1));
    assert.equal(msg, 'Another tab of this browser kept a new token in place of the one this page had, and GitHub could not be asked whose it is (' + TIMEOUT_WORDS + '). The page asks again before its next call.');
    assert.deepEqual(unnamed(tabCalls(calls, tab1, n), []), []);
    assert.equal(await whoOf(tab1), 'Signed in as tester with a token, kept on this browser.');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const v of [{ name: 'Refresh mid-session', atLoad: false }, { name: 'at load', atLoad: true }]) {
  await check('I3: in a browser with no lock, a kept sign-in GitHub refuses far from its end is signed out at once, with no wait for another tab\'s renewal (' + v.name + ')', async () => {
    const dead = { on: v.atLoad };
    const routes = repoRoutes('acme/demo');
    for (const k of Object.keys(routes)) { const r = routes[k]; routes[k] = () => dead.on ? { status: 401, body: { message: 'Bad credentials' } } : r; }
    const { context, page, service, errors } = await open({ script: configured, routes, noLoad: true, initScript: noLock, storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
    let at = Date.now();
    await page.goto(BASE + '/symphony/control/?repo=acme/demo');
    if (!v.atLoad) { await loaded(page); dead.on = true; at = Date.now(); await page.click('#cp-refresh'); }
    await page.waitForFunction(() => /^GitHub refused the sign-in's token \(401\)/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
    const took = Date.now() - at;
    const f = await signedInFacts(page);
    console.log('      signed out after', took, 'ms:', f.msg);
    assert.ok(took < 5000, 'waited ' + took + ' ms for a renewal no other tab can be making');
    assert.ok(f.gate && !f.app);
    assert.equal(service.filter((x) => x.path === '/refresh').length, 0);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [way, pasted] of ways) {
  await check('I4: a kept token no request can carry is forgotten when the box comes back, so the next tab meets the plain box (' + way + ')', async () => {
    const { context, page, calls, errors } = await open({ script: pasted ? real : configured, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_token: 'github_pat_ABC\u200b', symphony_panel_repos: repoList } } });
    await page.waitForFunction(() => /no request can carry it/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
    const left = await page.evaluate(() => localStorage.getItem('symphony_panel_token'));
    const tab2 = await context.newPage();
    tab2.on('pageerror', (e) => errors.push(String(e)));
    await tab2.goto(BASE + '/symphony/control/?repo=acme/demo');
    await tab2.waitForSelector('#cp-gate:not(.hidden)');
    await sleep(500);
    const msg2 = await tab2.textContent('#msg');
    console.log('      kept afterwards:', JSON.stringify(left), '| the next tab says:', JSON.stringify(msg2));
    assert.equal(left, null);
    assert.equal(msg2, '');
    assert.equal(calls.length, 0);
    await pasteIn(page, 'github_pat_ABC', false);
    await loaded(page);
    assert.equal(await whoOf(page), 'Signed in as tester with a token, for this tab.');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const v of [{ name: 'tabs that take turns' }, { name: 'in a browser with no lock', initScript: noLock }]) {
  await check('I5a: Forget the token pressed while a write GitHub then refuses is on its way keeps Forget\'s words (' + v.name + ')', async () => {
    const routes = repoRoutes('acme/demo');
    routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = async () => { await sleep(1500); return { status: 401, body: { message: 'Bad credentials' } }; };
    const { context, page, errors } = await open({ script: configured, routes, initScript: v.initScript, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
    await loaded(page);
    await page.click('#cp-run-workers');
    await sleep(300);
    await page.click('#cp-signout');
    await sleep(2500);
    const msg = await page.textContent('#msg');
    console.log('      the page says:', msg);
    assert.equal(msg, FORGET_SIGNIN);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [way, pasted] of ways) {
  await check('I5b: Forget the token pressed while a write waits for GitHub to name a token another tab kept sends nothing and keeps Forget\'s words (' + way + ')', async () => {
    const NEW = pasted ? 'github_pat_NEW' : 'ghu_NEW2';
    const routes = repoRoutes('acme/demo');
    routes['GET /user'] = async (req) => { if (req.headers()['authorization'] === 'Bearer ' + NEW) await sleep(2000); return { login: 'tester' }; };
    routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = null;
    const keptOne = pasted ? { symphony_panel_token: 'github_pat_OLD' } : { symphony_panel_oauth: kept() };
    const { context, page, calls, errors } = await open({ script: pasted ? real : configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, keptOne) } });
    await loaded(page);
    const tab2 = await context.newPage();
    tab2.on('pageerror', (e) => errors.push(String(e)));
    await tab2.goto(BASE + '/symphony/');
    await tab2.evaluate(([p, nt, r]) => { if (p) localStorage.setItem('symphony_panel_token', nt); else localStorage.setItem('symphony_panel_oauth', r); }, [pasted, NEW, rec(NEW, 'ghr_K2', 8 * HOUR)]);
    await sleep(500);
    await page.click('#cp-run-workers');
    await sleep(300);
    await page.click('#cp-signout');
    await sleep(2500);
    const msg = await page.textContent('#msg');
    const writes = calls.filter((c) => c.key.startsWith('POST ')).map((c) => c.key + ' ' + c.auth);
    console.log('      the page says:', msg, '| writes:', JSON.stringify(writes));
    assert.deepEqual(writes, []);
    assert.equal(msg, pasted ? 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access token itself stays valid at GitHub until it runs out or you delete it at github.com/settings/personal-access-tokens. The repositories you listed stay.' : FORGET_SIGNIN);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [way, pasted] of ways) {
  await check('I6: a page that opened naming nobody, brought back from the back-forward cache with nothing changed, says nothing of another tab, and names the account once GitHub answers (' + way + ')', async () => {
    const fail = { on: true };
    const routes = repoRoutes('acme/demo');
    routes['GET /user'] = () => fail.on ? { status: 502, body: { message: 'Server Error' } } : { login: 'tester' };
    const keptOne = pasted ? { symphony_panel_token: 'github_pat_TESTER' } : { symphony_panel_oauth: kept() };
    const { context, page, errors } = await open({ script: pasted ? real : configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, keptOne) } });
    await loaded(page);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await sleep(800);
    const msg = await page.textContent('#msg');
    fail.on = false;
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await sleep(800);
    console.log('      after the first look:', msg, '| after the second, names:', await whoOf(page));
    assert.equal(msg, 'GitHub answered 502: Server Error.');
    assert.equal(await whoOf(page), 'Signed in as tester ' + (pasted ? 'with a token' : 'through GitHub') + ', kept on this browser.');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const [way, pasted] of ways) {
  await check('I7: with storage refused, Forget the token says the pasted token stays valid at GitHub and claims no repository kept (' + way + ')', async () => {
    const { context, page, errors } = await open({ script: pasted ? real : configured, initScript: throwingStorage, path: '/symphony/control/?nostorage=1&repo=acme/demo' });
    await pasteIn(page, 'github_pat_X', false);
    await appShown(page);
    await sleep(800);
    await page.click('#cp-signout');
    await sleep(500);
    const msg = await page.textContent('#msg');
    console.log('      Forget says:', msg);
    assert.equal(msg, 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access token itself stays valid at GitHub until it runs out or you delete it at github.com/settings/personal-access-tokens.');
    assert.deepEqual(errors.filter((e) => !/SecurityError|Access is denied/.test(e)), []);
    await context.close();
  });
}

await check('I8: a question about another tab\'s token answered after this tab was signed out and took a paste of its own says nothing of another tab', async () => {
  const held = { on: false, release: null };
  const routes = repoRoutes('acme/demo');
  const who = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
  routes['GET /user'] = async (req) => {
    if (req.headers()['authorization'] === 'Bearer github_pat_SLOW' && held.on) { held.on = false; await new Promise((r) => { held.release = r; }); }
    return who(req);
  };
  const { context, page, errors } = await open({ script: real, routes, initScript: msgRecorder, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_token: 'github_pat_TESTER', symphony_panel_repos: repoList } } });
  await loaded(page);
  const tab2 = await context.newPage();
  tab2.on('pageerror', (e) => errors.push(String(e)));
  await tab2.goto(BASE + '/symphony/');
  held.on = true;
  // another tab keeps a token GitHub is slow to name, then forgets it
  await tab2.evaluate(() => localStorage.setItem('symphony_panel_token', 'github_pat_SLOW'));
  for (let i = 0; i < 200 && !held.release; i++) await sleep(20);
  assert.ok(held.release, 'the page never asked about the other tab\'s token, so this check proves nothing');
  await tab2.evaluate(() => localStorage.removeItem('symphony_panel_token'));
  await page.waitForSelector('#cp-gate:not(.hidden)');
  // this tab takes a paste of another account's token, and GitHub names it
  await pasteIn(page, 'github_pat_OTHER', false);
  await loaded(page);
  held.release();
  await sleep(800);
  const msgs = await page.evaluate(() => window.__msgs || []);
  console.log('      every message:', JSON.stringify(msgs), '| names:', await whoOf(page));
  assert.ok(!msgs.some((m) => /^Now signed in as/.test(m)), 'it said another tab put the token in place');
  assert.equal(await whoOf(page), 'Signed in as other-person with a token, for this tab.');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I9a: in a browser with no AbortSignal.timeout, a renewal the service never answers is given up within the time the page waits, with the reason', async () => {
  const serviceFn = (path) => path === '/refresh' ? new Promise(() => { /* the service never answers */ }) : null;
  const { context, page, errors } = await open({ script: configured, serviceFn, initScript: noTimeout, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  await loaded(page);
  assert.equal(await page.evaluate(() => typeof AbortSignal.timeout), 'undefined', 'the stand-in did not take');
  await expireKept(page);
  const at = Date.now();
  await page.click('#cp-refresh');
  await page.waitForFunction(() => /^The token could not be renewed/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
  const took = Date.now() - at;
  const f = await signedInFacts(page);
  console.log('      the renewal was given up after', took, 'ms:', f.msg);
  assert.ok(took >= 19000 && took < 26000, 'the page waited ' + took + ' ms');
  assert.equal(f.msg, 'The token could not be renewed: The sign-in service could not be reached. Try again in a moment.');
  assert.ok(f.app && !f.gate, 'a renewal of the moment signed the page out');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I9b: in a browser with no AbortSignal.timeout, a paste GitHub never answers about gives the button back within the time the page waits', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = () => new Promise(() => { /* GitHub never answers */ });
  const { context, page, errors } = await open({ script: real, routes, initScript: noTimeout, path: '/symphony/control/', storage: { local: { symphony_panel_repos: repoList } } });
  const at = Date.now();
  await pasteIn(page, 'github_pat_X', false);
  await page.waitForFunction(() => !document.getElementById('cp-open').disabled, null, { timeout: 30000 });
  const took = Date.now() - at;
  const msg = await page.textContent('#msg');
  console.log('      the button came back after', took, 'ms:', msg);
  assert.ok(took >= 19000 && took < 26000, 'the page waited ' + took + ' ms');
  assert.equal(msg, 'GitHub could not be reached to check the token, so nothing was changed; try again in a moment.');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I10: Forget the token with a classic token pasted for this tab and a fine-grained one kept names both of GitHub\'s pages', async () => {
  const { context, page, errors } = await open({ script: real, noLoad: true, storage: { local: { symphony_panel_token: 'github_pat_KEPT', symphony_panel_repos: repoList }, session: { symphony_panel_token: 'ghp_TAB' } } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await loaded(page);
  await page.click('#cp-signout');
  await sleep(300);
  const msg = await page.textContent('#msg');
  console.log('      Forget says:', msg);
  assert.equal(msg, 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access tokens themselves stay valid at GitHub until they run out or you delete them at github.com/settings/tokens and github.com/settings/personal-access-tokens. The repositories you listed stay.');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I11: on the cost page, a slow answer about the repository chosen before is not shown over the one chosen after', async () => {
  const routes = repoRoutes('acme/demo');
  const metrics = (sharing) => ({ raw: JSON.stringify({ sharing, generated_at: now, window_days: 30 }) });
  routes['GET /repos/acme/slow/contents/METRICS.json'] = async () => { await sleep(2000); return metrics('on'); };
  routes['GET /repos/acme/fast/contents/METRICS.json'] = metrics('off');
  routes['GET /repos/acme/slow'] = { full_name: 'acme/slow', private: false };
  routes['GET /repos/acme/fast'] = { full_name: 'acme/fast', private: false };
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/cost.html', storage: { local: { symphony_panel_token: 'github_pat_X', symphony_panel_repos: JSON.stringify(['acme/slow', 'acme/fast']) } } });
  await page.waitForSelector('#cp-app:not(.hidden)');
  await page.waitForFunction(() => /acme\/slow/.test(document.getElementById('cost-measured').textContent));
  await page.selectOption('#cost-repo', 'acme/fast');
  await sleep(2800);
  const box = await page.textContent('#cost-measured');
  console.log('      the box says:', box);
  assert.match(box, /^Sharing is off in acme\/fast/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I12: a token pasted while Forget\'s revoke is still on its way is not told afterwards that the token is forgotten', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
  const serviceFn = async (path) => { if (path === '/revoke') { await sleep(1500); return { status: 200, body: { revoked: true } }; } return null; };
  const { context, page, errors } = await open({ script: configured, routes, serviceFn, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  await loaded(page);
  await page.click('#cp-signout');
  await pasteIn(page, 'github_pat_OTHER', false);
  await loaded(page);
  await sleep(1800);
  const msg = await page.textContent('#msg');
  console.log('      the page says:', JSON.stringify(msg), '| names:', await whoOf(page));
  assert.equal(msg, '');
  assert.equal(await whoOf(page), 'Signed in as other-person with a token, for this tab.');
  assert.deepEqual(errors, []);
  await context.close();
});

for (const [way, pasted] of ways) {
  await check('I13: a page that opened naming nobody names a token another tab kept before any call carries it, and refuses a write asked for while it named nobody (' + way + ')', async () => {
    const fail = { on: true };
    const routes = repoRoutes('acme/demo');
    const who = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
    routes['GET /user'] = (req) => fail.on ? { status: 502, body: { message: 'Server Error' } } : who(req);
    routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = null;
    const keptOne = pasted ? { symphony_panel_token: 'github_pat_TESTER' } : { symphony_panel_oauth: kept() };
    const { context, page, calls, errors } = await open({ script: pasted ? real : configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, keptOne) } });
    await loaded(page);
    assert.equal(await whoOf(page), '', 'the page named an account GitHub did not name');
    fail.on = false;
    // another tab keeps another account's token; written here, so no storage event comes
    await page.evaluate(() => { localStorage.removeItem('symphony_panel_oauth'); localStorage.setItem('symphony_panel_token', 'github_pat_OTHER'); });
    const n = calls.length;
    await page.click('#cp-run-workers');
    await page.waitForFunction(() => /^The sign-in changed/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
    const msg = await page.textContent('#msg');
    await page.click('#cp-refresh');
    await loaded(page);
    const list = tabCalls(calls, page, n);
    console.log('      the write:', msg, '| unnamed calls:', JSON.stringify(unnamed(list, [])), '| names:', await whoOf(page));
    assert.equal(msg, 'The sign-in changed while this was on its way, so nothing was done: the page acts as other-person now. Press again to do it as other-person.');
    assert.equal(list.filter((c) => c.key.startsWith('POST ')).length, 0);
    assert.deepEqual(unnamed(list, []), []);
    assert.equal(await whoOf(page), 'Signed in as other-person with a token, kept on this browser.');
    assert.deepEqual(errors, []);
    await context.close();
  });
}


await check('I11b: on the cost page, a slow failure about the repository chosen before is not shown over the one chosen after', async () => {
  const routes = repoRoutes('acme/demo');
  const metrics = (sharing) => ({ raw: JSON.stringify({ sharing, generated_at: now, window_days: 30 }) });
  routes['GET /repos/acme/slow/contents/METRICS.json'] = async () => { await sleep(2000); return { status: 404, body: { message: 'Not Found' } }; };
  routes['GET /repos/acme/fast/contents/METRICS.json'] = metrics('off');
  routes['GET /repos/acme/slow'] = { full_name: 'acme/slow', private: false };
  routes['GET /repos/acme/fast'] = { full_name: 'acme/fast', private: false };
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/cost.html', storage: { local: { symphony_panel_token: 'github_pat_X', symphony_panel_repos: JSON.stringify(['acme/slow', 'acme/fast']) } } });
  await page.waitForSelector('#cp-app:not(.hidden)');
  await page.waitForFunction(() => /acme\/slow/.test(document.getElementById('cost-measured').textContent));
  await page.selectOption('#cost-repo', 'acme/fast');
  await sleep(2800);
  const box = await page.textContent('#cost-measured');
  console.log('      the box says:', box);
  assert.match(box, /^Sharing is off in acme\/fast/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I12b: a token pasted while Forget\'s revoke is still on its way, the revoke then failing, is not told afterwards that GitHub could not be asked to revoke it', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = byLogin({ 'Bearer github_pat_OTHER': 'other-person' });
  const serviceFn = (path) => (path === '/revoke' ? { status: 502, delay: 1500, body: { error: 'server_error' } } : null);
  const { context, page, errors } = await open({ script: configured, routes, serviceFn, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  await loaded(page);
  await page.click('#cp-signout');
  await pasteIn(page, 'github_pat_OTHER', false);
  await loaded(page);
  await sleep(1800);
  const msg = await page.textContent('#msg');
  console.log('      the page says:', JSON.stringify(msg), '| names:', await whoOf(page));
  assert.equal(msg, '');
  assert.equal(await whoOf(page), 'Signed in as other-person with a token, for this tab.');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I14: a page that opened naming nobody renews its own sign-in when it runs out and reads with the renewed token, its own, without waiting on GitHub to name it', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = { status: 502, body: { message: 'Server Error' } };
  const { context, page, calls, service, errors } = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: kept(), symphony_panel_repos: repoList } } });
  await loaded(page);
  assert.equal(await whoOf(page), '', 'the page named an account GitHub did not name');
  await expireKept(page);
  const n = calls.length;
  await page.click('#cp-refresh');
  for (let i = 0; i < 300 && !calls.slice(n).some((c) => c.key === 'GET /repos/acme/demo' && c.auth === 'Bearer ghu_NEW'); i++) await sleep(20);
  await sleep(1000);
  const summary = await page.textContent('#cp-summary');
  const asked = calls.slice(n).filter((c) => c.key === 'GET /user').length;
  console.log('      renewals:', service.filter((x) => x.path === '/refresh').length, '| asked whose:', asked, '| summary:', summary.slice(0, 120));
  assert.equal(service.filter((x) => x.path === '/refresh').length, 1);
  assert.ok(calls.slice(n).some((c) => c.key === 'GET /repos/acme/demo' && c.auth === 'Bearer ghu_NEW'), 'nothing was read with the renewed token');
  assert.match(summary, /^acme\/demo, default/);
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---------- P: the deck's foot (a run a button started, a sign-in drawn there) and a phone ---------- */
// Signed in with a pasted token over a repository whose Workers workflow a button starts: GitHub
// lists the run, its job's steps on every read and, once the job has ended, its log.
const footLog = ['2026-10-19T01:40:01.000Z ##[group]Run the workers', '2026-10-19T01:40:02.000Z Reading the board of acme/demo', '2026-10-19T01:40:03.000Z 3 issues in the queue, 1 claimed', '2026-10-19T01:40:09.000Z nightly takes #9', '2026-10-19T01:40:10.000Z ##[endgroup]', '2026-10-19T01:40:11.000Z Done: 1 claim, 0 failures'].join('\n');
const footTail = 'Reading the board of acme/demo\n3 issues in the queue, 1 claimed\nnightly takes #9\nDone: 1 claim, 0 failures';
// the job ends, with the conclusion, on the endsOnRead-th read of its steps
function runRoutes(conclusion, endsOnRead) {
  const routes = repoRoutes('acme/demo');
  let reads = 0;
  routes['GET /repos/acme/demo/actions/workflows/workers.yml/runs'] = (req) => /per_page=1&/.test(req.url()) ? { workflow_runs: [{ id: 10 }] } : { workflow_runs: [{ id: 11, run_number: 11, html_url: 'https://github.com/acme/demo/actions/runs/11', actor: { login: 'tester' }, created_at: now, run_started_at: now, status: 'in_progress', event: 'workflow_dispatch' }] };
  routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = null;
  routes['GET /repos/acme/demo/actions/runs/11/jobs'] = () => {
    reads++;
    const done = reads >= endsOnRead;
    return { total_count: 1, jobs: [{ id: 501, name: 'workers', status: done ? 'completed' : 'in_progress', conclusion: done ? conclusion : null, started_at: now, completed_at: done ? new Date(Date.parse(now) + 95000).toISOString() : null,
      steps: [{ name: 'Set up job', status: 'completed', conclusion: 'success' }, { name: 'Run the workers', status: done ? 'completed' : 'in_progress', conclusion: done ? conclusion : null }, { name: 'Complete job', status: done ? 'completed' : 'queued', conclusion: done ? 'success' : null }] }] };
  };
  routes['GET /repos/acme/demo/actions/jobs/501/logs'] = { raw: footLog };
  return routes;
}
const asTester = { local: { symphony_panel_token: 'github_pat_TESTER', symphony_panel_repos: repoList } };
const footText = (p) => p.evaluate(() => document.getElementById('msg').textContent.replace(/\s+/g, ' ').trim());
const footTasks = (p) => p.evaluate(() => Array.from(document.querySelectorAll('#msg .msgtask')).map((b) => {
  const a = b.querySelector('.msgtask__where a');
  const line = b.querySelector('.msgtask__line');
  const log = b.querySelector('.msgtask__log');
  return { state: b.getAttribute('data-state'), title: b.querySelector('.msgtask__head strong').textContent, line: line.textContent, warn: line.classList.contains('admin__warn'), link: a ? a.href : '', linkText: a ? a.textContent : '', steps: Array.from(b.querySelectorAll('.msgtask__steps li')).map((li) => li.textContent + '=' + li.getAttribute('data-state')), log: log.hidden ? null : log.textContent };
}));
const untilFoot = (p, source, ms) => p.waitForFunction((src) => new RegExp(src).test(document.getElementById('msg').textContent), source, { timeout: ms || 20000 });

await check('P1: a run a button started is followed at the deck\'s foot: its link, its steps as GitHub lists them, the last lines of its log once the job has ended, its end, and the runs list read again', async () => {
  const routes = runRoutes('success', 2);
  const { context, page, calls, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  const n = calls.length;
  await page.click('#cp-run-workers');
  await untilFoot(page, 'Queued on main; the runs list shows it within a minute\\.', 5000);
  let tasks = await footTasks(page);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'The workers on acme/demo');
  assert.equal(tasks[0].state, 'live');
  assert.ok(calls.slice(n).some((c) => c.key === 'POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'), 'the workflow was not started');
  await untilFoot(page, 'Running; its steps show here as GitHub lists them\\.', 10000);
  await page.waitForFunction(() => document.querySelectorAll('#msg .msgtask__steps li').length > 0, null, { timeout: 10000 });
  tasks = await footTasks(page);
  console.log('      while it runs:', JSON.stringify(tasks[0]));
  assert.equal(tasks[0].link, 'https://github.com/acme/demo/actions/runs/11');
  assert.equal(tasks[0].linkText, 'Run #11 on GitHub');
  assert.deepEqual(tasks[0].steps, ['Set up job=done', 'Run the workers=running', 'Complete job=waiting']);
  assert.equal(tasks[0].log, null, 'a log shown before the job ended');
  const m = calls.length;
  await untilFoot(page, 'Finished: success, in 1 min 35 s\\.', 20000);
  tasks = await footTasks(page);
  console.log('      at its end:', JSON.stringify(tasks[0]));
  assert.equal(tasks[0].state, 'done');
  assert.equal(tasks[0].warn, false);
  assert.deepEqual(tasks[0].steps, ['Set up job=done', 'Run the workers=done', 'Complete job=done']);
  assert.equal(tasks[0].log, footTail);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#msg .msgtask__bar')).display), 'none', 'the hidden button bar is laid out');
  const list = tabCalls(calls, page, n);
  assert.equal(list.filter((c) => c.key === 'GET /repos/acme/demo/actions/jobs/501/logs').length, 1, 'the log is read once, when the job has ended');
  assert.ok(list.filter((c) => c.key === 'GET /repos/acme/demo/actions/runs/11/jobs').length >= 2, 'the steps were not read again');
  // the runs list is read four seconds after the start and again at the end: two reads since the steps first showed
  assert.ok(tabCalls(calls, page, m).filter((c) => c.key === 'GET /repos/acme/demo/actions/runs').length >= 2, 'the runs list was not read again at the end');
  assert.deepEqual(unnamed(list, ['Bearer github_pat_TESTER']), []);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P2: a run that fails ends its task at the foot as failed, with the step that failed marked and its log shown', async () => {
  const routes = runRoutes('failure', 1);
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  await page.click('#cp-run-workers');
  await untilFoot(page, 'Finished: failure, in 1 min 35 s\\.', 20000);
  const tasks = await footTasks(page);
  console.log('      failed:', JSON.stringify(tasks[0]));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].state, 'failed');
  assert.equal(tasks[0].warn, true);
  assert.deepEqual(tasks[0].steps, ['Set up job=done', 'Run the workers=failed', 'Complete job=done']);
  assert.equal(tasks[0].log, footTail);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P3: a start GitHub refuses is a plain message at the foot, with no task box left, and the next press starts afresh', async () => {
  const routes = repoRoutes('acme/demo');
  let tries = 0;
  routes['GET /repos/acme/demo/actions/workflows/board.yml/runs'] = { workflow_runs: [] };
  routes['POST /repos/acme/demo/actions/workflows/board.yml/dispatches'] = () => ++tries === 1 ? { status: 403, body: { message: 'Resource not accessible by personal access token' } } : null;
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  await page.click('#cp-run-board');
  await untilFoot(page, 'Starting a workflow needs Actions: read and write on the token\\.', 5000);
  const text = await footText(page);
  const boxes = await page.evaluate(() => document.querySelectorAll('#msg .msgtask').length);
  const warned = await page.evaluate(() => document.getElementById('msg').classList.contains('admin__warn'));
  console.log('      the refusal:', JSON.stringify(text), '| boxes:', boxes, '| warned:', warned);
  assert.equal(boxes, 0);
  assert.ok(warned);
  assert.doesNotMatch(text, /The board/);
  await page.click('#cp-run-board');
  await untilFoot(page, 'Queued on main', 5000);
  const tasks = await footTasks(page);
  assert.deepEqual(tasks.map((t) => t.title + '/' + t.state), ['The board on acme/demo/live']);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#msg > p.msg__note').length), 0, 'the refusal stayed above the new task');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P4: a task under way stays at the foot through a message said meanwhile, which goes above it; a new task takes a finished one\'s place', async () => {
  const routes = runRoutes('success', 3);
  let tries = 0;
  routes['GET /repos/acme/demo/actions/workflows/board.yml/runs'] = { workflow_runs: [] };
  routes['POST /repos/acme/demo/actions/workflows/board.yml/dispatches'] = () => ++tries === 1 ? { status: 403, body: { message: 'Resource not accessible by personal access token' } } : null;
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  await page.click('#cp-run-workers');
  await untilFoot(page, 'Queued on main', 5000);
  await page.click('#cp-run-board');
  await untilFoot(page, 'Starting a workflow needs Actions', 5000);
  const first = await page.evaluate(() => { const m = document.getElementById('msg'); return (m.firstElementChild.className || '') + '|' + m.children.length; });
  let tasks = await footTasks(page);
  console.log('      beside the refusal:', first, JSON.stringify(tasks.map((t) => t.title + '/' + t.state)));
  assert.equal(first, 'msg__note|2');
  assert.deepEqual(tasks.map((t) => t.title + '/' + t.state), ['The workers on acme/demo/live']);
  await untilFoot(page, 'Finished: success', 30000);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#msg > p.msg__note').length), 0, 'the refusal outlived the work it was said beside');
  await page.click('#cp-run-board');
  await untilFoot(page, 'Queued on main', 5000);
  tasks = await footTasks(page);
  console.log('      after the next press:', JSON.stringify(tasks.map((t) => t.title + '/' + t.state)));
  assert.deepEqual(tasks.map((t) => t.title + '/' + t.state), ['The board on acme/demo/live']);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P5: on a phone, Save and sign in closes the dialog at once and draws the sign-in at the foot: a link to claude.ai, a box for the code, Send posts the code; Clear hides it and the Sign-in waiting tile shows it again with the code kept', async () => {
  const routes = repoRoutes('acme/demo');
  const posted = [];
  Object.assign(routes, {
    'GET /repos/acme/demo/actions/secrets': { total_count: 1, secrets: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN' }] },
    'GET /repos/acme/demo/actions/variables': { total_count: 0, variables: [] },
    'POST /repos/acme/demo/actions/variables': { status: 201, body: {} },
    'GET /repos/acme/demo/actions/workflows/token.yml': { state: 'active' },
    'GET /repos/acme/demo/actions/secrets/public-key': { key_id: 'k1', key: 'AAAA' },
    'POST /repos/acme/demo/issues': async () => { await sleep(400); return { number: 42 }; },
    'POST /repos/acme/demo/actions/workflows/token.yml/dispatches': null,
    'GET /repos/acme/demo/actions/workflows/token.yml/runs': { workflow_runs: [] },
    'GET /repos/acme/demo/issues/42/comments': [{ user: { login: 'github-actions[bot]' }, body: '<!-- symphony-token: sign-in -->\nhttps://claude.ai/oauth/authorize?code=1\n' }],
    'POST /repos/acme/demo/issues/42/comments': (req) => { posted.push(req.postDataJSON()); return null; },
  });
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester, viewport: { width: 390, height: 844 }, mobile: true });
  await loaded(page);
  await page.waitForSelector('#tk-tile-add', { timeout: 10000 });
  await page.evaluate(() => document.getElementById('tk-tile-add').click());
  await page.waitForSelector('#tk-start', { timeout: 5000 });
  await page.waitForFunction(() => !document.getElementById('tk-start').disabled, null, { timeout: 5000 });
  const closedAtOnce = await page.evaluate(() => { document.getElementById('tk-start').click(); return !document.getElementById('tk-dialog').open; });
  const saving = await footText(page);
  await page.waitForSelector('#msg #tk-code', { timeout: 15000 });
  const facts = await page.evaluate(() => {
    const a = document.getElementById('tk-open');
    return { href: a.href, target: a.target, rel: a.rel, go: a.classList.contains('msgtask__go'), inFoot: !!a.closest('#msg .msgtask'), dialogOpen: document.getElementById('tk-dialog').open, tile: document.getElementById('tk-tile-add').textContent };
  });
  const tasks = await footTasks(page);
  console.log('      closed at once:', closedAtOnce, '| first words:', JSON.stringify(saving), '| sign-in:', JSON.stringify(facts), '| task:', JSON.stringify(tasks.map((t) => t.title + '/' + t.state + '/' + t.line)));
  assert.ok(closedAtOnce, 'the dialog stayed open after Save and sign in');
  assert.match(saving, /^Add .*Saving the settings of /);
  assert.equal(facts.href, 'https://claude.ai/oauth/authorize?code=1');
  assert.equal(facts.target, '_blank');
  assert.ok(facts.go && facts.inFoot && !facts.dialogOpen);
  assert.match(facts.tile, /Sign-in waiting/);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].state, 'live');
  await page.fill('#tk-code', 'ABCDEFGH1234');
  await page.evaluate(() => Array.from(document.querySelectorAll('#msg button')).find((b) => b.textContent === 'Send the code').click());
  await untilFoot(page, 'Code sent; the run is making the token', 5000);
  assert.deepEqual(posted, [{ body: '<!-- symphony-token: code -->\nABCDEFGH1234' }]);
  await page.evaluate(() => document.getElementById('cp-msg-close').click());
  assert.equal(await page.evaluate(() => document.getElementById('msg').children.length), 0, 'Clear left the sign-in in view');
  await page.evaluate(() => document.getElementById('tk-tile-add').click());
  const again = await page.evaluate(() => { const c = document.querySelector('#msg #tk-code'); return c ? c.value + '/' + c.disabled : 'gone'; });
  console.log('      shown again from the tile:', again);
  assert.equal(again, 'ABCDEFGH1234/true');
  assert.deepEqual(errors, []);
  await context.close();
});

// a phone with much to show: forty tasks, a board with a wide table, and the text size a desktop saved
function phoneRoutes() {
  const routes = repoRoutes('acme/demo');
  const issues = [];
  for (let i = 1; i <= 40; i++) issues.push({ number: i, title: 'Task number ' + i + ' with a fairly long title to fill the card', html_url: 'https://github.com/acme/demo/issues/' + i, labels: [{ name: i % 4 === 0 ? 'claimed' : 'todo' }].concat(i % 4 === 0 ? [{ name: 'worker:nightly' }] : []), updated_at: now, body: 'Files likely touched: docs/' + i + '.md' });
  issues.push({ number: 100, title: 'Epic one', html_url: 'https://github.com/acme/demo/issues/100', labels: [{ name: 'epic' }], updated_at: now });
  const wide = '| Issue | Worker | Branch | Files | Pull request | Last commit | Plan | Overlaps | Since |\n|---|---|---|---|---|---|---|---|---|\n' + issues.slice(0, 12).map((i) => '| #' + i.number + ' | nightly | claude/' + i.number + ' | docs/' + i.number + '.md, tools/very_long_module_name_' + i.number + '.py | #' + (200 + i.number) + ' | 2026-10-19T01:00:00Z | the plan of the claim in a sentence that goes on | #3, #4 | 2 h |').join('\n');
  routes['GET /repos/acme/demo/issues'] = async () => { await sleep(300); return issues; };
  routes['GET /repos/acme/demo/contents/STATE.md'] = { raw: '# Board\n\nhttps://github.com/OpenSpineConsortium/symphony-template/blob/board/STATE.md#a-very-long-anchor-that-never-breaks-anywhere-at-all-really\n\n## Claims\n\n' + wide + '\n\n## Queue\n\n' + issues.map((i) => '- #' + i.number + ' ' + i.title).join('\n') + '\n' };
  routes['GET /repos/acme/demo/contents/.github/symphony/workers'] = [{ type: 'file', name: 'nightly.json' }];
  routes['GET /repos/acme/demo/contents/.github/symphony/workers/nightly.json'] = { encoding: 'base64', content: b64(JSON.stringify({ name: 'nightly', runs: 'actions', about: 'Small fixes', area: ['docs/'], lands: 'owner', model: '', max_turns: 80, rounds: 6, account: '' })) };
  const runs = [];
  for (let i = 1; i <= 25; i++) runs.push({ id: i, name: 'Board', event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success', actor: { login: 'tester' }, run_started_at: now, html_url: 'https://github.com/acme/demo/actions/runs/' + i });
  routes['GET /repos/acme/demo/actions/runs'] = { workflow_runs: runs };
  routes['GET /repos/acme/demo/actions/secrets'] = { total_count: 4, secrets: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN' }, { name: 'SYMPHONY_CLAUDE_1' }, { name: 'SYMPHONY_CLAUDE_2' }, { name: 'SYMPHONY_CLAUDE_3' }] };
  routes['GET /repos/acme/demo/actions/variables'] = { total_count: 0, variables: [] };
  return routes;
}
const PHONE_TABS = ['command', 'board', 'tasks', 'dependencies', 'explore', 'pulls', 'runs', 'workers', 'agents', 'tokens', 'leaders', 'share', 'folders', 'about'];
const scrollYOf = (p) => p.evaluate(() => Math.round(window.scrollY));

await check('P6: on a phone every tab fits the window, the saved text size and its buttons are left to the desktop, the status line sticks to the window\'s foot, and Refresh holds the page where it was', async () => {
  const routes = phoneRoutes();
  const storage = { local: Object.assign({ symphony_panel_layout: JSON.stringify({ zoom: 1.5 }) }, asTester.local) };
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage, viewport: { width: 390, height: 844 }, mobile: true });
  await loaded(page);
  await sleep(500);
  const wide = [];
  for (const tab of PHONE_TABS) {
    await page.click('.console__rail [data-tab="' + tab + '"]');
    await sleep(350);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    if (m.sw > m.iw) wide.push(tab + ':' + m.sw + '/' + m.iw);
  }
  const deck = await page.evaluate(() => {
    const c = document.getElementById('console');
    const zoom = getComputedStyle(c.querySelector('.console__app')).zoom;
    const down = document.getElementById('cp-zoom-down');
    return { clip: getComputedStyle(c).overflowX, zoom: String(zoom), zoomButtons: !!(down && down.checkVisibility()) };
  });
  await page.click('.console__rail [data-tab="tasks"]');
  await sleep(300);
  await page.evaluate(() => window.scrollTo(0, 1e6));
  await sleep(300);
  const status = await page.evaluate(() => { const st = document.querySelector('.console__status'); const r = st.getBoundingClientRect(); return { pos: getComputedStyle(st).position, top: Math.round(r.top), bottom: Math.round(r.bottom), ih: window.innerHeight, scrollY: Math.round(window.scrollY) }; });
  // the phone's own rules win over the desktop's: a run's card puts its name and its time on the
  // first line and the rest under them, the tiles stand two to a row, and the foot's buttons spread
  await page.click('.console__rail [data-tab="runs"]');
  await sleep(300);
  const card = await page.evaluate(() => {
    const tr = document.querySelector('#cp-runs tbody tr');
    const name = tr.querySelector('td.cell--name'), event = tr.querySelector('td.cell--event'), when = tr.querySelector('td.cell--when');
    const cs = getComputedStyle(name);
    return { grow: cs.flexGrow, max: cs.maxWidth, nameTop: Math.round(name.getBoundingClientRect().top), whenTop: Math.round(when.getBoundingClientRect().top), eventTop: Math.round(event.getBoundingClientRect().top), rowWidth: Math.round(tr.getBoundingClientRect().width), tableScroll: tr.parentElement.scrollWidth };
  });
  await page.click('.console__rail [data-tab="tokens"]');
  await sleep(300);
  const tiles = await page.evaluate(() => ({ columns: getComputedStyle(document.getElementById('tk-tiles')).gridTemplateColumns.split(' ').length, width: document.getElementById('tk-tiles').clientWidth, me: getComputedStyle(document.querySelector('.console__me')).justifyContent }));
  // the Command tab's readouts and buttons several to a row, as the token tiles are (the owner,
  // 2026-10-19: "should scale to the screen size so multiple fit on the page")
  await page.click('.console__rail [data-tab="command"]');
  await sleep(300);
  const command = await page.evaluate(() => ({ readouts: getComputedStyle(document.querySelector('.deck__readouts')).gridTemplateColumns.split(' ').length, launch: getComputedStyle(document.querySelector('.deck__launch')).gridTemplateColumns.split(' ').length }));
  console.log('      wider than the window:', wide.length ? wide.join(' ') : 'no tab', '| deck:', JSON.stringify(deck), '| status:', JSON.stringify(status), '| run card:', JSON.stringify(card), '| tiles:', JSON.stringify(tiles), '| command:', JSON.stringify(command));
  assert.deepEqual(wide, []);
  assert.equal(card.grow, '1', 'the run name takes its line');
  assert.equal(card.max, 'none');
  assert.equal(card.whenTop, card.nameTop, 'the time sits on the name\'s line');
  assert.ok(card.eventTop > card.nameTop + 10, 'the event sits under the name');
  assert.equal(tiles.columns, 3, 'the token tiles do not stand three to a row');
  assert.deepEqual(command, { readouts: 3, launch: 2 }, 'the Command tab\'s readouts and buttons do not stand three and two to a row');
  assert.ok(tiles.width > 300, 'the tiles fill the row');
  assert.equal(tiles.me, 'space-between');
  assert.equal(deck.clip, 'clip');
  assert.notEqual(deck.zoom, '1.5');
  assert.equal(deck.zoomButtons, false);
  assert.equal(status.pos, 'sticky');
  assert.ok(status.scrollY > 300 && status.top > 0 && status.bottom <= status.ih + 1, 'the status line does not stick to the foot');
  // Refresh on the tab whose chart is drawn afresh, the page scrolled into the tab
  await page.click('.console__rail [data-tab="dependencies"]');
  await sleep(600);
  await page.evaluate(() => window.scrollTo(0, 1e6));
  let before = 0;
  for (let i = 0; i < 6; i++) { await sleep(150); before = await scrollYOf(page); }
  const held = await page.evaluate(() => { document.getElementById('cp-refresh').click(); return document.querySelector('.console__stage').style.minHeight; });
  const seen = [];
  for (let i = 0; i < 12; i++) { await sleep(150); seen.push(await scrollYOf(page)); }
  await loaded(page);
  await sleep(400);
  const released = await page.evaluate(() => document.querySelector('.console__stage').style.minHeight);
  console.log('      refresh: before', before, 'after', seen.join(','), '| stage held:', JSON.stringify(held), '| released:', JSON.stringify(released));
  assert.ok(before > 300, 'the page did not scroll into the tab');
  assert.match(held, /^\d+(\.\d+)?px$/);
  assert.equal(released, '');
  assert.ok(seen.every((v) => v === before), 'the page jumped through Refresh');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P7: a long message at the foot wraps inside the message and never pushes Clear under the text-size buttons', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo', storage: asTester, viewport: { width: 1280, height: 620 } });
  await loaded(page);
  await page.evaluate(() => { document.getElementById('msg').textContent = 'A long message that goes on and on about the run that was started and what it is doing now, wrapping to a second and perhaps a third line on a narrow deck so the status row grows and the stage shrinks by that much, which is what we measure here, and some more words to be sure it wraps on a wide screen too, and then some.'; });
  await sleep(200);
  const hit = await page.evaluate(() => {
    const c = document.getElementById('cp-msg-close').getBoundingClientRect();
    const at = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
    return { visible: c.width > 0 && c.height > 0, under: at ? (at.id || at.className) : 'nothing', ok: !!(at && at.closest('#cp-msg-close')) };
  });
  console.log('      under Clear\'s middle:', JSON.stringify(hit));
  assert.ok(hit.visible && hit.ok);
  await page.click('#cp-msg-close', { timeout: 2000 });
  assert.equal(await footText(page), '');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P8: Queue for the workers and Ask @claude now close the task dialog at once, the request speaking at the foot', async () => {
  const routes = repoRoutes('acme/demo');
  let opened = 0;
  routes['POST /repos/acme/demo/issues'] = async () => { await sleep(400); return { number: 50 + ++opened, labels: [{ name: 'todo' }], html_url: 'https://github.com/acme/demo/issues/5' + opened }; };
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo#tasks', storage: asTester });
  await loaded(page);
  await page.click('#cp-task-new');
  await page.waitForFunction(() => document.getElementById('dlg-task').open, null, { timeout: 3000 });
  await page.fill('#cp-task-title', 'Fix the phone layout');
  await page.fill('#cp-task-goal', 'Every tab fits a phone.');
  const queued = await page.evaluate(() => { document.getElementById('cp-task-queue').click(); return { open: document.getElementById('dlg-task').open, foot: document.getElementById('msg').textContent }; });
  await untilFoot(page, 'Queued as #51;', 5000);
  await page.click('#cp-task-new');
  await page.waitForFunction(() => document.getElementById('dlg-task').open, null, { timeout: 3000 });
  await page.fill('#cp-task-title', 'Explain the board');
  await page.fill('#cp-task-goal', 'Say what the board shows.');
  const asked = await page.evaluate(() => { document.getElementById('cp-task-ask').click(); return { open: document.getElementById('dlg-task').open, foot: document.getElementById('msg').textContent }; });
  await untilFoot(page, '#52', 5000);
  console.log('      queue:', JSON.stringify(queued), '| ask:', JSON.stringify(asked));
  assert.deepEqual(queued, { open: false, foot: 'Queueing the task...' });
  assert.deepEqual(asked, { open: false, foot: 'Sending...' });
  assert.deepEqual(errors, []);
  await context.close();
});


/* ---------- P9 on: what the review of the foot and the phone found ---------- */
await check('P9: a read GitHub fails once is made again and the run is followed to its end; three failures in a row, of the jobs or of the runs list, end the task as failed with the reason, never as done', async () => {
  // the jobs fail once, then answer as before
  let routes = runRoutes('success', 3);
  const steps = routes['GET /repos/acme/demo/actions/runs/11/jobs'];
  let jobReads = 0;
  routes['GET /repos/acme/demo/actions/runs/11/jobs'] = (req) => ++jobReads === 1 ? { status: 502, body: { message: 'Bad Gateway' } } : steps(req);
  let { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  await page.click('#cp-run-workers');
  await untilFoot(page, 'Finished: success, in 1 min 35 s\\.', 45000);
  let tasks = await footTasks(page);
  console.log('      one lost answer:', jobReads, 'reads |', JSON.stringify(tasks[0].state + '/' + tasks[0].line));
  assert.equal(tasks[0].state, 'done');
  assert.ok(jobReads >= 4, 'the jobs were not read again after the lost answer');
  assert.deepEqual(errors, []);
  await context.close();
  // every read of the jobs fails
  routes = runRoutes('success', 3);
  let fails = 0;
  routes['GET /repos/acme/demo/actions/runs/11/jobs'] = () => { fails++; return { status: 502, body: { message: 'Bad Gateway' } }; };
  ({ context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester }));
  await loaded(page);
  await page.click('#cp-run-workers');
  await untilFoot(page, 'GitHub could not be read while the run was followed', 45000);
  tasks = await footTasks(page);
  console.log('      jobs never read:', fails, 'tries |', JSON.stringify(tasks[0].state + '/' + tasks[0].line));
  assert.equal(tasks[0].state, 'failed');
  assert.equal(tasks[0].warn, true);
  assert.equal(fails, 3);
  assert.equal(tasks[0].link, 'https://github.com/acme/demo/actions/runs/11', 'the run\'s link went');
  assert.deepEqual(errors, []);
  await context.close();
  // every look at the runs list fails, the read before the press aside
  routes = runRoutes('success', 3);
  let looks = 0;
  routes['GET /repos/acme/demo/actions/workflows/workers.yml/runs'] = (req) => /per_page=1&/.test(req.url()) ? { workflow_runs: [{ id: 10 }] } : (looks++, { status: 502, body: { message: 'Bad Gateway' } });
  ({ context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester }));
  await loaded(page);
  await page.click('#cp-run-workers');
  await untilFoot(page, 'GitHub could not be read while the run was looked for', 30000);
  tasks = await footTasks(page);
  console.log('      runs never listed:', looks, 'looks |', JSON.stringify(tasks[0].state + '/' + tasks[0].line));
  assert.equal(tasks[0].state, 'failed');
  assert.equal(looks, 3);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P10: a run followed when the page goes to another repository is read no more, and its task, named for its repository, says it was left at its link', async () => {
  const routes = Object.assign(runRoutes('success', 1000), repoRoutes('acme/other'));
  const storage = { local: { symphony_panel_token: 'github_pat_TESTER', symphony_panel_repos: JSON.stringify(['acme/demo', 'acme/other']) } };
  const { context, page, calls, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage });
  await loaded(page);
  await page.click('#cp-run-workers');
  await page.waitForFunction(() => document.querySelectorAll('#msg .msgtask__steps li').length > 0, null, { timeout: 15000 });
  const at = calls.length;
  await page.selectOption('#cp-repo', 'acme/other');
  await page.waitForFunction(() => /^acme\/other, default/.test(document.getElementById('cp-summary').textContent), null, { timeout: 15000 });
  await untilFoot(page, 'Left as the page went to another repository', 10000);
  await sleep(7000);
  const later = calls.slice(at).filter((c) => c.key === 'GET /repos/acme/demo/actions/runs/11/jobs' || c.key === 'GET /repos/acme/demo/actions/jobs/501/logs').length;
  const tasks = await footTasks(page);
  console.log('      reads of the old run after the switch:', later, '|', JSON.stringify(tasks[0]));
  assert.ok(later <= 1, 'the old repository\'s run was still read');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'The workers on acme/demo');
  assert.equal(tasks[0].link, 'https://github.com/acme/demo/actions/runs/11');
  assert.doesNotMatch(tasks[0].line, /Finished/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P11: Forget the token pressed while a run is followed keeps Forget\'s words at the foot, the dropped task saying nothing more', async () => {
  const routes = runRoutes('success', 1000);
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  await page.click('#cp-run-workers');
  await page.waitForFunction(() => document.querySelectorAll('#msg .msgtask__steps li').length > 0, null, { timeout: 15000 });
  await page.click('#cp-signout');
  await untilFoot(page, 'The token is forgotten', 5000);
  const said = await footText(page);
  await sleep(8000);
  const after = await footText(page);
  console.log('      at the press:', JSON.stringify(said.slice(0, 60)), '| eight seconds on:', JSON.stringify(after.slice(0, 60)));
  assert.match(after, /^The token is forgotten/);
  assert.equal(after, said);
  assert.deepEqual(errors, []);
  await context.close();
});

// an epic with three sub-issues, its chart drawn by Mermaid as the site serves it
function graphRoutes() {
  const routes = repoRoutes('acme/demo');
  const task = (n, labels) => ({ number: n, title: 'Task ' + n, html_url: 'https://github.com/acme/demo/issues/' + n, labels: labels.map((l) => ({ name: l })), updated_at: now, state: 'open', user: { login: 'tester' } });
  const issues = [task(1, ['todo']), task(2, ['todo']), task(3, ['claimed', 'worker:nightly'])];
  issues.push(Object.assign(task(100, ['epic']), { title: 'Epic one', sub_issues_summary: { total: 3, completed: 0, percent_completed: 0 } }));
  const phase = { subFail: false, issuesDelay: 0, subDelay: 0 };
  routes['GET /repos/acme/demo/issues'] = async () => { if (phase.issuesDelay) await sleep(phase.issuesDelay); return issues; };
  routes['GET /repos/acme/demo/issues/100/sub_issues'] = async () => { if (phase.subDelay) await sleep(phase.subDelay); return phase.subFail ? { status: 500, body: { message: 'boom' } } : issues.slice(0, 3); };
  for (const n of [1, 2, 3]) routes['GET /repos/acme/demo/issues/' + n + '/dependencies/blocked_by'] = [];
  return { routes, phase };
}
const graphDrawn = (p) => p.waitForFunction(() => /^Drawn /.test(document.getElementById('cp-graph-state').textContent), null, { timeout: 25000 });
// the window scrolls smoothly on a phone, so it is read until it rests
async function restingY(page) {
  let last = -1;
  for (let i = 0; i < 40; i++) { await sleep(100); const y = await scrollYOf(page); if (y === last) return y; last = y; }
  return last;
}

await check('P12: on a phone, Refresh on the Dependencies tab keeps the chart\'s box at its height until the chart is drawn again, and a read that fails lets the box go', async () => {
  const { routes, phase } = graphRoutes();
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo#dependencies', storage: asTester, viewport: { width: 390, height: 844 }, mobile: true });
  await loaded(page);
  await graphDrawn(page);
  await page.evaluate(() => window.scrollTo(0, 1e6));
  const before = await restingY(page);
  // the sub-issues take a while, so the box stands empty long enough to be seen held or not
  phase.subDelay = 700;
  await page.evaluate(() => {
    const box = document.getElementById('cp-graph');
    window.__seen = [];
    window.__watch = setInterval(() => window.__seen.push({ min: box.style.minHeight, kids: box.children.length, state: document.getElementById('cp-graph-state').textContent.slice(0, 30), y: Math.round(window.scrollY) }), 15);
    document.getElementById('cp-refresh').click();
  });
  await loaded(page);
  await graphDrawn(page);
  await sleep(300);
  const seen = await page.evaluate(() => { clearInterval(window.__watch); return window.__seen; });
  const unheld = seen.filter((s) => s.kids === 0 && !s.min);
  const moved = seen.filter((s) => s.y !== before);
  console.log('      before', before, '| samples', seen.length, '| empty and unheld:', JSON.stringify(unheld.slice(0, 3)), '| moved:', JSON.stringify(moved.slice(0, 3)));
  assert.ok(before > 300, 'the page did not scroll into the tab');
  assert.ok(seen.some((s) => s.kids === 0), 'the box was never emptied, so nothing was measured');
  assert.deepEqual(unheld, [], 'the empty box lost its hold before the chart was drawn');
  assert.deepEqual(moved, [], 'the page moved through Refresh');
  // the sub-issues cannot be read: the box stands empty under one line, at no height of its own
  phase.subDelay = 0;
  phase.subFail = true;
  await page.evaluate(() => document.getElementById('cp-refresh').click());
  await page.waitForFunction(() => /^Not drawn/.test(document.getElementById('cp-graph-state').textContent), null, { timeout: 15000 });
  await sleep(300);
  const box = await page.evaluate(() => { const b = document.getElementById('cp-graph'); return { min: b.style.minHeight, kids: b.children.length, h: b.offsetHeight, tabMin: document.getElementById('tab-dependencies').style.minHeight }; });
  console.log('      after a failed read:', JSON.stringify(box));
  assert.equal(box.kids, 0);
  assert.equal(box.min, '', 'the emptied box kept the old chart\'s height');
  assert.equal(box.tabMin, '', 'the tab kept the old chart\'s height');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P13: on a phone, Refresh pressed twice keeps the stage held until the second read is done', async () => {
  const { routes, phase } = graphRoutes();
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo#dependencies', storage: asTester, viewport: { width: 390, height: 844 }, mobile: true });
  await loaded(page);
  await graphDrawn(page);
  await page.evaluate(() => window.scrollTo(0, 1e6));
  await restingY(page);
  phase.issuesDelay = 900;
  const twice = await page.evaluate(() => { const s = document.querySelector('.console__stage'); document.getElementById('cp-refresh').click(); document.getElementById('cp-refresh').click(); return s.style.minHeight; });
  const samples = [];
  for (let i = 0; i < 7; i++) { await sleep(100); samples.push(await page.evaluate(() => document.querySelector('.console__stage').style.minHeight || '(none)')); }
  await loaded(page);
  await graphDrawn(page);
  await sleep(400);
  const released = await page.evaluate(() => document.querySelector('.console__stage').style.minHeight);
  console.log('      held at the presses:', JSON.stringify(twice), '| while the issues were on their way:', samples.join(' '), '| at the end:', JSON.stringify(released));
  assert.match(twice, /^\d+(\.\d+)?px$/);
  assert.ok(samples.every((v) => v !== '(none)'), 'the first refresh let the second one\'s hold go');
  assert.equal(released, '');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P14: a phone held sideways, wide but short, keeps its own text size and shows no text-size buttons, while a desktop keeps the size it saved', async () => {
  const storage = { local: Object.assign({ symphony_panel_layout: JSON.stringify({ zoom: 1.5 }) }, asTester.local) };
  const facts = [];
  for (const [viewport, mobile] of [[{ width: 932, height: 430 }, true], [{ width: 1280, height: 900 }, false]]) {
    const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo', storage, viewport, mobile });
    await loaded(page);
    facts.push(await page.evaluate(() => ({ zoom: String(getComputedStyle(document.querySelector('#console .console__app')).zoom), buttons: document.getElementById('cp-zoom-down').checkVisibility() })));
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('      sideways phone:', JSON.stringify(facts[0]), '| desktop:', JSON.stringify(facts[1]));
  assert.deepEqual(facts[0], { zoom: '1', buttons: false });
  assert.deepEqual(facts[1], { zoom: '1.5', buttons: true });
});

// the token sign-in of P5, on a repository whose Token run GitHub lists with its nine steps
function signInRoutes(posted, extra) {
  const routes = repoRoutes('acme/demo');
  const nine = ['Set up job', 'Check out', 'Look for your token', 'Install Claude Code', 'Sign in', 'Seal the token', 'Store the token', 'Remove the held token', 'Complete job'].map((name, i) => ({ name, status: i < 4 ? 'completed' : (i === 4 ? 'in_progress' : 'queued'), conclusion: i < 4 ? 'success' : null }));
  Object.assign(routes, {
    'GET /repos/acme/demo/actions/secrets': { total_count: 1, secrets: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN' }] },
    'GET /repos/acme/demo/actions/variables': { total_count: 0, variables: [] },
    'POST /repos/acme/demo/actions/variables': { status: 201, body: {} },
    'GET /repos/acme/demo/actions/workflows/token.yml': { state: 'active' },
    'GET /repos/acme/demo/actions/secrets/public-key': { key_id: 'k1', key: 'AAAA' },
    'POST /repos/acme/demo/issues': async () => { await sleep(400); return { number: 42 }; },
    'POST /repos/acme/demo/actions/workflows/token.yml/dispatches': null,
    'GET /repos/acme/demo/actions/workflows/token.yml/runs': (req) => /per_page=1&/.test(req.url()) ? { workflow_runs: [{ id: 20 }] } : { workflow_runs: [{ id: 21, run_number: 21, html_url: 'https://github.com/acme/demo/actions/runs/21', actor: { login: 'tester' }, created_at: now, run_started_at: now, status: 'in_progress', event: 'workflow_dispatch' }] },
    'GET /repos/acme/demo/actions/runs/21/jobs': { total_count: 1, jobs: [{ id: 601, name: 'store', status: 'in_progress', conclusion: null, started_at: now, steps: nine }] },
    'GET /repos/acme/demo/issues/42/comments': [{ user: { login: 'github-actions[bot]' }, body: '<!-- symphony-token: sign-in -->\nhttps://claude.ai/oauth/authorize?code=1\n' }],
    'POST /repos/acme/demo/issues/42/comments': (req) => { posted.push(req.postDataJSON()); return null; },
  }, extra || {});
  return routes;
}
async function startSignIn(page) {
  await loaded(page);
  await page.waitForSelector('#tk-tile-add', { timeout: 10000 });
  await page.evaluate(() => document.getElementById('tk-tile-add').click());
  await page.waitForSelector('#tk-start', { timeout: 5000 });
  await page.waitForFunction(() => !document.getElementById('tk-start').disabled, null, { timeout: 5000 });
}

await check('P15: on a phone, the sign-in\'s link and code box stand in the foot\'s view under the line, with the run\'s steps below them', async () => {
  const posted = [];
  const { context, page, errors } = await open({ script: real, routes: signInRoutes(posted), path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester, viewport: { width: 390, height: 844 }, mobile: true });
  await startSignIn(page);
  await page.evaluate(() => document.getElementById('tk-start').click());
  await page.waitForSelector('#msg #tk-code', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#msg .msgtask__steps li').length >= 9, null, { timeout: 15000 });
  const where = await page.evaluate(() => {
    const m = document.getElementById('msg').getBoundingClientRect();
    const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
    const steps = document.querySelector('#msg .msgtask__steps').getBoundingClientRect();
    return { msg: { top: Math.round(m.top), bottom: Math.round(m.bottom) }, open: rect('tk-open'), code: rect('tk-code'), stepsTop: Math.round(steps.top), ih: window.innerHeight };
  });
  console.log('      the foot and the sign-in:', JSON.stringify(where));
  for (const id of ['open', 'code']) {
    assert.ok(where[id].top >= where.msg.top && where[id].bottom <= where.msg.bottom + 1, 'the sign-in\'s ' + id + ' is outside the foot\'s view');
    assert.ok(where[id].bottom <= where.ih, 'the sign-in\'s ' + id + ' is below the window');
  }
  assert.ok(where.stepsTop > where.code.bottom, 'the steps stand above the sign-in');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P16: the run a press started is the signed-in person\'s own, waited for while only another person\'s is listed', async () => {
  const routes = runRoutes('success', 2);
  let looks = 0;
  const other = { id: 12, run_number: 12, html_url: 'https://github.com/acme/demo/actions/runs/12', actor: { login: 'someone-else' }, created_at: now, run_started_at: now, status: 'in_progress', event: 'workflow_dispatch' };
  const mine = { id: 13, run_number: 13, html_url: 'https://github.com/acme/demo/actions/runs/13', actor: { login: 'tester' }, created_at: now, run_started_at: now, status: 'in_progress', event: 'workflow_dispatch' };
  routes['GET /repos/acme/demo/actions/workflows/workers.yml/runs'] = (req) => /per_page=1&/.test(req.url()) ? { workflow_runs: [{ id: 10 }] } : { workflow_runs: ++looks <= 2 ? [other] : [mine, other] };
  routes['GET /repos/acme/demo/actions/runs/13/jobs'] = routes['GET /repos/acme/demo/actions/runs/11/jobs'];
  const { context, page, calls, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  await page.click('#cp-run-workers');
  await untilFoot(page, 'Finished: success', 45000);
  const tasks = await footTasks(page);
  const theirs = calls.filter((c) => c.key === 'GET /repos/acme/demo/actions/runs/12/jobs').length;
  console.log('      looks:', looks, '| link:', tasks[0].link, '| reads of the other person\'s run:', theirs);
  assert.equal(tasks[0].link, 'https://github.com/acme/demo/actions/runs/13');
  assert.equal(theirs, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P17: a second Add Token pressed while the first one\'s settings are still being saved opens nothing and says so, and the first sign-in goes on alone', async () => {
  const posted = [];
  let issues = 0;
  const extra = {
    'POST /repos/acme/demo/actions/variables': async () => { await sleep(1500); return { status: 201, body: {} }; },
    'POST /repos/acme/demo/issues': async () => { issues++; await sleep(400); return { number: 42 }; },
  };
  const { context, page, errors } = await open({ script: real, routes: signInRoutes(posted, extra), path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester });
  await startSignIn(page);
  const second = await page.evaluate(() => {
    document.getElementById('tk-start').click();
    document.getElementById('tk-tile-add').click();
    return { open: document.getElementById('tk-dialog').open, foot: document.getElementById('msg').textContent, boxes: document.querySelectorAll('#msg .msgtask').length };
  });
  await page.waitForSelector('#msg #tk-code', { timeout: 20000 });
  const boxes = await page.evaluate(() => document.querySelectorAll('#msg .msgtask').length);
  console.log('      the second press:', JSON.stringify(second), '| issues opened:', issues, '| task boxes:', boxes);
  assert.equal(second.open, false, 'a second dialog opened');
  assert.match(second.foot, /A token is being added already/);
  assert.equal(second.boxes, 1);
  assert.equal(issues, 1);
  assert.equal(boxes, 1);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P18: a Token run GitHub will not list leaves the sign-in to the issue\'s comments and follows no run it did not find', async () => {
  const posted = [];
  let looks = 0;
  const extra = { 'GET /repos/acme/demo/actions/workflows/token.yml/runs': (req) => /per_page=1&/.test(req.url()) ? { workflow_runs: [{ id: 20 }] } : (looks++, { status: 502, body: { message: 'Bad Gateway' } }) };
  const { context, page, calls, errors } = await open({ script: real, routes: signInRoutes(posted, extra), path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester });
  await startSignIn(page);
  await page.evaluate(() => document.getElementById('tk-start').click());
  await page.waitForSelector('#msg #tk-code', { timeout: 15000 });
  for (let i = 0; i < 80 && looks < 3; i++) await sleep(250);
  await sleep(1500);
  const odd = calls.filter((c) => /\/actions\/runs\/(undefined|null|NaN)/.test(c.url)).map((c) => c.key);
  const tasks = await footTasks(page);
  console.log('      looks:', looks, '| reads of no run:', JSON.stringify(odd), '| task:', JSON.stringify(tasks.map((t) => t.state + '/' + t.linkText + '/' + t.line)));
  assert.equal(looks, 3);
  assert.deepEqual(odd, []);
  assert.equal(tasks[0].state, 'live', 'the sign-in ended when the runs list failed');
  assert.equal(tasks[0].linkText, '');
  assert.ok(await page.evaluate(() => !!document.querySelector('#msg #tk-open')), 'the sign-in\'s link went');
  assert.deepEqual(errors, []);
  await context.close();
});



await check('P19: saving a tile\'s settings keeps the Token run\'s marks on it, the lender\'s account id and the organization\'s keeping', async () => {
  const posted = [];
  const written = [];
  const kept = { '1': { id: 'a1b2c3d4', owner: 'tester', uid: 77, keeping: 'organization' } };
  const extra = {
    'GET /repos/acme/demo/actions/secrets': { total_count: 2, secrets: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN' }, { name: 'SYMPHONY_CLAUDE_1' }] },
    'GET /repos/acme/demo/actions/variables/SYMPHONY_CLAUDE_SETTINGS': { name: 'SYMPHONY_CLAUDE_SETTINGS', value: JSON.stringify(kept) },
    'PATCH /repos/acme/demo/actions/variables/SYMPHONY_CLAUDE_SETTINGS': (req) => { written.push(req.postDataJSON()); return null; },
  };
  const { context, page, errors } = await open({ script: real, routes: signInRoutes(posted, extra), path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester });
  await loaded(page);
  await page.waitForSelector('#tk-gear-1', { timeout: 10000 });
  await page.evaluate(() => document.getElementById('tk-gear-1').click());
  await page.waitForSelector('#tk-save', { timeout: 5000 });
  await page.selectOption('#tk-d-effort', { index: 1 });
  await page.evaluate(() => document.getElementById('tk-save').click());
  for (let i = 0; i < 40 && !written.length; i++) await sleep(100);
  const slot = written.length ? JSON.parse(written[0].value)['1'] : null;
  console.log('      written:', JSON.stringify(slot));
  assert.ok(slot, 'the settings were not written');
  assert.equal(slot.uid, 77, 'the lender\'s account id went');
  assert.equal(slot.keeping, 'organization', 'the organization\'s keeping went');
  assert.equal(slot.owner, 'tester');
  assert.equal(slot.id, 'a1b2c3d4');
  assert.deepEqual(errors, []);
  await context.close();
});


// a person who may write to an organization's repository but is not an owner of the organization
// lends their token through the Token run's pool path: the run answers lent for a token already in
// the pool, stored for a new one after its sign-in link, and the task at the foot says which, done, the
// sign-in's code box gone and the issue closed
function poolRoutes(marker, patched) {
  const routes = signInRoutes([], {
    'GET /repos/acme/demo': { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme', type: 'Organization' }, permissions: { admin: false, push: true, pull: true } },
    'GET /orgs/acme/memberships/tester': { role: 'member', state: 'active' },
    'GET /orgs/acme/actions/secrets': { status: 403, body: { message: 'Resource not accessible by integration' } },
    'GET /repos/acme/demo/issues/42/comments': [].concat(marker).map((body) => ({ user: { login: 'github-actions[bot]' }, body })),
    'PATCH /repos/acme/demo/issues/42': (req) => { patched.push(req.postDataJSON()); return {}; },
  });
  return routes;
}
await check('P20: a lend into an organization\'s pool by someone who is not its owner ends done at the foot, saying lent for a token already there and saved for a new one, and closes its issue as completed', async () => {
  const cases = [
    { marker: '<!-- symphony-token: lent -->\n5\n123', want: /You have a token already \(slot 5 of acme's pool\), so it is now lent to acme\/demo too/ },
    { marker: ['<!-- symphony-token: sign-in -->\nhttps://claude.ai/oauth/authorize?code=1\n', '<!-- symphony-token: stored -->\n6'], want: /Your token is saved in slot 6 of acme's pool, marked as yours, and lent to acme\/demo/ },
  ];
  for (const c of cases) {
    const patched = [];
    const { context, page, errors, calls } = await open({ script: real, routes: poolRoutes(c.marker, patched), path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester });
    await startSignIn(page);
    const lead = await page.evaluate(() => document.querySelector('#tk-dialog .admin__lead').textContent);
    assert.match(lead, /next free slot of acme's pool, marked as yours/, 'the pool\'s dialog did not open');
    await page.evaluate(() => document.getElementById('tk-start').click());
    await page.waitForFunction(() => { const b = document.querySelector('#msg .msgtask'); return b && b.getAttribute('data-state') !== 'live'; }, null, { timeout: 20000 });
    for (let i = 0; i < 30 && !patched.length; i++) await sleep(100);
    const box = await page.evaluate(() => { const b = document.querySelector('#msg .msgtask'); return { state: b.getAttribute('data-state'), head: b.querySelector('.msgtask__head').textContent, line: b.querySelector('.msgtask__line').textContent, code: !!document.getElementById('tk-code') }; });
    console.log('      ' + [].concat(c.marker).pop().split('\n')[0] + ':', JSON.stringify(box), '| closed:', JSON.stringify(patched));
    assert.equal(box.state, 'done', 'the lend ended ' + box.state + ': ' + box.line);
    assert.match(box.head, /Add your token to acme's pool on acme\/demo/);
    assert.match(box.line, c.want);
    assert.equal(box.code, false, 'the code box stayed after the lend ended');
    assert.deepEqual(patched, [{ state: 'closed', state_reason: 'completed' }], 'the issue was not closed once, as completed');
    const dispatched = calls.filter((x) => x.key === 'POST /repos/acme/demo/actions/workflows/token.yml/dispatches');
    assert.equal(dispatched.length, 1, 'the Token run was not started once');
    assert.ok(!calls.some((x) => /\/secrets\/public-key$|PUT \/orgs\/acme\/actions\/secrets\//.test(x.key)), 'the page itself read a key or wrote a secret on the pool path');
    assert.deepEqual(errors, []);
    await context.close();
  }
});

// a repository of the organization with no workflow Token of its own (adopted for the protocol alone)
// sends the lend to another repository of the organization that has it, the topic symphony and the
// person's push: the issue, the dispatch with lend_to, the run followed and the issue closed are all
// that repository's, and the task still names the repository shown
await check('P21: a pool lend from a repository with no workflow Token runs in the organization\'s repository that has it, lends to the one shown, and follows and closes everything there', async () => {
  const patched = [];
  const dispatched = [];
  const now2 = new Date().toISOString();
  let looks = 0;
  const routes = poolRoutes('<!-- symphony-token: lent -->\n5\n123', []);
  delete routes['GET /repos/acme/demo/actions/workflows/token.yml'];
  delete routes['POST /repos/acme/demo/issues'];
  delete routes['POST /repos/acme/demo/actions/workflows/token.yml/dispatches'];
  delete routes['GET /repos/acme/demo/actions/workflows/token.yml/runs'];
  delete routes['GET /repos/acme/demo/issues/42/comments'];
  delete routes['PATCH /repos/acme/demo/issues/42'];
  Object.assign(routes, {
    'GET /orgs/acme/repos': [
      { full_name: 'acme/old', archived: true, topics: ['symphony'], permissions: { push: true } },
      { full_name: 'acme/other', archived: false, topics: [], permissions: { push: true } },
      { full_name: 'acme/home', archived: false, topics: ['symphony'], permissions: { push: true } },
    ],
    'GET /repos/acme/home': { full_name: 'acme/home', default_branch: 'trunk', id: 456, owner: { id: 77, login: 'acme', type: 'Organization' }, permissions: { admin: false, push: true, pull: true } },
    'GET /repos/acme/home/actions/workflows/token.yml': { state: 'active' },
    'POST /repos/acme/home/issues': async () => { await sleep(200); return { number: 9 }; },
    'POST /repos/acme/home/actions/workflows/token.yml/dispatches': (req) => { dispatched.push(req.postDataJSON()); return null; },
    // the person's earlier run there is listed alone at the first look, and the new one after it, so
    // the run followed is the one started after the newest the page read before its dispatch
    'GET /repos/acme/home/actions/workflows/token.yml/runs': (req) => {
      const old = { id: 30, run_number: 30, html_url: 'https://github.com/acme/home/actions/runs/30', actor: { login: 'tester' }, created_at: now2, run_started_at: now2, status: 'completed', conclusion: 'success', event: 'workflow_dispatch' };
      if (/per_page=1&/.test(req.url())) return { workflow_runs: [old] };
      looks++;
      return { workflow_runs: looks < 2 ? [old] : [{ id: 31, run_number: 31, html_url: 'https://github.com/acme/home/actions/runs/31', actor: { login: 'tester' }, created_at: now2, run_started_at: now2, status: 'completed', conclusion: 'success', event: 'workflow_dispatch' }, old] };
    },
    'GET /repos/acme/home/actions/runs/31/jobs': { total_count: 0, jobs: [] },
    'GET /repos/acme/home/actions/runs/30/jobs': { total_count: 0, jobs: [] },
    // the run answers once it has been listed, as a real run answers after it starts
    'GET /repos/acme/home/issues/9/comments': () => looks >= 2 ? [{ user: { login: 'github-actions[bot]' }, body: '<!-- symphony-token: lent -->\n5\n123' }] : [],
    'PATCH /repos/acme/home/issues/9': (req) => { patched.push(req.postDataJSON()); return {}; },
  });
  const { context, page, errors, calls } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester });
  await startSignIn(page);
  await page.evaluate(() => document.getElementById('tk-start').click());
  await page.waitForFunction(() => { const b = document.querySelector('#msg .msgtask'); return b && b.getAttribute('data-state') !== 'live'; }, null, { timeout: 20000 });
  for (let i = 0; i < 30 && !patched.length; i++) await sleep(100);
  const box = await page.evaluate(() => { const b = document.querySelector('#msg .msgtask'); return { state: b.getAttribute('data-state'), head: b.querySelector('.msgtask__head').textContent, line: b.querySelector('.msgtask__line').textContent }; });
  console.log('      task:', JSON.stringify(box), '| dispatched:', JSON.stringify(dispatched), '| closed:', JSON.stringify(patched));
  assert.equal(box.state, 'done', 'the lend ended ' + box.state + ': ' + box.line);
  assert.match(box.head, /Add your token to acme's pool on acme\/demo/);
  assert.match(box.head, /Run #31/, 'the run in the repository that has the workflow was not followed');
  assert.match(box.line, /now lent to acme\/demo too/);
  assert.deepEqual(dispatched, [{ ref: 'trunk', inputs: { issue: '9', store: 'pool', lend_to: '123' } }]);
  assert.deepEqual(patched, [{ state: 'closed', state_reason: 'completed' }]);
  assert.ok(!calls.some((x) => /^POST \/repos\/acme\/demo\/(issues|actions)/.test(x.key)), 'something was opened or started in the repository with no workflow');
  assert.deepEqual(errors, []);
  await context.close();
});

// the token side panel's width, set by its grip on a wide window and kept in this browser, never
// squeezes the tiles: under the console's phone rules (900 px wide or 520 px tall) the panel stands
// under the tiles at their width, and on a wide window it takes at most half the row
await check('P22: a token side panel width kept from a wide window leaves the tiles their room on a narrow window, a phone held sideways and a wide one', async () => {
  const extra = { 'GET /repos/acme/demo/actions/secrets': { total_count: 2, secrets: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN' }, { name: 'SYMPHONY_CLAUDE_1' }] } };
  const layouts = [
    { name: 'narrow', viewport: { width: 820, height: 1000 }, mobile: false, column: true },
    { name: 'sideways phone', viewport: { width: 844, height: 390 }, mobile: true, column: true },
    { name: 'wide', viewport: { width: 1280, height: 900 }, mobile: false, column: false },
  ];
  for (const l of layouts) {
    const storage = { local: Object.assign({}, asTester.local, { symphony_panel_layout: JSON.stringify({ tkside: 760 }) }) };
    const { context, page, errors } = await open({ script: real, routes: signInRoutes([], extra), path: '/symphony/control/?repo=acme/demo#tokens', storage, viewport: l.viewport, mobile: l.mobile });
    await loaded(page);
    await page.waitForSelector('#tk-tile-1', { timeout: 10000 });
    await page.evaluate(() => document.getElementById('tk-tile-1').click());
    await page.waitForFunction(() => { const s = document.getElementById('tk-side'); return s && !s.hidden; }, null, { timeout: 5000 });
    const m = await page.evaluate(() => {
      const box = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), bottom: Math.round(r.bottom) }; };
      const wrap = document.getElementById('tk-tiles').parentElement.getBoundingClientRect();
      return { tiles: box('tk-tiles'), side: box('tk-side'), wrap: Math.round(wrap.width) };
    });
    console.log('      ' + l.name + ':', JSON.stringify(m));
    if (l.column) {
      assert.ok(m.side.top >= m.tiles.bottom - 1, l.name + ': the side panel is not under the tiles');
      assert.ok(m.tiles.width >= m.wrap - 2, l.name + ': the tiles do not take the row');
      assert.ok(m.side.width <= m.wrap + 1, l.name + ': the side panel is wider than the row');
    } else {
      assert.ok(m.side.width <= m.wrap / 2 + 1, 'wide: the side panel takes more than half the row');
      assert.ok(m.tiles.width >= m.wrap / 2 - 30, 'wide: the tiles were squeezed');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

// the token tiles take the window's width as it comes: more of them to a row on a larger window, and
// each row filled to its end, so no window leaves a wide empty margin beside them (the owner,
// 2026-10-19: "should scale to the screen size so multiple fit on the page")
await check('P23: the token tiles fill each full row on every window, more of them to a row the wider it is, and never stand as tall squares', async () => {
  const extra = { 'GET /repos/acme/demo/actions/secrets': { total_count: 8, secrets: ['CLAUDE_CODE_OAUTH_TOKEN'].concat([1, 2, 3, 4, 5, 6, 7].map((n) => 'SYMPHONY_CLAUDE_' + n)).map((name) => ({ name })) } };
  const seen = [];
  for (const viewport of [{ width: 1280, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
    const { context, page, errors } = await open({ script: real, routes: signInRoutes([], extra), path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester, viewport });
    await loaded(page);
    await page.waitForSelector('#tk-tile-7', { timeout: 10000 });
    const m = await page.evaluate(() => {
      const box = document.getElementById('tk-tiles'), cs = getComputedStyle(box);
      const cols = cs.gridTemplateColumns.split(' ').map(parseFloat);
      const tiles = Array.from(box.querySelectorAll('.tok')).map((t) => t.getBoundingClientRect());
      // a full row reaches the end of the box; where there are fewer tiles than a row holds, the row's
      // free places are left free, so a single token is never stretched across a whole wide window
      const first = tiles.filter((r) => Math.abs(r.top - tiles[0].top) < 2);
      const right = Math.max.apply(null, first.map((r) => r.right)), inner = box.getBoundingClientRect().right;
      return { columns: cols.length, tiles: tiles.length, width: Math.round(cols[0]), gap: tiles.length >= cols.length ? Math.round(inner - right) : null, square: tiles.some((r) => Math.abs(r.width - r.height) < 2 && r.height > 150) };
    });
    seen.push([viewport.width, m]);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('      tiles by window:', JSON.stringify(seen));
  for (const [w, m] of seen) {
    if (m.gap !== null) assert.ok(m.gap <= 2, w + ': a full row of tiles leaves the end of its row empty: ' + JSON.stringify(m));
    assert.ok(m.width >= 104 && m.width < 2 * 184 + 10, w + ': a tile is ' + m.width + ' px wide');
    assert.equal(m.square, false, w + ': a tile is still a tall square');
  }
  assert.ok(seen[0][1].gap !== null && seen[1][1].gap !== null, 'the nine tiles did not fill a row on a laptop and a large screen');
  assert.ok(seen[0][1].columns < seen[1][1].columns && seen[1][1].columns < seen[2][1].columns, 'a wider window does not hold more tiles to a row');
});

// the organization variable SYMPHONY_LEND_TO, where an owner lists the repositories a token lent
// with no say runs on, is read by the Token run with the App's token, so no repository's workflows
// need it: every write makes it visible to selected repositories with none selected, and a list an
// older page wrote readable by the private repositories is closed when an owner opens the tab,
// its value left as it is; refuseClose answers that close as GitHub answers someone who may read
// the list and not write it
function lendToRoutes(have, writes, refuseClose) {
  const path = '/orgs/acme/actions/variables/SYMPHONY_LEND_TO';
  return signInRoutes([], {
    'GET /repos/acme/demo': { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme', type: 'Organization' }, permissions: { admin: true, push: true, pull: true } },
    'GET /orgs/acme/memberships/tester': { role: 'admin', state: 'active' },
    'GET /orgs/acme/actions/secrets': { total_count: 1, secrets: [{ name: 'SYMPHONY_CLAUDE_1' }] },
    'GET /orgs/acme/actions/variables': { total_count: 0, variables: [] },
    ['GET ' + path]: have || undefined,
    ['PATCH ' + path]: (req) => {
      const body = req.postDataJSON();
      writes.push({ how: 'PATCH', body });
      return refuseClose && !('value' in body) ? { status: 403, body: { message: 'Resource not accessible by integration' } } : null;
    },
    ['DELETE ' + path]: () => { writes.push({ how: 'DELETE' }); return null; },
    'POST /orgs/acme/actions/variables': (req) => { writes.push({ how: 'POST', body: req.postDataJSON() }); return { status: 201, body: {} }; },
    'GET /repositories/11': { id: 11, full_name: 'acme/lent' },
    'GET /repositories/456': { id: 456, full_name: 'acme/home' },
    'GET /repos/acme/home': { full_name: 'acme/home', id: 456, owner: { id: 77, login: 'acme', type: 'Organization' } },
  });
}
async function lendToShown(page) {
  await page.waitForFunction(() => {
    const field = document.querySelector('[aria-label="Repository to add"]');
    const lead = field && field.closest('.toks__note').querySelector('.admin__lead');
    return lead && !/^(Reading|Saving)/.test(lead.textContent);
  }, null, { timeout: 10000 });
}
async function lendToAdd(page, full) {
  await page.evaluate((full) => {
    const field = document.querySelector('[aria-label="Repository to add"]');
    field.value = full;
    field.parentElement.querySelector('button').click();
  }, full);
}
async function lendToTakeOff(page, full) {
  await page.waitForFunction((full) => Array.from(document.querySelectorAll('.toks__note .admin__bar span')).some((s) => s.textContent === full), full, { timeout: 10000 });
  await page.evaluate((full) => {
    const name = Array.from(document.querySelectorAll('.toks__note .admin__bar span')).find((s) => s.textContent === full);
    name.parentElement.querySelector('button').click();
  }, full);
}
await check('P24: the list of repositories a token lent with no say runs on is written readable by no repository, and a list an older page left readable by the private repositories, or by all of them, is closed when an owner opens the tab', async () => {
  const closed = { visibility: 'selected', selected_repository_ids: [] };
  const saved = (value) => ({ how: 'PATCH', body: { name: 'SYMPHONY_LEND_TO', value, visibility: 'selected', selected_repository_ids: [] } });
  const cases = [
    { name: 'left open', have: { name: 'SYMPHONY_LEND_TO', value: '11', visibility: 'private' }, want: [{ how: 'PATCH', body: closed }, saved('11,456')] },
    { name: 'open to all', have: { name: 'SYMPHONY_LEND_TO', value: '11', visibility: 'all' }, want: [{ how: 'PATCH', body: closed }, saved('11,456')] },
    // a close GitHub refuses is let go without a word, and the owner's own save still goes out
    { name: 'close refused', have: { name: 'SYMPHONY_LEND_TO', value: '11', visibility: 'private' }, refuseClose: true, want: [{ how: 'PATCH', body: closed }, saved('11,456')] },
    { name: 'closed', have: { name: 'SYMPHONY_LEND_TO', value: '11', visibility: 'selected' }, want: [saved('11,456')] },
    { name: 'none yet', have: null, want: [{ how: 'POST', body: { name: 'SYMPHONY_LEND_TO', value: '456', visibility: 'selected', selected_repository_ids: [] } }] },
    // the last repository taken off deletes the variable, so no list is left to read at all
    { name: 'emptied', have: { name: 'SYMPHONY_LEND_TO', value: '11', visibility: 'selected' }, takeOff: 'acme/lent', want: [{ how: 'DELETE' }] },
  ];
  for (const c of cases) {
    const writes = [];
    const { context, page, errors } = await open({ script: real, routes: lendToRoutes(c.have, writes, c.refuseClose), path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester });
    await loaded(page);
    await lendToShown(page);
    // the close, where there is one, goes out with the read and is not waited on
    await sleep(500);
    const opened = writes.slice();
    if (c.takeOff) await lendToTakeOff(page, c.takeOff);
    else await lendToAdd(page, 'acme/home');
    for (let i = 0; i < 40 && writes.length < c.want.length; i++) await sleep(100);
    await sleep(300);
    await lendToShown(page);
    const rows = await page.evaluate(() => Array.from(document.querySelector('[aria-label="Repository to add"]').closest('.toks__note').querySelectorAll('.admin__bar span')).map((s) => s.textContent));
    console.log('      ' + c.name + ': on opening', JSON.stringify(opened), '| written', JSON.stringify(writes), '| listed', JSON.stringify(rows));
    assert.deepEqual(writes, c.want, c.name + ': the list was not written as asked');
    assert.deepEqual(opened, c.want.length > 1 ? [c.want[0]] : [], c.name + ': opening the tab wrote what it should not');
    if (c.takeOff) assert.ok(!rows.includes(c.takeOff), c.name + ': the repository taken off is still listed');
    else assert.ok(rows.includes('acme/home'), c.name + ': the repository added is not listed');
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
