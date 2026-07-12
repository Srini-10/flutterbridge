# C1 — Comparison: apps we wrote vs. apps we did not

> Evidence only. No compiler change. Analyzer run unmodified (one environment-guard fix, §6).

## Corpus

| App | Origin | Commit | Files | LOC | Framework widget instantiations |
| --- | --- | --- | --- | --- | --- |
| `hello_bridge` (app_a) | **ours** (M0-T2 fixture) | — | 7 | 369 | 37 |
| `shop_bridge` (app_b) | **ours** (M0-T6 fixture) | — | 10 | ~430 | 58 |
| **`compass_app`** | **external** — google/flutter samples (reference architecture) | `09335b0` | 111 | 9 141 | 340 |
| **`wonderous`** | **external** — gskinnerTeam (production, design-led) | `ce37ddf` | 189 | 30 655 | 1 169 |

Excluded, with cause (§6 of the C1 record): **Flutter Gallery** (archived; depends on the removed
`flutter_gen` synthetic package — does not resolve on Flutter 3.41), **smooth-app** (requires Dart
≥3.11.5; our pinned toolchain is 3.11.3).

## Automation coverage

Weighted by **widget instantiation**, framework widgets only (an app's own components are excluded —
they are what the compiler *generates*, not what it must map).

| Metric | app_a | app_b | **compass_app** | **wonderous** |
| --- | --- | --- | --- | --- |
| **A1 — MVP coverage today** (28-widget catalog) | 100 % | 77.6 % | **62.6 %** | **51.8 %** |
| **A2 — Recognised** (MVP + Partial) | 100 % | 93.1 % | **80.6 %** | **66.0 %** |
| **A3 — Automation ceiling** (1 − genuinely unsupported) | 100 % | 93.1 % | **98.5 %** | **98.9 %** |
| Genuinely unsupported | 0 % | 6.9 % | **1.5 %** | **1.1 %** |
| **Unknown (catalog gap)** | **0 %** | **0 %** | **17.9 %** | **32.8 %** |
| Blast radius (files touching an unsupported construct) | 0 % | — | **3.6 %** (4/111) | **7.9 %** (15/189) |

## The finding that justifies C1's existence

**Our own apps have a 0 % unknown rate. Real apps have 18–33 %.**

That is not a coincidence — it is arithmetic. For `hello_bridge` and `shop_bridge` we wrote both the
application *and* the catalog that recognises it. A 0 % unknown rate against our own fixtures measured
nothing except our own consistency. The moment the tool met code it had not been written against, a
third of the widget usage fell outside the catalog.

## Triage of every unknown construct

The unknown bucket is not a wall of unconvertible code. Every entry was triaged against the app's own
sources and the Flutter framework:

| | wonderous (384 instantiations) | compass_app (61) |
| --- | --- | --- |
| **U1 — user-defined widget, misclassified** (tool defect) | 18 (4.7 %) | 0 |
| **U2 — ordinary framework widget, missing from our catalog** | **188 (49.0 %)** | **32 (52.5 %)** |
| **U3 — third-party package widget, needs an adapter** | **178 (46.4 %)** | **29 (47.5 %)** |
| **U4 — genuinely unconvertible** | **0** | **0** |

**Not one unknown construct in either application was genuinely unconvertible.** The entire unknown
bucket is (a) our catalog being small, (b) package adapters not yet written, (c) one detection bug.

## External vs internal

**The internal comparison could not be run.** There is no Flutter project on this machine — the
Pharmacy Management ERP is not present, and I will not simulate one. Phase 2 is **not executed**, and
C1 therefore cannot be closed. See the C1 record, §7.

The nearest available proxy is `compass_app` — Google's own *reference business architecture* sample
(MVVM, repositories, commands, auth, forms, API client). It is a legitimate stand-in for the *shape* of
a line-of-business app, and **it is explicitly not a substitute for your production ERP**: it is small
(9 k LOC), has no legacy, and was written to be exemplary.
