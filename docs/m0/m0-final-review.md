# Milestone 0 — Final Review, Spec Reconciliation, and Go/No-Go

**Date:** 2026-07-12 · **Task:** M0-T7 · **Status:** Milestone 0 closure document
**Decision: GO WITH CONDITIONS** (§7)

---

## 1. Executive summary

Milestone 0 did what a de-risk spike is supposed to do: it broke things cheaply, early, and on
purpose. Five throwaway artifacts (extractor, React reference, golden harness, compat report, plus the
scaffold) produced **four defect classes that would each have been expensive to discover during M2**,
and one of them — a cross-request state leak — would have been a security bug in production.

**The architecture held.** Six ADRs and eight spec amendments came out of M0, and **not one of them
changes the UIR schema**. Cross-route state promotion, Material colour derivation, SSR store scoping,
layout intent — all four were expressible in the frozen vocabulary. The IR was the thing most likely
to be wrong, and the evidence says it is not.

**What M0 could not do is prove the business case.** The Blueprint's own exit gate requires *"≥70 %
automatable on 2 real apps."* We ran the compat report against our own fixture and against an app we
wrote ourselves. That is grading our own homework, and it is the sole reason this is a conditional GO
rather than an unconditional one.

| Objective | Verdict |
| --- | --- |
| Extraction feasibility | **PASS** |
| Normalization feasibility | **PASS** (with N11 added) |
| React mapping feasibility | **PASS** |
| Golden testing feasibility | **PASS** |
| Compatibility reporting feasibility | **PASS** (format) / **PARTIAL** (evidence base) |
| Determinism | **PASS** |
| Architecture stability | **PASS** |
| Risk reduction | **PARTIAL** |
| Spec maturity | **PASS** (after v2.1) |
| **Blueprint gate: ≤5 % diff on a hand-converted screen** | **PASS** (VMR 0.25 %) |
| **Blueprint gate: ≥70 % automatable on 2 real apps** | **NOT MET — no real app was analyzed** |

---

## 2. Phase 1 — Issue register (all closed or explicitly deferred)

| # | Issue | Decision | Where |
| --- | --- | --- | --- |
| **ISSUE-1** | Cross-route callback / signal promotion | **Option 1 — normalization pass N11.** Target-neutral; every URL-routed target hits it identically. No schema change (`sig.Signal.scope` already exists). | **ADR-11**, A1 |
| **ISSUE-2** | Golden metric ambiguity (0.25 % vs 11.85 %) | **VMR is the single authoritative metric** (pixelmatch, YIQ 0.1, AA excluded, 3 % provisional). Colour correctness moves **out of pixels** into **VR-1 token parity**. Reports must never show one number. | **ADR-12**, A5 |
| **ISSUE-3** | Material 3 colour derivation | **Yes — N10 must emit derived roles.** Palette derived at compile time (`material_color_utilities`); composition (elevation, state layers) owned by the runtime kit. | **ADR-13**, A2 |
| **ISSUE-4** | Next.js 15 vs 16 | **Stay on 15 through M2**; advisory 16 canary from M2; re-decide at M3-T6. A scheduling decision, not a preference. | **ADR-16** |
| **ISSUE-5** | Analyzer version | **Pin `analyzer: 14.0.0` exactly.** Upgrades are their own PR against the G1 corpus. Dart stable (blocking) + beta (advisory) CI from M1-T7. | **ADR-14** |
| **ISSUE-6** | Route arguments carrying live objects | **MVP: diagnose (`BRG2301`), do not transform.** Auto-lowering to id + loader requires inferring identity and loader — **evidence insufficient, deferred** post-M2. | **ADR-11a** |
| **ISSUE-7** | Module-level singleton stores | **Forbidden in output (INV-19), rewritten by the generator (provider-scoped), store reads are client-scoped, linted at source (M6).** The one place we deliberately refuse fidelity — a faithful translation here is a security bug. | **ADR-15** |
| **ISSUE-8** | Theme generation ownership | Palette = **compile time**. Composition = **runtime kit**. INV-20: no literal colours in generated code. | **ADR-13**, A2 |
| **ISSUE-9** | Layout boundedness sufficiency | **Analysis is the right home, but insufficient as specified.** Extended to emit `widthIntent`/`heightIntent` per node. **No new pass.** Measured tier stays post-MVP. | **A3** |
| **ISSUE-10** | Compatibility band criteria | Formalized: High / Medium / Low, descriptive, no numeric score; must distinguish *compiler gap* from *browser gap*. | **A7** |
| **ISSUE-11** | Unknown construct policy | Six-status taxonomy (Supported / Partial / Experimental / Deprecated / Unsupported / Unknown), held as catalog data. **Unknown is a statement about our catalog, never about the construct.** | **A8** |

