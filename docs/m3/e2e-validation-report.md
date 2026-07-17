# End-to-end validation & release-readiness report

> **RESOLVED (M3-D, 2026-07-18):** every blocker below — **B1** (child-slot mismatch), **D1** (`'use client'`
> placement), **D2** (missing kit imports), and the **false-green build-proof** — is fixed at its root cause
> with regression tests, and the pipeline is now genuinely end-to-end for the supported surface. See
> [m3-release-readiness.md](m3-release-readiness.md). This report is kept as the record of what the
> validation found.

**Date:** 2026-07-18. **Scope:** validate the existing implementation end-to-end. No features added, no
schema changed, no generator logic modified. **Verdict: NOT release-ready** — one critical build blocker
(analyzer), two generator defects, and a generator surface too narrow to emit any real corpus app. The
analyzer/compiler half is solid and deterministic; the generator half does not yet produce buildable
output from *real analyzer input*.

## 1. What was tested, and how

The full chain was exercised stage by stage against every locally-available program. There is **no
`bridge generate`/`build` CLI command** (they are `BRIDGE-STUB(M2)` in `packages/cli/src/index.ts`) and
`just e2e` is a deliberate stub, so a host driver over the generator's public API (`reactGenerator.generate`,
ADR-22) was used to emit files, and `tsc --noEmit` typechecked them against the **real, unmocked**
`@bridge/runtime-react`. Per an explicit scope decision, the build check is **tsc-level**: `next build`
and browser runtime (hydration / React-console warnings) were **not run** (they need a network install of
Next and a browser this environment cannot drive; see §7).

**Corpus:** `fixtures/apps/hello_bridge` is the only committed app. `continuum` is **not present anywhere
in the repository**. Two throwaway probe apps were built to exercise stages hello_bridge cannot reach
(scratch only, not committed).

## 2. Compatibility matrix

| Program | Extract | Normalize (N1–N11) | Generate | tsc build | Runtime |
|---|---|---|---|---|---|
| **hello_bridge** (corpus) | ✅ 31 records, 5×BRG1302 | ✅ | ❌ 0 files — BRG3001 (MaterialApp, Scaffold), BRG3006 (notifyListeners), BRG3005 | — (nothing emitted) | — |
| **promo** (M3-C probe) | ✅ | ✅ **N11 promotes** | ❌ 0 files — BRG3008 (inline nav), BRG3002 (ElevatedButton `<unknown>`), BRG3005 | — | — |
| **minapp** (Center/Padding/SizedBox probe) | ✅ | ✅ | ✅ 9 files | ❌ **TS2559/TS2322** (child↔children), **TS2304** (EdgeInsets) | ❌ child dropped |
| **minapp2** (Column/Row/Text probe) | ✅ | ✅ | ✅ 9 files | ✅ **tsc exit 0** | not run (tsc-only) |

**The pipeline reaches a compiling React project only for programs restricted to `Column`, `Row`, `Text`.**
Every other path fails, and every failure is named by a diagnostic — nothing is silent.

## 3. Supported feature matrix (what actually works, end to end)

| Stage | Works | Evidence |
|---|---|---|
| Extraction | Stateless/StatefulWidget, signals/derived/actions/effects, stores, routes, **route transitions (M3-C)**, tokens, the full `logic.*` surface | hello_bridge 31 records; 205 analyzer tests |
| Normalization | N1–N11 including N11 cross-route promotion | promo app: N11 synthesizes `PromotedStore`, moves signal to `scope: store`, BRG2302 |
| Generation | `Text`, `Column`, `Row` → runtime components; route table; theme; providers; full Next.js App Router scaffold | minapp2 → 9 files, tsc clean |
| **Determinism** | identical UIR, NodeIds, diagnostics, generated files across runs | §5 |
| **Incremental** | per-file re-extraction; `incremental ≡ clean` byte-for-byte | §6 |

**Generator's mapped widget set (total): `Text, Column, Row, Center, Padding, SizedBox, ElevatedButton`.**
Of these, only `Text/Column/Row` produce output that typechecks from real analyzer input (see B1).

## 4. Failures — categorized, with reproducers, owners, and sizing

### B1 · CRITICAL blocker — single-child wrappers don't build · owner: **analyzer**

**Symptom.** A program using `Center`, `Padding`, or `SizedBox`-with-child generates code that fails tsc
and would drop the child at runtime.

