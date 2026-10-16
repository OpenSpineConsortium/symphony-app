// S1-S3: one GET /user that GitHub never answers. The page shares one question "whose is this
// token?" per token (whoAmI's `naming`), with no time limit, and since this round every call made
// with a token the page has not named waits for that question. So one stalled request can hold
// every later call of the tab, and a second press asks nothing new.
// BASEVERSION=1 runs the same against 0b9600b; UNCONFIGURED=1 is the site as deployed today.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, appShown, loaded, repoList, facts, t } from './lib.mjs';
import { scriptUnderTest, version } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
console.log('script:', version);
await launch();

const isLoaded = (p) => p.evaluate(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
const summaryOf = (p) => p.evaluate(() => document.getElementById('cp-summary').textContent);
const pasteIn = async (p, value, keepIt) => {
  if (!(await p.isVisible('#cp-token'))) await p.click('#cp-token-way > summary');
  if (keepIt) await p.check('#cp-keep'); else await p.uncheck('#cp-keep');
  await p.fill('#cp-token', value);
  await p.click('#cp-open');
};

// S1: configured only (a renewal needs the service)
if (!UNCONFIGURED) await check('S1: after this tab renews its sign-in, a GET /user that never answers does not hold every later call for good', async () => {
  const routes = repoRoutes('acme/demo');
  const stalled = [];
  routes['GET /user'] = (req) => {
    if (req.headers()['authorization'] === 'Bearer ghu_NEW') { stalled.push(t()); return new Promise(() => { /* GitHub never answers this one */ }); }
    return { login: 'tester' };
  };
  const { context, page, calls, service, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', 2 * HOUR), symphony_panel_repos: repoList } } });
  await loaded(page);
  // the token reaches its last minute; the next press renews it
  await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; localStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  const n = calls.length;
  await page.click('#cp-refresh');
  await sleep(24000);
  const after24 = { loaded: await isLoaded(page), summary: await summaryOf(page), f: await facts(page) };
  // the person presses Refresh again
  await page.click('#cp-refresh');
  await sleep(6000);
  const after30 = { loaded: await isLoaded(page), summary: await summaryOf(page), f: await facts(page) };
  const since = calls.slice(n).map((c) => c.at + ' ' + c.key + ' ' + c.auth);
  console.log('      renewals:', service.filter((s) => s.path === '/refresh').length, '| GET /user with ghu_NEW sent at:', JSON.stringify(stalled));
  console.log('      calls since the first Refresh:\n        ' + since.join('\n        '));
  console.log('      after 24 s:', JSON.stringify({ loaded: after24.loaded, summary: after24.summary.slice(0, 120), msg: after24.f.msg, who: after24.f.who }));
  console.log('      after a second Refresh and 6 s more:', JSON.stringify({ loaded: after30.loaded, summary: after30.summary.slice(0, 120), msg: after30.f.msg, who: after30.f.who }));
  assert.ok(after30.loaded || after30.f.msg, 'the tab is still "' + after30.summary.slice(0, 60) + '" 30 s and two presses later, and says nothing');
  assert.deepEqual(errors, []);
  await context.close();
});

// S2: both configurations: a paste whose second /user stalls, pressed again
await check('S2: a pasted token whose first GET /user after the check never answers opens the panel when "Open the panel" is pressed again', async () => {
  const routes = repoRoutes('acme/demo');
  let n = 0;
  const log = [];
  routes['GET /user'] = (req) => {
    if (req.headers()['authorization'] !== 'Bearer github_pat_NEW') return { login: 'tester' };
    n++;
    log.push(n + ' @' + t());
    // the check's question is answered; the page's next question about the same token stalls once
    if (n === 2) return new Promise(() => { /* never answered */ });
    return { login: 'tester' };
  };
  const { context, page, calls, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_repos: repoList } } });
  await pasteIn(page, 'github_pat_NEW', false);
  await sleep(3000);
  const first = await facts(page);
  // nothing happened, so the person presses the button again (the field was emptied, so the token is pasted again)
  await pasteIn(page, 'github_pat_NEW', false);
  await sleep(12000);
  const f = await facts(page);
  console.log('      GET /user with the paste, in order:', JSON.stringify(log));
  console.log('      3 s after the first press:', JSON.stringify({ app: first.app, gate: first.gate, msg: first.msg }));
  console.log('      12 s after the second press:', JSON.stringify({ app: f.app, gate: f.gate, msg: f.msg, who: f.who, summary: f.summary.slice(0, 80) }));
  assert.ok(f.app && !f.gate, 'the second press of "Open the panel" never opened the panel');
  assert.deepEqual(errors, []);
  await context.close();
});

// S3: both configurations: another tab keeps a new token of the same account, and this tab's
// question about it stalls; then the person presses Refresh in this tab
await check('S3: a tab whose question about a token another tab kept never comes back is not stuck on every later call', async () => {
  const routes = repoRoutes('acme/demo');
  const held = { on: false };
  const sentAt = [];
  routes['GET /user'] = (req) => {
    const a = req.headers()['authorization'];
    if (a === 'Bearer github_pat_NEW' && held.on && req.frame().page() === held.page) { held.on = false; sentAt.push(t()); return new Promise(() => { /* never answered */ }); }
    return { login: 'tester' };
  };
  const kept = UNCONFIGURED ? { symphony_panel_token: 'github_pat_OLD' } : { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR) };
  const { context, page: tab1, calls, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, kept) } });
  await loaded(tab1);
  const tab2 = await context.newPage();
  tab2.on('pageerror', (e) => errors.push(String(e)));
  await tab2.goto(BASE + '/symphony/');
  held.page = tab1;
  held.on = true;
  // tab 2 keeps a new token of the same account (the person made a new one and kept it there)
  await tab2.evaluate(() => { localStorage.removeItem('symphony_panel_oauth'); localStorage.setItem('symphony_panel_token', 'github_pat_NEW'); });
  await sleep(2000);
  const n = calls.length;
  await tab1.evaluate(() => document.getElementById('cp-refresh').click());
  await sleep(24000);
  const f = await facts(tab1);
  const loadedNow = await isLoaded(tab1);
  const since = calls.slice(n).filter((c) => c.tab === tab1).map((c) => c.at + ' ' + c.key + ' ' + c.auth);
  console.log('      stalled GET /user sent at:', JSON.stringify(sentAt), '| tab 1 calls in the 24 s after Refresh:', JSON.stringify(since));
  console.log('      tab 1 24 s after Refresh:', JSON.stringify({ loaded: loadedNow, summary: f.summary.slice(0, 100), msg: f.msg, who: f.who }));
  assert.ok(loadedNow || f.msg, 'tab 1 is still "' + f.summary.slice(0, 60) + '" 24 s after Refresh, and says nothing');
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
