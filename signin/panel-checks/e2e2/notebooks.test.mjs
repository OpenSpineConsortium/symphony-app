// End-to-end checks of the control panel's Notebooks tab, /symphony/control/#notebooks (site branch
// claude/notebooks, 2026-10-19), against a mocked api.github.com. The tab draws the drive organizer's
// proposal, notebooks.json beside catalog.json on the branch drive-catalog of a private repository,
// as cards counted the way the template's tools/notebook.py counts them, lists a card's files in a
// side panel, and writes the proposal back when a notebook is proposed, changed or taken out, over the
// version it drew and no other (the review of 2026-10-19 found the first version read the sha afresh
// just before writing, so a change the organizer made after the cards were drawn was written over; the
// second found a write lock that a sign-out mid-write held for good, a ruleset's 409 told as a change,
// and an internal repository taken for a private one; the third, a lock a re-sign-in left free and a
// write landing after one that freed the lock of a later write). N27 to N32 hold the Make private
// button the owner chose on 2026-10-19 (site branch claude/make-private), and N33 to N36, from its
// review, the lock on a side panel drawn again and an answer that lands after a sign-in again, a
// Refresh or a move to another owner's repository. Each check states what the page promises; a FAIL
// is a defect. Every token here is a stand-in.
import { chromium } from 'playwright';
import { consoleTabs } from './console-tabs.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { legacyHome } from './legacy-home.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const PAGE = '/symphony/control/';
const CONSOLE = BASE + PAGE;
const now = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 16).join('\n     ')); }
}

let script = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(script.includes(a), 'mutant text not found: ' + a.slice(0, 60)); script = script.replace(a, b); }

const HOSTILE = '"quoted" <img src=x onerror=window.__hostile=1> a/b\\c \'x\'';
// the catalog the drive organizer writes: a flat list of files with their kinds, sizes, change
// dates and OneDrive links, one of them hostile in name, one with a link that is no https address
const FILES = [
  { path: 'OneDrive/Papers/one.docx', name: 'one.docx', id: 'a1', drive: 'd1', mime: '', kind: 'document', size: 2048, modified: '2026-10-01T10:00:00Z', web: 'https://1drv.ms/one' },
  { path: 'OneDrive/Papers/two.pdf', name: 'two.pdf', id: 'a2', drive: 'd1', mime: '', kind: 'pdf', size: 4096, modified: '2026-10-12T09:30:00Z', web: 'https://1drv.ms/two' },
  { path: 'OneDrive/Papers/three.docx', name: 'three.docx', id: 'a3', drive: 'd1', mime: '', kind: 'document', size: 1024, modified: '2026-09-20T08:00:00Z', web: 'javascript:alert(1)' },
  { path: 'OneDrive/Data/sheet.xlsx', name: 'sheet.xlsx', id: 'a4', drive: 'd1', mime: '', kind: 'spreadsheet', size: 3072, modified: '2026-10-05T12:00:00Z', web: 'http://insecure.example/sheet' },
  { path: 'OneDrive/Notes/' + HOSTILE + '.txt', name: HOSTILE + '.txt', id: 'a5', drive: 'd1', mime: '', kind: 'text', size: 10, modified: '2026-08-01T00:00:00Z' },
  { path: 'OneDrive/loose.md', name: 'loose.md', id: 'a6', drive: 'd1', mime: '', kind: 'text', size: 512, modified: '2026-10-18T07:00:00Z', web: 'https://1drv.ms/loose' },
];
const CATALOG = JSON.stringify({ folders: [], files: FILES });
function proposal() {
  return {
    notebooks: [
      { slug: 'alpha', title: 'Alpha papers', summary: 'The spine paper and its sources.', repository: 'alpha', files: [FILES[0].path, FILES[1].path, FILES[2].path], note: 'kept' },
      { slug: 'beta', title: HOSTILE, summary: 'Data behind the paper.', repository: 'beta', files: [FILES[3].path, FILES[1].path] },
    ],
    left_out: [FILES[4].path, FILES[5].path],
    about: 'proposed by the drive organizer',
  };
}
// what the console itself reads for a repository, so it loads clean and quiet beside the tab
function consoleReads(repo, o) {
  return {
    ['GET /repos/' + repo]: { full_name: repo, default_branch: 'main', private: !o.public, visibility: o.public ? 'public' : o.internal ? 'internal' : 'private', topics: ['symphony'], id: 123, owner: { id: 77, login: repo.split('/')[0], type: 'User' } },
    ['GET /repos/' + repo + '/issues']: [],
    ['GET /repos/' + repo + '/contents/STATE.md']: { raw: '# Board\n\nNothing claimed.\n' },
    ['GET /repos/' + repo + '/branches/board']: { commit: { commit: { committer: { date: now } } } },
    ['GET /repos/' + repo + '/contents/.github/symphony/workers']: [],
    ['GET /repos/' + repo + '/actions/runs']: { workflow_runs: [] },
    ['GET /repos/' + repo + '/pulls']: [],
  };
}
// The two files on the branch drive-catalog, kept as GitHub keeps them: read raw (the text) or as an
// object (the text in base64 and its sha; a file over 1 MB gives its sha alone, with encoding none,
// and its text comes from its blob), notebooks.json written over only with the sha it has (422
// without one, 409 with another), deleted with it; the repositories the notebooks name, made or not.
function driveRoutes(repo, o) {
  const r = '/repos/' + repo;
  const store = { catalog: o.noCatalog ? null : (o.catalog || CATALOG), catalogSha: 'c1', notebooks: o.noProposal ? null : JSON.stringify(o.proposal || proposal(), null, 2) + '\n', sha: 'n1', written: 0, puts: [], deletes: [], patches: [] };
  const refOf = (req) => new URL(req.url()).searchParams.get('ref') || 'main';
  const onBranch = (req) => refOf(req) === 'drive-catalog';
  const object = (text, sha, big) => ({ type: 'file', sha, size: Buffer.byteLength(text), content: big ? '' : Buffer.from(text).toString('base64').replace(/(.{60})/g, '$1\n'), encoding: big ? 'none' : 'base64' });
  const owner = repo.split('/')[0];
  store.visibility = { alpha: o.alphaPublic ? 'public' : o.alphaInternal ? 'internal' : 'private', beta: o.betaPublic ? 'public' : null };
  const repoNow = (name) => (store.visibility[name] == null ? undefined : Object.assign({ full_name: owner + '/' + name, private: store.visibility[name] === 'private', visibility: store.visibility[name] },
    name === 'alpha' && o.alphaAdmin !== undefined ? { permissions: { admin: o.alphaAdmin, push: true, pull: true } } : {}));
  // Make private: the change GitHub makes as the person, answered with the repository as it is now
  const repoChange = async (name, req) => {
    const body = JSON.parse(req.postData());
    store.patches.push(Object.assign({ name }, body));
    if (o.patchGate) await o.patchGate();
    if (o.patchAnswer) return o.patchAnswer(body);
    if (store.visibility[name] == null) return { status: 404, body: { message: 'Not Found' } };
    store.visibility[name] = body.visibility;
    return { status: 200, body: repoNow(name) };
  };
  return {
    store,
    routes: {
      [`GET ${r}/contents/catalog.json`]: (req) => (onBranch(req) && store.catalog != null ? { raw: store.catalog, json: object(store.catalog, store.catalogSha, o.bigCatalog) } : undefined),
      [`GET ${r}/git/blobs/c1`]: () => (store.catalogSha === 'c1' && store.catalog != null ? { raw: store.catalog, json: {} } : undefined),
      [`GET ${r}/contents/notebooks.json`]: (req) => (onBranch(req) && store.notebooks != null ? { raw: store.notebooks, json: object(store.notebooks, store.sha) } : undefined),
      [`PUT ${r}/contents/notebooks.json`]: async (req) => {
        const body = JSON.parse(req.postData());
        store.puts.push(body);
        if (o.unauthorizedOnce && !store.refusedOnce) { store.refusedOnce = true; return { status: 401, body: { message: 'Bad credentials' } }; }
        if (o.slow) await sleep(o.slow);
        if (o.putRefused) return { status: 403, body: { message: 'Resource not accessible by integration' } };
        if (body.branch !== 'drive-catalog') return { status: 404, body: { message: 'Branch ' + body.branch + ' not found' } };
        if (store.notebooks != null && !body.sha) return { status: 422, body: { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' } };
        if (o.conflictOnce && !store.conflicted) { store.conflicted = true; store.sha = 'n1x'; return { status: 409, body: { message: 'notebooks.json does not match ' + body.sha } }; }
        if ((store.notebooks != null && body.sha !== store.sha) || (store.notebooks == null && body.sha)) return { status: 409, body: { message: 'notebooks.json does not match ' + body.sha } };
        store.notebooks = Buffer.from(body.content, 'base64').toString('utf8');
        store.sha = 'n' + (++store.written + 1);
        return { status: 200, body: { content: { sha: store.sha } } };
      },
      [`DELETE ${r}/contents/notebooks.json`]: (req) => {
        const body = JSON.parse(req.postData());
        store.deletes.push(body);
        if (store.notebooks == null) return { status: 404, body: { message: 'Not Found' } };
        if (body.sha !== store.sha) return { status: 409, body: { message: 'notebooks.json does not match ' + body.sha } };
        store.notebooks = null;
        return { status: 200, body: { content: null } };
      },
      // the notebooks' own repositories, kept as GitHub keeps them: alpha made, public, internal or
      // private as asked, and beta not made unless asked public; Make private changes one as the
      // person and GitHub then reads it back as it now is, once the change is answered
      [`GET /repos/${owner}/alpha`]: () => repoNow('alpha'),
      [`GET /repos/${owner}/beta`]: () => repoNow('beta'),
      [`PATCH /repos/${owner}/alpha`]: (req) => repoChange('alpha', req),
      [`PATCH /repos/${owner}/beta`]: (req) => repoChange('beta', req),
    },
  };
}
const browser = await chromium.launch();
await consoleTabs(browser);
async function open(opts) {
  const o = opts || {};
  const context = await browser.newContext(Object.assign({ viewport: o.viewport || { width: 1280, height: 1000 } }, o.mobile ? { hasTouch: true, isMobile: true } : {}));
  await legacyHome(context);
  const calls = [];
  const repos = o.repos || ['acme/demo'];
  const routes = { 'GET /user': { login: 'tester' } };
  const stores = {};
  for (const name of repos) {
    const per = Object.assign({}, o, (o.per && o.per[name]) || {});
    Object.assign(routes, consoleReads(name, per));
    const d = driveRoutes(name, per);
    stores[name] = d.store;
    Object.assign(routes, d.routes);
  }
  Object.assign(routes, o.routes || {});
  await context.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = req.method() + ' ' + url.pathname;
    let body = null;
    if (req.method() !== 'GET') { try { body = req.postDataJSON(); } catch (e) { body = req.postData(); } }
    const raw = /raw\+json/.test(req.headers()['accept'] || '');
    calls.push({ key, url: req.url(), body, raw, auth: req.headers()['authorization'] || '' });
    let r = routes[key];
    if (typeof r === 'function') r = await r(req);
    const headers = { 'Access-Control-Expose-Headers': 'Link' };
    if (r === undefined) return route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ message: 'Not Found' }) });
    if (r && r.status) return route.fulfill({ status: r.status, contentType: 'application/json', headers, body: JSON.stringify(r.body || {}) });
    if (r && typeof r.raw === 'string') return raw
      ? route.fulfill({ status: 200, contentType: 'application/vnd.github.raw+json', headers, body: r.raw })
      : route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(r.json || {}) });
    if (r === null) return route.fulfill({ status: 204, headers, body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(r) });
  });
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // every word the foot showed, in order
  await context.addInitScript(() => {
    window.__msgs = [];
    new MutationObserver(() => { const m = document.getElementById('msg'); if (m) { const t = m.textContent.trim(); if (t && window.__msgs[window.__msgs.length - 1] !== t) window.__msgs.push(t); } }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto(CONSOLE);
  // signed in with a pasted token, or, with o.byApp, with GitHub through SymphonyBoard, whose sign-in
  // the page keeps as a record of the App's token that runs out in eight hours, as signin.test.mjs
  // seeds it; nothing here renews it, so the sign-in service is never asked
  const signin = o.byApp
    ? { symphony_panel_oauth: JSON.stringify({ access_token: 'ghu_TEST', refresh_token: 'ghr_TEST', expires_at: Date.now() + 8 * 3600000, refresh_expires_at: Date.now() + 100 * 24 * 3600000 }) }
    : { symphony_panel_token: 'github_pat_TEST' };
  await page.evaluate((seed) => { localStorage.clear(); for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]); }, Object.assign(signin, { symphony_panel_repos: JSON.stringify(repos), symphony_panel_repo: repos[0] }, o.layout ? { symphony_panel_layout: JSON.stringify(o.layout) } : {}));
  await page.goto(CONSOLE + '?repo=' + encodeURIComponent(repos[0]) + (o.hash || '#notebooks'));
  await page.waitForSelector('#cp-app:not(.hidden)');
  return { context, page, calls, errors, stores };
}
// the reads of the two files on the branch, which go out as objects (the sha with the text) and each
// with an address of its own, so the browser never answers one from what it kept of another
const branchReads = (calls, repo, name) => calls.filter((c) => c.key === 'GET /repos/' + repo + '/contents/' + name);
const tileText = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#nb-tiles .tok__open:not(.tok--add)')).map((b) => ({
  id: b.id, name: b.querySelector('.tok__name') && b.querySelector('.tok__name').textContent,
  repo: b.querySelector('.tok__owner') && b.querySelector('.tok__owner').textContent,
  metas: Array.from(b.querySelectorAll('.tok__meta')).map((m) => m.textContent),
  kinds: Array.from(b.querySelectorAll('.nb__kind')).map((k) => k.textContent),
  state: b.querySelector('.tok__state') && b.querySelector('.tok__state').textContent,
  gear: !!document.getElementById(b.id.replace('nb-tile-', 'nb-gear-')), x: !!document.getElementById(b.id.replace('nb-tile-', 'nb-remove-')),
})));
const noteText = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#nb-tiles .toks__note')).map((p) => p.textContent).join(' | '));
const footText = (page) => page.evaluate(() => document.getElementById('msg').textContent.trim());
async function untilTiles(page, n, ms) {
  await page.waitForFunction((n) => document.querySelectorAll('#nb-tiles .tok__open:not(.tok--add)').length === n, n, { timeout: ms || 8000 });
}
async function untilMade(page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#nb-tiles .tok__open:not(.tok--add)')).every((b) => b.querySelector('.tok__state')), null, { timeout: 8000 });
}
const decoded = (put) => JSON.parse(Buffer.from(put.content, 'base64').toString('utf8'));
const objectOf = (text, sha) => ({ type: 'file', sha, size: Buffer.byteLength(text), content: Buffer.from(text).toString('base64'), encoding: 'base64' });
async function until(fn, ms) {
  const start = Date.now();
  while (!fn()) { if (Date.now() - start > (ms || 8000)) throw new Error('timed out waiting'); await sleep(50); }
}
// a new token pasted into the gate, as a person signs in again
async function signInAgain(page) {
  await page.waitForFunction(() => !document.getElementById('cp-gate').classList.contains('hidden'), null, { timeout: 8000 });
  await page.evaluate(() => { const d = document.getElementById('cp-token-way'); if (d) d.open = true; });
  await page.fill('#cp-token', 'github_pat_NEW');
  await page.click('#cp-open');
  await page.waitForSelector('#cp-app:not(.hidden)');
}
async function proposeLoose(page, title) {
  await page.click('#nb-add');
  await page.waitForSelector('#nb-dialog[open]', { timeout: 4000 });
  await page.fill('#nb-d-title', title);
  await page.fill('#nb-d-summary', 'What is left.');
  await page.check('#nb-d-files input[data-path="OneDrive/loose.md"]');
  await page.click('#nb-d-save');
}

