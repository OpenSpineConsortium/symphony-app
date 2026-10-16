// writes fix-ends.json: a call begun before this tab's sign-in ended is dropped when it fails,
// not said over the sign-out's words (endHere's comment promises it); fixes-all2.json is
// fixes-all.json with fix-drop's pairs replaced by these
import fs from 'node:fs';
const src = fs.readFileSync('/home/user/openspineconsortium.github.io/assets/js/symphony-panel.js', 'utf8');
const pairs = [
  ["  // the one question \"whose is this token?\" on its way, which every call that needs the answer shares\n  var naming = null;\n",
   "  // the one question \"whose is this token?\" on its way, which every call that needs the answer shares\n  var naming = null;\n  // this tab's sign-outs, counted: a call begun before one is dropped when it fails, not said\n  var ends = 0;\n"],
  ["    heldRefresh = { access: '', refresh: '' };\n    ended = true;\n    state = emptyState(state.repo);\n",
   "    heldRefresh = { access: '', refresh: '' };\n    ended = true;\n    ends++;\n    state = emptyState(state.repo);\n"],
  ["  function call(method, path, body, headers, raw, account, again) {\n    var sent = '', byApp = false;\n",
   "  function call(method, path, body, headers, raw, account, again) {\n    var sent = '', byApp = false, era = ends;\n"],
  ["        if (!r.ok) throw failure(r.status, data, path, byApp);\n        return { status: r.status, data: data, headers: r.headers, sent: sent };\n      });\n    });\n  }\n",
   "        if (!r.ok) throw failure(r.status, data, path, byApp);\n        return { status: r.status, data: data, headers: r.headers, sent: sent };\n      });\n    }).catch(function (e) {\n      // the tab signed out since this call began and has said why\n      if (ends !== era) return new Promise(function () { /* dropped */ });\n      throw e;\n    });\n  }\n"],
];
for (const [a] of pairs) { const n = src.split(a).length - 1; if (n !== 1) throw new Error('occurs ' + n + ' times: ' + a.slice(0, 70)); }
fs.writeFileSync('fix-ends.json', JSON.stringify(pairs, null, 1) + '\n');
const drop = JSON.parse(fs.readFileSync('fix-drop.json', 'utf8')).map(([a]) => a);
const all = JSON.parse(fs.readFileSync('fixes-all.json', 'utf8')).filter(([a]) => !drop.includes(a)).concat(pairs);
let s = src;
for (const [a, b] of all) { if (s.split(a).length - 1 !== 1) throw new Error('in sequence, occurs not once: ' + a.slice(0, 70)); s = s.replace(a, b); }
fs.writeFileSync('fixes-all2.json', JSON.stringify(all, null, 1) + '\n');
fs.writeFileSync('fixed-all2-copy.js', s);
console.log('pairs in fixes-all2:', all.length);
