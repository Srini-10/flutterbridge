# Version compatibility

FlutterBridge is five things that version separately — an npm CLI, a Dart analyzer, a schema, a generator,
and a runtime kit your generated app installs. This is what has to agree with what, and which disagreements
are **detected** rather than merely documented.

## The short version

| If you… | Then… |
| --- | --- |
| upgrade `@bridge/cli` | run `bridge clean && bridge build` |
| have a stale `.bridge/` | the compiler refuses it and tells you to re-analyze |
| upgrade the runtime kit within a minor | your generated app keeps working; no regeneration needed |
| upgrade the kit across a minor, pre-1.0 | regenerate |
| mix `@bridge/*` versions | don't — they release in lockstep and pin each other exactly |

## The compiler train releases in lockstep

`@bridge/cli`, `@bridge/compiler`, `@bridge/core`, `@bridge/uir`, `@bridge/plugin-sdk`, `@bridge/gen-react`
and `@bridge/widgets-material` share a version and are published together (Spec §1.4). They depend on each
other with **exact** pins, not ranges:

```json
"dependencies": { "@bridge/compiler": "0.1.0", "@bridge/core": "0.1.0" }
```

So a mixed install is not something you have to avoid by being careful — npm cannot construct one.

This is deliberately stricter than semver requires. These packages are one compiler split across
directories for architectural reasons (Spec §1.2), not independently useful libraries, and a caret range
between them would only ever express a compatibility nobody had tested.

## The runtime kit versions independently

`@bridge/runtime-react` is the exception, because it is the only package your **generated application**
depends on at runtime. It follows an LTS policy: the emitted `package.json` gets a caret range.

```json
"dependencies": { "@bridge/runtime-react": "^0.1.0" }
```

A kit release inside that range is a drop-in `npm install` in your output directory — no regeneration. The
generator declares the same range as `TargetGenerator.runtimeRange` (INV-12/INV-13), and it is one constant
used twice rather than two that can disagree.

**Pre-1.0, a caret is bounded by the minor**: `^0.1.0` admits `0.1.x` and not `0.2.0`. So a `0.2.0` kit is a
regeneration, and that is semver's rule for 0.x rather than a policy of ours.

## The UIR schema is checked, not assumed

Every document the analyzer or the compiler writes carries a manifest beside it:

```json
{"buildVersion":"0.1.0","diagnosticCount":0,"format":"ndjson/1","recordCount":10,
 "schemaHash":"fc4e4eb130c9f948","uirVersion":"1.4.0"}
```

`schemaHash` is a hash of the UIR schema itself, generated into both language domains from
`packages/uir/schema/`. The loader **refuses** a document whose hash differs from the one it was built with:

```text
.bridge/uir.ndjson cannot be read.
  this document was built against UIR schema DEADBEEF… (v9.9.9), and this compiler reads fc4e4eb130c9f948
  (v1.4.0). It is not readable, and it is not *unreadable* either — it would deserialize, with fields the
  reader does not know, and the compiler would carry on and be quietly wrong. Re-run the analyzer.
  → run `bridge analyze` to rebuild it with this version.
```

Exit code 3 — a refused input, which no retry of the same command will fix.

That message explains why this is checked rather than trusted. A schema change does not make an old document
*fail to parse*; it makes it parse into something subtly different. Both `.bridge/uir.ndjson` and
`.bridge/normalized.ndjson` carry manifests, and both are checked, so there is no document in `.bridge/`
that the compiler will read on faith.

The three checks are: schema hash, wire format (`ndjson/1`), and record count against the manifest — the
last catching a truncated document, which is more dangerous than a missing one.

## The Dart analyzer

Bundled inside `@bridge/cli` and versioned with the train, so the CLI and its frontend cannot drift. Its own
dependency on `package:analyzer` is pinned **exactly** (ADR-14) rather than with a caret, because extraction
output is hashed into every cache key: a transitive minor bump must never be able to change what the
compiler sees.

`bridge doctor` reports which analyzer is in use and where it came from:

```text
ok   analyzer   …/@bridge/cli/vendor/dart/bridge_analyzer/bin/bridge_analyzer.dart (packaged, source)
```

`BRIDGE_ANALYZER` overrides it — with source or a compiled binary. If you point it at a build from a
different release, the manifest check above is what catches the mismatch, at the next command that reads a
document.

## Flutter and Dart

The analyzer requires Dart `>=3.11 <4.0`, enforced by `dart pub get` rather than documented at.

**Your project is analyzed against the SDK it was resolved with**, not against whatever `dart` is first on
`PATH`. The analyzer derives it from your project's own `.dart_tool/package_config.json` — `sky_engine` sits
inside the Flutter SDK's cache, so the Dart SDK beside it is the one `flutter pub get` used. A machine with
a standalone Dart *and* Flutter installed therefore analyzes correctly, which it did not before `0.1.0`.

## What is not checked

Stated plainly, because an undetected mismatch is worse than a documented one:

- **A generator against a runtime kit at build time.** `runtimeRange` is declared and tested inside this
  repository, but nothing verifies the installed kit against it when *your* app builds. The failure surfaces
  as a TypeScript error in the emitted project, which is at least loud.
- **A third-party catalog against a UIR version.** Catalogs declare no version constraint. Adding one is a
  plugin-SDK change, and no third-party catalog exists yet to justify it.
- **The Flutter SDK against widget-catalog contents.** The Material catalog transcribes values from a
  specific Flutter version (3.44). A different SDK may have different defaults, and nothing detects that.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| `0.1.0` | 2026-07 | first published release. UIR schema 1.4.0 (`fc4e4eb130c9f948`) |

`0.x` is not a formality: the API can change in a minor release. It stays `0.x` until a real Flutter
application compiles end to end, which it does not yet. The M5-A report measures what blocks it: six owner
classes, led by framework primitives INV-22 should erase (~990 references in one application) and
non-reactive fields (~290), plus ten unmodelled language constructs of which `is` checks are the most
frequent (131).
