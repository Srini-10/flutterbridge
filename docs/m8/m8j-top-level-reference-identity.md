# M8-J — Cross-file top-level declaration identity

**Date:** 2026-08-21. **Baseline:** `14c38cc` (== `origin/main`, clean tree, confirmed before any
change).

## Headline finding

Of the three symptoms M8-I named (`protocolVersion`, `formatBytes`, `formatUptime`), **only
`protocolVersion` was a genuine identity gap.** `formatBytes`/`formatUptime`'s references, wherever
Continuum's real source actually reaches them, already carried a real target before this milestone —
their appearance in M8-I's generate-stage sweep was a misattribution, traced here to an unrelated cause
(their one genuinely cross-file call site is never walked at all, for a reason that has nothing to do
with declaration identity). The real gap — a bare or import-prefixed reference to a top-level
`const`/`final` variable, function, or explicit getter declared in a file other than the one reading it
— is fixed. It required no schema change and no ADR: the declaration side already had real,
symbol-derived identity (`Symbols.variable`/`Symbols.function`, unchanged since before this milestone);
only the *reference* side lacked a resolved-element-based lookup, mirroring the exact pattern M8-D
already built for enum constants.

## 1. Baseline

```
git status --short   → (clean)
git rev-parse HEAD    → 14c38cc8ef9a5d1025c21c2ce1ebb3df86d2ccd0
git rev-parse origin/main → 14c38cc8ef9a5d1025c21c2ce1ebb3df86d2ccd0
```

## 2. Real Continuum sites — traced fresh, not assumed identical

| Reference | Declaring file | Declaration kind | Same-file uses | Cross-file/package uses |
|---|---|---|---|---|
| `protocolVersion` | `continuum_protocol/lib/continuum_protocol.dart:22` | top-level `const String` | none | `pairing_page.dart:438` (droid), `:410` (mac) — **untargeted** |
| `formatBytes` | `continuum_ui_kit/lib/continuum_ui_kit.dart:15` | top-level function `String formatBytes(int)` | `continuum_ui_kit.dart:94,97,173` — **already targeted** | `mac/pairing_page.dart:227` — **not extracted at all** (a different cause, §2.1) |
| `formatUptime` | `continuum_ui_kit/lib/src/settings_page.dart:25` | top-level function `String formatUptime(Duration)` | `settings_page.dart:232` — **already targeted** | none found in real Continuum source |

Fresh raw UIR (`dart run bin/bridge_analyzer.dart`, before any code change) confirms this precisely:

```
protocolVersion  file=lib/pages/pairing_page.dart  line=438  target=None
formatBytes      file=package:continuum_ui_kit/continuum_ui_kit.dart  line=94   target=5391b0ee962baf83
formatUptime     file=package:continuum_ui_kit/src/settings_page.dart line=232  target=aee8850e123860e5
```

`5391b0ee962baf83` and `aee8850e123860e5` both resolve to real `logic.FunctionDecl` nodes at the
functions' own declaration sites. **The declaration already existed; the same-file reference already
resolved.** Per the task's own Phase 2 question — this answers it directly: for `formatBytes`/
`formatUptime`, the reachable references are not broken at all.

### 2.1 Why `formatBytes`'s one real cross-file call site is absent, not merely untargeted

`mac/pairing_page.dart:227`: `onOversizeBinary: (clip) => _append('•  clip is
${formatBytes(clip.payload.length)} …')` — a closure argument nested inside `ClipboardModule(...)`'s own
constructor call, itself inside a service-setup routine. The raw UIR has **zero nodes at this line** —
not an untargeted `logic.Ref`, nothing at all. This is a structurally different symptom from
`protocolVersion`'s (a present-but-untargeted reference) and was not investigated further — out of this
milestone's scope (top-level *identity*, not "why is this expression unwalked"), and unrelated to the
fix below, confirmed directly in §14: fixing `protocolVersion` left `formatBytes` exactly as broken as
before, at the identical two sites, for the identical reason.

## 3. Dart resolved-element trace

