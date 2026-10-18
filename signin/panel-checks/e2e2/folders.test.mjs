// End-to-end checks of the control panel's Folders tab, /symphony/control/#folders (site branch
// claude/folders-page, 2026-10-18; the tab took the place of a page of its own, folders.html, before
// that page shipped), against a mocked api.github.com, a mocked Microsoft consent page, a mocked
// Microsoft Graph and a mocked sign-in service at https://signin.example.test. The tab is one of
// the console's, so every check loads the console, signed in as the other suites are, and opens the
// tab through its rail button or its address. Each check states what the page promises; a FAIL is
// a defect. Every token here is a stand-in.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const SERVICE = 'https://signin.example.test';
// the console's own address, with its trailing slash: GitHub's sign-in and Microsoft's consent both
// come back to it, and it is the one redirect the service's /drive/connect accepts
const PAGE = '/symphony/control/';
const CONSOLE = BASE + PAGE;
const MS_AUTHORIZE = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const now = new Date().toISOString();
const today = now.slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 4).join('\n     ')); }
}

let real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(real.includes(a), 'mutant text not found: ' + a.slice(0, 60)); real = real.replace(a, b); }
const SERVICE_LINE = /var SIGNIN_SERVICE = '[^']*';/;
const CLIENT_LINE = /var CLIENT_ID = '[^']*';/;
assert.ok(SERVICE_LINE.test(real) && CLIENT_LINE.test(real), 'the two constants were not found in the script');
const configured = real.replace(SERVICE_LINE, "var SIGNIN_SERVICE = '" + SERVICE + "';").replace(CLIENT_LINE, "var CLIENT_ID = 'Iv1.testclient';");

// a real X25519 key pair, so the sealing in the page has a public key of the right shape
const pair = crypto.generateKeyPairSync('x25519');
const PUBLIC_KEY = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
const REFRESH = 'M.C5-REFRESH-TOKEN-stand-in!*$';
const ACCESS = 'EwB-ACCESS-stand-in';
const HOSTILE = '"quoted" <img src=x onerror=window.__hostile=1> a/b\\c \'x\'';

const driveJson = { provider: 'microsoft', folder: 'papers', items: [{ id: 'f1', name: 'Papers', drive: 'drive1' }, { id: 'b1', name: 'one.docx', drive: 'drive1' }], connected: '2026-10-18' };
// what the console itself reads for a repository, so it loads clean and quiet beside the tab
function consoleReads(repo) {
  return {
    ['GET /repos/' + repo + '/issues']: [],
    ['GET /repos/' + repo + '/contents/STATE.md']: { raw: '# Board\n\nNothing claimed.\n' },
    ['GET /repos/' + repo + '/branches/board']: { commit: { commit: { committer: { date: now } } } },
    ['GET /repos/' + repo + '/contents/.github/symphony/workers']: [],
    ['GET /repos/' + repo + '/actions/runs']: { workflow_runs: [] },
    ['GET /repos/' + repo + '/pulls']: [],
  };
}
// what the Folders tab reads and writes for a repository
function folderRoutes(repo, o) {
  const r = '/repos/' + repo;
  const tracked = o.driveJson || driveJson;
  return {
    ['GET ' + r]: { full_name: repo, default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: repo.split('/')[0] } },
    ['GET ' + r + '/contents/.github/workflows/drive-sync.yml']: o.noWorkflow ? undefined : { name: 'drive-sync.yml', sha: 'w1', type: 'file' },
    ['GET ' + r + '/contents/.github/symphony/drive.json']: o.tracked ? { raw: JSON.stringify(tracked), json: { sha: 'd1', content: Buffer.from(JSON.stringify(tracked)).toString('base64'), encoding: 'base64' } } : undefined,
    ['GET ' + r + '/actions/secrets/SYMPHONY_DRIVE_REFRESH']: o.secret ? { name: 'SYMPHONY_DRIVE_REFRESH', created_at: now, updated_at: now } : undefined,
    ['GET ' + r + '/actions/secrets/public-key']: o.noSecretsRead ? { status: 403, body: { message: 'Resource not accessible by integration' } } : { key_id: 'k1', key: PUBLIC_KEY },
    ['PUT ' + r + '/actions/secrets/SYMPHONY_DRIVE_REFRESH']: o.noSecrets ? { status: 403, body: { message: 'Resource not accessible by integration' } } : { status: 201, body: {} },
    ['PUT ' + r + '/contents/.github/symphony/drive.json']: o.protectedMain ? ((req) => {
      const body = JSON.parse(req.postData());
      return body.branch === 'main' ? { status: 409, body: { message: 'Changes must be made through a pull request.' } } : { status: 201, body: { content: { sha: 'new' } } };
    }) : { status: 201, body: { content: { sha: 'new' } } },
    ['GET ' + r + '/git/ref/heads/main']: { object: { sha: 'abc123' } },
    ['POST ' + r + '/git/refs']: { status: 201, body: { ref: 'refs/heads/symphony/drive' } },
    ['POST ' + r + '/pulls']: { status: 201, body: { number: 9, html_url: 'https://github.com/' + repo + '/pull/9' } },
    ['POST ' + r + '/actions/workflows/drive-sync.yml/dispatches']: o.noActions ? { status: 403, body: { message: 'Resource not accessible by integration' } } : null,
  };
}
// GitHub names the account by the token a call carries: github_pat_OTHER is someone else's
function repoRoutes(opts, names) {
  const o = opts || {};
  const table = {
    'GET /user': (req) => ({ login: /OTHER/.test(req.headers()['authorization'] || '') ? 'other' : 'tester' }),
    'GET /user/repos': o.newRepos || [],
  };
  for (const name of names || ['acme/demo']) Object.assign(table, consoleReads(name), folderRoutes(name, (o.per && o.per[name]) || o));
  return table;
}
function graphRoutes() {
  return {
    'GET /v1.0/me/drive': { id: 'drive1', driveType: 'personal', owner: { user: { displayName: 'Greg' } } },
    'GET /v1.0/me/drive/root/children': { value: [
      { id: 'f1', name: 'Papers', folder: { childCount: 2 }, parentReference: { driveId: 'drive1' }, lastModifiedDateTime: now },
      { id: 'a1', name: 'notes.docx', file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, size: 1234, parentReference: { driveId: 'drive1' }, lastModifiedDateTime: now },
      { id: 'h1', name: HOSTILE, file: { mimeType: 'text/plain' }, size: 10, parentReference: { driveId: 'drive1' }, lastModifiedDateTime: now },
    ] },
    'GET /v1.0/me/drive/items/f1/children': { value: [
      { id: 'b1', name: 'one.docx', file: { mimeType: 'x' }, size: 2048, parentReference: { driveId: 'drive1' }, lastModifiedDateTime: now },
    ], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/items/f1/children?$skiptoken=page2' },
    'GET /v1.0/me/drive/items/f1/children?page2': { value: [
      { id: 'b2', name: 'two.docx', file: { mimeType: 'x' }, size: 4096, parentReference: { driveId: 'drive1' }, lastModifiedDateTime: now },
    ] },
  };
}
function signedIn(list, chosen) {
  const repos = list || ['acme/demo'];
  return { local: { symphony_panel_token: 'github_pat_TEST', symphony_panel_repos: JSON.stringify(repos), symphony_panel_repo: chosen || repos[0] } };
}
// Every text #msg showed, in order, so a word overwritten later is still seen; and the address the
// page stood at when it made each request, so a code left in the address while the page talked to
// anyone is seen too. Both run in each document before the page's own script.
const recorder = () => {
  window.__msgs = [];
  window.__fetched = [];
  const original = window.fetch;
  window.fetch = function (input) {
    try { window.__fetched.push({ url: String(input && input.url ? input.url : input), at: location.href }); } catch (e) { /* recorded or not, the request goes */ }
    return original.apply(this, arguments);
  };
  new MutationObserver(() => {
    const m = document.getElementById('msg');
    const t = m && m.textContent;
    if (t && window.__msgs[window.__msgs.length - 1] !== t) window.__msgs.push(t);
  }).observe(document, { subtree: true, childList: true, characterData: true });
};

const browser = await chromium.launch();
await consoleTabs(browser);
async function open(opts) {
  const o = opts || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 1280, height: 1000 } });
  const calls = [];
  const service = [];
  const authorize = [];
  const graph = [];
  const routes = o.routes || repoRoutes(o, o.repos);
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    let body = null;
    if (req.method() !== 'GET') { try { body = req.postDataJSON(); } catch (e) { body = req.postData(); } }
    calls.push({ key, url: req.url(), body, auth: req.headers()['authorization'] || '' });
    let r = routes[key];
    if (r === undefined && routes['*']) r = routes['*'](req, key);
    if (typeof r === 'function') r = await r(req);
    const headers = { 'Access-Control-Expose-Headers': 'Link' };
    const raw = /raw\+json/.test(req.headers()['accept'] || '');
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) });
    if (r && r.status) return route.fulfill({ status: r.status, contentType: 'application/json', headers, body: JSON.stringify(r.body || {}) });
    if (r && typeof r.raw === 'string') return raw
      ? route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', headers, body: r.raw })
      : route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(r.json || {}) });
    if (r === null) return route.fulfill({ status: 204, headers, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(r) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: o.script || configured }));
  // Microsoft's consent page: straight back with a code and the state it was given
  await context.route('https://login.microsoftonline.com/**', (route) => {
    const u = new URL(route.request().url());
    authorize.push(u);
    const back = u.searchParams.get('redirect_uri') + (o.denied
      ? '?error=access_denied&error_description=' + encodeURIComponent('The user has denied access.') + '&state=' + encodeURIComponent(u.searchParams.get('state'))
      : '?code=MSCODE1&state=' + encodeURIComponent(o.wrongState ? 'not-the-state' : u.searchParams.get('state')) + '&session_state=ss1');
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify(back) + ')</script>' });
  });
  const graphTable = o.graph || graphRoutes();
  await context.route('https://graph.microsoft.com/**', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const key = req.method() + ' ' + u.pathname;
    graph.push({ key, auth: req.headers()['authorization'] || '', query: u.search });
    const r = graphTable[/skiptoken/.test(u.search) ? key + '?page2' : key];
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'itemNotFound', message: 'not found' } }) });
    if (r && r.status) return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body || {}) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  });
  // GitHub's own sign-in, which comes back to the same console
  await context.route('https://github.com/login/oauth/**', (route) => {
    const u = new URL(route.request().url());
    authorize.push(u);
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify(u.searchParams.get('redirect_uri') + '?code=GHCODE&state=' + encodeURIComponent(u.searchParams.get('state'))) + ')</script>' });
  });
  await context.route(SERVICE + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': new URL(BASE).origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const where = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
    service.push({ path: where, body, origin: req.headers()['origin'] || '', method: req.method() });
    let answer = o.service && o.service[where];
    if (!answer && where === '/drive/config') answer = { status: 200, body: { microsoft: { client_id: 'ms-client-id' } } };
    if (!answer && where === '/drive/connect') answer = { status: 200, body: { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3599, scope: 'Files.ReadWrite' } };
    if (!answer && where === '/drive/token') answer = { status: 200, body: { access_token: 'EwB-NEW', expires_in: 3599 } };
    if (!answer && where === '/exchange') answer = { status: 200, body: { access_token: 'ghu_TOKEN', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } };
    if (!answer) answer = { status: 404, body: { error: 'no_such_route' } };
    return route.fulfill({ status: answer.status, contentType: 'application/json', headers: cors, body: JSON.stringify(answer.body) });
  });
  await context.addInitScript(recorder);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // seed the storage on the site's origin, then load the console; the seeding load leaves the
  // address at #command, so the load below, which carries no fragment, is a whole new document
  await page.goto(CONSOLE);
  await page.evaluate((s) => {
    localStorage.clear(); sessionStorage.clear();
    for (const k in (s.local || {})) localStorage.setItem(k, s.local[k]);
    for (const k in (s.session || {})) sessionStorage.setItem(k, s.session[k]);
  }, o.storage === undefined ? signedIn(o.repos) : o.storage);
  service.length = 0; calls.length = 0;
  if (!o.noLoad) await page.goto(BASE + (o.path || PAGE));
  return { context, page, calls, service, authorize, graph, errors };
}

