// Checks of the control panel as a Home Screen app (site branch claude/home-screen-app, 2026-10-19,
// after the owner's "Build way 1" of that morning, the first of the three ways
// symphony-template's docs/research/native-ios-app.md sets out): the page names a web app manifest
// that Chromium reads with no error and finds installable, its address and scope the panel's own,
// standalone, with the icons it names each a PNG of the size it says and one of them maskable;
// Apple's touch icon and its head lines for iOS; and a viewport that covers the whole screen, with
// every part of the page that reaches the screen's edge (the header and its drawer, the section
// strip, the deck, the status line, the Ask Claude drawer, the breadcrumb and the footer) keeping
// its words inside a phone's or a tablet's safe areas, which Chromium plays through
// Emulation.setSafeAreaInsetsOverride, while nothing moves where there are none; and the Full
// screen button offered only where the browser can make a page full screen. Each check states what
// the page promises; a FAIL is a defect.
//
// No GitHub is needed: every check reads the page signed out, and any request off the site's own
// origin is refused, so nothing leaves the machine. The panel's script is served from SITE, with a
// mutant's pairs applied where MUTANT names one, as the other suites serve it; only H8 holds a line
// of it. The manifest and the head are written by the site's tools/build_site.py, the icons drawn
// by its tools/app_icons.py and the safe areas kept by its stylesheets, so no mutant of the script
// reaches what H1 to H7 hold; each was seen to fail with the line it holds taken out of the built
// page or the stylesheet (README.md).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8077';
const SITE = process.env.SITE || '/home/user/openspineconsortium.github.io';
const PAGE = BASE + '/symphony/control/';
const results = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function check(name, fn) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o + ':'))) return;
  try { await fn(); results.push('PASS ' + name); console.log('PASS', name); }
  catch (e) { results.push('FAIL ' + name + ' :: ' + String(e && e.message || e).split('\n')[0]); console.log('FAIL', name, '\n    ', String(e && e.message || e).split('\n').slice(0, 4).join('\n     ')); }
}

let script = fs.readFileSync(SITE + '/assets/js/symphony-panel.js', 'utf8');
// a mutant, for proving a check bites: pairs of [text, replacement] applied to the script
if (process.env.MUTANT) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.MUTANT, 'utf8'))) { assert.ok(script.includes(a), 'mutant text not found: ' + a.slice(0, 60)); script = script.replace(a, b); }

