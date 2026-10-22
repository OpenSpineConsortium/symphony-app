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
// a stylesheet mutant, for proving a check holds a rule of control.css that no mutant of the script
// reaches (css-mutants/): the same pairs, applied to the stylesheet every page of the check is served
let controlCss = null;
if (process.env.CSS_MUTANT) {
  controlCss = fs.readFileSync(SITE + '/assets/css/control.css', 'utf8');
  for (const [a, b] of JSON.parse(fs.readFileSync(process.env.CSS_MUTANT, 'utf8'))) { assert.ok(controlCss.includes(a), 'mutant text not found: ' + a.slice(0, 60)); controlCss = controlCss.replace(a, b); }
}

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
    if (r && r.status) return route.fulfill({ status: r.status, contentType: 'application/json', headers: Object.assign({}, headers, r.headers || {}), body: JSON.stringify(r.body === undefined ? {} : r.body) });
    if (r && typeof r.raw === 'string') return route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', headers, body: r.raw });
    if (r === null) return route.fulfill({ status: 204, headers, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(r) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: opts.script || real }));
  if (controlCss !== null) await context.route('**/assets/css/control.css*', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: controlCss }));
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

await check('C4: GitHub limiting sign-ins with a 429 sends the code again after a wait, and the sign-in goes through', async () => {
  let asked = 0;
  // the service as deployed before it sent a 429 again itself, then GitHub letting it through
  const serviceFn = (path) => path === '/exchange' && ++asked === 1 ? { status: 502, body: { error: 'github_refused', error_description: 'GitHub answered 429' } } : null;
  const { context, page, service } = await open({ script: configured, serviceFn, path: '/symphony/control/' });
  await pressSigninAndReturn(page);
  await page.waitForFunction(() => /ghu_TOKEN/.test(sessionStorage.getItem('symphony_panel_oauth') || localStorage.getItem('symphony_panel_oauth') || ''), null, { timeout: 15000 });
  const ex = service.filter((s) => s.path === '/exchange');
  assert.equal(ex.length, 2, 'the code was not sent again');
  assert.equal(ex[0].body.code, ex[1].body.code);
  assert.ok(!/limiting/.test(await page.textContent('#msg')), 'a sign-in that went through still says GitHub refused it');
  await context.close();
});

