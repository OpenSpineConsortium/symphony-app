import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8077';
for (const opts of [{ ignoreDefaultArgs: ['--disable-back-forward-cache'] }, { ignoreDefaultArgs: ['--disable-back-forward-cache'], channel: 'chromium' }]) {
  let browser;
  try { browser = await chromium.launch(opts); } catch (e) { console.log('launch failed', JSON.stringify(opts), e.message.split('\n')[0]); continue; }
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  cdp.on('Page.backForwardCacheNotUsed', (e) => console.log('   not used:', JSON.stringify(e.notRestoredExplanations.map((x) => x.reason))));
  for (const [a, b] of [['/symphony/privacy.html', '/symphony/apps-privacy.html'], ['/symphony/control/', '/symphony/cost.html']]) {
    await page.goto(BASE + a);
    await page.evaluate(() => { window.__marker = 42; });
    await page.goto(BASE + b);
    await page.goBack();
    await new Promise((r) => setTimeout(r, 300));
    const m = await page.evaluate(() => window.__marker);
    console.log(JSON.stringify(opts), a, '| restored from bfcache:', m === 42);
  }
  await browser.close();
}