const browser = await chromium.launch();
const origin = new URL(BASE).origin;
// one fresh browser profile per page; a phone (mobile) has touch and no pointer that hovers, and
// init runs in the page before any of its scripts
async function open(viewport, insets, mobile, init) {
  const context = await browser.newContext(Object.assign({ viewport }, mobile ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {}));
  await context.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
  await context.route('**/assets/js/symphony-panel.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: script }));
  if (init) await context.addInitScript(init);
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

// In the page: the bottom of the status line's words and buttons as they show, with how many show,
// so a status line with nothing in it cannot pass for one that stands clear
function statusFoot() {
  const st = document.querySelector('.console__status');
  const parts = [document.getElementById('msg')].concat(Array.from(st.querySelectorAll('button'))).filter((e) => e && e.getClientRects().length);
  return { foot: Math.max.apply(null, parts.map((e) => e.getBoundingClientRect().bottom)), shown: parts.length, height: window.innerHeight, status: getComputedStyle(st).paddingBottom };
}
// In the page: for each part, by a selector for what is drawn inside it, the leftmost left and the
// rightmost right of everything of it that shows, with how many show
function partEdges(parts) {
  return parts.map(([name, sel]) => {
    const boxes = Array.from(document.querySelectorAll(sel)).filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0);
    return { name, shown: boxes.length, left: Math.min.apply(null, boxes.map((b) => b.left)), right: Math.max.apply(null, boxes.map((b) => b.right)) };
  });
}
// the parts of the page that reach the screen's edges, besides the header and the deck
const BANDS = [['the section strip', '.subnav__in *'], ['the breadcrumb', '.crumbs *'], ['the footer', '.footer *']];
function assertInside(edges, left, right) {
  for (const e of edges) {
    assert.ok(e.shown > 0, e.name + ' shows nothing to measure');
    assert.ok(e.left >= left - 0.01 && e.right <= right + 0.01, e.name + ' runs under the notch: ' + e.left.toFixed(1) + ' to ' + e.right.toFixed(1) + ', the safe area ' + left + ' to ' + right);
  }
}
// In the page: the header's bar, its brand and its menu button, and whether the button shows
function headerBox() {
  const box = (id) => { const b = document.querySelector(id).getBoundingClientRect(); return [b.left, b.right]; };
  return { nav: box('#nav'), brand: box('#nav .nav__brand'), toggle: box('#navToggle'), toggleShown: getComputedStyle(document.getElementById('navToggle')).display !== 'none',
    width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
}
// opens the header's drawer with its button, as a person taps it, and gives where its links are
async function openNavDrawer(page) {
  await page.click('#navToggle');
  await page.waitForTimeout(500);
  return page.evaluate(partEdges, [['the header\'s drawer', '#navLinks a']]);
}

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

await check('H3: where the screen has no safe areas, a computer\'s or a phone\'s, nothing moves: the deck keeps its padding, the status line its own, the header the window\'s width and its own padding, and the strip, the breadcrumb and the footer theirs', async () => {
  for (const [viewport, mobile, side, band] of [[{ width: 1280, height: 900 }, false, '32px', '32px'], [{ width: 1000, height: 800 }, false, '20px', '32px'], [{ width: 390, height: 844 }, true, '16px', '16px']]) {
    const { context, page } = await open(viewport, null, mobile);
    try {
      const got = await page.evaluate(() => {
        const c = getComputedStyle(document.getElementById('console'));
        const nav = document.getElementById('nav');
        const r = nav.getBoundingClientRect();
        const pad = (sel) => { const s = getComputedStyle(document.querySelector(sel)); return [s.paddingLeft, s.paddingRight]; };
        return { left: c.paddingLeft, right: c.paddingRight, bottom: c.paddingBottom,
          status: getComputedStyle(document.querySelector('.console__status')).paddingBottom, nav: [r.left, r.right], width: document.documentElement.clientWidth,
          navPad: pad('#nav'), bands: [pad('.subnav--fly.is-here .subnav__in'), pad('.crumbs'), pad('.footer')] };
      });
      assert.deepEqual([got.left, got.right, got.bottom], ['14px', '14px', '12px'], 'the deck\'s padding moved at ' + viewport.width + ' px');
      assert.equal(got.status, mobile ? '6px' : '0px', 'the status line\'s padding moved at ' + viewport.width + ' px');
      assert.deepEqual(got.nav, [0, got.width], 'the header no longer spans the window at ' + viewport.width + ' px');
      assert.deepEqual(got.navPad, [side, side], 'the header\'s own padding moved at ' + viewport.width + ' px');
      assert.deepEqual(got.bands, [[band, band], [band, band], [band, band]], 'the strip\'s, the breadcrumb\'s or the footer\'s padding moved at ' + viewport.width + ' px');
    } finally { await context.close(); }
  }
});

await check('H4: on a phone held upright, installed, the status line\'s words and buttons stand clear of the home bar, by its own padding', async () => {
  const { context, page } = await open({ width: 390, height: 844 }, { top: 0, bottom: 34, left: 0, right: 0 }, true);
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    const got = await page.evaluate(statusFoot);
    assert.ok(got.shown > 0, 'the status line shows nothing to measure');
    assert.ok(got.foot <= got.height - 34 + 0.5, 'the status line reaches ' + (got.height - got.foot) + ' px from the foot, under the home bar');
    assert.equal(px(got.status), 6 + 34);
  } finally { await context.close(); }
});

await check('H5: on a phone held sideways, installed, the header\'s bar and the deck\'s dark ground run to the screen\'s edges while the brand, the menu and its drawer, the deck\'s content, the strip, the Ask Claude drawer, the breadcrumb and the footer keep inside the notch on either side, and the status line\'s words and buttons stand clear of the home bar', async () => {
  const insets = { top: 0, bottom: 21, left: 47, right: 47 };
  const { context, page } = await open({ width: 844, height: 390 }, insets, true);
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    const head = await page.evaluate(headerBox);
    const W = head.width;
    assert.deepEqual(head.nav, [0, W], 'the header\'s bar no longer runs to the screen\'s edges');
    assert.ok(head.toggleShown, 'no menu button on a phone held sideways');
    assert.ok(head.brand[0] >= 47 && head.toggle[1] <= W - 47, 'the brand or the menu button runs under the notch: ' + head.brand[0] + ' and ' + head.toggle[1]);
    const got = await page.evaluate(() => {
      const c = document.getElementById('console');
      const cs = getComputedStyle(c);
      const box = c.getBoundingClientRect();
      return { inner: [box.left + parseFloat(cs.paddingLeft), box.right - parseFloat(cs.paddingRight)], deck: [box.left, box.right] };
    });
    assert.ok(got.inner[0] >= 47 + 14 && got.inner[1] <= W - 47 - 14, 'the deck\'s content runs under the notch: ' + got.inner.join(' to '));
    assert.deepEqual(got.deck, [0, W], 'the deck\'s dark ground no longer runs to the screen\'s edges');
    const foot = await page.evaluate(statusFoot);
    assert.ok(foot.shown > 0, 'the status line shows nothing to measure');
    assert.ok(foot.foot <= foot.height - 21 + 0.5, 'the status line reaches ' + (foot.height - foot.foot) + ' px from the foot, under the home bar');
    assert.equal(px(foot.status), 6 + 21);
    assertInside(await page.evaluate(partEdges, BANDS), 47, W - 47);
    // the answer's drawer, shown as an answer shows it: fixed to the screen in the phone layout
    const drawer = await page.evaluate(() => {
      document.getElementById('cp-app').classList.remove('hidden');
      document.getElementById('cp-as-drawer').hidden = false;
      document.getElementById('cp-as-answer').textContent = 'A line of the answer, long enough to run across the whole drawer from one side to the other side.';
      return getComputedStyle(document.getElementById('cp-as-drawer')).position;
    });
    assert.equal(drawer, 'fixed', 'the answer\'s drawer is not fixed to the screen, so this does not measure what a phone shows');
    assertInside(await page.evaluate(partEdges, [['the Ask Claude drawer', '#cp-as-drawer'], ['its Close', '#cp-as-close'], ['its words', '#cp-as-drawer .console__askhead strong, #cp-as-answer']]), 47, W - 47);
    assertInside(await openNavDrawer(page), 47, W - 47);
    const open = await page.evaluate(() => { const b = document.getElementById('navLinks').getBoundingClientRect(); return [b.left, b.right, document.getElementById('navLinks').classList.contains('is-open')]; });
    assert.deepEqual(open, [0, W, true], 'the header\'s drawer is not open from edge to edge');
  } finally { await context.close(); }
});

