# M5-C — Distribution, packaging and external installation

**Status: complete. FlutterBridge installs from a registry and runs with no checkout.**

Validated by a real publish-and-install cycle against a local npm registry — nine packages published,
`npm install -g @bridge/cli`, then a Flutter project that had never seen this repository taken all the way
to a typechecked React application:

```text
── 1. install ──   added 9 packages in 2s      bridge 0.1.0
── 2. init ──      created bridge.json
── 3. doctor ──    ready to build.
── 4. build ──     build succeeded.
── 5. npm install in the generated app ──      added 26 packages in 11s
── 6. build again — typecheck for real ──      ok typecheck 1130ms
── 7. validate ──  deterministic ✓   fixed point ✓        validated.
── 8. clean ──     removed build/bridge, .bridge
```

CI green: 33/33 turbo tasks, 207 analyzer tests, 28 `bridge_uir`, `dart analyze` clean, `codegen:check` OK,
`lint:stubs` OK. Nothing committed; 127 files in the working tree.

---

## 1. The finding that shaped the milestone

M5-B's report named one blocker: *"the analyzer is not packaged."* That was true, and it was one of **seven**
independent reasons an installed FlutterBridge could not have worked. The other six were invisible from
inside the workspace and appeared, one at a time, the first time anything was installed from outside it.

That pattern is the milestone's real result. Every defect below is of the same kind — a convenience of the
development environment that had quietly become a load-bearing assumption:

| Assumption | Where it broke |
| --- | --- |
| the analyzer is at `dart/` relative to us | an install has no `dart/` |
| `dart run <path>` works for any path | not when the path contains `@` |
| a package manager understands `workspace:` | only pnpm does |
| the default generator will be installed | it was a devDependency |
| `@types/x` is versioned like `x` | it is not |
| documents on disk are ours | not across an upgrade |
| whichever `dart` is on PATH is the right one | not with two SDKs installed |

None is subtle in hindsight. All seven survived every test in this repository, because the tests run where
the assumptions hold.

## 2. Architecture decisions

### 2.1 The analyzer ships as Dart source inside `@bridge/cli`

Three forms were built and measured on `examples/counter`, not reasoned about:

| Form | Size | `bridge build` | Portability |
| --- | --- | --- | --- |
| **source (.dart)** | **1.0 MB** | **9.6 s** | every platform, every Dart SDK the pubspec admits |
| kernel (.dill) | 32 MB | 5.8 s | every platform, **one** SDK version (format-stamped) |
| AOT (exe) | 17 MB | 3.2 s | **one** platform, no SDK needed to run |

All three produce **byte-identical UIR**, confirmed by sha256 from three different locations.

Source wins on the axis that decides it. The AOT binary is the fastest and is genuinely worth having, but it
is per-platform: shipping it means five binaries of which this repository can build and honestly validate
exactly one. Publishing four untested binaries to make an install faster is the kind of unvalidated claim the
project rules forbid, so the package ships the form that works everywhere and `BRIDGE_ANALYZER` accepts a
binary for anyone who wants the 3×. `just analyzer-binary` builds one.

The kernel snapshot loses on both axes at once — larger than the AOT binary, slower, and locked to the SDK
that produced it. Recorded so nobody re-measures it.

**Dependencies resolve on first use.** A shipped tree carries no `.dart_tool/`, because it holds absolute
paths into a pub cache that does not exist on the target machine. The first `analyze` runs `dart pub get`
against a **shipped `pubspec.lock`**, so a user resolves what this release tested rather than what is newest.

### 2.2 The compiler train publishes in lockstep, pinned exactly

Eight packages share version `0.1.0` and depend on each other with **exact** pins, not ranges. A mixed
install is not something a user must avoid by being careful — npm cannot construct one.

This is stricter than semver requires, deliberately. These packages are one compiler split across
directories for architectural reasons (Spec §1.2), not independently useful libraries, and a caret range
between them would express a compatibility nobody had tested. `.changeset/config.json` already declared the
policy; this milestone made the manifests match it.

