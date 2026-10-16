// Extended end-to-end probes of the control panel and the cost page against a mocked GitHub API.
// Each check states the behaviour the page promises; a FAIL demonstrates a defect.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8077';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const now = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
async function check(name, fn) {
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 3).join('\n     ')); }
}
const resp = (status, body, extra) => Object.assign({ __r: true, status, body }, extra || {});
function baseRoutes(repo) {
  return {
    'GET /user': { login: 'tester' },
    ['GET /repos/' + repo]: { full_name: repo, default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
    ['GET /repos/' + repo + '/issues']: [],
    ['GET /repos/' + repo + '/contents/STATE.md']: { encoding: 'base64', content: b64('# Board\n\nAs of commit abc on main.\n') },
    ['GET /repos/' + repo + '/branches/board']: { commit: { commit: { committer: { date: now } } } },
    ['GET /repos/' + repo + '/contents/.github/symphony/workers']: [],
    ['GET /repos/' + repo + '/actions/runs']: { workflow_runs: [] },
    ['GET /repos/' + repo + '/pulls']: [],
  };
}
const browser = await chromium.launch();
async function open(routes, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const calls = [];
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    calls.push({ key, url: req.url(), auth: req.headers()['authorization'], body: req.postData() });
    let r = routes[key];
    if (typeof r === 'function') r = r(url, req);
    const headers = { 'Access-Control-Expose-Headers': 'Link' };
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) });
    const spec = (r && r.__r) ? r : { status: 200, body: r };
    if (spec.delayMs) await sleep(spec.delayMs);
    // the page reads files as raw text since the rewrite: a base64 fixture is served decoded
    if (/raw\+json/.test(req.headers()['accept'] || '') && spec.body && spec.body.encoding === 'base64') {
      return route.fulfill({ status: spec.status, contentType: 'application/vnd.github.raw+json', headers, body: Buffer.from(spec.body.content, 'base64').toString('utf8') });
    }
    return route.fulfill({ status: spec.status, contentType: 'application/json', headers: Object.assign(headers, spec.headers || {}), body: spec.status === 204 ? '' : JSON.stringify(spec.body) });
  });
  if (opts.script) await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: opts.script }));
  if (opts.extraRoutes) for (const [pattern, handler] of opts.extraRoutes) await context.route(pattern, handler);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/symphony/control/');
  await page.evaluate((s) => { localStorage.clear(); sessionStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); }, opts.storage || {});
  await page.goto(BASE + (opts.path || '/symphony/control/?repo=acme/demo'));
  return { context, page, calls, errors };
}
async function signIn(page) {
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
}
const pr = (n, sha, draft, title) => ({ number: n, title: title || ('PR ' + n), html_url: 'https://github.com/acme/demo/pull/' + n, head: { ref: 'claude/' + n, sha: sha }, base: { ref: 'main' }, draft: !!draft, updated_at: now });

await check('A: switching repositories mid-load never shows the earlier repository\'s pull requests under the new one', async () => {
  const routes = Object.assign(baseRoutes('acme/demo'), baseRoutes('acme/beta'));
  routes['GET /repos/acme/demo/pulls'] = resp(200, [pr(7, 'abc123', false, 'Docs fix of acme/demo')], { delayMs: 2500 });
  routes['GET /repos/acme/demo/commits/abc123/check-runs'] = { check_runs: [] };
  const { context, page } = await open(routes, { storage: { symphony_panel_repos: JSON.stringify(['acme/demo', 'acme/beta']) } });
  await signIn(page);
  await page.selectOption('#cp-repo', 'acme/beta');
  await page.waitForFunction(() => /^acme\/beta, default branch/.test(document.getElementById('cp-summary').textContent));
  await sleep(3500);
  const pulls = (await page.textContent('#cp-pulls tbody')).trim();
  const summary = await page.textContent('#cp-summary');
  console.log('     repo shown:', await page.textContent('#cp-repo-name'), '| pulls table:', pulls.slice(0, 60), '| summary:', summary.replace(/.*Open pull requests/, 'Open pull requests').slice(0, 40));
  assert.ok(!/acme\/demo/.test(pulls), 'acme/demo\'s pull request is shown under acme/beta: ' + pulls.slice(0, 60) + ' / ' + summary.replace(/.*Open pull requests/, 'Open pull requests').slice(0, 40));
  await context.close();
});

