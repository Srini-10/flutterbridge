# M11-G — Architectural Frontier Investigation & Mutable Capture Across Callback Boundaries

## 1. Baseline

Started from `264f407` (`origin/main` == `HEAD`), the M11-F callback-parameter-collision commit.
`git status --short` showed only the pre-existing, deliberately-untouched
`fixtures/apps/hello_bridge/analysis_options.yaml` drift. Baseline counts confirmed by direct run before
any change: Dart `dart test` — 593 passed; TypeScript `pnpm --filter @bridge/gen-react exec vitest run`
— 582 passed (64 files).

## 2. Current capability inventory

Re-verified against M11-F's own closing state: callback parameter identity and the `BRG3019`
parameter/local collision refusal, project-widget composition (ADR-0047), render-tree callback local
identity (M11-D), store/action locals (M11-C), and every M9–M11-F capability remain intact — confirmed
by the full, unmodified baseline test run (§1) before any change, and re-confirmed clean after (§33–34).

## 3. M11-F frontier reproduction

M11-F's own remaining lead (mutable capture across a callback boundary) was investigated fresh, live-
probed, never assumed from that report's own prose.

## 4. Mutable-capture semantic definition

Four cases, kept deliberately separate (never collapsed into one "capture" feature), per the brief's own
framing:

- **Case A — mutable local, no capture**: declared, mutated, and read entirely within the SAME callback.
- **Case B — immutable local, captured**: declaration identity plus lexical capture; not mutation.
- **Case C — mutable local, captured, read only**: the callback observes the binding; nothing writes it.
- **Case D — mutable local, captured, WRITTEN**: the callback (or a further-nested one) mutates a binding
  declared in an *enclosing*, separately-invoked scope.

## 5. Fresh analyzer evidence

The analyzer already resolves everything needed for every case: a `VariableDeclaration`'s own
`declaredFragment?.element` is available regardless of `final`/`var`; an `AssignmentExpression`'s own
`writeType` and a `PostfixExpression`/`PrefixExpression`'s own operand are both directly inspectable
(`_target`, `expression_extractor.dart:690`); increment/decrement resolve to `logic.Assign` with
`operator: 'increment'/'decrement'` and `isPostfix`. Nothing about mutable-capture correctness was ever
an analyzer-evidence gap — the defect found (§8) is purely in how this compiler's own extraction layer
used information it already had correctly.

## 6. Case A — mutable local without capture

Live-probed (`onPressed: () { var count = 0; count++; }`): the increment's own `target` is a real
`logic.Ref` pointing at the local's own `logic.VarDecl` id — correct, via the identical declaration-tier
identity mechanism an immutable local already uses (ADR-28, M9-A, amended for render-tree callbacks by
M11-D). **Already fully supported. No implementation needed.**

## 7. Case B — immutable capture

Established by M9–M11-D; unaffected and untouched by this milestone. Not separately re-probed — no new
evidence would change a settled, already-audited capability.

## 8. Case C — mutable capture, read only

Live-probed (`var base = 7;` at `build()`'s own top level, read from a nested `setState` closure): the
read is inlined — `base`'s own literal initializer (`7`) is re-extracted at the read site
(`Binding.inlineValue`, M8-B), correctly, because it is never mutated. **Already sound**, for the same
reason `inlineValue` is sound for any pure read: Flutter's own contract already requires `build()` to
have no externally observable side effects, so re-evaluating a never-mutated expression more than once
changes nothing about what the program renders.

## 9. Case D — mutable capture, written — the defect found

Live-probed, the brief's own exact example (`var count = 0;` at `build()`'s own top level; `onPressed: ()
{ count++; }`): the raw UIR's own increment `target` was `logic.Lit(0)` — the local's own inlined
*initializer*, not a reference to any real place. Confirmed end-to-end: `bridge build` reported **zero
diagnostics** and emitted `0++;` — genuinely invalid TypeScript (`SyntaxError`). The plain-assignment form
(`count = count + 5;`) produced the identical class of defect (`0 = 5;`). This is `_target`'s own
`SimpleIdentifier` case (`expression_extractor.dart`) delegating unconditionally to `_reference` — the
same function a *read* uses — which checks `Binding.inlineValue` first, with no notion of write-versus-
read position. **A real, live-probed, previously-undetected silent-wrong-code defect**, reachable through
an ordinary Flutter idiom, caught by no prior milestone's own audit.

## 10. Reduction ladder result

