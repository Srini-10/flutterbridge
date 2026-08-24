# M9-H — Resolved-Unit Analyzer Error Gating & Invalid-Dart Safety Boundary

Baseline: `HEAD == origin/main == 9af287a` (M9-G), verified before any work began.

## 0. Starting checkpoint

`git status` was clean, `HEAD` matched `origin/main` at `9af287a` (M9-G, ScaffoldMessenger/SnackBar
presentation). No uncommitted work, no detached `HEAD`, no stray `compiler-v1` tag confusion.

## 1. Mandatory baseline gate

`just ci` was run before any change, and passed clean at the M9-G baseline: TS build/typecheck/test,
`codegen-check`, `lint`/`lint-negative`, `uir-lint`/`uir-test`, `analyzer-lint`/`analyzer-test`, and
`dart-analyze` on `fixtures/apps/hello_bridge` (the one pre-existing, unrelated `analysis_options.yaml`
drift already present in the working tree, per the CLAUDE.md open-questions note, was left untouched).

## 2. The exact M9-H question

*When `BridgeAnalyzer` obtains a `ResolvedUnitResult` (or equivalent resolved analyzer unit) that carries
Dart analyzer diagnostics, which of those diagnostics must prevent FlutterBridge from extracting UIR from
that source file, and at what boundary should that decision happen?* Framed deliberately not to presuppose
"any diagnostic aborts" — most Flutter files carry warnings and lints on every ordinary build, and treating
those as fatal would be a regression, not a fix.

## 3. Reading the current compiler entry pipeline

`LOAD → EXTRACT → CANONICAL → EMIT` (`pipeline/pipeline.dart`). `LoadStage` (`pipeline/stages.dart`)
discovers the project and runs `Preflight` — a purely syntactic check that every `import`/`export`/`part`
URI resolves to *some file*, with zero visibility into in-file semantic correctness; it never resolves a
unit. `ExtractStage` (`pipeline/extract/extract_stage.dart`) is the sole driver that calls
`AnalysisSessionHandle.resolveAll()` and hands each `ResolvedUnit` to `Extractor(...).extract()`.
`IncrementalPipeline` (`pipeline/incremental_pipeline.dart`) is a second, independent pipeline sharing the
exact same `AnalysisSessionHandle.resolve()` call site. Before this milestone, both call sites read
**only** `unit.result.unit` (the AST) from the `ResolvedUnit` they received — `.errors`/`.diagnostics` were
obtained by the analyzer and then never read, at either site, anywhere in the codebase.

## 4. Reading the actual analyzer API (not memory)

Read directly against the resolved package source at `~/.pub-cache/hosted/pub.dev/analyzer-14.0.0`, pinned
exactly (not caret) in `pubspec.yaml` per ADR-14. `AnalysisSession.getResolvedUnit(String path)` — no
`getResolvedUnit2` in this version. `ResolvedUnitResult` (via `ParsedUnitResult` →
`AnalysisResultWithDiagnostics`) exposes both `.diagnostics` (primary) and `.errors` (`@Deprecated("Use
'diagnostics' instead")`, the identical list). `AnalysisError` is now merely `typedef AnalysisError =
Diagnostic;`. `Diagnostic.severity` returns the analyzer package's **own** `Severity` enum
(`error|warning|info`) — same name and shape as `bridge_analyzer`'s own `Severity`, a real collision
requiring alias-imports (`analyzer_diag`/`bridge_diag`) in the one file allowed to see both.
`Diagnostic.problemMessage` is a `DiagnosticMessage`, not a string — `.messageText(includeUrl: false)` is
required. `Diagnostic.diagnosticCode.lowerCaseName` gives the exact lowercase code text real `flutter
analyze` prints (e.g. `invalid_assignment`); `.name` is deprecated.

## 5. Reproducing the current problem fresh

Real, minimal Dart snippets run through the real pipeline, fresh, not assumed from the M9-C-era historical
note (see ADR-0031 §2 for the full evidence):