await check('C5: a 429 that lasts is said in plain words after three tries, and a 5xx is not sent again', async () => {
  const lasting = { '/exchange': { status: 502, body: { error: 'github_unreachable', error_description: 'GitHub is limiting sign-ins for the moment (it answered 429); wait a minute and try again' } } };
  const one = await open({ script: configured, service: lasting, path: '/symphony/control/' });
  await pressSigninAndReturn(one.page);
  await one.page.waitForFunction(() => /limiting sign-ins for the moment, so this one did not finish/.test(document.getElementById('msg').textContent), null, { timeout: 20000 });
  const msg = await one.page.textContent('#msg');
  console.log('      message:', msg);
  assert.ok(!/github_unreachable|502/.test(msg), 'the words of the service reached the person');
  assert.equal(one.service.filter((s) => s.path === '/exchange').length, 3);
  const f = await gateFacts(one.page);
  assert.ok(f.wayOpen && f.tokenVisible);
  await one.context.close();
  const down = { '/exchange': { status: 502, body: { error: 'github_unreachable', error_description: 'GitHub answered 503 for the moment; try again' } } };
  const two = await open({ script: configured, service: down, path: '/symphony/control/' });
  await pressSigninAndReturn(two.page);
  await two.page.waitForFunction(() => /answered 503/.test(document.getElementById('msg').textContent));
  await two.page.waitForTimeout(2500);
  assert.equal(two.service.filter((s) => s.path === '/exchange').length, 1, 'a code GitHub may have spent was sent again');
  await two.context.close();
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
  assert.equal(msg, 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access token itself stays valid at GitHub until it runs out or you delete it at https://github.com/settings/personal-access-tokens. The repositories you listed stay.');
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
  assert.match(f.msg, /^The token is forgotten in this tab and on this browser, and the sign-in's token is revoked at GitHub\. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it\. The personal access token itself stays valid at GitHub until it runs out or you delete it at https:\/\/github\.com\/settings\/personal-access-tokens\./);
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
  assert.equal(msg, 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access token itself stays valid at GitHub until it runs out or you delete it at https://github.com/settings/tokens. The repositories you listed stay.');
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
    assert.equal(msg, pasted ? 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access token itself stays valid at GitHub until it runs out or you delete it at https://github.com/settings/personal-access-tokens. The repositories you listed stay.' : FORGET_SIGNIN);
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
    assert.equal(msg, 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access token itself stays valid at GitHub until it runs out or you delete it at https://github.com/settings/personal-access-tokens.');
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
  assert.equal(msg, 'The token is forgotten in this tab and on this browser. Another tab signed in for that tab alone keeps its sign-in until you forget it there or close it. The personal access tokens themselves stay valid at GitHub until they run out or you delete them at https://github.com/settings/tokens and https://github.com/settings/personal-access-tokens. The repositories you listed stay.');
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
const PHONE_TABS = ['command', 'board', 'tasks', 'dependencies', 'explore', 'pulls', 'runs', 'workers', 'agents', 'tokens', 'grid', 'leaders', 'share', 'folders', 'about'];
const scrollYOf = (p) => p.evaluate(() => Math.round(window.scrollY));
// on a phone a tab is opened from the home screen's square buttons, the back button first where a
// tab is open (site branch claude/project-thread-6cxgh2, the owner's ask of 2026-10-20)
async function phoneTab(page, tab) {
  if (await page.locator('#cp-back').isVisible()) await page.click('#cp-back');
  await page.click('.console__rail [data-tab="' + tab + '"]');
}

await check('P6: on a phone every tab fits the window, the saved text size and its buttons are left to the desktop, the note floats just over the window\'s foot, and Refresh leaves the page where it was, which never scrolls', async () => {
  const routes = phoneRoutes();
  const storage = { local: Object.assign({ symphony_panel_layout: JSON.stringify({ zoom: 1.5 }) }, asTester.local) };
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage, viewport: { width: 390, height: 844 }, mobile: true });
  await loaded(page);
  await sleep(500);
  const wide = [];
  for (const tab of PHONE_TABS) {
    await phoneTab(page, tab);
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
  await phoneTab(page, 'tasks');
  await sleep(300);
  // the tab scrolls inside the screen, and the page under it not at all
  await page.evaluate(() => { window.scrollTo(0, 1e6); document.getElementById('tab-tasks').scrollTop = 1e6; });
  await sleep(300);
  const status = await page.evaluate(() => { const st = document.querySelector('.console__status'); const r = st.getBoundingClientRect(); return { pos: getComputedStyle(st).position, top: Math.round(r.top), bottom: Math.round(r.bottom), ih: window.innerHeight, scrollY: Math.round(window.scrollY) }; });
  // the phone's own rules win over the desktop's: a run's card puts its name and its time on the
  // first line and the rest under them, the tiles stand three to a row, and the foot's buttons spread
  await phoneTab(page, 'runs');
  await sleep(300);
  const card = await page.evaluate(() => {
    const tr = document.querySelector('#cp-runs tbody tr');
    const name = tr.querySelector('td.cell--name'), event = tr.querySelector('td.cell--event'), when = tr.querySelector('td.cell--when');
    const cs = getComputedStyle(name);
    return { grow: cs.flexGrow, max: cs.maxWidth, nameTop: Math.round(name.getBoundingClientRect().top), whenTop: Math.round(when.getBoundingClientRect().top), eventTop: Math.round(event.getBoundingClientRect().top), rowWidth: Math.round(tr.getBoundingClientRect().width), tableScroll: tr.parentElement.scrollWidth };
  });
  await phoneTab(page, 'tokens');
  await sleep(300);
  const tiles = await page.evaluate(() => ({ columns: getComputedStyle(document.getElementById('tk-tiles')).gridTemplateColumns.split(' ').length, width: document.getElementById('tk-tiles').clientWidth, me: getComputedStyle(document.querySelector('.console__me')).justifyContent }));
  // the Command tab's readouts and buttons several to a row, as the token tiles are (the owner,
  // 2026-10-19: "should scale to the screen size so multiple fit on the page")
  await phoneTab(page, 'command');
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
  // the deck clips what is wider than it; on a phone it is fixed over the screen and hides it
  assert.ok(['clip', 'hidden'].includes(deck.clip), 'the deck lets a wide tab spill sideways: ' + deck.clip);
  assert.notEqual(deck.zoom, '1.5');
  assert.equal(deck.zoomButtons, false);
  // since 2026-10-20 the message is a note fixed over the screen's foot, 14 px above it, in place of
  // a status line resting on it
  assert.equal(status.pos, 'fixed');
  assert.ok(status.scrollY === 0 && status.bottom <= status.ih && status.bottom >= status.ih - 30, 'the note does not float just over the foot, or the page scrolled: ' + JSON.stringify(status));
  // Refresh on the tab whose chart is drawn afresh, the page asked to scroll, which it cannot
  await phoneTab(page, 'dependencies');
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
  assert.equal(before, 0, 'the page scrolled on a phone');
  // a page that cannot scroll has no place to hold, so the stage is not held
  assert.equal(held, '');
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

await check('P12: on a phone, Refresh on the Dependencies tab keeps the tab at the height of the screen it was given and the chart\'s box held until the chart is drawn again, the page never moving (a phone\'s never scrolls), and a read that fails lets the box go', async () => {
  const { routes, phase } = graphRoutes();
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo#dependencies', storage: asTester, viewport: { width: 390, height: 844 }, mobile: true });
  await loaded(page);
  await graphDrawn(page);
  await page.evaluate(() => window.scrollTo(0, 1e6));
  const before = await restingY(page);
  // the sub-issues take a while, so the box stands empty long enough to be seen held or not
  phase.subDelay = 700;
  // the box's own height and the tab's, which on a phone is the screen's height left under the
  // header and above the foot (since the owner's "I literally never in any case want to scroll" of
  // 2026-10-19 nothing in the tab scrolls, so the tab is given its height and the chart fills it)
  const at = await page.evaluate(() => ({ box: parseFloat(getComputedStyle(document.getElementById('cp-graph')).height), tab: document.getElementById('tab-dependencies').style.height }));
  await page.evaluate(() => {
    const box = document.getElementById('cp-graph'), tab = document.getElementById('tab-dependencies');
    window.__seen = [];
    window.__watch = setInterval(() => window.__seen.push({ min: box.style.minHeight, kids: box.children.length, tab: tab.style.height, tabH: Math.round(tab.getBoundingClientRect().height), state: document.getElementById('cp-graph-state').textContent.slice(0, 30), y: Math.round(window.scrollY) }), 15);
    document.getElementById('cp-refresh').click();
  });
  await loaded(page);
  await graphDrawn(page);
  await sleep(300);
  const seen = await page.evaluate(() => { clearInterval(window.__watch); return window.__seen; });
  const unheld = seen.filter((s) => s.kids === 0 && !s.min);
  const moved = seen.filter((s) => s.y !== before);
  const heldAt = [...new Set(seen.filter((s) => s.kids === 0 && s.min).map((s) => s.min))];
  const tabs = [...new Set(seen.map((s) => s.tab + ' ' + s.tabH))];
  console.log('      before', before, '| the box', at.box, 'held at', JSON.stringify(heldAt), '| the tab', at.tab, 'through Refresh', JSON.stringify(tabs), '| samples', seen.length, '| empty and unheld:', JSON.stringify(unheld.slice(0, 3)), '| moved:', JSON.stringify(moved.slice(0, 3)));
  assert.equal(before, 0, 'the page scrolled on a phone, which it never does');
  assert.ok(seen.some((s) => s.kids === 0), 'the box was never emptied, so nothing was measured');
  assert.deepEqual(unheld, [], 'the empty box lost its hold before the chart was drawn');
  assert.ok(heldAt.length > 0 && heldAt.every((h) => parseFloat(h) >= at.box - 0.5), 'the empty box was held lower than it stood: ' + JSON.stringify([at.box, heldAt]));
  // the tab fills the stage of a console fixed over the screen, by the layout and not by a height
  // of its own, and keeps that height through Refresh
  assert.equal(tabs.length, 1, 'the tab\'s height changed through Refresh');
  assert.equal(tabs[0].split(' ')[0], at.tab);
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

// on a phone the page never scrolls (the owner's home screen of 2026-10-20), so Refresh has no place
// on the page to keep and holds no stage; a computer's page never scrolls either
await check('P13: on a phone, Refresh pressed twice holds no stage, since the page never scrolls, and the page stays at its top', async () => {
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
  const y = await scrollYOf(page);
  console.log('      held at the presses:', JSON.stringify(twice), '| while the issues were on their way:', samples.join(' '), '| at the end:', JSON.stringify(released), '| the page at', y);
  assert.equal(twice, '');
  assert.ok(samples.every((v) => v === '(none)'), 'a refresh held the stage of a page that cannot scroll');
  assert.equal(released, '');
  assert.equal(y, 0, 'the page scrolled on a phone');
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

/* ---------- P32 to P38: the site's bar hiding itself ---------- */
// The owner, 2026-10-19: "when im in the control panel the top nav panel should hide and reappear
// when the mouse is over it, like windows does with its taskbar" (site branch
// claude/panel-resize-autohide). The foot he asked to size that day (P25 to P31, P39, P43, P44 and
// P47) is gone since 2026-10-20: the page's message is a note floating over the screen's foot and
// Claude a floating button at the top right (site, "a floating Claude"), so nothing there sizes.

const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1 : tol);
// a finger dragged from x, y by dy window pixels, through Chromium's touch events, as a phone's screen sends them
async function fingerDrag(page, x, y, dy) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / 10 }] }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await sleep(150);
}
// a run of the Workers workflow with many steps, failed, so its task box shows every step and the
// last lines of its log
function longRunRoutes() {
  const routes = runRoutes('failure', 1);
  const names = ['Set up job', 'Check out', 'Set up Python', 'Read the board', 'Pick the workers', 'Install Claude Code', 'Run the workers', 'Collect the usage', 'Upload the usage', 'Write the summary', 'Post the summary', 'Tidy the claims', 'Post Check out', 'Complete job'];
  routes['GET /repos/acme/demo/actions/runs/11/jobs'] = { total_count: 1, jobs: [{ id: 501, name: 'workers', status: 'completed', conclusion: 'failure', started_at: now, completed_at: new Date(Date.parse(now) + 95000).toISOString(),
    steps: names.map((name, i) => ({ name, status: 'completed', conclusion: i === 6 ? 'failure' : (i > 6 && i < 12 ? 'skipped' : 'success') })) }] };
  return routes;
}
// In the page: the foot, the message box and its task box: how much of the box shows and whether the
// box scrolls inside itself, with Clear's middle pressable
function taskBoxFacts() {
  const st = document.querySelector('.console__status'), msg = document.getElementById('msg'), task = msg.querySelector('.msgtask');
  const s = st.getBoundingClientRect(), m = msg.getBoundingClientRect(), head = task.querySelector('.msgtask__head').getBoundingClientRect();
  const clear = document.getElementById('cp-msg-close').getBoundingClientRect();
  const at = document.elementFromPoint(clear.left + clear.width / 2, clear.top + clear.height / 2);
  msg.scrollTop = msg.scrollHeight;
  const last = Array.from(task.querySelectorAll('.msgtask__steps li, .msgtask__log')).pop().getBoundingClientRect();
  const end = { top: last.top, bottom: last.bottom };
  msg.scrollTop = 0;
  return { foot: s.height, msg: { top: m.top, bottom: m.bottom, height: m.height }, scrolls: msg.scrollHeight > msg.clientHeight + 1, overflow: getComputedStyle(msg).overflowY, headShown: head.top >= m.top - 0.5 && head.top < m.bottom,
    inFoot: m.top >= s.top - 0.5 && m.bottom <= s.bottom + 0.5, endReached: end.bottom <= m.bottom + 1 && end.bottom > m.top, clearHit: !!(at && at.closest('#cp-msg-close')), steps: task.querySelectorAll('.msgtask__steps li').length, log: !task.querySelector('.msgtask__log').hidden };
}

// In the page: whether the site's bar is wanted, where it and its section strip are, the deck, the
// hot strip and the handle, and what holds the focus
function barFacts() {
  const box = (n) => { if (!n || !n.getClientRects().length) return null; const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const nav = document.getElementById('nav'), strip = document.querySelector('.console__barstrip'), handle = document.querySelector('.console__barhandle');
  const focus = document.activeElement;
  // the section strips that show, as one box: on a computer they wait unseen until a tab drops one
  const shownStrips = () => {
    const boxes = Array.from(document.querySelectorAll('#flyouts .subnav')).filter((s) => s.checkVisibility({ opacityProperty: true, visibilityProperty: true })).map((s) => s.getBoundingClientRect());
    return boxes.length ? { top: Math.min.apply(null, boxes.map((b) => b.top)), bottom: Math.max.apply(null, boxes.map((b) => b.bottom)) } : null;
  };
  return { auto: document.body.classList.contains('console-bar-auto'), shown: document.body.classList.contains('console-bar-shown'), full: document.body.classList.contains('console-full'),
    nav: box(nav), navDisplay: getComputedStyle(nav).display, navBg: getComputedStyle(nav).backgroundColor, fly: shownStrips(), flyOpen: !!document.querySelector('#flyouts .is-open'),
    deck: box(document.getElementById('console')), stageTop: document.querySelector('.console__stage').getBoundingClientRect().top, pad: getComputedStyle(document.body).paddingTop,
    strip: strip ? { display: getComputedStyle(strip).display, box: box(strip) } : null, handle: handle ? { display: getComputedStyle(handle).display, box: box(handle), expanded: handle.getAttribute('aria-expanded'), label: handle.getAttribute('aria-label'), controls: handle.getAttribute('aria-controls') } : null,
    menu: !!(document.getElementById('navLinks') && document.getElementById('navLinks').classList.contains('is-open')),
    focusInBar: !!(focus && (nav.contains(focus) || document.getElementById('flyouts').contains(focus))), focus: focus ? (focus.className || focus.tagName) : '',
    ih: innerHeight, iw: innerWidth, sh: document.scrollingElement.scrollHeight, sy: Math.round(scrollY) };
}
const barOf = (p) => p.evaluate(barFacts);
// the bar slid back whole over the deck's top, and slid away wholly above the window with the section
// strip that rides with it on a phone, which slides farther and so is the last to leave the top
// in time, else the words given are the failure
async function barIn(p, what) {
  try { await p.waitForFunction(() => document.body.classList.contains('console-bar-shown') && Math.abs(document.getElementById('nav').getBoundingClientRect().top) < 0.5, null, { timeout: 3000 }); }
  catch (e) { throw new Error(what + ' within 3 s'); }
}
async function barOut(p, what, ms) {
  try {
    await p.waitForFunction(() => !document.body.classList.contains('console-bar-shown') && document.getElementById('nav').getBoundingClientRect().bottom <= 0.5
      && Array.from(document.querySelectorAll('#flyouts .subnav')).every((s) => !s.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || s.getBoundingClientRect().bottom <= 0.5), null, { timeout: ms || 3000 });
  } catch (e) { throw new Error(what + ' within ' + (ms || 3000) / 1000 + ' s'); }
}
// In the page: every control of the console that shows and meets the box given
function consoleControlsUnder(r) {
  return Array.from(document.querySelectorAll('#console button, #console a, #console select, #console input, #console summary, #console [tabindex="0"]'))
    .filter((e) => e.checkVisibility() && e.getClientRects().length)
    .map((e) => [e.id || e.className || e.tagName, e.getBoundingClientRect()])
    .filter(([, b]) => b.width > 0 && b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top)
    .map(([name]) => String(name));
}

await check('P32: on the control page the site\'s bar is hidden from the start, wholly above the window, and the deck takes the whole window from its top, inside the Home Screen app\'s top inset, with nothing of the bar over a control of the deck', async () => {
  const cases = [[{ width: 1280, height: 800 }, false, 0], [{ width: 390, height: 844 }, true, 0], [{ width: 390, height: 844 }, true, 47]];
  for (const [viewport, mobile, inset] of cases) {
    const where = viewport.width + ' x ' + viewport.height + (inset ? ' with a top inset of ' + inset : '');
    const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport, mobile });
    if (inset) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: inset, bottom: 0, left: 0, right: 0 } });
      await page.reload();
    }
    await loaded(page);
    await sleep(700);
    const f = await barOf(page);
    const hot = f.strip && f.strip.box ? f.strip.box : null, handle = f.handle && f.handle.box ? f.handle.box : null;
    const covered = await page.evaluate(consoleControlsUnder, hot || handle || { left: 0, right: 0, top: 0, bottom: 0 });
    // the title's words, where the eye reads them, not its block's whole row
    const title = await page.evaluate(() => { const range = document.createRange(); range.selectNodeContents(document.getElementById('cp-title')); const r = range.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
    console.log('      ' + where + ':', JSON.stringify({ auto: f.auto, shown: f.shown, nav: f.nav && [f.nav.top, f.nav.bottom], fly: f.fly && [f.fly.top, f.fly.bottom], deck: [f.deck.top, f.deck.bottom], pad: f.pad, strip: f.strip, handle: f.handle, covered, title }));
    assert.deepEqual([f.auto, f.shown], [true, false], where + ': the bar is not set to hide, or is shown on load');
    assert.ok(f.nav.bottom <= 0.5, where + ': the bar shows on load, down to ' + f.nav.bottom);
    assert.ok(!f.fly || f.fly.bottom <= 0.5 || f.fly.top >= f.deck.bottom - 0.5, where + ': the section strip stands over the deck on load: ' + JSON.stringify(f.fly));
    assert.ok(near(f.deck.top, inset, 0.5), where + ': the deck starts at ' + f.deck.top + ', not at ' + inset);
    assert.equal(f.pad, inset + 'px', where + ': the page keeps a top padding of ' + f.pad);
    assert.deepEqual(covered, [], where + ': the ' + (hot ? 'hot strip' : 'handle') + ' lies over the deck\'s ' + covered.join(', '));
    if (mobile) {
      assert.equal(f.strip.display, 'none', where + ': a phone shows the hot strip, which no finger reaches');
      assert.ok(handle && f.handle.display === 'block', where + ': no handle on a phone');
      assert.ok(near(handle.top, inset, 0.5) && near(handle.left + handle.width / 2, f.iw / 2, 1), where + ': the handle is not at the top centre: ' + JSON.stringify(handle));
      assert.ok(!(handle.left < title.right && handle.right > title.left && handle.top < title.bottom && handle.bottom > title.top), where + ': the handle lies over the console\'s title');
    } else {
      assert.ok(hot && near(hot.top, 0, 0.5) && hot.height >= 4 && hot.height <= 10 && near(hot.width, f.iw), where + ': no hot strip a few pixels tall along the window\'s top: ' + JSON.stringify(hot));
      assert.equal(f.handle.display, 'none', where + ': a computer shows the touch handle');
      assert.ok(near(f.deck.bottom, f.ih, 0.5) && f.sh <= f.ih, where + ': the deck does not fill the window, or the page scrolls');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await check('P33: the pointer at the window\'s top edge brings the bar back over the deck, which does not move; the bar stays while the pointer is over it, though the focus leaves it, or over a section strip it dropped, goes a moment after the pointer leaves and not at once, comes for a pointer leaving the window across the top, and not for one passing just under the edge', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 1280, height: 800 } });
  await loaded(page);
  await sleep(500);
  await page.mouse.move(640, 400);
  const rest = await barOf(page);
  await page.mouse.move(640, 3, { steps: 12 });
  await barIn(page, 'the pointer at the window\'s top edge did not bring the bar');
  const shown = await barOf(page);
  const alpha = /rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(shown.navBg);
  console.log('      at rest: deck', rest.deck.top, rest.deck.bottom, 'stage', rest.stageTop, '| at the edge: bar', shown.nav.top, shown.nav.bottom, shown.navBg, 'deck', shown.deck.top, shown.deck.bottom, 'stage', shown.stageTop);
  assert.ok(near(shown.deck.top, rest.deck.top, 0.5) && near(shown.deck.bottom, rest.deck.bottom, 0.5) && near(shown.stageTop, rest.stageTop, 0.5), 'the bar pushed the deck down instead of lying over it');
  assert.ok(!alpha || Number(alpha[1]) >= 0.9, 'the bar is see-through over the deck: ' + shown.navBg);
  assert.equal(shown.sh, shown.ih, 'the bar made the page scroll');
  // over the bar, past its wait
  await page.mouse.move(640, 30, { steps: 3 });
  await sleep(1500);
  assert.equal((await barOf(page)).shown, true, 'the bar went while the pointer was over it');
  // the focus passing into the bar and out again while the pointer rests on it: the pointer holds it
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await sleep(1500);
  const rested = await barOf(page);
  assert.equal(rested.focusInBar, false);
  assert.equal(rested.shown, true, 'the bar went when the focus left it, though the pointer rests on it');
  // over a section strip dropped from one of its tabs, past its wait
  const tab = await page.evaluate(() => { const r = document.querySelector('#navLinks a[href="/symphony/"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(tab.x, tab.y, { steps: 4 });
  await page.waitForFunction(() => !!document.querySelector('#flyouts .is-open'), null, { timeout: 3000 });
  const strip = await page.evaluate(() => { const r = document.querySelector('#flyouts .is-open').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
  await page.mouse.move(tab.x, strip.y, { steps: 4 });
  await sleep(1500);
  const inStrip = await barOf(page);
  assert.deepEqual([inStrip.shown, inStrip.flyOpen], [true, true], 'the bar or its section strip went while the pointer was in the strip');
  // the pointer leaves for the deck: still there a moment later, then gone, with its strip
  await page.mouse.move(640, 500, { steps: 4 });
  await sleep(200);
  const moment = await barOf(page);
  await barOut(page, 'the bar did not go after the pointer left it');
  await sleep(100);
  const gone = await barOf(page);
  console.log('      200 ms after leaving:', moment.shown, '| then: shown', gone.shown, 'strip open', gone.flyOpen, 'bar to', gone.nav.bottom);
  assert.equal(moment.shown, true, 'the bar went at once when the pointer left it');
  assert.equal(gone.flyOpen, false, 'the section strip stayed open after the bar went');
  // a pass to just under the edge brings nothing
  await page.mouse.move(640, 300);
  await page.mouse.move(640, 12, { steps: 6 });
  await sleep(500);
  assert.equal((await barOf(page)).shown, false, 'a pointer passing under the edge brought the bar');
  // a pointer that grazes the edge and is back on the deck before the bar has slid in under it
  // lets the bar go after its wait, though it never was over the bar
  await page.mouse.move(640, 3);
  await page.mouse.move(640, 500);
  const grazed = await barOf(page);
  assert.equal(grazed.shown, true, 'a pointer at the top edge did not bring the bar');
  await barOut(page, 'the bar a pointer grazing the top edge brought did not go after the pointer left for the deck', 2000);
  // a pointer leaving the window by its left or right side near the top, as to a second screen or a
  // dock, has not reached the top edge
  for (const [inside, outside] of [[40, -10], [1240, 1290]]) {
    await page.mouse.move(inside, 300);
    await page.mouse.move(inside, 60, { steps: 4 });
    const side = await context.newCDPSession(page);
    await side.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: outside, y: 60 });
    await side.detach();
    await sleep(400);
    assert.equal((await barOf(page)).shown, false, 'a pointer leaving the window by its ' + (outside < 0 ? 'left' : 'right') + ' side at 60 px brought the bar');
  }
  // a pointer leaving the window across its top edge, past the strip between two moves, reached it
  await page.mouse.move(640, 300);
  const cdp = await context.newCDPSession(page);
  for (const y of [120, 40, -10]) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y });
  await sleep(150);
  const out = await barOf(page);
  await barOut(page, 'the bar brought by a pointer leaving across the top did not go');
  console.log('      left across the top:', out.shown);
  assert.equal(out.shown, true, 'a pointer leaving the window across the top did not bring the bar');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P34: keyboard focus brings the bar: Tab from the page\'s start reaches it and shows it, focus leaving it lets it go after its wait, it stays while the focus moves in it, and Escape sends it away at once with the focus', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 1280, height: 800 } });
  await loaded(page);
  await sleep(500);
  // the pointer rests on the deck, so only the focus holds the bar: one resting where the bar slides
  // in would hold it too, as it should
  await page.mouse.move(640, 400);
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('Tab');
  const skip = await barOf(page);
  await page.keyboard.press('Tab');
  await barIn(page, 'Tab reached the bar but did not show it');
  const first = await barOf(page);
  // back out of the bar to the skip link: it goes, though not at once
  await page.keyboard.press('Shift+Tab');
  const moment = await barOf(page);
  await barOut(page, 'the bar did not go after the focus left it');
  const left = await barOf(page);
  console.log('      first Tab:', skip.focus, skip.shown, '| second:', first.focus, first.shown, '| Shift+Tab:', moment.focus, moment.shown, 'then', left.shown);
  assert.deepEqual([skip.focusInBar, skip.shown], [false, false], 'the first Tab, to the skip link, brought the bar');
  assert.ok(first.focusInBar && first.shown, 'Tab reached the bar but did not show it');
  assert.deepEqual([moment.focusInBar, moment.shown], [false, true], 'the bar went at once as the focus left it');
  // in again and on through its links, past its wait: it stays; Escape sends it with the focus
  await page.keyboard.press('Tab');
  await barIn(page, 'Tab into the bar again did not show it');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await sleep(1200);
  const held = await barOf(page);
  await page.keyboard.press('Escape');
  const esc = await barOf(page);
  console.log('      three more Tabs and a wait:', held.focus, held.shown, '| Escape:', esc.shown, esc.focus);
  assert.ok(held.focusInBar && held.shown, 'the bar went while the focus was in it');
  assert.equal(esc.shown, false, 'Escape did not send the bar away');
  assert.equal(esc.focusInBar, false, 'Escape left the focus in the hidden bar');
  await barOut(page, 'Escape did not send the bar away');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P35: on a phone the handle at the top centre shows the bar when tapped or swiped down, a tap outside sends it away at once, a short wait does too, a touch in the bar starts the wait again, and its open menu holds it and closes with it', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 390, height: 844 }, mobile: true });
  await loaded(page);
  await sleep(700);
  const rest = await barOf(page);
  assert.ok(rest.handle, 'the page draws no handle');
  assert.ok(rest.handle.box, 'the handle does not show on a phone');
  const pill = await page.evaluate(() => getComputedStyle(document.querySelector('.console__barhandle'), '::before').backgroundColor);
  console.log('      handle:', JSON.stringify(rest.handle), 'its tab', pill);
  assert.deepEqual([rest.handle.label, rest.handle.controls, rest.handle.expanded], ['Show the site\'s menu', 'nav', 'false']);
  assert.ok(rest.handle.box.width >= 44 && rest.handle.box.height >= 20, 'the handle is too small to tap: ' + JSON.stringify(rest.handle.box));
  assert.equal(pill, 'rgb(241, 238, 227)', 'the handle\'s tab is not in the site\'s colours');
  // outside the bar and anything it drops, its open menu among them: the deck's bare ground at its
  // edge, where a tap presses nothing
  const tapOutside = async () => {
    const at = await page.evaluate(() => {
      const c = document.getElementById('console'), x = c.getBoundingClientRect().left + 4;
      for (let y = Math.round(innerHeight * 0.75); y > 100; y -= 10) {
        const hit = document.elementFromPoint(x, y);
        if (hit && c.contains(hit) && !hit.closest('button, a, input, select, summary, [tabindex], #nav, #flyouts')) return { x, y };
      }
      return null;
    });
    assert.ok(at, 'the deck shows no bare ground to tap');
    await page.touchscreen.tap(at.x, at.y);
  };
  // a tap shows it, a tap outside sends it at once
  await page.tap('.console__barhandle');
  await barIn(page, 'a tap on the handle did not show the bar');
  assert.equal((await barOf(page)).handle.expanded, 'true', 'the handle does not say the bar it controls is shown');
  await tapOutside();
  await sleep(60);
  const outside = await barOf(page);
  assert.deepEqual([outside.shown, outside.handle.expanded], [false, 'false'], 'a tap outside the bar did not send it away at once');
  await barOut(page, 'a tap outside did not send the bar away');
  // a short wait sends it, though not before two seconds
  await page.tap('.console__barhandle');
  await barIn(page, 'a tap on the handle did not show the bar');
  await sleep(2000);
  const two = await barOf(page);
  await barOut(page, 'the bar a tap showed did not go after its wait', 4000);
  assert.equal(two.shown, true, 'the bar went before its wait');
  // a swipe down from the handle shows it
  const h = rest.handle.box;
  await fingerDrag(page, h.left + h.width / 2, h.top + 6, 60);
  await barIn(page, 'a swipe down from the handle did not show the bar');
  await barOut(page, 'the bar a swipe showed did not go after its wait', 6000);
  // a touch in the bar, on its ground, starts the wait again
  await page.tap('.console__barhandle');
  await barIn(page, 'a tap on the handle did not show the bar');
  const ground = await page.evaluate(() => {
    const nav = document.getElementById('nav'), r = nav.getBoundingClientRect();
    for (let x = r.left + 4; x < r.right - 4; x += 6) { const at = document.elementFromPoint(x, r.top + r.height / 2); if (at === nav) return { x, y: r.top + r.height / 2 }; }
    return null;
  });
  assert.ok(ground, 'the bar has no bare ground to touch');
  await sleep(2800);
  await page.touchscreen.tap(ground.x, ground.y);
  await sleep(2400);
  const renewed = await barOf(page);
  console.log('      5.2 s after the tap, 2.4 s after a touch in the bar:', renewed.shown);
  assert.equal(renewed.shown, true, 'a touch in the bar did not start its wait again');
  // the menu opened from the bar holds it past the wait, a touch on the menu's ground starting the
  // wait that the open menu then holds off, and a tap outside closes both
  await page.tap('#navToggle');
  await sleep(300);
  const drawer = await page.evaluate(() => {
    const links = document.getElementById('navLinks'), r = links.getBoundingClientRect();
    for (let y = r.bottom - 4; y > r.top; y -= 4) for (let x = r.left + 4; x < r.right; x += 12) if (document.elementFromPoint(x, y) === links) return { x, y };
    return null;
  });
  assert.ok(drawer, 'the open menu has no bare ground to touch');
  await page.touchscreen.tap(drawer.x, drawer.y);
  await sleep(4600);
  const menu = await barOf(page);
  await tapOutside();
  await barOut(page, 'a tap outside the open menu did not send the bar away');
  const closed = await barOf(page);
  console.log('      the menu open 4.6 s after a touch on its ground:', menu.menu, menu.shown, '| a tap outside:', closed.menu, closed.shown);
  assert.deepEqual([menu.menu, menu.shown], [true, true], 'the open menu did not hold the bar');
  assert.equal(closed.menu, false, 'the menu stayed open after the bar went');
  assert.equal(closed.sy, 0, 'the taps scrolled the page');
  // the menu opened and closed by two taps on its button, which keeps the focus a tap gives it: that
  // focus is no keyboard's and does not hold the bar past its wait
  await page.tap('.console__barhandle');
  await barIn(page, 'a tap on the handle did not show the bar');
  await page.tap('#navToggle');
  await sleep(400);
  await page.tap('#navToggle');
  await sleep(5500);
  const tapped = await barOf(page);
  console.log('      the menu opened and closed by its button, 5.5 s later:', tapped.shown, tapped.menu, 'focus', tapped.focus);
  assert.equal(tapped.menu, false, 'the second tap on the menu\'s button did not close the menu');
  assert.equal(tapped.shown, false, 'the focus a tap left on the menu\'s button held the bar past its wait');
  // a swipe down on the handle shows the bar and never scrolls the page, which on a phone is asked
  // to scroll and cannot
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
  await sleep(300);
  const scrolled = await scrollYOf(page);
  await fingerDrag(page, h.left + h.width / 2, h.top + 6, 60);
  await barIn(page, 'a swipe down from the handle did not show the bar');
  const swiped = await scrollYOf(page);
  console.log('      a swipe on the handle with the page asked to scroll to 300, at', scrolled, ': scrolled to', swiped);
  assert.equal(scrolled, 0, 'the page scrolled on a phone');
  assert.equal(swiped, scrolled, 'the swipe on the handle scrolled the page from ' + scrolled + ' to ' + swiped);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P36: full screen still hides the bar, its hot strip and its handle, the pointer at the top bringing nothing, and leaving it gives back the bar that hides itself', async () => {
  for (const [viewport, mobile] of [[{ width: 1280, height: 800 }, false], [{ width: 390, height: 844 }, true]]) {
    const where = viewport.width + ' x ' + viewport.height;
    const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo', storage: asTester, viewport, mobile });
    await loaded(page);
    // on a phone Full screen is on the home screen, with the repository's name
    await sleep(400);
    await page.click('#cp-full');
    await page.waitForFunction(() => document.body.classList.contains('console-full'), null, { timeout: 3000 });
    await sleep(300);
    if (!mobile) { await page.mouse.move(640, 300); await page.mouse.move(640, 2, { steps: 8 }); await sleep(400); }
    const full = await barOf(page);
    await page.click('#cp-full');
    await page.waitForFunction(() => !document.body.classList.contains('console-full'), null, { timeout: 3000 });
    if (!mobile) await page.mouse.move(640, 400);
    await barOut(page, where + ': the bar did not hide itself after full screen');
    const left = await barOf(page);
    console.log('      ' + where + ': full screen', JSON.stringify({ nav: full.navDisplay, strip: full.strip.display, handle: full.handle.display, deck: [full.deck.top, full.deck.bottom] }), '| left', JSON.stringify({ auto: left.auto, shown: left.shown, strip: left.strip.display, handle: left.handle.display, deck: left.deck.top }));
    assert.deepEqual([full.navDisplay, full.strip.display, full.handle.display], ['none', 'none', 'none'], where + ': something of the bar shows in full screen');
    assert.ok(near(full.deck.top, 0, 0.5), where + ': the deck does not start at the top in full screen');
    assert.deepEqual([left.auto, left.shown], [true, false], where + ': leaving full screen did not give back the hiding bar');
    assert.notEqual(left.navDisplay, 'none', where + ': the bar is still gone after full screen');
    assert.equal(mobile ? left.handle.display : left.strip.display, 'block', where + ': the ' + (mobile ? 'handle' : 'hot strip') + ' did not come back');
    assert.ok(near(left.deck.top, 0, 0.5), where + ': the deck moved after full screen');
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await check('P37: where less motion is asked the bar shows and goes at once, with no slide, and otherwise it slides', async () => {
  for (const motion of ['reduce', 'no-preference']) {
    const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 1280, height: 800 } });
    await page.emulateMedia({ reducedMotion: motion });
    await loaded(page);
    await sleep(400);
    await page.mouse.move(640, 300);
    await page.mouse.move(640, 3, { steps: 4 });
    const at = await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done({ shown: document.body.classList.contains('console-bar-shown'), top: document.getElementById('nav').getBoundingClientRect().top, slide: getComputedStyle(document.getElementById('nav')).transitionDuration })))));
    console.log('      ' + motion + ': two frames after the edge', JSON.stringify(at));
    assert.equal(at.shown, true);
    if (motion === 'reduce') {
      assert.ok(near(at.top, 0, 0.5), 'with less motion asked the bar is still sliding: ' + at.top);
      assert.ok(at.slide.split(', ').every((d) => d === '0s'), 'with less motion asked the bar keeps a transition: ' + at.slide);
    } else {
      assert.ok(at.top < -5, 'the bar did not slide in: it stood at ' + at.top + ' two frames after the edge');
      assert.notEqual(at.slide.split(', ')[0], '0s');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  // a phone, whose section strip rides with the bar
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 390, height: 844 }, mobile: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loaded(page);
  const slides = await page.evaluate(() => [getComputedStyle(document.getElementById('nav')).transitionDuration, getComputedStyle(document.getElementById('flyouts')).transitionDuration]);
  console.log('      a phone with less motion asked:', JSON.stringify(slides));
  assert.ok(slides.every((s) => s.split(', ').every((d) => d === '0s')), 'with less motion asked the phone\'s bar or strip keeps a transition');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P38: every other page of the site keeps its bar where it always was, shown at the top and pushing the page down, with no hot strip and no handle', async () => {
  for (const path of ['/symphony/', '/symphony/cost.html', '/']) {
    for (const [viewport, mobile] of [[{ width: 1280, height: 800 }, false], [{ width: 390, height: 844 }, true]]) {
      const where = path + ' at ' + viewport.width;
      const { context, page, errors } = await open({ script: real, path, storage: asTester, viewport, mobile });
      await page.waitForLoadState('load');
      if (!mobile) await page.mouse.move(viewport.width / 2, 500);
      await sleep(1200);
      const f = await page.evaluate(() => {
        const nav = document.getElementById('nav').getBoundingClientRect();
        return { auto: document.body.classList.contains('console-bar-auto'), top: nav.top, height: nav.height, pad: getComputedStyle(document.body).paddingTop, strip: !!document.querySelector('.console__barstrip'), handle: !!document.querySelector('.console__barhandle') };
      });
      console.log('      ' + where + ':', JSON.stringify(f));
      assert.deepEqual([f.auto, f.strip, f.handle], [false, false, false], where + ': the page hides its bar');
      assert.ok(near(f.top, 0, 0.5) && f.height > 40, where + ': the bar is not at the top');
      assert.ok(parseFloat(f.pad) >= f.height - 0.5, where + ': the page no longer starts under the bar: ' + f.pad);
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
});

// The review of the foot and the bar, 2026-10-19 (the foot's own checks went with the foot): each check below holds what one of its findings
// found wrong, and fails on the branch as it stood before the fix (site 2d22660).

// In the page, from before it first paints: on each frame, where the bar and the deck are and
// whether the panel's script has shown the signed-in panel yet (the foot's grip, which marked it before, went with the foot), and every transition the bar runs
const frameRecorder = () => {
  window.__frames = []; window.__slides = [];
  document.addEventListener('transitionrun', (e) => { if (e.target && e.target.id === 'nav') window.__slides.push(e.propertyName); }, true);
  const look = () => {
    const nav = document.getElementById('nav'), deck = document.getElementById('console');
    if (nav) {
      const n = nav.getBoundingClientRect(), d = deck && deck.getBoundingClientRect();
      window.__frames.push({ t: Math.round(performance.now()), navBottom: n.bottom, deckTop: d ? d.top : null, deckBottom: d ? d.bottom : null, script: !!document.querySelector('#cp-app:not(.hidden)') });
    }
    if (window.__frames.length < 600) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
};

await check('P40: on a fresh load, the panel\'s script slow to come, the bar is above the window from the first frame the page paints and never slides, and the deck starts where it stays and never moves, on a computer and on a phone', async () => {
  for (const [viewport, mobile] of [[{ width: 1280, height: 800 }, false], [{ width: 390, height: 844 }, true]]) {
    const where = viewport.width + ' x ' + viewport.height;
    const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport, mobile, noLoad: true });
    await context.route('**/assets/js/symphony-panel.js*', async (route) => { await sleep(700); await route.fulfill({ status: 200, contentType: 'application/javascript', body: real }); });
    await context.addInitScript(frameRecorder);
    await page.goto(BASE + '/symphony/control/?repo=acme/demo');
    await loaded(page);
    await sleep(800);
    const { frames, slides } = await page.evaluate(() => ({ frames: window.__frames, slides: window.__slides }));
    const last = frames[frames.length - 1], early = frames.filter((f) => !f.script);
    const shown = frames.filter((f) => f.navBottom > 0.5), moved = frames.filter((f) => f.deckTop !== null && (!near(f.deckTop, last.deckTop, 0.5) || (!mobile && !near(f.deckBottom, last.deckBottom, 0.5))));
    console.log('      ' + where + ':', frames.length, 'frames,', early.length, 'before the script; the bar in sight in', shown.length, '; the deck moved in', moved.length, JSON.stringify(moved.slice(0, 2)), '; the bar ran', JSON.stringify(slides));
    assert.ok(early.length >= 3, where + ': no frame was painted before the script came, so the check saw nothing of the load');
    assert.deepEqual(shown.slice(0, 1), [], where + ': the bar is in sight as the page loads');
    assert.deepEqual(slides, [], where + ': the bar ran a transition as the page loaded');
    assert.deepEqual(moved.slice(0, 1), [], where + ': the deck moved as the page loaded');
    assert.ok(near(last.deckTop, 0, 0.5), where + ': the deck starts at ' + last.deckTop);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await check('P41: a drag that is no grip\'s, a text selection run up to the window\'s top or a press moved off a button to the edge, brings no bar while its button is held, nor does a pointer that leaves across the top just after moving with a button held, and the edge brings the bar as ever to a pointer with no button held', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 1280, height: 800 } });
  await loaded(page);
  await page.click('.console__rail [data-tab="about"]');
  await sleep(400);
  // a selection from a paragraph of the About tab run up to the window's top edge and held there
  const p = await page.evaluate(() => { const n = Array.from(document.querySelectorAll('#tab-about p')).find((x) => x.getBoundingClientRect().height > 0 && x.textContent.length > 80); const r = n.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 8 }; });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 300, 3, { steps: 15 });
  await sleep(800);
  const selecting = await barOf(page);
  const chars = await page.evaluate(() => String(getSelection()).length);
  await page.mouse.up();
  await sleep(300);
  // a press on a launch button moved off it to the edge, to take it back
  await page.click('.console__rail [data-tab="command"]');
  await sleep(300);
  const b = await page.evaluate(() => { const r = document.getElementById('cp-run-workers').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.move(b.x, 2, { steps: 12 });
  await sleep(800);
  const pressing = await barOf(page);
  await page.mouse.up();
  await sleep(300);
  console.log('      a selection held at the top edge:', selecting.shown, chars, 'characters | a press moved to the edge:', pressing.shown);
  assert.ok(chars > 0, 'the drag selected nothing, so it was no selection');
  assert.equal(selecting.shown, false, 'a text selection run up to the top edge brought the bar');
  assert.equal(pressing.shown, false, 'a press moved off a button to the top edge brought the bar');
  // as an engine that tells a held drag's leaving the window sends it: a mouseout across the top,
  // no button held, just after a move with one held, is a drag let go out of the window, not a
  // pointer reaching the edge; after a move with none held, the same mouseout brings the bar
  const leave = (held) => page.evaluate((held) => new Promise((done) => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 640, clientY: 40, buttons: held ? 1 : 0, bubbles: true }));
    document.documentElement.dispatchEvent(new MouseEvent('mouseout', { clientX: 640, clientY: 2, buttons: 0, relatedTarget: null, bubbles: true }));
    setTimeout(() => done(document.body.classList.contains('console-bar-shown')), 300);
  }), held);
  await page.mouse.move(640, 400);
  const afterHeld = await leave(true);
  const afterFree = await leave(false);
  console.log('      left across the top after a held move:', afterHeld, '| after a free one:', afterFree);
  assert.equal(afterHeld, false, 'a mouseout across the top just after a move with a button held brought the bar');
  assert.equal(afterFree, true, 'a mouseout across the top after a move with no button held did not bring the bar');
  await page.keyboard.press('Escape');
  await barOut(page, 'Escape did not send the bar away');
  // the edge brings it to a pointer with no button held
  await page.mouse.move(640, 300);
  await page.mouse.move(640, 3, { steps: 8 });
  await barIn(page, 'the pointer at the top edge with no button held did not bring the bar');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P42: a grip pressed while the keyboard\'s focus is in the shown bar sends the bar away with the focus, so nothing of the hidden bar keeps it and Enter follows no link nobody sees, for the side column\'s grip (the foot\'s went with the foot)', async () => {
  for (const [sel, dx, dy] of [['[data-split="side"]', 30, 0]]) {
    const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 1280, height: 800 } });
    await loaded(page);
    await sleep(400);
    await page.mouse.move(640, 400);
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await barIn(page, 'Tab into the bar did not show it');
    const before = await barOf(page);
    const g = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + dx, g.y + dy, { steps: 5 });
    await page.mouse.up();
    await page.mouse.move(640, 400);
    await barOut(page, sel + ': the bar did not go for a press on the grip');
    await sleep(800);
    const after = await barOf(page);
    const url = page.url();
    await page.keyboard.press('Enter');
    await sleep(800);
    console.log('      ' + sel + ': focus before', before.focus, before.focusInBar, '| after the drag', after.focus, after.focusInBar, after.shown, '| Enter:', page.url() === url ? 'stayed' : 'went to ' + page.url());
    assert.equal(before.focusInBar, true, sel + ': Tab did not put the focus in the bar');
    assert.equal(after.focusInBar, false, sel + ': the bar went with the focus left in it, on ' + after.focus);
    assert.equal(page.url(), url, sel + ': Enter after the drag left the panel for ' + page.url());
    assert.deepEqual(errors, []);
    await context.close();
  }
});

