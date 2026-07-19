# Gap — a route cannot pass constructor arguments to its component

**Status: blocked on a schema amendment. The refusal (`BRG3018`) is implemented; the capability is not.**

This supersedes [`GAP-route-component-arguments.md`](./GAP-route-component-arguments.md), which was written
from the generator's symptom rather than from the document. **Two of its central claims are wrong**, and
both were corrected by running the real analyzer (M6-C, Phase 2):

| The earlier document said | The evidence says |
| --- | --- |
| "they never reach it" — the arguments are not extracted | **They are extracted, in full**, onto the `ui.Element` in the app root's slot, values and spans intact |
| "hello_bridge does not hit this gap" | **hello_bridge hits it.** `home: LoginScreen(isDark: …, onToggleTheme: …)`, both required |
| the amendment is a new `arguments: Record<string, Binding>` on `app.Route` | that duplicates data the document already carries, and skips the ADR-11a analysis. `RouteArgument[]` already exists |

## What the analyzer actually emits

Three probes, one per position the corpus measurement found, run through the real pipeline
(`dart/bridge_analyzer/test/route_argument_positions_test.dart` is the kept form of them):

| Position | Example | Result |
| --- | --- | --- |
| **tree** | `Column(children: [Badge(text: 'hi')])` | ✅ `ui.Element.props` — works today |
| **declarative route** | `home: Panel(label: 'Taps', step: 2)` | ⚠️ extracted onto the slot element; **`app.Route` cannot reach it** |
| **transition** | `Navigator.push(…MaterialPageRoute(builder: …))` | ❌ no `app.RouteTransition` at all — the render becomes `ui.Opaque`, "widget returned by a call" |

For `home: Panel(label: 'Taps', step: 2)` the document contains, in full:

```json
"slots": { "home": {
  "kind": "ui.Element",
  "component": { "library": "package:app/main.dart", "name": "Panel", "userDefined": true },
  "props": { "label": { "kind": "bind.Const", "value": "Taps" },
             "step":  { "kind": "bind.Const", "value": 2 } } } }
```

and, separately:

```json
{ "kind": "app.Route", "path": "/", "component": "0e85acd67dd96ece" }
```

Both facts are present. **Nothing connects them.** `app.Route` records *which component* renders, never
*which element constructed it*, so the route emitter — which is handed the route table, not the app root's
render tree — has no path to the props.

So this is a missing **link**, not a missing **representation**. That distinction is what makes the
amendment small.

## Why the generator must not close it itself

It could find the app root's element and match slot → route. Two reasons not to, and the second is the
one that matters:

1. It re-derives, in every generator, the correspondence the analyzer already computed. `home:` is one
   rule, `routes: {'/a': …}` another, `onGenerateRoute:` a third.