- **Type mismatch** (`int value = 'wrong';`, both sides fully resolved): `flutter analyze` reports one real
  `error` (`invalid_assignment`). Before this milestone, `bridge validate` reported **"build succeeded,"**
  wrote 10 files, and claimed both `deterministic: true` and `fixed point: true` — a clean, plausible
  `HomeScreen()` React component generated from Dart that does not compile. This is the milestone's own
  smoking gun: the strongest, least ambiguous evidence that resolved-AST recovery was being read as proof
  of validity.
- **Syntax/parser error** (an unterminated parameter list — three real parser diagnostics:
  `missing_identifier`, `missing_function_body`, `expected_token`): `bridge validate` again reported "build
  succeeded." The malformed declaration silently vanished; the unrelated, valid `build()` method in the
  same file still extracted and would have generated cleanly.
- **Self-reference** (`var a = a;`, `referenced_before_declaration`) and **forward-reference** (`var a = b,
  b = 1;`): real Dart errors, but only *accidentally* caught before this milestone, via unrelated,
  misleadingly-labeled downstream mechanisms — an unresolved `logic.Ref` target later refused by the
  generator's own `BRG3006` ("not declared"), never a deliberate semantic-validity policy.
- **Undefined identifier** (`Text('$missingValue')`): also only accidentally caught, via `BRG1303`
  (`analyzerInconsistency`) — a narrow, pre-existing mechanism whose own doc comment reserves it for "the
  case preflight was supposed to already have caught," never a general semantic-error surfacer.
- **Duplicate declaration at the same scope** (`int value = 1; int value = 2;` inside one block): a real
  Dart error (`duplicate_definition`), previously caught only incidentally, through the opaque-source
  fallback, with a misleading diagnostic that never named the real cause.
- **Wrong argument type** (`addOne('nope')` against `int addOne(int n)`) and **missing required argument**
  (`addOne()`): real `argument_type_not_assignable`/`not_enough_positional_arguments` errors, previously
  unreported by anything in this compiler.

Every one of these is now a dedicated regression test in `extraction_test.dart`'s `'resolved analyzer
errors as a pre-extraction safety gate (ADR-0031, M9-H)'` group (§21).

## 6. Diagnostic severity matrix

See ADR-0031 §4 for the full table. In short: `Severity.error` (syntax, type mismatch, undefined
reference, duplicate declaration, bad call shape) was, before this milestone, either not blocked at all or
blocked only by accident with a misleading cause. `Severity.warning`/`info` (unused locals, unused
declarations, lints) already build successfully today and must continue to.

## 7. Whole-unit vs. local gating

**Selected: whole resolved unit (one Dart source file).** Declaration-local or AST-node-local gating was
considered and rejected — source-offset overlap is not a semantic-dependency model
(`final x = brokenFactory(); return WidgetThatUses(x);` need not overlap the error at all), and building a
real dependency graph to do this soundly is new, unproven compiler architecture out of this milestone's
scope. Whole-program (package-wide) gating was also rejected: a standalone probe against the real,
resolved `analyzer` package on a real two-file project proved directly that each file's own
`ResolvedUnitResult.diagnostics` is strictly scoped to that file's own source span — nothing from an
imported file leaks into the importing file's own diagnostics — so package-wide gating would be
unjustified severity beyond the evidence, and would contradict the historical "the resolved unit's own
analyzer errors" framing without any evidence requiring the wider net. Whole-unit is also the closest
structural match to real Dart's own behavior: a library with one semantic error anywhere in it does not
compile, regardless of which declarations are reachable from `main()`. Full detail: ADR-0031 §5.

## 8. Invalid Dart must not become valid UIR

Enforced by construction: `ExtractStage`'s gate (`extract_stage.dart:80-83`) runs `continue` before
`Extractor(...).extract()` is ever called for a unit whose own `analyzerErrors` is non-empty — no partial,
no fallback, no opaque-but-present node. Proven directly, not merely by code inspection: the H4 (type
mismatch) and H4-style-syntax-error regression tests assert `app.ofKind('ui.Component')` and
`app.ofKind('logic.VarDecl')` are both empty, and the dedicated Mutation-E-closing test (§24, §25) asserts
this at the raw `ExtractionResult.records` layer directly, independent of any downstream masking.

