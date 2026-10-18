// The sign-in Worker's tests: node --test signin/test_worker.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './worker.js';

const env = { GITHUB_CLIENT_ID: 'Iv1.testid', GITHUB_CLIENT_SECRET: 'secret-value', ALLOWED_ORIGIN: 'https://openspineconsortium.com' };
const ORIGIN = 'https://openspineconsortium.com';
const SERVICE = 'https://symphony-signin.example.workers.dev';
const VERIFIER = 'v'.repeat(43);
const PAGE = ORIGIN + '/symphony/control/';

function post(path, body, origin, headers) {
  const h = Object.assign({ 'Content-Type': 'application/json', 'Origin': origin === undefined ? ORIGIN : origin }, headers || {});
  if (h.Origin === null) delete h.Origin;
  return new Request(SERVICE + path, { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

/** a fake GitHub that records what it was asked and answers as github.com does */
function github(answer, status, raw) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, form: init.body && typeof init.body === 'string' && url.indexOf('api.github.com') < 0 ? new URLSearchParams(init.body) : null });
    if (raw !== undefined) return new Response(raw, { status: status || 200, headers: { 'Content-Type': 'text/html' } });
    return new Response(answer === null ? null : JSON.stringify(answer), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

const granted = { access_token: 'ghu_token', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_refresh', refresh_token_expires_in: 15811200, scope: '', extra: 'dropped' };

test('the service describes itself and keeps nothing', async () => {
  const r = await handle(new Request(SERVICE + '/'), env);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { service: 'symphony-signin', routes: ['/exchange', '/refresh', '/revoke', '/drive/config', '/drive/connect', '/drive/token'], keeps: 'nothing' });
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
});

test('preflight answers the site origin only, with the header a JSON post needs', async () => {
  const r = await handle(new Request(SERVICE + '/exchange', { method: 'OPTIONS' }), env);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  assert.equal(r.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
});

test('an exchange adds the secret, sends the code and the verifier, and returns only the five fields', async () => {
  const gh = github(granted);
  const r = await handle(post('/exchange', { code: 'abc123', code_verifier: VERIFIER, redirect_uri: PAGE }), env, gh.fetchImpl);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { access_token: 'ghu_token', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_refresh', refresh_token_expires_in: 15811200 });
  assert.equal(gh.calls.length, 1);
  assert.equal(gh.calls[0].url, 'https://github.com/login/oauth/access_token');
  assert.equal(gh.calls[0].form.get('client_id'), 'Iv1.testid');
  assert.equal(gh.calls[0].form.get('client_secret'), 'secret-value');
  assert.equal(gh.calls[0].form.get('code'), 'abc123');
  assert.equal(gh.calls[0].form.get('code_verifier'), VERIFIER);
  assert.equal(gh.calls[0].form.get('redirect_uri'), PAGE);
  assert.equal(gh.calls[0].init.headers.Accept, 'application/json');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('an exchange without a verifier, or with a malformed one, is refused before GitHub is asked', async () => {
  const gh = github(granted);
  for (const verifier of [undefined, '', 'short', 'v'.repeat(129), 'has space'.padEnd(43, 'x'), 42]) {
    const r = await handle(post('/exchange', { code: 'abc123', code_verifier: verifier, redirect_uri: PAGE }), env, gh.fetchImpl);
    assert.equal(r.status, 400, String(verifier));
  }
  assert.equal(gh.calls.length, 0);
});

test('a refresh sends the grant type and the refresh token', async () => {
  const gh = github(granted);
  const r = await handle(post('/refresh', { refresh_token: 'ghr_old' }), env, gh.fetchImpl);
  assert.equal(r.status, 200);
  assert.equal(gh.calls[0].form.get('grant_type'), 'refresh_token');
  assert.equal(gh.calls[0].form.get('refresh_token'), 'ghr_old');
  assert.equal(gh.calls[0].form.has('code'), false);
});

test('a revoke asks GitHub to delete the token with the App as the password, and says so', async () => {
  const gh = github(null, 204);
  const r = await handle(post('/revoke', { access_token: 'ghu_token' }), env, gh.fetchImpl);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { revoked: true });
  assert.equal(gh.calls.length, 1);
  assert.equal(gh.calls[0].url, 'https://api.github.com/applications/Iv1.testid/token');
  assert.equal(gh.calls[0].init.method, 'DELETE');
  assert.equal(gh.calls[0].init.headers.Authorization, 'Basic ' + Buffer.from('Iv1.testid:secret-value').toString('base64'));
  assert.deepEqual(JSON.parse(gh.calls[0].init.body), { access_token: 'ghu_token' });
  const gone = github({ message: 'Not Found' }, 404);
  assert.equal((await handle(post('/revoke', { access_token: 'ghu_old' }), env, gone.fetchImpl)).status, 200);
  const refused = github({ message: 'Validation Failed' }, 422);
  assert.equal((await handle(post('/revoke', { access_token: 'ghu_x' }), env, refused.fetchImpl)).status, 502);
  assert.equal((await handle(post('/revoke', {}), env, gh.fetchImpl)).status, 400);
  assert.equal(gh.calls.length, 1);
});

test('another origin, a missing origin and a foreign redirect are refused before GitHub is asked', async () => {
  const gh = github(granted);
  for (const origin of ['https://evil.example', null, '', 'https://openspineconsortium.com.evil.example', 'http://openspineconsortium.com', 'https://OpenSpineConsortium.com', 'https://openspineconsortium.com/']) {
    const r = await handle(post('/exchange', { code: 'abc', code_verifier: VERIFIER, redirect_uri: PAGE }, origin), env, gh.fetchImpl);
    assert.equal(r.status, 403, String(origin));
    assert.deepEqual(await r.json(), { error: 'origin_refused' });
  }
  for (const redirect of ['https://evil.example/symphony/control/', PAGE + '?x=1', PAGE + '#top', 'not a url', 42, undefined]) {
    const r = await handle(post('/exchange', { code: 'abc', code_verifier: VERIFIER, redirect_uri: redirect }), env, gh.fetchImpl);
    assert.equal(r.status, 400, String(redirect));
  }
  assert.equal(gh.calls.length, 0);
});

test('a bad or long body, a bad code and an unknown route cost no GitHub call', async () => {
  const gh = github(granted);
  assert.equal((await handle(post('/exchange', '{not json'), env, gh.fetchImpl)).status, 400);
  assert.equal((await handle(post('/exchange', 'null'), env, gh.fetchImpl)).status, 400);
  assert.equal((await handle(post('/exchange', '[1]'), env, gh.fetchImpl)).status, 400);
  assert.equal((await handle(post('/exchange', '"text"'), env, gh.fetchImpl)).status, 400);
  assert.equal((await handle(post('/exchange', { code: 'x'.repeat(5000), code_verifier: VERIFIER, redirect_uri: ORIGIN + '/' }), env, gh.fetchImpl)).status, 400);
  assert.equal((await handle(post('/exchange', { code: 'has space', code_verifier: VERIFIER, redirect_uri: ORIGIN + '/' }), env, gh.fetchImpl)).status, 400);
  assert.equal((await handle(post('/refresh', { refresh_token: 'a/b' }), env, gh.fetchImpl)).status, 400);
  assert.equal((await handle(post('/other', { code: 'abc' }), env, gh.fetchImpl)).status, 404);
  assert.equal((await handle(new Request(SERVICE + '/exchange', { method: 'PUT' }), env, gh.fetchImpl)).status, 405);
  assert.equal(gh.calls.length, 0);
});

test('the body is bounded in bytes, by its declared length first and then as it is read', async () => {
  const gh = github(granted);
  // a declared length past the limit is refused without reading
  const declared = await handle(post('/exchange', { code: 'abc' }, undefined, { 'Content-Length': '99999' }), env, gh.fetchImpl);
  assert.equal(declared.status, 400);
  // a long body with no declared length is read only up to the limit, then dropped
  let pulled = 0;
  const chunk = new Uint8Array(64 * 1024).fill(0x61);
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      if (pulled > 16) { controller.close(); return; }
      controller.enqueue(chunk);
    }
  });
  const long = new Request(SERVICE + '/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN }, body: stream, duplex: 'half' });
  assert.equal((await handle(long, env, gh.fetchImpl)).status, 400);
  assert.ok(pulled <= 2, 'the reader stopped after the limit, not at the end: pulled ' + pulled);
  // a body under the limit in characters but over it in bytes is still over the limit
  const wide = await handle(post('/exchange', '{"code":"' + String.fromCharCode(0x20ac).repeat(2000) + '"}'), env, gh.fetchImpl);
  assert.equal(wide.status, 400);
  assert.equal(gh.calls.length, 0);
});

test('without its settings, or with an origin setting that is not an origin, the service says so and asks GitHub nothing', async () => {
  const gh = github(granted);
  const r = await handle(post('/exchange', { code: 'abc', code_verifier: VERIFIER, redirect_uri: ORIGIN + '/' }), { ALLOWED_ORIGIN: ORIGIN }, gh.fetchImpl);
  assert.equal(r.status, 503);
  for (const bad of ['https://openspineconsortium.com/symphony/', 'openspineconsortium.com', 'ftp://x.example', 'https://x.example/?q=1']) {
    const b = await handle(post('/refresh', { refresh_token: 'ghr' }), Object.assign({}, env, { ALLOWED_ORIGIN: bad }), gh.fetchImpl);
    assert.equal(b.status, 503, bad);
    assert.deepEqual(await b.json(), { error: 'not_configured' });
  }
  assert.equal(gh.calls.length, 0);
});

test('an origin setting with a trailing slash or capitals is read as the origin it names', async () => {
  const gh = github(granted);
  for (const loose of ['https://openspineconsortium.com/', 'https://OpenSpineConsortium.com', 'HTTPS://openspineconsortium.com/']) {
    const r = await handle(post('/refresh', { refresh_token: 'ghr' }), Object.assign({}, env, { ALLOWED_ORIGIN: loose }), gh.fetchImpl);
    assert.equal(r.status, 200, loose);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  }
});

test('GitHub refusing the code comes back as 502 with GitHub\'s words and no token', async () => {
  const gh = github({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.', error_uri: 'https://example' });
  const r = await handle(post('/exchange', { code: 'abc', code_verifier: VERIFIER, redirect_uri: ORIGIN + '/' }), env, gh.fetchImpl);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' });
});

test('GitHub answering no JSON, or not answering, is said in words with no token and no crash', async () => {
  const html = github(null, 502, '<html>bad gateway</html>');
  const r = await handle(post('/refresh', { refresh_token: 'ghr' }), env, html.fetchImpl);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'github_refused', error_description: 'GitHub answered 502' });
  const down = async () => { throw new TypeError('fetch failed'); };
  for (const path of ['/exchange', '/refresh', '/revoke']) {
    const body = { code: 'abc', code_verifier: VERIFIER, redirect_uri: ORIGIN + '/', refresh_token: 'ghr', access_token: 'ghu' };
    const d = await handle(post(path, body), env, down);
    assert.equal(d.status, 502, path);
    assert.equal((await d.json()).error, 'github_unreachable');
  }
});

test('a rate-limiting binding, when there is one, refuses the caller past its limit before the body is read', async () => {
  const gh = github(granted);
  const keys = [];
  const limiter = { limit: async ({ key }) => { keys.push(key); return { success: keys.length < 3 }; } };
  const limited = Object.assign({}, env, { RATE_LIMITER: limiter });
  const headers = { 'CF-Connecting-IP': '203.0.113.9' };
  assert.equal((await handle(post('/refresh', { refresh_token: 'ghr' }, undefined, headers), limited, gh.fetchImpl)).status, 200);
  assert.equal((await handle(post('/refresh', { refresh_token: 'ghr' }, undefined, headers), limited, gh.fetchImpl)).status, 200);
  const third = await handle(post('/refresh', { refresh_token: 'ghr' }, undefined, headers), limited, gh.fetchImpl);
  assert.equal(third.status, 429);
  assert.deepEqual(await third.json(), { error: 'too_many_requests' });
  assert.deepEqual(keys, ['203.0.113.9', '203.0.113.9', '203.0.113.9']);
  assert.equal(gh.calls.length, 2);
  // a refused origin and an unknown route are answered before the limit is spent
  await handle(post('/refresh', { refresh_token: 'ghr' }, 'https://evil.example', headers), limited, gh.fetchImpl);
  await handle(post('/nowhere', {}, undefined, headers), limited, gh.fetchImpl);
  assert.equal(keys.length, 3);
});

test('the default origin is the site when none is set', async () => {
  const gh = github(granted);
  const r = await handle(post('/refresh', { refresh_token: 'ghr' }), { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 's' }, gh.fetchImpl);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

/* ---------- the drive routes: OneDrive for the console's Folders tab and the repository's sync ---------- */
// the drive's consent comes back to the control panel's own address, PAGE, the same page GitHub's
// sign-in returns to, which then opens its Folders tab
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const driveEnv = Object.assign({}, env, { MICROSOFT_CLIENT_ID: 'ms-client-id', MICROSOFT_CLIENT_SECRET: 'ms-secret-value' });
// what Microsoft's token endpoint answers a Web platform app; id_token and ext_expires_in must not reach the page
const msGranted = { token_type: 'Bearer', scope: 'Files.ReadWrite', expires_in: 3599, ext_expires_in: 3599, access_token: 'EwB-access', refresh_token: 'M.C5-refresh!*$', id_token: 'eyJ-id' };

test('/drive/config lists the provider that is set up, with its public client id, and null for one that is not', async () => {
  const r = await handle(new Request(SERVICE + '/drive/config'), driveEnv);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { microsoft: { client_id: 'ms-client-id' } });
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  // no secret, no id, or the GitHub settings missing: the reading still answers, and says the provider is not set up
  for (const partial of [env, Object.assign({}, env, { MICROSOFT_CLIENT_ID: 'ms-client-id' }), { ALLOWED_ORIGIN: ORIGIN, MICROSOFT_CLIENT_SECRET: 's' }, { MICROSOFT_CLIENT_ID: 'id', MICROSOFT_CLIENT_SECRET: 's' }]) {
    const c = await handle(new Request(SERVICE + '/drive/config'), partial);
    assert.equal(c.status, 200);
    const got = await c.json();
    assert.deepEqual(Object.keys(got), ['microsoft']);
    assert.equal(got.microsoft === null || (got.microsoft.client_id === 'id' && !('client_secret' in got.microsoft)), true, JSON.stringify(got));
  }
  // nothing Google: the owner declined the Picker's key, so the table holds Microsoft alone
  const withGoogle = await handle(new Request(SERVICE + '/drive/config'), Object.assign({}, driveEnv, { GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'gs', GOOGLE_PICKER_KEY: 'k' }));
  assert.deepEqual(await withGoogle.json(), { microsoft: { client_id: 'ms-client-id' } });
});

test('/drive/connect sends Microsoft the code, the verifier, the secret, the scope and the console\'s address, and returns four fields', async () => {
  const ms = github(msGranted);
  const r = await handle(post('/drive/connect', { provider: 'microsoft', code: 'M.C507_BAY.2.U.code-part', code_verifier: VERIFIER, redirect_uri: PAGE }), driveEnv, ms.fetchImpl);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { access_token: 'EwB-access', refresh_token: 'M.C5-refresh!*$', expires_in: 3599, scope: 'Files.ReadWrite' });
  assert.equal(ms.calls.length, 1);
  assert.equal(ms.calls[0].url, MS_TOKEN_URL);
  const form = ms.calls[0].form;
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('client_id'), 'ms-client-id');
  assert.equal(form.get('client_secret'), 'ms-secret-value');
  assert.equal(form.get('code'), 'M.C507_BAY.2.U.code-part');
  assert.equal(form.get('code_verifier'), VERIFIER);
  assert.equal(form.get('redirect_uri'), PAGE);
  assert.equal(form.get('scope'), 'Files.ReadWrite offline_access');
  assert.equal(form.has('refresh_token'), false);
  // the GitHub settings play no part: the GitHub secret and client id never reach Microsoft,
  // under any field's name, so the check reads every value the form carries
  const sent = [...form.values()];
  assert.ok(!sent.includes(env.GITHUB_CLIENT_SECRET), 'the GitHub secret reached Microsoft');
  assert.ok(!sent.includes(env.GITHUB_CLIENT_ID), 'the GitHub client id reached Microsoft');
  assert.equal(ms.calls[0].init.headers.Origin, undefined, 'no Origin header reaches Microsoft, which refuses a secret beside one');
});

test('/drive/token trades the refresh token for an access token with the scope, and returns two fields', async () => {
  const ms = github(msGranted);
  const r = await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'M.C5-old!*$' }), driveEnv, ms.fetchImpl);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { access_token: 'EwB-access', expires_in: 3599 });
  const form = ms.calls[0].form;
  assert.equal(form.get('grant_type'), 'refresh_token');
  assert.equal(form.get('refresh_token'), 'M.C5-old!*$');
  assert.equal(form.get('scope'), 'Files.ReadWrite offline_access');
  assert.equal(form.get('client_secret'), 'ms-secret-value');
  assert.equal(form.has('code'), false);
});

