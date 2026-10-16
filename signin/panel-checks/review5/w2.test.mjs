// W2: in a browser whose storage refuses (site data blocked), only a pasted token works, held by the
// page alone. Forget the token then says what holds for a token kept in storage: it names no
// personal access token (signOut reads the paste back from storage, which refuses), and it says the
// repositories listed stay, though nothing could be stored.
import assert from 'node:assert/strict';
import { BASE, launch, close, open, check, results, repoRoutes, sleep, appShown, t } from './lib.mjs';
import { scriptUnderTest, version } from './pick.mjs';
const SCRIPT = scriptUnderTest();
console.log('script:', version);
await launch();

const throwingStorage = () => {
  if (location.search.indexOf('nostorage') < 0) return;
  const deny = () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); };
  Object.defineProperty(window, 'localStorage', { get: deny, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { get: deny, configurable: true });
};

await check('W2: in a browser whose storage refuses, Forget the token says the pasted token stays valid at GitHub, and claims nothing kept', async () => {
  const { context, page, calls, errors } = await open({ script: SCRIPT, initScript: throwingStorage, path: '/symphony/control/?nostorage=1&repo=acme/demo' });
  if (!(await page.isVisible('#cp-token'))) await page.click('#cp-token-way > summary');
  await page.fill('#cp-token', 'github_pat_X');
  await page.click('#cp-open');
  await appShown(page);
  await sleep(800);
  await page.click('#cp-signout');
  await sleep(500);
  const msg = await page.textContent('#msg');
  console.log('      Forget says:', JSON.stringify(msg));
  assert.match(msg, /personal access token itself stays valid at GitHub/, 'nothing says the pasted token stays valid at GitHub');
  assert.doesNotMatch(msg, /The repositories you listed stay/, 'it says the repositories listed stay, though nothing could be stored');
  assert.deepEqual(errors.filter((e) => !/SecurityError|Access is denied/.test(e)), []);
  await context.close();
});

await close();
console.log('\n' + results.join('\n'));
