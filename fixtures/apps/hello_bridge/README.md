# hello_bridge — the walking-skeleton fixture

This is the app the entire platform is built against. It is defined by Blueprint §5.1 and it exists
to exercise **every load-bearing mapping in the MVP and nothing exotic**.

Do not add widgets, packages, or state patterns to this app to "make it more realistic". Per-construct
coverage belongs in the G1 fixtures (`fixtures/uir/`), not here. This app's job is to be the smallest
program that proves the whole pipeline works end to end.

## What it exercises

| Screen | Constructs | Why it is here |
| --- | --- | --- |
| **Login** (`lib/screens/login_screen.dart`) | 2 × `TextField`, `ElevatedButton`, local `StatefulWidget` state, `setState`, an `await`, collection-`if`, `Navigator.push` | stateless + stateful → signal graph; `setState` → `sig.Action`; N2 desugar; navigation |
| **Home** (`lib/screens/home_screen.dart`) | `ChangeNotifier` store, `http.get` in a `FutureBuilder`, `ListView.builder` of `Card`/`ListTile`, AppBar `IconButton` toggling theme brightness | `app.Store`; N4 → `UIAsync`; N3 → `UIList`; `initState`/`dispose` → mount/unmount `sig.Effect`; theme tokens |

Supporting files: `models/item.dart` (L1 model → contracts package at M6),
`data/items_repository.dart` (the one `app.Endpoint`), `state/favorites_store.dart` (the store),
`constants.dart` (a const the N6 fold resolves).

## Verify

```bash
flutter pub get
flutter analyze                        # must be clean — this is an M0-T2 acceptance criterion
flutter build web --no-tree-shake-icons
```

## Notes

- The data source is a public JSON API (`constants.dart`). It is a single, easily intercepted `GET`
  precisely so the visual verifier (M4) can stub or mask it — network flakiness must never reach a
  golden.
- The app deliberately does **not** use every MVP widget. It uses the ones §5.1 names.
