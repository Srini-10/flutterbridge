# ADR-0047 — Project-Widget Composition via a Resolved `WidgetRef.target`

## 1. Semantic problem

A project-defined widget composed as a child of another widget's render tree —
`Scaffold(body: MyOtherWidget())`, where `MyOtherWidget` is a class this same program declares —
refuses honestly with `BRG3001` ("not a Flutter widget this generator has a mapping for") at
generation time. This is not a missing capability at the semantic level — extraction already
resolves everything needed to know this is a reference to another `ui.Component` this program
also extracts — it is a lost-provenance bug in how that fact reaches the generator.

## 2. Current limitation — confirmed live

A minimal probe (`ParentScreen.build() => Scaffold(body: ChildWidget())`, `ChildWidget` a
sibling `StatelessWidget` in the same file) fails: `BRG3001` on `ChildWidget`, zero files
written. The mechanism that was clearly intended to handle this already exists and partially
works — `component.ts`'s `emitElement` (M8-F) checks `scope.componentModules` (pre-populated,
once, for every non-app-root `ui.Component`, keyed by that component's own `anchor`) before
falling through to the Flutter-widget catalog. `fixtures/apps/cross_package_app`'s own
`GreetingCard` — a project widget declared in a **separate, `path:`-dependency package** — is
composed as a child of `HomeScreen` and renders correctly through exactly this path, proven by
the pre-existing `cross_package_build.test.ts`.

The difference between the working case and the broken one is the anchor's own string format,
confirmed by direct inspection of both raw UIR documents:

- `ui.Component.anchor`'s file segment is **project-relative** (`lib/main.dart#ChildWidget`) for
  a component declared in the analyzed project's own source, and a **package URI**
  (`package:ui_kit/greeting_card.dart#GreetingCard`) for one declared in a local path dependency
  — `node_factory.dart`'s own `_build` uses `raw.span.file` as the anchor's first segment, and
  `span.file` is exactly `Extractor`'s own `path` argument, which is a project-relative path for
  every file in `project.libraryFiles` and a `package:` URI for every file in
  `project.dependencyLibraryFiles` (`analysis_session.dart` §"resolve every file").
- `component.ts`'s own anchor reconstruction (`` `${componentRef['library']}#${widgetName}` ``)
  always uses `component.library` — which is **always** a package URI
  (`type.element.library.identifier`), regardless of where the class is declared.

