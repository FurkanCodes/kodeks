# Protocol Artifacts

Kodeks now pins generated app-server protocol artifacts in:

- [`generated/app-server-schema`](/Users/furkan/kodeks/generated/app-server-schema)
- [`generated/app-server-ts`](/Users/furkan/kodeks/generated/app-server-ts)
- [`generated/app-server-protocol.manifest.json`](/Users/furkan/kodeks/generated/app-server-protocol.manifest.json)

## Refresh

Run:

```bash
npm run protocol:refresh
```

This:

- reads the local `codex --version`
- regenerates JSON Schema and TypeScript bindings from `codex app-server`
- updates the pinned manifest version

## Check

Run:

```bash
npm run test:protocol
```

This check verifies:

- the generated artifacts are committed and readable
- the pinned manifest remains non-experimental
- the generated bindings still contain the notification and request methods Kodeks depends on
- local Codex version matches the pinned version when the `codex` CLI is available

## CI behavior

The packaging workflow runs `npm run test:protocol` before the rest of verification, so protocol drift blocks release-oriented builds.

## Gating policy

- Generated artifacts are pinned to a specific Codex CLI version.
- Experimental schema generation is intentionally disabled.
- When Codex changes, refresh the artifacts first, then update runtime normalization or tests as needed.
