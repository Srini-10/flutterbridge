# `bridge_analyzer` — the compiler frontend

> Implementation notes for Spec v2.1 §3.1, §8, §10 and ADR-2/ADR-14. This documents *how the
> production code is organised*; it does not restate or amend the specification.

## What it is

The Dart half of the compiler. It loads a Flutter project through `package:analyzer`, extracts
resolved semantics, and emits UIR as NDJSON. **It never generates target code** (ADR-2).

## Layers

Enforced executably by `test/dependency_rules_test.dart` — the Dart-domain equivalent of
dependency-cruiser. A layer may import only the layers below it.

```
                     ┌──────────┐
                     │ pipeline │  stage contract, the three stages, the facade
                     └────┬─────┘
        ┌─────────┬───────┼────────┬──────────┐
        ▼         ▼       ▼        ▼          ▼
   ┌─────────┐ ┌──────┐ ┌────┐ ┌─────────────┐
   │ session │ │  io  │ │ …  │ │ diagnostics │
   └────┬────┘ └──┬───┘ └────┘ └──────┬──────┘
        ▼         │                   │
   ┌───────────┐  │                   │
   │ workspace │  │                   │
   └────┬──────┘  │                   │
        └─────────┴─────┬─────────────┘
                        ▼
              ┌───────────────────┐
              │  model  ·  errors │
              └─────────┬─────────┘
                        ▼
                    ┌──────┐
                    │ util │   depends on nothing
                    └──────┘
```

| Layer | Owns |
| --- | --- |
| `util` | Deterministic ordering (`sortedPaths`, `canonicalJson`, `compareBy`), exit codes. **Dependency-free.** |
| `model` | `SourceSpan`, `ProjectInfo`, `DirectiveRef`, `RawNode`. Immutable data, no behaviour. |
| `errors` | `BridgeInternalError` (a bug), `EnvironmentFailure` (an unfit project). |
| `diagnostics` | `Diagnostic`, `DiagnosticCode`, the code registry, `DiagnosticSink`, the two reporters, `explain`. |
| `io` | Atomic temp-and-rename writing. |
| `cache` | Content hashing, the CAS, `FileDigest` / `ModuleArtifact`, the API/impl fingerprint split. |
| `builder` | The canonical UIR builder: the **only** place UIR objects are constructed. |
| `incremental` | The dependency graph, the change set, and the "incremental ≡ clean" rebuild. |
| `emit` | The NDJSON emitter and the output manifest — the sole serialization boundary. |
| `workspace` | Project discovery (pubspec, `package_config.json` incl. pub workspaces, library enumeration) and the **preflight check**: does every directive point at a file that exists? |
| `session` | **The only part of the compiler that imports `package:analyzer`.** Parsing, directive scanning, digests, resolved units, **extraction**, and the **adapter registry**. |
| `pipeline` | The stage contract, the four stages, the incremental pipeline, and `BridgeAnalyzer`. |

### Why `package:analyzer` is quarantined in `session`

ADR-14: analyzer 14 shipped a redesigned AST (`ClassDeclaration.body.members`, `NamedArgument`, a
unified `FormalParameter`), and adapting the M0 spike to it cost three rounds of compile fixes. The
next such redesign must be absorbable by editing one directory. A test fails the build if any other
layer imports it.

## The pipeline

```
LOAD ──────▶ EXTRACT ──▶ CANONICAL ──▶ EMIT      the clean pipeline
M1-T1/T7      M1-T8        M1-T3       M1-T4
   ✓            ✓            ✓           ✓

LOAD ──────▶ ( EXTRACT + CANONICAL, cached per file ) ──▶ EMIT      --cache <dir>
```

**The incremental path writes the same bytes.** Not approximately, and not usually: *byte-identical to
a clean build of the same sources*, which is the only property that makes a cache safe to trust rather
than merely fast (risk R8, ADR-5). The two steps are fused there because the cache stores **built
canonical records** — a `RawNode` has no id, and an id is what makes a record reusable — so the unit of
caching spans extraction and building. The stages still happen; they happen inside one cached step.

Order is fixed by Spec §3.1 and is not configurable.

`LOAD` does three things, none of which resolves a unit: **discovery** (pubspec, package config,
`lib/` — a missing one is an `EnvironmentFailure`), **shape** (a package with no `flutter` dependency
is analyzed, with a `BRG0105` warning), and **preflight** (below).

**Stages declare whether they are implemented.** The pipeline stops at the first stage that is not,
and reports `RunStatus.pendingImplementation` — it never fabricates a result. This matters more than
it looks: *an empty output is indistinguishable from a successful extraction of an empty project*, so
a half-built compiler that "succeeds" with no nodes is the most dangerous thing it could do. Executing
an unimplemented stage directly throws `BridgeInternalError`, because the caller is broken.

## Package knowledge lives in adapters, and nowhere else

**No extractor contains `if (className == 'GoRoute')`.** It is not a style rule; it is enforced by
review and by the shape of the code — an extractor has no way to ask about a package except through the
registry (ISSUE-16, ADR-17).

