// The button home screen on every screen (site branch claude/button-home-default, 2026-10-21, the
// owner's "the mobile view with the buttons should be the default for both pc/browser and mobile
// view, you can put in the settings like a way to switch to legacy view" and "give me the ability to
// click and drag buttons to new positions and for it to be persistent saved to my google chrome
// profile along with my login info, last open repo"). GitHub is mocked; nothing leaves for another
// host. SHOTS=<dir> writes a picture of each layout there.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const SHOTS = process.env.SHOTS || '';
let real = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(real.includes(a), 'mutant text not found: ' + a.slice(0, 60)); real = real.replace(a, b); }
real = real.replace(/var SIGNIN_SERVICE = '[^']*';/, "var SIGNIN_SERVICE = '';").replace(/var CLIENT_ID = '[^']*';/, "var CLIENT_ID = '';");
let css = fs.readFileSync(SITE + '/assets/css/control.css', 'utf8');
if (process.env.CSS_MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.CSS_MUTANT, 'utf8'))) { assert.ok(css.includes(a), 'mutant text not found: ' + a.slice(0, 60)); css = css.replace(a, b); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = 'symphony_panel_home';
const FIRST = ['command', 'board', 'tasks', 'dependencies', 'explore', 'pulls', 'runs', 'workers', 'agents', 'tokens', 'grid', 'wandb', 'leaders', 'share', 'folders', 'notebooks', 'about'];

let passed = 0, failed = 0;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); passed++; console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '-', String(e && e.message || e).split('\n')[0]); }
}

const browser = await chromium.launch();
const PHONE = { width: 390, height: 844 };
// one browser profile, the token kept for acme/demo; `home` is what the profile kept of the home
// screen before the page loads, once
async function open(opts = {}) {
  const view = opts.viewport || { width: 1280, height: 900 };
  const touch = !!opts.touch;
  const context = await browser.newContext(Object.assign({ viewport: view, reducedMotion: 'reduce' }, touch ? { hasTouch: true, isMobile: true } : {}));
  await context.route((u) => u.protocol === 'https:' && u.host !== 'api.github.com', (route) => route.abort());
  await context.route('**/assets/js/symphony-panel.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: real }));
  await context.route('**/assets/css/control.css*', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: css }));
  await context.route('https://api.github.com/**', async (route) => {
    const url = new URL(route.request().url());
    const key = route.request().method() + ' ' + url.pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (key === 'GET /user') return json(200, { login: 'tester' });
    if (key === 'GET /repos/acme/demo') return json(200, { full_name: 'acme/demo', default_branch: 'main', private: true, topics: ['symphony'], id: 123, owner: { id: 77, login: 'acme' }, permissions: { admin: true, push: true, pull: true } });
    if (key === 'GET /repos/acme/demo/issues' || key === 'GET /repos/acme/demo/pulls') return json(200, []);
    if (/^GET \/repos\/acme\/demo\/actions\/.*runs$/.test(key)) return json(200, { workflow_runs: [] });
    return json(404, { message: 'Not Found' });
  });
  await context.addInitScript((home) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('symphony_panel_token', 'github_pat_TESTER');
    localStorage.setItem('symphony_panel_repos', JSON.stringify(['acme/demo']));
    if (home) localStorage.setItem('symphony_panel_home', home);
    sessionStorage.setItem('seeded', '1');
  }, opts.home ? JSON.stringify(opts.home) : '');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/symphony/control/?repo=acme/demo' + (opts.hash || ''));
  await page.waitForFunction(() => /^acme\/demo, default/.test((document.getElementById('cp-summary') || {}).textContent || ''), null, { timeout: 15000 });
  await sleep(150);
  return { context, page, errors };
}
const order = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.console__rail [data-tab]')).map((b) => b.getAttribute('data-tab')));
const kept = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const facts = (page) => page.evaluate(() => {
  const c = document.getElementById('console');
  const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const rail = document.querySelector('.console__rail');
  return {
    home: c.classList.contains('console--home'),
    buttons: c.classList.contains('console--buttons'),
    side: shown(document.querySelector('.console__side')),
    stage: shown(document.querySelector('.console__stage')),
    back: shown(document.getElementById('cp-back')),
    title: document.getElementById('cp-phonetitle').textContent,
    hash: location.hash,
    open: Array.from(document.querySelectorAll('[data-tab-panel]')).filter((p) => !p.hidden).map((p) => p.getAttribute('data-tab-panel')),
    railGrid: getComputedStyle(rail).display === 'grid',
    pageScrolls: document.scrollingElement.scrollHeight > innerHeight + 1 || document.scrollingElement.scrollWidth > innerWidth + 1,
    railOverflows: rail.scrollHeight > rail.clientHeight + 1,
    icon: (() => { const i = document.querySelector('.console__rail [data-tab="tasks"] .rail__icon'); return i ? i.getBoundingClientRect().width : 0; })(),
  };
});
// the centre of a button's icon, in the window
const centre = (page, name) => page.evaluate((n) => { const r = document.querySelector('.console__rail [data-tab="' + n + '"] .rail__icon').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, name);
async function mouseDrag(page, from, to, opts = {}) {
  const a = await centre(page, from), b = await centre(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12); await sleep(16); }
  if (opts.escape) { await page.keyboard.press('Escape'); await sleep(50); }
  await page.mouse.up();
  await sleep(120);
}
// a finger, through Chromium's own touch input: pressed, held `hold` ms, moved to the other button
async function fingerDrag(page, from, to, hold) {
  const cdp = await page.context().newCDPSession(page);
  const a = await centre(page, from), b = await centre(page, to);
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] });
  await touch('touchStart', a);
  await sleep(hold);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', { x: a.x + (b.x - a.x) * i / 12, y: a.y + (b.y - a.y) * i / 12 }); await sleep(20); }
  await touch('touchEnd');
  await sleep(150);
}