2. **It would skip the URL-boundary analysis.** `RouteArgument.transport` exists because a Flutter route
   argument is a live Dart value and a URL is a string. Continuum's real code is
   `home: HomePage(db: db)` — a live object, which ADR-11a says is `objectTransport`/**BRG2301**, an
   error. A generator that simply copied `props` across would emit that silently, which is precisely the
   failure ADR-11a was written to prevent.

Copying props would also be the third instance of the rule this project keeps re-learning: the compiler
owns the analysis, the generator owns the rendering.

## The measurement that decides the shape

The earlier document named this as the open question — *"where else construction arguments appear"* — and
said it must be measured before the shape is chosen. It has been, across the two real applications and the
fixture (`tools/`-external script, whole-file classification):

| Application | Files | Widget classes | Construction sites | …with arguments |
| --- | --- | --- | --- | --- |
| hello_bridge | 7 | 3 | 6 | 5 |
| continuum | 225 | 39 | 124 | 114 |
| unichat | 119 | 143 | 455 | 410 |

By position, for the sites that carry arguments:

| Position | hello_bridge | continuum | unichat | Works today? |
| --- | --- | --- | --- | --- |
| **tree** | 3 | 80 | 329 | ✅ yes — `ui.Element.props` |
| `builder:` (a page route) | 1 | 15 | 50 | ❌ no `app.RouteTransition` is emitted |
| `return` | 0 | 12 | 31 | ✅ tree, via a build method |
| **`home:`** | 1 | 7 | 0 | ❌ **this gap** |

**The answer to the open question is: the tree position dominates ~10:1, and it already works.** That
retires the earlier document's worry that the field might belong on "whatever node models that reference"
— `ui.Element` already models it and already carries `props`.

Navigation surface, for scale:

| | hello_bridge | continuum | unichat |
| --- | --- | --- | --- |
| `MaterialPageRoute` | 1 | 16 | 76 |
| `Navigator.push` | 0 | 14 | 44 |
| `Navigator.pop` | 0 | 16 | 113 |
| `pushNamed` / `pushReplacement` | 0 / 0 | 0 / 0 | 8 / 6 |
| `showDialog` / `showModalBottomSheet` | 0 / 0 | 6 / 0 | 17 / 21 |
| `onGenerateRoute:` | 0 | 0 | 2 |
| `GoRoute` | 0 | **0** | **0** |

Two findings worth carrying into M6-C proper:

- **Neither application uses `go_router`.** C1 recorded it as the dominant navigation shape in real apps;
  in this corpus it is absent, and `Navigator` + `MaterialPageRoute` is universal. C1's conclusion should
  not be relied on without re-measuring.
- **`Navigator.pop` outnumbers every push form** (129 across the two apps). A pop is explicitly *not* an
  `app.RouteTransition` (Spec v2.4 §A17.3), so the most frequent navigation operation in the corpus has no
  node at all.

## The reproduction, and what it does today

```dart
class PropsApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
        home: const CounterPanel(label: 'Taps', step: 2),
      );
}
```

**Before `BRG3018`** — `bridge build` printed `build succeeded`, wrote 10 files, and the project did not
compile:

```text
app/page.tsx(14,11): error TS2739: Type '{}' is missing the following properties
                     from type 'CounterPanelProps': label, step
```

That is the part worth stating plainly: **the compiler reported success and handed over source that does
not build**, in generated code the developer is told not to edit. The gap was not that a feature was
missing; it was that nothing said so.

**After** — the program is refused, and the message names the layer that owns the fix:

```text
error [BRG3018] the route `/` renders `CounterPanel`, whose constructor requires `label`, `step`. …
                `app.Route` has no field linking a route to that element …
```

## The amendment

One optional field on `app.Route`, reusing the vocabulary `app.RouteTransition` already uses:

```json
"arguments": {
  "type": "array",
  "items": { "$ref": "#/$defs/RouteArgument" },
  "description": "Arguments the construction site passed to the component, in order."
}
```

- **No new `$defs`.** `RouteArgument` (`name`, `transport`, `binding`, `diagnostic`, `promotedTo`) and
  `RouteArgumentTransport` already exist and were designed for exactly this question.
- **Symmetric.** A declarative route and an imperative transition are the same question asked twice; today
  only one of them can answer.
- **Optional**, so every existing document stays valid. The schema hash moves; nothing else does.
- **It forces the transport decision**, which is the point. `home: HomePage(db: db)` must come out as
  `objectTransport` + BRG2301, not as a copied prop.

### Affected layers

| Layer | Change |
| --- | --- |
| Schema | one optional field; regenerate both domains (ADR-18) |
| Analyzer | the route extractor already visits the construction expression — it builds `app.Route` *from* it — so it records the arguments where it stands. This is the smallest edit of the four. |
| Normalization | N11 already classifies transports for `app.RouteTransition.arguments`; the same pass runs over the new field |
| Generator | `page.tsx` emits the props; `BRG3018` becomes the fallback for a route whose arguments are absent rather than the standing behaviour |

### Compatibility

Additive and optional: documents written before the amendment load unchanged, and a route with no
arguments is indistinguishable from today's. The only breaking surface is the schema hash, which every
consumer already pins (ADR-14) and which `just codegen-check` enforces.

### Migration

No user migration. A rebuild of an application that hits this gap goes from *refused with `BRG3018`* to
*generated*, which is the direction that needs no note. Applications that pass a live object move from
refused-for-the-wrong-reason to **BRG2301**, refused for the right one — and that is a message worth
writing release notes for, because it is the compiler telling the truth about a URL boundary the Flutter
program never had to think about.

## Why this stops here

The M6 rule, and the frozen-architecture rule in CLAUDE.md: a schema change requires an ADR documenting a
proven contradiction. This is one, and the evidence above is the proof. But the ADR also has to answer what
`RouteTransition`'s inline-destination case does — the `builder:` position is **65 of the corpus's
arg-carrying route sites versus 8 for `home:`**, and it currently produces no node at all. Amending
`app.Route` while `MaterialPageRoute(builder:)` still lands in `ui.Opaque` would close the smaller half of
the problem and leave the larger one silent.

**Recommended next milestone:** the ADR should cover both, because they are one question — *how does a
destination receive its arguments* — and the corpus says the imperative form is the common one.
