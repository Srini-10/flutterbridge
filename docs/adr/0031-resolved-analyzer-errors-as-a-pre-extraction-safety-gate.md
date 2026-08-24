# ADR-0031 — Resolved analyzer errors as a pre-extraction safety gate

## 1. The question

M9-C first surfaced, and this milestone re-proves fresh: `BridgeAnalyzer` can obtain a `ResolvedUnitResult`
for a Dart source file whose own analyzer diagnostics already include real, `Severity.error`-level
problems — and continues to extract UIR from it regardless. A resolved AST existing is not proof the
program is valid Dart; `package:analyzer` recovers a structurally-plausible tree for erroneous programs
because IDE tooling needs one, not because the program means anything. This ADR defines the validity
contract: which analyzer diagnostics must prevent extraction, at what granularity, and how the refusal is
surfaced.

## 2. Why resolved-AST recovery is insufficient — direct evidence, not inference

Four real, minimal Dart snippets, each run through the real `bridge_analyzer` pipeline this milestone
actually ships, fresh (not reused from the M9-C-era historical note):

- **A genuine type error** (`invalid_assignment` — `int value = 'wrong';`, used in a widget's own render
  tree): `flutter analyze` reports one real `error`. `bridge validate` reports **"build succeeded"**,
  writes 10 files, and claims **both** `deterministic: true` and `fixed point: true`. The emitted
  `home-screen.tsx` is `export function HomeScreen() { return <Scaffold body={<Text>{'wrong'}</Text>} />; }`
  — a clean, plausible-looking React component, generated from a Dart program that does not compile.
- **A genuine syntax error** (an unterminated parameter list — `void _run( {\n  }`, real Dart:
  `missing_identifier`, `missing_function_body`, `expected_token`, three real parser errors):
  `bridge validate` **again** reports "build succeeded." The malformed method is silently absent from the
  output; the unrelated, valid `build()` method extracts and emits cleanly, as though the file had never
  contained a syntax error at all.
- **A referenced-before-declaration** (`var a = b, b = 1;`) and **a duplicate declaration**
  (`int value = 1; int value = 2;`) both happen to fail today — but for **misleading, unrelated reasons**
  (`BRG3006 print is not declared`/`BRG3004 opaque source`), not because anything recognizes the source as
  invalid Dart. Removing the incidental co-factor (a `print` call; a second use inside a widget-tree
  render position instead of an action body) is enough to make either one either still fail confusingly or
  — for the type-error case above — succeed outright.

The safety this repository currently has against invalid Dart is **incidental**, not designed: a handful
of unrelated, narrower mechanisms (an unresolved-`target` `logic.Ref` later refused by the generator's own
`BRG3006`; `BRG1303`'s narrow `InvalidType`/`null`-type catch, reserved by its own doc comment for
environment incompleteness preflight is supposed to already prevent; the structured-build extractor's own
opaque-source fallback) happen to catch *some* shapes, coincidentally, with diagnostics that misattribute
the cause every time. No mechanism catches a type error between two otherwise-fully-resolved types, and
none catches a syntax error the analyzer's own recovery papers over. This is the exact "AST recovery
confused with semantic validity" failure this ADR exists to close.

## 3. Reading the current pipeline (investigated, not assumed)

`AnalysisSessionHandle.resolve()` (`session/analysis_session.dart`) is the **only** place
`AnalysisSession.getResolvedUnit(path)` is called anywhere in this codebase — real analyzer 14.0.0's
`AnalysisSession`, confirmed directly against the resolved package source at
`~/.pub-cache/hosted/pub.dev/analyzer-14.0.0`, has no `getResolvedUnit2`; `errors` and `diagnostics` are
now the same list (`errors` is `@Deprecated("Use 'diagnostics' instead")`, aliasing `diagnostics`
verbatim), typed `List<Diagnostic>` (`AnalysisError` is now merely `typedef AnalysisError = Diagnostic;`).
`Diagnostic.severity` returns the analyzer package's **own** `Severity` enum (`error | warning | info`) —
same name, same shape, as `bridge_analyzer`'s own `Severity` in `diagnostics/diagnostic.dart`, a real
name-collision risk any implementation must alias-import around.

`.result` (the `ResolvedUnitResult`) is read at exactly two call sites in the whole codebase
(`extract_stage.dart`, `incremental_pipeline.dart`), both `unit.result.unit` — the AST, and only the AST.
`.errors`/`.diagnostics` are obtained and discarded, unread, at every single one of them. `Preflight`
(`workspace/preflight.dart`, `BRG0106`) is a genuinely different, narrower check — purely syntactic/
config-level (does every `import`/`export`/`part` URI resolve to *some file* in the package config),
run *before* any unit is resolved, with no visibility into in-file semantic correctness at all; a file
whose imports all resolve fine but which contains `var a = a;` passes preflight cleanly.