const msg = (page) => page.textContent('#msg');
const said = (page) => page.evaluate(() => window.__msgs || []);
const fetchedFrom = (page) => page.evaluate(() => window.__fetched || []);
// the console has loaded the repository: signed in, and its summary written
async function ready(page, repo) {
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 15000 });
  await page.waitForFunction((r) => document.getElementById('cp-summary').textContent.indexOf(r + ', default') === 0, repo || 'acme/demo', { timeout: 15000 });
}
// the tab has read the repository the bar names and drawn what it tracks
async function tabRead(page, repo) {
  await page.waitForFunction((r) => {
    const t = document.getElementById('fd-tracked').textContent;
    return t.indexOf(r) >= 0 && t.indexOf('Reading ') !== 0;
  }, repo || 'acme/demo', { timeout: 15000 });
}
// the drive's list is drawn, past its "Reading" line
const listed = (page) => page.waitForFunction(() => !!document.querySelector('#fd-items input[data-id]'), null, { timeout: 15000 });
// whether an address still carries any word of a sign-in's or a consent's return
function returnWords(address) {
  const q = new URL(address).searchParams;
  return ['code', 'state', 'error', 'error_description', 'session_state', 'admin_consent'].filter((k) => q.has(k));
}
function assertCleanRequests(fetched) {
  assert.ok(fetched.length > 0, 'the page made no request to look at');
  for (const f of fetched) assert.deepEqual(returnWords(f.at), [], 'a request to ' + f.url.slice(0, 80) + ' went out from ' + f.at);
}
// the console loaded, the Folders tab opened by its rail button, and Connect OneDrive pressed: the
// browser goes to Microsoft and comes back to the console
async function pressConnect(env, o) {
  const { page } = env;
  await ready(page, o && o.repo);
  await page.click('#rail-folders');
  await page.waitForFunction(() => !document.getElementById('fd-connect').disabled, null, { timeout: 15000 });
  if (o && o.before) await o.before();
  await page.click('#fd-connect');
}
// a whole connection: pressed, come back, exchanged, and the tab open on the drive by itself; every
// Connect names the console's own address to Microsoft and to /drive/connect
async function connect(env, o) {
  const { page, authorize, service } = env;
  const before = authorize.length;
  await pressConnect(env, o);
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /OneDrive is connected for this page/.test(t)), null, { timeout: 15000 });
  await page.waitForFunction(() => location.hash === '#folders' && /Connected to OneDrive/.test(document.getElementById('fd-connect-note').textContent), null, { timeout: 15000 });
  const sent = authorize[before];
  assert.equal(sent.origin + sent.pathname, MS_AUTHORIZE);
  assert.equal(sent.searchParams.get('redirect_uri'), CONSOLE, 'Microsoft was sent another address than the console\'s');
  const exchanges = service.filter((s) => s.path === '/drive/connect');
  assert.equal(exchanges[exchanges.length - 1].body.redirect_uri, CONSOLE, '/drive/connect was sent another address than the console\'s');
}
function storageHolds(page, text) {
  return page.evaluate((t) => {
    const all = [];
    for (let i = 0; i < localStorage.length; i++) all.push(localStorage.getItem(localStorage.key(i)));
    for (let i = 0; i < sessionStorage.length; i++) all.push(sessionStorage.getItem(sessionStorage.key(i)));
    return all.some((v) => v && v.indexOf(t) >= 0);
  }, text);
}
const tabFacts = (page) => page.evaluate(() => ({
  path: location.pathname, search: location.search, hash: location.hash,
  shown: !document.getElementById('tab-folders').hidden,
  selected: document.getElementById('rail-folders').getAttribute('aria-selected'),
  open: Array.prototype.filter.call(document.querySelectorAll('[data-tab-panel]'), (p) => !p.hidden).map((p) => p.id),
}));

