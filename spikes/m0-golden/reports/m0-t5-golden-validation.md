# M0-T5 — Golden validation report

**Task:** M0-T5 (Playwright golden harness).
**Nature:** observational. Nothing was fixed; every mismatch is recorded and assigned an owner.
**Verdict:** the harness works, the captures are deterministic and repeatable, and the login screen
diffs at **0.25 %** by the perceptual metric — comfortably inside the M0 gate's ≤ 5 %. But that
number is not the whole truth, and §5/F2 explains why.

---

## 1. Environment

| | |
| --- | --- |
| OS | macOS 26.5.2 (arm64) |
| Node | v24.6.0 |
| pnpm | 11.11.0 |
| Flutter | 3.41.5 (stable) |
| Dart | 3.11.3 |
| Playwright | 1.61.1 |
| Browser | Playwright Chromium — Chrome Headless Shell 149.0.7827.55 (both apps) |
| Viewport | 1200 × 900 |
| Device scale factor | 1 |
| Motion | `reducedMotion: reduce`, `animations: disabled` |
| Locale / timezone | en-US / UTC |
| Next.js | 15.5.20 (production build, not `next dev`) |
| Diff engine | pixelmatch 7.2.0 (`threshold: 0.1`, `includeAA: false`) |

## 2. Verification commands

```bash
# harness
cd spikes/m0-golden
pnpm install --ignore-workspace
pnpm exec playwright install chromium
pnpm exec tsc --noEmit                 # harness typechecks clean
pnpm golden                            # captures both apps twice, diffs, writes summary.json

# what the harness runs on your behalf
#   flutter build web --no-tree-shake-icons     (in fixtures/apps/hello_bridge)
#   static-serves build/web on :8130
#   pnpm build && pnpm start -p 8131            (in spikes/m0-react-reference)

# repository gate
cd ../.. && just ci                    # green
```

## 3. Screenshot inventory

| File | Bytes | sha256 (16) | Comparable? |
| --- | --- | --- | --- |
| `baselines/flutter/login.png` | 13 966 | `399729fd64f244d6` | yes |
| `baselines/react/login.png` | 13 727 | `7f231e7e5f4187a0` | yes |
| `baselines/flutter/home.png` | 119 601 | `1f53e7677ca6717b` | **no** — no React counterpart until M2 |
| `diffs/login.diff.png` | 12 505 | `4fe57cc19f458647` | heatmap |

**Repeatability (two full passes, independently captured):**

| | Pass 1 == Pass 2 |
| --- | --- |
| Flutter login | ✅ byte-identical |
| React login | ✅ byte-identical |
| Flutter home | ✅ byte-identical *(but see F8 — this is luck, not determinism)* |

The Flutter home screen **was reachable**: the harness drives the login flow by clicking canvas
coordinates (F7), and the screen renders with live data from the fixture's `GET /posts`.

## 4. Pixel-diff summary

Only `login` is diffed (§Screenshot inventory). 1200 × 900 = 1 080 000 pixels.

| Metric | Mismatched px | % |
| --- | --- | --- |
| pixelmatch `threshold 0.20`, AA excluded | 1 413 | 0.13 % |
| **pixelmatch `threshold 0.10`, AA excluded (headline)** | **2 665** | **0.25 %** |
| pixelmatch `threshold 0.05`, AA excluded | 2 790 | 0.26 % |
| pixelmatch `threshold 0.10`, AA **included** | 4 480 | 0.41 % |
| pixelmatch `threshold 0.00`, AA excluded | 124 386 | 11.52 % |
| **exact (any channel differs at all)** | **127 998** | **11.85 %** |

Where the exact mismatches live (top clusters):

| y band | px | x range | What is there |
| --- | --- | --- | --- |
| 0–59 | ~67 000 | full width | the AppBar — **flat-fill colour drift** |
| 540–599 | ~57 000 | 23–1176 | the ElevatedButton — **flat-fill colour drift** + border |
| 360–399 | ~2 400 | 25–182 | "Hello Bridge" — glyph shapes |

Flat-region colour parity (sampled):

