// The control panel is a console of tabs since the site's console layout (2026-10-18): one tab is
// shown at a time and the others are hidden, so Playwright finds nothing in them visible. These
// checks were written for the one long page, so before each action or visibility read on a
// selector, the page method opens the tab that holds the element, as a person would press its rail
// button. A selector outside every tab, or a page with no console (the cost page, the sign-in
// checks' other pages), is left as it is.
const METHODS = ['click', 'dblclick', 'fill', 'type', 'press', 'check', 'uncheck', 'setChecked', 'selectOption', 'focus', 'hover', 'isVisible', 'isHidden', 'isEditable', 'isEnabled', 'waitForSelector'];

function reveal(selector) {
  let node = null;
  try { node = document.querySelector(selector); } catch (e) { return; }
  const panel = node && node.closest ? node.closest('[data-tab-panel]') : null;
  if (!panel || !panel.hidden) return;
  const tab = document.querySelector('.console__rail [data-tab="' + panel.getAttribute('data-tab-panel') + '"]');
  if (tab) tab.click();
}

let patched = false;
export async function consoleTabs(browser) {
  if (patched) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  const proto = Object.getPrototypeOf(page);
  await context.close();
  for (const name of METHODS) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    proto[name] = async function (selector, ...rest) {
      if (typeof selector === 'string' && !/^(text=|xpath=|\/\/)/.test(selector)) {
        try { await this.evaluate(reveal, selector); } catch (e) { /* a page between documents keeps its tab */ }
      }
      return original.call(this, selector, ...rest);
    };
  }
  // a locator is made at once and acted on later, so its actions open the tab when they run
  const makeLocator = proto.locator;
  proto.locator = function (selector, ...rest) {
    const locator = makeLocator.call(this, selector, ...rest);
    const page = this;
    for (const name of ['click', 'dblclick', 'fill', 'check', 'uncheck', 'selectOption', 'isVisible', 'waitFor']) {
      const original = locator[name];
      if (typeof original !== 'function' || typeof selector !== 'string') continue;
      locator[name] = async function (...args) {
        try { await page.evaluate(reveal, selector); } catch (e) { /* a page between documents keeps its tab */ }
        return original.apply(locator, args);
      };
    }
    return locator;
  };
  patched = true;
}