test('/drive/token takes the repository\'s run, which sends no Origin, and refuses another origin; /drive/connect takes the site alone', async () => {
  const ms = github(msGranted);
  const run = await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'M.C5-old' }, null), driveEnv, ms.fetchImpl);
  assert.equal(run.status, 200);
  for (const origin of ['https://evil.example', '', 'http://openspineconsortium.com', 'https://openspineconsortium.com.evil.example']) {
    const r = await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'M.C5-old' }, origin), driveEnv, ms.fetchImpl);
    assert.equal(r.status, 403, String(origin));
  }
  for (const origin of ['https://evil.example', null, '']) {
    const r = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: PAGE }, origin), driveEnv, ms.fetchImpl);
    assert.equal(r.status, 403, String(origin));
    assert.deepEqual(await r.json(), { error: 'origin_refused' });
  }
  assert.equal(ms.calls.length, 1);
});

test('a provider the table lacks, a missing provider and a provider not set up are refused before Microsoft is asked', async () => {
  const ms = github(msGranted);
  for (const provider of ['google', 'dropbox', '', 42, undefined, '__proto__', 'constructor']) {
    const r = await handle(post('/drive/connect', { provider, code: 'abc', code_verifier: VERIFIER, redirect_uri: PAGE }), driveEnv, ms.fetchImpl);
    assert.equal(r.status, 400, String(provider));
    assert.equal((await r.json()).error, 'unknown_provider');
    const t = await handle(post('/drive/token', { provider, refresh_token: 'r' }), driveEnv, ms.fetchImpl);
    assert.equal(t.status, 400, String(provider));
  }
  const unset = await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'r' }), env, ms.fetchImpl);
  assert.equal(unset.status, 503);
  assert.equal((await unset.json()).error, 'not_configured');
  assert.equal(ms.calls.length, 0);
});

