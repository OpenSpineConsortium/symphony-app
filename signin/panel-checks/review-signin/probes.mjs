// Adversarial probes of the sign-in-first change. Each probe prints what it saw; "DEFECT" marks a
// behaviour that contradicts what the page says or promises.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = '/home/user/openspineconsortium.github.io';
const SERVICE = 'https://signin.example.test';
const real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
const configured = real.replace("var SIGNIN_SERVICE = '';", "var SIGNIN_SERVICE = '" + SERVICE + "';").replace("var CLIENT_ID = '';", "var CLIENT_ID = 'Iv1.testclient';");
if (configured === real) throw new Error('constants not found');
const now = new Date().toISOString();
const only = process.argv[2] || '';

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
async function makeContext(opts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const log = { calls: [], service: [], authorize: [] };
  const routes = opts.routes || repoRoutes('acme/demo');
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    const auth = req.headers()['authorization'] || '';
    log.calls.push({ key, url: req.url(), auth });
    const headers = { 'Access-Control-Expose-Headers': 'Link' };
    if (opts.validToken && !opts.validToken(auth)) return route.fulfill({ status: 401, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Bad credentials' }) });
    let r = routes[key];
    if (typeof r === 'function') r = r(req);
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) });
    if (r && r.status) return route.fulfill({ status: r.status, contentType: 'application/json', headers, body: JSON.stringify(r.body || {}) });
    if (r && typeof r.raw === 'string') return route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', headers, body: r.raw });
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(r) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: opts.script || real }));
  await context.route('https://github.com/login/oauth/**', (route) => {
    const u = new URL(route.request().url());
    log.authorize.push(u);
    const back = u.searchParams.get('redirect_uri') + '?code=CODE1&state=' + encodeURIComponent(u.searchParams.get('state'));
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify(back) + ')</script>' });
  });
  await context.route(SERVICE + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': new URL(BASE).origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const path = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
    log.service.push({ path, body });
    const answer = opts.serviceFn ? await opts.serviceFn(path, body) : { status: 200, body: { access_token: 'ghu_TOKEN', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } };
    return route.fulfill({ status: answer.status, contentType: 'application/json', headers: cors, body: JSON.stringify(answer.body) });
  });
  return { context, log };
}
async function seed(context, storage) {
  const p = await context.newPage();
  await p.goto(BASE + '/robots.txt').catch(() => {});
  await p.goto(BASE + '/symphony/');
  await p.evaluate((s) => {
    localStorage.clear(); sessionStorage.clear();
    for (const k in (s.local || {})) localStorage.setItem(k, s.local[k]);
  }, storage || {});
  await p.close();
}
async function openPage(context, path, session, script) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (session) {
    // put this tab's sessionStorage in place before the page's script runs
    await page.addInitScript((s) => {
      if (!window.name) {
        window.name = 'seeded';
        for (const k in s) sessionStorage.setItem(k, s[k]);
      }
    }, session);
  }
  await page.goto(BASE + path);
  page._errors = errors;
  return page;
}
const msg = (page) => page.textContent('#msg');
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!(e && e.checkVisibility()); }, sel);
function header(t) { if (!only || t.startsWith(only)) { console.log('\n=== ' + t); return true; } return false; }

// P1: a sign-in token GitHub refuses on load: the message names a button the page hides
if (header('P1 401 at load with the App token')) {
  const routes = repoRoutes('acme/demo');
  const { context } = await makeContext({ script: configured, routes, validToken: (a) => a !== 'Bearer ghu_DEAD' });
  await seed(context, {});
  const record = JSON.stringify({ access_token: 'ghu_DEAD', refresh_token: 'ghr_R', expires_at: Date.now() + 3 * 3600e3, refresh_expires_at: Date.now() + 90 * 86400e3 });
  const page = await openPage(context, '/symphony/control/?repo=acme/demo', { symphony_panel_oauth: record });
  await page.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  console.log('  msg:', await msg(page));
  console.log('  Forget the token visible:', await visible(page, '#cp-signout'), '| gate visible:', await visible(page, '#cp-gate'), '| token box open:', await page.evaluate(() => document.getElementById('cp-token-way').open));
  const cost = await openPage(context, '/symphony/cost.html', { symphony_panel_oauth: record });
  await cost.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  console.log('  cost msg:', await msg(cost));
  console.log('  cost Forget the token visible:', await visible(cost, '#cp-signout'));
  await context.close();
}