So the reconstruction only ever matches the case it was extracted from (M8-F, a cross-package
reference, where the dependency file's own anchor is *also* package-URI-shaped) and silently
mismatches the same-project case, which is the overwhelmingly more common shape a real
application would use.

## 3. Semantic primitive: declaration-tier identity, not string reconstruction

The fix this ADR selects is not "make the string reconstruction smarter." Every other
declaration reference in this compiler — a class, a method, a field, a signal, an action, an
enum constant, a `for`-loop variable, a render-tree callback local (M9–M11-D) — resolves through
one discipline: extraction mints a **symbol** for a resolved analyzer `Element`, and the
canonical builder alone resolves a symbol to a `NodeId` (`symbol_table.dart`'s own library doc:
*"Extraction never allocates a `NodeId`... it names declarations by symbol... An unkept promise
is `BRG1201`, never a null"*). A `ui.Component`'s own reference is the one place in the whole
pipeline where this discipline was bypassed in favor of string reconstruction against an
anchor — itself only ever meant for human-authored overrides, not for one node to address
another. This ADR closes that gap the same way ADR-0033/ADR-0034 already closed it for member
reads and class-type references: a resolved `target: NodeId`, minted at extraction time from the
identical mechanism (`RawNodeEmitter.componentSymbolOf`, already used and proven by
`route_extractor.dart`/`transition_extractor.dart` for `app.Route`/`app.RouteTransition`
component targets) this compiler already trusts for the exact same class of fact.

## 4. Fresh analyzer evidence

`RawNodeEmitter.componentSymbolOf(DartType? type, String name)` (`raw_node_emitter.dart:192`)
already exists, already correctly classifies a resolved `ClassElement`'s declaring library
against `packageName` (the analyzed project's own package name) and `extractedDependencyFiles`
(every local dependency file this analysis root actually extracted), and already returns the
identical `comp:<path>#<name>` symbol string `component_extractor.dart` mints for that same
class's own `ui.Component` node (`out.symbols.component(name)`, called with the SAME `path`
convention on both sides because both derive from the same per-file `Extractor(path: ...)`
argument). It returns `null` for a framework widget (no adapter recognizes its library as the
application's or a local dependency's own) — the honest "this is not one of ours" case,
unchanged from today's `userDefined` classification.

Reproduced fresh, live, against the probes below: `componentSymbolOf`'s existing behavior for
cross-file, same-project references (`ChildWidget` declared in `lib/child_widget.dart`,
composed from `lib/main.dart`) mints `comp:lib/child_widget.dart#ChildWidget` — matching
`ChildWidget`'s own `ui.Component.symbol` exactly, confirmed by direct inspection of both raw
UIR records in the same document.

## 5. Reduction ladder

| Rung | Shape | Result |
|---|---|---|
| R1 | project widget construction in isolation (unreferenced top-level class) | already works — every `ui.Component` is extracted and generated as its own file regardless of reachability (confirmed, M11-D) |
| R2 | project widget passed as a child/property (`Scaffold(body: ChildWidget())`) | **broken today** (`BRG3001`), live-probed; root cause confirmed (§2) |
| R3 | project widget nested one level deep inside another render tree | same failure, same root cause — the anchor mismatch does not depend on nesting depth |
| R4 | cross-file project widget composition (`ChildWidget` in a sibling file) | live-probed; `componentSymbolOf` confirmed to reconstruct the exact matching symbol |
| R5 | multiple project widgets with the same class name in different files | symbols are keyed by `path#name`, so two same-named classes in different files mint distinct symbols by construction — no collision risk, matching the identical guarantee ADR-0032 (class declaration identity) already gives |
| R6 | project widget containing its own local render-tree callback state | orthogonal — this fix touches only `ui.Element.component`'s own value object; `Scope.forWidgetTree`/declaration identity inside the composed widget's own `build()` is untouched |
| R7 | project widget composition alongside supported method/getter/field usage | orthogonal — a composed widget's own props are ordinary `bind.*` values, lowered exactly as they are for any other `ui.Element`; this fix does not change binding classification |
| R8 | unreachable project widget composition | no risk — `componentModules` is pre-populated for every non-app-root component regardless of whether anything ends up referencing it; a `target` that resolves to an unreached component still resolves correctly (the "unreached" component is still emitted as its own file, per R1) |
| R9 | recursive widget composition (a widget composing itself, directly or mutually) | safe by construction — `emitComponentReference` never inlines a referenced component's own render tree; it emits an ordinary JSX tag plus a module import, identical to how React itself represents recursive/self-referential composition; confirmed by direct reading of `emitComponentReference` (`component.ts:1379-1397`), which performs no recursive emission at all |
| R10 | composition involving an unsupported/ineligible child shape (e.g. a widget whose constructor takes an argument the emitter cannot lower) | unaffected by this ADR — an ineligible prop/argument still refuses through its own existing, unrelated check (`emitBinding`'s own refusal path), independent of whether the widget reference itself resolves |

## 6. Supported subset

A `ui.Element` referencing a project-declared widget class — same file, a different file in the
same project, or a local path dependency (already supported, unified onto the same mechanism) —
resolves a `target` at extraction time and is composed as an ordinary imported React component
reference. Repeated references to the same widget (including through an import alias, which
carries no analyzer-level meaning) resolve to the identical `target`.

## 7. Refused subset

Unchanged from today: a widget this generator has no catalog mapping for and that is not a
project-declared class (a framework widget with no entry) still refuses `BRG3001`, unchanged in
wording and unchanged in every other respect. A prop/argument this generator cannot lower still
refuses through its own existing, independent check. Nothing about member emission, reachability,
or capability checking (`checkCapabilities`) changes.

## 8. UIR/schema impact

`WidgetRef` (`packages/uir/schema/shared.json`) gains one optional field, `target: NodeId`,
described identically in kind to `TypeRef.target` (ADR-0034) — declaration provenance only,
absent for a framework/SDK widget or an unresolvable external reference, never a claim about
what the generator can render. This is the smallest schema change that lets the generator stop
reconstructing an anchor string and instead read a resolved fact, mirroring the exact precedent
`TypeRef.target` already set for class-type references.

## 9. Extraction changes

`widget_extractor.dart`'s own widget-reference construction (`RawNodeEmitter.widgetRef`, the
function that already builds `component`'s `name`/`constructorName`/`library`/`userDefined`)
additionally calls `out.componentSymbolOf(type, name)` and includes `target: RawRef(symbol)`
when non-null — the identical call already made from `route_extractor.dart` and
`transition_extractor.dart` for the same underlying fact, applied at a third call site.

## 10. Normalization changes

None. `target` is an ordinary `NodeId` reference field; canonicalization/reference-graph passes
already treat every `NodeId`-typed field uniformly (`UIR_REFERENCE_FIELDS`).

## 11. Reachability changes

None. A composed reference's `target` is read by the generator the same way any other resolved
reference is; it does not participate in `reachableFunctions`/`reachableMembers`/
`reachableClassTypes` (those are function/member/type-level, not component-level) and does not
change which `ui.Component`s are emitted (still: every one, regardless of reachability, per R1/R8).

## 12. Generator changes

`component.ts`'s `emitElement` reads `componentRef.target` directly (a resolved `NodeId`) and
resolves it through the existing `componentModules` map, now keyed additionally (or instead) by
`NodeId` rather than solely by anchor string — falling through to the unchanged catalog/`BRG3001`
path when `target` is absent, exactly as today.

## 13. Runtime impact

None. The emitted output is unchanged in shape from the already-working cross-package case
(`<ChildWidget {...props} />` plus a module import) — this ADR only fixes which references reach
that emission path.

## 14. Non-goals

This ADR does not add closure/capture machinery, does not add a generalized symbol table (it
reuses the one mechanism this compiler already has), does not change `checkCapabilities` or
prop/binding lowering, and does not attempt to support a composed widget whose own construction
is otherwise ineligible (R10) — that refusal is independent and untouched.

## 15. Alternatives rejected

**Generator-side anchor reconstruction with project-package detection.** Duplicating
`Symbols.pathOf`'s package-name-stripping logic in TypeScript, so `component.ts` could correctly
build the project-relative anchor form itself. Rejected: this would require exposing the
project's own package name into the UIR document (a new, broader surface) and would maintain the
identical string transform in two languages that must never diverge — exactly the
"two-implementations-of-one-fact" risk the symbol/`NodeId` discipline exists to avoid everywhere
else in this compiler.

**Rewriting `ui.Component.anchor` to always use the package-URI form.** Rejected outright:
anchors are the addressing key a human-authored override is stored under
(`node_factory.dart`'s own doc: *"An anchor is the key an override is stored under and must name
one node"*), and are documented as project-relative by design for exactly that human-facing
reason. Changing this would be a breaking change to every existing override and to
`anchorSegment`-based route naming, for a problem `target` already solves without touching
anchors at all.

## 16. Mutation-testing plan

1. Make `componentSymbolOf` always return `null` (undoes the whole fix) — expect the positive
   fixture to regress to `BRG3001`.
2. Substitute a different, unrelated symbol for `target` — expect the resolved reference to point
   at the wrong component, caught by an id-identity assertion.
3. Remove the `target` field from the schema entirely while leaving extraction/generator code
   referencing it — expect a build-time (`tsc`/codegen-check) failure, proving the schema change
   is load-bearing, not decorative.
4. Make the generator ignore `target` and fall back to the old anchor-string reconstruction —
   expect the same-project composition fixture to regress to `BRG3001`.
5. Make `componentSymbolOf` resolve a *framework* widget's library too (remove the
   `isFrameworkLibrary` boundary) — expect a false-positive `target` on a `Scaffold`/`Text`
   reference, caught by a negative-control test asserting framework widgets still resolve no
   `target`.
6. Swap `packageName` for an empty string in the classification call — expect every same-project
   reference to be misclassified as external (falls through to `BRG3001`), caught by the positive
   fixture.
