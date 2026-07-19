# Release v0.1.0

The first public release. FlutterBridge compiles a Flutter application into a React/Next.js project:
`npm install -g @bridge/cli`, then `bridge build`.

15 commits, grouped by subsystem in dependency order. `main` is untouched.

## Analyzer — `dart/bridge_analyzer`

Reads the app through Dart's resolved element model (ADR-2); recognition is **by supertype, never by name**.
Extraction covers application shells, navigation surfaces, overlays and lazy lists. Five defects came from
running it against real, unmodified applications for the first time — colour recognition by type name,
inherited constant fields, token symbols colliding across files (496 errors on one 113-file app), anchors
that were not file-qualified, and a diagnostic printing analyzer-internal class names.

It now analyses against the SDK the project was *resolved* with, derived from `package_config.json`, rather
than whatever `dart` is first on `PATH`.

## Compiler — `@bridge/compiler`, `@bridge/core`

Eleven target-neutral passes, deterministic and idempotent — `normalize(normalize(x)) == normalize(x)`,
checked on the user's own project by `bridge validate`. `@bridge/core` gains the config loader its
description has named since M0: one parser, no second copy in the workspace.

The significant fix: `PluginHost.load` resolved specifiers relative to `@bridge/compiler`, so **a
third-party generator could never have been loaded** — the exact inverse of what Spec §1.2 rule 3 exists
for. The rule was enforced on import statements and defeated by resolution.

## Runtime — `@bridge/runtime-react`

The kit emitted code imports (ADR-6/ADR-19). Two rules held throughout and are checkable rather than
aspirational: **no literal colours** (the compiler owns the palette, INV-20) and **no module-scope mutable
state** (a module is shared across requests in a Next.js server process, ADR-15).

## Generator — `@bridge/gen-react`

90 widget mappings through the pure, synchronous SPI ADR-22 specifies. Two defects made every generated
application broken, and both were green on every gate that existed at the time:

- **Emitted imports carried `.js`**, which `tsc` resolves under Bundler resolution and webpack does not —
  so typechecking passed and `next build` failed. `tsc` was the only gate the pipeline had.
- **A signal read through an expression never subscribed**, so the counter example rendered "0 times"
  through any number of clicks, with an empty console.

## CLI — `@bridge/cli`

Retires the `BRIDGE-STUB(M2)` carried since M0: until now there was **no public entry point from Flutter
source to an emitted project**. `init`, `doctor`, `analyze`, `generate`, `build`, `validate`, `clean`,
`version`, plus nine inspection commands. INV-17 holds — no compilation logic here.

The analyzer ships inside this package, which is what makes an installed `bridge` able to analyze anything.

## Packaging

Eight publishable packages at `0.1.0`, pinned to each other exactly so npm cannot construct a mixed
install. `just package` asserts on each tarball what only shows from outside the workspace — no
`workspace:`/`catalog:` protocol survived, entry points present, the CLI carries the analyzer and its
lockfile. `@bridge/verification` is private: its source is `export {}`.

## Browser validation — `e2e/`

18 Playwright tests against an application built by the **real** pipeline on every run, driving production
*and* development servers because React reports hydration and hook problems only in development. Nothing is
filtered by default; exactly one message is tolerated, by name, at one call site.

## Cross-platform qualification

A release matrix across Linux, macOS and Windows, including a job that proves output is **byte-identical
across operating systems** — something nothing had ever checked. Two reproducibility defects were found by
reasoning about that property: line endings changing `span.length`, and path separators reaching `span.file`
→ anchor → **node id**, which would have given every node a different id on Windows.

## Validation

951 tests (693 TypeScript, 240 Dart, 18 browser). From a registry install: all eight commands,
`next build`, browser suite, determinism byte-identical across three complete runs, fixed point.

**macOS is validated end to end. Linux and Windows are CI-qualified and not hand-run** — see
`docs/guide/installation.md#supported-platforms`, which keeps those two claims apart.

## Known limitations

A large production application cannot emit yet — that is why this is `0.x`. No incremental build.
Imperative navigation, the gesture model and slivers are not implemented. Full list in
`docs/release/v0.1.0.md`.
