# M7-O — Phase 7 closure / reality audit

**Date:** 2026-08-20. **Baseline:** `bd44371` (== `origin/main` at the start of this audit, clean tree).
**Method:** every diagnostic and capability claim below was checked by actually running the analyzer,
normalizer and generator against this repository's HEAD — not by re-reading M7-A through M7-N's own
reports. Where a prior report's claim was reproduced, that is stated; where investigation found the
prior framing imprecise, the correction is recorded rather than silently folded in.

This is an audit-and-decision milestone, not an implementation milestone. No `ui.Async` decomposition,
multi-hop provenance analysis, or `themeMode` runtime wiring was implemented here. One diagnostic-wording
defect was found and fixed (§8); no other source change was made.

## 1. Commit / hash baseline

- `HEAD` and `origin/main` were both `bd443718bbfade58b8859bdd698fdb52eb7a72cc` at the start of this
  audit, tree clean. This is M7-N's own final commit — confirmed, not assumed.

## 2. Fresh hello_bridge diagnostic table

Ran fresh: `bridge analyze` → `bridge normalize` → `bridge generate --lang react`, no reliance on any
committed golden.

| Diagnostic | Count | Source construct | Owning layer | Intentional |
|---|---|---|---|---|
| `BRG2103` | 1 | FutureBuilder's `builder:` callback body (`items_repository.dart` future read), a multi-statement closure | N3 (`expand-builders`, normalize) | Yes — extraction opaques any multi-statement widget-building closure; not FutureBuilder-specific |
| `BRG2104` | 1 | Same `ui.Async` node — has neither `loading` nor `error` populated | N4 (`normalize-async-ui`) | Yes — N4 is explicitly a verification-only pass today; decomposition is documented future work |
| `BRG2305` | 4 | `isDark`/`onToggleTheme`, two boundaries (root→LoginScreen, LoginScreen→HomeScreen) × two report sites each (case-4 forward + outbound-hazard) | N11 (`promote-cross-route-state`) | Yes — single root cause, see §4 |
| `BRG3007` | 1 (generator rollup) | The same `ui.Async` node reaching the generator | React generator (`emit/component.ts`) | Yes — refuses to invent a spinner/error state |
| `BRG3013` | 2 | `isDark`/`onToggleTheme` at the root route and at the LoginScreen→HomeScreen push | React generator, citing N11/ADR-11 | Yes — same single root cause as the `BRG2305`s |
| `BRG3016` | 1 | `MaterialApp.themeMode: _isDark ? ThemeMode.dark : ThemeMode.light` | React generator (`emit/app_root.ts`) | Yes — see §5; wording fixed in §8 |
| `BRG3005` | 1 (rollup) | "4 error(s) (BRG3007, BRG3013, BRG3016)" | React generator | Rollup only, not a distinct capability gap |

Generator result: 4 unique error codes, 5 error lines, 0 files emitted — **byte-identical to M7-N's own
final report**. No discrepancy was found between this fresh run and the M7-N record; nothing needed
investigating on that front.

## 3. ui.Async — measurement only

The schema (`packages/uir/schema/l2.json`, `UiAsync`) already carries `loading`, `error`, `data` as
separate optional `ui.Node` fields, plus `source` (the driving `Binding`) and `dataParam` — described in
the schema itself as "the normalized form of `FutureBuilder`... mechanically recognizable... which is what
lets N4 pattern-match rather than interpret." The schema was designed for this; nothing populates it yet.

N4 (`n4_normalize_async_ui.ts`, 50 lines) is self-documented as a **verification-only pass**: it checks
that a `ui.Async` has `loading` or `error` populated and reports `BRG2104` if not. The actual
loading/error/data decomposition is explicitly deferred, not attempted.

