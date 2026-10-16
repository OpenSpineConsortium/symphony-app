// F2: Forget the token pressed while a write waits for GitHub to name a token this tab took up
// (another tab renewed the kept sign-in, and this tab's question about the renewed token is still
// out). The write then finds the page signed out and its catch says so, over Forget's words.
// Both configurations: in the unconfigured page another tab keeps a new token of the same account.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, loaded, repoList, facts } from './lib.mjs';
import { scriptUnderTest, version } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
console.log('script:', version);
await launch();

await check('F2: Forget pressed while a write waits for GitHub to name the token another tab put in place keeps Forget\'s words', async () => {
  const routes = repoRoutes('acme/demo');
  const NEW = UNCONFIGURED ? 'github_pat_NEW' : 'ghu_NEW2';
  routes['GET /user'] = async (req) => {
    if (req.headers()['authorization'] === 'Bearer ' + NEW) await sleep(2000);
    return { login: 'tester' };
  };
  routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = null;
  const kept = UNCONFIGURED ? { symphony_panel_token: 'github_pat_OLD' } : { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR) };
  const { context, page, calls, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, kept) } });
  await loaded(page);
  // another tab of the browser renews the kept sign-in (or keeps a new token of the same account)
  const tab2 = await context.newPage();
  await tab2.goto(BASE + '/symphony/');
  await tab2.evaluate(([unconf, nt, r]) => {
    if (unconf) localStorage.setItem('symphony_panel_token', nt);
    else localStorage.setItem('symphony_panel_oauth', r);
  }, [UNCONFIGURED, NEW, rec(NEW, 'ghr_K2', 8 * HOUR)]);
  await sleep(500);
  // this tab is asking GitHub about the new token; the person presses a write, then Forget
  await page.click('#cp-run-workers');
  await sleep(300);
  await page.click('#cp-signout');
  await sleep(300);
  const forgetSaid = await page.textContent('#msg');
  await sleep(2500);
  const f = await facts(page);
  const writes = calls.filter((c) => c.key.startsWith('POST ')).map((c) => c.key + ' ' + c.auth);
  console.log('      Forget said:', JSON.stringify(forgetSaid));
  console.log('      then the page says:', JSON.stringify(f.msg), '| writes:', JSON.stringify(writes));
  console.log('      every message:', JSON.stringify(f.msgs));
  assert.deepEqual(writes, [], 'a write went out after Forget');
  assert.match(f.msg, /^The token is forgotten/, 'Forget\'s words were replaced by: ' + f.msg);
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
