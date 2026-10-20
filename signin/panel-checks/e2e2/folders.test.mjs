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
// a stylesheet mutant (css-mutants/, CSS_MUTANT), as signin.test.mjs serves one, for a rule of
// control.css that only this suite's checks hold
let controlCss = null;
if (process.env.CSS_MUTANT) {
  controlCss = fs.readFileSync(SITE + '/assets/css/control.css', 'utf8');
  for (const [a, b] of JSON.parse(fs.readFileSync(process.env.CSS_MUTANT, 'utf8'))) { assert.ok(controlCss.includes(a), 'mutant text not found: ' + a.slice(0, 60)); controlCss = controlCss.replace(a, () => b); }
}
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
  // the organization's secret as GitHub gives it to this repository's workflows, or withholds it
  let orgShared = !!o.orgShared;
  let written = 0;
  const refOf = (req) => new URL(req.url()).searchParams.get('ref') || 'main';
  const copyOfMain = () => (files.main ? Object.assign({}, files.main) : null);
  return {
    ['GET ' + r]: { full_name: repo, default_branch: 'main', private: !o.public, visibility: o.public ? 'public' : 'private', topics: ['symphony'], id: 123, owner: { id: 77, login: repo.split('/')[0], type: o.org ? 'Organization' : 'User' } },
    // the repository's top, as a copy of the template holds it, with the folder it tracks once synced
    ['GET ' + r + '/contents']: [{ name: '.github', type: 'dir' }, { name: 'scripts', type: 'dir' }, { name: 'tools', type: 'dir' }, { name: 'README.md', type: 'file' }].concat(o.tracked ? [{ name: 'papers', type: 'dir' }] : []),
    ['GET ' + r + '/contents/.github/workflows/drive-sync.yml']: o.noWorkflow ? undefined : { name: 'drive-sync.yml', sha: 'w1', type: 'file' },
    // the walk-only workflow a drive-organizing repository carries in place of the sync
    ['GET ' + r + '/contents/.github/workflows/drive-catalog.yml']: o.catalog ? { name: 'drive-catalog.yml', sha: 'c1', type: 'file' } : undefined,
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
    // the switch drive-sync.yml's half-hourly run waits for
    ['GET ' + r + '/actions/variables/SYMPHONY_DRIVE']: o.switchReadRefused ? refused403 : o.switchValue ? { name: 'SYMPHONY_DRIVE', value: o.switchValue } : undefined,
    ['POST ' + r + '/actions/variables']: o.noVariables ? refused403 : o.switchConflict ? { status: 409, body: { message: 'Already exists - Variable already exists' } } : { status: 201, body: {} },
    ['PATCH ' + r + '/actions/variables/SYMPHONY_DRIVE']: o.noVariables ? refused403 : { status: 204, body: {} },
    // the organization's secret and the record of which drive it holds, where the owner is one
    ['GET /orgs/acme']: { login: 'acme', plan: o.orgPlan ? { name: o.orgPlan } : undefined },
    ['GET /orgs/acme/actions/secrets/public-key']: o.orgKeyRefused ? refused403 : { key_id: 'ok1', key: PUBLIC_KEY },
    ['GET /orgs/acme/actions/secrets/SYMPHONY_DRIVE_REFRESH']: o.orgDrive ? { name: 'SYMPHONY_DRIVE_REFRESH', visibility: 'selected' } : undefined,
    ['GET /orgs/acme/actions/secrets/SYMPHONY_DRIVE_REFRESH/repositories']: { total_count: 1, repositories: [{ id: 555, full_name: 'acme/other' }] },
    ['GET /orgs/acme/actions/variables/SYMPHONY_DRIVE_ID']: o.orgDrive ? { name: 'SYMPHONY_DRIVE_ID', value: o.orgDrive } : undefined,
    ['PUT /orgs/acme/actions/secrets/SYMPHONY_DRIVE_REFRESH']: () => { if (o.orgPutRefused) return refused403; orgShared = true; return { status: 201, body: {} }; },
    ['GET ' + r + '/actions/organization-secrets']: () => (o.orgListRefused ? refused403 : { total_count: orgShared && !o.orgWithheld ? 1 : 0, secrets: orgShared && !o.orgWithheld ? [{ name: 'SYMPHONY_DRIVE_REFRESH', visibility: 'selected' }] : [] }),
    ['POST /orgs/acme/actions/variables']: { status: 201, body: {} },
    ['PATCH /orgs/acme/actions/variables/SYMPHONY_DRIVE_ID']: { status: 204, body: {} },
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
      { id: 'a1', name: 'notes.docx', file: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, size: 1234, parentReference: { driveId: 'drive1', path: '/drive/root:' }, webUrl: 'https://onedrive.live.com/?id=a1', lastModifiedDateTime: now },
      { id: 'h1', name: HOSTILE, file: { mimeType: 'text/plain' }, size: 10, parentReference: { driveId: 'drive1', path: '/drive/root:' }, webUrl: 'https://onedrive.live.com/?id=h1', lastModifiedDateTime: now },
    ] },
    'GET /v1.0/me/drive/items/f1/children': { value: [
      { id: 'b1', name: 'one.docx', file: { mimeType: 'x' }, size: 2048, parentReference: { driveId: 'drive1', path: '/drive/root:/Papers' }, webUrl: 'https://onedrive.live.com/?id=b1', lastModifiedDateTime: now },
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

// Globus's stand-ins: the collection's id and HTTPS server, and one refresh token per service
const COLLECTION = '11111111-2222-4333-8444-555555555555';
const HTTPS_SERVER = 'https://m-test.example.test';
const GL_REFRESH_T = 'AgREFRESH-transfer-stand-in';
const GL_REFRESH_H = 'AgREFRESH-https-stand-in';
const GL_ACCESS_T = 'AgACCESS-transfer-stand-in';
const GL_ACCESS_H = 'AgACCESS-https-stand-in';
function globusTokens(body, code) {
  if (body.code !== code && !/^GLCODE/.test(body.code || '')) return { status: 401, body: { error: 'invalid_grant', error_description: 'no such code' } };
  const scope = body.scope || '';
  return { access_token: 'AgACCESS-auth', resource_server: 'auth.globus.org', expires_in: 172800, refresh_token: 'AgREFRESH-auth', token_type: 'Bearer', scope: 'openid profile', other_tokens: [
    { access_token: GL_ACCESS_T, resource_server: 'transfer.api.globus.org', expires_in: 172800, refresh_token: GL_REFRESH_T, token_type: 'Bearer', scope: 'urn:globus:auth:scope:transfer.api.globus.org:all' },
    { access_token: GL_ACCESS_H, resource_server: COLLECTION, expires_in: 172800, refresh_token: GL_REFRESH_H, token_type: 'Bearer', scope: 'https://auth.globus.org/scopes/' + COLLECTION + '/https' },
  ] };
}
const GRID = (at, rows) => ({ DATA_TYPE: 'file_list', endpoint: COLLECTION, path: at, absolute_path: at, DATA: rows, length: rows.length, total: rows.length, rename_supported: false, symlink_supported: true });
function transferRoutes() {
  return {
    '/v0.10/endpoint_search': { DATA: [{ id: 'other-id', display_name: 'wsugrid#globus-old', canonical_name: 'x' }, { id: COLLECTION, display_name: 'wsugrid#globus', canonical_name: 'wsugrid#globus' }] },
    ['/v0.10/endpoint/' + COLLECTION]: { id: COLLECTION, display_name: 'wsugrid#globus', https_server: HTTPS_SERVER, default_directory: '/home/go2432/', high_assurance: false },
    ['/v0.10/operation/endpoint/' + COLLECTION + '/ls']: (call) => {
      const at = call.query.path;
      if (at === '/home/go2432/') return GRID(at, [
        { DATA_TYPE: 'file', name: 'data', type: 'dir', size: 4096, last_modified: '2026-10-20 10:00:00+00:00', permissions: '0755', user: 'go2432', group: 'osc' },
        { DATA_TYPE: 'file', name: 'preview.mp4', type: 'file', size: 123456789, last_modified: '2026-10-19 09:30:00+00:00', permissions: '0644', user: 'go2432', group: 'osc' },
        { DATA_TYPE: 'file', name: 'notes.txt', type: 'file', size: 19, last_modified: '2026-10-18 08:00:00+00:00', permissions: '0644', user: 'go2432', group: 'osc' },
        { DATA_TYPE: 'file', name: HOSTILE, type: 'file', size: 1, last_modified: '2026-10-18 08:00:00+00:00', permissions: '0644', user: 'go2432', group: 'osc' },
      ]);
      if (at === '/home/go2432/data/') return GRID(at, [{ DATA_TYPE: 'file', name: 'clip one.mkv', type: 'file', size: 10, last_modified: '2026-10-18 08:00:00+00:00', permissions: '0644', user: 'go2432', group: 'osc' }]);
      if (at === '/') return GRID(at, [{ DATA_TYPE: 'file', name: 'home', type: 'dir', size: 4096, last_modified: '2026-10-18 08:00:00+00:00', permissions: '0755', user: 'root', group: 'root' }, { DATA_TYPE: 'file', name: 'rs', type: 'dir', size: 4096, last_modified: '2026-10-18 08:00:00+00:00', permissions: '0755', user: 'root', group: 'root' }]);
      if (at === '/home/') return GRID(at, [{ DATA_TYPE: 'file', name: 'go2432', type: 'dir', size: 4096, last_modified: '2026-10-18 08:00:00+00:00', permissions: '0755', user: 'go2432', group: 'osc' }]);
      return GRID(at, []);
    },
  };
}
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
  if (controlCss !== null) await context.route('**/assets/css/control.css*', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: controlCss }));
  const script = o.script || (o.globusClient ? configured.replace("var GLOBUS_CLIENT = '';", "var GLOBUS_CLIENT = '" + o.globusClient + "';") : configured);
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  // Globus Auth: its sign-in page straight back with a code and the state, its token endpoint
  // answering the page's own exchange, and its userinfo; the Transfer API by a table; and the
  // collection's HTTPS server, which the preview pane fetches from with the collection's token
  const globus = [];
  const GCORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  await context.route('https://auth.globus.org/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: GCORS, body: '' });
    if (u.pathname === '/v2/oauth2/authorize') {
      authorize.push(u);
      const back = u.searchParams.get('redirect_uri') + (o.denied
        ? '?error=access_denied&error_description=' + encodeURIComponent('The user has denied access.') + '&state=' + encodeURIComponent(u.searchParams.get('state'))
        : '?code=GLCODE' + authorize.length + '&state=' + encodeURIComponent(o.wrongState ? 'not-the-state' : u.searchParams.get('state')));
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify(back) + ')</script>' });
    }
    const body = Object.fromEntries(new URLSearchParams(req.postData() || ''));
    const call = { path: u.pathname, query: u.search, body, auth: req.headers()['authorization'] || '', type: req.headers()['content-type'] || '', origin: req.headers()['origin'] || '' };
    globus.push(call);
    let r = o.auth && o.auth[u.pathname] ? o.auth[u.pathname](call) : undefined;
    if (r === undefined && u.pathname === '/v2/oauth2/token' && body.grant_type === 'authorization_code') r = globusTokens(body, 'GLCODE1');
    if (r === undefined && u.pathname === '/v2/oauth2/token' && body.grant_type === 'refresh_token') r = { access_token: 'AG-renewed-' + body.refresh_token, resource_server: body.refresh_token === GL_REFRESH_T ? 'transfer.api.globus.org' : body.refresh_token === GL_REFRESH_H ? COLLECTION : 'auth.globus.org', expires_in: 172800, token_type: 'Bearer' };
    if (r === undefined && u.pathname === '/v2/oauth2/userinfo') r = { preferred_username: 'go2432@wayne.edu', name: 'Greg' };
    if (r === undefined) return route.fulfill({ status: 404, headers: GCORS, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
    if (r && r.status) return route.fulfill({ status: r.status, headers: GCORS, contentType: 'application/json', body: JSON.stringify(r.body || {}) });
    return route.fulfill({ status: 200, headers: GCORS, contentType: 'application/json', body: JSON.stringify(r) });
  });
  const transferTable = o.transfer || transferRoutes();
  await context.route('https://transfer.api.globus.org/**', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: GCORS, body: '' });
    const call = { path: u.pathname, query: Object.fromEntries(u.searchParams), auth: req.headers()['authorization'] || '' };
    globus.push(call);
    let r = transferTable[u.pathname];
    if (typeof r === 'function') r = r(call);
    if (r === undefined && transferTable['*']) r = transferTable['*'](call);
    if (r === undefined) return route.fulfill({ status: 404, headers: GCORS, contentType: 'application/json', body: JSON.stringify({ code: 'ClientError.NotFound', message: 'not found' }) });
    if (r && r.status) return route.fulfill({ status: r.status, headers: GCORS, contentType: 'application/json', body: JSON.stringify(r.body || {}) });
    return route.fulfill({ status: 200, headers: GCORS, contentType: 'application/json', body: JSON.stringify(r) });
  });
  await context.route(HTTPS_SERVER + '/**', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: GCORS, body: '' });
    globus.push({ path: u.pathname, query: u.search, auth: req.headers()['authorization'] || '', https: true });
    if (/\.txt$/.test(u.pathname)) return route.fulfill({ status: 200, headers: GCORS, contentType: 'text/plain', body: 'hello from the grid' });
    return route.fulfill({ status: 200, headers: GCORS, contentType: 'application/octet-stream', body: 'bytes' });
  });
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
    let body = null;
    if (req.method() !== 'GET') { try { body = req.postDataJSON(); } catch (e) { body = req.postData(); } }
    const call = { key, auth: req.headers()['authorization'] || '', query: u.search, body, type: req.headers()['content-type'] || '' };
    graph.push(call);
    // an entry may be a function of the call, for a drive the page writes to
    let r = graphTable[/skiptoken/.test(u.search) ? key + '?page2' : key];
    if (typeof r === 'function') r = r(call);
    if (r === undefined && graphTable['*']) r = graphTable['*'](call);
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'itemNotFound', message: 'not found' } }) });
    if (r === null) return route.fulfill({ status: 204, body: '' });
    if (r && r.status) return route.fulfill({ status: r.status, contentType: 'application/json', body: r.status === 202 ? '' : JSON.stringify(r.body || {}) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  });
  // an upload session's own address, which takes the pieces of a large file with no token
  const pieces = [];
  await context.route('https://upload.example.test/**', (route) => {
    const req = route.request();
    pieces.push({ range: req.headers()['content-range'] || '', auth: req.headers()['authorization'] || '', size: (req.postDataBuffer() || Buffer.alloc(0)).length });
    const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers()['content-range'] || '');
    const last = range && Number(range[2]) + 1 === Number(range[3]);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Range', 'Access-Control-Allow-Methods': 'PUT' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    return route.fulfill({ status: last ? 201 : 202, headers: cors, contentType: 'application/json', body: JSON.stringify(last ? { id: 'big1', name: 'big.bin' } : { nextExpectedRanges: [String(Number(range[2]) + 1) + '-'] }) });
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
  return { context, page, calls, service, authorize, graph, pieces, errors, logs, globus };
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
  await openClouds(page);
  await page.click('#fd-connect');
}
// a whole connection: pressed, come back, exchanged, and the tab open on the drive by itself; every
// Connect names the console's own address to Microsoft and to /drive/connect
async function connect(env, o) {
  const { page, authorize, service } = env;
  const before = authorize.length;
  await pressConnect(env, o);
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /OneDrive is connected, and stays connected on this browser/.test(t)), null, { timeout: 15000 });
  await page.waitForFunction(() => location.hash === '#folders' && /Connected to OneDrive/.test(document.getElementById('fd-connect-note').textContent), null, { timeout: 15000 });
  const sent = authorize[before];
  assert.equal(sent.origin + sent.pathname, MS_AUTHORIZE);
  assert.equal(sent.searchParams.get('redirect_uri'), CONSOLE, 'Microsoft was sent another address than the console\'s');
  const exchanges = service.filter((s) => s.path === '/drive/connect');
  assert.equal(exchanges[exchanges.length - 1].body.redirect_uri, CONSOLE, '/drive/connect was sent another address than the console\'s');
}
// The connection the page keeps on this browser by GitHub account: the refresh token and the
// drive's name, never an access token. storageHolds looks everywhere else.
const KEPT = 'symphony_panel_drive_kept';
function keptDrive(page, login) {
  return page.evaluate(([k, l]) => { const m = JSON.parse(localStorage.getItem(k) || '{}'); return m[l] || null; }, [KEPT, login || 'tester']);
}
function storageHolds(page, text) {
  return page.evaluate(([t, kept]) => {
    const all = [];
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i) !== kept) all.push(localStorage.getItem(localStorage.key(i)));
    for (let i = 0; i < sessionStorage.length; i++) all.push(sessionStorage.getItem(sessionStorage.key(i)));
    return all.some((v) => v && v.indexOf(t) >= 0);
  }, [text, KEPT]);
}
// The drive's tokens go to three places alone: the access token to Microsoft Graph in the
// Authorization header, the refresh token to the service's /drive/token, and the refresh token
// sealed into the secret, which no request carries in the clear. Anything else that holds one of
// them is a leak: a request to GitHub, Graph's addresses, any other request to the service, a line
// of the console, a word of #msg, the page's markup, a field's value, the address or the storage,
// but for the refresh token in the connection kept on this browser, which holds no access token.
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
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i) !== 'symphony_panel_drive_kept') kept.push(localStorage.getItem(localStorage.key(i)));
    for (let i = 0; i < sessionStorage.length; i++) kept.push(sessionStorage.getItem(sessionStorage.key(i)));
    return { connection: localStorage.getItem('symphony_panel_drive_kept') || '', msgs: window.__msgs || [], markup: document.documentElement.outerHTML, values: Array.prototype.map.call(document.querySelectorAll('input, textarea, select'), (i) => i.value), address: location.href, kept };
  });
  inPage.msgs.forEach((t) => { if (holds(t)) where.push('#msg: ' + t.slice(0, 60)); });
  if (holds(inPage.markup)) where.push('the page\'s markup');
  if (inPage.values.some(holds)) where.push('a field\'s value');
  if (holds(inPage.address)) where.push('the address');
  if (inPage.kept.some(holds)) where.push('the storage');
  if (DRIVE_TOKENS.some((t) => t !== REFRESH && inPage.connection.indexOf(t) >= 0)) where.push('the kept connection, an access token');
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
  // the drives' dialog says it too, since the head is behind it
  assert.match(await page.textContent('#fd-cloud-note'), /has not set OneDrive up/);
  // the Track dialog's two steps, in the order they are taken, the second naming the repository
  await page.waitForFunction(() => document.getElementById('fd-track-head').textContent === 'Track in acme/demo');
  assert.deepEqual(await page.$$eval('#dlg-track .folders__step h3', (l) => l.map((h) => h.textContent)), ['Track in acme/demo']);
  // a new repository is a fold under Track, closed, so the one in the bar is the way Track goes
  assert.equal(await page.textContent('#fd-new > summary'), 'Need a new repository?');
  assert.equal(await page.evaluate(() => document.getElementById('fd-new').open), false);
  assert.equal(await page.textContent('#fd-track'), 'Track');
  // the next step's button is the filled one: Connect, while no drive is held
  assert.deepEqual(await page.evaluate(() => [document.getElementById('fd-connect').classList.contains('console__primary'), document.getElementById('fd-track').classList.contains('console__primary')]), [true, false]);
  assert.equal(await page.isHidden('#fd-public-row'), true, 'the public box shows for a private repository');
  assert.equal(service.filter((s) => s.path === '/drive/config').length, 1);
  assert.equal(service.filter((s) => s.path !== '/drive/config').length, 0);
  assert.equal(authorize.length, 0);
  await page.waitForFunction(() => /Add a cloud drive/.test(document.getElementById('fd-browser').textContent), null, { timeout: 8000 });
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
  assert.match(await page.textContent('#fd-connect-note'), /kept on this browser for tester\./);
  assert.deepEqual(await keptDrive(page), { provider: 'microsoft', refresh: REFRESH, connected: today, owner: 'Greg (personal)', id: 'drive1', type: 'personal' }, 'the connection is not kept on this browser for the account');
  assert.equal(await page.isHidden('#fd-forget'), false, 'Forget OneDrive is not offered');
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
  assert.match(root.query, /\$select=id,name,folder,file,size,parentReference,lastModifiedDateTime,webUrl/);
  assert.match(root.query, /\$top=200/);
  assert.equal(root.auth, 'Bearer ' + ACCESS);
  const rows = await page.$$eval('#fd-items tbody tr', (trs) => trs.map((tr) => tr.children[1].textContent + ' | ' + tr.children[3].textContent + ' | ' + tr.children[4].textContent));
  console.log('     ', JSON.stringify(rows));
  assert.equal(rows[0], 'Papers | File folder | 2 items', 'folders first');
  assert.ok(rows.includes('notes.docx | Word document | 1 KB'), 'the Word file is listed with its type and size');
  assert.equal(await page.evaluate(() => !!window.__hostile), false, 'the hostile name ran');
  assert.equal(await page.$$eval('#fd-items img', (l) => l.length), 0, 'the hostile name made an element');
  assert.ok(rows.includes(HOSTILE + ' | File | 10 B'), 'the hostile name is shown as text');
  // tick a file in the root, open the folder, tick a file there, go up, tick the folder
  await page.check('#fd-items input[data-id="a1"]');
  await page.dblclick('#fd-items tbody tr:first-child .fx__name');
  await page.waitForFunction(() => /one\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  assert.equal(graph.filter((g) => g.key === 'GET /v1.0/me/drive/items/f1/children').length, 2, 'the @odata.nextLink page was not asked for');
  assert.match(await page.textContent('#fd-items'), /two\.docx/, 'the second page is not listed');
  assert.match(await page.textContent('.folders__crumbs'), /OneDrive\u203aPapers/);
  await page.check('#fd-items input[data-id="b1"]');
  await page.click('.folders__crumbs button');
  await page.waitForFunction(() => /notes\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
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

await check('D: Track seals the refresh token for the public key, writes drive.json exactly, starts the sync, and keeps the connection on this browser', async () => {
  const env = await open({});
  const { context, page, calls, service, errors } = env;
  await connect(env);
  await listed(page);
  await page.check('#fd-items input[data-id="f1"]');
  await page.check('#fd-items input[data-id="a1"]');
  await page.fill('#fd-folder', 'papers');
  assert.equal(await page.textContent('#fd-track'), 'Track');
  assert.equal(await page.textContent('#fd-track-head'), 'Track in acme/demo');
  calls.length = 0;
  await page.click('#fd-track-open');
  // the day the page records is read on either side of the press, so a run across midnight holds
  const dayBefore = new Date().toISOString().slice(0, 10);
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo tracks 2 items of OneDrive in papers\//.test(document.getElementById('msg').textContent));
  assert.equal(await page.evaluate(() => document.getElementById('dlg-track').open), false, 'the steps stayed open after Track was done');
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
  // the half-hourly run's switch is set on, after the file and before the first run
  const sw = keys.indexOf('POST /repos/acme/demo/actions/variables');
  assert.ok(sw > keys.indexOf(order[2]) && sw < keys.indexOf(order[3]), 'the switch was not set between the file and the run');
  assert.deepEqual(calls[sw].body, { name: 'SYMPHONY_DRIVE', value: 'on' });
  assert.equal(keys.filter((k) => k.indexOf('/orgs/') >= 0).length, 0, 'a personal account\'s repository touched an organization');
  assert.match(text, /OneDrive stays connected on this browser\. The first sync is queued\.$/);
  // the runs link is the tab's own, drawn once the repository is read again
  await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.$$eval('#fd-tracked a[href="https://github.com/acme/demo/actions/workflows/drive-sync.yml"]', (l) => l.length), 1, 'the tab does not link the runs');
  assert.equal(await storageHolds(page, REFRESH), false);
  assert.equal(service.filter((s) => s.path === '/drive/token').length, 0, 'no renewal was needed');
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive again', 'the connection did not outlive Track');
  assert.equal((await keptDrive(page)).refresh, REFRESH, 'the connection kept on this browser is gone after Track');
  await assertNoTokenOutside(env, 'after Track');
  // the kept connection serves the next Track with no Connect, which seals the secret once more
  await page.click('#fd-track-open');
  await page.click('#fd-track');
  for (let i = 0; i < 150 && calls.filter((c) => c.key === order[3]).length < 2; i++) await sleep(100);
  await page.waitForFunction(() => document.getElementById('dlg-track').open === false);
  assert.equal(calls.filter((c) => c.key === order[1]).length, 2, 'a second Track did not seal again with the kept connection');
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
  assert.deepEqual(writes, ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/variables', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches']);
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
  assert.equal(text, 'acme/demo tracks 1 item of OneDrive in papers/, and OneDrive stays connected on this browser. The sync could not be started from here (403: no Actions permission); press "Run workflow" at the runs link in Track in a repository.');
  const writes = calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key);
  assert.deepEqual(writes, ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/variables', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches']);
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