await check('H1: a computer opens on the home screen of buttons: no side rail beside a tab, no tab, the buttons in a grid that fits with nothing scrolling', async () => {
  const { context, page, errors } = await open();
  const f = await facts(page);
  assert.equal(f.home, true, 'not on the home screen');
  assert.equal(f.buttons, true, 'the buttons layout is not on');
  assert.equal(f.stage, false, 'a tab\'s stage shows on the home screen');
  assert.deepEqual(f.open, [], 'a tab is open under the home screen');
  assert.equal(f.railGrid, true, 'the tabs are not a grid of buttons');
  assert.ok(f.icon >= 64, 'the buttons are small on a computer: ' + f.icon);
  assert.equal(f.pageScrolls, false, 'the page scrolls');
  assert.equal(f.railOverflows, false, 'the buttons scroll');
  assert.equal(f.hash, '');
  assert.equal(await kept(page), null, 'the default was written to storage');
  if (SHOTS) await page.screenshot({ path: SHOTS + '/home-1280x900.png' });
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H2: a button opens its tab across the whole console under the back bar, its name in the bar; the back button and the browser\'s back return to the buttons', async () => {
  const { context, page, errors } = await open();
  await page.click('.console__rail [data-tab="tasks"]');
  await sleep(100);
  let f = await facts(page);
  assert.equal(f.home, false);
  assert.deepEqual(f.open, ['tasks']);
  assert.equal(f.side, false, 'the side column shows beside the tab');
  assert.equal(f.back, true, 'no back button');
  assert.equal(f.title, 'Tasks');
  assert.equal(f.hash, '#tasks');
  const width = await page.evaluate(() => [document.getElementById('tab-tasks').getBoundingClientRect().width, document.querySelector('.console__body').getBoundingClientRect().width]);
  assert.ok(width[0] > width[1] - 60, 'the tab does not take the console\'s width: ' + width);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/tab-1280x900.png' });
  await page.click('#cp-back');
  await sleep(100);
  f = await facts(page);
  assert.equal(f.home, true, 'the back button left the tab open');
  assert.equal(f.hash, '');
  await page.click('.console__rail [data-tab="runs"]');
  await sleep(100);
  await page.goBack();
  await sleep(150);
  f = await facts(page);
  assert.equal(f.home, true, 'the browser\'s back did not return to the buttons');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H3: a link to a tab opens that tab with the back bar, and the back button reaches the buttons', async () => {
  const { context, page, errors } = await open({ hash: '#runs' });
  let f = await facts(page);
  assert.deepEqual(f.open, ['runs']);
  assert.equal(f.back, true);
  await page.click('#cp-back');
  await sleep(100);
  f = await facts(page);
  assert.equal(f.home, true);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H4: Legacy under the buttons gives the side rail back beside a tab, is kept in the profile and comes back on a reload; Buttons returns to the home screen', async () => {
  const { context, page, errors } = await open();
  assert.equal(await page.getAttribute('#cp-layout-buttons', 'aria-pressed'), 'true');
  await page.click('#cp-layout-legacy');
  await sleep(100);
  let f = await facts(page);
  assert.equal(f.home, false, 'Legacy stayed on the home screen');
  assert.equal(f.buttons, false);
  assert.equal(f.side, true, 'no side rail');
  assert.equal(f.back, false, 'the back bar shows in the legacy view');
  assert.equal(f.open.length, 1, 'no tab beside the rail');
  assert.equal(f.railGrid, false);
  assert.equal(await page.getAttribute('#cp-layout-legacy', 'aria-pressed'), 'true');
  assert.deepEqual(JSON.parse(await kept(page)), { layout: 'legacy' });
  if (SHOTS) await page.screenshot({ path: SHOTS + '/legacy-1280x900.png' });
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await page.waitForFunction(() => /^acme\/demo, default/.test((document.getElementById('cp-summary') || {}).textContent || ''));
  f = await facts(page);
  assert.equal(f.home, false, 'the reload forgot Legacy');
  assert.equal(f.side, true);
  await page.click('#cp-layout-buttons');
  await sleep(100);
  f = await facts(page);
  assert.equal(f.home, true, 'Buttons did not show the home screen');
  assert.equal(await kept(page), null, 'the default is still written');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H5: a mouse drags Tasks to the first place; the others make room, the order is kept in the profile and on the legacy rail, the drag opens no tab, and a reload keeps it', async () => {
  const { context, page, errors } = await open();
  await mouseDrag(page, 'tasks', 'command');
  const now = await order(page);
  assert.deepEqual(now.slice(0, 4), ['tasks', 'command', 'board', 'dependencies'], now.join(' '));
  let f = await facts(page);
  assert.equal(f.home, true, 'the drag opened a tab');
  assert.deepEqual(JSON.parse(await kept(page)).order, now);
  assert.equal(await page.isVisible('#cp-order-reset'), true, 'no Reset order');
  assert.match(await page.textContent('#cp-home-live'), /Tasks: place 1 of 17/);
  // a plain press still opens a tab
  await page.click('.console__rail [data-tab="board"]');
  await sleep(100);
  f = await facts(page);
  assert.deepEqual(f.open, ['board'], 'a press after a drag opens nothing');
  await page.goto(BASE + '/symphony/control/?repo=acme/demo');
  await page.waitForFunction(() => /^acme\/demo, default/.test((document.getElementById('cp-summary') || {}).textContent || ''));
  assert.deepEqual(await order(page), now, 'the reload lost the order');
  await page.click('#cp-layout-legacy');
  assert.deepEqual(await order(page), now, 'the legacy rail has another order');
  await page.click('#cp-layout-buttons');
  await page.click('#cp-order-reset');
  await sleep(100);
  assert.deepEqual(await order(page), FIRST, 'Reset order did not put them back');
  assert.equal(await kept(page), null);
  assert.equal(await page.isVisible('#cp-order-reset'), false);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H6: a button keeps its own colour wherever it is dragged', async () => {
  const { context, page } = await open();
  const colour = () => page.evaluate(() => getComputedStyle(document.querySelector('.console__rail [data-tab="tasks"] .rail__icon')).backgroundImage);
  const before = await colour();
  await mouseDrag(page, 'tasks', 'about');
  assert.equal((await order(page)).slice(-1)[0], 'tasks');
  assert.equal(await colour(), before);
  await context.close();
});

await check('H7: Escape during a drag puts every button back and keeps nothing', async () => {
  const { context, page } = await open();
  await mouseDrag(page, 'grid', 'board', { escape: true });
  assert.deepEqual(await order(page), FIRST);
  assert.equal(await kept(page), null);
  const f = await facts(page);
  assert.equal(f.home, true);
  await context.close();
});

await check('H8: Alt and the arrow keys move the focused button a place, a row, or to the ends, and say where it is; the arrows alone still only move the focus', async () => {
  const { context, page } = await open();
  await page.focus('.console__rail [data-tab="board"]');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-tab')), 'tasks');
  assert.deepEqual(await order(page), FIRST, 'an arrow alone moved a button');
  await page.keyboard.press('Alt+ArrowLeft');
  assert.deepEqual((await order(page)).slice(0, 3), ['command', 'tasks', 'board']);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-tab')), 'tasks', 'the focus left the moved button');
  assert.match(await page.textContent('#cp-home-live'), /Tasks: place 2 of 17/);
  await page.keyboard.press('Alt+End');
  assert.equal((await order(page)).slice(-1)[0], 'tasks');
  await page.keyboard.press('Alt+Home');
  assert.equal((await order(page))[0], 'tasks');
  await page.keyboard.press('Alt+ArrowDown');
  const across = await page.evaluate(() => { const all = Array.from(document.querySelectorAll('.console__rail [data-tab]')); return all.filter((t) => t.offsetTop === all[0].offsetTop).length; });
  assert.equal((await order(page)).indexOf('tasks'), across, 'Alt and Down did not move it a row');
  assert.deepEqual(JSON.parse(await kept(page)).order, await order(page));
  await page.keyboard.press('Enter');
  await sleep(100);
  assert.deepEqual((await facts(page)).open, ['tasks'], 'Enter did not open the moved button');
  await context.close();
});

await check('H9: on a phone a finger held on a button drags it; a finger that moves at once only scrolls, and a short tap opens the tab', async () => {
  const { context, page, errors } = await open({ viewport: PHONE, touch: true });
  await fingerDrag(page, 'board', 'tasks', 60);
  assert.deepEqual(await order(page), FIRST, 'a quick swipe moved a button');
  await fingerDrag(page, 'board', 'tasks', 600);
  const now = await order(page);
  assert.deepEqual(now.slice(0, 3), ['command', 'tasks', 'board'], now.join(' '));
  let f = await facts(page);
  assert.equal(f.home, true, 'the drag opened a tab');
  assert.deepEqual(JSON.parse(await kept(page)).order, now);
  assert.equal(f.pageScrolls, false, 'the page scrolls on a phone');
  assert.equal(await page.isVisible('#cp-layout-legacy'), false, 'Legacy is offered on a phone, which always has the buttons');
  if (SHOTS) await page.screenshot({ path: SHOTS + '/home-390x844.png' });
  await page.tap('.console__rail [data-tab="runs"]');
  await sleep(150);
  f = await facts(page);
  assert.deepEqual(f.open, ['runs'], 'a tap did not open the tab');
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H10: a phone shows the buttons even where the profile chose Legacy, in the order the profile kept', async () => {
  const mine = ['about'].concat(FIRST.filter((n) => n !== 'about'));
  const { context, page } = await open({ viewport: PHONE, touch: true, home: { layout: 'legacy', order: mine } });
  const f = await facts(page);
  assert.equal(f.home, true);
  assert.deepEqual(await order(page), mine);
  await context.close();
});

await check('H11: the home screen fits with nothing scrolling on a laptop, a wide screen, a small window, a tablet and a phone held sideways', async () => {
  for (const v of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 960, height: 600 }, { width: 820, height: 1180 }, { width: 844, height: 390 }]) {
    const { context, page } = await open({ viewport: v, touch: v.width < 900 });
    const f = await facts(page);
    assert.equal(f.home, true, v.width + 'x' + v.height);
    assert.equal(f.pageScrolls, false, 'the page scrolls at ' + v.width + 'x' + v.height);
    if (v.height >= 521 && v.width >= 901) assert.equal(f.railOverflows, false, 'the buttons scroll at ' + v.width + 'x' + v.height);
    if (SHOTS) await page.screenshot({ path: SHOTS + '/home-' + v.width + 'x' + v.height + '.png' });
    await context.close();
  }
});

