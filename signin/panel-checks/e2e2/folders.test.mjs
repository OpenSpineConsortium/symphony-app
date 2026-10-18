// End-to-end checks of the control panel's Folders page (site branch claude/folders-page,
// 2026-10-18) against a mocked api.github.com, a mocked Microsoft consent page, a mocked Microsoft
// Graph and a mocked sign-in service at https://signin.example.test. Each check states what the
// page promises; a FAIL is a defect. Every token here is a stand-in.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const SERVICE = 'https://signin.example.test';
const PAGE = '/symphony/control/folders.html';
const now = new Date().toISOString();
const today = now.slice(0, 10);
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

const driveJson = { provider: 'microsoft', folder: 'papers', items: [{ id: 'f1', name: 'Papers', drive: 'drive1' }, { id: 'b1', name: 'one.docx', drive: 'drive1' }], connected: '2026-10-18' };
function repoRoutes(opts) {
  const o = opts || {};
  return {
    'GET /user': { login: 'tester' },
    'GET /repos/acme/demo': { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
    'GET /repos/acme/demo/contents/.github/workflows/drive-sync.yml': o.noWorkflow ? undefined : { name: 'drive-sync.yml', sha: 'w1', type: 'file' },
    'GET /repos/acme/demo/contents/.github/symphony/drive.json': o.tracked ? { raw: JSON.stringify(driveJson), json: { sha: 'd1', content: Buffer.from(JSON.stringify(driveJson)).toString('base64'), encoding: 'base64' } } : undefined,
    'GET /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH': o.secret ? { name: 'SYMPHONY_DRIVE_REFRESH', created_at: now, updated_at: now } : undefined,
    'GET /repos/acme/demo/actions/secrets/public-key': o.noSecretsRead ? { status: 403, body: { message: 'Resource not accessible by integration' } } : { key_id: 'k1', key: PUBLIC_KEY },
    'PUT /repos/acme/demo/actions/secrets/SYMPHONY_DRIVE_REFRESH': o.noSecrets ? { status: 403, body: { message: 'Resource not accessible by integration' } } : { status: 201, body: {} },
    'PUT /repos/acme/demo/contents/.github/symphony/drive.json': o.protectedMain ? ((req) => {
      const body = JSON.parse(req.postData());
      return body.branch === 'main' ? { status: 409, body: { message: 'Changes must be made through a pull request.' } } : { status: 201, body: { content: { sha: 'new' } } };
    }) : { status: 201, body: { content: { sha: 'new' } } },
    'GET /repos/acme/demo/git/ref/heads/main': { object: { sha: 'abc123' } },
    'POST /repos/acme/demo/git/refs': { status: 201, body: { ref: 'refs/heads/symphony/drive' } },
    'GET /repos/acme/demo/pulls': [],
    'POST /repos/acme/demo/pulls': { status: 201, body: { number: 9, html_url: 'https://github.com/acme/demo/pull/9' } },
    'POST /repos/acme/demo/actions/workflows/drive-sync.yml/dispatches': o.noActions ? { status: 403, body: { message: 'Resource not accessible by integration' } } : null,
    'GET /user/repos': o.newRepos || [],
  };
}
const HOSTILE = '"quoted" <img src=x onerror=window.__hostile=1> a/b\\c \'x\'';
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

const browser = await chromium.launch();
async function open(opts) {
  const o = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const calls = [];
  const service = [];
  const authorize = [];
  const graph = [];
  const routes = o.routes || repoRoutes(o);
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    let body = null;
    if (req.method() !== 'GET') { try { body = req.postDataJSON(); } catch (e) { body = req.postData(); } }
    calls.push({ key, url: req.url(), body, auth: req.headers()['authorization'] || '' });
    let r = routes[key];
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
  // GitHub's own sign-in, for the one check that lands a GitHub return on the page
  await context.route('https://github.com/login/oauth/**', (route) => {
    const u = new URL(route.request().url());
    authorize.push(u);
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify(u.searchParams.get('redirect_uri') + '?code=GHCODE&state=' + encodeURIComponent(u.searchParams.get('state'))) + ')</script>' });
  });
  await context.route(SERVICE + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': new URL(BASE).origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const path = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
    service.push({ path, body, origin: req.headers()['origin'] || '', method: req.method() });
    let answer = o.service && o.service[path];
    if (!answer && path === '/drive/config') answer = { status: 200, body: { microsoft: { client_id: 'ms-client-id' } } };
    if (!answer && path === '/drive/connect') answer = { status: 200, body: { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3599, scope: 'Files.ReadWrite' } };
    if (!answer && path === '/drive/token') answer = { status: 200, body: { access_token: 'EwB-NEW', expires_in: 3599 } };
    if (!answer && path === '/exchange') answer = { status: 200, body: { access_token: 'ghu_TOKEN', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } };
    if (!answer) answer = { status: 404, body: { error: 'no_such_route' } };
    return route.fulfill({ status: answer.status, contentType: 'application/json', headers: cors, body: JSON.stringify(answer.body) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/symphony/control/');
  await page.evaluate((s) => {
    localStorage.clear(); sessionStorage.clear();
    for (const k in (s.local || {})) localStorage.setItem(k, s.local[k]);
    for (const k in (s.session || {})) sessionStorage.setItem(k, s.session[k]);
  }, o.storage === undefined ? { local: { symphony_panel_token: 'github_pat_TEST', symphony_panel_repos: JSON.stringify(['acme/demo']), symphony_panel_repo: 'acme/demo' } } : o.storage);
  service.length = 0; calls.length = 0;
  if (!o.noLoad) await page.goto(BASE + (o.path || PAGE));
  return { context, page, calls, service, authorize, graph, errors };
}
const msg = (page) => page.textContent('#msg');
async function connect(page) {
  await page.waitForSelector('#cp-app:not(.hidden)');
  await page.waitForFunction(() => !document.getElementById('fd-connect').disabled && document.getElementById('fd-connect-note').textContent === '');
  await page.click('#fd-connect');
  await page.waitForFunction(() => /Connected to OneDrive/.test(document.getElementById('fd-connect-note').textContent));
}
function storageHolds(page, text) {
  return page.evaluate((t) => {
    const all = [];
    for (let i = 0; i < localStorage.length; i++) all.push(localStorage.getItem(localStorage.key(i)));
    for (let i = 0; i < sessionStorage.length; i++) all.push(sessionStorage.getItem(sessionStorage.key(i)));
    return all.some((v) => v && v.indexOf(t) >= 0);
  }, text);
}

await check('A: with no provider set up, Connect cannot be pressed and one line says the owner has not set it up; nothing else was called', async () => {
  const { context, page, service, authorize, errors } = await open({ service: { '/drive/config': { status: 200, body: { microsoft: null } } } });
  await page.waitForSelector('#cp-app:not(.hidden)');
  await page.waitForFunction(() => /has not set OneDrive up/.test(document.getElementById('fd-connect-note').textContent));
  assert.equal(await page.isDisabled('#fd-connect'), true);
  assert.equal(service.filter((s) => s.path === '/drive/config').length, 1);
  assert.equal(service.filter((s) => s.path !== '/drive/config').length, 0);
  assert.equal(authorize.length, 0);
  assert.match(await page.textContent('#fd-browser'), /Connect OneDrive first/);
  assert.match(await page.textContent('#fd-tracked'), /acme\/demo tracks no drive yet/);
  assert.match(await page.textContent('body'), /Google Drive comes later/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('B: Connect goes to Microsoft with PKCE and the page as redirect, comes back, exchanges at /drive/connect with the matching verifier, and the GitHub handler never sees it', async () => {
  const { context, page, service, authorize, graph, errors } = await open({ path: PAGE + '?repo=acme/demo' });
  await connect(page);
  assert.equal(authorize.length, 1);
  const u = authorize[0];
  assert.equal(u.origin + u.pathname, 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  assert.equal(u.searchParams.get('client_id'), 'ms-client-id');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('scope'), 'Files.ReadWrite offline_access');
  assert.equal(u.searchParams.get('redirect_uri'), BASE + PAGE);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(/^[0-9a-f]{32}$/.test(u.searchParams.get('state')), 'a state of 16 random bytes');
  const exchange = service.filter((s) => s.path === '/drive/connect');
  assert.equal(exchange.length, 1);
  assert.equal(exchange[0].body.provider, 'microsoft');
  assert.equal(exchange[0].body.code, 'MSCODE1');
  assert.equal(exchange[0].body.redirect_uri, BASE + PAGE);
  const hash = crypto.createHash('sha256').update(exchange[0].body.code_verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(hash, u.searchParams.get('code_challenge'), 'the verifier sent is the one the challenge was made from');
  assert.equal(service.filter((s) => s.path === '/exchange').length, 0, 'the GitHub sign-in handler saw the drive\'s code');
  assert.equal(await page.evaluate(() => location.search), '?repo=acme%2Fdemo', 'the code left the address and the repository query came back');
  assert.equal(await storageHolds(page, ACCESS), false, 'the access token is in storage');
  assert.equal(await storageHolds(page, REFRESH), false, 'the refresh token is in storage');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_drive_state')), null, 'the pending state was not cleared');
  assert.match(await page.textContent('#fd-connect-note'), /Connected to OneDrive as Greg \(personal\)/);
  assert.ok(graph.find((g) => g.key === 'GET /v1.0/me/drive' && g.auth === 'Bearer ' + ACCESS), 'the drive was named with the access token');
  assert.equal(await page.textContent('#cp-who') !== '', true, 'still signed in to GitHub');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('C: the drive is drawn from Graph with $select and $top, a folder opens, its second page follows, files and folders tick, a hostile name stays text, nothing is written', async () => {
  const { context, page, calls, graph, errors } = await open({});
  await connect(page);
  await page.waitForSelector('#fd-items tbody tr');
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
  const { context, page, calls, service, errors } = await open({});
  await connect(page);
  await page.waitForSelector('#fd-items tbody tr');
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
    const { context, page, calls, errors } = await open(opts);
    await connect(page);
    await page.waitForSelector('#fd-items tbody tr');
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
  routes['GET /repos/acme/demo/actions/secrets/public-key'] = async () => { await new Promise((r) => setTimeout(r, 300)); return { key_id: 'k1', key: PUBLIC_KEY }; };
  const { context, page, calls, errors } = await open({ routes });
  await connect(page);
  await page.waitForSelector('#fd-items tbody tr');
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
  const { context, page, calls, errors } = await open({ noActions: true });
  await connect(page);
  await page.waitForSelector('#fd-items tbody tr');
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

await check('E4: a folder that is not one plain name is refused in words before anything is written', async () => {
  const { context, page, calls, errors } = await open({});
  await connect(page);
  await page.waitForSelector('#fd-items tbody tr');
  await page.check('#fd-items input[data-id="a1"]');
  calls.length = 0;
  // the page trims the box first, so a blank at either end is no refusal; a dot at the end is
  for (const bad of ['', 'a/b', '..', 'papers.', '.papers', 'pa pers.', 'x'.repeat(81), 'a\\b', 'pa:pers']) {
    await page.$eval('#fd-folder', (box, v) => { box.value = v; }, bad);
    await page.$eval('#msg', (m) => { m.textContent = ''; });
    await page.click('#fd-track');
    await page.waitForFunction(() => /The folder is one name of up to 80 letters/.test(document.getElementById('msg').textContent));
    assert.equal(calls.filter((c) => !c.key.startsWith('GET ')).length, 0, 'a write for the folder ' + JSON.stringify(bad));
    assert.equal(calls.length, 0, 'a read for the folder ' + JSON.stringify(bad));
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
  await page.waitForSelector('#cp-app:not(.hidden)');
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
  await page.waitForSelector('#cp-app:not(.hidden)');
  await page.waitForFunction(() => /tracks 2 items/.test(document.getElementById('fd-tracked').textContent));
  assert.match(await page.textContent('#fd-tracked'), /The secret SYMPHONY_DRIVE_REFRESH is not set, so the sync ends at once: press Connect OneDrive, then Track/);
  await page.click('#fd-tracked button');
  await page.waitForFunction(() => /could not be started from here \(403/.test(document.getElementById('msg').textContent));
  assert.match(await msg(page), /Open https:\/\/github.com\/acme\/demo\/actions\/workflows\/drive-sync.yml and press "Run workflow"/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G: a return with a code and a state the page never issued is refused, said, cleaned from the address, and exchanged nowhere', async () => {
  const { context, page, service, errors } = await open({ path: PAGE + '?code=STRANGER&state=nobody&repo=acme/demo' });
  await page.waitForSelector('#cp-app:not(.hidden)');
  await page.waitForFunction(() => /a code and a state it never issued, so nothing was exchanged/.test(document.getElementById('msg').textContent));
  assert.equal(service.filter((s) => s.path === '/drive/connect' || s.path === '/exchange').length, 0);
  assert.equal(await page.evaluate(() => location.search), '?repo=acme%2Fdemo');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G2: a drive return whose state differs from the one issued is refused and said, with nothing exchanged', async () => {
  const { context, page, service, errors } = await open({ wrongState: true });
  await page.waitForSelector('#cp-app:not(.hidden)');
  await page.waitForFunction(() => !document.getElementById('fd-connect').disabled && document.getElementById('fd-connect-note').textContent === '');
  await page.click('#fd-connect');
  await page.waitForFunction(() => /did not come back the way it left/.test(document.getElementById('msg').textContent));
  assert.equal(service.filter((s) => s.path === '/drive/connect' || s.path === '/exchange').length, 0);
  assert.equal(await page.evaluate(() => location.search), '');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G3: Microsoft refusing the consent is said in Microsoft\'s words, and the page stays signed in to GitHub', async () => {
  const { context, page, service, errors } = await open({ denied: true });
  await page.waitForSelector('#cp-app:not(.hidden)');
  await page.waitForFunction(() => !document.getElementById('fd-connect').disabled && document.getElementById('fd-connect-note').textContent === '');
  await page.click('#fd-connect');
  await page.waitForFunction(() => /Microsoft did not connect the drive \(access_denied: The user has denied access\.\)/.test(document.getElementById('msg').textContent));
  assert.equal(service.filter((s) => s.path === '/drive/connect').length, 0);
  await page.waitForSelector('#cp-app:not(.hidden)');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H: a GitHub sign-in that lands on the Folders page is still the sign-in handler\'s: exchanged at /exchange, not at /drive/connect', async () => {
  const { context, page, service, errors } = await open({ storage: {} });
  await page.waitForSelector('#cp-gate:not(.hidden)');
  await page.click('#cp-signin');
  await page.waitForSelector('#cp-app:not(.hidden)');
  assert.equal(service.filter((s) => s.path === '/exchange').length, 1);
  assert.equal(service.filter((s) => s.path === '/drive/connect').length, 0);
  assert.equal(service.find((s) => s.path === '/exchange').body.redirect_uri, BASE + PAGE);
  assert.equal(await page.evaluate(() => location.search), '');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I: a default branch that takes only pull requests gets the file on symphony/drive with a pull request, and no run is started', async () => {
  const { context, page, calls, errors } = await open({ protectedMain: true });
  await connect(page);
  await page.waitForSelector('#fd-items tbody tr');
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
  assert.equal(keys.filter((k) => /dispatches/.test(k)).length, 0, 'a run was started with no file on the default branch');
  assert.match(await msg(page), /merge it, then press Sync now/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('J: Refresh lists a new repository made from the template, chooses it, and the Create link opens GitHub\'s template form', async () => {
  const fresh = { full_name: 'acme/fresh', default_branch: 'main', private: true, topics: [], id: 125, owner: { id: 77, login: 'acme' }, template_repository: { full_name: 'OpenSpineConsortium/symphony-template' } };
  const other = { full_name: 'acme/unrelated', default_branch: 'main', private: true, topics: [], id: 126, owner: { id: 77, login: 'acme' }, template_repository: null };
  const routes = repoRoutes({ newRepos: [fresh, other] });
  routes['GET /repos/acme/fresh'] = fresh;
  routes['GET /repos/acme/fresh/contents/.github/workflows/drive-sync.yml'] = { name: 'drive-sync.yml', sha: 'w1' };
  const { context, page, errors } = await open({ routes });
  await page.waitForSelector('#cp-app:not(.hidden)');
  assert.equal(await page.getAttribute('#fd-create', 'href'), 'https://github.com/new?template_owner=OpenSpineConsortium&template_name=symphony-template');
  assert.equal(await page.getAttribute('#fd-create', 'target'), '_blank');
  await page.click('#fd-reload');
  await page.waitForFunction(() => /Added to the list: acme\/fresh\. acme\/fresh is chosen\./.test(document.getElementById('msg').textContent));
  assert.equal(await page.inputValue('#fd-repo'), 'acme/fresh');
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('symphony_panel_repos'))), ['acme/demo', 'acme/fresh']);
  await page.waitForFunction(() => /acme\/fresh tracks no drive yet/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.textContent('#fd-track'), 'Track in acme/fresh');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('K: a repository with no drive-sync.yml is said, and Track cannot be pressed there', async () => {
  const { context, page, errors } = await open({ noWorkflow: true });
  await page.waitForSelector('#cp-app:not(.hidden)');
  await page.waitForFunction(() => /has no \.github\/workflows\/drive-sync\.yml/.test(document.getElementById('fd-tracked').textContent));
  assert.equal(await page.isDisabled('#fd-track'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('L: an access token that has run out is renewed through /drive/token with the refresh token before the next Graph read', async () => {
  const { context, page, service, graph, errors } = await open({ service: { '/drive/connect': { status: 200, body: { access_token: ACCESS, refresh_token: REFRESH, expires_in: 30, scope: 'Files.ReadWrite' } } } });
  await connect(page);
  await page.waitForSelector('#fd-items tbody tr');
  await page.click('#fd-items tbody tr:first-child button');
  await page.waitForFunction(() => /one\.docx/.test(document.getElementById('fd-items').textContent));
  const renewals = service.filter((s) => s.path === '/drive/token');
  assert.ok(renewals.length >= 1, 'no renewal');
  assert.deepEqual(renewals[0].body, { provider: 'microsoft', refresh_token: REFRESH });
  assert.equal(graph.find((g) => g.key === 'GET /v1.0/me/drive/items/f1/children').auth, 'Bearer EwB-NEW');
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
