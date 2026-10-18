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

// a day counted from today, as the page counts the 90 days of a OneDrive connection
function dayShift(days) {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const driveJson = { provider: 'microsoft', folder: 'papers', items: [{ id: 'f1', name: 'Papers', drive: 'drive1' }, { id: 'b1', name: 'one.docx', drive: 'drive1' }], connected: dayShift(-10) };
const DRIVE_TOKENS = [REFRESH, ACCESS, 'EwB-NEW'];
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
// What the Folders tab reads and writes for a repository, kept as GitHub keeps it, so a read after
// a write sees the write: drive.json per branch, read by ?ref (the default branch without one), a
// write over a file that is there refused without its sha (422) or with another (409), as the
// contents API refuses them; the secret, set once it is saved; the branches, a new one holding the
// default branch's files and one set back by force holding them again; the open pull requests
const DRIVE_BRANCH = 'symphony/drive';
const refused403 = { status: 403, body: { message: 'Resource not accessible by integration' } };
function folderRoutes(repo, o) {
  const r = '/repos/' + repo;
  const tracked = JSON.stringify(o.driveJson || driveJson);
  const files = { main: o.tracked ? { text: tracked, sha: 'd1' } : null };
  const heads = { main: 'abc123' };
  if (o.branchThere) { heads[DRIVE_BRANCH] = 'old999'; files[DRIVE_BRANCH] = { text: '{"left": "from an earlier Track"}', sha: 'shaBranch' }; }
  let secretSet = !!o.secret;
  let written = 0;
  const refOf = (req) => new URL(req.url()).searchParams.get('ref') || 'main';
  const copyOfMain = () => (files.main ? Object.assign({}, files.main) : null);
  return {
    ['GET ' + r]: { full_name: repo, default_branch: 'main', private: !o.public, visibility: o.public ? 'public' : 'private', topics: ['symphony'], id: 123, owner: { id: 77, login: repo.split('/')[0], type: o.org ? 'Organization' : 'User' } },
    ['GET ' + r + '/contents/.github/workflows/drive-sync.yml']: o.noWorkflow ? undefined : { name: 'drive-sync.yml', sha: 'w1', type: 'file' },
    ['GET ' + r + '/contents/.github/symphony/drive.json']: (req) => {
      const f = files[refOf(req)];
      return f ? { raw: f.text, json: { sha: f.sha, content: Buffer.from(f.text).toString('base64'), encoding: 'base64' } } : undefined;
    },
    ['PUT ' + r + '/contents/.github/symphony/drive.json']: (req) => {
      const body = JSON.parse(req.postData());
      if (o.fileFails) return { status: 500, body: { message: 'Server Error' } };
      if (o.protectedMain && body.branch === 'main') return { status: 409, body: { message: 'Changes must be made through a pull request.' } };
      if (!(body.branch in heads)) return { status: 404, body: { message: 'Branch ' + body.branch + ' not found' } };
      const have = files[body.branch];
      if (have && !body.sha) return { status: 422, body: { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' } };
      if ((have && body.sha !== have.sha) || (!have && body.sha)) return { status: 409, body: { message: '.github/symphony/drive.json does not match ' + body.sha } };
      const sha = 'w' + (++written);
      files[body.branch] = { text: Buffer.from(body.content, 'base64').toString('utf8'), sha };
      return { status: have ? 200 : 201, body: { content: { sha } } };
    },
    ['GET ' + r + '/actions/secrets/SYMPHONY_DRIVE_REFRESH']: () => (o.noSecretsRead ? refused403 : secretSet ? { name: 'SYMPHONY_DRIVE_REFRESH', created_at: now, updated_at: now } : undefined),
    ['GET ' + r + '/actions/secrets/public-key']: o.noSecretsRead ? refused403 : { key_id: 'k1', key: PUBLIC_KEY },
    ['PUT ' + r + '/actions/secrets/SYMPHONY_DRIVE_REFRESH']: () => { if (o.noSecrets) return refused403; secretSet = true; return { status: 201, body: {} }; },
    ['GET ' + r + '/git/ref/heads/main']: () => ({ object: { sha: heads.main } }),
    ['POST ' + r + '/git/refs']: (req) => {
      const body = JSON.parse(req.postData());
      const name = body.ref.replace('refs/heads/', '');
      if (name in heads) return { status: 422, body: { message: 'Reference already exists' } };
      heads[name] = body.sha; files[name] = copyOfMain();
      return { status: 201, body: { ref: body.ref, object: { sha: body.sha } } };
    },
    ['PATCH ' + r + '/git/refs/heads/' + DRIVE_BRANCH]: (req) => {
      const body = JSON.parse(req.postData());
      if (o.patchRefused) return { status: 422, body: { message: 'Cannot force-update this branch: a rule protects it' } };
      heads[DRIVE_BRANCH] = body.sha; files[DRIVE_BRANCH] = copyOfMain();
      return { status: 200, body: { ref: 'refs/heads/' + DRIVE_BRANCH, object: { sha: body.sha } } };
    },
    // the console reads the open pull requests too, with no head named
    ['GET ' + r + '/pulls']: (req) => (new URL(req.url()).searchParams.get('head') && o.openPull ? [{ number: 7, html_url: 'https://github.com/' + repo + '/pull/7' }] : []),
    ['POST ' + r + '/pulls']: { status: 201, body: { number: 9, html_url: 'https://github.com/' + repo + '/pull/9' } },
    ['POST ' + r + '/actions/workflows/drive-sync.yml/dispatches']: o.noActions ? refused403 : null,
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
// the console's list of repositories with no sign-in, and with a pasted token
const listedOnly = { symphony_panel_repos: JSON.stringify(['acme/demo']), symphony_panel_repo: 'acme/demo' };
const withToken = Object.assign({ symphony_panel_token: 'github_pat_TEST' }, listedOnly);
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
    const early = o.intercept ? o.intercept(req, key) : undefined;
    let r = early !== undefined ? early : routes[key];
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
  // every line the page writes to the console, of any kind, for the scan of the drive's tokens
  const logs = [];
  page.on('pageerror', (e) => { errors.push(String(e)); logs.push(String(e)); });
  page.on('console', (m) => { logs.push(m.text()); if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
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
  return { context, page, calls, service, authorize, graph, errors, logs };
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
// The drive's tokens go to three places alone: the access token to Microsoft Graph in the
// Authorization header, the refresh token to the service's /drive/token, and the refresh token
// sealed into the secret, which no request carries in the clear. Anything else that holds one of
// them is a leak: a request to GitHub, Graph's addresses, any other request to the service, a line
// of the console, a word of #msg, the page's markup, a field's value, the address or the storage.
// And GitHub's token never goes to Graph.
async function assertNoTokenOutside(env, when) {
  const { page, calls, graph, service, logs } = env;
  const holds = (text) => DRIVE_TOKENS.some((t) => String(text).indexOf(t) >= 0);
  const where = [];
  for (const c of calls) if (holds(c.url) || holds(JSON.stringify(c.body)) || holds(c.auth)) where.push('the request ' + c.key);
  for (const g of graph) {
    if (holds(g.key) || holds(g.query)) where.push('Graph\'s address ' + g.key);
    if (/github_pat|ghu_|ghr_/.test(g.auth)) where.push('GitHub\'s token to Graph');
  }
  for (const s of service) {
    const body = s.body && typeof s.body === 'object' ? Object.assign({}, s.body) : { text: s.body };
    if (s.path === '/drive/token') delete body.refresh_token;
    if (holds(JSON.stringify(body))) where.push('the service\'s ' + s.path);
  }
  for (const l of logs) if (holds(l)) where.push('the console: ' + l.slice(0, 60));
  const inPage = await page.evaluate(() => {
    const kept = [];
    for (let i = 0; i < localStorage.length; i++) kept.push(localStorage.getItem(localStorage.key(i)));
    for (let i = 0; i < sessionStorage.length; i++) kept.push(sessionStorage.getItem(sessionStorage.key(i)));
    return { msgs: window.__msgs || [], markup: document.documentElement.outerHTML, values: Array.prototype.map.call(document.querySelectorAll('input, textarea, select'), (i) => i.value), address: location.href, kept };
  });
  inPage.msgs.forEach((t) => { if (holds(t)) where.push('#msg: ' + t.slice(0, 60)); });
  if (holds(inPage.markup)) where.push('the page\'s markup');
  if (inPage.values.some(holds)) where.push('a field\'s value');
  if (holds(inPage.address)) where.push('the address');
  if (inPage.kept.some(holds)) where.push('the storage');
  assert.deepEqual(where, [], when + ': a drive token reached ' + where.join('; '));
}
// what #msg says after a press is one short paragraph; the links are drawn in the tab
function assertShort(text) {
  assert.ok(text.length <= 300, 'the message runs to ' + text.length + ' characters: ' + text);
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
  // the three steps in the side column, in the order they are taken, the third naming the repository
  await page.waitForFunction(() => document.getElementById('fd-track-head').textContent === '3. Track in acme/demo');
  assert.deepEqual(await page.$$eval('#tab-folders .folders__step h3', (l) => l.map((h) => h.textContent)), ['1. Connect the drive', '2. Make the repository', '3. Track in acme/demo']);
  assert.equal(await page.textContent('#fd-track'), 'Track');
  // the next step's button is the filled one: Connect, while no drive is held
  assert.deepEqual(await page.evaluate(() => [document.getElementById('fd-connect').classList.contains('console__primary'), document.getElementById('fd-track').classList.contains('console__primary')]), [true, false]);
  assert.equal(await page.isHidden('#fd-public-row'), true, 'the public box shows for a private repository');
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
  // with a drive held, the filled button moves on to Track
  assert.deepEqual(await page.evaluate(() => [document.getElementById('fd-connect').classList.contains('console__primary'), document.getElementById('fd-track').classList.contains('console__primary')]), [false, true]);
  await listed(page);
  await assertNoTokenOutside(env, 'after Connect');
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
  // untick from the list: one.docx, in the folder not on view, and notes.docx, whose box is on view
  // and clears with it
  await page.click('#fd-picked li:nth-child(2) button');
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['notes.docx', 'Papers']);
  await page.click('#fd-picked li:first-child button');
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['Papers']);
  assert.equal(await page.isChecked('#fd-items input[data-id="a1"]'), false, 'Untick left the box on view ticked');
  assert.equal(await page.isChecked('#fd-items input[data-id="f1"]'), true);
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), [], 'something was written before Track');
  await assertNoTokenOutside(env, 'after the list');
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
  assert.equal(await page.textContent('#fd-track'), 'Track');
  assert.equal(await page.textContent('#fd-track-head'), '3. Track in acme/demo');
  calls.length = 0;
  // the day the page records is read on either side of the press, so a run across midnight holds
  const dayBefore = new Date().toISOString().slice(0, 10);
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo tracks 2 items of OneDrive in papers\//.test(document.getElementById('msg').textContent));
  const dayAfter = new Date().toISOString().slice(0, 10);
  const text = await msg(page);
  console.log('     ', text);
  assertShort(text);
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
  const written = Buffer.from(file.content, 'base64').toString('utf8');
  const day = JSON.parse(written).connected;
  assert.ok(day === dayBefore || day === dayAfter, 'the connection is dated ' + day + ', not the day Track was pressed');
  assert.equal(written, JSON.stringify({ provider: 'microsoft', folder: 'papers', items: [{ id: 'f1', name: 'Papers', drive: 'drive1' }, { id: 'a1', name: 'notes.docx', drive: 'drive1' }], connected: day }, null, 2) + '\n');
  assert.deepEqual(calls.find((c) => c.key === order[3]).body, { ref: 'main' });
  assert.match(text, /tokens are dropped from this page\. The first sync is queued\.$/);
  // the runs link is the tab's own, drawn once the repository is read again
  await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.$$eval('#fd-tracked a[href="https://github.com/acme/demo/actions/workflows/drive-sync.yml"]', (l) => l.length), 1, 'the tab does not link the runs');
  assert.equal(await storageHolds(page, REFRESH), false);
  assert.equal(service.filter((s) => s.path === '/drive/token').length, 0, 'no renewal was needed');
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive', 'the connection is gone after Track');
  await assertNoTokenOutside(env, 'after Track');
  await page.click('#fd-track');
  await page.waitForFunction(() => /Connect OneDrive first/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter((c) => c.key === order[1]).length, 1, 'a second Track sealed again without a connection');
  assert.deepEqual(errors, []);
  await context.close();
});

// a pasted token's own permission, said in its words
const TOKEN_REFUSED = 'This token cannot reach the secrets of acme/demo (403): it needs the repository permission Secrets: Read and write on acme/demo.';
await check('E: a 403 on the secret\'s write, its public key readable, is said as the token\'s missing permission, and nothing else is written', async () => {
  const env = await open({ noSecrets: true });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction((t) => document.getElementById('msg').textContent === t, TOKEN_REFUSED);
  assert.equal(calls.filter((c) => c.key === 'GET /repos/acme/demo/actions/secrets/public-key').length, 1);
  assert.equal(calls.filter((c) => c.key.startsWith('PUT /repos/acme/demo/contents')).length, 0, 'the file was written');
  assert.equal(calls.filter((c) => /dispatches/.test(c.key)).length, 0, 'the sync was started');
  assert.equal(calls.filter((c) => c.key.startsWith('POST')).length, 0);
  assert.equal(await page.isDisabled('#fd-track'), false);
  assert.deepEqual(errors, []);
  await context.close();
});

// GitHub refusing even to say whether the secret is set: told as the tab opens, before a drive is
// connected, and Track is not offered; a pasted token's words, and SymphonyBoard's, whose page is the
// organization's installations or the person's own
for (const [name, opts, words] of [
  ['E2', {}, TOKEN_REFUSED],
  ['E2b', { app: true, org: true }, 'SymphonyBoard cannot reach the secrets of acme/demo (403): it needs the repository permission Secrets (read and write) accepted on its installation, at https://github.com/organizations/acme/settings/installations; a fine-grained token with Secrets: Read and write does it meanwhile.'],
  ['E2c', { app: true }, 'SymphonyBoard cannot reach the secrets of acme/demo (403): it needs the repository permission Secrets (read and write) accepted on its installation, at https://github.com/settings/installations; a fine-grained token with Secrets: Read and write does it meanwhile.'],
]) {
  await check(name + ': a sign-in ' + (opts.app ? 'with GitHub' + (opts.org ? ' on an organization\'s repository' : '') : 'by a pasted token') + ' that cannot read the repository\'s secrets is told so as the tab opens, before Connect, and Track cannot be pressed even with a drive connected', async () => {
    const env = await open(Object.assign({ noSecretsRead: true }, opts, opts.app ? { storage: { local: listedOnly } } : {}));
    const { context, page, calls, service, errors } = env;
    if (opts.app) {
      await page.waitForSelector('#cp-gate:not(.hidden)');
      await page.click('#cp-signin');
      // the page passes through GitHub's sign-in, a document with no console, on its way back
      await page.waitForFunction(() => /Signed in as tester through GitHub/.test((document.getElementById('cp-who') || {}).textContent || ''), null, { timeout: 15000 });
    }
    await ready(page);
    await page.click('#rail-folders');
    await tabRead(page);
    assert.ok((await page.textContent('#fd-tracked')).indexOf(words) >= 0, 'the refusal is not said as the tab opens: ' + (await page.textContent('#fd-tracked')));
    assert.equal(await page.isDisabled('#fd-track'), true, 'Track can be pressed where the secret cannot be saved');
    assert.deepEqual(service.filter((s) => s.path !== '/drive/config' && s.path !== '/exchange').map((s) => s.path), [], 'the drive was asked for before the refusal was said');
    await connect(env);
    await listed(page);
    await page.check('#fd-items input[data-id="a1"]');
    calls.length = 0;
    await page.$eval('#fd-track', (b) => b.click());
    await sleep(500);
    assert.equal(await page.isDisabled('#fd-track'), true);
    assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), [], 'Track wrote where the secret cannot be saved');
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
  assertShort(text);
  assert.equal(text, 'acme/demo tracks 1 item of OneDrive in papers/, and the drive\'s tokens are dropped from this page. The sync could not be started from here (403: no Actions permission); press "Run workflow" at the runs link in this tab.');
  const writes = calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key);
  assert.deepEqual(writes, ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches']);
  const file = JSON.parse(Buffer.from(calls.find((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json').body.content, 'base64').toString('utf8'));
  assert.deepEqual(file.items, [{ id: 'h1', name: HOSTILE, drive: 'drive1' }], 'the name goes to the file as the drive gave it; the run cleans it');
  // the runs link the words point at is in the tab, once it has read the repository again
  await page.waitForFunction(() => /tracks 1 item/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.$$eval('#fd-tracked a[href="https://github.com/acme/demo/actions/workflows/drive-sync.yml"]', (l) => l.length), 1, 'the tab does not link the runs');
  assert.equal(await storageHolds(page, REFRESH), false);
  await assertNoTokenOutside(env, 'after a refused first run');
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
  for (const bad of ['', 'a/b', '..', 'a..b', 'papers..b', 'papers.', '.papers', 'pa pers.', 'x'.repeat(81), 'a\\b', 'pa:pers']) {
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

// the read of drive.json that the write over it takes its sha from, the last before that write
function shaReadBefore(calls, write) {
  const at = calls.indexOf(write);
  const reads = calls.slice(0, at).filter((c) => c.key === 'GET /repos/acme/demo/contents/.github/symphony/drive.json');
  return reads.length ? new URL(reads[reads.length - 1].url).searchParams.get('ref') : null;
}
await check('D3: Track again on a repository that tracks a drive finds what it tracks ticked already, and writes over drive.json with the sha read from the branch it writes, which GitHub refuses a write over the file without', async () => {
  const env = await open({ tracked: true, secret: true });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['Papers', 'one.docx']);
  assert.equal(await page.inputValue('#fd-folder'), 'papers');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /^acme\/demo tracks 2 items of OneDrive in papers\/, and the drive's tokens are dropped from this page\. The first sync is queued\.$/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  const write = calls.find((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json');
  assert.equal(write.body.sha, 'd1', 'the write over the file carried no sha, or another');
  assert.equal(shaReadBefore(calls, write), 'main', 'the sha was not read from the branch written');
  assert.deepEqual(JSON.parse(Buffer.from(write.body.content, 'base64').toString('utf8')).items, driveJson.items);
  assert.equal(calls.filter((c) => c.key === 'PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH').length, 1, 'the secret was not saved anew');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E5: a drive.json that cannot be written leaves the secret saved and says so, starts no run, keeps the drive for Track to write it again, and that Track writes all three', async () => {
  const opts = { fileFails: true };
  const env = await open(opts);
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /could not be written/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  const text = await msg(page);
  assert.match(text, /^The secret SYMPHONY_DRIVE_REFRESH is saved, but \.github\/symphony\/drive\.json could not be written: .+ Until it is, the half-hourly sync runs with the new secret on the drive\.json the default branch holds, if any\. Press Track to write it again\.$/);
  assert.equal(calls.filter((c) => /dispatches/.test(c.key)).length, 0, 'a run was started with no file written');
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive again', 'the drive was dropped with the file unwritten');
  opts.fileFails = false;
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo tracks 1 item of OneDrive/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches']);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E6: a connection Microsoft gave no refresh token is no connection: it is said once, nothing is held, and Track asks for Connect', async () => {
  const env = await open({ service: { '/drive/connect': { status: 200, body: { access_token: ACCESS, expires_in: 3599, scope: 'Files.ReadWrite' } } } });
  const { context, page, calls, errors } = env;
  await pressConnect(env);
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /Microsoft gave no refresh token/.test(t)), null, { timeout: 15000 });
  await page.waitForFunction(() => location.hash === '#folders', null, { timeout: 10000 });
  const said1 = (await said(page)).filter((t) => /Microsoft gave no refresh token/.test(t));
  assert.deepEqual(said1, ['Microsoft gave no refresh token, so the sync could not run: the consent did not include keeping access when you are away. Press Connect OneDrive to try again.']);
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive');
  assert.match(await page.textContent('#fd-browser'), /Connect OneDrive first/);
  assert.equal(await storageHolds(page, ACCESS), false);
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /Connect OneDrive first/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

const PUBLIC_REFUSED = 'acme/demo is public, so the files you tick, their names and the comments in them would be readable by anyone: tick the box under Track to go on, or choose a private repository in the bar.';
await check('P: a public repository is said beside Track with a box never ticked beforehand; Track writes nothing there until it is ticked, then writes, and the box is asked again after', async () => {
  const env = await open({ public: true });
  const { context, page, calls, errors } = env;
  const box = () => page.evaluate(() => ({ shown: !document.getElementById('fd-public-row').hidden, ticked: document.getElementById('fd-public').checked }));
  await ready(page);
  await page.click('#rail-folders');
  await tabRead(page);
  assert.deepEqual(await box(), { shown: true, ticked: false }, 'as the tab opens');
  await connect(env);
  await listed(page);
  await tabRead(page);
  assert.deepEqual(await box(), { shown: true, ticked: false }, 'after Connect\'s return');
  await page.check('#fd-items input[data-id="a1"]');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction((t) => document.getElementById('msg').textContent === t, PUBLIC_REFUSED, { timeout: 15000 });
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), [], 'Track wrote into a public repository unasked');
  assert.equal(calls.filter((c) => /secrets\/public-key/.test(c.key)).length, 0, 'the secret was on its way before the box was asked');
  assert.equal(await page.isDisabled('#fd-track'), false);
  await page.check('#fd-public');
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo tracks 1 item of OneDrive/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches']);
  await page.waitForFunction(() => /tracks 1 item/.test(document.getElementById('fd-tracked').textContent));
  assert.deepEqual(await box(), { shown: true, ticked: false }, 'after Track the box stays ticked for the next Track');
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
  const life = 'Connected ' + dayShift(-10) + '; a OneDrive refresh token lasts 90 days, so press Connect OneDrive again by ' + dayShift(80) + ', then Track, which replaces the secret and the date.';
  assert.ok(text.indexOf(life) >= 0, 'the connect-again day is not said as ' + life);
  assert.match(text, /The secret SYMPHONY_DRIVE_REFRESH is set, updated/);
  assert.equal(await page.inputValue('#fd-folder'), 'papers');
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['Papers', 'one.docx'], 'what is tracked is ticked already for Connect again');
  calls.length = 0;
  await page.click('#fd-tracked button');
  await page.waitForFunction(() => /drive sync of acme\/demo is queued/.test(document.getElementById('msg').textContent));
  assert.equal(await msg(page), 'The drive sync of acme/demo is queued; its summary says what came down and what went up.');
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
  assert.equal(await msg(page), 'The sync could not be started from here (403: no Actions permission); press "Run workflow" at the runs link in this tab.');
  assert.equal(await page.$$eval('#fd-tracked a[href="https://github.com/acme/demo/actions/workflows/drive-sync.yml"]', (l) => l.length), 1, 'the runs link the words point at is not in the tab');
  assert.deepEqual(errors, []);
  await context.close();
});

// a connection the file dates 100 days back ran out 10 days ago; one dated 80 days back runs out in 10
for (const [name, back, words] of [
  ['F3', -100, 'Connected ' + dayShift(-100) + '; a OneDrive refresh token lasts 90 days, so this connection ran out on ' + dayShift(-10) + ', and every sync since stops before it reaches the drive: press Connect OneDrive, then Track, which replaces the secret and the date.'],
  ['F4', -80, 'Connected ' + dayShift(-80) + '; a OneDrive refresh token lasts 90 days, so press Connect OneDrive again by ' + dayShift(10) + ' (in 10 days), then Track, which replaces the secret and the date.'],
]) {
  await check(name + ': a connection ' + (back < -90 ? 'past its 90 days is said to have run out, and Sync now says the run will stop at the token trade' : 'near its 90 days says how many days are left'), async () => {
    const { context, page, calls, errors } = await open({ tracked: true, secret: true, driveJson: Object.assign({}, driveJson, { connected: dayShift(back) }) });
    await ready(page);
    await page.click('#rail-folders');
    await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
    const text = await page.textContent('#fd-tracked');
    assert.ok(text.indexOf(words) >= 0, 'the tab does not say: ' + words + '\n     it says: ' + text.replace(/\s+/g, ' ').slice(0, 400));
    if (back < -90) {
      calls.length = 0;
      await page.click('#fd-tracked button');
      await page.waitForFunction(() => /is queued/.test(document.getElementById('msg').textContent));
      assert.equal(await msg(page), 'The drive sync of acme/demo is queued, but it will stop at the token trade: the OneDrive connection ran out on ' + dayShift(-10) + '. Press Connect OneDrive, then Track.');
      assert.equal(calls.filter((c) => /dispatches/.test(c.key)).length, 1);
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
}

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
    // a drive connection left pending beside GitHub's return was abandoned, so it is forgotten too
    assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_drive_state')), null, 'the abandoned drive connection was kept');
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
  // and the GitHub sign-in left pending beside it was abandoned, so it is forgotten too
  assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_oauth_state')), null, 'the abandoned GitHub sign-in was kept');
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

const PULL_WORDS = 'acme/demo tracks 1 item of OneDrive in papers/, and the drive\'s tokens are dropped from this page. Its default branch takes only pull requests: merge the one linked in this tab, then press Sync now.';
await check('I: a default branch that takes only pull requests gets the file on symphony/drive, made from its head, with a pull request that points at the tab and is linked in it, and no run is started', async () => {
  const env = await open({ protectedMain: true });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="f1"]');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction((t) => document.getElementById('msg').textContent === t, PULL_WORDS, { timeout: 15000 });
  assertShort(await msg(page));
  const keys = calls.map((c) => c.key);
  const puts = calls.filter((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json');
  assert.deepEqual(puts.map((c) => c.body.branch), ['main', 'symphony/drive'], 'main, then the branch');
  assert.equal(puts[1].body.sha, undefined, 'a sha was sent for a file the new branch does not hold');
  assert.equal(shaReadBefore(calls, puts[1]), 'symphony/drive', 'the branch\'s file was not read on the branch');
  assert.deepEqual(calls.find((c) => c.key === 'POST /repos/acme/demo/git/refs').body, { ref: 'refs/heads/symphony/drive', sha: 'abc123' });
  assert.equal(keys.filter((k) => k.startsWith('PATCH ')).length, 0, 'a new branch was forced');
  const pull = calls.find((c) => c.key === 'POST /repos/acme/demo/pulls').body;
  assert.equal(pull.head, 'symphony/drive');
  assert.equal(pull.base, 'main');
  assert.ok(pull.body.indexOf(BASE + PAGE + '?repo=acme%2Fdemo#folders') >= 0, 'the pull request does not point at the tab: ' + pull.body);
  assert.ok(!/folders\.html/.test(pull.body), 'the pull request names the old page');
  assert.equal(keys.filter((k) => /dispatches/.test(k)).length, 0, 'a run was started with no file on the default branch');
  // the pull request is linked in the tab, which the default branch's file does not show yet
  await tabRead(page);
  await page.waitForFunction(() => !!document.querySelector('#fd-tracked a[href="https://github.com/acme/demo/pull/9"]'), null, { timeout: 10000 });
  assert.match(await page.textContent('#fd-tracked'), /rides this pull request: once it is merged, press Sync now/);
  await assertNoTokenOutside(env, 'after a pull request');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I2: a branch symphony/drive left from an earlier Track is set back to the default branch\'s head by force before the file is written on it, with the sha it then holds, and the pull request already open from it is the one linked, not a second', async () => {
  const env = await open({ protectedMain: true, tracked: true, secret: true, branchThere: true, openPull: true });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /Its default branch takes only pull requests/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  const keys = calls.map((c) => c.key);
  const order = ['POST /repos/acme/demo/git/refs', 'PATCH /repos/acme/demo/git/refs/heads/symphony/drive'];
  assert.deepEqual(keys.filter((k) => order.indexOf(k) >= 0), order, 'the branch was not set back after GitHub said it is there');
  assert.deepEqual(calls.find((c) => c.key === order[1]).body, { sha: 'abc123', force: true });
  const puts = calls.filter((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json');
  assert.deepEqual(puts.map((c) => c.body.branch), ['main', 'symphony/drive']);
  assert.ok(keys.indexOf(order[1]) < calls.indexOf(puts[1]), 'the file went on the branch before it was set back');
  // set back to the default branch's head, the branch holds the default branch's file
  assert.equal(puts[0].body.sha, 'd1');
  assert.equal(puts[1].body.sha, 'd1', 'the write on the branch did not carry the sha the branch holds');
  assert.equal(shaReadBefore(calls, puts[1]), 'symphony/drive', 'the branch\'s file was not read on the branch');
  assert.equal(keys.filter((k) => k === 'POST /repos/acme/demo/pulls').length, 0, 'a second pull request was opened');
  await page.waitForFunction(() => !!document.querySelector('#fd-tracked a[href="https://github.com/acme/demo/pull/7"]'), null, { timeout: 10000 });
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I3: a branch symphony/drive that cannot be set back gets no commit, and the words say the secret is saved, what stopped the file and what to do', async () => {
  const env = await open({ protectedMain: true, branchThere: true, patchRefused: true });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /could not be set back/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  const text = await msg(page);
  assert.match(text, /^The secret SYMPHONY_DRIVE_REFRESH is saved, but \.github\/symphony\/drive\.json could not be written: the branch symphony\/drive is there already and could not be set back to main \(.+\); delete it on GitHub and press Track again\. Until it is/);
  const puts = calls.filter((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json');
  assert.deepEqual(puts.map((c) => c.body.branch), ['main'], 'the file was committed on a branch that was not set back');
  assert.equal(calls.filter((c) => c.key === 'POST /repos/acme/demo/pulls' || /dispatches/.test(c.key)).length, 0);
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
  assert.equal(await page.textContent('#fd-track-head'), '3. Track in acme/fresh');
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
  await assertNoTokenOutside(env, 'after a renewal');
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

await check('N3c: a pasted token GitHub stops taking signs the page out, and the drive with it, so a new token, even for the same account, finds no connection and Track seals nothing', async () => {
  let dead = false;
  const env = await open({ intercept: (req) => (dead && req.headers()['authorization'] === 'Bearer github_pat_TEST' ? { status: 401, body: { message: 'Bad credentials' } } : undefined) });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  dead = true;
  await page.click('#fd-track');
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 15000 });
  dead = false;
  await page.evaluate(() => { document.getElementById('cp-token-way').open = true; });
  await page.fill('#cp-token', 'github_pat_TEST2');
  await page.click('#cp-open');
  await ready(page);
  await page.click('#rail-folders');
  await tabRead(page);
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive', 'the drive outlived the sign-in GitHub ended');
  assert.deepEqual(await page.$$eval('#fd-picked li', (l) => l.length), 0, 'what was ticked under the ended sign-in is still ticked');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /Connect OneDrive first/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0, 'Track wrote after the sign-in ended');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('N4: choosing another repository in the bar reads that repository\'s drive state, shows nothing of the last one\'s, drops a late answer about the last one, and Track writes only there', async () => {
  const thesis = Object.assign({}, driveJson, { folder: 'thesis' });
  const routes = repoRoutes({ per: { 'acme/demo': { tracked: true, secret: true, driveJson: thesis }, 'acme/other': {} } }, ['acme/demo', 'acme/other']);
  const demoFile = routes['GET /repos/acme/demo/contents/.github/symphony/drive.json'];
  let slow = false;
  routes['GET /repos/acme/demo/contents/.github/symphony/drive.json'] = async (req) => { if (slow) await sleep(1500); return demoFile(req); };
  const env = await open({ routes, repos: ['acme/demo', 'acme/other'] });
  const { context, page, calls, errors } = env;
  await ready(page);
  await page.click('#rail-folders');
  await page.waitForFunction(() => /acme\/demo tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['Papers', 'one.docx']);
  assert.equal(await page.inputValue('#fd-folder'), 'thesis');
  const nothingOfDemo = async (when) => {
    const f = await page.evaluate(() => ({ tracked: document.getElementById('fd-tracked').textContent, picked: document.querySelectorAll('#fd-picked li').length, folder: document.getElementById('fd-folder').value, track: document.getElementById('fd-track-head').textContent }));
    assert.match(f.tracked, /acme\/other tracks no drive yet/, when);
    assert.doesNotMatch(f.tracked, /acme\/demo|thesis|Papers/, when + ': the last repository\'s state is shown');
    assert.equal(f.picked, 0, when + ': what the last repository\'s file ticked is still ticked');
    assert.equal(f.folder, 'papers', when + ': the last repository\'s folder is still in the box');
    assert.equal(f.track, '3. Track in acme/other', when);
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

await check('V1: what the person ticks in the drive goes with them to another repository chosen in the bar, what one repository\'s file ticked stays with that repository, and Track there writes only the person\'s own', async () => {
  const routes = repoRoutes({ per: { 'acme/demo': { tracked: true, secret: true }, 'acme/other': {} } }, ['acme/demo', 'acme/other']);
  const env = await open({ routes, repos: ['acme/demo', 'acme/other'] });
  const { context, page, calls, errors } = env;
  const names = () => page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent));
  await connect(env);
  await listed(page);
  await page.waitForFunction(() => /acme\/demo tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  await page.check('#fd-items input[data-id="a1"]');
  assert.deepEqual(await names(), ['Papers', 'one.docx', 'notes.docx']);
  await page.selectOption('#cp-repo', 'acme/other');
  await page.waitForFunction(() => /acme\/other tracks no drive yet/.test(document.getElementById('fd-tracked').textContent), null, { timeout: 10000 });
  assert.deepEqual(await names(), ['notes.docx'], 'the ticks acme/demo\'s file made went along, or the person\'s own did not');
  assert.equal(await page.isChecked('#fd-items input[data-id="f1"]'), false, 'the list still shows acme/demo\'s tick');
  assert.equal(await page.isChecked('#fd-items input[data-id="a1"]'), true);
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/other tracks 1 item of OneDrive/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  const write = calls.find((c) => c.key === 'PUT /repos/acme/other/contents/.github/symphony/drive.json');
  assert.deepEqual(JSON.parse(Buffer.from(write.body.content, 'base64').toString('utf8')).items, [{ id: 'a1', name: 'notes.docx', drive: 'drive1' }]);
  assert.ok(!calls.some((c) => /acme\/demo/.test(c.key) && !c.key.startsWith('GET ')), 'Track wrote to acme/demo');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('V2: on Connect again, a drive list drawn before the repository\'s file has come shows the file\'s ticks once it comes', async () => {
  const routes = repoRoutes({ tracked: true, secret: true });
  const fileRead = routes['GET /repos/acme/demo/contents/.github/symphony/drive.json'];
  let slow = false;
  routes['GET /repos/acme/demo/contents/.github/symphony/drive.json'] = async (req) => { if (slow) await sleep(2500); return fileRead(req); };
  const env = await open({ routes });
  const { context, page, errors } = env;
  await connect(env, { before: async () => { slow = true; } });
  await listed(page);
  assert.ok((await page.textContent('#fd-tracked')).indexOf('Reading ') === 0, 'the file came before the list, so this is not the case checked');
  assert.equal(await page.isChecked('#fd-items input[data-id="f1"]'), false);
  await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent), null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('#fd-items input[data-id="f1"]').checked, null, { timeout: 5000 }).catch(() => {});
  assert.equal(await page.isChecked('#fd-items input[data-id="f1"]'), true, 'the list does not show the tick the file made');
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

await check('N8: with no repository listed yet, the tab connects a drive, finds the repository just made from the template, and tracks into it, in that order', async () => {
  const freshListed = { full_name: 'acme/fresh', default_branch: 'main', private: true, topics: [], id: 125, owner: { id: 77, login: 'acme' } };
  const routes = repoRoutes({ newRepos: [freshListed] }, ['acme/fresh']);
  routes['GET /repos/acme/fresh'] = Object.assign({}, routes['GET /repos/acme/fresh'], { template_repository: { full_name: 'OpenSpineConsortium/symphony-template' } });
  const env = await open({ routes, storage: { local: { symphony_panel_token: 'github_pat_TEST', symphony_panel_repos: '[]' } } });
  const { context, page, calls, errors } = env;
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 15000 });
  await page.waitForFunction(() => /No repository listed yet/.test(document.getElementById('cp-summary').textContent), null, { timeout: 15000 });
  await page.click('#rail-folders');
  await page.waitForFunction(() => /No repository is chosen: choose one in the bar, or make one in step 2\./.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.textContent('#fd-track-head'), '3. Track');
  assert.equal(await page.isDisabled('#fd-track'), true);
  await page.waitForFunction(() => !document.getElementById('fd-connect').disabled, null, { timeout: 15000 });
  await page.click('#fd-connect');
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /OneDrive is connected for this page/.test(t)), null, { timeout: 15000 });
  await page.waitForFunction(() => location.hash === '#folders' && /Connected to OneDrive/.test(document.getElementById('fd-connect-note').textContent), null, { timeout: 15000 });
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  assert.equal(await page.isDisabled('#fd-track'), true, 'Track can be pressed with no repository');
  assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0);
  await page.click('#fd-reload');
  await page.waitForFunction(() => /Added to the list: acme\/fresh\. acme\/fresh is chosen\./.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  await ready(page, 'acme/fresh');
  await tabRead(page, 'acme/fresh');
  assert.equal(await page.textContent('#fd-track-head'), '3. Track in acme/fresh');
  assert.equal(await page.isDisabled('#fd-track'), false);
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive again', 'the drive was dropped when the repository was found');
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['notes.docx']);
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/fresh tracks 1 item of OneDrive in papers\//.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), ['PUT /repos/acme/fresh/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/fresh/contents/.github/symphony/drive.json', 'POST /repos/acme/fresh/actions/workflows/drive-sync.yml/dispatches']);
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

// the longest names GitHub allows run past any button, so the third step's head wraps them and
// Track keeps its place in the side column, at a laptop's size and a phone's
const LONG = 'acme-research-laboratory/the-thesis-chapters-and-their-reviews-for-2026';
for (const [name, viewport] of [['N6b', { width: 1366, height: 657 }], ['N6c', { width: 390, height: 844 }]]) {
  await check(name + ': at ' + viewport.width + ' x ' + viewport.height + ' a long repository name wraps in the third step\'s head, and Track stays inside the side column and the window' + (viewport.width > 900 ? ', in view without scrolling the column' : ''), async () => {
    const env = await open({ viewport, repos: [LONG] });
    const { context, page, errors } = env;
    await ready(page, LONG);
    await page.click('#rail-folders');
    await tabRead(page, LONG);
    const m = await page.evaluate(() => {
      const box = (n) => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
      const head = document.getElementById('fd-track-head');
      return { side: box(document.querySelector('#tab-folders .console__col--side .admin__box')), track: box(document.getElementById('fd-track')), head: head.textContent, headOver: head.scrollWidth - head.clientWidth, winW: innerWidth, winH: innerHeight, docW: document.documentElement.scrollWidth };
    });
    console.log('      ' + JSON.stringify(m));
    assert.equal(m.head, '3. Track in ' + LONG);
    assert.ok(m.headOver <= 1, 'the head runs past its box by ' + m.headOver);
    assert.ok(m.track.width > 0, 'Track is not drawn');
    assert.ok(m.track.left >= m.side.left - 1 && m.track.right <= m.side.right + 1, 'Track runs out of the side column: ' + JSON.stringify(m));
    assert.ok(m.track.right <= m.winW, 'Track runs past the window\'s right edge');
    // at a laptop's size the side column is a box of its own height, and Track is in view in it
    // without scrolling it, as the tab's main action
    if (viewport.width > 900) assert.ok(m.track.top >= m.side.top - 1 && m.track.bottom <= Math.min(m.side.bottom, m.winH) + 1, 'Track is below the side column\'s fold: ' + JSON.stringify({ track: m.track, side: m.side }));
    assert.ok(m.docW <= m.winW, 'the page scrolls sideways');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

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