```
src/components/home-screen.tsx: error TS2559: Type '{ children: Element; }' has no properties in common with CenterProps
src/components/home-screen.tsx: error TS2322: '{ children: Element; padding: any; }' not assignable to PaddingProps ('children' does not exist)
```

**Minimal reproducer.** `Center(child: Text('x'))` → analyzer emits `ui.Element{component: Center, children: [Text]}`
→ generator emits `<Center><Text/></Center>` → runtime `Center(props)` returns `props.child` and
`CenterProps` has no `children`.

**Root cause.** `widget_extractor.dart`'s `case 'child': children.add(...)` routes Flutter's `child:` into
`children`, **bypassing the catalog**, which declares `child` a **slot** for these widgets
(`Center/Padding/SizedBox: slots:["child"]`). The generator and runtime both expect the child in `slots`
(the runtime deliberately keeps `child` a prop, not React `children` — `basic.ts` header). So the analyzer
is the odd one out.

**Why it shipped.** `packages/generators/react/tests/build.test.ts` — "the build proof" — **hand-builds** a
UIR with the child in `slots` (its comment asserts *"the analyzer puts it in `slots`"*, which is false) and
typechecks that. **No test runs real analyzer output through generator + tsc**, so the discrepancy was
invisible. This is a false-green: the one test that claims to prove the pipeline compiles proves a
hypothetical UIR compiles.

**Fix.** Route `child:` through the catalog's slot classification in the widget extractor (put it in `slots`
when the catalog says so). Then the generator emits `child={<Text/>}` and everything lines up.
**Milestone: M3-D. Size: medium** — a few lines in `widget_extractor.dart`, but it changes the UIR shape of
every `child:` in the corpus, so it re-mints affected NodeIds and regenerates every golden; plus a real
build-proof test (below).

### B2 · CRITICAL gap — generator surface cannot emit any real app · owner: **generator + widget adapter**

**Symptom.** hello_bridge → 0 files: `MaterialApp`, `Scaffold` unmapped (BRG3001); `notifyListeners`
unhandled (BRG3006).

**Root cause.** M3-B's surface is 6 layout widgets. Real apps are built on `MaterialApp`, `Scaffold`,
`AppBar`, `TextField`, `ListView`, `FutureBuilder`, `Card`, `ListTile`, `Icon`, `IconButton` — none mapped.
This is by design (`BRIDGE-STUB(M3)` in the generator), not a regression, but it means **no committed
corpus app is generatable**. **Milestone: M3-D → M4. Size: large** (ongoing widget-coverage work).

### D1 · defect — `'use client'` after imports in component files · owner: **generator**

**Symptom.** Every `src/components/*.tsx` places `'use client';` *after* the import block, so it is not a
directive — it is an inert string expression. Presentational components survive (they become server
components); any component using a hook (`useSignal`, `useStore`, `useTheme`, `useRouter`) becomes a server
component and **throws at runtime under Next**. Not caught by tsc.

**Root cause.** `pipeline.ts:111` emits it via `module.line("'use client';")`, and `ModuleBuilder` always
renders banner → imports → body, so a body line lands after the imports. The scaffold files (`page.tsx`,
`providers.tsx`) build the directive manually and are correct; only the `ModuleBuilder` path is wrong.
**Milestone: M3-D. Size: small** — give `ModuleBuilder` a directive-prologue slot rendered before imports.

### D2 · defect — runtime value symbols referenced but not imported · owner: **generator**

**Symptom.** `<Padding padding={EdgeInsets.all(16)}>` → `error TS2304: Cannot find name 'EdgeInsets'`.
`EdgeInsets` **is** a real `@bridge/runtime-react` export; the expression emitter names it but never
registers the import.

**Root cause.** The `bind.*`/expression emitter lowers a Flutter value constructor to a runtime call
without adding the symbol to `ModuleBuilder`'s imports. **Milestone: M3-D. Size: small–medium** — import
tracking for runtime-symbol references in the value emitter.

### Lower-severity / by-design (named, not worked around)

| # | What | Category | Owner | Note |
|---|---|---|---|---|
| C1 | `notifyListeners` has no emission (BRG3006) | generator limitation | generator | store lowering incomplete; M3-D |
| C2 | Inline `Navigator.push` → BRG3008, no route emitted | by design (§A17.6) | generator | correct: it declines to invent a URL for an inline destination — a legalization decision. The M3-C transition is consumed correctly. |
| C3 | `ElevatedButton` present in `WIDGET_MAP` but promo hit `<unknown>` lowering (BRG3002) | generator limitation | generator | its child/onPressed lowering is incomplete; M3-D |
| C4 | 5× BRG1302 on hello_bridge (collection-`if` in a non-widget list, etc.) | analyzer — by design | analyzer | preserved as opaque per INV-4; not a bug |

