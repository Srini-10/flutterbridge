# M7-D — Reality audit

**Date:** 2026-08-19. **Machine:** fresh clone, no prior Dart/Flutter toolchain installed
(`brew install --cask flutter` run this session). **Method:** every claim below was checked by
actually running the current `bridge_analyzer` / `bridge normalize` / generator / test suite against
this repository's HEAD (`fdaf173`) — not by re-reading a report. Where a number could be reproduced,
it was reproduced; where it could not, that is stated instead of copied.

This audit exists because M7-D and M7-E were reported to have run on a previous machine and never
committed. No trace of either — as documents, branches, stashes, or reflog entries — exists in this
repository. The working tree, however, already carried an uncommitted diff (6 files) matching exactly
what a real M7-D would produce: regenerated `hello_bridge` fixtures and two test files updated to
match. That diff is what this audit verifies, corrects, and (with M7-E) is committed by.

## 1. Previous claims reproduced

- **The `notifyListeners` erasure is real, and the working-tree fixture diff was correct.** A fresh
  `dart run bin/bridge_analyzer.dart --project fixtures/apps/hello_bridge` followed by
  `bridge normalize` was run independently in this session. Its output is **byte-identical** (sorted)
  to the pre-existing working-tree `hello_bridge.ndjson` and `.normalized.ndjson`. `notifyListeners`
  appears zero times in either regenerated file, versus one occurrence in each file at HEAD. The
  erasure is implemented in `dart/bridge_analyzer/lib/src/session/extract/statement_extractor.dart:79`
  (and the companion recognizer in
  `dart/bridge_analyzer/lib/src/session/adapters/adapter.dart:207` and
  `.../widget/flutter_adapter.dart:197-205`), citing ADR-4/ADR-20: a signal write already *is* the
  notification, so a bare `notifyListeners()` call is erased rather than carried through as an
  unresolved reference. **Correction to my own earlier statement in this session**: I initially told
  the user this claim was disproved, based on a source search that missed
  `statement_extractor.dart`. That search was wrong; the claim was right. Recorded here so the error
  doesn't propagate.
- **The N11 / declarative-route-argument gap is real**, and is the correct characterization of the
  M7-E blocker (§6 below has the full trace).
- **BRG3018 is the newer, more precisely-scoped diagnostic relative to BRG3013** — confirmed by git
  blame (`4b84267` then narrowed by `28a2753`) and by the diagnostic definitions in
  `packages/generators/react/src/internal/emit/diagnostics/codes.ts`.

## 2. Previous claims disproved

- **`screensOf` does not exist anywhere in this repository** (`grep -r screensOf` — zero hits across
  `.ts`/`.dart`). The root-render fallback the previous report described removing is real code, at
  `packages/generators/react/src/internal/emit/project.ts:361-376`, guarded by
  `routes.length === 0 && components.length === 0`. This fires for a genuinely single-screen program,
  or one whose route components all failed to emit — it is reachable, and nothing in the current
  pipeline (`pipeline.ts:342-360`) populates route/component screens unconditionally for every route.
  **The branch was not removed.** Deleting it on the strength of the original claim would have broken
  every single-screen generated app.
- **The corpus figures "7 of 11 navigation forms" and "244 of 267 corpus navigation occurrences" do
  not reproduce exactly.** See §5 — the real, current numbers are 6 of 11 and 249 of 270. The
  discrepancy is close enough in magnitude that it looks like a genuine prior measurement (not a
  fabrication), just not one this session can recover or match digit-for-digit — see §5 for the
  detailed reconciliation.
- **The exact framing "BRG3018 ×2 disappeared, BRG3013 increased"** could not be reproduced or
  refuted with available evidence. The generator's `codes.toEqual([...])` assertion in
  `generate.test.ts` checks code *presence*, not per-code counts, so there is no captured "before"
  count to diff against. What *is* directly measured: the analyzer-level `diagnosticCount` in
  `hello_bridge.manifest.json` dropped from 5 (HEAD) to 2 (regenerated) — but those are Dart-analyzer
  extraction warnings (BRG13xx-class), a different diagnostic population from the generator's BRG3018
  or BRG3013. The 2 current warnings are both `BRG1302` (a `throw` expression and a collection-`if`,
  neither with a UIR representation, both preserved as opaque). This claim is left as **unverified**,
  not confirmed and not disproved.

## 3. Golden/fixture drift — before and after

