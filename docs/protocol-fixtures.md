# Protocol Fixtures

Kodeks keeps replayable protocol fixtures in `crates/kodeks-core/tests/fixtures/`.

## Current baseline

- Fixture replay is exercised by Rust tests in [`crates/kodeks-core/src/runtime.rs`](/Users/furkan/kodeks/crates/kodeks-core/src/runtime.rs).
- The pinned Codex baseline is recorded in [`generated/app-server-protocol.manifest.json`](/Users/furkan/kodeks/generated/app-server-protocol.manifest.json).

## Why this exists

- We can replay representative app-server notifications without spawning a live child process.
- Runtime normalization regressions show up in `cargo test --workspace`.
- New protocol fields can be captured as fixture updates before they leak into the UI unexpectedly.

## Refresh workflow

1. Capture a representative app-server event sequence from diagnostics traces.
2. Redact secrets and save the sequence as JSON under `crates/kodeks-core/tests/fixtures/`.
3. Extend the replay test expectations for any new normalized behavior.
4. Run `npm run test:verify`.

Schema drift checks and generated protocol bindings are documented in [docs/protocol-artifacts.md](/Users/furkan/kodeks/docs/protocol-artifacts.md).