---

## 3. Phase 2 — Validation of every M0 assumption

| # | Assumption (task) | Verdict | Rationale |
| --- | --- | --- | --- |
| 1 | TypeScript pinned to 5.9.3, not 7.x (T1) | **Accepted** | api-extractor 7.58.9 tracks TS 5.9; api-extractor is load-bearing for §1.3 API locking. |
| 2 | `tsconfig.depcruise.json` at repo root (T1) | **Accepted** | Tool constraint only. No rule weakened. |
| 3 | `melos.yaml` deferred to M1 (T1) | **Accepted** | It has no packages to manage until `bridge_analyzer` exists. Now due at M1-T7. |
| 4 | `packages/generators/tokens` reserved, unscheduled (T1) | **Modified** | Still unscheduled — but ADR-13 makes tokens a **first-class UIR artifact**, so `gen-tokens` becomes cheap when scheduled. Note recorded; no milestone assigned. |
| 5 | "flutter run -d chrome" verified as build + render (T2) | **Accepted** | Superseded by M0-T5, which drives the real app in Chromium. |
| 6 | Spike code lives in `spikes/`, not `dart/` (T3) | **Accepted** | Kept throwaway code out of production trees. All four spikes are disposable on schedule. |
| 7 | Adapted to analyzer 14 rather than downgrading (T3) | **Accepted** | Produced ADR-14. Downgrading would have yielded misleading fidelity data. |
| 8 | `pub get` is a prerequisite; broken env → exit 3 (T3) | **Accepted → promoted to a rule** | F6 showed a missing element model degrades **silently**. Now INV-5's concrete form; both spikes implement it. |
| 9 | Kit uses CSS custom properties, not Tailwind (T4) | **Accepted for the spike** | The kit absorbs styling, so **generated TSX is identical either way**; the G2 reference is unaffected. The styling pipeline is M2-T16's call. |
| 10 | `/home` placeholder is not reference output (T4) | **Accepted** | Correctly excluded from the golden diff. |
| 11 | Next 15 pin (T4) | **Accepted → promoted to policy** | ADR-16. |
| 12 | Only `login` is comparable (T5) | **Accepted** | Diffing a real screen against a placeholder would produce a meaningless number. Home becomes comparable at M2. |
| 13 | Playwright Chromium for both apps (T5) | **Accepted → promoted to the determinism contract** | "Identical browser" is now a fact, not a hope. |
| 14 | React captured from production build (T5) | **Accepted** | Dev overlays would land in goldens. |
| 15 | Flutter interaction is coordinate-driven (T5) | **Accepted, flagged** | Canvas has no DOM. Fragile by construction; the semantics-tree verifier (M4) needs a plan — recorded as **R13**. |
| 16 | Headline metric = pixelmatch t=0.1 (T5) | **REJECTED** | This is the defect ADR-12 exists to fix. Superseded by VMR + VR-1 + mandatory plural reporting. |
| 17 | Baselines committed as evidence (T5) | **Accepted** | They are the M0 evidence artifact. |
| 18 | App A analyzed in place, not copied (T6) | **Accepted** | Duplicated fixtures drift. |
| 19 | **App B is synthetic** (T6) | **Modified → becomes a GO condition** | We chose both the constructs *and* the catalog that recognises them. The Blueprint's ≥70 % gate cannot be answered with it. → **Condition C1**. |
| 20 | Verdict bands descriptive, not numeric (T6) | **Accepted → formalized** | A7. |
| 21 | The "partial" catalog reflects my judgment (T6) | **Modified** | Now governed by the A8 taxonomy; catalog status is data, and changing it is a product decision, not a developer's guess. |

