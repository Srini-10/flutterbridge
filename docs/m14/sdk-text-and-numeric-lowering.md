# M14 — `StringBuffer`, `int`/`double.toString`, and the numeric rounding methods

Status: **implemented and measured.** Each construct below was found by inventorying the two real applications (App A, App B — a corpus, not a
roadmap), lowered generally (by resolved `dart:core` type, never by name), and compared with real Dart. Neither application generates
successfully after this work, so neither reaches `next build` or Chromium; what changed is which errors stand between them and generation.

## How the numbers were taken

Fresh disposable copies of both applications (no `.bridge/`), `tools/taxonomy/taxonomy.mjs` (analyze → normalize → generate), then
`normalized.ndjson` deleted and `bridge generate` run again for the raw log. The analyzer was not touched by this work, and its output hashes
were identical before and after (`uir.ndjson` sha256 prefixes `a00aafd5a1e068ce` App B, `e16e69c0618e95cb` App A), so every change in the
tables is the generator/runtime. `BRG3005`'s summary line is excluded throughout. The per-category rules are `tools/taxonomy/rules.json`,
first match wins; nothing was reclassified.

## 1. `StringBuffer`

**Corpus.** App A: none. App B: exactly two, both verbatim in `fixtures/apps/string_buffer_semantics`:

| Function | Shape |
| --- | --- |
| `formatRupees` (`packages/core/.../formatters.dart`) | `final buffer = StringBuffer('₹');` then `if (negative) buffer.write('-');`, `buffer.write(grouped);`, `if (parts.length > 1) buffer.write('.${parts[1]}');`, `return buffer.toString();` |
| `buildCsv` (`features/dashboard/.../csv_export.dart`) | `final buffer = StringBuffer()..writeln(headers.map(_escape).join(','));` (a cascade on construction), then `buffer.writeln(...)` in a `for` loop, `return buffer.toString();` |

**Why it failed.** `StringBuffer` was treated as *one of the project's own classes* ("this generator does not emit class declarations"), and
that one refusal cascaded to every caller of `formatRupees`: **102 of App B's generator errors** named it.

**Representation — no UIR change.** `logic.New` of a `dart:core` type, `logic.MethodCall`s on it, and the cascade as `logic.Let`/`logic.Sequence`
were all already there. What was missing was the class. A `StringBuffer` is a mutable object with identity (two references see each other's writes),
so it is `DartStringBuffer`, a runtime class — the route `DateTime` (`DartDateTime`) and `Timer` (`DartTimer`) already take (ADR-0066) — not a
concatenation helper. The class takes **text only**: Dart's `write(Object? obj)` appends `"$obj"`, and what that prints depends on the static type
(a `double` `1.0` prints `1.0`), which only the generator knows. So the generator converts each argument exactly as string interpolation does
(`writtenText` in `expression.ts`): a non-nullable `String` is its own text; `dynamic`/`Object` go through `dartToStringDynamic`; everything else is
the interpolation of that value — `int`/`bool`/`String?` as themselves, a `double` through `doubleToString`, a printable collection through
`dartToString`, and a `num` (an int or a double, which a JavaScript number cannot tell apart) refused with interpolation's own message. The receiver
is emitted before the arguments and each argument once, in order — Dart's evaluation order.

**Supported:** `StringBuffer()`, `StringBuffer(content)` (any value kind below), `write(x)`, `writeln()`, `writeln(x)`, `toString()`, a cascade
on a construction, a buffer held in a local, passed to and returned from functions (typed `DartStringBuffer`, never `unknown`), shared by reference,
nullable through `?.` or after a null check, interpolated (`'$buffer'`), and written into another buffer (`other.write(buffer)`). Argument kinds:
`String`, `int`, `bool`, `double` (`1.0`), `String?`/`int?`/…/`null` (prints `null`), a printable collection, a `StringBuffer`, `dynamic`/`Object`
(through `dartToStringDynamic`, whose documented limit — a whole-valued `dynamic` double prints without `.0` — is inherited, not new), a *plain* enum
constant (`Kind.b` prints `Kind.b`), an *enhanced* enum (`Level.high`), and an instance of a project class that declares `toString()`.
**Refused, each by its own `BRG3013` naming the member or the type and what *is* lowered:** members `length`, `isEmpty`, `isNotEmpty`, `writeAll`,
`writeCharCode`, `clear`; and arguments of a `num` (an int or a double, which a JavaScript number cannot tell apart), a collection whose element text is
not reproducible (`List<Object>`), a `Duration`, a `DateTime` (nothing checks that the kit's text is Dart's), a nullable or variable-held *plain* enum
(its type carries no declaration, so it cannot be told from a package class), and an instance of a class that declares no `toString()` (Dart prints
`Instance of 'Foo'`, for which there is no default). Emitting `${x}` for these would print something else in JavaScript, silently. A `StringSink`-typed
variable holding a buffer is not modelled.

**A silent loss found by probing before commit.** The first version converted `write`'s argument by reusing interpolation's *lowering*, and a plain enum
constant printed `b` where Dart prints `Kind.b`: the analyzer adds the `Kind.` prefix for `'$k'` at extraction, so the shortcut skipped it. Written by
hand into `objects()` in the oracle fixture (`Kind.a Kind.b Level.high Tagged#7`), fixed, and the whole "refuse what nothing checks" rule above came out
of it. Mutation-tested: emitting `${x}` for unchecked types (fails), for a class without `toString()` (fails), and a plain enum with no prefix (fails,
oracle and shape).

**Evidence.**

- *Real-Dart oracle:* `fixtures/apps/string_buffer_semantics` (`flutter test` recorded `test/expected.json`; the generated React components are
  mounted in jsdom and compared step by step, `string_buffer_semantics_execution.test.ts`): App B's two functions verbatim (11 amounts,
  0 to 12,345,678, with and without decimals and negatives; 4 CSV inputs with commas, quotes, newlines, empty rows, no rows, no headers), every
  value kind `write` accepts (`String`, `int`, negative `int`, `double` `1.0` and `2.5`, `bool`, `null`, `String?`, `int?`, `List<int>`), `writeln`
  with and without an argument, initial content of each kind, aliasing (`a=xyz b=xyz`), a buffer passed to a mutating function and returned from
  one, argument evaluation order (`log=[pick]<a><b><c>`), a nullable buffer.
