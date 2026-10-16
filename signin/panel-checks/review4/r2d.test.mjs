// R2d: R2c without coordinated timing. Tab B reloads its repository on a slow network (every GitHub
// answer takes 150 ms); tab A keeps another account's token at some moment during that load. How often
// does tab B end up acting with the new token while naming the old account?
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, loaded, repoList, facts } from './lib.mjs';
import { scriptUnderTest } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
await launch();

const offsets = (process.env.OFFSETS || '0,100,200,300,400,500,600,800').split(',').map(Number);
const outcomes = [];
for (const offset of offsets) {
  await check('R2d: tab A keeps another account\'s token ' + offset + ' ms into tab B\'s slow reload; tab B names the account it acts as', async () => {
    const slow = { on: false };
    const routes = repoRoutes('acme/demo');
    for (const k of Object.keys(routes)) {
      const r = routes[k];
      routes[k] = async (req) => {
        const a = req.headers()['authorization'];
        if (k === 'GET /user') {
          if (/DEAD/.test(a)) return { status: 401, body: { message: 'Bad credentials' } };
          return { login: a === 'Bearer github_pat_OTHER' ? 'other-person' : 'tester' };
        }
        if (slow.on && a !== 'Bearer github_pat_OTHER') await sleep(150);
        return r;
      };
    }
    const kept = UNCONFIGURED ? { symphony_panel_token: 'github_pat_TESTER' } : { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR) };
    const sessionA = UNCONFIGURED ? { symphony_panel_token: 'github_pat_DEAD' } : { symphony_panel_oauth: rec('ghu_TABDEAD', '', 2 * HOUR) };
    const { context, page: tabA, calls, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, kept), session: sessionA } });
    await tabA.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
    if (!(await tabA.isVisible('#cp-token'))) await tabA.click('#cp-token-way > summary');
    await tabA.check('#cp-keep');
    await tabA.fill('#cp-token', 'github_pat_OTHER');
    const tabB = await context.newPage();
    tabB.on('pageerror', (e) => errors.push(String(e)));
    await tabB.goto(BASE + '/symphony/control/?repo=acme/demo');
    await loaded(tabB);
    slow.on = true;
    const n = calls.length;
    await tabB.evaluate(() => document.getElementById('cp-refresh').click());
    await sleep(offset);
    await tabA.click('#cp-open');
    await sleep(3000);
    const fB = await facts(tabB);
    const later = [...new Set(calls.slice(n).filter((c) => c.auth && c.key !== 'GET /user').map((c) => c.auth))];
    const wrong = later.includes('Bearer github_pat_OTHER') && !/other-person/.test(fB.who);
    outcomes.push(offset + ' ms: ' + (wrong ? 'WRONG NAME' : 'named') + ' (' + fB.who + '; calls with ' + later.join(',') + ')');
    console.log('      ', outcomes[outcomes.length - 1]);
    assert.ok(!wrong, 'tab B acts with other-person\'s token and names: ' + fB.who);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
console.log('\n      ' + outcomes.join('\n      '));
await close();
console.log('\n' + results.join('\n'));
