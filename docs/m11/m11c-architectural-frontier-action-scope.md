# M11-C — Architectural Frontier Investigation & Store/Action Scope Primitive

## 1. Baseline

Started from `5bd8412` (`origin/main` == `HEAD`), the M11-B async-method-await commit. `git status
--short` showed only the pre-existing, deliberately-untouched `fixtures/apps/hello_bridge/
analysis_options.yaml` drift. M9, M10-A through M10-F, M11-A, and M11-B are all closed.

## 2. M11-B capability baseline

M11-B's own closing doc (§16) reported a real, pre-existing, unrelated bug: a local variable declared
inside a `sig.Action` (store action) body and read by a later statement in the same body fails with
`BRG3006` — root-caused to `store.ts`'s own `actionScope` helper overriding only `paramInScope`, never
`localName`. It also noted a structurally similar symptom for a `StatefulWidget`'s own inline `onPressed:
() async {...}` handler with a nested `setState(() {...})` closure, whose own precise root cause was
**not** isolated within that milestone's scope. This milestone does not trust that summary — it re-derives
both findings from fresh evidence (§5–§7), and finds they are **two different bugs with two different root
causes**, not one.

## 3. Reported `actionScope` lead — reconstructed, not assumed

Reproduced the exact minimal case M11-B's own doc named (`final r = 5; result = r; notifyListeners();`
inside a store action), fresh, against current `HEAD`, via a real analyzer probe (never re-using M11-B's
own saved output). Confirmed identical to the report: `BRG3006` ("not declared in this program"),
unrelated to `async`/`await` — reproduced with zero async involvement.

## 4. Fresh analyzer evidence

Traced live, via `dart run bin/bridge_analyzer.dart` against a scratch probe and `bridge validate` against
the real generator, at every reduction-ladder rung (§6):

- **Store-action locals (R2/R3/R4/R7/R8/R10)**: the extraction layer already resolves a real `target` for
  every local read, matching its own declaration's id EXACTLY — confirmed for a simple local (R2/R3), a
  nested block `{ ... }` (R4, both `outer` and `inner` independently correct), a local shadowing a
  field-backed signal's own name (R7, the shadowing read resolves to the LOCAL, never the signal), two
  sibling actions declaring a same-named local (R8, two DISTINCT declaration ids, no collision), and a
  mutable/reassigned local (R10, target correctly follows the reassignment too). This target survives
  normalization unchanged (confirmed via `compiledFrom`, the real `bridge normalize` CLI step, not a
  hand-inspected assumption).
- **Root cause, traced to source**: `_localSymbol` (`dart/bridge_analyzer/lib/src/session/extract/
  statement_extractor.dart`) requires `scope.ordinalOf(element) != null` — and `scope.dart`'s own doc
  comment states explicitly: `Scope.forBody` runs its own ordinal pre-pass "once, up front... **nested
  closures reached from this body reuse the SAME map... a closure does not start its own local numbering,
  because it is not its own declaration-tier owner.**" A store action's own body — extracted via
  `Scope.forBody` (mirroring `_methods`'s own instance-method extraction) — therefore gives every local
  declared anywhere within it, including inside a nested lambda, a real declaration-tier symbol. The GAP is
  entirely on the GENERATOR side: `store.ts`'s own `actionScope` never consulted it.
- **Render-tree-embedded callback locals (R5)** — a DIFFERENT construct, `onPressed: () { final value = 5;
  setState(() { _result = value; }); }` — found, via the SAME fresh probe, to fail at the EXTRACTION layer
  itself: the captured local's own read carries **no `target` at all**. Traced to source: a component's
  own render tree is extracted via `Scope.forWidgetTree` (`component_extractor.dart:165`), a **separate**
  ordinal pair (`_widgetOwner`/`_widgetOrdinals`) `_localSymbol` never consults — only `owner`/`ordinalOf`
  (the `Scope.forBody` pair) is ever read by `_localSymbol`. `scope.dart`'s own doc comment for
  `Scope.forWidgetTree` states this EXPLICITLY, already, as a KNOWN, NAMED, UNFIXED gap: *"giving an
  ordinary local... declared inside an inline callback found within this same render tree a
  declaration-tier identity it does not have today. That would be a real, separately-evidenced fix this
  milestone did not investigate or validate."* This is not a discovery M11-C is making for the first
  time — it is a pre-existing, explicitly-documented boundary this milestone is the first to actually
  connect to the M11-B symptom report.
- **Identity-collision proof**: two DIFFERENT `StatefulWidget`s, each declaring a structurally identical
  local (`final value = 5;`) inside their own nested `onPressed`/`setState` closures, were confirmed —
  via a real `compiledFrom` normalization run — to canonicalize to the **exact same final `NodeId`**, for
  BOTH the declaration and the read, despite different source files/lines. This is a real, severe
  consequence of the missing declaration-tier symbol (content-addressing is the correct, documented
  fallback for a symbol-less node — ADR-28/M9-I precedent — but it was never designed to be reached for a
  render-tree-embedded local, since no fixture had ever exercised the shape until this investigation).

## 5. Reduction ladder

| Rung | Construct | Extraction | Generation (before fix) | Generation (after fix) |
|---|---|---|---|---|
| R1 | Local in an ordinary instance method | correct (pre-existing, exhaustively covered) | correct | correct |
| R2/R3 | Local in a store action, read later | correct (fresh probe) | `BRG3006` | correct |
| R4 | Nested block `{}` in a store action | correct (fresh probe) | `BRG3006` | correct |
| R5 | Local in an inline render-tree callback, captured by a nested closure | **no `target` at all** | `BRG3006` | **unchanged — Outcome B** |
| R7 | Local shadowing a field-backed signal, in a store action | correct (fresh probe) | `BRG3006` | correct |
| R8 | Sibling actions, same-named local | correct, distinct ids (fresh probe) | `BRG3006` | correct, no collision |
| R10 | Mutable (reassigned) local, in a store action | correct (fresh probe) | `BRG3006` | correct |

R6 (the real store/action reproduction) is R2/R3 itself — the smallest real fixture already exercises the
originally-reported shape. R9 (cross-helper/local interaction) does not apply — this bug never involved
helper composition. Given R4's own nested-block case was already proven correctly targeted at extraction,
Dart's own block-level lexical scoping needed no separate investigation or support decision — it already
"just works" once locals resolve at all, since a block's own statements are already extracted through the
same, unmodified `statementsOf` walk.

## 6. Semantic classification

Two DIFFERENT classes for two DIFFERENT constructs:

- **Store-action locals (R2/R3/R4/R7/R8/R10): Category G — generator-only scoping bug.** The UIR is
  already semantically sufficient (a real, correct, declaration-tier-identity-backed `target` exists for
  every read); `store.ts`'s own `actionScope` simply never consulted it. No new UIR representation, no
  extraction change, no normalization change — a pure, behavior-preserving generator correction.
- **Render-tree-embedded callback locals (R5): Category F — declaration identity/provenance is lost.**
  The construct is genuinely valid Dart, correctly extracted in every OTHER respect (the surrounding
  render tree, the callback's own parameters, its own body's statements) — but the LOCAL's own declaration
  never receives a declaration-tier symbol at all, because the scope it is extracted under
  (`Scope.forWidgetTree`) was deliberately never wired into the SAME ordinal scheme `Scope.forBody` uses.
  This is a real, if narrow, extraction-layer gap — not a generator bug, and not something `store.ts`'s own
  fix touches or could touch.

## 7. Silent-wrong-code audit

Per the governing brief's own explicit list, checked against BOTH constructs:

- **A. Wrong local declaration selected**: not observed anywhere — every reference resolves by real
  declaration-tier `NodeId`, never by name (confirmed live for R7's own shadowing case, both before and
  after the fix).
- **B. Local escapes its lexical scope**: not observed — `locals` is computed fresh, per-action, at the
  call site; nothing shares it across actions (proven directly, mutation 4, §9).
- **C. Sibling action locals collide**: **confirmed as a REAL, SEVERE finding for R5** (§4's own
  identity-collision proof) — two unrelated widgets' own locals canonicalize to the identical `NodeId`.
  NOT observed for the store-action case (R8 proves two sibling actions' own same-named locals resolve to
  two distinct ids, both before and after the fix — extraction, not generation, is what keeps them
  distinct, and extraction was already correct there).
- **D/E. Nested/outer local resolves to the wrong declaration**: not observed — R4's own nested-block case
  proves both `outer` and `inner` resolve independently and correctly.
- **F. Captured local becomes undefined**: this IS what R5 reproduces (§4) — the render-tree-callback case,
  deliberately left unfixed (Outcome B, §12).
- **G. `actionScope` resolves to an unrelated store variable**: investigated directly and ruled out —
  `locals`' own `NodeId` keys are declaration-tier-unique by construction (ADR-28), so they can never
  collide with a signal/derived/action id from the SAME store (confirmed: mutation 3, §9, which reverses
  lookup PRIORITY, survives harmlessly precisely because no such collision is possible).
- **H. Generator emits a free identifier**: investigated directly via mutation 6 (§9) — a silent fallback
  to a fabricated identifier, if it existed, would be caught (proven: it broke a DIFFERENT, pre-existing
  fixture's own exact-string test, not just this milestone's own).
- **I. Generator silently substitutes a store/action variable**: not observed; see G.
- **J. Parameter/local collision**: `actionScope`'s own `paramInScope`/`localName` are two INDEPENDENT
  maps, checked via two independent scope methods (`_reference`'s own resolution order tries
  `paramInScope`-driven paths and `localName`-driven paths separately, never conflating the two) — no
  collision possible by construction.
- **K. Local/member-name collision**: this is R7, directly proven correct.
- **L. Local shadowing is lost**: this is R7, directly proven NOT lost.
- **M. Cross-file helper captures wrong scope**: not applicable — this fix touches no cross-file
  mechanism at all; `locals` is entirely local to one action's own body, in one file.
- **N. Unreachable local declaration becomes emitted state**: not applicable — `localBindingsIn` only ever
  discovers locals that are ALREADY part of a reachable action's own body; it introduces no new
  reachability discovery of its own.
- **O. Mutable local accidentally becomes immutable generated state**: investigated directly (R10) — a
  reassigned local correctly emits `let`, not `const` (pre-existing, unmodified statement-emission logic —
  `logic.VarDecl.isFinal` already drove this correctly; this fix never touches it).
- **P. A missing scope mapping is replaced with `any`/`unknown`**: confirmed absent — zero `any`/`unknown`
  anywhere in the diff (direct grep, §22).

## 8. UIR analysis

Sufficient for the store-action case (Category G) — no change needed or made. Insufficient for the
render-tree-callback case (Category F) — but the missing piece is not a UIR REPRESENTATION gap (the
`logic.VarDecl`/`logic.Ref` node kinds already carry everything needed structurally); it is a missing
EXTRACTION-SIDE identity-assignment step (`Scope.forWidgetTree`'s own ordinals never feed `_localSymbol`).
No new UIR node kind or field is proposed or needed even for the Category F fix, whenever it is
undertaken — the fix, WHEN it happens, belongs entirely in `scope.dart`/`statement_extractor.dart`.

## 9. Extraction analysis

Unchanged. Confirmed correct for every store-action rung (R2/R3/R4/R7/R8/R10), fresh, live. Confirmed
INSUFFICIENT for the render-tree-callback rung (R5) — but this milestone does not touch extraction at all,
for either finding: the store-action fix needs none (Category G); the render-tree-callback fix would need
a genuine architectural decision (§12) this milestone's own evidence does not yet fully specify (does
`Scope.forWidgetTree`'s own ordinal numbering extend to feed `_localSymbol` directly, or does an inline
render-tree callback need its own `Scope.forBody`-style wrapping? Both are plausible; neither was
evaluated in enough depth here to select one, deliberately, per Outcome B's own discipline, §12).

## 10. Normalization analysis

Unaffected. Confirmed directly: every store-action local's own `target` is identical before and after
`compiledFrom`'s own real `bridge normalize` step. No normalization pass was touched or needed touching.

## 11. Reachability analysis

Unaffected. `localBindingsIn` introduces no new reachability discovery — it only inspects the body of an
ALREADY-reachable action (the existing `sig.Action` reachability mechanism, unmodified). An unreachable
sibling action (none constructed for this fixture — every declared action is wired to a button) was not a
separate concern this fix could regress, since nothing about WHICH actions are reachable changed.

## 12. Selected architectural outcome

**Two-part outcome, per construct:**

- **Store-action locals: Outcome A1 — generator/scoping bug, no new semantic primitive required.**
  Implemented (§13).
- **Render-tree-embedded callback locals: Outcome B — investigation/docs-only.** NOT implemented. The
  missing declaration-tier identity is a real, evidenced gap (§4/§6), but selecting and validating its own
  fix (extending `Scope.forWidgetTree`'s own ordinal scheme into `_localSymbol`, or giving inline render-
  tree callbacks their own `Scope.forBody`-style wrapping) is a genuine architectural decision this
  milestone's own evidence does not yet fully specify between the two plausible shapes, and — per the
  governing brief's own explicit instruction (§16, "Do not silently implement closure capture as part of
  an `actionScope` fix") — implementing it here would conflate two genuinely different root causes under
  one milestone. Recommended as the concrete lead for a future, dedicated investigation (§21).

## 13. Implementation — what changed (store-action fix only)

`packages/generators/react/src/internal/emit/store.ts`:

- The action-emission loop now computes `const locals = localBindingsIn(node['body']);` — the identical,
  unmodified `localBindingsIn` function `functions.ts`'s own member-helper loop and `expression.ts`'s own
  inline-`logic.Lambda` case already use, reused verbatim, never re-derived.
- `actionScope` gains a third parameter, `locals: ReadonlyMap<NodeId, string>` (defaulting to an empty
  map), and its own returned `EmitScope` gains `localName: (id) => locals.get(id) ?? parent.localName(id)`
  — mirroring `component.ts`'s own sibling `actionScope` function EXACTLY (the identical pattern, already
  proven correct there for a component's own named/referenced action methods).

No change to `dart/bridge_analyzer` at all. No UIR schema change. No new `EmitScope` field beyond what
`component.ts`'s own `actionScope` already established as a precedent.

## 14. Runtime analysis

None. The generated output is a plain, unremarkable `const`/`let` declaration inside an existing `action(()
=> {...})` arrow function body — no new runtime abstraction, no new kit export, nothing.

## 15. Identity/provenance strategy

Unchanged from the established, pre-existing scheme (ADR-28): a local's own identity is its resolved
analyzer `Element`, numbered by `Scope.forBody`'s own ordinal pre-pass into a stable declaration-tier
`NodeId`/symbol. `store.ts`'s own fix consumes this identity exactly as it already existed — it does not
invent, extend, or reinterpret it. `locals.get(id)` is looked up by this real `NodeId`, never by name;
`localBindingsIn` itself never inspects a name for identity purposes, only for the EMITTED IDENTIFIER TEXT
(cosmetic, via `identifierOf`), confirmed by reading its own source directly.

## 16. Scope-resolution semantics

`actionScope`'s own `localName` checks `locals` (this action's own body) BEFORE falling through to
`parent.localName` (the enclosing store scope) — mirroring `component.ts`'s own identical ordering
rationale ("what this action itself declared" before "what an outer render tree named"). Proven, not
merely asserted, to be SAFE regardless of order (mutation 3, §9): the two id spaces cannot overlap, by
construction, so the order is a style choice, not a correctness requirement — documented honestly rather
than claimed as load-bearing without evidence.

## 17. Store/action semantics

Every store action retains its own, fully-isolated local scope — proven directly (R8, mutation 4): two
sibling actions on the same store, each declaring a same-named local, never collide, either before this
fix (both refused) or after (both resolve correctly and independently).

## 18. Closure behavior

Explicitly, deliberately NOT touched by this milestone (per the governing brief's own §16). A callback
existing (e.g., an action's own body, or a component's own inline `onPressed:`) is NOT the same claim as a
callback correctly capturing an OUTER local's own lexical state — the store-action case never actually
needed genuine "capture" at all (a store action's own locals are declared WITHIN the SAME body they are
read in, no nesting across a closure boundary in the cases this fix addresses); the render-tree-callback
case (R5) DOES involve genuine cross-closure capture, and its own gap remains fully open, Outcome B (§12).

## 19. Mutability behavior

Investigated directly (§15 of the governing brief, R10): a mutable (`var`, later reassigned) local hits
the IDENTICAL extraction-side target-resolution mechanism a `final` local does — confirmed via a live
probe showing `target` correctly following the reassignment. NOT a separate primitive; the SAME fix
(`localBindingsIn` + `localName` wiring) covers both uniformly, with zero special-casing for mutability
anywhere in the change.

## 20. Cross-file behavior

Not applicable — this fix operates entirely within one action's own body, in one file; `locals` is never
shared or compared across files. No cross-file identity question was found or needed investigating.

## 21. Mutation results — mutate, confirm failure, revert, confirm clean

Six cycles, one of which survived and was proven SAFE BY CONSTRUCTION rather than manufacturing a test:

1. **Bypassed local resolution** (`localName` never consults `locals`) — caught: 7/8 tests failed.
2. **Populated `locals` from the wrong source** (`node['params']` instead of `node['body']`) — caught:
   7/8 tests failed, clean compile.
3. **Reversed lookup priority** (`parent.localName(id) ?? locals.get(id)`) — **survived**: the full
   546-test suite passed unchanged. Investigated and confirmed SAFE BY CONSTRUCTION: `locals`' own
   `NodeId` keys are declaration-tier-unique (ADR-28) and can never collide with any id `parent.localName`
   might independently resolve, so the two `??` operands can never both be non-`undefined` for the same
   key — order is provably irrelevant. Documented honestly, per the governing brief's own explicit
   instruction not to manufacture artificial coverage.
4. **Merged sibling scopes** (reused the first action's own `locals` for every subsequent action) —
   caught: 7/8 tests failed (the shared-map reuse broke generation entirely for the `runMutable` case,
   whose own local collided with an already-declared name from a different action).
5. **Bypassed the wiring at the call site** (`actionScope(inner, params)`, omitting `locals` — falling
   back to the function's own default empty map) — caught: 7/8 tests failed.
6. **Silently allowed a free identifier** (`localName` never returns `undefined`, falling back to a
   fabricated `'unresolved_local'` string instead) — caught, but NOT by this milestone's own fixture: it
   broke `async_method_await_build.test.ts` (M11-B's own, unrelated fixture) — real, independent proof
   that silently substituting a fabricated identifier for a genuinely-unresolved reference produces
   visibly wrong output elsewhere in the system, not merely a hypothetical risk.

Every mutation was reverted immediately after evaluation; `git diff --stat` on `store.ts` returned to its
exact pre-mutation size (30 insertions / 6 deletions) after every cycle.

## 22. Validation results

`dart test` (full suite): 572 tests, all passed — unaffected, since no Dart code was touched.
`pnpm exec vitest run` (full `packages/generators/react` suite): 546/546 passed across 58 files (538
pre-existing + 8 new), both before and after every mutation revert. `git diff --check`: clean. `bridge
validate` on the new fixture: `deterministic = true`, `fixed point = true`. Real `tsc --strict`: passes,
confirmed via the fixture's own vitest test using the real, unmocked `@bridge/runtime-react` workspace
package. Zero `any`/`unknown` introduced (direct grep). Zero Continuum references outside this document's
own explicit "none exist" statement.

## 23. Fixture path

`fixtures/apps/action_scope/` — a single store (`ActionScopeStore`) with one action per reduction-ladder
rung this milestone actually fixes (R1–R4, R7, R8, R10), wired to a real `StatefulWidget` with one button
per action, each reading/displaying the resulting signal. No Continuum content. The render-tree-callback
case (R5) is deliberately NOT included as a positive case here (it remains refused, unchanged, Outcome B)
— it lives only in this milestone's own investigation probes (not committed, per the established
scratch-probe discipline every prior M9–M11 milestone already follows).

## 24. Test additions

`packages/generators/react/tests/action_scope_build.test.ts` (new, 8 tests): BRG1310 absence, zero-error
generation, real `tsc --strict`, and one exact-string test per reduction-ladder rung this milestone fixes.
`packages/generators/react/tests/support.ts` (+1 helper): `actionScopeRaw()`. No Dart-level test additions
— this milestone touches no Dart code.

## 25. Remaining architectural frontier

The render-tree-embedded callback local-identity gap (R5, §4/§6/§12) — a real, evidenced, PRE-EXISTING
(not newly introduced) gap, now precisely diagnosed for the first time (traced to `Scope.forWidgetTree`
never feeding `_localSymbol`'s own `owner`/`ordinalOf` pair), with a demonstrated, severe consequence
(cross-widget local-identity collision, §4's own proof). Two plausible fix shapes were identified but
NEITHER was evaluated deeply enough to select between them within this milestone's own scope: (a) extend
`Scope.forWidgetTree`'s own ordinal numbering to also populate the `owner`/`ordinalOf` pair
`_localSymbol` consults, or (b) give an inline render-tree callback with a block body its own
`Scope.forBody`-style wrapping, distinct from the render tree's own widget-ordinal scheme. Either would
require its own fresh reduction ladder and its own real analyzer evidence before an implementation gate,
matching the identical discipline this milestone itself followed for the (successfully resolved)
store-action case.

## 26. Recommendation for M11-D

**No predefined next capability is assumed.** The render-tree-embedded callback local-identity gap (§25)
is the one concrete, evidence-backed candidate this milestone's own investigation surfaced — a real
architectural frontier, not a speculative one, with a demonstrated identity-collision consequence — but
selecting it as M11-D's own mission, versus some other, freshly-investigated frontier, is a decision for
that milestone's own fresh evidence-gathering process, not this one's to make.
