// R11: followToken() takes the token another tab kept before GitHub has said whose it is, and when
// that one /user call fails (a 502 from GitHub, a dropped connection) its catch says nothing and
// leaves the old name: the tab then acts with the new token and names the old account.
// UNCONFIGURED=1 runs the deployed configuration (pasted tokens only); BASEVERSION=1 runs 5caf463.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, loaded, repoList, facts } from './lib.mjs';
import { scriptUnderTest } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
await launch();

await check('R11: a tab that follows another tab\'s new token and cannot ask GitHub whose it is never acts with it under the old name', async () => {
  const fail = { armed: false, page: null };
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = (req) => {
    const a = req.headers()['authorization'];
    if (/DEAD/.test(a)) return { status: 401, body: { message: 'Bad credentials' } };
    if (a === 'Bearer github_pat_OTHER') {
      // GitHub stumbles once, on the follow of tab B
      if (fail.armed && req.frame().page() === fail.page) { fail.armed = false; return { status: 502, body: { message: 'Server Error' } }; }
      return { login: 'other-person' };
    }
    return { login: 'tester' };
  };
  const kept = UNCONFIGURED ? { symphony_panel_token: 'github_pat_TESTER' } : { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR) };
  const sessionA = UNCONFIGURED ? { symphony_panel_token: 'github_pat_DEAD' } : { symphony_panel_oauth: rec('ghu_TABDEAD', '', 2 * HOUR) };
  // tab A: its own token for the tab is refused, so its box is up; tab B: open on the kept sign-in
  const { context, page: tabA, calls, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, kept), session: sessionA } });
  await tabA.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const tabB = await context.newPage();
  tabB.on('pageerror', (e) => errors.push(String(e)));
  await tabB.goto(BASE + '/symphony/control/?repo=acme/demo');
  await loaded(tabB);
  fail.page = tabB;
  fail.armed = true;
  // in tab A the person keeps another account's token on the browser
  if (!(await tabA.isVisible('#cp-token'))) await tabA.click('#cp-token-way > summary');
  await tabA.check('#cp-keep');
  await tabA.fill('#cp-token', 'github_pat_OTHER');
  await tabA.click('#cp-open');
  await sleep(1500);
  const fB1 = await facts(tabB);
  // later the person presses Refresh in tab B
  const n = calls.length;
  await tabB.evaluate(() => document.getElementById('cp-refresh').click());
  // the load ends, or the page has stopped with its sign-in box up
  await tabB.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent) || !document.getElementById('cp-gate').classList.contains('hidden'), null, { timeout: 15000 });
  await sleep(1000);
  const fB2 = await facts(tabB);
  const usedB = [...new Set(calls.slice(n).filter((c) => c.auth && c.key !== 'GET /user').map((c) => c.auth))];
  console.log('      tab B after the follow:', JSON.stringify({ who: fB1.who, msg: fB1.msg, app: fB1.app }), '| after Refresh:', JSON.stringify({ who: fB2.who, msg: fB2.msg, gate: fB2.gate }), '| its calls with:', usedB.join(','), '| follow failed as armed:', !fail.armed);
  assert.ok(!fail.armed, 'the follow\'s /user call was not made');
  assert.ok(!(usedB.includes('Bearer github_pat_OTHER') && !/other-person/.test(fB2.who)), 'tab B acts with other-person\'s token and names: ' + fB2.who);
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