await check('H12: a kept order that names a tab the page no longer has, or misses one it has since gained, still shows every button once', async () => {
  const { context, page, errors } = await open({ home: { order: ['gone', 'grid', 'grid', 'board'] } });
  const now = await order(page);
  assert.deepEqual(now.slice(0, 2), ['grid', 'board']);
  assert.deepEqual(now.slice().sort(), FIRST.slice().sort());
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H13: storage that is not the page\'s own shape is read as the default, and another tab of the profile choosing Legacy changes this one too', async () => {
  const { context, page, errors } = await open({ home: ['not', 'an', 'object'] });
  assert.equal((await facts(page)).home, true);
  assert.deepEqual(await order(page), FIRST);
  const other = await context.newPage();
  await other.goto(BASE + '/symphony/control/?repo=acme/demo');
  await other.waitForFunction(() => /^acme\/demo, default/.test((document.getElementById('cp-summary') || {}).textContent || ''));
  await other.click('#cp-layout-legacy');
  await sleep(200);
  const f = await facts(page);
  assert.equal(f.buttons, false, 'the first tab kept the buttons');
  assert.equal(f.side, true);
  assert.deepEqual(errors, []);
  await context.close();
});

await check('H14: with the text made larger (A+), a drag still lands the button where the pointer lets it go', async () => {
  const { context, page } = await open();
  for (let i = 0; i < 3; i++) await page.click('#cp-zoom-up');
  await sleep(150);
  await mouseDrag(page, 'about', 'tasks');
  const now = await order(page);
  assert.equal(now.indexOf('about'), 2, now.join(' '));
  await page.click('#cp-zoom-reset');
  await context.close();
});

await check('H15: on a phone a finger held long on a button and let go where it was opens the tab, as a slow tap', async () => {
  const { context, page } = await open({ viewport: PHONE, touch: true });
  const cdp = await page.context().newCDPSession(page);
  const a = await centre(page, 'runs');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(a.x), y: Math.round(a.y), id: 1 }] });
  await sleep(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
  assert.deepEqual((await facts(page)).open, ['runs']);
  assert.deepEqual(await order(page), FIRST);
  await context.close();
});

await check('H16: a mouse pressed on a button and let go outside the rail ends the press, so hovering later drags nothing', async () => {
  const { context, page } = await open();
  const a = await centre(page, 'board');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  // one move straight out below the rail, so the rail itself never hears the pointer move
  const below = await page.evaluate(() => document.querySelector('.console__rail').getBoundingClientRect().bottom + 20);
  await page.mouse.move(a.x, below, { steps: 1 });
  await page.mouse.up();
  await sleep(100);
  const t = await centre(page, 'grid');
  await page.mouse.move(t.x, t.y, { steps: 8 });
  await page.mouse.move(t.x + 40, t.y + 30, { steps: 8 });
  await sleep(100);
  const dragging = await page.evaluate(() => !!document.querySelector('.rail--dragging'));
  assert.equal(dragging, false, 'a button follows the pointer with nothing pressed');
  assert.equal((await facts(page)).home, true);
  await context.close();
});

await browser.close();
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
