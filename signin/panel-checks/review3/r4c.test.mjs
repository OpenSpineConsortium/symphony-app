// R4c: a wrong token pasted with Keep ticked revokes the working kept sign-in before GitHub has looked at it
import assert from 'node:assert/strict';
import { BASE, HOUR, configured, results, check, repoRoutes, launch, close, open, rec, facts, sleep, loaded, repoList } from './lib.mjs';
await launch();
await check('R4c: a kept paste GitHub then refuses leaves the working kept sign-in in place', async () => {
  const routes = repoRoutes('acme/demo');
  for (const k of Object.keys(routes)) { const v = routes[k]; routes[k] = (req) => (req.headers()['authorization'] === 'Bearer github_pat_TYPO' ? { status: 401, body: { message: 'Bad credentials' } } : v); }
  const { context, page, service, errors } = await open({ script: configured, noLoad: true, routes, storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([loaded(page), loaded(page2)]);
  await page2.evaluate(() => { document.getElementById('cp-app').classList.add('hidden'); document.getElementById('cp-gate').classList.remove('hidden'); document.getElementById('cp-token-way').open = true; });
  await page2.check('#cp-keep');
  await page2.fill('#cp-token', 'github_pat_TYPO');
  await page2.click('#cp-open');
  await sleep(1500);
  await page.click('#cp-refresh');
  await sleep(1500);
  const f1 = await facts(page), f2 = await facts(page2);
  console.log('      revoked:', service.filter((x) => x.path === '/revoke').map((x) => x.body.access_token).join(',') || 'none');
  console.log('      tab 1:', JSON.stringify({ gate: f1.gate, msg: f1.msg }), '| kept now:', f1.local, f1.lToken);
  console.log('      tab 2:', JSON.stringify({ gate: f2.gate, msg: f2.msg }));
  assert.ok(!f1.gate, 'the working kept sign-in was revoked for a token GitHub refused');
  await context.close();
});
await close();
console.log('\n' + results.join('\n'));
