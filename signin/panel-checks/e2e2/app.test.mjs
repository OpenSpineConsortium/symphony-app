// Checks of the control panel as a Home Screen app (site branch claude/home-screen-app, 2026-10-19,
// after the owner's "Build way 1" of that morning, the first of the three ways
// symphony-template's docs/research/native-ios-app.md sets out): the page names a web app manifest
// that Chromium reads with no error and finds installable, its address and scope the panel's own,
// standalone, with the icons it names each a PNG of the size it says and one of them maskable;
// Apple's touch icon and its head lines for iOS; and a viewport that covers the whole screen, with
// the deck keeping its own edges inside a phone's safe areas, which Chromium plays through
// Emulation.setSafeAreaInsetsOverride, while nothing moves where there are none. Each check states
// what the page promises; a FAIL is a defect.
//
// No GitHub is needed: every check reads the page signed out, and any request off the site's own
// origin is refused, so nothing leaves the machine. The manifest and the head are written by the
// site's tools/build_site.py and the icons drawn by its tools/app_icons.py, so no mutant of the
// panel's script reaches what these checks hold; each was seen to fail with the line it holds taken
// out of the built page or the stylesheet (README.md).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const PAGE = BASE + '/symphony/control/';
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 4).join('\n     ')); }
}

const browser = await chromium.launch();
const origin = new URL(BASE).origin;
async function open(viewport, insets, mobile) {
  const context = await browser.newContext(Object.assign({ viewport }, mobile ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {}));
  await context.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('console') && getComputedStyle(document.getElementById('console')).getPropertyValue('--console-h') !== '');
  return { context, page, cdp };
}
function pngSize(buf) {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'not a PNG');
  assert.equal(buf.subarray(12, 16).toString('latin1'), 'IHDR', 'a PNG with no header');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
const px = (v) => parseFloat(v);

