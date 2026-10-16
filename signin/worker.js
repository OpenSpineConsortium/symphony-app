// The sign-in service of the Symphony control panel: one stateless Cloudflare Worker.
//
// Why it exists. The control panel (openspineconsortium.com/symphony/control/) is static files
// that call GitHub's API from the person's browser as that person. GitHub's web sign-in gives a
// browser a one-time code, and turning that code into a token needs the App's client secret,
// which a page cannot hold. This Worker holds it, as a secret of the Worker, and does that one
// exchange: the page sends the code and the PKCE verifier it made, the Worker adds the secret,
// asks GitHub for the token and hands it back. It keeps nothing: no store, no cookie, and it
// writes no log of its own (the host's invocation logs are turned off at deployment, README.md).
// The token it returns is a user-to-server token of the GitHub App, which acts as the person
// within the App's permissions and the person's own access on the repositories the App is
// installed on, and expires in eight hours; the page renews it through /refresh with the refresh
// token GitHub gave beside it, and /revoke kills the token at GitHub when the person presses
// "Forget the token".
//
// What it never does: it never sees a Claude token, never reads a repository, never calls anything
// but GitHub's token endpoint and its token-revocation endpoint, and answers only the page's
// origin (ALLOWED_ORIGIN). The Origin header is the browser's word, which a script elsewhere
// cannot forge but a program can; what binds a code to the page that asked for it is PKCE: the
// page sends GitHub a hash of a secret it made, and only the holder of that secret can exchange
// the code, through this service or anywhere.
//
// Settings (Cloudflare, Workers & Pages, the Worker, Settings, Variables and Secrets):
//   GITHUB_CLIENT_ID      the App's client id (a text variable; it is public anyway)
//   GITHUB_CLIENT_SECRET  a client secret generated on the App's settings page (a secret)
//   ALLOWED_ORIGIN        the page's origin, https://openspineconsortium.com (a text variable;
//                         that is the default when unset; a value that is not a bare origin
//                         makes every answer 503, so a mistake shows instead of refusing everyone)
//   RATE_LIMITER          optional, a Workers rate-limiting binding of that name; when it is
//                         there, each caller's address gets its limit, and past it the answer is 429
// README.md beside this file gives the clicks.

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';
const DEFAULT_ORIGIN = 'https://openspineconsortium.com';
const MAX_BODY = 4096;
const ROUTES = ['/exchange', '/refresh', '/revoke'];

/** the one origin answered, as a bare origin; null when the setting is not one */
function originOf(env) {
  const value = (env && env.ALLOWED_ORIGIN) || DEFAULT_ORIGIN;
  let url;
  try { url = new URL(value); } catch (e) { return null; }
  if (!/^https?:$/.test(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
  return url.origin;
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': originOf(env) || DEFAULT_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function answer(env, status, body) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(env) });
}

/** the request's origin, as the browser sends it; a request from another origin is refused */
function sameOrigin(request, env) {
  const origin = request.headers.get('Origin');
  return origin !== null && origin === originOf(env);
}

/** a short string of the characters GitHub's codes and tokens are made of, or null */
function tokenish(value, max) {
  if (typeof value !== 'string' || !value || value.length > max) return null;
  return /^[A-Za-z0-9_.-]+$/.test(value) ? value : null;
}

/** a PKCE verifier as RFC 7636 shapes it: 43 to 128 of its unreserved characters, or null */
function verifierOf(value) {
  if (typeof value !== 'string') return null;
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value) ? value : null;
}

/** the page's redirect_uri must be a page on the allowed origin, with no query and no fragment */
function pageOn(value, env) {
  if (typeof value !== 'string' || value.length > 512) return null;
  let url;
  try { url = new URL(value); } catch (e) { return null; }
  if (url.origin !== originOf(env) || url.search || url.hash) return null;
  return url.href;
}

/** the caller is within its rate limit, when a RATE_LIMITER binding is there; keyed by its address */
async function withinLimit(request, env) {
  if (!env || !env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== 'function') return true;
  const key = request.headers.get('CF-Connecting-IP') || 'unknown';
  const result = await env.RATE_LIMITER.limit({ key });
  return !!(result && result.success);
}

/** the JSON object of the body, read at most MAX_BODY bytes; anything else throws */
async function readBody(request) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^[0-9]{1,7}$/.test(declared) || Number(declared) > MAX_BODY)) throw new Error('body too long');
  const chunks = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new Error('body too long');
      }
      chunks.push(next.value);
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  const parsed = JSON.parse(new TextDecoder().decode(bytes) || '{}');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
  return parsed;
}

