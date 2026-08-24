# ADR-28 amendment — widget-tree collection-for item declaration identity

- **Status:** Accepted and implemented (M9-F). Amends ADR-28 §3, §4, §17, and the for-loop amendment
  (`docs/adr/0028-amendment-for-loop-variable-identity.md`).
- **Date:** 2026-08-24.

## 1. What was left open, and the question this amendment had to answer first

The for-loop amendment (M9-A) covered a for-in loop's own declared variable — but only at *statement*
level (`for (final item in items) { ... }`). Its own §13 explicitly deferred the *widget-tree* shape:

> *"`ui.List`'s own collection-for (`for (x in xs) Widget(x)`) — Out of scope — a structurally different
> UIR node (`ui.List.itemParam`), bound as a parameter-tier name inside a widget-tree template, not a
> `logic.For`/`Binds.local` binding at all. Architecturally the same category ADR-28 §4 already defers for
> `ParamDecl` generally. Not touched."*

M9-A left a genuine, unresolved architectural question, not merely an unimplemented rung: is a widget-tree
collection-for's own `item` a *declaration* (ADR-28's own family) or a *parameter* (ADR-28 §4's own,
separately-deferred, still-unimplemented territory — component/builder constructor parameters, which have
no comparable identity mechanism at all)? M9-D/M9-E's own investigations into `showDialog`'s builder
parameter and a dialog's `dismisses` scope both independently confirmed that ordinary closure/builder
*parameters* genuinely lack any Element-to-Scope wiring path (`ExpressionExtractor.lambda()` is never
invoked for them) — a materially different, harder problem than declaration identity. This amendment had
to determine, with real evidence, which category `item` actually belongs to before choosing a mechanism.

## 2. The answer: `item` is a declaration, reached through a different code path — not a parameter

Directly inspecting the Dart AST and the analyzer's own resolved element model settles this. `for (final
item in items)` — whether it appears as a statement or inside a collection literal (`children: [for (...)
...]`) — parses to the *identical* AST shape in both places: a `ForEachPartsWithDeclaration` inside a
`ForElement`/`ForStatement`, whose `loopVariable` is a `DeclaredIdentifier` with a real, resolvable
`LocalVariableElement`. `scope.dart`'s own `_OrdinalVisitor.visitDeclaredIdentifier` — the mechanism M9-A
already wired up — numbers *every* `DeclaredIdentifier` **unconditionally**, with no parent-shape guard,
because (its own comment) `DeclaredIdentifier` is "used exclusively for a for-in loop's own declared
variable — nothing else in Dart's grammar constructs one." The mechanism was already fully general; it was
simply never invoked for a widget tree, because `WidgetExtractor`'s own scope (`component_extractor.dart`'s
`buildScope`) was never constructed via `Scope.forBody` — the *only* factory that runs the ordinal pre-pass
— since a `build()` method is not an action/function body in ADR-28's own original sense.

This is the opposite conclusion from `showDialog`'s builder parameter: there, the closure itself is
discarded by `MaterialRouteAdapter._returned()` before extraction ever sees its own `FormalParameterList`,
so no Element-to-Scope path exists *at all* to wire up. Here, the Element is real, already numbered by an
existing, unmodified visitor, and the *only* gap is that nothing ever handed `WidgetExtractor`'s own scope
an owner/ordinal source to read from. **`item` is a declaration, reached through a code path ADR-28's own
identity scheme was never extended to cover — not a new identity concept, and not §4's own parameter
territory.**

## 3. Declaration-tier identity rule — a deliberately separate owner/ordinal pair, not `Scope.forBody` reused

`Scope` (`scope.dart`) gains a second, independent owner/ordinal pair — `_widgetOwner`/`_widgetOrdinals`,
populated by a new factory, `Scope.forWidgetTree(enclosing, {required String owner, required AstNode
body})` — rather than routing widget-tree extraction through `Scope.forBody` itself. This is a deliberate,
evidenced choice, not an arbitrary parallel mechanism:

`Scope.forBody`'s own ordinal pre-pass (`_ordinalsOf`) numbers *every* `VariableDeclaration`/`CatchClause`/
`DeclaredIdentifier` in the body it is given, unconditionally — including ones inside nested closures
(`onPressed: () { ... }` callbacks written directly in the render tree). A real, pre-existing, *separate*
gap was found and confirmed during this investigation: an ordinary local or a statement-level for-in loop
declared inside such an inline callback has **no** declaration-tier identity today (`logic.Ref.target` is
absent, confirmed by direct probe), because `scope.owner` is `null` throughout the whole widget-tree walk.
Routing `buildScope` through `Scope.forBody` would have fixed that gap too, as a side effect — but that
fix would be unvalidated (no reduction ladder, no regression tests, no mutation coverage for it) and is a
*different*, separately-evidenced capability this milestone was not asked to investigate or authorize
(§22 of the milestone brief: no unrelated fixes). Keeping `_widgetOwner`/`_widgetOrdinals` structurally
separate — read by exactly one call site (`widget_extractor.dart`'s own collection-for handling), never by
`statement_extractor.dart`'s `_localSymbol`-family helpers — means this amendment changes nothing about
that other gap's own observable behaviour, confirmed directly (a dedicated test, "a statement-level for-in
loop and a widget-tree collection-for sharing a name never collide," proves the statement-level loop's own
symbol stays exactly as absent as before).

The owner is the enclosing `ui.Component`'s own symbol (`out.symbols.component(name)`) — the same,
already-minted symbol `TransitionExtractor.enclosingComponent` already uses for an unrelated purpose
(a transition's own `source`) — reused here for the identical reason ADR-28's own `owner` concept exists:
a component's own render tree is the "owning body" a collection-for item's declaration-tier symbol belongs
to, the nearest enclosing thing ADR-28's own vocabulary has a name for. `Symbols.local`'s own format
(`local:$path#$owner.$ordinal.$name`) makes a widget-tree item's own symbol (`owner` prefixed `comp:...`)
structurally distinct from any action/function-owned local's own symbol (`owner` prefixed `act:...`/
`fn:...`) regardless of ordinal overlap — collision is impossible by construction, not merely unobserved.

