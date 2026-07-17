# M3 — Final Release Readiness Report

**Date:** 2026-07-18. **Milestone:** M3-D (integration hardening) closure. **Predecessor:**
[e2e-validation-report.md](e2e-validation-report.md) (found the blockers), which this closes.

## Verdict

**The supported surface is now genuinely end-to-end.** Every validated integration blocker is fixed at its
root cause, each with a regression test, and the whole chain — **Flutter source → analyzer → compiler
(N1–N11) → generator → `tsc`** — compiles against the real, unmocked runtime kit for programs built from the
M3-B widget surface. Output is deterministic and incremental. **Release recommendation: ship M3 as a
developer preview for the supported surface** (`Text`, `Column`, `Row`, `Center`, `Padding`, `SizedBox`,
component-scoped signals, routes, tokens). It is **not** ready for real applications — the surface is too
narrow to emit any real corpus app (`hello_bridge` still refuses), which is M4's work, not a defect.

## Resolved blockers

| # | Blocker | Root cause & owner | Fix | Verified by |
|---|---|---|---|---|
| **B1** | Single-child wrappers (`Center`/`Padding`/`SizedBox`) didn't build — generated `<Center><X/></Center>` against a kit `Center` that reads `props.child`; the subtree was dropped and `tsc` failed. | **Analyzer.** `widget_extractor.dart` had a hardcoded `case 'child'` that routed Flutter's `child:` into `children`, **bypassing the catalog**, which declares `child` a slot. | Removed the special-case; `child` now flows through the catalog's slot resolution like every other slot. The catalog stays the single source of truth — no per-widget code. | `extraction_test.dart` (Center/Padding/SizedBox → `slots.child`, never `children`); the real build-proof `tsc`. |
| **D1** | `'use client'` was emitted **after** the imports in component files — an inert string, so Next.js treats the file as a server component and any hook throws at runtime. | **Generator.** `ModuleBuilder` had no directive slot; the directive was appended as a body line, after the banner and imports. | Added a directive prologue to `ModuleBuilder`, rendered before the banner and every import (as the scaffold files already do by hand). | `build.test.ts` (`'use client'` is line 1, before any import), on real output. |
| **D2** | Generated files referenced kit value symbols (`EdgeInsets`) without importing them — `TS2304`. | **Generator.** The `logic.New` emitter wrote `EdgeInsets.all(16)` but never registered the import. | The expression emitter now registers the kit import automatically, decided from the type's **library** (`package:flutter/…`), not a hand-kept list. A user type is written as-is. | `build.test.ts` (`EdgeInsets` imported + used), on real output. |
| **Process** | The "build proof" (`build.test.ts`) **hand-built** a UIR with the child in `slots` — a program the analyzer never produced — so it green-lit forever while the real pipeline was broken (this is how B1 shipped). | **Test design.** No test ran real analyzer output through generator + `tsc`. | `build.test.ts` now consumes a **committed golden minted by the real analyzer** (`fixtures/uir/layout_proof.ndjson`), runs it through the real compiler (via the `bridge` CLI), generates, and `tsc`s. `build_proof_test.dart` pins the golden byte-for-byte to what the analyzer produces. Drift in either half fails a test. **No hand-built UIR remains in the build-proof.** | The two tests together; verified by construction (deleting the analyzer's `case 'child'` first made the guard fail, then the golden regenerate, then the build-proof pass). |

### The real build-proof, in one line

```
build_proof_test.dart:  Flutter source → analyzer → (asserts) fixtures/uir/layout_proof.ndjson
build.test.ts:          layout_proof.ndjson → bridge normalize (N1–N11) → generator → tsc  ✓
```

## End-to-end re-verification (M3-D Task 6)

| Check | Result |
|---|---|
| analyzer | ✅ 207 analyzer tests + 28 `bridge_uir`; `dart analyze --fatal-infos` clean; `flutter analyze hello_bridge` clean |
| compiler (N1–N11) | ✅ all TS tests; `bridge normalize` a no-op on the layout fixture (nothing to rewrite) |
| generator | ✅ 59 generator tests including the real build-proof |
| tsc | ✅ the emitted project typechecks against the real `@bridge/runtime-react` |
| deterministic output | ✅ 3× full-chain runs → one hash per stage (normalized UIR, generated files) |
| incremental | ✅ edit one widget → only that file re-analyzed; `incremental ≡ clean` byte-for-byte; single-child slot correct under incremental |
| identical hashes | ✅ (above) |

CI note: `lint:deps` / `verify:depcruise-negative` fail **only** because dependency-cruiser refuses this
machine's Node 25.9.0 (it supports `^22||^24||>=26`); unrelated to any M3 change and green on CI's Node.

## Remaining unsupported Flutter features (not blockers — M4 scope)

These are **coverage**, not integration defects. Each is named by a diagnostic; nothing is silent.

| Feature | Diagnostic | Owner |
|---|---|---|
| `MaterialApp`, `Scaffold`, `AppBar`, `TextField`, `ListView`, `FutureBuilder`, `Card`, `ListTile`, `Icon`, `IconButton`, … | BRG3001 (unmapped widget) | generator + widget adapter |
| `ChangeNotifier` stores — `notifyListeners` has no lowering, so a store makes a program un-generatable | BRG3006 | generator (store emitter) |
| Component-scoped **derived** getters (a getter over local state) | BRG3006 | generator |
| Inline `Navigator.push` destination → no URL invented (correct, §A17.6) | BRG3008 | generator (legalization, by design) |
| Interaction widgets (`ElevatedButton` onPressed flows, gestures) beyond the layout surface | BRG3002 (`<unknown>` lowering) | generator |
| Named-route resolution across files under **incremental** builds (route in a cached file) | BRG1308 | analyzer (route index) |

**Consequence, stated plainly:** no committed corpus app is generatable end to end today. `hello_bridge`
still refuses (MaterialApp/Scaffold/notifyListeners). The pipeline is proven on the supported surface via
the build-proof; widening the surface is M4.

## Recommended M4 scope

1. **Widget-coverage expansion** — `MaterialApp`/`Scaffold`/`AppBar`/`TextField`/`ListView`/`FutureBuilder`/
   `Card`/`ListTile`/`Icon`/`IconButton`, enough to emit `hello_bridge`, then a real third-party app. As each
   lands, add it to the golden corpus so the build-proof grows with the surface.
2. **Store & derived lowering** — `notifyListeners` and component-scoped derived (clears BRG3006), so
   stateful apps generate.
3. **`bridge build` CLI + `just e2e`** — the missing command that assembles generate → write → install →
   `next build` → serve, and the Playwright harness for the browser-level checks this pass could not make
   (hydration, React console warnings). The build-proof covers `tsc`; `next build` and runtime are M4-T3.
4. **Golden corpus in CI** (`just corpus`, currently a stub) — real apps through the whole pipeline, the
   build-proof pattern generalized: real analyzer output, no hand-built UIR.

## What M3-D deliberately did not touch

No new widget coverage, no schema change, no architecture redesign. The generator's slot/prop contract and
the runtime kit were already correct and consistent; the only change on the generator side was the two
emission defects (D1, D2) and the build-proof. The B1 fix was one deletion in the analyzer, letting the
catalog decide — which is where the fix belonged.
