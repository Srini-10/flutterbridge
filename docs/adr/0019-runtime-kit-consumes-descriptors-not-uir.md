# ADR-19 — The runtime kit consumes descriptors, not UIR

- **Status:** Accepted (M3-A). Implements Spec v2.0 §5 (runtime kits) within ADR-6 and ADR-4.
- **Date:** 2026-07-17

## Context

M3-A builds `@bridge/runtime-react` before the React generator exists, deliberately: a runtime designed
*alongside* its generator gets shaped by whatever the generator found easy to emit, and the contract is
never independently validated. Building the runtime first forces the contract to be stated before anything
depends on it.

The M3-A brief asks that the runtime be *"capable of executing hand-written normalized UIR structures
before any generator exists."* That sentence admits two readings, and they are not close together:

- **(A)** The runtime's inputs are plain, hand-writable data structures — the same structures the generator
  will later emit. You validate the runtime by hand-writing them.
- **(B)** The runtime ingests normalized UIR (`app.Store`, `sig.Signal`, `sig.Action`, …) and interprets it
  at runtime.

The intent behind the sentence is served by both. Only (A) is compatible with the frozen architecture.

## Decision

**(A). The runtime kit's input is a descriptor: a plain, hand-writable value that the generator emits. The
kit never parses, walks, or interprets UIR.**

The boundary runs along a single line:

| | owner | form in generated output |
| --- | --- | --- |
| **Structure** — store shape, token set, route table | descriptor | data (object literals) |
| **Behaviour** — action bodies, derived computations, effect bodies | the generator lowers it | real TypeScript closures |

The kit ships **zero** workspace dependencies. Not `@bridge/uir` either — see §"Why not even uir".

## Why (B) is refused

**1. It would put a Dart semantics interpreter in the browser.**

`sig.Action.body` is not an opaque handle. It is `readonly Stmt[]` over the full `logic.*` expression IR:
16 `AssignmentOperator` values, `logic.Assign` with lvalue targets, `logic.TryCatch`, `logic.Await`,
`logic.StringInterp`. The schema's own doc comments record where Dart and JavaScript diverge and must not
be conflated — `truncatingDivideAssign` needs `Math.trunc(a / b)`, and *"Dart's modulo is always
non-negative for a positive divisor; JavaScript's `%` is not"*.

Executing that tree means implementing Dart's evaluation semantics. That is compiler work, by definition.
Reading (B) puts it in the kit, where it would be:

- **duplicated**, once per kit — React, then Vue, then Svelte — which is the exact duplication ADR-1 and
  ADR-18 exist to prevent, and ADR-13 already refused for precisely this reason (*"Deriving at runtime
  would mean re-implementing Material's algorithm inside **every** kit"*);
- **shipped to end users**, on the render path, in every converted application.

**2. It would delete the artifact ADR-6 exists to protect.**

ADR-6's rationale is that *"generated code stays small, readable and diffable, which is what makes human
review and the override workflow viable."* Under (B) there is no generated code to review — there is UIR
JSON and an interpreter. The override workflow, the diffability, and the "kit upgrade fixes every app"
property all assume emitted source. (B) trades all of it for a runtime that reads IR.

**3. ADR-4 already assigns this work to the compiler.**

*"`react.lower-signals` is the highest-defect-risk pass in the platform."* Lowering the signal graph to a
React program is a **pass**. If the kit interpreted the graph, that pass would have nothing to do and the
highest-risk component in the platform would have silently moved into the artifact that ships to end users
and versions on an independent LTS train (ADR-6).

## Why not even `@bridge/uir`

`.dependency-cruiser.cjs` permits it — *"A runtime kit may reference @bridge/uir types (tokens) and nothing
else in the workspace"* — so this is a choice, not a constraint. The kit takes nothing, for three reasons:

1. **`packages/uir/src/generated/uir.ts` opens with `import { createHash } from 'node:crypto'`.** It is
   top-level and unconditional, for `nodeIdOfContent`. A browser bundle cannot follow that import. Type-only
   imports do erase — but the exposure is one careless value import away, in the one package where that
   mistake reaches end users.
2. **UIR node types are the wrong shape anyway.** `app.Token` carries `id`, `span`, `anchor`, `ext` —
   content-addressed identity and source provenance, which exist so the compiler can attribute diagnostics
   and dedupe nodes. A runtime resolving `surface` for a hovered button needs `name → value`. The kit's
   input is the *projection*, and projecting is the generator's job.
3. **ADR-6 requires kits to version independently of the compiler.** `UIR_SCHEMA_HASH` changes whenever the
   schema does (INV-5) — it changed last week, for v2.4 §A17. A kit that referenced UIR types would inherit
   the compiler's release cadence and forfeit the LTS window ADR-6 grants it.

The rule's parenthetical — *"types (tokens)"* — anticipated the theme engine needing token types. ADR-13
settled that differently and better: the palette is **derived at compile time** and the kit *"composes from
tokens only"*. Composition needs token values, not token nodes. The allowance stays available; M3-A does not
need it.

## What "executing hand-written structures" means in practice

Fully preserved, and demonstrated by the M3-A test suite, which is written entirely by hand with no
generator in existence:

```ts
// This is what the generator will emit. Today, a human wrote it.
const cart = defineStore('cart', ({ signal, derived, action }) => {
  const items = signal<readonly Item[]>([]);
  const total = derived(() => items.get().reduce((n, i) => n + i.price, 0));
  const add = action((item: Item) => items.set([...items.get(), item]));
  return { items, total, add };
});
```

Structure is data; behaviour is a closure. Both are hand-writable, so the runtime is validated before a
generator exists — which was the point of the instruction.

The generator's remaining job is a mechanical lowering: `app.Store` → `defineStore`, `sig.Signal` →
`signal(<lowered initial>)`, `sig.Derived` → `derived(() => <lowered body>)`, `sig.Action` →
`action((p) => <lowered body>)`. Every UIR-specific decision — Dart's modulo, `logic.Opaque` routing to
overrides, the v2.4 §A17 `component` destination becoming a URL — stays in the layer that knows about UIR.

## Consequences

- **`defineStore` is module-scope-safe, and INV-19 becomes structural.** A definition holds no state; only
  `instantiateStore` does, and the provider calls it per client root / per request. Under ADR-15 the
  generator must not emit module singletons; here it *cannot* — the shape that would be a singleton does not
  exist. The privacy defect ADR-15 documents is unrepresentable rather than merely forbidden.
- **The kit is testable with zero fixtures.** No UIR document, no NDJSON reader (still `BRIDGE-STUB(M1)` in
  `packages/uir/src/index.ts`), no compiler. `packages/runtimes/react` has no workspace dependency to build
  first.
- **The generator carries the lowering, and its correctness is provable.** ADR-4 mandates property tests for
  `react.lower-signals` against a reference interpreter of the signal graph. That interpreter does not exist
  (it is named in ADR-4 and nowhere else). It is a compiler-side **test oracle**, not runtime code, and it
  is unblocked by ADR-20, which pins the semantics both it and this kit must satisfy.
- **A second kit reuses the semantics, not the code.** `@bridge/runtime-vue` implements ADR-20's semantics
  over Vue's reactivity. The descriptor shape is per-kit; what is shared is the specification.