R1 (Case A) — supported. R2 (Case C) — supported. R3 (Case D, single callback) — refused, `BRG1311`. R4/R5
(two callbacks) — each write independently refused (verified: two build()-level locals, both written,
produce two independent `BRG1311`s). R6 (independent widgets, same local name) — safe by construction
(each component's own extraction has its own scope chain; not separately probed, no plausible failure
mode). R7 (shadowed mutable locals) — live-probed and Dart-test-proven: an inner, real local correctly
shadows and safely mutates; the outer, `inlineValue`-eligible local of the identical name is correctly
unaffected (`scope.lookup`'s own innermost-first resolution). R8 (parameter + same name) — safe by
construction: a parameter's own `Binding` never carries `inlineValue`, so it always shadows an outer
`build()`-level local of the same name for `_target`'s own purposes; not independently probed (same
mechanism R7 already proved). R9 (setState-nested write) — live-probed: refused identically regardless of
nesting depth. R10 (multiple captured mutables) — live-probed and Dart-test-proven: independent
refusals, and (positive) independent, correct mutation of two same-callback locals. R11/R12 (argument-
position, return-position reads) — safe by construction: `_target` is only ever reached for a write
position; an ordinary read never reaches it, regardless of position. R13 — subsumed by R3/R9. R14
(repeated enclosing invocation) — see §11. R15 (cross-file composition) — safe by construction: each
composed widget's own `build()` is extracted independently (ADR-0047 established this for identity;
unchanged here). R16 (unreachable callback) — safe by construction, and deliberately conservative: every
`ui.Component` is extracted regardless of reachability (M11-D/E), so an unreachable callback's own Case D
write still refuses the *whole* program — matching this compiler's own established "fail closed"
discipline (better to over-refuse than risk one unreachable widget's own defect going unnoticed). R17
(recursive capture) — safe by construction; `_target` is a pure, per-reference function with no recursion
of its own.

## 11. Binding lifetime analysis

The safe cases (A, C) and the refused case (D) split exactly along a lifetime boundary. A local declared
*inside* a callback (Case A) is re-declared fresh on every invocation of that callback — in Dart and in
the generated JS alike (a `let`/`const` inside an arrow function body is created anew on every call) —
requiring no persistent storage. A `build()`-level local (Cases C/D) is, in real Dart/Flutter semantics,
*also* re-declared on every `build()` invocation (every rebuild) — so a Case-D-shaped mutation that never
triggers a rebuild is invisible (nothing re-reads it before the next `build()` resets it to its initial
value), and one that *does* trigger a rebuild (via `setState`) has its own mutation erased by that very
rebuild re-running `var count = 0;` again. In real, idiomatic Flutter, this shape cannot achieve
persistent, observable state at all — the correct, idiomatic pattern for that is a `State`-class field,
already fully supported (M9-L, M11-D). This milestone did not need to build a persistent-lifetime
representation, because the shape that would need one is not a shape real Dart/Flutter semantics can make
meaningful in the first place.

## 12. Shared-binding proof

Not applicable to the refused shape (Case D) — it is refused before any question of shared identity
between two write sites arises. For the supported shape (Case A extended to two sibling writers within
one callback, R10), both writes resolve to the identical `logic.VarDecl` id, live-probed and Dart-test-
proven (`refs.every((r) => r['target'] == decl['id'])`), and the generated `let`/reassignment pair
operates on one shared JS binding — ordinary, correct lexical closure behavior, not a new mechanism.

## 13. `setState` interaction

Unchanged. `setState`'s own splice (INV-22, established M11-D) continues to flatten a nested callback's
own statements into the enclosing one's flat list; Case A's own mutation-then-read across that splice
boundary was already correct (M11-D's own R8 rung); Case D's own write is refused regardless of whether
it is reached directly or through a `setState`-nested closure (live-probed both ways, §9/§10 R9).

## 14. Closure semantics

Native JavaScript lexical closures are relied on, and proven sufficient, only where FlutterBridge's own
generated structure already preserves the same binding topology Dart has: a callback's own top-level
local declaration and every read/write reached from its own flat statement list (including through a
`setState` splice) share one real, generated `let`/`const` — the Dart binding graph and the generated TS
binding graph are the same graph. For the refused shape, the two graphs are **not** the same (Dart has
one binding, spanning `build()` and every callback that closes over it; the naive generated code would
have had zero — a literal in its place) — which is exactly why it is refused rather than emitted.

## 15. Architecture decision

**Outcome A1** — a small, existing-layer fix. Refusing Case D uses information `_target` already had
(`scope`, already threaded through every call site) and an existing mechanism (`Codes`/`out.report`,
`out.opaqueExpr`) already established for exactly this kind of "no faithful representation" refusal
(mirroring `_target`'s own pre-existing "index write" refusal in the same function). No new UIR field, no
new UIR node, no runtime change, no generalized closure machinery. Supporting Case D for real would be
**Outcome A3 territory** (a persistent, boxed/cell-based binding representation) — not attempted, and not
independently justified, since §11 shows the shape needing it is not one real Dart/Flutter semantics can
make meaningful.

## 16. Supported subset

A mutable local declared and mutated entirely within one callback's own extraction unit (including
through a `setState` splice) resolves correctly — unchanged from before this milestone, confirmed, not
newly built. A mutable `build()`-level local may be read (never written) from any nested callback.

## 17. Refused subset

A write (assignment, compound assignment, increment, decrement) to a `build()`-level local, from
anywhere — a nested callback, a further-nested `setState` closure, regardless of depth — refuses
honestly, `BRG1311`, naming the identifier, rather than silently substituting the local's own inlined
initializer as an invalid write target.

## 18. UIR/schema impact

None. `BRG1311` is a Dart-side extraction diagnostic (`BRG13xx` range, matching `unsupportedSyntax`'s own
established category); the refused shape produces no UIR document at all (matching ADR-0031's own
established "any error-severity diagnostic blocks the whole graph" behavior) — there is nothing to
serialize, and nothing about the schema changed.

## 19. Extraction changes

`expression_extractor.dart`'s `_target` (the write-target extractor, shared by `_assignment` and
`_incrementDecrement`) now checks `scope.lookup(node.name)?.inlineValue` before delegating to
`_reference`, refusing with the new `Codes.writeToInlinedLocal` (`BRG1311`) when it is non-null.

## 20. Normalization changes

None.

## 21. Reachability changes

None.

## 22. Generator changes

None. This milestone's own fix is entirely upstream of the generator — the refused shape never produces
a UIR document for any generator-layer code to see.

## 23. Runtime changes

None.

## 24. Identity/provenance strategy

Unchanged. This milestone does not mint any new identity; it *refuses* a write that would have to invent
one.

## 25. Scope semantics

`Scope.lookup`'s own innermost-first resolution (unchanged) is exactly what makes the shadowing case
(R7) safe: an inner, real local's own `Binding` (no `inlineValue`) is found before any outer,
`inlineValue`-eligible one of the same name.

## 26. Shadowing/parameter semantics

Both live-probed and Dart-test-proven safe: an inner local shadowing an outer, read-only `build()`-level
local of the identical name may be freely mutated (§10 R7); a callback parameter of the identical name
would shadow the same way, by the identical mechanism (safe by construction, R8).

## 27. Cross-widget behavior

Not applicable — a `build()`-level local's own scope never crosses a component boundary.

## 28. Cross-file behavior

Not applicable, for the identical reason; unaffected by ADR-0047's own cross-file composition.

## 29. Silent-wrong-code audit

- **Wrong declaration** — not applicable; no new identity minted.
- **Wrong scope** — tested: R7 (shadowing).
- **Sibling collision** — tested: R10 (two locals, two independent refusals; two locals, two independent
  correct mutations, positive case).
- **Shadowing collision** — tested: R7.
- **Accidental capture** — not applicable; no new capture mechanism.
- **Lost capture** — not applicable; Case A/C's own existing capture is unchanged.
- **Free identifier** — this milestone's own central finding (§9), now refused rather than silent.
- **Parameter/local collision** — safe by construction (R8), matching R7's own mechanism.
- **Member/local collision** — not applicable; unrelated to this capability.
- **Duplicate generated binding** — not applicable; no new binding representation introduced.
- **Incorrect reachability** — unaffected, confirmed (§21); R16 confirms the existing "extract everything,
  regardless of reachability" policy correctly makes an unreachable Case D write still block the program.
- **Incorrect module emission** — tested: real `tsc --strict` accepts every emitted file in the positive
  fixture.
- **Evaluation-order change** — safe by construction: no statement reordering; the refusal happens before
  any node is constructed for the unsafe write.
- **Cross-widget contamination** — not applicable (§27).
- **Wrong binding lifetime** — the exact finding this milestone investigated (§11); resolved by refusing
  the one shape whose lifetime this architecture cannot represent, rather than misrepresenting it.
- **Wrong shared-state behavior** — tested: R10's own positive case proves two writers in one callback
  share one real binding; the refused shape is never allowed to reach a (wrong) shared-state
  representation at all.
- **Mutation applied to wrong closure** — tested: R7 proves a write resolves to the correct (inner, real)
  declaration, never the outer, inlined one.
- **State accidentally globalized** — safe by construction: nothing about this fix touches module-scope
  emission; ADR-15's own "no module-scope mutable state" invariant is unaffected.
- **State accidentally duplicated** — not applicable; no new state representation introduced.
- **Nondeterministic binding identity** — tested: `bridge validate` (deterministic=true) on the fixture; a
  same-source/same-bytes Dart determinism test in the new extraction test group.

## 30. Mutation results

Eight mutations, per §17 of the brief — mutate, confirm failure, revert, confirm clean:

1. Remove the `inlineValue != null` check entirely (unconditional delegation) — **caught**, 4 of 8 Dart
   tests fail.
2. Invert to refuse unconditionally (`if (true)`) — **caught** decisively, 3 of 8 fail, including both
   positive-shape tests (proving the guard does not over-refuse legitimate writes, e.g. to `_result`, a
   real field).
3. Check the wrong binding field (`symbol` instead of `inlineValue`) — **caught**, 7 of 8 fail.
4. Downgrade the new diagnostic's severity to `warning` — **caught**, 4 of 8 fail (the refusal no longer
   appears in `app.errors`), proving `error` severity is load-bearing for the extraction-wide "any error
   blocks the whole graph" guarantee (ADR-0031).