await check('H1: the page names a manifest Chromium reads with no error and finds installable, the panel\'s own address and scope, standalone, its icons PNGs of the sizes they say with one maskable', async () => {
  const { context, page, cdp } = await open({ width: 1280, height: 900 });
  try {
    const m = await cdp.send('Page.getAppManifest');
    assert.ok(m.url && m.url.startsWith(origin + '/symphony/control/'), 'no manifest named beside the panel: ' + m.url);
    assert.deepEqual(m.errors, [], 'the manifest has errors');
    const ie = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(ie.installabilityErrors, [], 'Chromium would not install the page');
    const r = await page.request.get(m.url);
    assert.equal(r.status(), 200);
    const man = await r.json();
    assert.equal(man.display, 'standalone');
    assert.equal(new URL(man.start_url, m.url).pathname, '/symphony/control/', 'it opens somewhere else than the panel');
    assert.equal(new URL(man.scope, m.url).pathname, '/symphony/control/', 'its scope is not the panel');
    assert.equal(new URL(man.id, m.url).pathname, '/symphony/control/', 'no stable id');
    assert.ok(man.name && man.short_name && man.short_name.length <= 12, 'no name, or a short name a Home Screen cuts');
    assert.match(man.theme_color || '', /^#[0-9A-Fa-f]{6}$/);
    assert.match(man.background_color || '', /^#[0-9A-Fa-f]{6}$/);
    const purposes = new Set();
    let biggest = 0;
    for (const icon of man.icons || []) {
      const got = await page.request.get(new URL(icon.src, m.url).href);
      assert.equal(got.status(), 200, icon.src + ' is not there');
      const [w, h] = pngSize(await got.body());
      assert.equal(w + 'x' + h, icon.sizes, icon.src + ' is not the size it says');
      assert.equal(icon.type, 'image/png');
      (icon.purpose || 'any').split(/\s+/).forEach((p) => purposes.add(p));
      biggest = Math.max(biggest, w);
    }
    assert.ok(purposes.has('any') && purposes.has('maskable'), 'no icon for any use, or none an Android launcher may cut');
    assert.ok(biggest >= 512, 'no 512 px icon for the splash screen');
  } finally { await context.close(); }
});

await check('H2: iOS gets a 180 px touch icon, the head lines that open the page as an app of its own named Symphony under a light status bar, and a viewport that covers the screen', async () => {
  const { context, page } = await open({ width: 390, height: 844 }, null, true);
  try {
    const head = await page.evaluate(() => {
      const meta = (n) => { const e = document.querySelector('meta[name="' + n + '"]'); return e ? e.content : null; };
      const touch = document.querySelector('link[rel="apple-touch-icon"]');
      return { touch: touch ? touch.href : '', capable: meta('apple-mobile-web-app-capable'), mobile: meta('mobile-web-app-capable'),
        bar: meta('apple-mobile-web-app-status-bar-style'), title: meta('apple-mobile-web-app-title'), viewport: meta('viewport') };
    });
    assert.ok(head.touch, 'no apple-touch-icon');
    const got = await page.request.get(head.touch);
    assert.equal(got.status(), 200);
    assert.deepEqual(pngSize(await got.body()), [180, 180], 'the touch icon is not 180 px');
    assert.equal(head.capable, 'yes');
    assert.equal(head.mobile, 'yes');
    assert.equal(head.title, 'Symphony');
    // the site's header is light, so iOS's own light bar sits above it rather than white text over it
    assert.equal(head.bar, 'default');
    assert.match(head.viewport, /viewport-fit=cover/);
    assert.match(head.viewport, /width=device-width/);
  } finally { await context.close(); }
});

await check('H3: where the screen has no safe areas, a computer\'s or a phone\'s, nothing moves: the deck keeps its padding, the status line its own and the header the window\'s width', async () => {
  for (const [viewport, mobile] of [[{ width: 1280, height: 900 }, false], [{ width: 390, height: 844 }, true]]) {
    const { context, page } = await open(viewport, null, mobile);
    try {
      const got = await page.evaluate(() => {
        const c = getComputedStyle(document.getElementById('console'));
        const nav = document.getElementById('nav').getBoundingClientRect();
        return { left: c.paddingLeft, right: c.paddingRight, bottom: c.paddingBottom,
          status: getComputedStyle(document.querySelector('.console__status')).paddingBottom, nav: [nav.left, nav.right], width: document.documentElement.clientWidth };
      });
      assert.deepEqual([got.left, got.right, got.bottom], ['14px', '14px', '12px'], 'the deck\'s padding moved at ' + viewport.width + ' px');
      assert.equal(got.status, mobile ? '6px' : '0px', 'the status line\'s padding moved at ' + viewport.width + ' px');
      assert.deepEqual(got.nav, [0, got.width], 'the header no longer spans the window at ' + viewport.width + ' px');
    } finally { await context.close(); }
  }
});

await check('H4: on a phone held upright, installed, the status line\'s words and buttons stand clear of the home bar and the deck\'s foot pads it', async () => {
  const { context, page } = await open({ width: 390, height: 844 }, { top: 0, bottom: 34, left: 0, right: 0 }, true);
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    const got = await page.evaluate(() => {
      const st = document.querySelector('.console__status');
      const parts = [document.getElementById('msg')].concat(Array.from(st.querySelectorAll('button'))).filter((e) => e && e.getClientRects().length);
      return { foot: Math.max.apply(null, parts.map((e) => e.getBoundingClientRect().bottom)), height: window.innerHeight,
        deck: getComputedStyle(document.getElementById('console')).paddingBottom, status: getComputedStyle(st).paddingBottom };
    });
    assert.ok(got.foot <= got.height - 34 + 0.5, 'the status line reaches ' + (got.height - got.foot) + ' px from the foot, under the home bar');
    assert.equal(px(got.status), 6 + 34);
    assert.equal(px(got.deck), 12 + 34);
  } finally { await context.close(); }
});

await check('H5: on a phone held sideways, installed, the header and the deck keep inside the notch on either side, and the foot clear of the home bar', async () => {
  const insets = { top: 0, bottom: 21, left: 47, right: 47 };
  const { context, page } = await open({ width: 844, height: 390 }, insets, true);
  try {
    const got = await page.evaluate(() => {
      const nav = document.getElementById('nav').getBoundingClientRect();
      const c = document.getElementById('console');
      const cs = getComputedStyle(c);
      const box = c.getBoundingClientRect();
      const inner = [box.left + parseFloat(cs.paddingLeft), box.right - parseFloat(cs.paddingRight)];
      return { nav: [nav.left, nav.right], inner, width: document.documentElement.clientWidth, deck: [box.left, box.right], bottom: cs.paddingBottom };
    });
    assert.deepEqual(got.nav, [47, got.width - 47], 'the header runs under the notch');
    assert.ok(got.inner[0] >= 47 + 14 && got.inner[1] <= got.width - 47 - 14, 'the deck\'s content runs under the notch: ' + got.inner.join(' to '));
    assert.deepEqual(got.deck, [0, got.width], 'the deck\'s dark ground no longer runs to the screen\'s edges');
    assert.equal(px(got.bottom), 12 + 21);
  } finally { await context.close(); }
});

await browser.close();
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
process.exit(failed.length ? 1 : 0);