await check('N1: the cards count each notebook as notebook.py show does, kinds most common first, the newest change, and whether its repository is found', async () => {
  const { context, page, calls, errors } = await open();
  await untilTiles(page, 2);
  await untilMade(page);
  const tiles = await tileText(page);
  assert.equal(tiles[0].id, 'nb-tile-alpha');
  assert.equal(tiles[0].name, 'Alpha papers');
  assert.equal(tiles[0].repo, 'alpha');
  assert.deepEqual(tiles[0].metas, ['3 files, 7 KB', 'Changed 2026-10-12']);
  assert.deepEqual(tiles[0].kinds, ['document 2', 'pdf 1']);
  assert.equal(tiles[0].state, 'Repository made');
  assert.equal(tiles[1].name, HOSTILE, 'the hostile title is text');
  assert.deepEqual(tiles[1].metas, ['2 files, 7 KB', 'Changed 2026-10-12']);
  assert.deepEqual(tiles[1].kinds, ['spreadsheet 1', 'pdf 1'], 'a tie keeps the order the files were met in');
  assert.equal(tiles[1].state, 'Repository not found');
  assert.ok(tiles.every((t) => t.gear && t.x), 'each card has its gear and its x');
  assert.ok(await page.$('#nb-add'), 'the + tile is there');
  assert.equal(await noteText(page), '2 files of the catalog are in no notebook.');
  assert.equal(await page.evaluate(() => window.__hostile), undefined);
  // the repositories are asked one at a time, with the owner's name, and each once
  const asked = calls.filter((c) => /^GET \/repos\/acme\/(alpha|beta)$/.test(c.key)).map((c) => c.key);
  assert.deepEqual(asked, ['GET /repos/acme/alpha', 'GET /repos/acme/beta']);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('N2: a card opens the side panel with the summary, the repository and the files newest first, linked only where the catalog gives an https address', async () => {
  const { context, page } = await open();
  await untilTiles(page, 2);
  await untilMade(page);
  await page.click('#nb-tile-alpha');
  await page.waitForSelector('#nb-side:not([hidden])');
  const side = await page.evaluate(() => {
    const s = document.getElementById('nb-side');
    return {
      title: s.querySelector('h3').textContent, repo: s.querySelector('.tok__owner').textContent, repoHref: s.querySelector('.tok__owner a') && s.querySelector('.tok__owner a').href,
      state: s.querySelector('.tok__state').textContent, summary: s.querySelector('.tkdlg__fact').textContent, kinds: Array.from(s.querySelectorAll('.nb__kinds .nb__kind')).map((k) => k.textContent),
      files: Array.from(s.querySelectorAll('#nb-files .nb__file')).map((li) => ({ name: (li.querySelector('a') || li.querySelector('.nb__name')).textContent, href: li.querySelector('a') && li.querySelector('a').href, target: li.querySelector('a') && li.querySelector('a').target, when: li.querySelector('.nb__when').textContent })),
      on: document.querySelector('#nb-tiles .tok--on .tok__open').id,
    };
  });
  assert.equal(side.title, 'Alpha papers');
  assert.equal(side.repo, 'acme/alpha');
  assert.equal(side.repoHref, 'https://github.com/acme/alpha');
  assert.equal(side.state, 'The repository is made.');
  assert.equal(side.summary, 'The spine paper and its sources.');
  assert.deepEqual(side.kinds, ['document 2', 'pdf 1']);
  assert.deepEqual(side.files.map((f) => f.name), ['two.pdf', 'one.docx', 'three.docx'], 'newest change first');
  assert.equal(side.files[0].href, 'https://1drv.ms/two');
  assert.equal(side.files[0].target, '_blank');
  assert.equal(side.files[2].href, null, 'a javascript: address is no link');
  assert.deepEqual(side.files.map((f) => f.when), ['Changed 2026-10-12, 4 KB', 'Changed 2026-10-01, 2 KB', 'Changed 2026-09-20, 1 KB']);
  assert.equal(side.on, 'nb-tile-alpha');
  await page.click('#nb-tile-beta');
  const beta = await page.evaluate(() => { const s = document.getElementById('nb-side'); return { title: s.querySelector('h3').textContent, link: !!s.querySelector('.tok__owner a'), state: s.querySelector('.tok__state').textContent, hrefs: Array.from(s.querySelectorAll('#nb-files .nb__file')).map((li) => li.querySelector('a') && li.querySelector('a').href) }; });
  assert.equal(beta.title, HOSTILE);
  assert.equal(beta.link, false, 'a repository not made yet is no link');
  assert.equal(beta.state, 'The repository is not made yet, or this sign-in cannot reach it: the notebook skill makes it from this proposal.');
  assert.deepEqual(beta.hrefs, ['https://1drv.ms/two', null], 'an http: address is no link');
  assert.equal(await page.evaluate(() => window.__hostile), undefined);
  await page.click('#nb-side .tkside__close');
  assert.equal(await page.evaluate(() => document.getElementById('nb-side').hidden), true);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#nb-tiles .tok--on').length), 0);
  await context.close();
});

await check('N3: + proposes a notebook: the dialog refuses an empty title and the catalog\'s own repository, closes at once on Propose, and the write carries the sha read with the cards, the slug from the title, the files ticked and left_out', async () => {
  const { context, page, calls, stores } = await open({ slow: 400 });
  await untilTiles(page, 2);
  await page.click('#nb-add');
  await page.waitForSelector('#nb-dialog[open]');
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-count').textContent), '0 files ticked of 6.');
  await page.click('#nb-d-save');
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-problem').textContent), 'Give the notebook a title.');
  assert.equal(await page.evaluate(() => document.getElementById('nb-dialog').open), true, 'the dialog stays open on a problem');
  await page.fill('#nb-d-title', '  Grants & Fellowships 2027 ');
  await page.fill('#nb-d-summary', 'Applications and their reviews.');
  await page.fill('#nb-d-filter', 'loose');
  assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('#nb-d-files label')).filter((l) => !l.hidden).length), 1, 'the filter leaves the one matching file');
  await page.check('#nb-d-files label:not([hidden]) input');
  await page.fill('#nb-d-filter', '');
  // the ticked file comes first, then the paths sorted (D, N, P), so the Notes file is third
  const order = await page.evaluate(() => Array.from(document.querySelectorAll('#nb-d-files label')).map((l) => l.title));
  assert.deepEqual(order, [FILES[5].path, FILES[3].path, FILES[4].path, FILES[0].path, FILES[2].path, FILES[1].path], 'the ticked first, then by path');
  await page.check('#nb-d-files label:nth-child(3) input');
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-count').textContent), '2 files ticked of 6.');
  await page.fill('#nb-d-repo', 'Demo');
  await page.click('#nb-d-save');
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-problem').textContent), 'That is the catalog\'s own repository; a notebook gets a private repository of its own.');
  assert.equal(await page.evaluate(() => document.getElementById('nb-dialog').open), true);
  await page.fill('#nb-d-repo', '');
  await page.click('#nb-d-save');
  assert.equal(await page.evaluate(() => document.getElementById('nb-dialog').open), false, 'the dialog closes the moment Propose is pressed');
  assert.match(await footText(page), /^Writing notebooks\.json on acme\/demo\.\.\./);
  await untilTiles(page, 3);
  await page.waitForFunction(() => /^Proposed Grants & Fellowships 2027 in notebooks\.json on acme\/demo\. The notebook skill/.test(document.getElementById('msg').textContent.trim()), null, { timeout: 5000 });
  const store = stores['acme/demo'];
  assert.equal(store.puts.length, 1);
  const put = store.puts[0];
  assert.equal(put.branch, 'drive-catalog');
  assert.equal(put.sha, 'n1', 'written over the file as it was drawn');
  assert.equal(put.message, 'Propose the notebook grants-fellowships-2027');
  const data = decoded(put);
  assert.equal(data.notebooks.length, 3);
  assert.deepEqual(data.notebooks[2], { slug: 'grants-fellowships-2027', title: 'Grants & Fellowships 2027', summary: 'Applications and their reviews.', repository: 'grants-fellowships-2027', files: [FILES[4].path, FILES[5].path] });
  assert.deepEqual(data.notebooks[0], proposal().notebooks[0], 'the others are written as they were');
  assert.deepEqual(data.left_out, [], 'every file of the catalog is now in a notebook');
  assert.ok(store.notebooks.endsWith('\n'));
  // the proposal was read once, with its sha, when the cards were drawn, and not again before the
  // write; the catalog once then and once more before the write; each read past the browser's cache
  const proposalReads = branchReads(calls, 'acme/demo', 'notebooks.json'), catalogReads = branchReads(calls, 'acme/demo', 'catalog.json');
  assert.equal(proposalReads.length, 1);
  assert.equal(catalogReads.length, 2);
  assert.ok(proposalReads.concat(catalogReads).every((c) => !c.raw), 'read as objects, with the sha');
  const stamps = catalogReads.map((c) => new URL(c.url).searchParams.get('at'));
  assert.ok(stamps.every(Boolean) && stamps[0] !== stamps[1], 'each read of a file has an address of its own: ' + stamps.join(', '));
  assert.ok(new URL(proposalReads[0].url).searchParams.get('at'));
  await untilMade(page);
  const tiles = await tileText(page);
  assert.equal(tiles[2].name, 'Grants & Fellowships 2027');
  assert.equal(tiles[2].state, 'Repository not found');
  assert.equal(await noteText(page), '');
  await context.close();
});

