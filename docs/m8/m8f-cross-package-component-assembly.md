# M8-F — Cross-package component program assembly

**Date:** 2026-08-21. **Predecessor:** M8-E (`8863928185bd1a6163b4674e13204b84437f2180`), which diagnosed —
without changing any code — that cross-package component resolution stops at exactly three
chokepoints: source/file discovery, `AnalysisContextCollection.includedPaths`, and
`Symbols.pathOf`'s single-package-name filtering.

## 1. Outcome

`bridge_analyzer` now analyzes Dart source in local (`path:`/workspace) package dependencies and
resolves references into it to real declarations. Verified against a controlled, self-authored
fixture (real analyzer → real generator → real `tsc`) and against Continuum's real `droid` and `mac`
apps: all four real target components (`SettingsPage`, `OnboardingPage`, `MessageLogView`,
`PeerBatteryIndicator`, all declared in `continuum_ui_kit`) are extracted as genuine `ui.Component`
nodes and correctly referenced from their real call sites. Both real apps go from **total analyzer
rejection** (M8-E baseline: 38/9 diagnostics, 0/0 files emitted) to **zero analyzer errors** for the
first time. Neither reaches a fully generated build — both now stop at a *different*, pre-existing,
explicitly out-of-scope normalize-stage limitation (§9) — but the milestone's own capability, cross-
package component assembly, is completely proven end to end.

M8-E's three-chokepoint diagnosis was **necessary but not sufficient**: two further, real chokepoints
were found only by running against genuine multi-package source, not anticipated by the fixture-only
trace (§3).

## 2. Baseline

M8-E, `7a44194`, clean tree. Continuum HEAD unchanged since M8-A (`a7a519f`) throughout this milestone.

| | droid | mac |
|---|---:|---:|
| Analyzer diagnostics (M8-E baseline) | 38 | 9 |
| Generator error lines (unique) | 16 | 12 |
| Files emitted | 0 | 0 |

## 3. Tracing the real pipeline — three chokepoints became five

M8-E's trace was accurate for what it tested (a fixture within this same repo checkout), but two
further chokepoints only surface against source that was never independently `pub get`-ed and is
laid out as Continuum's real packages are — flat siblings, not nested under one `.dart_tool`, several
carrying their own generated/excluded code:

1. **Source/file discovery** (M8-E chokepoint 1) — fixed: `ProjectLoader._dependencyLibraryFiles`.
2. **`AnalysisContextCollection.includedPaths`** (M8-E chokepoint 2) — fixed: each local dependency's
   package root added.
