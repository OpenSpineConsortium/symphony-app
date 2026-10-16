// R10: the page opens on the sign-in the browser keeps, whose token ran out overnight, so its first
// call renews it, and the sign-in box stands on the page while that renewal is out. A token pasted
// there for this tab alone ("Keep me signed in" unticked) should stand in front of the kept sign-in
// and leave it be (storeSignin's own words). renew() reads "the record it renews" from whatever
// storage now comes first, this tab's sessionStorage, finds none, and revokes the renewal of the
// sign-in the other tabs use, whose old refresh token GitHub has already spent.
// Configured only: there is no renewal without the sign-in service. BASEVERSION=1 runs it on 5caf463.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, sleep, appShown, loaded, repoList, facts, singleUse } from './lib.mjs';
import { scriptUnderTest } from './pick.mjs';
const SCRIPT = scriptUnderTest();
if (process.env.UNCONFIGURED) { console.log('R10 needs the sign-in service; nothing to run unconfigured'); process.exit(0); }
await launch();

await check('R10: a token pasted for this tab while the page renews the sign-in the browser keeps leaves that sign-in renewed and working for the other tabs', async () => {
  const routes = repoRoutes('acme/demo');
  // the kept sign-in and the pasted token are the same person's
  routes['GET /user'] = { login: 'tester' };
  const { context, page, calls, service, errors } = await open({ script: SCRIPT, routes, serviceFn: singleUse(2500, 0), noLoad: true, storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', -60000), symphony_panel_repos: repoList } } });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  // the sign-in box is up while the first call waits on the renewal; the person pastes a token for this tab
  await page.waitForSelector('#cp-gate:not(.hidden)');
  for (let i = 0; i < 100 && !service.some((s) => s.path === '/refresh'); i++) await sleep(20);
  const boxUpDuringRenewal = await page.isVisible('#cp-gate');
  if (!(await page.isVisible('#cp-token'))) await page.click('#cp-token-way > summary');
  await page.fill('#cp-token', 'github_pat_TAB');
  await page.click('#cp-open');
  await appShown(page);
  await sleep(3500);
  const f1 = await facts(page);
  const revoked = service.filter((s) => s.path === '/revoke').map((s) => s.body.access_token);
  const kept = JSON.parse(f1.local || 'null');
  const used1 = [...new Set(calls.filter((c) => c.auth).map((c) => c.auth))];
  console.log('      box up during the renewal:', boxUpDuringRenewal, '| this tab:', JSON.stringify(f1.who), '| its calls with:', used1.join(','), '| revoked:', JSON.stringify(revoked), '| kept record now holds:', kept && kept.access_token + '/' + kept.refresh_token);
  // a second tab opens on the sign-in the browser keeps
  const tab2 = await context.newPage();
  tab2.on('pageerror', (e) => errors.push(String(e)));
  const n = calls.length;
  await tab2.goto(BASE + '/symphony/control/?repo=acme/demo');
  await sleep(3000);
  const f2 = await facts(tab2);
  const used2 = [...new Set(calls.slice(n).filter((c) => c.auth).map((c) => c.auth))];
  const timeline = service.map((s) => s.at + ' service ' + s.path + ' ' + JSON.stringify(s.body) + ' -> ' + (s.answer || '') + ' @' + s.answeredAt);
  console.log('      timeline:\n        ' + timeline.join('\n        '));
  console.log('      tab 2:', JSON.stringify({ app: f2.app, gate: f2.gate, who: f2.who, msg: f2.msg }), '| calls with:', used2.join(','));
  assert.ok(!revoked.includes('ghu_NEW'), 'the renewal of the sign-in the browser keeps was revoked');
  assert.ok(!used1.includes('Bearer ghu_NEW'), 'this tab, which names its pasted token, called with the kept sign-in');
  assert.ok(f2.app && /through GitHub, kept on this browser/.test(f2.who), 'the second tab is not signed in on the kept sign-in: ' + f2.msg);
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
