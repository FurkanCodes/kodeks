# Kodeks MVP performance budgets

These budgets implement `GUI-21` and gate everyday changes:

- Idle CPU: target below 0.5% on a modern laptop with no active turn.
- Idle wakeups: target below 10 wakeups/sec in the foreground and lower when backgrounded.
- Warm idle memory: target below 180 MB.
- Active-session memory: target below 350 MB for typical long-lived use.
- Timeline updates: batch streamed deltas and avoid full-tree rerenders.
- Buffers: cap protocol traces, aggregated command output, and warning history.
- Hidden work: detached or collapsed panes should do near-zero work.

Implementation rules:

- The Rust core owns protocol normalization and bounded buffers.
- The UI consumes coarse snapshot updates, not raw protocol events.
- Diff and diagnostics surfaces stay lazy and cheap until opened.
- No polling loops are used for runtime state; updates are event-driven.
