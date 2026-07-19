# Installation

FlutterBridge compiles a Flutter application to another target. It installs from npm and needs a Flutter
SDK, because it reads your app through Dart's resolved element model rather than by parsing text.

```bash
npm install -g @bridge/cli
```

Then, in any Flutter project:

```bash
bridge doctor
```

If that says `ready to build.`, you are done — go to the [quick start](./quick-start.md).

## Requirements

| You need | Version | Why | Check |
| --- | --- | --- | --- |
| **Flutter SDK** | bundling Dart `>=3.11 <4.0` | the analyzer resolves your app against the SDK Flutter itself resolved it with | `flutter --version` |
| **Node.js** | 20 or newer | the compiler, generators and CLI are TypeScript | `node --version` |
| **A package manager** | npm, pnpm or yarn | to install this, and to install what it generates | `npm --version` |

The Dart constraint is the analyzer's own (`dart/bridge_analyzer/pubspec.yaml`), and it is enforced: `dart
pub get` refuses an SDK outside it. Flutter bundles Dart, so there is nothing separate to install. You do
**not** need pnpm, Rust, Docker, or a checkout of this repository.

`0.1.0` was validated against **Flutter 3.44.0 / Dart 3.12.0**. Older Flutter releases within the Dart
constraint are expected to work and were not tried.

### Node 25

`dependency-cruiser`, used only by `pnpm run lint:deps` inside this repository, refuses Node 25. It is not
part of an installed FlutterBridge and does not affect the CLI. If you are working *on* FlutterBridge and
want the architecture lint, use Node 22 or 24.

## Supported platforms

The CLI is JavaScript and the analyzer ships as Dart source, so both run wherever Node and Flutter do.
There are no native binaries in the npm package.

| Platform | Status | What that means |
| --- | --- | --- |
| **macOS (Apple silicon)** | ✅ **validated** | install → doctor → build → `next build` → browser → validate, from a registry install |
| **Linux x64 / arm64** | ⚙️ **CI-qualified, not hand-run** | the release matrix runs the full pipeline here; no human has used it interactively |
| **Windows x64** | ⚙️ **fixed and CI-qualified; never hand-run** | was **broken** through 0.1.0 — see below |
| macOS (Intel) | ⚙️ same as Linux | same toolchain, different architecture |

The distinction between ✅ and ⚙️ is deliberate and is the honest state of this release: **a green CI run is
evidence, not the same evidence as somebody using it.** The
[release matrix](./ci.md) executes the same pipeline on all three platforms and additionally proves the
output is byte-identical between them.

### Windows

Through 0.1.0 the CLI could not work on Windows at all, and an earlier edition of this table said "expected
to work", which was wrong. Four defects, three of them fatal:

- `bridge doctor` shelled out to `/usr/bin/env which dart` — neither exists on Windows, so the Dart SDK
  check reported *not on PATH* on every machine, including correctly configured ones.
- `dart`, `npx` and `flutter` are batch files there, and `child_process.spawn` without a shell cannot
  execute a `.bat`. Analysis, dependency resolution and typechecking would all have failed with `ENOENT`.
- `bridge build`'s typecheck stage invoked `/usr/bin/env npx`.
- **Path separators reached UIR.** `span.file` would have been `lib\main.dart`, and because spans become
  anchors and anchors are hashed into node ids, *every node id on Windows would have differed* — a wholly
  different document, failing every committed golden.

All four are fixed, all four have regression tests that run on every platform, and the release matrix
exercises them. What has *not* happened is a person sitting at a Windows machine using FlutterBridge. If you
are that person, `bridge doctor` is the first thing to run.

### Line endings

Git's `core.autocrlf` defaults to `true` on Windows. A CRLF checkout changes `span.length` — a source span
legitimately counts its own line endings — which would make the analyzer's output differ from every other
platform's. [`.gitattributes`](../../.gitattributes) pins `eol=lf` for this repository.

**Your own project is not covered by that**, and this is a real limitation: if your Flutter sources are CRLF
and a colleague's are LF, your UIR will differ in `span.length` and your caches will not be shared. Node ids,
and therefore the emitted application, are unaffected. Adding `* text=auto eol=lf` to your project's
`.gitattributes` avoids it.

## What gets installed

`npm install -g @bridge/cli` pulls **seven** `@bridge` packages plus one third-party dependency:

| Package | What it is |
| --- | --- |
| `@bridge/cli` | the `bridge` command, and the **Dart analyzer** under `vendor/dart/` |
| `@bridge/compiler` | loader, pass manager, N1–N11 normalization |
| `@bridge/core` | plugin host, diagnostics, configuration |
| `@bridge/uir` | the intermediate representation and its schema |
| `@bridge/plugin-sdk` | the extension interfaces |
| `@bridge/gen-react` | the default generator (React / Next.js) |
| `@bridge/widgets-material` | the default widget catalog (Material) |
| `@material/material-color-utilities` | Material 3 role derivation (third-party) |

**`@bridge/runtime-react` is not among them.** It is the kit your *generated application* depends on, and
`npm install` inside the emitted project is what fetches it — not this install. `@bridge/verification` is
not published at all: its source is currently `export {}`.

The analyzer ships as Dart source rather than a compiled binary. A binary is per-platform, and shipping
four platforms' worth of binaries that were never run on those platforms is a claim this project will not
make. Source runs anywhere Flutter does.

### The first run resolves the analyzer

The first `bridge analyze` on a machine prints:

```text
• resolving analyzer dependencies (first run only)
```

That is `dart pub get` for the bundled analyzer — the step any cloned Dart project needs. It wants network
access **once**. The versions come from a `pubspec.lock` shipped inside the package, so you get the
resolution this release was tested with rather than whatever is newest today. Every later run skips it.

If the install directory is not writable — some system-wide global prefixes are not — `bridge doctor` says
so, names the directory, and offers both fixes: run `dart pub get` there yourself, or point
`BRIDGE_ANALYZER` at a copy you own.

## A faster analyzer, optionally

Analysis dominates build time, and most of that is the Dart VM compiling the analyzer on every run.
Compiling it ahead of time removes most of it:

| Analyzer | `bridge build`, example app |
| --- | --- |
| bundled source (default) | 9.6 s |
| native binary | 3.2 s |

Both produce byte-identical UIR — checked by sha256, not by inspection. Building one needs a checkout:

```bash
just analyzer-binary
export BRIDGE_ANALYZER="$(pwd)/release/bridge_analyzer"
```

`bridge doctor` then reports `(BRIDGE_ANALYZER, binary)` so you can see which one is in use.

This is not the default because the binary only runs on the platform that built it. If you want it, you can
have it; the package will not ship you one that nobody has run.

## Verifying an install

```bash
bridge version   # 0.1.0
bridge doctor    # 8 checks
```

Every failing check carries the command that fixes it. Eight run always — configuration, Flutter project,
resolved packages, Dart SDK, analyzer, analyzer packages, generator, and one per configured catalog — and a
ninth appears only when a `bridge.yaml` is present, to say that it is read by nothing.

## Upgrading

```bash
npm install -g @bridge/cli@latest
```

**All `@bridge/*` packages release in lockstep and upgrade together.** They pin exact versions of each
other, so npm handles it — but if you installed any individually, match the versions.

Then, in each project:

```bash
bridge clean && bridge build
```

`clean` matters. Documents under `.bridge/` record the UIR schema they were built against, and a new
compiler **refuses** one built against a different schema:

```text
.bridge/uir.ndjson cannot be read.
  this document was built against UIR schema fc4e4eb130c9f948 (v1.4.0), and this compiler reads … (v1.5.0).
  → run `bridge analyze` to rebuild it with this version.
```

The refusal is the feature. An old document still *deserializes* — with a field missing, or an enum value
the reader has never heard of — and the compiler would carry on and be quietly wrong.

Your generated app depends on `@bridge/runtime-react` through a caret range, so `npm install` in the output
directory picks up compatible kit releases without regenerating. See
[version compatibility](./compatibility.md) for exactly what works with what.

## Installing a different generator or catalog

FlutterBridge loads generators and catalogs **by name at runtime**; the first-party ones are not
special-cased.

```bash
cd my-flutter-app
npm install --save-dev @someone/bridge-gen-vue
```

```json
{ "generator": "@someone/bridge-gen-vue" }
```

**A package installed in your project wins over the bundled one**, so you can also replace
`@bridge/gen-react` with a fork by installing it locally. See [plugins and generators](./plugins.md).

## Uninstalling

```bash
npm uninstall -g @bridge/cli
```

Per project, `bridge clean` removes `.bridge/` and the output directory. Nothing is written anywhere else:
no `~/.config`, no daemon, no global cache.

## Building from a checkout

Only needed if you are working on FlutterBridge itself.

```bash
git clone https://github.com/flutterbridge/flutterbridge
cd flutterbridge
pnpm install --frozen-lockfile
pnpm run build
alias bridge="node $(pwd)/packages/cli/bin/bridge.mjs"
```

`bridge` finds the analyzer in `dart/` automatically from a checkout. `just package` builds the release
tarballs and asserts each is installable.
