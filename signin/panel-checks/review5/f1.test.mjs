// F1: Forget the token pressed while a write GitHub refused (401) waits in refused(). Forget says
// the token is forgotten (and revoked), then the write's own failure comes back and says GitHub
// refused the sign-in, over Forget's words. Without Web Locks the wait is refused()'s 22-second
// look, so the person has the time to press Forget; with a lock the window is the request's own
// time on the way (a refusal arriving just after the revoke). Configured only (a sign-in).
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, loaded, repoList, facts, noLocks } from './lib.mjs';
import { scriptUnderTest, version } from './pick.mjs';
const SCRIPT = scriptUnderTest();
console.log('script:', version);
await launch();

const DISPATCH = 'POST /repos/acme/demo/actions/workflows/workers.yml/dispatches';

for (const v of [
  { name: 'no Web Locks, GitHub refuses the write at once', locks: false, refuseAfter: 0, forgetAt: 2000 },
  { name: 'with Web Locks, the refusal comes back just after Forget', locks: true, refuseAfter: 1500, forgetAt: 300 },
]) {
  await check('F1: Forget pressed while a refused write is still being judged keeps its own words (' + v.name + ')', async () => {
    const routes = repoRoutes('acme/demo');
    let refuseWrite = false;
    routes[DISPATCH] = async () => {
      if (!refuseWrite) return null;
      if (v.refuseAfter) await sleep(v.refuseAfter);
      return { status: 401, body: { message: 'Bad credentials' } };
    };
    const { context, page, errors } = await open({ script: SCRIPT, routes, initScript: v.locks ? undefined : noLocks, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
    await loaded(page);
    refuseWrite = true;
    await page.click('#cp-run-workers');
    await sleep(v.forgetAt);
    const forgetPressable = await page.isVisible('#cp-signout');
    console.log('      Forget pressable', v.forgetAt, 'ms after the press:', forgetPressable);
    if (!forgetPressable) { await context.close(); return; }
    await page.click('#cp-signout');
    await sleep(500);
    const forgetSaid = await page.textContent('#msg');
    await sleep(v.locks ? 3000 : 2500);
    const f = await facts(page);
    console.log('      Forget said:', JSON.stringify(forgetSaid));
    console.log('      then the page says:', JSON.stringify(f.msg), '| every message:', JSON.stringify(f.msgs));
    assert.match(f.msg, /^The token is forgotten/, 'Forget\'s words were replaced by: ' + f.msg);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await close();
console.log('\n' + results.join('\n'));
