// Checks of the control panel's assistant (site pull request claude/assistant-panel, 2026-10-18)
// against a mocked GitHub API: who may ask, the label and the issue made once and only on a press,
// the question's shape, the conditional polling (If-None-Match, a 304 that reads as unchanged), the
// progress comment edited into the answer, the few lines of the answer's fenced block the page acts
// on, the issue remembered in storage and replaced when closed, and Stop watching. Each check states
// what the page promises; a FAIL is a defect. Every token is a stand-in.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const now = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 4).join('\n     ')); }
}

// These checks paste a token, which the page shows open only while the sign-in is off, so the page
// is served the shipped script with its two sign-in constants emptied; and the assistant's cadence
// is shortened from seconds and minutes to milliseconds, each constant being one line of its own.
let script = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(script.includes(a), 'mutant text not found: ' + a.slice(0, 60)); script = script.replace(a, b); }
script = script.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
function setConstant(name, value) {
  const line = new RegExp('var ' + name + ' = [0-9]+;');
  assert.ok(line.test(script), 'the constant ' + name + ' was not found in the script');
  script = script.replace(line, 'var ' + name + ' = ' + value + ';');
}
const POLL = 400;
setConstant('ASSISTANT_POLL_MS', POLL);
setConstant('ASSISTANT_SLOW_MS', POLL);
setConstant('ASSISTANT_AFTER_MS', 1500);

const resp = (status, body, extra) => Object.assign({ __r: true, status, body }, extra || {});
const issue = (n, title, labels, state) => ({ number: n, title, html_url: 'https://github.com/acme/demo/issues/' + n, labels: labels.map((name) => ({ name })), updated_at: now, state: state || 'open' });
const board = `# Board

Rendered 2026-10-18T00:10:00Z from the open issues, the branches and the pull requests.

## Claims (open claude/<issue> branches)

| Issue | Worker | Branch |
| --- | --- | --- |
| [#5](https://github.com/acme/demo/issues/5) | tester | claude/5 |

## Queue (open issues labelled todo, unclaimed and given to no worker)

- [#9](https://github.com/acme/demo/issues/9) Task: write the goal

## Blockers

- [#7](https://github.com/acme/demo/issues/7) Stuck on the schema

## Overlaps

None.
`;
const tasks = [
  issue(9, 'Task: write the goal', ['todo']),
  issue(7, 'Stuck on the schema', ['blocked', 'worker:nightly']),
  issue(5, 'Fix the docs', ['claimed', 'worker:tester']),
  issue(3, 'Everything at once', ['epic']),
];
const assistantIssue = (n, state) => issue(n, 'Assistant: tester', ['assistant'], state);
// each question has a time of its own, as GitHub stamps it, since the page keeps only a bot comment
// that came after the question it waits for, and GitHub's since= leaves out what was edited before it
const questionAt = (n) => '2026-10-18T10:' + String(n * 2).padStart(2, '0') + ':00Z';
const questionComment = (n, body) => ({ id: 1000 + n, created_at: questionAt(n), updated_at: questionAt(n), user: { login: 'tester', type: 'User' }, body });
const progressComment = { id: 2001, created_at: '2026-10-18T10:02:20Z', updated_at: '2026-10-18T10:02:20Z', user: { login: 'claude[bot]', type: 'Bot' },
  body: '**Claude Code is working...** <img src="https://github.com/user-attachments/assets/spinner.gif" width="14px" height="14px" />\n\n- [ ] Read the board\n- [ ] Answer' };
const ANSWER = '**Claude finished @tester\'s task** --- [View job](https://github.com/acme/demo/actions/runs/9)\n\n---\n\n#7 is blocked on the schema; nightly holds it (docs/agents/claims/7.md, line 3). The queue has one task, #9.\n\n```symphony\nfocus #7\nfilter blocked\nshow blockers\nopen #9\nmerge #9\n```\n';
const finalComment = Object.assign({}, progressComment, { updated_at: '2026-10-18T10:03:30Z', body: ANSWER });