| Fixture | Was it stale? | What changed |
| --- | --- | --- |
| `hello_bridge.ndjson` / `.normalized.ndjson` | **Yes** | `notifyListeners` call erased from `FavoritesStore.toggleFavorite` (matches current analyzer); `app.Route`'s `arguments` field populated with `isDark`/`onToggleTheme` (matches `28a2753`); record count 31→36; 5 new `app.Token` nodes; `uirVersion` 1.4.0→1.5.0, `schemaHash` updated; analyzer `diagnosticCount` 5→2 |
| `hello_bridge.manifest.json` | **Yes** | Reflects the above: `recordCount` 31→36, `diagnosticCount` 5→2, `buildVersion` 0.0.1→0.1.0, `uirVersion`/`schemaHash` bumped |
| `counter.ndjson` / `.normalized.ndjson` | **No** — content verified byte-identical to a fresh regeneration | unchanged |
| `counter.manifest.json` | **Yes, but only metadata** | `schemaHash`/`uirVersion` bumped to match the current schema (1.4.0→1.5.0); `recordCount`/`diagnosticCount` unchanged (content was current) |
| `layout_proof.ndjson` | **No** | Has its own drift guard, `dart/bridge_analyzer/test/build_proof_test.dart` ("the committed build-proof golden is exactly what the analyzer produces"), which passed in this session's full `dart test` run. Audited, not assumed. |

## 4. Tests that were pinned to stale behavior

- `packages/generators/react/tests/action_params.test.ts` — `'no longer reports \`id\` as unresolved'`
  asserted `unresolved.some(m => m.includes('notifyListeners'))` is `true`. It is now `false`, matching
  the erasure. **Fixed as part of this diff.**
- `packages/generators/react/tests/generate.test.ts` — the `'the real hello_bridge document'` describe
  block's expected diagnostic-code list included `'BRG3018'`. With `app.Route.arguments` now populated
  and matching `LoginScreen`'s required params, the route is satisfied and BRG3018 no longer fires.
  **Fixed as part of this diff** (comment updated to point at this document instead of restating the
  old M6-C gap description as current).

Both fixes were verified, not just edited: `pnpm --filter @bridge/gen-react test action_params
generate` → 2 files, 74 tests, all passing, against the corrected fixtures.

## 5. Navigation legality — current, measured matrix

