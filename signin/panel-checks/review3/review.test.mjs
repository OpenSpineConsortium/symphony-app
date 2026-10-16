// Third review of the sign-in: each check asserts what the page should do; a FAIL is a defect.
import assert from 'node:assert/strict';
import { BASE, HOUR, configured, configuredBase, real, baseScript, results, check, repoRoutes, launch, close, open, rec, singleUse, facts, sleep, appShown, loaded, repoList, noLocks, t } from './lib.mjs';

await launch();
const SCRIPT = process.env.BASEVERSION ? configuredBase : configured;
const PLAIN = process.env.BASEVERSION ? baseScript : real;
console.log('script under test:', process.env.BASEVERSION ? '5caf463 (base)' : 'working tree');

// R1: another tab forgets the token while this tab is still asking GitHub who it is
for (const where of ['/symphony/control/', '/symphony/cost.html']) {
  await check('R1' + (where.includes('cost') ? 'b' : 'a') + ': Forget in another tab while this tab\'s first /user is in flight leaves this tab signed out (' + where + ')', async () => {
    let slow = false;
    const routes = repoRoutes('acme/demo');
    routes['GET /user'] = async () => { if (slow) await sleep(1500); return { login: 'tester' }; };
    const { context, page, calls, service, errors } = await open({ script: SCRIPT, routes, path: where, storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR) } } });
    await appShown(page);
    slow = true;
    const page2 = await context.newPage();
    page2.on('pageerror', (e) => errors.push(String(e)));
    page2.goto(BASE + where);
    await page2.waitForFunction(() => !!document.getElementById('msg'));
    await sleep(500);
    const forgotAt = t();
    await page.click('#cp-signout');
    await sleep(2500);
    const f2 = await facts(page2);
    const n = calls.length;
    console.log('      forgot at', forgotAt, '| tab 2:', JSON.stringify({ app: f2.app, gate: f2.gate, who: f2.who, msg: f2.msg }));
    console.log('      tab 2 messages:', JSON.stringify(f2.msgs));
    console.log('      revoked:', service.filter((x) => x.path === '/revoke').map((x) => x.body.access_token).join(','));
    assert.deepEqual(errors, []);
    assert.ok(f2.gate && !f2.app, 'tab 2 shows the panel as signed in after the token was forgotten');
    assert.ok(!/^Signed in as/.test(f2.who), 'tab 2 says "' + f2.who + '"');
    await context.close();
  });
}

