# Kodeks

Kodeks is a Tauri desktop shell for Codex app-server with a three-pane session UI, approvals, diagnostics, and diff review.

## Local development

```bash
npm ci
npm run dev
```

## Verification

- `npm run test`: run the Rust workspace tests
- `npm run test:rust`: same as `npm run test`
- `npm run test:protocol`: validate pinned app-server schema/bindings
- `npm run test:smoke`: run the replay-based smoke suite
- `npm run test:perf`: run the bounded long-session performance checks
- `npm run test:verify`: run Rust tests and the frontend production build
- `npm run protocol:refresh`: regenerate pinned app-server schema and TypeScript bindings
- `npm run tauri build`: build native desktop bundles locally

## Packaging CI

Cross-platform packaging runs from [`.github/workflows/package.yml`](/Users/furkan/kodeks/.github/workflows/package.yml).

Release conventions, artifact naming, and versioning rules live in [docs/release.md](/Users/furkan/kodeks/docs/release.md).

Smoke coverage and known QA gaps live in [docs/qa-smoke.md](/Users/furkan/kodeks/docs/qa-smoke.md).

Performance harness notes live in [docs/perf-harness.md](/Users/furkan/kodeks/docs/perf-harness.md).

Pinned app-server artifact workflow lives in [docs/protocol-artifacts.md](/Users/furkan/kodeks/docs/protocol-artifacts.md).
