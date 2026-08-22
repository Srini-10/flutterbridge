# M8-W — Remaining `BRG3013` Capability Census and Next-Target Decision

Baseline: `0c037bd` (M8-V, "Dart numeric/SDK-method recognition").

**Outcome: docs-only. No production code changed.** Five distinct root causes were traced to their true
loss point; none satisfies the implementation gate (§15). This is the expected, honest outcome for a
measurement/triage milestone whose own instructions permit it explicitly.

## 1. Contract

Reproduce the post-M8-V state fresh (not from prior report prose), enumerate every remaining `BRG3013`
site with structural (not textual) categorization, group into root causes, rank them, trace each to its
true loss point, and select at most one bounded next target — only if it clears a strict implementation
gate. If no candidate clears the gate, stop after this document.

## 2. Baseline — verified, not assumed

```
git status --short   →  M fixtures/apps/hello_bridge/analysis_options.yaml   (only)
git rev-parse HEAD           = 0c037bd1f5f84df5a064ba8a667da312935e087f
git rev-parse origin/main    = 0c037bd1f5f84df5a064ba8a667da312935e087f
```

`HEAD == origin/main`. The `hello_bridge/analysis_options.yaml` drift is the same pre-existing,
unrelated `flutter analyze` auto-modification noted in every prior milestone — left untouched, unstaged,
unreverted.

`just build`: 11/11 tasks, fresh dist confirmed to carry M8-V's own code
(`grep -c DURATION_GETTERS packages/generators/react/dist/index.js` → 2).

Read before investigating: `CLAUDE.md`; ADR-0011 (`0011-cross-route-state-promotion.md`) and its
amendment `0011-amendment-route-argument-promotion.md`; ADR-0025 (`0025-the-navigation-model.md`);
ADR-0028/0029; `docs/m8/m8u-narrow-function-module-emission.md`;
`docs/m8/m8v-dart-numeric-sdk-method-recognition.md`; the production implementation of `n11_promote_cross_route_state.ts`
(672 lines), `material_adapter.dart`, `statement_extractor.dart`, `expression_extractor.dart` — not just
their own doc comments.

## 3. Fresh Continuum census — both apps, real pipeline, this session's own run

Fresh `bridge analyze --json` + `bridge generate --json` against `apps/macos/mac` and
`apps/android/droid`, current HEAD's own built CLI (relative `work`/`out`, routing around the pre-existing
CLI path-join bug M8-V's own §17 already documented and left unfixed).

**Analyze:**

| | mac | droid |
|---|---:|---:|
| `BRG1301` | 0 | 1 |
| `BRG1302` | 93 | 121 |
| `BRG1304` | 2 | 2 |
| total | 95 | 124 |

**Generate:**

| | mac | droid |
|---|---:|---:|
| `BRG3001` | 14 | 15 |
| `BRG3002` | 12 | 13 |
| `BRG3004` | 8 | 12 |
| `BRG3005` | 1 | 1 |
| `BRG3006` | 15 | 15 |
| `BRG3008` | 1 | 1 |
| `BRG3013` | 7 | 7 |
| total errors | 41 | 45 |
| total warnings | 17 | 19 |
| files emitted | 0 | 0 |

