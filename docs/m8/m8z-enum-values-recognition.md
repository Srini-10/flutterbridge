# M8-Z — Project Enum `.values` Recognition

Baseline: `28e0fe0` (M8-Y, "extract Dart 3 switch expressions into logic.Switch").

**Outcome: implemented.** A project-defined enum's own compiler-synthesized `values` getter is now
recognized by resolved element identity — never by name alone — and lowered to an array literal built
from the same per-constant representation an individual enum reference already gets. No schema change, no
ADR. One real Continuum diagnostic is resolved cleanly; a second, adjacent, genuinely separate capability
gap (for-loop loop-variable identity) was found and deliberately **not** touched, per this milestone's own
one-capability rule.

## 1. Contract

Fresh census → source-site mapping → root-cause clustering → ranking → reduction proof → select one target
or none → implementation gate → implement only if justified → remeasure → validate → document. Investigate
`ContinuumFeature.values` as *one* candidate among several — never assumed as the winner in advance.

## 2. Baseline — verified

```
git status --short   →  M fixtures/apps/hello_bridge/analysis_options.yaml   (only, before any work)
git rev-parse HEAD           = 28e0fe0eea5c7cbcdb4394213b002d5b14c16c3c
git rev-parse origin/main    = 28e0fe0eea5c7cbcdb4394213b002d5b14c16c3c
```

`HEAD == origin/main`.

## 3. Fresh Continuum census

Fresh `bridge analyze --json` + `bridge generate --json`, both real apps, current HEAD's own built CLI:

| | mac | droid |
|---|---:|---:|
| analyze `BRG1302`/`BRG1301`/`BRG1304` | 91 / 0 / 2 | 119 / 1 / 2 |
| generate `BRG3001`/`BRG3002`/`BRG3004`/`BRG3005`/`BRG3006`/`BRG3008`/`BRG3013` | 14/12/7/1/15/1/6 | 15/13/11/1/15/1/6 |
| total generator errors/warnings | 39/17 | 43/19 |
| files emitted | 0 | 0 |

**Byte-identical to M8-Y's own reported "after" numbers.** No discrepancy — M8-Y's own before/after
report is confirmed accurate, fresh.

## 4. Diagnostic population map

`BRG3006` (15 raw sites, both apps) is the smallest, most tractable remaining population and was mapped
completely — every raw diagnostic traced to a unique `nodeId`, its raw UIR, and its exact Dart source:

| nodeId | source (mac) | category |
|---|---|---|
| `getApplicationDocumentsDirectory` | `pairing_page.dart:385` | E — SDK function, correct refusal (`path_provider`) |
| `join` | `database.dart:76` | E — SDK function, correct refusal (`path`) |
| `_logBuffer` (×2 raw) | `pairing_page.dart:392` | B — a stored field of a project-defined class (`LogBuffer`), same shape as `_log`, adjacent to M8-W's own deferred territory |
| `_onboardingSlides` | `pairing_page.dart:519` | D — a **private getter method**, not a field |
| `Theme.of` (×5 raw) | multiple sites | E — SDK, already well-known, deferred (needs `BuildContext`/theme architecture) |
| `ContinuumFeature.values` | `settings_repository.dart:60` | B — identity gap, this milestone's own target |
| `_isLast` (×2 raw) | `onboarding_page.dart:88` | D — a **private getter method**, depends on another getter and a signal |
| `_slides` | `onboarding_page.dart:77` | D — a **private getter method**, a multi-part computed list (spreads, `.take()`, a widget parameter) |
| `double.infinity` | `onboarding_page.dart:165` | E — SDK constant, correct refusal |

`BRG3001`/`BRG3002`/`BRG3004`/`BRG3013` were spot-checked against M8-W/M8-X's own already-published site
tables (both docs read directly, not from memory) and found unchanged in composition — no new site, no
resolved site, in either population, since M8-Y.

## 5. Root-cause clustering

