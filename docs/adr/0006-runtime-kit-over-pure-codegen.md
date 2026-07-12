# ADR-6 — Runtime kit over pure codegen

- **Status:** Accepted (frozen, Specification v2.0 §5; carried from Architecture Proposal v1 §1.2-D)
- **Date:** 2026-07-11

## Context

`Row(mainAxisAlignment: spaceBetween)` can be compiled into a bespoke flexbox `<div>` at every call
site, or into `<Row mainAxisAlignment="spaceBetween">` imported from a versioned runtime package that
implements Flutter's layout protocol on flexbox/grid.

## Decision

Generators emit against **runtime compatibility kits** (`@bridge/runtime-react` first): layout engine,
theme engine, navigation runtime, state runtime, animation runtime. Kits are published independently,
version independently (LTS windows), and have **zero** dependency on compiler packages.

## Rationale

1. Flutter's constraint-based layout has sharp edges (unbounded height, intrinsic sizing). Fix them
   **once**, in the kit — not in ten thousand generated files.
2. Generated code stays small, readable and diffable, which is what makes human review and the
   override workflow viable.
3. A kit upgrade fixes rendering bugs across every converted app without regenerating anything.
4. The state facade absorbs the React/signal mismatch (ADR-4) so the backing store implementation can
   change without touching generated code.

## Alternatives considered

- **Inline everything (pure codegen).** Every kit bugfix becomes a full regeneration of every consumer
  application, and every generated file re-litigates the same layout edge cases.

## Consequences

- Two release trains to maintain: compiler (lockstep) and runtime kits (independent, LTS).
- The kit needs its own correctness proof independent of the compiler: each component's Storybook
  story is pixel-compared against a Flutter-rendered reference (Blueprint §3, M2-T12).
- Generated code may only use **public** kit entrypoints within the generator's declared
  `runtimeRange` (INV-12, INV-13).
