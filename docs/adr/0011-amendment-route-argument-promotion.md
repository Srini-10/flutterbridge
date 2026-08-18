# ADR-11 Amendment — Route argument promotion and component-interface ownership

- **Status:** Accepted (M7-E2, 2026-08-19). Amends ADR-11 (Accepted M0-T7, 2026-07-12) and Spec
  v2.1-amendments' N11 input/output table.
- **Supersedes:** nothing structurally new — this ratifies and narrows a decision ADR-11 already made
  in prose but never shipped.

## Context

M7-D (`docs/m7/m7d-reality-audit.md`) regenerated `hello_bridge`'s fixtures from the current compiler
and, in the course of that, confirmed a live gap: N11 (`promote-cross-route-state`) does not walk
`app.Route.arguments` at all — only `app.RouteTransition.arguments` — so a declarative route's own
constructor arguments are never promoted, and the generator refuses with `BRG3013` naming the gap by
name (`packages/generators/react/src/internal/pipeline.ts:308-324`). M7-D recommended proceeding to a
decision on the deeper question underneath that gap: **when N11 promotes a route argument into
application/store state, may it also rewrite the destination component's declared interface
(`ui.Component.params`) and the internal reads inside it?**

This document is that decision. No compiler code, schema, or generator behavior changes as a result of
it — evaluation and reproduction only, per the milestone's scope.

## Current behavior (reproduced against HEAD, not assumed)

Traced end to end: Flutter source → analyzer extraction → `app.Route.arguments` /
`app.RouteTransition.arguments` → destination `ui.Component.params` → internal reads → N11 → normalized
UIR → generator.

