// S4: a token pasted in the sign-in box while the page is still asking GitHub about the stored
// sign-in, where GitHub answers about the stored one first. The panel opens as the stored account;
// then the paste's check comes back and storeSignin() clears shownLogin and shownToken, which turns
// the one rule off (a call needs naming only when shownToken is set or the call writes for a named
// account), while the panel stays open and cp-who still names the stored account.
// BASEVERSION=1 runs the same against 0b9600b; UNCONFIGURED=1 is the site as deployed today.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, rec, HOUR, sleep, appShown, loaded, repoList, facts, t } from './lib.mjs';
import { scriptUnderTest, version } from './pick.mjs';
const SCRIPT = scriptUnderTest();
const UNCONFIGURED = !!process.env.UNCONFIGURED;
console.log('script:', version);
await launch();

// every change of cp-who, with the page's clock, so the name shown at any moment is known
const whoRecorder = () => {
  window.__who = [];
  const start = () => new MutationObserver(() => { const w = document.getElementById('cp-who'); const tx = w ? w.textContent : ''; if (!window.__who.length || window.__who[window.__who.length - 1].text !== tx) window.__who.push({ at: Math.round(performance.now()), text: tx }); }).observe(document, { subtree: true, childList: true, characterData: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
};

for (const v of [
  { name: 'GitHub then names the pasted token', second: { delay: 2500 } },
  { name: 'GitHub cannot say whose the pasted token is the second time (502)', second: { delay: 300, status: 502 } },
]) {
  await check('S4: a token pasted while the stored sign-in is still being checked sends nothing, a write least of all, while the page names the stored account (' + v.name + ')', async () => {
    const KEPT = UNCONFIGURED ? 'github_pat_TESTER' : 'ghu_KEPT';
    const routes = repoRoutes('acme/demo');
    let otherAsked = 0;
    routes['GET /user'] = async (req) => {
      const a = req.headers()['authorization'];
      if (a === 'Bearer ' + KEPT) { await sleep(1500); return { login: 'tester' }; }
      if (a === 'Bearer github_pat_OTHER') {
        otherAsked++;
        // the paste's check is slower than the stored sign-in's question
        if (otherAsked === 1) { await sleep(2000); return { login: 'other-person' }; }
        if (otherAsked === 2) { await sleep(v.second.delay); if (v.second.status) return { status: v.second.status, body: { message: 'Server Error' } }; return { login: 'other-person' }; }
        return { login: 'other-person' };
      }
      return { status: 401, body: { message: 'Bad credentials' } };
    };
    // the stored sign-in's load is still under way when the paste is kept
    const workers = routes['GET /repos/acme/demo/contents/.github/symphony/workers'];
    routes['GET /repos/acme/demo/contents/.github/symphony/workers'] = async () => { await sleep(1200); return workers; };
    routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = null;
    const stored = UNCONFIGURED ? { symphony_panel_token: KEPT } : { symphony_panel_oauth: rec(KEPT, 'ghr_K', 2 * HOUR) };
    const { context, page, calls, errors } = await open({ script: SCRIPT, routes, noLoad: true, initScript: whoRecorder, storage: { local: Object.assign({ symphony_panel_repos: repoList }, stored) } });
    const t0 = t();
    await page.goto(BASE + '/symphony/control/?repo=acme/demo');
    await page.waitForSelector('#cp-gate:not(.hidden)');
    // the box stands while the stored sign-in is checked: the person pastes another token, for this tab
    const pastedAt = await page.evaluate(() => { document.getElementById('cp-token-way').open = true; document.getElementById('cp-token').value = 'github_pat_OTHER'; document.getElementById('cp-keep').checked = false; document.getElementById('cp-open').click(); return Math.round(performance.now()); });
    console.log('      pasted and pressed at page time', pastedAt);
    await appShown(page);
    // the paste's check comes back: the token is kept for this tab
    for (let i = 0; i < 400; i++) { if (await page.evaluate(() => sessionStorage.getItem('symphony_panel_token') === 'github_pat_OTHER')) break; await sleep(10); }
    const namedAtPress = await page.evaluate(() => document.getElementById('cp-who').textContent);
    const pressAt = t();
    // the person presses "Run the workers now": one press, a write, if the panel lets them
    const pressable = await page.isVisible('#cp-run-workers');
    console.log('      "Run the workers now" pressable once the paste was kept:', pressable);
    if (pressable) await page.evaluate(() => document.getElementById('cp-run-workers').click());
    await sleep(v.second.status ? 3000 : 4500);
    // and Refresh once more
    const n = calls.length;
    if (v.second.status) { await page.evaluate(() => document.getElementById('cp-refresh').click()); await sleep(1500); }
    const f = await facts(page);
    const who = await page.evaluate(() => window.__who || []);
    const withOther = calls.filter((c) => c.auth === 'Bearer github_pat_OTHER' && c.key !== 'GET /user').map((c) => (c.at - t0) + ' ' + c.key);
    const dispatches = calls.filter((c) => c.key.startsWith('POST ')).map((c) => (c.at - t0) + ' ' + c.key + ' ' + c.auth);
    console.log('      cp-who over time:', JSON.stringify(who.map((w) => w.at + ' ' + w.text)));
    console.log('      named when the person pressed (@' + (pressAt - t0) + '):', JSON.stringify(namedAtPress));
    console.log('      writes:', JSON.stringify(dispatches));
    console.log('      calls with the pasted token other than GET /user:', JSON.stringify(withOther));
    console.log('      at the end:', JSON.stringify({ who: f.who, msg: f.msg, msgs: f.msgs, refreshCalls: calls.slice(n).map((c) => c.key + ' ' + c.auth) }));
    assert.ok(!(/tester/.test(namedAtPress) && dispatches.some((d) => /github_pat_OTHER/.test(d))), 'the write went out as the pasted token\'s account while the page named "' + namedAtPress + '"');
    assert.ok(!/tester/.test(f.who) || !calls.slice(n).some((c) => c.auth === 'Bearer github_pat_OTHER' && c.key !== 'GET /user'), 'the page still names tester while its calls carry the pasted token');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

await close();
console.log('\n' + results.join('\n'));
