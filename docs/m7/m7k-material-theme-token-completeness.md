# M7-K — Material theme token completeness & real-app validation

## Summary

`hello_bridge` declares its theme as `ThemeData(brightness:, primaryColor:, scaffoldBackgroundColor:,
useMaterial3: true)` — no `colorScheme:`, no `colorSchemeSeed:`. N10 (`theme-tokenize`) only derives a
role set from a `"seed"` token, and this theme never produces one, so five widgets across the app painted
five Material roles (`surface`, `onSurface`, `onSurfaceVariant`, `primary`, `error`) the program's own
tokens never defined — 18 `BRG3010` occurrences, the largest single diagnostic category the app produced.

The root cause is not a compiler defect and not a missing derivation: it is a **metadata gap**. Flutter's
own `ThemeData` factory constructor never leaves `ColorScheme` unset. When `useMaterial3` is not
explicitly `false` — its default is `true` — and neither `colorScheme:` nor `colorSchemeSeed:` is given,
`ThemeData` falls back to its own hardcoded, literal Material 3 baseline `ColorScheme`
(`_colorSchemeLightM3`/`_colorSchemeDarkM3`). FlutterBridge's analyzer did not know that fallback existed,
so a program that never states a `ColorScheme` looked, incorrectly, like a program that painted colours it
never defined.

The fix teaches the analyzer that fallback, verbatim from the installed Flutter SDK, and has it emit the
same 46 role-tagged tokens Flutter itself would resolve to. `hello_bridge` regenerated from the real
analyzer: **27 generation errors → 9. `BRG3010`: 18 → 0.** No other diagnostic category changed. Nothing
was invented, weakened, or widened in scope.

## Root cause table (Phase 2)

| # | Widget | Role | Screen(s) | Light/Dark | Category |
|---|---|---|---|---|---|
| 1 | `Scaffold` | `surface` | Home, Login | both | B — metadata |
| 2 | `AppBar` | `surface` | Home, Login | both | B — metadata |
| 3 | `AppBar` | `onSurface` | Home, Login | both | B — metadata |
| 4 | `AppBar` | `onSurfaceVariant` | Home, Login | both | B — metadata |
| 5 | `TextField` | `onSurface` | Login (×2 fields) | both | B — metadata |
| 6 | `TextField` | `onSurfaceVariant` | Login (×2 fields) | both | B — metadata |
| 7 | `TextField` | `primary` | Login (×2 fields) | both | B — metadata |
| 8 | `TextField` | `error` | Login (×2 fields) | both | B — metadata |
| 9 | `IconButton` | `onSurfaceVariant` | Login | light only | B — metadata |
| 10 | `CircularProgressIndicator` | `primary` | Home | light only | B — metadata |

10 unique (widget, role) pairs, 18 total occurrences (most doubled across the app's light/dark theme
declarations), 5 unique roles, 5 unique widgets. Every occurrence traces to the same root cause: no
role-tagged token exists for `surface`, `onSurface`, `onSurfaceVariant`, `primary`, or `error` anywhere in
the program.

## Architecture audit (Phases 4–7)

- **ADR-13** gives N10 ownership of *algorithmic* palette derivation — turning a `"seed"` token into the
  other 45 roles via `material-color-utilities`. It does not claim to be the only place a role-tagged
  token can originate; the analyzer already mints role tokens directly from an explicit `ColorScheme(...)`
  construction's own named arguments (`tokensOf`'s generic loop, `role: type == 'ColorScheme' ? name :
  null`), and that direct-mint path already coexists with N10's derivation path — N10 skips any role
  already `stated` (`n10_theme_tokenize.ts:98-99`). This fix adds a third source into the same coexistence:
  the analyzer directly mints the SDK's own literal fallback tokens, verbatim, when the program's theme
  can't otherwise resolve to one. **No ADR amendment is needed** — this is implementation inside the
  ownership split ADR-13 already drew, not a new one. It is also, evidentially, the same category ADR-13's
  own decision rested on: *"the colours we copied verbatim from `ThemeData` are exact."* This fix copies
  another value verbatim from the SDK; it does not compute anything.
- **ADR-18** (framework knowledge lives only in the analyzer adapter) is respected: the fix is entirely in
  `flutter_adapter.dart` and `catalog/widgets/material.json`. N10 (`packages/compiler/.../n10_theme_tokenize.ts`)
  is untouched — confirmed by `git diff --stat`, zero lines changed there.
