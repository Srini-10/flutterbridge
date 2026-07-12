# ADR-10 — The second target ships at M3, not at M8

- **Status:** Accepted (frozen, Specification v2.0 §11, §12)
- **Date:** 2026-07-11

## Context

The entire value of the UIR + SPI design is the claim that a new target can be added *without
redesigning the compiler*. That claim is unverified until a second target exists — and single-target
assumptions calcify quickly and invisibly while the first generator matures.

## Decision

Ship a **second and third target early and cheaply**: `gen-storybook` (docs realm) and `gen-openapi`
(server realm) at **M3**, under a hard rule — **they must be built with zero diffs to
`@bridge/compiler` and `@bridge/core`**.

They are not chosen because they are the most valuable targets. They are chosen because they are the
cheapest available **falsifier** of the architecture: different realms, different layers, minimal
implementation cost.

## Alternatives considered

- **Prove generality later (M8), with Vue.** By then the React generator's assumptions have leaked
  into the core for a year, and the rework is quarters of work instead of weeks.

## Consequences

- If the rule is violated — if these generators *require* a compiler change — that is a **proven
  implementation issue**, documented as an ADR amendment, fixed at M3 while it is still cheap. That
  outcome is a success of the experiment, not a failure of the plan.
- UIR 1.0.0 and SPI 1.0.0 are frozen only **after** this falsification (M3-T6), never before.
