# ADR-16 — Next.js major version: stay on 15 through M2

- **Status:** Accepted (M0-T7). Confirms Spec v2.0 §5 (stack) against new information.
- **Date:** 2026-07-12

## Evidence

- Spec v2.0 §5 names **Next.js 15**.
- **Next.js 16 is now GA** (16.2.10 at time of review) — surfaced as an implementation issue in M0-T4.
- The M0-T4 reference app was built, typechecked and rendered on **15.5.20**, and produced the golden
  baseline used by M0-T5.

## Decision

**Remain on Next.js 15 (pinned `15.5.x`) through M1 and M2. Re-decide at the M3-T6 freeze.**

| Dimension | Assessment |
| --- | --- |
| **Compatibility** | The App Router surface the generator targets (file routes, `metadata`, `"use client"`, `next/navigation`) is stable across 15→16. No known blocker either way. |
| **Generator impact** | Low. `gen-react` emits against the App Router contract, not against Next internals. |
| **Runtime impact** | Low. `@bridge/runtime-react` depends on `next/navigation` for the nav shim; the rest is React. |
| **Migration cost** | Non-trivial but bounded — and it is *entirely* a cost, with no benefit to any M1/M2 objective. |

**Rationale.** M2 is the highest-risk milestone in the plan: it is where the walking skeleton, the
signal lowering (R3), the layout engine (R2) and the determinism gate all land at once. Taking an
unforced framework major upgrade *during* it would mean debugging our own compiler and someone else's
framework migration in the same week, with no way to tell the two apart. The M0 golden baseline was
captured on 15; changing the target now would invalidate the one visual reference we have.

**This is a scheduling decision, not a technical preference.** Next 16 is not rejected — it is
sequenced.

## Policy

- Pin `next@15.5.x` in `gen-react`'s scaffolder and the runtime kit's peer range.
- Add an **advisory** (non-blocking) Next 16 canary CI job from M2, so the size of the eventual
  migration is measured continuously instead of discovered.
- Re-decide at **M3-T6**, when UIR 1.0 / SPI 1.0 freeze and the compiler is no longer in flux.