- **All 46 roles** in the new catalog table were cross-checked programmatically against N10's own `ROLES`
  array (`set` equality in Python: `missing from catalog: set()`, `extra in catalog: set()`) — the catalog
  cannot silently omit or invent a role name the schema doesn't already carry.
- **`ColorScheme` vs `ThemeData`**: the fallback lives on `ThemeData`'s factory constructor, not on
  `ColorScheme` itself — `ColorScheme.light()`/`ColorScheme.dark()`/the unnamed constructor all require
  their own arguments and have no comparable "no-op" default. The new branch in `tokensOf` is gated on
  `type == 'ThemeData'` specifically, and never fires for a bare `ColorScheme` construction.
- **Explicit-wins precedence (Phase 8)**: verified directly — `_argument(node, colorSchemeProp)` and
  `_argument(node, colorSchemeSeedProp)` are checked first; either present suppresses the baseline
  entirely, whatever else the `ThemeData` declares. `useMaterial3: false` also suppresses it (Material 2
  has no M3 baseline to fall back to). All three are covered by dedicated tests (below), and mutation-
  checked: with the fix reverted, the two tests that assert the baseline actually *appears* fail; the four
  that assert it is correctly *suppressed* still pass (trivially true without the feature), confirming the
  first two are the load-bearing ones.
- **`MaterialApp` (Phase 12)**: `theme:`/`darkTheme:`/`themeMode:` extraction is unaffected. The fix
  operates on the `ThemeData(...)` construction itself, which is unpacked into tokens the same way whether
  it arrives via `theme:` or `darkTheme:` — `_isDark` (unchanged) reads `brightness:` walking up the AST,
  exactly as before. `themeMode` dynamic switching remains unimplemented (`BRG3016`, untouched, still
  fires); M4-G's decision not to emit `MaterialApp` as a runtime component is not touched.

## SDK evidence (Phase 6)

Read directly from the installed Flutter SDK
(`/opt/homebrew/share/flutter/packages/flutter/lib/src/material/theme_data.dart`):

- `useMaterial3` defaults to `true`: the factory constructor does `useMaterial3 ??= true;`.
- When `useMaterial3` is true and neither `colorScheme` nor `colorSchemeSeed` is given, the constructor
  falls back unconditionally to `_colorSchemeLightM3`/`_colorSchemeDarkM3` — the SDK's own hardcoded M3
  baseline `ColorScheme` constants (not derived from any particular seed at all).
- Legacy `Color?` properties (`primaryColor`, `scaffoldBackgroundColor`, …) are defaulted with `??=` **off
  the already-resolved `colorScheme`**, and never feed back into it. `hello_bridge` setting
  `primaryColor:`/`scaffoldBackgroundColor:` does not touch which `ColorScheme` gets resolved.