test('/drive/connect exchanges a code only for the console\'s own address on the allowed origin, with a verifier', async () => {
  const ms = github(msGranted);
  const refused = [
    ORIGIN + '/symphony/control/folders.html', ORIGIN + '/symphony/control', ORIGIN + '/symphony/control/index.html',
    ORIGIN + '/symphony/control/tokens.html', ORIGIN + '/symphony/control//', ORIGIN + '/symphony/', ORIGIN + '/', ORIGIN,
    'https://evil.example/symphony/control/', 'https://openspineconsortium.com.evil.example/symphony/control/',
    PAGE + '?x=1', PAGE + '?repo=o/r', PAGE + '?', PAGE + '#top', PAGE + '#folders', PAGE + '#',
    'https://OpenSpineConsortium.com/symphony/control/', ORIGIN + '/Symphony/Control/', ORIGIN + ':443/symphony/control/',
    PAGE.replace('https', 'http'), PAGE + ' ', '', null, undefined, 42
  ];
  for (const redirect of refused) {
    const r = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: redirect }), driveEnv, ms.fetchImpl);
    assert.equal(r.status, 400, String(redirect));
  }
  for (const verifier of [undefined, 'short', 'has space'.padEnd(43, 'x')]) {
    const r = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: verifier, redirect_uri: PAGE }), driveEnv, ms.fetchImpl);
    assert.equal(r.status, 400, String(verifier));
  }
  for (const code of [undefined, '', 'has space', 'x'.repeat(5000), 'tab\there']) {
    const r = await handle(post('/drive/connect', { provider: 'microsoft', code, code_verifier: VERIFIER, redirect_uri: PAGE }), driveEnv, ms.fetchImpl);
    assert.equal(r.status, 400, String(code).slice(0, 20));
  }
  for (const refresh of [undefined, '', 'has space', 'x'.repeat(5000)]) {
    const r = await handle(post('/drive/token', { provider: 'microsoft', refresh_token: refresh }), driveEnv, ms.fetchImpl);
    assert.equal(r.status, 400, String(refresh).slice(0, 20));
  }
  // an unknown drive route, the GET of a POST route and the POST of the GET one
  assert.equal((await handle(post('/drive/other', { provider: 'microsoft' }), driveEnv, ms.fetchImpl)).status, 404);
  assert.equal((await handle(new Request(SERVICE + '/drive/connect'), driveEnv, ms.fetchImpl)).status, 405);
  assert.equal((await handle(post('/drive/config', { provider: 'microsoft' }), driveEnv, ms.fetchImpl)).status, 405);
  assert.equal(ms.calls.length, 0);
});