// R2: a tab waiting for another tab's renewal sends the refresh token after Forget
await check('R2: Forget the token while this tab waits its turn to renew sends no refresh token afterwards and keeps Forget\'s words', async () => {
  const { context, page, calls, service, errors } = await open({ script: SCRIPT, noLoad: true, serviceFn: singleUse(2000, 0), storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', 2 * HOUR), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([appShown(page), appShown(page2)]);
  await Promise.all([loaded(page), loaded(page2)]);
  // eight hours pass with both tabs open
  await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; localStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  await sleep(400);
  await page.click('#cp-refresh');
  await sleep(300);
  await page2.click('#cp-refresh');
  await sleep(300);
  const forgotAt = t();
  await page2.click('#cp-signout');
  await sleep(4000);
  const f1 = await facts(page), f2 = await facts(page2);
  const rf = service.filter((x) => x.path === '/refresh');
  console.log('      forgot (tab 2) at', forgotAt);
  for (const x of service) console.log('      service', x.path, JSON.stringify(x.body), 'at', x.at, '->', x.answer);
  console.log('      tab 1 messages:', JSON.stringify(f1.msgs));
  console.log('      tab 2 messages:', JSON.stringify(f2.msgs));
  assert.ok(f2.gate && f1.gate, 'a tab stayed signed in');
  const after = rf.filter((x) => x.at > forgotAt);
  assert.equal(after.length, 0, 'a refresh token went to the service after Forget: ' + after.map((x) => x.body.refresh_token + ' at ' + x.at).join(', '));
  assert.ok(/forgotten here/.test(f2.msg), 'tab 2\'s last word is "' + f2.msg + '"');
  assert.deepEqual(errors, []);
  await context.close();
});

// R2b: the same with the first renewal failing before GitHub: the waiting tab renews after Forget
await check('R2b: same, the first renewal failing (502 github_unreachable): nothing is renewed after Forget', async () => {
  let first = true;
  const serviceFn = (path) => {
    if (path !== '/refresh') return null;
    if (first) { first = false; return { status: 502, delay: 2000, body: { error: 'github_unreachable' } }; }
    return { status: 200, body: { access_token: 'ghu_AFTER', token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_AFTER', refresh_token_expires_in: 15897600 } };
  };
  const { context, page, service, errors } = await open({ script: SCRIPT, noLoad: true, serviceFn, storage: { local: { symphony_panel_oauth: rec('ghu_OLD', 'ghr_R', 2 * HOUR), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([loaded(page), loaded(page2)]);
  await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; localStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  await sleep(400);
  await page.click('#cp-refresh');
  await sleep(300);
  await page2.click('#cp-refresh');
  await sleep(300);
  const forgotAt = t();
  await page2.click('#cp-signout');
  await sleep(4000);
  const f2 = await facts(page2);
  console.log('      forgot (tab 2) at', forgotAt);
  for (const x of service) console.log('      service', x.path, JSON.stringify(x.body), 'at', x.at, '->', x.answer);
  console.log('      tab 2 messages:', JSON.stringify(f2.msgs));
  const after = service.filter((x) => x.path === '/refresh' && x.at > forgotAt);
  assert.equal(after.length, 0, 'the sign-in was renewed after Forget: ' + after.map((x) => x.body.refresh_token + ' -> ' + x.answer).join(', '));
  assert.deepEqual(errors, []);
  await context.close();
});

// R3: a kept sign-in GitHub refuses in one tab is reported in the others as forgotten by a person
await check('R3: a kept sign-in dropped because GitHub refused it is not reported in another tab as forgotten there', async () => {
  let dead = false;
  const routes = repoRoutes('acme/demo');
  for (const k of Object.keys(routes)) {
    const v = routes[k];
    routes[k] = (req) => (dead && req.headers()['authorization'] === 'Bearer ghu_KEPT' ? { status: 401, body: { message: 'Bad credentials' } } : v);
  }
  const { context, page, errors } = await open({ script: SCRIPT, noLoad: true, routes, storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  const path = BASE + '/symphony/control/?repo=acme/demo';
  await Promise.all([page.goto(path), page2.goto(path)]);
  await Promise.all([loaded(page), loaded(page2)]);
  // the person revokes SymphonyBoard at github.com/settings/apps/authorizations
  dead = true;
  await page.click('#cp-refresh');
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 5000 });
  await sleep(1000);
  const f1 = await facts(page), f2 = await facts(page2);
  console.log('      tab 1:', f1.msg);
  console.log('      tab 2:', f2.msg, '| gate:', f2.gate);
  assert.ok(f2.gate, 'tab 2 stayed signed in with a dead token');
  assert.ok(!/forgotten in another tab/.test(f2.msg), 'tab 2 says the token was forgotten in another tab, though GitHub refused it');
  assert.deepEqual(errors, []);
  await context.close();
});

// R4: a token fetch cannot send opens the panel and is kept
await check('R4: a pasted token with a character no token has (a zero-width space) keeps the sign-in box', async () => {
  const { context, page, calls, errors } = await open({ script: PLAIN, path: '/symphony/control/', storage: { local: { symphony_panel_repos: repoList } } });
  await page.check('#cp-keep');
  await page.fill('#cp-token', 'github_pat_ABC\u200b');
  await page.click('#cp-open');
  await sleep(1500);
  const f = await facts(page);
  console.log('      ', JSON.stringify({ app: f.app, gate: f.gate, who: f.who, lToken: f.lToken && JSON.stringify(f.lToken), summary: f.summary }));
  console.log('       messages:', JSON.stringify(f.msgs));
  console.log('       GitHub calls made:', calls.length);
  assert.ok(f.gate && !f.app, 'the panel opened with a token that can never be sent');
  assert.equal(f.lToken, null, 'the unusable token was kept on the browser');
  await context.close();
});

// R5: a tab-only sign-in that runs out mid-load goes on with the browser's kept sign-in
await check('R5: a tab-only sign-in that runs out mid-load sends no other token while the box says to sign in again', async () => {
  const routes = repoRoutes('acme/demo');
  routes['GET /repos/acme/demo'] = async () => { await sleep(3500); return { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } }; };
  const tabOnly = JSON.stringify({ access_token: 'ghu_TAB', refresh_token: '', expires_at: Date.now() + 4000, refresh_expires_at: Date.now() + 100 * 24 * HOUR });
  const { context, page, calls, errors } = await open({ script: SCRIPT, routes, path: '/symphony/control/?repo=acme/demo', storage: { session: { symphony_panel_oauth: tabOnly }, local: { symphony_panel_oauth: rec('ghu_OTHER_ACCOUNT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
  await page.waitForFunction(() => /ran out after its eight hours/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  await sleep(1500);
  const f = await facts(page);
  const other = calls.filter((c) => c.auth === 'Bearer ghu_OTHER_ACCOUNT').map((c) => c.key);
  console.log('      calls with the kept token after the tab\'s ran out:', JSON.stringify(other));
  console.log('      gate:', f.gate, '| msg:', f.msg);
  assert.equal(other.length, 0, 'the page went on with the browser\'s kept sign-in while the box asked for a new sign-in');
  assert.deepEqual(errors, []);
  await context.close();
});

// R6: in a browser with no lock, a tab-only sign-in GitHub will not renew waits 22 s for a tab that cannot exist
await check('R6: no lock, a tab-only sign-in GitHub refuses to renew is signed out within a few seconds', async () => {
  const chain = { ghr_R2: true };
  const serviceFn = (path, body) => (path === '/refresh' ? { status: 400, body: { error: 'bad_refresh_token' } } : null);
  const { context, page, service, errors } = await open({ script: SCRIPT, initScript: noLocks, serviceFn, path: '/symphony/control/?repo=acme/demo' });
  await page.click('#cp-signin');
  await appShown(page);
  await loaded(page);
  await page.evaluate(() => { const o = JSON.parse(sessionStorage.getItem('symphony_panel_oauth')); o.expires_at = Date.now() - 1000; sessionStorage.setItem('symphony_panel_oauth', JSON.stringify(o)); });
  const at = Date.now();
  await page.click('#cp-refresh');
  await page.waitForFunction(() => /expired or was revoked/.test(document.getElementById('msg').textContent), null, { timeout: 40000 });
  const took = Date.now() - at;
  console.log('      signed out after', took, 'ms; refresh calls:', service.filter((x) => x.path === '/refresh').length);
  assert.ok(took < 5000, 'the tab-only sign-in waited ' + took + ' ms for another tab\'s renewal no other tab can make');
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
