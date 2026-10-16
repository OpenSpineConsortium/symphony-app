// The script under test: the file on disk, 75da0b4 (default); commit 0b9600b with BASEVERSION=1;
// either one with fixes applied (FIX=<pairs.json>, [old, new] pairs); configured with the sign-in
// service unless UNCONFIGURED=1 (the site as deployed today, where only a pasted token works).
import fs from 'node:fs';
import { real, baseScript, configure } from './lib.mjs';
export function scriptUnderTest() {
  let src = process.env.BASEVERSION ? baseScript : real;
  if (process.env.FIX) for (const [a, b] of JSON.parse(fs.readFileSync(process.env.FIX, 'utf8'))) {
    if (!src.includes(a)) throw new Error('fix text not found: ' + a.slice(0, 80));
    src = src.replace(a, b);
  }
  return process.env.UNCONFIGURED ? src : configure(src);
}
export const version = (process.env.BASEVERSION ? '0b9600b' : '75da0b4') + (process.env.FIX ? '+' + process.env.FIX : '') + (process.env.UNCONFIGURED ? ' unconfigured' : ' configured');
