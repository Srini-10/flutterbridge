# M8-G — Multi-hop provenance reality audit

**Type:** measurement + architecture decision only. No production source changed (§19).
**Date:** 2026-08-21. **Baseline:** `d629912` (== `origin/main`, clean tree, confirmed before any
measurement).

## Headline finding

None of Continuum's current 3 (droid) / 2 (mac) normalize-stage blockers are genuine multi-hop
parameter forwarding. One (`onExportLogs`) is misattributed to the multi-hop diagnostic by a separate,
more foundational gap — a method that writes no signal is invisible to extraction, not just unmodeled
as an action. The other two (`diagnostics`, `platformSection`) are the unrelated, correctly-firing
"object across a route boundary" rule (ADR-11a), which multi-hop provenance would not touch. **Building
multi-hop provenance next would not move Continuum's build forward at all.** §13 has the full audit;
§19 has the recommendation this leads to.

## 1. Fresh baseline

```
git status --short   → (clean)
git rev-parse HEAD    → d62991206e9e4b8aee5ef28baf99a3af38e9fb0c
git rev-parse origin/main → d62991206e9e4b8aee5ef28baf99a3af38e9fb0c
```
Continuum HEAD unchanged since M8-A: `a7a519f`.

Fresh `bridge_analyzer` run (not reused from M8-F's own written counts):

| | droid | mac |
|---|---:|---:|
| Analyzer errors | 0 | 0 |
| Analyzer warnings | 117 | 88 |
| Records written | 208 | 191 |
| Normalize diagnostics (blocking) | 3 (1×BRG2305, 2×BRG2301) | 2 (1×BRG2305, 1×BRG2301) |
| Generate reached | No | No |
| Files emitted | 0 | 0 |

Identical to M8-F's own written counts — no drift, as expected from an unchanged Continuum HEAD.

## 2. Every real multi-hop site

| App | Code | Argument | Site |
|---|---|---|---|
| droid, mac | BRG2305 | `onExportLogs` | `pairing_page.dart:427` (droid) / `:399` (mac) |
| droid, mac | BRG2301 | `diagnostics` | `pairing_page.dart:432` (droid) / `:404` (mac) |
| droid only | BRG2301 | `platformSection` | `pairing_page.dart:452` (mac passes `null` — primitive, no diagnostic) |

### `onExportLogs` — traced, and it is not a forward

`onForget: _forget` (the sibling argument on the same call) is correctly *promoted* (writes `_stage`,
`_peer`, `_messages` via `setState`) and never appears in the diagnostics — confirming the contrast is
real, not incidental. `_exportLogs`, by contrast:

```dart
Future<String> _exportLogs() async {           // pairing_page.dart:406
  final dir = await getApplicationDocumentsDirectory();
  ...
  return file.path;                             // writes no signal — a pure query/IO method
}
...
onExportLogs: _exportLogs,                      // :427 — a direct, zero-hop tear-off
```

`_exportLogs` is `_PairingPageState`'s **own** method, referenced **directly**, with **zero hops** —
not received as a parameter and forwarded. Its raw UIR binding is `bind.Expr{expr: logic.Ref{name:
"_exportLogs", ...}}` with **no `target` field**. Searching the raw document for any node at
`pairing_page.dart:406` (its declaration) returns **zero results** — `_exportLogs` is never extracted
as any declaration at all. Confirmed root cause (`dart/bridge_analyzer/lib/src/session/extract/
signal_extractor.dart:187-214`, "1b. Actions, named before any body is extracted"): only a method whose
`_signalsWrittenBy` set is non-empty becomes `sig.Action` — and, separately (§16), only such a method's
body is ever walked at all. `_exportLogs` writes nothing, so it is never modeled, and the *reference* to
it reaches N11 as an untargeted `logic.Ref` — the identical shape `classify()` uses for a genuinely
forwarded parameter (`n11_promote_cross_route_state.ts:404-406`). N11 cannot distinguish the two; both
report `BRG2305` with wording that names "the source component's own constructor parameter" — which is
false here. §14 documents this as stale wording without changing it.

### `diagnostics` / `platformSection` — traced, and they are genuinely something else

```dart
diagnostics: DiagnosticsInfo(connected: ..., peerName: ..., ...),   // logic.New → 'object' → BRG2301
platformSection: NotificationFilterSection(settings: ..., ...),      // logic.New → 'object' → BRG2301
```

Both are direct object constructions (`logic.New`), correctly classified `object` by `classify()`
(`n11_promote_cross_route_state.ts:416`) — the pre-existing, unrelated rule that a live object cannot
cross a URL boundary (ADR-11a). This has nothing to do with forwarding or provenance; it predates M8-F
and is unaffected by any provenance work.

## 3. hello_bridge comparison

`LoginScreen`/`HomeScreen` reproduce a **genuine** two-hop forward, and remain the correct reference case
— confirmed by re-running `bridge build` on the fixture fresh:

```
BRG2305 `isDark` forwards ... (case 4)
BRG2305 `onToggleTheme` forwards ... (case 4)
BRG2305 `isDark` is promotable ... but the component itself forwards it onward (outbound hazard)
BRG2305 `onToggleTheme` is promotable ... but the component itself forwards it onward (outbound hazard)
```

Traced: `main.dart:51` passes a **real** signal (`isDark`, `bind.Signal`) and a **real, targeted**
action reference (`_toggleTheme`, `logic.Ref{target: <sig.Action id>}` — it writes theme state) into
`LoginScreen`. `LoginScreen`'s own `required this.isDark`/`required this.onToggleTheme` are genuine
constructor parameters. Inside `_submit` (an async method that **does** write state earlier —
`_error`, `_isSubmitting` — so its body is walked at all, §16), `login_screen.dart:59-60` forwards
`widget.isDark`/`widget.onToggleTheme` **unchanged, same name** into a **second** `Navigator.push`,
constructing `HomeScreen`. Both forwards are untargeted `logic.Ref`s.

- **Same root cause?** Yes — an untargeted reference to a value that genuinely originates as a
  constructor parameter, with no id to name it by.
- **Same missing identity?** Yes — `ParamDecl` has no id (§5).
- **Same forwarding shape?** Yes — direct, unchanged, same-name (ladder rung B, folded with D — this
  *is* the two-hop case).
- **Same proposed solution?** Yes (§14).

Continuum's own current diagnostics do **not** reproduce this shape (§2) — hello_bridge remains the only
uncontaminated, genuine example on hand. Not generalized to Continuum without independent agreement;
§4's purpose-built probe supplies that agreement instead, on a case Continuum's own source does not
currently exercise.

## 4. Reduction ladder — real pipeline, real evidence

Built `fixtures/apps/multihop_probe/` (temporary — `RootScreen → MidScreen → LeafScreen → DeeperScreen`,
three real, `await`ed `Navigator.push` boundaries), pub-get'ed, `flutter analyze` clean, run through the
real `bridge build` (analyze → normalize) — no hand-authored UIR. Deleted after evidence extraction
(§20); not part of the commit.

| Rung | Shape | Argument | Result |
|---|---|---|---:|
| A | direct route arg, consumed by destination | `count`/`onIncrement`/`label`/`maybe` (Root→Mid) | clean — no diagnostic |
| B | direct unchanged forward | `value: widget.count` (Mid→Leaf) | **BRG2305** |
| C | renamed forward | `renamedValue: widget.count` | **BRG2305** |
| D | two-hop unchanged | (= B: root signal → Mid.count → Leaf.value) | **BRG2305** |
| E | three-hop unchanged | `value`/`onTap: widget.value`/`widget.onTap` (Leaf→Deeper) | **BRG2305** ×2 |
| F | conditional forwarding | `conditional: widget.count > 0 ? widget.count : 0` | clean — not reported |
| G | action/callback forwarding | `onTap: widget.onIncrement` | **BRG2305** |
| H | primitive constant | `constant: 'leaf-constant'` | clean — control case |
| I | optional parameter forwarding | `optionalForward: widget.maybe` (nullable) | **BRG2305** |
| J | transformed forwarding | `transformed: widget.count + 1` | clean — not reported |
| K | closure forwarding | `onTapWrapped: () => widget.onIncrement()` | **BRG2303** (different code) |
| L | conditional forwarding | (= F) | clean |
| M | same spelling, unrelated declaration | Leaf's own `label` literal, never reads `widget.label` | clean — correctly not flagged |
| N | two different source declarations, same name | hello_bridge's `LoginScreen.isDark`/`HomeScreen.isDark` `FieldDecl`s (§5) | **id collision** (content hash) |

## 5. Exact point where identity disappears

A widget constructor field (`required this.count`) is extracted into `ui.Component.params` as a
`ParamDecl` — confirmed directly against both the schema (`packages/uir/schema/l1.json`:
`additionalProperties: false, required: [name, type]` — **no `id` property exists**) and a real emitted
instance (`{"name": "count", "required": true, "type": {...}}`, no `id` key, from the probe's own
`MidScreen` component).

A read of that parameter becomes either `bind.Param{param: "count"}` (a binding-position read) or an
untargeted `logic.Ref{name: "count", type: {...}}` (an expression-position read) — confirmed directly:
`value`/`renamedValue`'s bindings in the probe both wrap `logic.Ref{id: "9189bc8de30f8cf1", name:
"count", ...}` — **the identical id**, despite two different call sites, because content-addressing
strips `span` (§6). Neither shape carries a `target` field naming *which* declaration `"count"` is —
because there is no declaration id to name.

Identity is lost at the exact moment a constructor parameter is extracted: it becomes a **value**
(a `ParamDecl` entry), never a **declaration**. Every read of it afterward is name-keyed, never
id-targeted — by construction, not by a missed case.

## 6. Analyzer element identity findings

`package:analyzer`'s resolved element model gives a Dart constructor's formal parameter (`count` on
`MidScreen`'s constructor) the same full, stable, comparable identity every other resolved element gets
— a `FormalParameterElement`, with a declaring element, a source location, a type. This is not a gap in
the Dart analyzer; it is standard resolved-AST behavior, identical in kind to what already backs
`sig.Action`/`sig.Signal`/`ui.Component` identity.

`Symbols` (`dart/bridge_analyzer/lib/src/session/extract/symbol_table.dart`) has a symbol constructor
for every declaration kind the compiler currently models: `type`, `function`, `variable`, `component`,
`signal`, `derived`, `action`, `effect`, `store`, `route`, `navigation`, `token`. **There is no `param`
constructor.** The vocabulary itself has no way to name a parameter as a declaration — the identity
exists in analyzer-land and is discarded at the extraction boundary by omission, confirming Phase 5's
question precisely: **NO**, FlutterBridge cannot today prove `Child(foo: parentFoo)` means "child's foo
originates from parent's parentFoo," and the reason is that nothing downstream of the resolved Dart
element ever gets the chance to say so.

## 7. Schema adequacy — options evaluated

Grounded in ADR-17 ISSUE-6's own **ratified, two-tier identity model** — declarations get a
**symbol**-derived id (`comp:lib/a.dart#LoginScreen`); tree nodes get a **content**-derived id, stripped
of `id`/`anchor`/`span`. `ParamDecl` currently sits in **neither tier** — it is a plain value with no
identity at all. Every option below is judged against whether it restores `ParamDecl` to the existing
two-tier model, or invents a third one.