- *Generator:* `string_buffer_build.test.ts` (emitted shape, `tsc --strict`, determinism, 11 refusals by name with `BRG3005` and zero files);
  runtime: `dart_string_buffer.test.ts`.
- *Mutation-tested,* each restored and re-run green: construction not lowered (back to the project-class refusal — 6 tests fail); method calls not
  lowered (5); argument not converted (a `double` loses its `.0`, 5); `writeln` appends no newline (2, oracle); a buffer with no identity (1,
  oracle). Removing the implementation does not merely change a diagnostic: the semantic mutants show the oracle catching the *behaviour* — a
  wrong `write`, a missing newline, lost sharing — and the generator-level ones show the loud refusal, never a silent drop.

**Result (App B):** every one of the 102 `StringBuffer` errors is gone (81 `formatRupees`, 14 `money`, 4 `price`, 3 `checkoutFailureMessage`
…); `checkoutFailureMessage` moves on to its next reason (`Exception.toString`), as §5 records.

## 2. `int.toString()` and `double.toString()`

**Corpus.** App B: 8 leaf sites, 65 error lines counting the helper cascades above them; App A: 2. Every receiver is statically an `int`, with no
arguments: `n.truncate().toString()` (`adminCount`), `v.round().toString()` (`formatPct`, `_pct`), `v.toInt().toString()` (`_compact`),
`time.hour.toString().padLeft(2, '0')` (`_formatTimestamp`); plus one `double.toString()`. Dart's `int.toString()` takes no arguments — a radix is
the different method `toRadixString` (§3).