5. Hardcode the scope lookup to a nonexistent name — **caught**, 4 of 8 fail.
6. Report the diagnostic but return the dangerous `_reference` result instead of an opaque node — **not
   caught by node-shape assertions**, but **proven safe-by-construction**: the existing
   `expect(app.ofKind('ui.Component'), isEmpty)` assertions (already present in every negative test)
   still passed, because ADR-0031's own independent, already-tested "any error-severity diagnostic blocks
   the whole document" gate means the dangerous node, even if constructed, would never reach any output
   regardless of its own shape. Documented explicitly rather than silently dismissed, per this milestone's
   own audit discipline.
7. Break scope-threading specifically for increment/decrement (pass `Scope.root()`) — **caught**, 4 of 8
   fail.
8. Remove the identifier name from the diagnostic message — **caught**, message-content assertion fails.

Every mutation caught by an existing test, or explicitly proven safe-by-construction with a written
explanation; none dismissed without being exercised; none manufactured for a pass count.

## 31. Fixture path

`fixtures/apps/mutable_capture/` — positive only. The refused shape produces no UIR document (ADR-0031's
own established behavior), so there is no fixture-level negative case to capture; the refusal is proven
at the Dart extraction-test layer instead (`mutable local capture across a callback boundary (M11-G)`),
matching the identical precedent ADR-0031/M9-H itself established for a pre-extraction safety gate.

