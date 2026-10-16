#!/bin/bash
# The fourth reviewer's checks, then the panel's own suites, one at a time, against one static
# server of the site, with this round's script on disk.
cd "$(dirname "$0")"
python3 -m http.server 8077 --bind 127.0.0.1 --directory /home/user/openspineconsortium.github.io > /dev/null 2>&1 &
SRV=$!
sleep 1
echo "== the fourth reviewer's checks"
for r in r1 r2 r2d r3 r4 r5 r6 r7; do
  (cd review4 && BASE=http://127.0.0.1:8077 timeout 900 node $r.test.mjs > $r.round6.log 2>&1); echo "$r configured: exit $? $(grep -c '^PASS' review4/$r.round6.log) pass, $(grep -c '^FAIL' review4/$r.round6.log) fail"
done
for r in r2 r2d r3 r4 r7; do
  (cd review4 && UNCONFIGURED=1 BASE=http://127.0.0.1:8077 timeout 900 node $r.test.mjs > $r.round6.unconfigured.log 2>&1); echo "$r unconfigured: exit $? $(grep -c '^PASS' review4/$r.round6.unconfigured.log) pass, $(grep -c '^FAIL' review4/$r.round6.unconfigured.log) fail"
done
echo "== the panel's walkthrough and hostile inputs"
(cd e2e2 && BASE=http://127.0.0.1:8077 timeout 900 node panel.test.mjs > panel.round6.log 2>&1); echo "panel: exit $?"
(cd e2e2 && BASE=http://127.0.0.1:8077 timeout 900 node hostile.test.mjs > hostile.round6.log 2>&1); echo "hostile: exit $?"
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
echo "== done"