await check('H6: on a large phone held sideways, wider than 900 px, the header keeps its drawer, with the brand, the menu and the drawer\'s links inside the notch and nothing wider than the screen, while a short window on a computer keeps the header\'s one row', async () => {
  for (const [width, height, side] of [[932, 430, 59], [956, 440, 62]]) {
    const { context, page } = await open({ width, height }, { top: 0, bottom: 21, left: side, right: side }, true);
    try {
      const head = await page.evaluate(headerBox);
      const W = head.width;
      assert.equal(W, width, 'the window is not ' + width + ' px wide, so this is not the header the check is for');
      assert.deepEqual(head.nav, [0, W], 'the header\'s bar no longer runs to the screen\'s edges at ' + width + ' px');
      assert.ok(head.toggleShown, 'the header lays its links out in one row at ' + width + ' px, which does not fit inside the notch');
      assert.ok(head.brand[0] >= side && head.toggle[1] <= W - side, 'the brand or the menu button runs under the notch at ' + width + ' px: ' + head.brand[0] + ' and ' + head.toggle[1]);
      assert.ok(head.scrollWidth <= W, 'the page is ' + head.scrollWidth + ' px wide at ' + width + ' px');
      assertInside(await page.evaluate(partEdges, BANDS), side, W - side);
      assertInside(await openNavDrawer(page), side, W - side);
    } finally { await context.close(); }
  }
  const { context, page } = await open({ width: 1280, height: 500 }, null, false);
  try {
    const got = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('#navLinks a')).map((a) => a.getBoundingClientRect());
      return { toggle: getComputedStyle(document.getElementById('navToggle')).display, position: getComputedStyle(document.getElementById('navLinks')).position,
        tops: links.map((b) => Math.round(b.top + b.height / 2)), right: Math.max.apply(null, links.map((b) => b.right)), width: document.documentElement.clientWidth };
    });
    assert.equal(got.toggle, 'none', 'a short window on a computer shows the menu button');
    assert.equal(got.position, 'static', 'a short window on a computer hides the header\'s links in a drawer');
    assert.ok(Math.max.apply(null, got.tops) - Math.min.apply(null, got.tops) <= 2, 'the header\'s links are not in one row: ' + got.tops.join(', '));
    assert.ok(got.right <= got.width, 'the header\'s last link runs past the window: ' + got.right);
  } finally { await context.close(); }
});

