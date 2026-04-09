# RTK

When running shell commands in this repo, always prefix them with `rtk`.

## Why

`rtk` reduces command output noise and token usage while preserving command behavior.

## Common Commands

```bash
rtk git status
rtk git diff
rtk ls
rtk read src/App.tsx
rtk grep "ComposerDock" src/App.tsx
rtk npm run build
rtk cargo check --workspace
rtk npm run test
rtk npm run test:verify
```

## Rules

- In command chains, prefix each segment separately.
- Use raw commands only when you explicitly need unfiltered debugging output.
- If `rtk` has no specialized filter for a command, it safely passes the command through.