## 9. Dependency/multi-file semantics

A clean `main.dart` importing an erroneous `helper.dart`: `main.dart`'s own resolved unit carries none of
`helper.dart`'s diagnostics (§7's own measurement) — `main.dart` is never blamed for `helper.dart`'s error,
and, critically, `main.dart`'s **own** extraction is never skipped either. `helper.dart` itself is gated and
skipped. Proven at two layers: the black-box `extraction_test.dart` test (final-document diagnostics never
carry `BRG1310` against `main.dart`) and a second, direct `LoadStage`/`ExtractStage`-level test (§24, added
to close a genuine verification gap found during Mutation F) asserting `main.dart`'s own `ui.Component`
record is present in the raw `ExtractionResult.records`, never withheld by `helper.dart`'s unrelated error.

## 10. Excluded/unreachable code

An error inside a declaration FlutterBridge would never have extracted anyway (an unused, unreachable
private helper function) still gates the whole file. Real Dart itself does not compile such a file at all —
`flutter build`/`dart compile` refuse the entire program the moment any file it analyzes carries an error,
unconditional on reachability. Matching that is the smallest structural fit, not a convenience call.
Regression test: `'an error in an unused, unreachable declaration still refuses the whole file'`.

## 11. Parser/syntax error handling

Handled uniformly with semantic errors: a syntax error is still `Severity.error` in
`result.diagnostics`, so it flows through the identical `analyzerErrors` gate with no separate code path.
Regression test: `'a genuine syntax error refuses the whole file — the malformed declaration never
silently vanishes'`.

## 12. Warning/lint non-blocking control

Only `analyzer_diag.Severity.error` is collected into `analyzerErrors`
(`_analyzerErrorsOf`, `analysis_session.dart`) — `warning` and `info` are explicitly skipped
(`if (diagnostic.severity != analyzer_diag.Severity.error) continue;`). Two dedicated negative controls:
an unused-local warning-only file builds unaffected, and an info-severity control confirms this gate reads
the *analyzer's* severity, never `bridge_analyzer`'s own diagnostic stream (which already carries
non-error entries on every ordinary build).

## 13. Diagnostic ownership

New extraction-category code **`BRG1310` (`analyzerRejectedSource`)**, one instance per real analyzer
error diagnostic (never one summary per file, never deduplicated or reworded). The analyzer's own
diagnostic code, message, and offset/length translate straight through into the `BRG1310` message and
`SourceSpan` — `'${diagnostic.problemMessage.messageText(includeUrl: false)} (${diagnostic.diagnosticCode.lowerCaseName},
real Dart error — not a FlutterBridge capability gap).'` Never relabeled as, or confused with, a BRG3013
capability gap (§8 of the ADR; §16 below).

## 14. CLI behavior

No new CLI code. The pre-existing, general `DiagnosticSink.hasErrors → EmitStage refuses to write` contract
— already true for every other BRG error code — applies unchanged once `BRG1310` is reported through the
same sink. `bridge analyze`/`validate`/`build` all refuse to write a document the moment a `BRG1310` fires,
exactly as they already refuse on any other error-severity diagnostic.

## 15. Architecture/ADR gate

`docs/adr/0031-resolved-analyzer-errors-as-a-pre-extraction-safety-gate.md` was written and reviewed before
any implementation code — 13 sections: the question; why AST recovery is insufficient (direct evidence);
reading the current pipeline; the severity matrix; the granularity decision (whole-unit, with rejected
alternatives and reasoning); dependency/multi-file behavior; excluded/unreachable code; the invalid-vs-
unsupported distinction; diagnostics ownership; CLI behavior; what the ADR does not decide; the testing
contract; future incremental-compilation implications (none — the gate lives at the one shared
`AnalysisSessionHandle.resolve()` call site both pipelines already funnel through).

## 16. Implementation gate