| Region | Flutter | React (kit) | Δ |
| --- | --- | --- | --- |
| Scaffold background | `rgb(246,246,250)` | `rgb(246,246,250)` | **0 — exact** |
| Field gap | `rgb(246,246,250)` | `rgb(246,246,250)` | **0 — exact** |
| AppBar background | `rgb(254,247,255)` | `rgb(250,243,251)` | 4, 4, 4 |
| Button container fill | `rgb(247,242,250)` | `rgb(232,230,248)` | 15, 12, 2 |

**Observation.** Layout is essentially correct — the tokens taken *verbatim* from `ThemeData`
(scaffold background) match exactly, and the geometry lines up to within a pixel or two. Everything
that is wrong is either a **derived** Material colour or a **glyph**.

## 5. Findings

Each finding names its owner: **normalization**, **runtime kit**, **generator**, or **verification**.
None were fixed.

### F1 — Material 3 colour-role drift (the dominant defect) · owner: runtime kit + normalization

The AppBar and the button container are the wrong colour: Δ4 and Δ15 respectively. Together they are
~124 000 pixels — **essentially all of the 11.85 % exact mismatch**.

*Cause.* `hello_bridge`'s `ThemeData` specifies `brightness`, `primaryColor` and
`scaffoldBackgroundColor`. Every other colour Flutter paints — the AppBar's surface tint, the
`ElevatedButton`'s container — is **derived** by Material 3 from those inputs, algorithmically. The
M0-T4 kit hand-picked plausible values for them instead. The colours we copied verbatim are exact;
the colours we guessed are not.

*Impact.* Every screen of every converted app. It is invisible at the headline threshold (F2), which
makes it worse, not better.

*Owner.* The theme engine (M2-T13) must **compute** the M3 colour roles from the seed/primary +
brightness rather than accept hand-authored values, and N10 (`theme-tokenize`) must emit the derived
roles, not just the literals it can see in the Dart source. **This is a normalization requirement,
not merely a styling one:** the information is not in the source text, it is in Material's algorithm.

### F2 — The headline metric hides F1 · owner: verification

The same image pair is **0.25 %** different at `threshold: 0.1` and **11.85 %** different exactly. The
perceptual threshold swallows small-magnitude drift across large flat areas — which is precisely the
shape of the most systematic error a theme engine can make.

*Impact.* A visual verifier configured with a single perceptual tolerance would have **passed** an app
whose Material colours are all subtly wrong, on every screen, forever.

*Owner.* M4-T3. The verifier must not report one number. Recommendation (for M4 to decide, not this
spike): report the perceptual metric **and** an exact/flat-region metric, and treat colour-role parity
as its own check rather than as pixels.

### F3 — Typography drift · owner: runtime kit (+ CI portability)

Every text pixel differs. Flutter renders **Roboto** through CanvasKit's own rasteriser; the kit
renders **`system-ui`**, which on this machine is SF Pro. Different glyph shapes, different advance
widths — so the mismatch is unavoidable, not a tuning problem.

*Impact.* Guarantees a permanent noise floor in every golden, and — worse — `system-ui` resolves
differently on macOS and Linux, so **goldens captured on a developer's Mac cannot be compared against
CI's Linux** while the kit uses a system font stack.