| | name-matching required? | rename-stable? | cross-file/package-stable? | multiple same-name params? | callbacks? | signals? | optional params? | arbitrary hop count? | NodeId impact | normalize impact | generator impact | compat |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** — declaration-tier id on `ParamDecl` (symbol e.g. `param:lib/mid_screen.dart#MidScreen.count`), `target` on `bind.Param`/untargeted `logic.Ref` | No | Yes (id is symbol-derived, name is just part of the symbol like every other declaration) | Yes — same `Symbols.pathOf` machinery M8-F already built | Yes — symbol is `Owner.paramName`, exactly like `sig:path#Owner.member` | Yes | Yes | Yes | Yes, recursively (each hop is one more resolved id) | New declaration-tier id; existing tiers unaffected | N11's `classify()` gains one more resolvable case; existing cases unchanged | None required beyond what already exists | Additive-only; old documents lack the field, still valid |
| **B** — source/target field pair added directly to `bind.Param` only | No | Yes | Yes, if built the same way | Yes | Only if `bind.Param` is made to cover callback reads too — today callback reads take the `logic.Ref` path, not `bind.Param` (§5), so this option's coverage is narrower unless extended to match A | Yes | Yes | Yes | Smaller — one node kind touched | Same as A for the cases it covers | None | Additive |
| **C** — represent parameter declarations as full declaration-tier nodes (a real `logic.ParamDecl`-*node*, not an inline value) | No | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Larger — a new node kind, not just a new field; every consumer of `ui.Component.params` must be re-examined for whether it now expects nodes vs. values | Same benefit as A, more invasive to earn it | None | Additive but bigger diff |
| **D** — whole-program provenance analysis without any schema change (infer forwarding by matching name+type+position across the call graph) | **Yes** — this is exactly the "inferring from its name" N11's own comment (`n11_promote_cross_route_state.ts:29-30`) explicitly refuses to do | No — a rename anywhere in the chain silently breaks or silently mismatches | No — name collisions are the failure mode, not the safety net | **Actively dangerous** — rung N (§4) proves two same-named, unrelated declarations already collide at the *content-hash* level; a name-matching pass would compound this, not fix it | Fragile | Fragile | Fragile | Compounds with each hop | None | Reintroduces exactly the heuristic the pass was designed never to use | None | Regresses a stated architectural guarantee |
| **E** — another mechanism found in the analyzer | Investigated: nothing in `package:analyzer`'s public surface offers a *cross-file* stable id usable without extraction choosing to carry it — the element identity is real (§6) but is scoped to one analysis session; UIR's own symbol-based declaration id (already used for everything else) is the correct place to anchor it, which is Option A | — | — | — | — | — | — | — | — | — | — |