await check('B: when the pull request list fails, #cp-summary still says what is known instead of "Reading..."', async () => {
  const routes = baseRoutes('acme/demo');
  routes['GET /repos/acme/demo/pulls'] = resp(500, { message: 'boom' });
  const { context, page } = await open(routes);
  await signIn(page);
  await page.waitForFunction(() => /GitHub answered 500/.test(document.getElementById('msg').textContent + document.getElementById('cp-summary').textContent));
  await sleep(1000);
  const summary = await page.textContent('#cp-summary');
  console.log('     summary after the failure:', JSON.stringify(summary));
  assert.ok(!/^Reading /.test(summary), 'summary stuck at: ' + summary);
  await context.close();
});

await check('C: more than 300 open issues are followed through Link and the count says when it is cut', async () => {
  const routes = baseRoutes('acme/demo');
  const issue = (n) => ({ number: n, title: 'Issue ' + n, html_url: 'https://github.com/acme/demo/issues/' + n, labels: [{ name: 'todo' }], updated_at: now });
  routes['GET /repos/acme/demo/issues'] = (url) => {
    const p = Number(url.searchParams.get('page') || '1');
    const items = Array.from({ length: p < 4 ? 100 : 50 }, (_, i) => issue((p - 1) * 100 + i + 1));
    const next = p < 4 ? '<https://api.github.com/repos/acme/demo/issues?state=open&per_page=100&page=' + (p + 1) + '>; rel="next", <https://api.github.com/repos/acme/demo/issues?state=open&per_page=100&page=4>; rel="last"' : '';
    return resp(200, items, next ? { headers: { Link: next } } : {});
  };
  const { context, page, calls } = await open(routes);
  await signIn(page);
  await page.waitForFunction(() => /Queue: /.test(document.getElementById('cp-summary').textContent));
  const pages = calls.filter((c) => c.key === 'GET /repos/acme/demo/issues').map((c) => new URL(c.url).searchParams.get('page') || '1');
  console.log('     issue pages fetched:', pages.join(','), '| summary:', (await page.textContent('#cp-summary')).replace(/.*Queue/, 'Queue').slice(0, 40));
  assert.ok(pages.includes('2') && pages.includes('3'), 'Link header not followed: ' + pages);
  const summary = await page.textContent('#cp-summary');
  assert.ok(/Queue: 350 /.test(summary) || /more|cut|first 300|at least/.test(summary), 'count silently capped: ' + summary.replace(/.*Queue/, 'Queue').slice(0, 40));
  await context.close();
});

await check('D: Merge stays disabled on a draft with green checks and on a ready pull request with a failed check', async () => {
  const routes = baseRoutes('acme/demo');
  routes['GET /repos/acme/demo/pulls'] = [pr(8, 'd1', true), pr(9, 'f1', false)];
  routes['GET /repos/acme/demo/commits/d1/check-runs'] = { check_runs: [{ name: 'check', status: 'completed', conclusion: 'success' }] };
  routes['GET /repos/acme/demo/commits/f1/check-runs'] = { check_runs: [{ name: 'check', status: 'completed', conclusion: 'failure' }, { name: 'qa', status: 'completed', conclusion: 'success' }] };
  const { context, page } = await open(routes);
  await signIn(page);
  await page.waitForFunction(() => /1 of 1 passed/.test(document.querySelector('#cp-pulls tbody').textContent) && /1 failed/.test(document.querySelector('#cp-pulls tbody').textContent));
  const states = await page.$$eval('#cp-pulls tbody button', (bs) => bs.map((b) => b.disabled));
  console.log('     merge buttons disabled:', states);
  assert.deepEqual(states, [true, true]);
  await context.close();
});

await check('E: a hostile board renders no live tag, attribute or javascript: link', async () => {
  const routes = baseRoutes('acme/demo');
  const board = ['# Board', '', 'As of commit abc on main.', '', '## Claims', '', '| Issue | Worker |', '| --- | --- |',
    '| [#5](https://github.com/acme/demo/issues/5) | <img src=x onerror=alert(1)> |',
    '| [x](https://evil.example/"onmouseover=alert(1)) | [y](javascript:alert(1)) |',
    '', '- <svg onload=alert(1)>', '- [z](data:text/html,<script>alert(1)</script>)', '', '<scr<!-- -->ipt>alert(1)</script>', ''].join('\n');
  routes['GET /repos/acme/demo/contents/STATE.md'] = { encoding: 'base64', content: b64(board) };
  const { context, page, errors } = await open(routes);
  await signIn(page);
  await page.waitForFunction(() => /Claims/.test(document.getElementById('cp-board').textContent));
  const live = await page.evaluate(() => {
    const b = document.getElementById('cp-board');
    const bad = b.querySelectorAll('script,img,svg,iframe,[onerror],[onmouseover],[onload]').length;
    const js = Array.from(b.querySelectorAll('a')).filter((a) => !/^https?:/.test(a.href)).length;
    const dialogs = window.__alerts || 0;
    return { bad, js, text: b.textContent.slice(0, 100) };
  });
  console.log('     live tags:', live.bad, 'non-http links:', live.js, 'page errors:', errors.length);
  assert.equal(live.bad, 0); assert.equal(live.js, 0); assert.deepEqual(errors, []);
  await context.close();
});