function baseRoutes() {
  return {
    'GET /user': { login: 'tester' },
    'GET /repos/acme/demo': { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
    'GET /repos/acme/demo/issues': tasks,
    'GET /repos/acme/demo/contents/STATE.md': { encoding: 'base64', content: b64(board) },
    'GET /repos/acme/demo/branches/board': { commit: { commit: { committer: { date: now } } } },
    'GET /repos/acme/demo/contents/.github/symphony/workers': [],
    'GET /repos/acme/demo/actions/runs': { workflow_runs: [] },
    'GET /repos/acme/demo/pulls': [],
    'GET /repos/acme/demo/collaborators/tester/permission': { permission: 'write', role_name: 'write', user: { login: 'tester' } },
  };
}
const browser = await chromium.launch();
// the mocked API records every call with the conditional header it carried; a route may be a
// function of the url, the request and the record, and answers 304 with no body
async function open(routes, opts) {
  opts = opts || {};
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const calls = [];
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    const sent = req.headers();
    const call = { key, url: req.url(), auth: sent['authorization'], ifNoneMatch: sent['if-none-match'] || '', body: safeJson(req), at: Date.now() };
    calls.push(call);
    let r = routes[key];
    if (typeof r === 'function') r = r(url, req, call);
    const headers = { 'Access-Control-Expose-Headers': 'ETag, Link' };
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) });
    const spec = (r && r.__r) ? r : { status: 200, body: r };
    Object.assign(headers, spec.headers || {});
    if (/raw\+json/.test(sent['accept'] || '') && spec.body && spec.body.encoding === 'base64') {
      return route.fulfill({ status: spec.status, contentType: 'application/vnd.github.raw+json', headers, body: Buffer.from(spec.body.content, 'base64').toString('utf8') });
    }
    if (spec.status === 204 || spec.status === 304) return route.fulfill({ status: spec.status, headers, body: '' });
    return route.fulfill({ status: spec.status, contentType: 'application/json', headers, body: JSON.stringify(spec.body) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  // every scrollIntoView the page makes, so a check can tell what it centred
  await context.addInitScript(() => {
    window.__scrolled = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
      window.__scrolled.push(this.tagName + ':' + (this.textContent || '').trim().slice(0, 40));
      return original.apply(this, arguments);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/symphony/control/');
  await page.evaluate((s) => { localStorage.clear(); sessionStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); }, opts.storage || {});
  await page.goto(BASE + (opts.path || '/symphony/control/?repo=acme/demo'));
  return { context, page, calls, errors };
}
function safeJson(req) { try { return req.postDataJSON(); } catch (e) { return req.postData(); } }
async function signIn(page) {
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)', { timeout: 8000 });
}
const stateText = (page) => page.textContent('#cp-as-state');
const waitState = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('cp-as-state').textContent), re.source, { timeout: 8000 });
const posts = (calls) => calls.filter((c) => !/^GET /.test(c.key));