**Semantics.** An `int` in this compiler is a JavaScript safe integer (an `int` beyond 2^53 is refused before it gets here — ADR-0050, "exact or
loud"), and `String(n)` of one is Dart's digits: `-42`, `0`, `9007199254740991`; JavaScript leaves plain digits only from 1e21, and `String(-0)` is
`0`. A `double` prints as interpolating it already does (`doubleToString`: `1.0`, `0.1`, `1e+21`, `1e-7`, `-0.0`, `NaN`, `Infinity`).

**Supported:** `int.toString()` → `String(x)`; a *nullable* `int` → `dartToStringDynamic` (`null` prints `null`; `x?.toString()` stays a
null-guarded call); `double.toString()` → `doubleToString`. **Refused:** `num.toString()` (an int or a double at run time — the same reason
interpolating a `num` is refused), a *nullable* `double`'s `toString()` (no helper prints both `null` and `1.0`-style text), `int.toString(...)`
with arguments (Dart has none).

**Evidence.** `fixtures/apps/int_to_string_semantics` against real Dart: zero, negative, the largest safe integers, an arithmetic result, a
literal, App B's four shapes, a nullable `int` through both `.toString()` and `?.toString()`, and `double` `1.0`, `0.1`, `100.0`, `0.1 + 0.2`,
`-2.5`, `1e21`, `1e-7`, `-0.0`, NaN, ±infinity (`int_to_string_semantics_execution.test.ts`); `int_to_string_build.test.ts` (shape, `tsc --strict`,
determinism, the three refusals). Mutation-tested: not lowered (6 fail), `double.toString` as `String()` (the oracle fails on `1.0`), nullable
`int` as `String()` (the shape test fails).

## 3. `roundToDouble`, `floorToDouble`, `truncateToDouble`, `int.toRadixString` — found by the re-measure

After `int.toString` was lowered, 65 helpers that had failed on it **still failed**, now on the next numeric method in the same body: `roundToDouble`
(`formatPct`, `_pct`, `gst_estimate`, `CartItem.roundedLineTotal` — money rounded to the paisa), `truncateToDouble` (`adminInr`, `adminCount`,
`_compact`), `floorToDouble` (four layout widths) and `int.toRadixString` (the cart idempotency hash, the hex byte join). Lowering `int.toString`
alone left the fix invisible, so these were added under the same rule — evidence first, real Dart as the oracle, refuse what has none.

The first three are **not** `round`/`floor`/`truncate` (`numRound` and friends return an `int`, range-check it, and throw for NaN and the
infinities): they return a *double*, unchecked, `NaN`/`±Infinity` pass through, and a zero result keeps its sign (`(-0.4).roundToDouble()` is
`-0.0`), so they are their own helpers (`numRoundToDouble`, `numFloorToDouble`, `numTruncateToDouble`; halves round *away* from zero, unlike
`Math.round`). `intToRadixString(value, radix)`: lower-case digits, `-` for a negative, a radix outside 2–36 throws.

**Evidence.** 211 cases from real Dart (`packages/runtimes/react/tests/dart_numeric.test.ts`, generated by `dart_numeric_cases.gen.dart`):
halves of both signs, negative zero, the 2^52/2^53 boundaries, subnormals, `1e21`, NaN, ±infinity; radixes 2, 8, 10, 16, 36 over positive and
negative ints, and radixes 0, 1, 37, 100, -2 (which throw). End to end, `fixtures/apps/numeric_methods_semantics` runs App B's shapes **verbatim**
(`formatPct`, `_compact`, `adminCount`, `_fmt`, `roundedLineTotal`, the width floor, the hex join, the FNV-1a cart hash) and the edges against real
Dart (`numeric_methods_semantics_execution.test.ts`, `numeric_methods_build.test.ts`). Mutation-tested: not lowered (4 fail), halves rounded up
like `Math.round`, a zero result losing its sign, `floorToDouble` as the checked `int` floor (NaN throws), upper-case radix digits, and radix
bypassing the helper — each killed. (Removing `intToRadixString`'s own range check is an equivalent mutant: JavaScript's `toString(radix)` throws for
the same radixes.) `ceilToDouble` has no caller in either corpus, so it has no lowering and is still refused (`int_to_string_refusal`).

## 4. App B and App A, measured

| App B (`tools/taxonomy` rules) | phase start | + `StringBuffer`, `int.toString` | + rounding/radix |
| --- | ---: | ---: | ---: |
| **total generator errors** | 4653 | 4545 | **4489** |
| `BRG3004` (all) | 218 | 218 | 218 |
| — "local function declaration" | 66 | 66 | 66 |
| — "builder body with statements" | 30 | 30 | 30 |
| package-class-emission | 366 | 264 | 264 |
| top-level-function-cascade | 104 | 103 | 50 |
| unsupported-expression | 56 | 48 | 44 |
| Riverpod (`riverpod-ref` + `riverpod-provider-initializer`) | 983 | 983 | 983 |
| unresolved-reference | 658 | 658 | 659 |
| package-named-args | 482 | 482 | 482 |
| theme-material-role / theme-extension-context | 487 / 310 | same | same |
| opaque-expression | 216 | 216 | 216 |
| FutureProvider-specific / interpolation / sliver | 0 / 1 / 9 | same | same |
| lines naming `StringBuffer` | 102 | 0 | 0 |
| lines naming `int.toString` | 65 | 0 | 0 |

**What changed, exactly: 181 error lines removed, 17 added, net −164** (multiset difference of the two raw logs, nothing else moved). Removed:
81 `formatRupees`, 14 `money`, 4 `price` (its callers); 23 `adminInr`, 18 `formatPct`, 5 `_compact`, 4 `adminCount`, 2 `_pct`, 1
`_offerNote`, 1 `_formatTimestamp`; 8 `cartIdempotencyKey`; 3 `checkoutFailureMessage`; 2 `agentCatalogueStats`; the direct sites (8 `int.toString`, 3
`floorToDouble`, 1 `roundToDouble`, 1 `double.toString`); 2 provider initializers. Added, all *the next reason for a body that could not previously
be reached*: `cartIdempotencyKey` ×8 (now `String.codeUnits`), `checkoutFailureMessage` ×3 (now `Exception.toString`), `agentCatalogueStats` ×2
(now the `palette` extension), 2 provider initializers (`commissionSummaryProvider`, now the provider it reads; `gstEstimateProvider`, now a named-argument call), 1 more occurrence of an already-reported `_pct` "is not declared" (the name belongs to unrelated private `State` members — a `TextEditingController` field and a getter — not the top-level `_pct` helper; I did not trace which enclosing body newly reached it), and 1 nullable-`double` `toString()` — **the refusal added
by §2, correctly, on the one site that has that shape.** Nothing was silently dropped and no unrelated category moved.

| App A | phase start | now |
| --- | ---: | ---: |
| total generator errors | 348 | **346** |

App A's difference is exactly its two `int.toString` errors. Its four `int.compareTo` refusals are unchanged (their message now lists the members
supported, which is why their text differs from before). **App A does not generate; App B does not generate; neither reached `next build` or
Chromium.**

