# Gap — a route's component cannot receive constructor arguments

**Status: blocked on a schema amendment. Not implemented. Documented and stopped, per the M6 rule.**

## The reproduction

```dart
class PropsApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) => MaterialApp(
        home: const CounterPanel(label: 'Taps', step: 2),   // ← these arguments
      );
}

class CounterPanel extends StatefulWidget {
  const CounterPanel({required this.label, required this.step, super.key});
  final String label;
  final int step;
  …
}
```

This program **generates**, and then fails `tsc`:

```text
Type error: Type '{}' is missing the following properties from type 'CounterPanelProps': label, step
```

The emitted route renders `<CounterPanel />` with no props, because nothing in the document records that
`label` was `'Taps'` and `step` was `2`.

## Why it is a schema gap and not a generator bug

`app.Route` (`packages/uir/schema/l3.json`) declares exactly:

```text
properties: kind, path, params, component, layout, guards, meta
required:   kind, path, component
```

The extracted node for the reproduction is complete under that schema:

```json
{"kind":"app.Route","path":"/","component":"9d0d9e156950f367","id":"…","span":{…}}
```

`params` is **not** the place for these. It is the route's *path* parameters — the `:id` in `/user/:id` —
which are supplied by the router at navigation time, not by the author at the construction site. Reusing it
for constructor arguments would conflate two things that differ in who provides them and when.

So there is nowhere in the schema to put the arguments, and the generator is not choosing to drop them:
they never reach it. Emitting a guess would be inventing a value the program does not carry, which is the
thing INV-4 forbids.

## What was fixed on the way here, and what this blocks

M6-B lowered `widget.foo` to a component parameter read, which is what let this program reach the generator
at all. Three layers, and each exposed the next:

| Layer | Before M6-B | After |
| --- | --- | --- |
| Reading a prop in the render | BRG3006, refused | `props.label` ✅ |
| Reading a prop inside an action | BRG3006, refused | `props.step` ✅ |
| **Passing a prop at the route boundary** | never reached | **blocked — this gap** |

`hello_bridge` moved 30 → 28 diagnostics across M6-1 and M6-B and does not hit this gap, because its route
components take no arguments. Any application whose root screen is configured by its constructor does.

## The smallest amendment that would close it

A field on `app.Route` recording the arguments the construction site supplied — the same
`Record<string, Binding>` shape `ui.Element.props` already uses, so no new value vocabulary is needed:

```json
"arguments": {
  "type": "object",
  "additionalProperties": { "$ref": "l2.json#/$defs/Binding" },
  "description": "Arguments the route's construction site passes to the component's parameters."
}
```

Optional, so every existing document stays valid and the schema hash is the only thing that moves.

Three things to settle before writing it, and none is obvious enough to decide unilaterally:

1. **Where else construction arguments appear.** A component referenced *inside* a widget tree — not as a
   route — presumably has the same problem, and if so the field belongs on whatever node models that
   reference rather than on `app.Route` alone. This should be measured before the shape is chosen; a
   `ui.Element` whose widget is an application component may already carry them in `props`.
2. **Interaction with N11** (cross-route state promotion, ADR-11). If an argument is a signal read, the
   promotion pass has an opinion about it.
3. **Whether `params` and `arguments` can be told apart by a reader** without knowing which is which — if
   not, the naming needs work, because a route with both would be unreadable.

Item 1 is the one that decides the shape, and it is a measurement rather than a design question: run the
corpus and count how often an application component is constructed with arguments outside a route.

## Why this document exists instead of an implementation

The M6 instruction is explicit: *"If a capability requires a schema or ADR change, stop at that point,
document it completely, and continue with the next independent task instead of blocking the entire
milestone."*

The frozen-architecture rule says the same thing more strongly — a schema change needs an ADR documenting a
proven contradiction, and "a route component takes arguments" is a proven contradiction, but the *shape* of
the fix depends on a measurement nobody has taken yet (item 1).

## Reproduction, for whoever picks this up

`examples/props` was created for this and then removed, because an example that fails to build teaches the
wrong lesson. The source is quoted at the top of this document and takes about a minute to recreate:

```bash
mkdir -p examples/props/lib   # pubspec: name bridge_props_example, flutter sdk dep
# paste the Dart above into examples/props/lib/main.dart
cd examples/props && flutter pub get && bridge init && bridge build
cd build/bridge && npm install && npx next build     # ← the type error
```
