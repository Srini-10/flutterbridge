# spikes/m0-compat-report — THROWAWAY (M0-T6)

A compatibility-report prototype. Points `package:analyzer` at a Flutter project and reports what
FlutterBridge could support, partially support, or not support at all.

**It is an analyzer and a report writer. Nothing else.** It generates no UIR, no React, and rewrites
nothing. It exists to answer one question:

> If a developer points FlutterBridge at an arbitrary Flutter app, can we produce a deterministic
> report that explains exactly what is supported, unsupported, or partially supported?

The answer is yes — with caveats, all of them written up in
[`reports/summary.md`](reports/summary.md) and in the M0-T6 review.

This is not `bridge analyze`. The real command is built at M1/M2. Delete this directory then.

## The two applications

| | Project | Role |
| --- | --- | --- |
| **App A** | `fixtures/apps/hello_bridge` (**analyzed in place, read-only**) | The control case: written to the frozen MVP subset. If the report can't say "this one is fine", the format is useless. |
| **App B** | `fixtures/app_b` — `shop_bridge` (written for this spike) | The hard case: navigation, state, async, forms, collections, layouts — *and* platform channels, isolates, `dart:io`, `dart:ffi`, `CustomPainter`, `AnimationController`, `Hero`, streams. |

App A is **not copied** into this spike. Duplicated fixtures drift, and the brief forbids modifying
production fixtures — so the tool takes a `--project` path and reads the real one.

## Run

```bash
dart pub get

# per-app reports
dart run bin/compat_report.dart --project ../../fixtures/apps/hello_bridge \
  --name app_a --out out/app_a.json --report reports/app_a.md
dart run bin/compat_report.dart --project fixtures/app_b \
  --name app_b --out out/app_b.json --report reports/app_b.md

# cross-app matrix + summary
dart run bin/compat_report.dart --matrix out/app_a.json,out/app_b.json --report-dir reports
```

**Exit codes.** `0` = analysis succeeded (*including* when the app is full of unsupported constructs
— that is a finding, not a failure). `3` = environment failure (no `package_config.json`, or
unresolved imports: the M0-T3 F6 lesson — never analyze against a broken element model). `1` = crash.

**Determinism.** Every list and map is sorted; there are no timestamps. Three consecutive runs
produce byte-identical JSON and Markdown.

## Output

| File | What |
| --- | --- |
| `out/app_*.json` | machine-readable findings, with every construct's file:line |
| `reports/app_*.md` | the human report: verdict, summary, supported/partial/unsupported, warnings |
| `reports/compatibility-matrix.md` | feature × app matrix, with a **Status** column (compiler capability) |
| `reports/summary.md` | the two verdicts side by side |

## Verdicts

Descriptive, never numeric — the *reasoning* is the product, the counts are only evidence for it.

- **High** — everything found is in the MVP or has a planned mapping.
- **Medium** — bounded, per-widget costs (overrides), no architectural blockers.
- **Low** — the app needs capabilities the browser does not have (platform channels, isolates,
  `dart:io`, FFI). These are gaps in the *target platform*, not in the compiler, and a human must
  decide what they become on the web before conversion means anything.

`hello_bridge` → **High**. `shop_bridge` → **Low**.