await check('E7: a folder the repository already holds at its top, in any case, is refused before the secret is sealed, and one of its own is tracked', async () => {
  const env = await open({});
  const { context, page, calls, errors } = env;
  await connect(env);
  await tabRead(page);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  for (const taken of ['scripts', 'Tools', 'README.md']) {
    calls.length = 0;
    await page.$eval('#fd-folder', (box, v) => { box.value = v; }, taken);
    await page.$eval('#msg', (m) => { m.textContent = ''; });
    await page.click('#fd-track');
    await page.waitForFunction(() => /already has .+ at its top/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
    console.log('     ' + taken + ':', await page.textContent('#msg'));
    assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), [], 'a write for the folder ' + taken);
    assert.equal(calls.filter((c) => c.key === 'GET /repos/acme/demo/actions/secrets/public-key').length, 0, 'the key was read for the folder ' + taken);
    assert.equal(await page.isDisabled('#fd-track'), false, 'Track stayed pressed after the refusal');
  }
  await page.$eval('#fd-folder', (box) => { box.value = 'papers'; });
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo tracks 1 item of OneDrive in papers\//.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E8: an item the repository tracked from another OneDrive than the one connected is refused by name before anything is written, and unticked it tracks', async () => {
  const other = Object.assign({}, driveJson, { items: [{ id: 'z9', name: 'elsewhere.docx', drive: 'DRIVE9' }] });
  // the sync switched on already, so opening the tab writes nothing that races the count of writes below
  const env = await open({ tracked: true, secret: true, driveJson: other, switchValue: 'on' });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.waitForFunction(() => /tracks 1 item/.test(document.getElementById('fd-tracked').textContent));
  // the connected drive's own id is read with its owner's name, which the connection's line shows
  await page.waitForFunction(() => /Connected to OneDrive as Greg/.test(document.body.textContent), null, { timeout: 8000 });
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /from another OneDrive than the one connected now \(elsewhere\.docx\)/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), []);
  await page.click('#fd-picked li:has(code:text-is("elsewhere.docx")) button');
  await page.check('#fd-items input[data-id="a1"]');
  await page.$eval('#msg', (m) => { m.textContent = ''; });
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo tracks 1 item of OneDrive in papers\//.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  const write = calls.find((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json');
  assert.deepEqual(JSON.parse(Buffer.from(write.body.content, 'base64').toString('utf8')).items.map((i) => i.id), ['a1']);
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
  await page.waitForFunction(() => /^acme\/demo tracks 2 items of OneDrive in papers\/, and OneDrive stays connected on this browser\. The first sync is queued\.$/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
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
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/variables', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches']);
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
  // the explorer asks for the drive, and never for a saved catalog
  await page.waitForFunction(() => /Add a cloud drive/.test(document.getElementById('fd-browser').textContent), null, { timeout: 8000 });
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
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/demo/contents/.github/symphony/drive.json', 'POST /repos/acme/demo/actions/variables', 'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches']);
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
  assert.equal(await msg(page), 'The sync could not be started from here (403: no Actions permission); press "Run workflow" at the runs link in Track in a repository.');
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

const PULL_WORDS = 'acme/demo tracks 1 item of OneDrive in papers/, and OneDrive stays connected on this browser. Its default branch takes only pull requests: merge the one linked in Track in a repository, then press Sync now there.';
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
  await openNew(page);
  await page.click('#fd-reload');
  await page.waitForFunction(() => /Added to the list: acme\/fresh\. acme\/fresh is chosen\./.test(document.getElementById('msg').textContent));
  const list = calls.find((c) => c.key === 'GET /user/repos');
  assert.ok(list && /sort=created/.test(list.url) && /direction=desc/.test(list.url), 'the newest repositories were not asked for');
  await ready(page, 'acme/fresh');
  assert.equal(await page.inputValue('#cp-repo'), 'acme/fresh');
  assert.equal(await page.evaluate(() => location.search), '?repo=acme%2Ffresh');
  assert.equal(await page.textContent('#cp-repo-shown'), 'acme/fresh');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('symphony_panel_repos'))), ['acme/demo', 'acme/fresh']);
  assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_repo')), 'acme/fresh');
  await page.waitForFunction(() => /acme\/fresh tracks no drive yet/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.textContent('#fd-track-head'), 'Track in acme/fresh');
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
  await page.dblclick('#fd-items tbody tr:first-child .fx__name');
  await page.waitForFunction(() => /one\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
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
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /OneDrive is connected, and stays connected on this browser/.test(t)), null, { timeout: 15000 });
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
  await page.waitForFunction(() => /Add a cloud drive/.test(document.getElementById('fd-browser').textContent), null, { timeout: 8000 });
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /Connect OneDrive first/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0, 'Track wrote after Forget the token');
  assert.equal(await storageHolds(page, REFRESH), false);
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), KEPT), null, 'Forget the token left the connection kept on this browser');
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

await check('N3c: a pasted token GitHub stops taking signs the page out and drops the drive from its memory, and a new token for the same account finds the connection kept on this browser, with nothing ticked', async () => {
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
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive again', 'the connection kept for the account was not found again');
  assert.deepEqual(await page.$$eval('#fd-picked li', (l) => l.length), 0, 'what was ticked under the ended sign-in is still ticked');
  await listed(page);
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /Tick at least one file or folder/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0, 'Track wrote with nothing ticked');
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
  assert.deepEqual(writes, ['PUT /repos/acme/other/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/other/contents/.github/symphony/drive.json', 'POST /repos/acme/other/actions/variables', 'POST /repos/acme/other/actions/workflows/drive-sync.yml/dispatches']);
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
  await openNew(page);
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
  await page.waitForFunction(() => /No repository is chosen: choose one in the bar, or make one under Need a new repository\? below\./.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.textContent('#fd-track-head'), 'Track');
  assert.equal(await page.isDisabled('#fd-track'), true);
  await page.waitForFunction(() => !document.getElementById('fd-connect').disabled, null, { timeout: 15000 });
  await openClouds(page);
  await page.click('#fd-connect');
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /OneDrive is connected, and stays connected on this browser/.test(t)), null, { timeout: 15000 });
  await page.waitForFunction(() => location.hash === '#folders' && /Connected to OneDrive/.test(document.getElementById('fd-connect-note').textContent), null, { timeout: 15000 });
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  assert.equal(await page.isDisabled('#fd-track'), true, 'Track can be pressed with no repository');
  assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0);
  await openNew(page);
  await page.click('#fd-reload');
  await page.waitForFunction(() => /Added to the list: acme\/fresh\. acme\/fresh is chosen\./.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  await ready(page, 'acme/fresh');
  await tabRead(page, 'acme/fresh');
  assert.equal(await page.textContent('#fd-track-head'), 'Track in acme/fresh');
  assert.equal(await page.isDisabled('#fd-track'), false);
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive again', 'the drive was dropped when the repository was found');
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['notes.docx']);
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/fresh tracks 1 item of OneDrive in papers\//.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), ['PUT /repos/acme/fresh/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/fresh/contents/.github/symphony/drive.json', 'POST /repos/acme/fresh/actions/variables', 'POST /repos/acme/fresh/actions/workflows/drive-sync.yml/dispatches']);
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