3. **`Symbols.pathOf`'s single-package filtering** (M8-E chokepoint 3) — fixed: `localPackages` param.
4. **Part files** (found running against `continuum_pairing`'s drift-generated `database.g.dart`) —
   `AnalysisContextCollection.getResolvedUnit` cannot resolve a `part of` file as its own library; only
   its defining library can. Fixed by a cheap parse-only `_isPartFile` check, skipped in `resolveAll()`.
5. **A dependency's own `analysis_options.yaml` excludes** (found running against
   `continuum_protocol`'s protobuf-generated `messages.pb.dart`) — `AnalysisContextCollection.contextFor`
   genuinely refuses a path an exclude glob covers; walking past the exclude is not a capability gained,
   it is a crash (`Bad state: Unable to find the context to ...`). Fixed by `_analysisExcludeGlobs`,
   reading each dependency's own `analysis_options.yaml` directly (never resolving an `include:` chain)
   and filtering discovery.
6. **Per-root `package_config.json` auto-discovery** (found running against `continuum_ui_kit`, whose
   root carries no `.dart_tool` of its own and sits under no ancestor that does either) — see §4. This
   was the one chokepoint M8-E's own diagnosis could not have found, because M8-E never built or ran
   anything; a static trace of the *code* cannot see a directory-layout accident that only a live
   `AnalysisContextCollection` construction exposes.
7. **A reference into an excluded dependency file** (found running against `continuum_protocol`'s
   `Envelope_Payload`, referenced from `continuum_pairing`) — see §5. Distinct from #5: #5 stops a
   crash while resolving; this stops a *dangling reference* the resolved-but-unextracted type produces.

None of these required a schema change, an ADR, or a `NodeId` rule change. All seven fit the existing
model.

## 4. The `packageConfigFile` chokepoint

### 4.1 Symptom

After fixing #1–#5, `bridge analyze` on droid stopped crashing but rejected the graph with 973
`BRG1303` ("could not resolve a type") errors — including on plain Flutter SDK types
(`theme.textTheme.labelSmall?.copyWith(...)`) inside `continuum_ui_kit/src/settings_page.dart`.

### 4.2 Root cause

`AnalysisContextCollection` builds one analysis context per root in `includedPaths`, and for each root
it *auto-discovers* that root's own `.dart_tool/package_config.json` by walking up the directory tree.
A local dependency is never itself `pub get`-ed — that is exactly what makes it a *dependency* rather
than a project of its own — so it has no such file, and if no ancestor happens to have one either
(true for Continuum's own repo layout: no `.dart_tool` above any shared package), that root resolves
with **no package graph at all**. Every `package:` import, `package:flutter/…` included, fails.

This was invisible against the self-authored `cross_package_ui` fixture used for the controlled build
proof, but not because the mechanism was different — because a stray, standalone `dart pub get` had
been run inside that fixture at some earlier point, leaving a real `.dart_tool/package_config.json`
that the auto-discovery walk happened to find. Deleting it reproduced the exact same class of failure
the real Continuum run hit. The synthetic Dart unit-test harness (`temp_project.dart`) never hit this
either, for the same accidental reason in a different shape: it writes every dependency package as a
subdirectory *of* the same root that owns the one `.dart_tool` it creates, so the upward walk finds the
root's config by nesting, not by design. **Neither prior "pass" proved the general mechanism; both were
directory-layout accidents.** This is exactly the class of hidden assumption Phase 1's own instruction
warned against taking on faith.

### 4.3 Fix, and why it reaches past the public API

`AnalysisContextCollectionImpl` (the concrete class the public `AnalysisContextCollection` factory
already delegates to) accepts a `packageConfigFile` parameter that forces every included root to
resolve against one named config, bypassing the per-root walk entirely — confirmed by reading
`context_locator.dart`: when a default config is supplied, it is used directly as
`_defaultPackageConfigFile` for every root's location. The public factory
(`package:analyzer/dart/analysis/analysis_context_collection.dart`) does not expose this parameter; only
the internal implementation
(`package:analyzer/src/dart/analysis/analysis_context_collection.dart`) does.

`analysis_session.dart` now imports `AnalysisContextCollectionImpl` directly, with an
`// ignore: implementation_imports` and an explanatory doc comment. This is a deliberate, narrow use of
an internal type, not a redesign: the field's *static* type stays the public `AnalysisContextCollection`
interface (`AnalysisContextCollectionImpl implements AnalysisContextCollection`), and the constructor
call is the only place the internal import is visible. ADR-14 already accepts that `session/` — and only
`session/` — may need to follow `package:analyzer` past its public surface when analyzer 14's own next
redesign requires it; this is the same boundary, exercised for a parameter the public factory simply
never grew.

`packageConfigFile: project.packageConfigPath` — the same file `ProjectLoader` already parsed to
build `ProjectInfo.dependencyLibraryFiles` — is what every included root now resolves through. A
single-package project passes exactly one root and this parameter changes nothing observable for it.

### 4.4 Verification

- Deleted the stray `.dart_tool` under `fixtures/packages/cross_package_ui` (confirmed `git status
  --ignored` shows it was never tracked) and re-ran the full Dart suite: 297/297 green, proving the
  fix — not the accident — now carries the fixture.
- Fresh `bridge analyze` against droid: 973 `BRG1303` errors → **0**.

## 5. The excluded-declaration dangling-reference chokepoint

### 5.1 Symptom

After §4's fix, droid's analyze dropped to exactly 2 errors:

```
error[BRG1201]: Unresolved reference
  --> lib/pages/pairing_page.dart:287:38
    | Reference to "type:package:continuum_protocol/src/generated/messages.pb.dart#Envelope_Payload",
    | which is not declared anywhere in the program.
```

### 5.2 Root cause

`Envelope_Payload` is a real, resolvable `enum` — protobuf-generated, in
`continuum_protocol/lib/src/generated/messages.pb.dart`, which `continuum_protocol`'s own
`analysis_options.yaml` excludes (§3, chokepoint #5). Excluding a file stops *its own* diagnostics and
stops `contextFor` from resolving *it* directly; it does not stop the Dart analyzer from resolving a
*type* it declares when another, non-excluded file references it — `revocation_module.dart` and
droid's `pairing_page.dart` both do. Before M8-F this could not happen: a path dependency's types were
never promoted to a real symbol at all, so a reference to one fell through to the same honest "external,
no target" treatment an SDK type gets. M8-F's own promotion — "`continuum_protocol` is a local package,
so its types get a real target" — is what turned this specific case into a *false* promise:
`Symbols.pathOf` said a declaration existed for a file `ProjectInfo.dependencyLibraryFiles` had never
actually walked.

### 5.3 Fix

`Symbols.pathOf` (and the six `xxxIn` methods built on it) now take a second set,
`extractedDependencyFiles` — exactly `ProjectInfo.dependencyLibraryFiles`, the set of dependency files
this program actually extracted. A local-package reference resolves to a real symbol only when **both**
conditions hold: the package is local, **and** the specific declaring file is a member of what was
actually extracted. This is not new machinery — it completes an invariant `pathOf`'s own doc comment
already claimed ("a dependency's own declaration and a reference to it agree on the symbol by
construction") but that the code did not yet enforce for the excluded-file case. Threaded through
`RawNodeEmitter`, `Extractor`, and `ExtractStage` alongside the existing `localPackageNames` set, using
the identical pattern already established for it.

### 5.4 Verification

- 297/297 Dart tests still green.
- droid: 2 errors → **0**. mac: confirmed 0 errors independently (never hit this particular case, but
  exercises the same code path).

## 6. Symbol identity design (recap, unchanged from M8-E's own plan)

- `PackageEntry.isLocal`: a `path:`/workspace dependency has a *relative* `rootUri` in
  `package_config.json`; a hosted/git dependency or the SDK has an absolute `file://` one. Structural,
  no name-matching.
- Root-package symbols: byte-identical to before M8-F (`lib/…`).
- Local-dependency symbols: the full, unmodified `package:<name>/<rest>` URI as the "path" component —
  a different string shape from `lib/…` by construction, so no new collision-avoidance is needed and
  none was added.
- Collision tests (both new, in `extraction_test.dart`): two local dependencies declaring the identically
  named class, and two local dependencies sharing the identical relative file path, both resolve to
  distinct, correct symbols.

## 7. Controlled fixture — real analyzer to real `tsc`

`fixtures/packages/cross_package_ui` (`GreetingCard`, a `StatefulWidget` with a required `name` prop,
its own local signal and action) + `fixtures/apps/cross_package_app` (`HomeScreen` constructs it as an
ordinary render-tree child, not via routing). Golden UIR committed at `fixtures/uir/cross_package_app.*`.

- 6 new analyzer tests (`extraction_test.dart`): local-dependency component becomes a real
  `ui.Component`; same-class-name collision resistance; same-relative-path collision resistance; SDK
  class never promoted; unrelated (non-local) pub dependency never compiled; `dart:core` class never
  promoted.
- 4 new generator tests (`cross_package_build.test.ts`): no generator errors, both files emitted;
  `HomeScreen` imports and constructs `GreetingCard` from its own emitted file; the constant prop crosses
  the package boundary and the dependency's own local state/action are genuinely its own; **real `tsc`**
  against the real, unmocked `@bridge/runtime-react` succeeds.
- `bridge validate` on the fixture: build succeeds, **deterministic** (two full runs agree byte for
  byte), **fixed point** (`normalize(normalize(x)) == normalize(x)`) — §10.

### 7.1 A pre-existing, general generator gap found and fixed along the way

`emitElement` had no mechanism at all for rendering a reference to a project's own `ui.Component` from
an ordinary widget-tree position — only a route/page-destination reference worked, via separate
machinery in `pipeline.ts`. Proved general (not cross-package-specific) with a same-package-only probe
(a sibling component nested as an ordinary child) before fixing it, per the task's own instruction not
to conflate a pre-existing gap with what M8-F was asked to build. Fixed via a new `EmitScope
.componentModules` map (`${library}#${name}` anchor → `{module, name}`, populated once before any
component is emitted so forward references work) and `emitComponentReference`, which renders
`<ComponentName {...props} />` by mapping props 1:1 by name — no catalog entry needed, since a project
component's own generated prop names are its Dart param names. This is squarely in Continuum's own real
usage path: all four real target components are constructed as ordinary render-tree children or
branches, never only as route destinations.

### 7.2 A pre-existing, unrelated generator gap found and *not* fixed

A function-typed constructor parameter (`VoidCallback`) generates a props-interface field typed
`unknown` rather than a function type, which real `tsc` then rejects if the prop is actually invoked
(`TS18046`). Classified as separate and pre-existing per the task's own instruction to keep distinct
failures distinct rather than quietly widen scope to fix them. The fixture's callback prop was removed
so the build proof exercises only what M8-F is about (prop-crossing, cross-package identity, local
state/action) without also depending on an unrelated fix.

## 8. Continuum re-run

Fresh `bridge analyze` (`dart run bin/bridge_analyzer.dart`), Continuum HEAD unchanged (`a7a519f`):

| | droid (M8-E) | droid (M8-F) | mac (M8-E) | mac (M8-F) |
|---|---:|---:|---:|---:|
| Errors | some (of 38 diag.) | **0** | some (of 9 diag.) | **0** |
| Total diagnostics | 38 | 117 (all warnings) | 9 | 88 (all warnings) |
| Graph accepted | No | **Yes** | No | **Yes** |
| Records written | 0 | 208 | 0 | 191 |
| `ui.Component` nodes | ~0 cross-package | 13 (8 dependency-sourced) | ~0 cross-package | 11 (8 dependency-sourced) |

The diagnostic *count* rose (38 → 117) while errors fell to zero: before M8-F the tree was rejected
early, so most of `continuum_ui_kit` was never walked and had nothing to report on; after M8-F the
entire real dependency source is analyzed for the first time, and the 117/88 are `BRG1302` ("no UIR
representation", e.g. adjacent-string-literals, collection-for/if, spreads) — pre-existing, unrelated,
warning-only extraction gaps in code that simply could not be reached before. None are errors; none
block the graph.

### 8.1 Per-component proof (all four)

| Component | Declared in | droid | mac |
|---|---|---|---|
| `SettingsPage` | `continuum_ui_kit/src/settings_page.dart` | ✅ `app.RouteTransition.component` → its real id, `pairing_page.dart:424` | ✅ same, `:394` |
| `OnboardingPage` | `continuum_ui_kit/src/onboarding_page.dart` | ✅ `ui.Element.component` (widget-tree child), `pairing_page.dart:529` | ✅ same, `:511` |
| `MessageLogView` | `continuum_ui_kit/continuum_ui_kit.dart` | ✅ `ui.Element.component`, `pairing_page.dart:749` | ✅ same, `:698` |
| `PeerBatteryIndicator` | `continuum_ui_kit/continuum_ui_kit.dart` | not constructed in droid (real, expected — mac-only widget) | ✅ `ui.Element.component`, `pairing_page.dart:523` |

Each row was verified two ways per app: the component exists as a `ui.Component` node whose `anchor`
matches its real declaring file, and its real caller's `ui.Element`/`app.RouteTransition` names it via
the *same* `{library, name}` pair (`ui.Element.component` is a descriptive reference — `{library, name,
userDefined: true}` — matched to the declaration by anchor at generation time via §7.1's
`componentModules`, not a resolved id; `app.RouteTransition.component` *is* a resolved id, and both
proofs above confirm it points at the right one).

## 9. What still blocks a full Continuum build, and why it is out of scope

`bridge build` on both apps: **analyze passes** (new), **normalize fails**:

```
BRG2305: `onExportLogs` forwards the source component's own constructor parameter across a route
  boundary. ... the owner of tracing a value through more than one component boundary is a future,
  whole-program provenance analysis, not this pass (ADR-11 amendment §"multi-hop").
BRG2301 (×2): `diagnostics`/`platformSection` passes a live object across a route boundary.
```

This is the exact, named, pre-existing limitation the task's own scope excluded: "do not broaden into
... multi-hop promotion." It is not a new M8-F regression — it is the *next* blocker, reached for the
first time only because M8-F's own unlock got the whole real program *past* analyze and into normalize
at all. Recommending it as the next decision milestone (§13) rather than absorbing it here is the
correct application of this milestone's own stop condition.

## 10. Determinism and fixed point

`bridge validate` on the controlled fixture: **deterministic** (two full runs agree byte for byte) and
**fixed point** (`normalize(normalize(x)) == normalize(x)`) both pass. `ProjectLoader`'s
`dependencyLibraryFiles` and `PackageConfig.localDependenciesOf` are both built through the existing
`sortedPaths`/sorted-by-name helpers (D1), so dependency enumeration order never reaches output order —
the same discipline the root package's own `libraryFiles` already had. `just ci`'s full Dart suite
(297/297) re-confirms this at the unit level after every change in this milestone.

## 11. Silent-wrong-code audit

- **Dependency component emitted with wrong implementation**: no — each of the four real components'
  emitted `render` tree traces to its own file's own source (verified by anchor).
- **Same-name collision**: no — §6's two collision tests (identical class name, identical relative path
  across two local dependencies) both pass, and no real Continuum diagnostic reported one.
- **Silently dropped props/callbacks**: no — §7's build-proof asserts the prop by exact generated source
  text (`props.name`), not just its absence of an error.
- **Duplicate declarations**: no — `_isApplicationScoped`'s existing dedup (`token:` symbols) is
  unrelated and unaffected; every other symbol here is file-scoped by construction, dependency files
  included.
- **Unstable ids**: no — determinism (§10) already proves this at the whole-document level.
- **Wrong-package component usage**: no — §8.1 confirms `library` on every emitted reference matches
  the referenced component's own real declaring file, not a same-named component in a different package.
- One genuine, real silent-failure risk was found (§5) and fixed rather than merely documented, because
  its fix was narrow and within the model already in place (§5.3) — not a case requiring a stop.

## 12. Chokepoint-completeness verdict

M8-E's three-chokepoint diagnosis was **correct but incomplete**. It was reached by tracing the code
without running it against real, independently-owned multi-package source, and two further chokepoints
— §4 (shared package-config resolution) and §5 (a reference into an excluded declaration) — were
findable only by doing exactly that. Both fit the existing model (§6); neither required a schema change,
an ADR, or a `NodeId` rule change, so no stop condition was triggered.

## 13. Recommended next decision milestone

Normalize-stage multi-hop route-boundary provenance (§9) — `BRG2305`/`BRG2301` — is now the single
blocker standing between Continuum's real apps and a fully generated build. It is a known, named,
already-amended-for-in-ADR-11 limitation, not a new finding; this milestone surfaces it as *reachable*
for the first time rather than diagnosing it fresh. Recommended as the next milestone's target, sized
against the real evidence in §9 rather than estimated.

## 14. Regression

- `dart analyze --fatal-infos` (bridge_analyzer): clean.
- `dart test` (bridge_analyzer): 297/297.
- `just ci` (build, typecheck, test, codegen-check, lint, lint-negative, uir-lint, uir-test,
  analyzer-lint, analyzer-test, dart-analyze): **exit 0**, all green, including the 4 new cross-package
  generator tests and the 6 new cross-package analyzer tests.
- `fixtures/apps/hello_bridge/analysis_options.yaml`'s `flutter analyze` auto-modification side effect
  reverted before commit, per established convention.
- `bridge validate` on the controlled fixture: build, determinism, and fixed point all pass (§10).

## 15. Explicitly excluded work

Per the task's own scope: no navigation/switch-lowering change, no collection-literal modeling change,
no catalog expansion, no `ui.Async`/`themeMode` work, no multi-hop promotion (§9, deliberately left for
the next milestone), no schema change, no ADR, no `NodeId` rule change, no package-name heuristic in the
generator (component matching is entirely anchor-based, §7.1), no fix for the pre-existing function-
typed-prop generator gap (§7.2, distinct and unrelated).

## 16. Files changed

`dart/bridge_analyzer/lib/src/{model/project.dart, workspace/package_config.dart,
workspace/project_loader.dart, session/analysis_session.dart,
session/extract/{extractor.dart,raw_node_emitter.dart,symbol_table.dart,expression_extractor.dart,
signal_extractor.dart}, pipeline/{stages.dart,extract/extract_stage.dart}}`,
`dart/bridge_analyzer/pubspec.yaml` (+`glob`), `dart/bridge_analyzer/test/{extraction_test.dart,
support/temp_project.dart}`; `packages/generators/react/src/internal/{pipeline.ts,
emit/{component.ts,expression.ts,store.ts}}`, `packages/generators/react/tests/{support.ts,
cross_package_build.test.ts}`; new fixtures `fixtures/packages/cross_package_ui/`,
`fixtures/apps/cross_package_app/`, goldens `fixtures/uir/cross_package_app.*`.
