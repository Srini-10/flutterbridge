# spikes/m0-golden — THROWAWAY (M0-T5)

The golden harness. Captures deterministic screenshots of the **Flutter Web fixture** and the
**hand-written React reference** (M0-T4), then pixel-diffs the one screen both implement.

**Observational only.** This spike fixes nothing. It measures, and it records what it measures. Every
mismatch it found is written up in [`reports/m0-t5-golden-validation.md`](reports/m0-t5-golden-validation.md)
— that report, not this code, is the deliverable.

This is not `@bridge/verification`. The real visual verifier is industrialised at M4-T3, against this
harness's findings.

## The determinism contract

A golden that is not repeatable is not a gate, it is noise (risk R5). Everything that could differ
between the two apps is pinned in `playwright.config.ts`, once, and both capture scripts import it:

| | |
| --- | --- |
| Browser | Playwright Chromium 1.61.1 (**never** the system browser) |
| Viewport | 1200 × 900 |
| Device scale factor | 1 (no resampling enters the diff) |
| Motion | `reducedMotion: reduce` + `animations: disabled` |
| Locale / timezone | `en-US` / `UTC` |
| Colour scheme | light |
| Fonts | `document.fonts.ready` awaited |
| Readiness | frame-stability: shoot until two consecutive frames are byte-identical |

Repeatability is **measured, not assumed**: `run-all.ts` captures each app twice and requires the two
PNGs to be byte-identical.

## Run

```bash
pnpm install --ignore-workspace
pnpm exec playwright install chromium
pnpm golden          # capture both apps (twice), diff, write reports/summary.json
```

Individual steps: `pnpm capture:flutter`, `pnpm capture:react`, `pnpm diff`.

## Layout

```
scripts/capture_flutter.ts   builds+serves build/web, waits for a stable frame, screenshots
scripts/capture_next.ts      builds+serves the PRODUCTION next build, screenshots
scripts/diff.ts              pixelmatch -> mismatch count, %, heatmap PNG
scripts/run-all.ts           orchestrates, checks repeatability, writes summary.json
baselines/flutter/           login.png, home.png
baselines/react/             login.png
diffs/                       login.diff.png (heatmap)
reports/                     m0-t5-golden-validation.md  ← the deliverable
```

## What is comparable

Only **login**. The React reference implements the login screen (M0-T4); its `/home` is an
acknowledged placeholder. `baselines/flutter/home.png` is captured for information and is
deliberately **not** diffed — a number produced by diffing a real screen against a placeholder would
mean nothing. Home becomes comparable at M2.

## Headline

| Metric | login |
| --- | --- |
| pixelmatch (threshold 0.10, AA excluded) | **0.25 %** (2 665 / 1 080 000 px) |
| exact mismatch (any channel differs) | **11.85 %** (127 998 px) |

Those two numbers describing the same pair of images is the single most useful thing this spike
found. See finding **F2**.
