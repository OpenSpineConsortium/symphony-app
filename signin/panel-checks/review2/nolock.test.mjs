// In a browser with no Web Locks, a first renewal slower than the 2.5 s second look signs both tabs out.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8077';
const SERVICE = 'https://signin.example.test';
const real = fs.readFileSync('/home/user/openspineconsortium.github.io/assets/js/symphony-panel.js', 'utf8');
const configured = real.replace("var SIGNIN_SERVICE = '';", "var SIGNIN_SERVICE = '" + SERVICE + "';").replace("var CLIENT_ID = '';", "var CLIENT_ID = 'Iv1.testclient';");
const HOUR = 3600000;
const rec = (a, r, e) => JSON.stringify({ access_token: a, refresh_token: r, expires_at: Date.now() + e, refresh_expires_at: Date.now() + 100 * 24 * HOUR });
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true }); });
const service = [];
const spent = new Set();
await context.route('https://api.github.com/**', async (route) => {
  const h = { 'Access-Control-Expose-Headers': 'Link' };
  const key = route.request().method() + ' ' + new URL(route.request().url()).pathname;
  if (key === 'GET /user') return route.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify({ login: 'tester' }) });
  return route.fulfill({ status: 404, contentType: 'application/json', headers: h, body: JSON.stringify({ message: 'Not Found' }) });
});
await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: configured }));
await context.route(SERVICE + '/**', async (route) => {
  const req = route.request();
  const cors = { 'Access-Control-Allow-Origin': new URL(BASE).origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
  const path = new URL(req.url()).pathname; const body = req.postDataJSON();
  service.push(path + ' ' + JSON.stringify(body));
  if (path === '/refresh') {
    if (spent.has(body.refresh_token)) return route.fulfill({ status: 502, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: 'bad_refresh_token' }) });
    spent.add(body.refresh_token);
    await new Promise((r) => setTimeout(r, 4000));   // GitHub slow for once: four seconds
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ access_token: 'ghu_NEW', expires_in: 28800, refresh_token: 'ghr_R2', refresh_token_expires_in: 15897600 }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ revoked: true }) });
});
const p1 = await context.newPage();
await p1.goto(BASE + '/');
await p1.evaluate((r) => { localStorage.clear(); localStorage.setItem('symphony_panel_oauth', r); }, rec('ghu_OLD', 'ghr_R', -1000));
const p2 = await context.newPage();
await Promise.all([p1.goto(BASE + '/symphony/control/'), p2.goto(BASE + '/symphony/control/')]);
await new Promise((r) => setTimeout(r, 7000));
for (const [n, p] of [['tab 1', p1], ['tab 2', p2]]) {
  console.log(n, await p.evaluate(() => ({ gate: !document.getElementById('cp-gate').classList.contains('hidden'), msg: document.getElementById('msg').textContent, kept: localStorage.getItem('symphony_panel_oauth') })));
}
console.log('service:', service.join(' | '));
await browser.close();
