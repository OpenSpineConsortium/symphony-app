#!/bin/bash
# Runs each mutant (all, or those named) against the checks it names. A mutant whose text is not in
# the script any more is STALE, not killed; one that leaves every check it names passing SURVIVED.
cd "$(dirname "$0")"
list=("$@")
[ ${#list[@]} -eq 0 ] && list=(mutants/m*.json)
for m in "${list[@]}"; do
  only=$(cat "$m.only")
  if MUTANT="$m" ONLY="$only" BASE=http://127.0.0.1:8077 timeout 600 node signin.test.mjs > "$m.log" 2>&1; then
    echo "SURVIVED $(basename "$m") ($only)"
  elif grep -q 'mutant text not found' "$m.log"; then
    echo "STALE    $(basename "$m") ($only): $(grep -m1 'mutant text not found' "$m.log" | cut -c1-120)"
  elif ! grep -q '^FAIL' "$m.log"; then
    echo "ERROR    $(basename "$m") ($only): $(tail -1 "$m.log" | cut -c1-120)"
  else
    echo "KILLED   $(basename "$m") ($only): $(grep -m1 '^FAIL' "$m.log" | cut -c1-150)"
  fi
done