Confirmed before writing code: (1) the gate reads only real, already-computed analyzer diagnostics — no
new analysis pass; (2) no schema change — `BRG1310` is a diagnostic, not a UIR node; (3) no `NodeId`
change; (4) no N1–N11 normalization-pass change; (5) no runtime change; (6) no generator change; (7) gating
is whole-unit, per §7's own evidence; (8) warnings/lints/info never block, per §12; (9) invalid Dart is
never relabeled as a capability gap, per §13; (10) both `ExtractStage` and `IncrementalPipeline` get the
identical gate, at the identical shared call site; (11) the historical "resolved unit's own analyzer
errors" framing is preserved, not overridden — confirmed correct by direct measurement rather than merely
assumed; (12) `Preflight`/`BRG0106` is untouched — a different, narrower, earlier check; (13) no gating by
message or error-code list — the gate reads `Severity` alone; (14) no source-offset-overlap reasoning
anywhere in the implementation; (15) deterministic rejection — the same invalid source refused identically
on repeated runs, proven by a dedicated test; (16) the error range is not promoted into a second semantic
model — `analyzerErrors` is a flat `List<Diagnostic>`, translated once, never re-interpreted; (17) CLI
needs no new code, per §14; (18) every existing valid-but-unsupported (BRG3013-family) fixture keeps
reporting its own code unchanged, never `BRG1310`. All 18 confirmed true; none required deviating from the
bounded, additive design in §17.

## 17. Implementation actually shipped

- `ResolvedUnit` (`session/analysis_session.dart`) gained one new field, `analyzerErrors: List<bridge_diag.Diagnostic>`
  (default `const []`), computed by `_analyzerErrorsOf` from `result.diagnostics`, filtered to
  `Severity.error`, translated to bridge_analyzer's own `Diagnostic` model carrying `Codes.analyzerRejectedSource`.
- `ExtractStage.execute()` gained a four-line check ahead of the existing `Extractor(...).extract()` call:
  non-empty `unit.analyzerErrors` reports them into `context.diagnostics` and `continue`s past extraction
  for that unit.
- `IncrementalPipeline`'s extractor closure gained the identical check, returning `const <RawNode>[]`
  instead of `continue` (the loop shape there is a closure, not a `for`, but the effect is the same: no
  extraction for that unit).
- `Codes.analyzerRejectedSource` (`BRG1310`) added to `diagnostics/codes.dart`, category `extraction`,
  default severity `error`.

No schema file, no `NodeId`/identity code, no normalization pass, no runtime file, and no generator file
was touched — matching §16's own gate exactly.

## 18. Message/code-list gating — deliberately avoided

The gate reads `diagnostic.severity` alone (`analyzer_diag.Severity.error`). No `diagnosticCode` allow-list
or deny-list exists anywhere in `_analyzerErrorsOf`. This was a deliberate design choice, not an oversight:
a code list would need to be kept in sync with every current and future analyzer error code, would silently
under-gate on any code missed, and would misrepresent the actual boundary (real Dart validity), which
`Severity.error` already models exactly.

## 19. Error data is not a second semantic model

`analyzerErrors` is consumed exactly once, by the immediate caller (`ExtractStage`/`IncrementalPipeline`),
to decide skip-or-extract and to forward the diagnostics unchanged into `context.diagnostics`. Nothing
downstream (the canonical builder, N1–N11, any generator) inspects `ResolvedUnit.analyzerErrors` or is
aware it exists — confirmed by the fact that no file outside `session/`, `pipeline/extract/`, and
`pipeline/incremental_pipeline.dart` was touched by this milestone at all.

## 20. Test fixture

No new on-disk fixture app was needed: every regression test in this milestone constructs its Dart source
inline via the existing `extract()`/`createProject()` test harness (`test/support/temp_project.dart`),
matching the pattern the rest of `extraction_test.dart` already uses for source-level behavior tests. The
existing `fixtures/apps/snackbar_presentation` fixture (all valid Dart) serves as the milestone's positive
end-to-end control (§28).

## 21. Test matrix

The `'resolved analyzer errors as a pre-extraction safety gate (ADR-0031, M9-H)'` group in
`extraction_test.dart` (14 tests):

