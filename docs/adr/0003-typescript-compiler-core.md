# ADR-3 — TypeScript compiler core (not Rust)

- **Status:** Accepted (frozen, Specification v2.0 §1.3, §5)
- **Date:** 2026-07-11

## Context

The compiler core hosts the pass manager, the query engine, and every generator. Its language choice
determines who can extend the platform and how fast builds are.

## Decision

The core is **TypeScript on Node 20+**.

## Rationale

1. The entire emission ecosystem is JS-native: ts-morph (programmatic TS AST construction), Prettier,
   ESLint, the Next.js toolchain. A Rust core would have to shell out to all of it.
2. Plugin authors — the people writing widget mappers and package adapters — are TypeScript
   developers. An SPI nobody in the target audience can extend is not an SPI.
3. Build time is dominated by I/O and Dart analysis, not by CPU-bound IR transforms.

## Alternatives considered

- **Rust core.** Buys throughput we do not need, at the cost of the ecosystem and the plugin author base.

## Consequences

- Determinism must be enforced by discipline (lint bans on clock/randomness, sorted emission,
  pinned formatters) rather than inherited from a stricter language.
- Node's performance ceiling is accepted; the escape valve is the worker pool (Spec §7.2).

## Revisit trigger

Profiling shows **pass execution** — not extraction or emit I/O — exceeding 40 % of build time on
large applications.