The deeper reason hello_bridge's specific FutureBuilder never reaches N4's expected shape at all:
extraction opaques any multi-statement widget-building closure — including a named callback like
FutureBuilder's `builder:` — wholesale, as `ui.Opaque{reason:'builder body with statements'}`, **before**
N2/N4 ever see it. This is a general, pre-existing limitation (confirmed independently against a plain
`build()` method with a local variable before its `return`), not something specific to `FutureBuilder`.

**Conclusion: Category B (normalization work — N4's decomposition) + Category A-adjacent analyzer work
(structured multi-statement closure extraction) that the schema already anticipates but nothing
implements.** Not implemented in this milestone, per the explicit instruction.

## 4. Multi-hop promotion — audit, not implementation

Reproduced the exact case: `_isDark`/`_toggleTheme` live on `_BridgeAppState` (the application root, never
emitted — see §5). The root route passes them to `LoginScreen`; `LoginScreen` forwards them to
`HomeScreen` via `Navigator.push`.

Traced the raw UIR directly:

- The root `app.Route`'s `isDark` argument is `bind.Signal{signal:"36d5792cf2325285"}` — **fully
  resolved**, not the "case 4/forwarded" shape.
- The `app.RouteTransition` (LoginScreen→HomeScreen push)'s `isDark`/`onToggleTheme` arguments are
  `bind.Expr{expr: logic.Ref{name:'isDark', **no target field**}}` — genuinely untargeted references.
  This is the second hop, and it is unprovable exactly as ADR-11's amendment ("multi-hop") predicted.

The open question was **why the root route's own perfectly-resolved argument also fails to promote**,
producing its own `BRG3013`, given it is not itself a forwarded/case-4 reference. Read
`n11_promote_cross_route_state.ts` in full (609 lines) to answer this precisely:

N11 groups by (destination component, argument name) and requires "reaching-caller consensus" before
promoting. Once consensus holds, it runs one more check — `outboundHazard`
(`n11_promote_cross_route_state.ts:221-229`): does **this component itself** forward the same-named
argument onward via an unprovable (case-4) reference to any boundary it is the source of? For
`LoginScreen`/`isDark`, the answer is yes — `LoginScreen`'s own forward to `HomeScreen` is exactly the
unprovable reference found above. When `outboundHazard` is true, N11 reports a component-level `BRG2305`
and executes `continue` (line 244) — **conclusively confirmed by reading the loop body**: this skips the
`promote(verdict, ...)` call at line 250 entirely for this (component, name) group. Nothing else in the
pass promotes it by another path.

**This means hello_bridge's two `BRG3013`s (root route and LoginScreen→HomeScreen) and all four
`BRG2305`s are one single root cause, not two independent problems**: N11 conservatively refuses to
promote at the *first* hop specifically because it cannot prove the *second* hop's forward is safe —
removing `isDark` from `LoginScreen`'s declared interface would orphan `LoginScreen`'s own unprovable
forward to `HomeScreen`. Grouping these diagnostics together in this audit is justified by this code-level
finding, not assumed because they co-occur.

**Answering the mandated question directly: "Can the compiler prove `destinationParam ==
forwardedSourceParam` by structural identity today?" — No.** The missing representation is a `target`
field (or equivalent) on a `logic.Ref` that occurs inside a forwarding call's argument list, resolving it
to the *enclosing component's own parameter declaration* — the same kind of structural-identity work
M7-N did for store members (`Symbols`/`RawRef`-based resolution), not yet done for a component's own
parameters read back out into a further navigation call. The diagnostic's own wording ("a future,
whole-program provenance analysis") already names this correctly; M7-D/ADR-11's original framing is not
stale.

**Conclusion: Category B/C (analyzer-level structural-identity gap, already correctly documented as
future work under ADR-11's amendment). Not implemented in this milestone.**

## 5. themeMode — audit, not implementation

Traced `MaterialApp.themeMode: _isDark ? ThemeMode.dark : ThemeMode.light` end to end:

- **UIR**: the `themeMode` prop's binding is `bind.Expr{expr: logic.Conditional{test: logic.Ref{name:
  '_isDark', target:"36d5792cf2325285"}, then: ThemeMode.dark, otherwise: ThemeMode.light}}` — the
  `target` is **the same fully-resolved signal id** as the root route's `isDark` argument (§4). The app
  root's own read of its own signal is completely, structurally resolved. There is no "app-root state is
  unrepresented" problem for the signal itself.
- **Generator**: `packages/generators/react/src/internal/emit/app_root.ts` never looks at `themeMode`'s
  *value* at all. `reportAppRoot` iterates the app root's prop keys against a static table (`UNMODELLED`)
  and reports `BRG3016` unconditionally whenever the key `themeMode` is present — regardless of whether
  its value is a hardcoded literal or (as here) a fully-resolved conditional. **The entanglement with
  multi-hop hypothesized at the start of this phase does not hold**: BRG3016 would fire identically even
  if `_isDark` had never been forwarded to any child screen at all. This was investigated and disproven,
  not assumed — worth recording precisely because Phase 2's instruction warns against grouping unrelated
  diagnostics that merely co-occur in hello_bridge.
- **Runtime**: `packages/runtimes/react/src/internal/theme/theme.ts` defines
  `ThemeInstance.brightness: WritableSignal<Brightness>`, exposed by `useTheme()`
  (`packages/runtimes/react/src/internal/react/context.ts`), with working, tested usage
  (`theme.brightness.set('dark')` — exercised in `theme.test.ts`, `ssr.test.ts`, `react.test.ts`).

**Answering the mandated question directly: "Does FlutterBridge currently have a runtime concept capable
of switching between the already-derived light/dark token sets?" — Yes.** `theme.brightness` is exactly
that concept, and it already works, reactively, today.

**This means the diagnostic's original wording was inaccurate.** It read: "Owner: the runtime kit
(`ThemeProvider` resolves one brightness per tree; nothing switches it)" — the "nothing switches it"
claim is false. The actual gap is narrower and purely generator-side: nothing recognizes the
`themeMode:`-conditional-on-a-resolved-signal shape and lowers it into a call to the already-existing
`theme.brightness.set(...)` (e.g. via a signal-watching effect). Fixed in §8 — wording only, capability
unchanged, per the explicit instruction not to implement themeMode in this milestone.

**Conclusion: Category B (generator lowering gap, narrower than previously implied — but still not
implemented here, per instruction). Not a schema gap, not a runtime gap, not entangled with multi-hop.**

## 6. Corpus evidence

- **Continuum** (`/Users/srini/Zenthink/continuum`) is present in this environment — a real, unrelated
  Flutter/Dart project (macOS + Android via Flutter, `packages/ui-kit`). Searched its 49 non-test `.dart`
  files: **zero** occurrences of `FutureBuilder`/`StreamBuilder`, **zero** of `themeMode:`/`ThemeMode.`,
  **zero** `Navigator.push`/`pushReplacement`/`pop` calls, **zero** `extends ChangeNotifier`/
  `ValueNotifier`. This is genuine negative corpus evidence, not an absence of evidence — Continuum is a
  small, single-surface UI-kit demo without navigation or async-builder patterns.
- **unichat**: not present anywhere in this environment (checked `find` for the name; no match). Stated
  explicitly rather than substituted with a guess.
- Distinguishing the two claims this phase was asked to keep separate: **"used by hello_bridge"** —
  FutureBuilder, themeMode, and two-hop argument forwarding are all real, present in hello_bridge.
  **"Common in a measured real application"** — no evidence either way was obtainable in this
  environment; the one real corpus available (Continuum) uses none of these patterns, and no second
  corpus was reachable.

## 7. M7-A → M7-N achievement audit

Chronology, each independently spot-checked against current source (not copied from the milestone
docs) — sanity checks also confirmed `storeLifecycleCalls` in `catalog/widgets/material.json:53-59` and
`app.StoreInstance` in `packages/uir/schema/l3.json:476` (M7-N's own claims hold):

| Milestone | Capability claimed | Still valid? | Evidence |
|---|---|---|---|
| M7-A | `Navigator.pop` lowering | Yes | `emit/statement.ts:211-212` |
| M7-B | Transition identity (`logic.Navigate.transition`) | Superseded, not stale | `emit/statement.ts:213-236`; later closed by M7-G |
| M7-C | Conditional transition declarations | Yes (accurately negative — nothing shipped) | doc §8.6 |
| M7-D | Reality-audit matrix (pop/push/pushReplacement/maybePop/showDialog/showModalBottomSheet compile; pushNamed/popUntil/pushReplacementNamed/popAndPushNamed/showMenu do not) | Yes | `emit/statement.ts:211-253` `default:` still refuses the same set |
| M7-E3 | Route-argument promotion across component interfaces (N11) | Yes | `n11_promote_cross_route_state.ts` live, exercised in §4 |
| M7-F | Promoted-store consumption (`useStore()`, hook-hoisting) | Yes | reused verbatim by M7-N per its own doc |
| M7-G | Inline `Navigator.push` destination prop resolution | Yes | `pipeline.ts:320` `screenFor`, `:437` `componentScreens` |
| M7-H | Awaited terminal navigation | Yes | `statement_extractor.dart:165`; `async_push_guard_build.test.ts` (9 tests) |
| M7-I | `mounted` extraction only (generator lowering explicitly not yet done) | Superseded, not stale | closed by M7-J |
| M7-J | `mounted` lifecycle implementation (`useMounted()`) | Yes | `runtimes/react/src/index.ts:294`; `component.ts:169-172`; `expression.ts:446-455` |
| M7-K | Material theme-token completeness (Material3 fallback, 46 roles) | Yes | no counter-evidence found; not independently re-run this phase |
| M7-L | `Duration` / `Future.delayed(Duration)` | Yes | wired across generator + runtime, multi-file |
| M7-M | User-class construction — investigated, not implemented (docs only) | Correctly "not implemented" | its stated blocker (`FavoritesStore` BRG3002) closed by M7-N |
| M7-N | Local store instances + member identity, two-instance isolation | Yes | `l3.json:476`; `l1.json` `target` fields; `context.ts:189` `useLocalStore`; `local_store_build.test.ts` (5 tests) |

No `BRIDGE-STUB` marker anywhere in the navigation/mounted/Duration/store-instance code paths contradicts
any of the above; the only stub tags in the repo are pre-existing M2–M5 items unrelated to M7's claims.
The arc is coherent: each milestone's "remaining blockers" section correctly predicts the next
milestone's scope, and no claimed-closed capability was found regressed.

## 8. Diagnostic quality audit

Reviewed every diagnostic still firing on hello_bridge (`BRG2103`, `BRG2104`, `BRG2305`×4, `BRG3007`,
`BRG3013`×2, `BRG3016`, `BRG3005`) for: names the actual capability, names the correct owner, does not
blame user code, no stale corpus numbers, no semantics-changing workaround, no duplicate-root-cause
diagnostics.

- **`BRG3016` (themeMode) — defect found and fixed.** "Owner: the runtime kit... nothing switches it" was
  factually wrong (§5). Fixed in `packages/generators/react/src/internal/emit/app_root.ts`: owner is now
  attributed to the generator, and the message states plainly that the runtime already exposes a working
  `theme.brightness` signal. This is a wording-only change — `themeMode` is still reported as an error,
  still not implemented, exactly as before.
- **`BRG3013`×2 — accurate, no fix needed.** Each names the correct boundary, the correct owner (N11 /
  ADR-11), states plainly that "the analyzer records the argument correctly," and does not suggest a
  semantics-changing workaround. The two instances are not a duplicate — they correctly name two distinct
  boundaries sharing one root cause (§4), which is legitimate, not redundant.
- **`BRG2305`×4 — accurate**, consistent with the N11 code read in §4.
- **`BRG3007`/`BRG2104` (ui.Async) — accurate**, correctly cross-reference each other and correctly
  refuse to invent a spinner/error state.
- **`BRG2103` — imprecisely worded for this case, but not clearly wrong enough to fix here.** Its message
  talks about "the collection it repeats over — including keying it (N9)," language written for
  `ListView.builder`/`for`-element opaquing. It also fires (via the same `/builder/i` regex) for
  FutureBuilder's `builder:` body opaquing, where "collection"/"keying" is nonsensical. Flagged as a
  latent wording gap for a future pass — not fixed in this milestone, since it is not the load-bearing
  claim any hello_bridge diagnostic depends on and touching it risks scope creep beyond the one confirmed
  defect above.
- **`BRG3005` (rollup)** — accurately lists unique codes, does not double-count.

## 9. Classification and decision

| Blocker | Category | Justification |
|---|---|---|
| `ui.Async` (FutureBuilder loading/error/data) | B (valuable, legitimately deferred) | Schema-ready; N4 decomposition and structured multi-statement extraction are real, scoped future work, already self-documented as deferred |
| Multi-hop argument forwarding | B/C (valuable, legitimately deferred; analyzer-level) | Requires the same class of structural-identity work M7-N did for store members, not yet done for a component's own parameters; already correctly named by ADR-11's amendment |
| `themeMode` | B (valuable, legitimately deferred; generator-level, narrower than believed) | Runtime primitive already exists; gap is a specific recognize-and-lower generator capability. Diagnostic wording defect (D) found and fixed — the capability itself stays deferred |

No blocker falls into Category A (required for the documented developer-preview surface) or D as a
capability defect (only the wording was defective, and that is fixed). Per the milestone's own decision
rule, only Category D capability defects automatically justify more M7 implementation work, and none was
found.

**Recommendation: OPTION 1 — CLOSE M7.**

## 10. CI / determinism / browser results

- `just ci`: **green**, exit 0. 269/269 Dart tests (bridge_uir + bridge_analyzer), all TS package
  builds/lints (`lint:deps`, `lint:stubs`, `lint:portability`, `verify:depcruise-negative`), `dart
  analyze --fatal-infos` clean on both Dart packages, `flutter analyze` on hello_bridge clean. (The usual
  `analysis_options.yaml` side-effect from `flutter analyze` was reverted via `git checkout --` before
  any commit, per established practice.)
- `just determinism`: **green**, exit 0. All 5 e2e fixtures (`counter`, `promoted-counter`,
  `inline-push-props`, `async-push-guard`, `local-store`) byte-identical across 3 complete pipeline runs
  each — UIR, normalized UIR, and emitted files all match, and `analyze+generate == build` holds for
  every fixture.
- Browser suite: not re-run — this audit made one diagnostic-wording change and no executable-behavior
  change, so no new browser proof is warranted per the explicit instruction not to add one unless this
  audit changes executable behavior. M7-N's own browser proof (production + development, Strict Mode,
  local-store) remains the most recent relevant evidence and was not invalidated by anything found here.

## 11. Final M7 closure recommendation

**M7 is complete. No M7-P implementation milestone is justified by current evidence.**

Every remaining hello_bridge diagnostic traces to one of three well-understood, already-documented,
legitimately-deferred gaps (ui.Async decomposition, multi-hop structural-identity forwarding, themeMode's
generator-side lowering) — none of which is required for the documented developer-preview surface, none
of which represents a defect in an already-claimed M7 capability, and none of which this milestone
implements, per its own explicit instruction. The one defect found (§8, `BRG3016`'s wording) was a
diagnostic-accuracy issue, not a capability gap, and is fixed.

## 12. Exact next phase recommendation

No M7-P. If/when `ui.Async`, multi-hop forwarding, or `themeMode` are picked up, each is its own
independent milestone (they do not share a root cause, per §4/§5's explicit disentangling) — a future
milestone should be scoped to exactly one of the three, starting with whichever the product surface
actually needs next, not "whatever remains in hello_bridge."
