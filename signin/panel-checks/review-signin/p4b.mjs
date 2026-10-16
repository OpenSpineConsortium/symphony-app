// Two people on one browser: alice signed in for her tab only, bob later signed in and kept it.
// When alice's tab renews its token, whose sign-in does the browser keep?
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SERVICE = 'https://signin.example.test';
const real = fs.readFileSync('/home/user/openspineconsortium.github.io/assets/js/symphony-panel.js', 'utf8');
const configured = real.replace("var SIGNIN_SERVICE = '';", "var SIGNIN_SERVICE = '" + SERVICE + "';").replace("var CLIENT_ID = '';", "var CLIENT_ID = 'Iv1.x';");
const browser = await chromium.launch();
const context = await browser.newContext();
const now = new Date().toISOString();
await context.route('https://api.github.com/**', (route) => {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  const auth = req.headers()['authorization'] || '';
  const who = /ghu_A/.test(auth) ? 'alice' : (/ghu_B/.test(auth) ? 'bob' : '');
  const h = { 'Access-Control-Expose-Headers': 'Link' };
  if (!who) return route.fulfill({ status: 401, contentType: 'application/json', headers: h, body: '{"message":"Bad credentials"}' });
  if (path === '/user') return route.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify({ login: who }) });
  return route.fulfill({ status: 404, contentType: 'application/json', headers: h, body: '{"message":"Not Found"}' });
});
await context.route('**/assets/js/symphony-panel.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: configured }));
await context.route(SERVICE + '/**', (route) => {
  const req = route.request();
  const cors = { 'Access-Control-Allow-Origin': new URL(BASE).origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ access_token: 'ghu_A2', expires_in: 28800, refresh_token: 'ghr_A2', refresh_token_expires_in: 15897600 }) });
});
const p0 = await context.newPage();
await p0.goto(BASE + '/symphony/');
await p0.evaluate(() => { localStorage.clear(); localStorage.setItem('symphony_panel_oauth', JSON.stringify({ access_token: 'ghu_B', refresh_token: 'ghr_B', expires_at: Date.now() + 3 * 3600e3, refresh_expires_at: Date.now() + 90 * 86400e3 })); });
await p0.close();
const alice = await context.newPage();
await alice.addInitScript(() => { if (!window.name) { window.name = 'a'; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify({ access_token: 'ghu_A1', refresh_token: 'ghr_A1', expires_at: Date.now() - 1000, refresh_expires_at: Date.now() + 90 * 86400e3 })); } });
await alice.goto(BASE + '/symphony/control/');
await alice.waitForFunction(() => /Signed in as/.test(document.getElementById('cp-who').textContent), null, { timeout: 8000 });
console.log("alice's tab:", await alice.textContent('#cp-who'));
await alice.close();
const later = await context.newPage();
await later.goto(BASE + '/symphony/control/');
await later.waitForFunction(() => /Signed in as/.test(document.getElementById('cp-who').textContent), null, { timeout: 8000 });
console.log('a new tab after alice closed hers (bob had kept his):', await later.textContent('#cp-who'));
await browser.close();
