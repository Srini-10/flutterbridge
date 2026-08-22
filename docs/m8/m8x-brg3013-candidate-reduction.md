# M8-X — `BRG3013` Candidate Reduction and Next-Target Decision

Baseline: `a49a7e7` (M8-W, "remaining BRG3013 census").

**Outcome: docs-only. No production code changed.** Real, executable reduction ladders — not prose —
resolve every ambiguity M8-W left open. Two of the four candidates (`showDialog`, `_log`) are now
**decisively disqualified** by direct evidence; one (`Navigator.of`) is **decisively eliminated because
its underlying mechanism already works end-to-end** for every real-corpus-shaped use; one
(switch-expression) remains genuinely unresolved but is confirmed to need cross-language analyzer work
this milestone did not attempt. **Selected target: NONE.**

## 1. Contract

Take M8-W's four named candidates through real, executable reduction ladders — isolating each from the
entangled real Continuum sites that made M8-W unable to decide — and select exactly one bounded
implementation target, or prove none is ready. Do not repeat M8-W's mistake of reasoning from diagnostic
prose alone.

## 2. Baseline — verified

```
git status --short   →  M fixtures/apps/hello_bridge/analysis_options.yaml   (only)
git rev-parse HEAD           = a49a7e7c5718241c0570cb07a0c2fe294c0bc7c3
git rev-parse origin/main    = a49a7e7c5718241c0570cb07a0c2fe294c0bc7c3
```

`HEAD == origin/main`. Read before investigating: `CLAUDE.md`; `docs/adr/0011-cross-route-state-promotion.md`
and its amendment; `docs/adr/0025-the-navigation-model.md`; ADR-28/ADR-29; `docs/m8/m8p-*.md`,
`m8r-*.md`, `m8u-*.md`, `m8v-*.md`, `m8w-*.md`. Then the actual production implementation: `dart/bridge_analyzer/lib/src/session/extract/statement_extractor.dart`,
`transition_extractor.dart`, `expression_extractor.dart`; `dart/bridge_analyzer/lib/src/session/adapters/route/material_adapter.dart`;
`packages/compiler/src/internal/passes/n11_promote_cross_route_state.ts`; `packages/generators/react/src/internal/emit/statement.ts`,
`routes.ts`, `unsupported.ts`.

## 3. M8-W reproduction — fresh, this session

Fresh `bridge analyze --json` + `bridge generate --json`, both real Continuum apps, current HEAD's own
built CLI:

