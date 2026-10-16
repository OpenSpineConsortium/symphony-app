// R3: followToken runs on a page whose sign-in box is up (its pasted token was refused), asks GitHub
// about the token another tab kept, and says "Now signed in as ..." while the page asks the person to
// sign in. R4: a paste GitHub never answers leaves "Open the panel" disabled for good.
// R5: storage that throws: a pasted token still opens both pages (a regression check, expected PASS).
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, real, configured, baseScript, configuredBase, repoRoutes, rec, HOUR, sleep, appShown, loaded, repoList, facts, t } from './lib.mjs';

import { scriptUnderTest } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
await launch();

await check('R3: a tab whose pasted token GitHub refused, its box up, says nothing of being signed in when another tab keeps another account\'s token', async () => {
  const dead = new Set();
  const routes = repoRoutes('acme/demo');
  for (const k of Object.keys(routes)) {
    const r = routes[k];
    routes[k] = (req) => {
      const a = req.headers()['authorization'];
      if (dead.has(a)) return { status: 401, body: { message: 'Bad credentials' } };
      if (k === 'GET /user') return { login: a === 'Bearer github_pat_B' ? 'other-person' : 'tester' };
      return r;
    };
  }
  const { context, page, calls, errors } = await open({ script: SCRIPT, routes, noLoad: true, storage: { local: { symphony_panel_token: 'github_pat_A', symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([loaded(page), loaded(page2)]);
  // the fine-grained token kept on the browser runs out; both tabs find it refused
  dead.add('Bearer github_pat_A');
  await page.click('#cp-refresh');
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  await page2.click('#cp-refresh');
  await page2.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  const before = (await facts(page)).msg;
  // in tab 2 the person pastes a token of another account, to keep
  if (!(await page2.isVisible('#cp-token'))) await page2.click('#cp-token-way > summary');
  await page2.check('#cp-keep');
  await page2.fill('#cp-token', 'github_pat_B');
  await page2.click('#cp-open');
  await appShown(page2);
  await sleep(1500);
  const f1 = await facts(page);
  console.log('      tab 1 before:', JSON.stringify(before));
  console.log('      tab 1 after: ', JSON.stringify({ gate: f1.gate, app: f1.app, msg: f1.msg, who: f1.who }));
  assert.ok(f1.gate && !f1.app);
  assert.ok(!/^Now signed in as/.test(f1.msg), 'tab 1 says it is signed in while its sign-in box asks for a sign-in: ' + f1.msg);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('R4: a paste GitHub never answers about leaves Open the panel pressable again in time', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /user'] = () => new Promise(() => { /* GitHub never answers */ });
  const { context, page, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/', storage: { local: { symphony_panel_repos: repoList } } });
  if (!(await page.isVisible('#cp-token'))) await page.click('#cp-token-way > summary');
  await page.fill('#cp-token', 'github_pat_X');
  await page.click('#cp-open');
  await sleep(1000);
  const s1 = await page.evaluate(() => ({ disabled: document.getElementById('cp-open').disabled, msg: document.getElementById('msg').textContent }));
  // the person gives up on that one and pastes a corrected token, pressing Enter
  await page.fill('#cp-token', 'github_pat_Y');
  await page.press('#cp-token', 'Enter');
  await sleep(45000);
  const s2 = await page.evaluate(() => ({ disabled: document.getElementById('cp-open').disabled, msg: document.getElementById('msg').textContent, gate: !document.getElementById('cp-gate').classList.contains('hidden') }));
  console.log('      after 1 s:', JSON.stringify(s1), '| after 46 s:', JSON.stringify(s2));
  assert.equal(s2.disabled, false, 'Open the panel is still disabled ' + 46 + ' s later, with "' + s2.msg + '"');
  await context.close();
});

const throwingStorage = () => {
  if (location.search.indexOf('nostorage') < 0) return;
  const deny = () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); };
  Object.defineProperty(window, 'localStorage', { get: deny, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { get: deny, configurable: true });
};
for (const where of ['/symphony/control/?nostorage=1&repo=acme/demo', '/symphony/cost.html?nostorage=1']) {
  await check('R5: in a browser whose storage throws, a pasted token opens the page and every call carries it (' + where.split('?')[0] + ')', async () => {
    const routes = repoRoutes('acme/demo');
    routes['GET /repos/acme/demo/contents/METRICS.json'] = { raw: JSON.stringify({ sharing: 'on', generated_at: new Date().toISOString(), window_days: 30, economics: { pull_requests: 1, merged: 1, estimated_usd: 2, sessions: 1, actions_runs: 1 } }) };
    const { context, page, calls, errors } = await open({ script: SCRIPT, routes, initScript: throwingStorage, path: where });
    const denied = await page.evaluate(() => { try { localStorage.length; return false; } catch (e) { return true; } });
    assert.ok(denied, 'the storage did not throw');
    if (!(await page.isVisible('#cp-token'))) await page.click('#cp-token-way > summary');
    await page.fill('#cp-token', 'github_pat_X');
    await page.click('#cp-open');
    await appShown(page);
    await sleep(1500);
    const f = await page.evaluate(() => ({ who: document.getElementById('cp-who').textContent, msg: document.getElementById('msg').textContent, summary: (document.getElementById('cp-summary') || document.getElementById('cost-measured') || {}).textContent }));
    const auths = [...new Set(calls.filter((c) => c.auth).map((c) => c.auth))];
    console.log('      ', JSON.stringify(f).slice(0, 300), '| calls with:', auths.join(','));
    assert.deepEqual(auths, ['Bearer github_pat_X']);
    assert.match(f.who, /^Signed in as tester with a token/);
    assert.deepEqual(errors.filter((e) => !/SecurityError|Access is denied/.test(e)), []);
    await context.close();
  });
}

await close();
console.log('\n' + results.join('\n'));