await check('E2: an escaped pipe in a board cell (the board writes \\|) stays in its cell', async () => {
  const routes = baseRoutes('acme/demo');
  routes['GET /repos/acme/demo/contents/STATE.md'] = { encoding: 'base64', content: b64('# Board\n\n## Claims\n\n| Issue | Title |\n| --- | --- |\n| #5 | a \\| b |\n') };
  const { context, page } = await open(routes);
  await signIn(page);
  await page.waitForFunction(() => document.querySelector('#cp-board tbody tr'));
  const cells = await page.$$eval('#cp-board tbody tr:first-child td', (tds) => tds.map((t) => t.textContent));
  console.log('     cells:', JSON.stringify(cells));
  assert.deepEqual(cells, ['#5', 'a | b']);
  await context.close();
});

await check('F: a token without Actions: read falls back to the default branch\'s check runs, in words', async () => {
  const routes = baseRoutes('acme/demo');
  routes['GET /repos/acme/demo/actions/runs'] = resp(403, { message: 'Resource not accessible by personal access token' });
  routes['GET /repos/acme/demo/commits/main/check-runs'] = { check_runs: [{ name: 'check', status: 'completed', conclusion: 'success', html_url: 'https://github.com/acme/demo/runs/1', app: { slug: 'github-actions' }, completed_at: now }] };
  const { context, page } = await open(routes);
  await signIn(page);
  await page.waitForFunction(() => /check run/.test(document.querySelector('#cp-runs tbody').textContent));
  const note = await page.textContent('#cp-runs-note');
  console.log('     note:', note.slice(0, 90));
  assert.match(note, /cannot list Actions runs \(403\)/);
  assert.match(await page.textContent('#cp-summary'), /Runs: none listed/);
  await context.close();
});

await check('G: the cost page on a private repository does not call its Actions minutes free', async () => {
  const routes = baseRoutes('acme/demo');
  routes['GET /repos/acme/demo'].private = true;
  const metrics = { schema: 'sdlc-metrics/1', sharing: 'on', generated_at: now, window_days: 30, economics: { prices_as_of: '2026-10-06', pull_requests: 3, pull_requests_measured: 2, merged: 2, sessions: 1, actions_runs: 1, tokens_input: 100, tokens_cache_write: 1000, tokens_cache_read: 10000, tokens_output: 500, tokens_total: 11600, tokens_unpriced: 0, estimated_usd: 1.5, coordinator_usd: 0.1, claude_seconds: 600, commits: 4, check_failures: 0, reverts: 0, tokens_by_family: { fable: 0, opus: 0, sonnet: 11600, haiku: 0, other: 0 } }, coordination: { alone: { pull_requests: 1 }, parallel: { pull_requests: 2 }, ratios: {} } };
  routes['GET /repos/acme/demo/contents/METRICS.json'] = { encoding: 'base64', content: b64(JSON.stringify(metrics)) };
  const { context, page } = await open(routes, { path: '/symphony/cost.html', storage: { symphony_panel_repos: JSON.stringify(['acme/demo']), symphony_panel_token: 'github_pat_TEST' } });
  await page.waitForFunction(() => /At API list prices/.test(document.getElementById('cost-measured').textContent));
  const text = await page.textContent('#cost-measured');
  console.log('     Symphony row:', text.replace(/.*Symphony, as run/, 'Symphony, as run').slice(0, 120));
  assert.ok(!/free on a public repository/.test(text), 'says the minutes are free though the repository is private');
  await context.close();
});