**Option A is the only one that extends the existing, ratified model rather than inventing a new one or
regressing a stated guarantee.** It is Option B generalized to cover both places a parameter is read
(§5's two shapes), and a narrower, less invasive version of Option C. Option D is explicitly what
M7-E2/M7-E3 already rejected, correctly (§13) — rung N's real evidence (id collision on a purely
structural basis) shows exactly why: name-based inference has no floor to catch a false positive on.

## 8. NodeId consequences (analysis only — no rule changed in M8-G)

If Option A is adopted, `ParamDecl`'s new id is a **symbol**, mirroring every other declaration:
`param:<path>#<Owner>.<paramName>` — the identical shape `sig:`/`act:`/`der:` already use
(`symbol_table.dart:50-56`). Collision cases, reasoned against that shape:

| Case | Outcome under `param:<path>#<Owner>.<name>` |
|---|---|
| Same param name in two components | Distinct — `Owner` differs (`param:...#LoginScreen.isDark` vs. `param:...#HomeScreen.isDark`) — this is exactly rung N, and exactly what currently collides (§5) and would stop colliding. |
| Same param name in two constructors of the same class | N/A — a Dart class has one constructor's worth of fields in this model (StatefulWidget's field-promoted constructor params); would need the same disambiguation `sig.Action`/`sig.Signal` already have for overloaded members, which none of this milestone's evidence shows a real case of. |
| Same component name in different packages | Distinct — `path` is the full `package:<name>/<rest>` URI for a local dependency (M8-F's own `Symbols.pathOf`), never collapsible with a same-named component in a different package. |
| Renamed parameter | New symbol (the name is part of it) — same behavior every other declaration already has: a rename is a new declaration, and every existing reference is inside the *same* component's own render, re-extracted alongside the rename. No cross-file dangling reference risk, because a parameter's own readers are never outside its declaring component. |
| Reordered parameters | No effect — the symbol has no positional component. |
| Optional vs. required | No effect — `required` stays a plain field on `ParamDecl`, not part of the symbol. |
| Callback vs. primitive | No effect — `type` stays a plain field, not part of the symbol. |

No rule proposed here departs from the existing symbol-derivation pattern; this is confirmation the
existing rules already cover the case, not a new rule.

## 9. N11 ownership

Read in full (`packages/compiler/src/internal/passes/n11_promote_cross_route_state.ts`, 609 lines).
Structure: classify every (boundary, argument) once up front (`classified`); report unconditional
verdicts (`object`, `unpromotable`, `forwarded`) immediately; group boundaries with a known destination
by (component, argument name) for **consensus** (`groupByComponentAndName`); require every reaching
caller to agree before promoting-and-stripping; check **outbound hazard** (does the destination itself
re-forward the same name, untargeted, into a further boundary) before removing a now-promotable
parameter from the component's declared interface; rewrite in one pass (`rewrite`), recursively walking
`render` to redirect `bind.Param`/untargeted-`logic.Ref` reads to the promoted store.

If Option A supplies a resolvable `target` for a forwarded reference, **N11's existing consensus and
outbound-hazard machinery already generalizes to it with no redesign**: `classify()`'s `forwarded` case
(currently a dead end — "cannot prove... refuses to") becomes a normal `action`/`signal` verdict once
the reference resolves, and the *entire* consensus/outbound-hazard/rewrite pipeline downstream of
`classify()` was written generically over `Verdict`, not over "verdicts classify() currently knows how
to produce." The one addition N11 itself would need is **recursion**: today `outboundHazard` checks one
level of re-forwarding and refuses rather than chasing it; with resolvable targets, the natural
extension is to *follow* the chain to its root promotable declaration (an action/signal, always — a
forward chain has to bottom out somewhere real) rather than stopping at the first hop.

Answering Phase 8's four options directly: **(A/B) hybrid.** N11 does not need a *separate* pass —
resolvable `target`s (upstream, in extraction — Option C's "provenance pass" is really just "extraction
producing `target` in the first place," which is what §7's Option A already is, not a distinct
normalize-stage pass) let N11's *existing* recursive-in-spirit structure (it already walks `render` to
rewrite chained reads) do the multi-hop promotion itself, by chasing `target` through however many
`ParamDecl`s it takes to reach a `sig.Action`/`sig.Signal`. **(D) does not apply** — this is squarely
N11's own domain; nothing here calls for un-owning the promotion decision from N11.

