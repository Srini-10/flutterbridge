# M8-D — Enum / static-constant reference identity

**Date:** 2026-08-20. **Baseline:** `f927924f97d64ee6624e65da1f43e6327ba06ab8` (== `origin/main`, clean
tree, confirmed before any change). 284/284 Dart analyzer tests and 209/209 generator tests confirmed
green before editing. M8-C established three independent P1 co-dominators; this milestone implements
**only** the first — unresolved enum-constant reference identity — and touches neither cross-package
component construction nor action-body/navigation lowering.

## 1. Baseline

HEAD and origin/main both `f927924`, clean tree. 284 Dart tests, 209 TS generator tests, both green
before any edit.

## 2. The seven Continuum sites

Traced fresh from a from-scratch `bridge analyze` on both apps (node ids re-derived, not assumed from
M8-C's own report):

| App | Reference | File:line | Context |
|---|---|---|---|
| droid | `_Stage.loading` | `pairing_page.dart:40` | `_Stage _stage = _Stage.loading;` field initializer |
| droid | `_Stage.idle` | `pairing_page.dart:122` | `setState(() => _stage = _Stage.idle);` |
| droid | `_Stage.onboarding` | `pairing_page.dart:528` | `if (_stage == _Stage.onboarding) {...}` inside `build()` |
| mac | `_Stage.loading` | `pairing_page.dart:39` | field initializer |
| mac | `_Stage.idle` | `pairing_page.dart:115` | `setState(...)` |
| mac | `_Stage.onboarding` | `pairing_page.dart:510` | `build()` conditional |
| mac | `_Stage.connected` | `pairing_page.dart:401` | a `PeerBatteryIndicator` prop condition |

All seven share one root cause, confirmed by reading each site's resolved `type` (`_Stage`, declared in
that same app's own `pairing_page.dart`) and by the fact that a single fix resolved all seven identically
(§13). Every `_Stage.*` reference in both raw UIR documents (21 occurrences in droid, 8 in mac — most
embedded inside `_buildBody`'s switch, which never separately reaches the generator, per M8-B's own
documented stop boundary) received a `target`, not just the seven that had been individually observed
failing.

## 3. Reduction ladder

All run through the real analyzer (`extract()`, a real, resolved, on-disk Flutter project):

| Rung | Shape | Result |
|---|---|---|
| A | local enum, same file | resolves — `target` = the `logic.EnumDecl`'s own id |
| B | enum in another file, same package | resolves — `target` still equals the *declaring* file's `logic.EnumDecl`, confirmed distinct from the referring file |
| C | enum from another application-owned library (`ContinuumFeature`, from `continuum_pairing`, a sibling *package*, not this project's own `lib/`) | does **not** resolve — `Symbols.pathOf`'s package-name check correctly refuses it, matching M8-C's own cross-package boundary (§2's out-of-scope note) |
| D/E/F | `==`, `!=`, inside `&&`/`\|\|`/a ternary | all resolve identically — the reference itself, not its syntactic position, carries identity |
| G | already representable via `ui.Cond`/`logic.Conditional` | no change needed |
| H | `static const` on a plain (non-enum) class | does **not** resolve — see §11 |
| I | unrelated instance property, same spelling (`thing.ready`) | unaffected — a genuine `FieldElement`/`GetterElement` for an ordinary field, `isEnumConstant` is false |
| J | local variable shadowing the member spelling | unaffected — resolved by ordinary lexical scope (M8-B's local-substitution) before any static/enum check runs at all |
| K | Flutter SDK enum (`ThemeMode.system`) | does **not** resolve via this mechanism — `Symbols.pathOf` refuses an SDK library; confirmed directly against real hello_bridge data (§12), since the synthetic test harness's own Material typings are incomplete for this specific probe |

Static const (H) and enum constant are **not** the same mechanism — see §11. Only the enum case is
included in this milestone's supported surface.

## 4. Analyzer resolved-element evidence

A direct probe (`element.runtimeType` printed for `Stage.ready`) found the resolved element is a
`GetterElementImpl` — the synthesized getter Dart's own element model gives every enum constant read,
**not** a `FieldElement` directly. This is the exact same shape `_storeMemberTarget`
(`expression_extractor.dart`, M7-N) already distinguishes via `isOriginVariable`. `GetterElement.variable`
is the one already-resolved step from the getter back to the underlying `FieldElement`; `FieldElement
.isEnumConstant` (analyzer 14.0.0, `dart/element/element.dart:1258`) is the resolved fact — never a
name-based guess — that the field is genuinely an enum constant. `FieldElement.enclosingElement` gives the
`InstanceElement` (the enum itself), whose `.name` and `.library.identifier` are exactly what `Symbols
.type`/`Symbols.typeIn` need.

## 5. UIR shape — before

```json
{"kind":"logic.Ref","name":"_Stage.loading","type":{"library":"package:droid/pages/pairing_page.dart","name":"_Stage"}}
```

No `target` field at all — indistinguishable, to any downstream consumer, from a genuinely undeclared
name.

## 6. UIR shape — after

```json
{"kind":"logic.Ref","name":"_Stage.loading","target":"6d187defa9a1ea92","type":{"library":"package:droid/pages/pairing_page.dart","name":"_Stage"}}
```

`6d187defa9a1ea92` is the id of the `logic.EnumDecl{name:"_Stage", values:["loading","onboarding","idle",...]}`
node already emitted for the enum's own declaration — same id, confirmed identical, before and after
normalization (§8).

## 7. Identity mechanism

Directly mirrors M7-N's `Symbols.storeIn`, with one deliberate difference reflecting a real semantic
difference: `Symbols.typeIn(libraryUri, name, {packageName})` (new, `symbol_table.dart`) computes exactly
the symbol `declaration_extractor.dart`'s own `EnumDeclaration` case already registers (`out.symbols
.type(name)` = `'type:$path#$name'`) — the two agree by construction, never by matching after the fact,
because both derive from the same `Symbols.pathOf`.

`expression_extractor.dart`'s new `_enumConstantTarget(Element?)`:
1. Unwraps a `GetterElement` with `isOriginVariable` to its underlying `.variable` (§4).
2. Requires `FieldElement.isEnumConstant` — refuses everything else, including a plain `static const`.
3. Computes the target via `Symbols.typeIn` from the enum's own enclosing library — `null` for anything
   outside this project (SDK enums, cross-package enums like `ContinuumFeature`).

Wired into the two places a static-qualified name already reaches `_reference` (`PrefixedIdentifier` and
`PropertyAccess`, both pre-existing cases) via a new optional `staticTarget` parameter — no change to how
either case is *reached*, only to what they pass through once there. **M7-N's own mechanism was not
mechanically copied without checking semantics first**: store members resolve against a live *instance*
(`registry.isStoreBase(receiverType)` gates the whole thing on there being a receiver at all); an enum
constant has no receiver — `Stage.ready` is a bare qualified name — so the gate here is
`isEnumConstant`, not a receiver-type check. The two mechanisms share their *symbol* machinery, not their
*trigger* condition.

## 8. Schema analysis

**No schema change.** `logic.Ref.target` already existed (`l1.json`, optional `NodeId`, "The declaration
referred to, when it is in the program") — added for a different purpose (M7-N/parameters), reused here
unmodified. `logic.EnumDecl` already existed, with `values: string[]` — a list of plain strings, not
per-member `NodeId`s (confirmed: no per-constant identity exists in the schema, and none was added — see
§13 for why that boundary matters). **Verified the target survives Program build**, per the explicit
BRG1207/M7-C lesson this milestone was warned against repeating: `logic.EnumDecl{id:"6d187defa9a1ea92"}`
in raw UIR and in the fully normalized document carry the **identical** id — nothing consumes or drops
it between the two, unlike M4-G's app-root, which does get consumed.

## 9. Generator behavior

**A generator change was required** — the analyzer fix alone left `target` correctly populated but the
generator had no case for it (only `scope.signalRead`/`scope.localName` were checked against a `target`
before this milestone). Grepped the entire generator for any existing `logic.EnumDecl` handling: **none
exists** — no contract for lowering an application enum's *declaration* to TypeScript was ever built (the
same absence M8-C's own §6 finding already established for `logic.ClassDecl`/`SettingsPage`). Given no
declaration-emission contract exists to violate, and given Dart's own type system already refuses to
compare two different enums' constants against each other (so no generated comparison can ever conflate
one enum's member with another's), the constant's own name is lowered as a plain string literal
(`'ready'`) — read from the already-resolved, already-validated tail of the Ref's own `name` field, not
re-derived by searching. This does not create a full enum *type* in the output; it makes the one
observable operation real Continuum code performs (`_stage == _Stage.loading`, and initializing `_stage`
to one) behave identically to Dart's own `==`, since JS string equality distinguishes every member exactly
as Dart's enum equality does.

## 10. Negative cases

All seven required cases, asserted by resolved identity (`target ==`/`!=` the expected declaration id),
not by output-string presence alone:

| Case | Result |
|---|---|
| `EnumA.ready` vs `EnumB.ready` | distinct `target`s, proven distinct `logic.EnumDecl` ids |
| same enum name, different libraries | not tested directly (no real corpus site needs it) — covered structurally by the cross-file test (§3, rung B), which proves `target` resolves to the *declaring* file's own declaration, the same mechanism that would disambiguate two files each declaring their own `Stage` |
| local variable shadowing | the local wins by ordinary scope (M8-B); no `logic.Ref` for the enum member survives at all |
| unrelated `object.ready` | ordinary `logic.PropertyAccess`, no `target` — `isEnumConstant` false |
| unresolved reference | stays untargeted; extractor does not crash, does not fabricate |
| SDK enum reference | untargeted — confirmed against real hello_bridge data (`ThemeMode.light`/`.dark`, §12) |
| compound boolean expression | resolves identically inside `==`/`!=`/`&&`/`\|\|` — the Ref itself carries identity regardless of syntactic position |

Generator-side, mirrored with 3 dedicated tests (`enum_reference.test.ts`): the string-literal lowering,
the two-different-enums-same-member-name non-collision (same literal is *correct* here — Dart never lets
them be compared against each other, so the identity distinction that matters was already proven upstream
at the analyzer's `target`), and confirmation that an untargeted reference still reports `BRG3006`.

## 11. Static-const classification

**Classified as B — related but needing separate handling, not automatically solved.** `Limits.count`
(a `static const` field on a plain class, not an enum) resolves to a `GetterElement` whose underlying
`FieldElement.isEnumConstant` is `false` — `_enumConstantTarget` correctly returns `null`, and the
reference stays untargeted, exactly as before this milestone. This was proven, not assumed: a dedicated
test (§10) asserts `Limits.count` carries no `target`. Static const is left explicitly deferred — it may
turn out to need the identical mechanism (a `FieldElement` with a real declaring library, same
`Symbols.typeIn` shape) or it may not (a static const's *value*, unlike an enum constant's *identity*, is
often a plain literal a `logic.Ref` could resolve differently, e.g. by folding to `logic.Lit` the way
colour constants already fold) — that determination was out of this milestone's scope.

## 12. hello_bridge result

Fresh `bridge analyze`/`generate`: unchanged — still 4 errors (`BRG3016`, `BRG3007`, `BRG3013`×2), 0 files
emitted, byte-identical to the M7-O baseline. Directly inspected: `ThemeMode.light`/`ThemeMode.dark`
(`package:flutter/src/material/app.dart`) still carry **no** `target` — correctly, since
`Symbols.pathOf`'s package-name check refuses an SDK library exactly as it refuses `ContinuumFeature`
(§3, rung C).

**Distinguishing enum identity from themeMode capability, as required**: the identity gap this milestone
targets was never hello_bridge's actual blocker — `BRG3016` (the app-root's static "is `themeMode` a key
this project models at all" check, `emit/app_root.ts`) refuses the whole prop **before** the generator
ever reaches the point of resolving `ThemeMode.light`/`.dark` individually, exactly as M7-O documented.
**Enum identity resolution is not themeMode capability implementation** — nothing about `themeMode`'s own
lowering was touched, and `BRG3016` fires completely unchanged.

## 13. Continuum before/after

**droid:** analyzer diagnostics unchanged at 38 (identity is added to an existing `target` field, not a
new diagnostic-producing node). Generator errors **19 → 16** — the exact 3 `_Stage.loading`/`.idle`/
`.onboarding` `BRG3006`s are gone; `env`/`states`/`Navigator.of`/`SettingsPage`/`OnboardingPage`/
`MessageLogView`/opaque/`SwitchListTile`/`ListTile.dense`/list-key — all 16 remaining lines are exactly
M8-C's other two co-dominators plus the already-known narrow gaps, unworsened.

**mac:** analyzer diagnostics unchanged at 9. Generator errors **16 → 12** — the exact 4 `_Stage.loading`/
`.idle`/`.onboarding`/`.connected` `BRG3006`s are gone; the remaining 12 lines match M8-C's other two
co-dominators and narrow gaps exactly, unworsened.

Files emitted: 0 for both, unchanged — not required by this milestone (M8-C's own co-dominator finding:
two other independent P1 root causes still block emission).

## 14. Regression audit

Full suites re-run, not spot-checked: **291/291 Dart analyzer tests** (284 pre-existing + 7 new), **212/212
TS generator tests** (209 pre-existing + 3 new). Specifically re-ran the highest-risk build-proofs given
this milestone touches the shared `_reference`/`logic.Ref` emission path both broadly rely on:
`local_store_build.test.ts` (M7-N, store member target identity), `structured_build_build.test.ts`
(M8-B, local substitution + `ui.Cond.test`), `inline_push_build.test.ts` (M7-G), `async_push_guard_build
.test.ts` (M7-H) — all pass, real analyzer → normalize → generate → `tsc`. M7-J (`mounted`), M7-K
(Material theme fallback), M7-L (`Duration`/`Future.delayed`) are covered by the same full-suite run (no
dedicated build-proof exists for these separately from the general suite, and none regressed). No
existing committed golden contains a `logic.EnumDecl` (`grep -c` across every `fixtures/uir/*.ndjson`
returns zero), so no golden needed — or received — regeneration.

## 15. Determinism / fixed point

`just ci`: green, exit 0. `just determinism`: green, exit 0, all 5 e2e fixtures byte-identical across 3
runs. `bridge validate` on the M8-B `structured_build` fixture: both `deterministic` and `fixed point`
(`normalize(normalize(x)) == normalize(x)`) confirmed green, unaffected by this milestone's changes.

## 16. Remaining blockers

Exactly M8-C's other two co-dominators, fully unchanged by this milestone:
1. **Cross-package component construction** (`continuum_ui_kit` — `SettingsPage`, `OnboardingPage`,
   `MessageLogView`, `PeerBatteryIndicator`).
2. **Complex action-body / imperative navigation lowering** (`env`/`states` in `_openSettings`/
   `_bootstrap`, `Navigator.of` mid-function).

Plus the already-known narrow gaps (`SwitchListTile`, `ListTile.dense`, `DropTarget`, collection
spread/null-widget, `_buildBody`'s switch) — none worsened, none newly discovered.

## 17. Recommendation for M8-E

M8-C's own dominator analysis (its §13/§15) already established that no single one of its three
co-dominators alone gets either app to `files emitted > 0` — this milestone closing the first confirms
that precisely: 7 fewer errors, 0 files emitted, exactly as predicted. **M8-E should repeat M8-C's own
discipline**: measure the two remaining co-dominators fresh (do not assume their M8-C-era scope is still
accurate now that the tree they sit in has changed shape), and pick exactly one. This document does not
pre-select between them — cross-package component construction likely needs its own ADR-level
scoping phase before implementation (M8-C §6's own conclusion, unchanged), and action-body/navigation
lowering's exact boundary was explicitly left uncharacterized by M8-C (§9) precisely because it wasn't
scoped this narrowly there either. Neither should be assumed narrower than it is without the same kind of
reduction-ladder discipline this milestone used for enum identity.