await check('H7: on a tablet held sideways, installed, the deck keeps its desktop layout and its own foot pads the home bar, so the status line\'s words and buttons stand clear of it', async () => {
  const { context, page } = await open({ width: 1180, height: 820 }, { top: 0, bottom: 20, left: 0, right: 0 }, true);
  try {
    const deck = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('console')); return { overflow: c.overflow, bottom: c.paddingBottom, scrollY: window.scrollY }; });
    assert.equal(deck.overflow, 'hidden', 'the deck is not in its desktop layout at 1180 x 820');
    assert.equal(px(deck.bottom), 12 + 20);
    const foot = await page.evaluate(statusFoot);
    assert.ok(foot.shown > 0, 'the status line shows nothing to measure');
    assert.ok(foot.foot <= foot.height - 20 + 0.5, 'the status line reaches ' + (foot.height - foot.foot) + ' px from the foot, under the home bar');
  } finally { await context.close(); }
});

await check('H8: the Full screen button is offered only where the browser can make a page full screen: hidden where neither requestFullscreen nor webkitRequestFullscreen is there, as on an iPhone, and shown on a computer and on a phone that has them, or WebKit\'s older call alone, as Safari before 16.4 has', async () => {
  const shown = async (page) => page.evaluate(() => {
    document.getElementById('cp-app').classList.remove('hidden');
    const b = document.getElementById('cp-full');
    return { hidden: b.hidden, rects: b.getClientRects().length };
  });
  const noApi = () => {
    for (const proto of [Element.prototype, HTMLElement.prototype]) { delete proto.requestFullscreen; delete proto.webkitRequestFullscreen; }
  };
  const webkitOnly = () => {
    for (const proto of [Element.prototype, HTMLElement.prototype]) delete proto.requestFullscreen;
  };
  for (const [viewport, mobile] of [[{ width: 390, height: 844 }, true], [{ width: 1280, height: 900 }, false]]) {
    let { context, page } = await open(viewport, null, mobile, noApi);
    try {
      assert.equal(await page.evaluate(() => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)), false, 'the stand-in for an iPhone still has a full screen call');
      const got = await shown(page);
      assert.ok(got.hidden && got.rects === 0, 'a browser with no full screen for a page offers the button at ' + viewport.width + ' px');
    } finally { await context.close(); }
    for (const [init, which] of [[null, 'the standard call'], [webkitOnly, 'WebKit\'s older call alone']]) {
      ({ context, page } = await open(viewport, null, mobile, init));
      try {
        const calls = await page.evaluate(() => [!!document.documentElement.requestFullscreen, !!document.documentElement.webkitRequestFullscreen]);
        assert.deepEqual(calls, [!init, true], 'the browser does not have ' + which);
        const got = await shown(page);
        assert.ok(!got.hidden && got.rects > 0, 'a browser with ' + which + ' is not offered the button at ' + viewport.width + ' px');
      } finally { await context.close(); }
    }
  }
});

await browser.close();
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log('\n' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
process.exit(failed.length ? 1 : 0);
