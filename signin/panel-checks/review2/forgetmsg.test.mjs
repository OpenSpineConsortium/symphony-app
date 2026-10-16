// A tab signed in with a pasted token presses Forget while the browser also keeps a sign-in of the App:
// the page says "revoked at GitHub" although the token this tab used, a personal access token, was not.
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
const service = [];
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
  service.push(new URL(req.url()).pathname + ' ' + req.postData());
  return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ revoked: true }) });
});
const p = await context.newPage();
await p.goto(BASE + '/');
await p.evaluate((r) => { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('symphony_panel_token', 'github_pat_MINE'); localStorage.setItem('symphony_panel_oauth', r); }, rec('ghu_KEPT', 'ghr_K', 2 * HOUR));
await p.goto(BASE + '/symphony/control/');
await p.waitForSelector('#cp-app:not(.hidden)');
console.log('who:', await p.textContent('#cp-who'));
await p.click('#cp-signout');
await p.waitForFunction(() => /revoked at GitHub/.test(document.getElementById('msg').textContent));
console.log('message:', await p.textContent('#msg'));
console.log('sent to the service:', JSON.stringify(service));
await browser.close();
