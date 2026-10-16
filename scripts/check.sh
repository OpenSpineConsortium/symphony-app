#!/usr/bin/env bash
# The repository's checks, run by CI (.github/workflows/ci.yml, the job
# "check") and by hand before a pull request: the vendored copy of
# symphony-protocol held to its record, then the tests under tests/, which
# include the text rules (ASCII, LF, a newline at the end) on every file.
# The image runs Python 3.12, so the checks run on 3.12 too, and PYTHON
# names another interpreter only when asked to.
set -eu
cd "$(dirname "$0")/.."

PYTHON="${PYTHON:-python3.12}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
    echo "$PYTHON is not on PATH; install Python 3.12 or set PYTHON" >&2
    exit 1
fi

# The App's copy of symphony-protocol must be byte for byte what
# app/vendor/VENDORED records. A change to it is made in
# OpenSpineConsortium/symphony-protocol and arrives here by that repository's
# sync pull request, so a hand edit fails here, offline, before any test.
# One that rewrote VENDORED to match passes this line and fails
# tests/test_vendor.py, which compares the copy with the library itself in
# the clone SDLC_PROTOCOL names, which CI makes (.github/workflows/ci.yml).
"$PYTHON" app/vendor/sdlc_protocol/vendoring.py verify app/vendor

"$PYTHON" -m unittest discover -s tests -t . -v

# The sign-in service under signin/ is JavaScript for a Cloudflare Worker,
# so its tests run on node, which GitHub's runners carry; a machine without
# node skips them and says so, since the Python checks need none.
if command -v node >/dev/null 2>&1; then
    node --test signin/test_worker.mjs
else
    echo "node is not on PATH; the sign-in service's tests were skipped" >&2
fi

echo "checks ok"
