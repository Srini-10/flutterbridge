# Changelog

All notable changes to FlutterBridge. Format follows [Keep a Changelog](https://keepachangelog.com/1.1.0/);
versioning will follow [Semantic Versioning](https://semver.org/) from the first release.

## [0.1.0] — 2026-07-19

**The first public release.** FlutterBridge compiles a Flutter application to a React/Next.js project:
`npm install -g @bridge/cli`, then `bridge build` in a Flutter project.

What it is, in one paragraph: a Dart frontend reads your app through the resolved element model (never by
parsing text), emits a layered intermediate representation, eleven target-neutral passes normalise it, and
a pluggable generator lowers it to a target. It **refuses** what it cannot translate faithfully rather than
approximating — a generated application that renders and is subtly wrong is worth less than one that says
exactly what it could not do.

Validated end to end on macOS: registry install → `bridge build` → `next build` → browser → determinism.
Linux and Windows run the same pipeline in CI and are not hand-run; see
[supported platforms](docs/guide/installation.md#supported-platforms).

**951 tests** — 693 TypeScript, 240 Dart, 18 browser. **90 widgets** render; 120 are catalogued.
**56.8%** of every widget instantiation across two real, unmodified Flutter applications.

### M5-F (cross-platform qualification)

**FlutterBridge 0.1.0 is ready for public release**, with macOS validated end to end and Linux/Windows
fixed and CI-qualified but not yet hand-run. The platform table distinguishes the two.

### Fixed

- **Path separators reached node ids.** `p.relative` uses the host separator, so on Windows `span.file`
  would have been `lib\main.dart` — and because spans become anchors and anchors are hashed into node ids
  (ADR-17), **every node id would have differed**. A wholly different document, sharing no cache and
  failing every golden. Normalised to POSIX at the point a path becomes a logical identifier.
- **Line endings changed `span.length`.** A CRLF checkout produced different UIR (`7dae021e…` vs
  `1ed8ccf5…`). Node ids were unaffected, but `build_proof_test.dart` byte-compares a golden and would have
  failed on any Windows checkout, since git's `core.autocrlf` defaults to true there. There was no
  `.gitattributes` at all; there is now.

### Added

- **`.github/workflows/release.yml`** — the release qualification matrix. Runs the full pipeline on Linux,
  macOS and Windows; packs, publishes to a local registry and installs globally on all three; proves the
  output is **byte-identical across operating systems**; and drives the browser suite. Documented in
  `docs/guide/ci.md`.
- **`tools/check-portability.mjs`** (`just lint`, `pnpm run ci`) — case-exact imports, CRLF and literal
  path separators, checkable from any host. Its header records what it does *not* add: `tsc` already
  catches TypeScript casing, so the value is Dart and `.mjs`.
- Regression tests for both defects, mutation-verified.

### M5-E (release candidate hardening)

**Recommendation: RC ready for macOS; blocked for Windows and Linux until someone runs it there.**

### Fixed

- **The CLI could not run on Windows at all.** Three POSIX-only assumptions: `doctor` shelled out to
  `/usr/bin/env which`, `spawn` ran without a shell (so `dart.bat`/`npx.cmd` failed with `ENOENT`), and the
  typecheck stage invoked `/usr/bin/env npx`. Analysis, dependency resolution and typechecking would all
  have failed. Fixed and covered by tests; **not yet run on Windows**, and the docs now say so.
- **`--config <path>` — the documented form — did not work.** The flag was never added to the parser's
  value-taking set, so only `--config=<path>` worked.
- **The ARGB `(super)` walk was implemented twice** in the analyzer, and both copies had needed the same
  M5-A fix. Extracted to `session/colour_constants.dart`; output byte-identical.
- **A second, weaker NDJSON parser in the CLI** reported no line number on malformed JSON, and reported
  wrong line numbers whenever a document had blank lines. Now delegates to the compiler's parser.
- **`@bridge/verification` was published empty** (`export {}`) and was a runtime dependency of the CLI.
  Unpublished and removed from the dependency graph — 9 published packages become 8.
- **The stub census counted a retired stub** described in prose, and sorted with `localeCompare`. 16 → 15.
- **A registry auth token had been written into the repository's `.npmrc`** by M5-C's validation harness,
  which also deleted two lines of hand-authored comment. Restored.

### Added

- **`docs/guide/supported-widgets.md`** — the first public list of what compiles (90 widgets, plus 35 that
  are catalogued but unmapped). Generated from `WIDGET_MAP` and checked by `codegen:check`, so it cannot
  drift.
- **Regression tests for M5-A's D1/D2**, which had none for five milestones because the Dart fixture's
  Flutter stub could not express a `MaterialColor`. The stub now can. Mutation-verified.
- **`portability.test.ts`** — the platform decisions, assertable from any host.

### M5-D (browser validation)

**A generated application ran in a browser for the first time, and two defects that made that impossible
are fixed.** Both were green on every gate the project had: extraction, normalization, generation, `tsc`
against the real runtime kit, and a registry install.

### Fixed

- **Emitted imports carried a `.js` extension, so `next build` failed on every generated application.**
  Under the `"moduleResolution": "Bundler"` the scaffolder writes, TypeScript resolves `./x.js` to the
  `.tsx` beside it and webpack does not — so `tsc` was clean and the build was broken. `tsc` was the only
  gate the pipeline had.
- **A signal read through an expression never subscribed, so generated apps did not update.** Only a bare
  `bind.Signal` emitted `useSignal`; a read reached through an interpolation or a comparison became
  `.get()` — the right value, no subscription. The counter example rendered "0 times" through any number
  of clicks, with an empty console. Subscriptions are now hoisted to the top of the component, which also
  removes a latent rules-of-hooks violation: `useSignal` inline in JSX is a conditional hook inside a
  `ui.Cond` branch or a list template.

### Added

- **`e2e/` — a browser validation suite.** 18 Playwright tests against a real generated application, built
  by the real pipeline on every run (`bridge build` → `npm install` → `next build`). Runs against both a
  production server and a development server, because React reports different things in each. Retires the
  M2 stub tag on `just e2e`, whose text named exactly this pipeline.
- **`just e2e`, `just e2e-fixtures`, `just determinism`, `just measure`.**
- Generator regression tests for both defects, asserted against a committed real analyzer document
  (`fixtures/uir/counter.normalized.ndjson`).

### M5-C (distribution and packaging)

**The first installable release.** Before this, FlutterBridge ran only from a checkout of its own
repository. Validated by a full publish-and-install cycle against a local registry on macOS arm64:
`npm install -g @bridge/cli` → `doctor` → `init` → `build` → `npm install` in the emitted app → `tsc` clean
→ `bridge validate`.

### Added

- **The Dart analyzer ships inside `@bridge/cli`** (`vendor/dart/`), as source. Its dependencies resolve on
  first use from a `pubspec.lock` shipped with it. Source rather than a binary because a binary is
  per-platform, and this release can honestly validate one platform.
- **Eight packages published** at `0.1.0`, public, compiler train in lockstep with exact inter-pins.
  `@bridge/verification` is not among them — its source is `export {}`, so there is nothing to ship.
- **`just package`** builds release tarballs and asserts each is installable — no `workspace:`/`catalog:`
  protocols survive, declared entry points are present, and the CLI carries the analyzer and its lockfile.
- **`just analyzer-binary`** builds an optional native analyzer: 3.2 s vs 9.6 s per build, byte-identical
  output. `BRIDGE_ANALYZER` accepts source or a binary; `doctor` reports which is in use.
- **Guides**: version compatibility, plugins and generators. Installation rewritten for an npm install.

### Fixed

- **The generator emitted `"@bridge/runtime-react": "workspace:*"`** into every application it generated.
  `workspace:` is a pnpm-only protocol, so **every generated app was uninstallable** with npm
  (`EUNSUPPORTEDPROTOCOL`). Now a caret range, declared once and shared with `runtimeRange`.
- **`@types/react-dom@19.2.7` does not exist** — the generator derived the stub version from React's, and
  the `19.2.x` line ends at `19.2.3`. Every generated project failed `npm install` with `ETARGET`. Type
  stubs now have their own constants, tested against the versions this repository installs.
- **`dart run` splits its path argument at `@`**, so the packaged analyzer — always under
  `node_modules/@bridge/` — could never be launched. It is now run from its own directory with a relative
  entry point. Invisible from a checkout, where no path contains `@`.
- **The analyzer inherited whatever `dart` was on `PATH`.** It now analyzes against the SDK the project was
  *resolved* with, derived from `package_config.json`. This also unblocked AOT compilation, which failed
  because `Platform.resolvedExecutable` is the binary itself.
- **The production commands never checked the UIR manifest**, so the loader's schema-compatibility refusal
  was inert for `generate`, `build` and `validate` — the commands people actually run. `build` now also
  writes a manifest beside `normalized.ndjson`, which previously carried none.
- **The default generator and catalog were `devDependencies`**, so a global install had neither and
  `bridge build` could not work out of the box.
- **`findAnalyzer`'s checkout fallback was miscounted** by two directory levels and never matched.
- **The inspection commands resolved plugins relative to `@bridge/compiler`** — M5-B fixed this for the
  production path only.

### Added — M5-B (developer experience)

- **A production CLI.** `init`, `doctor`, `analyze`, `generate`, `build`, `validate`, `clean`, `version`
  alongside the existing inspection commands. Retires the `BRIDGE-STUB(M2)` the CLI carried from M0: until
  now the pipeline had no public entry point from Flutter source to an emitted project.
- **`bridge.json`.** One parser, in `@bridge/core`, which the CLI and compiler both read.
- **`examples/counter`** — a Flutter app that compiles with no diagnostics, end to end.
- **Guides**: installation, quick start, CLI reference, configuration, architecture, troubleshooting.

### Fixed — M5-B

- **Plugins resolved from the compiler, not from your project.** `PluginHost.load` used a bare
  `import(specifier)`, which resolves relative to `@bridge/compiler` — so every plugin had to be a
  dependency of the compiler, and **a third-party generator could never have been loaded at all**. That is
  the opposite of what Spec §1.2 rule 3 exists for. Specifiers now resolve from the project first, then
  from the CLI.

### Fixed — M5-A (large application validation)

First run against real, unmodified production applications. Five defects, none findable at fixture scale:

- **Colour recognition was by type name.** `Colors.deepPurple` is a `MaterialColor`, so every swatch in
  Flutter's palette resolved to no token — and 45% of one application's failures were widgets asking for
  roles the program had declared.
- **Inherited constant fields were invisible.** A `MaterialColor`'s channels live two `(super)` levels down
  in Dart's constant model.
- **Token symbols collided across files** — 496 errors on a 113-file app, which refused the run outright.
- **Anchors were not file-qualified** — two files each declaring a private `_EmptyState` collided, which is
  ordinary Dart.
- **A diagnostic printed analyzer-internal class names** (`AdjacentStringsImpl`).

### Added — M4 (widget surface)

- **M4-I**: the first package catalog (`gap`), rebuild-scoping builders erased per INV-22, tabs, expansion
  tiles, selectable chips. Coverage 48.4% → 56.8%.
- **M4-H**: lazy lists (`ListView.builder` → `ui.List`), the implicit-animation family as CSS transitions,
  paged scrolling. Subscripts modelled as Dart's `operator []`.
- **M4-G**: the application shell — `Scaffold`, `AppBar`, drawers, navigation surfaces. `MaterialApp` is
  *consumed* rather than rendered.
- **M4-F**: forms, text input and the four selection controls.
- **M4-E**: the colour and decoration model.
- **M4-D**: 22 widgets, per-widget capability diagnostics.
- **M4-B/C**: theme, constraint and alignment models; assets and Material metadata.

### Known limitations

See [`docs/troubleshooting.md`](docs/troubleshooting.md), ordered by measured frequency in real apps.
