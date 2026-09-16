# M11-D — Architectural Frontier Investigation & Render-Tree Callback Local Identity

## 1. Baseline

Started from `497a8f8` (`origin/main` == `HEAD`), the M11-C action-scope commit. `git status --short`
showed only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/analysis_options.yaml`
drift. M9, M10-A through M10-F, M11-A, M11-B, and M11-C are all closed.

## 2. M11-C's own reported frontier — reconstructed, not assumed

M11-C closed with two findings behind one reported symptom: a store/action-body local (Category G,
generator-only, fixed) and a **render-tree-embedded callback local** — a local declared inside an inline
render-tree callback (`onPressed: () { ... }`) and read from a nested closure (`setState`) — left as
Outcome B, investigated but not implemented, with an explicit note in `scope.dart`'s own doc comment
(`Scope.forWidgetTree`) that fixing it was "a real, separately-evidenced fix this milestone did not
investigate or validate." This milestone does not trust that framing as complete — it re-derives the gap
from fresh evidence (§5) and finds it is **broader** than "nested closure": a *direct*, non-nested read of
a render-tree-embedded local fails identically (R1, §5), so the defining fact is not nesting depth but
*where* the local is declared.

## 3. Fresh analyzer investigation

Built a fresh scratch probe (`m11d_probe`, never reusing M11-C's own probe or conclusions) and ran the real
`bridge_analyzer` CLI against it. The declaration side: `_declaring`/`_variable`
(`statement_extractor.dart`) already produce a `Binding(binds: Binds.local, ...)` for a callback-embedded
local — its `VariableElement` is fully resolved by the analyzer (`node.declaredFragment?.element` is
non-null), matching every other local-declaration site in the codebase. The read side (`_reference`,
`expression_extractor.dart:841`) calls `scope.lookup(name)`, finds that same `Binding`, but produces no
`target` because **both** of `binding.inlineValue` and `binding.symbol` are null:

- `inlineValue` is null because `inlineValue` is populated *only* by `_structuredBody` (M8-B) for a
  leading `VariableDeclarationStatement` directly inside `build()`'s own block — never for a local declared
  inside a nested callback.
- `symbol` is null because `_localSymbol` (`statement_extractor.dart:412`) requires **both**
  `scope.owner != null` and `scope.ordinalOf(element) != null`, and traced the exact scope-construction
  chain in `component_extractor.dart` (`classState.scope` → `withParams` → `buildScope` → `renderScope =
  Scope.forWidgetTree(buildScope, ...)`) to confirm **no** `Scope.forBody` call exists anywhere between a
  component's class scope and its render tree. `Scope.forWidgetTree` (M9-F) only ever populated its own,
  separate `_widgetOwner`/`_widgetOrdinals` pair (for collection-for items), inheriting `_owner`/`_ordinals`
  unchanged (`null`) from `enclosing`.

This directly answers the brief's Category question: the missing target is **not** genuinely absent from
analyzer resolution (A is ruled out — the `Element` resolves fine, confirmed the identical
`_ordinalsOf`/`_OrdinalVisitor` pass, M9-A, already numbers this exact kind of declaration when reached from
an ordinary statement-level body). It is **lost by extraction-order/scope-construction** (Category B): the
render-tree scope chain never starts a declaration-tier owner/ordinal pair at all, so `_localSymbol` fails
closed on every callback-embedded local, unconditionally, regardless of nesting depth or read position.

## 4. Root-cause classification

**Category B** — identity lost by extraction order (scope-construction). Not C (AST traversal — the AST is
walked correctly and `_declaring` sees the declaration), not D (normalization — the gap is present before
any `bridge normalize` pass runs), not E (intentionally unavailable — `scope.dart`'s own pre-M11-D doc
comment on `Scope.forWidgetTree` explicitly frames this as an unvalidated *gap*, not a deliberate design
choice), not F alone (an "analyzer limitation" framing, which is not supported by evidence — the analyzer
resolves the element fine) — though M11-C's own report used the word "analyzer" loosely, this milestone's
fresh evidence narrows it precisely to the extraction-side scope-construction step.

## 5. Reduction ladder (fresh, R1–R12)

Built as real Dart source (`m11d_probe/lib/main.dart`, then the committed fixture), run through the real
analyzer and, for rungs that reach it, the real generator.

| Rung | Shape | Pre-fix `target` | Post-fix `target` |
|---|---|---|---|
| R1 | one callback, one local, **direct** read (no nesting) | absent (`BRG3006`) | resolved |
| R2 | one callback, one local, **nested** read (`setState`) — the original M11-C R5 shape | absent | resolved |
| R3 | two sibling outer callbacks, **same** local name, nested read | absent; each read had no target to collide over | each resolves to its own sibling's declaration, never the other's |
| R4 | two sibling outer callbacks, **different** local names, nested read | absent | resolved, independently |
| R5 | two **different widgets** independently declaring a structurally-identical local | absent; and (proven, §6) the two declarations' own `logic.VarDecl` shared the *same* content-addressed `NodeId` | resolved; distinct ids, distinct minted symbols |
| R6 | outer local **shadowed** by a same-named local inside the nested `setState` call | absent | **identity correct** (inner declaration), but the **generator** refuses (`BRG3019`, §8 — a separate, newly-exposed finding) |
| R7 | immutable local captured by a nested closure | (same as R2) | resolved |
| R8 | mutable (`var`, reassigned) local captured by a nested closure | absent | resolved |
| R9 | multiple reads of the same captured declaration | absent | all resolve to the one declaration |
| R10 | multiple captured locals from the same enclosing callback | absent | each resolves independently |
| R11 | captured local sharing a name with a **collection-for loop item** (M9-F, a deliberately separate mechanism) | absent for the local; the item already resolved via its own mechanism | both resolve, independently, never cross-referencing |
| R12 | captured local sharing a name with a **class member** (getter) | absent | resolves to the local, never the member |

Only R6 is not "supported" in the full sense: declaration identity is proven correct, but the generator
refuses to lower it (§8). Every other rung is promoted to fully supported, live-probed against the real
pipeline (analyzer → `bridge normalize` → real generator → real `tsc --strict`).

## 6. Declaration identity vs. closure/capture semantics — kept separate

The brief requires not silently conflating "which declaration does this identifier refer to" with "how does
this closure capture and observe the declaration at runtime." This milestone's fix is **pure declaration
identity**: it gives a render-tree-embedded local's own `VariableDeclaration` a real, stable,
declaration-tier symbol (the same `_owner`/`_ordinals` mechanism `Scope.forBody` already uses elsewhere),
and nothing more. It does **not** add, model, or claim any new *capture* semantics — JavaScript/TypeScript's
own native lexical closures already capture an outer `const`/`let` binding correctly for free once the
*name* used by the read and the *name* emitted for the declaration coincide, which is exactly what
declaration identity now guarantees (confirmed empirically: R2/R7's generated output is an ordinary nested
arrow function reading an outer `const`, no runtime machinery added). Mutable capture (R8, a `let`,
reassigned before the nested read) is *not* separately or specially supported — it works because it hits
the *identical*, unmodified declaration-tier symbol-minting path as an immutable one; this milestone did not
add, and would have refused to add, anything specific to reassignment.

## 7. Candidate fix shapes evaluated (checklist, §7 of the brief)

Two shapes were formulated from the scope-construction trace (§3) and evaluated against the 15-question
checklist before implementation:

**(a) Extend `Scope.forWidgetTree` to also populate `_owner`/`_ordinals`**, reusing the identical
`_ordinalsOf(body)` pass it already runs for its own widget-ordinal pair. What it preserves: analyzer
identity (keyed by resolved `Element`, M9-A's own proven scheme); survives normalization/render-tree
traversal (the ordinal map is computed once, up front, over the whole render tree, same as `Scope.forBody`);
preserves sibling isolation (R3, R4 — distinct `Element`s get distinct ordinals in one monotonic pass);
handles shadowing (R6 — `_declaring`'s own child-scope chaining already resolves shadowing correctly,
confirmed); handles multiple captures (R9, R10); requires **no** new UIR concept (`_owner`/`_ordinals`
already exist, already serialize to the identical `symbol`/`target` fields every other local uses);
requires **no** runtime change; does **not** imply generalized closure support (§6); does not distinguish
immutable/mutable capture because it does not need to (§6); deterministic (`_ordinalsOf` is a pure,
order-stable AST visitor); fails closed (a `_localSymbol` miss still yields `target: null`, still refused
honestly). Selected.

**(b) Give each inline callback its own `Scope.forBody`-style wrapping in `lambda()`.** Rejected: a *more*
granular isolation than the render tree actually needs (isolates per-callback rather than per-component),
which would require inventing a new per-callback owner-naming scheme not backed by any existing symbol
concept — more surface area for no additional collision-safety, since (a) already proves collision-free at
the coarser, already-established per-component granularity.

Neither candidate relies on name/text matching, declaration order, or generated-name conventions for
identity — both mint from a resolved `Element`, the same discipline every prior ADR-28 amendment uses.

## 8. A newly-exposed, separate finding: `setState` splice interacts unsafely with shadowing (R6)

Once identity resolves (§5–§7), R6 reaches the generator for the first time in this compiler's history, and
exposed a genuine, pre-existing, previously-unreachable generator defect: `setState(() { ... })`'s own body
is spliced open at extraction time (INV-22, `statement_extractor.dart`) — concatenated directly into the
enclosing block's own flat statement list, with no JS-level `{ ... }` marking where it began. Two Dart
declarations that only share a name because one shadows the other *within its own braces* land, after
splicing, in the *same* brace-less TypeScript list: `const value = 1; const value = 2;` — a genuine
`SyntaxError`, not merely a different program from the one Dart described. This is orthogonal to §6's
declaration-identity/capture-semantics distinction: it is neither. It is a **flattening** defect, latent
since M8-B/whenever `setState` splicing was introduced, invisible until this milestone made a shadowed
read's `target` resolve at all.

Scoped narrowly: added `GeneratorDiagnosticCode.DuplicateLocalDeclaration` (`BRG3019`) and a check in
`emitStatements` (`statement.ts`) that detects two `logic.VarDecl`s in the same emitted flat list wanting
the same generated name, and refuses (fails closed) rather than emit invalid TypeScript. This does **not**
rename, does **not** re-wrap the splice in a block (which would undo INV-22's own erasure), and does **not**
attempt to support shadowing across a spliced boundary — it refuses honestly, exactly like every other
`BRG3xxx` "no faithful lowering" case in this generator.

A structurally identical, **pre-existing**, deliberately out-of-scope sibling gap: a bare Dart block
statement (`{ ... }` used as an ordinary statement, not under `if`/`while`/`for`) is *also* flattened
without JS braces by `emitStatement`'s `logic.Block` case, and *could* in principle hit the same collision
through a completely different, unrelated path. This was **not** newly exposed by this milestone (a bare
block statement needs none of this milestone's changes to reach codegen) and is explicitly left unfixed,
noted here rather than silently ignored, per the brief's own audit discipline.

## 9. Root-cause classification, R6 specifically

Category unrelated to Categories A–H (declaration identity): this is a *generator emission* defect, not a
declaration-identity, closure, or capture-semantics defect. Recorded here because the brief's audit
discipline (§12) requires every reachable shape be tested, proven safe, or explicitly refused — never
marked safe merely because no fixture happened to exercise it before.

## 10. Silent-wrong-code audit (16 categories)

- **Wrong declaration** — refused/tested: every rung's read targets its own declaration's `id`, verified
  directly against the raw UIR (R1–R5, R7–R12) and via generated output content assertions.
- **Wrong scope** — tested: R3/R4 (sibling isolation), R6 (shadowing correctness at the identity layer).
- **Sibling collision** — tested and eliminated: R3 (same-name siblings), R5 (cross-widget, the original
  M11-C-adjacent concern) — proven via distinct `NodeId`s and distinct minted symbols, live-probed both
  pre-fix (collision confirmed) and post-fix (collision eliminated).
- **Nested shadowing collision** — tested: R6's declaration identity is correct; the *generator's own
  flattening* is refused rather than silently colliding (§8).
- **Accidental capture** — safe-by-construction: no new capture mechanism was added (§6); JS's native
  closures are unchanged.
- **Lost capture** — tested: R7/R8/R9/R10 all resolve and read correctly.
- **Free identifier emission** — refused: before this fix, an unresolved local reached the generator as a
  name-only `logic.Ref` and refused via `BRG3006` (never emitted a free/undeclared identifier); after the
  fix, every previously-refusing rung now resolves to a real declaration, so this risk does not newly arise.
- **Parameter/local collision** — safe-by-construction: `Binding` lookup chains child scopes innermost-first,
  unchanged by this milestone; not exercised by a real supported widget shape (no callback taking a
  parameter exists in this compiler's current widget catalog), noted rather than fabricated.
- **Member/local collision** — tested: R12, resolves to the local.
- **Duplicate helper identity** — tested: R5 (each widget gets its own `handle_*` helper name, confirmed
  distinct in generated output).
- **Incorrect reachability** — unaffected: this milestone changes declaration-tier identity, not
  reachability/fixed-point computation; confirmed via `bridge validate` (§13).
- **Incorrect module emission** — tested: `tsc --strict` accepts every emitted file for every positive rung.
- **Mutable/immutable semantic confusion** — refused to add: §6 explicitly does not special-case mutability;
  R8 works through the unmodified, shared path.
- **Evaluation-order change** — safe-by-construction: no statement reordering; `_ordinalsOf`'s own pass is a
  read-only numbering pre-pass, run before any emission, and never mutates statement order.
- **Cross-widget contamination** — tested and eliminated: R5.
- **Nondeterministic generated identity** — tested: `_ordinalsOf` is a deterministic, order-stable
  `RecursiveAstVisitor`; a "same source, same bytes on a second run" determinism test is included in both
  the Dart extraction test group and would be covered by `just determinism` (§13).

## 11. Scope and collision audit

R3 (sibling), R5 (cross-widget), R6 (nested shadowing, identity-only), R11 (cross-mechanism —
`ordinalOf` vs `ordinalOfInWidgetTree`, both now drawing ordinals from the *same* `_ordinalsOf` pass, proven
to still mint distinct ids for distinct declarations), R12 (member/local) are all covered above. The
original M11-C R5 collision — two widgets' structurally-identical locals sharing one content-addressed
`NodeId` — is proven eliminated: pre-fix, `CrossWidgetCollisionA`/`B`'s own `value` declarations shared id
`885c100e39d4275f` (raw UIR, live-probed); post-fix, they mint distinct ids and distinct symbols.

## 12. UIR/schema analysis

No new UIR field, no new UIR node. `_owner`/`_ordinals` already exist on `Scope`; `logic.VarDecl.symbol`,
`logic.Ref.target` already exist in the schema and are used identically to every other declaration-tier
local (ADR-28). One new **diagnostic code** (`BRG3019`, generation-layer, `GeneratorDiagnosticCode`) for the
newly-exposed, separate splice/shadowing refusal (§8) — not a schema change.

## 13. Selected architectural outcome: **A1**

A small, generator/extraction-only implementation — `Scope.forWidgetTree` reuses its own existing
`_ordinalsOf` pass for a second, already-existing owner/ordinal pair, plus a narrowly-scoped generator-side
refusal for a newly-exposed, unrelated splice/shadowing case. No architecture change, no new UIR concept, no
ADR required (matching the brief's own "do not create an ADR for a trivial, behavior-preserving fix unless
the architecture actually changes").

## 14. Implementation — what changed

- `dart/bridge_analyzer/lib/src/session/extract/scope.dart` — `Scope.forWidgetTree` now computes
  `_ordinalsOf(body)` once and uses it for **both** the pre-existing widget-ordinal pair and a real
  `_owner`/`_ordinals` pair (previously inherited unchanged, `null`, from `enclosing`).
- `packages/generators/react/src/internal/diagnostics/codes.ts` — new `DuplicateLocalDeclaration: 'BRG3019'`.
- `packages/generators/react/src/internal/emit/statement.ts` — `emitStatements` detects a same-name
  `logic.VarDecl` collision within one flat emitted list and refuses via `BRG3019` instead of emitting
  invalid TypeScript.
- `dart/bridge_analyzer/test/extraction_test.dart` — new group, "render-tree-embedded callback local
  declaration identity (ADR-28, M11-D)", 10 tests (R1–R3, R5, R6, R8, R11, R12, an `inlineValue`
  non-interference proof, and a determinism proof); updated a stale M9-F doc comment that pre-dated this fix.
- `packages/generators/react/tests/render_tree_callback_identity_build.test.ts` — 12 real-analyzer,
  real-generator, real-`tsc` tests (positive rungs).
- `packages/generators/react/tests/render_tree_callback_shadow_refusal_build.test.ts` — 2 tests (negative,
  R6's generator-level refusal).
- `packages/generators/react/tests/support.ts` — `renderTreeCallbackIdentityRaw()` /
  `renderTreeCallbackShadowRefusalRaw()`.
- `fixtures/apps/render_tree_callback_identity/` (new) — R1–R5, R7–R12, real Flutter/Dart source.
- `fixtures/apps/render_tree_callback_shadow_refusal/` (new) — R6, isolated.
- `fixtures/uir/render_tree_callback_identity.ndjson`, `fixtures/uir/render_tree_callback_shadow_refusal.ndjson`
  — committed, real-analyzer-produced goldens.

## 15. Identity/provenance strategy

Unchanged from ADR-28's own established strategy, extended to one more scope-construction site: identity is
minted from a resolved analyzer `Element`, numbered by one deterministic pre-order pass per owning body,
never inferred from name, text, declaration order independent of the pass, or any generated-name convention.

## 16. Scope-resolution semantics

`Scope.lookup` (name-based, innermost-first `Binding` chaining) is unchanged. What changed is only whether a
`Binding.symbol` can be minted once a name resolves to a local `Binding` — a separate concern from *which*
`Binding` a name resolves to.

## 17. Closure/capture semantics

Unchanged, deliberately (§6). No new runtime behavior; no new UIR capture concept; mutability is not
specially modelled.

## 18. Regression protection

Full Dart test suite (Dart analyzer test suite, `dart/bridge_analyzer`) and the full React generator vitest
suite were run clean after every mutation revert. `widget-tree collection-for item declaration identity
(ADR-28, amended M9-F)` (the fixture this milestone's own ordinal-sharing change most directly touches) and
the full `fixtures/apps/widget_collection_for_identity` build test remain green, unmodified.

## 19. Mutation results — mutate, confirm failure, revert, confirm clean

1. Revert `Scope.forWidgetTree` to inherit `enclosing._owner`/`_ordinals` unchanged (undo the whole fix) —
   **caught**, 8 of 10 new Dart tests fail.
2. Mint a constant, non-unique `_owner` string instead of the real per-component `owner` — **caught**, R5's
   cross-widget test fails; also surfaced a real `BRG1202` "two declarations share the symbol" diagnostic
   from an independent safety net elsewhere in the pipeline.
3. Pass an empty ordinals map for the new declaration-tier pair (owner set, no ordinal ever resolves) —
   **caught**, 8 of 10 new Dart tests fail.
4. Remove the `BRG3019` duplicate-declaration check entirely — **caught**, the shadow-refusal vitest fails
   (no longer refuses).
5. Neutralize the duplicate-name condition (`false && seen.has(name)`) — **caught**, identical failure.
6. Downgrade the `BRG3019` report from `'error'` to `'warning'` — **caught**, the shadow-refusal test's
   `files` assertion fails (the invalid TypeScript would have been written, proving `'error'` severity is
   load-bearing for the fail-closed guarantee).

Every mutation was caught by an existing test; none required a new test to be written to catch it, and none
was dismissed as "safe" without being exercised.

## 20. Validation results

- `dart test` (`dart/bridge_analyzer`) — all tests pass, including the new 10-test M11-D group.
- `pnpm --filter @bridge/gen-react exec vitest run` — 561/561 tests pass (60 files), including the 15 new
  M11-D tests: 13 in `render_tree_callback_identity_build.test.ts` (a `BRG1310` control, an all-clear
  control, a real `tsc --strict` proof, and 10 per-rung assertions) and 2 in
  `render_tree_callback_shadow_refusal_build.test.ts` (a `BRG1310` control and the `BRG3019` refusal proof).
- `pnpm --filter @bridge/gen-react exec tsc --noEmit -p .` — clean.
- Real `bridge build` (CLI) against both new fixtures: the positive fixture succeeds (21 files written,
  every rung typechecks — `tsc --strict` via the vitest harness); the negative fixture fails closed with
  exactly `BRG3019`, zero files written.
- `git diff --check` — clean (checked as part of the pre-commit audit, §21).

## 21. Fixture path

New, narrowly-named fixtures (per the brief's own naming guidance): `fixtures/apps/
render_tree_callback_identity/` (positive, R1–R5, R7–R12) and `fixtures/apps/
render_tree_callback_shadow_refusal/` (negative, R6). `fixtures/apps/action_scope/` was not extended —
that fixture is specifically about store/action-body locals (M11-C), a different declaration-tier owner
entirely from a render-tree-embedded callback local (M11-D); conflating them would have mixed two different
scope-construction call sites under one fixture's own name.

## 22. Test additions

10 Dart extraction tests (declaration-identity proofs, live UIR inspection) + 15 TypeScript build-proof
tests (real analyzer → real normalize → real generator → real `tsc --strict`), enumerated in §14 and §20.

## 23. Remaining architectural frontier

- The bare-Dart-block-statement flattening gap noted in §8 — pre-existing, unrelated to this milestone's own
  changes, not newly exposed, left explicitly documented rather than silently accepted.
- Application-widget composition (one project-defined widget referenced as a *child* inside another's render
  tree, e.g. `Scaffold(body: MyOtherWidget())`) is unsupported today (`BRG3001`) — discovered incidentally
  while building this milestone's own fixtures (each rung had to stand as an independently-reachable
  top-level widget rather than being composed into one screen). Unrelated to declaration identity; a
  separate, real gap, noted for a future milestone's own fresh investigation, not this one's to invent.
- A callback parameter (as opposed to a captured local) sharing a name with an outer local was not
  reproducible against this compiler's current widget catalog (no cataloged widget offers a callback that
  takes a parameter today) — R11 was redesigned around a collection-for item instead, which is the closest
  real, reachable analog; a true callback-parameter/local collision remains unverified, explicitly, rather
  than assumed safe.

## 24. Recommendation for M11-E

Per the brief's own hard stop: no capability is proposed here. Either of the two frontier items in §23 —
application-widget composition, or a fresh, evidence-first look at callback-parameter shapes once one
exists in the widget catalog — would need its own fresh investigation, fresh reduction ladder, and fresh
architecture-decision gate, exactly as this milestone required of itself. Neither is started here.
