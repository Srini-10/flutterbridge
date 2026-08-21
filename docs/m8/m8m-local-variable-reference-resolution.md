# M8-M — Generator local-variable reference resolution

**Date:** 2026-08-21. **Baseline:** `1baeee0` (== `origin/main`, clean tree, confirmed before any
change). **Type:** identity audit, docs-only. The investigation located and **proved** the exact
identity-loss point with concrete, falsifiable evidence — a real, reproducible node-id collision
between two lexically distinct local variables — and found that fixing it is the same category of
architectural gap M8-G already identified for `ParamDecl` and already ruled requires an ADR amendment.
No production code was changed.

## Headline finding

M8-L's own finding was correct as far as it went — a local read (`logic.Ref{name:'value'}`) carries no
`target` — but this milestone's own measurement shows the true cause is **deeper than a missing field**.
A local variable's declaration (`logic.VarDecl`) only ever receives a **content-derived** id (ADR-17's
tree-node tier), and this milestone proves directly, with a real fixture through the real pipeline, that
content addressing is **structurally incapable** of disambiguating a local read: two textually-identical
declarations in two different, unrelated lexical scopes collapse to the *same* declaration id, and — more
decisively — the *reads* themselves collapse across the *entire program*, regardless of which scope or
even which function they occur in, because a `logic.Ref{name, type}` with no target carries nothing else
to distinguish one occurrence from another. Simply adding a `target` field pointing at "the declaration's
own id" would not be safe; the declaration's own id is exactly the thing proven to collide. This is not a
generator consumption gap (M8-L's working hypothesis) and not a simple missing-field gap — it is the same
structural hole M8-G already found and ADR-required for `ParamDecl`: a class of declaration that is
lexically real, genuinely referenced, but sits in **neither** of ADR-17's two tiers. Per the task's own
Phase 8 gate and rule 22, this milestone stops before implementing and documents the requirement instead.

## 1. M8-L handoff

M8-L (`docs/m8/m8l-top-level-function-generator-capability.md`, §10.7) found, while auditing
`logic.FunctionDecl`: *"A `logic.VarDecl` gets a real, content-derived `id`... But a later
`logic.Ref{name:'value'}` reading it back carries no `target` at all... this defect... would affect any
action body with the same shape identically."* It explicitly declined to investigate further, naming it
the top candidate for M8-M. M8-M's own job was to determine *why*, precisely, and whether it is fixable
without inventing architecture.

## 2. Fresh baseline

```
git fetch origin && git checkout main
git status --short        → (clean)
git rev-parse HEAD          → 1baeee0411f6b264777908d36531ee32984ba70f
git rev-parse origin/main   → 1baeee0411f6b264777908d36531ee32984ba70f
```
Contains `1baeee0` (M8-L's own commit). `pnpm --filter @bridge/gen-react test`: 222/222 (17 files).
`dart test` (bridge_analyzer): 306/306 (per M8-L's own last recorded run; unchanged, since nothing here
touches that package). `just ci`: green at the M8-L checkpoint (confirmed at the end of that milestone).

## 3. Minimal reproduction

Two fixtures were needed, not one — the task's own suggested `greet`/`FunctionDecl` shape stops at the
`BRG3013` capability refusal (M8-L, correctly, by design) before a local variable inside it is ever
reached by the generator. The **smallest UIR-reachable context that already survives to generation** is a
`sig.Action` body (M8-H already made an ordinary, write-something method's body fully walked and lowered;
this predates and is unrelated to M8-L's `FunctionDecl` work).

Built `fixtures/apps/local_var_probe/` (temporary; `flutter pub get`/`analyze` clean; deleted after
evidence extraction) — a `StatefulWidget` with four actions, each wired directly to an `onPressed` so the
render tree reaches every one of them (avoiding an unrelated, adjacent gap found and set aside below, §
"an incidental finding"):

```dart
void _twice() {                      void _mutate() {
  final int x = 7 * 3;                  var count = 0;
  _log = x + x;                         count = count + 1;
}                                       count++;
                                        _log = count;
void _shadow() {                     }
  final int x = 1;
  if (_log == 0) {                   void _blockShadow() {
    final int x = 1;                   final int value = 1;
    _log = x;                          {
  }                                      final int value = 1;
  _log = x;                             _log = value;
}                                      }
                                       _log = value;
                                     }
```

Real `bridge build` (analyze → normalize → generate): 0 analyzer errors, normalize passes (11 nodes),
generate refuses with **6 `BRG3006`s** — `value`×2, `x`×4 — every local read in the fixture, all reported
as *"not declared in this program"*, identical wording to M8-L's own `next`/`formatBytes` findings.

**An incidental finding, set aside, not investigated:** an earlier version of this fixture had the test
actions call a shared `_record(int value)` helper instead of writing `_log` directly. That version
additionally refused `_record` and `_bump` themselves with `BRG3006`, even though both are real,
targeted, write-something `sig.Action`s (M8-H's own case) — because `referencedActions` (`component.ts`)
only discovers actions the **render tree** references directly; an action called only from *inside another
action's body* is invisible to it. This is a third, separate, real diagnostic-misattribution gap (a
sibling of M8-L's `FunctionDecl` finding and this milestone's own local-variable finding), outside this
milestone's scope (it is about action-to-action calls, not locals) and outside its own exclusion list only
by omission — recorded here so it is not lost, not chased.

## 4. Reduction ladder

All rungs the current grammar admits were reached in one fixture (§3) plus targeted checks below; rungs
the analyzer itself refuses are noted as such, not claimed.

| Rung | Shape | Analyzer | Declaration id | Reference target | Generator | tsc reached |
|---|---|---|---|---|---|---|
| A/B | `final x = <lit>`, primitive/string | clean | content-derived, real | none | `BRG3006` | no |
| C | `final x = <param>` | clean (not separately fixtured — same mechanism as D, a `logic.Ref` initializer) | — | — | — | — |
| D | `final x = compute()` | clean | content-derived, real | none | `BRG3006` | no |
| E | `final x = compute(); use(x); use(x);` | clean | content-derived, real; **the two reads share one node id** (§5) | none (both) | `BRG3006`×2 | no |
| F | `final x = await compute()` | not fixtured — `logic.Await` already lowers as an expression (M8-L §9); nothing about `await` changes how the *local* is bound, so this rung adds no new evidence over D | — | — | — | — |
| G/H | `var x = 1; x = 2;` / `x++;` | clean | content-derived, real | none | `BRG3006` | no |
| I | `final x = cond ? a : b;` | clean (not separately fixtured — `logic.Conditional` is an ordinary already-lowered expression; changes nothing about the *declaration's* identity) | — | — | — | — |
| J | `final x = v; if (c) use(x);` | clean (subsumed by K/L below, same declaration/read shape one nesting level different) | — | — | — | — |
| K | `if (c) { final x = 1; use(x); }` | clean | content-derived, real | none | `BRG3006` | no |
| **L** | `final x=1; if(c){ final x=1; use(x); } use(x);` | clean | **both declarations collapse to the SAME id** (§5 — decisive rung) | none (both reads) | `BRG3006`×2 | no |
| **M** | `final value=1; { final value=1; use(value); } use(value);` | clean | same collapse as L | none (both) | `BRG3006`×2 | no |
| N/O | `final x=1; final y=x; use(x); use(y);` | not separately fixtured; `y`'s initializer (`x`) is itself an untargeted local read, so this rung only compounds rung D's own gap, it does not add a new failure mode | — | — | — | — |
| P | `final x = someTopLevelConst;` | not fixtured here — a *different*, already-documented sibling gap (M8-L §10.11: a top-level `logic.FieldDecl` target also falls through to `BRG3006`); `x`'s own declaration identity is unaffected by what its initializer reads | — | — | — | — |
| Q | `final x = store.someSignal;` | not fixtured — the *initializer* (`store.someSignal`) already resolves correctly (M7-N, unaffected); `x` itself is an ordinary local, rung D | — | — | — | — |
| R | `final callback = someAction; use(callback);` | not fixtured — `someAction`'s own tear-off reference is the M8-L/incidental-finding territory (§3), a different construct from local identity | — | — | — | — |
| S | `final x = object.property; use(x);` | not fixtured — `object.property` is an ordinary, already-lowered `PropertyAccess`; `x` itself is rung D | — | — | — | — |
| T | `final x = functionCall(arg); return x;` | not fixtured — `return x` is rung D's read, in a `Return` rather than an `ExprStmt`; `statement.ts`'s `logic.Return` case is unconditional on what its value expression is | — | — | — | — |

Every rung this milestone could reach independently reduces to one of two already-decisive shapes: **D**
(an ordinary read has no target at all) and **L/M** (content-addressing collapses distinct declarations).
No rung the real analyzer accepts produces a different failure mode.

## 5. Declaration UIR shape

`logic.VarDecl` (`packages/uir/schema/l1.json`) — `name`, `type`, `isFinal`, `initializer?`, plus the
`UirNodeBase` fields (`id`, `span`). Confirmed live, from `_shadow`'s normalized document:

```json
{ "id": "c0726176f493551d", "kind": "logic.VarDecl", "name": "x", "isFinal": true,
  "initializer": { "id": "2af6694d3f9ac69b", "kind": "logic.Lit", "value": 1, ... }, ... }
```

**This exact id, `c0726176f493551d`, appears twice** in `_shadow`'s own body — once for the outer
declaration (line 40) and once for the inner, shadowing one (line 42) — because their content (name,
type, `isFinal`, and the *content id* of their initializer, `2af6694d3f9ac69b`, itself shared since both
initializers are the literal `1`) is byte-identical once `id`/`anchor`/`span` are stripped. **Two
semantically distinct declarations, in two different lexical scopes, are the same node.**

## 6. Reference UIR shape

A local read is `logic.Ref{name, type}` — **no `target` field is ever present.** Confirmed live, same
fixture, the inner-scope read of the inner `x`:

```json
{ "id": "9295565a71aadd9d", "kind": "logic.Ref", "name": "x", "type": { "library": "dart:core", "name": "int" } }
```

**This exact id, `9295565a71aadd9d`, is the read node for every occurrence of a bare `int`-typed `x`
read anywhere in the whole document** — confirmed directly: it is shared between the inner-scope read
inside `_shadow`'s `if` block, the outer-scope read after it, *and* both operands of the unrelated
`x + x` expression inside a completely different action, `_twice`. A read carries only `{kind, name,
type}` once id/anchor/span are stripped — nothing distinguishes *which* declaration, in *which* scope, a
given occurrence lexically binds to.

## 7. Identity-loss point

Traced precisely, not inferred from the diagnostic:

- `dart/bridge_analyzer/lib/src/session/extract/statement_extractor.dart` creates a `Binding(name: ...,
  binds: Binds.local)` for every local (ordinary declarations at the site that lowers
  `VariableDeclarationStatement`, plus `for`-loop variables and `catch` clause parameters) — **never**
  passing a `symbol:` argument, at any of its four call sites.
- `dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`'s `_reference` computes
  `target = staticTarget ?? binding?.symbol`; for an ordinary local, both are `null`, so the emitted
  `logic.Ref` has no `target` at all — this is the literal, single line where identity is lost, and it is
  a **deliberate**, documented choice, not an oversight:
  > `scope.dart:61-64` — *"The symbol it resolves to, when it is something another record can refer to.
  > A local has none: nothing outside its function can refer to it, so it needs no identity."*
  > `expression_extractor.dart` (inline comment at the `target` computation) — *"A `target` is a promise
  > that something declares this symbol. A local has none — nothing outside its function can refer to
  > it, and inventing one would be a promise we could not keep, which the builder would then report as
  > `BRG1201`."*
- `dart/bridge_analyzer/lib/src/session/extract/symbol_table.dart`'s `Symbols` class has **no** method
  for a local variable — every declaration kind that owns a symbol (`type`, `function`, `variable`,
  `component`, `signal`, `derived`, `action`, `effect`, `store`, `route`, `navigation`, plus the `*In`
  cross-file family) is present; a local's is simply absent from the vocabulary.
- Node-id computation, `dart/bridge_analyzer/lib/src/builder/node_factory.dart:87-96` and
  `packages/uir/src/generated/uir.ts:253-269`: `raw.symbol == null` routes any node to
  `nodeIdOfContent`/`context.allocator.forContent` — the content-tier path — which is exactly the path
  `logic.VarDecl` takes, since no `symbol:` is ever passed to its own `RawNode(...)` construction
  (`statement_extractor.dart`'s `_variable`).

**The comment's stated premise — "a local has none [an identity], nothing outside its function can refer
to it" — is true and irrelevant.** It correctly rules out a *cross-file, globally-nameable* symbol; it
does not address the narrower, real requirement this milestone measured: a **same-body**, later
occurrence needs to resolve to the **specific** declaration lexically in scope at that point, and
content-addressing — the only other tier ADR-17 offers — is proven (§5, §6) unable to do that once two
declarations or two reads happen to share the same textual content, which is not a rare or contrived
case (it is the exact shape of ordinary code with more than one loop iteration's worth of similar logic,
or the textbook shadowing idiom itself).

## 8. Schema analysis

`bind.Expr`/`logic.Ref.target` (`packages/uir/schema/l1.json`) already exists and already carries exactly
this semantic for every other declaration kind that has one — no schema *field* is missing. What is
missing is upstream of the schema: nothing in the analyzer's extraction vocabulary (`Symbols`) can *mint*
an identity for `logic.VarDecl` to declare itself under. **No schema amendment is required** to carry the
relationship, once one exists to carry.

## 9. ADR-17 analysis

ADR-17 ISSUE-6 (`docs/adr/0017-architectural-rulings-at-the-m1-t8-gate.md`) states the two-tier model
abstractly — declarations get symbol-derived ids (justified by cross-file incremental-rebuild stability);
tree nodes get content-derived ids (justified by "two identical subtrees are one node") — and does not
mention local variables, or `ParamDecl`, by name. **`logic.VarDecl` currently receives a content-derived
id**, which is the *tree-node* tier — technically a real choice within the existing model, but one this
milestone's own rung L/M evidence (§5, §6) proves is **unsound for a mutable, lexically-scoped binding**:
content addressing deliberately collapses "identical" nodes, which is correct and harmless for pure
values (`logic.Lit{value:1}` appearing twice really is one value) and actively wrong for a *binding*,
where two lexically distinct declarations must never be treated as the same one merely because they
happen to look alike. This is **not** a new discovery unique to locals — `docs/m8/m8g-multi-hop-provenance-decision.md`
already found the identical structural gap for `ParamDecl`:

> `m8g-multi-hop-provenance-decision.md:182-186` — *"`ParamDecl` currently sits in **neither tier** — it
> is a plain value with no identity at all."*
> `m8g-multi-hop-provenance-decision.md:380-385` (on why content-addressing cannot substitute) —
> *"both are stripped of everything but `{kind, name, type}` under content-addressing... so two unrelated
> declarations sharing a name genuinely produce the same id today."*

and that finding was explicitly ruled to require an ADR amendment:

> `m8g-multi-hop-provenance-decision.md:372-378` — *"**ADR REQUIRED: YES.** This amends ADR-17 ISSUE-6's
> own ratified two-tier identity table — `ParamDecl` moving from 'no tier' into the declaration tier is
> exactly the kind of 'proven contradiction in the spec' CLAUDE.md's own rule requires an ADR for...
> The ADR would not redesign the two-tier model — it would extend the table by one row, with the
> identical derivation rule every declaration in it already uses."*

`logic.VarDecl` is a second, independent instance of the exact same category: a real, lexically-scoped,
genuinely-referenced declaration that the current model puts in the *wrong* tier (content, when its
reference semantics need something the content tier cannot safely provide), rather than *no* tier — but
the underlying defect (content-addressing collides across distinct declarations sharing spelling/shape)
and the correct fix shape (a declaration-tier symbol, additive, following the identical derivation rule
every other declaration already uses) are the same. **ADR-17 COMPATIBILITY RESULT: giving `VarDecl` a
declaration-tier symbol does not redesign ADR-17's model — it is the same one-row table extension already
proposed for `ParamDecl` — but it is still, per M8-G's own already-established reasoning and this
project's own CLAUDE.md rule (an ADR requires "a proven contradiction in the spec," never a milestone's
unilateral preference), an ADR-level decision. Per Phase 8 gate condition 12 and rule 22: STOP before
implementing.**

## 10. Comparison with parameters

Structurally identical to locals in one respect and different in another: `ParamDecl`
(`packages/uir/schema/l1.json`) has **no `id` field at all** (it is a plain value on `FunctionDecl.params`/
`sig.Action`'s own parameter list, not a node) — a *third*, even more minimal shape than `VarDecl`'s
content-derived id. A parameter *read* resolves today not via `target` at all, but by **name, within the
action's own lexical scope**, at the generator (`EmitScope.paramInScope`, `expression.ts:341-344`,
`component.ts`'s `actionScope`) — the one already-working mechanism in this codebase for "a value with no
id, resolved by scope rather than by target." This works for parameters only because a `sig.Action`/
`FunctionDecl`'s parameter list is fixed and fully known at the point the generator builds that one
action's own scope — there is exactly one flat namespace to search, no nested shadowing within it (Dart
does not allow two parameters of the same action to share a name), so "resolve by name in this one flat
scope" is safe there in a way it provably is not for locals (§5's rung L: nested, shadowable, and the
generator would need to reconstruct Dart's own block-scoping rules independently to replicate what the
*extractor*, not the generator, already computes correctly today via `Scope.lookup`'s innermost-first
walk). Locals cannot reuse the parameter mechanism as-is.

## 11. Comparison with top-level symbols (M8-J)

M8-J's fix (`Symbols.variableIn`/`functionIn`, `_topLevelTarget`) is the same **shape** of fix this
milestone's evidence points toward for locals — a `target` derived from the analyzer's own resolved
`Element`, threaded through `_reference`'s existing `staticTarget` parameter — but top-level declarations
are **globally, cross-file nameable by construction** (that is the entire reason M8-J needed
`Symbols.pathOf`/package-URI resolution at all), which is exactly the property ADR-17's symbol tier was
built to serve. A local variable's identity requirement is narrower (same-body only) but the *mechanism*
needed — mint a real, collision-free symbol at declaration time, thread it through the existing
`Binding.symbol` field, let the existing `_reference`/`Scope.lookup` pipeline do the rest — is the
identical pattern, which is exactly why this is describable as "extend the table by one row," not
"invent a new system."

## 12. Comparison with store members (M7-N)

`sig.Signal`/`sig.Action`/`sig.Derived` all mint a real symbol at declaration time
(`Symbols.signal`/`.action`/`.derived`, `signal_extractor.dart:143-234`, all passing `symbol:` into their
`Binding`) — owner-qualified (`sig:path#Owner.member`), so two different classes' same-named members never
collide. This is the **closest existing precedent** for what a local would need (an owner-qualified
symbol, minted once, at declaration time, carried through `Binding.symbol`) — the missing piece for
locals is exactly this: `Binds.local` bindings are created identically to `Binds.signal`/`.action` ones in
every way *except* they are never handed a `symbol:` argument (confirmed directly, §7).

## 13. M8-B `Binding.inlineValue` comparison

Read in full (`docs/m8/m8b-structured-build-extraction.md`). Answering Phase 4's twelve questions:

1. **Yes, final-only.** A `var`/reassigned local is one of the explicitly refused shapes.
2. **Yes, implicitly** — the admitted initializer grammar cannot express a statement-level side effect
   (`m8b-structured-build-extraction.md:150-154`: *"no bespoke purity analysis was written, because none
   of the admitted shapes can express a statement-level side effect"*).
3. **Yes** — a `_UsageFinder` proves every declared local is read at least once, by resolved `Element`,
   or the whole transform aborts for that method.
4. **No — repeated use is explicitly accepted, and the initializer is re-evaluated at every use site.**
5. **The invariant that makes this acceptable is Flutter's own `build()` contract**, quoted directly:
   *"Flutter's own contract already requires `build()`... to be free of externally observable side
   effects, since the framework may call it arbitrarily often."* Re-evaluation is licensed by the
   framework's own purity guarantee for exactly this one method, not by anything general about locals.
6. **Yes** — restricted to a narrow, explicitly-enumerated safe expression grammar (§8 of the M8-B doc).
7. **No, deliberately** — it does not preserve Dart's own single-evaluation semantics; it substitutes a
   *different*, framework-licensed semantic (safe-to-repeat) for the one case where that substitution is
   provably harmless.
8. **Yes** — `inlineValue` exists *because* `ui.Component.render` is typed to hold only the `ui.*` union,
   never `logic.*`, so a build-method local has no statement slot to be represented in at all
   (`m8b-structured-build-extraction.md:90-93`). An action/function body is not this shape — it already
   lowers to a real `logic.Block`/`logic.VarDecl`/`logic.Return` statement sequence (confirmed live, §5) —
   so the premise that forced `inlineValue` into existence does not hold for the bodies this milestone
   measured.
9. **Yes, unboundedly** — reusing it for a general imperative local (no purity guarantee, no restricted
   grammar) would duplicate any side effect in the initializer at every read.
10. **Yes** — `inlineValue` has no representation for `var`/reassignment at all; rung G/H (§4) would be
    unrepresentable by this mechanism regardless of scope.
11. **Yes** — an `async` initializer awaited once and read twice would, if inlined, `await` twice.
12. **Yes** — `final x = Object(); use(x); use(x);` inlined would construct two distinct objects where
    Dart's own semantics guarantee one; Phase 7's own object-identity test (§14) depends on exactly this
    not happening.

**No evaluation-count bug was found in M8-B's own, narrowly-scoped mechanism** — its safety argument is
sound *for the grammar it actually admits* (final, side-effect-free-by-framework-contract, `build()`-only)
— nothing here found a silent-wrong-code defect in the shipped M8-B code itself. Reusing it outside that
boundary, for ordinary action/function-body locals, would introduce exactly the evaluation-count and
object-identity defects rules 12/13 of this milestone forbid — **not attempted, and rejected on this
evidence**, matching Outcome D's own framing ("locals are intentionally represented differently and
another mechanism *should* be reused" is the wrong read; the correct read is "the two contexts are
genuinely different, and `inlineValue`'s safety does not transfer").

## 14. Evaluation-count analysis

Directly proven live (§6): `_twice`'s `final int x = 21; _log = x + x;` extracts to **one** `logic.VarDecl`
(the declaration, evaluated once, by construction — nothing here duplicates a *statement*) and **one**
shared `logic.Ref` node used at both operand positions of the `+`. This is correct evaluation-count
behaviour already, independent of any fix this milestone might make: the declaration is a single
statement in the lowered `logic.Block`, so whatever correctly binds the read to it (once real identity
exists) inherits single-evaluation for free — the risk this phase is guarding against (re-evaluating
`compute()` per read) simply does not arise from how declarations are already lowered; it would only arise
from reusing `inlineValue` (§13), which this milestone does not do.

## 15. Mutation analysis

`_mutate`'s `var count = 0; count = count + 1; count++;` extracts with **no `isFinal`** on the `VarDecl`
(confirmed live) and ordinary `logic.Assign` statements against the same shared, untargeted `logic.Ref`
node for `count`. Nothing about the identity-loss finding (§5-§7) is specific to immutability — a `var`
local has exactly the same content-addressing collision risk as a `final` one, and exactly the same
missing-symbol root cause. A future fix minting a declaration-tier symbol for `VarDecl` would need no
`isFinal`-conditioned branch to be safe for mutation, since nothing about assignment resolution differs
from any other targeted write (`logic.Assign.target` already resolves the identical way a signal write
does, once the target it points at is real).

## 16. Async analysis

Not empirically exercised (no real rung in this fixture uses `await` inside a local's initializer), but
by inspection: `logic.Await` is already a lowered expression (`expression.ts:779`, confirmed in M8-L),
and nothing about awaiting an initializer changes what *kind* of statement declares the local
(`logic.VarDecl`, same as any other initializer) — so the identity gap this milestone found is orthogonal
to async; an async local would hit the exact same missing-symbol cause, no differently.

## 17. Lexical-scope analysis

`Scope`/`Binding` (`dart/bridge_analyzer/lib/src/session/extract/scope.dart`) already, correctly,
implements Dart's own lexical scoping — `Scope.lookup` walks innermost-parent-first, and every
`Scope.child(...)`/`withBinding(...)` call in `statement_extractor.dart` follows the source's own nesting
exactly (a block's own bindings shadow its parent's for the statements inside it, and go out of scope
after). This is **not broken** — it is the one part of this whole picture that already works correctly,
confirmed by the fact that `_shadow`'s inner read (§6) is *semantically* correctly bound to the inner
declaration during extraction (the extractor's own `scope.lookup('x')` call, at the inner read site,
correctly finds the innermost `Binding`) — the identity is lost **after** correct resolution, at the
moment `_reference` tries to turn "this binding" into a `target` string and finds `binding.symbol == null`.
**The fix this milestone would recommend needs no new scope-tracking logic at all** — it only needs the
already-correctly-resolved `Binding` to carry a real symbol.

## 18. Shadowing analysis

Proven, not asserted (§5, §6): the *extractor's* own scope resolution is shadowing-safe today (§17); what
is unsafe is representing the *result* of that resolution as a `target`, because the only identity
available (content-derived) collapses exactly where shadowing makes two declarations distinguishable to
Dart but textually identical to a content hash. This is the single most important, concrete finding of
this milestone: **shadowing is not "at risk" of breaking a future fix — it is already broken today**, in
the sense that if a naive fix pointed `target` at "the VarDecl's own content id," it would silently
resolve `_shadow`'s outer, post-`if` read to either declaration interchangeably (they share an id) — and
if the two declarations' content ever diverged even slightly (different initializer values), it would
misresolve the read to whichever unrelated declaration anywhere in the *entire program* happened to share
that id, since content ids are global, not scoped to a file or an action. Any real fix must derive
`target` from the resolved `Element` at the reference's own reference-time — exactly as `_reference`
already does for enums/top-level names — never from the read node's or declaration node's own content id.

## 19. Same-name collision result

Confirmed dangerous by direct evidence (§5, §6): `_shadow`'s two `x`s collide; `_twice`'s unrelated `x`
reads share the read-node id with `_shadow`'s. A same-name local in a *different, unrelated action
entirely* is exactly the same risk, at the read-node level, confirmed live in this milestone's own
fixture (§6 — `_twice` and `_shadow`'s `x` reads share one id across function boundaries).

## 20. Parameter/local collision result

Not separately fixtured — by construction, a parameter and a local of the same name are different
`Binds` kinds bound at different points in the same `Scope` chain; `Scope.lookup`'s innermost-first walk
already resolves correctly (Dart's own rule: the innermost declaration wins, and a local declared after
a parameter of the same name is a compile error in real Dart, so this exact collision cannot occur in
valid source — nothing to prove beyond what §17 already establishes about the scope chain being correct).

## 21. Signal/action/local collision result

Not separately fixtured, same reasoning as §20 — `Binds.signal`/`.action` bindings live at the
*class-body* scope (bound once, outside any method), and a method-local `Binds.local` binding of the same
name would correctly shadow it for the remainder of that method, per `Scope.lookup`'s existing walk. This
is standard Dart shadowing, already handled by the existing (correct) scope-resolution logic; the risk
this milestone identified is specific to *representing the resolved answer as an identity*, not to
resolving it in the first place.

## 22. Cross-file/package relevance

None — by construction, a local variable's `Element` never resolves outside the file (in fact never
outside the function) it is declared in; nothing about M8-F's cross-package assembly or M8-J's cross-file
symbol resolution is implicated by anything found here.

## 23. Generator EmitScope finding

`EmitScope.localName(id)` (`expression.ts:81`) exists and is asked (`expression.ts:317`, before the
`logic.EnumDecl`/`logic.FunctionDecl` structural checks M8-D/M8-L added) — but nothing in the codebase
ever *populates* it for an ordinary body-local. `actionScope.localName` (`component.ts:673`) only maps
*other actions'* ids (for an action-calling-action tear-off); the root scope's `localName` is a constant
`() => undefined` (`pipeline.ts:539`). **This confirms the generator side is not the primary defect**: it
already has the exact right-shaped consultation point (`localName`, tried before any fallback) — it is
simply never handed anything to find, because no `target` ever reaches it (§5-§7). Per the task's own
Phase 5 instruction ("if the generator already emits `const x = ...` but a later read cannot find it, the
fix should extend the existing scope mechanism, never build a parallel resolver") — this is exactly
right, and exactly why this milestone's finding is that the *extraction* side (Dart) needs to change
first; nothing about `EmitScope`'s own shape needs to change once a real `target` exists — a bare
`(id) => localBindings.get(id)` populated at `VarDecl`-emission time inside `statement.ts` would be a
natural, small extension of the exact mechanism already there, **once ADR-17 is amended to make that
`id` safe to mint.**

## 24. Implementation gate

Per Phase 8's twelve conditions:

1. Local declaration structurally represented — **yes** (`logic.VarDecl`).
2. Declaration identity available, or an existing approved mechanism applies without schema/ADR change —
   **NO.** The only identity `logic.VarDecl` has today (content-derived) is proven unsafe for this
   purpose (§5, §6, §18); no existing symbol scheme covers locals (§7); the `ParamDecl` precedent for the
   identical structural gap was already ruled to need an ADR (§9).
3. Reads can resolve by identity — moot until (2) is resolved.
4. Generator scope can represent the binding — **yes**, trivially, once (2) is resolved (§23).
5. Evaluation count preserved — provably yes for the declaration-based approach (§14); provably NO for
   reusing `inlineValue` (§13) — decided in favour of the declaration-based approach, which is blocked on
   (2).
6. Lexical scope preserved — **yes**, already correct today, at extraction time (§17).
7. Shadowing safe — **NO with today's identity** (§18) — safe only once (2) is resolved with a real,
   owner-qualified symbol.
8. No name matching needed — satisfied by the existing `Scope.lookup` mechanism (§17), which resolves by
   lexical scope, not name matching in the sense the task's rules forbid (a generator-side "nearest
   variable with this name" search, which this design would never need — §23).
9. Mutation semantics correctly supported or honestly refused — refused correctly today (`BRG3006`,
   unweakened); would be directly, correctly supported once (2) is resolved (§15).
10. Async semantics correctly supported or honestly refused — refused correctly today; orthogonal to (2)
    (§16).
11. **No schema change required — TRUE** (§8).
12. **No ADR change required — FALSE** (§9).

**Condition 2 and condition 12 both fail. Per the gate's own "if any fail: STOP implementation," this
milestone stops here.**

## 25. Implementation, if any

**None.** No Dart, TypeScript, schema, or ADR file was changed. The temporary probe fixture
(`fixtures/apps/local_var_probe/`) was deleted after evidence extraction; nothing from it was committed.

## 26. Diagnostic behavior

Unchanged, correctly: a local read still reports `BRG3006` — case B/C in the task's own Phase 10 taxonomy
("declaration exists but local-variable lowering unsupported"), not case A ("declaration genuinely
absent"). This milestone confirms the *message text* is misleading in exactly the way M8-L's own
`FunctionDecl` finding was (a real declaration exists; the wording says otherwise) — but, unlike M8-L's
case, **the underlying identity is not yet safe to point a corrected diagnostic at**: M8-L's fix could
safely say "target resolves to a `logic.FunctionDecl`, capability unsupported" because the `target` was
already sound (M8-J's own fix). Here, there is no sound `target` to inspect at all — a diagnostic
correction analogous to M8-L's (recognizing a `logic.VarDecl`-shaped absence and reporting a different
code) was considered and rejected: it would require the generator to guess, by some other means (e.g.
walking the enclosing body for an in-scope `VarDecl` matching the read's `name`), whether an untargeted,
unresolvable `logic.Ref` is "a local that should have resolved" versus "a genuinely unresolvable name" —
which is precisely the "find the nearest variable with this name" generator logic rule 8 forbids, and
which the extraction-side identity gap (§18) proves is not even reliably answerable that way. **No
diagnostic change was made.**

## 27. Build-proof

Not applicable — no implementation. `pnpm --filter @bridge/gen-react test`: 222/222 (17 files), confirmed
unchanged both before and after this milestone's investigation (no code touched).

## 28. Continuum evidence

Read-only, no application source touched. Fresh `bridge analyze` on the real, current (independently
in-progress) `apps/macos/mac` and `apps/android/droid`:

| | mac | droid |
|---|---:|---:|
| Analyzer errors | 0 | 0 |
| Analyzer warnings | 95 | 124 |
| Analyzer records | (unchanged from M8-L's own count) | (unchanged) |

Identical to M8-L's own most recently recorded numbers — confirms nothing analyzer-facing has drifted in
Continuum's own, independently-progressing source since M8-L. **Generate-stage counts were not
independently re-measured via a fresh whatif rebuild**: since no analyzer, compiler, or generator code
changed this milestone, a fresh whatif generate run would be expected to reproduce M8-L's own recorded
numbers exactly (mac: `BRG3006`×24, `BRG3013`×8, 48 errors/17 warnings; droid: `BRG3006`×25, `BRG3013`×8,
53 errors/19 warnings) — re-running the same expensive whatif-copy exercise to confirm a number that
cannot have moved would not be new evidence, and this report says so plainly rather than fabricating a
"fresh" run of an unchanged code path. `git status --short` in Continuum: 34 lines, identical to what
this milestone found on arrival (the same pre-existing, unrelated, in-progress real work) — confirmed
unchanged before and after.

## 29. FunctionDecl re-measurement

No lowering was implemented in M8-M (per its own explicit instruction), so nothing about the three real
functions' own structural readiness changed. Restated, not re-derived, from M8-L's own findings, now with
this milestone's own local-variable evidence attached:

- **`formatBytes`** — still blocked. Its three locals (`units`, `value`, `unit`) are exactly the shape
  measured here (§3-§7): each would need a real declaration-tier symbol before any reference to them could
  resolve, which is exactly the ADR-gated gap this milestone found. Its one genuinely-absent real call
  site remains separately blocked by the adjacent-string-literal opacity (M8-K, `BRG1302`), unrelated and
  untouched.
- **`formatUptime`** — **unaffected, still the one structurally generator-ready function of the three**
  (M8-L's own finding): zero locals, so this milestone's finding does not touch it at all.
- **`describeTransferFailure`** — still blocked by its own, separate, unrelated cause: the body is an
  unmodelled Dart switch-*expression* (`logic.OpaqueExpr`, M8-L §9) — local-variable identity has nothing
  to do with this one.

**FunctionDecl lowering itself remains unimplemented, as instructed.**

## 30. Regression results

No production code changed, so no regression is possible in the strict sense — verified anyway:
`pnpm --filter @bridge/gen-react test`: 222/222, unchanged (§2, §27). M7-N, M8-B, M8-D, M8-F, M8-H, M8-J,
M8-K, M8-L are all untouched by construction (no file any of them depends on was edited). Specifically
re-confirmed: M8-L's own diagnostic fix (`BRG3013` for a targeted `logic.FunctionDecl` reference) still
stands — its own test file (`toplevel_function_reference.test.ts`) still passes, 6/6, unmodified. A
genuinely unresolved reference still reports `BRG3006` (§26 — unweakened, by design, since nothing was
changed). No duplicate evaluation was introduced (nothing was implemented). No local escapes its lexical
scope (§17 — already correct, untouched).

## 31. CI

Not re-run in full (`just ci`) as a distinct step, since **no file in the repository changed** — the
checkpoint's own `just ci` (green, confirmed at the M8-L commit, §2) already covers the exact tree state
this milestone leaves behind. `pnpm --filter @bridge/gen-react test` was re-run directly (§2, §27) as the
narrowest sufficient confirmation that nothing was silently left broken by this milestone's own
(exploratory-only) fixture work.

## 32. Determinism / fixed point

Not run — no production code changed, so there is nothing new for either check to validate beyond what
M8-L's own checkpoint already confirmed clean.

## 33. Silent-wrong-code findings

One, explicitly investigated and **cleared**, per Phase 4's own instruction to check M8-B's mechanism for
an evaluation-count bug: none was found (§13) — M8-B's `inlineValue` is sound within the narrow,
side-effect-free, `final`-only, `build()`-only grammar it actually admits. One separate, adjacent,
real diagnostic-misattribution gap was found and set aside, not investigated further (§3, "an incidental
finding"): an action referenced only from inside another action's body (not directly from the render
tree) is invisible to `referencedActions` and misreports `BRG3006` for a real, targeted, write-something
action — a sibling of both M8-L's and this milestone's own findings, structurally a third instance of
"a real declaration exists; something downstream doesn't know to look for it," but a different mechanism
(`referencedActions`'s render-tree-only discovery walk) and out of this milestone's own scope.

## 34. Remaining blocker graph

1. **ADR-17 amendment for `ParamDecl` and `VarDecl` local identity** (this milestone's own finding,
   generalizing M8-G's `ParamDecl`-only proposal) — the actual next architectural decision. Both are the
   same structural gap (a real, lexically-scoped declaration in neither of ADR-17's two tiers); a single
   ADR extending the table by one row (declaration-tier, owner-qualified symbol, following the exact
   derivation rule every other declaration already uses) would plausibly close both at once.
2. **Action-referenced-only-from-another-action's-body** (§3, incidental finding) — real, unrelated,
   unmeasured beyond its existence.
3. `BRG1302` adjacent-string-literals (M8-K) — untouched.
4. Top-level `FieldDecl`/const generator lowering (M8-L §10.11) — untouched.
5. Switch-expression extraction (M8-L §9) — untouched, out of scope by this and the prior milestone's own
   exclusion lists.
6. `BRG2301`/`BRG2303` route-boundary blockers (M8-I) — untouched.
7. `logic.FunctionDecl` full lowering itself (M8-L) — still gated on both this milestone's own finding
   (§29, `formatBytes`) and the switch-expression gap (`describeTransferFailure`); only `formatUptime` is
   structurally unblocked, and even it cannot generate until `FunctionDecl` lowering exists at all.

## 35. Exact recommendation for M8-N

**Write the ADR** — extend ADR-17 ISSUE-6's two-tier table with a third, declaration-tier row covering
both `ParamDecl` (M8-G's own already-worked-out Option A) and `logic.VarDecl` local variables (this
milestone's Option A-equivalent: an owner-qualified symbol, e.g. `local:<path>#<Owner>.<name>.<ordinal>`,
minted once at declaration time via a new `Symbols.local(...)`, threaded into `Binding.symbol` at all four
`Binds.local` creation sites in `statement_extractor.dart`, consumed automatically by the existing,
unmodified `_reference`/`Scope.lookup` pipeline) — since both are the same underlying defect
(content-addressing cannot safely stand in for a lexically-scoped binding's identity) with the same
correct shape of fix, doing them together is smaller and more coherent than two separate ADRs for what is
now shown to be one architectural gap. This is explicitly **not** something M8-N should treat as
pre-authorized to implement without first writing and, per CLAUDE.md's own rule, getting the ADR itself
reviewed as documentation of a proven contradiction — the measurement is done; the decision is not
this milestone's or the next one's to make unilaterally.