1. H3 — undefined identifier refuses the whole file, real analyzer diagnostic (not `BRG1303`)
2. H4 — genuine type mismatch (both sides resolved) is refused — the defect this milestone closes
3. H5 — wrong argument type is refused
4. H6 — missing required argument is refused
5. A genuine syntax error refuses the whole file; the malformed declaration never silently vanishes
6. A warning-only file (unused local) is unaffected
7. An info-severity diagnostic does not block
8. An error in an unused, unreachable declaration still refuses the whole file
9. A clean declaration sharing an erroring file never reaches even the raw extraction output (direct
   `LoadStage`/`ExtractStage` test — closes the Mutation E verification gap, §24/§25)
10. A clean file importing an erroneous one is unaffected by the erroneous file's own diagnostics
    (black-box)
11. `main.dart`'s own extraction is never skipped for `helper.dart`'s error (direct `LoadStage`/
    `ExtractStage` test — closes the Mutation F verification gap, §24/§25)
12. Valid-but-unsupported Dart (a record literal) still reports the ordinary `BRG3013`-family gap, never
    `BRG1310`
13. The same invalid source is refused identically on repeated, independent runs (determinism)

Plus two pre-existing tests in the `'sequential declaration-list scope (ADR-28, amended M9-C)'` group,
rewritten from "left unresolved, not fabricated" assertions to `BRG1310`-refusal assertions (self-reference,
forward-reference), and one new test in that same group for a genuine same-scope duplicate declaration.
Full suite: 420 tests, 0 failures (`dart test`, `dart/bridge_analyzer`).

## 22. Diagnostic regression tests

`docs/adr/0031-...md` and `codes.dart`'s own `explanation` string were cross-checked against the actual
`BRG1310` message a live test produces (`onlyError(app).message`) — the H3 test asserts the message
`contains('undefined_identifier')`, H4 asserts `contains('invalid_assignment')`, H5
`contains('argument_type_not_assignable')`, H6 `contains('not_enough_positional_arguments')` — the real
analyzer's own code text, not a paraphrase.

## 23. Build/analyze/validate command tests

`bridge validate --json` was run directly against `fixtures/apps/snackbar_presentation` (all valid Dart,
the M9-G control fixture): `ok: true`, both `deterministic` and `fixed point` checks `ok: true` — confirming
this gate does not disturb an ordinary, valid build. (`fixtures/apps/hello_bridge` currently fails
`bridge validate` at the `normalize` stage on `BRG2305`, a pre-existing, unrelated multi-hop
parameter-forwarding limitation with its own ADR-11-amendment citation in its own message — untouched by
this milestone, and not fixed here per §32.)

## 24. Adversarial mutations

Applied, confirmed caught, reverted — each verified both by re-running the specific test that should catch
it and by re-running the full `analyzer-test` suite after reverting:

- **A — disable the gate** (mutation not separately re-applied this session; already covered structurally:
  every H3–H6/syntax/duplicate/self-reference/forward-reference test in §21 fails immediately if the
  `if (unit.analyzerErrors.isNotEmpty) { ...; continue; }` block is removed, since each asserts `app.errors`
  is non-empty and `app.ofKind(...)` is empty).
- **B — gate on any-diagnostic instead of error-severity** (covered structurally: the warning-only and
  info-only negative controls fail immediately if `_analyzerErrorsOf` stops filtering on
  `Severity.error`).
- **C — gate on only one specific error code** (covered structurally: H4/H5/H6/syntax/duplicate all use
  different real analyzer codes; a single-code allow-list fails all but one).
- **D — misclassify as a capability gap** (covered structurally: the valid-but-unsupported test asserts
  `BRG1302`, never `BRG1310`, for a record literal — and every H-test asserts `BRG1310` specifically, not
  `BRG3013`/`BRG1302`).