// A tablet whose main pointer is a finger, with a mouse beside it, answers (hover: none) and
// (any-hover: hover); Chromium's emulation offers no such screen (a touch screen it emulates answers
// any-hover: none, and its media emulation takes no hover feature), so the script is told the
// any-hover answer such a screen gives, and the stylesheet, which shows the hot strip there under the
// same any-hover, is left as Chromium answers it: the strip is not shown, and the mouse reaches the
// top edge by leaving the window across it
const tabletWithMouse = () => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => (/^\(any-hover: hover\)$/.test(q) ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } : real(q));
};

await check('P45: on a touch-first screen with a mouse too, the mouse leaving the window across the top brings the bar, and the mouse resting on the bar keeps it, past a touch\'s wait too, as on a computer', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 1024, height: 1366 }, mobile: true, initScript: tabletWithMouse });
  await loaded(page);
  await sleep(400);
  const media = await page.evaluate(() => ({ hover: matchMedia('(hover: hover)').matches, any: matchMedia('(any-hover: hover)').matches }));
  assert.deepEqual([media.hover, media.any], [false, true], 'the screen is not one whose main pointer is a finger with a mouse beside it');
  // the strip along the top is drawn by the stylesheet's media query, which the stub above does not
  // reach and which no emulation in Chromium can answer as such a screen does (setEmulatedMedia leaves
  // the hover features alone), so the rule itself is read: the strip shows where any pointer hovers
  const strip = await page.evaluate(() => {
    const found = [];
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules) if (r.media && r.cssRules) for (const inner of r.cssRules) if (inner.selectorText === 'body.console-bar-auto .console__barstrip' && inner.style.display === 'block') found.push(r.media.mediaText);
    }
    return found;
  });
  assert.deepEqual(strip, ['(any-hover: hover)'], 'the strip along the top shows under ' + JSON.stringify(strip) + ', not wherever any pointer hovers');
  const brand = await page.evaluate(() => { const r = document.querySelector('#nav .nav__brand').getBoundingClientRect(); return { x: r.left + r.width / 2, dy: r.top + r.height / 2 - document.getElementById('nav').getBoundingClientRect().top }; });
  // the mouse leaving the window across its top edge, then back on the brand past a touch's wait
  await page.mouse.move(512, 400);
  const cdp = await context.newCDPSession(page);
  for (const y of [120, 40, -10]) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 512, y });
  await barIn(page, 'the mouse leaving the window across the top did not bring the bar');
  await page.mouse.move(brand.x, brand.dy, { steps: 4 });
  await sleep(4800);
  const resting = await barOf(page);
  await page.mouse.move(512, 900, { steps: 4 });
  await barOut(page, 'the bar did not go after the mouse left it');
  // the handle pressed by the mouse, the mouse then resting on the bar past the touch's wait
  const h = (await barOf(page)).handle.box;
  await page.mouse.click(h.left + h.width / 2, h.top + h.height / 2);
  await barIn(page, 'a click on the handle did not show the bar');
  await page.mouse.move(brand.x, brand.dy, { steps: 4 });
  await sleep(4800);
  const past = await barOf(page);
  console.log('      the mouse resting on the bar 4.8 s:', resting.shown, '| after a click on the handle, 4.8 s:', past.shown);
  assert.equal(resting.shown, true, 'the bar went while the mouse rested on it');
  assert.equal(past.shown, true, 'the bar went after a touch\'s wait though the mouse rested on it');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P46: on a phone the handle\'s whole press area is the tab a person sees, in the site\'s colours, so a tap just under it presses what lies under it and shows no bar', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 390, height: 844 }, mobile: true });
  await loaded(page);
  await sleep(500);
  const tab = await page.evaluate(() => {
    const h = document.querySelector('.console__barhandle'), r = h.getBoundingClientRect(), b = getComputedStyle(h, '::before');
    return { box: { left: r.left, top: r.top, width: r.width, height: r.height }, tab: { left: parseFloat(b.left), top: parseFloat(b.top), width: parseFloat(b.width), height: parseFloat(b.height), bg: b.backgroundColor } };
  });
  console.log('      handle', JSON.stringify(tab));
  assert.ok(near(tab.tab.left, 0, 0.5) && near(tab.tab.top, 0, 0.5) && near(tab.tab.width, tab.box.width, 0.5) && near(tab.tab.height, tab.box.height, 0.5), 'the tab a person sees is smaller than the handle\'s press area: ' + JSON.stringify(tab));
  assert.equal(tab.tab.bg, 'rgb(241, 238, 227)', 'the handle\'s tab is not drawn in the site\'s colours');
  // under the handle on a phone lies the console's own top edge, above the back bar: a tap just
  // below the handle's tab lands there and not on the handle
  await page.evaluate(() => { window.__pressed = []; document.addEventListener('click', (e) => window.__pressed.push(String(e.target.closest('button') ? e.target.closest('button').className : e.target.className)), true); });
  const below = { x: tab.box.left + tab.box.width / 2, y: tab.box.top + tab.box.height + 3 };
  const under = await page.evaluate(([x, y]) => { const n = document.elementFromPoint(x, y); const b = n && n.closest('button'); return b ? String(b.className) : n ? String(n.className || n.tagName) : 'nothing'; }, [below.x, below.y]);
  await page.touchscreen.tap(below.x, below.y);
  await sleep(400);
  const f = await barOf(page), pressed = await page.evaluate(() => window.__pressed);
  console.log('      a tap 3 px under the tab, on', under, ': pressed', JSON.stringify(pressed), 'bar', f.shown);
  assert.ok(/(^| )console( |$)/.test(under), 'the console does not lie 3 px under the tab, so the case is not the one meant: ' + under);
  assert.deepEqual(pressed, [under], 'a tap 3 px under the handle\'s tab pressed ' + JSON.stringify(pressed));
  assert.equal(f.shown, false, 'a tap just under the handle\'s tab showed the bar');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('P48: each grip says its part\'s size and the bounds it is held to, and says the new size as the arrow keys change it: the side column\'s and a token\'s panel\'s, which the script draws later (the foot\'s went with the foot)', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 1280, height: 800 } });
  await loaded(page);
  await sleep(300);
  const saidOn = (pg, sel) => pg.evaluate((s) => { const g = document.querySelector(s); return ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map((a) => g.hasAttribute(a) ? Number(g.getAttribute(a)) : null); }, sel);
  const said = (sel) => saidOn(page, sel);
  const side = '[data-split="side"]';
  const width = () => page.evaluate(() => document.querySelector('#console .console__side').offsetWidth);
  // a grip says its size once it takes the focus, as a screen reader meets it (the foot's drag,
  // which made the side column's grip say its size before, went with the foot)
  await page.focus(side);
  const sideAt = await said(side), w0 = await width();
  await page.keyboard.press('ArrowRight');
  const sideKey = await said(side), w1 = await width();
  console.log('      the side column:', w0, JSON.stringify(sideAt), '| ArrowRight', w1, JSON.stringify(sideKey));
  assert.deepEqual(sideAt, [w0, 150, 520], 'the side column\'s grip says ' + JSON.stringify(sideAt) + ' for a column ' + w0 + ' wide');
  assert.deepEqual(sideKey, [w1, 150, 520], 'after ArrowRight the side column\'s grip says ' + JSON.stringify(sideKey) + ' for ' + w1);
  assert.deepEqual(errors, []);
  await context.close();
  // a token's panel, whose grip the script draws when a tile is opened, says its size once focused
  {
    const extra = { 'GET /repos/acme/demo/actions/secrets': { total_count: 2, secrets: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN' }, { name: 'SYMPHONY_CLAUDE_1' }] } };
    const { context, page, errors } = await open({ script: real, routes: signInRoutes([], extra), path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester, viewport: { width: 1280, height: 900 } });
    await loaded(page);
    await page.waitForSelector('#tk-tile-1', { timeout: 10000 });
    await page.evaluate(() => document.getElementById('tk-tile-1').click());
    await page.waitForFunction(() => { const s = document.getElementById('tk-side'); return s && !s.hidden; }, null, { timeout: 5000 });
    await page.focus('[data-split="tkside"]');
    const tk = await saidOn(page, '[data-split="tkside"]'), tw = await page.evaluate(() => document.getElementById('tk-side').offsetWidth);
    console.log('      a token\'s panel, focused:', tw, JSON.stringify(tk));
    assert.deepEqual(tk, [tw, 220, 760], 'the token panel\'s grip says ' + JSON.stringify(tk) + ' for a panel ' + tw + ' wide');
    assert.deepEqual(errors, []);
    await context.close();
  }
});

