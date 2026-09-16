# M11-F — Architectural Frontier Investigation: `rsc-split` & Callback Parameter Identity

## 1. Baseline

Started from `6e2d5cd` (`origin/main` == `HEAD`), the M11-E project-widget-composition commit.
`git status --short` showed only the pre-existing, deliberately-untouched
`fixtures/apps/hello_bridge/analysis_options.yaml` drift. Baseline counts confirmed by direct run before
any change: Dart `dart test` — 588 passed; TypeScript `pnpm --filter @bridge/gen-react exec vitest run`
— 571 passed (62 files).

## 2. Current capability inventory

Re-verified against M11-E's own closing state: project-widget composition (ADR-0047), same-name
project-class output collision refusal (`BRG3009`), render-tree callback local identity (M11-D), and
every M9–M11-E capability listed in prior milestone docs remain intact — confirmed by the full,
unmodified baseline test run (§1) before any change, and re-confirmed clean after (§31–32).

## 3. M11-E frontier reproduction

Both of M11-E's own remaining leads were investigated fresh, live-probed, never assumed from that
report's own prose.

## 4. Fresh `rsc-split` evidence

Searched the whole repository for `rsc-split`/`rsc_split`/RSC/server-client-split references. Found:
`packages/generators/react/package.json`'s own description ("scaffolder, lower-signals, **rsc-split**,
UINode emitters, route emitter"); `packages/generators/react/src/index.ts:33-35`, a tagged
`BRIDGE-STUB(M3)` (this project's own established "deferred work" discipline, CLAUDE.md); ADR-0015
("Module-level singleton stores are forbidden... SSR/RSC safety"), which names the *consuming* invariant
(`rsc-safety` analysis, Spec §3.3) `rsc-split` would eventually implement; and `project.ts`'s own
extended comment explaining the current, deliberate, conservative default. The base Spec v2.0 document
(§3.3's own full text) is **not checked into this repository** — only its v2.1–v2.5 amendments are —
so `rsc-split`'s complete original specification is not fully recoverable from this repo alone; what
survives is the ADR-0015 quotation and the stub tags, which is what this investigation worked from.

## 5. `rsc-split` root cause

Not a defect. `rsc-split` is a **named, never-started, M3-deferred compiler pass** — tagged, tracked,
and (confirmed via `just lint:stubs`'s own stub census, part of `just ci`) correctly counted among this
project's 15 known, deliberate stubs, unchanged since at least M3. The current behavior (every emitted
component unconditionally carries `'use client'`) is not a bug: it is the explicitly-documented, safe
default `project.ts`'s own comment argues for — "marking a client component as a server component is
the ADR-15 defect... marking a server component as a client component costs bundle size. One is a
privacy breach; the other is a performance regression." Answering the brief's own ten questions (§5):
nothing currently fails without it (1); no observable failure exists (2); it is purely an optimization/
architectural placeholder, not a correctness gap (3); there is no diagnostic because there is nothing to
diagnose (4); it cannot be reduced to a minimal *failing* Dart fixture, because none fails (5); the
generator already produces semantically correct output without it, confirmed by all 582 pre-existing
vitest tests passing under the current blanket policy (6, 7); it would change server/client
*classification*, not output correctness (8); zero fixtures in this repo exercise or require
server-component behavior (9); and it is not blocking any currently-declared product goal — it is
future work the package's own description already scopes separately (10).

## 6. `rsc-split` reduction ladder

Not built. Per the brief's own §6 instruction ("do not implement a broad pass if only one narrow case
requires a smaller existing-layer fix"), and given §5's own finding that there is no current failure to
reduce to a minimal case, constructing a ladder here would be evidence-manufacturing rather than
evidence-following.

## 6.1 `rsc-split` semantic boundary

Determined directly from ADR-0015 and `project.ts`'s own comments, without needing to build anything:
`rsc-split` genuinely requires (a) server/client semantic classification, (b) execution-environment
separation (a real Next.js App Router distinction, not a generator naming convention — `project.ts`'s
own words: "without RSC there is no server component"), and, as of M11-E's own project-widget
composition work, (c) a *transitive* dependency analysis this project has not needed before: "does this
subtree read a store" must now be answered not just for a component's own render tree, but through every
composed child it references (possibly declared in a different file, ADR-0047) — a real module-graph
question, not a local one. This is a genuine architectural boundary, not a naming convention that could
be reduced to a small generator patch. **Outcome B is correct for this candidate**, exactly as the
brief's own §7 anticipates.

## 7. Callback capability inventory

Searched the widget catalog (`widgets.ts`) and the UIR schema (`l2.json`, `shared.json`) for every
callback-like construct. Summary (full detail in ADR-adjacent commit): `onPressed`/`onTap`
(`VoidCallback`, zero params, statement-bodied, real analyzer `FunctionExpression`) — already supported
since M4-F. `onChanged` on `Checkbox`/`Switch`/`Radio`/`Slider` (`ValueChanged<T>`, **one real
parameter**, statement-bodied) — already mapped in `widgets.ts`, extracted as an ordinary `logic.Lambda`
with real `params`, live-probed. `TextFormField.validator` (`String? Function(String?)`, **one real
parameter**, statement- or expression-bodied, direct-return or block) — already mapped, live-probed.
`ListView.builder`/`GridView.builder`/`PageView.builder`'s own `itemBuilder` — **not** a statement-bodied
callback at all; extracts as a declarative `ui.List` template (M9-F), structurally incapable of carrying
arbitrary local declarations. This directly **overturns** M11-D §23/M11-E §7's own conclusion ("no
cataloged widget offers a callback that takes a parameter") — that conclusion checked `itemBuilder` only
and did not survey the rest of the catalog.

## 8. Callback collision reachability

**Outcome B1 — reachable today**, contradicting M11-E's own prior finding. Live-probed directly:
`Checkbox(onChanged: (value) { setState(() { final value = true; _checked = value; }); })` compiled all
the way through `bridge build` with **zero diagnostics anywhere in the pipeline**, producing
`(value: boolean | null) => { const value = true; ... }` — confirmed, via the real, repo-installed
TypeScript compiler (`node_modules/typescript@5.9.3/lib/tsc.js --strict`), to be genuinely invalid:
`TS2300: Duplicate identifier 'value'` (twice — once at the parameter, once at the redeclaration). This
is the single most significant finding of this milestone: a real, previously-undetected silent-wrong-
output defect, reachable through an ordinary, idiomatic Flutter pattern (any `onChanged` handler that
shadows its own parameter inside `setState`), caught by no prior milestone's own audit — M11-D's own
16-category audit explicitly left "H — parameter/local collision" untested for exactly this reason (no
known reachable construct at the time), and M11-E's own investigation inherited that same gap without
re-verifying it.

## 9. Fresh callback analyzer evidence

The parameter's own read (`logic.Ref`, e.g. `name: 'value'` inside the lambda body) carries **no**
`target` — confirmed live and Dart-test-proven (`callback parameter declaration identity (M11-F)`
group) — matching the established, universal rule that a parameter never carries declaration-tier
identity in this compiler (ADR-28 §4): every parameter, everywhere, resolves by name at the generator
layer (`scope.paramInScope`), never by `NodeId`. When a nested closure declares a same-named local,
*that* local's own `logic.VarDecl` **does** get a real, distinct `id`/symbol (M11-D's own mechanism,
confirmed still correct here), and the read correctly targets it, never the parameter — proving
declaration identity was never the defect. The defect is purely at the generator's own emission layer:
two names occupying the identical JS/TS scope with no block boundary between them.

## 10. Callback collision reduction ladder

| Rung | Shape | Result |
|---|---|---|
| direct read | parameter read directly, same callback, no nesting | supported (pre-existing) |
| nested read | parameter captured by a nested `setState` closure | supported (pre-existing) |
| param+local | parameter and a differently-named captured local | supported, never cross-resolve |
| async | an `async` parameterized callback (`isAsync`) | supported — the guard is unconditional on `isAsync` |
| non-state-batch path | `TextFormField.validator` (never promoted by N5) | supported — the second, independent `emitStatements` call site (`expression.ts`) needed the identical fix |
| store action | a store action taking a parameter, non-colliding nested local | supported — `store.ts`'s own action-body emission needed the identical fix, proactively verified |
| **collision (component)** | parameter shadowed by a same-named `setState`-nested local | **refuses, `BRG3019`** (previously silent invalid output) |
| **collision (validator)** | parameter shadowed by a same-named bare-block-nested local | **refuses, `BRG3019`** |
| **collision (store action)** | action parameter shadowed by a same-named bare-block-nested local | **refuses, `BRG3019`** |
| determinism | same source, same bytes, twice | confirmed |

## 11. Other frontier findings

While building the positive fixture's own `TextFormField.validator` rung, a genuinely separate,
pre-existing gap surfaced: `String.isEmpty`/`String?.trim()` do not lower correctly for a strictly-typed
build (`TS18048`/`TS2339` under real `tsc --strict`). Unrelated to this milestone's own capability
(declaration identity and emission-scope collision, not Dart String-method lowering); the fixture's own
validator body was written to avoid it rather than fix it, and it is noted here rather than silently
routed around unremarked.

## 12. Semantic classifications

`rsc-split`: architecturally broad — execution-environment separation, not a bounded capability. Callback
parameter/local collision: an emission-scope defect, identical in kind to M11-D's own `BRG3019` finding —
declaration provenance (never in question) versus emitted-scope representability (the actual gap).

## 13. Architectural outcome

**`rsc-split`: Outcome B** — investigation/documentation only, no implementation, per §6.1's own genuine
semantic-boundary finding. **Callback parameter/local collision: Outcome A1** — small existing-layer
implementation. `emitStatements` (M11-D's own `BRG3019` mechanism) already had everything needed
(a `reservedNames` set, threaded from information every caller already possessed); no new UIR field, no
new UIR node, no new diagnostic code, no new architecture.

## 14. Supported subset

A real, parameterized, statement-bodied callback (`onChanged`, `validator`, a store action) reads its
own parameter correctly, directly or from a nested closure, and never collides with a differently-named
captured local or another declaration, regardless of `isAsync` or which of the two independent emission
call sites (`expression.ts`'s in-place lambda, `component.ts`'s/`store.ts`'s own promoted-action loop)
it reaches.

## 15. Refused subset

A local (the callback's own, or one spliced open from a nested `setState`/bare-block) that would
generate the same name as the enclosing callback's own parameter now refuses honestly, `BRG3019`,
instead of emitting invalid TypeScript — for all three reachable shapes (§10).

## 16. UIR/schema impact

None. `reservedNames` is a purely generator-internal `ReadonlySet<string>`, never serialized, never part
of the UIR document.

## 17. Extraction changes

None. Declaration identity was already correct (§9); nothing in `dart/bridge_analyzer` changed this
milestone.

## 18. Normalization changes

None.

## 19. Reachability changes

None.

## 20. Generator changes

`emitStatements` (`statement.ts`) gained an optional third parameter, `reservedNames`, checked alongside
its own pre-existing `seen`-siblings check (M11-D), reporting the same `BRG3019` code with a
second, accurately-worded message. `setStatementLowering`'s own wiring type (`expression.ts`) threads it
through. Three call sites now populate it from information they already had: `expression.ts`'s
`logic.Lambda` case (its own `declared` parameter names), `component.ts`'s action-emission loop (an
action's own `params`), and `store.ts`'s action-emission loop (a store action's own `params`).

## 21. Runtime impact

None.

## 22. Identity/provenance strategy

Unchanged. This milestone touches only emission-scope representability, never identity resolution.

## 23. Scope/closure semantics

Untouched, deliberately (matching M11-D's own §6/§12 discipline, restated by this brief's own §12): no
new capture mechanism, no claim about mutable-capture semantics beyond what already worked. `var x = 1;
builder: (value) { return () => x++; }`-shaped mutable capture was not specially investigated or
touched — outside this milestone's own bounded finding.

## 24. Shadowing/mutability semantics

Shadowing identity is correct and unchanged (§9); this milestone adds no new mutability semantics.

## 25. Cross-widget behavior

Not applicable — a callback parameter's own scope is local to its own callback, not cross-component.

## 26. Cross-file behavior

Not applicable, for the identical reason.

## 27. Silent-wrong-code audit

- **Wrong declaration** — not applicable; declaration identity was never in question (§9).
- **Wrong scope** — not applicable.
- **Sibling collision** — unaffected; M11-D's own pre-existing sibling check is untouched, confirmed by
  regression (all M11-D tests still pass).
- **Shadowing collision** — the exact finding of this milestone (§8), now refused rather than silent.
- **Accidental/lost capture** — not applicable (§23).
- **Free identifier** — safe by construction: an unresolved parameter reference is simply name-resolved
  by the existing, unchanged `paramInScope` mechanism; never a free/undeclared identifier.
- **Parameter/local collision** — the exact finding (§8), tested and fixed.
- **Member/local collision** — not applicable; unrelated to this capability.
- **Duplicate generated identity** — not applicable.
- **Incorrect reachability** — unaffected, confirmed (§19).
- **Incorrect module emission** — tested: real `tsc --strict` accepts every positive-fixture file.
- **Evaluation-order change** — safe by construction: no statement reordering.
- **Cross-widget contamination** — not applicable.
- **Nondeterministic output** — tested: `bridge validate` (deterministic=true) on both fixtures; a
  same-source/same-bytes Dart determinism test.
- **Recursive/non-convergent behavior** — not applicable.

## 28. Mutation results

Six mutations, mutate → confirm failure → revert → confirm clean:

1. Remove the `reservedNames.has(name)` check entirely — **caught**, 0 of 3 expected diagnostics fire.
2. `expression.ts`'s `logic.Lambda` case passes an empty set — **caught**, exactly the `validator`
   collision (2 of 3) goes undetected.
3. `component.ts`'s action loop passes an empty set — **caught**, exactly the `onChanged` collision
   (2 of 3) goes undetected.
4. `store.ts`'s action loop passes an empty set — **caught**, exactly the store-action collision (2 of
   3) goes undetected.
5. Downgrade the new diagnostic branch's severity to `'warning'` — **caught**, proves the `'error'`
   severity is load-bearing for the fail-closed/no-partial-output guarantee.
6. Force the check to always match (`reservedNames.size > 0`) — **caught** decisively: 8 of 9 positive-
   fixture tests fail, proving the guard does not over-refuse non-colliding, legitimate code.

Every mutation caught by an existing test; none dismissed without being exercised.

## 29. Fixture paths

`fixtures/apps/m11f_callback_parameter_identity/` (positive) and `fixtures/apps/
m11f_callback_parameter_collision/` (negative). Both FlutterBridge-owned, narrowly named, no Continuum.

## 30. Test additions

5 Dart extraction tests (`callback parameter declaration identity (M11-F)`) + 11 TypeScript build-proof
tests (9 in the identity file, 2 in the collision file) — real analyzer → real normalize → real
generator → real `tsc --strict`.

## 31. Dart test result

`dart test` — 593/593 pass (588 baseline + 5 new), run clean after all mutation reverts.

## 32. TypeScript test result

`pnpm --filter @bridge/gen-react exec vitest run` — 582/582 pass (571 baseline + 11 new, 64 files), run
clean after all mutation reverts.

## 33. `just ci`

Exit 0. Full log scanned for error/failure markers — zero found.

## 34. `just determinism`

Exit 0, byte-identical across every run.

## 35. `bridge validate`

Both new fixtures: positive — `deterministic: true`, `fixed point: true`. Negative — `ok: false` with
exactly three `BRG3019`s plus `BRG3005`, zero files — a clean refusal, not a crash.

## 36. `tsc --strict`

Real `tsc.js` (not the shim), against the real runtime kit's own types, via each build test's own
`typecheckEmitted` — passes for the positive fixture's full emitted output, including the `validator`
and async rungs.

## 37. `git diff --check`

Clean.

## 38. Continuum audit

Zero references anywhere in the diff — grep-verified across every changed and new file.

## 39. Remaining architectural blockers + M11-G recommendation

`rsc-split` remains explicitly open, unstarted, and — per this milestone's own fresh evidence (§6.1) —
should not be picked up as a small, bounded next step; it would need its own dedicated investigation
into server/client classification, transitive store-read analysis across composed components (ADR-0047-
aware), and Next.js App Router serialization boundaries, likely spanning several milestones on its own.
Mutable capture across a callback boundary (`var x; builder: (v) { return () => x++; }`) was
deliberately not investigated here (§23) and remains a genuinely open question for whichever future
milestone needs it. Neither is started in this milestone.

## 40. Final outcome

Two independent investigations, two different outcomes. `rsc-split`: Outcome B, *directly observed* (the
stub tag, the ADR, the package description) and *analyzer-proven* to require genuine execution-
environment/module-graph semantics no small patch could bound — deliberately not implemented. Callback
parameter/local collision: Outcome A1, *directly observed* live (a real `TS2300` from the real compiler),
*analyzer-proven* (declaration identity unaffected), *test-proven* (16 new tests, 6 mutations, all
caught), and *fixed* at the smallest possible layer — reusing M11-D's own `BRG3019` mechanism rather than
inventing a new one. Committed as a single milestone; pushed to `origin/main`; `HEAD == origin/main`
verified.
