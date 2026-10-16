// S5: in a browser with no Web Locks, a kept sign-in GitHub refuses (SymphonyBoard revoked at
// github.com/settings/apps/authorizations) is now judged only after refused()'s 22-second look for
// another tab's renewal, though no renewal is under way anywhere. Configured only.
// S6: a token kept on the browser that no request can carry: the box says to paste the token again;
// a paste for this tab (the box's default) leaves the dead one kept, and every new tab meets it.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, appShown, loaded, repoList, facts, t, noLocks } from './lib.mjs';
import { scriptUnderTest, version } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
console.log('script:', version);
await launch();

function refusing(dead) {
  const routes = repoRoutes('acme/demo');
  for (const k of Object.keys(routes)) {
    const r = routes[k];
    routes[k] = (req) => (dead.has(req.headers()['authorization']) ? { status: 401, body: { message: 'Bad credentials' } } : r);
  }
  return routes;
}

if (!UNCONFIGURED) await check('S5: in a browser with no lock, a kept sign-in GitHub refuses mid-session brings the box back within 5 s, as with a lock', async () => {
  const dead = new Set();
  const { context, page, calls, service, errors } = await open({ script: SCRIPT, routes: refusing(dead), initScript: noLocks, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
  await loaded(page);
  dead.add('Bearer ghu_KEPT');
  const at = Date.now();
  await page.click('#cp-refresh');
  await page.waitForSelector('#cp-gate:not(.hidden)', { timeout: 40000 });
  const took = Date.now() - at;
  const f = await facts(page);
  console.log('      box back after', took, 'ms with:', JSON.stringify(f.msg), '| renewals asked:', service.filter((s) => s.path === '/refresh').length);
  assert.ok(took < 5000, 'the page read for ' + took + ' ms before it said GitHub refused the sign-in');
  assert.deepEqual(errors, []);
  await context.close();
});

if (!UNCONFIGURED) await check('S5b: in a browser with no lock, a kept sign-in GitHub refuses at load says why within 5 s', async () => {
  const dead = new Set(['Bearer ghu_KEPT']);
  const { context, page, errors } = await open({ script: SCRIPT, routes: refusing(dead), initScript: noLocks, noLoad: true, storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
  const at = Date.now();
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  const samples = [];
  for (let i = 0; i < 60; i++) { const m = await page.textContent('#msg'); samples.push(m); if (m) break; await sleep(500); }
  const took = Date.now() - at;
  console.log('      the box stood with no words for', took, 'ms, then:', JSON.stringify(samples[samples.length - 1]));
  assert.ok(took < 5000, 'the sign-in box stood ' + took + ' ms with no words');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('S6: after the box asks to paste the token again for a token no request can carry, the paste leaves no dead token for the next tab', async () => {
  const { context, page, errors } = await open({ script: SCRIPT, path: '/symphony/control/?repo=acme/demo', storage: { local: { symphony_panel_token: 'github_pat_ABC\u200b', symphony_panel_repos: repoList } } });
  await page.waitForFunction(() => /no request can carry it/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  const said = await page.textContent('#msg');
  // the person does what the box says: pastes the token again, copied afresh (Keep me signed in is as the box leaves it)
  const keepTicked = await page.isChecked('#cp-keep');
  await page.fill('#cp-token', 'github_pat_ABC');
  await page.click('#cp-open');
  await loaded(page);
  // later, the panel in a new tab of the same browser
  const tab2 = await context.newPage();
  tab2.on('pageerror', (e) => errors.push(String(e)));
  await tab2.goto(BASE + '/symphony/control/?repo=acme/demo');
  await sleep(2500);
  const f2 = await facts(tab2);
  console.log('      the box said:', JSON.stringify(said), '| Keep ticked:', keepTicked);
  console.log('      the new tab:', JSON.stringify({ app: f2.app, gate: f2.gate, msg: f2.msg, kept: f2.lToken }));
  assert.ok(!/no request can carry it/.test(f2.msg) && f2.lToken !== 'github_pat_ABC\u200b', 'the new tab meets the same dead token: ' + f2.msg);
  assert.deepEqual(errors, []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