// P2: two tabs on one kept sign-in; one renews, the other keeps the dead token in memory
if (header('P2 two tabs, one renewal')) {
  let live = 'ghu_T1';
  const revoked = [];
  let refreshes = 0;
  const { context, log } = await makeContext({
    script: configured,
    validToken: (a) => a === 'Bearer ' + live,
    serviceFn: async (path, body) => {
      if (path === '/refresh') {
        refreshes++;
        if (body.refresh_token !== 'ghr_F1' || refreshes > 1) return { status: 502, body: { error: 'bad_refresh_token', error_description: 'The refresh token passed is incorrect or expired.' } };
        live = 'ghu_T2';  // GitHub: the old access token stops working once its refresh token is used
        return { status: 200, body: { access_token: 'ghu_T2', expires_in: 28800, refresh_token: 'ghr_F2', refresh_token_expires_in: 15897600 } };
      }
      if (path === '/revoke') { revoked.push(body.access_token); if (body.access_token === live) live = 'nothing'; return { status: 200, body: { revoked: true } }; }
      return { status: 400, body: { error: 'bad_request' } };
    },
  });
  // the record expires in 2 minutes, so neither tab renews at load
  const record = JSON.stringify({ access_token: 'ghu_T1', refresh_token: 'ghr_F1', expires_at: Date.now() + 120e3, refresh_expires_at: Date.now() + 90 * 86400e3 });
  await seed(context, { local: { symphony_panel_oauth: record } });
  const a = await openPage(context, '/symphony/control/?repo=acme/demo');
  const b = await openPage(context, '/symphony/cost.html');
  await a.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  await b.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  // time passes: both tabs are now past the token's expiry
  for (const p of [a, b]) await p.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 5 * 60e3; });
  await a.click('#cp-refresh');
  await a.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent), null, { timeout: 8000 });
  console.log('  tab A renewed:', refreshes, 'refresh call(s); stored token now', JSON.parse(await a.evaluate(() => localStorage.getItem('symphony_panel_oauth'))).access_token);
  // tab B (the cost page) changes repository select -> a call with its in-memory token
  await b.evaluate(() => { const s = document.getElementById('cost-repo'); s.dispatchEvent(new Event('change')); });
  await b.waitForTimeout(1500);
  const bAuth = log.calls.filter((c) => c.key.startsWith('GET /repos/acme/demo')).slice(-1)[0];
  console.log('  tab B last call sent:', bAuth && bAuth.auth, '| tab B box:', (await b.textContent('#cost-measured')).slice(0, 200));
  // and the control page in a third tab opened from the old state? use tab A's message path instead: tab B is the panel too
  const c = await openPage(context, '/symphony/control/?repo=acme/demo');
  await c.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  console.log('  a freshly loaded tab works with', log.calls.slice(-1)[0].auth);
  await context.close();
}

// P2b: the panel in two tabs, one renews; the other is told to press Forget the token, which kills the first's token
if (header('P2b two panel tabs, Forget the token in the stale one')) {
  let live = 'ghu_T1';
  const revoked = [];
  const { context, log } = await makeContext({
    script: configured,
    validToken: (a) => a === 'Bearer ' + live,
    serviceFn: async (path, body) => {
      if (path === '/refresh') {
        if (body.refresh_token !== 'ghr_F1') return { status: 502, body: { error: 'bad_refresh_token' } };
        live = 'ghu_T2';
        return { status: 200, body: { access_token: 'ghu_T2', expires_in: 28800, refresh_token: 'ghr_F2', refresh_token_expires_in: 15897600 } };
      }
      if (path === '/revoke') { revoked.push(body.access_token); if (body.access_token === live) live = 'nothing'; return { status: 200, body: { revoked: true } }; }
      return { status: 400, body: { error: 'bad_request' } };
    },
  });
  const record = JSON.stringify({ access_token: 'ghu_T1', refresh_token: 'ghr_F1', expires_at: Date.now() + 120e3, refresh_expires_at: Date.now() + 90 * 86400e3 });
  await seed(context, { local: { symphony_panel_oauth: record } });
  const a = await openPage(context, '/symphony/control/?repo=acme/demo');
  const b = await openPage(context, '/symphony/control/?repo=acme/demo');
  await a.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  await b.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  for (const p of [a, b]) await p.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 5 * 60e3; });
  await a.click('#cp-refresh');
  await a.waitForTimeout(1500);
  await b.click('#cp-refresh');
  await b.waitForTimeout(1500);
  console.log('  tab B summary:', (await b.textContent('#cp-summary')).slice(0, 300));
  console.log('  tab B msg:', await msg(b));
  await b.click('#cp-signout');
  await b.waitForTimeout(1000);
  console.log('  tab B Forget -> revoked:', JSON.stringify(revoked), '| msg:', await msg(b));
  await a.click('#cp-refresh');
  await a.waitForTimeout(1500);
  console.log('  tab A after B pressed Forget:', (await a.textContent('#cp-summary')).slice(0, 200));
  await context.close();
}

