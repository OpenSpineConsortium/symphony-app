// Third review, further checks; a FAIL is a defect (or, where the name says so, a design consequence).
import assert from 'node:assert/strict';
import { BASE, HOUR, configured, configuredBase, results, check, repoRoutes, launch, close, open, rec, singleUse, facts, sleep, appShown, loaded, repoList, noLocks, t } from './lib.mjs';

await launch();
const SCRIPT = process.env.BASEVERSION ? configuredBase : configured;

// G: Forget in a tab whose own sign-in stands in front of a token pasted and kept on the browser
await check('G: Forget the token says the kept personal access token stays valid at GitHub when it forgets one', async () => {
  const tabOnly = rec('ghu_TAB', '', 2 * HOUR);
  const { context, page, service, errors } = await open({ script: SCRIPT, path: '/symphony/control/', storage: { session: { symphony_panel_oauth: tabOnly }, local: { symphony_panel_token: 'github_pat_KEPT' } } });
  await appShown(page);
  await page.click('#cp-signout');
  await page.waitForFunction(() => /revoked at GitHub|could not be asked/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const f = await facts(page);
  console.log('      message:', f.msg);
  console.log('      left:', JSON.stringify([f.lToken, f.sToken, f.local, f.session]), '| revoked:', service.filter((x) => x.path === '/revoke').map((x) => x.body.access_token).join(','));
  assert.equal(f.lToken, null, 'the kept token was not forgotten');
  assert.match(f.msg, /personal access token itself stays valid/, 'the kept personal access token was forgotten here and the message does not say it stays valid at GitHub');
  assert.deepEqual(errors, []);
  await context.close();
});

// H: another tab replaces the kept sign-in with another account's token; this tab goes on as that account
await check('H: a kept token replaced in another tab by another account\'s is not used here under the old name', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = (req) => ({ login: req.headers()['authorization'] === 'Bearer github_pat_OTHER' ? 'other-person' : 'tester' });
  const { context, page, calls, errors } = await open({ script: SCRIPT, noLoad: true, routes, storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([loaded(page), loaded(page2)]);
  // tab 2: Forget, then a token of another account pasted and kept on the browser
  await page2.click('#cp-signout');
  await page2.waitForSelector('#cp-gate:not(.hidden)');
  await page2.check('#cp-keep');
  await page2.evaluate(() => { document.getElementById('cp-token-way').open = true; });
  await page2.fill('#cp-token', 'github_pat_OTHER');
  await page2.click('#cp-open');
  await sleep(1500);
  const f1 = await facts(page);
  console.log('      tab 1 after:', JSON.stringify({ app: f1.app, gate: f1.gate, who: f1.who, msg: f1.msg }));
  assert.ok(f1.gate, 'tab 1 was not signed out by the Forget');
  await context.close();
});

// H2: the same without Forget: a keep-ticked paste in another tab carries this tab to the other account
await check('H2: a token kept in another tab over this tab\'s kept sign-in leaves this tab saying who it now acts as', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = (req) => ({ login: req.headers()['authorization'] === 'Bearer github_pat_OTHER' ? 'other-person' : 'tester' });
  const { context, page, calls, service, errors } = await open({ script: SCRIPT, noLoad: true, routes, storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await loaded(page);
  // tab 2 opens on the gate with nothing in its own storage, and a person keeps another account's token
  await page2.goto(BASE + '/symphony/control/?repo=acme/demo');
  await loaded(page2);
  await page2.evaluate(() => { document.getElementById('cp-app').classList.add('hidden'); document.getElementById('cp-gate').classList.remove('hidden'); document.getElementById('cp-token-way').open = true; });
  await page2.check('#cp-keep');
  await page2.fill('#cp-token', 'github_pat_OTHER');
  await page2.click('#cp-open');
  await sleep(1500);
  const n = calls.length;
  await page.click('#cp-refresh');
  await loaded(page);
  await sleep(300);
  const f1 = await facts(page);
  const used = [...new Set(calls.slice(n).map((c) => c.auth))];
  console.log('      tab 1 says:', JSON.stringify(f1.who), '| tab 1 now calls with:', used.join(','), '| revoked:', service.filter((x) => x.path === '/revoke').map((x) => x.body.access_token).join(','));
  assert.ok(!(used.includes('Bearer github_pat_OTHER') && /tester/.test(f1.who)), 'tab 1 acts as other-person while it says it is signed in as tester');
  await context.close();
});

// I: a tab-only sign-in that follows the panel's own link to the cost page can no longer renew there
await check('I: a tab-only sign-in renews on the cost page after following the control page\'s link (design consequence)', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /repos/acme/demo/contents/METRICS.json'] = { status: 404, body: { message: 'Not Found' } };
  const { context, page, service, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_repos: repoList } } });
  await page.click('#cp-signin');
  await appShown(page);
  await loaded(page);
  await page.click('a[href="/symphony/cost.html"] >> nth=0');
  await appShown(page);
  // eight hours later
  await page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  await page.selectOption('#cost-repo', 'acme/demo').catch(() => {});
  await page.evaluate(() => document.getElementById('cost-repo').dispatchEvent(new Event('change')));
  await sleep(1500);
  const f = await facts(page);
  console.log('      on the cost page:', JSON.stringify({ gate: f.gate, msg: f.msg }), '| renewals:', service.filter((x) => x.path === '/refresh').length);
  assert.ok(!f.gate, 'the sign-in ended on the cost page: ' + f.msg);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