## 10. Consensus across multiple callers

Traced against the actual implementation (`n11_promote_cross_route_state.ts:172-271`) rather than a
fresh two-caller fixture — the pass is a pure function over `classified` with no runtime-dependent
branching, so tracing it is exact, not speculative.

- **Caller A: `Screen(value: signalA)`, Caller B: `Screen(value: signalB)`** (different underlying
  signals) — `perBoundary` collects both verdicts; `targets = new Set([targetKey(A), targetKey(B)])` has
  size 2, so `sameTarget` is `false`. Falls into the `missing || !allPromotable || !sameTarget` branch →
  **`BRG2306`**, "promotable on some, but not every, route... reaching callers promote it to different
  underlying declarations." Correct and unaffected by provenance: this is exactly the invariant M7-E3
  built consensus to enforce, and it holds regardless of whether `value` itself is a direct signal or (if
  Option A ships) a resolved forward — the *comparison* is on the resolved target, not on the syntactic
  shape.
- **Caller A: `Screen(value: signalA)`, Caller B: `Screen(value: signalA)`** (same signal) — both verdicts
  key to the identical `s:<signalA id>`; `sameTarget` is `true`; consensus holds; promotion proceeds
  (subject to the outbound-hazard check).
- **Caller A supplies the argument, Caller B omits an optional argument** — `perBoundary` computes one
  entry per *reaching* boundary by looking up `b.arguments.find((a) => a.name === name)`; Caller B's
  entry has `argument === undefined`, so `verdict === undefined`, so `missing` is `true` →
  **`BRG2306`** again, correctly blocking removal (an omitted optional argument at one call site means
  the parameter is still load-bearing there, whatever it resolves to at the others).