```
                    AdapterRegistry          compiled, ordered by (priority, name), first-match
                          │
   ┌──────────────────────┼──────────────────────┬─────────────────────┐
   ▼                      ▼                      ▼                     ▼
GoRouterAdapter    MaterialRouteAdapter   FlutterWidgetAdapter   AnnotationAdapter
(routes, wrappers) (home:, routes:)       (widgets, slots,       (@freezed, @immutable)
                                           lifecycle, theme)
```

The reason is not tidiness. Every package the compiler supports is a place it could be wrong about
somebody's application, and there is no limit to how many packages that is — so the *set* of things
that can be wrong has to be enumerable, reviewable, and testable in one place. An extractor with a
`go_router` branch grows a `beamer` branch, then a `bloc` branch, until nobody can say what the
compiler believes.

### Wrappers are read, never guessed

Real applications wrap routing APIs. wonderous writes `AppRoute(ScreenPaths.home, (_) => HomeScreen())`
where `AppRoute extends GoRoute` — positional arguments, and a page produced inside a closure. An
adapter that knows only `GoRoute(path:, builder:)` finds **zero** routes in a dozen.

The tempting fix is a rule: *"the first positional argument is the path."* It is a heuristic, it is
wrong for the next application, and it is forbidden. Instead `wrapper_resolver.dart` **reads the
wrapper's constructor**, where every fact is already written down:

* `super(path: path)` — the super argument is a bare reference to a wrapper parameter, so that
  parameter *is* the path. The constructor says so.
* `pageBuilder: (c, s) { … builder(state) … }` — the super argument is a closure that **invokes** a
  wrapper parameter, so that parameter is what produces the page. The data flow says so.

Anything a wrapper does not forward in one of those two ways is genuinely unknowable from the call
site, and becomes `BRG1304` rather than an invention.

## The error model (Spec §8)

| Condition | Mechanism | Exit |
| --- | --- | --- |
| A problem in the user's code | `Diagnostic` — data, collected, ordered, never throws | 1 |
| The project is not prepared (no `pub get`) | `EnvironmentFailure` → diagnostic, **no output written** | 3 |
| A violated compiler invariant | `BridgeInternalError` — throws | 2 |

**No exception escapes the compiler boundary.** `bin/bridge_analyzer.dart` is the one place an `Error`
is caught, deliberately, so a bug surfaces as exit code 2 rather than a raw stack dump.

### Why an unfit environment is refused rather than tolerated

Without a complete element model, `package:analyzer` still returns a *resolved* unit — one in which
every type it could not find is `InvalidType`. Extraction then produces a confident-looking tree of
opaque nodes instead of an error. The output is plausible, well-ordered, deterministic, and entirely
wrong, and **nothing raises an error anywhere**.

This has cost a day three times:

| Where | The project | What was missing |
| --- | --- | --- |
| M0-T3, finding F6 | the fixture app | `flutter pub get` — 38 widgets became 0 |
| C1 | Flutter Gallery | `flutter gen-l10n` |
| C1 | compass_app | `dart run build_runner build` (freezed, json_serializable) |

None of those three is a broken project. All three are projects in a state the analyzer must be able
to *name*. So `load` runs a **preflight check** (`workspace/preflight.dart`) before resolving a single
unit: every `import`, `export` and `part` in `lib/` — including every URI of a conditional import — is
resolved against the package config, purely by parsing. A directive that points at nothing is
`BRG0106`, and the diagnostic names the command that fixes it, which differs by cause:

| Cause | Remedy in the diagnostic |
| --- | --- |
| package not in the config | `flutter pub get`, or add the dependency |
| `.g.dart` / `.freezed.dart` / `.gr.dart` / … | `dart run build_runner build` |
| `package:flutter_gen/…` | `flutter gen-l10n` |
| anything else missing | check the path |

The check is cheap — a parse and a map lookup, no resolution — and on the projects that fail it, what
we avoid is the entire resolution pass. `BRG0102` (no `package_config.json` at all) and `BRG0104`
(unreadable pubspec) are the same refusal, earlier.

## Determinism (D1–D5)

Guaranteed structurally, not by convention:

- **Traversal** — library files are enumerated through `sortedPaths`. Filesystem listing order is not
  a specification.
- **Diagnostics** — `DiagnosticSink.sorted()` imposes a *total* order (file, line, column, code,
  message). A comparator that can return 0 for distinct items leaves their order to the sort
  implementation, which is latent nondeterminism that survives testing and then breaks a cache.
- **Serialization** — `canonicalJson` sorts map keys recursively before encoding. Dart maps iterate in
  insertion order, i.e. in the order the compiler happened to discover things.
- **No ambient nondeterminism** — a `StageContext` grants a stage the diagnostic sink and nothing else.
  No clock, no randomness, no filesystem.
- **Atomic writes (INV-2)** — temp file, then rename. A killed analyzer never leaves a half-written
  file for a downstream consumer to parse happily.

## What is deliberately absent

No extraction visitors, no UIR types, no normalization, no code generation, no compatibility catalog.
Those belong to later milestones and are marked `BRIDGE-STUB(M1)` where their seams exist.