`@bridge/runtime-react` is the exception, exactly as Spec §1.4 says: it is the only package a *generated
application* depends on, and it carries a caret range so a kit release is a drop-in `npm install`.

**`0.1.0`, not `1.0.0`.** A real Flutter application still cannot emit (M5-A). `0.x` says the API can move,
which is true, and semver has a meaning for it.

### 2.3 `@bridge/cli` depends on the default generator and catalog

This is the one decision that looks like it contradicts the architecture, so it is stated in full.

Spec §1.2 rule 3 forbids the compiler from *statically importing* a plugin, so that a Vue or Svelte
generator can be added without touching the compiler. It still does not: everything is loaded through
`PluginHost` by specifier at runtime, and `pluginBases` resolves **the user's project before this package**,
so an installed generator always beats the bundled one.

What changed is only whether the default is present on disk. The distinction that makes this correct is
*which package holds the dependency*: **`@bridge/compiler` is a library and must not know `gen-react`
exists** — that is rule 3's actual subject, and M5-B found the compiler violating it in the resolution
layer. **`@bridge/cli` is an application**, and an application shipping working defaults is the product, not
coupling.

No ADR: nothing in the spec is contradicted, and no interface changed.

## 3. Defects discovered and fixed

Nine. Each was found by running something, and the evidence is recorded with the fix.

### D1 — the production commands never checked the UIR manifest
`generate`, `build` and `validate` parsed NDJSON directly and passed no manifest, so the loader's
schema-compatibility refusal — the thing that stops a document from a different schema being read as if
nothing changed — **was inert for exactly the commands people run.** It fired only for the inspection
commands, which is backwards.

Additionally, `build` wrote `normalized.ndjson` with **no manifest at all**, and `generate` prefers that file
when it exists. So even after wiring the check in, tampering with `uir.manifest.json` sailed through. Both
documents now carry manifests and both are checked. Verified in the clean room: exit 3, correct message.

### D2 — the analyzer inherited whatever `dart` was on `PATH`
`AnalysisContextCollection` was constructed with no `sdkPath`, so `package:analyzer` fell back to deriving
the SDK from `Platform.resolvedExecutable`. Two consequences: a machine with a standalone Dart *and* Flutter
analyzes a Flutter project against the wrong core libraries — resolving, not failing — and an AOT binary
looks for the SDK beside *itself*:

```text
PathNotFoundException(path=<binary dir>/lib/_internal/sdk_library_metadata/lib/libraries.dart)
```

That is the `rc=255` M5-A recorded and could not explain. The analyzer now derives the SDK from the
project's own `package_config.json` — `sky_engine` lives in the Flutter cache, so `dart-sdk` beside it is
the SDK `flutter pub get` used. Output byte-identical before and after; AOT then worked and was also
byte-identical.

### D3 — the analyzer was not in the package, and the fallback path was miscounted
No `dart/` in an npm install. Separately, M5-B's fallback `../../../../../` resolved **two levels above the
repository** and never matched anything; it went unnoticed because another candidate happened to hit when
run from the repository root, which is where it was always run from.

### D4 — every generated application was uninstallable
The generator emitted `"@bridge/runtime-react": "workspace:*"` into every app's `package.json`.
`workspace:` is a pnpm-only protocol:

```text
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

The generator's entire output is a project someone is meant to run. Now a caret range, declared once and
shared with `TargetGenerator.runtimeRange` — which had been sitting at `0.0.x` with the comment *"it becomes
a real range when the kit ships."*

### D5 — `@types/react-dom@19.2.7` has never existed
The generator derived stub versions from React's. The `19.2.x` line of `@types/react-dom` ends at **19.2.3**,
so `npm install` in every generated project died with `ETARGET` before fetching anything. Type stubs track
the major and minor of their subject and then version on their own cadence. This repository already pinned
`19.2.3` correctly — the generator had reconstructed the number instead of using the known-good one.

### D6 — `dart run` splits its path argument at `@`
`dart run foo@1.2.3` is package-and-version syntax, and the parse is unconditional:

```text
Error on line 7 of …/helperPackage/pubspec.yaml: Not a valid package name.
  "/…/lib/node_modules/": "bridge/cli/vendor/dart/bridge_analyzer/bin/bridge_analyzer.dart"