Verified directly (a standalone script against the real, resolved `analyzer` package, on a real two-file
project — one clean file importing one file with a real type error): **each file's own `ResolvedUnitResult.diagnostics`
is scoped strictly to that file's own source span.** The clean file's own diagnostics contained only its
own unrelated warning; the erroneous file's own diagnostics contained only its own error and warning.
Nothing from an imported file leaks into the importing file's own diagnostics list. This directly confirms
the granularity the historical blocker's own wording already implied — "the resolved unit's own analyzer
errors" — is not just a convenient reading but the literal, measured shape of the data.

The existing test suite already documents this gap in its own words, twice
(`extraction_test.dart:3499-3505`, `3831-3835`): *"FlutterBridge's own diagnostics do not surface the
analyzer's own resolution errors (a separate, pre-existing, unrelated characteristic this milestone did
not introduce and is not scoped to fix)"* — M9-C and M9-F both found this and explicitly deferred it. This
milestone is that deferral coming due.

## 4. Severity matrix

Directly measured, not assumed:

| Category | Real example | Analyzer severity | Currently blocks extraction? |
|---|---|---|---|
| Syntax/parser error | unterminated parameter list | `error` (×3 diagnostics) | **No** — the malformed declaration silently vanishes; unrelated valid code still emits |
| Type mismatch | `int value = 'wrong';` | `error` | **No** — extracts, normalizes, generates, "validates" cleanly |
| Referenced-before-declaration | `var a = b, b = 1;` | `error` | Accidentally, via an unrelated downstream refusal (misleading diagnostic) |
| Duplicate declaration | `int value = 1; int value = 2;` (in a render position) | `error` | Accidentally, via the opaque-source fallback (misleading diagnostic) |
| Undefined identifier | `Text('$missingValue')` | `error` | Accidentally, via `BRG1303` (the one existing mechanism that is at least topically related, though narrow and reserved for a different purpose by its own doc) |
| Unused local variable | `final unused = 42;` in an otherwise-valid method | `warning` | Builds successfully today — **must stay this way** |
| Unused declaration | an unreferenced private method | `warning` | Builds successfully today — **must stay this way** |

No case in this matrix required inventing a synthetic diagnostic category the real analyzer does not
already report; `Severity.error` versus everything else is exactly the line the evidence draws.

## 5. Granularity: whole-unit, not declaration-local or AST-node-local

**Selected: gate at the resolved-unit (one Dart source file) level.** If the file's own
`ResolvedUnitResult.diagnostics` contains any `Severity.error` entry, extraction does not run for that
file at all; every declaration in it is skipped, uniformly.

Declaration-local or AST-node-local gating (reject only the declaration/node whose span overlaps an
error) was considered and rejected, on the same reasoning this milestone's own brief already anticipated:
source-offset overlap is not a semantic-dependency model. `final x = brokenFactory(); return
WidgetThatUses(x);` — the visible UI expression need not overlap the error at all, and a widget five
declarations away can depend on a value a range-local recovery would have let through as "unaffected."
Building a real semantic-dependency graph to do this soundly is new, large, unproven compiler architecture
— exactly the kind of scope creep §16/§26 of the milestone brief warns against absorbing into this
milestone. Real Dart itself offers no precedent for partial-file compilation either: a Dart *library* with
one semantic error anywhere in it does not compile at all, regardless of which declarations are reachable
from `main()`. Matching that boundary — whole compilation unit, not whole program (§6) — is the smallest
structural fit, not a preference.

Package-wide (whole-program) gating was also rejected: §3's own measurement shows each file's diagnostics
are already scoped to itself, so a package-wide gate would be new, unjustified severity beyond what the
evidence supports, and would contradict the historical blocker's own "the resolved unit's own analyzer
errors" framing without any evidence requiring it.

## 6. Dependency/multi-file behavior