| | mac | droid |
|---|---:|---:|
| analyze total | 95 | 124 |
| generate errors/warnings | 41 / 17 | 45 / 19 |
| `BRG3001`/`BRG3002`/`BRG3004`/`BRG3005`/`BRG3006`/`BRG3008`/`BRG3013` | 14/12/8/1/15/1/**7** | 15/13/12/1/15/1/**7** |
| files emitted | 0 | 0 |

**Byte-identical to M8-W's own reported numbers.** M8-W's classification is confirmed accurate — no
discrepancy to explain. This is expected: no production code changed between `a49a7e7` and this
measurement.

## 4. Candidate A — `showDialog`

**Real-site check first.** Both real Continuum `showDialog` call sites were read directly:

```dart
// continuum_ui_kit.dart:82-90 (showFileOfferDialog)
final accepted = await showDialog<bool>(
  context: context,
  builder: (context) => AlertDialog(title: Text(...), content: Column(...)),
);

// settings_page.dart:98-106 (a sig.Action)
final confirmed = await showDialog<bool>(
  context: context,
  builder: (context) => AlertDialog(title: Text(...), content: const Text(...), actions: [...]),
);
```

**Both construct `AlertDialog` — a Flutter *framework* widget — directly as the builder's return value.**
Neither wraps it in a project-defined `ui.Component`.

**Answering Phase 2's own questions, from source:**

1–2. `showDialog<T>` is `package:flutter/material.dart`'s own top-level function (not a `Navigator`
method).
3. **Confirmed: yes.** `material_adapter.dart`'s `navigationActionOf` (§342-368, read directly) is
reached only for a `MethodInvocation` whose `enclosingElement` is a type in
`MaterialCatalog.navigationTypes` (i.e., a *method call on* `Navigator`/`NavigatorState`). `showDialog` is
a **top-level function call**, not a method call on any such type — the ownership pre-check never lets it
reach the push/pop/replace classification at all.
4–6. **Answered by the ladder, not assumed.** A real, `flutter analyze`-clean reduction fixture
(`showDialog<void>(context: context, builder: (c) => const AlertDialog(...))`, three shapes — simplest,
result-used, `barrierDismissible: false`) was run through the real analyzer. Result: **5 `BRG1302`
diagnostics**, all identical: *"This navigation pushes `AlertDialog`, which is not a component this
project declares — an inline tree, or a widget from a package."* — i.e., `showDialog` **is** recognized as
a navigation (it reaches `TransitionExtractor._destination()`), but that function requires the builder's
result to resolve to a project-declared `ui.Component` (`out.componentSymbolOf(...)`), exactly the same
check `Navigator.push`'s `MaterialPageRoute(builder: ...)` uses. `AlertDialog` never satisfies this — it
is a framework widget, not a component the project declares. **This is not a missing case; it is a
categorical mismatch**: a dialog's destination is an inline widget *tree* to render, not a routed
component reference. Existing `logic.Navigate`/`app.RouteTransition` is **not** semantically sufficient —
confirmed directly, not assumed, per Phase 2's own explicit instruction not to lower `showDialog` to
`Navigator.push` merely because both display UI.
7–12. Not reached — the destination-resolution mismatch (§6) blocks before return-value type, barrier
dismissal, or generic-result semantics become relevant.

**Reduction ladder result (A1–A10, real Dart, real analyzer):** A1 (simplest), A4 (result used), A6
(`barrierDismissible`) — all three fail identically at the same structural point. A2/A3/A5/A7–A10 were not
separately built: the failure in A1 is categorical (the destination check itself, not an argument or
await shape), so varying those dimensions would not change the outcome — confirmed by A1 vs. A4 vs. A6
already spanning "simplest," "result consumed," and "an optional named argument present," all identical.

**Disqualified. Not a recognition gap — a genuine, unresolved architecture question**: what UIR construct
represents "render this inline widget tree as a dialog" is not decided. `docs/adr/0025-the-navigation-model.md`
§80–81's own text ("overlay routes | D2... An overlay **is** a navigation to an inline destination") reads
as though this is already covered, but the *executable* mechanism it names (`logic.Navigate` +
`app.RouteTransition.component`) is proven, by direct real-Dart evidence, to require a project component,
which a dialog's real-world usage never supplies. **The ADR's own prose overstates what its mechanism
currently covers — trusted the executable evidence over the prose, per this milestone's own instruction.**

## 5. Candidate B — `Navigator.of`

**Isolated first, per instruction — never using the SettingsPage/N11 site as evidence.** A real,
`flutter analyze`-clean fixture with a project-defined `TargetScreen`/`ArgTargetScreen` destination (no
cross-route state) was built and run through the real analyzer, then the real generator:

| Rung | Shape | Analyzer result | Generator result |
|---|---|---|---|
| B1 | `Navigator.of(context).push(MaterialPageRoute(builder: (c) => const TargetScreen()))` | clean, `logic.Navigate{action:push, transition:<id>}` | **`router.push(<destination>);`** — fully lowered |
| B2 | `Navigator.of(context).pop()` | clean, `logic.Navigate{action:pop}` | **`router.pop();`** — fully lowered |
| B3 | `Navigator.of(context).pushReplacement(...)` | clean, `logic.Navigate{action:replace}` | **`router.replace(<destination>);`** — fully lowered |
| B4 | `Navigator.of(context).popUntil((r) => r.isFirst)` | 1 `BRG1304` (predicate not modeled — ADR-0025 D2's own documented, deliberate limitation) | refused, named precisely (`popUntil` not lowered — matches the analyzer's own diagnostic) |
| B7 | `await Navigator.of(context).push(...)` (bare awaited statement) | clean, same as B1 | same as B1 |
| B8 | `final result = await Navigator.of(context).push<String>(...)` (result captured) | **no `logic.Navigate`** — falls to generic expression extraction, since the statement is a `VariableDeclarationStatement`, not the bare `ExpressionStatement` `navigateOf`'s pattern matches | generic `Navigator.of` `BRG3013` (the "not built yet" message — an accurate refusal for *this* real gap, distinct from a semantic error) |
| B-extended | `Navigator.of(context).push(MaterialPageRoute(builder: (c) => const ArgTargetScreen(label: 'hi')))` (primitive argument) | clean, `logic.Navigate` with a resolved `transition` carrying the `label: 'hi'` binding | fully lowered |

**Reading `packages/generators/react/src/internal/emit/statement.ts:198-264` directly (not inferred from
a diagnostic message) confirms: `pop`, `push`, and `replace` are already fully implemented generator-side.**
Only `popUntil` (and any future, unnamed action) hits the `default:` case, which is an intentional,
precisely-named refusal, not an oversight (`statement.ts:247-263`'s own comment: *"`push`, `replace` and
`popUntil` are modelled by the schema and not lowered yet"* — stale prose again: push/replace **are**
lowered, contradicting the comment's own claim; only `popUntil` genuinely is not).

**Answering Phase 3's own question directly: the real gap is not "recognition of
`Navigator.of(context).X`" at all — that already works, both analyzer and generator, for every
common real-corpus shape.** The one genuinely narrow gap (B8, a captured navigation result) has **zero
real Continuum payoff** — no real site in either app captures a push's own result — so it does not
independently justify implementation.

**The real SettingsPage site's own `Navigator.of` `BRG3013`** (M8-W's `de82af8f2af6e041`) is now fully
explained: it is a `push` to `SettingsPage`, a real project component — the ladder proves this class of
call succeeds when isolated. The one thing the ladder does not reproduce is `SettingsPage`'s own
argument-heavy construction; since generation is all-or-nothing, and the *same* `app.RouteTransition`
node separately carries an N11 promotion failure (M8-W's `f18dee92f257f0d1`), the entangled failure is
N11's, not `Navigator.of`'s. **Candidate B is eliminated — not for lack of a bounded fix, but because
there is nothing left to fix**: push/pop/replace with real-shaped arguments already work end-to-end,
proven by direct execution, and the one narrow neighboring gap (B8) has no real payoff.

## 6. Candidate C — switch expression

`describeTransferFailure`'s exact real body re-confirmed from source (`continuum_ui_kit.dart:121-127`):

```dart
String describeTransferFailure(TransferFailureReason reason) => switch (reason) {
  TransferFailureReason.permissionDenied => 'failed: permission denied',
  TransferFailureReason.hashMismatch => 'failed: checksum mismatch',
  TransferFailureReason.ioError => 'failed: storage error',
  TransferFailureReason.none => 'failed',
};
```

An isolated reduction rung (`switch (r) { Reason.a => 'A', Reason.b => 'B', Reason.c => 'C' }`, exhaustive,
no guards, simple enum-constant patterns — matching the real shape's own complexity exactly) was run
through the real analyzer: **one `BRG1302`**, *"A `switch expression` has no UIR representation. It is
preserved as an opaque expression, with its source text, so nothing is lost and a later milestone or an
override can model it."*

Read `dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart:1220` (the opaque-reason
dispatch table) and `statement_extractor.dart:260-279` (the existing `logic.Switch` **statement**
extraction) directly: the existing `logic.Switch`/`SwitchCase{test: Expr, body: Stmt[]}` shape only walks
`SwitchCase.expression` — Dart's classic, pre-3.0, value-equality `case value:` form. Dart 3's switch
*expression* uses a structurally different AST node (`SwitchExpressionCase`, with a `guardedPattern`/
`pattern` and a value `.expression`, not a statement list) that the extractor does not walk at all. This
is a **deliberate, explicit deferral** (the diagnostic's own text says so), not an oversight — and closing
it means teaching the *Dart-side* extractor a new AST shape and deciding how a pattern's arm (a bare enum
constant, in Continuum's own real case; potentially a guard or a destructuring pattern in general) maps
onto `SwitchCase.test`/`.body`.

**Not built past this point.** Whether `logic.Switch`'s *existing* schema is sufficient for the *narrow*,
no-guard, enum-constant-pattern subset Continuum's own real site uses (very plausible, since a
`return switch (x) { A => v1, B => v2 }` desugars losslessly into `switch (x) { case A: return v1; case
B: return v2; }`, which the existing schema already represents) is a real, answerable question — but
answering it requires writing and testing Dart-side (`package:analyzer` AST) extraction code, which is
cross-language work this session has not previously done (M8-U through M8-W were all TypeScript-generator-only
or read-only investigations) and which this milestone's own scope (a reduction-ladder/decision milestone,
not an implementation spike into unfamiliar territory) did not attempt. **Genuinely unresolved, not
disqualified** — the honest state is "plausibly small, unverified," which is not the same as "proven
small."

## 7. Candidate D — `_log` / `FieldDecl`

**D1–D12 ladder, independent of `Logger`** (real Dart, real analyzer): `const cPrimitive = 5;`,
`final fPrimitive = 6;`, `const cList = ['a', 'b'];`, `final fConstructed = Widgetish('hello');` (a
project-defined class construction, standing in structurally for `Logger`'s own "FieldDecl initializer
constructs a class" shape without needing the actual third-party `logging` package, which this scratch
fixture correctly avoided depending on to keep the ladder self-contained). **Result: zero analyzer
diagnostics for all four.** Confirms M8-W's own finding (§6, identity is sound) directly: the analyzer
extracts every FieldDecl shape cleanly, with no gap on that side.

**Generator result: all four hit `BRG3013`**, the identical message `_log` itself gets: *"is a
project-defined top-level variable, and this generator does not yet lower a `logic.FieldDecl` to a
module-level TypeScript declaration."* This is `docs/m8/m8u-narrow-function-module-emission.md` §11's own
explicitly-scoped-open relationship ("Not implemented (ADR-29 §9)... the identical per-source-file
ownership model and reachability generalization would apply") — confirmed still true, unimplemented,
and (per the ladder) evidently bounded in the same way `FunctionDecl` module emission was in M8-U: no new
architecture, an extension of ADR-29's own existing model.

**But the real `_log` initializer is `Logger('Pairing')`** (`pairing_page.dart:20`, re-confirmed from
source) — a `package:logging` class construction, structurally identical to the already-refused
`DateTime`/`File` cases seen in Continuum's own real generate output (*"is one of this application's own
classes, and this generator does not emit class declarations"* — `BRG3002`). **Quantifying the real payoff
honestly, as instructed**: implementing generic top-level `FieldDecl` module emission would change `_log`'s
own diagnostic from `BRG3013` ("FieldDecl not lowered") to a **different, still-blocking** refusal
(`logic.New`'s own existing, correct `Logger`-construction refusal) — `_log` would **still** not emit, and
Continuum's own `files emitted` count would **still** be 0/0 for both apps, because `_log` is the *only*
`FieldDecl`-shaped `BRG3013` site in the entire corpus (confirmed by M8-W's own site table, §4 of
`m8w-*.md`, re-verified fresh in §3 above — no other `BRG3013` site is `FieldDecl`-shaped). **Net real
Continuum payoff of implementing FieldDecl module emission alone: zero files newly emitted, zero sites
newly unblocked — a diagnostic reclassification, not a capability win.**

## 8. Control candidates — reconfirmed, not implemented

- **`ScaffoldMessenger.of`**: schema required — yes, implicitly (no construct names a messenger-overlay
  queue). ADR required — yes, explicitly, per the diagnostic's own text ("no ADR models it yet"), unchanged
  from M8-W. Runtime required — likely yes. Existing representation sufficient — no. Narrow subset
  possible — undetermined until the ADR exists. **Deferred, per instruction.**
- **SettingsPage/N11 route-boundary architecture**: schema required — no (existing `app.RouteTransition`/
  N11 pass already model the boundary). ADR required — yes, for a new case: N11's own documented case
  enumeration (`n11_promote_cross_route_state.ts`, cases 1–6) has no case for a `State`-instance-field
  source (`_env`, not a `sig.Signal`) or an inline-constructed data object argument (`DiagnosticsInfo(...)`,
  itself containing a `Duration` computed from `DateTime.now().difference(...)`). Runtime required — no.
  Existing representation sufficient — no, for this specific argument shape. **Deferred, per instruction —
  confirmed entangled with Candidate B's own real site (§5), not independently smaller.**

## 9. Reduction ladders — summary

All four primary candidates were taken through real, `flutter analyze`-clean Dart fixtures, run through
the real `bridge_analyzer`, and (for B and D) the real generator — not hand-authored UIR, matching this
project's own established methodology. No ladder was left at the prose-reading stage for A, B, or D; C's
ladder reached the exact same single diagnostic real Continuum produces, confirming the isolated rung
matches the real site precisely, before the investigation turned to reading the extractor source that
explains *why*.

## 10. Semantic-equivalence analysis

- **A**: `showDialog` is proven **not** semantically equivalent to `Navigator.push` for real usage — a
  dialog's builder returns an inline widget tree (a framework widget in every real Continuum case), not a
  routed component reference. Forcing the existing mechanism onto it would be lowering-by-resemblance
  ("both display UI"), exactly what this milestone was told not to do.
- **B**: no equivalence question remains open for push/pop/replace — proven correct and complete by direct
  execution against a real destination component, including one with a bound argument.
- **C**: `switch (x) { A => v, ... }` in return position is a lossless desugaring to the existing
  `logic.Switch`/`SwitchCase{test, body:[Return]}` shape *for the no-guard, simple-pattern subset* — a
  real, plausible equivalence, but not executed or tested (§6) — recorded as a hypothesis for a future
  milestone, not a proven fact.
- **D**: FieldDecl module emission's own semantics are a direct generalization of `FunctionDecl`'s own
  (ADR-29) — no new equivalence question. The unresolved half (`Logger` construction) is a different
  question this milestone did not attempt to answer, matching `DateTime`/`File`'s own already-correct
  refusal.

## 11. Silent-wrong-code audit

- **A**: not attempted — the categorical mismatch (§4) means there is no lowering to audit.
- **B**: push/pop/replace's existing implementation was read directly (`statement.ts:220-246`) — it
  resolves the transition by `NodeId` (never by name or span), refuses cleanly when the router is out of
  scope, and refuses cleanly (named precisely) for `popUntil`. No silent-wrong-code risk found in the
  *existing* implementation — this is itself a finding worth recording, since it means B's own mechanism
  was already built with the same discipline this project's other milestones establish.
- **C**: a naive fix textually matching `switch (x) {` without walking the real `SwitchExpressionCase`
  pattern grammar risks silently dropping a guard clause (`case Foo() when cond => ...`) — Continuum's own
  real site has none, but a general implementation without this check would be unsound the first time one
  appears. Not attempted, so not at risk here.
- **D**: a naive `FieldDecl` fix that also attempted `Logger` construction (e.g., a generic "construct any
  class" fallback) would be silently wrong — `package:logging`'s own semantics (level filtering, listener
  streams) have no runtime-kit equivalent. Not attempted.

## 12. Schema assessment

| Candidate | Schema change |
|---|---|
| A | Yes, implicitly — no destination kind for "inline widget tree" exists on `app.RouteTransition` |
| B | No — `logic.Navigate` already exists and already covers push/pop/replace |
| C | Unresolved — plausibly no (existing `logic.Switch` may suffice for the narrow subset), not proven |
| D | No — existing `logic.FieldDecl` is sufficient |

## 13. ADR assessment

| Candidate | ADR required |
|---|---|
| A | Yes — the current ADR-0025 D2 mechanism categorically does not cover it (§4) |
| B | No — already accepted and, per §5, already fully implemented for the shapes that matter |
| C | Unresolved — plausibly no if the existing `logic.Switch` schema suffices, not proven |
| D | No — ADR-29 already scoped this as an open, compatible extension (M8-U §11) |

## 14. Runtime assessment

| Candidate | Runtime change |
|---|---|
| A | Likely yes — rendering an inline dialog widget tree needs a runtime concept `useRouter()` does not have |
| B | No — `useRouter()` already exposes `push`/`replace`/`pop`, already used by the existing lowering |
| C | No |
| D | Yes, for `Logger` specifically (§7) — not for `FieldDecl` module emission itself |

## 15. Comparative decision matrix

| | A showDialog | B Navigator.of | C switch-expr | D FieldDecl/`_log` |
|---|---|---|---|---|
| 1. Real Continuum sites fixed | 0 (categorical mismatch, unfixable as scoped) | 0 (already works; nothing to fix) | 1, if implemented | 0 net (§7) |
| 2. Semantic certainty | high — proven **not** equivalent | high — proven correct as-is | medium — plausible, unverified | high, for the FieldDecl half only |
| 3. Schema impact | required | none | unresolved | none |
| 4. ADR impact | required | none | unresolved | none |
| 5. Runtime impact | required | none | none | required, for `Logger` |
| 6. Implementation size | large, cross-cutting | n/a (nothing to build) | unverified, cross-language | small, but zero net payoff |
| 7. Regression surface | n/a | n/a | unverified | low |
| 8. Architectural precedent | weak — ADR text overstates current coverage | strong — already shipped | partial — statement-switch precedent exists | strong — ADR-29 |
| 9. tsc/build-proof feasibility | not reachable as scoped | already proven (existing tests) | unverified | reachable, but proves a null result |
| 10. Silent-wrong-code risk | high if forced | none — already built correctly | medium (guards) | high if `Logger` is also attempted |
| 11. Another blocker replaces it? | yes — architecture question persists regardless | n/a | possibly not, for the one real site | yes — `Logger` construction |
| 12. Structural subtree unlocked | none | none — nothing was blocked | `TransferProgressList`'s one branch | none |

**Selected: E. NONE.**

## 16. Selected target

**None.** A is disqualified by proof of semantic non-equivalence and a genuine schema/ADR gap. B is
eliminated because its underlying mechanism is already fully implemented and correct — there is nothing
bounded left to build, and the one narrow neighboring gap (a captured push result) has zero real
Continuum payoff. C remains a plausible but unverified candidate requiring cross-language analyzer work
this milestone did not attempt — genuinely unresolved, not ready. D's FieldDecl half is small and
well-precedented but has zero net real-Continuum payoff once `_log`'s own `Logger` dependency is honestly
quantified.

## 17. Implementation gate

```
[x] Real Continuum site reproduced.                — yes, for all four (§3, §4, §5, §6, §7)
[x] Minimal independent fixture reproduced.         — yes, for A, B, D (real analyzer, real generator); C's isolated
                                                       fixture reproduces the exact real diagnostic
[x] Exact earliest loss point known.                — A: destination-resolution (analyzer); B: n/a, nothing lost;
                                                       C: analyzer extraction (Dart-side); D: generator FieldDecl
                                                       lowering + separate Logger construction gap
[ ] Existing identity is sufficient.                — n/a for B (nothing to fix); yes for C/D; NO for A (§4)
[ ] Existing UIR is sufficient.                     — NO for A; yes for B (already used); unresolved for C; yes for D
[ ] No unresolved schema change.                    — false for A; unresolved for C
[ ] No unresolved ADR.                              — false for A; unresolved for C
[x] No new broad runtime architecture.              — true only for B/D; false for A
[ ] Semantic equivalence proven.                    — proven FALSE for A (disqualifying); proven true for B (moot,
                                                       nothing to implement); not proven for C
[ ] Real Continuum payoff exists.                   — ZERO net payoff for B (already works) and D (§7); real for C
                                                       (unverified) and would be real for A if it were buildable
```

**GATE = FAIL**, for every one of the four candidates, each for a different, specific, now-documented
reason — not a repeat of M8-W's general uncertainty.

## 18. Implementation

None.

## 19. Tests

None added — no production code changed.

## 20. Real Continuum before/after

Not applicable — no implementation occurred. §3's fresh reproduction is both the before and after.

## 21. Regression results

No production code changed. `git status --short` after all investigation shows only the same
pre-existing `hello_bridge/analysis_options.yaml` drift; no file under `packages/` or `dart/` was
modified. M8-N/M8-O/M8-P/M8-R/M8-S/M8-U/M8-V carry no regression risk as a direct consequence.

## 22. Validation

No production code changed, so `just ci`/`just determinism`/`bridge validate` were **not re-run** — doing
so would prove nothing this document changed. Stated explicitly per this milestone's own instruction not
to claim validation runs that were not performed. What *was* run and is production-relevant: the fresh
`bridge analyze`/`bridge generate` reproduction (§3) and the four candidates' own real-Dart, real-analyzer
(and, for B and D, real-generator) reduction ladders (§4–§7), all read-only against Continuum and
scratch-only against FlutterBridge — no repository file was touched by any of it.

## 23. Remaining blocker graph

Unchanged from M8-W (§3, byte-identical). This milestone narrows *why* each of the four investigated
candidates is not yet implementable, without resolving any of them:

- `_log` — FieldDecl module emission (small, ADR-29-precedented) bundled with `Logger` construction
  (unbounded, no net payoff without it).
- `Navigator.of` — **no longer a blocker in its own right**; the real site's failure is entirely N11's.
- `showDialog` — needs a new destination-kind decision (ADR + schema), confirmed by direct execution, not
  a recognition gap.
- `ScaffoldMessenger.of` — needs a new ADR (unchanged).
- `describeTransferFailure` — needs Dart-side switch-expression pattern extraction (unverified scope).
- SettingsPage/N11 push — needs a new N11 case for non-signal `State`-instance-field and inline-constructed
  object arguments (unchanged, entangled with `Navigator.of`'s own real site, not with the mechanism).

## 24. Recommendation for M8-Y

**Not preselected.** What this investigation narrows, honestly:

- **Switch-expression extraction (Candidate C) is the only one of the four with a plausible path to
  "small and bounded"** — but proving it requires a milestone that actually reads and extends
  `dart/bridge_analyzer`'s own AST-walking code (a first for this session's own M8 sequence, which has
  been TypeScript-generator-only or read-only since M8-J). A future milestone targeting this should start
  by writing a **Dart-side** unit test for `SwitchExpressionCase` extraction directly against
  `package:analyzer`'s own AST, before touching UIR — and should explicitly scope to the no-guard,
  simple-enum-pattern subset Continuum's own real site uses, deferring guards/destructuring/nested
  patterns until real evidence demands them.
- `showDialog` needs an ADR before any implementation — a future milestone could be exactly that ADR,
  informed directly by §4's own finding that the destination is an inline widget tree, not a routed
  component.
- `_log`/`Logger` and `ScaffoldMessenger.of` remain two-capability or architecture-first bundles not worth
  attempting as single milestones without separately scoping their own hard half first.
- **`Navigator.of` needs no further work of its own** — this is the one candidate this milestone can
  retire outright, not merely defer.

## 25. Commit

Only `docs/m8/m8x-brg3013-candidate-reduction.md` is new. No other file is touched.
`fixtures/apps/hello_bridge/analysis_options.yaml`'s drift is confirmed untouched.
