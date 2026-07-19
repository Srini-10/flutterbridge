# Gap — `mounted` has no UIR representation

**Status: blocked on a schema decision. Not implemented. Documented and stopped, per the M6 rule.**

This is the last BRG3006 case in `hello_bridge`. BRG3006 went 4 → 2 across M6-1 and M6-B; the two that
remain are both this one construct.

## The construct

```dart
Future<void> _submit() async {
  setState(() => _isSubmitting = true);
  await Future<void>.delayed(const Duration(milliseconds: 400));

  if (!mounted) {          // ← State.mounted
    return;
  }

  setState(() => _isSubmitting = false);
}
```

`State.mounted` is true while the `State` is in the element tree. The guard exists because calling
`setState` after unmount throws in Flutter.

## Why it cannot be represented today

`mounted` reaches extraction as a reference to a framework property of the component instance. UIR has two
ways to spell a reference, and it is neither:

| Spelling | Requires | `mounted` |
| --- | --- | --- |
| `logic.Ref` with `target` | a **declaration in the program** to point at | there is none — it is Flutter's |
| `logic.Ref` with `name` | a **lexically enclosing parameter** (§A18.3) | it is not a parameter |

There is no `logic.*` node for a framework-provided intrinsic. The full set is `Assign, Await, Binary,
Block, Break, Call, Cast, ClassDecl, Conditional, Continue, EnumDecl, ExprStmt, FieldDecl, For,
FunctionDecl, If, Lambda, ListLit, Lit, MapLit, MethodCall, New, NullCheck, OpaqueDecl, OpaqueExpr,
OpaqueStmt, PropertyAccess, Ref, Return, StringInterp` — every one of which models something the *program*
contains.

Two shapes were considered and rejected:

- **Synthesise a `sig.Signal` on the component.** Extraction would be declaring state the source never
  declared. INV-4: nothing is invented.
- **`logic.OpaqueExpr`.** It is the escape hatch, and it is *itself refused* — an opaque expression reaching
  the generator is BRG3004. That changes which diagnostic fires and nothing else.

## Why it cannot be solved downstream — the proof

The generator receives:

```json
{"kind":"logic.Ref","name":"mounted","type":{"library":"dart:core","name":"bool"}}
```

That record is **byte-identical in shape** to the one produced by a genuine unresolved reference — which
is precisely what BRG3006 exists to report, and which has caught real extraction defects in this project.

To handle `mounted` downstream, the generator would have to match on the **name** `mounted`. That is
recognition by name, which C1 established is wrong after 18 widgets were misclassified by it, and which
would silently mis-handle an application's own field called `mounted`. The information needed — *this
particular `mounted` is Flutter's `State.mounted`* — exists only where the resolved element is, which is
the analyzer. Normalization has the same deficit for the same reason.

So the choice is a schema representation or a refusal, and the refusal is what ships today.

## Why erasing it would be a heuristic, not a lowering

The tempting move is to erase the whole guard, on the reasoning that a signal write after unmount is
harmless in the React model: the kit's `useSyncExternalStore` unsubscribes on unmount, a component-local
signal becomes garbage, and a store write is *meant* to happen.

That reasoning is sound about **signal writes** and unsound about the statement:

```dart
if (!mounted) {
  return;          // ← this skips everything after it, not just a write
}
```

Erasing the guard changes control flow for whatever follows, which the compiler cannot bound. Proving "the
remainder only writes signals" is a whole-body dataflow analysis across calls, and even then the early
`return` is an observable difference. Erasing it would be assuming a shape rather than proving one, which
is the definition of the heuristic the M6 rule forbids.

`notifyListeners` (M6-1) was legitimately erasable and this is not, and the difference is worth naming:
`notifyListeners()` is an *expression statement whose whole effect* is already recorded in the action's
write set. `if (!mounted) return;` is *control flow* whose effect depends on code the compiler has not
analysed.

## The smallest amendment that would close it

A `logic.Intrinsic` node — a value the framework provides that the program does not declare:

```json
"Intrinsic": {
  "description": "A value the host framework provides, which the program does not declare.",
  "x-uir-kind": "logic.Intrinsic",
  "properties": {
    "kind": { "const": "logic.Intrinsic" },
    "intrinsic": { "type": "string", "description": "Vocabulary term, e.g. `component.mounted`." },
    "type": { "$ref": "shared.json#/$defs/TypeRef" }
  }
}
```

The vocabulary is the design question, and it is deliberately *not* "the Flutter name": `component.mounted`
is a target-neutral fact (does this component still exist), which a Vue or Svelte generator could also
answer. `widget`/`context` are **not** candidates — `widget` was lowered properly in M6-B, and `context` is
the doorway to `Theme.of`/`Navigator.of`, which is a different problem.

Before writing it, two things to settle:

1. **How large is the vocabulary?** If `component.mounted` is the only member, a node kind is heavy for one
   value and a marker on `logic.Ref` may be lighter. Measure against a real corpus first — M5-A counted
   ~990 framework-primitive references in one application but did not break them down by which primitive.
2. **What does the runtime kit provide?** The obvious lowering is a `useMounted()` returning a ref the
   component owns, readable from an action closure because the closure is emitted inside the component.
   That is a kit API addition and belongs in the same ADR.

Item 1 decides whether this is a node or a field, and it is a measurement rather than a judgement.

## Consequence today

`hello_bridge` cannot emit, and this is one of its remaining blockers — but **not the largest**. Its 28
diagnostics are led by 19 × BRG3010, which are the compiler correctly refusing a theme that defines no full
Material role set, and by 5 × BRG3002 for class emission. `mounted` is 2.
