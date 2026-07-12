# ADR-12 — The authoritative visual metric (closes the 0.25 % vs 11.85 % ambiguity)

- **Status:** Accepted (M0-T7). Amends Spec v2.0 §8 (verification framework).
- **Date:** 2026-07-12

## Evidence (M0-T5)

The same pair of 1200×900 images produced **both** of these numbers:

| Metric | Mismatch |
| --- | --- |
| pixelmatch, `threshold 0.10`, AA excluded | 2 665 px — **0.25 %** |
| exact (any channel differs) | 127 998 px — **11.85 %** |

The gap is not noise. It is the AppBar (Δ4) and the button container (Δ15) — ~124 000 pixels of
**systematic Material colour drift**, small enough in magnitude to slip under a perceptual threshold
while covering 12 % of the screen. Lowering the threshold does not fix it: at `0.05` the number is
still 0.26 %; only `0.00` sees it, and at `0.00` every antialiased glyph edge becomes a failure.

**Conclusion: a perceptual pixel metric is the wrong instrument for colour correctness, at any
threshold.** Tuning cannot rescue it.

## Decision

**There is exactly one authoritative visual metric — VMR — and colour correctness is not its job.**

### VMR (Visual Mismatch Ratio) — authoritative

| | |
| --- | --- |
| **Algorithm** | pixelmatch (YIQ perceptual distance) over two PNGs of identical dimensions |
| **AA handling** | `includeAA: false` — antialiasing pixels are not counted |
| **Perceptual handling** | YIQ threshold, `0.1` |
| **Value** | `VMR = mismatchedPixels / totalPixels`, as a percentage to 2 dp |
| **Precondition** | Both captures under the identical determinism contract (browser, viewport, DPR, motion, locale, timezone, fonts). **A dimension mismatch is an error, never a diff** (INV-21). |
| **Gate** | Per route × viewport budget in `bridge.config.ts`; provisional default **3 %** |
| **Authoritative for** | layout, geometry, spacing, typography, structural regression |
| **NOT authoritative for** | colour correctness — see VR-1 |

**Threshold calibration is deferred with cause.** The 0.25 % measured at M0 is dominated by
typography drift (F3: Flutter's Roboto vs the kit's `system-ui`), which disappears once the kit
self-hosts its font. The final budget must be **re-calibrated at M2-T12**, once the kit pins Roboto
and N10 emits derived colour roles. Until then 3 % stands as the provisional gate (as the Blueprint's
M2-T24 already assumed). Setting a final number now would be fitting a threshold to a defect.

### VR-1 (token parity) — a new, non-pixel verification rule

Colour correctness is checked as **data, not pixels**: the compiler-derived `app.Token` role set is
compared against the colour roles Flutter actually resolves for the same `ThemeData`. A mismatch is
`BRG4101`, and it is a **hard failure independent of VMR**.

*Mechanism.* Two candidates — (a) a small Dart reference probe that instantiates the app's `ThemeData`
under `flutter test` and dumps the resolved `ColorScheme`; (b) comparing against
`material_color_utilities` directly, the same package Flutter itself uses. Both are deterministic and
require no rendering. **The choice is deferred to M4-T1**; the evidence that the *check* is required is
conclusive, the evidence for which mechanism is cheaper is not.

### Reporting format (mandatory)

Every visual report prints **VMR (gating)** and **exact mismatch (diagnostic, non-gating)** side by
side, plus the flat-region colour table. No report may present a single number.

This is the direct lesson of M0-T5: a reader shown only "0.25 %" concludes the conversion is nearly
pixel-perfect, when 12 % of the pixels are literally the wrong colour. **The one-number report is the
defect.** The metric is single and authoritative; the *presentation* is deliberately plural.

## Consequences

- A verifier can no longer pass an app whose Material colours are systematically wrong — VR-1 catches
  it in data, where the error actually lives.
- VMR stays perceptual, so antialiasing and font hinting do not produce daily false failures.
- Cost: VR-1 is a new verifier to build (M4), and the theme pipeline must produce derived roles for it
  to check (ADR-13).