test('the old Folders page and the console\'s address without its trailing slash are refused; the address itself is taken', async () => {
  const ms = github(msGranted);
  const old = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: ORIGIN + '/symphony/control/folders.html' }), driveEnv, ms.fetchImpl);
  assert.equal(old.status, 400);
  assert.equal((await old.json()).error, 'bad_request');
  const bare = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: ORIGIN + '/symphony/control' }), driveEnv, ms.fetchImpl);
  assert.equal(bare.status, 400);
  assert.equal((await bare.json()).error, 'bad_request');
  assert.equal(ms.calls.length, 0);
  const ok = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: 'https://openspineconsortium.com/symphony/control/' }), driveEnv, ms.fetchImpl);
  assert.equal(ok.status, 200);
  assert.equal(ms.calls.length, 1);
  assert.equal(ms.calls[0].form.get('redirect_uri'), 'https://openspineconsortium.com/symphony/control/');
});

test('another ALLOWED_ORIGIN takes its own console address and refuses the default site\'s', async () => {
  const ms = github(msGranted);
  const local = Object.assign({}, driveEnv, { ALLOWED_ORIGIN: 'http://127.0.0.1:8080' });
  const theirs = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: PAGE }, 'http://127.0.0.1:8080'), local, ms.fetchImpl);
  assert.equal(theirs.status, 400);
  assert.equal(ms.calls.length, 0);
  const own = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: 'http://127.0.0.1:8080/symphony/control/' }, 'http://127.0.0.1:8080'), local, ms.fetchImpl);
  assert.equal(own.status, 200);
  assert.equal(ms.calls[0].form.get('redirect_uri'), 'http://127.0.0.1:8080/symphony/control/');
});

