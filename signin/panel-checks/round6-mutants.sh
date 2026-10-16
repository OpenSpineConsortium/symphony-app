#!/bin/bash
# This round's mutants (m54 to m80) and the seven earlier ones its changes moved, against one static
# server of the site.
cd "$(dirname "$0")"
python3 -m http.server 8077 --bind 127.0.0.1 --directory /home/user/openspineconsortium.github.io > /dev/null 2>&1 &
SRV=$!
sleep 1
cd e2e2
bash run-mutants.sh mutants/m19_*.json mutants/m36_*.json mutants/m37_*.json mutants/m43_*.json mutants/m46_*.json mutants/m51_*.json mutants/m53_*.json mutants/m5[4-9]_*.json mutants/m6[0-9]_*.json mutants/m7[0-9]_*.json mutants/m80_*.json
cd ..
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
echo "== done"