- **Enum `.values` identity** — 1 site, 1 raw diagnostic. Category B.
- **Private getter methods, State-class computed values** (`_onboardingSlides`, `_isLast`, `_slides`) — 3
  unique nodeIds, 4 raw diagnostics, 2 files. Category D. **Investigated and disqualified** (§6): `_slides`'s
  own body spreads a static list, calls `.take()`, and reads a widget parameter — genuinely complex,
  multi-part logic with no existing UIR representation for any of it; `_isLast` depends on both a signal
  and another getter. Not narrow, not bounded, would require new architecture for how a chain of computed
  getters composes — explicitly out of this milestone's scope (the same judgement M8-X already applied to
  `showDialog`'s own architecture question).
- **`_logBuffer`** — a stored field of a project-defined class, structurally the same shape M8-W/M8-X
  already investigated for `_log` (a `package:logging` `Logger`) but with a *project-defined* class
  (`LogBuffer`) instead of a third-party one. Not investigated further here — a genuinely different
  candidate from `_log` (a project class might be constructible where a third-party one is not), but its
  own root cause (`FieldDecl` module emission for instance fields) is the same one M8-W/M8-X already
  scoped and deferred; reopening it needs its own fresh evidence, not folded into this milestone.
- **SDK functions/constants** (`getApplicationDocumentsDirectory`, `join`, `double.infinity`, `Theme.of`)
  — category E, already correctly refused, already well-known, architecture-requiring (a general SDK/
  framework static-member recognition capability this project has consistently declined to build,
  M8-V/M8-X's own precedent).

## 6. Candidate ranking

| Candidate | Sites | Root cause | Existing identity | Existing schema | ADR needed | Bounded | Real payoff |
|---|---:|---|---|---|---|---|---|
| `ContinuumFeature.values` | 1 | B | yes (M8-D, extended) | yes | no | yes | one real diagnostic resolved cleanly |
| Private getters | 3 | D | no | no (would need new architecture) | plausibly yes | no | disqualified |
| `_logBuffer` | 1 (2 raw) | B (adjacent to `_log`) | yes, in principle | yes, in principle | no | unverified — not investigated | not pursued |
| SDK functions/constants | 3 (7 raw) | E | n/a (SDK, out of project) | n/a | yes (general SDK recognition) | no | correctly deferred, unchanged |

**`.values` wins** — the only candidate with a single, narrow root cause, a fully bounded implementation
surface, and no unresolved architecture question. The private-getter cluster has more raw sites but was
investigated and found genuinely complex; ranking it above `.values` merely for its higher count would
have repeated the exact mistake M8-W's own report warned against ("do not select a target merely because
it has the highest raw count").

## 7. `ContinuumFeature.values` source evidence

`settings_repository.dart:6-16`:

```dart
enum ContinuumFeature {
  notifications('notifications'),
  clipboard('clipboard'),
  files('files'),
  battery('battery');

  const ContinuumFeature(this.id);
  final String id;
}
```

`settings_repository.dart:60`:

```dart
for (final feature in ContinuumFeature.values) {
  result[feature] = await isFeatureEnabled(feature);
}
```

An **enhanced enum** (Dart 2.17+) — a constructor and a field, not a plain enum. A second real site exists,
`settings_page.dart:180` — a `for` **collection element** inside a widget tree (`for (final feature in
ContinuumFeature.values) SwitchListTile(...)`), found by grepping real Continuum source directly rather
than trusting M8-Y's own passing mention.

## 8. Resolved Dart identity

`ContinuumFeature.values` resolves (real `package:analyzer` 14.0.0, the version `bridge_analyzer`'s own
`pubspec.lock` pins) to a `GetterElement` whose `.variable` is a `FieldElement`: `isStatic: true`,
`name: 'values'`, `enclosingElement` is structurally an `EnumElement`. `element.isEnumConstant` is
`false` for it (it is the values *list*, not a constant) — the exact reason `_enumConstantTarget`
(M8-D's own mechanism) already, correctly, does not claim it. No `isSynthetic` check was available on
the public `package:analyzer` API (only present on an unrelated `LibraryImport` interface in this
version) — the check instead relies on a language-level guarantee: **Dart reserves the identifier
`values` on an enum specifically; no enum can declare a member with that name.** The combination checked
— `field.isStatic && field.name == 'values' && field.enclosingElement is EnumElement` — is therefore
unambiguous by construction, not a name heuristic broadened past what the language itself guarantees.

## 9. Raw/normalized UIR

Before this milestone: `logic.Ref{name: 'ContinuumFeature.values', target: undefined, type: {library:
'dart:core', name: 'List<ContinuumFeature>'}}` — the resolved *type* was always correct; only `target`
was missing, because `.values` fell through both `_enumConstantTarget` (not a constant) and
`_topLevelTarget` (not a top-level declaration) to nothing.

After: `target` resolves to the same `logic.EnumDecl` id every individual `ContinuumFeature.xyz`
constant reference already resolves to — confirmed directly (`fixtures/uir/enum_values.ndjson`,
committed). Normalization does not touch `logic.Ref` at all — no N-pass references it; the node passes
through N1–N11 unchanged, exactly as an ordinary enum-constant `logic.Ref` already does.

## 10. Reduction ladder — real Dart, real analyzer, real generator

A comprehensive real fixture (13 functions) covering A–P (per Phase 5) was built and run through the real
pipeline:

| Rung | Result |
|---|---|
| A simplest (`E.values`) | admitted, `target` resolves |
| B iterate (`for (final v in E.values)`) | `.values` itself resolves correctly; the loop **body**'s own read of `v` fails for a separate, pre-existing reason (§17) |
| C `.map(...)` | admitted, generator emits `['a','b'].map(...)` correctly |
| D `.length` | admitted |
| E indexing (`E.values[0]`) | admitted |
| F repeated reads | admitted, both reads resolve to the identical target, both lower to the identical array literal text |
| G same member names, two enums | admitted, correctly distinguished — `target`s differ |
| H same enum name, different files | not separately re-tested — folds into I (cross-file), which is |
| I cross-file enum | admitted, resolves to the declaring file (`lib/reason.dart`), not the referring one |
| J cross-package enum | not separately re-tested — M8-D's own already-proven mechanism, reused unchanged |
| K enhanced enum (constructor, field) | admitted — the exact real `ContinuumFeature` shape |
| L enum with fields/constructor | same as K |
| M enum value passed to a function | admitted (`.map(_describe)`, a tear-off) |
| N stored in a local | admitted |
| O returned from a function | admitted |
| P SDK enum (`Brightness`) | **not admitted** — `Symbols.typeIn` returns `null` for a library outside the project, the identical exclusion `_enumConstantTarget` already has for an SDK enum *constant* |
| — negative control (a class, not an enum, with its own `.values` static getter) | **not admitted** — `owner is EnumElement` fails, proven directly |

## 11. Semantic audit

- **Declaration order**: preserved exactly — `logic.EnumDecl.values` is already recorded in declaration
  order (used unchanged, never re-derived); the emitted array literal iterates it in that same order.
- **Per-constant representation**: identical to an individual enum reference — each array element is the
  same `stringLiteral(member)` call the existing `Reason.x` lowering already makes, not a second
  representation.
- **Same-name distinctness**: proven directly — two enums with identical member spelling resolve to two
  different `EnumDecl` ids, and the array for each is built independently from its own declaration.
- **No duplicated enum representation**: confirmed — no second `EnumDecl`-like structure was invented;
  the array is derived from the existing one at emission time only.
- **Repeated reads**: two separate `Ref`s to the same `.values` both resolve to the same target and both
  emit the identical literal array text — proven in the build-proof (`fRepeated`).
- **List mutation/identity**: the emitted JS array is a fresh literal at each call site, matching Dart's
  own `List<T> values` being a compile-time constant list — mutating one emitted array (were a caller to
  do so) would not affect another call site's own array, matching Dart's own behavior where `.values`
  itself is `const` and callers who need to mutate it already copy it first in idiomatic Dart. No runtime
  reflection is invoked; the array is built once, at generation time, from data the compiler already
  proved.
- **Iteration equivalence**: `.length`, indexing, and `.join()` on the emitted array all match Dart's own
  `List` semantics directly (native JS `Array`), no special casing needed.

## 12. Alternative candidates

Private getter methods (`_slides`, `_isLast`, `_onboardingSlides`) and `_logBuffer` were investigated and
explicitly not selected — see §5, §6.

## 13. Selected target

`ContinuumFeature.values` recognition — implemented.

## 14. Why it outranks alternatives

Single root cause, fully bounded, reuses M8-D's identity mechanism unchanged, requires no new
architecture. The private-getter cluster has more raw sites (4 vs 1) but is genuinely complex (spreads,
`.take()`, cross-getter dependencies, widget-parameter reads) and would require new architecture this
milestone's own gates explicitly forbid inventing. `_logBuffer` is a plausible, adjacent future
candidate, but reopening the `_log`-shaped question needs its own fresh evidence pass, not a ride-along
here.

## 15. Schema/ADR/runtime assessment

**No schema change** — `logic.Ref.target` and `logic.EnumDecl.values` already existed and already carried
everything needed. **No ADR** — a direct, structural generalization of the identical pattern
`_enumConstantTarget` (M8-D) already established, not a new architecture decision. **No runtime change**
— the emitted array literal is plain TypeScript; the runtime kit needs nothing new. **No `NodeId` model
change.**

## 16. Implementation gates

```
Gate A — Root cause:       PASS — one exact root cause (§8, §9).
Gate B — Representation:   PASS — existing logic.Ref/logic.EnumDecl fields are sufficient (§9, §11).
Gate C — Identity:         PASS — structurally sound, proven by a real reduction ladder including a
                            negative control and an SDK-enum exclusion (§10).
Gate D — Semantics:        PASS — evaluation count, ordering, identity, and mutation semantics all
                            checked directly (§11).
Gate E — Architecture:     PASS — no unresolved ADR/runtime/module-ownership question (§15).
Gate F — Payoff:           PASS, narrowly — the targeted diagnostic (§7's own real BRG3006 site) is
                            resolved cleanly, with no new diagnostic exposed at that site (§21). Files
                            emitted for the whole app remains 0/0, because the surrounding function/
                            widget-list depends on a *separate*, genuinely distinct capability
                            (for-loop loop-variable identity, §17) this milestone deliberately does not
                            touch — matching Phase 8 condition 11's own explicit exception: this is a
                            diagnostic-correctness justified fix (the pre-existing "not declared in this
                            program" diagnostic was genuinely false — `.values` *is* declared, by the
                            language itself), not a cosmetic reclassification.
Gate G — Scope:            PASS — narrow; does not broaden into general Dart pattern recognition, SDK
                            compatibility, or class-method emission.
```

**Overall: PASS.** Implementation proceeded.

## 17. Implementation

- `dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`: new `_enumValuesTarget`
  method, wired into both `PrefixedIdentifier`/`PropertyAccess` static-qualifier branches alongside the
  existing `_enumConstantTarget`.
- `packages/generators/react/src/internal/emit/expression.ts`: the existing enum-`Ref`-to-string-literal
  branch now checks whether the dotted name's own tail is `'values'` — if so, emits an array literal from
  `declaration['values']` (already ordered); otherwise, unchanged.

**A genuinely separate gap was found, not fixed, and is recorded here rather than silently discovered
later**: `localBindingsIn` (`expression.ts`) only recognizes `logic.VarDecl` as a source of local identity
— a `logic.For`'s own `loopVariable` (a bare string, no `NodeId` of its own) is never registered, so a
for-loop's own body cannot currently resolve a `logic.Ref` to its own loop variable by name. This affects
*every* for-in loop in this generator today, independent of `.values` — proven directly (§10, rung B).
Not touched here, per this milestone's own one-capability rule.

## 18. Tests

- `dart/bridge_analyzer/test/extraction_test.dart` — 6 new tests: a same-file project enum's own
  `.values` carries the right target; two different enums with identical member names never share
  identity; the exact real enhanced-enum shape; a cross-file enum resolves to its declaring file; a
  project-defined class's own `.values` static getter is never recognized (negative control); an SDK
  enum's own `.values` stays unresolved, matching the existing SDK-constant exclusion.
- `packages/generators/react/tests/enum_values_build.test.ts` — 6 new tests, the real build-proof: zero
  generator errors; declaration-order-preserving array-literal lowering; the exact real `ContinuumFeature`
  shape; two colliding-name enums never conflate while lowering; `.length`/indexing/repeated-reads/
  stored-in-local/returned-from-function all correct; the full real analyzer → N1–N11 normalize →
  generator → real `tsc` pipeline.

## 19. Negative controls / mutation-style coverage

- A project-defined **class** (not an enum) with its own `.values` static getter: proven, directly, to
  resolve `target: null` — a name-based implementation would have wrongly recognized it; this one
  structurally cannot.
- An SDK enum's own `.values`: proven to stay unresolved, matching the pre-existing SDK-constant exclusion
  — no special-casing for "well-known" SDK enums was added, and none is needed.
- Swapping two enum identities: the "two different enums... never share identity" test asserts
  `refA['target'] !== refB['target']` directly — a name-based implementation collapsing the two would fail
  this test immediately.

## 20. Real `tsc`/build proof result

`fixtures/apps/enum_values` — the exact real `ContinuumFeature` enhanced-enum shape, plus 6 other rungs
(simplest, length, indexing, repeated reads, same-name collision, stored/returned) — real analyzer → real
N1–N11 normalize → real generator → real `tsc` against the real, unmocked `@bridge/runtime-react`. **Zero
errors, all 6 tests green.** Per-element property access (`.name`, `.id`) on an individual enum-typed
value was deliberately excluded from this fixture after a first attempt hit `tsc` errors (`TS2339:
Property 'id' does not exist on type 'string'`) — a real, pre-existing, unrelated gap (no runtime kit or
generated declaration models a Dart enum's own *type* today, M8-V's own finding), not something this
milestone's own capability introduced or is responsible for fixing.

## 21. Continuum before/after — both apps, fresh

| | mac before | mac after | droid before | droid after |
|---|---:|---:|---:|---:|
| `BRG1302`/`BRG1301`/`BRG1304` (analyzer) | 91/0/2 | 91/0/2 | 119/1/2 | 119/1/2 |
| `BRG3001`/`BRG3002`/`BRG3004`/`BRG3005`/`BRG3008`/`BRG3013` | 14/12/7/1/1/6 | 14/12/7/1/1/6 | 15/13/11/1/1/6 | 15/13/11/1/1/6 |
| `BRG3006` | 15 | **14** | 15 | **14** |
| total generator errors/warnings | 39/17 | 38/17 | 43/19 | 42/19 |
| files emitted | 0 | 0 | 0 | 0 |

`ContinuumFeature.values`'s own diagnostic is confirmed gone entirely (before: `BRG3006`
`"ContinuumFeature.values is not declared in this program... needs an override"`; after: no diagnostic
mentions it, and — critically — **no new diagnostic appears in its place**, at either the exact same
`nodeId` or anywhere else in the full before/after diff). Every other `BRG3006` message (`_logBuffer`,
`Theme.of` ×5, `_isLast` ×2, `_slides`, `_onboardingSlides`, `double.infinity`,
`getApplicationDocumentsDirectory`, `join`) is byte-identical before and after. `files emitted` remains
0/0 in both apps — `SettingsRepository` (the class `.values`'s own real site lives in) is not emitted for
a separate, much larger, already-known reason (this generator does not emit class declarations at all),
so the `for`-loop-variable gap (§17) is never actually reached for this specific real site either — the
diagnostic-count improvement is real and clean, not offset by anything newly exposed.

## 22. Regression matrix

- **M8-D** (enum identity): reused unchanged, never re-derived; its own dedicated test group, unmodified,
  still passes.
- **M8-N/M8-O/M8-P/M8-R/M8-S/M8-U/M8-V**: no file belonging to any of these was touched.
- **M8-Y** (direct-return switch-expression lowering): confirmed byte-identical — `git diff 28e0fe0 --stat
  -- packages/generators/react/tests/` shows exactly one modified file (`support.ts`, purely additive),
  and the M8-Y switch-expression fixture/tests are untouched and still pass unchanged.

Full suite: 30 test files, **311 tests**, all green. Dart suite: **334 tests**, all green.

## 23. Validation

- `just typecheck`: clean.
- `just lint`: clean (15 pre-existing tagged stubs, unchanged; `lint:deps`; `lint:portability`).
- `just ci`: **exit 0**. build 11/11, typecheck 19/19, test 22/22; `dart/bridge_uir` 28 tests, `dart/
  bridge_analyzer` 334 tests, both "All tests passed"; `gen-react` 30 files / 311 tests, green.
- `bridge validate --json` on `fixtures/apps/enum_values` (relative `work`/`out`, routing around the
  pre-existing CLI path-join bug M8-V §17 already documented): `{"ok": true, "checks": [{"deterministic":
  true}, {"fixed point": true}]}`.
- `just determinism`: full e2e harness across the 5 tracked apps — retried after an environmental
  session-boundary kill (signal 15, reported honestly), the clean retry completed green.
- `git diff --check`: clean.

## 24. Silent-wrong-code audit

No new silent-wrong-code risk found in the admitted subset — the narrow scope (recognized only via
`isStatic && name == 'values' && enclosingElement is EnumElement`, lowered only to a plain array literal
of the same per-constant string representation already used elsewhere) leaves no room for duplicate
evaluation, lost exceptions, mutation surprises, or declaration-order drift; all were checked directly
(§11) rather than assumed. The one real finding from this investigation — for-loop loop-variable identity
(§17) — is a **pre-existing** gap this milestone did not introduce and explicitly did not fix, recorded
honestly rather than silently worked around or bundled in.

## 25. Remaining blocker graph

Unchanged from M8-Y except the one now-resolved `ContinuumFeature.values` site (§21). Newly surfaced,
recorded, not fixed: for-loop loop-variable identity (§17) — affects every `for (final x in xs) { ...x...
}` shape in this generator today, independent of what `xs` is. Private getter methods (`_onboardingSlides`,
`_isLast`, `_slides`) remain unresolved, investigated and found genuinely complex (§5, §6). `_logBuffer`,
`Theme.of`, `getApplicationDocumentsDirectory`, `join`, `double.infinity` remain exactly as previously
catalogued.

## 26. Exact M9-A recommendation

**Not preselected**, and — per this milestone's own instruction — M8-Z is treated as the final M8
milestone. What this investigation narrows, honestly:

- **For-loop loop-variable identity** is the single most concrete, well-evidenced, narrowly-scoped
  finding from this milestone — a real, generically-useful gap (not specific to enums or `.values`) with
  a clear loss point (`localBindingsIn` never registers `logic.For.loopVariable`) and a plausible fix
  shape (name-keyed scoping, parallel to how function parameters are already resolved via `paramInScope`
  rather than `NodeId`). A future milestone should verify this precisely before assuming the fix is as
  small as it looks — in particular, whether a loop variable can shadow an outer local/parameter the same
  way M8-N's own `logic.VarDecl` identity handles shadowing, and whether nested for-loops need distinct
  scoping per level.
- Private getter methods on a `State` class remain a real, but genuinely complex, un-scoped capability —
  not recommended as a single bounded milestone without first separately deciding how a *derived-from-
  nothing-stored* computed getter should be represented at all (an architecture question, not an
  implementation one).
- `_logBuffer` (a project-defined class held as a field) is a plausible, narrower reopening of `_log`'s
  own question, but needs its own fresh investigation into whether `LogBuffer` (project-defined) is
  meaningfully more tractable than `Logger` (third-party) before being scoped as a milestone.

## 27. Commit

`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`,
`dart/bridge_analyzer/test/extraction_test.dart`, `packages/generators/react/src/internal/emit/expression.ts`,
`packages/generators/react/tests/support.ts`, `packages/generators/react/tests/enum_values_build.test.ts`,
`fixtures/apps/enum_values/`, `fixtures/uir/enum_values.ndjson`, this document.
`fixtures/apps/hello_bridge/analysis_options.yaml`'s pre-existing, unrelated drift left untouched.
