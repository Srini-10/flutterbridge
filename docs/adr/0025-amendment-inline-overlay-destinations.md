# ADR-0025 amendment — inline overlay destinations (`app.RouteTransition.inline`)

- **Status:** Accepted and implemented (M9-D), analyzer/schema half. Amends ADR-0025's own "overlay
  routes" row and §6.
- **Date:** 2026-08-24.

## 1. What ADR-0025 got wrong, and what M8-X proved

ADR-0025's own table claimed overlay routes needed nothing beyond D2 (`logic.Navigate`): *"An overlay
**is** a navigation to an inline destination"* (§"overlay routes" row). M8-X
(`docs/m8/m8x-brg3013-candidate-reduction.md` §4) tested this directly, through the real analyzer, and
found it false: `TransitionExtractor._destination()` requires an inline push's destination to resolve to a
**project-declared** `ui.Component` (`out.componentSymbolOf(...)`). `showDialog(builder: (_) =>
AlertDialog(title: ..., content: ...))` constructs a **framework** widget — nothing the project declares —
so it always failed that check and the edge was dropped, reported as *"pushes `AlertDialog`, which is not
a component this project declares."*

M8-X's own conclusion: *"what UIR construct represents 'render this inline widget tree as a dialog' is not
decided... The ADR's own prose overstates what its mechanism currently covers — trust the executable
evidence over the prose."* This amendment supplies that decision.

## 2. The distinction ADR-0025 conflated

`app.RouteTransition.component` names a **reference** — a `NodeId` pointing at a real, separately-declared
`ui.Component` document node, the same way `Navigator.push(context, MaterialPageRoute(builder: (_) =>
HomeScreen()))` already works (M8-X candidate B, fully implemented since before this milestone).

`showDialog(builder: (_) => AlertDialog(...))` is a different shape entirely: there is no separately
declared component to reference. `AlertDialog(...)` is constructed **inline, at the call site**, exactly
the way a widget inside an ordinary `build()` render tree is — the same widget catalog (ADR-18), the same
`WidgetExtractor` that already turns `Scaffold(...)`/`Column(...)`/`Text(...)` into `ui.Element`/`ui.Text`
nodes for every component's own render tree.

Inventing a symbol for something the project never declared would be exactly the dangling reference
`_destination()`'s own existing comment already refuses for the component case (BRG1201: *"inventing a
symbol nothing declares would be a dangling reference"*). The honest answer is not a reference at all —
it is an **embedded subtree**, the identical shape `ui.Cond.then`/`ui.List.template` already use
(`packages/uir/schema/l2.json`'s own `UiNode` union, referenced there exactly as this amendment
references it here).

## 3. Decision

**Additive schema field.** `app.RouteTransition` gains `inline: UiNode` (`l2.json#/$defs/UiNode`,
cross-file reference — already precedented, `RouteTransition.arguments`... no, precedented by
`l3.json`'s own existing `l2.json#/$defs/Binding` reference), mutually exclusive with `target` and
`component` (was two-way, now three-way; `BRG1307`'s own check, `dart/bridge_analyzer/lib/src/emit/
validation.dart`'s `_checkTransitionDestinations`, extended accordingly — the schema still cannot state
"exactly one of three properties," so it is still enforced in code, unchanged in *kind*, only in *arity*).

**Extraction:** `TransitionExtractor._destination()` — when the widget does not resolve to a project
component (`out.componentSymbolOf(...)` returns null), instead of refusing, it is extracted as an ordinary
widget tree via `WidgetExtractor.extract(widget, scope)` — the identical mechanism a normal `build()`
render tree already uses, requiring **zero new extraction logic**. `AlertDialog` needed one thing: a
catalog entry (`catalog/widgets/material.json`, ADR-18) naming its `title`/`content` slots and its
`actions` ordered child list — a pure data addition, the same shape `AppBar`'s own entry already has.

**Not a `component`-shaped fallback.** The embedded tree is not wrapped in a synthetic `ui.Component` —
that would still require inventing an id nothing in the source declares, the exact thing BRG1201 exists to
refuse. It is embedded directly, with no id of its own beyond what `WidgetExtractor` already mints for any
nested widget node.

**`arguments` is not populated for an `inline` destination.** `app.RouteTransition.arguments` names
constructor parameters crossing to a *separate* destination — what N11 (ADR-11) promotes across a route
boundary. An inline destination has no such boundary: its own values are already embedded directly in the
tree `inline` carries. Recording them again in `arguments` would offer N11 a promotion with no
corresponding prop interface on the far side, because there is no far side — nothing is generated
separately. Found and fixed during this milestone's own first real-fixture reproduction (§6), not assumed
away.

## 4. What this authorizes, and what it does not

**Authorized:** any inline push destination that is a real, catalog-recognized (or ordinary,
generically-extractable) widget construction — the general mechanism `_destination()` now has, shared by
every overlay opener already recognized (`showDialog`, `showModalBottomSheet`, `showGeneralDialog`,
`showMenu` — `MaterialCatalog.navigationOverlayOpeners`, unchanged) and by an ordinary `Navigator.push`/
`pushReplacement` whose destination is a framework widget rather than a project component (proven
directly, `transition_test.dart`'s own updated test, §6).

**This milestone's own evidence is scoped to `showDialog`** with an `AlertDialog(title:, content:)`
destination (M8-X's own A1 reduction rung) — the mechanism is general by construction (not special-cased
to `showDialog`, because `_destination()` is shared code reached identically regardless of which overlay
opener or navigator method produced the call), but this milestone's own fixtures, tests, and generator
work do not separately validate `showModalBottomSheet`/`showMenu`/arbitrary `Navigator.push` shapes beyond
the one `transition_test.dart` regression already proves works structurally.

**Not authorized, still refused:** a captured navigation result (`final ok = await showDialog<bool>(...)`)
— the schema's own existing scope note (`logic.Navigate`'s doc comment, unchanged by this amendment):
*"The result of a navigation is not modelled: this node is evaluated for effect."* A dialog's own
`barrierDismissible:`/other named arguments to `showDialog` itself (as opposed to `AlertDialog`'s own
constructor arguments) — not read by `transitionOf`'s existing adapter code, unchanged, and out of this
milestone's own evidence. A `builder:` that does more than return a widget construction, or returns
something other than an `InstanceCreationExpression` — unchanged, still refused (`_destination`'s own
first check).

## 5. Schema/migration consequences

Additive only. `inline` did not exist before this milestone, so no existing document's id values change
for it — the same precedent ADR-28 §16/the M8-S and M9-A/B/C amendments already establish for a
newly-introduced field. No `x-uir-breaking` marker: no existing field's shape or requiredness changes.
Every document written before this amendment stays valid; every consumer pins the schema hash (ADR-14)
and `just codegen-check` enforces it, so the hash moving once (as it did) cannot go unnoticed.

## 6. Generator / runtime — scoped separately

This amendment decides the **document shape**. Whether, and how, the generator lowers a `logic.Navigate`
whose `app.RouteTransition` carries `inline` to a real, running dialog is a **separate** decision, made in
`docs/m9/m9d-dialog-destination-architecture.md` §8–§10 — the runtime kit has no dialog/modal/overlay
primitive at all today (confirmed by direct search, not assumed), so this is new capability, not a gap in
an existing one. See that document for the generator/runtime scope this milestone actually shipped, and
what remains.
