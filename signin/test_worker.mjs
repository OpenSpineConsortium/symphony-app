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
  assert.deepEqual(await r.json(), { service: 'symphony-signin', routes: ['/exchange', '/refresh', '/revoke'], keeps: 'nothing' });
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
});

test('preflight answers the site origin only, with the header a JSON post needs', async () => {
  const r = await handle(new Request(SERVICE + '/exchange', { method: 'OPTIONS' }), env);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(r.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
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