await check('A: without write access the page offers no box and says in one sentence why', async () => {
  const routes = baseRoutes();
  routes['GET /repos/acme/demo/collaborators/tester/permission'] = { permission: 'read', role_name: 'triage', user: { login: 'tester' } };
  const { context, page, calls, errors } = await open(routes);
  await signIn(page);
  await waitState(page, /write access/);
  const words = await stateText(page);
  console.log('     state:', words);
  assert.match(words, /^The assistant answers only people with write access to acme\/demo, and GitHub says yours is read\.$/);
  assert.equal(await page.isVisible('#cp-as-box'), false, 'the question box is offered');
  assert.equal(await page.isVisible('#cp-as-ask'), false, 'Ask the assistant is offered');
  assert.equal(posts(calls).length, 0, 'something was written: ' + posts(calls).map((c) => c.key));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('A2: when GitHub will not say what the access is, the page says so and offers no box', async () => {
  const routes = baseRoutes();
  delete routes['GET /repos/acme/demo/collaborators/tester/permission'];
  const { context, page, errors } = await open(routes);
  await signIn(page);
  await waitState(page, /would not say whether you may write/);
  const words = await stateText(page);
  console.log('     state:', words);
  assert.match(words, /404/);
  assert.equal(await page.isVisible('#cp-as-box'), false);
  assert.deepEqual(errors, []);
  await context.close();
});

// the first question and the answer, then a second question on the same page
await check('B: the first question makes the label and the issue, posts the question with the state, polls conditionally and acts on the answer', async () => {
  const routes = baseRoutes();
  routes['GET /repos/acme/demo/labels/assistant'] = resp(404, { message: 'Not Found' });
  routes['POST /repos/acme/demo/labels'] = { name: 'assistant' };
  routes['POST /repos/acme/demo/issues'] = assistantIssue(50);
  let questions = 0;
  routes['POST /repos/acme/demo/issues/50/comments'] = (url, req, call) => questionComment(++questions, call.body.body);
  let polls = 0;
  routes['GET /repos/acme/demo/issues/50/comments'] = (url, req, call) => {
    // the second question's reads: GitHub's since= leaves the first answer out, edited before it
    if (url.searchParams.get('since') === questionAt(2)) return call.ifNoneMatch === 'W/"three"' ? resp(304, null) : resp(200, [questionComment(2, '@claude And what next?')], { headers: { ETag: 'W/"three"' } });
    polls++;
    const q = questionComment(1, '@claude What is blocked?');
    if (polls === 1) return resp(200, [q, progressComment], { headers: { ETag: 'W/"one"' } });
    if (polls === 2) return call.ifNoneMatch === 'W/"one"' ? resp(304, null) : resp(500, { message: 'the second read was not conditional on the first ETag' });
    if (polls === 3) return resp(200, [q, finalComment], { headers: { ETag: 'W/"two"' } });
    return call.ifNoneMatch === 'W/"two"' ? resp(304, null) : resp(200, [q, finalComment], { headers: { ETag: 'W/"two"' } });
  };
  const { context, page, calls, errors } = await open(routes);
  await signIn(page);
  await waitState(page, /No assistant issue yet/);
  console.log('     state before:', await stateText(page));
  assert.match(await stateText(page), /the first question opens one, "Assistant: tester", labelled assistant/);
  assert.equal(posts(calls).length, 0, 'the page wrote before any press');
  assert.ok(await page.isVisible('#cp-as-box'), 'the box is offered to a person with write access');
  assert.equal(await page.isVisible('#cp-as-stop'), false, 'Stop watching shows before any question');

  await page.fill('#cp-as-q', 'What is blocked?');
  await page.click('#cp-as-ask');
  await waitState(page, /Waiting for the answer on #50/);
  const label = posts(calls).find((c) => c.key === 'POST /repos/acme/demo/labels');
  assert.ok(label, 'the label was not made');
  assert.equal(label.body.name, 'assistant');
  assert.ok(calls.findIndex((c) => c.key === 'GET /repos/acme/demo/labels/assistant') < calls.indexOf(label), 'the label was made before it was looked for');
  const opened = posts(calls).find((c) => c.key === 'POST /repos/acme/demo/issues');
  assert.ok(opened, 'the issue was not opened');
  assert.equal(opened.body.title, 'Assistant: tester');
  assert.deepEqual(opened.body.labels, ['assistant']);
  assert.ok(!/@claude/i.test(opened.body.body), 'the issue body mentions @claude, which would start a run: ' + opened.body.body);
  assert.ok(/control panel/.test(opened.body.body), 'the body says what the page is');
  assert.equal(opened.auth, 'Bearer github_pat_TEST');
  const asked = posts(calls).find((c) => c.key === 'POST /repos/acme/demo/issues/50/comments');
  assert.ok(asked, 'the question was not posted');
  assert.equal(asked.body.body, '@claude What is blocked?\n\n```symphony-state\nrepository: acme/demo\nfocus: none\nfilter: none\nsection: none\n```\n');
  assert.ok(calls.indexOf(opened) < calls.indexOf(asked), 'the question went before the issue');
  assert.equal(await page.inputValue('#cp-as-q'), '', 'the question box is emptied once sent');
  assert.ok(await page.isVisible('#cp-as-stop'), 'Stop watching is offered while waiting');
  assert.equal(await page.isDisabled('#cp-as-ask'), true, 'a second question could be sent while one waits');
  assert.equal(await page.getAttribute('#cp-as-state a', 'href'), 'https://github.com/acme/demo/issues/50', 'the state line links the issue');

  await waitState(page, /The run is at work/);
  console.log('     state while working:', (await stateText(page)).slice(0, 90));
  assert.equal(await page.textContent('#cp-as-answer'), '', 'the progress comment was rendered as an answer');
  await page.waitForFunction(() => /blocked on the schema/.test(document.getElementById('cp-as-answer').textContent), null, { timeout: 8000 });
  const reads = calls.filter((c) => c.key === 'GET /repos/acme/demo/issues/50/comments');
  assert.ok(reads.length >= 3, 'fewer than three reads: ' + reads.length);
  assert.equal(new URL(reads[0].url).searchParams.get('since'), questionAt(1), 'the read is not since the question');
  assert.equal(reads[0].ifNoneMatch, '', 'the first read carried a condition');
  assert.equal(reads[1].ifNoneMatch, 'W/"one"', 'the second read did not carry the first ETag');
  assert.equal(reads[2].ifNoneMatch, 'W/"one"', 'the ETag was dropped after the 304');
  console.log('     reads:', reads.length, 'If-None-Match:', reads.map((r) => r.ifNoneMatch || '-').join(' '));

  // the answer, rendered through the safe renderer
  const html = await page.innerHTML('#cp-as-answer');
  assert.ok(!/<img/.test(html), 'HTML of the comment survived the renderer');
  assert.ok(/<a href="https:\/\/github.com\/acme\/demo\/actions\/runs\/9"/.test(html), 'the link to the run is not rendered');
  assert.match(await stateText(page), /The assistant answered on #50/);
  // the vocabulary: focus #7 marks the row and scrolls to it
  assert.ok(await page.$('#cp-blocked tbody tr[data-number="7"].control__focus'), 'row 7 is not marked as the focus');
  assert.equal((await page.$$('#cp-app tr.control__focus')).length, 1, 'more than one row is marked');
  const scrolled = await page.evaluate(() => window.__scrolled);
  console.log('     scrolled:', JSON.stringify(scrolled));
  assert.ok(scrolled.some((s) => /^TR:#7/.test(s)), 'row 7 was not scrolled to: ' + scrolled);
  // filter blocked hides the other rows and says so above the tables
  assert.ok(await page.$('#cp-queue tbody tr[data-number="9"].control__off'), 'the todo row 9 is still shown');
  assert.ok(await page.$('#cp-claimed tbody tr[data-number="5"].control__off'), 'the claimed row 5 is still shown');
  assert.ok(await page.$('#cp-epics tbody tr[data-number="3"].control__off'), 'the epic row 3 is still shown');
  assert.ok(!(await page.$('#cp-blocked tbody tr[data-number="7"].control__off')), 'the blocked row 7 is hidden');
  assert.equal(await page.isVisible('#cp-queue tbody tr[data-number="9"]'), false, 'the hidden row is visible');
  const filterWords = await page.textContent('#cp-as-filter');
  console.log('     filter words:', filterWords);
  assert.match(filterWords, /Showing only the tasks labelled blocked or blocker, as the assistant asked: 1 of 4 tasks\./);
  assert.equal(await page.textContent('#cp-as-filter button'), 'Show all tasks');
  // show blockers scrolls to the board's heading
  assert.ok(scrolled.some((s) => /^H3:Blockers/.test(s)), 'the Blockers heading was not scrolled to: ' + scrolled);
  assert.equal(scrolled[scrolled.length - 1].slice(0, 11), 'H3:Blockers', 'the last scroll is not the section');
  // open #9 is a link the person presses; the unknown line is shown as text
  const actions = await page.textContent('#cp-as-actions');
  console.log('     actions:', actions);
  assert.equal(await page.textContent('#cp-as-actions a'), 'Open #9');
  assert.equal(await page.getAttribute('#cp-as-actions a', 'href'), 'https://github.com/acme/demo/issues/9');
  assert.equal(await page.getAttribute('#cp-as-actions a', 'target'), '_blank');
  assert.match(actions, /Focused #7 \(under Blocked, and blockers\)\./);
  assert.match(actions, /Filtered the task tables to the tasks labelled blocked or blocker: 1 of 4/);
  assert.match(actions, /Showing the board's Blockers section\./);
  assert.match(actions, /Not acted on, shown as written: merge #9/);
  assert.equal(posts(calls).length, 3, 'more than the label, the issue and the question were written: ' + posts(calls).map((c) => c.key));
  assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_assistant')), '{"acme/demo":50}', 'the issue is not remembered');
  // the watch ends by itself a while after the answer
  await waitState(page, /Watching stopped/);
  assert.equal(await page.isVisible('#cp-as-stop'), false, 'Stop watching stays after the watch ended');
  assert.ok(await page.isVisible('#cp-as-again'), 'Ask again is not offered');
  assert.equal(await page.isDisabled('#cp-as-ask'), false, 'Ask the assistant stays off after the answer');
  const readsThen = calls.filter((c) => c.key === 'GET /repos/acme/demo/issues/50/comments').length;
  await sleep(POLL * 3);
  assert.equal(calls.filter((c) => c.key === 'GET /repos/acme/demo/issues/50/comments').length, readsThen, 'the page kept reading after the watch ended');

  // C: a second question on the same page reuses the issue and carries the focus, the filter and the section
  const before = calls.length;
  await page.fill('#cp-as-q', '@claude And what next?');
  await page.click('#cp-as-ask');
  await waitState(page, /Waiting for the answer on #50/);
  const later = calls.slice(before);
  assert.ok(!later.some((c) => c.key === 'POST /repos/acme/demo/issues' || c.key === 'POST /repos/acme/demo/labels'), 'a second issue or label was made: ' + later.map((c) => c.key));
  const second = later.find((c) => c.key === 'POST /repos/acme/demo/issues/50/comments');
  assert.ok(second, 'the second question was not posted');
  assert.equal(second.body.body, '@claude And what next?\n\n```symphony-state\nrepository: acme/demo\nfocus: #7\nfilter: blocked\nsection: Blockers\n```\n');
  assert.equal(await page.textContent('#cp-as-answer'), '', 'the first answer stays shown while the second is awaited');
  await sleep(POLL * 3);
  assert.equal(await page.textContent('#cp-as-answer'), '', 'the first answer came back as the second question\'s');
  assert.equal(new URL(calls[calls.length - 1].url).searchParams.get('since'), questionAt(2), 'the reads are not since the second question');
  // Show all tasks clears the filter in words
  await page.click('#cp-as-filter button');
  assert.equal(await page.textContent('#cp-as-filter'), '');
  assert.ok(!(await page.$('#cp-queue tbody tr[data-number="9"].control__off')), 'row 9 stays hidden after Show all tasks');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('C2: a page opened later reuses the issue remembered in storage, looks for no other, and leaves it out of the task tables', async () => {
  const routes = baseRoutes();
  routes['GET /repos/acme/demo/issues'] = tasks.concat([assistantIssue(50)]);
  routes['GET /repos/acme/demo/issues/50'] = assistantIssue(50);
  routes['GET /repos/acme/demo/labels/assistant'] = { name: 'assistant' };
  routes['POST /repos/acme/demo/issues/50/comments'] = (url, req, call) => questionComment(2, call.body.body);
  routes['GET /repos/acme/demo/issues/50/comments'] = resp(200, [questionComment(2, '@claude Hello?')], { headers: { ETag: 'W/"q"' } });
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  console.log('     state:', await stateText(page));
  assert.ok(!calls.some((c) => c.key === 'GET /repos/acme/demo/issues' && /labels=assistant/.test(c.url)), 'the page searched although it remembered the issue');
  await page.waitForFunction(() => /Queue: /.test(document.getElementById('cp-summary').textContent));
  assert.ok(!/Assistant/.test(await page.textContent('#cp-other')), 'the assistant issue is named among the other issues: ' + await page.textContent('#cp-other'));
  assert.ok(!(await page.$('#cp-app tr[data-number="50"]')), 'the assistant issue is in a task table');
  await page.fill('#cp-as-q', 'Hello?');
  await page.click('#cp-as-ask');
  await waitState(page, /Waiting for the answer on #50/);
  assert.ok(!posts(calls).some((c) => c.key === 'POST /repos/acme/demo/issues'), 'a new issue was opened');
  assert.ok(posts(calls).some((c) => c.key === 'POST /repos/acme/demo/issues/50/comments'), 'the question did not go to the remembered issue');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('D: a remembered issue that is closed is forgotten and the next question opens another', async () => {
  const routes = baseRoutes();
  routes['GET /repos/acme/demo/issues/50'] = assistantIssue(50, 'closed');
  routes['GET /repos/acme/demo/labels/assistant'] = { name: 'assistant' };
  routes['POST /repos/acme/demo/issues'] = assistantIssue(51);
  routes['POST /repos/acme/demo/issues/51/comments'] = (url, req, call) => questionComment(3, call.body.body);
  routes['GET /repos/acme/demo/issues/51/comments'] = resp(200, [questionComment(3, '@claude Again?')], { headers: { ETag: 'W/"q"' } });
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /No assistant issue yet/);
  console.log('     state:', await stateText(page));
  assert.match(await stateText(page), /the one the page remembered, #50, is closed/);
  assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_assistant')), '{}', 'the closed issue is still remembered');
  await page.fill('#cp-as-q', 'Again?');
  await page.click('#cp-as-ask');
  await waitState(page, /Waiting for the answer on #51/);
  assert.ok(!posts(calls).some((c) => c.key === 'POST /repos/acme/demo/labels'), 'the label was made although it is there');
  const opened = posts(calls).find((c) => c.key === 'POST /repos/acme/demo/issues');
  assert.ok(opened, 'no new issue was opened');
  assert.equal(opened.body.title, 'Assistant: tester');
  assert.ok(posts(calls).some((c) => c.key === 'POST /repos/acme/demo/issues/51/comments'), 'the question did not go to the new issue');
  assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_assistant')), '{"acme/demo":51}');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E: Stop watching stops the reads, says where the question is, and offers Ask again', async () => {
  const routes = baseRoutes();
  routes['GET /repos/acme/demo/issues/50'] = assistantIssue(50);
  routes['POST /repos/acme/demo/issues/50/comments'] = (url, req, call) => questionComment(4, call.body.body);
  routes['GET /repos/acme/demo/issues/50/comments'] = (url, req, call) => call.ifNoneMatch === 'W/"q"' ? resp(304, null) : resp(200, [questionComment(4, '@claude Slow one')], { headers: { ETag: 'W/"q"' } });
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await page.fill('#cp-as-q', 'Slow one');
  await page.click('#cp-as-ask');
  await waitState(page, /Waiting for the answer on #50/);
  await page.waitForFunction(() => true);
  await sleep(POLL * 4);
  const reads = () => calls.filter((c) => c.key === 'GET /repos/acme/demo/issues/50/comments');
  assert.ok(reads().length >= 2, 'the page is not reading the issue: ' + reads().length);
  assert.ok(reads().slice(1).every((c) => c.ifNoneMatch === 'W/"q"'), 'a read after the first carried no ETag');
  await page.click('#cp-as-stop');
  await waitState(page, /^Watching stopped\. The question is on #50/);
  const after = reads().length;
  await sleep(POLL * 5);
  assert.equal(reads().length, after, 'the page read the issue after Stop watching');
  console.log('     reads before stop:', after, 'after a wait:', reads().length, '| state:', await stateText(page));
  assert.equal(await page.isVisible('#cp-as-stop'), false, 'Stop watching stays');
  assert.ok(await page.isVisible('#cp-as-again'), 'Ask again is not offered');
  assert.equal(await page.isDisabled('#cp-as-ask'), false, 'Ask the assistant stays off');
  // Ask again sends the same question once more
  const before = posts(calls).length;
  await page.click('#cp-as-again');
  await waitState(page, /Waiting for the answer on #50/);
  const again = posts(calls).slice(before).find((c) => c.key === 'POST /repos/acme/demo/issues/50/comments');
  assert.ok(again && /^@claude Slow one\n/.test(again.body.body), 'Ask again did not send the question again');
  // a second question while one waits is refused in words, with nothing written
  const written = posts(calls).length;
  await page.evaluate(() => { document.getElementById('cp-as-ask').disabled = false; });
  await page.fill('#cp-as-q', 'Two at once');
  await page.click('#cp-as-ask');
  await waitState(page, /One question at a time/);
  assert.equal(posts(calls).length, written, 'a second question was sent while one waited');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F: a repository change while waiting stops the watch, and the assistant starts over for the new repository', async () => {
  const routes = baseRoutes();
  routes['GET /repos/acme/beta'] = { full_name: 'acme/beta', default_branch: 'main', private: false, topics: ['symphony'], id: 125, owner: { id: 77, login: 'acme' } };
  routes['GET /repos/acme/beta/issues'] = [];
  routes['GET /repos/acme/beta/contents/STATE.md'] = { encoding: 'base64', content: b64('# Board\n') };
  routes['GET /repos/acme/beta/branches/board'] = { commit: { commit: { committer: { date: now } } } };
  routes['GET /repos/acme/beta/contents/.github/symphony/workers'] = [];
  routes['GET /repos/acme/beta/actions/runs'] = { workflow_runs: [] };
  routes['GET /repos/acme/beta/pulls'] = [];
  routes['GET /repos/acme/beta/collaborators/tester/permission'] = { permission: 'admin' };
  routes['GET /repos/acme/demo/issues/50'] = assistantIssue(50);
  routes['POST /repos/acme/demo/issues/50/comments'] = (url, req, call) => questionComment(5, call.body.body);
  routes['GET /repos/acme/demo/issues/50/comments'] = resp(200, [questionComment(5, '@claude Where?')], { headers: { ETag: 'W/"q"' } });
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}', symphony_panel_repos: JSON.stringify(['acme/demo', 'acme/beta']) } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await page.fill('#cp-as-q', 'Where?');
  await page.click('#cp-as-ask');
  await waitState(page, /Waiting for the answer on #50/);
  await page.selectOption('#cp-repo', 'acme/beta');
  await waitState(page, /No assistant issue yet in acme\/beta/);
  const reads = calls.filter((c) => c.key === 'GET /repos/acme/demo/issues/50/comments').length;
  await sleep(POLL * 4);
  assert.equal(calls.filter((c) => c.key === 'GET /repos/acme/demo/issues/50/comments').length, reads, 'acme/demo\'s issue is still read under acme/beta');
  assert.equal(await page.textContent('#cp-as-actions'), '');
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
