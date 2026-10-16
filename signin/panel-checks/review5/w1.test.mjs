// W1: a page that opened naming nobody (GitHub could not say at load whose the token is, so the
// page opened with the token it holds, as enter() promises) comes back from the back-forward cache
// with nothing changed in storage. lookAtStorage() now runs on pageshow, and since shownToken is
// empty it follows the very token the page holds; when GitHub still cannot answer, followToken()
// says another tab kept a new token. The cache restore is stood in for by the event, as H11 does.
// S2c: the cost page's "Read my repository" with a paste whose question stalls (S2's mechanism).
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, appShown, loaded, repoList, facts, t } from './lib.mjs';
import { scriptUnderTest, version } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
console.log('script:', version);
await launch();

await check('W1: a page that came back from the back-forward cache with nothing changed says nothing of another tab keeping a new token', async () => {
  const routes = repoRoutes('acme/demo');
  // GitHub's /user is failing for a while; the rest of GitHub answers
  routes['GET /user'] = { status: 502, body: { message: 'Server Error' } };
  const kept = UNCONFIGURED ? { symphony_panel_token: 'github_pat_TESTER' } : { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR) };
  const { context, page, calls, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, kept) } });
  await loaded(page);
  const before = await facts(page);
  // the person went to another page of the site in this tab and comes Back; nothing changed meanwhile
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await sleep(1000);
  const f = await facts(page);
  console.log('      at load:', JSON.stringify({ app: before.app, who: before.who, msg: before.msg }));
  console.log('      after Back:', JSON.stringify({ app: f.app, who: f.who, msg: f.msg }));
  assert.ok(!/^Another tab of this browser kept a new token/.test(f.msg), 'the page says another tab kept a new token, though storage holds the token it had');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S2c: on the cost page, a paste whose first GET /user after the check never answers opens the page when the button is pressed again', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /repos/acme/demo/contents/METRICS.json'] = { raw: JSON.stringify({ sharing: 'off' }) };
  let n = 0;
  routes['GET /user'] = (req) => { if (req.headers()['authorization'] !== 'Bearer github_pat_NEW') return { login: 'tester' }; n++; if (n === 2) return new Promise(() => {}); return { login: 'tester' }; };
  const { context, page, errors } = await open({ script: SCRIPT, routes, path: '/symphony/cost.html', storage: { local: { symphony_panel_repos: repoList, symphony_panel_repo: 'acme/demo' } } });
  const pasteIn = async () => { if (!(await page.isVisible('#cp-token'))) await page.click('#cp-token-way > summary'); await page.fill('#cp-token', 'github_pat_NEW'); await page.click('#cp-open'); };
  await pasteIn();
  await sleep(3000);
  await pasteIn();
  await sleep(10000);
  const f = await page.evaluate(() => ({ app: !document.getElementById('cp-app').classList.contains('hidden'), gate: !document.getElementById('cp-gate').classList.contains('hidden'), msg: document.getElementById('msg').textContent, measured: (document.getElementById('cost-measured') || {}).textContent || '' }));
  console.log('      GET /user with the paste:', n, '| 10 s after the second press:', JSON.stringify(f));
  assert.ok(f.app && !f.gate, 'the second press of "Read my repository" never opened the page');
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