*Owner.* M2-T12: the kit must pin and **self-host** Roboto (or whatever the fixture's theme names) so
that text rendering is a property of the artifact, not of the machine.

### F4 — The Flutter reference build is not hermetic · owner: verification

Despite `build/web/canvaskit/` existing locally, the running app fetches from the network:

```
https://www.gstatic.com/flutter-canvaskit/052f31d115.../canvaskit.wasm
https://www.gstatic.com/flutter-canvaskit/052f31d115.../canvaskit.js
https://fonts.gstatic.com/s/roboto/v32/KFOmCnqEu92Fr1Me4GZLCzYlKw.woff2
```

*Impact.* No network ⇒ no baseline at all. And the reference against which every future golden is
scored is being served by a CDN we do not control: a font revision or engine artifact change silently
shifts the baseline.

*Owner.* M4-T2 (reference-build manager). The reference build must be made hermetic — the local
`canvaskit/` directory is already emitted, so this is a build-configuration away — or the harness must
route those requests to local files. **Recorded, not fixed.**

### F5 — `ElevatedButton` chrome differs · owner: runtime kit

Flutter draws the button as a **1 px outlined pill with a very light fill**; the kit draws a
**borderless filled pill**. This is the hard red line along the button's bottom edge in the heatmap.

*Owner.* M2-T19 (Material mappers) / the kit's Material component fidelity, and its visual suite
against Flutter references (M2-T12) is exactly the mechanism that would have caught it.

### F6 — AppBar title offset ~4 px · owner: runtime kit

The kit reserves fixed 48 px leading/action slots and centres the title in the space between them;
Flutter centres the title in the **full width** when there is no leading widget and no actions. Small,
systematic, and would recur on every screen with an AppBar.

### F7 — Flutter Web has no DOM to drive · owner: verification

Flutter paints to a canvas. There are no elements to click, so the harness reaches the Home screen by
clicking **coordinates** (600,447), (600,507), (600,572). It works, and it is fragile by construction:
any layout change to the fixture silently breaks the interaction.

*Impact on the spec's plans.* The **semantics/DOM verifier** (Spec §8) compares Flutter's semantics
tree against the rendered ARIA tree — that verifier will need Flutter's accessibility semantics
enabled to have any DOM at all on the Flutter side. Worth confirming early at M4.

### F8 — The Home baseline is network-dependent · owner: verification

`home.png` was byte-identical across both passes — but only because `jsonplaceholder.typicode.com`
happened to return the same 12 records. That is **luck, not determinism**. A live API in a golden is a
flake waiting to happen (risk R5).

*Owner.* M4: network must be stubbed (Playwright route interception) or the region masked, before Home
is ever gated.

### F9 — Determinism: achieved, and measured

Identical browser, viewport, DPR, motion, locale, timezone and colour scheme; fonts awaited;
frame-stability polling instead of fixed sleeps. Both apps produced **byte-identical PNGs across two
independent passes**. The acceptance criteria for this task are met.

## 6. Risks that will materially affect M2

| Risk | Why it bites M2 | Evidence |
| --- | --- | --- |
| **Derived Material colours** | If the theme engine (M2-T13) copies literals instead of computing M3 roles, every G3 golden carries a systematic colour error — and the default tolerance will not catch it. This is the single highest-value thing M2 must get right. | F1, F2 |
| **Font portability** | While the kit uses `system-ui`, goldens are machine-dependent: a Mac-captured golden cannot be compared on Linux CI. M2-T24's visual gate would be unusable in CI. | F3 |
| **Tolerance policy is undefined** | The blueprint's "G3 ≤ 3 %" (M2-T24) is meaningless until the metric is specified. 0.25 % and 11.85 % are both true of this image pair. | F2 |
| **Non-hermetic reference** | A CDN-served reference makes the baseline unreproducible over time and impossible offline. | F4 |
| **Canvas-only interaction** | Flutter-side flows are coordinate-driven and brittle; the semantics-tree verifier needs a plan. | F7 |

These are recorded for M2/M4. **This spike changes nothing.**

## 7. Assumptions

1. **Only `login` is comparable.** The React reference implements the login screen only (M0-T4); its
   `/home` is an acknowledged placeholder. Home is captured from Flutter for information and is not
   diffed — a number from diffing a real screen against a placeholder would be worse than no number.
2. **Playwright's Chromium is used for both apps** (not the system Chrome used in M0-T2/T4's ad-hoc
   screenshots), so "identical browser" is a fact rather than a hope.
3. **The React app is captured from its production build**, never `next dev`, whose overlays and
   HMR socket would otherwise land in a golden.
4. **The Flutter login flow is driven by coordinates** (F7) — there is no DOM to target.
5. **Headline metric = pixelmatch `threshold 0.1`, `includeAA: false`.** Chosen because it is the
   defensible default, and reported alongside the exact metric precisely because it is not sufficient
   (F2). The real tolerance policy is M4's to set.
6. **Baselines are committed** as the evidence artifact for the M0-T7 gate.

## 8. CI

The repository gate is **green** (`just ci`: build 9/9, tests 18/18, dependency rules clean, stub tags
OK, negative dep-cruiser test passes, `flutter analyze` clean).

The spike is intentionally **outside CI**: it is throwaway, it needs a browser download and a Flutter
web build, and it is superseded by `@bridge/verification` at M4.

### Repository changes outside `spikes/`

One, documented: `.gitignore` gained `spikes/m0-golden/baselines/.pass1/` (the repeatability
comparison's scratch copies). No package, no CI workflow, no architecture file was touched.