For `protocolVersion`'s reference (`SimpleIdentifier`), `node.element` resolves to a real
`TopLevelVariableElement` (verified directly against analyzer 14.0.0's own element hierarchy:
`abstract class TopLevelVariableElement implements PropertyInducingElement`). Its `.library.identifier`
gives `package:continuum_protocol/continuum_protocol.dart` — the exact URI `Symbols.pathOf` (M8-F) already
knows how to resolve for a local dependency. Answering Phase 2's ten questions: (1) yes, the analyzer
provides the declaring element; (2) yes, its library is available (`.library.identifier`); (3) yes,
`Symbols.pathOf` resolves it — confirmed, it is the exact mechanism M8-F's cross-package assembly
already built; (4) yes, `continuum_protocol.dart` is extracted (a local dependency, M8-F); (5) yes; (6)
yes, `continuum_protocol` is a local `path:` dependency; (7) no; (8) **yes — a real `logic.FieldDecl`
node exists**, confirmed at `continuum_protocol.dart:22`; (9) `logic.FieldDecl{isStatic: true, isFinal:
true, name: "protocolVersion", initializer: logic.Lit{value: "0.1.0"}}`, with `symbol:
'var:package:continuum_protocol/continuum_protocol.dart#protocolVersion'` already set by
`declaration_extractor.dart`'s existing `TopLevelVariableDeclaration` case; (10) — the declaration
exists in UIR; the reference alone lacked target identity. Confirmed, not assumed: **this is the first
kind of defect (declaration present, reference wiring missing), never the second.**

## 4. Reduction ladder

Built `fixtures/apps/toplevel_probe/` + `fixtures/packages/toplevel_probe_dep/` (temporary — one
`StatefulWidget`, two sibling files, one local-dependency package), pub-get'ed, `flutter analyze` clean,
run through the real analyzer before and after the fix. Deleted after evidence extraction; not part of
the commit.

