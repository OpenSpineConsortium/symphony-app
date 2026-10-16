// R1: `ended` is read only at the top of ensureToken. A call that is already waiting on this tab's
// renewal when GitHub refuses this tab's own sign-in (401 on a parallel call) is released by the
// renewal's end, which reads the record from whatever storage holds one now: with this tab's
// sessionStorage dropped, that is the sign-in the browser keeps for its other tabs.
// BASEVERSION=1 runs the same against 5caf463.
import assert from 'node:assert/strict';
import { launch, close, open, check, results, configured, configuredBase, repoRoutes, rec, HOUR, sleep, appShown, loaded, repoList, facts, t } from './lib.mjs';

import { scriptUnderTest } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
await launch();

const pair = (a, r) => ({ access_token: a, token_type: 'bearer', expires_in: 28800, refresh_token: r, refresh_token_expires_in: 15897600 });

for (const v of [
  { name: 'the renewal answers with a new token', refresh: { status: 200, delay: 2500, body: pair('ghu_TAB2', 'ghr_T2') } },
  { name: 'the renewal is refused too (SymphonyBoard was revoked at GitHub)', refresh: { status: 400, delay: 2500, body: { error: 'bad_refresh_token', error_description: 'The refresh token passed is incorrect or expired.' } } },
]) {
  await check('R1: a call waiting on this tab\'s renewal when GitHub refuses this tab\'s sign-in sends nothing with the sign-in the browser keeps for other tabs (' + v.name + ')', async () => {
    let refuse = false;
    const routes = repoRoutes('acme/demo');
    for (const k of Object.keys(routes)) {
      const r = routes[k];
      routes[k] = async (req) => {
        const a = req.headers()['authorization'];
        if (a === 'Bearer ghu_OTHER') return k === 'GET /user' ? { login: 'other-person' } : r;
        // one call of this tab, out before the token's last minute, is refused (the person revoked
        // SymphonyBoard at github.com/settings/apps/authorizations), and its answer is slow
        if (refuse && k === 'GET /repos/acme/demo/pulls') {
          refuse = false;
          await sleep(1200);
          return { status: 401, body: { message: 'Bad credentials' } };
        }
        return r;
      };
    }
    const serviceFn = (path) => (path === '/refresh' ? v.refresh : null);
    const { context, page, calls, service, errors } = await open({ script: SCRIPT, routes, serviceFn, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_repos: repoList } } });
    // Sign in with GitHub, Keep me signed in unticked: a sign-in for this tab alone
    await page.click('#cp-signin');
    await appShown(page);
    await loaded(page);
    // another tab of this browser keeps another account's sign-in (written here, so no storage event here)
    await page.evaluate((r) => localStorage.setItem('symphony_panel_oauth', r), rec('ghu_OTHER', 'ghr_O', 2 * HOUR));
    // a load is under way; its pull requests' call is out when SymphonyBoard is revoked
    refuse = true;
    const n = calls.length;
    await page.click('#cp-refresh');
    for (let i = 0; i < 100 && !calls.slice(n).some((c) => c.key === 'GET /repos/acme/demo/pulls'); i++) await sleep(20);
    // the token reaches its last minute, and the next press renews it
    await page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
    const m = calls.length;
    await page.click('#cp-refresh');
    await sleep(4500);
    const f = await facts(page);
    const other = calls.filter((c) => c.auth === 'Bearer ghu_OTHER').map((c) => c.key + ' @' + c.at);
    const timeline = [...calls.slice(m).map((c) => c.at + ' ' + c.key + ' ' + c.auth), ...service.map((s) => s.at + ' service ' + s.path + ' ' + JSON.stringify(s.body) + ' -> ' + (s.answer || '') + ' @' + s.answeredAt)].sort((a, b) => parseInt(a) - parseInt(b));
    console.log('      timeline:\n        ' + timeline.join('\n        '));
    console.log('      page:', JSON.stringify({ app: f.app, gate: f.gate, msg: f.msg, who: f.who, msgs: f.msgs.slice(-4) }));
    console.log('      calls with the other account\'s token:', JSON.stringify(other));
    assert.deepEqual(other, [], 'a call went out with the sign-in the browser keeps for its other tabs');
    assert.ok(f.gate && !f.app, 'the tab is not signed out');
    assert.match(f.local || '', /ghu_OTHER/, 'the sign-in the other tabs use was dropped');
    assert.deepEqual(errors, []);
    await context.close();
  });
}


await check('R1c: a task queued in the token\'s last minute, while a parallel call is refused, is not opened as the account the browser keeps for other tabs', async () => {
  let refuse = false;
  const routes = repoRoutes('acme/demo');
  routes['POST /repos/acme/demo/issues'] = (req) => ({ number: 7, labels: [{ name: 'todo' }], by: req.headers()['authorization'] });
  for (const k of Object.keys(routes)) {
    const r = routes[k];
    routes[k] = async (req) => {
      if (refuse && k === 'GET /repos/acme/demo/pulls') { refuse = false; await sleep(1200); return { status: 401, body: { message: 'Bad credentials' } }; }
      return typeof r === 'function' ? r(req) : r;
    };
  }
  const serviceFn = (path) => (path === '/refresh' ? { status: 400, delay: 2500, body: { error: 'bad_refresh_token' } } : null);
  const { context, page, calls, errors } = await open({ script: SCRIPT, routes, serviceFn, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_repos: repoList } } });
  await page.click('#cp-signin');
  await appShown(page);
  await loaded(page);
  await page.evaluate((r) => localStorage.setItem('symphony_panel_oauth', r), rec('ghu_OTHER', 'ghr_O', 2 * HOUR));
  await page.fill('#cp-task-title', 'Fix the footer');
  await page.fill('#cp-task-goal', 'The footer links work.');
  await page.fill('#cp-task-acceptance', 'Every footer link answers 200.');
  refuse = true;
  const n = calls.length;
  await page.click('#cp-refresh');
  for (let i = 0; i < 100 && !calls.slice(n).some((c) => c.key === 'GET /repos/acme/demo/pulls'); i++) await sleep(20);
  await page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  await page.evaluate(() => document.getElementById('cp-task-queue').click());
  await sleep(4500);
  const f = await facts(page);
  const posts = calls.filter((c) => c.key === 'POST /repos/acme/demo/issues').map((c) => c.auth);
  console.log('      task opened with:', JSON.stringify(posts), '| page:', JSON.stringify({ gate: f.gate, msg: f.msg, msgs: f.msgs }));
  assert.deepEqual(posts.filter((a) => a === 'Bearer ghu_OTHER'), [], 'the task was opened as the account the browser keeps for other tabs');
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
