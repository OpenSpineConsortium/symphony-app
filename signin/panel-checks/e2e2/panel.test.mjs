// End-to-end test of the control panel and the cost page against a mocked GitHub API.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8077';
// These checks paste a token, which the page shows open only while the sign-in is off, so the
// page is served the shipped script with its two sign-in constants emptied.
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const UNCONFIGURED = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8').replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
const posts = [];
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const now = new Date().toISOString();
const board = `# Board

Rendered 2026-10-16T00:10:00Z from the open issues, the branches and the pull requests.

## Claims (open claude/<issue> branches and docs/agents/claims/<issue>.md)

| Issue | Worker | Branch | Files | Pull request |
| --- | --- | --- | --- | --- |
| [#5](https://github.com/acme/demo/issues/5) | nightly | claude/5 | docs/a.md | [#7](https://github.com/acme/demo/pull/7) |

## Queue (open issues labelled todo, unclaimed and given to no worker)

- [#9](https://github.com/acme/demo/issues/9) Task: write the goal <script>alert(1)</script>

## Overlaps

None.
`;
const metrics = {
  schema: 'sdlc-metrics/1', sharing: 'on', generated_at: '2026-10-16T03:43:00Z',
  economics: { prices_as_of: '2026-10-06', pull_requests: 11, pull_requests_measured: 6, merged: 10, sessions: 2, actions_runs: 2, actions_runs_unread: 0,
    tokens_input: 9200, tokens_cache_write: 219000, tokens_cache_read: 3250000, tokens_output: 65200, tokens_total: 3543400, tokens_unpriced: 0,
    estimated_usd: 2.5122, coordinator_usd: 0.1654, claude_seconds: 8635, commits: 16, check_failures: 0, reverts: 0,
    tokens_by_family: { fable: 0, opus: 1927300, sonnet: 1580900, haiku: 35200, other: 0 }, tokens_per_merge: 354340.0, usd_per_merge: 0.25122, claude_seconds_per_merge: 863.5, commits_per_merge: 1.6 },
  coordination: { alone: { pull_requests: 2, merged: 2, measured: 2, measured_merged: 2, tokens: 600000, estimated_usd: 0.5, claude_seconds: 100, commits: 3, check_failures: 0, first_check_passed: 1, first_check_counted: 2, open_to_merge_median: 3600, active_seconds: 7200 },
    parallel: { pull_requests: 9, merged: 8, measured: 4, measured_merged: 4, tokens: 2943400, estimated_usd: 2.0, claude_seconds: 8535, commits: 13, check_failures: 0, first_check_passed: 3, first_check_counted: 4, open_to_merge_median: 1800, active_seconds: 20000 },
    ratios: { tokens_per_merge: 0.41, usd_per_merge: 0.5, latency: 2.0, throughput: 1.44, first_check_pass: 1.5, commits_per_merge: 0.46, failures_per_pull_request: 1.0 } }
};
const issues = [
  { number: 9, title: 'Task: write the goal', html_url: 'https://github.com/acme/demo/issues/9', labels: [{ name: 'todo' }], updated_at: now },
  { number: 5, title: 'Fix the docs', html_url: 'https://github.com/acme/demo/issues/5', labels: [{ name: 'claimed' }, { name: 'worker:nightly' }], updated_at: now },
  { number: 6, title: 'Given one', html_url: 'https://github.com/acme/demo/issues/6', labels: [{ name: 'todo' }, { name: 'worker:nightly' }], updated_at: now },
  { number: 2, title: 'Set up this project', html_url: 'https://github.com/acme/demo/issues/2', labels: [], updated_at: now },
  { number: 7, title: 'PR as issue', html_url: 'https://github.com/acme/demo/pull/7', labels: [], updated_at: now, pull_request: {} },
];
const routes = {
  'GET /user': { login: 'tester' },
  'GET /repos/acme/demo': { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
  'GET /repos/acme/other': { full_name: 'acme/other', default_branch: 'main', private: true, topics: [], id: 124, owner: { id: 77, login: 'acme' } },
  'GET /repos/acme/demo/issues': issues,
  'GET /repos/acme/demo/contents/STATE.md': { encoding: 'base64', content: b64(board) },
  'GET /repos/acme/demo/branches/board': { commit: { commit: { committer: { date: now } } } },
  'GET /repos/acme/demo/contents/.github/symphony/workers': [{ type: 'file', name: 'nightly.json' }, { type: 'file', name: 'README.md' }],
  'GET /repos/acme/demo/contents/.github/symphony/workers/nightly.json': { encoding: 'base64', content: b64(JSON.stringify({ name: 'nightly', runs: 'actions', about: 'Small fixes', area: ['docs/'], lands: 'owner', model: '', max_turns: 80, rounds: 6, account: '' })) },
  'GET /repos/acme/demo/actions/runs': { workflow_runs: [{ name: 'Board', event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success', actor: { login: 'tester' }, run_started_at: now, html_url: 'https://github.com/acme/demo/actions/runs/1' }] },
  'GET /repos/acme/demo/pulls': [{ number: 7, title: 'Docs fix', html_url: 'https://github.com/acme/demo/pull/7', head: { ref: 'claude/5', sha: 'abc123' }, base: { ref: 'main' }, draft: false, updated_at: now }],
  'GET /repos/acme/demo/commits/abc123/check-runs': { check_runs: [{ name: 'check', status: 'completed', conclusion: 'success' }] },
  'GET /repos/acme/demo/labels/worker%3Anightly': { name: 'worker:nightly' },
  'POST /repos/acme/demo/issues': { number: 42, labels: [{ name: 'todo' }] },
  'POST /repos/acme/demo/issues/9/labels': [{ name: 'worker:nightly' }],
  'POST /repos/acme/demo/issues/5/comments': { id: 1 },
  'POST /repos/acme/demo/actions/workflows/workers.yml/dispatches': null,
  'PUT /repos/acme/demo/pulls/7/merge': { merged: true },
  'GET /repos/acme/demo/contents/METRICS.json': { encoding: 'base64', content: b64(JSON.stringify(metrics)) },
  'GET /user/repos': [{ full_name: 'acme/demo', topics: ['symphony'], private: false, pushed_at: now }, { full_name: 'acme/other', topics: [], private: true, pushed_at: now, description: 'Not yet adopted' }],
  'GET /repos/acme/demo/collaborators': [{ login: 'tester', role_name: 'admin' }, { login: 'friend', role_name: 'write' }],
  'GET /repos/acme/demo/invitations': [{ id: 3, invitee: { login: 'pal' }, permissions: 'write', created_at: now }],
  'DELETE /repos/acme/demo/collaborators/friend': null,
  'DELETE /repos/acme/demo/invitations/3': null,
};

const rawRoutes = {
  'GET /repos/acme/demo/contents/STATE.md': board,
  'GET /repos/acme/demo/contents/.github/symphony/workers/nightly.json': JSON.stringify({ name: 'nightly', runs: 'actions', about: 'Small fixes', area: ['docs/'], lands: 'owner', model: '', max_turns: 80, rounds: 6, account: '' }),
  'GET /repos/acme/demo/contents/METRICS.json': JSON.stringify(metrics),
};

const browser = await chromium.launch();
await consoleTabs(browser);
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: UNCONFIGURED }));
await context.route('https://api.github.com/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const key = req.method() + ' ' + url.pathname;
  if (req.method() !== 'GET') posts.push({ key, body: req.postDataJSON ? safeJson(req) : null, auth: req.headers()['authorization'] });
  const raw = /raw\+json/.test(req.headers()['accept'] || '');
  if (raw && key in rawRoutes) return route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', body: rawRoutes[key] });
  if (key in routes) {
    const body = routes[key];
    if (body === null) return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
});
function safeJson(req) { try { return req.postDataJSON(); } catch (e) { return req.postData(); } }

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

await page.goto(BASE + '/symphony/control/?repo=acme/demo');
assert.ok(await page.isVisible('#cp-gate'), 'the gate shows before sign-in');
await page.fill('#cp-token', 'github_pat_TEST');
assert.equal(await page.isChecked('#cp-keep'), false, 'keep me signed in is off by default');
await page.check('#cp-keep');
await page.click('#cp-open');
await page.waitForSelector('#cp-app:not(.hidden)');
await page.waitForFunction(() => /Last run:/.test(document.getElementById('cp-summary').textContent));
const summary = await page.textContent('#cp-summary');
console.log('SUMMARY:', summary);
assert.match(summary, /acme\/demo, default branch main, public, adopted/);
assert.match(summary, /Queue: 1 unclaimed issue; given to workers: 1; claimed: 1 \(#5 by nightly\)/);
assert.match(summary, /Workers in Actions: nightly/);
assert.match(summary, /Last run: Board, success/);
const boardHtml = await page.innerHTML('#cp-board');
assert.ok(boardHtml.includes('<h3>Claims'), 'board headings rendered');
assert.ok(boardHtml.includes('<table>'), 'board table rendered');
assert.ok(!boardHtml.includes('<script>'), 'board script tag escaped');
assert.ok(boardHtml.includes('&lt;script&gt;'), 'board script escaped as text');
assert.match(await page.textContent('#cp-board-when'), /Written just now/);
assert.match(await page.textContent('#cp-workers tbody'), /nightly/);
assert.match(await page.textContent('#cp-other'), /1 other open issue/);
await page.waitForFunction(() => /1 of 1 passed/.test(document.querySelector('#cp-pulls tbody').textContent));
assert.equal(await page.isDisabled('#cp-pulls tbody .admin__act button'), false, 'merge enabled on a green ready PR');
assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_token')), 'github_pat_TEST');

// queue a task: + Add task opens the dialog the fields are in
await page.click('#cp-task-new');
assert.ok(await page.evaluate(() => document.getElementById('dlg-task').open), 'the task dialog opens');
await page.fill('#cp-task-title', 'Write the README');
await page.fill('#cp-task-goal', 'A README exists');
await page.fill('#cp-task-acceptance', 'check passes');
await page.fill('#cp-task-files', 'README.md');
await page.click('#cp-task-queue');
await page.waitForFunction(() => /Queued as #42/.test(document.getElementById('msg').textContent));
const task = posts.find((p) => p.key === 'POST /repos/acme/demo/issues');
assert.equal(task.body.title, 'Task: Write the README');
assert.equal(task.body.body, '### Goal\n\nA README exists\n\n### Acceptance\n\ncheck passes\n\n### Files likely touched\n\nREADME.md\n');
assert.deepEqual(task.body.labels, ['todo']);
assert.equal(task.auth, 'Bearer github_pat_TEST');
assert.ok(!(await page.evaluate(() => document.getElementById('dlg-task').open)), 'the task dialog closes once queued');

// give an issue to a worker: its gear opens its settings
await page.click('#cp-queue tbody tr:not(.card--add) .card__gear');
await page.selectOption('#dlg-give', 'nightly');
await page.click('#dlg-give-go');
await page.waitForFunction(() => /#9 is given to nightly/.test(document.getElementById('msg').textContent));
assert.ok(posts.find((p) => p.key === 'POST /repos/acme/demo/issues/9/labels' && p.body.labels[0] === 'worker:nightly'));

// add a worker
posts.length = 0;
await page.fill('#cp-w-name', 'docs-fixer');
await page.click('#dlg-worker [data-for="cp-w-runs"] .wtile[data-index="1"]');
await page.fill('#cp-w-about', 'Docs');
await page.click('#cp-w-add');
await page.waitForFunction(() => /Issue #42 is open/.test(document.getElementById('msg').textContent));
const worker = posts.find((p) => p.key === 'POST /repos/acme/demo/issues');
assert.equal(worker.body.title, 'Add a worker: docs-fixer');
assert.ok(worker.body.body.startsWith('### Name\n\ndocs-fixer\n\n### Where it runs\n\nroutine: a routine on someone\'s Claude account\n\n### What it is for\n\nDocs\n\n### Area\n\n_No response_\n\n### How its pull requests land\n\nowner: the owner merges each pull request\n\n### Model\n\n_No response_'), worker.body.body);

// ask Claude: the task dialog's Ask @claude now opens an issue, an issue's gear comments on it
posts.length = 0;
await page.fill('#cp-task-goal', 'Explain the board');
await page.click('#cp-task-ask');
await page.waitForFunction(() => /Opened #42/.test(document.getElementById('msg').textContent));
let ask = posts.find((p) => p.key === 'POST /repos/acme/demo/issues');
assert.equal(ask.body.title, 'Explain the board');
assert.equal(ask.body.body, '@claude Explain the board');
posts.length = 0;
await page.click('.console__rail [data-tab="tasks"]');
await page.click('xpath=//tr[contains(., "#5")]//button[contains(@class, "card__gear")]');
await page.fill('#dlg-ask', '@claude review this');
await page.click('#dlg-ask-go');
await page.waitForFunction(() => /Commented on #5/.test(document.getElementById('msg').textContent));
ask = posts.find((p) => p.key === 'POST /repos/acme/demo/issues/5/comments');
assert.equal(ask.body.body, '@claude review this');

// a bad worker name is refused before any request
posts.length = 0;
await page.fill('#cp-w-name', 'Bad Name');
await page.click('#cp-w-add');
await page.waitForFunction(() => /lower-case letters/.test(document.getElementById('msg').textContent));
assert.equal(posts.length, 0);

// run the workers
await page.click('#cp-run-workers');
await page.waitForFunction(() => /Queued on main/.test(document.getElementById('msg').textContent));
assert.ok(posts.find((p) => p.key === 'POST /repos/acme/demo/actions/workflows/workers.yml/dispatches' && p.body.ref === 'main'));

// merge: two presses, the first arms the button and offers Cancel
await page.click('#cp-pulls tbody .admin__act button');
assert.equal(await page.textContent('#cp-pulls tbody .admin__act button'), 'Confirm: merge #7 into main');
assert.equal((await page.$$('#cp-pulls tbody .admin__act button')).length, 2, 'a Cancel button appears');
await page.click('#cp-pulls tbody .admin__act button:nth-child(2)');
assert.equal(await page.textContent('#cp-pulls tbody .admin__act button'), 'Merge', 'Cancel disarms');
assert.ok(!posts.find((p) => p.key === 'PUT /repos/acme/demo/pulls/7/merge'), 'nothing merged yet');
await page.click('#cp-pulls tbody .admin__act button');
await page.click('#cp-pulls tbody .admin__act button');
await page.waitForFunction(() => /#7 is merged/.test(document.getElementById('msg').textContent));
assert.ok(posts.find((p) => p.key === 'PUT /repos/acme/demo/pulls/7/merge' && p.body.merge_method === 'merge' && p.body.sha === 'abc123'));

// + Add repository lists what the token reaches, the list's own first, and the search narrows it
await page.click('#cp-repo-browse');
await page.waitForFunction(() => /acme\/other/.test(document.getElementById('rp-list').textContent));
const listed = await page.textContent('#rp-list');
assert.match(listed, /On your list/);
assert.match(listed, /Not set up yet/);
await page.fill('#cp-add-name', 'oth');
assert.equal((await page.$$('#rp-list .repos__card')).length, 1, 'the search narrows the list');
await page.fill('#cp-add-name', 'acme/other');
await page.click('#cp-add');
await page.waitForFunction(() => /does not carry the topic/.test(document.getElementById('cp-add-answer').textContent));
const install = await page.getAttribute('#cp-add-answer a', 'href');
assert.equal(install, 'https://github.com/apps/symphonyboard/installations/new/permissions?target_id=77&suggested_target_id=77&repository_ids[]=124&state=acme%2Fother');

// Share lists who has access, the owner of a personal repository first; X takes access away or withdraws an invitation
page.on('dialog', (d) => d.accept());
await page.click('.console__rail [data-tab="share"]');
await page.waitForFunction(() => /pal/.test(document.querySelector('#sh-people tbody').textContent));
const people = await page.textContent('#sh-people tbody');
assert.match(people, /acme.*Owner/);
assert.match(people, /friend.*Write/);
assert.match(people, /Invited/);
assert.equal(await page.$$eval('#sh-people tbody tr', (rows) => rows.filter((r) => /tester/.test(r.textContent) && r.querySelector('.card__x')).length), 0, 'no X on yourself');
posts.length = 0;
await page.click('#sh-people tbody tr:has-text("friend") .card__x');
await page.waitForFunction(() => /friend no longer has access/.test(document.getElementById('msg').textContent));
assert.ok(posts.find((p) => p.key === 'DELETE /repos/acme/demo/collaborators/friend'));
await page.click('#sh-people tbody tr:has-text("pal") .card__x');
await page.waitForFunction(() => /invitation of pal is withdrawn/.test(document.getElementById('msg').textContent));
assert.ok(posts.find((p) => p.key === 'DELETE /repos/acme/demo/invitations/3'));
await page.screenshot({ path: 'control.png', fullPage: true });

// the cost page, signed in already (shared storage)
await page.goto(BASE + '/symphony/cost.html');
try { await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 }); } catch (e) { console.log('ERRORS SO FAR:', errors, 'MSG:', await page.textContent('#msg')); throw e; }
await page.waitForFunction(() => /At API list prices/.test(document.getElementById('cost-measured').textContent));
const measured = await page.textContent('#cost-measured');
assert.match(measured, /\$2\.51 for the window, of which the coordinator spent \$0\.17/);
assert.match(measured, /Symphony, as run\$100 for Claude Max 5x/);
assert.match(measured, /dollars per merge 0\.50; latency 2\.00/);
await page.click('#cost-measured button');
await page.waitForFunction(() => /These inputs are the last 30 days/.test(document.getElementById('cc-note').textContent));
assert.equal(await page.inputValue('#cc-model'), 'claude-opus-5-5');
const out = await page.textContent('#cc-out tbody');
assert.match(out, /Symphony \(Claude Max 5x/);
assert.match(out, /GitHub Copilot coding agent \(Copilot Pro\+\)/);
assert.match(out, /unsorry/);
await page.selectOption('#cc-visibility', 'private');
await page.fill('#cc-minutes', '30');
await page.fill('#cc-runs', '10');
await page.fill('#cc-days', '30');
const out2 = await page.textContent('#cc-out tbody');
console.log('CALC NOTE:', await page.textContent('#cc-note'));
await page.screenshot({ path: 'cost.png', fullPage: true });

// forget the token
await page.click('#cp-signout');
await page.waitForSelector('#cp-gate:not(.hidden)');
assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_token')), null);

// without the tick the token lives in sessionStorage only
await page.goto(BASE + '/symphony/control/?repo=acme/demo');
await page.fill('#cp-token', 'github_pat_TEST');
await page.click('#cp-open');
await page.waitForSelector('#cp-app:not(.hidden)');
assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_token')), null);
assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_token')), 'github_pat_TEST');
await page.click('#cp-signout');
await page.waitForSelector('#cp-gate:not(.hidden)');
assert.equal(await page.evaluate(() => sessionStorage.getItem('symphony_panel_token')), null);

// the 401 path: a refused token shows the gate with a message
await page.goto(BASE + '/symphony/control/');
await page.route('https://api.github.com/user', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' }));
await page.fill('#cp-token', 'bad');
await page.click('#cp-open');
await page.waitForFunction(() => /refused the token \(401\)/.test(document.getElementById('msg').textContent));
assert.ok(await page.isVisible('#cp-gate'));

assert.deepEqual(errors, [], 'no page errors');
console.log('ALL PASSED');
await browser.close();