**The invariant holds untouched by provenance.** Consensus is computed on the *resolved target* a
verdict carries (`s:<id>`/`a:<id>`), never on traversal order and never on which caller happened to be
seen first (`classified` is built by one `flatMap` over `graph.boundaries.flatMap(boundary =>
boundary.arguments.map(...))`, and `Set` equality of `targets` is what decides consensus — a data
comparison, not a race). Multi-hop provenance changes *what a verdict can resolve to* (a forwarded
reference can now become `action`/`signal` instead of dead-ending at `forwarded`); it does not touch
*how* consensus is computed once verdicts exist. Never first-caller-wins; never traversal-order-dependent
— confirmed, not merely asserted.

## 11. Cross-package provenance

Reasoned from M8-F's already-built, already-tested `Symbols.pathOf` mechanism
(`dart/bridge_analyzer/lib/src/session/extract/symbol_table.dart`) rather than a new fixture — high
confidence given that mechanism's design is now fully understood (M8-F's own document) and Option A's
`param:` symbol is built the identical way `comp:`/`sig:`/`act:` already are.

`Symbols.pathOf` already resolves a declaring library's URI to either `lib/<rest>` (root package,
unchanged since before M8-F) or the full `package:<name>/<rest>` URI (a local dependency, verified
collision-free against the root package's own paths *and* against every other local dependency's paths
— M8-F §6/§12). A `Symbols.param(...)` constructor built the same way — `param:<path>#<Owner>.<name>`,
with `<path>` computed through the identical `pathOf` call every other `xxxIn` symbol constructor already
uses — inherits package-qualification and collision-freedom **for free**, by construction, not by a new
mechanism. `app package → shared package Component A → shared package Component B` and `app package →
package A → package B` both reduce to the same case M8-F already proved sound: a component in a local
dependency is `path`-addressed by its own `package:` URI regardless of which package constructs it, and
two same-named parameters in two different packages' components never share a `path`, so never share a
symbol. This milestone reintroduces no package-name heuristic — `param:` symbols are structural,
identical in kind to every symbol M8-F already shipped.

