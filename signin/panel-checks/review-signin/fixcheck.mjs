// Re-runs the cross-tab probes against a copy of the script with the proposed minimal fixes, and
// checks two small things: the disabled button's hover and a double press of Sign in.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = '/home/user/openspineconsortium.github.io';
const SERVICE = 'https://signin.example.test';
const real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
function swap(src, a, b) { if (src.indexOf(a) < 0) throw new Error('not found: ' + a.slice(0, 60)); return src.replace(a, b); }
let configured = swap(real, "var SIGNIN_SERVICE = '';", "var SIGNIN_SERVICE = '" + SERVICE + "';");
configured = swap(configured, "var CLIENT_ID = '';", "var CLIENT_ID = 'Iv1.testclient';");
// the proposed fixes
let fixed = swap(configured,
  "function keepSignedIn() {\n    try { return !!localStorage.getItem(KEY_TOKEN) || !!localStorage.getItem(KEY_OAUTH); } catch (e) { return false; }",
  "function keepSignedIn() {\n    try { if (sessionStorage.getItem(KEY_TOKEN) || sessionStorage.getItem(KEY_OAUTH)) return false; return !!localStorage.getItem(KEY_TOKEN) || !!localStorage.getItem(KEY_OAUTH); } catch (e) { return false; }");
fixed = swap(fixed,
  "    var o = oauthRecord();\n    if (!o || !o.refresh_token",
  "    var o = oauthRecord();\n    if (o && o.access_token && !readKey(KEY_TOKEN)) token = o.access_token;\n    if (!o || !o.refresh_token");
fixed = swap(fixed,
  "    refreshing = exchange('/refresh', { refresh_token: o.refresh_token }).then(function (answer) {",
  "    var used = o.refresh_token;\n    refreshing = exchange('/refresh', { refresh_token: used }).then(function (answer) {");
fixed = swap(fixed,
  "      refreshing = null;\n      if (e.kind === 'refused') throw expired(",
  "      refreshing = null;\n      var later = oauthRecord();\n      if (later && later.access_token && later.refresh_token !== used) { token = later.access_token; return token; }\n      if (e.kind === 'refused') throw expired(");

const now = new Date().toISOString();
function repoRoutes(repo) {
  return {
    'GET /user': { login: 'tester' },
    ['GET /repos/' + repo]: { full_name: repo, default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
    ['GET /repos/' + repo + '/issues']: [],
    ['GET /repos/' + repo + '/contents/STATE.md']: { raw: '# Board\n' },
    ['GET /repos/' + repo + '/branches/board']: { commit: { commit: { committer: { date: now } } } },
    ['GET /repos/' + repo + '/contents/.github/symphony/workers']: [],
    ['GET /repos/' + repo + '/actions/runs']: { workflow_runs: [] },
    ['GET /repos/' + repo + '/pulls']: [],
  };
}
const browser = await chromium.launch();
async function makeContext(script, serviceFn, validToken) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const routes = repoRoutes('acme/demo');
  const calls = [];
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const key = req.method() + ' ' + new URL(req.url()).pathname;
    const auth = req.headers()['authorization'] || '';
    calls.push({ key, auth });
    const headers = { 'Access-Control-Expose-Headers': 'Link' };
    if (validToken && !validToken(auth)) return route.fulfill({ status: 401, contentType: 'application/json', headers, body: '{"message":"Bad credentials"}' });
    const r = routes[key];
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: '{"message":"Not Found"}' });
    if (r && typeof r.raw === 'string') return route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', headers, body: r.raw });
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(r) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  const authorize = [];
  await context.route('https://github.com/login/oauth/**', (route) => {
    const u = new URL(route.request().url());
    authorize.push(u);
    const back = u.searchParams.get('redirect_uri') + '?code=CODE1&state=' + encodeURIComponent(u.searchParams.get('state'));
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>setTimeout(function(){location.replace(' + JSON.stringify(back) + ')},200)</script>' });
  });
  const service = [];
  await context.route(SERVICE + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': new URL(BASE).origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const path = new URL(req.url()).pathname;
    let body = null; try { body = req.postDataJSON(); } catch (e) { body = null; }
    service.push({ path, body });
    const a = serviceFn ? await serviceFn(path, body) : { status: 200, body: { access_token: 'ghu_TOKEN', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } };
    return route.fulfill({ status: a.status, contentType: 'application/json', headers: cors, body: JSON.stringify(a.body) });
  });
  return { context, calls, service, authorize };
}
async function seed(context, local) {
  const p = await context.newPage();
  await p.goto(BASE + '/symphony/');
  await p.evaluate((s) => { localStorage.clear(); sessionStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); }, local || {});
  await p.close();
}
async function openPage(context, path, session) {
  const page = await context.newPage();
  if (session) await page.addInitScript((s) => { if (!window.name) { window.name = 'seeded'; for (const k in s) sessionStorage.setItem(k, s[k]); } }, session);
  await page.goto(BASE + path);
  return page;
}
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!(e && e.checkVisibility()); }, sel);