Identical to M8-V's own post-fix numbers (`docs/m8/m8v-...md` §15) — confirming M8-V's own claim that its
fix does not move Continuum's diagnostic composition, reproduced fresh rather than trusted. `tsc`/`next
build`/browser validation are not reached in either app: `generate` itself aborts at 0 files
(`BRG3005`, the all-or-nothing rule).

**`BRG3013` raw count: 7 in each app, verified fresh — matches M8-V's own reported number exactly. No
discrepancy to explain.**

## 4. Complete `BRG3013` site table

Grouped by the `logic.Ref`/node's own content-addressed `nodeId` (identical across both apps for every
site but one — see droid note below).

| nodeId | raw diagnostic count (mac / droid) | source | node kind | target decl kind | category |
|---|---|---|---|---|---|
| `0be07294759f2237` | 2 / 2 | `pairing_page.dart:20` (`final _log = Logger('Pairing');`), read at 9+ call sites (lines 120, 144, 176, 272, 306, 363, 370, 393, 458, 476 — collapses to one content-addressed `logic.Ref{name:'_log', target:'94e73b88d43c5b05', type:{library:'package:logging/src/logger.dart', name:'Logger'}}`, 2 of which survive normalization to reach the generator) | `logic.Ref` → `logic.FieldDecl` | `logic.FieldDecl` (top-level, project-defined) | **B** (known decl kind, unsupported lowering) *and* **E** (initializer is a third-party SDK class construction — see §9) |
| `de82af8f2af6e041` | 1 / 1 | `pairing_page.dart:400`, col 21 (`Navigator.of(context).push(MaterialPageRoute(...))`) | `logic.Ref{name:'Navigator.of'}` (generic fallback, not `logic.Navigate`) | none — unresolved SDK member reference | **A**/**E** — see §9, entangled with the same node's own `app.RouteTransition` (BRG3008) and N11 (`f18dee92f257f0d1`) |
| `610d89d7af569d2a` | 1 / 1 | `continuum_ui_kit/src/settings_page.dart:135` (`ScaffoldMessenger.of(context)`) | `logic.Ref{name:'ScaffoldMessenger.of'}` | none — unresolved SDK member reference | **G** — diagnostic's own text: "no ADR models it yet" |
| `03c790071cdb337c` | 1 / 1 | `continuum_ui_kit.dart:82` (`showFileOfferDialog`) **and** `settings_page.dart:98` (a `sig.Action`) — two distinct real call sites, same content-addressed id | `logic.Ref{name:'showDialog'}` | none — unresolved SDK member reference | **E** — see §9 |
| `2bb479fe49244d92` | 1 / 1 | `continuum_ui_kit.dart:170`, inside `TransferProgressList`'s render tree | `logic.Ref` → `logic.FunctionDecl` | `logic.FunctionDecl` `describeTransferFailure` (`continuum_ui_kit.dart:121`, body is `logic.OpaqueExpr{reason:'switch expression'}`) | **C** (extraction opacity — confirmed the loss is in the *analyzer*, not the generator; see §9) |
| `f18dee92f257f0d1` | 1 / 1 (droid's own message names one more argument, `platformSection`, than mac's — same underlying push, one extra optional field Continuum's droid variant supplies) | `pairing_page.dart:400` (mac) / `:428` (droid) — the `SettingsPage(...)` push itself | `app.RouteTransition` | n/a (not a `logic.Ref`) | **F** (route-boundary ownership, N11) — see §9 |

Raw total: 7 per app. Unique `nodeId`s: **6**. Root causes after grouping (§5): **5**.

## 5. Root-cause grouping

| Root cause | raw sites | unique Dart sites | apps | blocks generation directly? | replaced by another blocker if fixed? |
|---|---|---|---|---|---|
| `_log` — `FieldDecl` + third-party `Logger` construction | 2 | 1 declaration, 9+ reads | both | yes (this site) | yes — `_logBuffer` (`BRG3006`, a *different*, still-unresolved reference) sits right beside it in the same method |
| `Navigator.of` push (entangled with N11, see below) | 1 | 1 | both | yes | yes — the SAME statement also carries `BRG3008` (inline route) and the N11 push failure |
| `ScaffoldMessenger.of` | 1 | 1 | both | yes | no — nothing else in that render path is currently blocked |
| `showDialog` | 1 | 2 call sites, 1 content-addressed shape | both | yes | unknown — not traced past the top-level `logic.Ref`, since the messenger/dialog overlay ADR question is unresolved regardless |
| `describeTransferFailure` | 1 | 1 | both | yes | no — `TransferProgressList`'s other two branches (`t.done`, byte-count formatting) already lower cleanly |
| SettingsPage push / N11 | 1 | 1 (2 call sites, mac/droid, differ by one optional field) | both | yes | yes — the same statement's `Navigator.of` gap (above) |

**Raw-frequency ranking:** `_log` (2) > all others (1, tied).

**Architectural-impact ranking** (by how much of Continuum's own remaining, currently-opaque surface each
would newly make representable, per §4's `blocks generation directly`/`replaced by another blocker`
columns): `Navigator.of`/N11-push (unlocks two entangled diagnostics on the one statement, but both trace
to the same unresolved-promotion root — see §9) ≈ `_log` (unlocks two raw diagnostics but the underlying
declaration needs a second, independent capability — third-party class construction) > `showDialog` ≈
`ScaffoldMessenger.of` ≈ `describeTransferFailure` (each isolated, no adjacent site unlocked).

**No candidate is dominant by either ranking.** The raw-frequency leader (`_log`) is not clearly ahead
(2 vs 1, and its own 2 raw diagnostics are one declaration read twice); the architectural-impact leader
(`Navigator.of`/N11) is entangled with the least-bounded candidate in the set (§9). This alone is a signal
against "manufacture an implementation just to make M8-W a code milestone."

## 6. Identity analysis

Every site resolves fully at the identity layer — the analyzer, UIR, and Program assembly are never where
representability is lost:

- `_log`: `logic.Ref.target` resolves to a real `logic.FieldDecl` in `Program`, with a fully resolved
  initializer type (`package:logging/src/logger.dart#Logger`). Identity is sound.