Ordinals are numbered once, over the *whole* build-method body (`build.body`, not merely the returned
expression) — covering both a direct single-expression `return` and M8-B's own "structured build-method
extraction" branch identically, since a collection-for may appear inside either shape. The identical
"one pre-order pass, keyed by resolved `Element`" scheme M9-A already proved collision-free for
statement-level for-loops (nested, sibling, and same-name-shadowed) is reused unmodified.

## 4. What this amendment authorizes, and what it does not

**Authorized and implemented:** a widget-tree collection-for's own single declared item
(`for (final item in items) Widget(item)`), reached via `ForElement`/`ForEachPartsWithDeclaration` inside
any collection literal `WidgetExtractor` walks — nested to any depth, any number of siblings, any name,
including one shadowing an outer collection-for's own item, an ordinary local, or a statement-level loop
variable of the identical spelling.

**Not authorized:** a `ListView.builder(itemBuilder: (context, index) => ...)`-shaped `ui.List` — its own
`itemBuilder` closure parameter is genuinely §4's own deferred territory (a real closure parameter, never
Scope-wired, the same category `showDialog`'s builder parameter is), not a for-in declaration at all, and
this amendment does not attempt to give it one. `ui.List.itemDecl` is simply absent for this shape,
proven by a dedicated negative-control test.

**Not authorized:** dialog result transportation, `useRootNavigator`, general parameter identity for
ordinary widget/component constructor parameters, indexed iteration (`indexParam`), spread elements,
collection-if widening, or any capability beyond the existing, evidenced collection-for shape. `indexParam`
is untouched — it remains a plain, name-only string, exactly as before.

## 5. Schema

