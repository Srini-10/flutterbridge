# counter — the FlutterBridge example

A Flutter application that compiles to a React project with **no diagnostics at all**. It is deliberately
inside the supported surface: this is what a new user runs first, and an example that fails to compile
teaches the wrong lesson.

```bash
flutter pub get     # resolve the Flutter package graph — the analyzer reads it
bridge doctor       # check this machine can build
bridge build        # analyze → normalize → generate → typecheck
```

The emitted project lands in `build/bridge`. It is an ordinary Next.js project:

```bash
cd build/bridge
npm install
npm run dev
```

## What it exercises, and why

| In `lib/main.dart` | Why it is here |
| --- | --- |
| `ColorScheme.fromSeed` | the app's one colour token. N10 derives the 46 Material roles from it — without a seed, every themed widget is correctly refused (INV-20) |
| `_count` + `setState` | the whole reactivity model: a component signal, written by a lifted action |
| `ListView.builder` | expanded into a `ui.List` by extraction, with a `ValueKey` that N9 lifts onto the list |
| `Scaffold` / `AppBar` / `FloatingActionButton` | the application shell every real screen is inside |

## What it deliberately does not do

No `ChangeNotifier` store, no `Navigator.push`, no dialogs. Those are documented gaps — see
[`docs/troubleshooting.md`](../../docs/troubleshooting.md) — and an example that hit them would fail to
build, which is not what an example is for.