// P3: both tabs come back after the token expired and renew at the same moment
if (header('P3 two tabs renew at once on load')) {
  let used = false;
  const { context } = await makeContext({
    script: configured,
    serviceFn: async (path, body) => {
      if (path === '/refresh') {
        await new Promise((r) => setTimeout(r, 300));
        if (used) return { status: 502, body: { error: 'bad_refresh_token', error_description: 'The refresh token passed is incorrect or expired.' } };
        used = true;
        return { status: 200, body: { access_token: 'ghu_T2', expires_in: 28800, refresh_token: 'ghr_F2', refresh_token_expires_in: 15897600 } };
      }
      return { status: 200, body: { revoked: true } };
    },
  });
  const record = JSON.stringify({ access_token: 'ghu_T1', refresh_token: 'ghr_F1', expires_at: Date.now() - 1000, refresh_expires_at: Date.now() + 90 * 86400e3 });
  await seed(context, { local: { symphony_panel_oauth: record } });
  const [a, b] = await Promise.all([openPage(context, '/symphony/control/?repo=acme/demo'), openPage(context, '/symphony/cost.html')]);
  await a.waitForTimeout(2500);
  console.log('  panel tab: app shown', await visible(a, '#cp-app'), '| msg:', await msg(a));
  console.log('  cost tab: app shown', await visible(b, '#cp-app'), '| msg:', await msg(b));
  console.log('  stored record after both:', await a.evaluate(() => localStorage.getItem('symphony_panel_oauth')));
  const c = await openPage(context, '/symphony/control/?repo=acme/demo');
  await c.waitForTimeout(1500);
  console.log('  a reload afterwards: app shown', await visible(c, '#cp-app'), '| gate shown', await visible(c, '#cp-gate'));
  await context.close();
}

// P4: Keep me signed in unticked in this tab, but another tab kept a sign-in: the renewal moves this tab's into localStorage
if (header('P4 renewal writes an unkept sign-in to localStorage')) {
  const { context } = await makeContext({
    script: configured,
    serviceFn: async (path) => path === '/refresh'
      ? { status: 200, body: { access_token: 'ghu_A2', expires_in: 28800, refresh_token: 'ghr_A2', refresh_token_expires_in: 15897600 } }
      : { status: 200, body: { revoked: true } },
  });
  const keptB = JSON.stringify({ access_token: 'ghu_B', refresh_token: 'ghr_B', expires_at: Date.now() + 3 * 3600e3, refresh_expires_at: Date.now() + 90 * 86400e3 });
  const tabA = JSON.stringify({ access_token: 'ghu_A1', refresh_token: 'ghr_A1', expires_at: Date.now() - 1000, refresh_expires_at: Date.now() + 90 * 86400e3 });
  await seed(context, { local: { symphony_panel_oauth: keptB } });
  const a = await openPage(context, '/symphony/control/?repo=acme/demo', { symphony_panel_oauth: tabA });
  await a.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  const where = await a.evaluate(() => ({ session: sessionStorage.getItem('symphony_panel_oauth'), local: localStorage.getItem('symphony_panel_oauth'), who: document.getElementById('cp-who').textContent }));
  console.log('  tab A (unkept) after its renewal: session =', where.session, '| local =', where.local && JSON.parse(where.local).access_token, '| who:', where.who);
  // the same with a kept pasted token in another tab
  const { context: c2 } = await makeContext({
    script: configured,
    serviceFn: async () => ({ status: 200, body: { access_token: 'ghu_A2', expires_in: 28800, refresh_token: 'ghr_A2', refresh_token_expires_in: 15897600 } }),
  });
  await seed(c2, { local: { symphony_panel_token: 'github_pat_KEPT' } });
  const a2 = await openPage(c2, '/symphony/control/?repo=acme/demo', { symphony_panel_oauth: tabA });
  await a2.waitForTimeout(2000);
  const w2 = await a2.evaluate(() => ({ s: sessionStorage.getItem('symphony_panel_oauth'), l: localStorage.getItem('symphony_panel_oauth'), pat: localStorage.getItem('symphony_panel_token') }));
  console.log('  with a kept pasted token in localStorage: tab A uses it?', JSON.stringify(w2));
  await context.close(); await c2.close();
}

