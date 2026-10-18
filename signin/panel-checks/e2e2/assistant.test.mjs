// Checks of the control panel's assistant (site pull request claude/assistant-panel, 2026-10-18)
// against a mocked GitHub API: who may ask (write access, and the repository's workflow carrying the
// assistant), the label and the issue made once and only on a press, the question's shape and its
// size, the conditional polling (If-None-Match, a 304 that reads as unchanged) and where it stops (a
// 403, three failed reads, the time limit), the action's three comment shapes as its own source
// writes them (the first comment, Claude's checklist in its place, then the header the run writes
// in front of the answer or the error), the few lines of the answer's fenced block the page acts
// on, what the page renders and what it never renders, whose comment counts as the answer, the
// issue read again before each question and replaced when closed, one press at a time, a sign-in
// that changed under the page, and Stop watching; and, since the assistant became the Ask Claude bar
// frozen at the console's foot (site branch claude/ask-claude-bar, 2026-10-18), the bar on every tab,
// its drawer, and the lines of the answer that would change something, offered as buttons that run
// the panel's own handlers only on a press (M, N). Each check states what the page promises; a FAIL
// is a defect. Every token is a stand-in.
//
// The mutants that prove the checks bite, each a [text, replacement] pair on the served script as
// e2e2/mutants/ records them for signin.test.mjs, are run by hand with MUTANT=<file> ONLY=<names>
// (recording them under e2e2/mutants/ waits on run-mutants.sh learning which file a mutant is for):
// accepting every comment as the answer (G), a bot comment from before the question (G), the
// progress phrase in place of the header (B), reads that go on through a 403 (E3), reads that never
// give up (E5), the cached issue not read again (D2), a second press while one is on its way (I),
// no size check (J), no sign-in check (K), a watch not read on after a sign-in (L), a link off
// GitHub left a link (H), the focus said as centred while hidden (G), any task labelled assistant
// hidden (C2).
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
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
// A check that needs another cadence serves its own copy (open's opts.constants).
let script = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(script.includes(a), 'mutant text not found: ' + a.slice(0, 60)); script = script.replace(a, b); }
script = script.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
function withConstants(source, constants) {
  for (const [name, value] of Object.entries(constants)) {
    const line = new RegExp('var ' + name + ' = [0-9]+;');
    assert.ok(line.test(source), 'the constant ' + name + ' was not found in the script');
    source = source.replace(line, 'var ' + name + ' = ' + value + ';');
  }
  return source;
}
const POLL = 400;
const AFTER = 1500;
script = withConstants(script, { ASSISTANT_POLL_MS: POLL, ASSISTANT_SLOW_MS: POLL, ASSISTANT_AFTER_MS: AFTER });

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
const RUN = 'https://github.com/acme/demo/actions/runs/9';
// The action's three bodies, as its own source writes them (claude-code-action, the version the
// template pins as v1 on 2026-10-18): src/github/operations/comments/common.ts createCommentBody for
// the first comment, with U+2026 after "working" and the spinner image; the checklist Claude keeps
// in its place as src/create-prompt/index.ts tells it to (a Todo list, the spinner, the job link, and
// no "working" phrase); and the header src/github/operations/comment-logic.ts writes in front of
// whatever the comment holds when the run ends, with U+2014 twice before the job link, one for a run
// that finished and one for a run that failed. The characters are escaped so this file stays ASCII.
const SPINNER = '<img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />';
const INITIAL = 'Claude Code is working\u2026 ' + SPINNER + '\n\nI\'ll analyze this and get back to you.\n\n[View job run](' + RUN + ')';
const TODO = '### Todo\n- [x] Read the board\n- [ ] Read the claim files\n- [ ] Answer ' + SPINNER + '\n\n[View job run](' + RUN + ')';
const FINISHED = '**Claude finished @tester\'s task in 1m 2s** \u2014\u2014 [View job](' + RUN + ')\n\n---\n\n';
const FAILED = '**Claude encountered an error after 30s** \u2014\u2014 [View job](' + RUN + ')\n\n---\n\nI\'ll analyze this and get back to you.';
// Claude may leave the spinner in its final text (its prompt names no end for it), so the answer keeps one
const ANSWER = FINISHED + '#7 is blocked on the schema; nightly holds it (docs/agents/claims/7.md, line 3). The queue has one task, #9. ' + SPINNER + '\n\n```symphony\nfocus #7\nfilter blocked\nshow blockers\nopen #9\nmerge #9\n```\n';
const bot = (body, created, updated) => ({ id: 2001, created_at: created || '2026-10-18T10:02:20Z', updated_at: updated || created || '2026-10-18T10:02:20Z', user: { login: 'claude[bot]', type: 'Bot' }, body });
const initialComment = bot(INITIAL);
const todoComment = bot(TODO, undefined, '2026-10-18T10:02:40Z');
const finalComment = bot(ANSWER, undefined, '2026-10-18T10:03:30Z');

function baseRoutes() {
  return {
    'GET /user': { login: 'tester' },
    'GET /repos/acme/demo': { full_name: 'acme/demo', default_branch: 'main', private: false, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' } },
    'GET /repos/acme/demo/issues': tasks,
    'GET /repos/acme/demo/contents/STATE.md': { encoding: 'base64', content: b64(board) },
    'GET /repos/acme/demo/branches/board': { commit: { commit: { committer: { date: now } } } },
    'GET /repos/acme/demo/contents/.github/symphony/workers': [],
    'GET /repos/acme/demo/contents/.github/symphony/assistant.md': { encoding: 'base64', content: b64('# The assistant\n') },
    'GET /repos/acme/demo/actions/runs': { workflow_runs: [] },
    'GET /repos/acme/demo/pulls': [],
    'GET /repos/acme/demo/collaborators/tester/permission': { permission: 'write', role_name: 'write', user: { login: 'tester' } },
  };
}
// the routes of a page that remembered #50 and asks on it: the issue, its label and its comments
function issueRoutes(routes, n, answer) {
  routes['GET /repos/acme/demo/issues/50'] = assistantIssue(50);
  routes['GET /repos/acme/demo/labels/assistant'] = { name: 'assistant' };
  routes['POST /repos/acme/demo/issues/50/comments'] = (url, req, call) => questionComment(n, call.body.body);
  routes['GET /repos/acme/demo/issues/50/comments'] = answer || ((url, req, call) => call.ifNoneMatch === 'W/"q"' ? resp(304, null) : resp(200, [questionComment(n, 'x')], { headers: { ETag: 'W/"q"' } }));
  return routes;
}
const browser = await chromium.launch();
await consoleTabs(browser);
// the mocked API records every call with the conditional header it carried; a route may be a
// function of the url, the request, the record and the route itself, may answer later (a promise),
// may hold the request open ('HOLD', the check then answers or aborts the route), and answers 304
// with no body
async function open(routes, opts) {
  opts = opts || {};
  const served = opts.constants ? withConstants(script, opts.constants) : script;
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
    if (typeof r === 'function') r = r(url, req, call, route);
    if (r && typeof r.then === 'function') r = await r;
    if (r === 'HOLD') return;
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
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: served }));
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
async function ask(page, text) {
  await page.fill('#cp-as-q', text);
  await page.click('#cp-as-ask');
}
const stateText = (page) => page.textContent('#cp-as-state');
const waitState = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('cp-as-state').textContent), re.source, { timeout: 8000 });
const posts = (calls) => calls.filter((c) => !/^GET /.test(c.key));
const reads = (calls) => calls.filter((c) => c.key === 'GET /repos/acme/demo/issues/50/comments');
const remembered = (page) => page.evaluate(() => localStorage.getItem('symphony_panel_assistant'));
const hidden = (page) => page.$$eval('#cp-app tr.control__off', (rows) => rows.map((r) => r.getAttribute('data-number')));

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
  assert.ok(!calls.some((c) => /assistant\.md/.test(c.key)), 'the assistant file was read although the person may not ask');
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

