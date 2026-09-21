# M14 — final generator burn-down: what was measured, what was built, what stops the two real applications

## How the numbers are taken

`tools/taxonomy/taxonomy.mjs` runs `bridge build --json` (which stops at the first failing stage) **and** `bridge generate` (which, since ADR-0077 D5, also stops on normalizer errors — it used to ignore them and always reach the generator), classifies every diagnostic with
`tools/taxonomy/rules.json` (first match wins: root cause, category A–D, first failing layer, ADR), and writes `taxonomy-<app>.json` (machine-readable) and `.md`.
The rules are keyword buckets over the diagnostic text — an approximation of "root cause", stated as such: a diagnostic carries no file/line (the generator reports a node id; `bridge inspect` maps it to a span).
`tools/normalizer-errors/inventory.mjs <uir.ndjson>` does the same for the normalizer: every error with its node id and source span, grouped by code (`normalizer-errors-B-before.json` is App B's 23).

**Normalizer errors, App B: 58 → 23 → 0.** `BRG2110` ×35 was a false positive (ADR-0074). The last 23 (`BRG2305` ×22, `BRG2301` ×1) were one defect seen from 13 boundaries: 12 were `showDialog` / `showModalBottomSheet` / `Navigator.push`, which have no URL and which N11 refused as if they did;
the 13th was a route builder's `final` local read as a "forwarded constructor parameter", plus a Flutter `Key` argument read as a live object. ADR-0077.

## Categories

**A** — a documented-supported contract with a compiler bug. **B** — a browser-compatible construct not implemented. **C** — a library adapter (a browser equivalent exists). **D** — no browser equivalent / an intentional refusal.

## Where the two applications stand (this tree)

See `taxonomy-A.md` and `taxonomy-B.md` (regenerate: `node tools/taxonomy/taxonomy.mjs <copy-of-app> --label … --out docs/m14/taxonomy-<x>`). **No diagnostic is class A (a compiler bug against a documented contract), and none is unexplained** (B has 5 unclassified `AssetImage` non-constant keys, needing a rule).

- **A (240 files):** analyzer 0, normalizer 0, `bridge build` stops in the generator with 536 errors — Riverpod 108 (+ 20 provider initializers, 13 cascading functions), a name with no declaration 106 (mostly the same cascades), named arguments to package callees 64 (Supabase, `showModalBottomSheet`),
  the theme 88 (50 `BRG3010`: `AppTheme.light()` builds a `ColorScheme` from a helper; 38 `context.<palette>` extensions), audio/recording/file picking, expression forms 29, interpolation of a value whose Dart text needs its static type 22.
- **B (21 packages):** analyzer 0, normalizer 0, generator 5 439 — Riverpod 1 566 (+ 226 + 101 + cascades), theme 484 + 288, package calls with named arguments 462, opaque expressions 247, 57 `BRG3009` (two widgets of the same name in different packages), 20 `BRG3008`
  (an awaited `showDialog` whose *result* is used — see ADR-0077's documented differences).

## What is built for them, and what is not

Built (each with a Flutter/Dart oracle, mutants, ADR): route names (0072), package boundaries named (0073), widget parameters + formatters (0074), `dio` (0075), derived colours + object overrides (0076); before that, gestures, `LayoutBuilder`, extensions, records, patterns.

**Not built, and why each is a project rather than a patch:**

| Root cause | Why it is not a patch |
| --- | --- |
| **Riverpod** (`ref`, providers, `Notifier`/`StateNotifier`, `ConsumerWidget`) | It is a *state model*: a provider is a lazily-created, dependency-tracked, scoped value; `ref.watch` is a subscription that must be a hook at the top of a component (a build-local `final s = ref.watch(p)` is inlined per ADR-0048, so each use would be its own hook call); `.notifier` is a handle on a live object. It needs a runtime `ProviderContainer`, a UIR construct (a store *factory* with dependencies) or a mapping onto `app.Store`, analyzer recognition of `ConsumerWidget`/`ref`, and an oracle against real `flutter_riverpod`. |
| **Theme extension / design system** (`context.colors`, a `ThemeData` built by `AppTheme.light()`) | Tokens are extracted from a `ThemeData` *literal* in `MaterialApp`; here the theme comes from a helper taking an object parameter, so it needs interprocedural constant evaluation (a function body with locals, an argument bound to a `const` instance) and a `ThemeExtension` model (a class of colours read through `Theme.of(context).extension<T>()` → CSS variables). |
| Audio, recording, file picking, Supabase | Adapters like `dio`'s (a runtime class + a table row + an oracle) — each is browser-mappable and unbuilt. `dio` shows the size: one runtime file, 19 tests against real dio, one repository fixture. |
| Route state and push results | Built: an in-memory push carries live values (ADR-0077). Not built: `state.pathParameters` / `state.uri.queryParameters` / `extra`, `go(path)` with a runtime-built path (needs a runtime path matcher: pattern → route, params, query), and the *result* of a push (`await showDialog<T>` / `pop(value)`: `logic.Navigate` as an expression). |
| Same-named widgets in one program (`BRG3009`) | Unique component file/export naming across packages, including how two same-named exports are imported into one module. |

## Status of the two applications — Level 1

Analysis and honest refusal of the rest. Neither reaches TypeScript, `next build` or Chromium, because a program with a generator error emits nothing; **no claim of a running production application is made.**
