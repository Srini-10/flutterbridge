# ADR-73 — Package adapters: what is supported, what is not built yet, what has no browser equivalent

- **Status:** Accepted (M13). Two real applications (240 files; 21 packages) use Riverpod, dio, audio, recording, file picking, Supabase and a design system built on `Theme.extension`.
  Their generator errors were a hundred different messages ("`ref` is not declared", "`_repository` is not declared", "named arguments needs the callee's signature") for three
  causes: packages, the theme-extension model, and project code that depends on both.
- **Date:** 2026-09-21

## Decisions

**D1 — A package is in exactly one of three states**, stated by name: **supported** (has an adapter: `go_router` routes/names, `gap`, `collection` equality, `freezed_annotation`, Material),
**not implemented yet** (a browser equivalent exists; the mapping is unbuilt), **no browser equivalent** (the capability does not exist in a browser). The table is `emit/packages.ts`
(`UNSUPPORTED_PACKAGES`); it never changes what is emitted.
**D2 — Every use is refused with the package named.** A reference whose type belongs to such a package, a member read of one of its classes, and an initializer of a top-level `final`
(a Riverpod provider) say *"This uses Riverpod, which has no adapter: … A browser equivalent exists (…) and the mapping is not built yet"* instead of "is not declared in this program".
**D3 — One summary per package** (`BRG3020`, warning): the package, what it is for, and how many typed references it makes — the root cause a hundred uses share.
**D4 — `BuildContext` is named.** `context` used as a value (`Theme.of(context)`, `MediaQuery.of(context)`, a design-system extension `context.colors` built on
`Theme.of(this).extension<T>()`) is refused as a `BuildContext`, which a generated component does not have. The theme-extension model — a `ThemeExtension` class as a token group, read
from CSS variables — is **not built**.
**D5 — Top-level variables, three causes kept apart.** A `final`/`const` is a module-level constant when its initializer lowers; when it does not, the message says the *initializer* failed (and why:
usually a package object); a **mutable** one is refused by design (state shared by every request in a server process, INV-19).

## Also in this change (each found by running the real applications)

- **Collections in string interpolation** — `'$list'`, `'$map'`, `'$set'` — print as Dart does (`[1, 2]`, `{a: 1}`, `{x, y}`, `null` elements, doubles as `1.0`) when the element types are
  `String`/`int`/`bool`/`double` or such collections, from the static type (`dartToString`, checked against real Dart, and against `flutter test`). A `num`, an enum, a class or `dynamic`
  element is still refused (Dart's text for it cannot be reproduced from the type).
- **`debugPrint`** (a framework top-level variable of function type) lowers to a console line.
- **Numeric methods** `round`/`floor`/`ceil`/`truncate`/`toInt`/`abs`/`clamp` (ADR-0071).

## What is *not* done (and is not claimed)

Riverpod providers and `ref`; `dio`; audio playback and recording; file picking; Supabase; `path_provider`; the theme-extension model. Each is refused by name; none is emitted approximately.
Riverpod is the largest: in the two applications it accounts for ~480 (`ref`) + ~480 (provider initializers) of 4 444 generator errors, and it gates most of the rest (a `ConsumerWidget` is not a component here).

## Evidence

`tests/unsupported_packages.test.ts` (recognition, the two refusals as different promises, the summary), `dart_print.test.ts` (18 vectors from `dart run`), `expression_forms` oracle (printed
collections against `flutter test`), and the two real applications' burn-down (`docs/m11/flutterbridge-production-compatibility-audit.md`).
