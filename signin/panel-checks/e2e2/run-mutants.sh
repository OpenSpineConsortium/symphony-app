#!/bin/bash
# Runs each mutant (all, the script's under mutants/ and the stylesheet's under css-mutants/, or
# those named) against the checks it names, in the check file its .suite names (signin.test.mjs where
# it has none). A mutant whose text is not in the script any more is STALE, not killed; one that
# leaves every check it names passing SURVIVED. The site's server is already up on BASE (port 8077
# unless BASE says otherwise). A mutant under css-mutants/ is a list of pairs for the stylesheet
# control.css, served in its place (CSS_MUTANT), for the rules no mutant of the script reaches.
cd "$(dirname "$0")"
base="${BASE:-http://127.0.0.1:8077}"
list=("$@")
[ ${#list[@]} -eq 0 ] && list=(mutants/*.json css-mutants/*.json)
for m in "${list[@]}"; do
  only=$(cat "$m.only")
  suite=$(cat "$m.suite" 2>/dev/null || echo signin.test.mjs)
  what=MUTANT
  case "$m" in css-mutants/*) what=CSS_MUTANT ;; esac
  if env "$what=$m" ONLY="$only" BASE="$base" timeout 600 node "$suite" > "$m.log" 2>&1; then
    echo "SURVIVED $(basename "$m") ($only)"
  elif grep -q 'mutant text not found' "$m.log"; then
    echo "STALE    $(basename "$m") ($only): $(grep -m1 'mutant text not found' "$m.log" | cut -c1-120)"
  elif ! grep -q '^FAIL' "$m.log"; then
    echo "ERROR    $(basename "$m") ($only): $(tail -1 "$m.log" | cut -c1-120)"
  else
    echo "KILLED   $(basename "$m") ($only): $(grep -m1 '^FAIL' "$m.log" | cut -c1-150)"
  fi
done
