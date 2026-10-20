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
  if (!node || !node.closest) return;
  // since the + style (site #61) a task, a worker and an agent are made in a dialog that opens from
  // a "+" button, so a selector in a closed dialog presses the button that opens it, and one
  // outside every dialog closes any left open, since a modal dialog makes the rest of the page inert
  const dialog = node.closest('dialog');
  for (const open of document.querySelectorAll('dialog[open]')) {
    if (open !== dialog) open.close();
  }
  const openTab = (el) => {
    const panel = el.closest('[data-tab-panel]');
    if (!panel || !panel.hidden) return;
    const tab = document.querySelector('.console__rail [data-tab="' + panel.getAttribute('data-tab-panel') + '"]');
    if (tab) tab.click();
  };
  if (dialog) {
    // the Claude dialog opens from the floating button, whose press first reads whether a Claude
    // token is set (pressClaude), so the dialog is opened here as that press ends where one may be
    if (!dialog.open && dialog.id === 'dlg-claude') {
      dialog.showModal();
    } else if (!dialog.open) {
      const opener = document.querySelector('.console__add[data-open="' + dialog.id + '"]') || document.querySelector('[data-open="' + dialog.id + '"]');
      if (!opener) return;
      openTab(opener);
      opener.click();
    }
    // the rarer settings sit in a folded details, which a person unfolds
    const fold = node.closest('details');
    if (fold && !fold.open) fold.open = true;
    return;
  }
  openTab(node);
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
