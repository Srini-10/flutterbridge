# M11-E — Architectural Frontier Investigation

## 1. Baseline

Started from `8c6800c` (`origin/main` == `HEAD`), the M11-D render-tree-callback-identity commit.
`git status --short` showed only the pre-existing, deliberately-untouched
`fixtures/apps/hello_bridge/analysis_options.yaml` drift. Baseline counts confirmed by direct run before
any change: Dart `dart test` — 582 passed; TypeScript `pnpm --filter @bridge/gen-react exec vitest run`
— 561 passed (60 files).

## 2. Current capability inventory

Re-verified (not assumed) via a research pass reading `docs/m9/`–`docs/m11/`, ADR-0027 through
ADR-0046, the current UIR schema, extraction, normalization, reachability, generator, and diagnostics
architecture. Confirmed supported: project-class construction (ADR-36/37), fields/getters (ADR-35/38),
instance and static methods (ADR-39/45), member-helper composition (ADR-40), multi-argument evaluation
order (ADR-41), return-value chaining (ADR-42), optional positional parameters (ADR-43), safe navigation
(ADR-44), explicit awaited async methods (ADR-46), store/action locals (M11-C), render-tree callback
locals (M11-D), declaration identity generally (ADR-28 family), reachability (value/type/member, the
last a genuine fixed point — `functions.ts`), deterministic generation, and per-milestone mutation-kill
validation. Confirmed refused, with live codes: `BRG3013` (unmodelled dispatch, generics, recursion,
subclass/inheritance shapes, private members), `BRG3019` (M11-D's own shadowed-splice collision),
`BRG3001` (unmapped widget — the frontier this milestone investigates), and the full `BRG1xxx`/`BRG3xxx`
registries as currently defined in `dart/bridge_analyzer/lib/src/diagnostics/codes.dart` and
`packages/generators/react/src/internal/diagnostics/codes.ts`.

## 3. M11-D frontier reproduced

All three of M11-D's own leads were investigated fresh, live-probed, never assumed from that report's
own prose.

## 4. Fresh frontier candidates

A codebase-wide search (diagnostic call sites, refusal branches, existing negative-control tests, doc
comments naming a gap) turned up no additional bounded candidate beyond the three M11-D already named.
`rsc-split` (every component unconditionally `'use client'`) is real but architecturally broad — a whole
unbuilt compiler pass, not a bounded next capability — noted, not pursued.

## 5. Candidate A investigation — bare Dart block-statement flattening

Live-probed (`onPressed: () { final value = 1; { final value = 2; _result = value; } }`, a genuine bare
`{ ... }` block, not a `setState` call). Extraction represents it faithfully as a nested `logic.Block`
node with its own `statements` array — declaration identity is already correct (M11-D's own fix applies
transparently; the inner `value` gets its own target, the outer read is unused). Normalization's **N7**
pass (`flatten_wrappers`) already flattens this nested block into the SAME flat statement list a
`setState`-splice produces, confirmed by inspecting the normalized document directly (`sig.Action.body`
is `[VarDecl(value=1), VarDecl(value=2), ExprStmt(...)]`, no nested `logic.Block` survives). M11-D's own
`BRG3019` check — operating on whatever flat list `emitStatements` is handed, regardless of how it got
flat — therefore already catches this shape too, verified live: the colliding case refuses `BRG3019`
exactly as the `setState` case does; a non-colliding bare block (different names) builds and typechecks
cleanly. **Outcome: no gap exists. Already resolved by M11-D, accidentally but correctly, and confirmed
here rather than left as an assumption.** No implementation.

## 6. Candidate B investigation — application-widget composition

Live-probed: `Scaffold(body: ChildWidget())`, `ChildWidget` a sibling `StatelessWidget`, fails `BRG3001`.
Traced the exact mechanism: `component.ts`'s `emitElement` already checks `scope.componentModules`
(pre-populated for every non-app-root `ui.Component`, keyed by that component's own `anchor`) before
falling through to the Flutter-widget catalog — and `fixtures/apps/cross_package_app`'s own
`GreetingCard` (a project widget declared in a *separate*, `path:`-dependency package) already composes
successfully through exactly this path, proven by the pre-existing `cross_package_build.test.ts`. Direct
inspection of both raw UIR documents found the precise root cause: `ui.Component.anchor`'s file segment
is project-relative (`lib/main.dart#ChildWidget`) for a component the analyzed project itself declares,
and a `package:` URI for one declared in a local path dependency (`node_factory.dart`'s own `_build`, and
`analysis_session.dart`'s own file-list classification) — while `component.ts`'s own anchor
reconstruction (`` `${component.library}#${name}` ``) always used a package URI
(`type.element.library.identifier`), so it only ever matched the dependency case. This is a lost-
provenance bug, not a missing semantic capability: extraction already resolves everything needed.

Reduction ladder (R1–R10) completed fresh, per §5 of the accompanying ADR-0047 — all ten rungs
live-probed or reasoned from direct code reading with a stated confidence level; none assumed from
M11-D's own prose. R9 (recursive composition) confirmed safe by construction by reading
`emitComponentReference` directly: it never inlines a referenced component's own render tree, only emits
an ordinary JSX tag plus a module import — recursion is a React runtime concern, not a compile-time one.

**Outcome: real, bounded, evidence-backed gap. Selected for implementation (Outcome A3, ADR-0047).**

### 6.1 A second, separate bug found while building this candidate's own R5 rung

Composing two *different* project classes that happen to share a class name (declared in different
files — legal Dart, nothing requires cross-file uniqueness) silently collided: `fileNameOf` keys purely
on the class name, so both components' own output claimed `src/components/label.tsx`, and whichever was
emitted last silently overwrote the other — both source references then rendered the survivor. This is
silent wrong output, not a clean refusal, and had to be fixed as part of this milestone's own audit
discipline rather than merely documented (§12). Fixed with a small, targeted collision guard in
`pipeline.ts`'s own component-emission loop, reusing the already-reserved but previously-unused
`BRG3009` (`SymbolCollision`) diagnostic. See `fixtures/apps/m11e_project_widget_name_collision` and its
own build test.

## 7. Candidate C investigation — callback-parameter/local collision

Investigated whether any cataloged, reachable FlutterBridge construct can produce
`builder: (value) { final value = ...; }` or an equivalent parameter/local collision. Live-probed the one
plausible candidate, `ListView.builder`'s own `itemBuilder: (context, index) { ... }`: direct inspection
of the raw UIR shows `itemBuilder` does **not** extract as an ordinary statement-bodied callback at all —
it extracts as a `ui.List` with a declarative `itemParam`/`indexParam`/`template` shape (the collection-
for mechanism, M9-F), which structurally requires a direct-return expression, not an arbitrary statement
sequence. There is nowhere in this compiler today a callback WITH a parameter can also carry local
declarations of its own. A parameter shadowed by a same-named local declared directly in the same
function body is, separately, not even valid Dart (parameters and body-level locals share one scope) —
the only reachable variant would be a parameter shadowing an *outer, captured* local, which remains
untested but is a materially different, narrower question than the one M11-D's own §23 posed.

**Outcome: confirmed, live, genuinely unreachable. Not manufactured. Left open, explicitly, pending a
future catalog capability that would make it reachable at all — nothing to implement here.**

## 8. Other frontier findings

None beyond §4/§6.1. `rsc-split` (§4) is noted, not pursued — it is a named, unbuilt compiler pass, not a
bounded capability gap this milestone's own evidence bar admits.

## 9. Fresh analyzer evidence

`RawNodeEmitter.componentSymbolOf(DartType?, String)` (`raw_node_emitter.dart:192`) — pre-existing,
already used and proven by `route_extractor.dart`/`transition_extractor.dart` for `app.Route`/
`app.RouteTransition` targets — resolves a widget's own declaring `ClassElement`'s library against
`packageName` (the analyzed project's own name) and `extractedDependencyFiles`, returning the identical
`comp:<path>#<name>` symbol string `component_extractor.dart` mints for that class's own `ui.Component`.
Reproduced live for same-file, cross-file (same project), and cross-package shapes; confirmed `null` for
every framework widget reference, unchanged.

## 10. Exact selected root cause

Category: lost provenance at the generator's own reference-resolution layer (an anchor-string
reconstruction that only ever matched the case it was extracted from), not a missing analyzer capability,
not an extraction gap, not a normalization gap.

## 11. Reduction ladder result

R1–R10 all resolved to a stated, evidenced outcome (ADR-0047 §5) — 8 positive/orthogonal, R9 safe-by-
construction, R10 unaffected/independent. No rung required assuming a fix shape before evidence.

## 12. Semantic classification

Declaration provenance — identical in kind and risk profile to `TypeRef.target` (ADR-0034) and member-
read `target` (ADR-0033): a resolved fact about identity, never a claim the generator can render or
construct the referenced class, never inferred from name/text/anchor-string matching.

## 13. Architectural outcome

**Outcome A3** — small UIR schema addition (`WidgetRef.target`), ADR-0047 written and reviewed before
implementation, reusing an existing, already-proven extraction mechanism. No generalized symbol table,
no closure machinery, no dynamic-dispatch broadening, no weakened refusal diagnostic.

## 14. Supported subset

A `ui.Element` referencing a project-declared widget class — same file, a different file in the same
project, or a local path dependency — resolves a `target` at extraction time and composes as an ordinary
imported React component reference. Repeated references (including through an import alias) resolve to
the identical target and one deduplicated import.

## 15. Refused subset

Unchanged: a widget with no catalog mapping and no project-class target still refuses `BRG3001`, wording
unchanged. Newly refused, correctly: two different project classes sharing a class name across files
(`BRG3009`, §6.1) — previously silently wrong, not previously refused at all.

## 16. UIR/schema impact

`WidgetRef` gains one optional field, `target: NodeId`, described identically in kind to `TypeRef.target`.
No other schema change. `UIR_REFERENCE_FIELDS` required no manual update — value-object-nested reference
fields (matching `TypeRef.target`'s own precedent) are not listed there; confirmed by direct inspection
after regenerating.

## 17. Extraction changes

`widget_extractor.dart`'s `RawNodeEmitter.widgetRef` now also calls `out.componentSymbolOf(type, name)`
and includes `target: RawRef(symbol)` when non-null — one additional call site for a pre-existing,
already-proven mechanism.

## 18. Normalization changes

None. `target` is an ordinary `NodeId`-typed field; canonicalization treats it uniformly with every other
reference field.

## 19. Reachability changes

None. Every `ui.Component` is still extracted and emitted regardless of reachability (unchanged since
M11-D); `target` does not participate in value/type/member reachability.

## 20. Generator changes

`component.ts`'s `emitElement` now checks `componentRef.target` against a new `NodeId`-keyed sibling map
(`scope.componentModulesById`, populated alongside the existing anchor-keyed `componentModules`) before
falling back to the pre-existing anchor-string lookup — kept as a fallback for a document a pre-ADR-0047
analyzer produced, confirmed live: `cross_package_build.test.ts`'s own pre-existing golden (captured
before this milestone, with no `target` field) still passes unmodified. `pipeline.ts`'s own component-
emission loop additionally guards against two components claiming the same output path (§6.1).

## 21. Runtime impact

None. Emitted output shape is unchanged from the already-working cross-package case.

## 22. Identity/provenance strategy

Unchanged from ADR-0033/ADR-0034's own established strategy, extended to a third reference kind: minted
from a resolved analyzer `Element` at extraction time, never inferred from name, text, or anchor-string
reconstruction.

## 23. Scope/closure semantics

Untouched. This capability is about which `ui.Component` a `ui.Element` names, not about lexical scope,
closures, or capture — no interaction with M9–M11-D's own scope-construction work.

## 24. Shadowing/mutability semantics

Not applicable — `WidgetRef.target` names a declaration, not a mutable binding.

## 25. Cross-widget behavior

R5/R9 (ADR-0047 §5) — distinct components, including same-named ones in different files, resolve
distinctly (once §6.1's own collision guard is in place) or refuse honestly (when they'd collide on
output identity); repeated/aliased references to the same widget converge on one target and one import.

## 26. Cross-file behavior

R4 (ADR-0047 §5) — a widget declared in a different file from where it is composed resolves correctly,
live-probed and Dart-tested; unchanged for the pre-existing cross-package (M8-F) case.

## 27. Silent-wrong-code audit

- **Wrong declaration** — tested: R2–R5, R9 all assert exact target/id equality.
- **Wrong scope** — not applicable (declaration reference, not scope resolution).
- **Sibling collision** — tested: R5, both at the Dart extraction layer (distinct ids/symbols) and the
  generator layer (distinct imports/output).
- **Nested shadowing** — not applicable.
- **Accidental/lost capture** — not applicable (no closure/capture semantics touched, §23).
- **Free identifier** — safe by construction: an unresolved `target` (framework widget, or a genuinely
  unresolvable external reference) is simply absent, falling through to the pre-existing, unchanged
  catalog/`BRG3001` path — never a free/undeclared identifier.
- **Parameter/local collision** — not applicable to this capability.
- **Member/local collision** — not applicable.
- **Duplicate helper identity** — the §6.1 finding, tested and fixed (`BRG3009`).
- **Incorrect reachability** — unaffected, confirmed (§19).
- **Incorrect module emission** — tested: `tsc --strict` accepts every emitted file for the positive
  fixture.
- **Evaluation-order change** — safe by construction: no statement reordering; extraction only adds a
  field to an existing value object.
- **Cross-widget contamination** — tested and eliminated (R5), and the §6.1 collision (a genuinely
  different contamination shape) found and fixed.
- **Nondeterministic identity** — tested: `bridge validate` (deterministic=true) on both new fixtures;
  the Dart extraction test group includes a same-source/same-bytes determinism proof.
- **Recursive/non-convergent reachability** — not applicable; R9 (recursion) confirmed safe by
  construction, unrelated to reachability's own fixed point.

## 28. Mutation results

Six mutations, per ADR-0047 §16 — mutate, confirm failure, revert, confirm clean:

1. Remove `target` from extraction (`widgetRef`) — **caught**, 4 of 6 Dart tests fail.
2. Generator ignores `target`, only anchor fallback — **caught**, 7 of 8 TS tests fail.
3. Bypass the §6.1 collision guard entirely — **caught**, the negative collision test fails.
4. Downgrade the collision guard's `BRG3009` to `'warning'` — **caught**, same test fails (proves the
   fail-closed guarantee is load-bearing).
5. Mint a bogus/wrong symbol for `target` — **caught**, 4 of 6 Dart tests fail; also surfaced the
   pipeline's own independent `BRG1201` "unresolved symbol" safety net.
6. Collapse `componentModulesById`'s own keys to a constant — **caught**, 7 of 8 TS tests fail.

Every mutation caught by an existing test; none dismissed without being exercised; none manufactured for
a pass count.

## 29. Fixture paths

`fixtures/apps/m11e_project_widget_composition/` (positive — R2–R5, R9, framework-widget negative
control) and `fixtures/apps/m11e_project_widget_name_collision/` (negative — the §6.1 finding). Both
FlutterBridge-owned, narrowly named, no Continuum.

## 30. Test additions

6 Dart extraction tests (`project-widget composition target (ADR-0047, M11-E)`) + 10 TypeScript build-
proof tests (7 in the composition file, 2 in the collision file, plus the shared `BRG1310` controls) —
real analyzer → real normalize → real generator → real `tsc --strict`.

## 31. Dart test result

`dart test` — 588/588 pass (582 baseline + 6 new), run clean after all mutation reverts.

## 32. TypeScript test result

`pnpm --filter @bridge/gen-react exec vitest run` — 571/571 pass (561 baseline + 10 new, 62 files), run
clean after all mutation reverts.

## 33. `just ci`

Exit 0. Full log scanned for error/failure markers — zero found.

## 34. `just determinism`

Exit 0, byte-identical across every run. First attempt was interrupted by a session boundary (no
completion record); per established discipline this was not counted as a pass — `git status`/
`git rev-parse HEAD` confirmed no work lost, and the identical command was retried honestly, succeeding
clean.

## 35. `bridge validate`

Both new fixtures: positive — `deterministic: true`, `fixed point: true`. Negative — `ok: false` with
exactly `BRG3009`/`BRG3005`, zero files, confirming a clean refusal rather than a crash.

## 36. `tsc --strict`

Real `tsc.js` (not the shim) against the real runtime kit's own types, via each build test's own
`typecheckEmitted` — passes for the positive fixture's full emitted output.

## 37. `git diff --check`

Clean.

## 38. Continuum audit

Zero references anywhere in the diff — grep-verified across every changed and new file.

## 39. Remaining architectural blockers + M11-F recommendation

Per the brief's own hard stop, no capability is proposed here. Two items remain explicitly open, neither
started: `rsc-split` (§4/§8 — a named, unbuilt, architecturally broad compiler pass, not a bounded next
step) and Candidate C's own narrower variant (a callback parameter shadowing an *outer, captured* local —
untested, and unreachable until some catalog capability makes a parameterized, statement-bodied callback
possible at all). Either would need its own fresh investigation, fresh reduction ladder, and fresh
architecture-decision gate. Neither is started here.

## 40. Final outcome

Outcome A3 implemented for Candidate B (project-widget composition, ADR-0047) — *directly observed* live
at every reduction-ladder rung, *analyzer-proven* via `componentSymbolOf`, *test-proven* via 16 new tests
across both languages, *safe-by-construction* for recursion/reachability/evaluation-order, and the §6.1
name-collision finding *fixed* rather than merely documented. Candidate A (bare block flattening)
*confirmed already resolved* by M11-D, live-probed, no implementation needed. Candidate C (callback-
parameter/local collision) *confirmed genuinely unreachable*, live-probed, deliberately not manufactured.
Committed as a single milestone; pushed to `origin/main`; `HEAD == origin/main` verified.
