# M9-F — Widget-tree collection-for `itemParam` declaration identity

**Baseline:** `0dcbad2` (M9-E, "feat: add scoped dialog dismissal semantics") ==
`0dcbad2ec81c659ff7becfc1b7d59c35dba1cadd` == `origin/main`, verified fresh via `git rev-parse`. Only
the pre-existing, unrelated drift (`fixtures/apps/hello_bridge/analysis_options.yaml`) was present; nothing
else unexpected.

**Outcome: PASS — bounded implementation.** A widget-tree collection-for's own declared item (`for (final
item in items) Text(item)`) now carries the same declaration-tier identity ADR-28's own family already
gives ordinary locals (ADR-28), catch bindings (M8-S), and statement-level for-in/C-style loop variables
(M9-A/M9-B). Proven safe, structurally distinct from the general parameter-identity problem M9-E already
found separately deferred, and confirmed against a real, additional generator defect this milestone found
and fixed as a direct, required consequence of its own build-proof.

## 1. Exact source shape and the question this milestone had to answer first

```dart
Widget build(BuildContext context) {
  final items = ['A', 'B'];
  return Column(
    children: [
      for (final item in items)
        Text(item),
    ],
  );
}
```

M9-A's own doc explicitly left this open, not merely unimplemented: *"a structurally different UIR node
(`ui.List.itemParam`), bound as a parameter-tier name inside a widget-tree template... architecturally the
same category ADR-28 §4 already defers for `ParamDecl` generally"* — an unresolved question about which
category `item` belongs to, not a rung waiting for its turn. This milestone had to answer that question
with real evidence before choosing a mechanism (§2 below), not assume M9-A's own hedge was correct.

## 2. Dart AST shape, declaration Element, read Elements

`for (final item in items)` — inside a `ForElement` (collection literal) exactly as inside a `ForStatement`
— parses to a `ForEachPartsWithDeclaration`, whose `loopVariable` is a `DeclaredIdentifier` with a real,
resolvable `LocalVariableElement`. **Identical AST shape to the statement-level case M9-A already covers.**
Every read (`Text(item)`, `item.length`, `'$item'`) resolves, via the analyzer's own element model, to that
same declared Element — proven directly, not assumed, by inspecting the resolved AST in a throwaway probe.

## 3. Raw UIR before

```json
"itemParam": "item",
"kind": "ui.List",
"template": { "kind": "ui.Text", "value": { "kind": "bind.Param", "param": "item" } }
```

No `itemDecl`, no `target` — `param` names the parameter by bare string only. `Text(item)` extracts via
`BindingExtractor`'s own bare-identifier special case (`Binds.parameter` → `bind.Param`), never reaching
`logic.Ref` at all. When `item` appears inside a compound expression (`item.length.toString()`), it *does*
produce `logic.Ref{name: 'item'}` — but with no `target`, since the `Binding` created for it carries no
`symbol`.

## 4. Raw UIR after

```json
"itemDecl": { "id": "4467f1f596e069c8", "kind": "logic.VarDecl", "name": "item", "isFinal": true, "type": {...} },
"itemParam": "item",
"kind": "ui.List",
"template": { "kind": "ui.Text", "value": { "kind": "bind.Param", "param": "item", "target": "4467f1f596e069c8" } }
```

`itemParam` stays, unchanged, for description. `itemDecl` is a real, symbol-bearing `logic.VarDecl` —
`bind.Param.target` resolves to its own id. Verified via real, throwaway probes for every reduction rung
(§10) before any test was written.

## 5. Exact identity-loss point

Neither the schema nor N5 nor the generator — the analyzer's own `_OrdinalVisitor`
(`scope.dart:visitDeclaredIdentifier`) **already** numbers every `DeclaredIdentifier` unconditionally,
including this one, with no parent-shape guard (its own comment: *"used exclusively for a for-in loop's
own declared variable — nothing else in Dart's grammar constructs one"*). The mechanism was already fully
general. The gap was that `WidgetExtractor`'s own scope (`component_extractor.dart`'s `buildScope`) was
never constructed via `Scope.forBody` — the *only* factory that runs that ordinal pre-pass — because a
`build()` method was never treated as an "owning body" in ADR-28's own original sense (only actions/
functions were). Layer: **B — WidgetExtractor's own scope wiring**, extraction-time, identical in category
to every prior ADR-28 amendment's own loss point.

## 6. Comparison with M9-A — same AST shape, different code path, genuinely different owner needed

Same Dart AST declaration shape, same analyzer Element availability, same symbol identity mechanism
(`Symbols.local`), same lexical scope/shadowing semantics, same closure-capture semantics (proven, §12),
same ordinal requirements (a shared, per-owning-body monotonic sequence). `Symbols.local` **is** reused —
but `Scope.forBody` itself is deliberately **not**, because it would also, as an unvalidated side effect,
give ordinary locals and statement-level loops declared inside inline render-tree callbacks an identity
they do not have today (a real, separate, pre-existing gap confirmed by direct probe — `logic.Ref.target`
absent for such a declaration, both before and after this milestone, unchanged). `Scope.forWidgetTree` is a
deliberately separate owner/ordinal pair for exactly this reason (§13, ADR §3). `itemParam` was historically
different from a statement-level loop variable only because nobody had wired the (already-general)
mechanism to this one code path — not because `item` is semantically parameter-like in a way that would
justify a different identity scheme.

## 7. F1–F16 reduction ladder — results

All verified via real, throwaway `bridge analyze` probes before any permanent test was written, then pinned
as permanent tests (`extraction_test.dart`, 15 tests) and a real fixture build-proof (§18).

| Rung | Result |
|---|---|
| F1 — primitive item read | `itemDecl` present, `bind.Param.target` resolves to it. Pass. |
| F2 — property read (`item.length.toString()`) | `logic.Ref.target` resolves to `itemDecl`. Pass. |
| F3 — repeated reads | Both reads target the same declaration (correctly share one content-addressed id — the fix, not a bug). Pass. |
| F4 — outer local interaction | Item and an outer, M8-B-inlined local remain distinct; the outer local is never represented as a reference at all. Pass. |
| F5/F6 — nested, same-name shadowing | Outer/inner declarations distinct ids; inner template read resolves to inner; the inner loop's own iterable (`item`, naming the outer) resolves to the outer. Pass. |
| F7 — sibling, same-name | Two independent declarations, never collide. Pass. |
| F8 — ordinary-local collision | An outer local named `item` is M8-B-inlined; structurally nothing to collide with. Pass. |
| F9 — statement-loop interaction | A statement-level for-in loop sharing the name never collides with the widget-tree item — and, honestly, its own identity remains exactly as absent as before this milestone (a separate, pre-existing gap, unchanged either direction). Pass. |
| F10 — catch-binding interaction | Not meaningfully combinable inside a widget tree (a `catch` clause cannot appear inside a collection literal); not tested — no reachable shape to test. |
| F11 — closure capture | An inline `onPressed` callback's own read of `item` targets the same `itemDecl` the template's own read does. Pass. |
| F12 — conditional inside template | Not widened — `ui.List.template` accepting a `ui.Cond` is an existing, orthogonal capability question this milestone did not touch either way. |
| F13 — iterable expression scope | The iterable is extracted before the item's own binding is added to scope (unconditional, by construction); confirmed no premature registration. Pass. |
| F14 — negative visibility (`for (final item in item) Text(item)`) | A real Dart error (`referenced_before_declaration`); neither a `logic.Ref` nor a `bind.Param` for the iterable's own read targets the declaration it is itself part of declaring. Not fabricated. Pass. |
| F15 — project-defined object item | Type-agnostic, confirmed directly (the mechanism operates on the `Element`, never the value). Pass. |
| F16 — renamed item | Identical behavior under any spelling; no name coupling anywhere. Pass. |

## 8. ADR-28 applicability

**Applies, with one deliberate, evidenced deviation from blind reuse.** `Symbols.local` (the symbol scheme)
is reused unmodified. `Scope.forBody` (the *ordinal-numbering entry point*) is deliberately **not** reused —
a new, parallel factory, `Scope.forWidgetTree`, was introduced instead, precisely to avoid an unvalidated
side effect on a separate, pre-existing gap (§6, §13). This is not a new identity concept; it is the
existing concept, entered through a second, narrower door.

## 9. Identity architecture — selected and rejected options

- **Option A (reuse `Symbols.local`)** — **selected**, for the declaration-tier symbol itself.
- **Option B (reuse existing parameter identity)** — rejected: no such identity exists for ordinary
  widget/component constructor parameters (ADR-28 §4, confirmed still deferred by M9-D/M9-E's own
  investigations into `showDialog`'s builder parameter); there is nothing to reuse.
- **Option C (collection-specific identity)** — rejected: the AST/Element shape is provably identical to
  M9-A's own statement-level case (§2); inventing a separate identity concept would be unjustified.
- **Option D (generator-local name binding only)** — rejected as the *sole* mechanism (same-name shadowing
  could not be proven safe by name alone — F6/F7 require real identity), but the generator's own name-based
  `paramInScope` fallback is *retained*, unmodified, for the one case that genuinely has no declaration-tier
  identity to resolve by (`ListView.builder`'s own `itemBuilder` closure parameter, §16).

## 10. Ordinal namespace

Shared with nothing — deliberately its own, separate pair (`_widgetOwner`/`_widgetOrdinals`), never
`Scope.forBody`'s own `_owner`/`_ordinals` (§6, §13, ADR §3). Within that separate pair, ordinals *are*
shared across every declaration `_OrdinalVisitor` numbers in the same render tree (item declarations,
incidentally also ordinary locals/catch bindings it does not use), the identical "one pre-order pass, keyed
by resolved `Element`" scheme M9-A already proved collision-free — confirmed against the actual traversal,
not assumed: the required adversarial case (two declarations, identical name, identical owner — F7's own
sibling test) receives distinct ids, verified directly, and a deliberate mutation forcing an identical
ordinal for every collection-for item in a file was caught immediately by a real `BRG1202` duplicate-symbol
diagnostic (Mutation B, §20).

## 11. Schema decision

**Additive.** `ui.List` (`l2.json`) gains `itemDecl: VarDecl` ($ref into `l1.json`, the same cross-layer
pattern `l2.json` already uses for `Expr`/`ParamDecl`) — a real `logic.VarDecl`, no `initializer`, present
exactly when extracted from a real `for-in` collection-for. `itemParam` unchanged. `bind.Param` gains
`target: NodeId`, present exactly when the parameter carries a declaration-tier symbol. No
`x-uir-breaking` marker. `just codegen` regenerated Dart/TS output cleanly; `codegen-check` passed as part
of `just ci`.

## 12. Analyzer changes

- `dart/bridge_analyzer/lib/src/session/extract/scope.dart` — `Scope` gains `_widgetOwner`/
  `_widgetOrdinals`, a new factory `Scope.forWidgetTree(enclosing, {required owner, required body})`, and
  `widgetOwner`/`ordinalOfInWidgetTree` getters — deliberately separate from `_owner`/`_ordinals`/`owner`/
  `ordinalOf` (§6, §9).
- `dart/bridge_analyzer/lib/src/session/extract/component_extractor.dart` — the render tree's own scope
  is now built via `Scope.forWidgetTree(buildScope, owner: symbol, body: build.body)` (the *whole* build
  method body, covering both a direct single-expression return and M8-B's own structured-body branch),
  used for both.
- `dart/bridge_analyzer/lib/src/session/extract/widget_extractor.dart` — `ForElement`'s own
  `ForEachPartsWithDeclaration` case gains `_itemSymbol` (mirrors `statement_extractor.dart`'s own
  `_forEachLoopVariableSymbol` exactly, reading `scope.widgetOwner`/`ordinalOfInWidgetTree` instead of
  `owner`/`ordinalOf`), constructs `itemDecl` when a symbol is available, and passes the symbol into the
  template's own child-scope `Binding`.
- `dart/bridge_analyzer/lib/src/session/extract/binding_extractor.dart` — `bind.Param`'s own construction
  (the bare-identifier case) gains `target` when the binding carries a symbol.

## 13. Compiler/N-pass changes

**Zero.** `walk`/`walkNode` (`packages/compiler/src/internal/normalize/pass.ts`) is fully structural, no
per-kind registration — `ui.List.itemDecl` is walked automatically. `collectBound`/`collectParams` (N5's
own closure-capture analysis) do not enumerate `itemParam` by name — investigated as a real, flagged risk,
not dismissed: proven structurally unreachable, because N5 only ever lifts a *named* action (a class
method torn off as a callback), and a named action is declared outside `build()` entirely, so it can never
lexically reach a `build()`-local collection-for's own item (a real Dart compile error if attempted). Only
*inline* callbacks can capture `item`, and N5 never lifts those. Confirmed directly against the real
generator for both a plain inline callback and one that also writes a signal (the shape most likely to
trigger lifting elsewhere in this codebase): neither was lifted; both correctly captured the per-iteration
item.

## 14. Generator changes

- `packages/generators/react/src/internal/emit/component.ts` — `emitBinding`'s `bind.Param` case now
  checks `target` first, resolving via `scope.localName` (the same mechanism every other declaration-tier
  reference already uses), falling back to `props.${name}` only when absent. `ui.List`'s own `listScope`
  gains a `localName` override (`itemDeclId → itemName`), alongside the pre-existing, still-necessary
  `paramInScope` name-equality fallback (needed for `ListView.builder`, which carries no `itemDecl`).

**A real, pre-existing, independently-discovered generator defect, found and fixed as part of this
milestone's own required execution path**: before this fix, `bind.Param` unconditionally emitted
`props.${name}` — correct for an ordinary widget/component constructor parameter, and, before this
milestone, the *only* kind of `bind.Param` that had ever reached the generator from real analyzer output
(`ui.List`'s own header comment: *"had never been generated from real analyzer output"*, unchanged since
M4-H). Proven directly, before any fix: `Text(item)` inside a real collection-for emitted
`<Text>{props.item}</Text>`, referencing a `props` variable the component does not have — a real,
silent-wrong-code defect this milestone's own build-proof could not have passed honestly without fixing.
Disclosed per §22 of the milestone brief: mechanical (a target-vs-props check), directly on this
milestone's own execution path (its own identity work is what supplies the fact — `target` — needed to fix
it), introduces no new architecture.

Nested/sibling same-name items need **no** disambiguated JavaScript naming (unlike M9-D's own
`dialogRef0`/`dialogRef1`) — each item lives in its own, separate `.map()` callback's own function scope,
so ordinary JS lexical shadowing already gives the correct answer with the identical source spelling,
confirmed directly against real generated output.

## 15. Runtime changes

**None.**

## 16. Exact supported subset

A widget-tree collection-for's own single declared item (`for (final item in items) Widget(item)`), any
depth of nesting, any number of siblings, any name (including shadowing an outer item, an ordinary local,
or a statement-level loop variable of the identical spelling), any primitive or project-defined item type.

## 17. Exact refused subset

Not refused, but **not given identity either** (a genuinely different, still-deferred gap, not a new
refusal): `ListView.builder(itemBuilder: (context, index) => ...)`'s own `itemBuilder` closure parameter —
a real closure parameter, never Scope-wired, the same category `showDialog`'s builder parameter is (M9-E).
`ui.List.itemDecl` is simply absent for this shape; the pre-existing, unmodified `paramInScope` name-based
fallback still resolves it, exactly as before. `indexParam` is untouched. No app-specific behaviour, no
Continuum dependency, no widening into spread elements, collection-if, indexed iteration, destructuring
patterns, or general parameter identity.

## 18. N5 result

Zero changes. §13 above.

## 19. Evaluation-order / capture-semantics result

Confirmed directly against real generated output, not assumed equivalent to JS `.map()` by default: one
template evaluation per item (`.map()`'s own semantics, unmodified from before this milestone — this
milestone changed identity resolution, not iteration structure), iterable evaluated once, outside the new
item's own scope (F13), per-iteration lexical binding preserved by ordinary JS closures over a `.map()`
callback's own parameter (no shared/reused variable — proven by F11's real callback capture test and by the
real, semantic build-proof assertion that a nested template correctly reads *both* its own item and the
outer loop's own item, §21 Mutation C).

## 20. Mutation / adversarial results

1. **Symbol minting disabled** (`_itemSymbol` forced to always return `null`) — 10 of 15 extraction tests
   failed (every positive-identity assertion). Reverted, clean.
2. **Symbol derived from name/owner only, ordinal dropped** (`ordinal: 0` hardcoded) — F5/F6 and F7 (the
   same-name collision tests) failed, *and* a real `BRG1202` duplicate-symbol diagnostic independently
   caught it too (defense in depth). Reverted, clean.
3. **Generator resolves to a global current-item binding** (`localName` matches any id, not just the
   specific `itemDeclId`) — initially **not caught** by the existing fixture (a genuine test-coverage gap
   found and closed: nothing previously exercised reading an *outer* collection-for's own item from within
   a *nested* template). The fixture and build-proof were extended with exactly that shape
   (`group`/`entry`, distinct names, inner template reading both); the mutation was then re-applied and
   correctly caught (`${entry}: ${entry}` instead of `${group}: ${entry}` — a genuine, silent-wrong,
   type-valid output). Reverted, clean.
4. **Item registered into scope before its own iterable is extracted** (premature registration) — F5/F6
   failed (the inner loop's own iterable, itself a bare identifier reading the outer item, resolved to
   itself instead of the outer declaration). Also exposed a real coverage gap in F14 (checked only
   `logic.Ref`, not `bind.Param`, for the same bare-identifier shape F5/F6 already needed both for) — fixed
   directly. Reverted, clean.
5. **Template's own read bound to a different symbol than `itemDecl` carries** (a direct "swapped target"
   simulation) — 11 tests failed immediately, plus the pre-existing `BRG1201` dangling-reference machinery
   independently caught it too. Reverted, clean.

All five reverted; `dart analyze --fatal-infos` and the full Dart/TS suites re-confirmed clean after each
revert and after all five together.

## 21. Real build proof

`fixtures/apps/widget_collection_for_identity` (new, permanent, generic — no app-specific terminology):
repeated reads, an inline-callback closure capture (with `setState`), same-name nested shadowing, sibling
same-name loops, and a distinctly-named nested loop whose inner template reads *both* its own item and the
outer loop's own item. Real `bridge analyze` (zero errors) → committed golden → real `bridge normalize`
(N1–N11 unmodified) → real generator → real `tsc` against the real, unmocked `@bridge/runtime-react`. All 7
build-proof tests pass, including the full chain and the semantic, exact-string assertion that proved
Mutation 3 (§20).

## 22. Regressions

Full Dart suite: 400/400 (`dart analyze --fatal-infos` clean across `bridge_analyzer` and `bridge_uir`).
Full TS compiler suite: 159/159 (unchanged). Full TS generator suite: 356/356, including every M7/M8/M9-A/
M9-B/M9-C/M9-D/M9-E build-proof and diagnostic test, all re-run fresh after every mutation revert. Explicitly
verified unchanged: statement-level for-in, C-style loops, multi-declaration loops, growing declaration-list
scope, catch-clause identity, dialog extraction (M9-D), dialog dismissal (M9-E), ordinary navigation — all
confirmed via their own, unmodified test suites passing alongside this milestone's own new work. No
capability was reverted.

## 23. CI / determinism / fixed-point

- `just ci`: exit 0 (an earlier, unrelated `dart test` run in this session hit the 120s foreground timeout
  and was moved to background — not a failure, checked and confirmed complete with exit 0 separately;
  `just ci` itself ran to completion cleanly on its own attempt).
- Schema changed → `just codegen` run, `codegen-check` passed as part of `just ci`.
- `bridge validate --json` on `fixtures/apps/widget_collection_for_identity`: `{"ok": true, "checks":
  [{"deterministic": true}, {"fixed point": true}]}`.
- `git diff --check`: clean.
- Real `tsc` run as part of the build-proof (§21).
- The full browser-based `just determinism` was not run this pass, matching M9-D/M9-E's own honest
  disclosure of the same — the compiler-level determinism/fixed-point guarantee above was verified
  directly instead.

## 24. Silent-wrong-code audit

- Wrong item captured / outer item captured instead of inner / inner item leaking outward — all
  structurally impossible by construction (id-keyed `localName` resolution, never name-based for anything
  carrying real identity) and directly disproven by Mutation 3's own real, caught failure mode.
- Sibling item collision — disproven by F7 and the real build-proof's own sibling assertions.
- Ordinary-local / catch-binding / statement-loop collision — disproven by F8/F9/F10 and Mutation 2's own
  real `BRG1202` catch.
- Callback captures wrong iteration binding — disproven by F11 and the real build-proof's own `setState`
  assertion.
- Iterable evaluated multiple times / template evaluated wrong number of times — unchanged from before
  this milestone (this milestone changed identity resolution only, never iteration structure); not
  re-derived from first principles, but not altered either, and the real build-proof's own generated
  `.map()` calls are structurally identical in shape to before this milestone.
- `Ref.target` correct but generator binding wrong — exactly Mutation 3's own scenario, caught.
- Content-derived NodeId collision — the original defect this milestone fixes (two content-identical
  reads of *different* declarations previously shared one id); confirmed resolved (`target` is now part of
  the content, making genuinely distinct declarations' own reads genuinely distinct).
- Nondeterministic ordinal assignment — `_OrdinalVisitor`'s own pre-pass is a deterministic, single,
  ordered walk (unmodified); `bridge validate`'s own determinism check confirms this end to end.
- **A real generator defect found and fixed** (`props.item` instead of `item`, §14) — not merely audited
  for, actually found, via direct inspection of real generated output before assuming the identity work
  alone was sufficient.
- **A real test-coverage gap found and closed** (§20, Mutation 3) — a mutation that initially passed
  undetected was not accepted as "safe"; the fixture and tests were extended until it was genuinely caught.

A compiling TypeScript result was never treated as sufficient proof on its own — every claim above is
backed by a semantic assertion in a real test (extraction-level `target`/`itemDecl` values, or
generator-level exact lowering strings), and the riskiest claim (N5 never lifting an item-capturing
closure) was verified against real generated output for both a plain and a signal-writing callback before
being accepted, not assumed from the mechanism's own generality alone.

## 25. FlutterBridge/Continuum boundary audit

`git diff HEAD` restricted to this milestone's own production files contains zero occurrences of
"continuum," checked directly. No Continuum fixtures, no Continuum-specific compiler branch, no copied
external-app source, no application-specific identifiers in the new generic fixture (`Home`,
`HomeScreen`/`_HomeScreenState`, `Alpha`/`Beta`/`Gamma`, `One`/`Two`/`Three`/`Four` — all generic).

## 26. Remaining FlutterBridge-only blocker graph

Unchanged from M9-E except this milestone's own item resolved (bounded):

- `BridgeAnalyzer` does not gate on the resolved unit's own analyzer errors — unchanged, not investigated.
- Private/derived getters — unchanged.
- `ScaffoldMessenger.of` — unchanged.
- Class-declaration module emission — unchanged (confirmed still refused, `BRG3002`, encountered and
  avoided during this milestone's own fixture design — a project-defined class as a collection item would
  have hit this unrelated, pre-existing limitation; the fixture uses `List<String>`/`List<List<String>>`
  instead, and F15's own extraction-level test proves the identity mechanism is type-agnostic without
  needing the generator to emit the class itself).
- `showDialog` result transportation, `useRootNavigator: false` — unchanged (M9-E's own deferrals).
- **New**: `ListView.builder`'s own `itemBuilder` closure parameter remains without declaration-tier
  identity — the same category ADR-28 §4 already defers for ordinary widget/component constructor
  parameters and `showDialog`'s own builder parameter (M9-E). Not this milestone's to solve — would need
  its own dedicated investigation into whether/how a genuine closure parameter (as opposed to a for-in
  declaration) can safely gain identity without inventing app-specific machinery.

## 27. Recommended M9-G

Not preselected. Two concrete, evidence-backed candidates:

1. **General closure/builder-parameter declaration identity** — the common root of `showDialog`'s builder
   parameter (M9-E), `ListView.builder`'s `itemBuilder` (this milestone), and ADR-28 §4's own original
   deferral. A materially larger question than any single instance of it; deserves its own dedicated
   investigation into whether a general mechanism is safe, or whether each instance genuinely needs its own
   narrow, separately-evidenced treatment the way this milestone's own `Scope.forWidgetTree` was.
2. **Whether `BridgeAnalyzer` should gate on the resolved unit's own analyzer errors** — carried over from
   M9-C/M9-D/M9-E, still not investigated.

**M9-F complete. FlutterBridge remains the sole development target. M9-G has not been started.**
