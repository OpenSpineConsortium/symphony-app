#!/bin/bash
# Runs each mutant (all, or those named) against the checks it names, in the check file its .suite
# names (signin.test.mjs where it has none). A mutant whose text is not in the script any more is
# STALE, not killed; one that leaves every check it names passing SURVIVED. The site's server is
# already up on BASE (port 8077 unless BASE says otherwise). A file under styles/ changes the
# stylesheet the suite serves (CSSEDIT) where one under mutants/ changes the script (MUTANT).
cd "$(dirname "$0")"
base="${BASE:-http://127.0.0.1:8077}"
list=("$@")
[ ${#list[@]} -eq 0 ] && list=(mutants/*.json styles/*.json)
for m in "${list[@]}"; do
  only=$(cat "$m.only")
  suite=$(cat "$m.suite" 2>/dev/null || echo signin.test.mjs)
  var=MUTANT
  case "$m" in styles/*) var=CSSEDIT ;; esac
  if env "$var=$m" ONLY="$only" BASE="$base" timeout 600 node "$suite" > "$m.log" 2>&1; then
    echo "SURVIVED $(basename "$m") ($only)"
  elif grep -q 'mutant text not found' "$m.log"; then
    echo "STALE    $(basename "$m") ($only): $(grep -m1 'mutant text not found' "$m.log" | cut -c1-120)"
  elif ! grep -q '^FAIL' "$m.log"; then
    echo "ERROR    $(basename "$m") ($only): $(tail -1 "$m.log" | cut -c1-120)"
  else
    echo "KILLED   $(basename "$m") ($only): $(grep -m1 '^FAIL' "$m.log" | cut -c1-150)"
  fi
done
