# M8-H — Write-nothing method / action extraction

**Date:** 2026-08-21. **Baseline:** `cc1e976` (== `origin/main`, clean tree, confirmed before any
change).

## 1. Baseline

```
git status --short   → (clean)
git rev-parse HEAD    → cc1e97689f5bde5f270dac4200b35b37fab9bddc
git rev-parse origin/main → cc1e97689f5bde5f270dac4200b35b37fab9bddc
```

Fresh `bridge_analyzer` + `bridge build` (not reused from M8-G's own written counts):

| | droid | mac |
|---|---:|---:|
| Analyzer errors | 0 | 0 |
| Analyzer warnings | 117 | 88 |
| Records | 208 | 191 |
| Normalize | fail: 1×BRG2305, 2×BRG2301 | fail: 1×BRG2305, 1×BRG2301 |
| Files emitted | 0 | 0 |

Identical to M8-G's own counts — no drift.

## 2. The real `onExportLogs` site

```dart
// pairing_page.dart:406 — _PairingPageState's own method
Future<String> _exportLogs() async {
  final dir = await getApplicationDocumentsDirectory();
  final stamp = DateTime.now().toIso8601String().replaceAll(':', '-').split('.').first;
  final file = File(p.join(dir.path, 'continuum-$stamp.log'));
  await file.writeAsString(_logBuffer.export(), flush: true);
  _log.info('exported ${_logBuffer.lines.length} log lines');
  return file.path;
}
...
onExportLogs: _exportLogs,   // :427 — a direct, zero-hop tear-off, inside _openSettings (which DOES write state later, so its own body is walked)
```

1. **Declaration:** `_PairingPageState._exportLogs`, `pairing_page.dart:406`.
2. **Owner:** `_PairingPageState` (the `State` half of `PairingPage`, a `StatefulWidget`).
3. **Parameters:** none.
4. **Return type:** `Future<String>`.
5. **Sync/async:** async.
6. **Body:** two `await`s (`getApplicationDocumentsDirectory()`, `file.writeAsString(...)`), string
   formatting, a `File`/`path` construction, a log call, a `return`.
7. **Modeled writes:** none — no `setState`, no assignment, no mutator call on anything bound as a
   signal.
8. **Non-modeled side effects:** file I/O (`getApplicationDocumentsDirectory`, `File.writeAsString` —
   platform-channel-backed), logging, reads an instance field (`_logBuffer`, not itself a signal),
   returns a computed value.
9. **Tear-off site:** `pairing_page.dart:427`, `onExportLogs: _exportLogs` — a bare method reference,
   inside `_openSettings` (an async method that *does* write `_featureStates` later in its own body, so
   its body is walked at all — §16).
10. **Destination parameter:** `SettingsPage.onExportLogs`, `final Future<String> Function()?
    onExportLogs;` — optional, nullable, `continuum_ui_kit/src/settings_page.dart:62`.
11. **Destination consumption:** `_SettingsPageState._exportLogs()` (a *different*, same-named method,
    `settings_page.dart:123` — real evidence for Phase 6's collision test, not a constructed one) calls
    `widget.onExportLogs`, wrapped in try/catch, awaits it, and shows a `SnackBar` with the result. This
    method *does* write (`setState(() => _exporting = ...)`), so it was already correctly modeled before
    M8-H.

Answering the checklist: writes no `sig.Signal` — yes. Writes no `app.Store` member — yes. Calls
services — yes (`path_provider`). Performs I/O — yes. Invokes another method — yes (`_logBuffer.export()`).
Awaits Futures — yes. Returns a value — yes. Throws — not itself (the *caller*, `_SettingsPageState
._exportLogs`, wraps the call in try/catch). Uses `BuildContext` — no. Navigates — no. Touches platform
APIs — yes. **Not empty, not trivial — genuinely meaningful application behavior with no reactive
write.**

## 3. Fresh UIR trace

Raw UIR (`dart run bin/bridge_analyzer.dart`, before any code change): `pairing_page.dart:406` produces
**zero nodes of any kind**. The `onExportLogs` argument binding is:

```json
{"expr": {"kind": "logic.Ref", "name": "_exportLogs", "span": {...}, "type": {"name": "Future<String> Function()"}}, "kind": "bind.Expr"}
```

No `target` field. 21 `sig.Action` nodes exist in the document; none corresponds to `_exportLogs`.
`_SettingsPageState._exportLogs` (the write-having sibling) *is* present, fully walked, symbol minted.

**WHERE identity disappears: candidate A — the method declaration never gets a symbol at all.**
Not B (there is no node, symbol-less or otherwise); not C (the reference extractor is not refusing
anything — there is nothing for it to resolve *to*); not D (no normalization pass runs before this,
extraction itself never produces the node); not E (irrelevant — nothing reaches the generator). Traced
directly to `dart/bridge_analyzer/lib/src/session/extract/signal_extractor.dart`'s two loops: the
1b naming pass required `_signalsWrittenBy(member, ...).isEmpty` to be false before minting a symbol at
all, and loop 2's emission required the same before walking the body. `_exportLogs` satisfies neither.
**M8-G's hypothesis is proven, not merely repeated.**

## 4. Reduction ladder

Built `fixtures/apps/action_probe/` (temporary — one `StatefulWidget` covering every rung, a
`ChangeNotifier` store, a top-level function, a same-name second class), pub-get'ed, `flutter analyze`
clean, run through the real `bridge_analyzer` before and after the fix. Deleted after evidence
extraction (§22); not part of the commit.

| Rung | Shape | Before | After |
|---|---|---:|---:|
| A | writes a signal | `sig.Action`, `writes` present | unchanged |
| B | write-nothing, empty body | invisible | `sig.Action`, `body: []` |
| C | write-nothing, calls another user method | invisible | `sig.Action`; the callee is *also* now visible |
| D | write-nothing, awaits `Future.delayed` | invisible | `sig.Action{isAsync: true}` |
| E | write-nothing, calls a service (I/O) — the motivating shape | invisible | `sig.Action`, real target from a tear-off |
| G | returns `Future<void>` | invisible | `sig.Action{isAsync: true}` |
| H | returns a primitive | invisible | `sig.Action` |
| I | zero params | (covered by B) | — |
| J | takes parameters | invisible | `sig.Action{params: [...]}` |
| K | tear-off to a same-component widget callback | resolved (name already in same-file scope) | unchanged |
| L | tear-off as a route argument — the real `onExportLogs` shape | invisible; **the entire enclosing `Navigator.push` was invisible too** (§16) | real `app.RouteTransition`, `logic.Ref.target == sig.Action.id` |
| M | invoked directly, never torn off | invisible | `sig.Action` (harmless — unreferenced, generator drops it, §7) |
| N | static method | invisible (excluded by `member.isStatic`, unconditionally) | **still invisible — boundary unchanged, verified not moved** |
| O | top-level function | not a class member; untouched by this pass either way | unchanged |
| Q/T | lifecycle (`initState`/`dispose`) | `sig.Effect` | unchanged — verified, not `sig.Action` |
| R | framework override (`build`) | **a genuine, pre-existing latent bug — see §9** | excluded by AST-node identity, not name |
| S | `notifyListeners()`-only store method | invisible | `sig.Action{body: []}` — `notifyListeners()` erased per INV-22, `writes` correctly absent |

Same-name collision (Phase 6, real evidence): `_ProbeScreenState._exportLogs` and `_OtherScreenState
._exportLogs` get distinct ids (`act:path#Owner.name`); `OtherScreen`'s own reference targets only its
own declaration.

## 5. Root cause

`_signalsWrittenBy(member, ...).isEmpty` gated **both** whether a method's name entered scope (1b) and
whether its body was walked and a `sig.Action` emitted (loop 2). This conflates two separate questions:
*does this method write reactive state* and *is this a callable unit of application behavior at all*.
`_exportLogs` is squarely the second without being the first.

## 6. Current `sig.Action` semantics

Read directly, not assumed. `packages/uir/schema/l3.json`'s `sig.Action` definition:
`required: ["kind"]` — **`writes` is not required.** Neither is `body`, `params`, or `isAsync`. The
generated Dart model (`dart/bridge_uir/lib/generated/uir.dart:1772`) has `writes` typed `List<NodeId>?`
— nullable, matching the schema exactly. `writes: []`/absent was already a legal document *before* this
milestone: N11's own `classify()` has a branch for exactly this shape — a targeted action reference
whose `writes` is empty resolves to `{kind: 'unpromotable', reason: 'no state that the compiler can
name'}`, reachable only if such an action could already exist.

The schema's own description text says more narrowly: *"A mutation of state — the normalized form of a
`setState` body or a store method."* ADR-4 (frozen, Spec v2.0 §2.1/§2.3): *"`setState` bodies become
actions."* Neither says *only*. Read together with §7's structural evidence (`required: ["kind"]`) and
N11's own pre-existing handling of an empty-`writes` action, this is answered as **B — the historical
discovery mechanism, not a deliberate part of the schema's semantic definition.** The doc comment
describes the *motivating* case (M0's own `setState`-lowering origin story), not an exclusion.

## 7. Are writes required by schema? By architecture?

**By schema: no** (§6, structural). **By architecture: no** — no ADR states `sig.Action` is exclusively
for state-mutating methods; ADR-4 states the *motivating* mapping, and N11's own pre-existing
`unpromotable, reason: 'no state...'` branch is direct evidence the architecture already anticipated a
write-nothing action existing, downstream of extraction ever producing one.

## 8. Selected discovery rule

**Option D**, in the form the codebase's own precedent already established: every ordinary instance
method of the class being extracted (a component's `State`, or a store) is named and walked — the
*same* domain write-discovery already used, extended to not require a write. This is not Option A
("all Dart methods") — it never leaves the one class currently being extracted; it is not Option B/C's
literal reachability analysis, because the codebase's own M4-G precedent (`signal_extractor.dart`'s own
comment: naming needed "its own pass, not a bigger loop," because bodies are walked *after* every
sibling name is bound) already rejected a reference-gated, two-pass discovery scheme for write-having
methods, for the identical reason it would be needed here: a tear-off can appear in an *earlier*
sibling's body, so discovery must be unconditional within the class, not conditioned on having already
seen a reference.

**Why broader alternatives were rejected:** Option A (every Dart method program-wide) has no bound at
all — SDK methods, unrelated classes, everything. Options B/C (explicit reachability) would need a
second extraction pass this codebase's own established architecture (one walk, ADR stated in
`extractor.dart`'s own header: *"Each unit is visited once… nothing is quadratic"*) does not otherwise
use anywhere, for a benefit (avoiding an unreferenced action in the document) shown to cost nothing
real: §9 confirms the generator already drops any unreferenced `sig.Action` — `declareLocalActions`
computes "only the actions the tree actually references," so an unused write-nothing helper produces
zero generated code, exactly as an unused write-having one already did before this milestone.

## 9. `build` — a real, pre-existing bug found and fixed as part of the same fix

Removing the `writes.isEmpty` gate without change would have also turned `build(BuildContext)` into a
`sig.Action` whenever `_signalsWrittenBy`'s recursive AST walk found *any* mutation anywhere inside the
render tree it returns (a `setState` inside an inline `onPressed:` lambda, walked regardless of nesting)
— duplicating the **entire render tree** as an inert, unreferenced action. Caught directly: `fixtures/
uir/layout_proof.ndjson`'s own committed golden had exactly this shape *before* M8-H — a 15,779-character
`sig.Action` at `build`'s own line, containing a second copy of the whole widget tree, present **only
because that fixture's `build` happens to contain an inline `setState` lambda**, which under the *old*
gate happened to give it a non-empty write set. This was already latent, unrelated to write-nothing
methods, and only surfaces once the same gate is touched for any reason.

Fixed by identifying `build` **once**, by AST-node identity (`identical(member, renderMethod)`), in
`ComponentExtractor` — which already computes exactly this via `_buildMethod(builder)` — and passing it
into `SignalExtractor.extract()` to exclude by reference, never by re-deriving the name `'build'`
independently. Verified: regenerating `layout_proof.ndjson` **removed** the duplicate (record count
27→26, one `sig.Action` removed, zero added net for this fixture specifically — `HomeScreen`'s only
action-shaped content was the spurious `build` copy) and the real generator + real `tsc` build-proof
(`build.test.ts`, 51/51) still passes against the corrected golden.

## 10. Method identity — analyzer vs. UIR

`package:analyzer`'s resolved element model gives `_exportLogs` full, standard element identity (a
`MethodElement`, declaring class, source location) — the same machinery every other declaration already
reads through. `Symbols` (`symbol_table.dart`) already has an `action(name, {required owner})`
constructor; M8-H's fix is exclusively about **when** it gets called, never about inventing a new
identity mechanism. Binding is entirely structural: `owner` comes from the resolved enclosing class
(`builder.namePart.typeName.lexeme`), never from a name search.

## 11. Framework-method exclusion — verified, mutation-tested

- **`notifyListeners`** (rung S): real fixture, `ProbeStore.announceNoWrite() { notifyListeners(); }` —
  becomes `sig.Action{body: []}` (`writes` correctly absent; the call itself is erased by the
  pre-existing, unchanged INV-22 mechanism — `MaterialCatalog.changeNotificationCalls = {'notifyListeners'}`).
  Not a regression: the *action* now exists (a genuine improvement — the store's own `app.Store.actions`
  list previously had no entry for it at all), but nothing about *what* it contains changed.
- **`setState`**: unaffected — always erased at the adapter level (`MaterialCatalog.stateBatchCalls =
  {'setState'}`), independent of whether the enclosing method becomes an action.
- **`dispose`/`initState`/`didUpdateWidget`/`didChangeDependencies`**: verified absent from `sig.Action`
  in the fixture, still `sig.Effect` — excluded by `registry.lifecycleMethods[name] != null`, checked
  *before* the (now-removed) writes gate in both loops, so removing that gate does not touch this
  exclusion at all.
- **`build`**: §9 — the one real risk found, fixed by AST-identity exclusion.
- Static methods: unaffected (`member.isStatic` excludes unconditionally, before any other check, in
  both loops — verified via rung N in the fixture: `staticNoWrite` remains absent).

## 12. Body representability

Every newly admitted action's body is walked through the same `expressions.bodyOf`/`bodyOf` path a
write-having action already used — there is no separate, weaker extraction path for a write-nothing
one. `_exportLogs`'s own body (awaits, a `File` construction, string interpolation) is **fully
representable** in the existing grammar; nothing in it required an opaque fallback. Where a method's
body *does* contain an unsupported construct (e.g. Continuum's own newly-walked bodies surfaced a `for`
inside a non-widget collection, adjacent string literals, a switch expression — §14), it is preserved
exactly as any other unsupported construct already is: `logic.OpaqueStmt`/`logic.OpaqueExpr`, reported
as `BRG1302`, never silently dropped. **A: action identity is fixed now; body representability is the
same, pre-existing, honestly-refused boundary this milestone did not need to touch** — no case in this
milestone's evidence needed B.

## 13. Async behavior

Verified directly: `_exportLogs` (rung E), `_delayNoWrite` (D), `_returnsFutureVoidNoWrite` (G), and
`_open` (L) all correctly carry `isAsync: true`, unchanged from the pre-existing write-having path —
`member.body.isAsynchronous` is read the same way regardless of `writes`. M7-L's own behavior (await
preservation, async function generation) is untouched: nothing in this milestone's diff touches the
`isAsync` field, the body-statement extraction of `await`, or the generator's async-function emission.

## 14. Parameters / return values

Verified: `_withParamsNoWrite(String path)` (rung J) carries `params: [{name: "path", ...}]`, identical
shape to a write-having parameterized action. Return VALUES themselves are not separately modeled on
`sig.Action` (the schema has no `returns` field — the body's own `logic.Return` statement carries the
value, exactly as it already did for a write-having action that returns something, e.g. none in the
existing corpus were found to need this — `_returnsPrimitiveNoWrite`/`_exportLogs` both return values
via an ordinary `logic.Return`, extracted with no gap). No separate return-value gap was found or is
claimed; this milestone does not claim general function lowering beyond what an action already supported.

## 15. Tear-off identity — the motivating proof

Real evidence, both in the fixture and in fresh Continuum output. Fixture: `onExport: _exportLogs`
(`app.RouteTransition.arguments`) binds `logic.Ref{target: "0643ed02eae40d4c"}`, and
`_ProbeScreenState._exportLogs`'s own `sig.Action.id` is `"0643ed02eae40d4c"` — **identical**. Continuum
(fresh, post-fix): `onExportLogs: _exportLogs` binds `target: "3d770d38903ae9f5"`, resolving to the real
`sig.Action` at `pairing_page.dart:404`, `writes` absent. Same-name collision: `ProbeScreen._exportLogs`
and `OtherScreen._exportLogs` get distinct ids; each reference resolves only to its own declaration.

## 16. Cross-package behavior

Fresh Continuum evidence, no synthetic case needed: droid's post-fix document has 29 `sig.Action` nodes,
6 of them in `continuum_ui_kit` (a local dependency, M8-F), 3 of those write-nothing — previously
invisible, now correctly modeled with package-qualified symbols. No second package-identity system was
introduced; `Symbols.action`'s existing `owner`/`path` composition, unchanged, already produces a
correctly package-qualified symbol the moment it is called at all — M8-H's fix is entirely about *when*
that call happens, confirming Phase 13's expectation exactly.

## 17. Continuum before/after

| | droid before | droid after | mac before | mac after |
|---|---|---|---|---|
| Analyzer errors | 0 | 0 | 0 | 0 |
| Analyzer warnings | 117 | 120 | 88 | 91 |
| BRG2305 | 1 | **0** | 1 | **0** |
| BRG2303 | 0 | **1** | 0 | **1** |
| BRG2301 | 2 | 2 | 1 | 1 |
| Files emitted | 0 | 0 | 0 | 0 |

The 3 new warnings per app (§2/§14's checklist item 8, verified not alarming) are pre-existing, honestly
reported "no UIR representation" categories (`BRG1302` for a `for` inside a non-widget collection,
adjacent string literals, a switch expression; one `BRG1304` for a framework-only `AlertDialog` push) —
surfaced only because bodies that were previously entirely invisible are now walked. None are errors;
none are new categories; none silently drop anything.

**`onExportLogs`'s diagnostic is now honest.** Before: `BRG2305`, "forwards the source component's own
constructor parameter" — false; `_exportLogs` is not a parameter of anything. After: `BRG2303`, "closes
over no state that the compiler can name… an override must supply it" — true, and the correct refusal:
a write-nothing callback genuinely cannot be promoted into a store, because there is no state to
promote. **Total blocking-diagnostic count is unchanged (3 droid, 2 mac) — the acceptance criterion was
never "fewer diagnostics," it was "the diagnostic caused by the identity gap disappears, and nothing
unrelated changes unexpectedly," which is exactly what happened.** `diagnostics`/`platformSection`
(`BRG2301`) are completely untouched, confirming rule 6 (never weakened) — they were never related to
this gap (M8-G §2).

## 18. hello_bridge regression

Multi-hop diagnostics (`BRG2305` ×4 — `isDark`/`onToggleTheme`, direct + outbound-hazard) are **byte-
identical** before and after — confirmed by a fresh `bridge build` run, matching M8-G's own trace
exactly. Unaffected, as expected: genuine parameter forwarding is a different mechanism entirely.

Two write-nothing methods were previously invisible in hello_bridge's own source and are now real:
`FavoritesStore.isFavorite(int id)` (a pure query, no state to mutate) and `HomeScreen
._onFavoritesChanged()` (a `ChangeNotifier` listener callback whose body — `setState(() {})` — is empty
after INV-22 erasure). Both goldens (`hello_bridge.ndjson`, `.normalized.ndjson`, `.manifest.json`)
regenerated; `generate.test.ts`'s own tracked node-count assertion (an intentional drift guard, with its
own changelog comment convention) updated 84→85 with the same explanation. **Also found, unrelated to
this milestone**: the previously-committed `hello_bridge.ndjson`/`.manifest.json` were already stale by
an earlier, already-shipped schema/catalog change (confirmed: regenerating from the *original*,
unmodified `signal_extractor.dart` against current `main` already produces a different `schemaHash` and
`diagnosticCount` than what was committed) — pre-existing drift, not introduced here, corrected as a
byproduct of this regeneration.

**Separately found, real, adjacent generator-naming gap** (not fixed, per scope — comparable to M8-F's
function-prop `unknown` finding): `nameOfSignal`'s human-readable-name recovery (`packages/generators/
react/src/internal/pipeline.ts`'s `nameIndex`) searches the *whole* program for any named, targeted
`logic.Ref` pointing at a signal; a signal consumed *exclusively* as an unnamed `bind.Signal` widget
prop (`valueListenable: _ticks`, `focusNode: _emailFocus` in `layout_proof`'s own fixture — `_email`
is unaffected, because it is *also* read as `_email.text` elsewhere, which does produce a named ref) has
no named reference anywhere to recover, and falls back to its own documented third tier, `signal_<id
prefix>`. This was masked, accidentally, by the exact `build`-duplication bug §9 fixed: the spurious
copy of the render tree extracted the same construct through a different path that *did* preserve the
name. Removing the duplicate exposed the gap; it does not create it. Confirmed cosmetic only, not a
correctness regression: declaration and every read of it still agree, and the real `tsc` build-proof
(`build.test.ts`, 51/51, including its own real-`tsc` assertion) passes unchanged against the new names.
The two affected assertions were updated to match (`build.test.ts`), with the finding documented inline.

## 19. Schema / ADR decision

**SCHEMA CHANGE REQUIRED: NO** — confirmed structurally (§6), not assumed. `writes: []`/absent was
already legal; the fix is entirely in extraction's discovery rule.

**ADR REQUIRED: NO** — no existing ADR states or implies `sig.Action` is exclusive to state-mutating
methods (§6-§7); the change is a correction to a discovery heuristic, not a redefinition of what the
node kind means. The schema's own doc comment describes the motivating case, and stays true — every
`setState` body and every store method is still an action — it is simply no longer the *only* thing that
is.

## 20. Validation

- `dart analyze --fatal-infos` (bridge_analyzer): clean.
- `dart test`: 297/297 (one pre-existing test updated — §21).
- `pnpm --filter @bridge/gen-react exec vitest run`: 216/216 (two assertions updated for real, explained
  behavior changes — `layout_proof.ndjson`'s `build`-duplication fix, §9; `hello_bridge`'s node-count
  drift, §18).
- `just ci`: **exit 0**, full green (build, typecheck, test, codegen-check, lint, lint-negative,
  uir-lint, uir-test, analyzer-lint, analyzer-test, dart-analyze).
- `fixtures/apps/hello_bridge/analysis_options.yaml`'s `flutter analyze` auto-modification side effect
  reverted before commit, per established convention.
- `bridge validate` (determinism + fixed point) run on every fixture that reaches a successful build:
  `cross_package_app` (M8-F's own fixture, protected per Phase 17) — deterministic, fixed point holds,
  unaffected. `hello_bridge` still fails at normalize for its own pre-existing, unrelated reason
  (multi-hop), so `validate` cannot proceed past build for it — unchanged from before this milestone.
- `just determinism` (the heavy, `npm install`+`next build` e2e harness) not run — none of its 5 tracked
  apps (`counter`, `promoted_counter`, `inline_push_props`, `async_push_guard`, `local_store`) contain a
  write-nothing method this milestone's fix could affect, and each is independently, fully covered by
  its own real-analyzer-to-real-`tsc` build-proof test, already green in the `just ci` run above.

## 21. Newly exposed blockers

The 3 new per-app analyzer warnings (§17) name three already-known, already-categorized, unrelated
capability gaps, now simply visible in bodies that were previously invisible: `BRG1302` (`for` inside a
non-widget collection; adjacent string literals; a switch expression — the existing "no UIR
representation, preserved opaque" category) and `BRG1304` (an `AlertDialog` push — the existing
"framework API wrapped beyond reading" category, unrelated to navigation-lowering work). Neither is new
in kind; both were already tracked categories before M8-H. No new *root cause* was exposed — the
diagnostic *shape* Continuum needs next is unchanged: `BRG2303` (this milestone's own, now-honest
verdict for `onExportLogs`) and `BRG2301` (object-crossing-boundary, M8-G §2) remain the two blocking
categories, neither newly discovered here.

## 22. Exact M8-I recommendation

Neither of Continuum's two remaining blocking categories is this milestone's to solve, and neither
points at a single, narrow next fix the way M8-G → M8-H did:

- **`BRG2303`** (`onExportLogs`, now honestly diagnosed) asks for something this pass was never meant to
  provide — a way to supply a callback with no promotable state across a route boundary. Its own message
  says exactly what would resolve it: "an override must supply it." That is a real, separate capability
  (the override system referenced throughout N11's own comments), not an extraction gap.
- **`BRG2301`** (`diagnostics`, `platformSection`) asks the *application* to change — pass an id, load
  from it — which is arguably not a compiler gap at all (ADR-11a's own rule is doing its job correctly).

Given neither is a narrow "next chokepoint" the way this milestone's predecessor found one, the
recommended next step is not a single obvious M8-I target from this evidence alone — it is to decide,
as a genuine architecture question and not a bug hunt, whether the override system `BRG2303`/`BRG2303`'s
own message already gestures at is itself ready to be exercised for Continuum's real case, or whether
that decision needs its own M8-G-style measurement pass first.