// Share: the invitation itself, as the person signed in through SymphonyBoard sends it, and each
// refusal named by its cause, since GitHub answers 403 alike to a person who does not administer the
// repository and to an installation that has not accepted Administration
function shareRoutes(admin, installed, put) {
  const routes = repoRoutes('acme/demo');
  routes['GET /repos/acme/demo'] = { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme', type: 'User' }, permissions: { admin, push: true, pull: true } };
  routes['GET /repos/acme/demo/collaborators'] = [{ login: 'acme', role_name: 'admin' }];
  routes['GET /repos/acme/demo/invitations'] = [];
  routes['GET /user/installations'] = { total_count: installed === undefined ? 0 : 1, installations: installed === undefined ? [] : [{ id: 4242, account: { login: 'acme', type: 'User' }, permissions: installed }] };
  routes['PUT /repos/acme/demo/collaborators/newbie'] = put;
  return routes;
}
async function inviteNewbie(routes) {
  const opened = await open({ script: configured, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: rec('ghu_TOKEN', 'ghr_R', 8 * HOUR), symphony_panel_repos: JSON.stringify(['acme/demo']) } } });
  const { page } = opened;
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  await page.click('.console__rail [data-tab="share"]');
  await page.click('#sh-new');
  await page.fill('#sh-who', 'newbie');
  await page.click('#sh-invite');
  await page.waitForFunction(() => /Invited|already has access|refused/.test(document.getElementById('sh-answer').textContent), null, { timeout: 10000 });
  opened.answer = await page.textContent('#sh-answer');
  return opened;
}

