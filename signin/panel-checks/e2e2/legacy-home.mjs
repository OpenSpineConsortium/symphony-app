// The checks written before the button home screen became every screen's home (home.test.mjs) open
// the panel on a computer with the side rail, as they were written for: each context's profile
// starts with Legacy chosen, unless a check has chosen otherwise, and a phone shows the buttons
// whatever is chosen. A check that clears the storage gets Legacy again on its next load.
export async function legacyHome(context) {
  await context.addInitScript(() => {
    try { if (localStorage.getItem('symphony_panel_home') === null) localStorage.setItem('symphony_panel_home', '{"layout":"legacy"}'); } catch (e) { /* no storage, no choice */ }
  });
}
