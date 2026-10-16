#!/bin/bash
# The earlier rounds' mutants this round did not touch, and the seven retargeted at the code as it
# stands, run against this round's script, so a fix of this round masking an older check shows.
cd "$(dirname "$0")"
python3 -m http.server 8077 --bind 127.0.0.1 --directory /home/user/openspineconsortium.github.io > /dev/null 2>&1 &
SRV=$!
sleep 1
cd e2e2
list=()
for m in $(ls mutants/m*.json | sort -V); do
  n=$(basename "$m" | sed -E 's/^m([0-9]+)_.*/\1/')
  [ "$n" -ge 54 ] && continue
  case "$n" in 19|36|37|43|46|51|53) continue;; esac
  list+=("$m")
done
echo "running ${#list[@]} mutants"
bash run-mutants.sh "${list[@]}"
cd ..
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
echo "== done"
