# M8-E — Remaining P1 blocker decision audit

**Date:** 2026-08-21. **Baseline:** `7a44194898fb85c4252bd1cc4168ee3a6eb9e20a` (== `origin/main`, clean
tree, confirmed before any measurement). This is a measurement/decision milestone — **no analyzer,
compiler, generator, runtime, schema, or catalog file was changed.** `just ci`/`just determinism` were
run and confirmed green at this exact commit as part of M8-D's own final gate, moments before this
milestone began; not re-run redundantly against unchanged code.

## 1. Baseline

HEAD and origin/main both `7a44194`, clean tree.

## 2. Fresh diagnostic census

Fresh `bridge analyze`/`generate` against both Continuum apps (Continuum's own git HEAD confirmed
unchanged, `a7a519f`, since M8-A):

| | droid | mac |
|---|---:|---:|
| Analyzer diagnostics | 38 | 9 |
| Generator error lines (unique) | 16 | 12 |
| Files emitted | 0 | 0 |

Reproduces M8-D's hypothesis exactly — no drift.

## 3. Root-cause table

Split further than M8-C's own grouping, per this milestone's explicit instruction:

| Root cause | Droid | Mac | Shared source? | Owning layer | Hard blocker? | Architectural? | Already-designed? | ADR? | Est. unlock |
|---|---:|---:|---|---|---|---|---|---|---|
| Cross-package component construction | 4 | 4 | **Yes** (`continuum_ui_kit`) | analyzer program-assembly | Yes | Yes | **Yes — see §6** | **No** | Large — 4 real components, 2 codes |
| Mid-function awaited navigation (`Navigator.of` non-terminal) | 3 | 2 | No (pattern, not source) | analyzer statement lowering + **runtime** | Yes | Yes | No | Likely, if implemented | 1 method per app |
| Complex action-body local resolution (`_bootstrap`) | uncertain, 0-1 | uncertain, 0-1 | No | analyzer/generator, uncertain | Uncertain | Unknown | Unknown | Unknown | Small, uncertain |
| Uncatalogued SDK widget (`SwitchListTile`) | 1 | 0 | No | catalog | Yes | No | Yes | No | 1 site |
| `ListTile.dense` (partial prop) | 1 | 0 | No | catalog | No (degrades) | No | Yes | No | Cosmetic |
| Third-party plugin widget (`DropTarget`) | 0 | 1 | No | catalog | Yes | No | Partially | No | 1 site |
| Collection spread / null-widget | 3 | 2 | No | extraction | Yes | No | Yes | No | Small |
| `_buildBody`'s `switch` (opaque, "widget returned by a call") | 1 | 1 | No | analyzer (M8-B's own stop boundary) | Yes | Yes | No | Likely | Large, unmeasured |
| N9 list-key warning | 1 | 0 | No | generator | No | No | Yes | No | None (working as designed) |

"Mid-function awaited navigation" and "complex action-body local resolution" were **one bucket in M8-C**
("complex action-body/navigation lowering"). §8-9 below split them apart and find the second may not
even be a real, independent failure.

## 4. Cross-package trace

All four sites' current declarations verified fresh (unchanged since M8-C, Continuum's own HEAD is
stable): `PeerBatteryIndicator` (`continuum_ui_kit/lib/continuum_ui_kit.dart:29`), `MessageLogView`
(`continuum_ui_kit/lib/continuum_ui_kit.dart:181`), `OnboardingPage`
(`continuum_ui_kit/lib/src/onboarding_page.dart:20`), `SettingsPage`
(`continuum_ui_kit/lib/src/settings_page.dart:37`) — all in one package.

Answering the ten required questions directly:

1. **Does the analyzer know the class exists?** Yes — Dart's own resolution correctly types every
   construction site (confirmed: no crash, no "undefined" error; each becomes a controlled diagnostic).
2. **Does it resolve the constructor element?** Yes.
3. **Is the package source available on disk?** Yes — `continuum_ui_kit`'s `lib/` is a real, present
   directory, resolved via the pub package config exactly like any dependency.
4. **Is that package currently inside the analysis roots?** **No** — this is the actual gate.
5. **Does the referenced component get a `ui.Component` declaration?** No.
6. **If not, exactly where is it excluded?** File discovery (`ProjectLoader.load`) only lists the target
   app's own `lib/`; `AnalysisSessionHandle`'s `includedPaths` only includes the app's own root;
   `Symbols.pathOf` gates every symbol on one hardcoded `packageName` string — three independent, narrow
   chokepoints (§6), not one.
