# Vendored code

The App installs nothing, so the code it shares with other repositories is
copied in here and kept unchanged. Edit it at its source, never here, and
copy it in again.

## sdlc_protocol

- Source: the repository OpenSpineConsortium/sdlc-protocol, directory
  `sdlc_protocol/`, copied on 2026-10-10 from its working tree on top of
  commit bb0cff312dcda84f6304f28af9de98f207fa64de ("WIP: protocol library
  snapshot"). claims.py carried changes not yet committed there: the
  `prefix` arguments and `isdecimal()` in `number_of`.
- Files: `protocol_check.py` and `claims.py`, the two the App's handler
  needs (`problems_for` and the claim conventions it imports). The rest of
  the library (the board, the guard, team mode) stays in Actions for now
  and is not copied. `__init__.py` is this repository's own.
- SHA-256 of the copies, to tell a re-vendor what moved:
  - `claims.py`: bccf2aef303b719a26af5829f3f8131eb95f66c7bb9a52d995b9a5d67d03a8ec
  - `protocol_check.py`: 40e47f170ebc30632394f461ac015747fb3bf5bd421241b4eea89323b99cc13e
- Later: re-vendored from the sdlc-protocol 0.1.0 release once it is
  tagged, replacing this snapshot of a library still being written; the
  tests under tests/test_handlers.py hold the App to the behaviour it
  relies on, so a re-vendor that changes it fails the check.
