# M8-V — Dart Numeric / SDK-Method Recognition

Baseline: `4e60b0c` (M8-U, "narrow top-level function module emission").

## 1. Baseline — PROVEN

Fresh checkout at `4e60b0c`, `just install && just build`: 11/11 turbo tasks succeed. `just test`: 27 test
files, 276 tests, all green. `just typecheck`, `just lint`: clean. This is the exact state M8-U's own
final report certified — re-confirmed, not assumed.

## 2. What M8-U left open

M8-U's own §10 identified two independent, honestly-reported gaps, found by direct `tsc` verification on
a fixture reproducing Continuum's real `formatUptime`/`formatBytes` bodies:

1. **`Duration`-typed parameters** emit as `d: unknown` (`typeTextOf` has no entry for `Duration`), so
   `tsc` refuses `d.inMinutes` with `TS18046`.
2. **`int.toDouble()`/`double.toStringAsFixed()`** have no case in the generic `logic.MethodCall` emitter,
   so `tsc` refuses `bytes.toDouble()` — no such method on a JS `number`.

Both are independent of ADR-29's own module-emission architecture (which M8-U proved sound on 11 other
real-corpus-shaped rungs). This milestone targets exactly these two gaps and nothing else.

## 3. Real-source census — fresh, direct `grep` over Continuum's own source, not cited from memory

```
packages/ui-kit/lib/continuum_ui_kit.dart:18    var value = bytes.toDouble();
packages/ui-kit/lib/continuum_ui_kit.dart:24    return '${value.toStringAsFixed(unit == 0 ? 0 : 1)} ${units[unit]}';
packages/ui-kit/lib/src/settings_page.dart:27   if (d.inMinutes < 1) return '${d.inSeconds}s';
packages/ui-kit/lib/src/settings_page.dart:28   if (d.inHours < 1) return '${d.inMinutes}m';
packages/ui-kit/lib/src/settings_page.dart:29   return '${d.inHours}h ${d.inMinutes.remainder(60)}m';
packages/protocol/lib/src/clipboard_staging.dart:83   expiresAtMs: now + lifetime.inMilliseconds,
packages/protocol/lib/src/clipboard_module.dart:113   ttlSeconds: staging.ttl.inSeconds,
```

Six real call sites, four distinct Duration getters (`inMinutes`, `inSeconds`, `inHours`,
`inMilliseconds`), three numeric methods (`toDouble`, `toStringAsFixed`, `remainder`). No
`inDays`/`inMicroseconds`/`ceil`/`floor`/`round`/other numeric SDK member appears anywhere in real
Continuum source. This is the exact, complete scope this milestone implements — nothing wider.

`formatUptime` (`settings_page.dart:26-30`) and `formatBytes` (`continuum_ui_kit.dart:16-25`) are the two
functions M8-U's own gate named; `clipboard_staging.dart`/`clipboard_module.dart` are two more real sites
using the identical getters, confirming the scope isn't a two-function special case.

## 4. Identity — what UIR already carries, proven sufficient without a schema change

Every `logic.PropertyAccess`/`logic.MethodCall`'s `receiver` carries a resolved `type: {name, library,
nullable}` (the same shape `logic.New`'s own `isKitProvided` check and `logic.Ref`'s enum/static-const
branches already rely on). For every one of the six real sites above, `receiver.type.library` resolves to
literally `'dart:core'` — confirmed by inspecting the raw `bridge analyze --json` output for
`fixtures/apps/numeric_sdk` (this milestone's own fixture, §7) directly, not assumed from the schema
alone.

**Outcome: (A)** — the existing UIR already carries everything needed. No schema change, no ADR. A
project-defined lookalike (see §6) resolves to `library: 'package:<own>/...'`, never `dart:core:'` — proven
directly, not by construction alone.

## 5. Reduction ladders — real Dart, `fixtures/apps/numeric_sdk`

Three short ladders, each stopping at the real Continuum shape rather than enumerating the full SDK:

**Duration**: literal construction (`const Duration(seconds: 5)`) → parameter + `inSeconds`/`inMinutes`/
`inHours` → nullable parameter → the exact `formatUptime` body (early-return chain + `.remainder`).

