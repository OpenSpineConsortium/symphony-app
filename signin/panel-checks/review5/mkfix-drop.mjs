// writes fix-drop.json: a refusal judged after this tab signed out is dropped, not said, as
// endHere's comment promises for what is still on its way; and adds it to fixes-all.json
import fs from 'node:fs';
const src = fs.readFileSync('/home/user/openspineconsortium.github.io/assets/js/symphony-panel.js', 'utf8');
const pairs = [
  ["    // a tab already signed out has said why\n    if (ended) return false;",
   "    // a tab already signed out has said why: the call is dropped (null), not retried or said\n    if (ended) return null;"],
  ["        if (r.status === 401) return refused(sent, byApp).then(function (retry) {\n",
   "        if (r.status === 401) return refused(sent, byApp).then(function (retry) {\n          if (retry === null) return new Promise(function () { /* dropped: the sign-out said why */ });\n"],
];
for (const [a] of pairs) { const n = src.split(a).length - 1; if (n !== 1) throw new Error('occurs ' + n + ' times: ' + a.slice(0, 60)); }
fs.writeFileSync('fix-drop.json', JSON.stringify(pairs, null, 1) + '\n');
const all = JSON.parse(fs.readFileSync('fixes-all.json', 'utf8'));
if (!all.some(([a]) => a === pairs[0][0])) all.push(...pairs);
let s = src;
for (const [a, b] of all) { if (s.split(a).length - 1 !== 1) throw new Error('in sequence, occurs not once: ' + a.slice(0, 60)); s = s.replace(a, b); }
fs.writeFileSync('fixes-all.json', JSON.stringify(all, null, 1) + '\n');
fs.writeFileSync('fixed-all-copy.js', s);
console.log('pairs in fixes-all:', all.length);
