import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const browser = await chromium.launch();
const context = await browser.newContext();
const a = await context.newPage(), b = await context.newPage();
await a.goto(BASE + '/symphony/privacy.html'); await b.goto(BASE + '/symphony/privacy.html');
const pid = async (p) => { const s = await context.newCDPSession(p); const r = await s.send('Runtime.evaluate', { expression: '1' }); const t = await s.send('Target.getTargetInfo'); return t.targetInfo; };
const ia = await pid(a), ib = await pid(b);
console.log('page A browserContextId', ia.browserContextId, 'B', ib.browserContextId);
// a write in A is read in B at once, in the same task, if both share one renderer's storage cache
const r = await Promise.all([a.evaluate(() => { localStorage.setItem('probe', String(Date.now())); return localStorage.getItem('probe'); }), b.evaluate(() => localStorage.getItem('probe'))]);
console.log('A wrote', r[0], '| B read right after:', r[1]);
const bc = await browser.newBrowserCDPSession();
const info = await bc.send('SystemInfo.getProcessInfo').catch((e) => ({ error: e.message }));
console.log('renderer processes:', info.processInfo ? info.processInfo.filter((p) => p.type === 'renderer').length : JSON.stringify(info).slice(0, 200));
await browser.close();
