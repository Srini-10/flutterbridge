# ADR-1 — Layered UIR with realms and legalization

- **Status:** Accepted (frozen, Specification v2.0 §2, §3.4)
- **Date:** 2026-07-11

## Context

The platform must emit to many targets — React/Next.js, Vue, Angular, Svelte, React Native, Electron,
Fastify, NestJS, Storybook, OpenAPI, docs, design tokens, Figma, tests, deployment — over many years,
without redesigning the compiler each time a target is added.

## Decision

The IR is **layered** (L0 source · L1 semantic · L2 UI · L3 application · L4 deployment), targets
declare a **capability manifest** and belong to a **realm** (ui / server / docs / design / test /
deploy), and any UIR kind outside a target's `nativeKinds` is rewritten by **legalization** into
kinds it does support before its transform runs. A kind with no legalization path is a compile-time
diagnostic (`BRG2101`), never a runtime failure.

Generators consume the highest layer they understand and never reach below it: a docs generator reads
L3 routes and never parses an expression.

## Alternatives considered

1. **A single flat AST.** Every generator would have to understand expressions to emit anything —
   the docs and OpenAPI generators would carry the cost of the UI generators.
2. **A per-target IR.** N targets means N× the transformation work and N places for Flutter
   semantics to be re-derived, inconsistently.

## Consequences

- A docs-realm generator becomes a weekend project; a new ui-realm generator becomes weeks, not quarters.
- Layer discipline must be *enforced*, not merely documented: schema validation plus the SPI
  conformance suite (unknown-kind tolerance, `ext` round-trip).
- The schema becomes the platform's constitution. It moves slowly, by RFC, with migrations.

## Revisit trigger

A target realm appears that cannot be expressed as a consumer of existing layers.
