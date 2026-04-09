# Smoke Suite

Kodeks now keeps a fast smoke suite inside the Rust workspace so the core flows can be replayed without a live app-server session.

## Automated coverage

Run:

```bash
npm run test:smoke
```

Covered scenarios:

- startup-adjacent thread hydration and resume behavior
- auth handoff visibility and diagnosable login failure state
- approval lifecycle rendering via replayed server requests
- diff review snapshot updates
- diagnostics warning capture from runtime stderr
- saved projects remain visible even with zero threads
- project-first sidebar grouping, recency ordering, and file reference matching
- archive and unarchive notifications keep sidebar thread buckets in sync

The replay fixtures live under `crates/kodeks-core/tests/fixtures/`.

## Manual platform checks

These still need real desktop validation where available:

- sleep and resume on macOS, Windows, and Linux
- offline recovery after network loss
- browser-based auth completion handoff from external login windows
- packaged-app startup and resume behavior on each OS

## Known gaps

- The smoke suite validates normalized runtime state, not OS window-manager behavior.
- Device-code cancel behavior remains blocked on confirming the upstream app-server method contract.