await check('N4: the gear changes a notebook: its slug, what else the organizer wrote on it and on the proposal stay, the title and the files change', async () => {
  const { context, page, stores } = await open();
  await untilTiles(page, 2);
  await page.click('#nb-gear-alpha');
  await page.waitForSelector('#nb-dialog[open]');
  assert.equal(await page.inputValue('#nb-d-title'), 'Alpha papers');
  assert.equal(await page.inputValue('#nb-d-repo'), 'alpha');
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-count').textContent), '3 files ticked of 6.');
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-save').textContent), 'Save');
  await page.fill('#nb-d-title', 'Alpha spine paper');
  await page.uncheck('#nb-d-files input[data-path="OneDrive/Papers/two.pdf"]');
  await page.click('#nb-d-save');
  await page.waitForFunction(() => /^Changed Alpha spine paper in notebooks\.json/.test(document.getElementById('msg').textContent.trim()), null, { timeout: 5000 });
  const put = stores['acme/demo'].puts[0];
  assert.equal(put.message, 'Change the notebook alpha');
  const data = decoded(put);
  assert.deepEqual(data.notebooks[0], { slug: 'alpha', title: 'Alpha spine paper', summary: 'The spine paper and its sources.', repository: 'alpha', files: [FILES[0].path, FILES[2].path], note: 'kept' });
  assert.deepEqual(data.left_out, [FILES[4].path, FILES[5].path], 'two.pdf is still in the other notebook');
  assert.equal(data.about, 'proposed by the drive organizer', 'what the organizer wrote beside the notebooks stays');
  assert.equal((await tileText(page))[0].name, 'Alpha spine paper');
  await context.close();
});

