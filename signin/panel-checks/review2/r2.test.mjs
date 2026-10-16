// Second adversarial review of the panel's sign-in: each check reproduces one finding.
// A check PASSES when the defect it describes is reproduced (it asserts the bad behaviour).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = '/home/user/openspineconsortium.github.io';
const SERVICE = 'https://signin.example.test';
const now = new Date().toISOString();
const HOUR = 3600000;
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('REPRODUCED ' + name); console.log('REPRODUCED', name); }
  catch (e) { results.push('NOT REPRODUCED ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('NOT REPRODUCED', name, '\n    ', String(e && e.stack || e).split('\n').slice(0, 6).join('\n     ')); }
}
const real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
const configured = real.replace("var SIGNIN_SERVICE = '';", "var SIGNIN_SERVICE = '" + SERVICE + "';").replace("var CLIENT_ID = '';", "var CLIENT_ID = 'Iv1.testclient';");
assert.notEqual(configured, real);

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
const rec = (access, refresh, expiresIn) => JSON.stringify({ access_token: access, refresh_token: refresh, expires_at: Date.now() + expiresIn, refresh_expires_at: Date.now() + 100 * 24 * HOUR });
function singleUse() {
  const spent = new Set();
  let n = 0;
  return (path, body) => {
    if (path !== '/refresh') return null;
    if (spent.has(body.refresh_token)) return { status: 502, body: { error: 'bad_refresh_token', error_description: 'The refresh token passed is incorrect or expired.' } };
    spent.add(body.refresh_token);
    n++;
    return { status: 200, delay: 300, body: { access_token: 'ghu_NEW' + n, token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_NEXT' + n, refresh_token_expires_in: 15897600 } };
  };
}

const ALLERRORS = [];
const browser = await chromium.launch();
async function open(opts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const calls = [];
  const service = [];
  const authorize = [];
  const revoked = new Set(opts.revoked || []);
  const pages = [];
  const routes = opts.routes || repoRoutes('acme/demo');
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    const auth = req.headers()['authorization'] || '';
    let who = -1;
    try { who = pages.indexOf(req.frame().page()); } catch (e) { /* no frame */ }
    calls.push({ key, url: req.url(), auth, page: who, at: Date.now() });
    const headers = { 'Access-Control-Expose-Headers': 'Link' };
    if (opts.abort && opts.abort(key)) return route.abort('internetdisconnected');
    if (revoked.has(auth.replace(/^Bearer /, ''))) return route.fulfill({ status: 401, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Bad credentials' }) });
    let r = routes[key];
    if (typeof r === 'function') r = r(req);
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
    const back = u.searchParams.get('redirect_uri') + '?code=CODE' + authorize.length + '&state=' + encodeURIComponent(u.searchParams.get('state'));
    if (opts.consent && authorize.length === 1) {
      // the first visit shows GitHub's consent page; Authorize is a navigation of its own, as GitHub's form POST is
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<button id="authorize" onclick="location.href=' + JSON.stringify(back).replace(/"/g, '&quot;') + '">Authorize</button>' });
    }
    // an App already authorized: GitHub sends the browser straight back
    return route.fulfill({ status: 302, headers: { Location: back }, body: '' });
  });
  await context.route(SERVICE + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': new URL(BASE).origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const path = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
    service.push({ path, body, at: Date.now() });
    let answer = (opts.serviceFn && await opts.serviceFn(path, body));
    if (!answer) answer = (opts.service && opts.service[path]);
    if (!answer) answer = path === '/revoke' ? { status: 200, body: { revoked: true } } : { status: 200, body: { access_token: path === '/refresh' ? 'ghu_NEW' : 'ghu_TOKEN', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } };
    if (path === '/revoke' && answer.status === 200 && body && body.access_token) revoked.add(body.access_token);
    if (answer.delay) await new Promise((r) => setTimeout(r, answer.delay));
    return route.fulfill({ status: answer.status, contentType: 'application/json', headers: cors, body: JSON.stringify(answer.body) });
  });
  const page = await context.newPage();
  pages.push(page);
  const errors = ALLERRORS;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/symphony/control/');
  await page.evaluate((s) => {
    localStorage.clear(); sessionStorage.clear();
    for (const k in (s.local || {})) localStorage.setItem(k, s.local[k]);
    for (const k in (s.session || {})) sessionStorage.setItem(k, s.session[k]);
  }, opts.storage || {});
  service.length = 0; calls.length = 0;
  if (!opts.noLoad) await page.goto(BASE + (opts.path || '/symphony/control/?repo=acme/demo'));
  async function another() {
    const p = await context.newPage();
    pages.push(p);
    p.on('pageerror', (e) => errors.push(String(e)));
    return p;
  }
  return { context, page, calls, service, authorize, errors, revoked, pages, another };
}
async function facts(page) {
  return page.evaluate(() => ({
    app: !document.getElementById('cp-app').classList.contains('hidden'),
    gate: !document.getElementById('cp-gate').classList.contains('hidden'),
    forgetVisible: !!document.getElementById('cp-signout').checkVisibility(),
    msg: document.getElementById('msg').textContent,
    who: (document.getElementById('cp-who') || {}).textContent,
    local: localStorage.getItem('symphony_panel_oauth'),
    session: sessionStorage.getItem('symphony_panel_oauth'),
    pastedLocal: localStorage.getItem('symphony_panel_token'),
    pastedSession: sessionStorage.getItem('symphony_panel_token'),
    search: location.search,
  }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const signedIn = (p) => p.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 });
const summaryDone = (p) => p.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent), null, { timeout: 10000 });