## 5. What now stands in front of the remaining helpers (App B, remaining function-cascade tails)

36 calls to a package callee with named arguments (`showModalBottomSheet`), 18 + 5 `PostgrestException` members, 15 `SupabaseClient.auth`, 13
`WidgetRef.read` inside a helper, 13 more named-argument package calls, 11 snack-bar-host hoists, 8 `String.codeUnits` (the cart hash), 7
`Duration.inDays`, 7 `ref.watch` reached only from a callback, 5 `RegExp`, 4 `Exception.toString`. None is `StringBuffer` or a numeric method; the
package ones are missing adapters, the rest are separate, well-defined members with their own evidence to gather.

## 6. Local function declarations (66) — inventoried, not implemented

All 66 are `BRG3004` "local function declaration", raised by `statement_extractor.dart` (a `FunctionDeclarationStatement` has no `logic.*` statement).
Inventory by shape (return kind · body · what the body reads):

| Count | Shape | Example |
| ---: | --- | --- |
| 31 | `void`, expression body, reads `context` | `void back() => context.canPop() ? context.pop() : context.go('/shop');` |
| 14 | value, expression body, pure (params and captured finals) | `String two(int n) => n.toString().padLeft(2, '0');` `int? px(double dim) => dim.isFinite ? (dim * dpr).round() : null;` |
| 5 | `Widget`, expression body, pure | `Widget sparkle(Color color) => Icon(AppIcons.sparkles, size: …, color: color);` |
| 4 + 2 | value / `Widget`, block body, pure | `OutlineInputBorder border({Color? color, double width = 1}) {…}` |
| 3 + 3 + 2 | `void` block; `void` block with `context`; value block with `context` | `void go(String path) {if (!wide) {Navigator.of(context).pop();} context.go(path);}` |
| 1 + 1 | reads `ref` (value block; `void` expression) | `void toggle(bool _) => ref.read(themeModeProvider.notifier).toggle(brightness);` |

**Decision: not implemented in this round**, from this evidence:

1. The 31 `back()` sites are the single largest shape and would stay refused *after* the declaration is understood: `context.canPop()` (go_router's
   `BuildContext` extension) has no model anywhere in the compiler. They would move from `BRG3004` to `BRG3006`, not to generated code.