await check('A: with no provider set up, Connect cannot be pressed and one line says the owner has not set it up; nothing else was called', async () => {
  const { context, page, service, authorize, errors } = await open({ service: { '/drive/config': { status: 200, body: { microsoft: null } } } });
  await ready(page);
  await page.click('#rail-folders');
  await page.waitForFunction(() => /has not set OneDrive up/.test(document.getElementById('fd-connect-note').textContent));
  assert.equal(await page.isDisabled('#fd-connect'), true);
  assert.equal(service.filter((s) => s.path === '/drive/config').length, 1);
  assert.equal(service.filter((s) => s.path !== '/drive/config').length, 0);
  assert.equal(authorize.length, 0);
  assert.match(await page.textContent('#fd-browser'), /Connect OneDrive first/);
  await tabRead(page);
  assert.match(await page.textContent('#fd-tracked'), /acme\/demo tracks no drive yet/);
  assert.match(await page.textContent('body'), /Google Drive comes later/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('B: Connect goes to Microsoft with PKCE and the console as redirect, comes back, exchanges at /drive/connect with the matching verifier from an address the code has left, the GitHub handler never sees it, and the repository the press was made from comes back', async () => {
  const env = await open({ path: PAGE + '?repo=acme/demo', repos: ['acme/demo', 'acme/other'] });
  const { context, page, service, authorize, graph, errors } = env;
  // the browser's remembered repository moves on meanwhile, as another tab of the console would move it
  await connect(env, { before: () => page.evaluate(() => localStorage.setItem('symphony_panel_repo', 'acme/other')) });
  assert.equal(authorize.length, 1);
  const u = authorize[0];
  assert.equal(u.origin + u.pathname, MS_AUTHORIZE);
  assert.equal(u.searchParams.get('client_id'), 'ms-client-id');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('scope'), 'Files.ReadWrite offline_access');
  assert.equal(u.searchParams.get('redirect_uri'), CONSOLE);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(/^[0-9a-f]{32}$/.test(u.searchParams.get('state')), 'a state of 16 random bytes');
  const exchange = service.filter((s) => s.path === '/drive/connect');
  assert.equal(exchange.length, 1);
  assert.equal(exchange[0].body.provider, 'microsoft');
  assert.equal(exchange[0].body.code, 'MSCODE1');
  assert.equal(exchange[0].body.redirect_uri, CONSOLE);
  const hash = crypto.createHash('sha256').update(exchange[0].body.code_verifier).digest('base64url');
  assert.equal(hash, u.searchParams.get('code_challenge'), 'the verifier sent is the one the challenge was made from');
  assert.equal(service.filter((s) => s.path === '/exchange').length, 0, 'the GitHub sign-in handler saw the drive\'s code');
  const fetched = await fetchedFrom(page);
  const atExchange = fetched.find((f) => /\/drive\/connect$/.test(f.url));
  assert.ok(atExchange, 'the exchange was not seen leaving the page');
  assert.deepEqual(returnWords(atExchange.at), [], 'the code was still in the address when it was exchanged: ' + atExchange.at);
  assertCleanRequests(fetched);
  assert.equal(await page.evaluate(() => location.search), '?repo=acme%2Fdemo', 'the query Connect was pressed from did not come back');
  assert.equal(await page.inputValue('#cp-repo'), 'acme/demo');
  assert.equal(await storageHolds(page, ACCESS), false, 'the access token is in storage');
  assert.equal(await storageHolds(page, REFRESH), false, 'the refresh token is in storage');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_drive_state')), null, 'the pending state was not cleared');
  assert.match(await page.textContent('#fd-connect-note'), /Connected to OneDrive as Greg \(personal\)/);
  assert.ok(graph.find((g) => g.key === 'GET /v1.0/me/drive' && g.auth === 'Bearer ' + ACCESS), 'the drive was named with the access token');
  assert.equal(await page.textContent('#cp-who') !== '', true, 'still signed in to GitHub');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('B2: opened at /symphony/control/index.html, Connect still names the console\'s own address, with its trailing slash, to Microsoft and to /drive/connect', async () => {
  const env = await open({ path: PAGE + 'index.html?repo=acme/demo' });
  const { context, page, service, authorize, errors } = env;
  await connect(env);
  assert.equal(authorize[0].searchParams.get('redirect_uri'), CONSOLE);
  assert.equal(service.find((s) => s.path === '/drive/connect').body.redirect_uri, CONSOLE);
  assert.equal(await page.evaluate(() => location.pathname), PAGE, 'the drive came back somewhere but the console\'s own address');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('B3: a GitHub sign-in and then a drive connection on one console send GitHub and Microsoft the same address, the console\'s own, and each code reaches its own handler once', async () => {
  const env = await open({ storage: { local: { symphony_panel_repos: JSON.stringify(['acme/demo']), symphony_panel_repo: 'acme/demo' } } });
  const { context, page, service, authorize, errors } = env;
  await page.waitForSelector('#cp-gate:not(.hidden)');
  await page.click('#cp-signin');
  await connect(env);
  assert.equal(authorize.length, 2);
  assert.equal(authorize[0].origin + authorize[0].pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(authorize[1].origin + authorize[1].pathname, MS_AUTHORIZE);
  assert.equal(authorize[0].searchParams.get('redirect_uri'), CONSOLE);
  assert.equal(authorize[1].searchParams.get('redirect_uri'), CONSOLE);
  const github = service.filter((s) => s.path === '/exchange');
  const drive = service.filter((s) => s.path === '/drive/connect');
  assert.equal(github.length, 1, 'GitHub\'s code was exchanged ' + github.length + ' times');
  assert.equal(drive.length, 1, 'the drive\'s code was exchanged ' + drive.length + ' times');
  assert.equal(github[0].body.code, 'GHCODE');
  assert.equal(drive[0].body.code, 'MSCODE1');
  assert.equal(github[0].body.redirect_uri, CONSOLE);
  assert.equal(drive[0].body.redirect_uri, CONSOLE);
  assert.match(await page.textContent('#cp-who'), /Signed in as tester through GitHub/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('C: the drive is drawn from Graph with $select and $top, a folder opens, its second page follows, files and folders tick, a hostile name stays text, nothing is written', async () => {
  const env = await open({});
  const { context, page, calls, graph, errors } = env;
  await connect(env);
  await listed(page);
  const root = graph.find((g) => g.key === 'GET /v1.0/me/drive/root/children');
  assert.ok(root, 'the root was listed');
  assert.match(root.query, /\$select=id,name,folder,file,size,parentReference,lastModifiedDateTime/);
  assert.match(root.query, /\$top=200/);
  assert.equal(root.auth, 'Bearer ' + ACCESS);
  const rows = await page.$$eval('#fd-items tbody tr', (trs) => trs.map((tr) => tr.children[1].textContent + ' | ' + tr.children[2].textContent + ' | ' + (tr.querySelector('button') ? tr.querySelector('button').textContent : '')));
  console.log('     ', JSON.stringify(rows));
  assert.equal(rows[0], 'Papers | folder, 2 items | Open', 'folders first, with Open');
  assert.equal(rows[1], 'notes.docx | 1 KB | ');
  assert.equal(await page.evaluate(() => !!window.__hostile), false, 'the hostile name ran');
  assert.equal(await page.$$eval('#fd-items img', (l) => l.length), 0, 'the hostile name made an element');
  assert.ok(rows[2].startsWith(HOSTILE + ' |'), 'the hostile name is shown as text');
  // tick a file in the root, open the folder, tick a file there, go up, tick the folder
  await page.check('#fd-items input[data-id="a1"]');
  await page.click('#fd-items tbody tr:first-child button');
  await page.waitForFunction(() => /one\.docx/.test(document.getElementById('fd-items').textContent));
  assert.equal(graph.filter((g) => g.key === 'GET /v1.0/me/drive/items/f1/children').length, 2, 'the @odata.nextLink page was not asked for');
  assert.match(await page.textContent('#fd-items'), /two\.docx/, 'the second page is not listed');
  assert.match(await page.textContent('.folders__crumbs'), /My files\/Papers/);
  await page.check('#fd-items input[data-id="b1"]');
  await page.click('.folders__crumbs button');
  await page.waitForFunction(() => /notes\.docx/.test(document.getElementById('fd-items').textContent));
  assert.equal(await page.isChecked('#fd-items input[data-id="a1"]'), true, 'a tick survives leaving the folder');
  await page.check('#fd-items input[data-id="f1"]');
  assert.match(await page.textContent('#fd-picked-head'), /Ticked, 3 items/);
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['notes.docx', 'one.docx', 'Papers']);
  // untick from the list
  await page.click('#fd-picked li:nth-child(2) button');
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['notes.docx', 'Papers']);
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), [], 'something was written before Track');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('D: Track seals the refresh token for the public key, writes drive.json exactly, starts the sync, and drops the tokens', async () => {
  const env = await open({});
  const { context, page, calls, service, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="f1"]');
  await page.check('#fd-items input[data-id="a1"]');
  await page.fill('#fd-folder', 'papers');
  assert.equal(await page.textContent('#fd-track'), 'Track in acme/demo');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo tracks 2 items of OneDrive in papers\//.test(document.getElementById('msg').textContent));
  const text = await msg(page);
  console.log('     ', text);
  const keys = calls.map((c) => c.key);
  const order = ['GET /repos/acme/demo/actions/secrets/public-key', 'PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches'];
  const found = keys.filter((k) => order.indexOf(k) >= 0);
  assert.deepEqual(found, order, 'the secret, then the file, then the run, each once');
  const secret = calls.find((c) => c.key === order[1]).body;
  assert.equal(secret.key_id, 'k1');
  const sealed = Buffer.from(secret.encrypted_value, 'base64');
  assert.equal(sealed.length, 32 + 16 + Buffer.byteLength(REFRESH), 'a sealed box: the ephemeral key, the tag and the token');
  assert.ok(secret.encrypted_value.indexOf(REFRESH) < 0 && !sealed.toString('latin1').includes(REFRESH), 'the token went in the clear');
  const file = calls.find((c) => c.key === order[2]).body;
  assert.equal(file.branch, 'main');
  assert.equal(file.sha, undefined, 'a sha was sent for a file that is not there');
  assert.equal(Buffer.from(file.content, 'base64').toString('utf8'), JSON.stringify({ provider: 'microsoft', folder: 'papers', items: [{ id: 'f1', name: 'Papers', drive: 'drive1' }, { id: 'a1', name: 'notes.docx', drive: 'drive1' }], connected: today }, null, 2) + '\n');
  assert.deepEqual(calls.find((c) => c.key === order[3]).body, { ref: 'main' });
  assert.match(text, /The first sync is queued: https:\/\/github.com\/acme\/demo\/actions\/workflows\/drive-sync.yml/);
  assert.match(text, /tokens are dropped from this page/);
  assert.equal(await storageHolds(page, REFRESH), false);
  assert.equal(service.filter((s) => s.path === '/drive/token').length, 0, 'no renewal was needed');
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive', 'the connection is gone after Track');
  await page.click('#fd-track');
  await page.waitForFunction(() => /Connect OneDrive first/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter((c) => c.key === order[1]).length, 1, 'a second Track sealed again without a connection');
  assert.deepEqual(errors, []);
  await context.close();
});

// a 403 on the secret's write (the public key readable), and one on the public key itself
for (const [name, opts] of [['E', { noSecrets: true }], ['E2', { noSecretsRead: true }]]) {
  await check(name + ': a 403 on the secret' + (opts.noSecretsRead ? '\'s public key' : '') + ' is said as the Secrets permission waiting on the owner, and nothing else is written', async () => {
    const env = await open(opts);
    const { context, page, calls, errors } = env;
    await connect(env);
    await listed(page);
    await page.check('#fd-items input[data-id="a1"]');
    calls.length = 0;
    await page.click('#fd-track');
    await page.waitForFunction(() => /Secrets permission is still waiting on the owner \(403\)/.test(document.getElementById('msg').textContent));
    assert.equal(calls.filter((c) => c.key === 'GET /repos/acme/demo/actions/secrets/public-key').length, 1);
    assert.equal(calls.filter((c) => c.key.startsWith('PUT /repos/acme/demo/contents')).length, 0, 'the file was written');
    assert.equal(calls.filter((c) => /dispatches/.test(c.key)).length, 0, 'the sync was started');
    assert.equal(calls.filter((c) => c.key.startsWith('POST')).length, 0);
    assert.equal(await page.isDisabled('#fd-track'), false);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('D2: two presses of Track in a row make one secret, one file and one run', async () => {
  const routes = repoRoutes({});
  routes['GET /repos/acme/demo/actions/secrets/public-key'] = async () => { await sleep(300); return { key_id: 'k1', key: PUBLIC_KEY }; };
  const env = await open({ routes });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  calls.length = 0;
  await page.$eval('#fd-track', (b) => { b.click(); b.click(); });
  await page.waitForFunction(() => /acme\/demo tracks 1 item of OneDrive/.test(document.getElementById('msg').textContent));
  const writes = calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key);
  assert.deepEqual(writes, ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches']);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E3: a 403 on the first run still leaves the secret and the file written, says the sign-in has no Actions right, gives the Run workflow link, and the hostile name reaches the file as given', async () => {
  const env = await open({ noActions: true });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="h1"]');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /could not be started from here \(403/.test(document.getElementById('msg').textContent));
  const text = await msg(page);
  assert.match(text, /acme\/demo tracks 1 item of OneDrive in papers\//);
  assert.match(text, /Open https:\/\/github.com\/acme\/demo\/actions\/workflows\/drive-sync.yml and press "Run workflow"/);
  assert.match(text, /tokens are dropped from this page/);
  const writes = calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key);
  assert.deepEqual(writes, ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches']);
  const file = JSON.parse(Buffer.from(calls.find((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json').body.content, 'base64').toString('utf8'));
  assert.deepEqual(file.items, [{ id: 'h1', name: HOSTILE, drive: 'drive1' }], 'the name goes to the file as the drive gave it; the run cleans it');
  assert.equal(await storageHolds(page, REFRESH), false);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E4: a folder that is not one plain name is refused in words before anything is written or read', async () => {
  const env = await open({});
  const { context, page, calls, errors } = env;
  await connect(env);
  await tabRead(page);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  calls.length = 0;
  // the page trims the box first, so a blank at either end is no refusal; a dot at the end is
  for (const bad of ['', 'a/b', '..', 'papers.', '.papers', 'pa pers.', 'x'.repeat(81), 'a\\b', 'pa:pers']) {
    await page.$eval('#fd-folder', (box, v) => { box.value = v; }, bad);
    await page.$eval('#msg', (m) => { m.textContent = ''; });
    await page.click('#fd-track');
    await page.waitForFunction(() => /The folder is one name of up to 80 letters/.test(document.getElementById('msg').textContent));
    assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0, 'a write for the folder ' + JSON.stringify(bad));
    assert.equal(calls.length, 0, 'a read for the folder ' + JSON.stringify(bad) + ': ' + calls.map((c) => c.key).join(', '));
  }
  await page.$eval('#fd-folder', (box) => { box.value = 'my papers 2026'; });
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo tracks 1 item of OneDrive in my papers 2026\//.test(document.getElementById('msg').textContent));
  assert.equal(JSON.parse(Buffer.from(calls.find((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json').body.content, 'base64').toString('utf8')).folder, 'my papers 2026');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F: a repository that tracks a drive shows what, the connect-again day 90 days on, the secret, and Sync now starts the run', async () => {
  const { context, page, calls, errors } = await open({ tracked: true, secret: true });
  await ready(page);
  await page.click('#rail-folders');
  await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  const text = await page.textContent('#fd-tracked');
  console.log('     ', text.replace(/\s+/g, ' ').slice(0, 300));
  assert.match(text, /acme\/demo tracks 2 items of OneDrive in papers\/: Papers, one\.docx\./);
  assert.match(text, /Connected 2026-10-18; a OneDrive refresh token lasts 90 days, so press Connect OneDrive again by 2027-01-16/);
  assert.match(text, /The secret SYMPHONY_DRIVE_REFRESH is set, updated/);
  assert.equal(await page.inputValue('#fd-folder'), 'papers');
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['Papers', 'one.docx'], 'what is tracked is ticked already for Connect again');
  calls.length = 0;
  await page.click('#fd-tracked button');
  await page.waitForFunction(() => /drive sync of acme\/demo is queued/.test(document.getElementById('msg').textContent));
  assert.deepEqual(calls.find((c) => /dispatches/.test(c.key)).body, { ref: 'main' });
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F2: without the secret, or with Actions refused, the page says so in words and gives the Run workflow link', async () => {
  const { context, page, errors } = await open({ tracked: true, noActions: true });
  await ready(page);
  await page.click('#rail-folders');
  await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  assert.match(await page.textContent('#fd-tracked'), /The secret SYMPHONY_DRIVE_REFRESH is not set, so the sync ends at once: press Connect OneDrive, then Track/);
  await page.click('#fd-tracked button');
  await page.waitForFunction(() => /could not be started from here \(403/.test(document.getElementById('msg').textContent));
  assert.match(await msg(page), /Open https:\/\/github.com\/acme\/demo\/actions\/workflows\/drive-sync.yml and press "Run workflow"/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G: a code and a state nobody here issued, with Microsoft\'s two words beside them, leave the address before any request, are exchanged nowhere, and are not spoken of', async () => {
  const { context, page, service, errors } = await open({ path: PAGE + '?code=STRANGER&state=nobody&session_state=s1&admin_consent=True&repo=acme/demo' });
  await ready(page);
  const seen = await said(page);
  console.log('      messages:', JSON.stringify(seen));
  assert.ok(!seen.some((t) => /never issued|did not come back|state differs|OneDrive|Microsoft/.test(t)), 'words about a return nobody started');
  assert.equal(service.filter((s) => s.path === '/drive/connect' || s.path === '/exchange').length, 0);
  assertCleanRequests(await fetchedFrom(page));
  assert.equal(await page.evaluate(() => location.search), '?repo=acme%2Fdemo');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G2: a drive return whose state differs from the one issued is refused as the drive\'s and said, nothing is exchanged, and the tab opens to say it', async () => {
  const env = await open({ wrongState: true });
  const { context, page, service, errors } = env;
  await pressConnect(env);
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /OneDrive connection did not come back the way it left/.test(t)), null, { timeout: 15000 });
  await page.waitForFunction(() => location.hash === '#folders', null, { timeout: 10000 });
  assert.equal(service.filter((s) => s.path === '/drive/connect' || s.path === '/exchange').length, 0);
  assert.equal(await page.evaluate(() => location.search), '?repo=acme%2Fdemo');
  assertCleanRequests(await fetchedFrom(page));
  assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_drive_state')), null, 'the refused state was kept');
  assert.equal((await tabFacts(page)).shown, true);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G3: Microsoft refusing the consent is said in Microsoft\'s words, the page stays signed in to GitHub, and the tab opens to say it with the address clean', async () => {
  const env = await open({ denied: true });
  const { context, page, service, errors } = env;
  await pressConnect(env);
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /Microsoft did not connect the drive \(access_denied: The user has denied access\.\)/.test(t)), null, { timeout: 15000 });
  await page.waitForFunction(() => location.hash === '#folders', null, { timeout: 10000 });
  assert.equal(service.filter((s) => s.path === '/drive/connect').length, 0);
  await page.waitForSelector('#cp-app:not(.hidden)');
  const facts = await tabFacts(page);
  assert.equal(facts.shown, true);
  assert.deepEqual(returnWords(BASE + facts.path + facts.search), []);
  assertCleanRequests(await fetchedFrom(page));
  assert.deepEqual(errors, []);
  await context.close();
});

// Both returns land on the one console, so each handler takes only a return whose state it issued.
// The pending states are seeded as the page writes them, and the return loaded as a whole document.
const GH_STATE = 'a'.repeat(32);
const DRIVE_STATE = 'b'.repeat(32);
const GH_VERIFIER = 'c'.repeat(64);
const DRIVE_VERIFIER = 'd'.repeat(64);
const ghPending = JSON.stringify({ state: GH_STATE, verifier: GH_VERIFIER, keep: false, back: '?repo=acme/demo' });
const drivePending = JSON.stringify({ provider: 'microsoft', state: DRIVE_STATE, verifier: DRIVE_VERIFIER, back: '?repo=acme/demo' });
const listedOnly = { symphony_panel_repos: JSON.stringify(['acme/demo']), symphony_panel_repo: 'acme/demo' };
const withToken = Object.assign({ symphony_panel_token: 'github_pat_TEST' }, listedOnly);

for (const [name, session] of [['H1', { symphony_panel_oauth_state: ghPending }], ['H2', { symphony_panel_oauth_state: ghPending, symphony_panel_drive_state: drivePending }]]) {
  await check(name + ': a GitHub sign-in that returns to the console' + (name === 'H2' ? ', with a drive connection also pending,' : '') + ' is the sign-in handler\'s: exchanged at /exchange with its verifier, never at /drive/connect, and the console opens on Command', async () => {
    const { context, page, service, errors } = await open({ storage: { local: listedOnly, session }, path: PAGE + '?code=GHCODE&state=' + GH_STATE });
    await ready(page);
    const github = service.filter((s) => s.path === '/exchange');
    assert.equal(github.length, 1);
    assert.equal(github[0].body.code, 'GHCODE');
    assert.equal(github[0].body.code_verifier, GH_VERIFIER);
    assert.equal(github[0].body.redirect_uri, CONSOLE);
    assert.equal(service.filter((s) => s.path === '/drive/connect').length, 0, 'GitHub\'s code went to the drive\'s exchange');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_oauth_state')), null);
    assertCleanRequests(await fetchedFrom(page));
    assert.ok(!(await said(page)).some((t) => /OneDrive/.test(t)), 'the drive spoke of GitHub\'s return');
    const facts = await tabFacts(page);
    assert.equal(facts.hash, '#command');
    assert.equal(facts.shown, false, 'a GitHub return opened the Folders tab');
    assert.match(await page.textContent('#cp-who'), /Signed in as tester through GitHub/);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await check('H3: a drive return to the console, with an abandoned GitHub sign-in also pending, is the Folders tab\'s: exchanged at /drive/connect with its verifier, never at /exchange, and the tab opens', async () => {
  const { context, page, service, errors } = await open({ storage: { local: withToken, session: { symphony_panel_oauth_state: ghPending, symphony_panel_drive_state: drivePending } }, path: PAGE + '?code=MSCODE9&state=' + DRIVE_STATE + '&session_state=ss9' });
  await ready(page);
  await page.waitForFunction(() => location.hash === '#folders' && /Connected to OneDrive/.test(document.getElementById('fd-connect-note').textContent), null, { timeout: 15000 });
  const drive = service.filter((s) => s.path === '/drive/connect');
  assert.equal(drive.length, 1);
  assert.equal(drive[0].body.code, 'MSCODE9');
  assert.equal(drive[0].body.code_verifier, DRIVE_VERIFIER);
  assert.equal(drive[0].body.redirect_uri, CONSOLE);
  assert.equal(service.filter((s) => s.path === '/exchange').length, 0, 'the drive\'s code went to GitHub\'s exchange');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_drive_state')), null);
  assertCleanRequests(await fetchedFrom(page));
  assert.ok(!(await said(page)).some((t) => /state differs|did not come back/.test(t)), 'a refusal was said for a return that was the drive\'s');
  assert.equal((await tabFacts(page)).shown, true);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H4: a return whose state matches neither pending one is exchanged nowhere, leaves the address, and is refused once', async () => {
  const { context, page, service, errors } = await open({ storage: { local: withToken, session: { symphony_panel_oauth_state: ghPending, symphony_panel_drive_state: drivePending } }, path: PAGE + '?code=WHOSE&state=' + 'e'.repeat(32) });
  await ready(page);
  assert.equal(service.filter((s) => s.path === '/drive/connect' || s.path === '/exchange').length, 0);
  assertCleanRequests(await fetchedFrom(page));
  assert.ok(!/WHOSE/.test(await page.evaluate(() => location.href)));
  const refusals = (await said(page)).filter((t) => /did not come back the way it left/.test(t));
  console.log('      refusals:', JSON.stringify(refusals));
  assert.equal(refusals.length, 1, 'the refusal was said ' + refusals.length + ' times');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I: a default branch that takes only pull requests gets the file on symphony/drive with a pull request that points at the tab, and no run is started', async () => {
  const env = await open({ protectedMain: true });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="f1"]');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /rides https:\/\/github.com\/acme\/demo\/pull\/9/.test(document.getElementById('msg').textContent));
  const keys = calls.map((c) => c.key);
  assert.equal(keys.filter((k) => k === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json').length, 2, 'main, then the branch');
  const second = calls.filter((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json')[1].body;
  assert.equal(second.branch, 'symphony/drive');
  assert.deepEqual(calls.find((c) => c.key === 'POST /repos/acme/demo/git/refs').body, { ref: 'refs/heads/symphony/drive', sha: 'abc123' });
  const pull = calls.find((c) => c.key === 'POST /repos/acme/demo/pulls').body;
  assert.equal(pull.head, 'symphony/drive');
  assert.equal(pull.base, 'main');
  assert.ok(pull.body.indexOf(BASE + PAGE + '?repo=acme%2Fdemo#folders') >= 0, 'the pull request does not point at the tab: ' + pull.body);
  assert.ok(!/folders\.html/.test(pull.body), 'the pull request names the old page');
  assert.equal(keys.filter((k) => /dispatches/.test(k)).length, 0, 'a run was started with no file on the default branch');
  assert.match(await msg(page), /merge it, then press Sync now/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('J: "Find the repository I just made" asks GitHub about each new one, chooses the one made from the template in the bar, and the Create link opens GitHub\'s template form', async () => {
  // GitHub's list of a person's repositories leaves out which template made each, as its schema says
  const freshListed = { full_name: 'acme/fresh', default_branch: 'main', private: true, topics: [], id: 125, owner: { id: 77, login: 'acme' } };
  const otherListed = { full_name: 'acme/unrelated', default_branch: 'main', private: true, topics: [], id: 126, owner: { id: 77, login: 'acme' } };
  const routes = repoRoutes({ newRepos: [freshListed, otherListed] }, ['acme/demo', 'acme/fresh']);
  routes['GET /repos/acme/fresh'] = Object.assign({}, freshListed, { template_repository: { full_name: 'OpenSpineConsortium/symphony-template' } });
  routes['GET /repos/acme/unrelated'] = Object.assign({}, otherListed, { template_repository: null });
  const { context, page, calls, errors } = await open({ routes });
  await ready(page);
  await page.click('#rail-folders');
  assert.equal(await page.getAttribute('#fd-create', 'href'), 'https://github.com/new?template_owner=OpenSpineConsortium&template_name=symphony-template');
  assert.equal(await page.getAttribute('#fd-create', 'target'), '_blank');
  assert.match(await page.getAttribute('#fd-create', 'rel'), /noopener/);
  await page.click('#fd-reload');
  await page.waitForFunction(() => /Added to the list: acme\/fresh\. acme\/fresh is chosen\./.test(document.getElementById('msg').textContent));
  const list = calls.find((c) => c.key === 'GET /user/repos');
  assert.ok(list && /sort=created/.test(list.url) && /direction=desc/.test(list.url), 'the newest repositories were not asked for');
  await ready(page, 'acme/fresh');
  assert.equal(await page.inputValue('#cp-repo'), 'acme/fresh');
  assert.equal(await page.evaluate(() => location.search), '?repo=acme%2Ffresh');
  assert.equal(await page.textContent('#cp-repo-name'), 'acme/fresh');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('symphony_panel_repos'))), ['acme/demo', 'acme/fresh']);
  assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_repo')), 'acme/fresh');
  await page.waitForFunction(() => /acme\/fresh tracks no drive yet/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.textContent('#fd-track'), 'Track in acme/fresh');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('K: a repository with no drive-sync.yml is said, and Track cannot be pressed there', async () => {
  const { context, page, errors } = await open({ noWorkflow: true });
  await ready(page);
  await page.click('#rail-folders');
  await page.waitForFunction(() => /has no \.github\/workflows\/drive-sync\.yml/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.isDisabled('#fd-track'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('L: an access token that has run out is renewed through /drive/token with the refresh token before the next Graph read', async () => {
  const env = await open({ service: { '/drive/connect': { status: 200, body: { access_token: ACCESS, refresh_token: REFRESH, expires_in: 30, scope: 'Files.ReadWrite' } } } });
  const { context, page, service, graph, errors } = env;
  await connect(env);
  await listed(page);
  await page.click('#fd-items tbody tr:first-child button');
  await page.waitForFunction(() => /one\.docx/.test(document.getElementById('fd-items').textContent));
  const renewals = service.filter((s) => s.path === '/drive/token');
  assert.ok(renewals.length >= 1, 'no renewal');
  assert.deepEqual(renewals[0].body, { provider: 'microsoft', refresh_token: REFRESH });
  assert.equal(graph.find((g) => g.key === 'GET /v1.0/me/drive/items/f1/children').auth, 'Bearer EwB-NEW');
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---------- what the tab adds to the console ---------- */

await check('N1: a drive return opens the Folders tab by itself, with the address clean and no other tab open, before anything presses its rail button', async () => {
  const env = await open({});
  const { context, page, errors } = env;
  await pressConnect(env);
  // from here on nothing presses or reads through the tab wrapper, which would open the tab itself
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /OneDrive is connected for this page/.test(t)), null, { timeout: 15000 });
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent), null, { timeout: 15000 });
  await page.waitForFunction(() => location.hash === '#folders', null, { timeout: 10000 }).catch(() => {});
  const facts = await tabFacts(page);
  console.log('     ', JSON.stringify(facts));
  assert.equal(facts.path, PAGE);
  assert.equal(facts.search, '?repo=acme%2Fdemo');
  assert.equal(facts.hash, '#folders', 'the drive\'s return left the console on ' + facts.hash);
  assert.equal(facts.shown, true);
  assert.equal(facts.selected, 'true');
  assert.deepEqual(facts.open, ['tab-folders']);
  assertCleanRequests(await fetchedFrom(page));
  assert.deepEqual(errors, []);
  await context.close();
});

const tabPaths = /\/contents\/\.github\/symphony\/drive\.json|\/actions\/secrets\/|\/contents\/\.github\/workflows\/drive-sync\.yml/;
await check('N2: a console that never opens Folders asks the drive routes nothing and reads none of the tab\'s files; opening it asks once, and opening it again asks nothing more', async () => {
  const { context, page, calls, service, authorize, graph, errors } = await open({ tracked: true, secret: true });
  await ready(page);
  await page.click('#rail-board');
  await page.click('#rail-command');
  await sleep(800);
  assert.deepEqual(service.map((s) => s.path), [], 'the sign-in service was asked before the tab opened');
  assert.deepEqual(calls.filter((c) => tabPaths.test(c.key)).map((c) => c.key), [], 'the tab\'s files were read before it opened');
  await page.click('#rail-folders');
  await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  await sleep(300);
  assert.deepEqual(service.map((s) => s.path), ['/drive/config']);
  assert.equal(calls.filter((c) => tabPaths.test(c.key)).length, 3, 'the file, the secret and the workflow, once each: ' + calls.filter((c) => tabPaths.test(c.key)).map((c) => c.key).join(', '));
  await page.click('#rail-command');
  await page.click('#rail-folders');
  await sleep(500);
  assert.deepEqual(service.map((s) => s.path), ['/drive/config'], 'the service was asked again on the second opening');
  assert.equal(calls.filter((c) => tabPaths.test(c.key)).length, 3, 'the repository was read again on the second opening');
  assert.equal(authorize.length + graph.length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('N3: Forget the token drops the drive and what was ticked in it, so a sign-in after it, even as the same account, reads the tab afresh, finds no connection, and Track seals nothing', async () => {
  const env = await open({});
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  await page.click('#cp-signout');
  await page.waitForSelector('#cp-gate:not(.hidden)');
  await page.evaluate(() => { document.getElementById('cp-token-way').open = true; });
  calls.length = 0;
  await page.fill('#cp-token', 'github_pat_TEST2');
  await page.click('#cp-open');
  await ready(page);
  await page.click('#rail-folders');
  await tabRead(page);
  assert.ok(calls.some((c) => /drive\.json$/.test(c.key) && /TEST2/.test(c.auth)), 'the new sign-in did not read the tab afresh');
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive');
  assert.doesNotMatch(await page.textContent('#fd-connect-note'), /Connected/);
  assert.deepEqual(await page.$$eval('#fd-picked li', (l) => l.length), 0, 'what was ticked under the last sign-in is still ticked');
  assert.match(await page.textContent('#fd-browser'), /Connect OneDrive first/);
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /Connect OneDrive first/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0, 'Track wrote after Forget the token');
  assert.equal(await storageHolds(page, REFRESH), false);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('N3b: another tab keeping another account\'s token makes this tab drop the drive it connected, so Track never seals one person\'s drive into another\'s repository', async () => {
  const env = await open({});
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  const other = await context.newPage();
  await other.goto(BASE + '/assets/css/control.css');
  await other.evaluate(() => localStorage.setItem('symphony_panel_token', 'github_pat_OTHER'));
  await page.waitForFunction(() => /\bother\b/.test(document.getElementById('cp-who').textContent), null, { timeout: 15000 });
  calls.length = 0;
  await page.$eval('#fd-track', (b) => b.click());
  await page.waitForFunction(() => /Connect OneDrive first/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0, 'Track wrote as another account');
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('N4: choosing another repository in the bar reads that repository\'s drive state, shows nothing of the last one\'s, drops a late answer about the last one, and Track writes only there', async () => {
  const thesis = Object.assign({}, driveJson, { folder: 'thesis' });
  const routes = repoRoutes({ per: { 'acme/demo': { tracked: true, secret: true, driveJson: thesis }, 'acme/other': {} } }, ['acme/demo', 'acme/other']);
  const demoFile = routes['GET /repos/acme/demo/contents/.github/symphony/drive.json'];
  let slow = false;
  routes['GET /repos/acme/demo/contents/.github/symphony/drive.json'] = async () => { if (slow) await sleep(1500); return demoFile; };
  const env = await open({ routes, repos: ['acme/demo', 'acme/other'] });
  const { context, page, calls, errors } = env;
  await ready(page);
  await page.click('#rail-folders');
  await page.waitForFunction(() => /acme\/demo tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['Papers', 'one.docx']);
  assert.equal(await page.inputValue('#fd-folder'), 'thesis');
  const nothingOfDemo = async (when) => {
    const f = await page.evaluate(() => ({ tracked: document.getElementById('fd-tracked').textContent, picked: document.querySelectorAll('#fd-picked li').length, folder: document.getElementById('fd-folder').value, track: document.getElementById('fd-track').textContent }));
    assert.match(f.tracked, /acme\/other tracks no drive yet/, when);
    assert.doesNotMatch(f.tracked, /acme\/demo|thesis|Papers/, when + ': the last repository\'s state is shown');
    assert.equal(f.picked, 0, when + ': what the last repository\'s file ticked is still ticked');
    assert.equal(f.folder, 'papers', when + ': the last repository\'s folder is still in the box');
    assert.equal(f.track, 'Track in acme/other', when);
  };
  await page.selectOption('#cp-repo', 'acme/other');
  await page.waitForFunction(() => /acme\/other tracks no drive yet/.test(document.getElementById('fd-tracked').textContent), null, { timeout: 10000 });
  await nothingOfDemo('after choosing acme/other');
  const facts = await tabFacts(page);
  assert.equal(facts.search, '?repo=acme%2Fother');
  assert.equal(facts.shown, true);
  // back to acme/demo, whose file is slow to come, and on to acme/other before it comes
  slow = true;
  await page.selectOption('#cp-repo', 'acme/demo');
  await page.selectOption('#cp-repo', 'acme/other');
  await page.waitForFunction(() => /acme\/other tracks no drive yet/.test(document.getElementById('fd-tracked').textContent), null, { timeout: 10000 });
  await sleep(2200);
  await nothingOfDemo('after acme/demo\'s late answer');
  slow = false;
  await connect(env, { repo: 'acme/other' });
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/other tracks 1 item of OneDrive/.test(document.getElementById('msg').textContent));
  const writes = calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key);
  assert.deepEqual(writes, ['PUT /repos/acme/other/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/other/contents/.github/symphony/drive.json', 'POST /repos/acme/other/actions/workflows/drive-sync.yml/dispatches']);
  assert.ok(!calls.some((c) => /acme\/demo/.test(c.key)), 'Track touched acme/demo');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('N5: a hostile name in the drive, in the repository\'s file and in GitHub\'s list of repositories stays text, and a name no repository can have is never listed', async () => {
  const graph = graphRoutes();
  graph['GET /v1.0/me/drive'] = { id: 'drive1', driveType: 'personal', owner: { user: { displayName: HOSTILE } } };
  const hostileFile = Object.assign({}, driveJson, { items: [{ id: 'h1', name: HOSTILE, drive: 'drive1' }] });
  const hostileRepo = 'acme/x"><img src=x onerror=window.__hostile=2>';
  const routes = repoRoutes({ tracked: true, secret: true, driveJson: hostileFile, newRepos: [{ full_name: hostileRepo, topics: ['symphony'], owner: { login: 'acme' } }] });
  routes['*'] = (req, key) => (key.indexOf('GET /repos/acme/x') === 0 ? { full_name: hostileRepo, default_branch: 'main', topics: ['symphony'], template_repository: { full_name: 'OpenSpineConsortium/symphony-template' } } : undefined);
  const env = await open({ routes, graph });
  const { context, page, errors } = env;
  await ready(page);
  await page.click('#rail-folders');
  await page.waitForFunction(() => /tracks 1 item/.test(document.getElementById('fd-tracked').textContent));
  assert.ok((await page.textContent('#fd-tracked')).indexOf(HOSTILE) >= 0, 'the file\'s name is not shown as text');
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), [HOSTILE]);
  await page.click('#fd-reload');
  await page.waitForFunction(() => /None of the 10 newest repositories/.test(document.getElementById('msg').textContent));
  assert.deepEqual(await page.$$eval('#cp-repo option', (l) => l.map((o) => o.value)), ['acme/demo'], 'a name no repository can have was listed');
  assert.ok(!(await page.evaluate(() => localStorage.getItem('symphony_panel_repos'))).includes('img'));
  await connect(env);
  assert.ok((await page.textContent('#fd-connect-note')).indexOf(HOSTILE) >= 0, 'the drive\'s owner is not shown as text');
  await sleep(400);
  assert.equal(await page.evaluate(() => window.__hostile), undefined, 'a hostile name ran');
  assert.equal(await page.$$eval('img[src="x"]', (l) => l.length), 0, 'a hostile name made an element');
  assert.deepEqual(errors, []);
  await context.close();
});

// what the window and the tab measure, read in the page without Playwright's own scrolling
function layout(page) {
  return page.evaluate(() => {
    const box = (n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    const over = (n) => ({ y: n.scrollHeight - n.clientHeight, x: n.scrollWidth - n.clientWidth });
    const tab = document.getElementById('tab-folders');
    return {
      scrollY: window.scrollY, scrollX: window.scrollX, winH: innerHeight, winW: innerWidth, docW: document.documentElement.scrollWidth,
      deck: box(document.getElementById('console')), stage: box(document.querySelector('.console__stage')), tab: box(tab),
      shown: !tab.hidden, tabOver: over(tab), cols: Array.prototype.map.call(tab.children, over),
    };
  });
}
function assertFits(m, when) {
  console.log('      ' + when + ':', JSON.stringify({ scrollY: m.scrollY, deck: m.deck.bottom, tab: m.tab, cols: m.cols }));
  assert.equal(m.shown, true, when + ': the tab is not open');
  assert.equal(m.scrollY, 0, when + ': the window scrolled to ' + m.scrollY);
  assert.equal(m.scrollX, 0, when + ': the window scrolled sideways');
  assert.ok(m.deck.bottom <= m.winH + 1, when + ': the console runs past the window, to ' + m.deck.bottom);
  assert.ok(m.tab.top >= m.stage.top - 1 && m.tab.bottom <= m.stage.bottom + 1 && m.tab.left >= m.stage.left - 1 && m.tab.right <= m.stage.right + 1, when + ': the tab runs out of the console');
  assert.ok(m.tabOver.y <= 1 && m.tabOver.x <= 1, when + ': the tab overflows itself by ' + JSON.stringify(m.tabOver));
  m.cols.forEach((c, i) => assert.ok(c.y <= 1 && c.x <= 1, when + ': column ' + (i + 1) + ' spills its words by ' + JSON.stringify(c)));
  assert.ok(m.docW <= m.winW, when + ': the page scrolls sideways');
}
await check('N6: at 1366 x 657 the tab keeps its words inside itself, its lists scrolling in their own boxes, and the window stays at 0 after Connect\'s return and after Track', async () => {
  const graph = graphRoutes();
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, name: 'chapter-' + i + '-with-a-long-name-that-a-person-gave-it.docx', file: { mimeType: 'x' }, size: 2000 + i, parentReference: { driveId: 'drive1' }, lastModifiedDateTime: now }));
  graph['GET /v1.0/me/drive/root/children'] = { value: graph['GET /v1.0/me/drive/root/children'].value.concat(many) };
  const env = await open({ viewport: { width: 1366, height: 657 }, graph });
  const { context, page, errors } = env;
  await connect(env);
  await listed(page);
  await tabRead(page);
  assertFits(await layout(page), 'after Connect\'s return');
  // ticked and tracked by the page's own clicks, since Playwright's scroll an element into view
  await page.evaluate(() => { ['a1', 'm39'].forEach((id) => document.querySelector('#fd-items input[data-id="' + id + '"]').click()); });
  await page.evaluate(() => document.getElementById('fd-track').click());
  await page.waitForFunction(() => /acme\/demo tracks 2 items of OneDrive/.test(document.getElementById('msg').textContent));
  await tabRead(page);
  await sleep(300);
  assertFits(await layout(page), 'after Track');
  assert.deepEqual(errors, []);
  await context.close();
});

// every built page and page source of the site, for the old page's name
function siteFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) siteFiles(full, out);
    else if (/\.(html|xml)$/.test(entry.name)) out.push(full);
  }
  return out;
}
await check('N7: Folders is a tab of the console, at /symphony/control/#folders: the old page folders.html is gone from the site and its build, nothing links it, and the address opens the tab', async () => {
  const answer = await fetch(BASE + PAGE + 'folders.html');
  assert.equal(answer.status, 404, 'the site still serves folders.html');
  assert.equal(fs.existsSync(path.join(SITE, 'symphony/control/folders.html')), false, 'the build still holds folders.html');
  assert.equal(fs.existsSync(path.join(SITE, 'tools/pages/symphony/control/folders')), false, 'the page\'s source is still there');
  const naming = siteFiles(SITE, []).filter((f) => fs.readFileSync(f, 'utf8').indexOf('control/folders.html') >= 0);
  assert.deepEqual(naming.map((f) => path.relative(SITE, f)), [], 'a page still links folders.html');
  assert.ok(!configured.includes('folders.html'), 'the script still names folders.html');
  const { context, page, errors } = await open({ path: PAGE + '?repo=acme/demo#folders' });
  await ready(page);
  await page.waitForFunction(() => /tracks no drive yet/.test(document.getElementById('fd-tracked').textContent), null, { timeout: 10000 });
  const wiring = await page.evaluate(() => {
    const rail = document.getElementById('rail-folders');
    const tab = document.getElementById('tab-folders');
    return { tab: rail.getAttribute('data-tab'), controls: rail.getAttribute('aria-controls'), role: rail.getAttribute('role'), panel: tab.getAttribute('data-tab-panel'), labelled: tab.getAttribute('aria-labelledby'), tabRole: tab.getAttribute('role'), shown: !tab.hidden, selected: rail.getAttribute('aria-selected'), hash: location.hash, inRail: !!rail.closest('.console__rail') };
  });
  assert.deepEqual(wiring, { tab: 'folders', controls: 'tab-folders', role: 'tab', panel: 'folders', labelled: 'rail-folders', tabRole: 'tabpanel', shown: true, selected: 'true', hash: '#folders', inRail: true });
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
