# M14 — final generator burn-down: what was measured, what was built, what stops the two real applications

## How the numbers are taken (and a correction)

`tools/taxonomy/taxonomy.mjs` runs `bridge build --json` (which stops at the first failing stage) **and** `bridge generate` (which normalizes on its own and *ignores the normalizer's errors*, so it always reaches the
generator), classifies every diagnostic with `tools/taxonomy/rules.json` (first match wins: root cause, category A–D, first failing layer, ADR), and writes `taxonomy-<app>.json` (machine-readable) and `.md`.
The rules are keyword buckets over the diagnostic text — an approximation of "root cause", stated as such: a diagnostic carries no file/line (the generator reports a node id; `bridge inspect` maps it to a span).

**The previous phase's figures counted `generate` only.** `bridge build` — what a user runs — never reached the generator on either application: A stopped at 1 normalizer error and B at 58 (`BRG2110` ×35, `BRG2305` ×22, `BRG2301` ×1).
`BRG2110` was a false positive on lists of *values* (`inputFormatters`, `DataColumn`s) and on a project widget with two `List<Widget>` parameters, which was in fact **silently dropping every widget it was given** (ADR-0074).

## Categories

**A** — a documented-supported contract with a compiler bug. **B** — a browser-compatible construct not implemented. **C** — a library adapter (a browser equivalent exists). **D** — no browser equivalent / an intentional refusal.

## Where the two applications stand (this tree)

See `taxonomy-A.md` and `taxonomy-B.md` (regenerate: `node tools/taxonomy/taxonomy.mjs <copy-of-app> --label … --out docs/m14/taxonomy-<x>`). In one line each:

- **A (240 files):** analyzer 0; `bridge build` passes normalize and stops in the generator, ~537 errors — Riverpod ~108 + the initializers/classes built on it, package calls with named arguments 64 (Supabase, `showModalBottomSheet`), the theme
  (`AppTheme.light()` builds a `ColorScheme` from a helper: 51 `BRG3010` + 38 `context`), audio/recording/file picking.
- **B (21 packages):** analyzer 0; `bridge build` stops at normalize (22 `BRG2305`: a screen's own constructor parameter forwarded across a route boundary; 1 `BRG2301`); past it the generator has ~5 450, Riverpod ~1 570 + a cascade, the theme ~485 + ~280, package calls with
  named arguments ~450, 57 `BRG3009` (two widgets of the same name in different packages emit to one file).

## What is built for them, and what is not

Built (each with a Flutter/Dart oracle, mutants, ADR): route names (0072), package boundaries named (0073), widget parameters + formatters (0074), `dio` (0075), derived colours + object overrides (0076); before that, gestures, `LayoutBuilder`, extensions, records, patterns.

**Not built, and why each is a project rather than a patch:**

| Root cause | Why it is not a patch |
| --- | --- |
| **Riverpod** (`ref`, providers, `Notifier`/`StateNotifier`, `ConsumerWidget`) | It is a *state model*: a provider is a lazily-created, dependency-tracked, scoped value; `ref.watch` is a subscription that must be a hook at the top of a component (a build-local `final s = ref.watch(p)` is inlined per ADR-0048, so each use would be its own hook call); `.notifier` is a handle on a live object. It needs a runtime `ProviderContainer`, a UIR construct (a store *factory* with dependencies) or a mapping onto `app.Store`, analyzer recognition of `ConsumerWidget`/`ref`, and an oracle against real `flutter_riverpod`. |
| **Theme extension / design system** (`context.colors`, a `ThemeData` built by `AppTheme.light()`) | Tokens are extracted from a `ThemeData` *literal* in `MaterialApp`; here the theme comes from a helper taking an object parameter, so it needs interprocedural constant evaluation (a function body with locals, an argument bound to a `const` instance) and a `ThemeExtension` model (a class of colours read through `Theme.of(context).extension<T>()` → CSS variables). |
| Audio, recording, file picking, Supabase | Adapters like `dio`'s (a runtime class + a table row + an oracle) — each is browser-mappable and unbuilt. `dio` shows the size: one runtime file, 19 tests against real dio, one repository fixture. |
| Route parameters (`BRG2305`, `pathParameters`) | The router pushes a route *descriptor*; carrying a screen's runtime value to the destination needs `params` on the destination and provenance of the value across components. |
| Same-named widgets in one program (`BRG3009`) | Unique component file/export naming across packages, including how two same-named exports are imported into one module. |

## Status of the two applications — Level 1

Analysis and honest refusal of the rest. Neither reaches TypeScript, `next build` or Chromium, because a program with a generator error emits nothing; **no claim of a running production application is made.**