## 12. Real Continuum impact

Per §2's trace: **zero** of Continuum's 3 (droid) / 2 (mac) current blocking diagnostics are genuine
multi-hop-forwarding cases.

| | droid | mac |
|---|---:|---:|
| BRG2305 sites | 1 | 1 |
| BRG2301 sites | 2 | 1 |
| Matching proof-safe multi-hop forwarding (§10 grammar) | **0** | **0** |
| Requiring transformed forwarding | 0 | 0 |
| Genuinely unrelated (misattributed `BRG2305`, or correctly-firing `BRG2301`) | 3 | 2 |

Implementing Option A would resolve `onExportLogs`'s `BRG2305` **only if** the separate, more
foundational write-nothing-method gap (§16) were *also* fixed first — Option A gives `ParamDecl` an id,
but `_exportLogs` is not a `ParamDecl` read at all (§2); it is an unresolved reference to a method that
is never extracted as any declaration, for a reason multi-hop provenance does not touch. `diagnostics`/
`platformSection` are not provenance cases at all (§2) — no schema change proposed here would resolve
them; a URL genuinely cannot carry a live object, and the compiler is correctly refusing rather than
silently guessing.

**What would become visible next, if Continuum somehow reached a state with genuine multi-hop sites:**
no real evidence exists to answer this for Continuum specifically, because it currently has none. Based
on hello_bridge's own shape, the next blocker for a *newly-promotable* forwarded callback would most
likely be generator-side function-typed-prop generation (§16 of the M8-F doc's own found-but-unfixed
gap) — a promoted callback still needs a valid TypeScript type once emitted, and that is a wholly
different pipeline stage. Not claimed as demonstrated; stated as the most likely next step based on
the closest available analogue, per this phase's own instruction not to claim more than the diagnostic
graph shows.

## 13. M7-E2 / M7-E3 audit

- **Was M7-E2 correct that multi-hop lacked provenance?** Yes — confirmed independently by this
  milestone's own tracing (§5-§6), not merely re-cited.
- **Is its "not yet" classification still correct?** Yes — nothing since M7-E2 (not M7-N, not M8-F)
  gave `ParamDecl` an identity tier.
- **Does M7-E3's `BRG2305` remain the right refusal?** Yes, for a *genuine* forward (hello_bridge, and
  ladder rungs B/C/D/E/G/I) — refusing rather than guessing at identity remains correct, and §7's Option
  D analysis shows precisely why guessing would be actively unsafe (rung N).
- **Is `outboundHazard` still necessary?** Yes — §10 traces it directly; nothing about M8-F or this
  audit weakens the case a component might both be consensus-promotable *and* itself forward the value
  on, which is exactly the situation it exists to catch.