- Empirically confirmed the baseline is not algorithmically reproducible from N10's own seed-derivation
  path: running N10's actual compiled TypeScript (`SchemeTonalSpot` from `material-color-utilities`)
  against the "obvious" seed `0xFF6750A4` (the baseline's own `primary`) yields `#FF65558F` for
  `primaryContainer`-adjacent roles where the SDK's literal constant is `#FFB3261E` for `error` and
  diverges elsewhere too — the baseline is a hand-generated constant table, not a derivable function of one
  seed. This is exactly why the fix belongs in the analyzer (read the constant) and not in N10 (derive it).

All 46 light values and all 46 dark values were transcribed from the SDK's `_colorSchemeLightM3`/
`_colorSchemeDarkM3` definitions and are committed verbatim in `catalog/widgets/material.json`'s
`theme.material3Baseline.{light,dark}`.

## Implementation (Phase 14)

- **`catalog/widgets/material.json`** — `theme` gained `colorSchemeProp: "colorScheme"`,
  `colorSchemeSeedProp: "colorSchemeSeed"`, `useMaterial3Prop: "useMaterial3"`, and `material3Baseline`
  (46 light + 46 dark role → hex-ARGB entries, sourced verbatim from the SDK).
- **`tools/catalog-codegen/src/model.ts`** — `ThemeMeta` extended with the four new optional fields.
- **`tools/catalog-codegen/src/dart.ts`** — generates the corresponding `MaterialCatalog` constants
  (`colorSchemeProp`, `colorSchemeSeedProp`, `useMaterial3Prop`, `material3BaselineLight`,
  `material3BaselineDark`) alongside the existing `theme` generation block.
- **`dart/bridge_analyzer/lib/src/session/adapters/widget/flutter_adapter.dart`** — `tokensOf` gained a new
  branch, after the existing per-argument loop: when `type == 'ThemeData'` and neither `colorSchemeProp`
  nor `colorSchemeSeedProp` is present as a named argument, and `_usesMaterial3(node)` is true (absent, a
  literal `true`, or any non-literal expression — only a literal `false` disables it, matching the SDK's
  `??= true`), it emits one role-tagged `TokenDeclaration` per entry in the dark-or-light baseline table,
  anchored at the `ThemeData(...)` construction itself. The existing per-argument loop is untouched and
  still runs first, so legacy properties like `primaryColor:` still tokenize under their own (role-less)
  name exactly as before — the baseline tokens are additive, not a replacement.

No changes to N10, the schema, the generator, or the runtime kit. The generator's role-resolution logic
(`Divider`/`outlineVariant` and the `BRG3010` refusal path) is unchanged and unaware of where a role-tagged
token originated — confirmed by the pre-existing generator tests for both continuing to pass unmodified.

## Tests (Phase 15)

Six new tests in `dart/bridge_analyzer/test/extraction_test.dart`, all against the **real analyzer** over a
real (stand-in) Flutter project — no hand-authored UIR:

1. `every M3 role is emitted, sourced from the SDK baseline` — a `ThemeData(primaryColor:,
   scaffoldBackgroundColor:, useMaterial3: true)` with no `colorScheme`/`colorSchemeSeed` produces all 46
   role tokens, spot-checked against the literal SDK values (`primary` → `#FF6750A4`, `surface` →
   `#FFFEF7FF`).
2. `legacy Color properties still tokenize on their own name, unaffected` — `primaryColor` still emits its
   own token, un-role-tagged.
3. `an explicit colorScheme: wins — no baseline role is invented` — `ColorScheme.light(primary: …)` yields
   only the role it states; the other 45 are not backfilled.
4. `an explicit colorSchemeSeed: suppresses the baseline too`.
5. `useMaterial3: false suppresses the baseline` — Material 2 has no M3 baseline.
6. `theme: and darkTheme: each fall back to their own baseline, merged into one token` — `primary` on one
   `app.Token` node carries both the light and dark literal values.

`test/support/temp_project.dart` gained a minimal `Brightness` enum and a `brightness` field on the stub
`ThemeData`, needed to express test 6 — additive only, no existing test's behaviour changed.

Mutation-checked: reverting `flutter_adapter.dart` while keeping the tests fails exactly tests 1 and 6 (the
ones asserting the baseline appears); tests 2–5 (asserting suppression) still pass, as expected since
suppression is vacuously true without the feature at all. This confirms 1 and 6 are load-bearing.

Full Dart suite: **262/262 passing** (was 256 before this milestone; +6 new, 0 regressions).

## `hello_bridge` before/after (Phase 19)

Measured with the real analyzer → real normalizer → real react generator, via `bridge analyze` +
`bridge generate` against `fixtures/apps/hello_bridge`:

| | Before | After |
|---|---|---|
| Raw analyzer records | 36 | 82 (+46 role tokens) |
| Normalized records | 38 | 84 |
| `bridge generate` total errors | 27 | 9 |
| `BRG3010` occurrences | 18 | **0** |
| Other error categories | `BRG3002`(3), `BRG3005`(1), `BRG3007`(1), `BRG3013`(2), `BRG3016`(1) | identical, unchanged |

The 9 remaining errors are exactly the pre-existing, explicitly out-of-scope gaps: `Duration`/`Future`
class lowering (`BRG3002` ×3 — `Duration`, `Future`, `FavoritesStore`, plus one named-argument case),
`ui.Async` loading/error branches (`BRG3007`), multi-hop cross-route argument promotion (`BRG3013` ×2),
`themeMode` runtime switching (`BRG3016`), and the roll-up (`BRG3005`). None were touched; none changed in
count or message. `hello_bridge` still does not build end-to-end — it was never expected to; this milestone
closes exactly the token-completeness gap and nothing else.

Golden fixtures updated to match: `fixtures/uir/hello_bridge.{ndjson,normalized.ndjson,manifest.json}`,
regenerated from the real pipeline (raw record count 36→82, normalized 38→84, diff is exactly +46 lines
in both — the 46 new tokens, nothing else touched). `packages/generators/react/tests/generate.test.ts`'s
three assertions over this golden (node count, the `BRG3010`-inclusive error-code set, and the
ARGB-passthrough token count) were updated to match, with the ARGB test additionally filtered to exclude
the new role-tagged tokens so it stays scoped to what it always tested — the two legacy-property tokens.

## Regression (Phases 20–22)

- `git diff --stat fixtures/uir/` shows only the three `hello_bridge` golden files changed — `counter`,
  `promoted_counter`, `inline_push_props`, and `async_push_guard` are byte-identical, since none of their
  fixtures construct a `ThemeData` without `colorScheme`/`colorSchemeSeed`.
- The pre-existing `BRG3010 — a widget painting a role the theme does not define is refused (INV-20)` test
  (`generate.test.ts`) still passes unmodified: a role genuinely absent from the program's tokens is still
  refused. The fix widens which programs supply a role, not what happens when one is missing.
- `@bridge/gen-react` suite: **194/194 passing** (3 pre-existing hello_bridge assertions updated to match
  the new, correct golden; no other test touched).
- Full Dart suite: **262/262 passing**, `dart analyze --fatal-infos`: clean on both `bridge_uir` and
  `bridge_analyzer`.

## Determinism and the fixed point (Phase 23/24)

- `bridge analyze` over `fixtures/apps/hello_bridge`, run 3 times into a wiped `.bridge/`: identical
  `sha256` of `uir.ndjson` all three times.
- `bridge normalize` run twice in sequence (output of run 1 fed as input to run 2): run 2 reports "passes
  that changed the program: none" — the fixed point holds; the 46 new role tokens are not re-derived or
  re-processed on a second pass (N10 still requires a `"seed"` token to run at all, which `hello_bridge`'s
  theme never provides, so N10 is a no-op both before and after this change).

## CI (Phase 26)

- `pnpm run codegen:check`: clean — the catalog/schema/gen-react generated artifacts all match their
  sources, including the new `material3BaselineLight`/`Dark` Dart maps.
- `just ci`: **exit 0**, full gate green (TS build/test/typecheck/lint, Dart analyze/test, `flutter
  analyze`). The known `fixtures/apps/hello_bridge/analysis_options.yaml` auto-drift from `flutter analyze`
  was reverted via `git checkout --` before committing, per established practice from M7-G/H/J.
- `just determinism`: full pipeline determinism across `counter`, `promoted-counter`, `inline-push-props`,
  and `async-push-guard` — byte-identical across 3 runs each, confirming this milestone introduced no
  nondeterminism into the packages the e2e determinism harness covers.

## Scope discipline (Phase 20)

Explicitly not touched, as instructed: `Duration`/`Future` emulation, multi-hop cross-route promotion,
named-route work, general async lowering, `themeMode` runtime switching. All five remain exactly as they
were in `hello_bridge`'s diagnostic output — same codes, same counts, same messages.

## Browser proof — deliberately skipped, and why

Phase 17 permits skipping if `hello_bridge` doesn't yield a buildable app. It doesn't: 9 unrelated errors
still block generation entirely. A synthetic isolated fixture was considered but rejected — the
role-token-to-generator-to-browser consumption path was already proven by M4-B (`Divider`/`outlineVariant`,
hand-built token) and M4-G (`hello_bridge`'s own `Scaffold`/`AppBar` against a `ColorScheme.fromSeed`
program). This milestone's tokens are shape-identical `app.Token` nodes with a `role`; the generator cannot
distinguish one that came from `ColorScheme.fromSeed` (already browser-proven) from one that came from the
new baseline fallback. Building a new synthetic fixture would re-prove already-proven consumption, not the
actual change, which is entirely upstream of the generator.

## Category classification (Phase 9)

All 10 (widget, role) pairs: **Category B — metadata defect.** The SDK's default is knowable and directly
evidenced by reading the framework source; FlutterBridge's catalog/analyzer simply didn't encode it. No
Category A (compiler defect), C (runtime/generator defect), or D (legitimately unavailable) cases were
found in this investigation — every `BRG3010` `hello_bridge` produced traced to this one root cause.

## Final report

1. **Reproduced fresh**: yes, real analyzer + real generator, `fixtures/apps/hello_bridge`.
2. **Occurrence table**: 10 unique (widget, role) pairs, 18 total occurrences — see table above.
3. **Precise recount**: 18 before, 0 after.
4. **End-to-end trace**: `ThemeData` with no `colorScheme`/`colorSchemeSeed` → analyzer emits nothing for
   those roles (pre-fix) → N10 never runs (no `"seed"` token) → generator finds no role-tagged token for
   `Scaffold`/`AppBar`/`TextField`/`IconButton`/`CircularProgressIndicator` → `BRG3010`.
5. **Architecture audited**: ADR-13, ADR-18, M4-B/C/E, N10, schema, catalog, runtime — see above.
6. **46 roles verified programmatically** against N10's own `ROLES` array — exact set match.
7. **`ColorScheme` vs `ThemeData` distinguished**: fix is `ThemeData`-only; `ColorScheme` constructions are
   untouched.
8. **SDK read directly**: `theme_data.dart`, factory constructor and `_colorSchemeLightM3`/
   `_colorSchemeDarkM3` constants — not from memory or generic docs.
9. **Explicit-vs-derived precedence tested**: 4 dedicated suppression tests, all passing, all mutation-
   checked as vacuous-without-the-feature (confirming 1/6 are the real proof).
10. **Classification**: all 10 pairs are Category B. No A/C/D found.
11. **INV-20 enforced**: every new token's value is a literal read from the SDK's own constant, at compile
    time, in the analyzer only — never a runtime fallback, never a generator-side literal.
12. **N10 stays widget-neutral**: zero lines changed in `n10_theme_tokenize.ts`.
13. **MaterialApp audit**: `theme:`/`darkTheme:`/`themeMode:` extraction unaffected; M4-G's no-`MaterialApp`
    decision untouched; `themeMode` switching still unimplemented (`BRG3016` still fires).
14. **Minimal implementation**: catalog data + one new `tokensOf` branch + one helper (`_usesMaterial3`).
15. **Real-analyzer-only testing**: all 6 new tests run the real pipeline; no hand-authored UIR is primary
    proof.
16. **Build-proof fixture**: not added — real `hello_bridge` demonstrates the fix directly (see above).
17. **Browser proof**: deliberately skipped — see rationale above; consumption path already browser-proven
    by M4-B/M4-G.
18. **Light/dark determinism**: verified via the light/dark test (item 6 above) — both palettes are
    distinct, literal, and deterministic; `themeMode` switching itself remains unimplemented.
19. **`hello_bridge` before/after**: 27→9 errors, 18→0 `BRG3010`, all other categories unchanged — see
    table above.
20. **Scope discipline**: `Duration`/`Future`, multi-hop, named routes, general async, `themeMode` — none
    touched, all still present in the diagnostic output at the same counts.
21. **Regression — M7-J**: not re-run in full (no theme-related surface); `async_push_guard` golden
    byte-identical, confirming no interaction.
22. **Regression — M7-F/G/H**: `promoted_counter`, `inline_push_props` goldens byte-identical.
23. **Determinism**: 3× byte-identical `hello_bridge` analyze; `just determinism` green across all four
    e2e-covered fixtures.
24. **Fixed point**: `bridge normalize` run twice — zero further change on the second pass.
25. **Schema/catalog codegen**: `pnpm run codegen:check` clean; no schema change this milestone (catalog
    only).
26. **Full validation gate**: `just ci` exit 0.
27. **Performance**: not measured — no regression suspected or reported; the fix adds a bounded, fixed
    46-entry map lookup per `ThemeData` construction, not a loop or an algorithm.
28. **Documentation**: this file. No ADR amendment — see "Architecture audit" above for why.
29. **Anti-scope-creep**: no zero-diagnostics chase; 9 legitimate, pre-existing, out-of-scope errors remain
    in `hello_bridge` and are documented as such, not worked around.
30. **STOP CONDITIONS**: none triggered. Every missing role was Category B and directly evidenced by the
    SDK; no role required inventing a colour, no widget-specific knowledge entered N10, no arbitrary literal
    fallback was needed, no `themeMode`/`Future`/`Duration`/multi-hop work was needed, no diagnostic was
    weakened, no generator-side name inference was added, and the SDK never contradicted an assumed default.
31. **Commit discipline**: `git status`/`git diff --stat` reviewed; the routine `analysis_options.yaml`
    auto-drift reverted before staging; only the files listed in "Implementation"/"Tests" above committed.
32. **Commit/push**: `feat(m7): complete material theme token lowering`, pushed after the full gate went
    green.
33. **Do not start M7-L**: honored — this response ends the milestone at M7-K.
