# Release Packaging

Kodeks packages through a single cross-platform GitHub Actions workflow at [`.github/workflows/package.yml`](/Users/furkan/kodeks/.github/workflows/package.yml).

## What CI verifies

- `Verify` runs on Ubuntu first and executes `npm run test:verify`.
- `Package` builds native Tauri bundles on `ubuntu-22.04`, `macos-latest`, and `windows-latest`.
- Linux installs the Tauri 2 system dependencies required for WebKitGTK 4.1 bundling.

## Versioning rules

- Workspace Rust crates use the shared workspace version.
- `package.json` matches the desktop app version in `src-tauri/tauri.conf.json`.
- CI reads the version from `src-tauri/tauri.conf.json` and uses it for artifact names.

## Artifact naming

Uploaded workflow artifacts follow this convention:

`kodeks-<version>-linux`
`kodeks-<version>-macos`
`kodeks-<version>-windows`

Each artifact contains the native bundle output from `src-tauri/target/release/bundle/`.

## Publishing convention

- Pull requests and pushes to `main` build and upload artifacts for inspection.
- Release publishing can later consume the same bundled outputs without changing the build graph.
- Packaging failures should block merge readiness because the workflow runs before release work.
