# app/vendor

The App installs nothing, here or in the image, so the code it shares with
other repositories is copied in here.

## sdlc_protocol

sdlc_protocol here is a partial copy of the claim protocol's library,
OpenSpineConsortium/sdlc-protocol: the two modules the App's handler
needs, `protocol_check.py` (`problems_for`, which app/handlers.py records
as the check run `sdlc/protocol`) and `claims.py` (the claim conventions
it imports), with the two files every copy takes, the package's own
`__init__.py` and `vendoring.py`. Which modules the App takes is said in
the library's ecosystem.json, not here; the rest of the library (the
board, the guard, team mode) stays in Actions for now and is not copied.
VENDORED beside it records the copy: its first line names the version and
the commit the copy was made from, and each line after it the sha256 of
one file and the file's path inside the copy.

Never edit the copy by hand. scripts/check.sh, the check CI runs on every
pull request, starts with

    python3.12 app/vendor/sdlc_protocol/vendoring.py verify app/vendor

which fails on a file that differs from VENDORED, a file missing or a
file added. A change to the protocol is made in sdlc-protocol, by pull
request there, whose job `downstream (sdlc-app)` already runs this
repository's check on it, with the App's token where that repository has
it. Once it merges, that repository's sync workflow vendors it into this
one and opens the pull request `sdlc-protocol/sync` here, or updates the
one already open, with the App's token, so this repository's CI runs on
it. This repository is private, and GitHub Free offers auto-merge only on
public repositories, so that pull request waits for the owner to merge it
once `check` is green. tests/test_handlers.py holds the App to the
behaviour it relies on from the copy, so a sync that changes that
behaviour fails there rather than in production.

To vendor by hand, from a clone of sdlc-protocol at the commit wanted:

    python3 scripts/vendor.py <this repository>

It replaces sdlc_protocol here and rewrites VENDORED; land the result by
pull request. sdlc-protocol's ECOSYSTEM.md,
https://github.com/OpenSpineConsortium/sdlc-protocol/blob/main/ECOSYSTEM.md,
says how a change travels through every repository that takes a copy.
