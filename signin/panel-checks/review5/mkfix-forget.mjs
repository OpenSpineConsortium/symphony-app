// writes fix-forget.json: [old, new] pairs for signOut's words when storage refuses
import fs from 'node:fs';
const src = fs.readFileSync('/home/user/openspineconsortium.github.io/assets/js/symphony-panel.js', 'utf8');
const pairs = [
  ["    var pasted = readKey(KEY_TOKEN);\n    var dead = signinTokens();",
   "    // with storage refused, a pasted token lives in this page alone, where readKey finds nothing\n    var pasted = readKey(KEY_TOKEN) || (!tokenStored && /^(ghp_|github_pat_)/.test(token) ? token : '');\n    var listed = repos().length ? ' The repositories you listed stay.' : '';\n    var dead = signinTokens();"],
  ["+ others + own + ' The repositories you listed stay.');\n      }).catch(",
   "+ others + own + listed);\n      }).catch("],
  ["    say(where + '.' + others + own + ' The repositories you listed stay.');",
   "    say(where + '.' + others + own + listed);"],
];
for (const [a] of pairs) { const n = src.split(a).length - 1; if (n !== 1) throw new Error('occurs ' + n + ' times: ' + a.slice(0, 60)); }
fs.writeFileSync('fix-forget.json', JSON.stringify(pairs, null, 1) + '\n');
// all fixes together: the six earlier pairs and these three
const all = JSON.parse(fs.readFileSync('fixes-all.json', 'utf8')).concat(pairs);
let s = src;
for (const [a, b] of all) { if (s.split(a).length - 1 !== 1) throw new Error('in sequence, occurs not once: ' + a.slice(0, 60)); s = s.replace(a, b); }
fs.writeFileSync('fixes-all.json', JSON.stringify(all, null, 1) + '\n');
fs.writeFileSync('fixed-all-copy.js', s);
console.log('pairs:', all.length);