- `Navigator.of`/`showDialog`/`ScaffoldMessenger.of`: each is a `logic.Ref` with `target: undefined` —
  by design, not a defect. These are references to Flutter SDK static/namespace members, which — like
  every other unresolved-SDK-member case this project already has (`Theme.of`, `getApplicationDocumentsDirectory`,
  `join`) — correctly carry no `target`, because nothing in `Program` *is* their declaration.
- `describeTransferFailure`: `logic.Ref.target` resolves to a real `logic.FunctionDecl` in `Program`. Its
  body is `[logic.OpaqueExpr]` — the *analyzer* itself, not UIR or Program, is the one that could not
  represent the switch-expression (§9).
- SettingsPage push: `app.RouteTransition`'s own argument bindings resolve to real `logic.PropertyAccess`/
  `logic.Call`/`logic.New` expressions with fully resolved types. Nothing here is an identity gap either.

## 7. Generator loss-point analysis

| Site | Analyzer knows identity? | UIR preserves it? | Normalize preserves it? | Program contains decl? | Generator resolves target? | True loss point |
|---|---|---|---|---|---|---|
| `_log` | yes | yes | yes | yes | yes (target found) | **Generator**: no `FieldDecl` → module lowering (M8-U §11's own open relationship) *plus* no `logic.New` support for a third-party (`package:logging`) class |
| `Navigator.of`/N11 push | yes (element resolves) | yes | yes | n/a (SDK member) | n/a | **Analyzer**: this exact `Navigator.of(...).push(MaterialPageRoute(builder:...))` did not construct a `logic.Navigate` for this call — the statement extractor's `logic.Navigate` path (confirmed implemented for `push`/`replace`/`pop`/`popUntil`, `statement_extractor.dart:515-586`) evidently declines for this call and falls back to a bare-Ref extraction of the `.of(context)` sub-expression instead; entangled with N11's own inability to promote the boundary's arguments (state read off `_env`, a non-signal local; two method tear-offs; a freshly-constructed `DiagnosticsInfo` object) |
| `ScaffoldMessenger.of` | yes | yes | yes | n/a | n/a | **Architecture**: no ADR models the messenger-overlay construct at all (confirmed by the diagnostic's own text, not inferred) |
| `showDialog` | yes | yes | yes | n/a | n/a | **Analyzer**: `showDialog` is a top-level Flutter function, not a method on a `Navigator`-family type — `material_adapter.dart`'s own `navigationActionOf` (and its ownership pre-check, `_isNavigatorMethod`-shaped) is gated on the call being a *method* on a recognized navigator type, so a top-level overlay-opening function never reaches that check at all, even though ADR-0025 §5/§80-81's own text says overlay routes are *already* covered by D2's design |
| `describeTransferFailure` | yes (element resolves) | n/a — extraction never reached UIR for the switch itself | n/a | yes (the function decl itself) | n/a — refused before reaching the generator | **Analyzer**: `expression_extractor.dart:1220` explicitly, deliberately marks `SwitchExpression` opaque; `statement_extractor.dart:260-279`'s existing `logic.Switch` only extracts the classic `SwitchCase.expression`-based old-style switch **statement**, not Dart 3's pattern-based `SwitchExpressionCase` shape a switch **expression** uses — a structurally different AST node the extractor does not yet walk at all |
| SettingsPage push / N11 | yes | yes | yes | n/a (boundary, not a decl) | n/a | **Compiler (N11 pass)**: the pass's own documented case enumeration (`n11_promote_cross_route_state.ts`, cases 1–6) covers a function-typed binding to a `sig.Action`, a component-scoped `sig.Signal` read, a non-primitive object, a forwarded parameter, a primitive, and a dependency-incomplete action — it has **no case at all** for a binding that reads a `State`-instance field (`_env`, not a `sig.Signal`) or constructs a fresh data object (`DiagnosticsInfo(...)`) inline from a mix of instance fields and computed values (including a `Duration` from `DateTime.now().difference(...)`) |

**No downstream symptom is being fixed here** — every "generator loss point" traced above is the honest,
outermost point at which the specific mechanism (module emission, third-party construction, top-level
function recognition, pattern-matching extraction, or state-promotion case coverage) is simply absent,
not a place where an earlier stage already had the answer and a later one dropped it.

## 8. Reduction ladders

Not built. §7 already traces each candidate to a loss point that is either cross-language (the Dart
analyzer, for `Navigator.of`/`showDialog`/`describeTransferFailure`), requires a new architectural
decision (`ScaffoldMessenger.of`, the SettingsPage/N11 case), or bundles two independent capabilities
(`_log`). None reaches the "build a minimal real-Dart fixture and prove a lowering" stage this project's
own established methodology (M8-U, M8-V) uses for a candidate that has already cleared the schema/ADR
gate — building one before that gate is answered would produce a fixture proving a capability this
milestone is not implementing. This is itself evidence for §15's outcome, not a skipped step: the real
Continuum source *is* the reduction evidence for every claim in §7, read directly from production
analyzer/compiler/generator code, not synthesized.

## 9. Semantic-equivalence / silent-wrong-code audit

Considered for completeness, since a *naive* fix for each candidate is imaginable even though none is
being implemented:

- **`_log`**: a naive fix might emit `export const _log = new Logger('Pairing')` and forward `.info()`/
  `.warning()` calls generically. This would be **silently wrong** without a real runtime `Logger`
  implementation — `package:logging`'s own semantics (level filtering, listener streams, hierarchical
  loggers) have no JS equivalent in this project's runtime kit today. A naive fix risks either a runtime
  crash (`Logger is not defined`) or, worse, a stub that silently swallows every log call — never
  attempted here for exactly this reason.
- **`Navigator.of` push / `showDialog`**: a naive fix might match on the method name (`push`, `showDialog`)
  without verifying the receiver's own resolved element identity — precisely the class of shortcut M8-V's
  own `sdkTypeOf` was built to avoid (`docs/m8/m8v-...md` §4). A project-defined class with its own
  `.push()`/`showDialog()` method would collide. Any real fix must gate on resolved element/library
  identity, mirroring `material_adapter.dart`'s own existing, already-correct discipline — not attempted
  here, but the constraint is recorded so a future attempt does not regress it.
- **`describeTransferFailure`**: a naive fix might textually detect `switch (x) {` and synthesize cases
  without checking exhaustiveness or handling a guard clause (`case Foo() when cond => ...`), silently
  dropping the guard and misrouting a value that should have fallen to the next arm. Continuum's own real
  site has no guard, but a general fix without this check would be unsound for a shape that will
  eventually appear.
- **SettingsPage push / N11**: the highest silent-wrong-code risk of the five. A naive "promote it anyway"
  fix that treats `_env` (a `State`-instance field) as if it were a `sig.Signal` would synthesize a store
  whose action body still reads `_env` — a declaration the store can never resolve, the *exact* failure
  mode M8-R (case 6) already exists to catch and refuse, not paper over.

**No lowering is attempted, so no lowering is at risk of being silently wrong.** Each candidate's risk is
recorded so the eventual milestone that does implement one of these starts from a documented list of
known traps rather than rediscovering them.

## 10. Schema / ADR / runtime assessment, per candidate

| Candidate | Schema change? | ADR required? | NodeId model change? | Runtime capability required? | Module-emission architecture change? |
|---|---|---|---|---|---|
| `_log` | No (existing `logic.FieldDecl`) | No | No | **Yes** — a `Logger`-equivalent, or an explicit decision to refuse the initializer while still emitting the declaration | Extends ADR-29 (M8-U §11 already scoped this as an open relationship, not a new architecture) |
| `Navigator.of` push | No (`logic.Navigate` exists) | No (ADR-0025 D2 already accepted) | No | No | No |
| `showDialog` | No (`logic.Navigate` exists) | No (ADR-0025 §5/§80-81 already covers overlay routes under D2) | No | No | No |
| `ScaffoldMessenger.of` | **Yes**, implicitly (no construct names it) | **Yes** — explicit, per the diagnostic's own text | Unknown — undetermined until the ADR is written | Likely yes (an overlay/queue runtime concept) | Unknown |
| `describeTransferFailure` | **Ambiguous** — `logic.Switch`'s existing `SwitchCase.body: Stmt[]`/`test: Expr` shape can likely represent the *simple*, no-guard, enum-pattern subset Continuum's own site uses without a new node kind, but this is unverified against Dart 3's full pattern grammar | Unclear — plausibly none, if the existing `logic.Switch` node is reused, but not proven | No | No | No |
| SettingsPage push / N11 | No | **Yes** — no existing ADR-11 case covers a non-signal `State`-instance-field source or an inline-constructed data object as a boundary argument | No | No | No |

**Three of five candidates (`Navigator.of`, `showDialog`, and `_log`'s own `FieldDecl` half) pass the
schema/ADR gate cleanly.** None passes the *full* implementation gate (§15) once the runtime/architecture
half of each is weighed — see §11–14.

## 11. Candidate comparison

| | `_log` | `Navigator.of` push | `showDialog` | `ScaffoldMessenger.of` | `describeTransferFailure` | N11/SettingsPage |
|---|---|---|---|---|---|---|
| Correctness risk if forced | high (silent runtime failure) | low, if identity-gated correctly | low, if identity-gated correctly | unknown (no ADR) | medium (guard clauses) | high (M8-R's own case-6 trap) |
| Architectural certainty | partial — `FieldDecl` lowering is decided (ADR-29-adjacent), `Logger` construction is not | high — D2 already accepted and implemented for `push` | high — D2's design already covers overlay routes | **none** | partial — existing `logic.Switch` may suffice, unverified | low — no case for non-signal state |
| Real Continuum payoff | 1 declaration (9+ read sites collapse to 2 diagnostic emissions) | 1 statement, entangled | 2 call sites, 1 shape | 1 call site | 1 function, 1 call site | 1 statement, entangled with `Navigator.of` |
| Implementation size, isolated | small for the `FieldDecl` half; **unbounded** for `Logger` | small **if** the analyzer's own extraction gap can be closed without new architecture (unverified — requires reading why the existing `push` path declines this exact call) | small in principle, cross-language | not applicable — decision work only | unverified, cross-language, pattern-grammar-dependent | **unbounded** — needs new N11 case design |
| Precedent | ADR-29 (M8-U) already anticipated `FieldDecl` as a *future* extension, not this one | D2 already implemented for the identical mechanism, different call shape | D2's own text already anticipated this | none | `logic.Switch` already exists for the statement form | M8-R already refuses one shape of "can't safely promote"; extending the taxonomy has precedent but not a design |

## 12. Selected target: **none**

No candidate clears the implementation gate (§15). This is the primary, honest output of this milestone.

## 13. Why no candidate wins

Every candidate that has clean schema/ADR standing (`Navigator.of`, `showDialog`) requires **analyzer**
(Dart, cross-language) investigation this session has not performed to the depth M8-U/M8-V's own
generator-only work reached — specifically, *why* the statement extractor's already-implemented
`logic.Navigate` path declines the exact real call at `pairing_page.dart:400`, and whether `showDialog`
can be recognized without a name-based shortcut (§9). Neither is provably small without that reading, and
both are additionally entangled with the SettingsPage/N11 case, which independently fails the gate on its
own (§10, §11). `_log` and `describeTransferFailure` each bundle a second, independent, unresolved
capability (third-party class construction; pattern-grammar extraction) inside what looks at first glance
like a bounded fix. `ScaffoldMessenger.of` fails outright — its own diagnostic says an ADR is needed, and
none exists.

## 14. Reduction-ladder result

Not applicable — no candidate reached the stage where building one would prove anything this document
does not already show from real, unmodified Continuum source (§7, §8).

## 15. Implementation gate

```
[x] Exact root cause reproduced.                    — yes, all 6 nodeIds, fresh (§3, §4)
[x] Identity path understood.                        — yes, for all 5 root causes (§6)
[ ] Minimal fixture reproduces it.                    — not built (§8) — no candidate reached this stage
[ ] Safe semantic lowering proven.                    — no lowering was attempted (§9)
[ ] No unresolved schema question.                    — false for ScaffoldMessenger.of (§10)
[ ] No unresolved ADR question.                       — false for ScaffoldMessenger.of, SettingsPage/N11 (§10)
[ ] No unrelated runtime architecture required.       — false for _log (Logger), unresolved for describeTransferFailure
[ ] Scope is bounded.                                 — unresolved for every remaining candidate (§11, §13)
[ ] Negative controls are defined.                    — not applicable, no implementation
[x] Real Continuum payoff exists.                     — yes, for every candidate (§5)
```

**GATE = FAIL.** Not one candidate satisfies all ten conditions. Per this milestone's own explicit
instruction, implementation does not proceed.

## 16. Implementation

None. See §15.

## 17. Tests

None added — no production code changed.

## 18. Continuum before/after

Not applicable — no implementation occurred. §3's fresh census *is* both the before and the after: the
repository's own diagnostic composition is unchanged by this milestone, by design.

## 19. Regression results

No production code changed, so no regression risk exists. Confirmed rather than assumed: `git status
--short` after all investigation shows only the same, pre-existing `hello_bridge/analysis_options.yaml`
drift (§2); no file under `packages/` was modified.

## 20. Validation

Since no production code changed, the heavy validation gates (`just ci`, `just determinism`, `bridge
validate`) were **not re-run** for this milestone — re-running them would prove nothing this document
changed, and M8-V's own commit (`0c037bd`) already carries their last clean, verified run. This is stated
explicitly rather than silently omitted, per this milestone's own instruction ("if docs-only, do not
claim CI/determinism runs you did not perform").

What *was* run, and is production-relevant: `just build` (fresh, 11/11 tasks, confirms HEAD's own dist is
current — §2), and the fresh `bridge analyze`/`bridge generate` runs against both real Continuum apps
(§3), which exercise the full analyzer → normalize → generate pipeline end-to-end, read-only.

## 21. Remaining blocker graph

Unchanged from §3/§4's own fresh census — six `BRG3013` sites (five root causes), plus the independently
unrelated `BRG3001`/`BRG3002`/`BRG3004`/`BRG3006`/`BRG3008` populations (widget-mapping gaps, class-
declaration emission, opaque syntax, unresolved SDK members, inline-route naming) this milestone did not
investigate because none of them carries `BRG3013` and none was in scope. No blocker was newly discovered
or newly resolved.

## 22. Recommendation for M8-X

**Not preselected**, per this milestone's own standing instruction. What this investigation *does*
narrow, honestly, without picking a winner:

- **`Navigator.of`/`showDialog`** are the closest to "architecturally decided" (§10) — ADR-0025 D2 already
  exists and is already partially implemented for the identical mechanism. A future milestone targeting
  this should *start* by reading `statement_extractor.dart:515-596` and `material_adapter.dart:342-368`
  in full (this milestone read enough to locate them and confirm the ownership-check gate, not enough to
  prove a fix is small) — specifically, why the real `pairing_page.dart:400` call does not reach the
  existing `logic.Navigate` path, and whether extending `navigationActionOf`'s recognition to top-level
  overlay-opening functions (`showDialog`, `showModalBottomSheet`, `showMenu`) is safe by resolved
  element identity alone (mirroring M8-V's own `sdkTypeOf` discipline) rather than by name.
- **The SettingsPage/N11 case is entangled with the above and is not independently smaller** — any future
  work on `Navigator.of` will likely surface it again immediately, so a future milestone should expect to
  either scope N11's new case *with* the navigation fix, or explicitly descope the SettingsPage push site
  and prove the navigation fix on a different, cleaner real call.
- **`ScaffoldMessenger.of`** needs an ADR before anything else — a future milestone could be exactly that
  ADR, decided independently of the others.
- **`_log`/`describeTransferFailure`** are each two-capability bundles; neither should be attempted as a
  single milestone without first separately scoping its second half (`Logger` construction; switch-
  expression pattern extraction).

This is deliberately not a ranking with a declared winner — the evidence does not support one.

## 23. Commit

Only `docs/m8/m8w-remaining-brg3013-capability-census.md` is new. No other file is touched.
`fixtures/apps/hello_bridge/analysis_options.yaml`'s drift is confirmed untouched.
