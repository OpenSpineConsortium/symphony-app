// R2: whoAmI writes "Signed in as" for whatever /user answer comes last, with no check that the
// token it asked about is still the page's token; and the storage handler compares the stored token
// with `token`, which every ensureToken call rewrites from storage, not with the token the page named.
// BASEVERSION=1 runs the same against 5caf463.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, configured, configuredBase, real, baseScript, repoRoutes, rec, HOUR, sleep, appShown, loaded, repoList, facts, t } from './lib.mjs';

import { scriptUnderTest } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
await launch();

// /user answers by token: the kept sign-in is tester's and slow to answer; the pasted token is other-person's
function routesBy(slow) {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = async (req) => {
    const a = req.headers()['authorization'];
    if (a === 'Bearer github_pat_OTHER') return { login: 'other-person' };
    if (a === 'Bearer ghu_KEPT' || a === 'Bearer github_pat_TESTER') { if (slow.on) await sleep(slow.ms || 2500); return { login: 'tester' }; }
    return { status: 401, body: { message: 'Bad credentials' } };
  };
  return routes;
}
const keptStorage = () => (UNCONFIGURED ? { symphony_panel_token: 'github_pat_TESTER' } : { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR) });
const usedSince = (calls, n) => [...new Set(calls.slice(n).filter((c) => c.auth && c.key !== 'GET /user').map((c) => c.auth))];

await check('R2a: a token pasted into the sign-in box while the page still asks GitHub who the kept sign-in is ends with the page naming the pasted token\'s account', async () => {
  const slow = { on: true };
  const { context, page, calls, errors } = await open({ script: SCRIPT, routes: routesBy(slow), noLoad: true, storage: { local: Object.assign(keptStorage(), { symphony_panel_repos: repoList }) } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  // the sign-in box stands on the page until GitHub says who the kept sign-in is; the person pastes
  // another account's token for this tab
  await page.waitForSelector('#cp-gate:not(.hidden)');
  if (!(await page.isVisible('#cp-token'))) await page.click('#cp-token-way > summary');
  await page.fill('#cp-token', 'github_pat_OTHER');
  const n = calls.length;
  await page.click('#cp-open');
  await sleep(4000);
  const f = await facts(page);
  const used = usedSince(calls, n);
  console.log('      cp-who:', JSON.stringify(f.who), '| calls made with:', used.join(','), '| app:', f.app);
  assert.deepEqual(used, ['Bearer github_pat_OTHER'], 'the calls went out with another token');
  assert.equal(f.who, 'Signed in as other-person with a token, for this tab.', 'the page names an account it is not acting as');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('R2b: a token another tab keeps while this tab still asks GitHub who the kept sign-in is ends with this tab naming the new token\'s account', async () => {
  const slow = { on: false };
  const local = Object.assign(keptStorage(), { symphony_panel_repos: repoList });
  // tab A: its own sign-in for the tab is refused, so its box is up; tab B: loading on the kept sign-in
  const sessionA = UNCONFIGURED ? { symphony_panel_token: 'github_pat_DEAD' } : { symphony_panel_oauth: rec('ghu_TABDEAD', '', 2 * HOUR) };
  const { context, page, calls, service, errors } = await open({ script: SCRIPT, routes: routesBy(slow), path: '/symphony/control/?repo=acme/demo', storage: { local, session: sessionA } });
  await page.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const pageB = await context.newPage();
  pageB.on('pageerror', (e) => errors.push(String(e)));
  slow.on = true;
  const n = calls.length;
  pageB.goto(BASE + '/symphony/control/?repo=acme/demo').catch(() => {});
  for (let i = 0; i < 100 && !calls.slice(n).some((c) => c.key === 'GET /user'); i++) await sleep(20);
  await sleep(200);
  // in tab A the person pastes another account's token, to keep on the browser
  if (!(await page.isVisible('#cp-token'))) await page.click('#cp-token-way > summary');
  await page.check('#cp-keep');
  await page.fill('#cp-token', 'github_pat_OTHER');
  const m = calls.length;
  await page.click('#cp-open');
  await sleep(4500);
  const fB = await facts(pageB);
  const usedB = [...new Set(calls.slice(m).filter((c) => c.auth && c.key !== 'GET /user').map((c) => c.auth))];
  console.log('      tab B cp-who:', JSON.stringify(fB.who), '| app:', fB.app, '| tab B messages:', JSON.stringify(fB.msgs), '| calls since the paste with:', usedB.join(','));
  assert.ok(fB.app && !fB.gate);
  assert.equal(fB.who, 'Signed in as other-person with a token, kept on this browser.', 'tab B names an account it is not acting as');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('R2c: a token another tab keeps while this tab is still loading makes this tab name the new token\'s account', async () => {
  // tab B is loading when tab A keeps another account's token; tab B's next call takes the new token
  // from storage before the storage handler's 300 ms are up, and the handler then finds nothing changed
  const gate = { open: false, waiters: [] };
  const routes = routesBy({ on: false });
  const meta = routes['GET /repos/acme/demo'];
  routes['GET /repos/acme/demo'] = async (req) => {
    const a = req.headers()['authorization'];
    if (a !== 'Bearer ghu_KEPT' && a !== 'Bearer github_pat_TESTER') return meta;
    if (!gate.armed) return meta;
    // tab B's read of the repository is answered 100 ms after tab A keeps the new token
    await new Promise((r) => gate.waiters.push(r));
    await sleep(100);
    return meta;
  };
  const local = Object.assign(keptStorage(), { symphony_panel_repos: repoList });
  const sessionA = UNCONFIGURED ? { symphony_panel_token: 'github_pat_DEAD' } : { symphony_panel_oauth: rec('ghu_TABDEAD', '', 2 * HOUR) };
  const { context, page, calls, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local, session: sessionA } });
  await page.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const pageB = await context.newPage();
  pageB.on('pageerror', (e) => errors.push(String(e)));
  await pageB.goto(BASE + '/symphony/control/?repo=acme/demo');
  await loaded(pageB);
  const who0 = (await facts(pageB)).who;
  // tab B reloads its repository (Refresh); its read is still out when tab A keeps the new token
  gate.armed = true;
  const n = calls.length;
  await pageB.evaluate(() => document.getElementById('cp-refresh').click());
  for (let i = 0; i < 100 && !calls.slice(n).some((c) => c.key === 'GET /repos/acme/demo'); i++) await sleep(20);
  if (!(await page.isVisible('#cp-token'))) await page.click('#cp-token-way > summary');
  await page.check('#cp-keep');
  await page.fill('#cp-token', 'github_pat_OTHER');
  await page.click('#cp-open');
  for (let i = 0; i < 200; i++) { if (await page.evaluate(() => localStorage.getItem('symphony_panel_token') === 'github_pat_OTHER')) break; await sleep(10); }
  gate.waiters.splice(0).forEach((r) => r());
  gate.armed = false;
  await sleep(2500);
  const fB = await facts(pageB);
  const usedB = [...new Set(calls.slice(n).filter((c) => c.auth && c.key !== 'GET /user' && c.key !== 'GET /repos/acme/demo').map((c) => c.auth))];
  console.log('      tab B before:', JSON.stringify(who0), '| after:', JSON.stringify(fB.who), '| tab B\'s later calls with:', usedB.join(','), '| messages:', JSON.stringify(fB.msgs));
  assert.deepEqual(usedB, ['Bearer github_pat_OTHER']);
  assert.ok(/other-person/.test(fB.who), 'tab B acts with other-person\'s token and still names ' + JSON.stringify(fB.who));
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