// P5: a crafted ?error= link, unconfigured and configured
if (header('P5 crafted error link')) {
  for (const [name, script] of [['unconfigured', real], ['configured', configured]]) {
    const { context, log } = await makeContext({ script });
    await seed(context, {});
    const text = 'Your session expired. Paste your GitHub token in the box below, or mail it to help@evil.example';
    const page = await openPage(context, '/symphony/control/?error=access_denied&error_description=' + encodeURIComponent(text));
    await page.waitForTimeout(800);
    console.log('  ' + name + ' msg:', await msg(page));
    console.log('  ' + name + ' button disabled:', await page.evaluate(() => document.getElementById('cp-signin').disabled), '| off line shown:', await visible(page, '#cp-signin-off'), '| token box open:', await page.evaluate(() => document.getElementById('cp-token-way').open), '| address:', await page.evaluate(() => location.search), '| service calls:', log.service.length);
    await context.close();
  }
}

// P6: Add a repository the sign-in cannot reach (a private repository SymphonyBoard is not installed on)
if (header('P6 add a repository the App token cannot reach')) {
  const routes = repoRoutes('acme/demo');
  const { context } = await makeContext({ script: configured, routes });
  await seed(context, {});
  const page = await openPage(context, '/symphony/control/?repo=acme/demo');
  await page.click('#cp-signin');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  await page.fill('#cp-add-name', 'acme/secret');
  await page.click('#cp-add');
  await page.waitForFunction(() => /404/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  console.log('  msg:', await msg(page));
  console.log('  install link offered:', await page.evaluate(() => !!document.querySelector('#cp-add-answer a')));
  await context.close();
}

// P7: a state that differs: does the token box open like the other failures?
if (header('P7 state differs')) {
  const { context } = await makeContext({ script: configured });
  await seed(context, {});
  const pending = JSON.stringify({ state: 'a'.repeat(32), verifier: 'b'.repeat(64), keep: false, back: '?repo=acme/demo' });
  const page = await openPage(context, '/symphony/control/?code=X&state=' + 'c'.repeat(32), { symphony_panel_oauth_state: pending });
  await page.waitForTimeout(800);
  console.log('  msg:', await msg(page), '| token box open:', await page.evaluate(() => document.getElementById('cp-token-way').open));
  await context.close();
}

// P8: restoreQuery edge cases, driven through finishOauth with a pending sign-in
if (header('P8 back values')) {
  const cases = ['repo=acme/x', '?repo=acme/x&code=1&state=2&error=e', '?' + 'a'.repeat(3000), '?repo=acme/x#frag', '?code=1', '', '?repo=%2F%2Fevil.example', 12];
  for (const back of cases) {
    const { context } = await makeContext({ script: configured });
    await seed(context, {});
    const pending = JSON.stringify({ state: 's'.repeat(32), verifier: 'v'.repeat(64), keep: false, back });
    const page = await openPage(context, '/symphony/control/?error=access_denied&state=' + 's'.repeat(32), { symphony_panel_oauth_state: pending });
    await page.waitForTimeout(500);
    console.log('  back', JSON.stringify(String(back).slice(0, 60)), '->', JSON.stringify((await page.evaluate(() => location.href)).slice(0, 120)));
    await context.close();
  }
}

// P9: keyboard: the tab order of the gate and the summary's keys
if (header('P9 keyboard')) {
  for (const [name, script] of [['unconfigured', real], ['configured', configured]]) {
    const { context } = await makeContext({ script });
    await seed(context, {});
    const page = await openPage(context, '/symphony/control/');
    await page.focus('#msg').catch(() => {});
    await page.evaluate(() => { const h = document.querySelector('#cp-gate h2'); h.tabIndex = -1; h.focus(); });
    const order = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => { const e = document.activeElement; return (e.id || e.tagName.toLowerCase()) + (e.tagName === 'SUMMARY' ? '' : ''); }));
    }
    console.log('  ' + name + ' tab order:', order.join(' > '));
    if (name === 'configured') {
      await page.evaluate(() => { const h = document.querySelector('#cp-gate h2'); h.focus(); });
      await page.keyboard.press('Tab');
      console.log('   first stop:', await page.evaluate(() => document.activeElement.id));
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
      const onSummary = await page.evaluate(() => document.activeElement.tagName);
      await page.keyboard.press('Enter');
      const openAfterEnter = await page.evaluate(() => document.getElementById('cp-token-way').open);
      await page.keyboard.press(' ');
      const openAfterSpace = await page.evaluate(() => document.getElementById('cp-token-way').open);
      console.log('   on', onSummary, '| Enter opens:', openAfterEnter, '| Space closes again:', !openAfterSpace);
    }
    await context.close();
  }
}

await browser.close();
