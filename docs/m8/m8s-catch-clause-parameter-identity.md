# M8-S — Catch-clause exception-parameter identity

**Date:** 2026-08-22. **Baseline:** `2c1fefd` (== `origin/main`, clean tree, confirmed before any change,
except the pre-existing, unrelated `fixtures/apps/hello_bridge/analysis_options.yaml` drift — left
untouched, not this milestone's own change, not committed by it). **Type:** ADR amendment +
implementation. **Outcome: implemented.** A catch clause's own exception binding (`on Object catch (e)`'s
own `e`) gains the identical declaration-tier identity ADR-28 already gives an ordinary local, closing a
gap ADR-28 §17 explicitly deferred, and fixing an independent, load-bearing field-name bug in the
generator's own `logic.TryCatch` emission that the identity fix would otherwise have exposed as silent
wrong code.

## 1. M8-S contract — how it was established

No repository document defines "M8-S" — confirmed by exhaustive search (`M8-S`, `M8S`, `M8 S`, every
`docs/m8/*.md`'s own closing section, no roadmap file exists anywhere in the repo). The established
pattern across the entire M8 series (M8-A's own §15 "Exact M8-B recommendation" through M8-R's own §20)
is that each milestone's own closing section names the next. M8-R's own §20 uniquely named **two**
independent, unprioritized candidates (loosen N11's call-dependency refusal; `sig.Effect` lowering) plus a
longer inherited backlog, without picking one. Per the task's own instruction not to silently choose
between disagreeing sources, this was surfaced to the user, who asked for a short, bounded, evidence-based
triage (matching M8-A's own methodology) rather than a blind pick.

**Triage, fresh real-Continuum evidence (post-M8-R generate-stage census, both apps):** `Theme.of` (5
sites, entirely undiscovered before this census — likely needs its own architecture audit before any
bounded implementation, since it may require new token-model or ADR work) and top-level `FieldDecl`/
`FunctionDecl` module-emission (5 sites, real, but needs a *new* generator emission mechanism — a larger
lift) tied for highest real-corpus frequency. **Catch-clause parameter identity** (2 confirmed sites,
`e` in `_exportLogs`) was the smallest, lowest-risk, most directly precedented candidate: M8-O's own
real-evidence-based §22 named it explicitly, M8-N already proved the exact mechanism (ADR-28's
declaration-tier identity scheme + an analyzer ordinal pre-pass) on the structurally identical
local-variable case, no new ADR architecture was needed (only an amendment to an existing one), and it
touches neither N11 nor route-boundary logic at all — zero risk to the M8-R boundary. Chosen on this
basis, with the user's own delegation to proceed once the evidence was in hand.

## 2. Baseline

```
git fetch origin && git status --short   → only fixtures/apps/hello_bridge/analysis_options.yaml (pre-existing, unrelated)
git rev-parse HEAD          → 2c1fefdc7bbab9cf7c932bf0811b276ef486b1fd
git rev-parse origin/main   → 2c1fefdc7bbab9cf7c932bf0811b276ef486b1fd
```
`pnpm --filter @bridge/compiler test`: 151/151. `pnpm --filter @bridge/gen-react test`: 254/254. Both
confirmed fresh, before any change.

## 3. Root cause

Two independent, load-bearing defects, both found by direct source inspection this milestone:

1. **No declaration at all.** `statement_extractor.dart`'s `TryStatement` case extracted a catch clause's
   exception parameter as a bare `RawLiteral` string (`exceptionName`) and a nameless
   `Binding(binds: Binds.local)` — no `logic.VarDecl` node, no symbol, no id. A read of `e` inside the
   catch body was, and could only ever be, an untargeted `logic.Ref{name: 'e'}` — indistinguishable, to
   the generator, from a genuinely free name. `BRG3006` ("`e` is not declared in this program") fired
   correctly given that shape, but the message was false to the actual source: `e` plainly is declared.
2. **A field-name typo masked by (1).** `statement.ts`'s `logic.TryCatch` case read a field called
   `exception`, which has never existed in the schema (the real field is `exceptionName`) — so every
   emitted JS catch parameter was, unconditionally, the hardcoded fallback identifier `error`, regardless
   of the Dart source's own name. This was invisible until now because every read of the real exception
   variable already failed via (1) before the mismatch could matter. Fixing (1) alone, without also fixing
   this, would have created a genuine silent-wrong-code hazard: a read resolving successfully under one
   identifier (`e`) while the actual `catch (...)` bound a different one (`error`) — a `ReferenceError` at
   runtime, never caught by any diagnostic.

## 4. Real-corpus evidence

`grep -rn "catch ("` across Continuum's own two apps and three shared packages found **17 catch clauses**,
most named `e` or `error`, one (`pairing_page.dart:119`/`126`, both apps) also binding a stack-trace
parameter (`catch (e, s)`), whose own body reads both (`_log.severe('bootstrap failed', e, s)`). A fresh
generate-stage census at `2c1fefd` found `e` reported `BRG3006` twice per app (mac and droid identically,
since both share `pairing_page.dart`'s own structure); the remainder of the 17 sites are gated by other,
independent, upstream blockers (`_log`'s own module-emission gap chief among them) not yet reached by
generation — expected, matching the established "one blocker surfaces at a time" pattern from every prior
real-corpus measurement this session.

## 5. Architecture — options considered

- **Option A (refuse earlier):** not applicable — there is nothing unsafe to refuse here; the gap is a
  missing identity, not an unsafe transformation. Rejected as the wrong shape for this problem.
- **Option B (extend the existing ADR-28 identity scheme):** the option implemented. ADR-28's own
  `Symbols.local` scheme, unmodified, applied to one more syntactic binding site — the smallest option
  that actually closes the gap.
- **Option C (thread the exception explicitly):** not applicable — there is no boundary to thread across;
  the binding and every possible read of it live in the same lexical scope, the same file, the same
  compilation.
- **Option D (change ownership representation):** not applicable — no ownership question exists here; a
  catch-bound exception is exactly as component/action-local as an ordinary local already is.
- **Option E (generator-only workaround):** rejected. Patching the generator to guess an identifier from
  the bare `exceptionName` string, without a real declaration node, would be exactly the name-based
  inference this project's own discipline forbids, and would not fix N5's own closure-capture blind spot
  for a closure defined inside a catch clause.

**Selected: Option B**, using ADR-28's own scheme with **one, deliberate design choice** beyond a literal
copy — a **shared** ordinal counter between ordinary locals and catch-bound exceptions, not two
independent ones (§6 below), proven necessary, not merely convenient, by a dedicated test.

## 6. Semantic safety analysis

**Collision-freedom.** The one real risk a naive, independent counter would introduce: an ordinary local
and a catch-bound exception sharing both a name and an ordinal (each counted from zero within its own,
separate sequence) would produce the identical symbol string. A **single, shared** per-owner counter —
`scope.dart`'s existing `_OrdinalVisitor`, extended to also visit `CatchClause.exceptionParameter` in the
same pre-order walk — makes this structurally impossible: every declaration in one owning body, of either
kind, gets a distinct ordinal by construction. Proven directly, on real Dart, by `fixtures/apps/
catch_clause`'s own `_mixed` action (`final int total = 1;` followed by `on Object catch (total)`) and by
a dedicated Dart test (`extraction_test.dart`).

**Lexical shadowing.** The existing `Scope`/`Binding` machinery (`scope.child`) already, correctly,
implements Dart's own innermost-first lookup — this amendment changes nothing about *that*; it only gives
the catch-clause `Binding` a real `symbol`, the same way ADR-28 already did for an ordinary local's own
`Binding`. Confirmed on real Dart: the try body's own read of `total` (declared just before the `try`)
targets the ordinary local; the catch body's own read of the same name targets the exception binding —
never confused, matching Dart's own scoping exactly, and reproduced faithfully in the emitted JS's own
block-scoped `catch (total) { ... }` shadowing.

**N5 closure-capture safety (ADR-28's own load-bearing concern for locals, §11 of that document).**
Re-verified, not assumed: N5's own generalised, `walk(program)`-based `logic.VarDecl` id collection
already recursively finds a `logic.VarDecl` nested anywhere in the program structure, regardless of field
name — including one now embedded inside `TryCatch.catches[].exceptionDecl`, a sibling of `body` rather
than a bare statement. Two new tests confirm this directly, against the **unmodified** N5 pass: a closure
capturing a catch-bound exception declared *outside* it is refused (`BRG2105`); a closure that catches and
reads its *own* exception lifts correctly. Zero lines of `n5_lift_closures.ts` changed.

**No silent wrong code.** The independent field-name defect (§3.2) was found and fixed in the same change
— required, not optional, for the identity fix to be safe (a resolved read under a mismatched emitted
identifier would have been exactly the silent-wrong-code class this project's own discipline exists to
prevent).

**Deliberately not authorized (ADR-28 amendment §4):** the stack-trace parameter (`catch (e, s)`'s own
`s`) — a materially different mapping question, since JavaScript's `catch` has one binding slot and the
nearest analogue (`error.stack`) is a property read, not a second declared parameter. Left exactly as it
was: an untargeted `logic.Ref`, `BRG3006` on any read. `for`-loop variables remain out of scope too,
unchanged from ADR-28 §17.

## 7. Implementation

- **Schema** (`packages/uir/schema/l1.json`): `CatchClause` gains one new optional field,
  `exceptionDecl: VarDecl` — additive only, no `x-uir-breaking` marker (no existing document contained a
  `logic.TryCatch` node before this milestone; nothing breaks). Regenerated via `just codegen`
  (`packages/uir/src/generated/uir.ts`, `dart/bridge_uir/lib/generated/uir.dart`); `just codegen-check`
  confirms no drift.
- **Analyzer** (`dart/bridge_analyzer/lib/src/session/extract/scope.dart`): `_OrdinalVisitor` gains a
  `visitCatchClause` override, numbering `exceptionParameter` (never `stackTraceParameter`) in the same
  per-owner ordinal sequence `VariableDeclaration` already uses.
- **Analyzer** (`.../extract/statement_extractor.dart`): a new `_catchExceptionSymbol` helper (mirroring
  the existing `_localSymbol` exactly); the `TryStatement` case now builds a real `logic.VarDecl` for the
  exception parameter (`exceptionDecl`, symbol-derived id, no `initializer`) and threads the identical
  symbol into the catch body's own `Binding`.
- **Generator** (`packages/generators/react/src/internal/emit/statement.ts`): the `logic.TryCatch` case
  now reads `exceptionDecl.name` (falling back to the corrected `exceptionName`, then `'error'`) instead
  of the nonexistent `exception` field. `localBindingsIn`/`declareLocalActions` needed **no change** —
  both already walk generically and already picked up the new node automatically once it existed.

## 8. Diagnostics

**Before:** a targeted read of a catch-bound exception was structurally impossible (no target existed);
every read was untargeted, `BRG3006` ("`e` is not declared in this program") — technically correct given
the shape, but false to the actual source, exactly the M8-L/M8-P-shaped misattribution this session's own
prior milestones closed for other declaration kinds.

**After:** a real `logic.Ref{target}` resolves via the ordinary `localName` mechanism; no diagnostic fires
for a supported catch clause. `BRG3006` remains, correctly, for a genuinely untargeted read (a stack-trace
binding, or any other free name) — proven by a dedicated mutation-resistant test (§9).

**Stage:** extraction (analyzer), not normalization or generation — the identity is established at the
earliest possible point, the moment the declaration itself is extracted, matching M8-R's own inherited
principle of resolving a semantic question at the earliest stage that has enough information to make it
correctly.

## 9. Tests

**Dart (`extraction_test.dart`, new group "catch-clause exception binding identity (ADR-28, amended
M8-S)"):** a caught exception resolves to a real declaration; two unrelated catch clauses with the
identical name never collide; an ordinary local and a catch exception binding sharing one ordinal sequence
never collide even with the same name (the collision-freedom proof §6 names); the stack-trace binding is
not given this identity; determinism (same source, same ids, twice). 5 new, all passing; 317/317 total
(312 existing + 5 new), 0 regressions.

**Compiler (`n5.test.ts`, extending "N5 treats a targeted local the same as an untargeted one (ADR-28)"):**
a closure capturing a catch-bound exception declared *outside* it is refused (`BRG2105`); a closure that
catches and reads its *own* exception lifts. 2 new, both against the **unmodified** N5 pass; 153/153 total
(151 + 2 new), 0 regressions.

**Generator, synthetic UIR (`catch_clause_reference.test.ts`, new file):** a targeted read resolves under
the declared name; two catch clauses with the identical exception name in different actions never collide;
a read whose own `name` field is *stale* (`boom`) but whose `target` is real resolves under the
*declaration's* name, not the ref's own — the specific mutation-resistance proof that this is target-based,
never name-based; an untargeted read of the same name is still `BRG3006`, unweakened, even with a
same-named declaration present elsewhere in the program; a clause with no exception parameter at all still
emits a bare `catch (error)`, unaffected. 5 new, all passing.

**Generator, real Dart (`catch_clause_build.test.ts` + `fixtures/apps/catch_clause`, new, permanent —
matching M8-N's own established convention that N11-adjacent identity work needs a real, analyzer-driven
fixture, not only synthetic UIR):** no `BRG3006` for either supported catch clause; two unrelated actions
catching under the identical name `e` never collide, confirmed in the emitted TypeScript; a catch-bound
exception correctly shadows an outer local of the identical name, confirmed in the emitted TypeScript;
full Flutter → analyzer → compiler (N1–N11) → generator → real `tsc` against the real, unmocked
`@bridge/runtime-react`. 4 new, all passing, including the real typecheck.

**Full suite:** `pnpm --filter @bridge/compiler test`: 153/153. `pnpm --filter @bridge/gen-react test`:
263/263 (254 + 9 new across both new generator test files). `dart test` (bridge_analyzer): 317/317.
`dart test` (bridge_uir): 28/28, unaffected. 0 regressions anywhere.

## 10. CI

`just ci`: full green — build, typecheck, the complete TS test suite, `codegen-check` (confirms the
regenerated `uir.ts`/`uir.dart` match the schema exactly), `lint`, `lint-negative`, `uir-lint`, `uir-test`,
`analyzer-lint`, `analyzer-test`, `dart-analyze` (`hello_bridge`'s own `flutter analyze`, unrelated to this
milestone's own changes, unaffected).

## 11. Determinism

`just determinism`: retried after one killed attempt (signal 15, the same environmental/resource
limitation recorded in every prior milestone this session — reported honestly, not counted as green); the
clean retry, run alone, completed byte-identical across all 5 fixture apps (`counter`, `promoted-counter`,
`inline-push-props`, `async-push-guard`, `local-store`), 3 runs each, `exit 0`. The new `catch_clause`
fixture is not part of this fixed 5-app e2e list (matching `local_variables`'/`transitive_actions`'s own
precedent) — its own determinism and fixed-point properties were instead confirmed directly via
`bridge validate` (§ below), which passed both checks (`deterministic`, `fixed point`) on first run.

## 12. Real Continuum

Read-only, via a temporary `bridge.json` pointing `source` at the real apps outside the Continuum tree
(`work`/`out` redirected outside the repo entirely — no writes into Continuum's own `.bridge/` at any
point; `git status --short` in Continuum confirmed empty before and after every measurement).

**Before** (`2c1fefd`, the M8-R baseline): `BRG3006` = 17 in both mac and droid, including two `e` entries
each (`pairing_page.dart`'s own `_reconnect`/`_confirmForget`/`_openSettings`/`_announceRevocation`-shaped
catch clauses, matching M8-O's own earlier trace).

**After** (this milestone's fix): `BRG3006` = 15 in both apps — the two `e` entries in each app are gone,
every other diagnostic category (`Theme.of` ×5, `_isLast`/`_slides`/`_onboardingSlides`/`_logBuffer`,
`double.infinity`, `ContinuumFeature.values`, `getApplicationDocumentsDirectory`/`join`, `BRG3013` at 10)
**unchanged**, confirming a precisely-scoped, isolated fix with zero collateral movement anywhere else in
either app's own diagnostic set. `files emitted` remains `0/0` in both — expected; other, independent,
already-known blockers (chief among them `_log`'s own top-level `FieldDecl` module-emission gap) still
gate full generation, exactly as predicted.

Continuum's own source tree: confirmed untouched, `git status --short` empty, both before and after.

## 13. Regression check — M8-R

Explicitly re-confirmed, not merely assumed unaffected: `n11_promote_cross_route_state.ts` was not
touched this milestone (`git diff` confirms zero lines changed in that file or its own test file beyond
what M8-R itself already committed). M8-R's own 5 dependency-closure tests, and the full N11 suite, ran
unmodified as part of the 153/153 compiler-test total (§9) — all pass. M8-R's own real-Continuum finding
(`_forget`'s early `BRG2303` refusal, naming `_announceRevocation`) is unaffected: re-confirmed present,
unchanged, in this milestone's own fresh diagnostics pull (§12) — no regression to the refusal boundary
M8-R established.

## 14. Documentation

This document (`docs/m8/m8s-catch-clause-parameter-identity.md`) and
`docs/adr/0028-amendment-catch-clause-parameter-identity.md` (the ADR-28 amendment itself, containing the
full evidence, symbol-scheme, schema, and safety-analysis detail this report summarizes).

## 15. Known limitations

1. **The stack-trace parameter remains unresolved** (`catch (e, s)`'s own `s`) — a real, narrower, still-
   open gap, deliberately not folded into this milestone (§6). At least one real Continuum site
   (`pairing_page.dart:119`/`126`) reads it directly.
2. **`for`-loop variables remain out of scope**, unchanged from ADR-28 §17 — no new evidence gathered this
   milestone.
3. This milestone's own real-Continuum re-measurement did not re-run the full whatif `generate`/`typecheck`
   pipeline with the BRG2301 decomposition patch other milestones have used to get further into
   `SettingsPage`'s own construction — the generate-stage diagnostic census (§12) was sufficient to prove
   the fix's effect precisely and in isolation; no site in this milestone's own scope needed that patch to
   observe.

## 16. Explicit non-goals

`sig.Effect` lowering (M8-Q's own finding) — untouched, unrelated. `Theme.of`/module-emission architecture
for top-level `FieldDecl`/`FunctionDecl` (both surfaced fresh in this milestone's own triage, §1) —
untouched; each remains a real, larger, separately-scoped candidate for a future milestone. N11's own
call-dependency refusal (M8-R §17.1) — untouched; this milestone's own fresh evidence (§12) confirms it
has no live real-corpus payoff right now. Continuum application source — not modified. M8-T — not started.

## 17. Gate

**PASS.** Every safety question answered (§6); the fix is bounded, additive, target-based throughout,
proven on real Dart end-to-end (including a real `tsc` typecheck), fully validated (`just ci` green,
`just determinism` green on retry, `bridge validate` green on the new fixture), and confirmed on real
Continuum with a precisely isolated, positive real-corpus effect and zero collateral diagnostic movement.