await check('G2: the cost page says in words when sharing is off, when economics is missing and when there is no branch', async () => {
  for (const [name, body] of [['off', { schema: 'sdlc-metrics/1', sharing: 'off' }], ['no economics', { schema: 'sdlc-metrics/1', sharing: 'on', generated_at: now }], ['404', undefined]]) {
    const routes = baseRoutes('acme/demo');
    if (body) routes['GET /repos/acme/demo/contents/METRICS.json'] = { encoding: 'base64', content: b64(JSON.stringify(body)) };
    const { context, page } = await open(routes, { path: '/symphony/cost.html', storage: { symphony_panel_repos: JSON.stringify(['acme/demo']), symphony_panel_token: 'github_pat_TEST' } });
    await page.waitForFunction(() => /Sharing is off|no economics block|no branch metrics/.test(document.getElementById('cost-measured').textContent));
    console.log('     ' + name + ':', (await page.textContent('#cost-measured')).slice(0, 70));
    await context.close();
  }
});

await check('H: "Sign in with GitHub" keeps the token for the tab only when "Keep me signed in" is unticked', async () => {
  const src = fs.readFileSync('/home/user/openspineconsortium.github.io/assets/js/symphony-panel.js', 'utf8');
  const patched = src.replace("var SIGNIN_SERVICE = '';", "var SIGNIN_SERVICE = 'https://signin.example';").replace("var CLIENT_ID = '';", "var CLIENT_ID = 'cid';");
  assert.ok(patched !== src, 'constants not found');
  const exchanges = [];
  const extraRoutes = [
    ['https://github.com/login/oauth/**', (route) => {
      const u = new URL(route.request().url());
      const back = u.searchParams.get('redirect_uri') + '?code=CODE1&state=' + encodeURIComponent(u.searchParams.get('state'));
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<script>location.replace(' + JSON.stringify(back) + ')</script>' });
    }],
    ['https://signin.example/**', (route) => { exchanges.push({ url: route.request().url(), body: route.request().postData() }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'ghu_TOKEN', refresh_token: 'ghr_R', expires_in: 28800, refresh_token_expires_in: 15811200 }) }); }],
  ];
  const routes = baseRoutes('acme/demo');
  const { context, page, calls } = await open(routes, { script: patched, extraRoutes, storage: { symphony_panel_repos: JSON.stringify(['acme/demo']) } });
  await page.waitForSelector('#cp-signin:not([disabled])');
  await page.uncheck('#cp-keep');
  await page.click('#cp-signin');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
  const where = await page.evaluate(() => ({ local: localStorage.getItem('symphony_panel_oauth'), session: sessionStorage.getItem('symphony_panel_oauth'), search: location.search }));
  console.log('     exchanges:', exchanges.length, '| record in localStorage:', !!where.local, '| in sessionStorage:', !!where.session, '| address now:', where.search);
  assert.equal(exchanges.length, 1);
  assert.ok(!/code=/.test(where.search), 'code left in the address');
  assert.ok(calls.every((c) => !/ghu_TOKEN|CODE1/.test(c.url)), 'token or code in a GitHub URL');
  assert.equal(where.local, null, 'the OAuth record went to localStorage though the box was unticked');
  await context.close();
});

await check('I: "Queue the task" tells the truth when GitHub dropped the todo label (no push access)', async () => {
  const routes = baseRoutes('acme/demo');
  routes['POST /repos/acme/demo/issues'] = { number: 42, labels: [] };
  const { context, page } = await open(routes);
  await signIn(page);
  await page.fill('#cp-task-title', 'T'); await page.fill('#cp-task-goal', 'g'); await page.fill('#cp-task-acceptance', 'a');
  await page.click('#cp-task-queue');
  await page.waitForFunction(() => /#42/.test(document.getElementById('msg').textContent));
  const msg = await page.textContent('#msg');
  console.log('     message:', msg.slice(0, 100));
  assert.ok(!/wakes on the label todo/.test(msg), 'claims a worker wakes though the label was not applied');
  await context.close();
});

await check('J: a hostile ?repo= is ignored and the address carries only the validated name', async () => {
  const routes = baseRoutes('acme/demo');
  const { context, page } = await open(routes, { path: '/symphony/control/?repo=' + encodeURIComponent('acme/demo"><script>alert(1)</script>'), storage: { symphony_panel_repos: JSON.stringify(['acme/demo']) } });
  await signIn(page);
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  const search = await page.evaluate(() => location.search);
  console.log('     address:', search);
  assert.equal(search, '?repo=acme%2Fdemo');
  await context.close();
});

await check('K: an archived repository is said in #cp-summary', async () => {
  const routes = baseRoutes('acme/demo');
  routes['GET /repos/acme/demo'].archived = true;
  const { context, page } = await open(routes);
  await signIn(page);
  await page.waitForFunction(() => /^acme\/demo, default/.test(document.getElementById('cp-summary').textContent));
  const s = await page.textContent('#cp-summary');
  assert.match(s, /archived/);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