```

Every npm scoped package installs under `node_modules/@bridge/`. So `dart run <packaged analyzer path>`
could **never** work, on any machine — and could never have been caught from a checkout, whose paths contain
no `@`. The analyzer now runs from its own directory with a relative entry point.

### D7 — the default generator and catalog were devDependencies
A clean `npm install -g @bridge/cli` failed `doctor` on two checks. Found on the first clean-room install;
`doctor` reported it correctly, which is the one part of this that worked as designed.

### D8 — the inspection commands still resolved plugins from `@bridge/compiler`
M5-B fixed this for the production path and left `openDocument` calling the bare form. Invisible in a
checkout; in an install it means `bridge inspect --plugin <my-catalog>` cannot see a catalog `bridge build`
loads fine.

### D9 — the vendored analyzer shadowed a contributor's source
`vendor/dart/` is a *copy* of `dart/`, made at pack time. Both exist in a checkout the moment anyone runs
`just package`, and the copy was winning — so editing `dart/bridge_analyzer` would have been silently
ignored. The worst kind of failure: the analyzer works, it is just the wrong one. Source now outranks a copy
of source, which costs an installed user nothing because no checkout candidate exists there.

## 4. Packaging and release strategy

- **`tools/bundle-analyzer.mjs`** copies `dart/bridge_analyzer` + `bridge_uir` into `packages/cli/vendor/`,
  preserving layout (the `path: ../bridge_uir` dependency needs it), excluding `.dart_tool/`, `build/` and
  tests, and **refusing to ship without a lockfile**. Wired as the CLI's `prepack`, so it cannot be
  forgotten. 94 files, 899 KiB.
- **`tools/pack-release.mjs`** (`just package`) packs all nine and asserts, on the tarball, what only shows
  from outside the workspace: no `workspace:`/`catalog:`/`file:` protocol survived, every declared entry
  point is inside, and the CLI carries the analyzer, its lockfile and `bridge_uir`.
- **`just analyzer-binary`** builds the optional native analyzer.
- **`just release-check`** = `ci` + `package`.
- `release/` and `packages/cli/vendor/` are git-ignored build artifacts, documented as such in `.gitignore`
  alongside the existing note about generated source that must *never* be ignored.

| Package | Tarball |
| --- | --- |
| `@bridge/cli` | 265 KiB (117 files, incl. the analyzer) |
| `@bridge/runtime-react` | 252 KiB |
| `@bridge/compiler` | 159 KiB |
| `@bridge/gen-react` | 135 KiB |
| `@bridge/uir` | 63 KiB |
| core / plugin-sdk / widgets-material / verification | 1–7 KiB each |

## 5. Validation

**Method: a real local npm registry (Verdaccio 6.8.0), a real `npm publish` of all nine tarballs, a real
`npm install -g` into an isolated prefix, and a Flutter project outside the repository.** No workspace
links, no `file:` paths, no mocks. The full cycle was run four times; each of D4–D7 was found by one of
them and fixed before the next.

| Step | Result |
| --- | --- |
| `npm install -g @bridge/cli` | 9 packages, **2 s** |
| `bridge version` | `0.1.0` |
| `bridge init` | writes `bridge.json`, detects the `pubspec.yaml` |
| `bridge doctor` | 8 checks, **ready to build** |
| `bridge build` (first ever run) | resolves analyzer deps, then **succeeds** |
| `npm install` in the emitted app | 26 packages, 11 s, resolves `@bridge/runtime-react@0.1.0` |
| `bridge build` again | **typecheck ok, 1130 ms** — emitted code compiles against the published kit |
| `bridge validate` | deterministic ✓, fixed point ✓ |
| `bridge clean` | removes both directories |
| schema-mismatch refusal | exit **3**, correct message |
| `BRIDGE_ANALYZER` → native binary | works; **byte-identical UIR**; 3.2 s vs 9.6 s |

### Performance

| | |
| --- | --- |
| Global install | 2 s |
| `bridge build`, cold | 9.6 s (analyze 9.2 s = **96%**) |
| `bridge build`, warm | 9.6 s — **no incremental build; `analyze` re-runs in full** |
| after touching a source file | 8.8 s |
| `bridge generate` alone | 0.08 s |
| with a native analyzer | 3.2 s |

Nothing was optimized: the brief forbids it, and the numbers confirm M5-A's finding that the cost is Dart VM
startup rather than analysis. The native-analyzer path is packaging, and it is measured rather than claimed.

## 6. Known limitations

1. **One platform validated.** macOS arm64 only. Nothing in the packaging is platform-specific — there are
   no native binaries in the package — but "should work" and "was run" are different claims, and
   `installation.md` keeps them apart in a table. Windows path handling was written carefully and never
   executed.
2. **Not published to a public registry.** Every mechanism is validated against a real registry; the
   remaining step is credentials and a CI workflow, neither of which belongs in a working tree.
3. **No incremental build.** 96% of build time is a full re-analysis.
4. **First run needs network**, for one `dart pub get`.
5. **Three compatibility surfaces are unchecked**, and `compatibility.md` says so rather than implying
   otherwise: a generator against the installed kit at *build* time, a third-party catalog against a UIR
   version, and the Material catalog against the user's Flutter SDK version.
6. **`bridge watch` still does not exist** — unchanged from M5-B, and still gated on analysis speed.
7. **A real application still cannot emit.** Unchanged from M5-A, and the reason this is `0.1.0`.

## 7. Release readiness

**Ready to publish**, with one caveat that is a decision rather than a defect.

| | |
| --- | --- |
| Packages build, pack and install | ✓ |
| Versions, licences, repository metadata, `publishConfig` | ✓ |
| Inter-package pins exact; no workspace protocols in any tarball | ✓ |
| Analyzer ships and runs from an install | ✓ |
| Generated apps install and typecheck outside the monorepo | ✓ |
| Docs sufficient to start from zero | ✓ |
| Validated on more than one platform | ✗ — see limitation 1 |
| CI publish workflow | ✗ — not written |

The caveat: publishing `0.1.0` today ships a package validated on one platform. That is defensible for a
`0.x` release **if the platform table is honest**, which it is. The alternative — validating four more
platforms — is CI work, not packaging work.

## 8. Recommendations for M5-D

1. **A release workflow, and the platform matrix that goes with it.** `just release-check` is the gate; what
   is missing is a CI job that runs it on macOS, Linux and Windows and then publishes. That converts
   limitation 1 from a caveat into a row of green checks, and it is the last thing between this and a real
   `npm install -g @bridge/cli`. Windows first: it is the only platform where the path handling has never
   been executed, and D6 is a reminder of what unexecuted path code is worth.
2. **Then the M5-A language work** — framework primitives (INV-22, ~990 references in one app),
   non-reactive fields (~290), `is` checks (131), `debugPrint` (297). After that a real application emits,
   and the browser E2E suite deferred since M5-A finally has a subject.
3. **Then incremental analysis, and `bridge watch` after it.** The analyzer already has a `--cache` flag and
   a cache-key implementation; nothing in the CLI uses them. That is the sub-second analysis both `watch`
   and a pleasant edit loop depend on.

Item 1 before item 2 is the same trade-off M5-B flagged and the same answer. M5-B's evidence was that nobody
outside this repository could run FlutterBridge; M5-C's is that they now can, on one platform. Finishing the
distribution story is cheap and bounded; the language work is neither, and it is worth more once people can
actually reach it.