test('a drive body may run to twice the GitHub routes\' bytes, and no further', async () => {
  const ms = github(msGranted);
  const long = 'c'.repeat(3000);
  const r = await handle(post('/drive/connect', { provider: 'microsoft', code: long, code_verifier: VERIFIER, redirect_uri: PAGE }), driveEnv, ms.fetchImpl);
  assert.equal(r.status, 200);
  assert.equal(ms.calls[0].form.get('code'), long);
  const over = await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'r', padding: 'p'.repeat(9000) }), driveEnv, ms.fetchImpl);
  assert.equal(over.status, 400);
  assert.deepEqual(await over.json(), { error: 'bad_body' });
  assert.equal(ms.calls.length, 1);
  // a declared length between the two bounds is read on a drive route and refused on a GitHub one
  const declared = { 'Content-Length': '6000' };
  assert.equal((await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'r' }, undefined, declared), driveEnv, ms.fetchImpl)).status, 200);
  assert.equal((await handle(post('/refresh', { refresh_token: 'ghr' }, undefined, declared), driveEnv, ms.fetchImpl)).status, 400);
  assert.equal(ms.calls.length, 2);
});

test('Microsoft refusing a code or a refresh token passes its words and its status through, with no token', async () => {
  const refused = github({ error: 'invalid_grant', error_description: 'AADSTS70000: The code has expired.', error_codes: [70000], trace_id: 't', correlation_id: 'c' }, 400);
  const r = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: PAGE }), driveEnv, refused.fetchImpl);
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'invalid_grant', error_description: 'AADSTS70000: The code has expired.' });
  const unauthorized = github({ error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' }, 401);
  const u = await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'r' }), driveEnv, unauthorized.fetchImpl);
  assert.equal(u.status, 401);
  assert.equal((await u.json()).error, 'invalid_client');
  // a server error, no JSON, or no answer at all is 502 in words
  const html = github(null, 503, '<html>down</html>');
  const h = await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'r' }), driveEnv, html.fetchImpl);
  assert.equal(h.status, 502);
  assert.deepEqual(await h.json(), { error: 'provider_refused', error_description: 'microsoft answered 503' });
  const down = async () => { throw new TypeError('fetch failed'); };
  const d = await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: PAGE }), driveEnv, down);
  assert.equal(d.status, 502);
  assert.equal((await d.json()).error, 'provider_unreachable');
  // an answer with no access token, whatever its status, is a refusal
  const empty = github({ token_type: 'Bearer' }, 200);
  assert.equal((await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'r' }), driveEnv, empty.fetchImpl)).status, 502);
});