await check('N5: the x asks once and takes the notebook out, its files listed as left out where no other holds them; the last one taken out deletes the file', async () => {
  const { context, page, stores } = await open();
  await untilTiles(page, 2);
  const asked = [];
  page.once('dialog', (d) => { asked.push(d.message()); d.dismiss(); });
  await page.click('#nb-remove-beta');
  await sleep(300);
  assert.equal(asked.length, 1);
  assert.equal(asked[0], 'Take ' + HOSTILE + ' out of the proposal? Its 2 files stay on the drive, and one of them is then in no notebook.');
  assert.equal(stores['acme/demo'].puts.length, 0, 'nothing is written when the question is dismissed');
  page.once('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await page.click('#nb-remove-beta');
  await untilTiles(page, 1);
  await page.waitForFunction(() => /^Took .* out of notebooks\.json on acme\/demo\. Its files stay on the drive\./.test(document.getElementById('msg').textContent.trim()), null, { timeout: 5000 });
  const put = stores['acme/demo'].puts[0];
  assert.equal(put.message, 'Take the notebook beta out of the proposal');
  const data = decoded(put);
  assert.deepEqual(data.notebooks.map((b) => b.slug), ['alpha']);
  assert.deepEqual(data.left_out, [FILES[3].path, FILES[4].path, FILES[5].path], 'in the catalog\'s order');
  assert.equal(await noteText(page), '3 files of the catalog are in no notebook.');
  await untilMade(page);
  page.once('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await page.click('#nb-remove-alpha');
  await page.waitForFunction(() => /^Took Alpha papers out of notebooks\.json/.test(document.getElementById('msg').textContent.trim()), null, { timeout: 5000 });
  assert.equal(asked[2], 'Take Alpha papers out of the proposal? Its 3 files stay on the drive, and 3 of them are then in no notebook. The repository alpha stays as it is. It is the last notebook, so notebooks.json is deleted from drive-catalog, with whatever else the organizer wrote in it.');
  const store = stores['acme/demo'];
  assert.equal(store.puts.length, 1, 'no proposal is written with no notebook in it');
  assert.equal(store.deletes.length, 1);
  assert.equal(store.deletes[0].sha, 'n2', 'the sha the write before it was answered with');
  assert.equal(store.deletes[0].branch, 'drive-catalog');
  assert.equal(store.notebooks, null);
  await untilTiles(page, 0);
  assert.match(await noteText(page), /^No notebook is proposed yet for acme\/demo: \+ makes the first from the catalog's 6 files\./);
  assert.ok(await page.$('#nb-add'));
  // the next proposal starts afresh: what else the deleted file held went with it
  await page.click('#nb-add');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Afresh');
  await page.fill('#nb-d-summary', 'After the delete.');
  await page.check('#nb-d-files input[data-path="OneDrive/loose.md"]');
  await page.click('#nb-d-save');
  await untilTiles(page, 1);
  assert.equal(store.puts.length, 2);
  assert.equal(store.puts[1].sha, undefined, 'the file was gone, so the write has no sha');
  assert.deepEqual(Object.keys(decoded(store.puts[1])).sort(), ['left_out', 'notebooks'], 'nothing of the deleted file is written back');
  await context.close();
});

await check('N6: a public repository, no catalog, no proposal yet, and a proposal that does not hold together each say so, and the last is shown read-only', async () => {
  let o = await open({ public: true });
  await page_note(o.page, /^acme\/demo is public\. A notebook names a person's files, so a proposal lives only on a private repository's branch drive-catalog\./);
  assert.equal(await o.page.$('#nb-add'), null);
  assert.equal(o.calls.filter((c) => /drive-catalog/.test(c.url)).length, 0, 'nothing is read from the branch');
  await o.context.close();
  o = await open({ noCatalog: true, noProposal: true });
  await page_note(o.page, /^acme\/demo has no catalog yet: the drive organizer writes catalog\.json to its branch drive-catalog first/);
  assert.equal(await o.page.$('#nb-add'), null);
  await o.context.close();
  o = await open({ noProposal: true });
  await page_note(o.page, /^No notebook is proposed yet for acme\/demo: \+ makes the first from the catalog's 6 files\. The files stay on the drive; a notebook only points at them\./);
  await o.page.click('#nb-add');
  await o.page.waitForSelector('#nb-dialog[open]');
  await o.page.fill('#nb-d-title', 'First');
  await o.page.fill('#nb-d-summary', 'The first notebook.');
  await o.page.fill('#nb-d-repo', 'first-notes');
  await o.page.check('#nb-d-files input[data-path="OneDrive/loose.md"]');
  await o.page.click('#nb-d-save');
  await untilTiles(o.page, 1);
  const put = o.stores['acme/demo'].puts[0];
  assert.equal(put.sha, undefined, 'a first file has no sha');
  assert.deepEqual(decoded(put).notebooks, [{ slug: 'first', title: 'First', summary: 'The first notebook.', repository: 'first-notes', files: ['OneDrive/loose.md'] }]);
  assert.equal(decoded(put).left_out.length, 5);
  await o.context.close();
  const broken = proposal();
  broken.notebooks[0].files.push('OneDrive/gone.pdf');
  broken.notebooks.push({ slug: 'Bad Slug', title: 'x', summary: 'y', repository: 'z', files: ['OneDrive/loose.md'] });
  o = await open({ proposal: broken });
  await untilTiles(o.page, 3);
  const note = await noteText(o.page);
  assert.match(note, /^notebooks\.json on drive-catalog does not hold together with the catalog, so it is shown as it is and changed only by hand: notebook alpha names OneDrive\/gone\.pdf, which the catalog does not list; notebook 3's slug is not lowercase letters, digits and dashes\./);
  const tiles = await tileText(o.page);
  assert.deepEqual(tiles[0].metas, ['3 files, 7 KB, 1 not in the catalog', 'Changed 2026-10-12']);
  assert.ok(tiles.every((t) => !t.gear && !t.x), 'no gear or x on a proposal to change by hand');
  assert.equal(await o.page.$('#nb-add'), null);
  await o.page.click('#nb-tile-alpha');
  assert.equal(await o.page.evaluate(() => Array.from(document.querySelectorAll('#nb-files .nb__file')).map((li) => li.textContent).pop()), 'OneDrive/gone.pdfnot in the catalog');
  await o.context.close();
});
async function page_note(page, re) {
  await page.waitForFunction((src) => new RegExp(src).test(Array.from(document.querySelectorAll('#nb-tiles .toks__note')).map((p) => p.textContent).join(' | ')), re.source, { timeout: 8000 });
}

await check('N7: a write GitHub refuses says what access it needs and changes nothing; one that meets a changed file reads the file again', async () => {
  let o = await open({ putRefused: true });
  await untilTiles(o.page, 2);
  await o.page.click('#nb-add');
  await o.page.waitForSelector('#nb-dialog[open]');
  await o.page.fill('#nb-d-title', 'Third');
  await o.page.fill('#nb-d-summary', 'A third.');
  await o.page.check('#nb-d-files input[data-path="OneDrive/loose.md"]');
  await o.page.click('#nb-d-save');
  await o.page.waitForFunction(() => /needs write access/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.match(await footText(o.page), /^notebooks\.json on acme\/demo was not written: The token may not do this \(403: Resource not accessible by integration\)\..* Writing it needs write access to acme\/demo, with Contents: read and write on the token\.$/);
  assert.equal(await o.page.evaluate(() => document.getElementById('msg').classList.contains('admin__warn')), true);
  await sleep(300);
  assert.equal((await tileText(o.page)).length, 2, 'the cards are as they were');
  await o.context.close();
  o = await open({ conflictOnce: true });
  await untilTiles(o.page, 2);
  await o.page.click('#nb-gear-alpha');
  await o.page.waitForSelector('#nb-dialog[open]');
  await o.page.fill('#nb-d-title', 'Alpha again');
  await o.page.click('#nb-d-save');
  await o.page.waitForFunction(() => /^notebooks\.json on acme\/demo's drive-catalog changed since the cards were drawn, so nothing was written; it is read again/.test(document.getElementById('msg').textContent.trim()), null, { timeout: 5000 });
  await untilTiles(o.page, 2);
  assert.equal((await tileText(o.page))[0].name, 'Alpha papers', 'the file is read again as it is');
  const reads = branchReads(o.calls, 'acme/demo', 'notebooks.json').length;
  assert.equal(reads, 3, 'the proposal was read at the start, its sha once after the refusal, and the file again');
  await o.context.close();
});

await check('N8: another repository chosen in the bar brings its own notebooks, and the first one\'s side panel closes', async () => {
  const other = { notebooks: [{ slug: 'gamma', title: 'Gamma', summary: 'Other things.', repository: 'gamma', files: ['OneDrive/loose.md'] }], left_out: FILES.slice(0, 5).map((f) => f.path) };
  const { context, page, calls } = await open({ repos: ['acme/demo', 'acme/other'], per: { 'acme/other': { proposal: other } } });
  await untilTiles(page, 2);
  await page.click('#nb-tile-alpha');
  await page.waitForSelector('#nb-side:not([hidden])');
  await page.selectOption('#cp-repo', 'acme/other');
  await untilTiles(page, 1);
  assert.equal((await tileText(page))[0].name, 'Gamma');
  assert.equal(await page.evaluate(() => document.getElementById('nb-side').hidden), true);
  assert.equal(await noteText(page), '5 files of the catalog are in no notebook.');
  assert.equal(branchReads(calls, 'acme/other', 'notebooks.json').length, 1);
  await context.close();
});

await check('N9: on a phone the cards stand two to a row and the side panel opens under them, no wider than the window', async () => {
  const { context, page } = await open({ viewport: { width: 390, height: 844 }, mobile: true });
  await untilTiles(page, 2);
  const cols = await page.evaluate(() => getComputedStyle(document.getElementById('nb-tiles')).gridTemplateColumns.split(' ').length);
  assert.equal(cols, 2);
  await page.click('#nb-tile-alpha');
  await page.waitForSelector('#nb-side:not([hidden])');
  const box = await page.evaluate(() => { const s = document.getElementById('nb-side').getBoundingClientRect(), t = document.getElementById('nb-tiles').getBoundingClientRect(); return { top: s.top, tilesBottom: t.bottom, width: s.width, w: window.innerWidth, scrollW: document.documentElement.scrollWidth }; });
  assert.ok(box.top >= box.tilesBottom - 1, 'the side panel sits under the cards: ' + JSON.stringify(box));
  assert.ok(box.width <= box.w && box.scrollW <= box.w, 'nothing is wider than the window: ' + JSON.stringify(box));
  assert.ok(await page.$('.console__rail [data-tab="notebooks"]'));
  await context.close();
});

await check('N10: a proposal the organizer rewrote after the cards were drawn is never written over: the write carries the sha drawn, GitHub refuses it, and the tab reads the organizer\'s version', async () => {
  const { context, page, stores } = await open();
  await untilTiles(page, 2);
  const store = stores['acme/demo'];
  // the organizer writes a third notebook while the cards stand
  const theirs = proposal();
  theirs.notebooks.push({ slug: 'gamma', title: 'Gamma', summary: 'The organizer\'s own.', repository: 'gamma', files: [FILES[5].path] });
  theirs.left_out = [FILES[4].path];
  store.notebooks = JSON.stringify(theirs, null, 2) + '\n';
  store.sha = 'n9';
  await page.click('#nb-gear-alpha');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Alpha mine');
  await page.click('#nb-d-save');
  await page.waitForFunction(() => /changed since the cards were drawn, so nothing was written/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.equal(store.puts.length, 1);
  assert.equal(store.puts[0].sha, 'n1', 'the sha of the version drawn, not the one GitHub has now');
  assert.deepEqual(JSON.parse(store.notebooks).notebooks.map((b) => b.slug), ['alpha', 'beta', 'gamma'], 'the organizer\'s version stands');
  await untilTiles(page, 3);
  assert.deepEqual((await tileText(page)).map((t) => t.name), ['Alpha papers', HOSTILE, 'Gamma']);
  // pressed again over the version now drawn, the change goes in beside the organizer's
  await page.click('#nb-gear-alpha');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Alpha mine');
  await page.click('#nb-d-save');
  await page.waitForFunction(() => /^Changed Alpha mine in notebooks\.json on acme\/demo\./.test(document.getElementById('msg').textContent.trim()), null, { timeout: 5000 });
  assert.equal(store.puts[1].sha, 'n9');
  assert.deepEqual(JSON.parse(store.notebooks).notebooks.map((b) => b.title), ['Alpha mine', HOSTILE, 'Gamma']);
  await context.close();
  // no file when the cards were drawn, one by the time Propose is pressed: the write goes with no
  // sha, GitHub answers 422, and the tab reads the organizer's file
  const o = await open({ noProposal: true });
  await page_note(o.page, /^No notebook is proposed yet/);
  const fresh = o.stores['acme/demo'];
  fresh.notebooks = JSON.stringify(proposal(), null, 2) + '\n';
  fresh.sha = 'n7';
  await o.page.click('#nb-add');
  await o.page.waitForSelector('#nb-dialog[open]');
  await o.page.fill('#nb-d-title', 'First');
  await o.page.fill('#nb-d-summary', 'The first notebook.');
  await o.page.check('#nb-d-files input[data-path="OneDrive/loose.md"]');
  await o.page.click('#nb-d-save');
  await o.page.waitForFunction(() => /changed since the cards were drawn, so nothing was written/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.equal(fresh.puts.length, 1);
  assert.equal(fresh.puts[0].sha, undefined);
  await untilTiles(o.page, 2);
  assert.deepEqual(JSON.parse(fresh.notebooks).notebooks.map((b) => b.slug), ['alpha', 'beta'], 'the organizer\'s file stands');
  await o.context.close();
});

await check('N11: a catalog the organizer rewrote after the cards were drawn stops the write before it is sent, and the tab reads both files again', async () => {
  const { context, page, stores } = await open();
  await untilTiles(page, 2);
  const store = stores['acme/demo'];
  await page.click('#nb-add');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Loose ends');
  await page.fill('#nb-d-summary', 'What is left.');
  await page.check('#nb-d-files input[data-path="OneDrive/loose.md"]');
  // the organizer rewrites the catalog without loose.md before Propose is pressed
  store.catalog = JSON.stringify({ folders: [], files: FILES.slice(0, 5) });
  store.catalogSha = 'c2';
  const rewritten = proposal();
  rewritten.left_out = [FILES[4].path];
  store.notebooks = JSON.stringify(rewritten, null, 2) + '\n';
  store.sha = 'n5';
  await page.click('#nb-d-save');
  await page.waitForFunction(() => /^catalog\.json on acme\/demo's drive-catalog changed since the cards were drawn, so nothing was written/.test(document.getElementById('msg').textContent.trim()), null, { timeout: 5000 });
  assert.equal(store.puts.length, 0, 'nothing is written');
  await untilTiles(page, 2);
  await page.click('#nb-add');
  await page.waitForSelector('#nb-dialog[open]');
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-count').textContent), '0 files ticked of 5.', 'the dialog offers the catalog as it is now');
  await context.close();
});

await check('N12: a write on its way when the page goes to another repository still says how it went, naming its repository, and no second write starts beside it', async () => {
  const other = { notebooks: [{ slug: 'gamma', title: 'Gamma', summary: 'Other things.', repository: 'gamma', files: ['OneDrive/loose.md'] }], left_out: FILES.slice(0, 5).map((f) => f.path) };
  const { context, page, stores } = await open({ repos: ['acme/demo', 'acme/other'], per: { 'acme/demo': { slow: 1500 }, 'acme/other': { proposal: other } } });
  await untilTiles(page, 2);
  await page.click('#nb-add');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Loose ends');
  await page.fill('#nb-d-summary', 'What is left.');
  await page.check('#nb-d-files input[data-path="OneDrive/loose.md"]');
  await page.click('#nb-d-save');
  await page.selectOption('#cp-repo', 'acme/other');
  await untilTiles(page, 1);
  await page.click('#nb-gear-gamma');
  assert.match(await footText(page), /^A change to notebooks\.json on acme\/demo is on its way; press again once it has landed\./);
  assert.equal(await page.evaluate(() => document.getElementById('nb-dialog').open), false, 'no dialog opens while the write is on its way');
  const asked = [];
  page.once('dialog', (d) => { asked.push(d.message()); d.dismiss(); });
  await page.click('#nb-remove-gamma');
  await sleep(200);
  assert.deepEqual(asked, [], 'the x asks nothing while the write is on its way');
  page.removeAllListeners('dialog');
  await page.waitForFunction(() => /^Proposed Loose ends in notebooks\.json on acme\/demo\./.test(document.getElementById('msg').textContent.trim()), null, { timeout: 6000 });
  assert.equal(stores['acme/demo'].puts.length, 1);
  assert.equal((await tileText(page))[0].name, 'Gamma', 'the repository on screen stays drawn');
  await page.click('#nb-gear-gamma');
  await page.waitForSelector('#nb-dialog[open]');
  await page.click('#nb-dialog button.quiet');
  await page.selectOption('#cp-repo', 'acme/demo');
  await untilTiles(page, 3);
  await context.close();
});

await check('N13: a Refresh while a write is on its way reads the proposal again once the write lands, so the next change goes over the version written', async () => {
  const { context, page, stores } = await open({ slow: 1500 });
  await untilTiles(page, 2);
  const store = stores['acme/demo'];
  await page.click('#nb-add');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Loose ends');
  await page.fill('#nb-d-summary', 'What is left.');
  await page.check('#nb-d-files input[data-path="OneDrive/loose.md"]');
  await page.click('#nb-d-save');
  await sleep(200);
  await page.click('#cp-refresh');
  await page.waitForFunction(() => /^Proposed Loose ends in notebooks\.json on acme\/demo\./.test(document.getElementById('msg').textContent.trim()), null, { timeout: 6000 });
  await untilTiles(page, 3);
  await page.click('#nb-gear-alpha');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Alpha after');
  await page.click('#nb-d-save');
  await page.waitForFunction(() => /^Changed Alpha after in notebooks\.json on acme\/demo\./.test(document.getElementById('msg').textContent.trim()), null, { timeout: 6000 });
  assert.equal(store.puts.length, 2);
  assert.equal(store.puts[1].sha, 'n2', 'over the version the first write made');
  assert.deepEqual(JSON.parse(store.notebooks).notebooks.map((b) => b.title), ['Alpha after', HOSTILE, 'Loose ends']);
  await context.close();
});

await check('N14: a notebook\'s repository that is public is said to be, with a link to its settings', async () => {
  const { context, page } = await open({ alphaPublic: true });
  await untilTiles(page, 2);
  await untilMade(page);
  assert.equal((await tileText(page))[0].state, 'Repository is public');
  await page.click('#nb-tile-alpha');
  await page.waitForSelector('#nb-side:not([hidden])');
  const side = await page.evaluate(() => { const s = document.getElementById('nb-side'), w = s.querySelector('.tok__state'); return { text: w.textContent, warn: w.classList.contains('tok__state--warn'), href: w.querySelector('a') && w.querySelector('a').href, repoHref: s.querySelector('.tok__owner a') && s.querySelector('.tok__owner a').href }; });
  assert.equal(side.text, 'The repository is public, and a notebook names a person\'s files: make it private here, or on GitHub under its settings (General, Danger Zone, Change visibility).');
  assert.equal(side.warn, true);
  assert.equal(side.href, 'https://github.com/acme/alpha/settings');
  assert.equal(side.repoHref, 'https://github.com/acme/alpha');
  await context.close();
});

await check('N15: a repository whose own record cannot be read says so on the tab, opened then or later, never Reading for good', async () => {
  const fail = { 'GET /repos/acme/demo': { status: 500, body: { message: 'Server Error' } } };
  let o = await open({ routes: fail });
  await page_note(o.page, /^acme\/demo could not be read, so whether it is private is not known and its notebooks are not read\. Press Refresh to try again\./);
  assert.equal(o.calls.filter((c) => /drive-catalog/.test(c.url)).length, 0, 'nothing is read from the branch');
  await o.context.close();
  o = await open({ routes: fail, hash: '#board' });
  await o.page.waitForFunction(() => /could not be read|Server Error/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  await o.page.click('.console__rail [data-tab="notebooks"]');
  await page_note(o.page, /^acme\/demo could not be read, so whether it is private is not known/);
  await o.context.close();
});

await check('N16: a notebook named add keeps its card, and the + tile is a tile of its own', async () => {
  const p = proposal();
  p.notebooks[1].slug = 'add';
  const { context, page } = await open({ proposal: p });
  await untilTiles(page, 2);
  const ids = await page.evaluate(() => ({ card: document.querySelectorAll('[id="nb-tile-add"]').length, plus: document.querySelectorAll('[id="nb-add"]').length, plusIsAdd: document.getElementById('nb-add').classList.contains('tok--add') }));
  assert.deepEqual(ids, { card: 1, plus: 1, plusIsAdd: true });
  await page.click('#nb-tile-add');
  await page.waitForSelector('#nb-side:not([hidden])');
  assert.equal(await page.evaluate(() => document.querySelector('#nb-side h3').textContent), HOSTILE);
  await page.click('#nb-add');
  await page.waitForSelector('#nb-dialog[open]');
  assert.equal(await page.evaluate(() => document.querySelector('#nb-dialog h3').textContent), 'New notebook');
  await context.close();
});

await check('N17: a catalog of a thousand files over 1 MB is read from its blob, and the dialog draws a few hundred at a time, the ticked first, a tick kept by path', async () => {
  const many = [];
  for (let i = 0; i < 1000; i++) many.push({ path: 'OneDrive/Big/file-' + String(i).padStart(4, '0') + '.txt', name: 'file-' + i + '.txt', id: 'b' + i, drive: 'd1', mime: '', kind: 'text', size: 1, modified: '2026-10-01T00:00:00Z' });
  const big = JSON.stringify({ folders: [], files: FILES.concat(many) });
  const { context, page, calls } = await open({ catalog: big, bigCatalog: true });
  await untilTiles(page, 2);
  assert.equal(calls.filter((c) => c.key === 'GET /repos/acme/demo/git/blobs/c1' && c.raw).length, 1, 'the catalog\'s text came from its blob');
  await page.click('#nb-gear-alpha');
  await page.waitForSelector('#nb-dialog[open]');
  const first = await page.evaluate(() => ({ rows: document.querySelectorAll('#nb-d-files label').length, top: Array.from(document.querySelectorAll('#nb-d-files label')).slice(0, 3).map((l) => l.title), more: document.getElementById('nb-d-more').textContent, count: document.getElementById('nb-d-count').textContent }));
  assert.equal(first.rows, 300);
  assert.deepEqual(first.top, [FILES[0].path, FILES[2].path, FILES[1].path], 'the notebook\'s own files first');
  assert.equal(first.more, 'Showing 300 of 1006 files; find a file by its path to narrow them.');
  assert.equal(first.count, '3 files ticked of 1006.');
  await page.fill('#nb-d-filter', 'file-0999');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#nb-d-files label').length), 1);
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-more').hidden), true);
  await page.check('#nb-d-files input[data-path="OneDrive/Big/file-0999.txt"]');
  await page.fill('#nb-d-filter', 'one.docx');
  await page.uncheck('#nb-d-files input[data-path="OneDrive/Papers/one.docx"]');
  await page.fill('#nb-d-filter', 'file-0999');
  assert.equal(await page.evaluate(() => document.querySelector('#nb-d-files input').checked), true, 'the tick stays when the file is drawn again');
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-count').textContent), '3 files ticked of 1006.');
  await page.fill('#nb-d-filter', 'zzz');
  assert.equal(await page.evaluate(() => document.getElementById('nb-d-files').textContent), 'No file\'s path holds that.');
  await page.click('#nb-d-save');
  await page.waitForFunction(() => /^Changed Alpha papers in notebooks\.json on acme\/demo\./.test(document.getElementById('msg').textContent.trim()), null, { timeout: 5000 });
  await context.close();
});

await check('N18: a Notebooks panel width kept from a wide window leaves the cards their room on a narrow window', async () => {
  for (const l of [{ name: 'narrow', viewport: { width: 820, height: 1000 }, column: true }, { name: 'narrower', viewport: { width: 640, height: 1000 }, column: true }, { name: 'wide', viewport: { width: 1280, height: 900 }, column: false }]) {
    const { context, page, errors } = await open({ viewport: l.viewport, layout: { nbside: 760 } });
    await untilTiles(page, 2);
    await page.click('#nb-tile-alpha');
    await page.waitForSelector('#nb-side:not([hidden])');
    const m = await page.evaluate(() => {
      const box = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { top: Math.round(r.top), width: Math.round(r.width), bottom: Math.round(r.bottom) }; };
      return { tiles: box('nb-tiles'), side: box('nb-side'), wrap: Math.round(document.getElementById('nb-tiles').parentElement.getBoundingClientRect().width) };
    });
    console.log('      ' + l.name + ':', JSON.stringify(m));
    if (l.column) {
      assert.ok(m.side.top >= m.tiles.bottom - 1, l.name + ': the side panel is not under the cards');
      assert.ok(m.tiles.width >= m.wrap - 2, l.name + ': the cards do not take the row');
      assert.ok(m.side.width <= m.wrap + 1, l.name + ': the side panel is wider than the row');
    } else {
      assert.ok(m.side.width <= m.wrap / 2 + 1, 'wide: the side panel takes more than half the row');
      assert.ok(m.tiles.width >= m.wrap / 2 - 30, 'wide: the cards were squeezed');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

await check('N19: a write whose token GitHub refuses mid-way leaves no lock behind: signed in again, the tab writes again, and that write holds the lock while on its way', async () => {
  const { context, page, stores } = await open({ unauthorizedOnce: true, slow: 1500 });
  const store = stores['acme/demo'];
  await untilTiles(page, 2);
  await proposeLoose(page, 'Third');
  await signInAgain(page);
  await untilTiles(page, 2, 10000);
  await proposeLoose(page, 'Fourth');
  assert.doesNotMatch(await footText(page), /is on its way/);
  await until(() => store.puts.length === 2);
  await page.click('#nb-gear-alpha');
  assert.match(await footText(page), /^A change to notebooks\.json on acme\/demo is on its way; press again once it has landed\./);
  assert.equal(await page.evaluate(() => document.getElementById('nb-dialog').open), false, 'no dialog opens beside the write');
  await page.waitForFunction(() => /^Proposed Fourth in notebooks\.json on acme\/demo\./.test(document.getElementById('msg').textContent.trim()), null, { timeout: 6000 });
  assert.equal(store.written, 1, 'the write after the sign-in landed, and only it');
  assert.equal(store.puts[1].sha, 'n1');
  await context.close();
});

await check('N20: an internal repository, which every member of its enterprise can read, is no private one: its branch is not read, and a notebook\'s internal repository is warned of', async () => {
  let o = await open({ internal: true });
  await page_note(o.page, /^acme\/demo is internal: every member of its enterprise can read it\. A notebook names a person's files, so a proposal lives only on a private repository's branch drive-catalog\./);
  assert.equal(await o.page.$('#nb-add'), null);
  assert.equal(o.calls.filter((c) => /drive-catalog/.test(c.url)).length, 0, 'nothing is read from the branch');
  await o.context.close();
  o = await open({ alphaInternal: true });
  await untilTiles(o.page, 2);
  await untilMade(o.page);
  assert.equal((await tileText(o.page))[0].state, 'Repository is internal');
  await o.page.click('#nb-tile-alpha');
  await o.page.waitForSelector('#nb-side:not([hidden])');
  const side = await o.page.evaluate(() => { const s = document.getElementById('nb-side'), w = s.querySelector('.tok__state'); return { text: w.textContent, warn: w.classList.contains('tok__state--warn'), href: w.querySelector('a') && w.querySelector('a').href, repoHref: s.querySelector('.tok__owner a') && s.querySelector('.tok__owner a').href }; });
  assert.equal(side.text, 'The repository is internal, which every member of its enterprise can read, and a notebook names a person\'s files: make it private here, or on GitHub under its settings (General, Danger Zone, Change visibility).');
  assert.equal(side.warn, true);
  assert.equal(side.href, 'https://github.com/acme/alpha/settings');
  assert.equal(side.repoHref, 'https://github.com/acme/alpha');
  const asked = [];
  o.page.once('dialog', (d) => { asked.push(d.message()); d.dismiss(); });
  await o.page.click('#nb-remove-alpha');
  await sleep(300);
  assert.match(asked[0] || '', / The repository alpha stays as it is\.$/, 'taking it out leaves the repository, whoever may read it');
  await o.context.close();
});

await check('N21: a write a rule on the branch refuses with 409, the file unchanged, says GitHub\'s words and reads nothing again; a rate limit asks for no access', async () => {
  let o = await open({ routes: { 'PUT /repos/acme/demo/contents/notebooks.json': { status: 409, body: { message: 'Repository rule violations found' } } } });
  await untilTiles(o.page, 2);
  await o.page.click('#nb-gear-alpha');
  await o.page.waitForSelector('#nb-dialog[open]');
  await o.page.fill('#nb-d-title', 'Alpha ruled');
  await o.page.click('#nb-d-save');
  await o.page.waitForFunction(() => /was not written/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  await sleep(300);
  assert.equal(await footText(o.page), 'notebooks.json on acme/demo was not written: GitHub answered 409: Repository rule violations found.');
  assert.equal(branchReads(o.calls, 'acme/demo', 'notebooks.json').length, 2, 'read at the start, and its sha once after the refusal');
  assert.equal(branchReads(o.calls, 'acme/demo', 'catalog.json').length, 2, 'read at the start and once before the write, never again');
  assert.equal((await tileText(o.page))[0].name, 'Alpha papers');
  await o.context.close();
  o = await open({ routes: { 'PUT /repos/acme/demo/contents/notebooks.json': { status: 403, body: { message: 'API rate limit exceeded for user ID 1.' } } } });
  await untilTiles(o.page, 2);
  await o.page.click('#nb-gear-alpha');
  await o.page.waitForSelector('#nb-dialog[open]');
  await o.page.fill('#nb-d-title', 'Alpha limited');
  await o.page.click('#nb-d-save');
  await o.page.waitForFunction(() => /was not written/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.equal(await footText(o.page), 'notebooks.json on acme/demo was not written: GitHub\'s rate limit for this token is reached (403). Wait a minute, then press Refresh.');
  await o.context.close();
});

await check('N22: taking out the last notebook of a file the organizer deleted meanwhile says it changed and reads it again', async () => {
  const one = proposal();
  one.notebooks = one.notebooks.slice(0, 1);
  one.left_out = FILES.slice(3).map((f) => f.path);
  const { context, page, stores } = await open({ proposal: one });
  await untilTiles(page, 1);
  stores['acme/demo'].notebooks = null;
  page.once('dialog', (d) => d.accept());
  await page.click('#nb-remove-alpha');
  await page.waitForFunction(() => /changed since the cards were drawn/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.equal(await footText(page), 'notebooks.json on acme/demo\'s drive-catalog changed since the cards were drawn, so nothing was written; it is read again: look it over and press again.');
  await untilTiles(page, 0);
  await page_note(page, /^No notebook is proposed yet for acme\/demo/);
  await context.close();
});

await check('N23: a change refused for a file changed meanwhile, landing once the page shows another repository, says nothing of reading it again', async () => {
  const other = { notebooks: [{ slug: 'gamma', title: 'Gamma', summary: 'Other things.', repository: 'gamma', files: ['OneDrive/loose.md'] }], left_out: FILES.slice(0, 5).map((f) => f.path) };
  const { context, page, stores } = await open({ repos: ['acme/demo', 'acme/other'], per: { 'acme/demo': { slow: 1500 }, 'acme/other': { proposal: other } } });
  await untilTiles(page, 2);
  stores['acme/demo'].sha = 'n9';
  await page.click('#nb-gear-alpha');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Alpha late');
  await page.click('#nb-d-save');
  await page.selectOption('#cp-repo', 'acme/other');
  await untilTiles(page, 1);
  await page.waitForFunction(() => /changed since the cards were drawn/.test(document.getElementById('msg').textContent), null, { timeout: 6000 });
  assert.equal(await footText(page), 'notebooks.json on acme/demo\'s drive-catalog changed since the cards were drawn, so nothing was written.');
  assert.equal((await tileText(page))[0].name, 'Gamma');
  await context.close();
});

await check('N24: a refusal whose sha cannot be read again says GitHub\'s words and frees the lock', async () => {
  let reads = 0;
  const NB = JSON.stringify(proposal(), null, 2) + '\n';
  const { context, page } = await open({ routes: {
    'PUT /repos/acme/demo/contents/notebooks.json': { status: 409, body: { message: 'Repository rule violations found' } },
    'GET /repos/acme/demo/contents/notebooks.json': () => { reads++; if (reads >= 2) return { status: 500, body: { message: 'Server Error' } }; return { raw: NB, json: objectOf(NB, 'n1') }; },
  } });
  await untilTiles(page, 2);
  await page.click('#nb-gear-alpha');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Alpha unread');
  await page.click('#nb-d-save');
  await page.waitForFunction(() => /was not written/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.equal(await footText(page), 'notebooks.json on acme/demo was not written: GitHub answered 409: Repository rule violations found.');
  await page.click('#nb-gear-alpha');
  await page.waitForSelector('#nb-dialog[open]', { timeout: 3000 });
  await context.close();
});

await check('N25: a refusal of the catalog read before the write asks for no write access', async () => {
  let n = 0;
  const { context, page, stores } = await open({ routes: { 'GET /repos/acme/demo/contents/catalog.json': () => { n++; return n >= 2 ? { status: 403, body: { message: 'Resource protected by organization SAML enforcement.' } } : { raw: CATALOG, json: objectOf(CATALOG, 'c1') }; } } });
  await untilTiles(page, 2);
  await page.click('#nb-gear-alpha');
  await page.waitForSelector('#nb-dialog[open]');
  await page.fill('#nb-d-title', 'Alpha read');
  await page.click('#nb-d-save');
  await page.waitForFunction(() => /was not written/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
  assert.equal(await footText(page), 'notebooks.json on acme/demo was not written: The token may not do this (403: Resource protected by organization SAML enforcement.). A fine-grained token needs the permission the sign-in box names for it; make one at https://github.com/settings/personal-access-tokens/new.');
  assert.equal(stores['acme/demo'].puts.length, 0, 'nothing is sent');
  await context.close();
});

await check('N26: a write that lands after a sign-out and a sign-in again frees no lock a later write holds', async () => {
  const gates = [], puts = [];
  const put = async (req) => { const i = puts.length; puts.push(JSON.parse(req.postData())); await new Promise((r) => { gates[i] = r; }); return { status: 200, body: { content: { sha: 'nw' + i } } }; };
  const { context, page } = await open({ routes: { 'PUT /repos/acme/demo/contents/notebooks.json': put } });
  await untilTiles(page, 2);
  await proposeLoose(page, 'Third');
  await until(() => puts.length === 1 && gates[0]);
  await page.click('#cp-signout');
  await signInAgain(page);
  await untilTiles(page, 2, 10000);
  await proposeLoose(page, 'Fourth');
  await until(() => puts.length === 2 && gates[1]);
  gates[0]();
  await page.waitForFunction(() => /^Proposed Third in notebooks\.json on acme\/demo\./.test(document.getElementById('msg').textContent.trim()), null, { timeout: 6000 });
  await untilTiles(page, 2, 8000);
  await sleep(500);
  await page.click('#nb-gear-alpha');
  assert.match(await footText(page), /^A change to notebooks\.json on acme\/demo is on its way; press again once it has landed\./);
  assert.equal(await page.evaluate(() => document.getElementById('nb-dialog').open), false, 'no dialog opens beside the later write');
  gates[1]();
  await context.close();
});

// Make private (the owner's choice of 2026-10-19): a notebook's public or internal repository made
// private from the side panel, as the person, after a confirmation that says what GitHub erases
async function openAlphaSide(o) {
  await untilTiles(o.page, 2);
  await untilMade(o.page);
  await o.page.click('#nb-tile-alpha');
  await o.page.waitForSelector('#nb-side:not([hidden])');
}
const sideState = (page) => page.evaluate(() => {
  const s = document.getElementById('nb-side'), b = document.getElementById('nb-private');
  return { states: Array.from(s.querySelectorAll('.tok__state')).map((w) => w.textContent), button: b ? { text: b.textContent, disabled: b.disabled } : null, facts: Array.from(s.querySelectorAll('.tkdlg__fact')).map((f) => f.textContent) };
});

await check('N27: a public notebook repository is made private only once the person confirms what GitHub erases, as the person, and the tab then says it is private', async () => {
  const o = await open({ alphaPublic: true, alphaAdmin: true });
  await openAlphaSide(o);
  assert.deepEqual((await sideState(o.page)).button, { text: 'Make private', disabled: false });
  const asked = [];
  o.page.once('dialog', (d) => { asked.push(d.message()); d.dismiss(); });
  await o.page.click('#nb-private');
  await sleep(300);
  // what GitHub's own question says, and what GitHub's plans give a public repository alone
  assert.equal(asked[0], 'Make acme/alpha private? Only the people given access to it will see it. GitHub erases its stars and watchers, leaves its forks public and detaches them, and unpublishes its GitHub Pages site on a free plan, where its rulesets and branch protection also stop being enforced. Its code scanning stops unless its owner has GitHub Code Security, and its secret scanning and push protection unless its owner has GitHub Secret Protection. The repository\'s files and history themselves stay as they are.');
  assert.equal(o.stores['acme/demo'].patches.length, 0, 'nothing is changed when the person says no');
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await o.page.waitForFunction(() => /is private now/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  const patches = o.calls.filter((c) => c.key.startsWith('PATCH '));
  assert.deepEqual(patches.map((c) => [c.key, c.body]), [['PATCH /repos/acme/alpha', { visibility: 'private' }]], 'one change, to the notebook\'s own repository');
  assert.equal(patches[0].auth, 'Bearer github_pat_TEST', 'as the person signed in');
  assert.equal(await footText(o.page), 'acme/alpha is private now: only the people given access to it see it.');
  assert.doesNotMatch(await o.page.evaluate(() => document.getElementById('msg').className), /admin__warn/, 'no warning');
  assert.equal((await tileText(o.page))[0].state, 'Repository made');
  const after = await sideState(o.page);
  assert.equal(after.button, null, 'no button once it is private');
  assert.deepEqual(after.states, ['The repository is made.']);
  assert.deepEqual(o.errors, []);
  await o.context.close();
});

await check('N28: an internal repository\'s confirmation says what making it private does to an internal repository\'s forks', async () => {
  const o = await open({ alphaInternal: true });
  await openAlphaSide(o);
  const asked = [];
  o.page.once('dialog', (d) => { asked.push(d.message()); d.dismiss(); });
  await o.page.click('#nb-private');
  await sleep(300);
  assert.equal(asked[0], 'Make acme/alpha private? Only the people given access to it will see it. GitHub erases its stars and watchers and its forks become private, those of people without access removed. The repository\'s files and history themselves stay as they are.');
  assert.equal(o.stores['acme/demo'].patches.length, 0);
  await o.context.close();
});

await check('N29: a person GitHub says does not administer the repository is told so, with no button that could only be refused and no pointer to one', async () => {
  const o = await open({ alphaPublic: true, alphaAdmin: false });
  await openAlphaSide(o);
  const st = await sideState(o.page);
  assert.equal(st.button, null);
  // neither the button nor the settings page, which GitHub shows only to an administrator
  assert.deepEqual(st.states, ['The repository is public, and a notebook names a person\'s files, so it should be private.']);
  assert.equal(await o.page.evaluate(() => document.querySelectorAll('#nb-side .tok__state a').length), 0, 'no link to settings it cannot open');
  assert.ok(st.facts.includes('Only an administrator of acme/alpha may change its visibility, and GitHub says you are not one: ask one to make it private.'), JSON.stringify(st.facts));
  await o.context.close();
});

await check('N30: a refusal is said in GitHub\'s words with what the change needs, the repository stays public, and the button can be pressed again; a rate limit is not taken for missing access, and a 403 or a 404 is, in the words of the way the person signed in', async () => {
  let o = await open({ alphaPublic: true, patchAnswer: () => ({ status: 422, body: { message: 'Visibility can only be changed by organization owners' } }) });
  await openAlphaSide(o);
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await o.page.waitForFunction(() => /did not make/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  assert.equal(await footText(o.page), 'GitHub did not make acme/alpha private: GitHub refused the request (422: Visibility can only be changed by organization owners). Only an administrator of acme/alpha may change its visibility, with Administration: read and write on the token, and an organization may keep the change to its owners.');
  assert.match(await o.page.evaluate(() => document.getElementById('msg').className), /admin__warn/);
  assert.equal((await tileText(o.page))[0].state, 'Repository is public');
  assert.deepEqual((await sideState(o.page)).button, { text: 'Make private', disabled: false });
  await o.context.close();
  o = await open({ alphaPublic: true, patchAnswer: () => ({ status: 403, body: { message: 'API rate limit exceeded for user ID 1.' } }) });
  await openAlphaSide(o);
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await o.page.waitForFunction(() => /did not make/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  assert.equal(await footText(o.page), 'GitHub did not make acme/alpha private: GitHub\'s rate limit for this token is reached (403). Wait a minute, then press Refresh.');
  await o.context.close();
  // GitHub's other refusals of the change: a 403 for a token or an installation without
  // Administration, and a 404 where the sign-in may not see the repository as an administrator
  const refused = async (opts, answer) => {
    const r = await open(Object.assign({ alphaPublic: true, patchAnswer: () => answer }, opts));
    await openAlphaSide(r);
    r.page.once('dialog', (d) => d.accept());
    await r.page.click('#nb-private');
    await r.page.waitForFunction(() => /did not make/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
    const words = await footText(r.page);
    assert.match(await r.page.evaluate(() => document.getElementById('msg').className), /admin__warn/);
    assert.deepEqual((await sideState(r.page)).button, { text: 'Make private', disabled: false });
    const auth = r.calls.filter((c) => c.key === 'PATCH /repos/acme/alpha').map((c) => c.auth);
    await r.context.close();
    return { words, auth };
  };
  const integration = { status: 403, body: { message: 'Resource not accessible by integration' } };
  const byToken = ' Only an administrator of acme/alpha may change its visibility, with Administration: read and write on the token, and an organization may keep the change to its owners.';
  assert.deepEqual(await refused({}, integration), { auth: ['Bearer github_pat_TEST'], words: 'GitHub did not make acme/alpha private: The token may not do this (403: Resource not accessible by integration). A fine-grained token needs the permission the sign-in box names for it; make one at https://github.com/settings/personal-access-tokens/new.' + byToken });
  assert.deepEqual(await refused({}, { status: 404, body: { message: 'Not Found' } }), { auth: ['Bearer github_pat_TEST'], words: 'GitHub did not make acme/alpha private: GitHub has nothing at /repos/acme/alpha (404): the repository, the branch or the file is not there, or the token does not reach it.' + byToken });
  // signed in with GitHub, the access is SymphonyBoard's, which the token's words would misname
  assert.deepEqual(await refused({ byApp: true }, integration), { auth: ['Bearer ghu_TEST'], words: 'GitHub did not make acme/alpha private: The sign-in may not do this (403: Resource not accessible by integration): it acts within SymphonyBoard\'s permissions and your own access, on the repositories the App is installed on. An administrator accepts the App\'s newest permissions at https://github.com/acme/alpha/settings/installations (Configure beside SymphonyBoard). Only an administrator of acme/alpha may change its visibility, with SymphonyBoard installed on it and its Administration permission accepted, and an organization may keep the change to its owners.' });
});

await check('N31: while GitHub is asked the button waits and says so, and a sign-out on the way leaves no lock for the next sign-in', async () => {
  const gates = [];
  const o = await open({ alphaPublic: true, patchGate: () => new Promise((r) => gates.push(r)) });
  await openAlphaSide(o);
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await until(() => gates.length === 1);
  assert.deepEqual((await sideState(o.page)).button, { text: 'Making it private...', disabled: true });
  assert.equal(await footText(o.page), 'Making acme/alpha private...');
  // signed out on the way: the refusal of a call made before it is never answered (call), so the
  // lock must go with the sign-in
  await o.page.click('#cp-signout');
  await signInAgain(o.page);
  await openAlphaSide(o);
  assert.deepEqual((await sideState(o.page)).button, { text: 'Make private', disabled: false }, 'the new sign-in is not held by the old change');
  gates[0]();
  await o.context.close();
});

await check('N32: GitHub\'s answer, not the press, says what the repository is now', async () => {
  const o = await open({ alphaPublic: true, patchAnswer: () => ({ status: 200, body: { full_name: 'acme/alpha', private: false, visibility: 'public' } }) });
  await openAlphaSide(o);
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await o.page.waitForFunction(() => /still public/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  assert.equal(await footText(o.page), 'GitHub answered, but acme/alpha is still public.');
  assert.match(await o.page.evaluate(() => document.getElementById('msg').className), /admin__warn/);
  assert.equal((await tileText(o.page))[0].state, 'Repository is public');
  await o.context.close();
});

// the side panel closed and opened again by its card, which draws its button afresh from the lock
async function reopenSide(o, slug) {
  await o.page.click('#nb-tile-' + slug);
  await o.page.waitForSelector('#nb-side[hidden]', { state: 'attached' });
  await o.page.click('#nb-tile-' + slug);
  await o.page.waitForSelector('#nb-side:not([hidden])');
}
// a press of the button as the page has it, where Playwright's click would wait for it to be enabled:
// a disabled button takes no click, so nothing is asked and nothing sent
async function pressAsIs(o) {
  const asked = [];
  const ask = (d) => { asked.push(d.message()); d.accept(); };
  o.page.on('dialog', ask);
  await o.page.evaluate(() => document.getElementById('nb-private').click());
  await sleep(400);
  o.page.off('dialog', ask);
  return asked;
}

await check('N33: while a change is on its way, a side panel drawn again shows the button waiting and a press of it sends nothing, before a sign-out and after a sign-in again alike', async () => {
  const gates = [];
  const o = await open({ alphaPublic: true, alphaAdmin: true, patchGate: () => new Promise((r) => gates.push(r)) });
  const store = o.stores['acme/demo'];
  await openAlphaSide(o);
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await until(() => gates.length === 1);
  await reopenSide(o, 'alpha');
  assert.deepEqual((await sideState(o.page)).button, { text: 'Making it private...', disabled: true }, 'drawn afresh from the lock');
  assert.deepEqual(await pressAsIs(o), [], 'nothing is asked');
  assert.equal(store.patches.length, 1, 'one change at a time');
  // a sign-in again starts the count of sign-ins over, and the lock a change after it takes is held
  // by that sign-in, not by the first
  await o.page.click('#cp-signout');
  await signInAgain(o.page);
  await openAlphaSide(o);
  assert.deepEqual((await sideState(o.page)).button, { text: 'Make private', disabled: false });
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await until(() => gates.length === 2);
  await reopenSide(o, 'alpha');
  assert.deepEqual((await sideState(o.page)).button, { text: 'Making it private...', disabled: true }, 'the change after a sign-in again holds the lock too');
  assert.deepEqual(await pressAsIs(o), []);
  assert.equal(store.patches.length, 2);
  gates.forEach((g) => g());
  await o.context.close();
});

await check('N34: a change answered after a sign-out and a sign-in again frees no lock a later change holds', async () => {
  const gates = [];
  const o = await open({ alphaPublic: true, betaPublic: true, patchGate: () => new Promise((r) => gates.push(r)) });
  await openAlphaSide(o);
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await until(() => gates.length === 1);
  await o.page.click('#cp-signout');
  await signInAgain(o.page);
  await untilTiles(o.page, 2, 10000);
  await untilMade(o.page);
  await o.page.click('#nb-tile-beta');
  await o.page.waitForSelector('#nb-side:not([hidden])');
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await until(() => gates.length === 2);
  // the first change lands now; the tab, which a sign-in again moved on, reads the repositories again
  gates[0]();
  await o.page.waitForFunction(() => /^acme\/alpha is private now/.test(document.getElementById('msg').textContent.trim()), null, { timeout: 8000 });
  await o.page.waitForSelector('#nb-side[hidden]', { state: 'attached', timeout: 8000 });
  await untilTiles(o.page, 2);
  await untilMade(o.page);
  assert.deepEqual((await tileText(o.page)).map((t) => t.state), ['Repository made', 'Repository is public']);
  await o.page.click('#nb-tile-beta');
  await o.page.waitForSelector('#nb-side:not([hidden])');
  assert.deepEqual((await sideState(o.page)).button, { text: 'Making it private...', disabled: true }, 'the later change still holds the lock');
  gates[1]();
  await o.page.waitForFunction(() => /^acme\/beta is private now/.test(document.getElementById('msg').textContent.trim()), null, { timeout: 8000 });
  await o.context.close();
});

await check('N35: a Refresh while the change is on its way reads the repository again once GitHub answers, so the card says it is private and no button is left waiting', async () => {
  const gates = [];
  const o = await open({ alphaPublic: true, alphaAdmin: true, patchGate: () => new Promise((r) => gates.push(r)) });
  const reads = () => o.calls.filter((c) => c.key === 'GET /repos/acme/alpha').length;
  await openAlphaSide(o);
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await until(() => gates.length === 1);
  await o.page.click('#cp-refresh');
  // the Refresh reads the repository while GitHub has not yet answered the change: still public
  await until(() => reads() === 2);
  await untilTiles(o.page, 2);
  await untilMade(o.page);
  assert.equal((await tileText(o.page))[0].state, 'Repository is public');
  await o.page.click('#nb-tile-alpha');
  await o.page.waitForSelector('#nb-side:not([hidden])');
  assert.deepEqual((await sideState(o.page)).button, { text: 'Making it private...', disabled: true }, 'a Refresh is no sign-out: the change still holds the lock');
  gates[0]();
  await o.page.waitForFunction(() => /^acme\/alpha is private now/.test(document.getElementById('msg').textContent.trim()), null, { timeout: 8000 });
  await o.page.waitForFunction(() => { const s = document.querySelector('#nb-tile-alpha .tok__state'); return s && s.textContent === 'Repository made'; }, null, { timeout: 8000 });
  assert.equal(reads(), 3, 'read once more, after the answer');
  await o.page.click('#nb-tile-alpha');
  await o.page.waitForSelector('#nb-side:not([hidden])');
  const st = await sideState(o.page);
  assert.equal(st.button, null, 'no button on a private repository');
  assert.deepEqual(st.states, ['The repository is made.']);
  assert.equal(o.stores['acme/demo'].patches.length, 1);
  assert.deepEqual(o.errors, []);
  await o.context.close();
});

await check('N36: a change answered once the page shows another owner\'s repository marks nothing there, and the freed lock is drawn', async () => {
  const gates = [];
  const o = await open({ repos: ['acme/demo', 'zeta/demo'], per: { 'acme/demo': { alphaPublic: true, patchGate: () => new Promise((r) => gates.push(r)) }, 'zeta/demo': { alphaPublic: true } } });
  await openAlphaSide(o);
  o.page.once('dialog', (d) => d.accept());
  await o.page.click('#nb-private');
  await until(() => gates.length === 1);
  await o.page.selectOption('#cp-repo', 'zeta/demo');
  await o.page.waitForFunction(() => Array.from(document.querySelectorAll('#nb-tiles .tok__open:not(.tok--add)')).length === 2 && !!document.querySelector('#nb-tile-alpha .tok__state'), null, { timeout: 8000 });
  await o.page.click('#nb-tile-alpha');
  await o.page.waitForSelector('#nb-side:not([hidden])');
  assert.equal(await o.page.evaluate(() => document.querySelector('#nb-side .tok__owner').textContent), 'zeta/alpha');
  assert.deepEqual((await sideState(o.page)).button, { text: 'Make private', disabled: true }, 'one change at a time, whichever repository');
  gates[0]();
  await o.page.waitForFunction(() => /^acme\/alpha is private now/.test(document.getElementById('msg').textContent.trim()), null, { timeout: 8000 });
  await sleep(500);
  // read as the page stands, with no click that would draw it again
  const st = await sideState(o.page);
  assert.equal((await tileText(o.page))[0].state, 'Repository is public', 'zeta/alpha is as its own read says');
  assert.equal(st.states[0], 'The repository is public, and a notebook names a person\'s files: make it private here, or on GitHub under its settings (General, Danger Zone, Change visibility).');
  assert.deepEqual(st.button, { text: 'Make private', disabled: false }, 'the freed lock is drawn');
  assert.deepEqual([o.stores['acme/demo'].visibility.alpha, o.stores['zeta/demo'].visibility.alpha], ['private', 'public']);
  await o.context.close();
});

await browser.close();
console.log('\n' + results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