- **E — allow a clean declaration through despite whole-unit gating.** Actively applied: removed the
  `continue;` from `ExtractStage`'s gate, keeping only the diagnostic-reporting call. **Not caught** by the
  existing black-box test (`'an error in an unused, unreachable declaration...'`) — the pre-existing,
  unrelated `DiagnosticSink.hasErrors → EmitStage refuses to write` net empties the final document
  regardless of whether `ExtractStage`'s own skip logic fired, masking the mutation's effect. This was a
  genuine coverage gap, closed by adding test 9 (§21) — a direct `LoadStage`/`ExtractStage` invocation
  bypassing `EmitStage` entirely, inspecting `ExtractionResult.records` for `span.file == 'lib/main.dart'`.
  Re-applied the mutation against the new test: **failed as expected** (`Expected: empty / Actual: 3
  records`, including the otherwise-valid `ui.Component`). Reverted; full suite re-confirmed green (12/12,
  then all 420).
- **F — over-gate an importing file for an imported file's own diagnostics** (if local-only gating were
  broken). Actively applied: mutated `AnalysisSessionHandle.resolveAll()` to accumulate every unit's
  `analyzerErrors` into a running list and attach the cumulative list to every subsequently yielded unit —
  simulating diagnostic leakage across files. **Not caught** by the existing black-box dependency test (the
  same `hasErrors`-masking blind spot as Mutation E: the final document was empty either way, because
  `helper.dart`'s own genuine error already blocks the write). Closed by adding test 11 (§21), the direct
  `LoadStage`/`ExtractStage` test asserting `main.dart`'s own `ui.Component` **is** present in
  `ExtractionResult.records` even when `helper.dart` (which it imports) carries a real error. Re-applied the
  mutation against the new test: **failed as expected** (`Expected: non-empty / Actual: []`). Reverted;
  `analysis_session.dart` diffed back to byte-identical with the pre-mutation state (confirmed via `git
  diff`, showing only the intended §17 implementation, no mutation residue).
- **G — nondeterministic diagnostic ordering** (optional, not separately mutated this session): already
  covered by the existing determinism test (test 13, §21), which asserts identical code/message/`span.line`
  across two independent runs of the same invalid source — a nondeterministic ordering bug would fail that
  assertion directly.

Both actively-applied mutations (E, F) surfaced a real, identical-shaped verification gap: the black-box
test layer (final NDJSON document) cannot distinguish "this gate's own skip logic fired correctly" from
"something unrelated downstream refused to write anyway." Both were closed the same way — a direct,
lower-level test invoking `LoadStage`/`ExtractStage` without ever reaching `EmitStage`, inspecting the
intermediate `ExtractionResult.records` at the exact layer the gate operates on.

## 25. Silent-wrong-code audit

Before this milestone, at least one real, previously-undetected defect was silently present in this
repository's own large-fixture test suite: `build_proof_test.dart`'s ~20KB `layoutProofSource` fixture
called `EdgeInsets.symmetric(...)`, which the shared `EdgeInsets` stand-in in `temp_project.dart` never
declared — invalid against the stand-in, silently uncaught because nothing previously checked analyzer
errors. Fixing the stand-in (adding the constructor and its fields) changed the fixture's own extracted
output by exactly one field's worth of content, requiring a genuine, one-line regeneration of
`fixtures/uir/layout_proof.ndjson` (confirmed the new golden matches a fresh, independent run before
committing it). Separately, 15 other pre-existing test failures surfaced once the gate went live, triaged
into two categories: (a) genuine, previously-undetected bugs in shared test stand-ins
(`temp_project.dart`'s `ColorScheme`/`ThemeData`/`MaterialApp`, `transition_test.dart`'s `showDialog`/
`debugPrint` stand-ins) that real M7-K/M9-D-era fixtures needed but the stand-in never declared — fixed
mechanically; (b) tests specifically, deliberately built around the old "silently extract invalid Dart"
behavior (self-reference, forward-reference, same-scope duplicate declaration, a non-exhaustive guarded
switch, an unresolved `Navigator`/`MaterialPageRoute` reference in
`route_argument_positions_test.dart`) — updated to assert the new, correct `BRG1310`-refusal contract,
never "fixed" as though they were bugs. Each triage decision was verified against a real `flutter
analyze`/`dart analyze` run on the extracted fixture text before deciding which category applied, per this
session's established "prove it, don't assume it" discipline. No silent wrong-output case survived this
audit undetected or unexplained.

## 26. No identity/schema/N-pass/runtime/generator changes

Confirmed by the diff itself: every file this milestone touches is under `dart/bridge_analyzer/lib/src/{diagnostics,pipeline,session}/`
or `dart/bridge_analyzer/test/`, plus the new ADR and this doc, plus the one regenerated fixture golden
(§25). No file under `packages/uir/`, `packages/adapters/`, `packages/generators/`, `packages/runtimes/`,
or the schema itself was touched.

## 27. Regression matrix

`dart test` in `dart/bridge_analyzer`: 420 tests, 0 failures, exit 0. `just ci` (TS build/typecheck/test —
367 TS tests across 37 files — `codegen-check`, `lint`, `lint-negative`, `uir-lint`, `uir-test` — 28 tests
— `analyzer-lint`, `analyzer-test` — 420 tests — `dart-analyze` on `hello_bridge`): fully green, 0
failures, 0 lint issues (including `--fatal-infos`; see §29 for the one lint fix this milestone's own new
test fixtures required).

## 28. Full validation

- `just ci`: green (see §27).
- `just typecheck`, `just lint`, `just codegen-check`, `just dart-analyze`: each ran as part of `just ci`
  above; all green.
- `just determinism`: killed by the harness partway through (`signal 15`, after completing run 1 of 3) —
  the identical outcome M9-G's own final report already recorded for this same recipe. Reported honestly
  rather than retried in a loop; this milestone touches no schema/normalization/generator/runtime code
  (§26), so it has no plausible mechanism to affect this recipe's own determinism property, but the recipe
  itself was not able to be run to completion in this environment.
- `bridge validate` on `fixtures/apps/snackbar_presentation` (valid-Dart control): `ok: true`,
  `deterministic: true`, `fixed point: true` (§23).
- `git diff --check`: clean, no whitespace errors.

## 29. Determinism of failure

The dedicated determinism test (§21, test 13) proves rejection is deterministic, not only success:
`extract()` run twice on byte-identical invalid source produces `errors` of length 1 on both runs, with
identical `code.id`, identical `message`, and identical `span.line` — and `nodes` empty on both runs.

## 30. Documentation

This document. Cross-referenced against `docs/adr/0031-resolved-analyzer-errors-as-a-pre-extraction-safety-gate.md`
(13 sections, written and reviewed before implementation) and the milestone-doc index convention already
established by `docs/m9/m9a`–`m9g`.

## 31. FlutterBridge-only boundary audit

No reference to Continuum, or to any application-specific name, exists anywhere in this milestone's diff —
confirmed by inspection of every touched file (`codes.dart`, `analysis_session.dart`, `extract_stage.dart`,
`incremental_pipeline.dart`, the ADR, this doc, and every test file). Every fixture is inline, synthetic
Dart written for this milestone alone, or the pre-existing `snackbar_presentation`/`hello_bridge` fixtures
already in the repository. The gate's own logic is structural (`Severity.error` in a resolved unit's own
diagnostics) and has no dependency on any one application's shape.

## 32. Unrelated blockers — not fixed

`fixtures/apps/hello_bridge/analysis_options.yaml`'s pre-existing drift (present in `git status` before
this milestone began) was left untouched, unstaged. `hello_bridge`'s own `bridge validate` failure at the
`normalize` stage (`BRG2305`, multi-hop parameter forwarding across a route boundary) is a pre-existing,
unrelated, already-documented limitation (its own message cites "ADR-11 amendment §multi-hop") — not
touched, not worked around, not silenced.

## 33. Commit/push

See the final report for the exact commit hash and push confirmation.

## 34. Final report

Delivered as the assistant's own chat message at the close of this milestone, per the brief's own
instruction that the report is a communication to the user, not a repository artifact.

## 35. Stop condition

This milestone ends here. **M9-I has not been started.** No file, branch, or draft related to a
hypothetical M9-I exists anywhere in this working tree or in any uncommitted change.
