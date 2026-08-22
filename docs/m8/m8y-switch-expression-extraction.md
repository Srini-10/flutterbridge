# M8-Y — Dart 3 Switch-Expression Extraction

Baseline: `46c5592` (M8-X, "reduce remaining BRG3013 candidates").

**Outcome: implemented.** The narrow, evidence-bounded subset — an unguarded, exhaustive,
enum-constant-pattern switch expression in direct-return position — is now extracted losslessly into the
existing `logic.Switch` schema, no schema change, no ADR. Two real Continuum sites (`describeTransferFailure`,
and a second one this investigation discovered, `_featureLabel`) are fixed. Every unsupported neighboring
shape remains exactly as opaque as before.

## 1. Contract

Prove — before implementing anything — whether the existing `logic.Switch` UIR representation can
losslessly represent the bounded Dart 3 switch-expression subset real Continuum uses. Implement only the
proven subset, using resolved Dart AST structure, never source spelling. Stop after documentation if the
proof fails.

## 2. Baseline — verified

```
git status --short   →  M fixtures/apps/hello_bridge/analysis_options.yaml   (only, before any work)
git rev-parse HEAD           = 46c559279fcbac168f844e2a7627c059bf37d29a
git rev-parse origin/main    = 46c559279fcbac168f844e2a7627c059bf37d29a
```

`HEAD == origin/main`. Read before investigating: `CLAUDE.md`; `docs/adr/0011-cross-route-state-promotion.md`;
ADR-28 (`0028-declaration-tier-identity-for-locals-and-parameters.md`); `docs/m8/m8b-*.md`, `m8d-*.md`,
`m8u-*.md`, `m8x-*.md`. Then the production implementation: `dart/bridge_analyzer/lib/src/session/extract/statement_extractor.dart`,
`expression_extractor.dart`; `packages/generators/react/src/internal/emit/statement.ts`, `functions.ts`;
`packages/uir/src/generated/uir.ts`'s `Switch`/`SwitchCase` interfaces.

## 3. Real Continuum source shape — fresh, reproduced from source

`continuum_ui_kit.dart:121-127` (`describeTransferFailure`):

```dart
String describeTransferFailure(TransferFailureReason reason) => switch (reason) {
      TransferFailureReason.permissionDenied => 'failed: permission denied',
      TransferFailureReason.hashMismatch => 'failed: checksum mismatch',
      TransferFailureReason.ioError => 'failed: storage error',
      TransferFailureReason.none => 'failed',
    };
```