7. **Does the caller nevertheless emit a `ui.Element` naming it?** Yes — the reference is well-typed and
   named, just missing a target `ui.Component` to point at.
8. **Which diagnostics are secondary symptoms?** `BRG3002`'s "named arguments" line (on `SettingsPage`'s
   construction) is downstream of the same absence — without a resolved component signature the
   generator cannot map named arguments to parameters.
9. **Are `BRG1304` and `BRG3001` genuinely one root cause?** **Yes**, confirmed — both fire for the
   identical underlying fact (no `ui.Component` exists for a class this project's own `lib/` doesn't
   declare), reached via two different code paths (route-transition resolution vs. plain widget-mapping
   lookup) that each, independently, correctly report the same absence in their own vocabulary.
10. **Does fixing program assembly remove both?** Yes, structurally — both checks would find a real
    `ui.Component` once one exists for these types.

## 5. Multi-package reduction ladder

Not built as literal new fixtures — answered directly from tracing the live implementation (§6), which
gives an exact, code-level answer rather than an inferred one:

| Rung | Shape | Where the boundary sits |
|---|---|---|
| A | same file | already works |
| B | another file, same package | already works (this project's own multi-file resolution, unrelated to this question) |
| C | another library, same package | already works |
| D | **local path dependency** (`continuum_ui_kit`) | **stops here** — the real Continuum case; `PackageConfig` already resolves its disk root, nothing walks it |
| E | workspace package | same mechanism as D in this codebase (Dart pub workspaces and `path:` deps resolve through the same `PackageConfig` machinery) |
| F | pub dependency with source | same stop as D — `PackageConfig` resolves any dependency's root uniformly, path or hosted |
| G | Flutter SDK | already handled — a completely different, pre-existing path (`registry.isFrameworkLibrary`, catalog-driven, not extraction) |
| H | third-party plugin widget | same as G's category conceptually (framework-adjacent), but uncatalogued — `DropTarget`, §3's own separate row |
| I | package re-exporting another's component | not reached — D already stops first |
| J | cyclic local-package dependency | not reached — D already stops first; Continuum's own dependency graph is acyclic (`pairing` → `transport`/`transport_flutter`/`protocol`; `ui-kit` → `protocol`/`pairing`) |

**Cross-package component construction is one bounded capability, not several distinct package-boundary
problems** — every non-SDK case (D through J) resolves through the identical `PackageConfig` mechanism
and stops at the identical three chokepoints (§6). This is a materially different conclusion from
treating it as many separate boundary problems.

## 6. Program-assembly architecture findings

Traced live (not inferred from comments): `PackageConfig.resolvePackageUri`
(`dart/bridge_analyzer/lib/src/workspace/package_config.dart:145-160`) **already** maps every
dependency — including `path:` dependencies like `continuum_ui_kit` — to an absolute `libRoot` on disk,
and this is already parsed into `LoadedProject.packageConfig` today, unused for extraction. Three narrow
chokepoints stop it being used:

1. **File discovery**: `ProjectLoader.load` (`project_loader.dart:85-136`) lists only the target
   project's own `Directory(lib)`.
2. **Analysis scope**: `AnalysisSessionHandle`'s `AnalysisContextCollection(includedPaths:
   [project.root])` (`analysis_session.dart:49-55`) — `package:analyzer` 14.0.0's own `contextFor(path)`
   throws for anything outside `includedPaths`.
3. **Symbol construction**: `Symbols.pathOf`'s single `packageName` string equality
   (`symbol_table.dart:135-146`), which every `xxxIn(...)` cross-file resolver (including this
   milestone's own `M8-D` `typeIn`) already funnels through.

**No existing ADR decided single-package scope either way.** ADR-2 commits to `AnalysisContextCollection`
as the extraction mechanism, not its scope. ADR-17's "no package is ever special-cased in the extractor"
is a *governing constraint* a generalized fix must honor (any solution must not hardcode
`continuum_ui_kit` by name) — not a blocker. **Conclusion: multi-package component inclusion is an
unimplemented extension of an already-general architecture, not a new program-boundary decision this
project has never made.**

**Symbol collision risk**: real but narrow and already-understood. Every symbol embeds a project-relative
file path (`'comp:$path#$name'`); two packages with identical relative paths (e.g. both declaring
`lib/foo.dart`) would collide under the *current* single-string `pathOf` check. The fix is exactly the
same shape of change §3's `packageName` parameter already threads through every `xxxIn` resolver —
package-qualifying the symbol, not a new mechanism.

## 7. Action/navigation trace

Every `env`/`states`/`Navigator.of` node id traced to its exact source span (droid; mac is structurally
identical):

- `Navigator.of(context).push(MaterialPageRoute(builder: (context) => SettingsPage(...)))` —
  `pairing_page.dart:422-436`, inside `Future<void> _openSettings() async`. **Not the last statement** —
  `final states = await env.settings.featureStates(); if (mounted) setState(...);` follows it
  (`:444-445`).
- The two `env`-named `BRG3006`s trace to `_openSettings`'s own local (`final env = _env;` at `:420`,
  narrowed non-null by `if (env == null) return;` at `:421`) — every occurrence within `_openSettings`
  (`:424,425,437,443`) content-addresses to the same id, correctly (same name, same narrowed type — a
  legitimate content-address collapse, not a bug).
- `states` (`:444`) is `_openSettings`'s own local too.

## 8. Action reduction ladder

Synthetic probes hit a pre-existing test-harness limitation (the same `BRG1303`-class incomplete-typing
gap M8-B's own `Theme.of`/`.textTheme` probes hit) for every rung, uniformly — not a finding about
navigation, a limitation of this specific minimal test project's Material typings. Real evidence used
instead: `fixtures/apps/async_push_guard/lib/home_screen.dart`'s `_submit()` is the **working** reference
case — `async`, two `setState` calls and an `await Future.delayed(...)` **before** the navigation, then
`await Navigator.push<void>(context, MaterialPageRoute(...))` as the method's **last statement**. Every
rung's classification, derived from comparing this working case against `_openSettings` and against the
lowering code directly (§9):

| Rung | Shape | Classification |
|---|---|---|
| A-D (sync, non-awaited) | already supported (`navigateOf` fires unconditionally for a non-awaited `MethodInvocation` statement) |
| E | `await` on something else, then a non-awaited push | supported (push itself isn't awaited) |
| F | `await` push, terminal | **already supported** — `async_push_guard`'s own proof |
| G | `Navigator.of(context).push(...)`, non-awaited | already supported — form-agnostic (§9) |
| H | `final nav = Navigator.of(context); nav.push(...)` | not directly probed (harness limitation); expected supported by the same form-agnostic reasoning, unconfirmed |
| I | `if` guarding a non-awaited push | already supported |
| J | `if`/`else` push-or-pop | already supported |
| K | `setState` then non-awaited `Navigator.of(...).push` | already supported |
| **`_openSettings`'s actual shape** | `await Navigator.of(...).push(...)`, **not terminal** | **deliberately unsupported semantic case (§9), not a recognition gap** |

## 9. Navigator.of findings

Read `navigateOf`'s implementation directly (`statement_extractor.dart:467-497`): it delegates to
`registry.navigationActionOf`, which is **form-agnostic** — the adapter layer already treats
`Navigator.push(context, ...)` and `Navigator.of(context).push(...)` identically (confirmed in
`material_adapter.dart`'s own comment: "Static form passes `context` first; the instance form... does
not... true of both"). **The `.of()` form itself is not the blocker.**

The actual gate is exactly one line: `if (_isLastStatementOfFunctionBody(node))`
(`statement_extractor.dart:182`), guarding the `AwaitExpression` case only. Answering Phase 8's A-G
directly: **D — the push isn't terminal — is the entire cause.** Not A (`.of()` is recognized fine), not
B (chained `MethodInvocation` loses nothing — the adapter reads through it), not C (no representation
gap for `NavigatorState`), not F (`transition` identity resolves fine — confirmed via `app.RouteTransition`
existing for this edge, per `BRG3013`'s own message), not G (multiple causes) — it is D, alone.

## 10. Semantic-safety findings

The code's own comment (`statement_extractor.dart:172-180`) states the exact reason this boundary is
narrow, and it is a **runtime capability gap, not merely an extraction-recognition gap**: `@bridge/
runtime-react`'s router `push`/`replace` are **synchronous** (`RouterInstance.push(destination): void`) —
there is no way to await the eventual pop. Dropping Dart's `await` is unobservable only when nothing
follows the navigation (the terminal case); dropping it when something does follow would silently run
that continuation immediately instead of waiting for the user to navigate back — exactly the ordering
violation M7-H's own header protects against. **Broadening this to `_openSettings`'s shape is not a safe,
narrow extension of the existing rule — it requires the runtime kit to gain a genuine new capability**
(a way for a pushed route's eventual pop to resume a suspended JS continuation), which does not exist
today. This is real, new runtime design work, likely warranting its own scoping before implementation —
not a mechanical widening of M7-H's `_isLastStatementOfFunctionBody` check.

**`_bootstrap`'s own status is genuinely uncertain, not confirmed as an independent failure.** Both
"env"-named `BRG3006` node ids were traced exhaustively (grep across every occurrence in the raw
document, not just the diagnostic's own single reported span): one id's occurrences are **entirely**
within `_openSettings` (`:424,425,437,443`); the other id's occurrences span **both** `_openSettings`
(`:421`) **and**, coincidentally, `_bootstrap`'s own separate local (`:109` — `final env = await
PairingEnvironment.open();`, unrelated to `_openSettings`'s own `env`) — a genuine content-address
collision (same name, same non-nullable `PairingEnvironment` type, no `target` to disambiguate by). This
means the **observed** diagnostic count cannot be used alone to prove or disprove whether `_bootstrap`
(a `try`/`catch` with sequential locals and nested `if`/`else if` — statement shapes
`statement_extractor.dart` already structurally supports for ordinary action bodies) would succeed
independently of `_openSettings`'s already-failing reference. This was not resolved further in this
measurement-only milestone; it is recorded as a genuine open question, not assumed either way.

## 11. Impact model

| | Candidate A (cross-package) | Candidate B (navigation) |
|---|---|---|
| Error lines removable | ~8 across both apps (4+4) | ~5 across both apps (3+2), **and only if the runtime gains a new capability** |
| Unique components unlocked | 4 real screens/widgets (`SettingsPage`, `OnboardingPage`, `MessageLogView`, `PeerBatteryIndicator`) | 0 new components — `_openSettings` already constructs `SettingsPage`, itself blocked by Candidate A |
| Hidden subtree unlocked | Yes — each of the 4 components' own render trees, currently entirely unmeasured | No |
| Both apps benefit? | Yes, from one shared source | Yes, as an independently-duplicated pattern |
| One fix covers all measured sites? | Yes | Only the terminal-navigation-adjacent sites; `_bootstrap` uncertain (§10) |
| Schema impact | None expected (§6 traces entirely through existing `Symbols`/`AnalysisContextCollection` machinery) | None for extraction; the runtime capability question is orthogonal to schema |
| ADR impact | **None** (§6) | Likely, if pursued — a new runtime primitive is real architecture, not a mechanical extension |
| Analyzer impact | File discovery, analysis scope, symbol construction (3 identified chokepoints) | None beyond what already works |
| Compiler (N-pass) impact | Possibly none — routing/promotion already operate on symbols | None identified |
| Generator impact | `RawNodeEmitter`'s ours-vs-framework binary classification needs a third bucket | A new runtime-aware lowering, contingent on the runtime capability existing first |
| Runtime impact | None expected | **Required** — the actual blocking gap |
| Regression radius | Touches file discovery/analysis scope/symbol construction — broad but well-isolated, single-package behavior provably unchanged when no path dependency is walked | Narrow if attempted, but blocked on runtime work first |
| Likelihood of exposing additional blockers | Some — the 4 components' own render trees are entirely unmeasured (§12-style unknowns, but real, addressable ones) | Low, but moot until the runtime capability exists |
| Likelihood of `files emitted > 0` after the fix alone | **No** — the other co-dominator(s) still block | **No** — cross-package construction still blocks (`SettingsPage` itself) |

## 12. Dominator analysis

Candidate A and Candidate B remain **independent co-dominators after M8-D** — neither was resolved by
closing the enum-identity gap, and M8-D exposed no new P1. Neither now dominates the other; both are
still necessary. **Fixing Candidate A alone still leaves both apps blocked by mid-function navigation
(`_openSettings` itself pushes to `SettingsPage`, so even a fully-included `SettingsPage` component
doesn't help `_openSettings` emit until the navigation itself lowers) and by the remaining small gaps
(§13).** Fixing Candidate B alone (hypothetically, if the runtime gained the capability) still leaves
`SettingsPage`/`OnboardingPage`/`MessageLogView`/`PeerBatteryIndicator` unresolved. **Minimum remaining
root-cause set for either app to emit: {cross-package component construction, mid-function navigation
runtime capability, the small gaps in §13, and `_buildBody`'s switch}** — at least four, not two, once
the switch and small-gap dependencies are counted honestly (§13's own finding matters here).
Cross-package construction is source-level shared (`continuum_ui_kit`, one package, both apps);
mid-function navigation is a duplicated pattern, not a shared source.

## 13. Switch hidden-subtree check

Unchanged since M8-B/M8-C (no source touched): `_buildBody` is called from each app's `PairingPage
.build()` (`body: _buildBody(context)`), still opaqued as `"widget returned by a call"`. Its switch
covers 5 states (mac) to 7 (droid, adding `rationale`/`scanning`), each returning a distinct widget
subtree — real, substantial, and entirely unmeasured; resolving Candidate A or B would **not** expose
more of it (it is gated purely by the switch/method-call-inlining boundary M8-B already, correctly,
left alone) — no fabricated percentage is offered, consistent with M8-C's own §12 finding.

## 14. Small-gap verification

Freshly confirmed, all unchanged: `SwitchListTile` (droid, 1, full refusal), `ListTile.dense` (droid, 1,
partial), `DropTarget` (mac, 1, full refusal — third-party plugin, needs the catalog to model a non-SDK
package at all, a narrower question than Candidate A's program-assembly gap), collection spread (both
apps, 2 each), `null`-widget expression (droid, 1). **None has grown into a larger blocker than either
P1** — but per §12's dominator finding, they are **not free**: even after both P1s, these remain
independent, additional blockers to `files emitted > 0`, and must be recorded as part of the true
minimum blocker set rather than dismissed as negligible.

## 15. Silent-wrong-code audit

Inspected the newly-reachable paths from M8-D's own fix (the only source change since M8-B's own audit)
for dropped statements, missing props, bare unresolved identifiers, silently-omitted navigation, wrong
branch conditions, duplicated side effects/initializer evaluation, or a cross-package component rendered
without its own declaration. **No new silent-wrong-code finding.** Every failure mode traced in this
milestone produces an honest, named refusal (`BRG3006`/`BRG3013`/`BRG3001`/`BRG3002`, each pointing at a
real, specific gap) — 0 files are emitted for either app, so nothing generates *wrong* output; it
generates *no* output where it cannot yet be faithful. This matches every prior milestone's own finding
in this arc (M8-B's `ui.Cond.test` bug remains the only P0 found across M8-A through M8-E, already fixed).

## 16. ADR assessment

**Candidate A: no ADR required.** §6's live-implementation trace already answers the architectural
question with existing evidence — `PackageConfig` already resolves path-dependency roots, no existing
ADR forbids walking them, and ADR-17's own principle (never special-case a package by name) is a
constraint a generalized implementation satisfies, not a decision still open. M8-F for Candidate A can
proceed as an implementation milestone directly.

**Candidate B (mid-function navigation): would need architecture work first**, specifically an answer to
"how does the runtime kit represent 'wait until a pushed route pops, then resume'?" — genuinely new
runtime design, not decidable from today's evidence alone. Not selected for M8-F (see §17).

## 17. Selected M8-F target

**Cross-package component program assembly.**

Per the decision rule: no P0 was found (§15); Candidate A is a capability both apps need, with a
bounded, evidence-backed architecture (§5-6) rather than an unresolved question; it requires no schema
change and no ADR, where Candidate B would require both real runtime design and, likely, its own ADR;
and it unlocks substantially more real program structure (4 whole components' render trees) than
Candidate B's single-method unlock, which is itself gated behind Candidate A regardless (`_openSettings`
constructs `SettingsPage`).

**Exact acceptance criterion**: `bridge analyze`, given an app whose `bridge.json` resolves a `path:`
dependency, extracts `ui.Component` declarations for widget classes declared in that dependency's own
`lib/`, addressed by symbols that are package-qualified and collision-free against the referring
project's own symbols; `SettingsPage`, `OnboardingPage`, `MessageLogView`, and `PeerBatteryIndicator`
each produce a real `ui.Component`; the `BRG1304`/`BRG3001`/`BRG3002`("named arguments") diagnostics
for these four sites are eliminated in both Continuum apps; no `continuum_ui_kit`-specific (or any
other package-name-specific) branch exists anywhere in the implementation (ADR-17); single-package
projects (every existing fixture) are provably unaffected — full existing test suite green, no golden
regenerated for any fixture that declares no path dependency; `files emitted > 0` is **not** required
(§12's dominator finding — the remaining co-dominators and small gaps still block it).

## 18. Explicitly excluded work

Not part of M8-F: mid-function navigation / the runtime "await a pop" capability (Candidate B — deferred,
needs its own architecture scoping); `_bootstrap`'s uncertain independent status (§10 — left open, not
resolved); `_buildBody`'s `switch` (M8-B's own stop boundary, unchanged); `SwitchListTile`/`ListTile
.dense`/`DropTarget`/collection spread/null-widget (small, independent, unaffected by this decision);
`ui.Async`, `themeMode`, multi-hop promotion (M7-O, still independently deferred).
