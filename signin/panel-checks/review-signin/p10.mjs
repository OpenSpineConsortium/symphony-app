// A pasted token GitHub refuses at load, with the sign-in configured: is the token box offered?
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const real = fs.readFileSync('/home/user/openspineconsortium.github.io/assets/js/symphony-panel.js', 'utf8');
const configured = real.replace("var SIGNIN_SERVICE = '';", "var SIGNIN_SERVICE = 'https://signin.example.test';").replace("var CLIENT_ID = '';", "var CLIENT_ID = 'Iv1.x';");
const browser = await chromium.launch();
for (const [name, script] of [['unconfigured', real], ['configured', configured]]) {
  const context = await browser.newContext();
  await context.route('https://api.github.com/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"message":"Bad credentials"}' }));
  await context.route('**/assets/js/symphony-panel.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  const p0 = await context.newPage();
  await p0.goto(BASE + '/symphony/');
  await p0.evaluate(() => { localStorage.clear(); localStorage.setItem('symphony_panel_token', 'github_pat_EXPIRED'); });
  await p0.close();
  for (const path of ['/symphony/control/', '/symphony/cost.html']) {
    const page = await context.newPage();
    await page.goto(BASE + path);
    await page.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
    const f = await page.evaluate(() => ({ msg: document.getElementById('msg').textContent, open: document.getElementById('cp-token-way').open, tokenVisible: document.getElementById('cp-token').checkVisibility() }));
    console.log(name, path, JSON.stringify(f));
    await page.close();
  }
  await context.close();
}
await browser.close();