- **Does any diagnostic wording now misstate the cause?** **Yes, one.** `classify()`'s `forwarded`
  verdict and its `BRG2305` message assume *every* untargeted reference inside a route-argument binding
  is a read of "the source component's own constructor parameter." §2 shows a real, live counterexample:
  `_exportLogs` is untargeted because it was never modeled as a declaration at all (writes no signal),
  not because it is a constructor parameter — `PairingPage` has no `onExportLogs`-named parameter of its
  own to forward. Per this phase's own instruction, **not changed here** (wording-only fixes are
  explicitly out of scope unless materially false *and* the fix is trivial — and the correct fix is not
  wording, it is distinguishing the two untargeted-reference causes in `classify()` itself, which is a
  behavior change, not a doc fix). Documented, not touched.

## 14. Schema / ADR decision

**SCHEMA CHANGE REQUIRED: YES.** Exact proposed amendment (Option A, §7) — not implemented in this
milestone:

1. `ParamDecl` (`packages/uir/schema/l1.json`) gains a declaration-tier `id`, derived the same way every
   other declaration's id already is (`nodeIdOfSymbol`) — symbol shape `param:<path>#<Owner>.<name>`,
   built through the exact `Symbols`/`pathOf` machinery M8-F already shipped.
2. `bind.Param` (`packages/uir/schema/l2.json`) gains an optional `target: NodeId` field, resolving to
   that id when the parameter's own declaration is known — the same pattern `logic.Ref.target` already
   uses for every other declaration kind.