function unreachable() {
  return { status: 502, body: { error: 'github_unreachable', error_description: 'GitHub could not be reached; try again' } };
}

/** GitHub's exchange: the code, or a refresh token, for a token; GitHub's own error words come back */
async function askGitHub(env, form, fetchImpl) {
  const body = new URLSearchParams(form);
  body.set('client_id', env.GITHUB_CLIENT_ID);
  body.set('client_secret', env.GITHUB_CLIENT_SECRET);
  let r;
  try {
    r = await (fetchImpl || fetch)(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'symphony-signin' },
      body: body.toString()
    });
  } catch (e) {
    return unreachable();
  }
  let data;
  try { data = await r.json(); } catch (e) { data = {}; }
  if (!r.ok || !data || !data.access_token) {
    return { status: 502, body: { error: (data && data.error) || 'github_refused', error_description: (data && data.error_description) || ('GitHub answered ' + r.status) } };
  }
  // only the fields the page needs; whatever else GitHub says stays here and is dropped
  return {
    status: 200,
    body: {
      access_token: data.access_token,
      token_type: data.token_type || 'bearer',
      expires_in: data.expires_in || null,
      refresh_token: data.refresh_token || null,
      refresh_token_expires_in: data.refresh_token_expires_in || null
    }
  };
}

/** GitHub's revocation of one token of the App, which takes the client id and secret as a password */
async function revokeAtGitHub(env, token, fetchImpl) {
  let r;
  try {
    r = await (fetchImpl || fetch)(GITHUB_API + '/applications/' + encodeURIComponent(env.GITHUB_CLIENT_ID) + '/token', {
      method: 'DELETE',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(env.GITHUB_CLIENT_ID + ':' + env.GITHUB_CLIENT_SECRET),
        'User-Agent': 'symphony-signin',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ access_token: token })
    });
  } catch (e) {
    return unreachable();
  }
  // 204 is revoked; 404 is a token GitHub no longer knows, which is the same end
  if (r.status === 204 || r.status === 404) return { status: 200, body: { revoked: true } };
  return { status: 502, body: { error: 'github_refused', error_description: 'GitHub answered ' + r.status } };
}

export async function handle(request, env, fetchImpl) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  if (request.method === 'GET' && url.pathname === '/') {
    return answer(env, 200, { service: 'symphony-signin', routes: ROUTES, keeps: 'nothing' });
  }
  if (request.method !== 'POST') return answer(env, 405, { error: 'method_not_allowed' });
  if (!env || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !originOf(env)) return answer(env, 503, { error: 'not_configured' });
  if (!sameOrigin(request, env)) return answer(env, 403, { error: 'origin_refused' });
  if (ROUTES.indexOf(url.pathname) < 0) return answer(env, 404, { error: 'no_such_route' });
  if (!(await withinLimit(request, env))) return answer(env, 429, { error: 'too_many_requests' });
  let body;
  try { body = await readBody(request); } catch (e) { return answer(env, 400, { error: 'bad_body' }); }
  if (url.pathname === '/exchange') {
    const code = tokenish(body.code, 256);
    const verifier = verifierOf(body.code_verifier);
    const redirect = pageOn(body.redirect_uri, env);
    if (!code || !verifier || !redirect) {
      return answer(env, 400, { error: 'bad_request', error_description: 'code, code_verifier and redirect_uri are needed; redirect_uri is the page itself' });
    }
    const out = await askGitHub(env, { code, code_verifier: verifier, redirect_uri: redirect }, fetchImpl);
    return answer(env, out.status, out.body);
  }
  if (url.pathname === '/refresh') {
    const refresh = tokenish(body.refresh_token, 512);
    if (!refresh) return answer(env, 400, { error: 'bad_request', error_description: 'refresh_token is needed' });
    const out = await askGitHub(env, { grant_type: 'refresh_token', refresh_token: refresh }, fetchImpl);
    return answer(env, out.status, out.body);
  }
  const token = tokenish(body.access_token, 256);
  if (!token) return answer(env, 400, { error: 'bad_request', error_description: 'access_token is needed' });
  const out = await revokeAtGitHub(env, token, fetchImpl);
  return answer(env, out.status, out.body);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      // the message names no token, no code and no person: only that the step failed
      return answer(env, 500, { error: 'failed' });
    }
  }
};
