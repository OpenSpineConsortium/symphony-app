// The Runs tab's Cancel (2026-10-21, the owner's "make sure the jobs can be tracked, launched
// correctly, cancelled"): a workflow run still going, a worker in the cloud among them, is cancelled
// from the panel with GitHub's own call, asked first; a finished run offers nothing. GitHub is mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
let real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(real.includes(a), 'mutant text not found: ' + a.slice(0, 60)); real = real.replace(a, b); }
real = real.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '-', String(e && e.message || e).split('\n')[0]); }
}
const run = (id, status, conclusion) => ({ id, name: 'Workers', display_title: 'Workers', event: 'workflow_dispatch', head_branch: 'main', status, conclusion, actor: { login: 'tester' }, run_started_at: now, created_at: now, html_url: 'https://github.com/acme/demo/actions/runs/' + id });

const browser = await chromium.launch();
async function open(state) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const calls = [];
  await context.route((u) => u.protocol === 'https:' && u.host !== 'api.github.com', (route) => route.abort());
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: real }));
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const key = req.method() + ' ' + new URL(req.url()).pathname;
    calls.push(key);
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (key === 'GET /user') return json(200, { login: 'tester' });
    if (key === 'GET /repos/acme/demo') return json(200, { full_name: 'acme/demo', default_branch: 'main', private: true, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' }, permissions: { admin: true, push: true, pull: true } });
    if (key === 'GET /repos/acme/demo/actions/runs') return json(200, { workflow_runs: state.runs });
    const m = /^POST \/repos\/acme\/demo\/actions\/runs\/(\d+)\/cancel$/.exec(key);
    if (m) { state.cancelled.push(m[1]); state.runs = state.runs.map((r) => String(r.id) === m[1] ? run(r.id, 'completed', 'cancelled') : r); return json(202, {}); }
    if (key === 'GET /repos/acme/demo/issues' || key === 'GET /repos/acme/demo/pulls') return json(200, []);
    return json(404, { message: 'Not Found' });
  });
  await context.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('symphony_panel_token', 'github_pat_TESTER');
    localStorage.setItem('symphony_panel_repos', JSON.stringify(['acme/demo']));
    sessionStorage.setItem('seeded', '1');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/symphony/control/?repo=acme/demo#runs');
  await page.waitForFunction(() => /^acme\/demo, default/.test((document.getElementById('cp-summary') || {}).textContent || ''), null, { timeout: 15000 });
  if (await page.evaluate(() => document.getElementById('tab-runs').hidden)) await page.click('.console__rail [data-tab="runs"]');
  return { context, page, calls, errors };
}

await check('R1: a run still going offers Cancel, asked first, and GitHub\'s cancel is called for that run alone; a finished run offers nothing', async () => {
  const state = { runs: [run(501, 'in_progress', null), run(500, 'completed', 'success')], cancelled: [] };
  const { context, page, errors } = await open(state);
  await page.waitForSelector('#cp-run-cancel-501', { timeout: 15000 });
  assert.equal(await page.locator('#cp-run-cancel-500').count(), 0, 'a finished run offers Cancel');
  page.once('dialog', (d) => d.dismiss());
  await page.click('#cp-run-cancel-501');
  await sleep(300);
  assert.deepEqual(state.cancelled, [], 'Cancel ran without asking');
  page.once('dialog', (d) => d.accept());
  await page.click('#cp-run-cancel-501');
  await page.waitForFunction(() => !document.getElementById('cp-run-cancel-501'), null, { timeout: 15000 });
  assert.deepEqual(state.cancelled, ['501']);
  assert.deepEqual(errors, []);
  await context.close();
});

await browser.close();
console.log(failed ? 'FAILED ' + failed + ' of ' + (passed + failed) : 'ALL PASSED (' + passed + ')');
process.exit(failed ? 1 : 0);