3. An untargeted `logic.Ref` reached through a parameter (§5's second shape) resolves its own `target`
   field the same way, rather than staying permanently untargeted.

**SCHEMA VERSION CONSEQUENCE:** additive only (new optional id on an existing value type, new optional
field on an existing node) — every field is `required: false`/newly-added, so an existing document
without it remains valid; no `x-uir-breaking` migration implied by anything traced in this audit.

**ADR REQUIRED: YES.** This amends ADR-17 ISSUE-6's own ratified two-tier identity table — `ParamDecl`
moving from "no tier" into the declaration tier is exactly the kind of "proven contradiction in the
spec" CLAUDE.md's own rule requires an ADR for: ISSUE-6's table did not anticipate a value type that
carries reference semantics without ever gaining a slot in either tier, and this audit is the proof that
gap is real (§5, §6, ladder rung N's collision). The ADR would not redesign the two-tier model — it
would extend the table by one row, with the identical derivation rule every declaration in it already
uses.

**If NO were the answer instead:** the existing fields that would have to carry the proof are
`bind.Param.param` (a bare string) and untargeted `logic.Ref.name` (also a bare string) — §5 and rung N
show directly why neither can: both are stripped of everything but `{kind, name, type}` under
content-addressing (§6's `stripIdentity`), so two unrelated declarations sharing a name genuinely produce
the same id today. No existing field chain reaches a stable identity; this is not a matter of extraction
failing to read one, per §6's confirmation that the *symbol vocabulary itself* has no `param` case.

## 15. Function-prop `unknown` gap — relationship to multi-hop

Not fixed (per instruction). Traced only for causal coupling:

- **Same root cause?** No. The `unknown`-typed prop gap is a **generator**-stage TypeScript-interface-
  generation defect (a function-typed constructor parameter's *interface field* is typed wrong when
  emitted) — found in M8-F against a component with **no** route boundary at all (`cross_package_ui`'s
  `GreetingCard`, a same-package prop, never forwarded anywhere). Multi-hop provenance operates entirely
  upstream of generation, inside normalize's own promotion decision.
- **Downstream independent blocker?** Yes.
- **Would solving provenance merely expose it?** No — it is already exposed today, independent of any
  route boundary, and would remain exactly as broken whether a callback prop arrived at a component
  directly, through a promoted store, or (if Option A shipped) through a proven multi-hop forward. The
  interface-generation code path that mistypes it does not distinguish any of those origins.
- **Should it be a separate milestone?** Yes — unrelated to multi-hop provenance in either direction;
  it is its own, independent, pre-existing generator defect.

## 16. Mid-function navigation — and a new, adjacent finding

**Confirmed unrelated, as instructed — but this audit found a second, distinct gap in the same
neighborhood, surfaced by mistake while building the reduction ladder, and it is reported because it is
directly relevant to interpreting §2's `onExportLogs` finding.**

M8-E's own P1 ("awaited non-terminal `Navigator.push`" — code runs *after* an awaited push, as in
Continuum's real `_openSettings`, which re-reads `env.settings.featureStates()` after its `await
Navigator.of(context).push(...)`) remains completely untouched by this milestone; nothing here implements
or reasons toward fixing it.

**New finding, not previously documented:** the probe's first draft used `void _go() { Navigator.push
(...); }` — a *single-statement*, non-async method containing nothing but the push, no signal write at
all. It produced **zero** `app.RouteTransition` records for **any** of the three navigations (confirmed:
the raw document had 17 records total, one `app.Route`, no transitions) — not a diagnostic, not a
refusal, just silence. Traced to `signal_extractor.dart`'s "2. Everything that reads or writes those
signals" loop: a method whose `_signalsWrittenBy` set is empty hits `continue` **before** its body is
ever walked (`expressions.bodyOf` is never called for it) — so a `Navigator.push` inside a method that
writes no signal is not merely un-promoted, it is **never visited by extraction at all**. This is the
same root cause behind `onExportLogs` (§2): action recognition is gated on writing state, and a method
that does neither state-writing nor is a lifecycle/getter is invisible in its entirety, whatever it
contains. Fixed in the probe only by adding a trivial `setState` write, to get real evidence for the
ladder at all (§4) — not fixed in production, and not in this milestone's scope to fix. Flagged because
it is arguably a **more foundational** gap than multi-hop provenance itself: it silently drops real
navigations and their arguments from the compiled program with no diagnostic whatsoever, which is a
stronger failure than an honest `BRG2305` refusal. See §19.

## 17. Switch / small gaps

Not implemented, as instructed. Nothing in this audit's tracing touched switch UI lowering, collection
spread, null-widget handling, `SwitchListTile`, `DropTarget`, or `ListTile.dense` — confirmed independent
of multi-hop provenance; no new evidence either way.

## 18. Unrelated blockers explicitly excluded

Per the task's own scope: no N11 behavior change, no schema change, no ADR, no NodeId rule change, no
implementation of Option A, no fix for the function-prop `unknown` gap (§15), no fix for mid-function
navigation (§16, first paragraph), no fix for the newly-found write-nothing-method invisibility (§16,
second paragraph) — reported as a finding, not addressed. No switch/collection/catalog work (§17).

## 19. Exact implementation recommendation

**Do not build multi-hop provenance (Option A) next.** It is architecturally sound (§7-§11), narrow,
consistent with ADR-17's own ratified model, and should eventually be built — but §12 shows directly it
would not move Continuum's real build forward by a single diagnostic today, because Continuum currently
has zero genuine multi-hop sites.

**Recommended next milestone: the write-nothing-method / action-recognition-scope gap (§2, §16).** This
is what is *actually* misattributed as `onExportLogs`'s `BRG2305`, and — more importantly — it is a
**silent** failure mode (a real, user-written navigation vanishing from the compiled program with zero
diagnostic, §16) rather than an honest refusal, which by this project's own stated priorities (Spec §8:
"extraction never throws... everything becomes a diagnostic") is a more serious defect class than a
correctly-refused multi-hop forward. Its smallest sound shape, based on this audit's own tracing: extend
`signal_extractor.dart`'s method classification with a third category — alongside "writes state → action"
and "getter → derived" — for "writes nothing, but is referenced as a callback or contains a recognized
navigation," walking its body regardless of `_signalsWrittenBy` and giving it *some* declaration identity
(the exact node kind is this future milestone's own decision, not asserted here). This would also be the
first real, non-hello_bridge-only exercise of Option A's `param:` machinery once *it* ships, since a
correctly-modeled `_exportLogs` reference could then, in principle, be a genuine forward target rather
than a permanently-unresolvable one — but that ordering (write-nothing-method fix first, multi-hop
provenance after) is itself part of the recommendation, not a claim this audit has proven the second
depends on the first architecturally; they are independent fixes that happen to share one Continuum
symptom.

Multi-hop provenance (Option A) remains the correct **eventual** answer for hello_bridge's own real case
and any future application that genuinely forwards a parameter unchanged across two route boundaries —
it is simply not what Continuum's own current evidence calls for next.