await check('A3: a repository whose workflow has no assistant file gets no box, in words, and nothing is written or looked for', async () => {
  const routes = baseRoutes();
  delete routes['GET /repos/acme/demo/contents/.github/symphony/assistant.md'];
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /no assistant yet/);
  const words = await stateText(page);
  console.log('     state:', words);
  assert.match(words, /^This repository's Claude workflow has no assistant yet: \.github\/symphony\/assistant\.md is not on its default branch, so a question here would run as an ordinary @claude mention, with the tools that write\./);
  assert.equal(await page.isVisible('#cp-as-box'), false, 'the question box is offered');
  assert.equal(posts(calls).length, 0, 'something was written: ' + posts(calls).map((c) => c.key));
  assert.ok(!calls.some((c) => c.key === 'GET /repos/acme/demo/issues/50'), 'the remembered issue was read although there is no assistant');
  assert.deepEqual(errors, []);
  await context.close();
});

// the first question and the answer, through the action's three comment shapes, then a second
// question on the same page
await check('B: the first question makes the label and the issue, posts the question with the state, polls conditionally, waits through the progress shapes and acts on the answer', async () => {
  const routes = baseRoutes();
  routes['GET /repos/acme/demo/labels/assistant'] = resp(404, { message: 'Not Found' });
  routes['POST /repos/acme/demo/labels'] = { name: 'assistant' };
  routes['POST /repos/acme/demo/issues'] = assistantIssue(50);
  routes['GET /repos/acme/demo/issues/50'] = assistantIssue(50);
  let questions = 0;
  routes['POST /repos/acme/demo/issues/50/comments'] = (url, req, call) => questionComment(++questions, call.body.body);
  let polls = 0, todoAt = 0;
  routes['GET /repos/acme/demo/issues/50/comments'] = (url, req, call) => {
    // the second question's reads: GitHub's since= leaves the first answer out, edited before it
    if (url.searchParams.get('since') === questionAt(2)) return call.ifNoneMatch === 'W/"four"' ? resp(304, null) : resp(200, [questionComment(2, '@claude And what next?')], { headers: { ETag: 'W/"four"' } });
    polls++;
    const q = questionComment(1, '@claude What is blocked?');
    if (polls === 1) return resp(200, [q, initialComment], { headers: { ETag: 'W/"one"' } });
    if (polls === 2) return call.ifNoneMatch === 'W/"one"' ? resp(304, null) : resp(500, { message: 'the second read was not conditional on the first ETag' });
    // Claude's checklist takes the first comment's place and stays longer than the grace the page
    // gives a late edit, so a page that took it for the answer would stop watching before the answer
    if (polls === 3) { todoAt = Date.now(); return resp(200, [q, todoComment], { headers: { ETag: 'W/"two"' } }); }
    if (Date.now() - todoAt < AFTER + 3 * POLL) return call.ifNoneMatch === 'W/"two"' ? resp(304, null) : resp(200, [q, todoComment], { headers: { ETag: 'W/"two"' } });
    return call.ifNoneMatch === 'W/"three"' ? resp(304, null) : resp(200, [q, finalComment], { headers: { ETag: 'W/"three"' } });
  };
  const { context, page, calls, errors } = await open(routes);
  await signIn(page);
  await waitState(page, /No assistant issue yet/);
  console.log('     state before:', await stateText(page));
  assert.match(await stateText(page), /the first question opens one, "Assistant: tester", labelled assistant/);
  assert.equal(posts(calls).length, 0, 'the page wrote before any press');
  assert.ok(await page.isVisible('#cp-as-box'), 'the box is offered to a person with write access');
  assert.equal(await page.isVisible('#cp-as-stop'), false, 'Stop watching shows before any question');

  await ask(page, 'What is blocked?');
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
  assert.equal(opened.body.body.split('\n\n').length, 3, 'the body is not three short paragraphs: ' + JSON.stringify(opened.body.body));
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
  assert.equal(await page.textContent('#cp-as-answer'), '', 'the first comment was rendered as an answer');
  // the checklist, which says no "working", is still the run's progress: the page keeps waiting
  const t0 = Date.now();
  while (!todoAt && Date.now() - t0 < 8000) await sleep(50);
  assert.ok(todoAt, 'the checklist was never read');
  await sleep(AFTER + POLL);
  assert.match(await stateText(page), /Waiting for the answer on #50/, 'the checklist was taken for the answer: ' + await stateText(page));
  assert.match(await stateText(page), /The run is at work/);
  assert.equal(await page.textContent('#cp-as-answer'), '', 'the checklist was rendered as an answer');
  assert.ok(await page.isVisible('#cp-as-stop'), 'the watch ended on the checklist');
  await page.waitForFunction(() => /blocked on the schema/.test(document.getElementById('cp-as-answer').textContent), null, { timeout: 8000 });
  const read = reads(calls);
  assert.ok(read.length >= 4, 'fewer than four reads: ' + read.length);
  assert.equal(new URL(read[0].url).searchParams.get('since'), questionAt(1), 'the read is not since the question');
  assert.equal(read[0].ifNoneMatch, '', 'the first read carried a condition');
  assert.equal(read[1].ifNoneMatch, 'W/"one"', 'the second read did not carry the first ETag');
  assert.equal(read[2].ifNoneMatch, 'W/"one"', 'the ETag was dropped after the 304');
  assert.equal(read[3].ifNoneMatch, 'W/"two"', 'the checklist\'s ETag was not carried');
  console.log('     reads:', read.length, 'If-None-Match:', read.map((r) => r.ifNoneMatch || '-').join(' '));

  // the answer, rendered through the safe renderer, with the action's image gone and its header kept
  const html = await page.innerHTML('#cp-as-answer');
  assert.ok(!/<img/.test(html), 'HTML of the comment survived the renderer');
  assert.ok(!/&lt;img/.test(html), 'the action\'s spinner image shows as words');
  assert.ok(/<a href="https:\/\/github.com\/acme\/demo\/actions\/runs\/9"/.test(html), 'the link to the run is not rendered');
  assert.match(await page.textContent('#cp-as-answer'), /Claude finished @tester's task in 1m 2s/);
  assert.match(await stateText(page), /The assistant answered on #50/);
  assert.match(await stateText(page), /the page watches 2 seconds more for a late edit/);
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
  // merge #9 names an issue, not a pull request the page lists, so no button is offered for it
  assert.match(actions, /Not offered: #9 is not an open pull request the page lists\./);
  assert.equal(await page.$$eval('#cp-as-actions button', (b) => b.length), 0, 'a button was offered for an issue that is no pull request');
  assert.equal(posts(calls).length, 3, 'more than the label, the issue and the question were written: ' + posts(calls).map((c) => c.key));
  assert.equal(await remembered(page), '{"acme/demo":50}', 'the issue is not remembered');
  // the watch ends by itself a while after the answer
  await waitState(page, /Watching stopped/);
  assert.equal(await page.isVisible('#cp-as-stop'), false, 'Stop watching stays after the watch ended');
  assert.ok(await page.isVisible('#cp-as-again'), 'Ask again is not offered');
  assert.equal(await page.isDisabled('#cp-as-ask'), false, 'Ask the assistant stays off after the answer');
  const readsThen = reads(calls).length;
  await sleep(POLL * 3);
  assert.equal(reads(calls).length, readsThen, 'the page kept reading after the watch ended');

  // C: a second question on the same page reads the issue again, reuses it and carries the focus,
  // the filter and the section
  const before = calls.length;
  await ask(page, '@claude And what next?');
  await waitState(page, /Waiting for the answer on #50/);
  const later = calls.slice(before);
  assert.ok(later.some((c) => c.key === 'GET /repos/acme/demo/issues/50'), 'the issue was not read again before the second question');
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

await check('C2: a page opened later reuses the issue remembered in storage, looks for no other, leaves it out of the task tables and keeps a task someone labelled assistant', async () => {
  const routes = issueRoutes(baseRoutes(), 2);
  routes['GET /repos/acme/demo/issues'] = tasks.concat([assistantIssue(50), issue(11, 'Mislabelled task', ['todo', 'assistant'])]);
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  console.log('     state:', await stateText(page));
  assert.ok(!calls.some((c) => c.key === 'GET /repos/acme/demo/issues' && /labels=assistant/.test(c.url)), 'the page searched although it remembered the issue');
  await page.waitForFunction(() => /Queue: /.test(document.getElementById('cp-summary').textContent));
  assert.ok(!/Assistant/.test(await page.textContent('#cp-other')), 'the assistant issue is named among the other issues: ' + await page.textContent('#cp-other'));
  assert.ok(!(await page.$('#cp-app tr[data-number="50"]')), 'the assistant issue is in a task table');
  assert.ok(await page.$('#cp-queue tbody tr[data-number="11"]'), 'a task labelled assistant by hand is hidden from the Queue');
  await ask(page, 'Hello?');
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
  assert.equal(await remembered(page), '{}', 'the closed issue is still remembered');
  await ask(page, 'Again?');
  await waitState(page, /Waiting for the answer on #51/);
  assert.ok(!posts(calls).some((c) => c.key === 'POST /repos/acme/demo/labels'), 'the label was made although it is there');
  const opened = posts(calls).find((c) => c.key === 'POST /repos/acme/demo/issues');
  assert.ok(opened, 'no new issue was opened');
  assert.equal(opened.body.title, 'Assistant: tester');
  assert.ok(posts(calls).some((c) => c.key === 'POST /repos/acme/demo/issues/51/comments'), 'the question did not go to the new issue');
  assert.equal(await remembered(page), '{"acme/demo":51}');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('D2: an issue closed between two questions is read as closed before the second, which opens another', async () => {
  const routes = issueRoutes(baseRoutes(), 1, resp(200, [questionComment(1, 'x'), finalComment], { headers: { ETag: 'W/"a"' } }));
  routes['POST /repos/acme/demo/issues'] = assistantIssue(51);
  routes['POST /repos/acme/demo/issues/51/comments'] = (url, req, call) => questionComment(2, call.body.body);
  routes['GET /repos/acme/demo/issues/51/comments'] = resp(200, [questionComment(2, 'y')], { headers: { ETag: 'W/"b"' } });
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'First');
  await waitState(page, /Watching stopped/);
  // the person closes the issue on GitHub to retire it
  routes['GET /repos/acme/demo/issues/50'] = assistantIssue(50, 'closed');
  const before = calls.length;
  await ask(page, 'Second');
  await waitState(page, /Waiting for the answer on #51/);
  const later = calls.slice(before);
  console.log('     calls on the second question:', later.map((c) => c.key).join(', '));
  assert.ok(!later.some((c) => c.key === 'POST /repos/acme/demo/issues/50/comments'), 'the question was posted on the closed issue');
  assert.ok(later.some((c) => c.key === 'POST /repos/acme/demo/issues'), 'no new issue was opened');
  assert.ok(later.some((c) => c.key === 'POST /repos/acme/demo/issues/51/comments'), 'the question did not go to the new issue');
  assert.equal(await remembered(page), '{"acme/demo":51}');
  assert.equal(await page.getAttribute('#cp-as-state a', 'href'), 'https://github.com/acme/demo/issues/51', 'the state line still names the closed issue');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('D3: a remembered issue that lost its label is kept and said, a question on it refused until the label is back, then sent', async () => {
  const routes = issueRoutes(baseRoutes(), 1);
  routes['GET /repos/acme/demo/issues/50'] = issue(50, 'Assistant: tester', []);
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /carries no label assistant/);
  const words = await stateText(page);
  console.log('     state:', words);
  assert.match(words, /^#50 is open but carries no label assistant, so the Claude workflow would not answer on it as the assistant: add the label on GitHub/);
  assert.ok(await page.isVisible('#cp-as-box'), 'the box is not offered');
  assert.equal(await remembered(page), '{"acme/demo":50}', 'the unlabelled issue was forgotten, so another would be opened in its place');
  await ask(page, 'Now?');
  await waitState(page, /carries no label assistant/);
  await sleep(POLL);
  assert.equal(posts(calls).length, 0, 'something was written on the unlabelled issue: ' + posts(calls).map((c) => c.key));
  assert.equal(await page.isDisabled('#cp-as-ask'), false, 'Ask stays off after the refusal');
  // the label is put back on GitHub; the next press reads the issue again and goes
  routes['GET /repos/acme/demo/issues/50'] = assistantIssue(50);
  await page.click('#cp-as-ask');
  await waitState(page, /Waiting for the answer on #50/);
  assert.ok(posts(calls).some((c) => c.key === 'POST /repos/acme/demo/issues/50/comments'), 'the question did not go once the label was back');
  assert.ok(!posts(calls).some((c) => c.key === 'POST /repos/acme/demo/issues'), 'a new issue was opened');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E: Stop watching stops the reads, says where the question is, and offers Ask again', async () => {
  const routes = issueRoutes(baseRoutes(), 4);
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Slow one');
  await waitState(page, /Waiting for the answer on #50/);
  await sleep(POLL * 4);
  assert.ok(reads(calls).length >= 2, 'the page is not reading the issue: ' + reads(calls).length);
  assert.ok(reads(calls).slice(1).every((c) => c.ifNoneMatch === 'W/"q"'), 'a read after the first carried no ETag');
  await page.click('#cp-as-stop');
  await waitState(page, /^Watching stopped\. The question is on #50/);
  const after = reads(calls).length;
  await sleep(POLL * 5);
  assert.equal(reads(calls).length, after, 'the page read the issue after Stop watching');
  console.log('     reads before stop:', after, 'after a wait:', reads(calls).length, '| state:', await stateText(page));
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
  await ask(page, 'Two at once');
  await waitState(page, /One question at a time/);
  assert.equal(posts(calls).length, written, 'a second question was sent while one waited');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E2: a run that failed is said as failed, its comment shown and not acted on, and the grace is said in seconds', async () => {
  const routes = issueRoutes(baseRoutes(), 1, (url, req, call) => call.ifNoneMatch === 'W/"e"' ? resp(304, null) : resp(200, [questionComment(1, 'x'), bot(FAILED + '\n\n```symphony\nfilter todo\n```\n', undefined, '2026-10-18T10:03:00Z')], { headers: { ETag: 'W/"e"' } }));
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' }, constants: { ASSISTANT_AFTER_MS: 90000 } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Why?');
  await waitState(page, /The run failed on #50/);
  const words = await stateText(page);
  console.log('     state:', words);
  assert.match(words, /^The run failed on #50, just now \(Claude encountered an error\): its log is behind View job in the comment below, and Ask again sends the question once more; the page watches 90 seconds more for a late edit\.$/);
  assert.ok(/admin__warn/.test(await page.getAttribute('#cp-as-state', 'class')), 'the failure is not marked as a warning');
  assert.match(await page.textContent('#cp-as-answer'), /Claude encountered an error after 30s/);
  assert.equal(await page.textContent('#cp-as-actions'), '', 'a failed run\'s lines were acted on');
  assert.deepEqual(await hidden(page), [], 'a failed run\'s filter hid rows');
  assert.ok(await page.isVisible('#cp-as-again'), 'Ask again is not offered');
  await page.click('#cp-as-stop');
  await waitState(page, /^Watching stopped\. The question and the answer are on #50\.$/);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E3: a 403 on the reads stops the watch at once, with GitHub\'s words', async () => {
  const routes = issueRoutes(baseRoutes(), 1, resp(403, { message: 'API rate limit exceeded for user ID 1.' }));
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Limit?');
  await waitState(page, /watching stopped/);
  const words = await stateText(page);
  console.log('     state:', words);
  assert.match(words, /^GitHub could not be read \(GitHub's rate limit for this token is reached \(403\)\. Wait a minute, then press Refresh\.\); watching stopped\. The question is on #50, where the answer comes when the run ends\.$/);
  const after = reads(calls).length;
  await sleep(POLL * 5);
  assert.equal(reads(calls).length, after, 'the page read on through the 403');
  assert.equal(after, 1, 'more than one read before the stop: ' + after);
  assert.equal(await page.isVisible('#cp-as-stop'), false, 'Stop watching stays');
  assert.ok(await page.isVisible('#cp-as-again'), 'Ask again is not offered');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E4: three failed reads in a row stop the watch, the first two said as tried again', async () => {
  const routes = issueRoutes(baseRoutes(), 1, resp(500, { message: 'Server Error' }));
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Flaky?');
  await waitState(page, /the page tries again/);
  await waitState(page, /watching stopped/);
  const words = await stateText(page);
  console.log('     state:', words, '| reads:', reads(calls).length);
  assert.match(words, /^GitHub could not be read \(GitHub answered 500: Server Error\.\); watching stopped\. The question is on #50/);
  await sleep(POLL * 5);
  assert.equal(reads(calls).length, 3, 'not three reads before the stop: ' + reads(calls).length);
  assert.equal(await page.isVisible('#cp-as-stop'), false, 'Stop watching stays');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('E5: a run that never answers is given up on at the limit, in words, and read no more', async () => {
  const routes = issueRoutes(baseRoutes(), 1);
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' }, constants: { ASSISTANT_GIVE_UP_MS: POLL * 4 } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Ever?');
  await waitState(page, /No final answer after/);
  const words = await stateText(page);
  console.log('     state:', words, '| reads:', reads(calls).length);
  assert.match(words, /^No final answer after 2 seconds; watching stopped\. The run is on the Actions tab of acme\/demo\. The question is on #50, where the answer comes when the run ends\.$/);
  const after = reads(calls).length;
  assert.ok(after >= 2 && after <= 4, 'an odd number of reads before the limit: ' + after);
  await sleep(POLL * 4);
  assert.equal(reads(calls).length, after, 'the page read on past the limit');
  assert.equal(await page.isVisible('#cp-as-stop'), false, 'Stop watching stays');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('F: a repository change while waiting stops the watch, and the assistant starts over for the new repository', async () => {
  const routes = issueRoutes(baseRoutes(), 5, resp(200, [questionComment(5, '@claude Where?')], { headers: { ETag: 'W/"q"' } }));
  routes['GET /repos/acme/beta'] = { full_name: 'acme/beta', default_branch: 'main', private: false, topics: ['symphony'], id: 125, owner: { id: 77, login: 'acme' } };
  routes['GET /repos/acme/beta/issues'] = [];
  routes['GET /repos/acme/beta/contents/STATE.md'] = { encoding: 'base64', content: b64('# Board\n') };
  routes['GET /repos/acme/beta/branches/board'] = { commit: { commit: { committer: { date: now } } } };
  routes['GET /repos/acme/beta/contents/.github/symphony/workers'] = [];
  routes['GET /repos/acme/beta/contents/.github/symphony/assistant.md'] = { encoding: 'base64', content: b64('# The assistant\n') };
  routes['GET /repos/acme/beta/actions/runs'] = { workflow_runs: [] };
  routes['GET /repos/acme/beta/pulls'] = [];
  routes['GET /repos/acme/beta/collaborators/tester/permission'] = { permission: 'admin' };
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}', symphony_panel_repos: JSON.stringify(['acme/demo', 'acme/beta']) } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Where?');
  await waitState(page, /Waiting for the answer on #50/);
  await page.selectOption('#cp-repo', 'acme/beta');
  await waitState(page, /No assistant issue yet in acme\/beta/);
  const read = reads(calls).length;
  await sleep(POLL * 4);
  assert.equal(reads(calls).length, read, 'acme/demo\'s issue is still read under acme/beta');
  assert.equal(await page.textContent('#cp-as-actions'), '');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('G: only a bot\'s comment from after the question is the answer; a focus the filter hides is said so', async () => {
  const q = questionComment(1, 'x');
  const stranger = { id: 3001, created_at: '2026-10-18T10:02:30Z', updated_at: '2026-10-18T10:02:30Z', user: { login: 'someone', type: 'User' }, body: FINISHED + 'Try this\n\n```symphony\nfilter todo\nopen #9\n```' };
  const earlier = { id: 1999, created_at: '2026-10-18T09:00:00Z', updated_at: '2026-10-18T10:02:35Z', user: { login: 'claude[bot]', type: 'Bot' }, body: FINISHED + 'An older answer, edited since.\n\n```symphony\nfilter blocked\n```' };
  const answer = bot(FINISHED + 'The queue has #9.\n\n```symphony\nfilter blocked\nfocus #9\n```\n', '2026-10-18T10:02:50Z', '2026-10-18T10:03:30Z');
  let polls = 0;
  const routes = issueRoutes(baseRoutes(), 1, (url, req, call) => {
    polls++;
    // the two that are not the answer are served through the fourth read, so the look below, made
    // right after the third, never lands on the read that brings the answer
    if (polls <= 4) return call.ifNoneMatch === 'W/"g"' ? resp(304, null) : resp(200, [q, stranger, earlier], { headers: { ETag: 'W/"g"' } });
    return call.ifNoneMatch === 'W/"h"' ? resp(304, null) : resp(200, [q, stranger, earlier, answer], { headers: { ETag: 'W/"h"' } });
  });
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'What is in the queue?');
  await waitState(page, /Waiting for the answer on #50/);
  const t0 = Date.now();
  while (polls < 3 && Date.now() - t0 < 8000) await sleep(50);
  assert.ok(polls >= 3, 'fewer than three reads: ' + polls);
  await sleep(POLL / 2);
  assert.match(await stateText(page), /Waiting for the answer on #50/, 'a stranger\'s or an older comment was taken for the answer: ' + await stateText(page));
  assert.equal(await page.textContent('#cp-as-answer'), '', 'a comment that is not the action\'s was rendered');
  assert.equal(await page.textContent('#cp-as-actions'), '', 'a comment that is not the action\'s was acted on');
  assert.deepEqual(await hidden(page), [], 'a comment that is not the action\'s filtered the tables');
  await page.waitForFunction(() => /The queue has #9/.test(document.getElementById('cp-as-answer').textContent), null, { timeout: 8000 });
  const actions = await page.textContent('#cp-as-actions');
  console.log('     actions:', actions);
  assert.match(actions, /Filtered the task tables to the tasks labelled blocked or blocker: 1 of 4/);
  assert.match(actions, /#9 is the focus, but the filter \(the tasks labelled blocked or blocker\) hides its row; Show all tasks, above the tables, shows it\./);
  assert.ok(await page.$('#cp-queue tbody tr[data-number="9"].control__off.control__focus'), 'row 9 is not both hidden and marked');
  assert.ok(!(await page.evaluate(() => window.__scrolled)).some((s) => /^TR:#9/.test(s)), 'a hidden row was scrolled to');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H: a hostile answer renders no script, handler, image or link off GitHub', async () => {
  const hostile = FINISHED + '[Open #9 on GitHub](https://evil.example/) and [x](javascript:alert(1)) <a href=x onclick=alert(1)>y</a> <script>alert(1)</script> [z](https://a/"onmouseover=alert(1)) <img src=x onerror=alert(1)> [the run](' + RUN + ')\n\n```symphony\nopen #9\n```\n';
  const routes = issueRoutes(baseRoutes(), 1, (url, req, call) => call.ifNoneMatch === 'W/"x"' ? resp(304, null) : resp(200, [questionComment(1, 'x'), bot(hostile, undefined, '2026-10-18T10:03:30Z')], { headers: { ETag: 'W/"x"' } }));
  const { context, page, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Anything?');
  await waitState(page, /The assistant answered on #50/);
  const seen = await page.evaluate(() => {
    const box = document.getElementById('cp-as-answer');
    const bad = [];
    for (const e of box.querySelectorAll('*')) for (const a of e.attributes) if (/^on/i.test(a.name)) bad.push(e.tagName + ' ' + a.name);
    return {
      tags: Array.from(box.querySelectorAll('script,img,iframe,object,embed')).map((e) => e.tagName),
      handlers: bad,
      links: Array.from(box.querySelectorAll('a')).map((a) => a.protocol + '//' + a.host + ' ' + a.getAttribute('rel') + ' ' + a.getAttribute('target')),
      text: box.textContent,
    };
  });
  console.log('     links:', JSON.stringify(seen.links), '| text:', seen.text.slice(0, 160));
  assert.deepEqual(seen.tags, [], 'a tag survived the renderer');
  assert.deepEqual(seen.handlers, [], 'a handler survived the renderer');
  assert.ok(seen.links.length >= 2, 'the GitHub links are not rendered: ' + seen.links);
  assert.ok(seen.links.every((l) => /^https:\/\/github\.com noopener _blank$/.test(l)), 'a link off github.com, or without noopener, is rendered: ' + seen.links);
  assert.match(seen.text, /Open #9 on GitHub \(https:\/\/evil\.example\/\)/, 'the link off GitHub is not shown as words with its address');
  assert.match(seen.text, /javascript:alert\(1\)/, 'the javascript: link is not shown as words');
  assert.doesNotMatch(await page.innerHTML('#cp-as-answer'), /<img|<script|href="javascript/i);
  assert.equal(await page.getAttribute('#cp-as-actions a', 'href'), 'https://github.com/acme/demo/issues/9');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('I: two presses of Ask in a row make one issue and one question', async () => {
  const routes = baseRoutes();
  const slow = (value) => () => sleep(300).then(() => value);
  routes['GET /repos/acme/demo/labels/assistant'] = resp(404, { message: 'Not Found' });
  routes['POST /repos/acme/demo/labels'] = slow({ name: 'assistant' });
  let opened = 50;
  routes['POST /repos/acme/demo/issues'] = () => sleep(300).then(() => assistantIssue(++opened));
  routes['GET /repos/acme/demo/issues/51'] = assistantIssue(51);
  routes['POST /repos/acme/demo/issues/51/comments'] = (url, req, call) => sleep(300).then(() => questionComment(1, call.body.body));
  routes['POST /repos/acme/demo/issues/52/comments'] = (url, req, call) => sleep(300).then(() => questionComment(1, call.body.body));
  routes['GET /repos/acme/demo/issues/51/comments'] = resp(200, [questionComment(1, 'x')], { headers: { ETag: 'W/"q"' } });
  const { context, page, calls, errors } = await open(routes);
  await signIn(page);
  await waitState(page, /No assistant issue yet/);
  await page.fill('#cp-as-q', 'Twice?');
  await page.evaluate(() => { const b = document.getElementById('cp-as-ask'); b.click(); b.click(); });
  await sleep(100);
  assert.equal(await page.isDisabled('#cp-as-ask'), true, 'Ask stays on while the writes are on their way');
  // a press forced through while the first is on its way is refused in words
  await page.evaluate(() => { const b = document.getElementById('cp-as-ask'); b.disabled = false; b.click(); });
  await waitState(page, /The question is on its way/);
  await waitState(page, /Waiting for the answer on #51/);
  await sleep(POLL * 2);
  const written = posts(calls).map((c) => c.key);
  console.log('     writes:', written.join(', '));
  assert.deepEqual(written, ['POST /repos/acme/demo/labels', 'POST /repos/acme/demo/issues', 'POST /repos/acme/demo/issues/51/comments'], 'more than one issue or question was written');
  assert.equal(await remembered(page), '{"acme/demo":51}');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('J: a question longer than GitHub takes is refused in words, before any write', async () => {
  const routes = baseRoutes();
  routes['GET /repos/acme/demo/labels/assistant'] = resp(404, { message: 'Not Found' });
  routes['POST /repos/acme/demo/labels'] = { name: 'assistant' };
  routes['POST /repos/acme/demo/issues'] = assistantIssue(50);
  const { context, page, calls, errors } = await open(routes);
  await signIn(page);
  await waitState(page, /No assistant issue yet/);
  await page.fill('#cp-as-q', 'x'.repeat(70000));
  await page.click('#cp-as-ask');
  await waitState(page, /at most 65536 characters/);
  const words = await stateText(page);
  console.log('     state:', words);
  assert.match(words, /^GitHub takes a comment of at most 65536 characters, and this question with the page's state is 70093: shorten it by 4557\.$/);
  assert.equal(posts(calls).length, 0, 'something was written: ' + posts(calls).map((c) => c.key));
  assert.equal(await page.isDisabled('#cp-as-ask'), false, 'Ask stays off');
  assert.equal((await page.inputValue('#cp-as-q')).length, 70000, 'the question was dropped from the box');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('K: a sign-in that changed under the page is refused in words, and nothing is written as the other account', async () => {
  const routes = issueRoutes(baseRoutes(), 1);
  routes['GET /user'] = (url, req, call) => ({ login: /OTHER/.test(call.auth) ? 'other' : 'tester' });
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await page.check('#cp-keep');
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  // another tab of the browser keeps another account's token
  await page.evaluate(() => { localStorage.setItem('symphony_panel_token', 'github_pat_OTHER'); window.dispatchEvent(new StorageEvent('storage', { key: 'symphony_panel_token', newValue: 'github_pat_OTHER' })); });
  await page.waitForFunction(() => /Signed in as other/.test(document.getElementById('cp-who').textContent), null, { timeout: 5000 });
  await ask(page, 'Whose issue is this?');
  await waitState(page, /The sign-in changed to other/);
  const words = await stateText(page);
  console.log('     state:', words);
  assert.match(words, /^The sign-in changed to other since the assistant was read for tester; press Refresh, and the assistant starts over for other\.$/);
  await sleep(POLL);
  assert.equal(posts(calls).length, 0, 'something was written: ' + posts(calls).map((c) => c.key + ' as ' + c.auth));
  assert.deepEqual(errors, []);
  await context.close();
});

await check('L: a watch whose read failed while the tab signed out is read on when the same person signs in again', async () => {
  const routes = issueRoutes(baseRoutes(), 1);
  let held = null;
  routes['GET /repos/acme/demo/issues/50/comments'] = (url, req, call, route) => {
    if (reads(calls).length === 2 && !held) { held = route; return 'HOLD'; }
    return call.ifNoneMatch === 'W/"q"' ? resp(304, null) : resp(200, [questionComment(1, 'x')], { headers: { ETag: 'W/"q"' } });
  };
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Hold on');
  await waitState(page, /Waiting for the answer on #50/);
  const start = Date.now();
  while (!held && Date.now() - start < 5000) await sleep(50);
  assert.ok(held, 'no read was held in flight');
  await page.click('#cp-signout');
  await page.waitForSelector('#cp-gate:not(.hidden)');
  await held.abort('failed');
  await sleep(POLL * 2);
  const before = reads(calls).length;
  await signIn(page);
  await waitState(page, /Waiting for the answer on #50/);
  await sleep(POLL * 4);
  const since = reads(calls).length - before;
  console.log('     reads since signing in again:', since, '| state:', (await stateText(page)).slice(0, 60));
  assert.ok(since >= 2, 'the watch was left with no read after the sign-in: ' + since);
  assert.ok(await page.isVisible('#cp-as-stop'), 'Stop watching is not offered for the watch that goes on');
  await page.click('#cp-as-stop');
  await waitState(page, /^Watching stopped\./);
  assert.deepEqual(errors, []);
  await context.close();
});

// the answer that proposes changes: each that holds together is a button, the rest are said
const OFFERS = FINISHED + 'Run the workers, give #9 to nightly, and merge #12 once you have looked.\n\n```symphony\nrun workers\ngive #9 to nightly\ngive #5 to nightly\ngive #9 to nobody\nmerge #12\nmerge #13\ntask Write the README\nask #9 Please add tests\ntab tokens\ndelete everything\n```\n';
function offerRoutes(answerBody) {
  const routes = issueRoutes(baseRoutes(), 1, (url, req, call) => resp(200, [questionComment(1, 'x'), bot(answerBody, '2026-10-18T10:02:20Z', '2026-10-18T10:03:30Z')], { headers: { ETag: 'W/"a"' } }));
  routes['GET /repos/acme/demo/contents/.github/symphony/workers'] = [{ type: 'file', name: 'nightly.json' }];
  routes['GET /repos/acme/demo/contents/.github/symphony/workers/nightly.json'] = { encoding: 'base64', content: b64(JSON.stringify({ name: 'nightly', runs: 'actions', about: 'the nightly worker' })) };
  routes['GET /repos/acme/demo/pulls'] = [
    { number: 12, title: 'Add the README', html_url: 'https://github.com/acme/demo/pull/12', draft: false, head: { ref: 'claude/9', sha: 'abc12' }, base: { ref: 'main' }, updated_at: now },
    { number: 13, title: 'Half done', html_url: 'https://github.com/acme/demo/pull/13', draft: true, head: { ref: 'claude/7', sha: 'abc13' }, base: { ref: 'main' }, updated_at: now },
  ];
  routes['GET /repos/acme/demo/commits/abc12/check-runs'] = { total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] };
  routes['GET /repos/acme/demo/commits/abc13/check-runs'] = { total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] };
  routes['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches'] = resp(204, null);
  routes['GET /repos/acme/demo/labels/worker%3Anightly'] = { name: 'worker:nightly' };
  routes['POST /repos/acme/demo/issues/9/labels'] = [{ name: 'todo' }, { name: 'worker:nightly' }];
  routes['PUT /repos/acme/demo/pulls/12/merge'] = { merged: true };
  return routes;
}
const actButton = (page, re) => page.evaluateHandle((src) => Array.prototype.filter.call(document.querySelectorAll('#cp-as-actions button'), (b) => new RegExp(src).test(b.textContent))[0] || null, re.source);
async function press(page, re) {
  const b = await actButton(page, re);
  assert.ok(await b.evaluate((x) => !!x), 'no button ' + re);
  await b.evaluate((x) => x.click());
}

await check('M: the bar sits outside every tab, frozen on each, and the answer opens in a drawer over the stage', async () => {
  const routes = issueRoutes(baseRoutes(), 1, (url, req, call) => resp(200, [questionComment(1, 'x'), finalComment], { headers: { ETag: 'W/"a"' } }));
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  assert.equal(await page.$eval('#cp-askbar', (b) => getComputedStyle(b).display), 'none', 'the bar shows on the sign-in gate');
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  const placed = await page.evaluate(() => ({
    inTab: !!document.getElementById('cp-as-q').closest('[data-tab-panel]'),
    inBar: !!document.getElementById('cp-as-q').closest('#cp-askbar'),
    drawerInStage: !!document.getElementById('cp-as-drawer').closest('.console__stage'),
    drawerInBar: !!document.getElementById('cp-as-drawer').closest('#cp-askbar'),
  }));
  assert.deepEqual(placed, { inTab: false, inBar: true, drawerInStage: true, drawerInBar: false });
  // on every tab the box is on screen, inside the window, and the page does not scroll
  for (const tab of ['command', 'board', 'tasks', 'pulls', 'runs', 'workers', 'ask', 'tokens', 'share', 'repos', 'about']) {
    await page.evaluate((t) => document.querySelector('.console__rail [data-tab="' + t + '"]').click(), tab);
    const r = await page.evaluate(() => { const b = document.getElementById('cp-as-q').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: window.innerHeight, y: window.pageYOffset }; });
    assert.ok(r.top > 0 && r.bottom <= r.h, 'the box is off screen on ' + tab + ': ' + JSON.stringify(r));
    assert.equal(r.y, 0, 'opening ' + tab + ' moved the window');
  }
  assert.equal(await page.isVisible('#cp-as-drawer'), false, 'the drawer is open before any answer');
  assert.equal(await page.isVisible('#cp-as-toggle'), false, 'Answer is offered before any answer');
  // Enter sends; the drawer opens with the answer, Close and Escape shut it, Answer opens it again
  await page.fill('#cp-as-q', 'What is blocked?');
  await page.press('#cp-as-q', 'Enter');
  await page.waitForFunction(() => /blocked on the schema/.test(document.getElementById('cp-as-answer').textContent), null, { timeout: 8000 });
  assert.ok(posts(calls).some((c) => c.key === 'POST /repos/acme/demo/issues/50/comments'), 'Enter did not send the question');
  assert.ok(await page.isVisible('#cp-as-drawer'), 'the drawer did not open with the answer');
  await page.click('#cp-as-close');
  assert.equal(await page.isVisible('#cp-as-drawer'), false, 'Close left the drawer open');
  assert.equal(await page.textContent('#cp-as-toggle'), 'Answer');
  await page.click('#cp-as-toggle');
  assert.ok(await page.isVisible('#cp-as-drawer'), 'Answer did not open the drawer');
  await page.press('#cp-as-close', 'Escape');
  assert.equal(await page.isVisible('#cp-as-drawer'), false, 'Escape left the drawer open');
  // Shift+Enter is a new line, not a question
  const before = posts(calls).length;
  await page.click('#cp-as-q');
  await page.keyboard.type('one');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('two');
  assert.equal(await page.inputValue('#cp-as-q'), 'one\ntwo');
  assert.equal(posts(calls).length, before, 'Shift+Enter sent something');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('N: the lines that would change something are buttons that write nothing until pressed, each press runs the panel\'s own handler once', async () => {
  const { context, page, calls, errors } = await open(offerRoutes(OFFERS), { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await page.waitForFunction(() => /Add the README/.test(document.getElementById('cp-pulls').textContent) && /nightly/.test(document.getElementById('cp-workers').textContent), null, { timeout: 8000 });
  await ask(page, 'What now?');
  await page.waitForFunction(() => document.querySelectorAll('#cp-as-actions button').length >= 6, null, { timeout: 8000 });
  // SHOT=<file.png> keeps a picture of the bar with its drawer open, for the notes
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  const actions = await page.textContent('#cp-as-actions');
  console.log('     actions:', actions);
  const labels = await page.$$eval('#cp-as-actions button', (b) => b.map((x) => x.textContent));
  assert.deepEqual(labels, ['Run the workers now', 'Give #9 to nightly', 'Merge #12...', 'Merge #13...', 'Draft the task', 'Draft @claude on #9']);
  assert.match(actions, /Not offered: #5 is not an issue the page can give/);
  assert.match(actions, /Not offered: no worker named nobody is registered\./);
  assert.match(actions, /Opened the Tokens tab\./);
  assert.match(actions, /Not acted on, shown as written: delete everything/);
  assert.equal(await page.getAttribute('[data-tab="tokens"]', 'aria-selected'), 'true', 'tab tokens did not open the Tokens tab');
  // nothing beyond the question is written by the answer itself
  const written = () => posts(calls).filter((c) => c.key !== 'POST /repos/acme/demo/issues/50/comments');
  assert.deepEqual(written().map((c) => c.key), [], 'the answer wrote by itself');

  await press(page, /^Run the workers now$/);
  await page.waitForFunction(() => /the workers is queued/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.deepEqual(written().map((c) => c.key), ['POST /repos/acme/demo/actions/workflows/workers.yml/dispatches']);
  assert.ok(await (await actButton(page, /^Run the workers now$/)).evaluate((x) => x.disabled), 'the button can be pressed twice');

  await press(page, /^Give #9 to nightly$/);
  await page.waitForFunction(() => /#9 is given to nightly/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  const label = written().find((c) => c.key === 'POST /repos/acme/demo/issues/9/labels');
  assert.deepEqual(label && label.body, { labels: ['worker:nightly'] });

  // merge arms the row's own Merge on the Pull requests tab; the merge waits for its Confirm
  await press(page, /^Merge #12/);
  assert.equal(await page.getAttribute('[data-tab="pulls"]', 'aria-selected'), 'true', 'merge did not open the Pull requests tab');
  assert.equal(await page.isVisible('#cp-as-drawer'), false, 'the drawer stays over the row to confirm');
  assert.match(await page.textContent('#msg'), /Press "Confirm: merge #12 into main" beside #12/);
  assert.ok(!written().some((c) => /merge$/.test(c.key)), 'the merge ran without its confirm');
  await page.click('#tab-pulls button:has-text("Confirm: merge #12")');
  await page.waitForFunction(() => /#12 is merged/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.deepEqual(written().find((c) => c.key === 'PUT /repos/acme/demo/pulls/12/merge').body, { merge_method: 'merge', sha: 'abc12' });
  await page.click('#cp-as-toggle');
  await press(page, /^Merge #13/);
  assert.match(await page.textContent('#msg'), /#13 cannot be merged from here yet: it is a draft\./);

  // the drafts fill a form and send nothing
  const n = written().length;
  await page.click('#cp-as-toggle');
  await press(page, /^Draft the task$/);
  assert.equal(await page.inputValue('#cp-task-title'), 'Write the README');
  assert.equal(await page.getAttribute('[data-tab="tasks"]', 'aria-selected'), 'true');
  await page.click('#cp-as-toggle');
  await press(page, /^Draft @claude on #9$/);
  assert.equal(await page.inputValue('#cp-prompt'), 'Please add tests');
  assert.equal(await page.inputValue('#cp-prompt-target'), '9');
  assert.equal(await page.getAttribute('[data-tab="ask"]', 'aria-selected'), 'true');
  assert.equal(written().length, n, 'a draft wrote something');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('N2: a button kept across a Refresh still runs once, and one from before another sign-in runs nothing', async () => {
  const routes = offerRoutes(FINISHED + 'Run them.\n\n```symphony\nrun workers\nrun board\n```\n');
  routes['GET /user'] = (url, req, call) => ({ login: /OTHER/.test(call.auth) ? 'other' : 'tester' });
  routes['POST /repos/acme/demo/actions/workflows/board.yml/dispatches'] = resp(204, null);
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await page.check('#cp-keep');
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Run?');
  await page.waitForFunction(() => document.querySelectorAll('#cp-as-actions button').length === 2, null, { timeout: 8000 });
  // a Refresh reads the repository again for the same person: the answer's buttons still work
  await page.evaluate(() => document.getElementById('cp-refresh').click());
  await sleep(400);
  await press(page, /^Run the workers now$/);
  await page.waitForFunction(() => /the workers is queued/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.equal(posts(calls).filter((c) => /workers\.yml\/dispatches$/.test(c.key)).length, 1);
  // another account's token comes in from another tab: the old answer's button refuses
  await page.evaluate(() => { localStorage.setItem('symphony_panel_token', 'github_pat_OTHER'); window.dispatchEvent(new StorageEvent('storage', { key: 'symphony_panel_token', newValue: 'github_pat_OTHER' })); });
  await page.waitForFunction(() => /Signed in as other/.test(document.getElementById('cp-who').textContent), null, { timeout: 5000 });
  const kept = await actButton(page, /^Rewrite the board$/);
  if (await kept.evaluate((x) => !!x)) await kept.evaluate((x) => x.click());
  await sleep(400);
  assert.ok(!posts(calls).some((c) => /board\.yml\/dispatches$/.test(c.key)), 'a button from before the sign-in started a workflow');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('N3: a merge pressed before the checks are read is refused in words and the button comes back', async () => {
  const routes = offerRoutes(FINISHED + 'Merge it.\n\n```symphony\nmerge #12\n```\n');
  let release;
  const gate = new Promise((r) => { release = r; });
  routes['GET /repos/acme/demo/commits/abc12/check-runs'] = () => gate.then(() => ({ total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] }));
  const { context, page, calls, errors } = await open(routes, { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Merge?');
  await page.waitForFunction(() => document.querySelectorAll('#cp-as-actions button').length === 1, null, { timeout: 8000 });
  await press(page, /^Merge #12/);
  assert.match(await page.textContent('#msg'), /#12 cannot be merged from here yet: its checks have not all passed, or are still being read\./);
  assert.equal(await (await actButton(page, /^Merge #12/)).evaluate((x) => x.disabled), false, 'the refused button stayed disabled');
  release();
  await page.waitForFunction(() => { const b = Array.prototype.filter.call(document.querySelectorAll('#tab-pulls button'), (x) => /^Merge$/.test(x.textContent))[0]; return b && !b.disabled; }, null, { timeout: 5000 });
  await press(page, /^Merge #12/);
  assert.match(await page.textContent('#msg'), /Press "Confirm: merge #12 into main"/);
  assert.ok(!posts(calls).some((c) => /merge$/.test(c.key)), 'the merge ran without its confirm');
  assert.deepEqual(errors, []);
  await context.close();
});

// the block the page hides from the rendered answer is exactly the block it acts on
await check('N4: the symphony block is hidden from the answer and nothing else is', async () => {
  const body = FINISHED + 'Before.\r\n\r\n```symphony\r\nrun workers\r\n```\r\n\r\nAfter the block.\n\n```symphony-state\nrepository: acme/demo\n```\n';
  const { context, page, errors } = await open(offerRoutes(body), { storage: { symphony_panel_assistant: '{"acme/demo":50}' } });
  await signIn(page);
  await waitState(page, /The assistant issue is #50/);
  await ask(page, 'Block?');
  await page.waitForFunction(() => document.querySelectorAll('#cp-as-actions button').length === 1, null, { timeout: 8000 });
  const text = await page.textContent('#cp-as-answer');
  assert.ok(!/run workers/.test(text), 'the block the page acts on is shown as code');
  assert.match(text, /Before\./);
  assert.match(text, /After the block\./);
  assert.match(text, /repository: acme\/demo/, 'another fenced block was hidden');
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