Re-measured against current source (`dart/bridge_analyzer/lib/src/session/adapters/route/
material_adapter.dart`, `packages/generators/react/src/internal/emit/statement.ts`,
`.../unsupported.ts`), corpus counts taken from `docs/m6/m6d-navigation-model-validation.md` §1 (the
same table `navigation_diagnostics.test.ts`'s `CALLS` array copies) and independently re-summed —
**135+62+15+6+6+2+23+21+0 = 270**, confirmed by direct read of that table.

| Form | Compiles today | Occurrences | Why / where |
| --- | :-: | -: | --- |
| `Navigator.pop` | **Y** | 135 | `statement.ts:211-212` |
| `Navigator.push` (inline route) | **Y** | 62 | `statement.ts:213-236`; analyzer `material_adapter.dart:343-370` |
| `Navigator.pushReplacement` (inline) | **Y** | 6 | same path as `push`, action `replace` |
| `Navigator.maybePop` | **Y**, with a caveat | 2 | maps to `NavigateAction.pop` identically to plain `pop` (`material_adapter.dart:353-354`, `navigationPop = {'pop','maybePop','popUntil'}` in `material_catalog.dart:267`) — **always pops unconditionally, discarding `canPop()` semantics**. No dedicated test exercises this distinction. |
| `showDialog` (inline `builder:`) | **Y** | 23 | same lowering path as `push` |
| `showModalBottomSheet` (inline `builder:`) | **Y** | 21 | same lowering path as `push` |
| `Navigator.pushNamed` | **N** — BRG3013 | 15 | no identity minted for path destinations; `unsupported.ts:391` |
| `Navigator.popUntil` | **N** — BRG3013 | 6 | analyzer emits `logic.Navigate{action:'popUntil'}`, but the generator's `default:` branch in `statement.ts:237-253` refuses it — modelled, not lowered |
| `Navigator.pushReplacementNamed` | **N** — BRG3013 | 0 | same path-identity gap as `pushNamed` |
| `Navigator.popAndPushNamed` | **N** — BRG3013 | 0 | `navigationActionOf` returns `null` for this method (`material_adapter.dart:364`) — never becomes `logic.Navigate` |
| `showMenu` | **N** — BRG3013 | 0 | recognized as an overlay opener, but its real signature has no `builder:` — nothing to extract |

**6 of 11 forms compile end-to-end today.** **249 of 270** corpus occurrences (135+62+6+2+23+21) are
covered; **21 of 270** (15+6+0+0+0) are not.

**On why this doesn't match "7 of 11" / "244 of 267" exactly**: the total (270) is a real, existing
number already in the repo (`docs/m6/m6d-navigation-model-validation.md`), and a second real
re-measurement in `docs/m7/m7b-transition-identity.md` puts `push` at 59 rather than 62 (a genuine
3-occurrence discrepancy between two prior corpus passes, not a copying error) — using that figure the
total is 265. **267 sits between the two real totals this repo already has on file (270 and 265)**,
and 244 sits within a few occurrences of both possible "compiles" sums depending on whether `maybePop`
is counted given its semantic caveat. One clean reconstruction that lands exactly on 7: swapping
`popAndPushNamed` (0 occurrences, easy to fold into "the pop family" and forget) for `onGenerateRoute`
(which does compile as of `71d9d93`/`f9a6c58`, and was not in the 11-form list the corpus table above
uses) yields exactly 7 compiling forms. This is circumstantial, not proof — the exact prior figures
could not be located or reproduced, and are recorded here as **unconfirmed**, not restated as fact.

## 6. Corpus measurements where applications are available

This repository contains exactly two analyzable applications: `fixtures/apps/hello_bridge` and
`examples/counter`. There is no multi-app corpus (`continuum`, `unichat`) checked into this repo —
those names appear only as citations inside `docs/m6/*` and `docs/m7/*` prose, sourced from work done
against applications that are not part of this repository. `just corpus` remains the confirmed M4 stub
(`justfile:94-96`, exits 1). Any corpus-scale claim in this document that cites continuum/unichat is
citing an existing committed doc's numbers, not a fresh measurement — flagged inline where used.

## 7. Remaining real blockers

| Blocker | Layer | Diagnostic | ADR/schema change needed? | Blocks hello_bridge? | Blocks continuum/unichat (per existing docs)? | Recommended next milestone |
| --- | --- | --- | --- | --- | --- | --- |
| Declarative `app.Route.arguments` invisible to `nav-graph`/N11 | compiler (`nav_graph.ts`), pass N11 | Generator emits `UnsupportedCapability` when a declarative route's argument reads state outside the rendered component's own reach (`pipeline.ts:308-324`) | **Open question — this is M7-E2's subject**, not yet decided | Not currently — `LoginScreen`'s args happen to resolve without triggering this path (see §6 of the M7-E note below) | Unmeasurable here (no corpus) | M7-E2 (architecture decision, no implementation) |
| `pushNamed`/`pushReplacementNamed`/`popAndPushNamed` — no destination identity for path-based navigation | analyzer (route identity) | BRG3013 | Likely needs the analyzer to mint identity for named/path routes the way it does for inline `MaterialPageRoute` — no ADR blocker identified, an implementation gap | No (hello_bridge uses none of these) | Yes — 15+0+0 = 15 real occurrences per M6-D | future navigation milestone, not M7 |
| `popUntil` — schema models it, generator doesn't lower it | generator (`statement.ts` default branch) | BRG3013, explicitly named "modelled, not lowered" | No — pure generator implementation gap | No | Yes — 6 occurrences | future navigation milestone |
| `maybePop` collapses to unconditional `pop` | analyzer (`material_adapter.dart`) | none — silently drops `canPop()` semantics | Possibly — depends whether `canPop()` gating is worth modelling | No (not used) | Unmeasured, 2 occurrences per M6-D | worth a diagnostic at minimum; not urgent |
| `showMenu` has no `builder:`-shaped real signature | analyzer catalog | falls to BRG3013 via no extraction | No — catalog fix | No | Measured at 0 occurrences | low priority |
| Prop-drilled callback through a *second* component hop is not promoted by N11 | compiler, pass N11 | none currently — silently left unstripped, no diagnostic and no failure observed in this fixture only because the destination component's params still happen to match | Related to, but distinct from, the M7-E2 question | Present but latent in hello_bridge (see §6) — did not fire a diagnostic in this run because it doesn't need to reach outside-component state | Unmeasured | Worth flagging for M7-E2's evidence base; not itself a blocker today |

## 8. Recommendation: should M7-E/M7-E2 proceed?

**Yes.** The core M7-E finding — that N11 cannot see or promote a declarative route's own
`app.Route.arguments`, because `nav-graph` (the analysis N11 requires) is built exclusively from
`app.RouteTransition` nodes — reproduces exactly as described, and is *independently confirmed by the
generator's own source*: `pipeline.ts:308-324` contains a diagnostic message that names this precise
gap (quoted in full in the M7-E note). This is not a reconstruction from stale memory; it is current,
live code describing its own limitation. The architectural question M7-E2 exists to answer — whether
N11 may also own rewriting the destination component's interface — is real, unresolved, and
unaffected by any of the corrections in §§1-2 above.
