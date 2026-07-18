# ADR-0024 — A UIR construct for *performing* a navigation

- **Status:** Proposed — **not implemented**. M4-H stopped here rather than inventing behaviour.
- **Date:** 2026-07-18
- **Supersedes nothing. Amends:** Spec v2.4 §A17 (the navigation model).

## Context

M4-G left one blocker: a converted application cannot navigate. M4-H's evidence run establishes that this
blocker and the **overlay** blocker are the same blocker, and that everything needed to close it exists
except one thing.

### What already works

Running the real analyzer over an application that navigates and opens dialogs:

| Layer | State |
| --- | --- |
| **Analyzer** | Emits an `app.RouteTransition` for every `Navigator.push` / `pushNamed` — including the `component` for an inline destination. Correct and complete. |
| **Compiler** | N11 consumes the nav graph for cross-route state promotion (ADR-11). Correct. |
| **Generator** | Emits a `RouterDescriptor` from `app.Route`. Correct. |
| **Runtime kit** | `useRouter().push({ kind: 'route', route })` is implemented and tested. `Destination` mirrors §A17 exactly. |

### What is missing

**Nothing in UIR says "perform this transition here."**

`app.RouteTransition` is a *declarative edge in the navigation graph*. Its schema description says so — it is
"the input to N11 (ADR-11)". It records `source`, `target` / `component` and `arguments`. It does **not**
record the expression that performs it, and its schema is `additionalProperties: false`.

So the call survives extraction as an ordinary `logic.Call` whose callee is an unresolvable
`logic.Ref('Navigator.pushNamed')`. The generator has a route table, a live router, and a call it cannot
connect to either.

### Why the overlays are the same problem

The Flutter SDK settles this. All three overlay entry points push a `Route`:

- `showDialog` → `DialogRoute<T>` — `material/dialog.dart:1652`, class at `:1817`
- `showModalBottomSheet` → `ModalBottomSheetRoute<T>` — `material/bottom_sheet.dart:1317-1318`
- `showMenu` → `_PopupMenuRoute<T>` — `material/popup_menu.dart:1205-1206`

An overlay **is** a navigation to an inline destination. It extracts the same way — the analyzer produced a
full `AlertDialog` tree inside `showDialog`'s `builder` closure, faithfully, as nested `logic.New`
expressions — and it is blocked by the same missing construct. One amendment unblocks dialogs, modal bottom
sheets, popup menus and imperative navigation together.

## Options considered

### A. Add `site: NodeId` to `app.RouteTransition` — *smallest*

One optional field, pointing at the call expression the analyzer replaced. Backwards compatible; every
existing document stays valid.

Against: it inverts the natural direction — the *edge* would know about the call — and a generator must
still find the call by walking for that id. It also says nothing about what to emit *in place of* the call,
so a `Navigator.pop()`, which §A17.3 rules is not a transition at all, gets no help.

### B. Add `logic.Navigate { transition: NodeId }` to L1 — *cleanest*

A statement/expression node. The analyzer replaces the call with it, which is what **INV-22** already
demands: *"after extraction, no framework lifecycle or runtime primitive may remain in the UIR"* —
`Navigator.pushNamed` is exactly such a primitive, and it is surviving today in violation of that invariant.

The generator lowers one node kind to `useRouter().push(...)`. A `pop` is `logic.Navigate` with no
transition, which is precisely §A17.3's "a return along an edge that already exists".

Against: a new node kind is a larger amendment than a new field.

### C. Point `logic.Ref.target` at the `app.RouteTransition` — *no schema change*

`target` is typed `NodeId` with no constraint, so this is legal by the letter.

**Rejected.** `logic.Ref` is documented as "a reference to a **declared name** — a local, a parameter, a
field, or a signal". A transition is an edge, not a declaration, and encoding "perform this" as "refer to
this" would make the document say something it does not mean. The next reader would have no way to tell an
intended reference from this trick.

### D. Match the transition to the call by source span — *no schema change*

Both nodes are minted from the same AST node, so their spans are equal. It would work.

**Rejected.** It is a generator heuristic, which this project does not build, and it silently breaks the day
two constructs share a span.

## Decision

**Recommend B.** It satisfies INV-22 rather than working around it, it handles `pop` (which A cannot), and it
gives the generator one node to lower instead of a search. The cost is one L1 node kind.

If the schema freeze makes a new node kind unacceptable, **A is the fallback** and is genuinely small.

## Consequences

- Unblocks: imperative navigation, `showDialog`/`AlertDialog`/`SimpleDialog`, `showModalBottomSheet`,
  `showMenu`/`PopupMenuButton`, and `Hero` (which additionally needs measurement).
- The kit needs **no change** for navigation; its router is already the shape §A17 describes. The overlay
  *components* are then ordinary work — a dialog is a positioned surface with a scrim.
- Corpus evidence for scale: the two corpus applications use `Navigator` **0** times and dialogs **0** times
  (they route with `go_router` and use 8 `SnackBar`s). So this amendment is not what raises the corpus
  number — it is what makes a converted application *function*, which the corpus metric does not measure.
