// R6: gh() makes a call GitHub refused (401) again with whatever token storage holds now, a write
// included, before the page has asked GitHub whose that token is.
// R7: a token already stored with a character no request can carry (an earlier version's paste)
// opens the panel, where 5caf463 kept the sign-in box.
// R8: "The token is forgotten on this browser." while another tab's own token for that tab still works.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, appShown, loaded, repoList, facts, t } from './lib.mjs';
import { scriptUnderTest } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
await launch();

const now = new Date().toISOString();
function withPull(routes) {
  routes['GET /repos/acme/demo/pulls'] = [{ number: 5, title: 'Fix the footer', html_url: 'https://github.com/acme/demo/pull/5', head: { ref: 'claude/5', sha: 'abc123' }, base: { ref: 'main' }, draft: false, updated_at: now }];
  routes['GET /repos/acme/demo/commits/abc123/check-runs'] = { total_count: 1, check_runs: [{ name: 'check', status: 'completed', conclusion: 'success' }] };
  return routes;
}

await check('R6: a merge GitHub refuses (401) because another tab kept another account\'s token meanwhile is not made again as that account unasked', async () => {
  const flags = { pasted: false, mergeSentAt: 0 };
  const routes = withPull(repoRoutes('acme/demo'));
  for (const k of Object.keys(routes)) {
    const r = routes[k];
    routes[k] = (req) => (k === 'GET /user' ? { login: req.headers()['authorization'] === 'Bearer github_pat_OTHER' ? 'other-person' : 'tester' } : r);
  }
  routes['PUT /repos/acme/demo/pulls/5/merge'] = async (req) => {
    const a = req.headers()['authorization'];
    if (a === 'Bearer github_pat_OTHER') return { merged: true, sha: 'def456', message: 'Pull Request successfully merged' };
    // the merge reaches GitHub just after tab 2's sign-in revoked this token
    for (let i = 0; i < 200 && !flags.pasted; i++) await sleep(20);
    await sleep(30);
    return { status: 401, body: { message: 'Bad credentials' } };
  };
  const kept = UNCONFIGURED ? { symphony_panel_token: 'github_pat_TESTER' } : { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR) };
  const sessionA = UNCONFIGURED ? { symphony_panel_token: 'github_pat_DEAD' } : { symphony_panel_oauth: rec('ghu_TABDEAD', '', 2 * HOUR) };
  const dead = routes['GET /user'];
  routes['GET /user'] = (req) => (/DEAD/.test(req.headers()['authorization']) ? { status: 401, body: { message: 'Bad credentials' } } : dead(req));
  // tab 2: its own sign-in for the tab is refused, so its box is up; tab 1: open on the kept sign-in
  const { context, page: tab2, calls, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { local: Object.assign({ symphony_panel_repos: repoList }, kept), session: sessionA } });
  await tab2.waitForFunction(() => /401/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const tab1 = await context.newPage();
  tab1.on('pageerror', (e) => errors.push(String(e)));
  await tab1.goto(BASE + '/symphony/control/?repo=acme/demo');
  await loaded(tab1);
  await tab1.waitForFunction(() => /passed/.test(document.querySelector('#cp-pulls tbody').textContent), null, { timeout: 5000 });
  const merge = tab1.locator('#cp-pulls button', { hasText: 'Merge' });
  await merge.click();
  await tab1.locator('#cp-pulls button', { hasText: 'Confirm: merge #5' }).click();
  // in tab 2 the person keeps another account's token
  if (!(await tab2.isVisible('#cp-token'))) await tab2.click('#cp-token-way > summary');
  await tab2.check('#cp-keep');
  await tab2.fill('#cp-token', 'github_pat_OTHER');
  await tab2.click('#cp-open');
  for (let i = 0; i < 200; i++) { if (await tab2.evaluate(() => localStorage.getItem('symphony_panel_token') === 'github_pat_OTHER')) break; await sleep(10); }
  flags.pasted = true;
  const whoAt = [];
  for (let i = 0; i < 30; i++) { whoAt.push(await tab1.evaluate(() => document.getElementById('cp-who').textContent)); await sleep(50); }
  await sleep(800);
  const merges = calls.filter((c) => c.key === 'PUT /repos/acme/demo/pulls/5/merge').map((c) => c.auth + ' @' + c.at);
  const f1 = await facts(tab1);
  console.log('      merges:', JSON.stringify(merges));
  console.log('      tab 1 named, every 50 ms after the paste:', JSON.stringify([...new Set(whoAt)]));
  console.log('      tab 1 messages:', JSON.stringify(f1.msgs));
  assert.deepEqual(calls.filter((c) => c.key === 'PUT /repos/acme/demo/pulls/5/merge' && c.auth === 'Bearer github_pat_OTHER').length, 0, 'the merge was made again as the other account');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('R7: a stored token with a character no request can carry keeps the sign-in box, as a token that will never work', async () => {
  const { context, page, calls, errors } = await open({ script: SCRIPT, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_token: 'github_pat_ABC\u200b', symphony_panel_repos: repoList } } });
  await sleep(2500);
  const f = await facts(page);
  console.log('      ', JSON.stringify({ app: f.app, gate: f.gate, msg: f.msg, summary: f.summary.slice(0, 160) }), '| GitHub calls:', calls.length);
  assert.ok(f.gate && !f.app, 'the panel opened on a token no request can carry');
  assert.deepEqual(errors.filter((e) => !/ISO-8859-1/.test(e)), []);
  await context.close();
});

await check('R8: Forget the token says "forgotten on this browser" only when no tab of it keeps working with a token', async () => {
  const { context, page, calls, errors } = await open({ script: SCRIPT, noLoad: true, storage: { local: { symphony_panel_token: 'github_pat_KEPT', symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  // tab 2 has a token of its own, for that tab
  await page2.goto(path);
  await page2.evaluate(() => sessionStorage.setItem('symphony_panel_token', 'github_pat_TAB2'));
  await Promise.all([page.goto(path), page2.reload()]);
  await Promise.all([loaded(page), loaded(page2)]);
  await page.click('#cp-signout');
  await page.waitForSelector('#cp-gate:not(.hidden)');
  await sleep(800);
  const f1 = await facts(page);
  const n = calls.length;
  await page2.click('#cp-refresh');
  await loaded(page2);
  const used = [...new Set(calls.slice(n).filter((c) => c.auth).map((c) => c.auth))];
  console.log('      tab 1 says:', JSON.stringify(f1.msg), '| tab 2 then calls with:', used.join(','));
  assert.ok(!(/forgotten on this browser/.test(f1.msg) && used.length), 'the page says the token is forgotten on this browser while tab 2 keeps calling with ' + used.join(','));
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
