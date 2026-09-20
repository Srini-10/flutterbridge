# FlutterBridge

**A Flutter application compiler.** It reads a Flutter project and emits a working application for another
target — React/Next.js today, other targets by adding a generator.

```text
Flutter project → Universal Semantic Compiler → UIR → N generators
```

```bash
cd your-flutter-app
bridge init && bridge doctor && bridge build
```

## What it is

Not a transpiler and not a UI-kit port. The analyzer reads Dart's **resolved element model** — types, not
text — and produces a layered intermediate representation. Eleven target-neutral passes normalize it. A
generator lowers it to a target. The emitted code is a normal project you own.

Two properties are contracts rather than aspirations, and `bridge validate` checks them on your project:

- **Deterministic** — the same source produces byte-identical output.
- **Fixed point** — `normalize(normalize(x)) == normalize(x)`, so incremental and clean builds agree.

## What it refuses to do

**It never invents.** A construct with no faithful lowering is refused with a diagnostic naming the missing
capability and the subsystem that owns it — never approximated, never silently dropped. A generated app
that renders and is subtly wrong is worth less than one that says exactly what it could not do.

That is why `bridge build` writes *nothing* when generation reports an error.

## Status

Honest numbers, measured rather than estimated (M11 close, `docs/m11/flutterbridge-final-production-compatibility-audit.md`):

| | |
| --- | --- |
| Widget coverage | **56.8%** of every widget instantiation in two real, unmodified Flutter apps (M5) |
| Semantic claims checked against real Dart / Flutter | integers (3 477 cases), collections (361), strings (1 824), and 29 scenarios in which a real Flutter widget and the generated React component are driven through the same script and compared after every step |
| Browser proof | 6 generated applications built with `next build` and run in Chromium — production and development — 66 tests |
| Full gate | `just ci`: 1 462 TypeScript tests, 644 Dart tests, lint, codegen drift, dependency rules |
| A real application that compiles end to end | `examples/counter` and the fixture apps. **No large production application does.** `hello_bridge` is blocked (`_repository` reads a project class held as a field, a `FutureBuilder`, a route boundary, `themeMode`), and two real apps analysed read-only (a 240-file consumer app and a 21-package monorepo) are blocked by freezed/part-file classes, widget-returning helpers, spread/`for` in children, project-class members and go_router shapes — see the audit |

**The language subset that *does* compile is exact, or it is refused by name.** [`docs/guide/language-support.md`](docs/guide/language-support.md)
lists it: `int` arithmetic within the safe-integer domain (loud beyond it), `List`/`Set`/`Map` mutated in place through
aliases, props and nesting, `initState`/`dispose`/`didUpdateWidget`, constructor defaults, `String` and number members,
`switch`, increments as values. Where the compiled program differs from Flutter it says so — see the *Differences* in each ADR.

`examples/counter` compiles end to end with **no diagnostics at all**. A large production app does not yet:
see [`docs/m5/m5a-large-application-validation.md`](docs/m5/m5a-large-application-validation.md) and the M11 audit for exactly
what stops it, measured on real code.

**`0.1.0` is the first installable release.** `0.x` is not a formality — the API can change in a minor
release, and it stays `0.x` until a real Flutter application compiles end to end. FlutterBridge is **not** a universal Flutter
compiler and does not claim to be: it is a compiler for a stated subset that refuses the rest.

**Validated end to end on macOS.** Linux and Windows run the same pipeline in
[CI](docs/guide/ci.md), including a proof that all three produce byte-identical output — but nobody has
sat at a Windows machine and used it. [Supported platforms](docs/guide/installation.md#supported-platforms)
keeps those two claims apart.

## Get started

```bash
npm install -g @bridge/cli
cd my-flutter-app && bridge doctor
```

You need a Flutter SDK; it bundles the Dart the analyzer runs on. Nothing else.

- [Installation](docs/guide/installation.md) — requirements, platforms, upgrading
- [Quick start](docs/guide/quick-start.md)
- [`examples/counter`](examples/counter) — a build that succeeds
- [CLI reference](docs/guide/cli.md) · [Configuration](docs/guide/configuration.md)
- [Supported widgets](docs/guide/supported-widgets.md) — the generated list, and what each refusal means
- [Language support](docs/guide/language-support.md) — the Dart subset that compiles exactly, and what is refused
- [CI and release qualification](docs/guide/ci.md) — the cross-platform matrix
- [Version compatibility](docs/guide/compatibility.md) · [Plugins and generators](docs/guide/plugins.md)
- [Troubleshooting](docs/troubleshooting.md) — ordered by how often real apps hit each thing
- [Architecture](docs/guide/architecture.md) · [ADRs](docs/adr/)

## Packages

| Package | What it is |
| --- | --- |
| `@bridge/uir` | the IR vocabulary. Depends on nothing |
| `@bridge/plugin-sdk` | the contract a generator or catalog implements |
| `@bridge/core` | configuration, plugin host, diagnostics |
| `@bridge/compiler` | the passes N1–N11 |
| `@bridge/cli` | the `bridge` command |
| `@bridge/gen-react` | the React/Next.js generator |
| `@bridge/runtime-react` | the runtime kit emitted code imports |
| `@bridge/widgets-material` | the Material widget catalog |
| `bridge_analyzer` (Dart) | the Flutter frontend |

A second target is a generator plus a runtime kit. It touches no compiler code — that is what the plugin
realm's dependency rules exist to guarantee.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