Package: `continuum_ui_kit`. Declaration: top-level function. Scrutinee: the function's own `Reason`
parameter. Cases: 4, every one an unguarded, bare enum-constant pattern. No guard, no wildcard, exhaustive
(Dart's own compiler enforces this for a switch expression). Result type: `String`, every result a string
literal. No branch calls a function or has a side effect.

A second, independently-shaped real site was found during this investigation (§16) — `settings_page.dart:138-143`'s
`_featureLabel`, the identical shape over a different enum (`ContinuumFeature`), returning as a `State`
class method rather than a top-level function.

## 4. Fresh `BRG1302` reproduction

Fresh `bridge analyze --json` against a real, `flutter analyze`-clean Dart reduction ladder built for this
investigation reproduces the identical diagnostic for every switch-expression rung tried (13 of 13),
regardless of case shape, wildcard presence, guard presence, result type, or which enum is used:

> `A `switch expression` has no UIR representation. It is preserved as an opaque expression, with its
> source text, so nothing is lost and a later milestone or an override can model it.`

Raw UIR for the opaque node: `logic.OpaqueExpr{reason: 'switch expression', dartSource: '<verbatim source>'}`.
Normalization does not repair it — no compiler pass (`packages/compiler/src/internal/passes/`) touches
`logic.OpaqueExpr` or `logic.Switch` at all; the node passes through N1–N11 completely unchanged.

## 5. Dart AST findings — resolved structure, not source text

Read directly from `package:analyzer` 14.0.0 (`~/.pub-cache/hosted/pub.dev/analyzer-14.0.0/lib/src/dart/ast/ast.dart`),
the version `dart/bridge_analyzer`'s own `pubspec.lock` pins:

- `SwitchExpression implements Expression { NodeList<SwitchExpressionCase> cases; Expression expression; }`
  — `expression` is the scrutinee.
- `SwitchExpressionCase implements AstNode { Token arrow; Expression expression; GuardedPattern guardedPattern; }`
  — `expression` is the case's own result; `guardedPattern` names the pattern.
- `GuardedPattern implements AstNode { DartPattern pattern; WhenClause? whenClause; }` — `whenClause == null`
  means unguarded, checked structurally, not by scanning for the `when` keyword in source text.
- `ConstantPattern implements DartPattern { Expression expression; }` — the pattern kind a bare enum
  constant (`Reason.permissionDenied`), a literal (`1`, `'a'`), or `null` all parse as. Its own `expression`
  is resolved by the exact same expression-extraction machinery (`expressions.extract`) the pre-existing
  old-style `case Reason.value:` arm already uses on `SwitchCase.expression` — the identical
  `PrefixedIdentifier`/`PropertyAccess` shape, resolved by the same, already-correct enum-identity
  machinery (M8-D). No new identity mechanism was built; the existing one was reused unchanged.
- `WildcardPattern`, `LogicalOrPattern`, `LogicalAndPattern`, `ObjectPattern`, `RecordPattern`, `ListPattern`,
  `MapPattern`, `RelationalPattern`, `NullCheckPattern`, `NullAssertPattern`, `CastPattern`,
  `ParenthesizedPattern` — every one a distinct, structurally-checkable class, none of which is
  `ConstantPattern`. Excluded from the admitted subset by a single `pattern is! ConstantPattern` check —
  never by matching source spelling.

## 6. Existing `logic.Switch` architecture

`packages/uir/src/generated/uir.ts`:

```ts
export interface Switch { readonly cases?: readonly SwitchCase[]; readonly subject: Expr; readonly kind: 'logic.Switch'; ... }
export interface SwitchCase { readonly body: readonly Stmt[]; readonly test?: Expr; }
```

A **statement**, produces no value of its own — every case's own `body` is a statement list, which is
exactly what makes representing `return switch (x) { A => v }` as `logic.Switch{cases:[{test:A, body:
[logic.Return{value:v}]}]}` lossless: the schema was already shaped for "test, then run these statements,"
and a single synthesized `logic.Return` is precisely the one statement a switch-expression case always
implies. No `default`/`defaultCase` is required by the schema (optional, per `?`).

**A real, pre-existing bug found by direct code reading** (not by a test — none existed): the generator's
own `logic.Switch` case (`statement.ts`) read a case's test as `item['value']`, but the schema's own field
is `test`. `logic.Switch` had never been produced by any real Dart shape or exercised by any fixture or
test before M8-Y (`grep -rln logic.Switch packages/generators/react/tests fixtures` — zero hits), so this
went unnoticed: every case's own test always lowered to the literal text `undefined`. Fixed as part of
Gate C (§13) — a bounded, one-line mechanical correction, not a redesign.

Comparisons are Dart's own `case` equality inside a native `switch`, native strict (`===`) in the emitted
TypeScript — the same comparison every other `logic.Ref`-to-enum-constant lowering already relies on
(an enum constant lowers to its own member-name string literal, M8-D), so `===` on those strings is exact.
No fallthrough is emitted (`statement.ts`'s own `leaves()`/`break;` logic, pre-existing, unchanged).
Normalization does not modify `logic.Switch` — no N-pass references it.

## 7. Expression-vs-statement representation — Option A, chosen and proven sufficient

The real site is always `return switch (...) {...};` or, for an arrow-bodied function, the equivalent
`ExpressionFunctionBody` shape — never `final x = switch (...) {...};` or `foo(switch (...) {...})`. Option
A (support only a `return`'s own direct `SwitchExpression`) was chosen and is proven, by the reduction
ladder (§8), to completely cover both real Continuum sites. Option B (general expression-position
`SwitchExpression` extraction) was not attempted — no real evidence needs it, and admitting it would mean
proving evaluation-order and nesting semantics this investigation did not need to solve. Option C (a new
value-producing schema node) was never reached — Option A already fully answers the representation
question the schema itself raises.

**A `return`'s own switch expression is reached from two distinct, real Dart AST shapes**, both handled by
one shared implementation (`ExpressionExtractor.switchExpressionAsReturn`, called from both):

- A block-bodied function's real `ReturnStatement` (`statement_extractor.dart`).
- An arrow-bodied function's `ExpressionFunctionBody` (`expression_extractor.dart`'s own `bodyOf`) — an
  arrow body's own `return` is **never** a real `ReturnStatement` AST node (Dart's own grammar), which
  this investigation discovered only after the first implementation attempt (scoped to
  `StatementExtractor` alone) produced zero effect on a real, `flutter analyze`-clean fixture — direct,
  executable evidence overriding an initial, incorrect assumption, exactly per this milestone's own
  instruction to trust evidence over inference.

## 8. Reduction ladder — real Dart, real analyzer, real generator

A single, comprehensive `flutter analyze`-clean fixture (13 rungs) was run through the real
`bridge_analyzer`, then the real generator:

| Rung | Shape | Admitted? |
|---|---|---|
| A/B/C | enum switch, all-literal results, direct return (the real shape, twice) | **yes** |
| D | assigned to a local (`final s = switch(...)`) | no — wrong position (Option A boundary) |
| E | used as a function argument | no — wrong position |
| F | primitive int patterns + wildcard | no — wildcard present |
| G | primitive string patterns + wildcard | no — wildcard present |
| H | wildcard only | no |
| I | nullable input, explicit `null` case | **yes** |
| J | logical-or pattern (`A || B => ...`) | no |
| K | guarded pattern (`A when cond => ...`) | no |
| L | object/destructuring pattern | not separately fixture-tested — structurally excluded by the identical `pattern is! ConstantPattern` check already proven correct for J/K |
| M | nested switch expression | not attempted — no real site, Option A's own scope (result is *any* extractable expression, so a nested switch in result position would itself stay opaque, refusing honestly) |
| N | result calls a function | **yes** |
| O | result mutates/calls an action | not separately tested — same mechanism as N (`extract()` handles any expression); no real site needs a mutating result |
| P | same member names, two different enums | **yes**, correctly distinguished, never conflated |
| Q/R | cross-file / cross-package enum | not separately re-tested — identity resolution is M8-D's own already-proven mechanism, reused unchanged, not re-derived |
| S | SDK enum (`dart:ui`'s `Brightness`) | **yes** — an emergent consequence of reusing `extract()` uniformly, not a deliberate SDK carve-out |
| T | non-exhaustive switch expression | Dart's own compiler refuses to compile this at all (a real language rule, confirmed, not re-implemented) — never reaches extraction |

One unsupported case anywhere in a switch keeps the **whole** switch opaque — proven directly (a wildcard
mixed with otherwise-admitted cases stays fully opaque, never a partial lowering).

## 9. Supported subset

A `return`'s own `switch (subject) { pattern => result, ... }` (equally for a block-bodied function's real
`return` and an arrow-bodied function's own body), where every case's `guardedPattern.whenClause` is
absent and every case's `guardedPattern.pattern` is a `ConstantPattern` — an enum constant, a primitive
literal, or `null`. The scrutinee and every result may be any expression this generator can already
extract. No arity/case-count limit; proven for 2, 3, and 4 cases.

## 10. Refused subset — every unsupported neighboring shape stays exactly as opaque as before

Not admitted, and unchanged from pre-M8-Y behavior (§4's own `BRG1302`, still fired): a switch not in
direct-return position; a wildcard pattern anywhere in the switch; a guarded case anywhere; a logical-or/
logical-and pattern; an object/record/list/map (destructuring) pattern; a relational pattern; a
null-check/null-assert pattern. Proven via 5 dedicated Dart-side negative-control tests (§17).

## 11. Enum identity

Reused, not reimplemented: `ConstantPattern.expression`'s resolution is the identical code path
`SwitchCase.expression` (old-style switch statement) already used, which is the identical code path every
other enum-constant `logic.Ref` in this generator already used before M8-D and after. Verified directly
(not assumed): a same-file test asserts every case's own `test.target` equals the single `EnumDecl`'s own
`id`; a two-enum, same-member-name test asserts `EnumA.ready` and `EnumB.ready` resolve to two distinct
`EnumDecl` ids, never conflated (§17).

## 12. Exhaustiveness analysis

Not reimplemented. A switch **expression** is exhaustive by construction — Dart's own compiler refuses to
compile a non-exhaustive one (rung T, §8), so a `flutter analyze`-clean source file's own switch expression
is always already proven exhaustive by the tool that actually enforces Dart's language rules. This
extractor never independently re-derives that proof; it only ever *admits* a case list that is a bare
`ConstantPattern` set, which the language's own compiler has already required to be complete.

**A second, independent exhaustiveness question surfaced downstream, in the generator, not the extractor**
(§13) — TypeScript's own control-flow analysis cannot see Dart's proof, since the generated switch has no
JS-visible literal-union type constraining it. Resolved narrowly there, not here.

## 13. Evaluation-count analysis

The scrutinee lowers to `switch (${emitExpression(subject)})` — JavaScript's own native `switch` statement
evaluates its discriminant expression exactly once (ECMAScript spec), matching Dart's own switch-expression
scrutinee evaluation exactly, by construction, with no extra work needed. A result expression that calls a
function (rung N) lowers to `return <call>();` inside its own `case` block — JS's own switch executes at
most one matching case's own statements, so the call executes exactly once, only on the selected branch,
never eagerly and never more than once. Proven directly: `nCallsFunction`'s own generated output calls
`_sideEffect('p')` etc. inside the correct case only (§8's build-proof test).

## 14. Semantic-equivalence audit

Case order is preserved exactly (source order in, source order out — proven directly on the real
`describeTransferFailure` shape, §17's own first test). Branch selection is JS's native `switch`, first
matching `case` wins, identical to Dart's own first-matching-pattern semantics for the admitted
(`ConstantPattern`-only) subset. No implicit default is invented by the extractor. Thrown exceptions
propagate identically — a `throw` inside a case's own body (none of the real sites have one, but nothing
in this lowering interferes with one) unwinds through the native `switch`/function exactly as Dart's own
does.

## 15. Silent-wrong-code audit

**A real bug was found and fixed, not merely audited for.** §6's `item['value']`/`item['test']` field-name
mismatch would have silently emitted `case undefined:` for every case of a `logic.Switch` — this M8-Y's own
work is the first real producer of that node, so the bug is fixed as part of clearing Gate C, not left as a
finding.

**A second real gap was found and fixed** (§16): a `logic.Switch` with no `default` — proven exhaustive by
Dart, admitted with no synthesized default per this milestone's own explicit instruction — leaves
TypeScript's own return-type inference unable to prove the function always returns, silently widening its
inferred type to `T | undefined` and corrupting every caller (a `Text` prop typed `string` stops accepting
the call — an actual `tsc` failure, not a hypothetical one, caught by the real build-proof, not by manual
review). Resolved by adding an explicit return-type annotation only where a function's sole body is one
exhaustive `logic.Switch`, and by structurally re-proving exhaustiveness *at the generator*, independent of
which code path produced the node (§16), before adding a `default: throw` — never a `default` that
silently returns `undefined`/`null`, and never applied to a switch this generator cannot itself prove is
exhaustive (a primitive-typed switch, or an enum switch covering only a subset of its members, both proven
to correctly decline the throw-default in dedicated tests, §17).

## 16. Schema/ADR/runtime assessment

**No schema change.** `logic.Switch`/`SwitchCase` already existed and already had every field this subset
needs. **No ADR.** ADR-29's own precedent (module emission generalizing to a new declaration shape without
a new architecture decision) directly covers this — a structural extension of an existing extraction
pattern, not a new one. **No runtime change** — the emitted `switch`/`case`/`throw` is plain TypeScript,
nothing the runtime kit needs to support. **No `NodeId` model change.**

**One implementation choice made independent of the schema**: the generator's own exhaustiveness
re-verification (`isProvablyExhaustiveEnumSwitch`, `statement.ts`) deliberately does **not** mark a
`logic.Switch` node with where it came from (no `ext` field, no new schema field) — it re-derives
exhaustiveness structurally, from the case set and the resolved `EnumDecl`'s own `values`, so the same
proof is equally sound for any future producer of `logic.Switch`, not only this one.

## 17. Implementation gates

```
Gate A — Representation:  PASS — logic.Switch/SwitchCase losslessly represent the admitted subset (§6, §9), proven by direct raw-UIR inspection matching source order/identity exactly.
Gate B — Extraction:      PASS — every admitted pattern is identified by resolved AST class (ConstantPattern, GuardedPattern.whenClause), never by source text or name (§5).
Gate C — Generator:       PASS — required and received a bounded mechanical correction: the pre-existing test/value field-name bug (§6), and the exhaustiveness-proof-gated default (§16), both scoped, both tested.
Gate D — Continuum payoff: PASS — two real sites fixed (§3, §22), verified end to end.
Gate E — Architecture:    PASS — no schema, no ADR, no runtime redesign, no NodeId change (§16).
```

**Overall: PASS.** Implementation proceeded.

## 18. Implementation

- `dart/bridge_analyzer/lib/src/session/extract/statement_extractor.dart`: `case ReturnStatement()` checks
  `node.expression is SwitchExpression` first, delegating to the shared extractor method.
- `dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`: new
  `switchExpressionAsReturn(SwitchExpression, AstNode, Scope) → RawNode?`, shared by the statement path
  above and by `bodyOf`'s own `ExpressionFunctionBody` case (an arrow body's `return`).
- `packages/generators/react/src/internal/emit/statement.ts`: `logic.Switch`'s own `item['value']` →
  `item['test']` field-name fix; a new `isProvablyExhaustiveEnumSwitch` helper and its call site, adding a
  `default: throw new Error(...)` only when structurally provable.
- `packages/generators/react/src/internal/emit/functions.ts`: an explicit return-type annotation, added
  only when a function's sole body statement is one exhaustive `logic.Switch`.

No analyzer/generator changes outside these four files. No N-pass touched.

## 19. Tests

- `dart/bridge_analyzer/test/extraction_test.dart` — 11 new tests: the exact real shape (case order
  preserved), enum identity (target resolution), same-member-name enum collision, null-pattern admission,
  function-call-result admission, and 6 negative controls (wrong position ×2, wildcard, guard, logical-or,
  one-bad-case-poisons-the-whole-switch).
- `packages/generators/react/tests/switch_expression_recognition.test.ts` — 6 new tests, generator-level,
  synthetic UIR, proving `isProvablyExhaustiveEnumSwitch` exactly: full coverage gets a throw-default and
  the field-name fix is verified (`case 'a':`, never `case undefined:`); a subset, a primitive switch, and
  a nullable switch missing its own null case all correctly decline the throw-default; an explicit
  `defaultCase` is never doubled.
- `packages/generators/react/tests/switch_expression_build.test.ts` — 5 new tests, the real build-proof:
  zero generator errors; the exact real shape's own case order and text; the null-pattern case ordered
  first; the function-call-result case; and the full real analyzer → N1–N11 normalize → generator → real
  `tsc` pipeline, against the real, unmocked runtime.

## 19a. Negative controls / mutation-style coverage

- Dropping a branch: the "one unsupported case among otherwise-admitted cases still keeps the whole switch
  opaque" test directly proves a partial extraction never happens — removing one case's own admission
  never silently drops it, the whole switch refuses instead.
- Swapping two enum identities: the "two different enums with an identically-named member never share
  switch-case identity" test asserts `declA !== declB` and that each switch's own cases resolve
  consistently to one enum, never a mix — a name-based implementation would fail this test immediately.
- Evaluation count: `nCallsFunction`'s own build-proof assertion checks the call appears inside its own
  `case`, never hoisted or duplicated.

## 20. Real `tsc`/build proof result

`fixtures/apps/switch_expression` — `describeTransferFailure`'s own exact shape, a second independent enum
switch (null-pattern rung), and a function-call-result rung — real analyzer → real N1–N11 normalize → real
generator → real `tsc` against the real, unmocked `@bridge/runtime-react`. **Zero errors, all 5 tests
green**, including the real `typecheckEmitted` proof.

## 21. Continuum before/after — both apps, fresh

`BRG1302` (analyzer, "switch expression" specifically): **2 → 0** in both apps — both of Continuum's own
two real switch-expression sites now extract. Real Continuum turned out to have exactly 2, not 1 — this
investigation's own reduction ladder is what found the second one, `settings_page.dart:138`'s
`_featureLabel` (§3, §22).

| | mac before | mac after | droid before | droid after |
|---|---:|---:|---:|---:|
| `BRG1302` (switch-expr sites) | 2 | **0** | 2 | **0** |
| `BRG1302` (total, all reasons) | 93 | 91 | 121 | 119 |
| `BRG1301`/`BRG1304` | unchanged | unchanged | unchanged | unchanged |
| `BRG3013` | 7 | **6** | 7 | **6** |
| `BRG3004` | 8 | **7** | 12 | **11** |
| `BRG3001`/`BRG3002`/`BRG3005`/`BRG3006`/`BRG3008` | unchanged | unchanged | unchanged | unchanged |
| total generator errors | 41 | 39 | 45 | 43 |
| files emitted | 0 | 0 | 0 | 0 |

`describeTransferFailure`'s own generator diagnostic is confirmed gone entirely (before: `BRG3013`
`"describeTransferFailure is a project-defined top-level function... does not yet lower a
logic.FunctionDecl"`; after: no diagnostic mentions it anywhere). `_featureLabel`'s own switch is now
extracted (its `BRG1302` is gone), but `settings_page.dart` as a whole is still blocked by a separate,
pre-existing, unrelated gap (`ContinuumFeature.values` — `BRG3006`, unchanged before/after) elsewhere in
the same file — `_featureLabel` was never independently `BRG3013`-flagged before (it is a `State` method,
not a top-level `FunctionDecl`, so it never went through that code path at all), so its own fix shows up
only as the `BRG1302` drop, not as a second `BRG3013` drop. **`files emitted` remains 0/0 in both apps** —
expected, not a sign of failure: ~39-43 other, independent, already-catalogued blockers (M8-W/M8-X's own
census) remain untouched by this milestone.

## 22. Regression matrix

- **M8-B** (structured build extraction, `ui.Cond`): untouched — no file this milestone changed intersects
  `ui.Cond`'s own extraction or emission.
- **M8-D** (enum identity): reused unchanged, never re-derived (§11); its own dedicated test group,
  unmodified, still passes.
- **M8-N/M8-O/M8-R/M8-S/M8-U/M8-V**: no file belonging to any of these milestones' own capabilities was
  touched; `git diff 46c5592 --stat -- packages/generators/react/tests/` shows exactly one modified file
  (`support.ts`, purely additive — a new raw-fixture helper) and zero removed/modified pre-existing test
  files.
- **M8-X** (`Navigator.of` retirement): confirmed untouched — no file this milestone changed intersects
  `routes.ts`/the navigation code path at all.

Full suite: 29 test files, **305 tests**, all green (`pnpm --filter @bridge/gen-react test`). Dart suite:
**328 tests**, all green (`dart test`, `dart/bridge_analyzer`).

## 23. Validation

- `just typecheck`: clean.
- `just lint`: clean (`lint:deps`, `lint:stubs` — 15 pre-existing tagged stubs, unchanged — `lint:portability`).
- `just dart-analyze`: clean (`flutter analyze` on `hello_bridge`, "No issues found!").
- `just ci`: **exit 0**. All turbo task groups fully green (build 11/11, typecheck 19/19, test 22/22);
  `dart/bridge_uir` (28 tests) and `dart/bridge_analyzer` (328 tests) both "All tests passed"; every
  `@bridge/*` package's own vitest suite green, including `gen-react` (29 files, 305 tests).
- `bridge validate --json` on `fixtures/apps/switch_expression` (relative `work`/`out`, routing around the
  pre-existing CLI path-join bug M8-V §17 already documented): `{"ok": true, "checks": [{"deterministic":
  true}, {"fixed point": true}]}`.
- `just determinism`: full e2e harness across the 5 tracked apps — retried once after an environmental
  session-boundary kill (signal 15, reported honestly, matching this session's own established practice),
  the clean retry completed with **"byte-identical across every run."**
- `git diff --check`: clean.

## 24. Silent wrong-code findings

Both real, both found by direct execution (not by manual review) and both fixed as part of this milestone,
not left as open findings: the `test`/`value` field-name bug (§6, §15) and the TypeScript return-type
inference gap (§13, §15, §16). No other silent-wrong-code risk was found in the admitted subset — the
narrow scope (unguarded `ConstantPattern` only, direct-return position only) was chosen specifically to
avoid every semantic question (pattern destructuring, guard evaluation order, nested-switch laziness) this
milestone did not need to solve for real Continuum.

## 25. Remaining blocker graph

Unchanged from M8-X except for the two now-resolved switch-expression sites (§21). `describeTransferFailure`
is fully resolved. `_featureLabel`'s own switch is resolved; `settings_page.dart`'s broader render path
remains blocked by the separate, pre-existing `ContinuumFeature.values` gap. The five other M8-W/M8-X root
causes (`_log`/`Logger`, `showDialog`, `ScaffoldMessenger.of`, the SettingsPage/N11 boundary) are entirely
untouched, per this milestone's own explicit scope boundary.

## 26. Exact recommendation for M8-Z

**Not preselected**, per instruction. What this investigation surfaces, honestly:

- `ContinuumFeature.values` (a `.values` static-member reference on an enum, `BRG3006`) is a new,
  independently-real, previously-uncounted blocker this investigation's own before/after happened to
  surface (§21) — not chosen, not scoped, not investigated beyond confirming it is unrelated to
  switch-expression work. A future census should fold it into the next fresh `BRG3013`/`BRG3006` count
  rather than treating it as newly "discovered" by prose.
- Every M8-W/M8-X-era candidate (`_log`, `showDialog`, `ScaffoldMessenger.of`, SettingsPage/N11) remains
  exactly as scoped there — this milestone neither advanced nor further narrowed any of them.

## 27. Commit

`dart/bridge_analyzer/lib/src/session/extract/{expression_extractor,statement_extractor}.dart`,
`dart/bridge_analyzer/test/extraction_test.dart`, `packages/generators/react/src/internal/emit/{statement,functions}.ts`,
`packages/generators/react/tests/support.ts`, `packages/generators/react/tests/switch_expression_{build,recognition}.test.ts`,
`fixtures/apps/switch_expression/`, `fixtures/uir/switch_expression.ndjson`, this document.
`fixtures/apps/hello_bridge/analysis_options.yaml`'s pre-existing, unrelated drift left untouched.