## 32. Test additions

8 Dart extraction tests (4 confirming the already-safe shapes stay safe, 4 confirming the newly-refused
shape refuses correctly and independently) + 7 TypeScript build-proof tests (real analyzer → real
normalize → real generator → real `tsc --strict`) for the positive fixture.

## 33. Dart test result

`dart test` — 601/601 pass (593 baseline + 8 new), run clean after all mutation reverts.

## 34. TypeScript test result

`pnpm --filter @bridge/gen-react exec vitest run` — 589/589 pass (582 baseline + 7 new, 65 files), run
clean after all mutation reverts.

## 35. `just ci`

Exit 0. Full log scanned for error/failure markers — zero found.

## 36. `just determinism`

Exit 0, byte-identical across every run.

## 37. `bridge validate`

The positive fixture: `deterministic: true`, `fixed point: true`.

## 38. `tsc --strict` + `git diff --check`

Real `tsc.js` (not the shim), against the real runtime kit's own types, via the build test's own
`typecheckEmitted` — passes for the positive fixture's full emitted output. `git diff --check` clean.

## 39. Continuum audit + remaining blockers + M11-H recommendation

Zero Continuum references anywhere in the diff — grep-verified across every changed and new file. No new
architectural blockers were introduced. Two items remain explicitly open from prior milestones, neither
touched here: `rsc-split` (M11-F §6.1 — a real architectural boundary, not a bounded next step) and a
persistent, cross-render mutable-state representation for a `build()`-level local (this milestone's own
§11 finding: not independently justified, since idiomatic Flutter already has a correct answer —
`State`-class fields — for the one case that would need it). Neither is recommended for M11-H; the next
milestone must be derived from fresh evidence, not either of these.

## 40. Final outcome

Outcome A1: a small, existing-layer refusal, closing a real, *directly observed* (live-probed against
the real TypeScript compiler, confirmed genuinely invalid: `TS2300`/`SyntaxError`), previously-silent
defect. Case A (mutable local, no capture) and Case C (mutable capture, read-only) are *analyzer-proven*
and *test-proven* already safe, unchanged, not newly built. Case D (mutable capture, written) is now
*test-proven* refused, with one mutation (#6) *proven safe-by-construction* via an independent,
already-established mechanism rather than dismissed. No runtime machinery, no generalized closure
compilation, no persistent binding representation was built — matching this milestone's own hard
constraint not to collapse declaration identity, lexical capture, mutable-binding semantics, and shared
runtime state into one feature. Committed as a single milestone; pushed to `origin/main`; `HEAD ==
origin/main` verified.
