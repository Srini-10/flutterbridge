# ADR-13 — Material colour roles are derived at compile time (theme ownership)

- **Status:** Accepted (M0-T7). Amends Spec v2.0 §3.3 (pass N10) and §5 (theme engine).
- **Date:** 2026-07-12

## Evidence (M0-T5, F1)

Sampled flat regions of the Flutter reference vs the hand-written React reference:

| Region | Flutter | Kit | Δ |
| --- | --- | --- | --- |
| Scaffold background | `rgb(246,246,250)` | `rgb(246,246,250)` | **0 — exact** |
| Field gap | `rgb(246,246,250)` | `rgb(246,246,250)` | **0 — exact** |
| AppBar background | `rgb(254,247,255)` | `rgb(250,243,251)` | 4, 4, 4 |
| Button container | `rgb(247,242,250)` | `rgb(232,230,248)` | 15, 12, 2 |

The pattern is unambiguous: **the colours we copied verbatim from `ThemeData` are exact; the colours
we guessed are wrong.** `hello_bridge` declares only `brightness`, `primaryColor` and
`scaffoldBackgroundColor`. Every other colour Flutter paints — the AppBar's surface tint, the
`ElevatedButton`'s container — is *derived* by Material 3 from those inputs, algorithmically.

**That information is not in the Dart source text. It is in Material's algorithm.** No amount of
reading the source will find it.

## Decision

**Yes — N10 (`theme-tokenize`) must emit the derived Material role set, not just the literals it can
see.** Ownership splits at a clean line:

### Compile time — the analyzer / N10 owns the *palette*

The Dart-side extractor computes the effective `ColorScheme` using **`material_color_utilities`** —
the same pub package Flutter itself uses to derive M3 tones — and N10 emits the complete role set as
`app.Token` nodes (`primary`, `onPrimary`, `primaryContainer`, `surface`, `surfaceTint`, `outline`,
`error`, … for both brightnesses).

*Why compile time, not runtime:* the roles are **data**, and three realms need them as data —
`gen-tokens` (DTCG), Figma sync, and every ui-realm runtime kit. Deriving at runtime would mean
re-implementing Material's algorithm inside **every** kit (React, then Vue, then Svelte), and would
put a non-deterministic-by-default computation on the render path. Deriving once, in the compiler,
keeps D1–D5 intact and makes the theme portable across targets.

### Runtime — the kit owns *composition*

Elevation overlays, state layers (hover/pressed/focus/disabled), and opacity blends are **functions of
component state**, which the compiler cannot know. The kit composes them **from tokens only**.

**INV-20 (new):** every colour a mapped Material widget paints must resolve to an `app.Token`.
**Generated code and kit components contain no literal colour values.** A literal colour in emitted
output is a compiler bug.

## Consequences

- The AppBar Δ4 is an *elevation/surface-tint composition* defect (runtime, kit); the button Δ15 is a
  *role derivation* defect (compile time, N10). Both are now owned, and by different owners. That
  split is the substance of this ADR.
- New dependency for `bridge_analyzer`: `material_color_utilities`.
- New risk (**R10**): our reproduction of Flutter's `ThemeData` defaults may diverge from the real
  framework's. This is exactly what VR-1 (ADR-12) exists to catch, in data rather than in pixels.
- Cost: N10 grows from "lift literals" to "derive a palette". This is a genuine increase in scope for
  M1/M2, accepted on the evidence above — the alternative is every converted app being subtly the
  wrong colour on every screen, invisibly (ADR-12).
