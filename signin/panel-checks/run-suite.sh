#!/bin/bash
# Starts the site's static server for one run of a check file, then stops it.
# usage: run-suite.sh <dir> <file> [log]   (extra environment passes through)
set -u
dir="$1"; file="$2"; log="$(realpath -m "${3:-/dev/stdout}")"; port="${PORT:-8077}"
python3 -m http.server "$port" --bind 127.0.0.1 --directory /home/user/openspineconsortium.github.io > /dev/null 2>&1 &
SRV=$!
sleep 1
cd "$dir" && BASE=http://127.0.0.1:$port node "$file" > "$log" 2>&1
code=$?
kill $SRV 2>/dev/null
wait $SRV 2>/dev/null
exit $code
