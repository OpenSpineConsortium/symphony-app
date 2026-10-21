// A browser that keeps nothing, a new one or a guest window, opens the usual repository: the one
// with Symphony set up that was pushed most recently. The picker opens by itself only where there
// is none, or GitHub does not list them; a repository this browser kept still comes first.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { legacyHome } from './legacy-home.mjs';

const BASE = process.env.BASE || 'http://localhost:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
let real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(real.includes(a), 'mutant text not found: ' + a.slice(0, 60)); real = real.replace(a, b); }
const UNCONFIGURED = real.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const meta = (name, topics) => ({ full_name: name, default_branch: 'main', private: true, topics, id: 1, owner: { id: 7, login: 'acme' } });
const LISTED = [
  { full_name: 'acme/plain', topics: [], private: true, pushed_at: ago(0.1) },
  { full_name: 'acme/gone', topics: ['symphony'], archived: true, private: true, pushed_at: ago(0.2) },
  { full_name: 'acme/new', topics: ['symphony'], private: true, pushed_at: ago(1) },
  { full_name: 'acme/old', topics: ['symphony'], private: true, pushed_at: ago(48) },
];

let passed = 0, failed = 0;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '-', e.message.split('\n')[0]); }
}

const browser = await chromium.launch();

// one fresh browser: the token pasted, GitHub answering /user/repos as `list` says (an array, a
// status, or a promise of one), and the storage given set before the page runs
async function fresh({ list = LISTED, kept = null, hash = '' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await legacyHome(context);
  const seen = [];
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: UNCONFIGURED }));
  await context.route('https://api.github.com/**', async (route) => {
    const url = new URL(route.request().url());
    const key = route.request().method() + ' ' + url.pathname;
    seen.push(key);
    if (key === 'GET /user') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ login: 'tester' }) });
    if (key === 'GET /user/repos') {
      const answer = await (typeof list === 'function' ? list() : list);
      if (typeof answer === 'number') return route.fulfill({ status: answer, contentType: 'application/json', body: JSON.stringify({ message: 'Server Error' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) });
    }
    const m = /^GET \/repos\/(acme\/[a-z]+)$/.exec(key);
    if (m) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meta(m[1], ['symphony'])) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
  });
  if (kept) await context.addInitScript((k) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('symphony_panel_repos', JSON.stringify([k])); localStorage.setItem('symphony_panel_repo', k); sessionStorage.setItem('seeded', '1'); } }, kept);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/symphony/control/' + hash);
  await page.fill('#cp-token', 'github_pat_TEST');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)');
  return { context, page, seen, errors };
}
const pickerOpen = (page) => page.evaluate(() => document.getElementById('dlg-repos').open);
const shown = (page) => page.evaluate(() => new URLSearchParams(location.search).get('repo') || '');

await check('U1: a new browser opens the newest repository with Symphony, not the picker', async () => {
  const { context, page, errors } = await fresh();
  await page.waitForFunction(() => /Opened acme\/new/.test(document.getElementById('msg').textContent));
  assert.equal(await shown(page), 'acme/new', 'acme/new is the one shown');
  assert.equal(await pickerOpen(page), false, 'the picker stays shut');
  assert.equal(await page.evaluate(() => localStorage.getItem('symphony_panel_repo')), 'acme/new', 'and this browser keeps it');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('U2: a repository this browser kept comes first, and GitHub is not asked for the list', async () => {
  const { context, page, seen } = await fresh({ kept: 'acme/old' });
  await page.waitForFunction(() => /Reading acme\/old|acme\/old/.test(document.getElementById('cp-summary').textContent));
  await page.waitForTimeout(800);
  assert.equal(await shown(page), 'acme/old');
  assert.equal(await pickerOpen(page), false);
  assert.ok(!seen.includes('GET /user/repos'), 'no listing at start');
  await context.close();
});

await check('U3: with no repository with Symphony the picker opens by itself', async () => {
  const { context, page } = await fresh({ list: [LISTED[0], LISTED[1]] });
  await page.waitForFunction(() => document.getElementById('dlg-repos').open);
  assert.equal(await shown(page), '', 'nothing opened');
  assert.match(await page.textContent('#cp-summary'), /No repository listed yet/);
  await context.close();
});

await check('U4: when GitHub does not list them the picker opens by itself', async () => {
  const { context, page } = await fresh({ list: 500 });
  await page.waitForFunction(() => document.getElementById('dlg-repos').open);
  assert.equal(await shown(page), '');
  assert.match(await page.textContent('#cp-summary'), /No repository listed yet/);
  await context.close();
});

await check('U5: a picker the person opened meanwhile is not overruled', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { context, page } = await fresh({ list: () => gate.then(() => LISTED) });
  await page.click('#cp-repo-browse');
  release();
  await page.waitForFunction(() => /acme\/new/.test(document.getElementById('rp-list').textContent));
  await page.waitForTimeout(500);
  assert.equal(await shown(page), '', 'nothing opened behind the picker');
  assert.equal(await pickerOpen(page), true, 'the picker stays open');
  await context.close();
});

await check('U6: the Folders tab opens no repository and no picker', async () => {
  const { context, page, seen } = await fresh({ hash: '#folders' });
  await page.waitForTimeout(1200);
  assert.equal(await shown(page), '');
  assert.equal(await pickerOpen(page), false);
  await context.close();
});

await browser.close();
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
