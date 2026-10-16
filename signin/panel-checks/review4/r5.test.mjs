// R9: three tabs on one kept sign-in. A renewal in one is taken up by the other two, which keep naming
// the same account and say nothing of a change; then Forget in one signs the other two out. Expected PASS.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, loaded, repoList, facts, singleUse } from './lib.mjs';
import { scriptUnderTest } from './pick.mjs';
const SCRIPT = scriptUnderTest();
await launch();

await check('R9: three tabs on one kept sign-in: one renewal for all, the same name everywhere, and Forget in one signs out the other two', async () => {
  const { context, page, calls, service, errors } = await open({ script: SCRIPT, noLoad: true, serviceFn: singleUse(800, 0), storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', 2 * HOUR), symphony_panel_repos: repoList } } });
  const tabs = [page, await context.newPage(), await context.newPage()];
  tabs.slice(1).forEach((p) => p.on('pageerror', (e) => errors.push(String(e))));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all(tabs.map((p) => p.goto(path)));
  await Promise.all(tabs.map(loaded));
  // eight hours pass; all three tabs press Refresh at once
  await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; localStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  await sleep(400);
  const n = calls.length;
  await Promise.all(tabs.map((p) => p.evaluate(() => document.getElementById('cp-refresh').click())));
  await Promise.all(tabs.map(loaded));
  await sleep(1200);
  const fs1 = await Promise.all(tabs.map(facts));
  const rf = service.filter((x) => x.path === '/refresh').length;
  const used = [...new Set(calls.slice(n).filter((c) => c.auth).map((c) => c.auth))];
  console.log('      renewals:', rf, '| calls with:', used.join(','), '| names:', JSON.stringify(fs1.map((f) => f.who)), '| messages:', JSON.stringify(fs1.map((f) => f.msgs)));
  assert.equal(rf, 1);
  assert.deepEqual(used, ['Bearer ghu_NEW']);
  fs1.forEach((f) => { assert.equal(f.who, 'Signed in as tester through GitHub, kept on this browser.'); assert.ok(!f.msgs.some((m) => /Now signed in as/.test(m))); });
  await tabs[1].click('#cp-signout');
  await sleep(1500);
  const fs2 = await Promise.all(tabs.map(facts));
  console.log('      after Forget in tab 2:', JSON.stringify(fs2.map((f) => ({ gate: f.gate, msg: f.msg.slice(0, 70) }))), '| revoked:', JSON.stringify(service.filter((x) => x.path === '/revoke').map((x) => x.body.access_token)));
  assert.ok(fs2.every((f) => f.gate && !f.app));
  assert.equal(fs2[0].msg, fs2[2].msg);
  assert.match(fs2[0].msg, /^Signed out: the token this browser kept was forgotten in another tab/);
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