---

## 4. Phase 3 — Milestone objectives, scored

**Extraction feasibility — PASS.** 38 widget nodes, **0 opaque of 93** on `hello_bridge`; resolved
types identified widgets without touching the churn-prone Element API (F7); `FutureBuilder` and
`ListView.builder` resolved into exactly the shapes N4/N3 assume, so those passes can *pattern-match*
rather than interpret. Caveat: 0 % opaque measures the fixture, not the world.

**Normalization feasibility — PASS (with N11).** The pipeline survived contact: N2/N3/N4/N6/N10 all
had precisely the input they were designed for. One genuine gap (ISSUE-1) → one pass added. A
normalization pipeline that needed **one** addition after four spikes is a healthy pipeline.

**React mapping feasibility — PASS.** `next build` green; the reference renders; **both layout defects
were fixed in the kit without touching `login-screen.tsx`** — ADR-6 paying for itself on day one.

**Golden testing feasibility — PASS.** Both apps captured **byte-identical across two independent
passes**. Every determinism axis pinned and *measured*. The metric ambiguity was a specification gap,
not a harness failure, and it is closed.

**Compatibility reporting feasibility — PASS (format) / PARTIAL (evidence).** The format works: it
separated "gap in our compiler" from "gap in the browser," and independently rediscovered ISSUE-1. But
it has never been pointed at a codebase we did not write.

**Determinism — PASS.** All three tools deterministic: extractor byte-identical across runs; goldens
byte-identical across passes; compat report byte-identical across three runs. The discipline is real
before the compiler exists, which is the only time it is cheap to establish.

**Architecture stability — PASS.** Six ADRs, eight amendments, **zero UIR schema changes**, zero
rewrites of frozen structures. Every fix landed inside the existing vocabulary.

**Risk reduction — PARTIAL.** R2 (layout) and R6 (analyzer churn) both **materialised immediately**, as
predicted — the register was right, which is reassuring, but they are now concrete costs rather than
hypotheticals. R3 (signal lowering) gained hard evidence (writes via method calls). New risks R10–R13.
Net: better understood, not smaller.

**Spec maturity — PASS after v2.1.** Every open question from four spikes is closed or explicitly
deferred with cause.

---

## 5. Phase 4 — Remaining gaps

### Must resolve **before** M1 proceeds past M1-T7

| Gap | Why it blocks |
| --- | --- |
| **C1 — Real-application evidence** | The Blueprint's own go/no-go metric (≥70 % automatable) is unmeasured. The compat tool exists and the run is cheap. **Must complete within week 1 of M1**, before M1-T8 (widget extraction catalog), so the catalog is shaped by real data rather than by our own fixtures. If the ratio is materially below 70 %, **re-gate**. |
| **C2 — Adopt v2.1** | ADRs 11–16 and amendments A1–A8 are inputs to the M1-T2 schema (token role set, promoted-store origin, route diagnostics). Adopted by this document. |
| **C3 — Pin the analyzer, add the beta CI job** | ADR-14. Cheap, and R6 has already fired once. |

### May resolve **during** M1 (already scheduled, now evidence-backed)

- **F2** — `sig.Action.writes` must include mutations via **method calls** on state-owned collections, not just assignments (M1-T9). *This is the highest-value M1 fix: an assignment-only analysis yields an empty dependency-edge set, i.e. generated React state that never updates.*
- **F3** — store subscription (`addListener` + empty `setState`) is a **reactivity edge, not an action** (M1-T9).
- **F4** — `Future`-typed `initState` assignment is a `UIAsync` source, not a mount effect (M1-T8/T9).
- **F5** — slot-vs-prop decided by `correspondingParameter` type; positional arg names from the same API (M1-T8).
- **N10 role derivation** — the `material_color_utilities` dependency and derived-token emission (M1-T10).

