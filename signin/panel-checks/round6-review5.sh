#!/bin/bash
# The fifth reviewer's checks against the script on disk (this round's fixes), one at a time,
# configured and as deployed today, against one static server of the site.
cd "$(dirname "$0")"
python3 -m http.server 8079 --bind 127.0.0.1 --directory /home/user/openspineconsortium.github.io > /dev/null 2>&1 &
SRV=$!
sleep 1
for r in s1 s4 s5 w1 w2 f1 f2; do
  (cd review5 && BASE=http://127.0.0.1:8079 timeout 900 node $r.test.mjs > $r.mine.log 2>&1); echo "$r configured: exit $? $(grep -c '^PASS' review5/$r.mine.log) pass, $(grep -c '^FAIL' review5/$r.mine.log) fail"
  (cd review5 && UNCONFIGURED=1 BASE=http://127.0.0.1:8079 timeout 900 node $r.test.mjs > $r.mine.unconfigured.log 2>&1); echo "$r unconfigured: exit $? $(grep -c '^PASS' review5/$r.mine.unconfigured.log) pass, $(grep -c '^FAIL' review5/$r.mine.unconfigured.log) fail"
done
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
echo "== done"