2. Only about 25 sites are the "simple safe class" (pure, no captured mutable state, no hooks, no recursion): the 14 + 5 expression-bodied ones
   and a handful of block bodies. Of these, the 5 + 2 `Widget`-returning ones cannot be a closure at all — they have to be *inlined* at the call so
   the widget tree stays visible to extraction (`_inlineHelper`'s job for methods), while the value-returning ones and the `void` ones passed as
   `onPressed: back` are closures. Two representations, one construct.
3. A closure representation needs a capture analysis the compiler does not have: which outer names the body reads, whether any is a `var` that is
   reassigned (`Binding.inlineValue` assumes a single assignment), whether it contains a hook (`ref.watch` inside a closure is refused already, BRG3013),
   and recursion. Guessing at any of those is exactly the silent loss this work exists to avoid, and a new construct in the frozen architecture
   needs an ADR showing a proven contradiction, not a preference.
4. 66 of 4489 is 1.5 % of App B's errors; the numeric methods above unblocked more than that for less risk.

If it is taken up, the safe first class is the 14 pure expression-bodied value helpers, lowered as a `logic.VarDecl` of a `logic.Lambda` (the
existing closure representation) with an analyzer check that every captured name is a parameter or a never-reassigned local; `Widget`-returning ones
through `_inlineHelper`'s call-site inlining; everything else refused as now.

## 7. Not claimed

Not general `StringBuffer` support (five members refused), not general numeric support (`ceilToDouble`, `compareTo`, `toStringAsExponential`
… still refused), not local-function support, not that either real application generates. The historical `fixtures/uir/*.ndjson` snapshots for
older fixtures were not refreshed.

## 8. Silent-loss audit

For each construct: what could have disappeared, and what stops it.

| Could be lost | Why it is not |
| --- | --- |
| A `StringBuffer` write | Every `write`/`writeln`/`toString` is lowered to a call on the class or refused by name; no other member is ever emitted (a member the class lacks would be a `TypeError`). Oracle: `formatRupees`, `buildCsv`, `objects`, `lines`. |
| Append order, `writeln`'s newline, mutation, sharing | One object with one accumulated string; `writeln` appends `\n` only (`lines()` and `buildCsv` compare it with Dart); aliasing is `a=xyz b=xyz`; a buffer passed to and returned from functions keeps its identity. |
| The text of a written value | Converted by static type at the call site, or refused: `int`, `bool`, `double` (`1.0`), `null`, collections, enums, and classes with `toString()` are checked against Dart; a `num`, `Duration`, `DateTime`, a plain enum variable and a class with no `toString()` are refused (§1). One real loss (a plain enum constant printing `b`) was found and closed here. |
| Evaluation order, side effects in arguments | The receiver is emitted first, then each argument once, left to right — `order()` prints `log=[pick]<a><b><c>` in Dart and in the generated component. |
| Nullability | `?.` is the analyzer's existing null-guarded desugaring; a nullable `int`'s `toString()` prints `null`; a nullable `double`'s is refused; a nullable plain enum is refused. |
| `int.toString()`'s digits | An `int` is a safe integer (ADR-0050); edges compared with Dart: `0`, `-42`, `±9007199254740991`. A `num` is refused. |
| A zero result's sign, NaN, infinity in `roundToDouble` and friends | Their own helpers (not `numRound`); 211 real-Dart cases including `-0.0`, NaN, `±Infinity`, `1e21`. |
| An exception | `toRadixString` with a radix outside 2–36 throws as Dart's does; the checked `round`/`floor`/`ceil`/`truncate` still throw for NaN and infinity and are untouched. |
| A function declaration | Local function declarations are unchanged: all 66 stay `BRG3004` "local function declaration" (66 before, 66 after); none is dropped or guessed at. |
| A closure capture, parameter or return value | No closure is introduced by this work (a cascade is the existing `Let`/`Sequence`); the helpers' parameters and returns are compared with Dart in the oracle fixtures. |

## 9. Validation

Run on the final code, on a quiet machine (an earlier `just ci` and Dart run were disturbed by unrelated load — load average above 200 from a simulator —
and produced timeouts in tests that pass in isolation; both were rerun once the load subsided, and the failing ones are not code-dependent).

| Gate | Result |
| --- | --- |
| Generator suite | 930/930 (129 files); before this work 898 |
| Runtime suite | 901/901 (32 files); before this work 683 (+7 `DartStringBuffer`, +211 numeric) |
| Dart analyzer suite | 698/698 (`just analyzer-test`) — this work does not touch the analyzer |
| `just lint`, `typecheck`, `codegen-check`, `lint-negative`, `dart-analyze` | all pass |
| Full `just e2e` | 109/109 (11 applications, production and development) — none of the fixtures added here is an e2e application |
| `just determinism` | byte-identical, 11 applications × 3 complete pipeline runs |
| New fixtures, 3 fresh analyzes each + 3 generates | `uir.ndjson` byte-identical to the committed `fixtures/uir/*.ndjson` (5 fixtures); generated trees identical across runs (3 positive fixtures) |
| `just ci` | stops at `analyzer-lint`: `dart/bridge_analyzer/test/route_argument_positions_test.dart:419` `avoid_escaping_inner_quotes` (commit `6ad4738`, unrelated, unchanged and deliberately left); every recipe before it passes (the TypeScript suites 930 + 901 + 174 + 52 + …), and the ones after it (`analyzer-test`, `dart-analyze`) were run directly and pass |

