# ADR-0025 amendment — dialog-local dismissal (`logic.Navigate.dismisses`)

- **Status:** Accepted and implemented (M9-E). Amends the M9-D amendment
  (`0025-amendment-inline-overlay-destinations.md`) and ADR-0025 §A17.3 ("a pop is not a transition").
- **Date:** 2026-08-24.

## 1. The question this amendment answers

M9-D shipped `showDialog(builder: (_) => AlertDialog(title: ..., content: ...))` — an inline route-overlay
destination — but refused `AlertDialog.actions` outright (`BRG3013`), because an action button's own
`onPressed` commonly calls `Navigator.pop(dialogContext)` to dismiss the dialog, and `logic.Navigate{action:
'pop'}` was, and remains, a bare return with no target (§A17.3: *"a pop is not a transition... there is no
edge on which to hang a site"*) — nothing distinguished "dismiss this dialog" from "pop the current page
route." This amendment supplies that distinction, for the bounded case M9-E investigated.

## 2. What was investigated, and what it found

Two claims had to be checked against real evidence before any architecture could be chosen — both were
wrong as commonly assumed:

**Claim A — "distinguish the two by which `BuildContext` was passed."** Investigated directly against the
real `BridgeAnalyzer`: a `showDialog(builder: (dialogContext) => ...)` closure's own parameter is *never*
bound into `Scope` at all. `MaterialRouteAdapter._returned()` reduces the closure to *the expression it
returns* before extraction ever sees the closure's own `FormalParameterList`; the general closure-parameter
binding mechanism (`ExpressionExtractor.lambda()`) is never invoked for a `builder:` callback. A read of
`dialogContext` inside an `onPressed` produces `logic.Ref{name: 'dialogContext', type: BuildContext}` with
no `target` — structurally identical to a free identifier. This is not merely unimplemented; it is the same
category of gap ADR-28 §4 already names ("parameter declaration-tier identity is deferred") and the M9-A/
M9-C "itemParam" gap already flags as explicitly out of scope for any single milestone to solve narrowly —
inventing an ad hoc, one-off Binding for *this one* closure's own parameter would set exactly the kind of
app/case-specific precedent this project's own discipline refuses. **Building identity-based context
resolution is not this milestone's to do.**

**Claim B — "an outer-context pop inside a dialog action pops the page, not the dialog, so treating it as
dismissal would be a silent reinterpretation."** Checked against real Flutter behavior with a real
`flutter_test` widget test (not assumed): under the *default* navigator configuration (no
`useRootNavigator: false`, no nested `Navigator` ancestor), `Navigator.pop(outerContext)` called from
*inside* a dialog's own action **dismisses the dialog**, not the page — confirmed empirically. `BuildContext
→ Navigator` resolution walks up the *element tree* to the nearest `Navigator` ancestor; a dialog's own
content is hosted in that same `Navigator`'s `Overlay`, and the calling page's own context resolves to the
identical `Navigator` (no nested one in between, the common/default case). Both contexts therefore name the
*same* `Navigator`, and a pop always removes whichever route is currently topmost on it — which, while the
dialog is open and nothing else has navigated in between, is the dialog, regardless of which `BuildContext`
expression was written. **Which context variable is used is not the fact that determines dismissal; it is
a Flutter-semantics red herring for the default-configuration case.** A third widget test confirmed the
one case where this *does* break: if something else pushes a new route onto the same navigator while the
dialog is still open, the newly-pushed route becomes topmost and a subsequent pop targets *that*, not the
dialog — an intervening-navigation risk, not a context-identity one, and not a new risk: an ordinary,
unmodified page-level `router.pop()` already carries the identical "pops whatever is currently topmost"
assumption today, for any navigation, dialog or not.

## 3. The decision

**Structural, not identity-based.** `TransitionExtractor` gains a private, ambient field —
`presentingTransition: String?` — the same "settable before, reset after" idiom `enclosingComponent`
already uses (for the transition's own `source` field). It is set to the transition's own symbol for the
exact duration of `_destination()`'s own `widgets.extract(widget, scope)` call for an inline destination,
and reset to `null` immediately after. Because this is a plain field read at extraction time, valid for the
entire synchronous extent of that one call regardless of nesting depth, closures, or control flow, **every**
`Navigator.pop`/`maybePop` found *anywhere* inside that specific dialog's own extracted subtree — no matter
which `BuildContext` expression is written, no matter how deeply nested — is tagged, unconditionally and
without gaps. This sidesteps Claim A's own identity requirement entirely (nothing about *which* context was
passed is ever inspected) while remaining sound under Claim B's own finding (the tag really does mean
"this pop, wherever it is written and whatever it names, executes while this dialog is the presentation in
scope").

`logic.Navigate` (schema, additive) gains:

```json
"dismisses": {
  "$ref": "shared.json#/$defs/NodeId",
  "description": "The app.RouteTransition (with an inline destination) this pop dismisses..."
}
```

Present only for `action: 'pop'`, and only when extraction proved the pop is lexically inside that
transition's own presentation. Absent for an ordinary page-level pop (`action` alone does not distinguish
the two cases — a reader checks whether `dismisses` is present). `popUntil` is unaffected and stays
unsupported inside a dialog exactly as it already is at the page level (its own predicate is not modelled,
§A17.3, unchanged).

## 4. What is explicitly NOT decided or implemented by this amendment

- **Result values.** `Navigator.pop(dialogContext, value)`'s own second argument is not read, represented,
  or transported anywhere. Dismissal is supported; the *value passed to it* is not. This is safe only
  because the companion finding in §5 below confirms the one case where dropping it would matter —
  `await`ing or assigning `showDialog<T>(...)`'s own return value — is *already*, independently, refused by
  the existing pipeline (a pre-existing gap, not one this amendment introduces or needs to close).
- **`useRootNavigator: false`.** Breaks the "same Navigator" premise §2/Claim B rests on. Refused with a
  named diagnostic, not silently assumed away.
- **Nested dialogs** (a dialog action opening a second dialog). Not modelled — `presentingTransition` is a
  single field, not a stack, and a second `_destination()` call while the first is still active would
  overwrite rather than nest it. Left refused/unreached, not guessed at.
- **Barrier dismissal's own result** (Escape key, backdrop click). Already `null` under real Flutter
  semantics; irrelevant here since no result is ever propagated regardless of dismissal cause.
- **General navigation architecture, `useRootNavigator` support, multi-navigator scopes.** Out of scope,
  matching ADR-0025 §6's own precedent of recording rather than deciding what a larger evidence base would
  need to settle.

## 5. A pre-existing, orthogonal defect found — documented, not fixed

Investigated directly: `final result = await showDialog<bool>(...);` (the value *assigned* rather than
discarded) already, independently of this amendment, produces an orphaned `app.RouteTransition` — minted by
`TransitionExtractor.maybeExtract`, which fires for every recognized `MethodInvocation` "regardless of
which statement shape wraps the call" (the file's own header) — with **no** `logic.Navigate` ever
referencing it, because `navigateOf` is reachable only from three specific statement shapes (a bare
`ExpressionStatement`, a tail `await` statement, an arrow body) and a `VariableDeclaration`'s own
initializer is none of them. Confirmed via a real build: the analyzer stage reports zero errors, but the
**generator** stage refuses the whole program (`BRG3013`/`BRG3006`/`BRG3005`, "generation reported N
errors(s)... nothing was written") — an honest, if imprecisely-worded, end-to-end refusal, not a silently
compiling wrong program. Not fixed here: doing so properly means deciding whether a navigation can produce
a value at all in expression position — a materially larger, unrelated expression-lowering question this
amendment's own scope explicitly excludes ("no arbitrary Future lowering," "do not widen expression
lowering"). Recorded as a real, if non-dangerous, follow-on candidate (§ "remaining blocker graph" in the
milestone doc).

## 6. Compatibility

Additive only. `logic.Navigate.dismisses` did not exist before this amendment, so no existing document's
id values change for it, matching the same precedent every prior ADR-28/ADR-0025 amendment has established.
No `x-uir-breaking` marker. Every consumer pins the schema hash (ADR-14); `just codegen-check` enforces it.

## 7. Generator / runtime — scoped separately

Covered in `docs/m9/m9e-dialog-actions-dismissal-results.md`. In outline: `statement.ts`'s `pop` case checks
`dismisses` before requiring a router in scope, reusing the exact `dialogRefFor`/`DialogHost` ref mechanism
M9-D already built for `show()` — a `close()` call on the same ref rather than a new mechanism.
`DialogHostHandle` gains `close(): void`. `AlertDialog.actions` is rendered once the underlying dismissal
(and only dismissal — no result) is sound.