### Future milestones

- Measured layout tier (post-MVP; A3).
- Route-object auto-lowering (post-M2; ADR-11a — *evidence insufficient*).
- VR-1 mechanism choice (M4-T1).
- Hermetic Flutter reference build (M4-T2; M0-T5 F4).
- Network stubbing for the Home golden (M4; M0-T5 F8).
- Flutter semantics-based interaction for the DOM verifier (M4; R13).

---

## 6. Updated risk register

| # | Risk | Status after M0 | Evidence |
| --- | --- | --- | --- |
| R1 | Extraction fidelity | **Reduced** — 0 opaque on the MVP subset | M0-T3 |
| R2 | Layout fidelity of the CSS tier | **Materialised, contained** — loose constraints are not expressible in CSS; fixed in the kit, owned by A3 | M0-T4 F-layout-1 |
| R3 | Signal→hooks lowering correctness | **Sharpened** — `writes` via method calls returns an empty edge set | M0-T6 F2 |
| R4 | Determinism erosion | **Reduced** — measured in all three tools before any compiler exists | T3/T5/T6 |
| R5 | Golden flake | **Reduced** — byte-identical across passes | M0-T5 |
| R6 | Dart/analyzer churn | **Materialised** — analyzer 14 AST redesign, day one | M0-T3 F8 → ADR-14 |
| R7 | Override/sync model | Unchanged — untested until M6 | — |
| R8 | Incremental cache unsoundness | Unchanged — untested until M5 | — |
| R9 | Two-language velocity drag | **Reduced** — the TS and Dart tracks never blocked each other in M0 | — |
| **R10** | **Material role derivation fidelity** — our reproduction of Flutter's `ThemeData` defaults may diverge | **New.** Mitigation: VR-1 catches it in data, not pixels. | M0-T5 F1 → ADR-13 |
| **R11** | **Real-app evidence gap** — the automation ratio is unmeasured on any codebase we did not write | **New. This is the gating risk.** Mitigation: condition C1. | M0-T6 |
| **R12** | **VMR threshold is provisional** — calibrated against a defect (system fonts, wrong colours) | **New.** Mitigation: re-calibrate at M2-T12. | M0-T5 → ADR-12 |
| **R13** | **Flutter reference is canvas-only and non-hermetic** — coordinate-driven interaction; CanvasKit + Roboto fetched from CDNs | **New.** Mitigation: M4-T2/T3. | M0-T5 F4, F7 |

---

## 7. Acceptance matrix and Go/No-Go

| Blueprint M0 exit criterion | Result | Status |
| --- | --- | --- |
| Go/no-go memo signed | This document | ✅ |
| Golden harness exists, deterministic | Byte-identical ×2 passes, both apps | ✅ |
| Hand-converted login screen ≤ 5 % diff | **VMR 0.25 %** | ✅ |
| Compat report runs on 2 apps | Runs on 2; **neither is a real third-party app** | ⚠️ |
| **≥70 % automatable on 2 real apps** | **Unmeasured** | ❌ |
| Architecture survives contact | 6 ADRs, 8 amendments, **0 schema changes** | ✅ |

### Decision: **GO WITH CONDITIONS**

**Why GO.** Every *technical* premise of the architecture was tested and held. Extraction produces
faithful IR from resolved Dart. The normalization passes match the shapes real code takes. React
mapping works and `next build` is green. The runtime-kit thesis (ADR-6) was validated the first time a
layout bug appeared — the fix landed in the kit, and the generated code never moved. Determinism is
demonstrated in three independent tools. And the IR — the single most expensive thing to get
wrong — absorbed four defect classes without a schema change.