## 5. Determinism — ✅ PASS

Three full pipeline runs (`analyze → normalize → generate`) on the same source produced **one distinct
hash at every stage**:

```
analyzer UIR (incl. NodeIds):  f9e06f9…  ×3   (identical)
normalized UIR:                f9e06f9…  ×3   (identical)
generated React files:         38d2532…  ×3   (identical)
```

Identical bytes ⇒ identical NodeIds and identical diagnostics. The generator is a pure function of the
program (ADR-22); the analyzer's ids are content/symbol-addressed with spans excluded.

## 6. Incremental — ✅ PASS

A two-file app (`main.dart` renders `Home`, which embeds `Panel` from `panel.dart`), built with `--cache`:

```
cold cache:        re-analyzed 2 file(s): lib/main.dart, lib/panel.dart
no change:         nothing changed; no file was re-analyzed
edit panel.dart:   re-analyzed 1 file(s): lib/panel.dart          ← only the changed file
incremental == clean (edited sources):  YES (byte-identical)
```

`Home`'s component id was unchanged by the `Panel` edit; only `Panel`'s subtree changed. This matches
`incremental_pipeline_test.dart` (8 tests, part of the passing suite). **Note:** incrementality is an
*analyzer* property — the generator is whole-program and re-emits every file each run.

## 7. What could NOT be validated (honestly)

- **`next build`** and a running server: needs a network install of `next@15.5.20` + `react@19.2.7` (and
  the generated app's `@bridge/runtime-react: workspace:*` dep resolved inside the workspace). Deferred by
  the scope decision; also `just e2e` is a stub (M4-T3, Playwright). tsc covers every module the generator
  actually writes (the emitted app imports only `react` + the kit, never `next`), so tsc is the strongest
  offline proxy — and it already fails on B1/D2.
- **Runtime execution, hydration warnings, React console warnings**: require a browser. Not run. Given D1
  (ineffective `'use client'`) and B1 (dropped children), a stateful app would not run correctly today
  regardless.

## 8. Blockers & critical bugs (release gate)

1. **B1** (analyzer `child`→`slots`) — generated code for single-child wrappers does not compile or render. **Blocker.**
2. **B2** (generator surface) — no real corpus app is generatable. **Blocker for any real deployment.**
3. **D1** (`'use client'` placement) — stateful components break at runtime under Next. **Blocker for interactivity.**
4. **Process gap** — the "build proof" test (`build.test.ts`) does not consume real analyzer output, so it
   cannot catch B1/D1/D2. **This is why they shipped.**

## 9. Recommended M3-D scope

1. **Fix B1** in `widget_extractor.dart`: `child:` → `slots` per the catalog. Re-mint affected NodeIds,
   regenerate goldens. (medium)
2. **Add a true build-proof test**: real Flutter source → real analyzer → normalize → generate → `tsc` in
   one test, over the widgets in scope. Replaces the hand-built `build.test.ts` fixture that false-greened
   B1. (small–medium)
3. **Fix D1** (`ModuleBuilder` directive prologue) and **D2** (import tracking in the value emitter). (small each)
4. **Fix C1/C3**: `notifyListeners` and `ElevatedButton` lowering. (small–medium)

## 10. Recommended M4 scope

- **Widget-coverage expansion (B2)**: `MaterialApp`, `Scaffold`, `AppBar`, `TextField`, `ListView`,
  `FutureBuilder`, `Card`, `ListTile`, `Icon`, `IconButton` — enough to emit hello_bridge, then a real
  third-party app.
- **The `bridge build` CLI command** and **`just e2e`** (Playwright): `next build` + serve + assert no
  hydration/console warnings — the browser-level checks this pass could not make.
- **Golden corpus** (`just corpus`, currently a stub): committed real apps run through the whole pipeline in CI.

## Appendix — reproduction

All probe apps and outputs are in the session scratch area. Each stage:
`dart run dart/bridge_analyzer/bin/bridge_analyzer.dart --project <app> --out u.ndjson` →
`node packages/cli/bin/bridge.mjs normalize u.ndjson --out n.ndjson` → generator via
`reactGenerator.generate` over an NDJSON-derived `ProgramView` → `tsc --noEmit` against
`@bridge/runtime-react`. Nothing in the repository was modified by this validation.
