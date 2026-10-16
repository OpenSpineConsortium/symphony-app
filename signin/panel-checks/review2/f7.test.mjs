// F7: a tab-only paste (or sign-in) in a tab at the gate deletes the sign-in kept on the browser, unrevoked,
// while another tab goes on with it in memory and loses it at its next reload or renewal.
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
const calls = [], service = [];
await context.route('https://api.github.com/**', async (route) => {
  const req = route.request(); const url = new URL(req.url()); const key = req.method() + ' ' + url.pathname; const auth = req.headers()['authorization'] || '';
  calls.push(key + ' ' + auth);
  const h = { 'Access-Control-Expose-Headers': 'Link' };
  if (auth === 'Bearer github_pat_DEAD') return route.fulfill({ status: 401, contentType: 'application/json', headers: h, body: JSON.stringify({ message: 'Bad credentials' }) });
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
const tab1 = await context.newPage();
await tab1.goto(BASE + '/');
await tab1.evaluate((r) => { localStorage.clear(); localStorage.setItem('symphony_panel_oauth', r); }, rec('ghu_KEPT', 'ghr_K', 2 * HOUR));
await tab1.goto(BASE + '/symphony/control/');
await tab1.waitForSelector('#cp-app:not(.hidden)');
console.log('tab 1:', await tab1.textContent('#cp-who'));
// tab 2 carries a dead tab-only token, so it shows the gate although the browser keeps a good sign-in
const tab2 = await context.newPage();
await tab2.goto(BASE + '/');
await tab2.evaluate(() => sessionStorage.setItem('symphony_panel_token', 'github_pat_DEAD'));
await tab2.goto(BASE + '/symphony/control/');
await tab2.waitForSelector('#cp-gate:not(.hidden)');
console.log('tab 2 at the gate:', await tab2.textContent('#msg'));
await tab2.fill('#cp-token', 'github_pat_NEW');
console.log('Keep me signed in ticked in tab 2:', await tab2.isChecked('#cp-keep'));
await tab2.click('#cp-open');
await tab2.waitForSelector('#cp-app:not(.hidden)');
console.log('tab 2:', await tab2.textContent('#cp-who'));
console.log('kept sign-in on the browser after tab 2\'s tab-only paste:', await tab1.evaluate(() => localStorage.getItem('symphony_panel_oauth')));
console.log('service calls (a revoke would be listed):', JSON.stringify(service));
await tab1.reload();
await tab1.waitForSelector('#cp-gate:not(.hidden)');
console.log('tab 1 after a reload: gate shown; message:', JSON.stringify(await tab1.textContent('#msg')));
await browser.close();