**Why CONDITIONS.** The Blueprint set a numeric bar (≥70 % automatable on real apps) and **we did not
clear it, because we did not measure it.** Both applications we analyzed were written by us; for App B
we chose the constructs *and* the catalog that recognises them. Declaring an unconditional GO on that
basis would be exactly the kind of self-certification this gate exists to prevent. The technical
risk is retired; the *product* risk is not.

**Conditions (all three must be met):**

| | Condition | Deadline |
| --- | --- | --- |
| **C1** | Run the M0-T6 compat tool against **at least one genuinely external, real-world Flutter application** (internal proprietary app, or a substantial open-source Flutter app). Publish the automation ratio. **If materially below 70 %, halt and re-gate.** | Within **week 1 of M1**, before M1-T8 |
| **C2** | Adopt Spec v2.1 (ADRs 11–16, amendments A1–A8) as inputs to the M1-T2 schema | Before M1-T2 |
| **C3** | Pin `analyzer: 14.0.0`; add the Dart beta CI job | With M1-T7 |

C1 does not block M1-T1…T6 (repo, schema authoring, canonical form, IDs, NDJSON, validators) — none of
which depend on real-app data. It blocks **M1-T8**, where the widget catalog is defined, because that
catalog should be shaped by real code rather than by our own fixtures.

---

## 8. M1 readiness checklist

**Repositories & directories**

- [x] `flutterbridge/` monorepo, 9 TS package skeletons building, reserved dirs marked
- [x] `fixtures/apps/hello_bridge` — analyze-clean, `pub get` applied
- [ ] `dart/` — create `bridge_analyzer`, `bridge_uir`, and **`melos.yaml`** (deferred from M0-T1; now due)
- [ ] `tools/schema-codegen/` — reserved, now due (M1-T1)
- [ ] `fixtures/uir/` — G1 goldens (M1-T8)

**Toolchain (pinned)**

| | Version |
| --- | --- |
| Node / pnpm | 24.6.0 / 11.11.0 |
| TypeScript | 5.9.3 (**not** 7.x — api-extractor) |
| Flutter / Dart | 3.41.5 / 3.11.3 |
| **analyzer** | **14.0.0 (exact — ADR-14)** |
| **material_color_utilities** | to be pinned (**new**, ADR-13) |
| Next.js | 15.5.x (ADR-16) |
| Playwright | 1.61.1 |

**CI expectations**

- [x] `just ci` green: build, test, dependency rules, stub tags, negative dep-cruiser test, `flutter analyze`
- [ ] Add **`dart-stable` (blocking)** and **`dart-beta` (advisory)** jobs (C3)
- [ ] Add the G1 extraction-golden job (M1-T12)
- [ ] Add the TS↔Dart validator parity job (**IC-1**, M1-T6)

**Developer prerequisites**

- `flutter pub get` in any analyzed project — **or the analyzer exits 3 and writes nothing** (F6; this is now a rule, not a courtesy)
- Read ADR-11 (N11), ADR-13 (theme ownership), ADR-15 (SSR store scoping) before touching M1-T9/T10

**Documents that become FROZEN at M1 start**

- Specification v2.0 **+ v2.1 amendments** — the single source of truth
- Implementation Blueprint (M1 task list)
- ADR-1 … ADR-16

**Artifacts that become DISPOSABLE**

| Artifact | Delete at |
| --- | --- |
| `spikes/m0-extractor/` | **M1-T7** (superseded by `dart/bridge_analyzer`) |
| `spikes/m0-compat-report/` | M1/M2 (superseded by `bridge analyze`) — **but keep it alive until C1 is discharged; it is the tool that measures C1** |
| `spikes/m0-react-reference/` | M2 — **except `src/screens/login-screen.tsx`, which is promoted to the G2 golden** |
| `spikes/m0-golden/` | M4 (superseded by `@bridge/verification`) — baselines retained as evidence |

**First M1 task:** M1-T1 (schema-codegen tool) — no blockers.
