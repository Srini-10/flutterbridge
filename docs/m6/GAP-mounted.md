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


## Measured — the data that settles the design question

Priority 2 of the M6-F brief. Counted across every real Flutter application available on this machine,
including the two M5-A used:

| Application | Files | Lines | `mounted` |
| --- | --- | --- | --- |
| `examples/counter` | 1 | 82 | 0 |
| `fixtures/apps/hello_bridge` | 7 | 369 | 1 |
| **continuum** (`apps/macos/mac`) | 7 | 2 489 | **42** |
| **unichat** (`mobile`) | 113 | 47 796 | **306** |

**348 occurrences in two real applications** — roughly 6.4 per thousand lines in unichat and 16.9 in
continuum. This is not a rare construct, and it is not an artefact of one codebase's style.

### The patterns, and why they rule out a statement-level fix

| Shape | continuum | unichat | Erasable? |
| --- | --- | --- | --- |
| `if (!mounted) return;` | 13 | 133 | only by assuming what follows |
| `if (mounted) { … }` | 20 | 94 | **no** — erasing means *always* running the block |
| compound condition | 4 | 54 | **no** — `mounted` is one boolean operand among several |
| `if (!mounted) { … }` | 5 | 10 | no |
| `context.mounted` | 0 | 11 | **a different API** |

The compound cases are the ones that decide it:

```dart
if (result == null || !result.updateRequired || !mounted) return;
if (event.state == CallState.CALL_STATE_RINGING && mounted) {
```

**`mounted` appears as an ordinary boolean operand inside a larger expression.** There is no statement
pattern to match and nothing to erase — 58 of the 348 occurrences are simply a value being read. That
settles the question this document previously left open: any representation must be **expression-level**,
because a statement-level erasure cannot express these at all.

It also revises what this document originally guessed. The open question was framed as *"how large is the
vocabulary — is a node kind heavy for one value?"*. The data answers a different question: the vocabulary
needs at least **two** members, because `context.mounted` (`BuildContext.mounted`, Flutter 3.7+) is a
distinct API with distinct semantics — it asks whether the *element* is still mounted, not the `State` —
and 11 real uses of it exist. A representation that conflated them would be wrong in both directions.

### Are the existing diagnostics sufficient?

**Yes, and they should be retained until the amendment lands.** BRG3006 names the symbol, the file and the
line, and refuses the program rather than emitting something that compiles and misbehaves. For a construct
that gates side effects on component liveness, refusing is the correct failure: an application that ran the
guarded block unconditionally would be wrong in a way no type checker would catch.

What the diagnostic does *not* say is that this is a known architectural limitation rather than a defect in
the user's program. That is worth fixing independently of the schema work — see "Recommendation" below.

## Recommendation — the data justifies the amendment

`logic.Intrinsic`, expression-level, with a two-member vocabulary:

```json
"Intrinsic": {
  "description": "A value the host framework provides, which the program does not declare.",
  "x-uir-kind": "logic.Intrinsic",
  "properties": {
    "kind":      { "const": "logic.Intrinsic" },
    "intrinsic": { "enum": ["component.mounted", "context.mounted"] },
    "type":      { "$ref": "shared.json#/$defs/TypeRef" }
  }
}
```

Additive and optional, so every existing document stays valid; the schema hash moves and the loader's
refusal handles the rest.

Expression-level rather than statement-level, because 58 measured uses cannot be expressed any other way.
Target-neutral names rather than Flutter's, because "is this component still alive" is a question a Vue or
Svelte generator can also answer.

Still to settle before writing it, and now the *only* open question: **what the runtime kit provides.** The
obvious lowering is a `useMounted()` returning a ref the component owns, readable from an action closure
because the closure is emitted inside the component. That is a kit API addition and belongs in the same
ADR as the schema change.

**This is where the M6 rule applies**: the amendment is now justified by evidence, but writing it is a
schema change, so it stops here and is documented rather than implemented.

## Consequence today

`hello_bridge` cannot emit, and this is one of its remaining blockers — but **not the largest**. Its 28
diagnostics are led by 19 × BRG3010, which are the compiler correctly refusing a theme that defines no full
Material role set, and by 5 × BRG3002 for class emission. `mounted` is 2.

---

## M6-C follow-up — one concept or two? **Two.**

The measurement above established that a vocabulary is needed and that it must be expression-level. It left
open whether `mounted` and `context.mounted` are one schema concept or two. Classifying the 11 real
`context.mounted` uses by their **enclosing declaration** settles it:

| Enclosing scope | `context.mounted` uses |
| --- | --- |
| inside a `State` subclass | 2 |
| **a top-level function** | **9** |

The nine are in `changeProfilePhoto(...)`, `editDisplayName(...)` and `showCallAudioOutputPicker(...)` —
free functions that take a `BuildContext` parameter:

```dart
Future<void> changeProfilePhoto(BuildContext context, …) async {
  final action = await showModalBottomSheet<String>(…);
  if (action == null || !context.mounted) return;     // ← no State here. None.
```

**There is no component for `component.mounted` to be about.** A single target-neutral member would have to
invent one for these nine sites, and inventing is what INV-4 forbids. So the two are not spellings of one
question:

| | `mounted` | `context.mounted` |
| --- | --- | --- |
| Belongs to | the `State` instance | a `BuildContext` **value** |
| Available in | a `State` method only | anywhere the value is — including a function with no component |
| Asks about | *this* component | the element the **caller** handed over |
| Real uses in corpus | 337 | 11 |

The second row is the load-bearing one. `mounted` is resolved from the lexical scope; `context.mounted` is
resolved from a value that was passed in, and in 9 of 11 cases it crossed a function boundary to get there.
A representation that conflates them cannot express the common case of the rarer form.

### What this implies for the amendment

The `logic.Intrinsic` proposal above already had a two-member vocabulary, so **the proposed shape is
unchanged and this measurement confirms it** rather than revising it. What changes is the justification for
the second member, which was previously "it is a distinct API" and is now "9 of its 11 uses occur where the
first member has nothing to refer to".

It also adds a constraint the earlier text did not state: **`context.mounted` needs an operand**, because
the context it asks about is a specific value. `component.mounted` is nullary — it means the enclosing
component. So the two members do not have the same arity, which is a reason to prefer two distinct
vocabulary members over one member with a flag.

Still open, and still the only open question: what the runtime kit provides. `useMounted()` covers
`component.mounted`. The free-function form has no React equivalent at all — a helper that takes a
component handle is not idiomatic — and that is a lowering decision for the ADR, not a schema one.

**Unchanged: not implemented.** This remains a schema change, and the M6 rule stops it here.
