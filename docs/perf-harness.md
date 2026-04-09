# Performance Harness

Kodeks uses a lightweight replay harness in the Rust test suite to keep long-session runtime behavior bounded.

## Automated check

Run:

```bash
npm run test:perf
```

Current automated guarantees:

- long streaming sessions keep timeline history bounded
- diff payloads remain capped
- synthetic replay of a large session stays under a coarse debug-build runtime threshold

## Fixture strategy

- small realistic flows live in `crates/kodeks-core/tests/fixtures/`
- large-session profiling currently uses generated synthetic events inside the test suite
- replay scenarios are intentionally deterministic so results are comparable across commits

## Interpreting failures

- cap failures indicate a memory-growth regression
- timing failures indicate normalization or buffering work became too expensive
- a failing perf check should block release readiness until the regression is understood

## Known limits

- this is a close-equivalent harness, not a full idle CPU or wakeup profiler
- platform-native idle and battery measurements still need manual tooling outside cargo tests