**toDouble**: int literal → int variable → arithmetic-expression receiver → the exact `formatBytes` body
(`bytes.toDouble()` opening a `while` loop).

**toStringAsFixed**: double variable + fixed precision → int-derived (`bytes.toDouble().toStringAsFixed(1)`,
`formatBytes`'s own shape) → variable precision argument.

Every rung is real, `flutter analyze`-clean Dart in `fixtures/apps/numeric_sdk/lib/main.dart`, run through
the real `bridge_analyzer`. No hand-authored UIR anywhere in the positive fixture.

## 6. Negative controls — project-defined lookalikes, proven by resolved identity

Two project-defined classes were built and run through the real analyzer to confirm `sdkTypeOf`'s premise
directly, not just assumed from the schema doc:

```dart
class FakeNumber {
  double toDouble() => 0;
  String toStringAsFixed(int n) => '';
}
class MyDuration {
  final int inSeconds;
  MyDuration(this.inSeconds);
}
```

Both resolve `receiver.type.library` to `package:numeric_sdk/negative_controls.dart` in real analyzer
output — never `dart:core`. (Per M8-U's own precedent, these live outside the positive/`tsc`-proof
fixture's reachable render tree — referencing them there trips the pre-existing, unrelated `logic.New`
class-instantiation refusal and poisons the whole file's emission, since any error blocks all output for
that module. They are instead proven via synthetic-UIR unit tests,
`packages/generators/react/tests/numeric_sdk_recognition.test.ts`, which construct
`logic.PropertyAccess`/`logic.MethodCall` nodes directly with an explicit `receiver.type.library` of
`'package:app/main.dart'` and assert the SDK lowering does **not** fire.)

## 7. Semantic equivalence — Dart vs JavaScript, checked before any lowering was accepted

- **`int.toDouble()`**: a no-op. JS `number` already *is* the IEEE-754 binary64 value Dart's own `double`
  is; nothing changes representation crossing this call. Every Dart `int` this project emits is already
  restricted to the JS-safe-integer domain at the canonical-encoding layer (D2/ADR-5), before this code is
  ever reached, so there is no magnitude this elision could silently misrepresent.
- **`.remainder(other)`**: Dart's own truncating remainder (`this == (this ~/ other) * other +
  this.remainder(other)`, same sign as the dividend) is exactly JavaScript's `%` — **not** Dart's own `%`
  operator, which differs from JS's (`-7 % 3` is `2` in Dart, `-1` in JS; `logic.Assign`'s own doc already
  warns about this). Only `.remainder()` matches JS's `%`; that identity, not an approximation of the
  other one, is what §9's implementation uses.
- **`.toStringAsFixed(n)` → `.toFixed(n)`**: both Dart's `double` and JS's `number` are IEEE-754 binary64
  — the same bits. For a finite value the two formatters diverge only at rounding boundaries both
  languages already define identically (round-half-to-even at the same binary representation). `NaN`/
  `Infinity` format as the identical text (`"NaN"`/`"Infinity"`) in both languages — no special case
  needed. Both languages also switch to exponential notation at the identical magnitude threshold
  (`>= 1e21`), so no divergence there either. Valid precision ranges differ (Dart: 0–20, throws outside;
  JS: 0–100 in current engines) — every valid Dart call is also a valid JS call, so this is a one-directional
  superset, not a divergence.
- **`Duration` getters**: the runtime kit's own `Duration` class (M7-L, `animation.ts`) stores
  `inMilliseconds: number`. Dart's own `Duration` stores whole microseconds internally and every getter
  (`inSeconds`, `inMinutes`, `inHours`) computes by truncating division toward zero — `Math.trunc(millis /
  N)` matches this exactly, for both positive and negative durations.
- **Genuine divergence found, and knowingly accepted (see §14, silent-wrong-code audit)**: Dart's
  `int.remainder(0)` throws at runtime; JavaScript's `%` never throws and produces `NaN`. No real
  Continuum site divides by anything but a hardcoded, nonzero literal (`.remainder(60)`), so this is
  documented rather than guarded against — guarding it would mean inventing a runtime check no real
  evidence asks for.

## 8. Duration representation — reused, not reinvented

The runtime kit already exports a `Duration` class (M7-L, built for `Future.delayed`) exposing exactly one
field, `inMilliseconds: number`. This milestone does not add a second representation — every getter lowers
to arithmetic over that one existing field. `isKitProvided`/`SDK_VALUE_TYPES` already recognized
`dart:core#Duration` for **construction** (`logic.New`) before this milestone; the gap was only in
*reading* a `Duration`-typed parameter/property, addressed in §9.

## 9. ADR/schema gate

**No new ADR, no schema change.** §4 already established that UIR's existing `{library, name}` type
identity is sufficient. This milestone is a direct generalization of a pattern the codebase already uses
twice — `isKitProvided` (`runtime.ts`, M4-H, for `logic.New`) and `typeTextOf`'s primitive table
(`types.ts`) — into two more call sites: parameter/property **type position** (`typeTextOf`) and
**property/method-call lowering** (`expression.ts`). Nothing here contradicts Specification v2.0; no ADR
was written.

## 10. Implementation — three gates

**Gate A — Duration.** `types.ts` gains `SDK_VALUE_TYPE_NAMES = {'dart:core#Duration'}` and an optional
`use: (name: string) => string` parameter on `typeTextOf`/`paramListOf`, forwarded from `functions.ts`'s
own per-attempt `scratch` `ModuleBuilder` (so a failed attempt's import request never leaks — the same
discipline ADR-29 §7 already established for the rest of a function's body). Omitted callers
(`component.ts`, `store.ts`) are unaffected — a `Duration`-typed component prop or store field still
emits `unknown`, unchanged, since no real evidence asked for that path.

**Gate B — Duration getters.** `expression.ts` gains `sdkTypeOf(type)` (returns the resolved name iff
`type.library === 'dart:core'`) and `DURATION_GETTERS` (`inMilliseconds`/`inSeconds`/`inMinutes`/
`inHours`, per §3's exact scope). In `logic.PropertyAccess`, after the existing `storeAccessRead` check:
if the receiver's resolved type is `Duration`, look up the getter; found → emit the arithmetic; not found
→ an explicit `UnsupportedExpression` refusal naming exactly what is supported (never silent passthrough);
otherwise falls through unchanged to the generic `receiver.property` lowering.

**Gate C — numeric methods.** In `logic.MethodCall`, after the existing `[]`-subscript special case: if
the receiver's resolved type is `int`/`double`/`num`, `toDouble()` (no-op), `remainder(x)` (`% `), and
`toStringAsFixed(n)` (`.toFixed(n)`) lower per §7; any other method on a proven-SDK-numeric receiver is an
explicit refusal; otherwise falls through unchanged.

All three gates share the identical structural check (`sdkTypeOf`) and the identical shape: recognize,
lower, or explicitly refuse — never guess, never silently pass through wrong code.

## 11. `formatUptime` — end-to-end proof

`fixtures/apps/numeric_sdk/lib/main.dart`'s `formatUptimeLike` is a verbatim reproduction of the real
body. `numeric_sdk_build.test.ts` proves: zero generator errors; `d: Duration` (not `unknown`); each
getter lowers to `Math.trunc(d.inMilliseconds / N)`; `.remainder(60)` lowers to `(Math.trunc(d.inMilliseconds
/ 60000) % 60)`, never `.remainder(`; and the whole fixture — Flutter → real analyzer → real N1–N11
normalize → this generator → real `tsc` against the real, unmocked `@bridge/runtime-react` — typechecks
with zero errors.

## 12. `formatBytes` — end-to-end proof

`formatBytesLike` is a verbatim reproduction of the real body — the `while` loop, mutable locals, list
literal, indexing, ternary precision argument, `.toDouble()`, `.toStringAsFixed()`. Same test file proves:
`bytes: number` parameter; `bytes.toDouble()` elided (receiver text alone, no `.toDouble()` in output);
`value.toFixed((unit === 0) ? 0 : 1)` in place of `.toStringAsFixed(...)`; zero generator errors; the same
real-`tsc` proof passes.

## 13. Negative controls — preserved, `numeric_sdk_recognition.test.ts`, 10 cases

| Case | Expectation |
|---|---|
| `Duration.inSeconds` on real `dart:core Duration` | lowers to `Math.trunc(.../1000)` |
| same getter on a project-defined lookalike | untouched, `props.d.inSeconds`, no `Math.trunc` |
| `Duration.inDays` (unrecognized) on real `Duration` | explicit refusal naming `Duration.inDays`, never silently passed through |
| `int.toDouble()` on real `dart:core int` | no-op |
| `.toDouble()` on project-defined `FakeNumber` | untouched, `props.f.toDouble()` |
| `double.toStringAsFixed(n)` on real `dart:core double` | `.toFixed(n)` |
| `.toStringAsFixed(n)` on project-defined `FakeNumber` | untouched, `props.f.toStringAsFixed(2)` |
| `int.remainder(n)` | `(props.n % 60)` |
| `int.ceil()` (unrecognized) on real `dart:core int` | explicit refusal naming `int.ceil` |
| a receiver with no resolved type | untouched, ordinary lowering (safe default) |

All 10 pass. Every positive case is keyed on the receiver's own resolved `type.library`, never on the
property/method's bare name; every negative case proves a same-named, differently-owned member is left
completely alone.

## 14. Silent-wrong-code audit (a passing `tsc` build is necessary, not sufficient)

- **Rounding/truncation**: `Math.trunc` for Duration getters matches Dart's own truncating division for
  both positive and negative durations — checked, not assumed.
- **Int/double coercion**: `.toDouble()`'s elision relies on the project's own pre-existing JS-safe-integer
  domain restriction (D2/ADR-5); outside that domain this project already refuses the value earlier, before
  this code runs.
- **`remainder(0)` divergence (found, accepted, documented)**: Dart's `int.remainder(0)` throws at
  runtime; the lowered `%` never throws, silently producing `NaN`. No real Continuum site divides by a
  non-literal or zero-valued expression — the only real site is `.remainder(60)`, a hardcoded nonzero
  literal — so this is recorded as a known, narrow, currently-unreachable divergence rather than guarded
  against speculatively.
- **Extension-method shadowing (found, structural, currently unreachable)**: `logic.MethodCall`'s own UIR
  shape (`packages/uir/src/generated/uir.ts`) carries only the receiver's type and the method's bare
  name — no field identifies the *method's own* declaring library. A hypothetical project-defined
  `extension on int { double toDouble() => ...; }` would be silently given SDK semantics, because
  `sdkTypeOf` can only see the receiver's type, not which declaration the call actually resolves to.
  Checked directly: `grep -rn "^extension" continuum` finds no extension methods anywhere in real
  Continuum source, so this is a genuine but currently evidence-free structural gap — fixing it would need
  a UIR schema addition (the method call's own resolved declaration), which is out of this milestone's
  scope per rule 1 (no interface change without a proven contradiction) and per real evidence (none
  exists). Recorded here so it is not rediscovered as a surprise.
- **Nullability**: a `Duration?` parameter emits `Duration | null` (§10 Gate A, `nullable` forwarded
  unchanged through `typeTextOf`); `describeNullableDuration` in the fixture proves the type position.
  No real site does null-aware (`?.`) Duration property access — out of scope, unevidenced.
- **Dynamic/untyped receivers**: proven safe by the last negative-control case (§13) — a receiver with no
  resolved type falls through to the pre-existing generic lowering unchanged, never a false-positive SDK
  match.
- **Negative numbers, large values**: `Math.trunc`'s toward-zero rounding and IEEE-754 binary64
  `.toFixed`/`%` are exact matches at the language-semantics level (§7); no project-specific magnitude
  restriction beyond the pre-existing int domain applies to `double`.

## 15. Real Continuum before/after — both app targets, diagnostic composition, not just totals

Fresh `bridge analyze --json` + `bridge generate --json`, `apps/macos/mac` and `apps/android/droid`,
before (`4e60b0c`, a disposable worktree) vs after (this uncommitted diff):

| | mac before | mac after | droid before | droid after |
|---|---:|---:|---:|---:|
| `BRG3001` | 14 | 14 | 15 | 15 |
| `BRG3002` | 12 | 12 | 13 | 13 |
| `BRG3004` | 8 | 8 | 12 | 12 |
| `BRG3005` | 1 | 1 | 1 | 1 |
| `BRG3006` | 15 | 15 | 15 | 15 |
| `BRG3008` | 1 | 1 | 1 | 1 |
| `BRG3013` | 7 | 7 | 7 | 7 |
| files emitted | 0 | 0 | 0 | 0 |

**Byte-identical before/after, both targets.** This is expected, not a sign the fix is inert: `formatUptime`
and `formatBytes` already produced **zero** generator-level diagnostics after M8-U (§2) — their own gap
was purely at the `tsc` level, invisible to analyzer/generator diagnostic counts. Continuum's own
`generate` still aborts at 0 files in both apps (`BRG3005`, the all-or-nothing rule) because of ~40–44
*other*, independent, already-catalogued blockers this milestone does not touch (`Theme.of`, inline
navigation, `DateTime`/`File` class emission, named-argument calls, `ScaffoldMessenger`/`showDialog`
overlays, `DropTarget`/`SwitchListTile` widget mappings, N11 cross-route promotion, and more). Continuum's
own pipeline therefore never reaches a `tsc` step at all — this milestone's real effect is provable only
on the isolated, real-corpus-shaped fixture (§11, §12), exactly as M8-U's own §14 established for the
identical reason.

`describeTransferFailure`'s own diagnostic (an unrelated switch-expression blocker) is confirmed
byte-identical before and after, both targets:
> `` `describeTransferFailure` is a project-defined top-level function, and this generator does not yet
> lower a `logic.FunctionDecl` to a module-level TypeScript function. That work belongs to this generator. ``

## 16. Regression proof

`git diff 4e60b0c --stat` touches exactly three generator source files (`expression.ts`, `functions.ts`,
`types.ts`), one test-support file (`support.ts`), and adds new fixtures/tests — **no existing test file
for any prior milestone was modified.** The full suite (27 files, 294 tests — 276 from before this
milestone plus 18 new) passes green, which is the direct regression proof for every named milestone's own
dedicated test file: `local_variables_build.test.ts` (M7-N), `structured_build_build.test.ts` (M8-B),
`enum_reference.test.ts` (M8-D), `cross_package_build.test.ts` (M8-F), `toplevel_function_reference.test.ts`/
`toplevel_field_reference.test.ts` (M8-J, M8-L, M8-P), `transitive_action_reference.test.ts`/
`transitive_actions_build.test.ts` (M8-O), `promotion_build.test.ts` (M8-R), `catch_clause_build.test.ts`/
`catch_clause_reference.test.ts` (M8-S), and — especially — `module_emission_build.test.ts`/
`function_module_emission_refusals.test.ts` (M8-U), run **unchanged** and still green, confirming ADR-29's
own module-emission semantics were not altered to accommodate numeric SDK recognition; Gate A/B/C are
additive checks inserted before each existing branch's own fallback, never a rewrite of it.

## 17. A real, pre-existing CLI bug found along the way (not fixed — out of scope, filed here)

While setting up `bridge validate`/`bridge build` runs for this milestone's own validation gate (§18),
both commands failed with "the analyzer produced no document to normalize" against a scratch project whose
`bridge.json` used *absolute* `work`/`out` paths — even though `bridge analyze` run standalone, with the
identical config, succeeded and wrote the file correctly. Root cause: `packages/cli/src/internal/commands/
build.ts` computes its own `raw`/`work` path via a raw `path.join(project.root, project.config.work)`,
while `bridge analyze`/`bridge generate` (`project.ts`) use a separate `at()` helper. `path.join` does not
treat a later absolute-looking segment as an override the way `path.resolve` would, so an absolute `work`
silently produces a bogus nested path under `project.root`, and `build()`'s own `existsSync(raw)` check
fails even though `analyze()` wrote the real file to the correct place. Worked around for this milestone's
own measurements by using relative `work`/`out` paths; not fixed here — it is in `packages/cli`, a package
this milestone does not otherwise touch, and per this repo's own rule 4 ("file it as an implementation
issue, do not redesign the interface") it is recorded here rather than patched inline.

## 18. Validation

- `just typecheck`: clean (19/19 tasks).
- `just lint`: clean (`lint:deps`, `lint:stubs` — 15 pre-existing tagged stubs, unchanged — `lint:portability`).
- `just test`: 27 files, 294 tests, all green.
- `bridge validate --json` on `fixtures/apps/numeric_sdk` (relative `work`/`out`, per §17's workaround):
  `{"ok": true, "checks": [{"deterministic": true}, {"fixed point": true}]}`.
- `just determinism`: full e2e harness (`npm install` + `next build` + Chromium drive) across the 5 tracked
  apps — green.
- `git diff --check`: clean, no whitespace errors.

## 19. Scope discipline — what this milestone explicitly did not do

No `FieldDecl` work, no switch-expression/`BRG2301`/`BRG2303` work, no `Theme.of`, no `sig.Effect`, no
parameter/N5/N11 work, no ADR-29 reopening — module emission's own architecture and refusal boundary are
untouched (§16). No Dart SDK member beyond the seven real call sites in §3 was implemented — `inDays`,
`ceil`, `floor`, `round`, `Duration.zero`, and every other numeric/Duration SDK member remain unsupported,
on purpose, pending their own real evidence.

## 20. Fresh post-M8-V blocker census

Read-only, both apps, from the identical `generate --json` runs already captured in §15 (not re-run —
already fresh and complete). Non-`BRG3013` counts are unchanged from M8-T/M8-U's own census and are not
re-derived here; the `BRG3013` breakdown (unchanged at 7/7, both apps, per §15) is:

| Site | Cause | Owner |
|---|---|---|
| `_log` top-level variable (×2, same declaration) | `logic.FieldDecl` has no module-level lowering | generator |
| `Navigator.of` imperative navigation | no `logic.Navigate` UIR node for the transition | UIR schema (ADR-0025 D2) |
| `SettingsPage` cross-route push (N11 promotion) | boundary arguments not promoted into a store | schema/N11 (ADR-11) |
| `ScaffoldMessenger.of` | messenger overlay has no ADR | schema (needs a new ADR) |
| `showDialog` | route overlay, same `logic.Navigate` gap | UIR schema (ADR-0025 D2) |
| `describeTransferFailure` | switch-expression opacity, extraction-side | out of scope, unrelated |

Every one of these is already independently catalogued (M8-T's own census); none is newly discovered by
this milestone, and none involves numeric/Duration SDK recognition — confirming §15's own claim that this
milestone's fix, while real and proven on the isolated fixture, does not move Continuum's own end-to-end
build past its next blocker, because none of Continuum's remaining blockers are numeric/Duration-shaped.

**No M8-W topic is preselected.** Of the six remaining `BRG3013`-class sites, three (`Navigator.of`,
`ScaffoldMessenger.of`, `showDialog`) share one root cause — the missing `logic.Navigate`/route-overlay UIR
construct (ADR-0025 D2) — which is schema work, not generator work, and therefore a different kind of
milestone than M8-U/M8-V. `_log` (`FieldDecl` module emission) is the one generator-only, ADR-29-adjacent
candidate structurally closest to this milestone's own kind of work, but this report does not recommend
it over the others — that ranking is for whichever fresh census the next milestone runs, per this
project's own standing instruction not to preselect.

## 21. Commit

Only the intended M8-V files are staged: `packages/generators/react/src/internal/emit/{expression,
functions,types}.ts`, `packages/generators/react/tests/support.ts`, `packages/generators/react/tests/
{numeric_sdk_build,numeric_sdk_recognition}.test.ts`, `fixtures/apps/numeric_sdk/`, `fixtures/uir/
numeric_sdk.ndjson`, this document. `fixtures/apps/hello_bridge/analysis_options.yaml`'s own pre-existing,
unrelated `flutter analyze` auto-modification drift is left unstaged, per established convention.