for (const [name, script] of [['as written', configured], ['with the fixes', fixed]]) {
  console.log('\n##### ' + name);
  // P2: one tab renews, the other must use the renewed token
  {
    let live = 'ghu_T1';
    const { context, calls } = await makeContext(script, async (path, body) => {
      if (path === '/refresh') {
        if (body.refresh_token !== 'ghr_F1') return { status: 502, body: { error: 'bad_refresh_token' } };
        live = 'ghu_T2';
        return { status: 200, body: { access_token: 'ghu_T2', expires_in: 28800, refresh_token: 'ghr_F2', refresh_token_expires_in: 15897600 } };
      }
      return { status: 200, body: { revoked: true } };
    }, (a) => a === 'Bearer ' + live);
    const record = JSON.stringify({ access_token: 'ghu_T1', refresh_token: 'ghr_F1', expires_at: Date.now() + 120e3, refresh_expires_at: Date.now() + 90 * 86400e3 });
    await seed(context, { symphony_panel_oauth: record });
    const a = await openPage(context, '/symphony/control/?repo=acme/demo');
    const b = await openPage(context, '/symphony/control/?repo=acme/demo');
    await a.waitForSelector('#cp-app:not(.hidden)'); await b.waitForSelector('#cp-app:not(.hidden)');
    for (const p of [a, b]) await p.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 5 * 60e3; });
    await a.click('#cp-refresh'); await a.waitForTimeout(1200);
    await b.click('#cp-refresh'); await b.waitForTimeout(1200);
    console.log('  P2 tab B after tab A renewed:', (await b.textContent('#cp-summary')).slice(0, 90));
    await context.close();
  }
  // P3: two tabs renew at once
  {
    let used = false;
    const { context } = await makeContext(script, async (path) => {
      if (path === '/refresh') {
        await new Promise((r) => setTimeout(r, 300));
        if (used) return { status: 502, body: { error: 'bad_refresh_token' } };
        used = true;
        return { status: 200, body: { access_token: 'ghu_T2', expires_in: 28800, refresh_token: 'ghr_F2', refresh_token_expires_in: 15897600 } };
      }
      return { status: 200, body: { revoked: true } };
    });
    const record = JSON.stringify({ access_token: 'ghu_T1', refresh_token: 'ghr_F1', expires_at: Date.now() - 1000, refresh_expires_at: Date.now() + 90 * 86400e3 });
    await seed(context, { symphony_panel_oauth: record });
    const [a, b] = await Promise.all([openPage(context, '/symphony/control/?repo=acme/demo'), openPage(context, '/symphony/cost.html')]);
    await a.waitForTimeout(2500);
    const c = await openPage(context, '/symphony/control/?repo=acme/demo');
    await c.waitForTimeout(1500);
    console.log('  P3 panel app', await visible(a, '#cp-app'), '| cost app', await visible(b, '#cp-app'), '| reload app', await visible(c, '#cp-app'), '| record kept', !!(await a.evaluate(() => localStorage.getItem('symphony_panel_oauth'))));
    await context.close();
  }
  // P4: an unkept tab renews while another tab kept a sign-in
  {
    const { context } = await makeContext(script, async () => ({ status: 200, body: { access_token: 'ghu_A2', expires_in: 28800, refresh_token: 'ghr_A2', refresh_token_expires_in: 15897600 } }));
    const keptB = JSON.stringify({ access_token: 'ghu_B', refresh_token: 'ghr_B', expires_at: Date.now() + 3 * 3600e3, refresh_expires_at: Date.now() + 90 * 86400e3 });
    const tabA = JSON.stringify({ access_token: 'ghu_A1', refresh_token: 'ghr_A1', expires_at: Date.now() - 1000, refresh_expires_at: Date.now() + 90 * 86400e3 });
    await seed(context, { symphony_panel_oauth: keptB });
    const a = await openPage(context, '/symphony/control/?repo=acme/demo', { symphony_panel_oauth: tabA });
    await a.waitForSelector('#cp-app:not(.hidden)');
    const w = await a.evaluate(() => ({ s: !!sessionStorage.getItem('symphony_panel_oauth'), l: JSON.parse(localStorage.getItem('symphony_panel_oauth') || 'null'), who: document.getElementById('cp-who').textContent }));
    console.log('  P4 unkept tab after renewal: in session', w.s, '| localStorage holds', w.l && w.l.access_token, '|', w.who);
    await context.close();
  }
}

// the disabled button under the pointer, and a double press of Sign in
{
  const { context } = await makeContext(real);
  await seed(context, {});
  const page = await openPage(context, '/symphony/control/');
  const before = await page.evaluate(() => getComputedStyle(document.getElementById('cp-signin')).backgroundColor);
  await page.hover('#cp-signin', { force: true });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => getComputedStyle(document.getElementById('cp-signin')).backgroundColor);
  console.log('\n  disabled button background, rest -> hover:', before, '->', after);
  await context.close();
}
{
  const { context, service, authorize } = await makeContext(configured);
  await seed(context, {});
  const page = await openPage(context, '/symphony/control/?repo=acme/demo');
  await page.dblclick('#cp-signin');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 10000 }).catch(() => {});
  console.log('  double press: authorize requests', authorize.length, '| exchanges', service.filter((s) => s.path === '/exchange').length, '| app shown', await visible(page, '#cp-app'), '| msg', JSON.stringify(await page.textContent('#msg')));
  await context.close();
}
await browser.close();