// F1: "Forget the token" in one tab leaves another tab acting with the forgotten token
await check('F1a: a kept pasted token forgotten in tab 2 keeps working in tab 1', async () => {
  const { context, page, calls, another } = await open({ noLoad: true, storage: { local: { symphony_panel_token: 'github_pat_KEPT', symphony_panel_repos: JSON.stringify(['acme/demo']) } } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await signedIn(page); await summaryDone(page);
  const page2 = await another();
  await page2.goto(BASE + '/symphony/control/?repo=acme/demo');
  await signedIn(page2); await summaryDone(page2);
  await page2.click('#cp-signout');
  const f2 = await facts(page2);
  console.log('      tab 2 after Forget:', JSON.stringify({ gate: f2.gate, msg: f2.msg, local: f2.pastedLocal }));
  assert.equal(f2.pastedLocal, null);
  const before = calls.length;
  await page.click('#cp-refresh');
  await summaryDone(page);
  await sleep(500);
  const after = calls.slice(before).filter((c) => c.page === 0);
  const f1 = await facts(page);
  console.log('      tab 1 calls after the Forget:', after.length, 'auth:', [...new Set(after.map((c) => c.auth))].join(','), '| app shown:', f1.app, '| who:', f1.who);
  assert.ok(after.length > 0 && after.every((c) => c.auth === 'Bearer github_pat_KEPT'), 'tab 1 did not use the forgotten token');
  assert.ok(f1.app && !f1.gate, 'tab 1 went to the gate');
  await context.close();
});

await check('F1b: a kept sign-in forgotten in tab 2, whose revoke failed, keeps working in tab 1', async () => {
  const { context, page, calls, another, service } = await open({ script: configured, noLoad: true, service: { '/revoke': { status: 502, body: { error: 'github_unreachable', error_description: 'GitHub could not be reached; try again' } } }, storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: JSON.stringify(['acme/demo']) } } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await signedIn(page); await summaryDone(page);
  const page2 = await another();
  await page2.goto(BASE + '/symphony/control/?repo=acme/demo');
  await signedIn(page2); await summaryDone(page2);
  await page2.click('#cp-signout');
  await page2.waitForFunction(() => /could not be asked to revoke/.test(document.getElementById('msg').textContent));
  console.log('      tab 2:', (await facts(page2)).msg.slice(0, 120));
  const before = calls.length;
  await page.click('#cp-refresh');
  await summaryDone(page);
  await sleep(500);
  const after = calls.slice(before).filter((c) => c.page === 0);
  const f1 = await facts(page);
  console.log('      tab 1 calls after the Forget:', after.length, 'auth:', [...new Set(after.map((c) => c.auth))].join(','), '| app shown:', f1.app);
  assert.ok(after.length > 0 && after.every((c) => c.auth === 'Bearer ghu_KEPT'));
  assert.ok(f1.app && !f1.gate);
  await context.close();
});

await check('F1c: a kept sign-in forgotten and revoked in tab 2: tab 1 calls GitHub with it anyway and then says the pasted-token words', async () => {
  const { context, page, calls, another } = await open({ script: configured, noLoad: true, storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: JSON.stringify(['acme/demo']) } } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await signedIn(page); await summaryDone(page);
  const page2 = await another();
  await page2.goto(BASE + '/symphony/control/?repo=acme/demo');
  await signedIn(page2); await summaryDone(page2);
  await page2.click('#cp-signout');
  await page2.waitForFunction(() => /revoked at GitHub/.test(document.getElementById('msg').textContent));
  const before = calls.length;
  await page.click('#cp-refresh');
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  await sleep(300);
  const after = calls.slice(before).filter((c) => c.page === 0);
  const f1 = await facts(page);
  console.log('      tab 1 calls:', after.map((c) => c.key + ' ' + c.auth).join(' | '));
  console.log('      tab 1 message:', f1.msg);
  assert.ok(after.length > 0 && after[0].auth === 'Bearer ghu_KEPT', 'no call went out with the forgotten token');
  assert.match(f1.msg, /GitHub refused the token \(401\)\. Paste one that is still valid/);
  await context.close();
});

// F2: an answer of the service that means "not now" is read as a dead refresh token, and the sign-in is dropped
for (const [tag, answer] of [['F2a', { status: 502, body: { error: 'github_refused', error_description: 'GitHub answered 503' } }], ['F2b', { status: 500, body: { error: 'failed' } }]]) {
  await check(tag + ': a renewal answered ' + answer.status + ' ' + answer.body.error + ' drops a sign-in whose refresh token is still good', async () => {
    let calls = 0;
    const { context, page, service } = await open({ script: configured, noLoad: true, serviceFn: (path) => { if (path !== '/refresh') return null; calls++; return calls === 1 ? answer : null; }, storage: { session: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_GOOD', -1000) } } });
    await page.goto(BASE + '/symphony/control/?repo=acme/demo');
    await page.waitForFunction(() => /expired or was revoked/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
    const f = await facts(page);
    console.log('      message:', f.msg, '| session record:', f.session, '| renewals sent:', service.filter((s) => s.path === '/refresh').length);
    assert.equal(f.session, null, 'the record was kept');
    assert.ok(f.gate);
    await context.close();
  });
}

// F3: a failure of the first call that is not a refusal shows the sign-in box, with the token still stored and no Forget
await check('F3a: GitHub answering 500 to /user at load shows the gate, keeps the token, offers no Forget', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = { status: 500, body: { message: 'Server Error' } };
  const { context, page } = await open({ routes, storage: { local: { symphony_panel_token: 'github_pat_KEPT' } } });
  await page.waitForFunction(() => /500/.test(document.getElementById('msg').textContent));
  const f = await facts(page);
  console.log('      ', JSON.stringify({ gate: f.gate, app: f.app, forgetVisible: f.forgetVisible, kept: f.pastedLocal, msg: f.msg }));
  assert.ok(f.gate && !f.app && !f.forgetVisible && f.pastedLocal === 'github_pat_KEPT');
  await context.close();
});
await check('F3b: the sign-in service down when the token is due shows the gate over a stored sign-in, the precise words replaced', async () => {
  const { context, page } = await open({ script: configured, noLoad: true, service: { '/refresh': { status: 502, body: { error: 'github_unreachable', error_description: 'GitHub could not be reached; try again' } } }, storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_K', -1000) } } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await page.waitForSelector('#cp-gate:not(.hidden)');
  await sleep(500);
  const f = await facts(page);
  console.log('      ', JSON.stringify({ gate: f.gate, forgetVisible: f.forgetVisible, kept: !!f.local, msg: f.msg }));
  assert.ok(f.gate && !f.forgetVisible && !!f.local);
  await context.close();
});

// F4: a duplicated tab (its sessionStorage copied) shares the tab-only refresh token, and the second renewal signs it out
await check('F4: two tabs with a copied tab-only sign-in: the second to renew is signed out', async () => {
  const { context, page, service, pages } = await open({ script: configured, noLoad: true, serviceFn: singleUse(), storage: { session: { symphony_panel_oauth: rec('ghu_TAB', 'ghr_T', 2 * HOUR) } } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await signedIn(page); await summaryDone(page);
  const [page2] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.open(location.href); })]);
  pages.push(page2);
  await page2.waitForLoadState();
  await signedIn(page2); await summaryDone(page2);
  const copied = await page2.evaluate(() => sessionStorage.getItem('symphony_panel_oauth'));
  console.log('      the new tab got a copy of the sign-in:', !!copied);
  assert.ok(copied);
  // eight hours pass in both tabs
  for (const p of [page, page2]) await p.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  await page.click('#cp-refresh');
  await summaryDone(page);
  await page2.click('#cp-refresh');
  await page2.waitForFunction(() => /expired or was revoked/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const f1 = await facts(page), f2 = await facts(page2);
  console.log('      tab 1:', f1.app ? 'signed in' : 'gate', '| tab 2:', f2.gate ? 'gate' : 'signed in', '|', f2.msg, '| renewals:', service.filter((s) => s.path === '/refresh').map((s) => s.body.refresh_token).join(','));
  assert.ok(f1.app && f2.gate);
  await context.close();
});

// F5: Back after a sign-in
await check('F5a: Back from a first sign-in (consent shown) lands signed in under the state-differs warning', async () => {
  const { context, page, authorize, service } = await open({ script: configured, consent: true });
  await page.click('#cp-signin');
  await page.waitForSelector('#authorize');
  await page.click('#authorize');
  await signedIn(page); await summaryDone(page);
  await page.goBack();
  await sleep(1500);
  const f = await facts(page);
  console.log('      authorize visits:', authorize.length, '| exchanges:', service.filter((s) => s.path === '/exchange').length, '| app:', f.app, '| message:', JSON.stringify(f.msg), '| address:', page.url());
  assert.ok(f.app, 'not signed in');
  assert.match(f.msg, /did not come back the way it left/);
  await context.close();
});
await check('F5b: Back after a sign-in restores the page that showed the gate, from the back-forward cache', async () => {
  const { context, page } = await open({ script: configured });
  await page.click('#cp-signin');
  await signedIn(page); await summaryDone(page);
  await page.goBack();
  await sleep(1000);
  const f = await facts(page);
  const persisted = await page.evaluate(() => performance.getEntriesByType('navigation')[0].type);
  console.log('      after Back:', JSON.stringify({ gate: f.gate, app: f.app, stored: !!f.session, nav: persisted, url: page.url() }));
  assert.ok(f.gate && !!f.session, 'the page after Back is signed in, or the sign-in is gone');
  await context.close();
});

// F6: the cost page adds its change listener again on each sign-in through the gate
await check('F6: on the cost page, a sign-in through the gate after a refusal doubles the reads of METRICS.json', async () => {
  const routes = repoRoutes('acme/demo');
  Object.assign(routes, repoRoutes('acme/two'));
  let refuse = false;
  routes['GET /repos/acme/demo/contents/METRICS.json'] = (req) => (req.headers()['authorization'] === 'Bearer github_pat_ONE' && refuse ? { status: 401, body: { message: 'Bad credentials' } } : { status: 404, body: { message: 'Not Found' } });
  routes['GET /repos/acme/two/contents/METRICS.json'] = { status: 404, body: { message: 'Not Found' } };
  const { context, page, calls } = await open({ routes, path: '/symphony/cost.html', storage: { local: { symphony_panel_token: 'github_pat_ONE', symphony_panel_repos: JSON.stringify(['acme/demo', 'acme/two']), symphony_panel_repo: 'acme/demo' } } });
  await signedIn(page);
  await page.waitForFunction(() => /no branch metrics yet/.test(document.getElementById('cost-measured').textContent));
  refuse = true;
  // the token is refused mid-session; the person pastes a new one
  await page.selectOption('#cost-repo', 'acme/two');
  await page.selectOption('#cost-repo', 'acme/demo');
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  await page.fill('#cp-token', 'github_pat_TWO');
  await page.click('#cp-open');
  await signedIn(page);
  await sleep(500);
  const before = calls.length;
  await page.selectOption('#cost-repo', 'acme/two');
  await sleep(800);
  const reads = calls.slice(before).filter((c) => c.key === 'GET /repos/acme/two/contents/METRICS.json');
  console.log('      METRICS.json reads for one change:', reads.length);
  assert.ok(reads.length >= 2);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
console.log('page errors over all checks:', JSON.stringify(ALLERRORS));