await check('S1: an administrator signed in through the App invites by username: one PUT with their token, and the answer says the invitation went out', async () => {
  const { context, calls, answer, errors } = await inviteNewbie(shareRoutes(true, { administration: 'write', metadata: 'read' }, { status: 201, body: { id: 9 } }));
  const puts = calls.filter((c) => c.key === 'PUT /repos/acme/demo/collaborators/newbie');
  assert.equal(puts.length, 1, 'the invitation was sent ' + puts.length + ' times');
  assert.equal(puts[0].auth, 'Bearer ghu_TOKEN');
  assert.match(answer, /^Invited newbie with write access\. They accept at https:\/\/github\.com\/acme\/demo\/invitations/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S2: a refusal where the installation has not accepted Administration names that, with the installation\'s own page to accept it on', async () => {
  const { context, answer, errors } = await inviteNewbie(shareRoutes(true, { contents: 'write', metadata: 'read' }, { status: 403, body: { message: 'Resource not accessible by integration' } }));
  assert.match(answer, /has not accepted the Administration permission yet\. Accept it once at https:\/\/github\.com\/settings\/installations\/4242 \(Review request, then Accept\)\./);
  assert.doesNotMatch(answer, /only an administrator/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S3: a refusal to someone who does not administer the repository says so, and sends them to no installation page', async () => {
  const { context, answer, errors } = await inviteNewbie(shareRoutes(false, { administration: 'write', metadata: 'read' }, { status: 403, body: { message: 'Must have admin rights to Repository.' } }));
  assert.match(answer, /only an administrator of acme\/demo may do it, and you have Write there/);
  assert.doesNotMatch(answer, /installations/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S4: a refusal when both hold passes GitHub\'s own words on, and blames neither the role nor the installation', async () => {
  const { context, answer, errors } = await inviteNewbie(shareRoutes(true, { administration: 'write', metadata: 'read' }, { status: 403, body: { message: 'Organization policy forbids outside collaborators' } }));
  assert.match(answer, /\(403\) although you administer acme\/demo and SymphonyBoard holds Administration there: .*Organization policy forbids outside collaborators/);
  assert.deepEqual(errors, []);
  await context.close();
});

// S5 to S7: withdrawing a waiting invitation (the owner, 2026-10-22: a withdrawn invitation stayed on
// the list, and a second withdraw blamed a missing installation for GitHub's 404). GitHub answers its
// reads with Cache-Control: private, max-age=60, so the list read after a change must ask GitHub
// again; and a 404 on an invitation means it is no longer waiting, which is said as such. Playwright
// turns the browser's cache off while it routes requests, so S5 reads the cache mode each fetch of the
// Share tab's lists asked for, as the page handed it to fetch, in place of a stale answer it cannot get.
const CACHED = { 'Cache-Control': 'private, max-age=60, s-maxage=60', 'ETag': 'W/"inv1"', 'Vary': 'Accept, Authorization' };
const waitingInvite = { id: 338318854, invitee: { login: 'newbie' }, inviter: { login: 'acme' }, permissions: 'write', created_at: now };
function withdrawRoutes(answer, collaborators, stays) {
  const routes = shareRoutes(true, { administration: 'write', metadata: 'read' }, null);
  let withdrawn = false;
  routes['GET /repos/acme/demo/invitations'] = () => ({ status: 200, headers: CACHED, body: withdrawn ? [] : [waitingInvite] });
  routes['GET /repos/acme/demo/collaborators'] = () => ({ status: 200, headers: CACHED, body: withdrawn ? collaborators : [{ login: 'acme', role_name: 'admin' }] });
  routes['DELETE /repos/acme/demo/invitations/338318854'] = () => { withdrawn = !stays; return answer; };
  return routes;
}
const recordCacheModes = () => {
  window.__cacheModes = [];
  const real = window.fetch;
  window.fetch = function (input, init) {
    const url = String(input && input.url || input);
    if (/\/repos\/acme\/demo\/(invitations|collaborators)\?/.test(url)) window.__cacheModes.push(url.replace(/\?.*/, '').replace(/.*\//, '') + ':' + ((init && init.cache) || 'default'));
    return real.apply(this, arguments);
  };
};
async function withdrawNewbie(routes, stays) {
  const opened = await open({ script: configured, routes, initScript: recordCacheModes, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: rec('ghu_TOKEN', 'ghr_R', 8 * HOUR), symphony_panel_repos: JSON.stringify(['acme/demo']) } } });
  const { page } = opened;
  page.on('dialog', (d) => d.accept());
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
  await page.click('.console__rail [data-tab="share"]');
  await page.waitForSelector('#sh-people tr.share__pending .card__x', { timeout: 10000 });
  await page.click('#sh-people tr.share__pending .card__x');
  await untilFoot(page, 'withdrawn|no longer waiting|refused|answered 404', 10000);
  if (!stays) await page.waitForFunction(() => !document.querySelector('#sh-people tr.share__pending') && /no invitation waiting/.test(document.getElementById('sh-state').textContent), null, { timeout: 10000 });
  opened.rowStays = !!(await page.$('#sh-people tr.share__pending'));
  opened.note = await page.textContent('#msg');
  opened.modes = await page.evaluate(() => window.__cacheModes);
  return opened;
}

await check('S5: a withdrawn invitation leaves the list at once: one DELETE, the list read again from GitHub and not the browser\'s copy', async () => {
  const { context, calls, note, modes, errors } = await withdrawNewbie(withdrawRoutes(null, [{ login: 'acme', role_name: 'admin' }]));
  assert.ok(modes.includes('invitations:no-cache') && modes.includes('collaborators:no-cache'), 'the lists were read as ' + JSON.stringify(modes));
  assert.ok(!modes.some((m) => !/:no-cache$/.test(m)), 'a list was read from the browser\'s copy: ' + JSON.stringify(modes));
  assert.equal(calls.filter((c) => c.key === 'DELETE /repos/acme/demo/invitations/338318854').length, 1);
  assert.ok(calls.filter((c) => c.key === 'GET /repos/acme/demo/invitations').length >= 2, 'the invitations were not read again after the withdraw');
  assert.match(note, /The invitation of newbie is withdrawn\./);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S6: a withdraw GitHub answers 404 because they accepted says so, blames no installation, and the row goes', async () => {
  const { context, note, modes, errors } = await withdrawNewbie(withdrawRoutes({ status: 404, body: { message: 'Not Found' } }, [{ login: 'acme', role_name: 'admin' }, { login: 'newbie', role_name: 'write' }]));
  assert.match(note, /The invitation of newbie is no longer waiting: newbie accepted it and has access to acme\/demo\./);
  assert.ok(!modes.some((m) => !/:no-cache$/.test(m)), 'a list was read from the browser\'s copy: ' + JSON.stringify(modes));
  assert.doesNotMatch(note, /not installed|installations\/new|refused/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S7: a withdraw GitHub answers 404 for an invitation gone otherwise says it was withdrawn already or declined', async () => {
  const { context, note, modes, errors } = await withdrawNewbie(withdrawRoutes({ status: 404, body: { message: 'Not Found' } }, [{ login: 'acme', role_name: 'admin' }]));
  assert.match(note, /The invitation of newbie is no longer waiting, and newbie has no access by name: it was withdrawn already or declined, or taken and the access since removed\./);
  assert.ok(!modes.some((m) => !/:no-cache$/.test(m)), 'a list was read from the browser\'s copy: ' + JSON.stringify(modes));
  assert.doesNotMatch(note, /not installed|installations\/new|refused/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S8: a withdraw GitHub answers 404 while the invitation is still listed is not called gone: the row stays and the note says GitHub answered 404, blaming no installation', async () => {
  const { context, note, rowStays, errors } = await withdrawNewbie(withdrawRoutes({ status: 404, body: { message: 'Not Found' } }, [{ login: 'acme', role_name: 'admin' }], true), true);
  assert.ok(rowStays, 'the invitation\'s row went although GitHub still lists it');
  assert.doesNotMatch(note, /no longer waiting|is withdrawn/);
  assert.match(note, /GitHub answered 404 to withdrawing the invitation, although you administer acme\/demo/);
  assert.doesNotMatch(note, /not installed|installations\/new/);
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---------- T1 to T5: the note over the screen's foot ---------- */
// Since 2026-10-20 the page's message is a note floating over the screen's foot, nothing at all
// while it is empty, and Claude a floating button at the top right (site, "a floating Claude"). The
// review of that change asked for each of these: a plain note goes by itself and a warning stays;
// Clear hides a task under way without ending it and gives the focus back; the empty note stays
// rendered, so the live region announces what is said next; and no tab's last row lies under it.
const noteFast = real.replace('var NOTE_MS = 8000;', 'var NOTE_MS = 1500;');
const tokenSideRoutes = (more) => signInRoutes([], Object.assign({ 'GET /repos/acme/demo/actions/secrets': { total_count: 2, secrets: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN' }, { name: 'SYMPHONY_CLAUDE_1' }] } }, more || {}));

await check('T1: a plain note goes by itself after a while, a warning stays until Clear', async () => {
  assert.notEqual(noteFast, real, 'the note\'s time was not found in the script');
  let refuse = false;
  const routes = tokenSideRoutes({ 'POST /repos/acme/demo/actions/workflows/pool.yml/dispatches': () => refuse ? { status: 404, body: { message: 'Not Found' } } : null });
  const { context, page, errors } = await open({ script: noteFast, routes, path: '/symphony/control/?repo=acme/demo#tokens', storage: asTester, viewport: { width: 1280, height: 900 } });
  await loaded(page);
  await page.waitForSelector('#tk-tile-1', { timeout: 10000 });
  await page.evaluate(() => document.getElementById('tk-tile-1').click());
  await page.waitForSelector('#tk-probe', { timeout: 5000 });
  await page.evaluate(() => document.getElementById('tk-probe').click());
  await untilFoot(page, 'Reading every token', 5000);
  await sleep(2600);
  const plain = await footText(page);
  refuse = true;
  await page.evaluate(() => document.getElementById('tk-probe').click());
  await untilFoot(page, 'no workflow Pool yet', 5000);
  await sleep(2600);
  const warned = await page.evaluate(() => ({ text: document.getElementById('msg').textContent, warn: document.getElementById('msg').classList.contains('admin__warn') }));
  await page.click('#cp-msg-close');
  const cleared = await footText(page);
  console.log('      the plain note after its time:', JSON.stringify(plain), '| the warning:', JSON.stringify(warned).slice(0, 120), '| after Clear:', JSON.stringify(cleared));
  assert.equal(plain, '', 'the plain note stayed past its time');
  assert.ok(warned.warn && /no workflow Pool yet/.test(warned.text), 'the warning went by itself: ' + JSON.stringify(warned));
  assert.equal(cleared, '', 'Clear left the warning');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('T2: Clear hides a task under way without ending it: its run is still followed, and nothing is started again (P5 holds that the Sign-in waiting tile shows a hidden sign-in again)', async () => {
  const routes = runRoutes('success', 1000);
  let dispatched = 0, reads = 0;
  routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = () => { dispatched++; return null; };
  const jobs = routes['GET /repos/acme/demo/actions/runs/11/jobs'];
  routes['GET /repos/acme/demo/actions/runs/11/jobs'] = (req) => { reads++; return jobs(req); };
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  await page.click('#cp-run-workers');
  await untilFoot(page, 'Queued on main', 5000);
  await page.waitForFunction(() => document.querySelector('#msg .msgtask[data-state="live"]'), null, { timeout: 15000 });
  await page.click('#cp-msg-close');
  const after = await footText(page), at = reads;
  const start = Date.now();
  while (reads === at && Date.now() - start < 30000) await sleep(250);
  const goneOn = reads > at;
  console.log('      after Clear:', JSON.stringify(after), '| reads went on:', goneOn, reads - at, '| dispatches:', dispatched);
  assert.equal(after, '', 'Clear left the note');
  assert.ok(goneOn, 'the task\'s run was read no more once Clear hid it');
  assert.equal(dispatched, 1, 'Clear started the workers again');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('T3: Clear gives the focus back where it was before it went into the note, never leaving it on the emptied note', async () => {
  const routes = runRoutes('success', 3);
  routes['POST /repos/acme/demo/actions/workflows/board.yml/dispatches'] = { status: 403, body: { message: 'Resource not accessible by personal access token' } };
  const { context, page, errors } = await open({ script: real, routes, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  await page.click('#cp-run-board');
  await untilFoot(page, 'Starting a workflow needs Actions', 5000);
  await page.focus('#cp-msg-close');
  await page.keyboard.press('Enter');
  await sleep(300);
  const f = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, msg: document.getElementById('msg').textContent }));
  console.log('      after Clear by the keyboard:', JSON.stringify(f));
  assert.equal(f.msg, '', 'Clear left the note');
  assert.equal(f.focus, 'cp-run-board', 'the focus did not go back to the button that spoke: ' + f.focus);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('T4: the empty note stays rendered, unseen and taking no press, so the live region announces what is said next, and shows once something is said', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo', storage: asTester });
  await loaded(page);
  await page.evaluate(() => { const m = document.getElementById('msg'); while (m.firstChild) m.removeChild(m.firstChild); });
  await sleep(400);
  const look = () => page.evaluate(() => { const st = document.querySelector('.console__status'), c = getComputedStyle(st), m = document.getElementById('msg'); return { display: c.display, visibility: c.visibility, opacity: c.opacity, events: c.pointerEvents, live: m.getAttribute('aria-live'), role: m.getAttribute('role'), mdisplay: getComputedStyle(m).display }; });
  const empty = await look();
  await page.evaluate(() => { document.getElementById('msg').textContent = 'Saved.'; });
  await sleep(400);
  const said = await look();
  console.log('      empty:', JSON.stringify(empty), '| said:', JSON.stringify(said));
  assert.ok(empty.display !== 'none' && empty.mdisplay !== 'none' && empty.visibility !== 'hidden', 'the empty note is not rendered, so a live region would miss what is said next: ' + JSON.stringify(empty));
  assert.deepEqual([empty.opacity, empty.events, empty.live, empty.role], ['0', 'none', 'polite', 'status']);
  assert.deepEqual([said.opacity, said.events], ['1', 'auto'], 'a note said does not show: ' + JSON.stringify(said));
  assert.deepEqual(errors, []);
  await context.close();
});

// a note of several lines, a warning so it stays
const sayLong = (page) => page.evaluate(() => {
  const m = document.getElementById('msg');
  m.textContent = '';
  const p = document.createElement('p');
  p.className = 'msg__note';
  p.textContent = 'A long note over the screen\'s foot. '.repeat(16);
  m.appendChild(p);
  m.className = 'admin__box admin__warn';
});
// In the page: the shown tab's scrolling box run to its end, its last thing that shows, and the note
function lastRow() {
  const panel = Array.from(document.querySelectorAll('[data-tab-panel]')).find((p) => !p.hidden);
  const scrollers = [panel].concat(Array.from(panel.querySelectorAll('*'))).filter((n) => n.scrollHeight > n.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(n).overflowY));
  scrollers.forEach((n) => { n.scrollTop = n.scrollHeight; });
  const shown = Array.from(panel.querySelectorAll('p, li, tr, button, summary, h3')).filter((n) => n.checkVisibility() && n.getClientRects().length);
  const last = shown.reduce((a, n) => (!a || n.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? n : a), null);
  const note = document.querySelector('.console__status').getBoundingClientRect();
  return { tab: panel.id, scrollers: scrollers.length, last: last ? Math.round(last.getBoundingClientRect().bottom) : null, note: Math.round(note.top), noteH: Math.round(note.height), ih: innerHeight };
}
await check('T5: a long note never lies over a tab\'s last row: the tab gives up the note\'s height at its foot, on a laptop, a short window and a phone', async () => {
  const seen = {};
  for (const [viewport, mobile] of [[{ width: 1280, height: 800 }, false], [{ width: 900, height: 500 }, false], [{ width: 390, height: 844 }, true]]) {
    const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#about', storage: asTester, viewport, mobile });
    await loaded(page);
    if (await page.isVisible('#rail-about')) await page.click('#rail-about');
    await sleep(400);
    await sayLong(page);
    await sleep(500);
    const f = await page.evaluate(lastRow);
    const what = viewport.width + ' x ' + viewport.height;
    seen[what] = f;
    assert.ok(f.noteH > 60 && f.scrollers > 0 && f.last !== null, what + ': the note is not long or the tab does not scroll, so this says nothing: ' + JSON.stringify(f));
    assert.ok(f.last <= f.note + 1, what + ': the tab\'s last row ends at ' + f.last + ', under the note from ' + f.note);
    assert.deepEqual(errors, [], what);
    await context.close();
  }
  console.log('      ' + JSON.stringify(seen));
});

// T6: since the foot went, the side column's grip is the one a finger meets on a touch screen (a
// tablet held upright is wide enough for the side column; a phone folds it), so its touch-action is
// what keeps the browser from taking the finger's drag for a pan
await check('T6: on a tablet, a finger dragging the side column\'s grip widens the column with it rather than the browser panning the page', async () => {
  const { context, page, errors } = await open({ script: real, path: '/symphony/control/?repo=acme/demo#command', storage: asTester, viewport: { width: 1024, height: 1366 }, mobile: true });
  await loaded(page);
  await sleep(400);
  const widthOf = () => page.evaluate(() => document.querySelector('#console .console__side').getBoundingClientRect().width);
  const g = await page.evaluate(() => { const r = document.querySelector('[data-split="side"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 200), shown: r.width > 0 && r.height > 0 }; });
  assert.equal(g.shown, true, 'the side column\'s grip is not shown on a tablet held upright');
  const before = await widthOf();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x, y: g.y }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.x + 6 * i, y: g.y }] }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await sleep(300);
  const after = await widthOf();
  console.log('      the side column before', before, '| after a 60px finger drag', after);
  assert.ok(after - before > 40, 'a finger dragging the side grip 60px moved the column by ' + (after - before) + 'px');
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