A clean file `a.dart` importing an erroneous file `b.dart`: `a.dart`'s own resolved unit carries none of
`b.dart`'s errors (§3's own measurement) — `a.dart` is not gated by `b.dart`'s own problem. `b.dart` itself
is gated and skipped. If `a.dart` references a declaration `b.dart` would have provided, that reference
resolves to nothing once `b.dart`'s own extraction is skipped, and existing, unrelated graph-integrity
validation (`BRG1207`/`BRG1201`, unresolved/orphan reference — the same machinery `_checkReferencesResolve`
already enforces for every other dangling reference in this compiler) refuses the whole build for that
reason instead. The user sees two diagnostics in that shape — the real cause (`b.dart`'s own analyzer
error) and a secondary, less specific one (`a.dart`'s own dangling reference) — both real, neither
fabricated, and the build is refused either way. Cleaning up that secondary diagnostic's own wording is
diagnostic-formatting work this ADR does not attempt (§32 of the milestone brief).

## 7. Excluded/unreachable code

An error in a declaration FlutterBridge would never have extracted anyway (an unused private helper) still
gates the whole file. Real Dart itself does not compile such a file at all — `flutter build`/`dart compile`
refuse the entire program the moment any file it analyzes carries an error, independent of reachability.
FlutterBridge's own stated contract is source-faithful conversion of valid Flutter/Dart; accepting a file
the Dart compiler itself rejects, merely because the one invalid declaration happens to be unused, would
be unsound relative to that contract, not a convenience worth preserving.

## 8. Invalid Dart vs. unsupported Dart — the distinction this ADR protects

These are different failures and must never be reported the same way. Unsupported-but-valid Dart (a real,
correct program using a construct this generator does not yet lower) already has its own, correct
mechanism: `MISSING_CAPABILITIES`/`BRG3013` at the generator layer, with its own capability-and-owner
framing. Invalid Dart (a program the Dart compiler itself would refuse) is not a missing capability — there
is no lowering to build toward, because the input was never a valid program. This gate reports invalid
source as **exactly what it is** — the analyzer's own diagnostic, surfaced honestly — never fabricated as
a `BRG3013` capability gap. A dedicated new BRG13xx code (§9) keeps the two permanently distinguishable in
tooling and in a user's own triage.

## 9. Diagnostics ownership

A new extraction-category code, **`BRG1310` (`analyzerRejectedSource`)**, one instance per analyzer-error
diagnostic found in the unit (not one summary per file — each real analyzer diagnostic keeps its own code,
severity, message, and source span; nothing is deduplicated or reworded). The analyzer's own diagnostic
code (e.g. `invalid_assignment`), message, and offset/length are carried through into the reported BRG
diagnostic's own message and span — never erased, never replaced with bridge_analyzer's own paraphrase.
Ordering across multiple diagnostics in one unit follows the analyzer's own reported order (already stable
per-run; `DiagnosticSink.sorted()` — file, then line, then column, then code — gives the final, deterministic
cross-file order the same way every other BRG diagnostic already gets).

## 10. CLI behavior

`bridge analyze`/`validate`/`build` need no new code: the existing "any error-severity diagnostic in the
sink blocks the canonical build, nothing is written" contract (already true for every other BRG error
today — confirmed directly, e.g. `BRG3010`/`BRG3013` already produce "N error(s)... nothing was written")
applies unchanged once `BRG1310` is reported the same way. No stale-output lifecycle work is needed or
attempted: this gate fires during `analyze`, before `.bridge/uir.ndjson` is ever written for the affected
project — there is no "old NDJSON survives a failed re-analyze" case to manage, because analysis itself
now refuses before any file for this project is emitted when a `BRG1310` fires. (A project that had a
*previous*, valid `.bridge/` output and is now edited into invalid Dart still has its old NDJSON on disk
until something overwrites it — that is the pre-existing, general "does `bridge analyze` clean stale
output on failure" question, unrelated to this gate specifically, and out of this milestone's scope per
§32/§14 of the brief.)

## 11. What this ADR does not decide

Declaration-local or AST-node-local recovery (§5); package-wide/whole-program gating (§5); stale-output
lifecycle management beyond what falls out of the existing sink-blocks-write contract (§10); any change to
how *unsupported* (valid) Dart is diagnosed; any change to `Preflight`/`BRG0106`; general incremental
compilation architecture (the `IncrementalPipeline` code path gets the identical gate, at the identical
call site, since both pipelines share `AnalysisSessionHandle.resolve()` — no separate design was needed,
and none is introduced).

## 12. Testing contract

A negative-control family proving the boundary in both directions: every H1–H8-style invalid-Dart shape
this ADR's own evidence gathered must be refused with `BRG1310`, carrying the real analyzer diagnostic
code/message/span; every warning/lint/info-only shape must continue to build exactly as it does today
(unchanged pass/fail outcome); every existing valid-but-unsupported-capability fixture must continue to
report its own `BRG3013` unchanged — proving invalid Dart and unsupported Dart are never confused with
each other. Determinism of *rejection*, not only of success, is required: the same invalid source, analyzed
repeatedly, must produce the identical diagnostic set, in the identical order, with UIR never emitted on
any run.

## 13. Future incremental-compilation implications

None beyond what §11 already states — the gate lives at the one shared resolution call site both the
production and incremental pipelines already funnel through, so a future incremental-compilation milestone
inherits it automatically rather than needing its own copy.