**Additive only**, the identical shape the for-loop amendment's own §5 used for `loopDecl`.
`UiList` (`packages/uir/schema/l2.json`) gains one new optional field, `itemDecl: VarDecl` ($ref into
`l1.json`, the same cross-layer `$ref` pattern `l2.json` already uses for `Expr`/`ParamDecl`) — a real,
declaration-tier `logic.VarDecl` with no `initializer` (the runtime binds it once per iteration, not an
expression), present exactly when the `ui.List` was extracted from a real Dart `for-in` collection-for.
`itemParam` (the existing plain string) is retained unchanged, for description, mirroring
`loopVariable`/`loopDecl`'s own precedent exactly. `bind.Param` gains one new optional field, `target:
NodeId`, present exactly when the parameter it names carries a declaration-tier symbol (today: only a
widget-tree collection-for's own item) — absent for an ordinary widget/builder constructor parameter,
which the schema's own doc text states explicitly so a reader does not mistake absence for an incomplete
document. No `x-uir-breaking` marker: no existing field's shape or requiredness changes.

## 6. Normalization (N5) — no change required, and this is itself evidence

Identical finding to the for-loop amendment's own §6, re-confirmed directly rather than assumed to still
hold: `walk(program)`/`walkNode` (`packages/compiler/src/internal/normalize/pass.ts`) is a fully generic,
structural collector with no per-kind registration anywhere — a new `ui.List.itemDecl` field is walked
automatically, exactly as `logic.For.loopDecl` already is. More importantly, `collectBound`/`collectParams`
(N5's own closure-capture analysis, which does *not* enumerate `itemParam`/`indexParam` by name) was
investigated as a real, flagged risk before being dismissed: could a closure that captures a widget-tree
item ever be *lifted* by N5 in a way that risks this gap? Proven, not assumed, that it cannot — N5 only
ever lifts a *named* action (a class method torn off as a callback), and a named action is declared outside
`build()` entirely, so it can never lexically reach a `build()`-local collection-for's own item at all
(Dart's own lexical scoping makes this a compile error if attempted). The only closures that *can* capture
`item` are inline ones written directly inside the template, and N5 never lifts those, named or not — 
confirmed directly against the real generator, both for a plain inline callback and one that also writes a
signal (the shape that most plausibly triggers lifting elsewhere in this codebase): neither was lifted;
both correctly captured the per-iteration `item`. **Zero lines of `n5_lift_closures.ts` changed.**

## 7. Generator — a real, pre-existing, independently-discovered defect found and fixed

`bind.Param`'s existing emission (`component.ts`) unconditionally lowered every parameter read to
`props.${name}` — correct for an ordinary widget/component constructor parameter, and, before this
amendment, the *only* kind of `bind.Param` that had ever reached the generator from real analyzer output
(`ui.List`'s own header comment: *"`ui.List` had never been generated from real analyzer output"* —
unchanged since M4-H). A widget-tree collection-for's own item was *already*, independently of this
amendment's own identity work, misclassified the same way — proven directly, before any generator change,
against the unmodified generator: `Text(item)` inside a real `for (final item in items) ...` emitted
`<Text>{props.item}</Text>`, referencing a `props` variable the component does not have (its `build()`
takes no parameters at all in the evidenced case) — a real, silent-wrong-code defect, not merely a missing
capability, that this amendment's own required build-proof could not have completed honestly without
fixing. `bind.Param`'s own `target` field (§5) is exactly the fact needed to fix it soundly: `emitBinding`'s
`bind.Param` case now checks `target` first, resolving it via `scope.localName` — the same,
already-established mechanism every other declaration-tier reference already uses — and falls back to
`props.${name}` only when absent (every ordinary widget/component parameter, unchanged). `ui.List`'s own
`listScope` gains a `localName` override resolving `itemDecl`'s own id to the emitted `.map()` callback's
own parameter name, alongside the pre-existing, still-necessary `paramInScope` name-equality fallback
(needed only for the `ListView.builder` shape, which carries no `itemDecl` to resolve by id).

Nested/sibling same-name items need no additional disambiguation in the generated JavaScript at all —
unlike M9-D's own `dialogRef0`/`dialogRef1` naming (multiple refs sharing *one* component function's own
scope), each collection-for item lives in its *own*, separate `.map()` callback's own function scope, so
ordinary JavaScript lexical shadowing already gives the correct answer with the identical, unmodified
source spelling — proven directly against real generated output for a nested, same-name case.

## 8. Rename/edit stability, cross-file behaviour

Not claimed, not required — identical reasoning to ADR-28 §13/§14 and both prior amendments: a
collection-for item's own `Element` never resolves outside the one render tree it is declared in, and
nothing outside the single extraction pass that mints its symbol and consumes it ever looks it up again.

## 9. Migration / schema-version consequences

None beyond ADR-28 §16's own precedent, applied to two newly-introduced, additive fields (`itemDecl`,
`bind.Param.target`): neither existed before this milestone, so no existing document's id values change
for them. Every document written before this amendment stays valid; every consumer pins the schema hash
(ADR-14) and `just codegen-check` enforces it, so the hash moving once cannot go unnoticed.