// the longest names GitHub allows run past any button, so the Track step's head wraps them and
// Track keeps its place in the Track dialog, at a laptop's size and a phone's
const LONG = 'acme-research-laboratory/the-thesis-chapters-and-their-reviews-for-2026';
for (const [name, viewport] of [['N6b', { width: 1366, height: 657 }], ['N6c', { width: 390, height: 844 }]]) {
  await check(name + ': at ' + viewport.width + ' x ' + viewport.height + ' a long repository name wraps in the Track step\'s head, and Track stays inside the Track dialog and the window', async () => {
    const env = await open({ viewport, repos: [LONG] });
    const { context, page, errors } = env;
    await ready(page, LONG);
    await page.click('#rail-folders');
    await tabRead(page, LONG);
    await page.click('#fd-track-open');
    await page.waitForFunction(() => document.getElementById('dlg-track').open);
    await page.evaluate(() => document.getElementById('fd-track').scrollIntoView({ block: 'nearest' }));
    const m = await page.evaluate(() => {
      const box = (n) => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
      const head = document.getElementById('fd-track-head');
      return { dialog: box(document.getElementById('dlg-track')), track: box(document.getElementById('fd-track')), head: head.textContent, headOver: head.scrollWidth - head.clientWidth, winW: innerWidth, winH: innerHeight, docW: document.documentElement.scrollWidth };
    });
    console.log('      ' + JSON.stringify(m));
    assert.equal(m.head, 'Track in ' + LONG);
    assert.ok(m.headOver <= 1, 'the head runs past its box by ' + m.headOver);
    assert.ok(m.track.width > 0, 'Track is not drawn');
    assert.ok(m.track.left >= m.dialog.left - 1 && m.track.right <= m.dialog.right + 1, 'Track runs out of the dialog: ' + JSON.stringify(m));
    assert.ok(m.track.right <= m.winW && m.track.bottom <= m.winH + 1, 'Track runs past the window: ' + JSON.stringify(m));
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
// what the page asks the browser to open, recorded instead of opened: an Office address the anchor
// carries, and a window.open of OneDrive's own page
async function recordOpens(page) {
  await page.evaluate(() => {
    window.__opened = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (/^ms-/.test(this.href)) { window.__opened.push(this.getAttribute('href')); return; } return click.call(this); };
    window.open = (url) => { window.__opened.push('window:' + url); return null; };
  });
}
await check('X1: the drive is drawn as an explorer: a folder tree, an address with Back, Forward and Up, Details with Name, Date modified, Type and Size, and a status bar', async () => {
  const env = await open({});
  const { context, page, errors } = env;
  await connect(env);
  await listed(page);
  const heads = await page.$$eval('#fd-items thead th', (l) => l.map((th) => th.textContent.trim()));
  assert.deepEqual(heads, ['', 'Name \u25b4', 'Date modified', 'Type', 'Size']);
  await page.waitForFunction(() => /Papers/.test(document.getElementById('fd-tree').textContent));
  assert.deepEqual(await page.$$eval('#fd-tree .fx__nodename', (l) => l.map((n) => n.textContent)), ['OneDrive', 'Papers'], 'the tree lists the drive and its one folder');
  assert.match(await page.textContent('#fd-status'), /^3 items/);
  const tools = await page.$$eval('.fx__bar .fx__tool', (l) => l.map((b) => b.getAttribute('aria-label') + (b.disabled ? ' (off)' : '')));
  assert.deepEqual(tools.slice(0, 4), ['Back (Alt+Left) (off)', 'Forward (Alt+Right) (off)', 'Up to the folder above (Backspace) (off)', 'Refresh (F5)']);
  // the tree opens a folder, and Back, Forward and Up walk the path
  await page.click('#fd-tree .fx__nodename:has-text("Papers")');
  await page.waitForFunction(() => /one\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  assert.equal(await page.getAttribute('#fd-tree .fx__current .fx__nodename', 'class'), 'fx__nodename');
  assert.match(await page.textContent('#fd-tree .fx__current'), /Papers/, 'the tree marks the folder shown');
  await page.click('.fx__tool[aria-label^="Back"]');
  await page.waitForFunction(() => /notes\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  await page.click('.fx__tool[aria-label^="Forward"]');
  await page.waitForFunction(() => /one\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  await page.click('.fx__tool[aria-label^="Up"]');
  await page.waitForFunction(() => /notes\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  // the keyboard: Down selects, Enter opens the folder, Backspace goes back up
  await page.focus('#fd-main');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /one\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  await page.focus('#fd-main');
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => /notes\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  assert.deepEqual(errors, []);
  await context.close();
});
await check('X2: a double click opens a Word file in Word for editing at its d.docs.live.net address on a personal drive, and a right click offers Word, the browser and Tick, which tracks it', async () => {
  const env = await open({});
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.waitForFunction(() => /\(personal\)/.test(document.getElementById('fd-connect-note').textContent));
  await recordOpens(page);
  await page.dblclick('#fd-items tr[data-item="a1"] .fx__name');
  assert.deepEqual(await page.evaluate(() => window.__opened), ['ms-word:ofe|u|https://d.docs.live.net/drive1/notes.docx']);
  assert.match(await page.textContent('#msg'), /Opening notes\.docx in Word/);
  await page.click('#fd-items tr[data-item="a1"] .fx__name', { button: 'right' });
  assert.deepEqual(await page.$$eval('#fd-menu button', (l) => l.map((b) => b.textContent)), ['Open in Word', 'Open in the browser', 'Download', 'Cut', 'Copy', 'Share', 'Rename', 'Delete', 'Tick to track', 'Properties']);
  await page.click('#fd-menu button:has-text("Open in the browser")');
  assert.equal(await page.evaluate(() => window.__opened[1]), 'window:https://onedrive.live.com/?id=a1');
  assert.equal(await page.$('#fd-menu') === null, true, 'the menu stayed open');
  await page.click('#fd-items tr[data-item="a1"] .fx__name', { button: 'right' });
  await page.click('#fd-menu button:has-text("Tick to track")');
  assert.equal(await page.isChecked('#fd-items input[data-id="a1"]'), true);
  assert.match(await page.textContent('#fd-status'), /1 ticked/);
  // a file in a folder is opened at its own path, each segment encoded; a plain file in the browser
  await page.dblclick('#fd-items tr[data-item="f1"] .fx__name');
  await page.waitForFunction(() => /one\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  await page.dblclick('#fd-items tr[data-item="b1"] .fx__name');
  assert.equal(await page.evaluate(() => window.__opened[2]), 'ms-word:ofe|u|https://d.docs.live.net/drive1/Papers/one.docx');
  await page.click('.fx__tool[aria-label^="Back"]');
  await page.waitForFunction(() => /notes\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  await page.dblclick('#fd-items tr[data-item="h1"] .fx__name');
  assert.equal(await page.evaluate(() => window.__opened[3]), 'window:https://onedrive.live.com/?id=h1', 'a text file opens on OneDrive\'s page');
  assert.deepEqual(calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key), [], 'opening a file wrote something');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('X3: on a work or school drive a double click opens the file at the SharePoint address OneDrive gives, and an address that is not https is never opened', async () => {
  const table = graphRoutes();
  table['GET /v1.0/me/drive'] = { id: 'b!xyz', driveType: 'business', owner: { user: { displayName: 'Greg' } } };
  table['GET /v1.0/me/drive/root/children'] = { value: [
    { id: 'w1', name: 'budget.xlsx', file: { mimeType: 'x' }, size: 5000, parentReference: { driveId: 'b!xyz', path: '/drive/root:' }, webUrl: 'https://wayne0-my.sharepoint.com/personal/g/Documents/budget.xlsx', lastModifiedDateTime: now },
    { id: 'w2', name: 'deck.pptx', file: { mimeType: 'x' }, size: 5000, parentReference: { driveId: 'b!xyz', path: '/drive/root:' }, webUrl: 'javascript:window.__ran=1', lastModifiedDateTime: now },
  ] };
  const env = await open({ graph: table });
  const { context, page, errors } = env;
  await connect(env);
  await listed(page);
  await page.waitForFunction(() => /\(business\)/.test(document.getElementById('fd-connect-note').textContent));
  await recordOpens(page);
  await page.dblclick('#fd-items tr[data-item="w1"] .fx__name');
  await page.dblclick('#fd-items tr[data-item="w2"] .fx__name');
  assert.deepEqual(await page.evaluate(() => window.__opened), ['ms-excel:ofe|u|https://wayne0-my.sharepoint.com/personal/g/Documents/budget.xlsx']);
  assert.match(await page.textContent('#msg'), /OneDrive gave no address for deck\.pptx/);
  assert.equal(await page.evaluate(() => !!window.__ran), false);
  assert.deepEqual(errors, []);
  await context.close();
});
await check('X4: Large icons draws a tile per item with its tick, the column headings sort with folders kept first, and the search box narrows the folder by name', async () => {
  const env = await open({});
  const { context, page, errors } = env;
  await connect(env);
  await listed(page);
  await page.click('.fx__tool[aria-label="Large icons view"]');
  assert.equal(await page.getAttribute('.fx__tool[aria-label="Large icons view"]', 'aria-pressed'), 'true');
  assert.deepEqual(await page.$$eval('#fd-items .fx__tile .fx__label', (l) => l.map((n) => n.textContent)), ['Papers', HOSTILE, 'notes.docx'], 'one tile per item, folders first, then by name');
  await page.check('#fd-items .fx__tile input[data-id="a1"]');
  assert.match(await page.textContent('#fd-picked-head'), /Ticked, 1 item/);
  await page.click('.fx__tool[aria-label="Details view"]');
  assert.equal(await page.isChecked('#fd-items input[data-id="a1"]'), true, 'the tick did not carry across views');
  await page.click('#fd-items thead .fx__sort:has-text("Size")');
  await page.click('#fd-items thead .fx__sort:has-text("Size")');
  assert.deepEqual(await page.$$eval('#fd-items tbody tr .fx__name', (l) => l.map((n) => n.textContent)).then((l) => [l[0], l[1]]), ['Papers', 'notes.docx'], 'largest first, the folder still first');
  await page.fill('#fd-search', 'NOTES');
  assert.deepEqual(await page.$$eval('#fd-items tbody tr .fx__name', (l) => l.map((n) => n.textContent)), ['notes.docx']);
  assert.match(await page.textContent('#fd-status'), /^1 item/);
  await page.fill('#fd-search', 'nothing-here');
  assert.match(await page.textContent('#fd-main'), /Nothing here matches "nothing-here"/);
  assert.deepEqual(errors, []);
  await context.close();
});
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

// The saved catalog, a catalog.json on a private repository's drive-catalog branch that the drive
// organizer wrote through the connector, is never shown in the Folders tab: the tab is the live
// drive alone, read through Microsoft's own sign-in (the owner, 2026-10-20). The catalog is a flat list of folders and files whose paths start with "OneDrive/"; some
// files carry no web address or modified date (unknown, not an error), and mime is empty, so the
// kind comes from the name. One file name is hostile, to show it stays text.
const catalogData = {
  provider: 'microsoft',
  made: today + 'T09:00:00Z',
  complete: true,
  problems: [],
  totals: { folders: 2, files: 4 },
  folders: [
    { path: 'OneDrive/Papers', id: 'cf1', drive: 'drive1', web: 'https://onedrive.live.com/?id=cf1', files: 2, bytes: 6000, latest: now },
    { path: 'OneDrive/Papers/Drafts', id: 'cf2', drive: 'drive1', web: 'https://onedrive.live.com/?id=cf2', files: 1, bytes: 500, latest: now },
  ],
  files: [
    { path: 'OneDrive/notes.docx', id: 'c-a1', drive: 'drive1', name: 'notes.docx', mime: '', size: 1234, modified: now, web: 'https://onedrive.live.com/?id=c-a1', kind: 'doc', native: true },
    { path: 'OneDrive/Papers/one.docx', id: 'c-b1', drive: 'drive1', name: 'one.docx', mime: '', size: 2048, modified: now, web: 'https://onedrive.live.com/?id=c-b1', kind: 'doc', native: true },
    { path: 'OneDrive/Papers/Drafts/draft.docx', id: 'c-d1', drive: 'drive1', name: 'draft.docx', mime: '', size: 500, modified: '', web: '', kind: 'doc', native: true },
    { path: 'OneDrive/' + HOSTILE, id: 'c-h1', drive: 'drive1', name: HOSTILE, mime: '', size: 10, modified: now, web: 'https://onedrive.live.com/?id=c-h1', kind: 'text', native: false },
  ],
};
// a repository's routes with catalog.json served on its drive-catalog branch, read as raw text
function catalogRoutes(o) {
  const routes = repoRoutes(o || {});
  routes['GET /repos/acme/demo/contents/catalog.json'] = { raw: JSON.stringify(catalogData) };
  return routes;
}
await check('NC1: with no drive connected, a private repository that holds a saved catalog shows only the connect prompt: catalog.json is never read and the tab says nothing of a catalog or a connector', async () => {
  const env = await open({ routes: catalogRoutes() });
  const { context, page, calls, graph, errors } = env;
  await ready(page);
  await page.click('#rail-folders');
  await tabRead(page);
  await page.waitForFunction(() => /Add a cloud drive/.test(document.getElementById('fd-browser').textContent), null, { timeout: 15000 });
  await sleep(500);
  assert.equal(calls.some((c) => c.key === 'GET /repos/acme/demo/contents/catalog.json'), false, 'the Folders tab read catalog.json');
  assert.equal(await page.$('#fd-items') === null, true, 'a list was drawn without a drive');
  const words = await page.evaluate(() => document.getElementById('tab-folders').innerText + ' ' + document.getElementById('msg').textContent);
  assert.doesNotMatch(words, /catalog/i, 'the tab speaks of a catalog');
  assert.doesNotMatch(words, /connector/i, 'the tab offers the connector');
  assert.deepEqual(graph, []);
  assert.deepEqual(errors, []);
  await context.close();
});
await check('NC2: at 1440 x 900 the explorer is the whole tab: no side column, the window fills the tab under its one-line head, and the page never scrolls', async () => {
  const env = await open({ viewport: { width: 1440, height: 900 } });
  const { context, page, errors } = env;
  await connect(env);
  await listed(page);
  await tabRead(page);
  const m = await page.evaluate(() => {
    const box = (n) => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const tab = document.getElementById('tab-folders');
    return {
      parts: Array.prototype.map.call(tab.children, (n) => n.id || n.className),
      side: !!tab.querySelector('.console__col--side, .console__cols'),
      tab: box(tab), head: box(tab.querySelector('.folders__head')), win: box(tab.querySelector('.fx')),
      scrollY: window.scrollY, docH: document.documentElement.scrollHeight, winH: innerHeight,
    };
  });
  console.log('      ' + JSON.stringify(m));
  assert.equal(m.side, false, 'the tab still has a side column');
  assert.deepEqual(m.parts, ['console__head folders__head', 'fd-browser']);
  assert.ok(m.head.height < 60, 'the head takes ' + m.head.height + 'px');
  assert.ok(m.win.width >= m.tab.width - 2, 'the explorer is ' + m.win.width + 'px of the tab\'s ' + m.tab.width);
  assert.ok(m.win.bottom >= m.tab.bottom - 2 && m.win.top <= m.head.bottom + 12, 'the explorer leaves the tab\'s height unused: ' + JSON.stringify(m));
  assert.equal(m.scrollY, 0);
  assert.ok(m.docH <= m.winH, 'the page scrolls');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('NC3: Track in a repository opens a dialog holding what is ticked and the steps, and Escape closes it with the explorer as it was', async () => {
  const env = await open({});
  const { context, page, errors } = env;
  await connect(env);
  await listed(page);
  await page.click('#fd-items input[data-id="a1"]');
  assert.equal(await page.evaluate(() => document.getElementById('dlg-track').open), false);
  await page.click('#fd-track-open');
  await page.waitForFunction(() => document.getElementById('dlg-track').open);
  assert.deepEqual(await page.evaluate(() => ['fd-tracked', 'fd-picked', 'fd-create', 'fd-reload', 'fd-folder', 'fd-track'].map((id) => !!document.getElementById(id).closest('#dlg-track'))), [true, true, true, true, true, true]);
  assert.deepEqual(await page.$$eval('#fd-picked li code', (l) => l.map((c) => c.textContent)), ['notes.docx']);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('dlg-track').open);
  assert.equal(await page.isChecked('#fd-items input[data-id="a1"]'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('NC4: what Track answers is said in its dialog, over which the foot cannot be read, and the head\'s button counts what is ticked in every folder', async () => {
  const env = await open({});
  const { context, page, errors } = env;
  await connect(env);
  await listed(page);
  assert.equal(await page.textContent('#fd-track-open'), 'Track in a repository');
  await page.click('#fd-track-open');
  await page.waitForFunction(() => document.getElementById('dlg-track').open);
  assert.equal(await page.textContent('#fd-say'), '');
  await page.click('#fd-track');
  await page.waitForFunction(() => /Tick at least one file or folder/.test(document.getElementById('fd-say').textContent));
  assert.equal(await page.getAttribute('#fd-say', 'role'), 'status');
  assert.ok(await page.evaluate(() => document.getElementById('fd-say').classList.contains('admin__warn')));
  await page.keyboard.press('Escape');
  await page.click('#fd-items input[data-id="a1"]');
  assert.equal(await page.textContent('#fd-track-open'), 'Track in a repository (1 ticked)');
  // a new opening starts with no old answer
  await page.click('#fd-track-open');
  await page.waitForFunction(() => document.getElementById('dlg-track').open);
  assert.equal(await page.textContent('#fd-say'), '');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('NC5: on a phone a folder of many items scrolls inside the explorer, which keeps a height under the window\'s, so its status bar stays in reach', async () => {
  const graph = graphRoutes();
  const many = Array.from({ length: 80 }, (_, i) => ({ id: 'p' + i, name: 'paper-' + i + '.docx', file: { mimeType: 'x' }, size: 1000 + i, parentReference: { driveId: 'drive1' }, lastModifiedDateTime: now }));
  graph['GET /v1.0/me/drive/root/children'] = { value: graph['GET /v1.0/me/drive/root/children'].value.concat(many) };
  const env = await open({ viewport: { width: 390, height: 844 }, graph });
  const { context, page, errors } = env;
  await connect(env);
  await listed(page);
  const m = await page.evaluate(() => { const fx = document.querySelector('#tab-folders .fx'), main = document.getElementById('fd-main') || fx.querySelector('.fx__main'); return { fx: fx.getBoundingClientRect().height, winH: innerHeight, scrolls: main.scrollHeight > main.clientHeight + 10 }; });
  console.log('      ' + JSON.stringify(m));
  assert.ok(m.fx < m.winH, 'the explorer is ' + m.fx + 'px on a window of ' + m.winH);
  assert.ok(m.scrolls, 'the list does not scroll in its pane');
  assert.deepEqual(errors, []);
  await context.close();
});

// A drive the page can write to: the folders' items kept here, each of Graph's writes changing them
// as OneDrive would, so a check reads the list the page draws after it
// waits in the check, not the page, for what only the check can see, such as a call to Graph
async function until(fn, what) {
  for (let i = 0; i < 100; i++) { if (fn()) return; await sleep(100); }
  assert.fail(what);
}
function liveDrive(o) {
  const opts = o || {};
  const items = {
    root: graphRoutes()['GET /v1.0/me/drive/root/children'].value.map((x) => Object.assign({}, x)),
    f1: [{ id: 'b1', name: 'one.docx', file: { mimeType: 'x' }, size: 2048, parentReference: { driveId: 'drive1', path: '/drive/root:/Papers' }, webUrl: 'https://onedrive.live.com/?id=b1', lastModifiedDateTime: now }],
  };
  if (opts.thumbs) items.root[1].thumbnails = [{ medium: { url: opts.thumbs } }];
  let made = 0;
  const folderOf = (id) => (id === 'ROOTID' || id === 'root' ? 'root' : id);
  const find = (id) => { for (const k in items) { const i = items[k].findIndex((x) => x.id === id); if (i >= 0) return { list: items[k], at: i, folder: k }; } return null; };
  const table = graphRoutes();
  table['GET /v1.0/me/drive/root/children'] = () => ({ value: items.root });
  table['GET /v1.0/me/drive/items/f1/children'] = () => ({ value: items.f1 });
  if (opts.drive) table['GET /v1.0/me/drive'] = opts.drive;
  table['GET /v1.0/me/drive/root'] = { id: 'ROOTID' };
  table['*'] = (call) => {
    let m;
    if ((m = /^POST \/v1\.0\/me\/drive\/(root|items\/([^/]+))\/children$/.exec(call.key))) {
      const into = m[2] || 'root';
      const it = { id: 'n' + (++made), name: call.body.name, folder: { childCount: 0 }, parentReference: { driveId: 'drive1' }, lastModifiedDateTime: now };
      (items[into] = items[into] || []).push(it);
      return { status: 201, body: it };
    }
    if ((m = /^PATCH \/v1\.0\/me\/drive\/items\/([^/]+)$/.exec(call.key))) {
      const f = find(decodeURIComponent(m[1]));
      if (!f) return undefined;
      if (call.body.name) {
        if (f.list.some((x) => x.name.toLowerCase() === call.body.name.toLowerCase() && x.id !== f.list[f.at].id)) return { status: 409, body: { error: { code: 'nameAlreadyExists', message: 'Name already exists' } } };
        f.list[f.at].name = call.body.name;
      }
      if (call.body.parentReference) { const it = f.list.splice(f.at, 1)[0]; (items[folderOf(call.body.parentReference.id)] = items[folderOf(call.body.parentReference.id)] || []).push(it); }
      return f.list[f.at] || {};
    }
    if ((m = /^DELETE \/v1\.0\/me\/drive\/items\/([^/]+)$/.exec(call.key))) {
      const f = find(decodeURIComponent(m[1]));
      if (!f) return undefined;
      f.list.splice(f.at, 1);
      return null;
    }
    if ((m = /^PUT \/v1\.0\/me\/drive\/(root|items\/([^/]+)):\/(.+):\/content$/.exec(call.key))) {
      const into = m[2] || 'root', name = decodeURIComponent(m[3]);
      const it = { id: 'u' + (++made), name, file: { mimeType: 'x' }, size: (call.body || '').length, parentReference: { driveId: 'drive1' }, lastModifiedDateTime: now };
      (items[into] = items[into] || []).push(it);
      return { status: 201, body: it };
    }
    if (/^POST .*:\/createUploadSession$/.test(call.key)) return { uploadUrl: 'https://upload.example.test/session1' };
    if ((m = /^POST \/v1\.0\/me\/drive\/items\/([^/]+)\/copy$/.exec(call.key))) return { status: 202 };
    if (/\/createLink$/.test(call.key)) return opts.link || { link: { webUrl: 'https://1drv.ms/w/s!shared-link' } };
    if (/\/preview$/.test(call.key)) return opts.preview || { getUrl: 'https://onedrive.live.com/embed?id=a1' };
    if (/\/thumbnails$/.test(call.key)) return { value: [{ large: { url: 'https://thumbs.example.test/large.jpg' } }] };
    if ((m = /^GET \/v1\.0\/me\/drive\/root\/search\(q='(.*)'\)$/.exec(call.key))) {
      const q = decodeURIComponent(m[1]).replace(/''/g, '\'').toLowerCase();
      return { value: [].concat(items.root, items.f1).filter((x) => x.name.toLowerCase().indexOf(q) >= 0) };
    }
    if ((m = /^GET \/v1\.0\/me\/drive\/items\/([^/]+)$/.exec(call.key))) {
      const f = find(decodeURIComponent(m[1]));
      if (!f) return undefined;
      const it = f.list[f.at];
      return Object.assign({ '@microsoft.graph.downloadUrl': opts.download || 'https://download.example.test/' + it.id, createdDateTime: now, createdBy: { user: { displayName: 'Greg Creator' } }, lastModifiedBy: { user: { displayName: 'Greg Editor' } }, shared: { scope: 'users' } }, it);
    }
    return undefined;
  };
  return { table, items };
}
const writesOf = (graph) => graph.filter((c) => !c.key.startsWith('GET '));
const shown = (page) => page.$$eval('#fd-items [data-item] [data-name]', (l) => l.map((n) => n.textContent));
async function explorerWith(o) {
  const live = liveDrive(o);
  const env = await open(Object.assign({ graph: live.table }, o && o.open));
  // OneDrive's thumbnails, served as a picture, so none falls back to the mark for a failed load
  await env.context.route('https://thumbs.example.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#4a7"/></svg>' }));
  await connect(env);
  await listed(env.page);
  return Object.assign(env, { live });
}
// the fold that makes a new repository, opened by its summary as a person opens it
// the drives to add, opened by whichever + Add the tab shows: its tile with no drive, the head's with one
async function openClouds(page) {
  await page.click((await page.$('#fd-add-tile')) ? '#fd-add-tile' : '#fd-add');
}
async function openNew(page) {
  if (!(await page.evaluate(() => document.getElementById('fd-new').open))) await page.click('#fd-new > summary');
}
async function selectRow(page, id, mods) {
  await page.click('#fd-items [data-item="' + id + '"] [data-name]', { modifiers: mods || [] });
}
await check('FA1: New folder makes "New folder" in the folder shown and opens its name to edit; Enter renames it, and nothing is written before the press', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  assert.deepEqual(writesOf(graph), [], 'connecting and listing wrote to the drive');
  await page.click('#fx-cmd-new');
  await page.waitForSelector('#fd-items .fx__rename');
  const post = writesOf(graph)[0];
  assert.equal(post.key, 'POST /v1.0/me/drive/root/children');
  assert.deepEqual(post.body, { name: 'New folder', folder: {}, '@microsoft.graph.conflictBehavior': 'rename' });
  assert.equal(post.auth, 'Bearer ' + ACCESS);
  assert.equal(await page.evaluate(() => document.activeElement.className), 'fx__rename', 'the new name is not being edited');
  assert.equal(await page.inputValue('#fd-items .fx__rename'), 'New folder');
  await page.keyboard.type('Drafts');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Drafts/.test(((document.getElementById('fd-items') || {}).textContent || '')));
  const patch = writesOf(graph)[1];
  assert.equal(patch.key, 'PATCH /v1.0/me/drive/items/n1');
  assert.deepEqual(patch.body, { name: 'Drafts' });
  assert.deepEqual((await shown(page)).slice(0, 2), ['Drafts', 'Papers'], 'the folder is listed with the others, folders first');
  // a second folder in the same place takes the next free name
  await page.focus('#fd-main');
  await page.keyboard.press('Control+Shift+N');
  await page.waitForSelector('#fd-items .fx__rename');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#fd-items .fx__rename'));
  assert.equal(writesOf(graph).length, 3, 'Escape renamed the new folder');
  assert.ok((await shown(page)).includes('New folder'), 'Escape left no folder');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA2: F2 renames in place with the name chosen up to its extension; Escape keeps it, a name OneDrive refuses or one already there is said and sent nowhere, and Enter in the box opens nothing', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await recordOpens(page);
  await selectRow(page, 'a1');
  await page.keyboard.press('F2');
  await page.waitForSelector('#fd-items .fx__rename');
  assert.deepEqual(await page.evaluate(() => { const b = document.querySelector('#fd-items .fx__rename'); return [b.selectionStart, b.selectionEnd]; }), [0, 5], 'the extension is chosen with the name');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#fd-items .fx__rename'));
  assert.deepEqual(writesOf(graph), []);
  for (const bad of ['a:b.docx', 'Papers', 'con.docx', 'trailing.']) {
    await selectRow(page, 'a1');
    await page.keyboard.press('F2');
    await page.fill('#fd-items .fx__rename', bad);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#fd-items .fx__rename'));
    assert.match(await page.textContent('#msg'), /cannot|already|keeps for itself/, bad + ' was not refused');
  }
  assert.deepEqual(writesOf(graph), [], 'a refused name was sent');
  await selectRow(page, 'a1');
  await page.keyboard.press('F2');
  await page.fill('#fd-items .fx__rename', 'notes-v2.docx');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /notes-v2\.docx/.test(((document.getElementById('fd-items') || {}).textContent || '')));
  assert.deepEqual(writesOf(graph).map((c) => [c.key, c.body]), [['PATCH /v1.0/me/drive/items/a1', { name: 'notes-v2.docx' }]]);
  assert.deepEqual(await page.evaluate(() => window.__opened), [], 'Enter in the name box opened the file');
  // the right click offers Rename too, and a ticked item's tick keeps its new name
  await page.check('#fd-items input[data-id="a1"]');
  await page.click('#fd-items [data-item="a1"] [data-name]', { button: 'right' });
  await page.click('#fd-menu button:has-text("Rename")');
  await page.fill('#fd-items .fx__rename', 'final.docx');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /final\.docx/.test(document.getElementById('fd-picked').textContent));
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA3: Delete asks in the page, says the recycle bin, and Cancel sends nothing; Delete sends one DELETE per selected item, unticks what it took and lists the folder again', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await page.check('#fd-items input[data-id="a1"]');
  await selectRow(page, 'a1');
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => document.getElementById('dlg-item').open);
  assert.match(await page.textContent('#dlg-item'), /recycle bin/);
  await page.click('#dlg-item button:has-text("Cancel")');
  assert.deepEqual(writesOf(graph), [], 'Cancel deleted');
  await selectRow(page, 'h1', ['Control']);
  await page.click('#fx-cmd-delete');
  await page.waitForFunction(() => document.getElementById('dlg-item').open);
  assert.match(await page.textContent('#dlg-item .cpdlg__title'), /Delete 2 items/);
  await page.click('#fx-delete-go');
  await page.waitForFunction(() => !/notes\.docx/.test(((document.getElementById('fd-items') || {}).textContent || '')));
  assert.deepEqual(writesOf(graph).map((c) => c.key).sort(), ['DELETE /v1.0/me/drive/items/a1', 'DELETE /v1.0/me/drive/items/h1']);
  assert.deepEqual(await shown(page), ['Papers']);
  assert.match(await page.textContent('#msg'), /Moved 2 items to the recycle bin/);
  assert.equal(await page.textContent('#fd-picked-head'), 'Nothing ticked yet.', 'a deleted item stayed ticked');
  assert.equal(await page.evaluate(() => window.__hostile), undefined);
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA4: Upload sends a small file in one PUT into the folder shown and a large one through an upload session in ranged pieces with no token; a name already there asks Replace, Keep both or Skip; a drop on a folder uploads into it', async () => {
  const env = await explorerWith();
  const { context, page, graph, pieces, errors } = env;
  const up = async (files) => {
    const chooser = page.waitForEvent('filechooser');
    await page.click('#fx-cmd-upload');
    await (await chooser).setFiles(files);
  };
  await up([{ name: 'new note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
  await page.waitForFunction(() => /new note\.txt/.test(((document.getElementById('fd-items') || {}).textContent || '')));
  const put = writesOf(graph)[0];
  assert.equal(put.key, 'PUT /v1.0/me/drive/root:/new%20note.txt:/content');
  assert.equal(put.query, '?@microsoft.graph.conflictBehavior=fail');
  assert.equal(put.body, 'hello');
  assert.equal(put.auth, 'Bearer ' + ACCESS);
  // a name already there: Skip sends nothing, Keep both sends with rename
  await up([{ name: 'notes.docx', mimeType: 'x', buffer: Buffer.from('x') }]);
  await page.waitForFunction(() => document.getElementById('dlg-item').open && /already holds notes\.docx/.test(document.getElementById('dlg-item').textContent));
  await page.click('#fx-up-skip');
  await page.waitForFunction(() => /Nothing was uploaded/.test(document.getElementById('msg').textContent));
  assert.equal(writesOf(graph).length, 1, 'Skip uploaded');
  await up([{ name: 'notes.docx', mimeType: 'x', buffer: Buffer.from('x') }]);
  await page.waitForFunction(() => document.getElementById('dlg-item').open);
  await page.click('#fx-up-both');
  await page.waitForFunction(() => /Uploaded 1 file/.test(document.getElementById('msg').textContent));
  assert.equal(writesOf(graph)[1].query, '?@microsoft.graph.conflictBehavior=rename');
  // a file over 4 MB goes through an upload session; its pieces carry no token
  const big = Buffer.alloc(5 * 1024 * 1024, 7);
  await up([{ name: 'big.bin', mimeType: 'application/octet-stream', buffer: big }]);
  await page.waitForFunction(() => /Uploaded 1 file/.test(document.getElementById('msg').textContent) && /big\.bin/.test(document.getElementById('msg').textContent + ((document.getElementById('fd-items') || {}).textContent || '')) || /Uploaded 1 file/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
  const session = writesOf(graph).find((c) => /createUploadSession/.test(c.key));
  assert.equal(session.key, 'POST /v1.0/me/drive/root:/big.bin:/createUploadSession');
  assert.deepEqual(session.body, { item: { '@microsoft.graph.conflictBehavior': 'fail' } });
  assert.deepEqual(pieces.map((p) => p.range), ['bytes 0-3276799/5242880', 'bytes 3276800-5242879/5242880']);
  assert.deepEqual(pieces.map((p) => p.auth), ['', ''], 'the drive\'s token went to the upload address');
  // files dropped on a folder's row go into that folder
  await page.evaluate(() => {
    const row = document.querySelector('#fd-items [data-item="f1"]');
    const dt = new DataTransfer();
    dt.items.add(new File(['dropped'], 'dropped.txt', { type: 'text/plain' }));
    row.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    row.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await until(() => writesOf(graph).some((c) => c.key === 'PUT /v1.0/me/drive/items/f1:/dropped.txt:/content'), 'the drop did not upload into Papers');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA5: Download asks Graph for the file\'s one-time address and hands it to the browser with no token, file by file; a folder alone cannot be downloaded, and an address that is not https is never followed', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await page.evaluate(() => {
    window.__downloads = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download')) { window.__downloads.push([this.getAttribute('href'), this.getAttribute('download')]); return; } return click.call(this); };
  });
  await selectRow(page, 'f1');
  assert.equal(await page.isDisabled('#fx-cmd-download'), true, 'a folder alone can be downloaded');
  await selectRow(page, 'a1');
  await page.click('#fx-cmd-download');
  await page.waitForFunction(() => window.__downloads.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__downloads), [['https://download.example.test/a1', 'notes.docx']]);
  const read = graph.find((c) => c.key === 'GET /v1.0/me/drive/items/a1');
  assert.equal(read.query, '?$select=id,name,@microsoft.graph.downloadUrl');
  assert.deepEqual(writesOf(graph), []);
  await context.close();
  const bad = await explorerWith({ download: 'javascript:window.__ran=1' });
  await bad.page.evaluate(() => { window.__downloads = []; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download')) { window.__downloads.push(this.getAttribute('href')); return; } return click.call(this); }; });
  await selectRow(bad.page, 'a1');
  await bad.page.click('#fx-cmd-download');
  await bad.page.waitForFunction(() => /no download address/.test(document.getElementById('msg').textContent));
  assert.deepEqual(await bad.page.evaluate(() => window.__downloads), []);
  assert.deepEqual(errors, []);
  await bad.context.close();
});
await check('FA6: Cut and Paste move by one PATCH to the folder shown and greys the cut item until then; Copy and Paste ask OneDrive to copy into the root by its id; dragging an item onto a folder moves it', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await selectRow(page, 'a1');
  await page.keyboard.press('Control+X');
  assert.match(await page.getAttribute('#fd-items [data-item="a1"]', 'class'), /fx__cutitem/);
  await page.dblclick('#fd-items [data-item="f1"] [data-name]');
  await page.waitForFunction(() => /one\.docx/.test(((document.getElementById('fd-items') || {}).textContent || '')));
  await page.focus('#fd-main');
  await page.keyboard.press('Control+V');
  await page.waitForFunction(() => /notes\.docx/.test(((document.getElementById('fd-items') || {}).textContent || '')));
  assert.deepEqual(writesOf(graph).map((c) => [c.key, c.body]), [['PATCH /v1.0/me/drive/items/a1', { parentReference: { id: 'f1' } }]]);
  assert.equal(await page.isDisabled('#fx-cmd-paste'), true, 'a move can be pasted twice');
  // copy back to the root, which Graph names by its id
  await selectRow(page, 'b1');
  await page.keyboard.press('Control+C');
  await page.click('.fx__tool[aria-label^="Up"]');
  await page.waitForFunction(() => /Papers/.test(((document.getElementById('fd-items') || {}).textContent || '')) && !/one\.docx/.test(((document.getElementById('fd-items') || {}).textContent || '')));
  await page.click('#fx-cmd-paste');
  await page.waitForFunction(() => /OneDrive is copying 1 item/.test(document.getElementById('msg').textContent));
  const copy = writesOf(graph).find((c) => /\/copy$/.test(c.key));
  assert.equal(copy.key, 'POST /v1.0/me/drive/items/b1/copy');
  assert.equal(copy.query, '?@microsoft.graph.conflictBehavior=rename');
  assert.deepEqual(copy.body, { parentReference: { driveId: 'drive1', id: 'ROOTID' } });
  assert.ok(graph.some((c) => c.key === 'GET /v1.0/me/drive/root' && c.query === '?$select=id'), 'the root\'s id was not read');
  // an item dragged onto a folder moves into it
  await page.evaluate(() => {
    const from = document.querySelector('#fd-items [data-item="h1"]'), to = document.querySelector('#fd-items [data-item="f1"]');
    const dt = new DataTransfer();
    from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    to.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    to.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => /Moved 1 item/.test(document.getElementById('msg').textContent));
  assert.deepEqual(writesOf(graph).filter((c) => c.key === 'PATCH /v1.0/me/drive/items/h1').map((c) => c.body), [{ parentReference: { id: 'f1' } }]);
  // a folder pasted into itself is refused before Graph is asked
  await selectRow(page, 'f1');
  await page.keyboard.press('Control+X');
  await page.click('#fd-items [data-item="f1"] [data-name]', { button: 'right' });
  await page.click('#fd-menu button:has-text("Paste into this folder")');
  await page.waitForFunction(() => /cannot go into itself/.test(document.getElementById('msg').textContent));
  assert.equal(writesOf(graph).filter((c) => c.key === 'PATCH /v1.0/me/drive/items/f1').length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA7: Share offers who and what before any link is made: a personal drive anyone with the link, a work drive its organization first; Create link sends createLink with the choice and shows the link, never one that is not https', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await selectRow(page, 'a1');
  await page.click('#fx-cmd-share');
  await page.waitForFunction(() => document.getElementById('dlg-item').open);
  assert.deepEqual(await page.$$eval('#dlg-item input[name="fx-share-scope"]', (l) => l.map((r) => r.value)), ['anonymous']);
  assert.deepEqual(writesOf(graph), [], 'a link was made before Create link');
  await page.check('#dlg-item input[name="fx-share-type"][value="edit"]');
  await page.click('#fx-share-make');
  await page.waitForSelector('#dlg-item .fx__sharelink');
  assert.deepEqual(writesOf(graph).map((c) => [c.key, c.body]), [['POST /v1.0/me/drive/items/a1/createLink', { type: 'edit', scope: 'anonymous' }]]);
  assert.equal(await page.inputValue('#dlg-item .fx__sharelink'), 'https://1drv.ms/w/s!shared-link');
  await context.close();
  const work = await explorerWith({ drive: { id: 'b!xyz', driveType: 'business', owner: { user: { displayName: 'Greg' } } }, link: { link: { webUrl: 'javascript:alert(1)' } } });
  await work.page.waitForFunction(() => /\(business\)/.test(document.getElementById('fd-connect-note').textContent));
  await selectRow(work.page, 'a1');
  await work.page.click('#fx-cmd-share');
  await work.page.waitForFunction(() => document.getElementById('dlg-item').open);
  assert.deepEqual(await work.page.$$eval('#dlg-item input[name="fx-share-scope"]', (l) => l.map((r) => r.value + (r.checked ? '*' : ''))), ['organization*', 'anonymous']);
  await work.page.click('#fx-share-make');
  await work.page.waitForFunction(() => /could not be made/.test(document.getElementById('fx-share-out').textContent));
  assert.equal(await work.page.$('#dlg-item .fx__sharelink') === null, true);
  assert.deepEqual(writesOf(work.graph).map((c) => c.body), [{ type: 'view', scope: 'organization' }]);
  assert.deepEqual(errors.concat(work.errors), []);
  await work.context.close();
});
await check('FA8: Properties (Alt+Enter) reads one item\'s record and says its type, place, size in bytes, who made and changed it and whether it is shared; several items are summed from the list with no read', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await selectRow(page, 'a1');
  await page.keyboard.press('Alt+Enter');
  await page.waitForFunction(() => /Greg Editor/.test(document.getElementById('dlg-item').textContent));
  const text = await page.textContent('#dlg-item');
  for (const want of [/notes\.docx Properties/, /Word document/, /Location: OneDrive/, /1,234 bytes/, /by Greg Creator/, /Shared: Yes/]) assert.match(text, want);
  const read = graph.find((c) => c.key === 'GET /v1.0/me/drive/items/a1');
  assert.match(read.query, /createdBy,lastModifiedBy/);
  await page.keyboard.press('Escape');
  const before = graph.length;
  await selectRow(page, 'f1');
  await selectRow(page, 'a1', ['Shift']);
  await page.click('#fx-cmd-props');
  await page.waitForFunction(() => /3 items Properties/.test(document.getElementById('dlg-item').textContent));
  assert.match(await page.textContent('#dlg-item'), /2 files, 1 folder/);
  assert.equal(graph.length, before, 'several items\' properties read the drive');
  // a hostile name is drawn as text in the dialog's title
  await page.keyboard.press('Escape');
  await selectRow(page, 'h1');
  await page.keyboard.press('Alt+Enter');
  await page.waitForFunction(() => /Greg Editor/.test(document.getElementById('dlg-item').textContent));
  assert.equal(await page.evaluate(() => window.__hostile), undefined);
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA9: a click selects one item, Ctrl+click adds or takes away, Shift+click selects a range from the last click, Ctrl+A all and Escape none; the status bar counts them and the ticks are apart from it', async () => {
  const env = await explorerWith();
  const { context, page, errors } = env;
  const chosen = () => page.$$eval('#fd-items [data-item][aria-selected="true"]', (l) => l.map((n) => n.getAttribute('data-item')));
  await selectRow(page, 'f1');
  assert.deepEqual(await chosen(), ['f1']);
  await selectRow(page, 'a1', ['Control']);
  assert.deepEqual(await chosen(), ['f1', 'a1']);
  await selectRow(page, 'f1', ['Control']);
  assert.deepEqual(await chosen(), ['a1']);
  await selectRow(page, 'f1');
  await selectRow(page, 'a1', ['Shift']);
  assert.deepEqual(await chosen(), ['f1', 'h1', 'a1'], 'Shift did not select the range in the order shown');
  assert.match(await page.textContent('#fd-status'), /3 selected/);
  await page.focus('#fd-main');
  await page.keyboard.press('Escape');
  assert.deepEqual(await chosen(), []);
  await page.keyboard.press('Control+A');
  assert.deepEqual(await chosen(), ['f1', 'h1', 'a1']);
  assert.equal(await page.isChecked('#fd-items input[data-id="a1"]'), false, 'selecting ticked an item');
  // Shift with the arrows extends from the anchor; the commands follow the count
  await selectRow(page, 'f1');
  await page.keyboard.press('Shift+ArrowDown');
  assert.deepEqual(await chosen(), ['f1', 'h1']);
  assert.equal(await page.isDisabled('#fx-cmd-rename'), true, 'Rename is offered for two items');
  assert.equal(await page.isDisabled('#fx-cmd-delete'), false);
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA10: the preview pane is off until asked; on, one Office file shows Graph\'s preview page in a sandboxed frame, an image its large thumbnail, and nothing is read while it is off or for a folder', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await selectRow(page, 'a1');
  await page.waitForTimeout(500);
  assert.equal(graph.filter((c) => /preview|thumbnails/.test(c.key)).length, 0, 'a preview was read with the pane off');
  assert.equal(await page.isHidden('#fd-preview'), true);
  await page.focus('#fd-main');
  await page.keyboard.press('Alt+P');
  await page.waitForSelector('#fd-preview iframe');
  assert.equal(await page.getAttribute('#fd-preview iframe', 'src'), 'https://onedrive.live.com/embed?id=a1');
  assert.equal(await page.getAttribute('#fd-preview iframe', 'sandbox'), 'allow-scripts allow-same-origin allow-popups');
  assert.ok(graph.some((c) => c.key === 'POST /v1.0/me/drive/items/a1/preview'));
  assert.equal(await page.getAttribute('#fx-cmd-pane', 'aria-pressed'), 'true');
  await selectRow(page, 'f1');
  await page.waitForTimeout(500);
  assert.match(await page.textContent('#fd-preview'), /holds 2 items/);
  assert.equal(graph.filter((c) => /items\/f1\/(preview|thumbnails)/.test(c.key)).length, 0, 'a folder\'s preview was read');
  // two items selected say so; the pane closes again with its button
  await selectRow(page, 'a1', ['Control']);
  assert.match(await page.textContent('#fd-preview'), /2 items selected/);
  await page.click('#fx-cmd-pane');
  assert.equal(await page.isHidden('#fd-preview'), true);
  await context.close();
  // where Graph makes no preview page, the large thumbnail stands in; an image goes straight to it
  const img = await explorerWith({ preview: { status: 403, body: { error: { message: 'no' } } } });
  await img.page.click('#fx-cmd-pane');
  await selectRow(img.page, 'a1');
  await img.page.waitForSelector('#fd-preview img.fx__pvimg');
  assert.equal(await img.page.getAttribute('#fd-preview img', 'src'), 'https://thumbs.example.test/large.jpg');
  assert.deepEqual(errors.concat(img.errors), []);
  await img.context.close();
});
await check('FA11: Enter in the search box searches all of OneDrive, with a Folder column saying where each found item is; New folder, Upload and Paste wait for a folder; a quote is doubled for Graph, and Back returns', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await page.fill('#fd-search', 'one');
  await page.waitForTimeout(400);
  assert.equal(graph.filter((c) => /search/.test(c.key)).length, 0, 'typing searched the drive');
  await page.press('#fd-search', 'Enter');
  await page.waitForFunction(() => /one\.docx/.test(((document.getElementById('fd-items') || {}).textContent || '')));
  assert.ok(graph.some((c) => c.key === "GET /v1.0/me/drive/root/search(q='one')"), 'the drive was not searched');
  assert.match(await page.textContent('.fx__address'), /Search results for "one"/);
  const heads = await page.$$eval('#fd-items thead th', (l) => l.map((th) => th.textContent.trim()));
  assert.equal(heads[heads.length - 1], 'Folder');
  assert.match(await page.textContent('#fd-items [data-item="b1"] .fx__where'), /OneDrive\/Papers/);
  for (const id of ['#fx-cmd-new', '#fx-cmd-upload', '#fx-cmd-paste']) assert.equal(await page.isDisabled(id), true, id + ' is offered in search results');
  await page.click('.fx__tool[aria-label^="Back"]');
  await page.waitForFunction(() => /Papers/.test(((document.getElementById('fd-items') || {}).textContent || '')) && /notes/.test(((document.getElementById('fd-items') || {}).textContent || '')));
  await page.fill('#fd-search', "it's");
  await page.press('#fd-search', 'Enter');
  await page.waitForFunction(() => /Nothing in OneDrive matches/.test(document.getElementById('fd-main').textContent));
  assert.ok(graph.some((c) => c.key === "GET /v1.0/me/drive/root/search(q='it''s')"), 'the quote was not doubled');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA12: the View menu offers Explorer\'s six views; each draws every item with its tick, and Large icons, Tiles and Content show OneDrive\'s https thumbnail in place of the mark', async () => {
  const env = await explorerWith({ thumbs: 'https://thumbs.example.test/medium.jpg' });
  const { context, page, graph, errors } = env;
  assert.match(graph.find((c) => c.key === 'GET /v1.0/me/drive/root/children').query, /\$expand=thumbnails\(\$select=medium\)/);
  await page.click('#fx-cmd-view');
  assert.deepEqual(await page.$$eval('#fd-menu button', (l) => l.map((b) => b.textContent.trim())), ['Large icons', 'Small icons', 'List', '\u2713 Details', 'Tiles', 'Content']);
  await page.keyboard.press('Escape');
  for (const [name, cls, thumb] of [['Small icons', 'fx__flow--small', false], ['List', 'fx__flow--list', false], ['Tiles', 'fx__flow--tiles', true], ['Content', 'fx__flow--content', true], ['Large icons', 'fx__grid', true]]) {
    await page.click('#fx-cmd-view');
    await page.click('#fd-menu button:has-text("' + name + '")');
    assert.match(await page.getAttribute('#fd-items', 'class'), new RegExp(cls), name);
    assert.equal((await shown(page)).length, 3, name + ' does not show every item');
    assert.equal(await page.$$eval('#fd-items input[data-id]', (l) => l.length), 3, name + ' has no ticks');
    assert.equal(await page.$('#fd-items [data-item="a1"] img.fx__thumb') !== null, thumb, name + ' thumbnail');
  }
  assert.deepEqual(errors, []);
  await context.close();
  // a thumbnail that is not https is never drawn; a drive that refuses the thumbnails is read without them
  const bad = liveDrive({ thumbs: 'http://thumbs.example.test/x.jpg' });
  const plain = bad.table['GET /v1.0/me/drive/root/children'];
  bad.table['GET /v1.0/me/drive/root/children'] = (call) => (/expand/.test(call.query) ? { status: 400, body: { error: { message: 'expand not supported' } } } : plain(call));
  const env2 = await open({ graph: bad.table });
  // the plain-http picture is served, so a page that drew it would show it rather than wait on it
  await env2.context.route('http://thumbs.example.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"/>' }));
  await connect(env2);
  await listed(env2.page);
  await env2.page.click('.fx__tool[aria-label="Large icons view"]');
  assert.equal(await env2.page.$('#fd-items img.fx__thumb') === null, true);
  assert.equal(env2.graph.filter((c) => c.key === 'GET /v1.0/me/drive/root/children').length, 2);
  assert.deepEqual(env2.errors, []);
  await env2.context.close();
});
await check('FA13: on a phone the command bar and the explorer stay in the window, and the preview pane covers the list until it is closed', async () => {
  const env = await explorerWith({ open: { viewport: { width: 390, height: 844 } } });
  const { context, page, errors } = env;
  const fits = await page.evaluate(() => { const c = document.querySelector('#tab-folders .fx__cmds').getBoundingClientRect(); return c.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; });
  assert.ok(fits, 'the command bar runs off the side');
  await page.click('#fx-cmd-pane');
  assert.equal(await page.isVisible('#fd-preview'), false, 'with nothing chosen the pane covers the list');
  await selectRow(page, 'a1');
  await page.waitForSelector('#fd-preview iframe');
  const cover = await page.evaluate(() => { const p = document.getElementById('fd-preview').getBoundingClientRect(), m = document.getElementById('fd-main').getBoundingClientRect(); return Math.abs(p.left - m.left) < 2 && p.width >= m.width - 2; });
  assert.ok(cover, 'the preview pane does not cover the list');
  await page.click('#fd-preview .fx__pvclose');
  assert.equal(await page.isHidden('#fd-preview'), true, 'the pane\'s own close left it open');
  // opening a folder closes the pane on a phone, so the folder's list is in reach
  await selectRow(page, 'f1');
  await page.click('#fx-cmd-pane');
  assert.equal(await page.isVisible('#fd-preview'), false, 'a folder\'s preview covers the list');
  await page.dblclick('#fd-items [data-item="f1"] [data-name]');
  await page.waitForFunction(() => /one\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  assert.equal(await page.isHidden('#fd-preview'), true, 'the pane stayed over the new folder');
  // the pane was closed, not only emptied: choosing a file in the new folder opens nothing over the list
  await selectRow(page, 'b1');
  assert.equal(await page.isHidden('#fd-preview'), true, 'the pane came back over the new folder\'s list');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('FA14: while a folder is read, or after its read fails, nothing of the folder before is drawn or selectable under its address, so Ctrl+A and Delete find nothing to act on', async () => {
  const live = liveDrive();
  live.table['GET /v1.0/me/drive/items/f1/children'] = { status: 500, body: { error: { message: 'server down' } } };
  const env = await open({ graph: live.table });
  await connect(env);
  await listed(env.page);
  const { context, page, graph, errors } = env;
  await page.dblclick('#fd-items [data-item="f1"] [data-name]');
  await page.waitForFunction(() => /could not be read/.test(document.getElementById('fd-main').textContent));
  await page.click('.fx__tool[aria-label="Large icons view"]');
  assert.equal(await page.$('#fd-items [data-item="a1"]') === null, true, 'the root\'s items were drawn under Papers');
  await page.focus('#fd-main');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  assert.equal(await page.evaluate(() => document.getElementById('dlg-item').open), false, 'Delete offered the root\'s items under Papers');
  assert.equal(await page.isDisabled('#fx-cmd-delete'), true);
  assert.deepEqual(writesOf(graph), []);
  assert.deepEqual(errors, []);
  await context.close();
  // the same after a rename, whose read of the folder again fails: the list it had is dropped too
  const env2 = await explorerWith();
  await selectRow(env2.page, 'a1');
  env2.live.table['GET /v1.0/me/drive/root/children'] = { status: 500, body: { error: { message: 'server down' } } };
  await env2.page.keyboard.press('F2');
  await env2.page.keyboard.type('renamed');
  await env2.page.keyboard.press('Enter');
  await env2.page.waitForFunction(() => /could not be read/.test(document.getElementById('fd-main').textContent), null, { timeout: 10000 });
  await env2.page.click('.fx__tool[aria-label="Large icons view"]');
  assert.equal(await env2.page.$('#fd-items [data-item]') === null, true, 'the list before the rename was drawn after its read failed');
  await env2.page.focus('#fd-main');
  await env2.page.keyboard.press('Control+A');
  await env2.page.keyboard.press('Delete');
  assert.equal(await env2.page.evaluate(() => document.getElementById('dlg-item').open), false, 'Delete offered the list before the rename');
  assert.deepEqual(env2.errors, []);
  await env2.context.close();
});
await check('FA15: a key on a column heading or a tick is that control\'s: Enter sorts and opens nothing, Space does not tick the selected row; a second click on a file being previewed keeps its preview coming', async () => {
  const env = await explorerWith();
  const { context, page, errors } = env;
  await recordOpens(page);
  await selectRow(page, 'a1');
  await page.focus('#fd-items thead .fx__sort:has-text("Size")');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.__opened), [], 'Enter on a heading opened the selected file');
  assert.match(await page.textContent('#fd-items thead'), /Size \u25b4/, 'Enter on the heading did not sort');
  await page.focus('#fd-items thead .fx__sort:has-text("Name")');
  await page.keyboard.press('Space');
  assert.equal(await page.isChecked('#fd-items input[data-id="a1"]'), false, 'Space on a heading ticked the selected row');
  await page.click('#fx-cmd-pane');
  await selectRow(page, 'h1');
  await page.waitForTimeout(100);
  await selectRow(page, 'h1');
  await page.waitForSelector('#fd-preview iframe', { timeout: 5000 });
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA16: a folder is never pasted or dragged into itself or a folder inside it; an item moved by a drag leaves the cut, so a later Paste moves nothing back', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await selectRow(page, 'f1');
  await page.keyboard.press('Control+X');
  await page.dblclick('#fd-items [data-item="f1"] [data-name]');
  await page.waitForFunction(() => /one\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  await page.focus('#fd-main');
  await page.keyboard.press('Control+V');
  await page.waitForFunction(() => /cannot go into itself or a folder inside it/.test(document.getElementById('msg').textContent));
  assert.deepEqual(writesOf(graph), []);
  await page.click('.fx__tool[aria-label^="Up"]');
  await page.waitForFunction(() => /notes/.test((document.getElementById('fd-items') || {}).textContent || ''));
  await page.keyboard.press('Escape');
  await selectRow(page, 'a1');
  await page.keyboard.press('Control+X');
  await page.evaluate(() => {
    const from = document.querySelector('#fd-items [data-item="a1"]'), to = document.querySelector('#fd-items [data-item="f1"]');
    const dt = new DataTransfer();
    from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    to.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => /Moved 1 item/.test(document.getElementById('msg').textContent));
  assert.equal(await page.isDisabled('#fx-cmd-paste'), true, 'the dragged item stayed cut');
  assert.equal(writesOf(graph).length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FA17: a name being edited survives the list being read again under it, and its Enter renames to every letter typed', async () => {
  const env = await explorerWith();
  const { context, page, graph, errors } = env;
  await selectRow(page, 'h1');
  await page.keyboard.press('Control+C');
  await page.click('#fx-cmd-paste');
  await page.waitForFunction(() => /OneDrive is copying/.test(document.getElementById('msg').textContent));
  await selectRow(page, 'a1');
  await page.keyboard.press('F2');
  await page.keyboard.type('slow-');
  // the copy's own read of the folder comes 2.5 s after it
  await page.waitForTimeout(3200);
  await page.keyboard.type('name');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /slow-name\.docx/.test((document.getElementById('fd-items') || {}).textContent || ''));
  assert.deepEqual(writesOf(graph).filter((c) => c.key.startsWith('PATCH')).map((c) => c.body), [{ name: 'slow-name.docx' }]);
  assert.deepEqual(errors, []);
  await context.close();
});
async function trackOn(o) {
  const env = await open(o);
  await connect(env);
  await listed(env.page);
  await env.page.check('#fd-items input[data-id="a1"]');
  await env.page.click('#fd-track-open');
  await env.page.waitForFunction(() => /acme\/demo/.test(document.getElementById('fd-tracked').textContent) && !/Reading/.test(document.getElementById('fd-tracked').textContent));
  env.calls.length = 0;
  await env.page.click('#fd-track');
  await env.page.waitForFunction(() => /tracks 1 item of OneDrive/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  return env;
}
const writesIn = (calls) => calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key);
await check('FS4: in an organization whose secret no drive holds yet, Track keeps the token as the organization\'s secret, which every private repository of the organization reads, records which drive it holds, and writes no repository secret', async () => {
  const env = await trackOn({ org: true, orgPlan: 'team' });
  const { context, page, calls, errors } = env;
  const writes = writesIn(calls);
  assert.ok(writes.indexOf('PUT /orgs/acme/actions/secrets/SYMPHONY_DRIVE_REFRESH') >= 0, 'the organization\'s secret was not written');
  assert.equal(writes.indexOf('PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH'), -1, 'a repository secret would shadow the organization\'s');
  const put = calls.find((c) => c.key === 'PUT /orgs/acme/actions/secrets/SYMPHONY_DRIVE_REFRESH').body;
  assert.equal(put.visibility, 'private');
  assert.equal(put.selected_repository_ids, undefined, 'the organization\'s secret was kept to a list');
  assert.equal(put.key_id, 'ok1');
  assert.ok(!Buffer.from(put.encrypted_value, 'base64').toString('latin1').includes(REFRESH), 'the token went in the clear');
  assert.deepEqual(calls.find((c) => c.key === 'POST /orgs/acme/actions/variables').body, { name: 'SYMPHONY_DRIVE_ID', value: 'drive1', visibility: 'private' });
  assert.match(await msg(page), /a secret of acme, which every private repository of acme reads, so Track in any of them needs no other secret/);
  assert.equal(calls.filter((c) => c.key === 'GET /user/repos').length, 0, 'an organization\'s Track looked for repositories to renew');
  assert.equal(await page.evaluate(() => document.getElementById('dlg-track').open), false);
  assert.deepEqual(errors, []);
  await context.close();
  // the same drive tracked again widens a secret an earlier Track kept to a list
  const again = await trackOn({ org: true, orgPlan: 'team', orgDrive: 'drive1' });
  const put2 = again.calls.find((c) => c.key === 'PUT /orgs/acme/actions/secrets/SYMPHONY_DRIVE_REFRESH').body;
  assert.equal(put2.visibility, 'private');
  assert.equal(put2.selected_repository_ids, undefined);
  assert.ok(writesIn(again.calls).indexOf('PATCH /orgs/acme/actions/variables/SYMPHONY_DRIVE_ID') >= 0);
  assert.deepEqual(again.errors, []);
  await again.context.close();
});
await check('FS5: an organization secret another drive holds, a repository with its own secret, or an organization the person may not set secrets in, keeps the token in the repository\'s own secret and writes nothing of the organization\'s', async () => {
  // the last two: a private repository on GitHub Free, which reads no organization secret, and a token that may read the organization's secrets and not write them
  for (const o of [{ org: true, orgPlan: 'team', orgDrive: 'drive9' }, { org: true, orgPlan: 'team', secret: true }, { org: true, orgPlan: 'team', orgKeyRefused: true }, { org: true, orgPlan: 'free' }, { org: true, orgPlan: 'team', orgPutRefused: true }]) {
    const env = await trackOn(o);
    const writes = writesIn(env.calls);
    assert.ok(writes.indexOf('PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH') >= 0, JSON.stringify(o) + ': the repository secret was not written');
    assert.deepEqual(writes.filter((k) => k.indexOf('/orgs/') >= 0 && !(o.orgPutRefused && k === 'PUT /orgs/acme/actions/secrets/SYMPHONY_DRIVE_REFRESH')), [], JSON.stringify(o) + ': the organization was written');
    assert.deepEqual(env.errors, []);
    await env.context.close();
  }
});
await check('FS6: a switch already on is left as it is, one off is turned on, and one that cannot be set is said, with the steps kept open', async () => {
  const on = await trackOn({ switchValue: 'on' });
  assert.deepEqual(writesIn(on.calls).filter((k) => /variables/.test(k)), []);
  await on.context.close();
  const off = await trackOn({ switchValue: 'off' });
  assert.deepEqual(off.calls.find((c) => c.key === 'PATCH /repos/acme/demo/actions/variables/SYMPHONY_DRIVE').body, { name: 'SYMPHONY_DRIVE', value: 'on' });
  await off.context.close();
  const env = await trackOn({ noVariables: true });
  const { context, page, errors } = env;
  assert.match(await msg(page), /The repository variable SYMPHONY_DRIVE could not be set to on \(.*\), so a drive-sync\.yml that waits for it does not run each half hour\. The first sync is queued\./);
  assert.equal(await page.evaluate(() => document.getElementById('dlg-track').open), true, 'the steps closed over a switch left off');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FS7: opening the tab on a repository that tracks a drive, its secret set and its connection not known to have run out, switches the half-hourly sync on where it was never set and says so, writing nothing else; a switch set to off or on, no file, no secret or a lapsed connection writes nothing, a refused switch and an unread one are said apart, and a switch made meanwhile is no failure', async () => {
  const variableCalls = (calls) => calls.filter((c) => /\/actions\/variables/.test(c.key)).map((c) => c.key);
  const openTab = async (o) => {
    const env = await open(o);
    await ready(env.page);
    await env.page.click('#rail-folders');
    await env.page.waitForFunction(() => !/^Reading /.test(document.getElementById('fd-tracked').textContent), null, { timeout: 15000 });
    return env;
  };
  const unset = await openTab({ tracked: true, secret: true });
  await unset.page.waitForFunction(() => /The half-hourly sync was never switched on in acme\/demo, so the repository variable SYMPHONY_DRIVE is now set to on\./.test(document.getElementById('fd-tracked').textContent), null, { timeout: 15000 });
  assert.deepEqual(writesIn(unset.calls), ['POST /repos/acme/demo/actions/variables'], 'opening the tab wrote something other than the switch');
  assert.deepEqual(unset.calls.find((c) => c.key === 'POST /repos/acme/demo/actions/variables').body, { name: 'SYMPHONY_DRIVE', value: 'on' });
  assert.deepEqual(unset.errors, []);
  await unset.context.close();
  for (const value of ['on', 'off']) {
    const env = await openTab({ tracked: true, secret: true, switchValue: value });
    await env.page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent), null, { timeout: 15000 });
    await env.page.waitForTimeout(400);
    assert.deepEqual(variableCalls(env.calls), ['GET /repos/acme/demo/actions/variables/SYMPHONY_DRIVE'], 'a switch set to ' + value + ' was written');
    assert.equal(/half-hourly sync/.test(await env.page.textContent('#fd-tracked')), false, 'a switch set to ' + value + ' was spoken of');
    await env.context.close();
  }
  for (const o of [{}, { secret: true }, { tracked: true }, { tracked: true, secret: true, driveJson: Object.assign({}, driveJson, { connected: dayShift(-100) }) }]) {
    const env = await openTab(o);
    await env.page.waitForTimeout(400);
    assert.deepEqual(variableCalls(env.calls), [], JSON.stringify(Object.keys(o)) + ': the switch was asked about where nothing syncs');
    assert.deepEqual(env.errors, []);
    await env.context.close();
  }
  const refused = await openTab({ tracked: true, secret: true, noVariables: true });
  await refused.page.waitForFunction(() => /The half-hourly sync is not switched on in acme\/demo and the repository variable SYMPHONY_DRIVE could not be set to on \(.+\); Sync now still runs it by hand\./.test(document.getElementById('fd-tracked').textContent), null, { timeout: 15000 });
  assert.deepEqual(refused.errors, []);
  await refused.context.close();
  const unread = await openTab({ tracked: true, secret: true, switchReadRefused: true });
  await unread.page.waitForFunction(() => /Whether the half-hourly sync is switched on in acme\/demo could not be read \(.+\)\./.test(document.getElementById('fd-tracked').textContent), null, { timeout: 15000 });
  assert.deepEqual(writesIn(unread.calls), [], 'a switch that could not be read was written');
  await unread.context.close();
  const meanwhile = await openTab({ tracked: true, secret: true, switchConflict: true });
  await meanwhile.page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent), null, { timeout: 15000 });
  await meanwhile.page.waitForTimeout(400);
  assert.deepEqual(writesIn(meanwhile.calls), ['POST /repos/acme/demo/actions/variables']);
  assert.equal(/half-hourly sync/.test(await meanwhile.page.textContent('#fd-tracked')), false, 'a switch made meanwhile was said as a failure');
  await meanwhile.context.close();
});
// A connection kept on this browser for the account, as the page writes it
function keptStorage(entry, login) {
  return { local: Object.assign({}, signedIn().local, { [KEPT]: JSON.stringify({ [login || 'tester']: Object.assign({ provider: 'microsoft', refresh: REFRESH, connected: dayShift(-5), owner: 'Greg (personal)', id: 'drive1', type: 'personal' }, entry || {}) }) }) };
}
async function openFoldersTab(env) {
  await ready(env.page);
  await env.page.click('#rail-folders');
  await tabRead(env.page);
}
await check('R1: a reload finds the drive connected again for the same account, renews its access token with the kept refresh token, and Forget OneDrive forgets it on this browser and in the page, writing nothing to GitHub', async () => {
  const env = await open({});
  const { context, page, calls, service, errors } = env;
  await connect(env);
  await listed(page);
  // the address keeps #folders, so the reload opens the tab by itself
  service.length = 0;
  await page.reload();
  await openFoldersTab(env);
  await page.waitForFunction(() => document.getElementById('fd-connect').textContent === 'Connect OneDrive again', null, { timeout: 15000 });
  await listed(page);
  const renewals = service.filter((s) => s.path === '/drive/token');
  assert.equal(renewals.length, 1, 'the access token was not renewed once with the kept refresh token');
  assert.equal(renewals[0].body.refresh_token, REFRESH);
  assert.match(await page.textContent('#fd-connect-note'), /Connected to OneDrive as Greg \(personal\), kept on this browser for tester/);
  await assertNoTokenOutside(env, 'after the reload');
  calls.length = 0;
  await page.click('#fd-forget');
  await page.waitForFunction(() => /OneDrive is forgotten on this browser/.test(document.getElementById('msg').textContent));
  assert.equal(await page.evaluate((k) => localStorage.getItem(k), KEPT), null, 'Forget OneDrive left the connection on this browser');
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive');
  assert.equal(await page.isHidden('#fd-forget'), true, 'Forget OneDrive is offered with nothing to forget');
  assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0, 'Forget OneDrive wrote to GitHub');
  await page.reload();
  await openFoldersTab(env);
  await page.waitForTimeout(400);
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive', 'a forgotten connection came back on a reload');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('R2: a kept connection Microsoft no longer takes is forgotten on this browser and said, and one past its 90 days or kept for another account is never sent', async () => {
  const dead = await open({ storage: keptStorage(), service: { '/drive/token': { status: 400, body: { error: 'invalid_grant', error_description: 'AADSTS70008: the refresh token has expired' } } } });
  await openFoldersTab(dead);
  await dead.page.waitForFunction(() => /Microsoft no longer takes the OneDrive connection kept on this browser/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.equal(await dead.page.evaluate((k) => localStorage.getItem(k), KEPT), null, 'the refused connection is still kept');
  assert.equal(await dead.page.textContent('#fd-connect'), 'Connect OneDrive');
  assert.deepEqual(dead.errors, []);
  await dead.context.close();
  for (const storage of [keptStorage({ connected: dayShift(-91) }), keptStorage({}, 'other')]) {
    const env = await open({ storage });
    await openFoldersTab(env);
    await env.page.waitForTimeout(400);
    assert.equal(env.service.filter((s) => s.path === '/drive/token').length, 0, 'a connection that is not this account\'s, or past its days, was sent');
    assert.equal(await env.page.textContent('#fd-connect'), 'Connect OneDrive');
    assert.deepEqual(env.errors, []);
    await env.context.close();
  }
});
await check('R3: on a personal account Track renews the secret in each other repository of the account that holds one and tracks the same drive with an older connection, leaves the rest, and says a repository it could not renew, with the steps kept open', async () => {
  const names = ['acme/demo', 'acme/same', 'acme/elsewhere', 'acme/bare', 'acme/refused', 'acme/newer'];
  const other = Object.assign({}, driveJson, { items: [{ id: 'z1', name: 'Z', drive: 'drive9' }] });
  const per = { 'acme/demo': {}, 'acme/same': { tracked: true, secret: true }, 'acme/elsewhere': { tracked: true, secret: true, driveJson: other }, 'acme/bare': { tracked: true }, 'acme/refused': { tracked: true, secret: true, noSecrets: true }, 'acme/newer': { tracked: true, secret: true, driveJson: Object.assign({}, driveJson, { connected: today }) } };
  const listing = names.concat(['acme/old']).map((n) => ({ full_name: n, owner: { login: 'acme' }, private: true, archived: n === 'acme/old' }));
  const env = await trackOn({ routes: repoRoutes({ per, newRepos: listing }, names), repos: ['acme/demo'] });
  const { context, page, calls, errors } = env;
  const puts = writesIn(calls).filter((k) => /\/actions\/secrets\/SYMPHONY_DRIVE_REFRESH$/.test(k));
  assert.deepEqual(puts.sort(), ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/refused/actions/secrets/SYMPHONY_DRIVE_REFRESH', 'PUT /repos/acme/same/actions/secrets/SYMPHONY_DRIVE_REFRESH']);
  for (const k of puts) assert.ok(!Buffer.from(calls.find((c) => c.key === k).body.encrypted_value, 'base64').toString('latin1').includes(REFRESH), 'the token went in the clear to ' + k);
  assert.equal(calls.filter((c) => /acme\/old/.test(c.key)).length, 0, 'an archived repository was asked about');
  const text = await msg(page);
  assert.match(text, /The secret is renewed too in acme\/same, which tracks the same drive\. It could not be renewed in acme\/refused; press Track there\./);
  assert.equal(await page.evaluate(() => document.getElementById('dlg-track').open), true, 'the steps closed over a repository left unrenewed');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('R4: Track with a connection kept from an earlier day dates drive.json by that day, so the tab says when it truly runs out', async () => {
  const env = await open({ storage: keptStorage({ connected: dayShift(-30) }) });
  const { context, page, calls, errors } = env;
  await openFoldersTab(env);
  await listed(page);
  await page.check('#fd-items input[data-id="a1"]');
  await page.click('#fd-track-open');
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo tracks 1 item of OneDrive/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  const file = calls.find((c) => c.key === 'PUT /repos/acme/demo/contents/.github/symphony/drive.json').body;
  assert.equal(JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')).connected, dayShift(-30));
  assert.deepEqual(errors, []);
  await context.close();
});
await check('R5: a connection another tab made meanwhile is neither written over by this page\'s older one nor forgotten when Microsoft refuses the older one', async () => {
  const newer = { provider: 'microsoft', refresh: 'M.NEWER-stand-in', connected: today, owner: 'Greg (personal)', id: 'drive1', type: 'personal' };
  for (const refused of [false, true]) {
    const env = await open({ storage: keptStorage({ connected: dayShift(-5) }) });
    const { context, page, errors } = env;
    // the other tab connects again while this page renews its older token
    await page.route(SERVICE + '/drive/token', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      await page.evaluate(([k, e]) => localStorage.setItem(k, JSON.stringify({ tester: e })), [KEPT, newer]);
      const cors = { 'Access-Control-Allow-Origin': new URL(BASE).origin };
      return route.fulfill(refused
        ? { status: 400, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }) }
        : { status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ access_token: 'EwB-NEW', expires_in: 3599 }) });
    });
    await openFoldersTab(env);
    if (refused) await page.waitForFunction(() => /Microsoft no longer takes/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
    else { await listed(page); await page.waitForFunction(() => /as Greg/.test(document.getElementById('fd-connect-note').textContent), null, { timeout: 15000 }); }
    await page.waitForTimeout(300);
    assert.deepEqual(await keptDrive(page), newer, (refused ? 'a refusal of the older token' : 'the older token') + ' took the newer connection');
    assert.deepEqual(errors, []);
    await context.close();
  }
});
await check('FS8: an organization secret GitHub then withholds from the repository, or whose reach cannot be read, is followed by the repository\'s own secret, and a repository that tracks a drive through the organization\'s secret alone shows it set and has its sync switched on', async () => {
  for (const o of [{ org: true, orgPlan: 'team', orgWithheld: true }, { org: true, orgPlan: 'team', orgListRefused: true }]) {
    const env = await trackOn(o);
    const writes = writesIn(env.calls);
    const org = writes.indexOf('PUT /orgs/acme/actions/secrets/SYMPHONY_DRIVE_REFRESH');
    const own = writes.indexOf('PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH');
    assert.ok(org >= 0 && own > org, JSON.stringify(o) + ': the repository\'s own secret did not follow the organization\'s: ' + writes.join(', '));
    assert.equal(writes.indexOf('POST /orgs/acme/actions/variables'), -1, JSON.stringify(o) + ': the drive was recorded for a secret that does not reach');
    assert.equal(/a secret of acme/.test(await msg(env.page)), false, JSON.stringify(o) + ': the organization\'s secret was said as kept');
    assert.deepEqual(env.errors, []);
    await env.context.close();
  }
  const env = await open({ tracked: true, orgShared: true });
  await ready(env.page);
  await env.page.click('#rail-folders');
  await env.page.waitForFunction(() => /The secret SYMPHONY_DRIVE_REFRESH is set, as the organization's, which GitHub gives this repository\./.test(document.getElementById('fd-tracked').textContent), null, { timeout: 15000 });
  await env.page.waitForFunction(() => /is now set to on/.test(document.getElementById('fd-tracked').textContent), null, { timeout: 15000 });
  assert.deepEqual(writesIn(env.calls), ['POST /repos/acme/demo/actions/variables']);
  assert.deepEqual(env.errors, []);
  await env.context.close();
});
await check('FS1: with no drive the tab is one dashed "+ Add a cloud drive" tile, as + Add repository is drawn; it and the head\'s own open the drives, OneDrive one press away, Google Drive and Dropbox said as coming later, and nothing is asked of Microsoft before the press', async () => {
  const env = await open({});
  const { context, page, authorize, graph, errors } = env;
  await ready(page);
  await page.click('#rail-folders');
  await page.waitForSelector('#fd-add-tile');
  assert.equal((await page.textContent('#fd-add-tile')).trim(), '+ Add a cloud drive');
  assert.match(await page.evaluate(() => getComputedStyle(document.getElementById('fd-add-tile')).borderTopStyle), /dashed/);
  assert.equal(await page.evaluate(() => document.getElementById('dlg-cloud').open), false, 'the drives are offered before + Add is pressed');
  assert.equal(await page.isHidden('#fd-add'), true, 'two + Add buttons stand on the empty tab');
  await page.click('#fd-add-tile');
  assert.equal(await page.evaluate(() => document.getElementById('dlg-cloud').open), true);
  assert.deepEqual(await page.$$eval('#dlg-cloud .clouds__tile', (l) => l.map((t) => [(t.querySelector('.clouds__name') || t).textContent.trim(), t.tagName === 'BUTTON', t.getAttribute('aria-label')])),
    [['Connect OneDrive', true, null], ['Connect Globus', true, null], ['Google Drive', false, 'Google Drive, coming later'], ['Dropbox', false, 'Dropbox, coming later']]);
  assert.equal(await page.evaluate(() => document.getElementById('fd-globus').disabled), true, 'Globus can be pressed while the page is not registered there');
  assert.equal((await page.textContent('#fd-globus .clouds__sub')).trim(), 'Not registered at Globus yet');
  assert.equal(await page.textContent('#fd-cloud-note'), '', 'the dialog gives a reason for a button that can be pressed');
  await page.waitForFunction(() => !document.getElementById('fd-connect').disabled, null, { timeout: 15000 });
  assert.equal(authorize.length, 0, 'Microsoft was asked before the press');
  assert.equal(graph.length, 0);
  await page.click('#fd-connect');
  await page.waitForFunction(() => /Connected to OneDrive/.test((document.getElementById('fd-connect-note') || {}).textContent || ''), null, { timeout: 15000 });
  assert.equal(authorize.length, 1, 'one press is not one trip to Microsoft');
  assert.equal(await page.evaluate(() => document.getElementById('fd-connect-note').classList.contains('folders__who--on')), true, 'the connected drive is not drawn with its cloud');
  assert.equal(await page.$('#fd-add-tile') === null, true, 'the start tile stayed over the drive');
  // once a drive is connected the head carries + Add, for connecting it again
  await page.click('#fd-add');
  assert.equal(await page.evaluate(() => document.getElementById('dlg-cloud').open), true, 'the head\'s + Add does not open the drives');
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive again');
  assert.deepEqual(errors, []);
  await context.close();
});
await check('FS2: a repository that walks the drive (drive-catalog.yml) and has no sync is tracked as it is: Track saves the sealed refresh token alone, with nothing ticked, writes no file and starts no run, and the steps close', async () => {
  const env = await open({ noWorkflow: true, catalog: true });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.click('#fd-track-open');
  await page.waitForFunction(() => /walks the whole drive with \.github\/workflows\/drive-catalog\.yml and has no sync/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.isDisabled('#fd-track'), false, 'Track is held back on the walk-only repository');
  calls.length = 0;
  await page.click('#fd-track');
  await page.waitForFunction(() => /acme\/demo keeps the drive's refresh token as SYMPHONY_DRIVE_REFRESH for drive-catalog\.yml/.test(document.getElementById('msg').textContent));
  const writes = calls.filter((c) => !c.key.startsWith('GET ')).map((c) => c.key);
  assert.deepEqual(writes, ['PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH'], 'more than the secret was written');
  const secret = calls.find((c) => c.key === writes[0]).body;
  assert.equal(secret.key_id, 'k1');
  assert.ok(!Buffer.from(secret.encrypted_value, 'base64').toString('latin1').includes(REFRESH), 'the token went in the clear');
  assert.equal(await page.evaluate(() => document.getElementById('dlg-track').open), false, 'the steps stayed open after Track was done');
  assert.equal(await page.textContent('#fd-connect'), 'Connect OneDrive again', 'the connection did not outlive Track');
  assert.equal(await storageHolds(page, REFRESH), false);
  assert.deepEqual(errors, []);
  await context.close();
  // a repository with neither workflow still has Track held back, with the fold for a new one
  const env2 = await open({ noWorkflow: true });
  await connect(env2);
  await listed(env2.page);
  await env2.page.click('#fd-track-open');
  await env2.page.waitForFunction(() => /has no \.github\/workflows\/drive-sync\.yml/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await env2.page.isDisabled('#fd-track'), true);
  assert.match(await env2.page.textContent('#fd-tracked'), /Need a new repository\? below/);
  assert.deepEqual(env2.errors, []);
  await env2.context.close();
});
await check('FS3: a walk-only repository that is public is tracked into only once its box is ticked', async () => {
  const env = await open({ noWorkflow: true, catalog: true, public: true });
  const { context, page, calls, errors } = env;
  await connect(env);
  await listed(page);
  await page.click('#fd-track-open');
  await page.waitForFunction(() => /walks the whole drive/.test(document.getElementById('fd-tracked').textContent));
  await page.click('#fd-track');
  await page.waitForFunction(() => /is public, so what its walk writes of your drive/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter((c) => c.key.startsWith('PUT ')).length, 0, 'a public repository was written before its box was ticked');
  await page.check('#fd-public');
  await page.click('#fd-track');
  await page.waitForFunction(() => /keeps the drive's refresh token/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter((c) => c.key.startsWith('PUT ')).length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});

/* ---------- Globus: the second drive, read-only, signed in by the page itself ---------- */
// the Globus list is drawn, past its "Reading" line: no ticks on it, so the items are waited for
const listedGlobus = (page) => page.waitForFunction(() => !!document.querySelector('#fd-items [data-item]'), null, { timeout: 15000 });
async function pressGlobus(env) {
  const { page } = env;
  await ready(page);
  await page.click('#rail-folders');
  await openClouds(page);
  await page.waitForFunction(() => !document.getElementById('fd-globus').disabled, null, { timeout: 15000 });
  await page.click('#fd-globus');
  await page.waitForFunction(() => /Connected to Globus/.test((document.getElementById('fd-connect-note') || {}).textContent || ''), null, { timeout: 20000 });
}
const keptGlobus = (page) => keptDrive(page, 'tester|globus');

await check('GL1: Connect Globus goes to Globus Auth with PKCE, offline access and the console as redirect, exchanges the code in the page with the matching verifier and no service, finds the collection by name, keeps only refresh tokens, and draws the home folder read-only with no ticks', async () => {
  const env = await open({ globusClient: 'gl-client-id' });
  const { context, page, service, authorize, globus, errors } = env;
  await pressGlobus(env);
  assert.equal(authorize.length, 1, 'one press is not one trip to Globus');
  const u = authorize[0];
  assert.equal(u.origin + u.pathname, 'https://auth.globus.org/v2/oauth2/authorize');
  assert.equal(u.searchParams.get('client_id'), 'gl-client-id');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('scope'), 'openid profile urn:globus:auth:scope:transfer.api.globus.org:all');
  assert.equal(u.searchParams.get('redirect_uri'), CONSOLE);
  assert.equal(u.searchParams.get('access_type'), 'offline', 'no refresh token was asked for');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(/^[0-9a-f]{32}$/.test(u.searchParams.get('state')), 'a state of 16 random bytes');
  const exchange = globus.filter((g) => g.path === '/v2/oauth2/token' && g.body.grant_type === 'authorization_code');
  assert.equal(exchange.length, 1);
  assert.equal(exchange[0].body.code, 'GLCODE1');
  assert.equal(exchange[0].body.client_id, 'gl-client-id');
  assert.equal(exchange[0].body.redirect_uri, CONSOLE);
  assert.match(exchange[0].type, /application\/x-www-form-urlencoded/);
  assert.equal(exchange[0].query, '?include_consented_scopes=true');
  assert.equal(exchange[0].auth, '', 'a token went to the token endpoint');
  const hash = crypto.createHash('sha256').update(exchange[0].body.code_verifier).digest('base64url');
  assert.equal(hash, u.searchParams.get('code_challenge'), 'the verifier sent is the one the challenge was made from');
  assert.deepEqual(service.filter((s) => s.path !== '/drive/config').map((s) => s.path), [], 'the sign-in service was asked for a Globus connection');
  const fetched = await fetchedFrom(page);
  const atExchange = fetched.find((f) => /oauth2\/token/.test(f.url));
  assert.ok(atExchange, 'the exchange was not seen leaving the page');
  assert.deepEqual(returnWords(atExchange.at), [], 'the code was still in the address when it was exchanged: ' + atExchange.at);
  assertCleanRequests(fetched);
  await listedGlobus(page);
  assert.equal(globus.some((g) => /\/endpoint\/\/ls$/.test(g.path)), false, 'a folder was asked for before the collection was known');
  const search = globus.find((g) => g.path === '/v0.10/endpoint_search');
  assert.ok(search, 'the collection was not looked up');
  assert.equal(search.query.filter_fulltext, 'wsugrid#globus');
  assert.equal(search.query.filter_scope, 'all');
  assert.equal(search.auth, 'Bearer ' + GL_ACCESS_T, 'the Transfer API was not called with its own token');
  assert.ok(globus.find((g) => g.path === '/v0.10/endpoint/' + COLLECTION), 'the collection found by its exact name was not read: ' + JSON.stringify(globus.map((g) => g.path)));
  assert.ok(globus.find((g) => g.path === '/v2/oauth2/userinfo' && g.auth === 'Bearer AgACCESS-auth'), 'who is signed in was not asked with the sign-in\'s own token');
  await listedGlobus(page);
  const ls = globus.filter((g) => g.path === '/v0.10/operation/endpoint/' + COLLECTION + '/ls');
  assert.ok(ls.some((g) => g.query.path === '/home/go2432/'), 'the home folder was not listed: ' + JSON.stringify(ls.map((g) => g.query.path)));
  for (const g of ls) { assert.equal(g.auth, 'Bearer ' + GL_ACCESS_T); assert.equal(g.query.limit, '2000'); assert.equal(g.query.show_hidden, 'false'); }
  for (const g of globus) if (!g.https && g.path !== '/v2/oauth2/userinfo' && !/oauth2\/token/.test(g.path)) assert.equal(g.auth, 'Bearer ' + GL_ACCESS_T, 'another token than the Transfer API\'s reached ' + g.path);
  assert.match(await page.textContent('#fd-connect-note'), /Connected to Globus, wsugrid#globus, as go2432@wayne\.edu, read-only, kept on this browser for tester\./);
  assert.equal(await page.textContent('#fd-forget'), 'Forget Globus');
  assert.equal(await page.isHidden('#fd-forget'), false);
  assert.deepEqual(await keptGlobus(page), { provider: 'globus', refresh: GL_REFRESH_T, connected: today, owner: 'go2432@wayne.edu', id: COLLECTION, type: 'globus', tokens: { 'auth.globus.org': { refresh: 'AgREFRESH-auth' }, 'transfer.api.globus.org': { refresh: GL_REFRESH_T }, [COLLECTION]: { refresh: GL_REFRESH_H } }, name: 'wsugrid#globus', https: HTTPS_SERVER, home: '/home/go2432/' });
  for (const t of [GL_ACCESS_T, GL_ACCESS_H, 'AgACCESS-auth']) assert.equal(await storageHolds(page, t), false, 'an access token is in storage');
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage.getItem('symphony_panel_drive_kept')).indexOf('AgACCESS') >= 0), false, 'an access token is kept with the connection');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_drive_state')), null, 'the pending state was not cleared');
  assert.deepEqual(await page.$$eval('#fd-browser .fx__address button', (l) => l.map((b) => b.textContent)), ['wsugrid#globus', 'home', 'go2432'], 'the address does not walk the home folder');
  assert.deepEqual(await page.$$eval('#fd-items [data-name]', (l) => l.map((n) => n.textContent)), ['data', HOSTILE, 'notes.txt', 'preview.mp4']);
  assert.equal(await page.$$eval('#fd-items input[data-id]', (l) => l.length), 0, 'ticks are drawn on a drive Track never records');
  assert.equal(await page.evaluate(() => window.__hostile), undefined, 'the hostile name ran');
  assert.deepEqual(await page.$$eval('#tab-folders .fx__cmds .fx__tool', (l) => l.filter((b) => b.disabled).map((b) => b.textContent)), ['New folder', 'Upload', 'Cut', 'Copy', 'Paste', 'Rename', 'Share', 'Delete', 'Download', 'Properties']);
  await page.click('#fd-items [data-item="/home/go2432/notes.txt"]');
  assert.deepEqual(await page.$$eval('#tab-folders .fx__cmds .fx__tool', (l) => l.filter((b) => !b.disabled).map((b) => b.textContent)), ['Download', 'Properties', 'View \u25BE', 'Preview'], 'a writing verb can be pressed on Globus');
  assert.match(await page.textContent('#fd-status'), /Read-only\./);
  assert.equal(await page.evaluate(() => document.getElementById('fd-track').classList.contains('console__primary')), false, 'Track is the filled button on a drive it never records');
  assert.deepEqual(await page.$$eval('#fd-tree .fx__nodename', (l) => l.map((n) => n.textContent)), ['wsugrid#globus', 'data'], 'the tree does not show the home folder\'s folders under the collection');
  assert.equal(await page.evaluate(() => document.getElementById('fd-connect-note').classList.contains('folders__who--globus')), true);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('GL2: on Globus a double click opens a file in a new tab at the collection\'s own HTTPS address, a folder opens and Up comes back, a path typed opens that folder, Enter asks the folder for the names, Download asks the address with ?download, the preview pane fetches a text with the collection\'s token and plays a video from the address, Properties says the path and the permissions, and the menu offers nothing that writes', async () => {
  const env = await open({ globusClient: 'gl-client-id' });
  const { context, page, globus, errors } = env;
  await pressGlobus(env);
  await listedGlobus(page);
  await recordOpens(page);
  await page.dblclick('#fd-items [data-item="/home/go2432/preview.mp4"]');
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /Opening preview\.mp4 from wsugrid#globus in a new tab/.test(t)), null, { timeout: 15000 });
  assert.deepEqual(await page.evaluate(() => window.__opened), ['window:' + HTTPS_SERVER + '/home/go2432/preview.mp4'], 'the file did not open at the collection\'s address');
  assert.equal(globus.some((g) => g.https), false, 'the page itself fetched the file on a double click');
  // a folder
  await page.dblclick('#fd-items [data-item="/home/go2432/data/"]');
  await page.waitForFunction(() => document.querySelector('#fd-items [data-item="/home/go2432/data/clip one.mkv"]'), null, { timeout: 15000 });
  assert.deepEqual(await page.$$eval('#fd-browser .fx__address button', (l) => l.map((b) => b.textContent)), ['wsugrid#globus', 'home', 'go2432', 'data']);
  await page.evaluate(() => { window.__opened = []; });
  await page.dblclick('#fd-items [data-item="/home/go2432/data/clip one.mkv"]');
  await sleep(400);
  assert.deepEqual(await page.evaluate(() => window.__opened), ['window:' + HTTPS_SERVER + '/home/go2432/data/clip%20one.mkv'], 'a name with a blank was not encoded once');
  await page.click('#tab-folders .fx__bar .fx__tool[title^="Up"]');
  await page.waitForFunction(() => document.querySelector('#fd-items [data-item="/home/go2432/notes.txt"]'), null, { timeout: 15000 });
  // a path typed into the search box
  await page.fill('#fd-search', '/rs/');
  await page.press('#fd-search', 'Enter');
  await page.waitForFunction(() => /This folder is empty/.test(document.getElementById('fd-main').textContent), null, { timeout: 15000 });
  assert.deepEqual(await page.$$eval('#fd-browser .fx__address button', (l) => l.map((b) => b.textContent)), ['wsugrid#globus', 'rs']);
  assert.ok(globus.some((g) => g.query && g.query.path === '/rs/'), '/rs/ was not asked for');
  // a word asks the folder shown for its names
  await page.click('#tab-folders .fx__bar .fx__tool[title^="Back"]');
  await page.waitForFunction(() => document.querySelector('#fd-items [data-item="/home/go2432/notes.txt"]'), null, { timeout: 15000 });
  await page.fill('#fd-search', 'notes');
  await page.press('#fd-search', 'Enter');
  await page.waitForFunction(() => /Names matching "notes" in go2432/.test(document.querySelector('#fd-browser .fx__address').textContent), null, { timeout: 15000 });
  const filtered = globus.find((g) => g.query && g.query.filter);
  assert.ok(filtered, 'no filtered listing was asked for');
  assert.equal(filtered.query.filter, 'name:~*notes*');
  assert.equal(filtered.query.path, '/home/go2432/');
  await page.click('#tab-folders .fx__bar .fx__tool[title^="Back"]');
  await page.waitForFunction(() => document.querySelector('#fd-items [data-item="/home/go2432/notes.txt"]') && !/Names matching/.test(document.querySelector('#fd-browser .fx__address').textContent), null, { timeout: 15000 });
  // the menu, Download and Properties
  await page.click('#fd-items [data-item="/home/go2432/notes.txt"]', { button: 'right' });
  await page.waitForSelector('#fd-menu');
  assert.deepEqual(await page.$$eval('#fd-menu button', (l) => l.map((b) => b.textContent)), ['Open in a new tab', 'Download', 'Properties']);
  await page.evaluate(() => { window.__opened = []; });
  await page.click('#fd-menu button:has-text("Download")');
  await sleep(400);
  assert.deepEqual(await page.evaluate(() => window.__opened), ['window:' + HTTPS_SERVER + '/home/go2432/notes.txt?download']);
  await page.click('#fd-items [data-item="/home/go2432/notes.txt"]', { button: 'right' });
  await page.click('#fd-menu button:has-text("Properties")');
  await page.waitForSelector('#fx-props');
  const props = await page.textContent('#fx-props');
  assert.match(props, /Path:\s*\/home\/go2432\/notes\.txt/);
  assert.match(props, /Permissions:\s*0644\s+go2432 osc/);
  assert.match(props, /Location:\s*wsugrid#globus\/home\/go2432/);
  assert.equal(globus.filter((g) => g.https).length, 0, 'Properties fetched the file');
  await page.keyboard.press('Escape');
  // the preview pane: a text fetched into the page, a video played from the address
  await page.click('#fx-cmd-pane');
  await page.click('#fd-items [data-item="/home/go2432/notes.txt"]');
  await page.waitForFunction(() => /hello from the grid/.test(document.getElementById('fd-preview').textContent), null, { timeout: 15000 });
  const got = globus.find((g) => g.https && g.path === '/home/go2432/notes.txt');
  assert.ok(got, 'the text was not fetched');
  assert.equal(got.auth, 'Bearer ' + GL_ACCESS_H, 'the text was not fetched with the collection\'s own token');
  // the video is asked from its address by the browser's own player, with no token; this
  // headless browser cannot play the stand-in's bytes, so the pane offers the new tab instead
  await page.click('#fd-items [data-item="/home/go2432/preview.mp4"]');
  await page.waitForFunction(() => document.querySelector('#fd-preview video') || /could not play it here/.test(document.getElementById('fd-preview').textContent), null, { timeout: 15000 });
  await page.waitForFunction(() => (window.__fetched || true) && true);
  const played = globus.filter((g) => g.https && /preview\.mp4/.test(g.path));
  assert.ok(played.length >= 1, 'the video was not asked from the collection\'s address');
  for (const g of played) assert.equal(g.auth, '', 'the video was fetched into the page with a token instead of played from its address');
  if (/could not play it here/.test(await page.textContent('#fd-preview'))) assert.equal(await page.$('#fd-preview button:has-text("Open in a new tab")') !== null, true, 'a video the browser cannot play here has no way out');
  // the list's own menu writes nothing
  await page.$eval('#fd-main', (m) => m.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 400 })));
  await page.waitForSelector('#fd-menu');
  assert.deepEqual(await page.$$eval('#fd-menu button', (l) => l.map((b) => b.textContent)), ['Select all', 'Refresh']);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors.filter((e) => !/media|MEDIA|video/i.test(e)), []);
  await context.close();
});

await check('GL3: a collection that asks for its own consent sends the page once more to Globus Auth, at once after Connect, with the scopes it named and the collection\'s HTTPS scope, and the list follows; a kept connection asks with a button instead', async () => {
  // the collection refuses every list until one more consent has been exchanged, as Globus does
  let consents = 2;
  const table = transferRoutes();
  const plain = table['/v0.10/operation/endpoint/' + COLLECTION + '/ls'];
  table['/v0.10/operation/endpoint/' + COLLECTION + '/ls'] = (call) => {
    const exchanged = env.globus.filter((g) => g.path === '/v2/oauth2/token' && g.body.grant_type === 'authorization_code').length;
    if (exchanged < consents) return { status: 403, body: { code: 'ConsentRequired', message: 'Missing required data_access consent', required_scopes: ['urn:globus:auth:scope:transfer.api.globus.org:all[*https://auth.globus.org/scopes/' + COLLECTION + '/data_access]'] } };
    return plain(call);
  };
  const env = await open({ globusClient: 'gl-client-id', transfer: table });
  const { context, page, authorize, globus, errors } = env;
  await pressGlobus(env);
  await listedGlobus(page);
  assert.equal(authorize.length, 2, 'the consent did not send the page to Globus once more');
  assert.equal(authorize[1].searchParams.get('scope'), 'openid profile urn:globus:auth:scope:transfer.api.globus.org:all[*https://auth.globus.org/scopes/' + COLLECTION + '/data_access] https://auth.globus.org/scopes/' + COLLECTION + '/https');
  assert.equal(authorize[1].searchParams.get('redirect_uri'), CONSOLE);
  assert.equal(globus.filter((g) => g.path === '/v2/oauth2/token' && g.body.grant_type === 'authorization_code').length, 2);
  assert.equal(globus.filter((g) => g.path === '/v0.10/endpoint_search').length, 1, 'the collection was looked up again after the consent');
  assert.deepEqual(await page.$$eval('#fd-items [data-name]', (l) => l.map((n) => n.textContent)), ['data', HOSTILE, 'notes.txt', 'preview.mp4']);
  assert.equal((await keptGlobus(page)).id, COLLECTION);
  // the connection kept, its consent gone again: the list asks with a button, and the page stays
  consents = 3;
  authorize.length = 0;
  await page.reload();
  await ready(page);
  await page.click('#rail-folders');
  await page.waitForSelector('#fd-main button:has-text("Allow it at Globus")', { timeout: 15000 });
  assert.equal(authorize.length, 0, 'the page left for Globus on its own');
  assert.match(await page.textContent('#fd-main'), /wsugrid#globus needs your consent/);
  await page.click('#fd-main button:has-text("Allow it at Globus")');
  await page.waitForFunction(() => /Connected to Globus/.test((document.getElementById('fd-connect-note') || {}).textContent || ''), null, { timeout: 20000 });
  await listedGlobus(page);
  assert.equal(authorize.length, 1);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('GL4: Globus stays connected on this browser through a reload, its access tokens renewed from the kept refresh tokens; with OneDrive connected too each is a root in the tree, a press switches, and Forget Globus leaves OneDrive in place', async () => {
  const env = await open({ globusClient: 'gl-client-id' });
  const { context, page, authorize, globus, errors } = env;
  await pressGlobus(env);
  await listedGlobus(page);
  globus.length = 0;
  await page.reload();
  await ready(page);
  await page.click('#rail-folders');
  await listedGlobus(page);
  assert.equal(authorize.length, 1, 'the reload went to Globus again');
  const renewals = globus.filter((g) => g.path === '/v2/oauth2/token' && g.body.grant_type === 'refresh_token');
  assert.ok(renewals.some((g) => g.body.refresh_token === GL_REFRESH_T && g.body.client_id === 'gl-client-id'), 'the Transfer API\'s token was not renewed from its refresh token');
  assert.ok(globus.some((g) => g.path === '/v0.10/operation/endpoint/' + COLLECTION + '/ls' && g.auth === 'Bearer AG-renewed-' + GL_REFRESH_T), 'the renewed token was not the one used');
  assert.equal(globus.filter((g) => g.path === '/v0.10/endpoint_search').length, 0, 'the collection was looked up again after a reload');
  assert.deepEqual(await page.$$eval('#fd-browser .fx__address button', (l) => l.map((b) => b.textContent)), ['wsugrid#globus', 'home', 'go2432'], 'the home folder was not opened again from what was kept');
  // OneDrive beside it
  await openClouds(page);
  await page.click('#fd-connect');
  await page.waitForFunction(() => /Connected to OneDrive/.test((document.getElementById('fd-connect-note') || {}).textContent || ''), null, { timeout: 15000 });
  await listed(page);
  assert.match(await page.textContent('#fd-connect-note'), /Globus is connected too: press wsugrid#globus in the folder tree\./);
  assert.equal(await page.textContent('#fd-other-root'), 'wsugrid#globus');
  assert.deepEqual(await page.$$eval('#fd-browser .fx__address button', (l) => l.map((b) => b.textContent)), ['OneDrive']);
  assert.ok(await keptGlobus(page), 'connecting OneDrive forgot Globus');
  assert.ok(await keptDrive(page), 'OneDrive is not kept beside Globus');
  await page.click('#fd-other-root');
  await page.waitForFunction(() => /Connected to Globus/.test(document.getElementById('fd-connect-note').textContent), null, { timeout: 15000 });
  await listedGlobus(page);
  assert.equal(await page.textContent('#fd-other-root'), 'OneDrive');
  assert.deepEqual(await page.$$eval('#fd-browser .fx__address button', (l) => l.map((b) => b.textContent)), ['wsugrid#globus', 'home', 'go2432']);
  assert.equal(await page.textContent('#fd-forget'), 'Forget Globus');
  // Track is OneDrive's
  await page.click('#fd-track-open');
  await page.click('#fd-track');
  await page.waitForFunction(() => (window.__msgs || []).some((t) => /Track records folders of OneDrive/.test(t)), null, { timeout: 15000 });
  assert.equal(env.calls.filter((c) => c.key.indexOf('PUT ') === 0).length, 0, 'Track wrote something for a Globus collection');
  // the reload remembers which drive was shown
  await page.reload();
  await ready(page);
  await page.click('#rail-folders');
  await listedGlobus(page);
  assert.match(await page.textContent('#fd-connect-note'), /Connected to Globus/);
  await page.click('#fd-forget');
  await page.waitForFunction(() => /Connected to OneDrive/.test(document.getElementById('fd-connect-note').textContent), null, { timeout: 15000 });
  assert.equal(await keptGlobus(page), null, 'Forget Globus kept it');
  assert.ok(await keptDrive(page), 'Forget Globus forgot OneDrive');
  assert.equal(await page.$('#fd-other-root'), null, 'a forgotten drive is still a root');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('GL5: a sign-in refused at Globus, or come back with another state, connects nothing, exchanges nothing and says so with the word Globus', async () => {
  for (const o of [{ denied: true }, { wrongState: true }]) {
    const env = await open(Object.assign({ globusClient: 'gl-client-id' }, o));
    const { context, page, globus, errors } = env;
    await ready(page);
    await page.click('#rail-folders');
    await openClouds(page);
    await page.click('#fd-globus');
    await page.waitForFunction(() => (window.__msgs || []).some((t) => /Globus did not connect the drive|Globus connection did not come back the way it left/.test(t)), null, { timeout: 15000 });
    await page.waitForFunction(() => location.hash === '#folders', null, { timeout: 15000 });
    assert.equal(globus.length, 0, 'something was exchanged or read: ' + JSON.stringify(globus.map((g) => g.path)));
    assert.equal(await keptGlobus(page), null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_drive_state')), null);
    assert.ok(await page.$('#fd-add-tile'), 'the empty tab is not drawn');
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await check('GL6: a collection that will not list says why with the fixes linked (Globus\'s file manager at the folder, a fresh sign-in, the consents, the status, and Beethoven for a shell on the grid), and a search that finds only a lookalike names no collection', async () => {
  const table = transferRoutes();
  table['/v0.10/operation/endpoint/' + COLLECTION + '/ls'] = () => ({ status: 502, body: { code: 'ExternalError.DirListingFailed.GCDisconnected', message: 'The collection is not connected' } });
  const env = await open({ globusClient: 'gl-client-id', transfer: table });
  const { context, page, errors } = env;
  await pressGlobus(env);
  await page.waitForSelector('#fd-main .fx__trouble', { timeout: 15000 });
  assert.match(await page.textContent('#fd-main'), /could not be read: Globus answered 502: The collection is not connected\./);
  const links = await page.$$eval('#fd-main .fx__trouble a', (l) => l.map((a) => [a.textContent, a.href]));
  assert.deepEqual(links.map((l) => l[0]), ['Globus\'s own file manager', 'your Globus consents', 'Globus\'s status', 'what Beethoven does', 'install Beethoven in Chrome', 'OnDemand']);
  assert.equal(links[0][1], 'https://app.globus.org/file-manager?origin_id=' + COLLECTION + '&origin_path=' + encodeURIComponent('/home/go2432/'));
  assert.match(links[4][1], /^https:\/\/chromewebstore\.google\.com\/detail\/beethoven\//);
  assert.equal(await page.$('#fd-main .fx__trouble button:has-text("Connect Globus again")') !== null, true, 'no fresh sign-in is offered');
  assert.deepEqual(errors, []);
  await context.close();
  // a lookalike alone: no collection is taken, since the person would open a stranger's files
  const table2 = transferRoutes();
  table2['/v0.10/endpoint_search'] = { DATA: [{ id: 'other-id', display_name: 'wsugrid#globus-old', canonical_name: 'x' }] };
  const env2 = await open({ globusClient: 'gl-client-id', transfer: table2 });
  await ready(env2.page);
  await env2.page.click('#rail-folders');
  await openClouds(env2.page);
  await env2.page.waitForFunction(() => !document.getElementById('fd-globus').disabled, null, { timeout: 15000 });
  await env2.page.click('#fd-globus');
  await env2.page.waitForFunction(() => /found no collection named wsugrid#globus/.test((document.getElementById('fd-main') || {}).textContent || ''), null, { timeout: 20000 });
  assert.equal(env2.globus.some((g) => g.path === '/v0.10/endpoint/other-id'), false, 'the lookalike was read');
  assert.deepEqual(env2.errors, []);
  await env2.context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