| Rung | Shape | Before | After |
|---|---|---:|---:|
| A | same-file top-level const | targeted | unchanged |
| B | cross-file top-level const | **untargeted** | **targeted** |
| C | same-file top-level final | (not separately tested — D covers the cross-file case) | — |
| D | cross-file top-level final | **untargeted** | **targeted** |
| E | same-file top-level function | targeted | unchanged |
| F/G | cross-file function, with a parameter | **untargeted** | **targeted** |
| H | async top-level function | **untargeted** | **targeted**, `isAsync` preserved unchanged |
| I | top-level getter | **untargeted** | **targeted** (a third element shape, `GetterElement` with `isOriginDeclaration`, added alongside the variable/function cases) |
| J | static class const | untargeted | **still untargeted — deliberately** (§9) |
| K | static class method | not separately tested; §9's exclusion covers the same reasoning | — |
| L | enum constant | targeted (M8-D, unaffected control) | unchanged |
| M | import-prefix qualification | **untargeted** | **targeted** |
| N | same declaration name, two files | untargeted | **two distinct targets, proven collision-free** |
| O | same name, two packages / local-dependency declaration | untargeted | **targeted, package-qualified via M8-F's existing `Symbols.pathOf`** |
| P | local variable / parameter shadowing a top-level name | correctly untargeted | **still correctly untargeted** — proven via resolved element type-checking, not name comparison |
| Q | SDK top-level declaration (`dart:math`'s `pi`) | correctly untargeted | **still correctly untargeted** |
| R | local path-dependency top-level declaration | untargeted | **targeted** (same evidence as O) |

## 5. Comparison with existing identity architecture

ADR-17 ISSUE-6's two-tier model (declarations: symbol-derived id; tree nodes: content-derived,
stripped of id/anchor/span) already, conceptually, covers a top-level variable or function — and
**already implemented it on the declaration side**: `declaration_extractor.dart`'s
`TopLevelVariableDeclaration` and `FunctionDeclaration` cases both pass `symbol:
out.symbols.variable(...)`/`out.symbols.function(...)` — unconditionally, unrelated to this milestone.
What M8-D built for enum constants (`Symbols.typeIn`, called from a new `_enumConstantTarget(Element?)`
resolver, itself threaded into `_reference`'s existing `staticTarget` parameter) is the *exact* shape
this milestone extends — not a third identity system, the same one, for a different declaration kind.
M8-H's own action-identity fix is a sibling case at a different site (naming discovery inside a class),
not the mechanism reused here. M7-N's store-member identity and M8-F's cross-package path resolution are
both consumed unchanged, by construction: `Symbols.variableIn`/`functionIn` (new) call the identical
`pathOf` every other `xxxIn` method already calls.

## 6. Declaration representation, by kind

- **Top-level const/final variable** → `logic.FieldDecl` (already emitted, `isStatic: true`, symbol-tier
  id via `Symbols.variable`). No new node kind needed.
- **Top-level function** → `logic.FunctionDecl` (already emitted, full body, params, return type, async
  flag — `declaration_extractor.dart`'s `_function`, unconditional on `isGetter`). No new node kind.
- **Top-level getter** → **also** `logic.FunctionDecl` — Dart's own AST does not distinguish a
  `FunctionDeclaration` that happens to be a getter from an ordinary one, and neither does
  `_function`'s existing emission. Confirmed by direct inspection: `crossFileGetter`'s declaration node
  in the fixture is `logic.FunctionDecl`, byte-for-byte the same shape a zero-parameter function would
  produce.
- **Static class member** (`Constants.staticConst`) — **not** the same. `declaration_extractor.dart`'s
  `_fields` (used for a class's own fields, static or instance) emits `logic.FieldDecl` **without a
  `symbol`** — a content-hashed tree node, the same identity gap M8-G found for `ParamDecl`. §9 explains
  why this was left out of scope rather than folded in.

No declaration kind here needed forcing into a node it does not structurally fit — the classification
this milestone's own Phase 5 warned against did not arise, because the existing declaration nodes
already matched their kinds correctly.

## 7. Identity requirements — verified, not asserted

- **Two files, same name** (`decls_a.dart`/`decls_b.dart` in the fixture; real Continuum's own
  `protocolVersion` needed no such test since it has no same-package namesake) — two distinct
  `logic.FieldDecl` ids, two distinct reference targets, verified by direct id comparison in the new
  permanent test (`extraction_test.dart`).
- **Two packages, same name** (the fixture's `dep.sameName` alongside `decls_a`/`decls_b`'s own) —
  distinct target, reusing M8-F's `extractedDependencyFiles`-checked `pathOf`.
- **Never inferred from:** the resolver keys exclusively on the resolved `Element`'s own `runtimeType`
  (`TopLevelVariableElement`/`TopLevelFunctionElement`/an origin-declared `GetterElement`) and its own
  `.library.identifier`/`.name` — never the reference's spelling, never source spans, never import
  syntax, never traversal order. `Symbols.variableIn`/`functionIn` are pure functions of
  `(libraryUri, name, packageName, localPackages, extractedDependencyFiles)`, identical in shape to
  every other `xxxIn` method this compiler already has.

## 8. Shadowing — proven with real analyzer element identity, not name comparison

`_topLevelTarget(Element? element)` checks `element is TopLevelVariableElement` / `is
TopLevelFunctionElement` / `is GetterElement && isOriginDeclaration`. A shadowing local variable or
parameter resolves, in `package:analyzer`'s own element model, to a `LocalVariableElement`/
`FormalParameterElement` — neither of which is any of the three checked types — so `_topLevelTarget`
correctly returns `null` for a shadowed reference, and `_reference`'s existing `staticTarget ??
binding?.symbol` falls through to the local scope's own handling. Verified two ways: (1) a parameter
shadowing a top-level const, in an ordinary method — the reference's own target is confirmed `null`,
never the top-level's id; (2) a local variable shadowing a top-level const, inside `build()` — M8-B's own
local-substitution mechanism inlines the *local's* value (`'local'`), never the shadowed top-level
const's (`'top-level'`), confirmed by inspecting the emitted `bind.Expr`'s own literal value. Both are
now permanent tests.

Import-prefix qualification (`a.sameName`/`b.sameName`/`dep.sameName`) resolves through the *identical*
element-type check — the prefix carries no special handling beyond what `_isStaticQualifier` (existing,
unchanged) already strips before computing the lookup name; identity comes from `node.identifier.element`
regardless of which prefix, if any, wrote the reference.

## 9. Static class members — deliberately excluded, and why

`Constants.staticConst` reaches the *identical* `_reference`/`staticTarget` extension point
(`_isStaticQualifier`'s `PrefixedIdentifier` case) a bare top-level reference does — confirmed directly:
adding the top-level check to this shared call site was "free" in the sense that no new wiring was
needed to *reach* it. It remains unresolved because the **declaration side** is not ready:
`declaration_extractor.dart`'s `_fields` (used for every class field, static or instance) never passes a
`symbol:` — the node is content-hashed, matching `ParamDecl`'s own already-documented M8-G gap, not a
top-level variable's already-correct scheme. Fixing `Constants.staticConst` would require a *second*
change (giving static fields a symbol, while leaving instance fields — resolved through an entirely
different, per-component/per-store mechanism, M8-H/M7-N — untouched) that this milestone's own scope
(top-level declarations) does not cover. Left refused, exactly as before; a real, adjacent, narrower
finding for a future milestone, not folded in to avoid exactly the "half-fixing" the task warned against.

## 10. Top-level const semantics — Option A confirmed by existing precedent

Investigated whether the architecture already inlines const values anywhere, since that would answer
Phase 8 the other way. Found `_constValue` (`expression_extractor.dart`) — the *only* value-inlining
mechanism in the extractor — and it is narrowly, explicitly catalog-scoped: `MaterialCatalog
.constValueFieldsOf(typeName)` (ADR-18), used for exactly one purpose (`Icons.star` → the `IconData` it
denotes, so the runtime kit need not carry Flutter's ~2000-entry icon table). It requires a registered
framework `InterfaceType`; a plain `String` const (`protocolVersion`'s own type) never matches, and
falls straight through to the ordinary reference path — confirmed directly by the raw UIR showing a real
`logic.Ref`, not an inlined `logic.Lit`, for every one of this milestone's cross-file const rungs.
**No general "inline the value" policy exists anywhere in the architecture.** Every other cross-file
reference kind this compiler already resolves — enum constants (M8-D), store members (ADR-27),
components (M8-F), actions (M8-H) — uses `target`-based declaration/reference linking, never value
substitution, except for that one, narrow, deliberately-scoped exception. **Option A — preserve the
declaration/reference relationship** — is the answer the existing architecture already gives, followed
here, not chosen for convenience.

## 11. Top-level function semantics — identity gap, not a lowering gap

`formatBytes`/`formatUptime`'s own bodies (inspected directly): both synchronous, one and zero
parameters respectively, return a `String`, no captured state (top-level functions cannot capture
anything — Dart forbids it structurally), call ordinary string/arithmetic operations,
`declaration_extractor.dart`'s `_function` already walks the full body via `expressions.bodyOf` and
already sets `params`/`returnType`/`isAsync` unconditionally. **Fully representable under the existing
function grammar, already, before this milestone.** This milestone is exclusively an **identity gap**:
the declaration was already complete; only the reference-side target was missing. No function-lowering
work was needed, found necessary, or done.

## 12. BRG2305's exact root cause here — traced through N11

`protocolVersion`'s untargeted `logic.Ref` reaches N11 by the identical path M8-G/M8-H already
documented: `classify()` sees an untargeted `logic.Ref` inside a route-argument binding
(`n11_promote_cross_route_state.ts:404-406`) and returns `{kind: 'forwarded'}` unconditionally — the
same bucket a genuinely forwarded constructor parameter falls into, with no way to distinguish "this
untargeted ref is a forwarded parameter" from "this untargeted ref is a cross-file top-level reference
extraction simply never resolved." **BRG2305 is misattributed for this exact reference** — proven
directly in M8-I's own what-if experiment (§14 below): when this reference was the *last* thing keeping
a hypothetical build from reaching normalize success, the diagnostic printed was `BRG2305 'diagProtocolVersion'
forwards the source component's own constructor parameter` — false; `protocolVersion` is not a
constructor parameter of anything, it is a top-level const from an entirely different package. Not
suppressed, not reworded here (out of scope; the fix is the identity itself, not the message) — fixing
the identity gap makes the misattribution moot, since the reference no longer reaches that branch of
`classify()` at all.

## 13. Schema / ADR decision

**SCHEMA CHANGE REQUIRED: NO.** `logic.FieldDecl`/`logic.FunctionDecl` were already correctly, fully
modeled; `bind.Expr`'s wrapped `logic.Ref.target` field already exists and already carries exactly this
semantic for every other declaration kind. **ADR REQUIRED: NO.** No existing architectural rule is
amended, narrowed, or reinterpreted — `Symbols.variableIn`/`functionIn` are additive, symbol-scheme
siblings of `Symbols.variable`/`function`, built the identical way `Symbols.typeIn` already was for
M8-D.

## 14. Implementation

**Production changes**, all in `dart/bridge_analyzer`:

- `lib/src/session/extract/symbol_table.dart`: added `Symbols.variableIn`/`Symbols.functionIn` (static,
  mirroring `typeIn` exactly — `pathOf` + `'var:'`/`'fn:'` prefix).
- `lib/src/session/extract/expression_extractor.dart`: added `_topLevelTarget(Element? element)`,
  mirroring `_enumConstantTarget`'s structure — the same `GetterElement`/`isOriginVariable` unwrap for a
  variable read, plus a new branch for an origin-declared getter whose `enclosingElement` is neither an
  `InstanceElement` nor an `ExtensionElement` (excluding class/extension members structurally, never by
  name). Wired into the three call sites that already resolve a bare-or-static-qualified name:
  the `SimpleIdentifier` case (new `staticTarget:` parameter — previously absent entirely), the
  `PrefixedIdentifier`/`_isStaticQualifier` read case and its `PropertyAccess` sibling (both already had
  `staticTarget: _enumConstantTarget(...)`; extended to `_enumConstantTarget(...) ??
  _topLevelTarget(...)`), and `_invocation`'s no-receiver `logic.Call` branch (same extension).

No compiler/N-pass changes (§13). No generator changes. No runtime changes. **NodeId consequences:**
none beyond what `Symbols.variable`/`function` already, unconditionally produced — this milestone reads
an existing symbol scheme, it does not mint a new one.

## 15. Negative cases

All proven with real evidence, permanent tests added to `extraction_test.dart`'s new `top-level
declaration identity (M8-J)` group (9 tests): cross-file const target; cross-file function tear-off *and*
call both targeted; cross-file getter target; cross-package const/function via import prefix, with the
declaration's own anchor confirmed in the dependency's package URI space; two same-named consts in two
files never share an id, and each reference resolves to its own; local-variable shadowing (via M8-B's
own inlining, proven by value); parameter shadowing (via target absence); an SDK top-level declaration
(`math.pi`) stays honestly unresolved and no declaration is ever invented for it; a static class const
stays refused, with the reason documented inline in the test itself.

## 16. Continuum before/after

| | droid before | droid after | mac before | mac after |
|---|---:|---:|---:|---:|
| Analyzer errors | 0 | 0 | 0 | 0 |
| Analyzer records | 219 | 219 | 203 | 203 |
| `protocolVersion` target | `None` (×2) | real id (×2) | `None` (×2) | real id (×2) |
| `formatBytes` (reachable sites) | already targeted | unchanged | already targeted | unchanged |
| `formatUptime` | already targeted | unchanged | already targeted | unchanged |
| BRG2305 | 0 | 0 | 0 | 0 |
| BRG2303 | 1 | **1 (unchanged)** | 1 | **1 (unchanged)** |
| BRG2301 | 2 | **2 (unchanged)** | 1 | **1 (unchanged)** |
| Files emitted | 0 | 0 | 0 | 0 |

Confirmed by a fresh `bridge build` on both real apps: **no diagnostic changed except the one this
milestone targeted, and that one changed only by having its target resolved — not by any diagnostic
count shifting.** `protocolVersion` was never itself a route-boundary argument (it sits inside
`DiagnosticsInfo`'s own construction, already refused for the unrelated M8-I reason), so resolving its
identity could not and did not touch BRG2301/BRG2303 at all — matches the task's own "no diagnostic may
disappear accidentally" requirement, verified rather than assumed.

## 17. Regression evidence

`dart test`: 306/306 (297 pre-existing + 9 new), including, unchanged: M7-N's store-member identity
tests (a signal/derived/action read on a store field still resolves by real resolved element; two
different store classes with the same member name never collide), M8-D's enum-identity tests (a static
const on a plain class is still not claimed as an enum constant — confirming `_enumConstantTarget` and
the new `_topLevelTarget` do not interfere with each other's own exclusivity), M8-F's cross-package
assembly tests, M8-H's write-less-action tests. `just ci`: exit 0, 306 Dart tests + 216 TS tests (every
real analyzer→generator→`tsc` build-proof, unaffected — no generator code touched). Identity systems
remain disjoint by construction: `_enumConstantTarget` and `_topLevelTarget` are tried in that order
(`_enumConstantTarget(...) ?? _topLevelTarget(...)`) at the two static-qualifier call sites, and each
checks a *disjoint* set of `Element` runtime types (`FieldElement` with `isEnumConstant` vs.
`TopLevelVariableElement`/`TopLevelFunctionElement`/an origin-declared top-level `GetterElement`) — an
enum constant can never satisfy `_topLevelTarget`'s checks, and a top-level declaration can never satisfy
`_enumConstantTarget`'s (`isEnumConstant` is specific to `FieldElement`s belonging to an enum).

## 18. Temporary next-blocker census (M8-I's what-if, redone with this fix in place)

Same temporary, uncommitted Continuum modification as M8-I §14 (nulling `onExportLogs`/`platformSection`,
decomposing `DiagnosticsInfo` to primitives) — this time with M8-J's fix already in place, so
`protocolVersion` no longer needed the literal-substitution workaround M8-I required to isolate it.
Result: normalize passes (same as M8-I), generate reached, **54 diagnostics across the same 7 codes**
(`BRG3006`×29, `BRG3001`×15, `BRG3004`×12, `BRG3002`×10, `BRG3013`×4, `BRG3008`×1, `BRG3005`×1 — one more
`BRG3006` than M8-I's own count, `describeTransferFailure`, the same shape as `formatBytes`/
`formatUptime`). **`protocolVersion` is confirmed gone from the list. `formatBytes`/`formatUptime` are
confirmed still present, byte-for-byte the same two sites as before** — direct, before/after proof that
they were never part of this milestone's own gap, exactly as §2.1 traced structurally. Not investigated
further (deliberately excluded per this milestone's own non-negotiable scope), but now conclusively
separated from `protocolVersion`'s own, now-fixed, root cause.

## 19. Exact M8-K recommendation

No single, bounded next chokepoint emerged with the clarity M8-H → M8-I → M8-J each had. What this
milestone's own evidence supports:

1. **`formatBytes`/`formatUptime`'s real gap** — an expression nested inside a closure argument to a
   plain (non-widget) service class's own constructor is never walked at all — is a distinct, real,
   unexplored root cause with at least 3 confirmed real Continuum sites (`formatBytes`×2,
   `describeTransferFailure`×1 in the fresh what-if sweep). Worth its own measurement pass before
   assuming it is bounded.
2. **`Constants.staticConst`-shaped static class member identity** (§9) is a real, adjacent, narrower gap
   with a clear mechanical shape (give `_fields`'s static branch a symbol, mirroring what top-level
   variables already have) — plausibly bounded, but requires its own audit of what giving static fields
   symbol-tier identity might affect elsewhere before treating it as free.
3. The generate-stage census (§18) is dominated by `BRG3006` (29 of 54) — a wide, heterogeneous mix of
   unrelated causes (framework statics, locals, enum `.values`) M8-I already declined to fully
   individually trace; still true here.

None of the three has the single-symptom clarity `protocolVersion` had going into this milestone. The
next measurement pass should scope narrowly to one of them — most plausibly #1, since it has the most
concrete, repeated real evidence — rather than attempting all three at once.