test('the rate limit covers the drive routes too, and a refused origin or an unknown route spends none of it', async () => {
  const ms = github(msGranted);
  const keys = [];
  const limiter = { limit: async ({ key }) => { keys.push(key); return { success: keys.length < 2 }; } };
  const limited = Object.assign({}, driveEnv, { RATE_LIMITER: limiter });
  const headers = { 'CF-Connecting-IP': '203.0.113.9' };
  assert.equal((await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'r' }, null, headers), limited, ms.fetchImpl)).status, 200);
  const second = await handle(post('/drive/token', { provider: 'microsoft', refresh_token: 'r' }, null, headers), limited, ms.fetchImpl);
  assert.equal(second.status, 429);
  await handle(post('/drive/connect', { provider: 'microsoft', code: 'abc', code_verifier: VERIFIER, redirect_uri: PAGE }, 'https://evil.example', headers), limited, ms.fetchImpl);
  await handle(post('/drive/other', { provider: 'microsoft' }, null, headers), limited, ms.fetchImpl);
  assert.equal(keys.length, 2);
  assert.equal(ms.calls.length, 1);
});

test('the GitHub routes are as they were beside the drive ones: a GitHub exchange still needs its own settings', async () => {
  const gh = github(granted);
  const r = await handle(post('/exchange', { code: 'abc', code_verifier: VERIFIER, redirect_uri: PAGE }), { ALLOWED_ORIGIN: ORIGIN, MICROSOFT_CLIENT_ID: 'id', MICROSOFT_CLIENT_SECRET: 's' }, gh.fetchImpl);
  assert.equal(r.status, 503);
  assert.equal(gh.calls.length, 0);
});
