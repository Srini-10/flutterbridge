# ADR-5 — Query-based incremental engine (salsa model)

- **Status:** Accepted (frozen, Specification v2.0 §7)
- **Date:** 2026-07-11

## Context

`bridge dev` must rebuild in seconds after a one-line Dart edit, and CI must not recompute what it
already computed. Compilation is not a batch pipeline; it is a graph of memoized derivations.

## Decision

The compiler is a **memoized query graph** (the model behind rust-analyzer and modern `tsc` watch),
keyed by content hashes:

```
file(path) → moduleUir(path) → {apiFingerprint, implFingerprint} → normalized → analysis → transformed → emitted
```

The **API/impl fingerprint split** is load-bearing: editing a method *body* changes only
`implFingerprint`, so dependents stay valid and only that module re-transforms; editing a widget's
*constructor signature* changes `apiFingerprint` and correctly invalidates dependents.

Cache key = `blake3(queryName ‖ inputHashes ‖ passVersion ‖ pluginSetHash ‖ configHash ‖ uirVersion)`,
stored content-addressably in `.bridge/cache/cas/`; the remote cache speaks the same protocol.

## Alternatives considered

1. **Phase-level invalidation.** Too coarse — one edited file rebuilds the world.
2. **Bazel-style external orchestration.** Wrong granularity: it cannot see sub-file semantic dependencies.

## Consequences

- Every computation must be a **pure, memoizable query**. This is a real discipline tax on
  contributors — passes may not touch the filesystem, the clock, or randomness — and it is paid back
  in `bridge dev` latency and cache hit rates.
- **Cache unsoundness is the single worst failure mode this platform can have** (R8): wrong output
  from cache destroys trust permanently. The mitigation is a release-blocking CI gate —
  `incremental ≡ clean`, byte-for-byte, over scripted edit sequences.
- The interface is defined from M2 with a naive in-memory implementation behind it; the real engine
  lands at M5 without any pass changing (the proof that the seam held).
