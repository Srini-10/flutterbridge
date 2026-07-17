# M3-B.1 — `sig.Effect` cannot express a parameter (proposed §A19)

**Status: discovered, documented, NOT amended.** M3-B.1's stop conditions name "another schema contradiction"
as one of the three reasons to stop. This is one. It is recorded here and left alone.

**Date:** 2026-07-17. **Found:** while implementing [Spec v2.5 §A18](../spec/v2.5-amendments.md), by running
the analyzer over a `didUpdateWidget` — not by reading the schema.

## The contradiction

`sig.Effect`'s complete field set is `anchor`, `body`, `deps`, `ext`, `id`, `kind`, `span`, `timing`. There is
no `params`.

`catalog/widgets/material.json` — the single declarative source for Flutter's lifecycle (ADR-18) — maps:

```json
"lifecycle": {
  "initState": "mount",
  "didUpdateWidget": "update",
  "didChangeDependencies": "update",
  "dispose": "unmount"
}
```

And `didUpdateWidget` **takes an argument**:

```dart
@override
void didUpdateWidget(MyScreen oldWidget) {
  super.didUpdateWidget(oldWidget);
  if (oldWidget.id != widget.id) { _reload(); }   // `oldWidget` is the entire point of the callback
}
```

Run through the real analyzer, that source produces:

```
sig.Effect keys : ['body', 'id', 'kind', 'span', 'timing']
has params?     : False
undeclared refs : ['oldWidget', 'super', 'oldWidget', 'widget', 'oldWidget']
```

`oldWidget` is read **three times and declared nowhere** — a `logic.Ref` with a `name` and no `target`,
indistinguishable from a reference to a top-level function or a typo. That is §A18.2's paragraph with one
word changed.

(`super` and `widget` are undeclared too, and are *not* this gap: they are framework primitives — Dart's
superclass call and `State.widget` — with no parameter to declare. They are the `notifyListeners` shape, and
belong to whatever models `State`.)

`oldWidget` is not incidental to `didUpdateWidget`; it is the *only* reason the callback exists. Its whole
purpose is comparing the previous configuration to the current one. An `update` effect that cannot see
`oldWidget` cannot do the one thing `didUpdateWidget` is for.

## Why this was not caught by §A18

Because §A18 asserted it away. Its §A18.4 said:

> **`sig.Effect` gains nothing.** Its `timing` says it is invoked by the component lifecycle, not by a caller
> with arguments in hand.

That reasoning is wrong, and instructively so. It is the same sentence shape as the true claim beside it —
*"`sig.Derived` gains nothing: a getter takes no arguments"* — and a getter genuinely takes none. "Invoked by
the lifecycle" and "invoked with no arguments" are different statements, and the amendment treated them as
one.

The error survived writing, review and a schema change. It did not survive running the analyzer over a
`didUpdateWidget`.

## Why `hello_bridge` does not show it

`hello_bridge` implements `initState` and `dispose` — both of which genuinely take nothing — and no
`didUpdateWidget`. So the corpus is green and the gap is real:

| effect in `hello_bridge` | timing | parameters |
| --- | --- | --- |
| `initState` | `mount` | none |
| `dispose` | `unmount` | none |

This is the third time in two milestones that a 369-line fixture has failed to reach a defect that a real
application would hit on its first screen. `didUpdateWidget` is not exotic — it is how a Flutter widget reacts
to its own configuration changing, and any list/detail screen that rebuilds on a changed id has one.

## The smallest compliant amendment (proposed, not applied)

`sig.Effect` gains an optional `params: ParamDecl[]`, exactly as `sig.Action` did:

- **Reuses `ParamDecl`.** Same argument as §A18.3 — it already carries `name`, `type`, `required`, `named`,
  `defaultValue`, and there is nothing about `oldWidget` that `ui.Component.params` does not already handle.
- **Additive and optional.** Absent means the effect takes none, which is `mount` and `unmount` always and
  `update` sometimes. Every existing document stays valid and every existing id stands.
- **Version:** `1.4.0 → 1.5.0`, minor. `UIR_SCHEMA_HASH` changes, as INV-5 requires.
- **Resolution is by name**, within the effect's scope, for the reason §A18.3 gives: a `ParamDecl` has no
  `id`, because it is a value and not a node.
- **Work:** the analyzer populates it from the method's `FormalParameterList` — the same `_params` helper
  §A18 added to `signal_extractor.dart`, at the effect's construction site. The compiler carries it like any
  other field. The React generator lowers it into `useUpdateEffect`'s body; the runtime needs nothing, for
  the same reason it needed nothing for §A18.

## Why it is not applied here

M3-B.1's brief: *"Only stop if: another schema contradiction is discovered."* This is one, discovered while
implementing the previous one, and the instruction is to stop for it rather than fold it into the current
change.

There is a substantive reason too, not just an instruction. §A18 is one amendment with one motivating
evidence set, and it landed with its own version bump and hash change. Quietly extending it to a second node
kind on a defect found afterwards would put two amendments under one §, with one of them unevidenced by any
fixture in the repository — and the honest record of *how* this was found is worth more than the two lines of
schema it would take to fix. It is also a decision with a versioning question attached (whether §A19 rides
1.5.0 alone or waits to batch with whatever the next real application surfaces), and versioning is itself a
named stop condition.

## Related, not the same

Two other things surfaced in the same pass and are **not** schema gaps:

1. **`build` is emitted as a `sig.Action`.** `_LoginScreenState.build` contains inline
   `onChanged: (value) { setState(…) }` closures, so it writes state, so it becomes an action *in addition to*
   being `ui.Component.render` — and since §A18 it advertises `params: [context: BuildContext]`. That is
   faithful to the source. But `build` is not something a user calls, and `BuildContext` is exactly the
   framework primitive ADR-4 says must not survive extraction — the same reasoning that excludes `initState`
   ("not something a user calls") appears to apply. **Pre-existing**, unchanged by §A18, and an extraction
   question rather than a schema one.
2. **`notifyListeners()` is still `BRG3006`.** Correct: it is a `ChangeNotifier` API with no referent in the
   emitted program. Under ADR-4 a signal write *is* the notification, so it is redundant — but "redundant" is
   a judgement about `ChangeNotifier`'s semantics and belongs to whatever models them.
