#!/usr/bin/env bash
# The repository's checks, run by CI (.github/workflows/ci.yml, the job
# "check") and by hand before a pull request: the vendored copy of
# sdlc-protocol held to its record, then the tests under tests/, which
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

# The App's copy of sdlc-protocol must be byte for byte what
# app/vendor/VENDORED records. A change to it is made in
# OpenSpineConsortium/sdlc-protocol and arrives here by that repository's
# sync pull request, so a hand edit fails here, offline, before any test.
"$PYTHON" app/vendor/sdlc_protocol/vendoring.py verify app/vendor

"$PYTHON" -m unittest discover -s tests -t . -v

echo "checks ok"
