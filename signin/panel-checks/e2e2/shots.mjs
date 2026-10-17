import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8077';
const shipped = fs.readFileSync((process.env.SITE || '/home/user/openspineconsortium.github.io') + '/assets/js/symphony-panel.js', 'utf8');
const real = shipped.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
const configured = real.replace("var SIGNIN_SERVICE = '';", "var SIGNIN_SERVICE = 'https://signin.example.test';").replace("var CLIENT_ID = '';", "var CLIENT_ID = 'Iv1.testclient';");
const browser = await chromium.launch();
for (const [name, script, width] of [['off', real, 1280], ['on', configured, 1280], ['on-phone', configured, 390]]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  const page = await context.newPage();
  await page.goto(BASE + '/symphony/control/');
  const gate = await page.$('#cp-gate');
  await gate.screenshot({ path: process.argv[2] + '/gate-' + name + '.png' });
  await context.close();
}
await browser.close();
