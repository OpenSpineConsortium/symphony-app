// R4b: the unusable token pasted with Keep ticked in one tab, over a kept sign-in another tab uses
import assert from 'node:assert/strict';
import { BASE, HOUR, configured, configuredBase, results, check, repoRoutes, launch, close, open, rec, facts, sleep, loaded, repoList } from './lib.mjs';
await launch();
for (const [label, script] of [['working tree', configured], ['base 5caf463', configuredBase]]) {
  await check('R4b (' + label + '): a kept paste no request can carry does not take the working sign-in from the other tabs', async () => {
    const { context, page, calls, service, errors } = await open({ script, noLoad: true, storage: { local: { symphony_panel_oauth: rec('ghu_KEPT', 'ghr_K', 2 * HOUR), symphony_panel_repos: repoList } } });
    const page2 = await context.newPage();
    const path = BASE + '/symphony/control/?repo=acme/demo';
    await Promise.all([page.goto(path), page2.goto(path)]);
    await Promise.all([loaded(page), loaded(page2)]);
    // tab 2 shows its token box (as after a refusal) and the person pastes a token copied with a zero-width space
    await page2.evaluate(() => { document.getElementById('cp-app').classList.add('hidden'); document.getElementById('cp-gate').classList.remove('hidden'); document.getElementById('cp-token-way').open = true; });
    await page2.check('#cp-keep');
    await page2.fill('#cp-token', 'github_pat_ABC\u200b');
    await page2.click('#cp-open');
    await sleep(1500);
    await page.click('#cp-refresh');
    await sleep(1500);
    const f1 = await facts(page), f2 = await facts(page2);
    console.log('      revoked:', service.filter((x) => x.path === '/revoke').map((x) => x.body.access_token).join(',') || 'none');
    console.log('      tab 1:', JSON.stringify({ app: f1.app, who: f1.who, msg: f1.msg.slice(0, 120) }));
    console.log('      tab 2:', JSON.stringify({ app: f2.app, gate: f2.gate, msg: f2.msg.slice(0, 120) }));
    assert.ok(!/Failed to execute 'fetch'/.test(f1.msg), 'tab 1 lost its working sign-in to the unusable token');
    await context.close();
  });
}
await close();
console.log('\n' + results.join('\n'));
