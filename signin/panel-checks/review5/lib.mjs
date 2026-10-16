// Shared harness for the fifth review (copied from review4/lib.mjs; baseScript is 0b9600b, the commit before this round).
// with timestamps on every service and GitHub call so the order of events can be shown.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const BASE = process.env.BASE || 'http://127.0.0.1:8077';
export const SITE = '/home/user/openspineconsortium.github.io';
export const SERVICE = 'https://signin.example.test';
export const HOUR = 3600000;
const now = new Date().toISOString();

export const real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
export const baseScript = execFileSync('git', ['-C', SITE, 'show', '0b9600b:assets/js/symphony-panel.js'], { encoding: 'utf8' });
export function configure(src) {
  const out = src.replace("var SIGNIN_SERVICE = '';", "var SIGNIN_SERVICE = '" + SERVICE + "';").replace("var CLIENT_ID = '';", "var CLIENT_ID = 'Iv1.testclient';");
  if (out === src) throw new Error('constants not found');
  return out;
}
export const configured = configure(real);
export const configuredBase = configure(baseScript);

export const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
export async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 6).join('\n     ')); }
}

export function repoRoutes(repo) {
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

export const T0 = Date.now();
export const t = () => Date.now() - T0;
let browser = null;
export async function launch() { browser = await chromium.launch(); return browser; }
export async function close() { if (browser) await browser.close(); }

export async function open(opts) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const calls = [];
  const service = [];
  const authorize = [];
  const routes = opts.routes || repoRoutes('acme/demo');
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    let tab = null;
    try { tab = req.frame().page(); } catch (e) { tab = null; }
    const entry = { key, url: req.url(), auth: req.headers()['authorization'] || '', at: t(), tab };
    calls.push(entry);
    let r = routes[key];
    if (typeof r === 'function') r = await r(req);
    const headers = { 'Access-Control-Expose-Headers': 'Link' };
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) }).catch(() => {});
    if (r && r.status) return route.fulfill({ status: r.status, contentType: 'application/json', headers, body: JSON.stringify(r.body || {}) }).catch(() => {});
    if (r && typeof r.raw === 'string') return route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', headers, body: r.raw }).catch(() => {});
    if (r === null) return route.fulfill({ status: 204, headers, body: '' }).catch(() => {});
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(r) }).catch(() => {});
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: opts.script || real }));
  await context.route('https://github.com/login/oauth/**', (route) => {
    const u = new URL(route.request().url());
    authorize.push(u);
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
    const entry = { path, body, at: t() };
    service.push(entry);
    const answer = (opts.serviceFn && await opts.serviceFn(path, body)) || (opts.service && opts.service[path]) || { status: 200, body: { access_token: path === '/refresh' ? 'ghu_NEW' : 'ghu_TOKEN', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 } };
    if (answer.delay) await new Promise((r) => setTimeout(r, answer.delay));
    entry.answeredAt = t();
    entry.answer = answer.abort ? 'abort' : answer.status + ' ' + JSON.stringify(answer.body);
    if (answer.abort) return route.abort('connectionrefused').catch(() => {});
    return route.fulfill({ status: answer.status, contentType: 'application/json', headers: cors, body: JSON.stringify(answer.body) }).catch(() => {});
  });
  if (opts.initScript) await context.addInitScript(opts.initScript);
  // every text #msg showed, in order, so a message overwritten later is still seen
  await context.addInitScript(() => {
    window.__msgs = [];
    const start = () => new MutationObserver(() => { const m = document.getElementById('msg'); const tx = m && m.textContent; if (tx && window.__msgs[window.__msgs.length - 1] !== tx) window.__msgs.push(tx); }).observe(document, { subtree: true, childList: true, characterData: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
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
  }, opts.storage || {});
  service.length = 0; calls.length = 0;
  if (!opts.noLoad) await page.goto(BASE + (opts.path || '/symphony/control/'));
  return { context, page, calls, service, authorize, errors };
}

export const rec = (access, refresh, expiresIn) => JSON.stringify({ access_token: access, refresh_token: refresh, expires_at: Date.now() + expiresIn, refresh_expires_at: Date.now() + 100 * 24 * HOUR });
export function singleUse(delayFirst, delayRefused, issue) {
  const spent = new Set();
  let n = 0;
  return (path, body) => {
    if (path !== '/refresh') return null;
    if (spent.has(body.refresh_token)) return { status: 400, delay: delayRefused || 0, body: { error: 'bad_refresh_token', error_description: 'The refresh token passed is incorrect or expired.' } };
    spent.add(body.refresh_token);
    n++;
    const pair = issue ? issue(n) : ['ghu_NEW', 'ghr_R2'];
    return { status: 200, delay: delayFirst || 0, body: { access_token: pair[0], token_type: 'bearer', expires_in: 28800, refresh_token: pair[1], refresh_token_expires_in: 15897600 } };
  };
}
export async function facts(page) {
  return page.evaluate(() => ({
    app: !document.getElementById('cp-app').classList.contains('hidden'),
    gate: !document.getElementById('cp-gate').classList.contains('hidden'),
    msg: document.getElementById('msg').textContent,
    who: (document.getElementById('cp-who') || {}).textContent || '',
    msgs: window.__msgs || [],
    local: localStorage.getItem('symphony_panel_oauth'),
    session: sessionStorage.getItem('symphony_panel_oauth'),
    lToken: localStorage.getItem('symphony_panel_token'),
    sToken: sessionStorage.getItem('symphony_panel_token'),
    summary: (document.getElementById('cp-summary') || {}).textContent || '',
  }));
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const appShown = (p, timeout) => p.waitForSelector('#cp-app:not(.hidden)', { timeout: timeout || 15000 });
export const loaded = (p) => p.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent), null, { timeout: 15000 });
export const repoList = JSON.stringify(['acme/demo']);
export const noLocks = () => { Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true }); };