- **`app.Route.arguments`** is populated by `dart/bridge_analyzer/lib/src/session/extract/
  route_extractor.dart` (M7-D's commit `28a2753`) with one entry per constructor argument, each a
  `RouteArgument{name, binding, transport}`. For `hello_bridge`'s `home: LoginScreen(isDark: _isDark,
  onToggleTheme: _toggleTheme)`, this is a `bind.Signal` (isDark, `scope: "component"`) and a
  `bind.Expr(logic.Ref{target: <sig.Action id>})` (onToggleTheme) — both resolved, both with a real
  `target` linking to a declaration.
- **The destination `ui.Component`** (`LoginScreen`) independently declares `params: [{name: "isDark",
  required: true}, {name: "onToggleTheme", required: true}]`, extracted by `component_extractor.dart`
  from the widget's own constructor. Nothing links a route's *argument* to the component's *param* by
  id — the relationship is **positional/by-name only**, resolved at the generator, not recorded as an
  edge in the schema.
- **N11** (`packages/compiler/src/internal/passes/n11_promote_cross_route_state.ts`) requires the
  `nav-graph` analysis, which is built **exclusively from `app.RouteTransition` nodes**
  (`packages/compiler/src/internal/analysis/nav_graph.ts:47-53`). `app.Route` nodes contribute route
  and `componentOf` entries only — never `arguments` — so N11 structurally cannot see a declarative
  route's arguments at all, independent of anything else in this document.
- Where N11 *does* run (an `app.RouteTransition`), it: promotes the referenced signal/action into a
  synthesized `app.Store{origin:"promoted"}`, rewrites the signal's `scope`/`store` fields **in place,
  same id**, and strips the argument from the transition (`strip()`, `n11_promote_cross_route_state.ts:
  76-95, 231-266`). **It never reads or writes `ui.Component.params`, and never rewrites an internal
  `bind.Param`/component-param read.** Confirmed by direct grep of the pass: no reference to
  `ui.Component` anywhere in it.

Running the real generator against the current, corrected `hello_bridge.normalized.ndjson` (this
session, via `reactGenerator.generate`) reproduces the failure directly — this is not hypothetical:

```
BRG3013 - the route `/` passes `isDark`, `onToggleTheme` to `LoginScreen`, and the value is state
declared outside any component the project emits — typically the application root... Owner: N11
(`promote-cross-route-state`, ADR-11), which promotes the arguments an `app.RouteTransition` carries
and does not yet walk `app.Route.arguments`.
```

This exact error is masked in `generate.test.ts`'s `'what remains is named precisely'` test, which
asserts diagnostic **codes** as a `Set` — and `BRG3013` was already in the expected list for an
unrelated reason (the `Navigator.push` capability gap), so the *new* instance collapses into the same
code without a distinct assertion. The test suite is green; the specific defect has no dedicated
coverage.

## Reproduced failure — why simple argument stripping is incorrect

Constructing the concrete counter-scenario and tracing it against the shipped pass: if N11 (or a
minimal patch to it) promoted `isDark`/`onToggleTheme` and stripped them from `app.Route.arguments`
without touching `LoginScreen`'s `params`, the generator's `rendered()` function
(`pipeline.ts:264-339`) would try to bind zero arguments against two still-`required: true` params, and
emit `<LoginScreen />` — which TypeScript would refuse to compile (two missing required props). This is
the exact shape the task's framing describes, and it reproduces mechanically rather than by inspection
alone: nothing downstream of N11 today reconciles a stripped argument against a component's declared
requirement.

**ADR-11 already specified the fix for this**, in 2026-07-12 prose that was never implemented. Its
"Outputs" section (`docs/adr/0011-cross-route-state-promotion.md:53-55`) reads: *"Rewrite every
reader/writer to reference the store. **Remove the argument from the transition and the corresponding
param from the destination component.**"* Its own "Inputs" line lists `ui.Component` params as
something N11 consumes. The shipped pass does neither. **This amendment is not deciding a new question
— it is finishing a decision the original ADR made and the implementation silently dropped.** That
matters for how much new justification is required: the burden here is to re-validate the original
call against everything learned since (identity, multi-hop, real diagnostics), not to invent one from
nothing.

## The second-hop case — investigated, not assumed solvable

`hello_bridge` itself contains the shape the task asked about: `LoginScreen` (which receives
`isDark`/`onToggleTheme` from the root route) forwards the same two values into `HomeScreen` via an
inline `Navigator.push(MaterialPageRoute(builder: (_) => HomeScreen(isDark: isDark, onToggleTheme:
onToggleTheme)))`. This is a real `app.RouteTransition` in the current normalized golden, and `HomeScreen`
independently declares the same two params as `required: true`.

Traced directly in the golden: the transition's `onToggleTheme` argument binds to `bind.Expr{expr:
{kind: "logic.Ref", name: "onToggleTheme"}}` — **with no `target` field.** This is not a bug in
extraction; it follows from the schema. `ParamDecl` (`packages/uir/src/generated/uir.ts:731-742`) is
explicitly a **value, not a node** — "a `ParamDecl` has no id... so a `logic.Ref` in the body resolves
to a parameter by name, within scope" (comment on `sig.Action.params`, and the same value type is used
for `ui.Component.params`). A reference to a component's own parameter therefore *cannot* carry a
`target: NodeId`, because a parameter has no id for one to point at.

Consequences, answered directly:

- **N11 does not currently promote this second hop**, and not by design — `classify()`
  (`n11_promote_cross_route_state.ts:161-192`) requires `expr.kind === 'logic.Ref' && typeof
  expr.target === 'string'` to recognize an action reference; an untargeted `logic.Ref` falls through
  to the `'primitive'` case by default, which is a *coincidentally* safe outcome here (nothing crashes),
  not a deliberate finding that this shape is fine.
- **A second, independent, more fundamental gap sits underneath this one and would exist regardless of
  N11's decision here**: components reached via an inline `push` (as opposed to a declarative route) get
  *zero* prop resolution attempted at all. `pipeline.ts`'s `componentScreens` loop (lines 348-357) calls
  only `reserve(componentId)` — never the `rendered()` function that does per-argument binding and
  emits `BRG3013` for unreachable state. The code comment states this outright: *"An inline destination
  is reached by a push, not by a route, so it has no `app.Route` and no arguments to construct it
  with... It renders as its bare component."* For `hello_bridge`, this currently produces no observable
  symptom only because generation aborts earlier (`BRG3005` rollup, from unrelated errors — `mounted`,
  theme tokens, `MaterialPageRoute` inline destinations) before this code path's output is ever
  inspected by a test. **This is a live, unobserved defect independent of route-argument promotion**,
  and is noted here as a related finding, not solved by this ADR (per CLAUDE.md: file it, don't
  redesign around it inside this decision).
- **Can existing UIR references prove the two `onToggleTheme`s are the same logical value?** No. The
  forwarded reference's lack of a `target` is not an extraction oversight to patch — it is what the
  schema currently allows for a param reference. Proving equivalence today would require either
  inferring it from the shared name `onToggleTheme` (explicitly forbidden — "never infer equivalence
  from parameter names") or a whole-program points-to trace from `HomeScreen`'s param, through the
  transition argument, through `LoginScreen`'s param, back to the original `app.Route` argument's
  `target`. Chasing that is dataflow analysis across N nodes; N11 today is a single local rewrite over
  one transition's own argument list. Making it not-local — walking backward through every reachable
  caller to prove a forwarded value's provenance — **is a different kind of pass than N11 is now**, and
  the task's own framing (*"would it become whole-program interface optimization?"*) is the right
  question to ask, and the answer here is yes, it would.

**Multi-hop promotion is not ruled out forever — it is ruled out by what the UIR can currently prove.**
That is a narrower, more useful conclusion than "unsupported": it says exactly what evidence would
change it (§ Consequences).

## Compiler-ownership precedent (N1–N10 audited directly)

Every normalization pass was read, not sampled. **No pass among N1–N10 rewrites `ui.Component.params`,
an existing `sig.Action`'s signature, `app.Store` membership, or an `app.Route` declaration.** N1–N4
are verify-only (report a shape violation, do not rewrite). N6–N10 rewrite tree-node content
(expressions, widget trees, tokens) or synthesize new content-addressed nodes (N10's derived color
roles) — never a declaration's own field.

Two passes are relevant precedent, in opposite directions:

- **N11 already rewrites a declaration's field** — `sig.Signal.scope`/`.store`, in place, same id —
  which is the only existing precedent for a normalization pass mutating a declaration at all. It works
  *because* `sig.Signal` is a **declaration-tier** node (id = hash of a stable symbol, not of content —
  ADR-17 ISSUE-6), so rewriting a field the id doesn't depend on is free. This is direct, working
  precedent that declaration mutation is architecturally acceptable *when the mutated field is outside
  the id's basis* — but `scope` is closer to internal bookkeeping than to a publicly-referenced
  contract, which is the honest distinction between what N11 already does and what this amendment adds.
- **N5 (lift-closures) is precedent in the opposite direction.** It synthesizes a *new* action from an
  inline closure, and explicitly **refuses** to lift a closure that captures a free local, specifically
  because doing so would mean "rewriting every call site to pass a value only this pass believes in"
  (`n5_lift_closures.ts:33-40`, `BRG2105`). N5 will invent a new declaration; it will not retroactively
  change what every existing call site owes an existing one. That caution transfers directly: **if a
  component is reached by more than one route/transition, and only some of them need promotion,
  deleting a param from the component's declared interface breaks every call site that still supplies
  it locally.** Nothing in the corpus proves this doesn't happen — `hello_bridge` has exactly one path
  to each of `LoginScreen`/`HomeScreen`, so it cannot evidence the multi-caller case either way. This is
  treated as a hard constraint on the decision below, not a hypothetical.

## Identity and NodeId consequences (settled, not estimated)

Confirmed directly in code (`dart/bridge_analyzer/lib/src/builder/id_allocator.dart`,
`node_factory.dart:93-96`, `packages/uir/src/generated/uir.ts:230-278`, and ADR-17 ISSUE-6):

- **`ui.Component`'s NodeId is `nodeIdOfSymbol('comp:' + path + '#' + Name)`** — a hash of file path
  plus class name, computed because `component_extractor.dart` always sets `symbol` on the `RawNode` it
  emits, which routes it through the declaration tier unconditionally. **`params` is not part of that
  symbol.** Rewriting, removing, or adding entries to `ui.Component.params` therefore **does not change
  the component's id.**
- The same is true of a *source-declared* `sig.Action` (a named Dart method) — `signal_extractor.dart`
  sets `symbol` via `Symbols.action`, so it too is declaration-tier and content-independent.
- **The one asymmetric case:** a `sig.Action` **synthesized by N5** from an anonymous inline closure has
  no extraction symbol and is content-addressed (`nodeIdOfContent`, including its own `params`). N11
  today never rewrites an action's own fields (only signals), so this is currently moot in practice —
  but it is the one place a future implementation must not assume symbol-tier stability, and it is
  listed as a required test below.
- **Consequence for references, override anchors, and incremental cache:** none, for the declared-node
  case. Overrides key on `anchor` (a structural path, independent of `id` and of `params`), and every
  reader of a component references it by its (unchanged) id. This is architecturally the same property
  ADR-17 calls "load-bearing for the cache, for overrides, and for AI provenance" — the decision below
  extends an already-load-bearing guarantee rather than introducing a new risk to it.

**This resolves what looked, before verification, like the hardest part of the decision.** Rewriting a
component's declared interface is not an identity hazard here, because "declaration" already means
"id independent of exactly this kind of field" throughout this compiler.

## Options evaluated

**A — N11 owns interface rewriting** (as ADR-11 originally specified). Promotes the signal/action,
removes the route/transition argument, removes the corresponding `ui.Component.params` entry, and
rewrites the internal read. Proof required before removal: the argument's binding must resolve to a
`target` NodeId identifying a `sig.Action` or `sig.Signal` — never a name match. Recursive/multi-hop
forwarding: **not owned** — see above; the UIR cannot prove it, so a Ref with no `target` is left alone
and (under this amendment) explicitly diagnosed rather than silently trusted.

**B — component interfaces are immutable.** N11 may promote only when doing so requires no interface
change; otherwise it refuses with a precise diagnostic. Preserves the current architecture at zero
identity/consensus risk, but leaves `hello_bridge`'s and (per the GAP-route-constructor-arguments.md
corpus measurement) continuum's `home:`-with-arguments pattern **permanently, deliberately unsupported**
— not deferred, refused forever. Given ADR-11 already decided this pattern deserved promotion, and the
current `BRG3013` refusal is exactly what Option B formalizes as permanent, choosing B now would be
reversing ADR-11's decision without new evidence that reversal is warranted. No such evidence was
found.

**C — optional-only stripping.** N11 may remove a route argument only when the destination parameter is
optional/defaulted. Checked directly against the only argument-carrying real case this repo can
reproduce: `hello_bridge`'s `isDark`/`onToggleTheme` are **both `required: true`**. Option C provides
**zero coverage of the one case this repo can prove**, and continuum's `home:` pattern's
optionality is unmeasured (no continuum source is in this repo — see Corpus evidence). This option
would not resolve the reproduced failure; it avoids the architectural question rather than answering it,
which is exactly what the task asked to check for.

**D — an explicit promoted-dependency boundary.** Rather than deleting a param, mark it as satisfied by
store consumption and rewrite the internal read to pull from the store directly. **This vocabulary
already exists at the schema and generator level, though no fixture in this repository happens to
exercise it.** Checked directly: no `ui.Component` in either available fixture (`hello_bridge`,
`counter`) contains a `bind.Signal` targeting a store-scoped signal — `hello_bridge`'s own
`FavoritesStore` is written to by an action and read by a derived value, but nothing in its widget tree
reads the store directly, so it is **not** a working example to cite as precedent, despite looking like
an obvious one. What *is* verified: the generator's `bind.Signal` emission
(`packages/generators/react/src/internal/emit/component.ts:862-887`) is generic over signal scope —
`scope.signalRead(id)` — and a component's local read scope explicitly falls through to a parent scope
when a signal isn't one of its own (`component.ts:325-327`: `local === undefined ? parent.signalRead(id)
: ...`), with the store emitter (`packages/generators/react/src/internal/emit/store.ts:173`) supplying
exactly that fallback for store-scoped signals. This is a real, general, already-implemented mechanism —
just not one any committed fixture currently demonstrates end to end. Promoted state (`origin:
"promoted"`) is the identical UIR shape N11 already produces for a store; nothing new is required for a
component to consume it the way this mechanism already supports consuming any store. The only
interface-level act left is removing the now-unnecessary entry from `ui.Component.params` (or, more
conservatively, leaving it present but no longer `required`) — which is Option A's own final step,
expressed through a mechanism this compiler already has, not one this repository has yet proven in a
corpus example.

**Option D is not a fourth alternative to A — it is A's implementation mechanism**, and evaluating it
confirmed the mechanism needs no new UIR vocabulary. The decision below is A, built on D, scoped to what
the identity and provenance evidence actually supports.

## Evaluation against invariants and cross-cutting concerns

| Concern | A (scoped, via D) | B | C | Note |
| --- | --- | --- | --- | --- |
| Semantic preservation | Yes — internal reads point at the same underlying signal/action, same value, no invented default | Trivially yes (nothing changes) | Yes for the cases it covers, but covers ~0 of the reproduced evidence | — |
| INV-4 (nothing invented) | Preserved — promotion targets are only ever `target`-linked declarations, never name-matched | Trivially preserved | Preserved | Multi-hop is refused, not guessed, for the same reason |
| INV-18 (no function-typed route-transition argument survives N11) | Preserved — same stripping N11 already does | Preserved (nothing to strip when nothing promotes) | Preserved | Existing enforcement is structural-only, not a separate hard assertion (found gap, noted below) |
| INV-22 (no framework runtime primitive survives extraction) | Unaffected — this is an analyzer-side, pre-N11 concern | Unaffected | Unaffected | Orthogonal to this decision |
| ADR-4 (signal graph as universal reactivity) | Unaffected — a promoted signal is still a `sig.Signal`, read the same way | Unaffected | Unaffected | — |
| ADR-11 | **Completed**, not amended in spirit — the original "remove the corresponding param" clause finally ships | Reversed without new evidence | Partially reversed | — |
| ADR-13 | Unaffected | Unaffected | Unaffected | Cited by the task; no interaction found — ADR-13 governs N10/theme, a disjoint subsystem |
| ADR-17 / content-addressed identity | **No component id changes** (declaration-tier, confirmed in code) — the one caveat is N5-synthesized (content-tier) actions, flagged as a required test | N/A | N/A | This was the highest-uncertainty item before verification; resolved cleanly |
| Frontend neutrality | Unaffected — this is a UIR-level rewrite, upstream of every generator (ADR-1's whole reason for N11 existing in the first place) | Unaffected | Unaffected | — |
| Generator neutrality | Unaffected for the same reason | Unaffected | Unaffected | — |
| Deterministic output | Preserved — `classify`/`rewrite` are pure functions of the program; extending them to touch `ui.Component.params` does not introduce traversal-order dependence, provided the new code sorts exactly as `rewrite()` already does for signals/actions | — | — | Required test: determinism, extended |
| Fixed point / idempotence | Preserved, same argument as above, requires a second `run()` to be a no-op once params are already rewritten | — | — | Required test |
| Incremental compilation | Preserved by the identity finding above; requires an explicit test proving an unrelated file edit does not re-trigger promotion or change the promoted component's id | — | — | Required test — currently **untested** even for N11 as it exists today |
| Override anchors | Unaffected — anchors are structural paths, independent of `params`/`id` | — | — | — |
| Multi-hop prop drilling | **Explicitly refused**, new diagnostic, not silently mishandled | Already refused (nothing promotes) | Already refused | This is the honest boundary of what's provable today |
| Callbacks / actions | Handled — this is ADR-11's original motivating case | Refused permanently | Refused (required params) | — |
| Signals | Handled | Refused permanently | Refused (required params) | — |
| Primitive values | Unaffected — primitives were never promoted, never had this problem | — | — | — |
| Live objects (ADR-11a, W02) | Unaffected — ADR-11a already refuses these (`BRG2301`); this amendment does not touch that path | — | — | — |
| Optional/default parameters | Handled identically to required ones under A (the param is removed either way) — C's premise that optionality matters is not borne out by the evidence found | — | Only case C covers, and it's unmeasured whether it exists in the corpus at all | — |

**Multi-caller consensus** (the N5 precedent's warning, applied): added as a hard precondition not
listed in the original four options — N11 may remove a param from `ui.Component.params` only if
**every** transition/route reaching that component agrees the argument should be promoted (i.e., no
reaching call site supplies it as an unpromoted primitive). Where callers disagree, the component's
interface is left alone and a new diagnostic explains which call site blocked the promotion. This
follows directly from N5's own stated reasoning, not from this document's invention.

## Diagnostic implications

- The existing `BRG2302` ("promotion is never silent") should announce the **interface** change too,
  not just the store synthesis — a param disappearing from a component's declared signature is exactly
  the kind of thing ADR-11's own ethos ("promotion is never silent") was written to cover.
- A **new** diagnostic is needed for the multi-hop / unprovable-forwarding case (extends the `BRG2303`
  family: "unpromotable — closes over a value with no provable identity" is almost the right shape
  already; the forwarded case needs its own message naming the intermediate component and the missing
  provenance link, so a developer knows to add an override or restructure the forward rather than
  wonder why nothing happened).
- A **new** diagnostic is needed for the multi-caller-conflict precondition above — otherwise a
  promotion silently refusing to fire (because one caller disagreed) looks identical to "nothing to
  promote here," which is not distinguishable to a developer without one.
- `INV-18`'s enforcement gap (found during this investigation, not previously documented): the pass's
  own code only *reports* `BRG2303` on the unpromotable path — it does not additionally assert the
  post-condition programmatically anywhere in `packages/compiler/src/internal/normalize/`. This
  amendment does not fix that, but the implementation milestone below should, since the same gap would
  otherwise apply identically to the new interface-rewrite output.

## Corpus evidence (used only where the pattern is actually shown to exist)

- **`hello_bridge`** — the only application whose full source is in this repository. Contains exactly
  the motivating pattern (`home: LoginScreen(isDark:, onToggleTheme:)`, both required, both currently
  causing `BRG3013`), plus the second-hop forward into `HomeScreen` used for the multi-hop analysis
  above. Both are directly reproduced against HEAD in this session, not estimated.
- **continuum / unichat** — no source for either is checked into this repository; every number below is
  a citation of an existing committed document, not a fresh measurement, and is flagged accordingly.
  - `docs/m6/GAP-route-constructor-arguments.md` (position table) measures **continuum: 7 `home:`
    construction sites carrying arguments; unichat: 0** (unichat's declarative routing is dominated by
    `onGenerateRoute`, a different shape). This is the one number in this section that directly bears on
    whether the pattern recurs outside `hello_bridge` — and it does, in continuum, at a small but
    nonzero count.
  - That table's own provenance is a `tools/`-external script not committed to this repository — only
    three synthetic single-file unit probes (`dart/bridge_analyzer/test/route_argument_positions_test.dart`)
    independently prove the *mechanism*, not the corpus count. **The count is cited, not reproduced.**
  - Continuum's file count is **inconsistent across the docs that cite it** (7 files in
    `docs/m5/m5a-large-application-validation.md`, 159 in `docs/m6/m6d-navigation-model-validation.md`,
    225 in the same GAP doc that gives the `home:` count above) — treat any single continuum figure as
    provisional.
  - **Multi-hop forwarding, optional/defaulted route parameters, and primitive-vs-callback relative
    frequency have zero continuum/unichat measurement anywhere in this repository's docs.** Any claim
    about their frequency in those apps would be new and unverified — none is made in this decision.
  - **ADR-11's own original evidence was never continuum/unichat either** — tracing M0-T3/T4/T6
    precisely: M0-T3 and M0-T4 are `hello_bridge`-derived; M0-T6 ran against `hello_bridge` ("App A")
    and a **synthetic** app the team wrote itself, `shop_bridge` ("App B", `docs/m0/m0-final-review.md`
    condition 19: *"we chose both the constructs and the catalog that recognises them"*). ADR-11a (the
    live-object case) is explicitly *"evidence insufficient — deferred"* in its own text and was never
    revisited with real continuum/unichat data. This amendment does not need to resolve ADR-11a; it is
    orthogonal (live objects are never promoted under any option here).

**What this means for confidence in the decision**: the core promotable pattern (a required callback or
component-scoped signal as a declarative route's constructor argument) is evidenced twice
independently — `hello_bridge` (fully reproduced) and continuum (cited, single-source, count
provisional). That is enough to justify finishing ADR-11's original decision rather than reversing it,
but not enough to claim the pattern is common — it is evidenced as **real and recurring**, not as
**frequent**.

## Decision

**N11 gains conditional authority to rewrite a destination component's declared interface
(`ui.Component.params`) and the internal reads inside it, scoped to promotions it can prove — single
boundary only, no multi-hop forwarding, and only when every route/transition reaching that component
agrees on the promotion.** Mechanically, this is Option A, implemented through Option D's existing
mechanism (a promoted signal/action is consumed the way the generator's `signalRead` fallback already
resolves any store-scoped signal — a direct, `target`-linked reference, not a constructor param) — no
schema amendment is required, though (per Option D's evaluation above) this specific consumption shape
has no corpus example yet and should be the first thing the M7-E3 build proof exercises.

Restated precisely, as the four sub-rules a future implementation must hold to:

1. A route/transition argument may only be stripped and its component param removed when the binding
   resolves to a `target` NodeId naming a `sig.Action` or `sig.Signal` — the same classification N11
   already performs. Never inferred from a parameter's name.
2. The param is removed from `ui.Component.params` only if **every** route/transition that constructs
   that component agrees the argument should be promoted. A single disagreeing caller blocks removal
   for all callers, with a diagnostic naming which one.
3. Internal reads inside the component are rewritten from a param reference to a direct store reference
   (`bind.Signal`/action-dispatch on the promoted store), exactly as an already-`declared` store is
   consumed today. No new UIR vocabulary.
4. A forwarding reference with no resolvable `target` (the second-hop / multi-component case) is **left
   alone and diagnosed**, not promoted and not silently ignored. This is a scope boundary, not a
   permanent refusal — see Consequences for what would change it.

This is exactly what ADR-11 specified in 2026-07-12 and never shipped, narrowed by two things learned
since: the multi-hop provenance gap (a schema/extraction limitation, not an implementation gap), and the
multi-caller-consensus requirement (an N5-precedented correctness constraint the original text did not
mention).

## Rejected alternatives

- **B (immutable interfaces, refuse forever)** — rejected because it reverses ADR-11's own decision
  without new evidence that the decision was wrong, and leaves a reproduced, corpus-recurring pattern
  permanently unsupported rather than merely unimplemented.
- **C (optional-only stripping)** — rejected because it covers none of the one case this repository can
  fully reproduce (`hello_bridge`'s both-required params), and whether continuum's pattern is
  optional-typed is unmeasured, not merely unmeasured-and-assumed-favorable.
- **Unscoped Option A (full recursive/multi-hop promotion)** — rejected, not because it's undesirable,
  but because the UIR as it exists today cannot prove it without inferring from names, which is
  explicitly disallowed. This is a "not yet," not a "no" — see Consequences.

## Implementation constraints (for the milestone below, not for this document)

- N11 must gain a `requiresAnalyses` dependency capable of resolving, for a given `ui.Component`, every
  `app.Route`/`app.RouteTransition` that constructs it — `nav-graph` does not currently expose this
  (it maps route → component, not component → all its callers). This is itself a small, local extension
  of `nav_graph.ts`, not a new pass.
  - This is also the fix for the *other* gap M7-D found and this document is not otherwise
    responsible for: `nav-graph` must start building transitions from `app.Route.arguments` as well as
    `app.RouteTransition.arguments`, or the declarative-route case (the one motivating this whole
    amendment) still never reaches N11 at all. Without this, the decision above has nothing to attach
    to.
- Component-param removal must be a deterministic, sorted rewrite exactly like N11's existing signal
  promotion (`rewrite()` already sorts by NodeId for this reason — extend the same discipline).
- The multi-hop refusal diagnostic and the multi-caller-conflict diagnostic are both new work, not
  extensions of existing ones by mere reuse of a code.

## Required tests for the future implementation

1. Unit: a `ui.Component` node is added to N11's existing test fixtures (currently absent — confirmed
   by direct reading of `packages/compiler/tests/n9_n10_n11.test.ts`, which routes to `'compHome'`
   without ever declaring it), and the promoted-param case asserts the component's `params` post-run,
   not just the transition's stripped arguments.
2. Unit (negative): two transitions reach the same component; one supplies the argument as an
   unpromoted primitive. Assert the param is **not** removed, and the conflict diagnostic fires.
3. Unit (negative): a forwarding reference with no `target` (the `HomeScreen` shape). Assert the new
   refusal diagnostic fires, naming the intermediate component, and that nothing is silently dropped.
4. Unit: an N5-synthesized (content-tier) action is the promotion target. Assert its id's stability (or
   documented instability) is what the implementation intends — this case was not exercised by anything
   found in this investigation.
5. Determinism: extend `just determinism`'s existing 3-run byte-comparison to a fixture exercising this
   rewrite.
6. Fixed point: a second `N11.run()` over already-rewritten output is a no-op (extends the existing
   "is deterministic and a fixed point" pattern already used for every other pass in this file).
7. Incremental: an edit to an unrelated file does not change the rewritten component's id or re-fire
   the promotion. **Currently no incremental test exists for N11 at all** — this is a pre-existing gap
   this milestone should close for the pass as a whole, not just the new behavior.
8. Corpus/build proof: `hello_bridge` reaches the same `tsc`-checked build proof `layout_proof.ndjson`
   and `counter` already have (`build.test.ts`) — today it does not, and cannot, because generation
   currently aborts on unrelated errors before reaching this code path. This is the test that would
   have caught the "renders `<HomeScreen />` bare" defect found during this investigation; recommended
   as the concrete acceptance bar for the milestone, not merely "no BRG3013."
9. Diagnostic tests for all three new/extended codes (interface-rewrite announcement, multi-hop
   refusal, multi-caller conflict), asserting message content names the specific blocking cause —
   consistent with this project's stated diagnostic-quality bar throughout M6/M7.

## Consequences

- `hello_bridge`'s `BRG3013` for the declarative-route case is resolved once implemented; `HomeScreen`'s
  bare-render defect (found here) is **not** resolved by this decision alone and should be filed
  separately, since it is reachable independent of promotion.
- The multi-hop boundary in this decision is not permanent. It changes if either: (a) extraction is
  taught to link a component's own param back to whatever call-site argument fed it (giving `logic.Ref`
  a resolvable target even inside a component's own body), or (b) a deliberate whole-program
  provenance analysis is scoped as its own milestone, explicitly named as such rather than folded
  quietly into N11.
- This amendment does not touch ADR-11a (live objects, W02) — that remains "evidence insufficient,
  deferred," unchanged.
- No schema amendment is required. No generator changes are required by this document (the acceptance
  test in the milestone below will require them, but that is M7-E3's scope, not this one's).

## Open questions

- Whether continuum's actual `home:`-with-arguments call sites use required or optional/defaulted
  parameters is unmeasured (no continuum source is in this repository). This does not block the
  decision — the reproduced `hello_bridge` case is required-only and sufficient evidence on its own —
  but it should be checked before generalizing this decision's coverage claims beyond what's proven.
- INV-18's enforcement is currently structural-only (no standalone assertion). Whether to add one is an
  implementation decision for M7-E3, not an architectural one for this document.

---

## Proposed next milestone — M7-E3: declarative and cross-boundary component-interface promotion

**Scope**: implement the decision above. Nothing in this section is authorized to start yet.

**Files/subsystems expected to change**:
- `packages/compiler/src/internal/analysis/nav_graph.ts` — extend `transitions` (or add a parallel
  structure) to include `app.Route.arguments`, and add a component → reaching-callers index.
- `packages/compiler/src/internal/passes/n11_promote_cross_route_state.ts` — the interface-rewrite
  logic: consensus check, `ui.Component.params` removal, internal `bind.Param` → `bind.Signal`/action
  rewrite, the two new diagnostics.
- `packages/compiler/src/internal/passes/n11_promote_cross_route_state.ts`'s diagnostic codes (or a
  shared diagnostics module) — new codes for interface-rewrite announcement, multi-hop refusal,
  multi-caller conflict.
- `packages/generators/react/src/internal/pipeline.ts` — once params are actually removed upstream,
  the `rendered()`/`componentScreens` machinery should stop needing its current `unreachable`-diagnostic
  path for the cases N11 now resolves (the diagnostic stays for what N11 still refuses).
- Test files: `packages/compiler/tests/n9_n10_n11.test.ts` (extended per "Required tests" above),
  `packages/generators/react/tests/build.test.ts` (hello_bridge joins the tsc build-proof).

**Algorithm** (per the Decision section): resolve nav-graph → for each component, collect every
reaching route/transition argument → classify each (existing `classify()`) → require unanimous
promotable-or-absent across all reaching callers → if unanimous-promotable, promote signal/action,
strip all reaching arguments, remove the component param, rewrite internal reads → if not unanimous,
diagnose and leave the interface untouched → if any reaching argument is an untargeted forwarding
reference, diagnose and leave that specific path untouched.

**Corpus proof**: `hello_bridge` end-to-end, `tsc`-checked, joining the existing build-proof set.
Continuum's `home:`-with-arguments pattern cannot be corpus-proven from inside this repository (no
source available) — note this limitation in the milestone report rather than asserting coverage beyond
`hello_bridge`.

**Determinism / fixed-point / incremental tests**: as listed above, closing the pre-existing gap
(no incremental test exists for N11 at all today) alongside the new behavior's own coverage.

**Generator build proof**: `hello_bridge` added to `build.test.ts`'s tsc-checked set — this is both the
new behavior's acceptance test and the only thing that would have caught the pre-existing
bare-`<HomeScreen />`-render defect found during this investigation.

Not authorized by this document. A separate task should scope and begin M7-E3.
