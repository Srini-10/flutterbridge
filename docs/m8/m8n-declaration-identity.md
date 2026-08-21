# M8-N — Declaration identity for parameters and local variables

**Date:** 2026-08-21. **Baseline:** `955d46d` (== `origin/main`, clean tree, confirmed before any
change). **Type:** ADR + implementation. **Two gates, split outcome**: local-variable identity
(`logic.VarDecl`) is authorized and implemented, end to end, real Dart to real `tsc`. Parameter identity
(`ParamDecl`) is authorized in principle by the same ADR but **not implemented** this milestone — a
genuine, separate implementation question (its interaction with N5's closure-lifting safety) was
discovered mid-investigation and is documented, not rushed.

## Headline finding

M8-G and M8-M each independently proved a version of the same defect and each recommended an ADR. This
milestone re-proved both from scratch, found the two are literally the same architectural gap (a real,
lexically-scoped declaration ADR-17's two-tier model has no safe slot for), and wrote one ADR (ADR-28)
covering both. For locals, the gate passed cleanly and the fix shipped — with one consequence neither
M8-G nor M8-M anticipated: `logic.VarDecl` gaining a real target broke a documented invariant in N5
(lift-closures), which had to be fixed in the same change or the ADR's own local-variable work would have
introduced a real regression (a captured outer local silently lifted into a dangling standalone action).
For parameters, the same investigation found a materially different, larger implementation shape
(`ParamDecl` must become a genuine node, not just gain a field) and a second, undecided interaction with
the same N5 pass and, downstream, N11 — surfaced but not resolved, so parameter implementation stops at
the ADR/schema-design boundary, exactly as the milestone's own Gate B escape valve anticipates.

## 1. Checkpoint

```
git fetch origin && git checkout main && git pull --ff-only origin main
git status --short        → (clean)
git rev-parse HEAD          → 955d46dcc472ac4ea4fa7de1c090a2c84c027fe4
git rev-parse origin/main   → 955d46dcc472ac4ea4fa7de1c090a2c84c027fe4
```
Contains `955d46d` (M8-M's own commit).

## 2. M8-M reproduction (fresh, not trusted)

A fresh temporary probe (`fixtures/apps/m8n_probe/`, deleted after evidence extraction) declared
`final int x = 1; _log = x;` identically in three unrelated methods of one class, run through the real
`bridge analyze`. All three `logic.VarDecl` declarations produced the **identical** id
(`c0726176f493551d`) and all three reads the **identical** id (`9295565a71aadd9d`), with no `target` on
any of them — the exact collision M8-M reported, independently reproduced.

## 3. M8-G reproduction (fresh, not trusted)

The real, committed `fixtures/apps/hello_bridge` reproduces the parameter version of the same defect
unprompted: `LoginScreen`'s own `isDark` parameter, read inside its `_login` action while forwarding to
`HomeScreen(isDark: widget.isDark)`, and `HomeScreen`'s own, entirely unrelated `isDark` parameter, read
inside its own `build()`, share the identical node id `029334b99e65258e`. Two different parameters, on
two different classes, colliding purely because `{name: 'isDark', type: 'bool'}` is all a content-derived
id has to work with. `bridge validate` on `hello_bridge` confirms N11 still cannot prove this forward:
`BRG2305` fires for `isDark`/`onToggleTheme`, unchanged, both before and after this milestone's own work
(§20) — `bind.Param`'s classification in `n11_promote_cross_route_state.ts` genuinely never checks a
`target`; `ParamDecl` genuinely has no `id` field at all today, confirmed by direct schema read.

## 4. Current ParamDecl / VarDecl identity, current local Ref target

`ParamDecl` (`packages/uir/schema/l1.json`): `{name, type, required?, named?, defaultValue?}`,
`additionalProperties: false` — no `kind`, no `id`, not `UirNodeBase`-derived. A plain value, in neither
of ADR-17's tiers, confirmed unchanged since M8-G.

`logic.VarDecl`: a real `UirNodeBase`-derived node — `id` exists, but (before this milestone)
content-derived, via `node_factory.dart`'s `raw.symbol != null ? declare(...) : allocator.forContent(...)`
branch, since no `Binding(binds: Binds.local)` creation site ever passed a `symbol`.

A local's own `logic.Ref{name, type}` (before this milestone): no `target` field at all, by explicit,
documented design (`_reference`'s own comment: *"A target is a promise that something declares this
symbol. A local has none... and inventing one would be a promise we could not keep"*).

## 5. Inventory table (live source, not copied from prior docs)

| Declaration kind | UIR node | Id source (before) | Reference target? | Symbol helper |
|---|---|---|---|---|
| Component | `ui.Component` | symbol (`Symbols.component`) | yes (`ui.Element.component`, anchor+name) | `Symbols.component`/`componentIn` |
| Store | `app.Store` | symbol (`Symbols.store`) | yes | `Symbols.store`/`storeIn` |
| Action | `sig.Action` | symbol (`Symbols.action`) | yes (`logic.Ref.target`) | `Symbols.action`/`actionIn` |
| FunctionDecl | `logic.FunctionDecl` | symbol (`Symbols.function`) | yes (M8-J) | `Symbols.function`/`functionIn` |
| EnumDecl | `logic.EnumDecl` | symbol (`Symbols.type`) | yes (M8-D, via `_enumConstantTarget`) | `Symbols.type`/`typeIn` |
| Store member (signal/derived/action) | `sig.Signal`/`.Derived`/`.Action` | symbol, owner-qualified | yes | `Symbols.signal`/`.derived`/`.action` (+`In`) |
| Top-level var | `logic.FieldDecl` | symbol (`Symbols.variable`) | yes (M8-J) | `Symbols.variable`/`variableIn` |
| **ParamDecl** | none (plain value) | **none — not a node** | no (`bind.Param.param`/untargeted `logic.Ref`, name only) | **none — this milestone's own finding, unimplemented** |
| **VarDecl (before)** | `logic.VarDecl` | **content** (wrong tier) | no | **none** |
| **VarDecl (after, this milestone)** | `logic.VarDecl` | **symbol** (`Symbols.local`, owner+ordinal) | **yes** | **`Symbols.local`** |

ADR-17 ISSUE-6 states the two-tier model abstractly and does not mention `ParamDecl`/`VarDecl` by name;
both fall through the cracks as currently *implemented*, not as the table itself defines — confirmed by
direct read of `docs/adr/0017-architectural-rulings-at-the-m1-t8-gate.md`.

## 6. Candidate symbol schemes

**Candidate A** (`param:<path>#<owner>.<name>` / `local:<path>#<owner>.<name>`) — tested immediately
against shadowing (§2's probe): **insufficient for locals**, since two lexically distinct declarations of
`x` in the same owner would produce the identical symbol. Sufficient, unmodified, for parameters — Dart
forbids two parameters of one constructor sharing a name, so owner+name alone is already collision-free
there (confirmed: no rung in this investigation found a parameter-name collision within one owner).

**Candidate B, refined** (`local:<path>#<owner>.<ordinal>.<name>`) — adopted for locals. The ordinal is
not source-order inferred after the fact; it is computed once, by a dedicated pre-pass
(`_ordinalsOf`/`_OrdinalVisitor` in `scope.dart`) that walks the whole owning body before extraction
begins, keyed by the analyzer's own resolved `Element` (stable and comparable within one compilation —
never by name, never by span). A pre-computed, immutable lookup was chosen over a live, side-effecting
counter specifically because `_variable` (builds the `logic.VarDecl` node) and `_declaring` (builds the
`Binding` a later reference resolves against) are two independent call sites reached at different points
in the same walk — a shared mutable counter would hand them different answers depending on which ran
first; a pure lookup cannot disagree with itself no matter how many times it's asked.

**Candidate C** (span/offset identity) — rejected outright, per ADR-17's own silence on spans as identity
and the task's own instruction not to invent that rule. Not measured further; nothing in this
investigation found a reason to reconsider it.

**Candidate D** (content addressing, the status quo) — reproduced and rejected with concrete evidence
(§2, §3): both a same-owner shadow and a cross-owner textual match collide.

## 7. Stability requirements

| Test | Requirement | Result |
|---|---|---|
| Same name, different functions | distinct | ✅ (§2, owner-qualified) |
| Same name, nested scopes | distinct | ✅ (§2, ordinal-qualified) |
| Same initializer, different declarations | distinct | ✅ (§2 — identical content, different owners) |
| Different initializer, same name | distinct (trivially, content differs too) | not separately tested — subsumed |
| Parameter vs. local | never collide | ✅ by construction — disjoint `Binds` kinds, `Scope.lookup` already correct (§13) |
| Two params, same name, different components | distinct | ✅ — owner-qualified, matching `Symbols.variable`'s own precedent (parameters not implemented this milestone, but the scheme is the same one already proven safe for fields) |
| Two methods, same name, different classes | distinct | ✅ — the owner IS the qualifying declaration's own full symbol, unique per class by construction |
| Same source, twice | identical | ✅ (new Dart test, §16 — `first.bytes == second.bytes`) |
| Harmless unrelated declaration inserted before it | **may legitimately change** | ✅, by design — an earlier local's ordinal shift is a *legitimate* new identity, not a bug (ADR-28 §13) |
| Whitespace/comment-only edit | must not change identity | not separately tested; the symbol is derived from the resolved `Element` and the AST-walk order, neither of which whitespace/comments perturb |
| Cross-file/package owners | not applicable | confirmed — a local's `Element` never resolves outside its own function (§ADR-28 §14) |

Rename stability was **deliberately not claimed** — per the task's own instruction, and per ADR-28 §13's
own reasoning: nothing outside the one extraction pass that mints a local's symbol ever looks it up
again, so there is nothing for rename-instability to break.

## 8. BRG1207 consequence

Traced to its actual trigger (`dart/bridge_analyzer/lib/src/builder/validation.dart`'s
`_checkReferencesResolve`): a sweep over `context.resolver.localSymbols`, checking each resolves to a
surviving node id. Every declared local's own `VariableDeclarationStatement` is unconditionally lowered to
a `logic.VarDecl` today — nothing conditionally elides it, confirmed by direct search: no N1–N11 pass
removes a `VarDecl` node (the only `VarDecl`-aware pass, N5, *reads* it and, after this milestone, still
never deletes it). Minting a symbol for every declared local, used or not, is therefore safe under
BRG1207 by construction — the node the symbol names always exists. An unused local behaves exactly like
any other never-referenced declaration already in the system. Confirmed, not merely argued: 312/312 Dart
tests pass, including the full BRG1207 test suite, unmodified.

## 9. M8-B Binding.inlineValue interaction

Untouched, and correctly so. `component_extractor.dart` still constructs a build-method local as
`Binding(binds: Binds.local, inlineValue: initializer)` — no `symbol`. `_reference`'s existing branch
order checks `binding?.inlineValue` **before** ever consulting `binding?.symbol`, so a build-method local
never reaches the new code path at all; the two mechanisms are mutually exclusive by construction, not by
a new guard this milestone added. Re-confirmed the M8-B evaluation-count/mutation/object-identity analysis
(ADR-28 §10, §13): no bug found in M8-B's own shipped mechanism; reusing it for ordinary imperative-body
locals remains rejected (duplicated side effects, no `var` representation, broken object identity).

## 10. Parameter results

**Not implemented.** Architecture authorized (ADR-28 §4, §16); implementation stops at schema/ADR design.
`ParamDecl` cannot gain an `id` the way `logic.VarDecl` did (pass `symbol:` into an existing `RawNode`
call) because `ParamDecl` is not built via `RawNode`/`NodeFactory` at all today — confirmed by direct
read: `_params` in every extractor that builds one constructs a plain `RawMap`, which carries no `span`
and no `symbol`, and `node_factory.dart`'s only id-minting path (`context.resolver.declare`) is reachable
exclusively through `RawNode`'s own dispatch. The mechanically-correct fix is for `ParamDecl` to become a
real, `x-uir-kind`-discriminated node (`kind: "logic.ParamDecl"`, `UirNodeBase`'s `id`/`anchor`/`span`) —
a genuine, if additive, schema change, larger than the field-only amendment M8-G's own doc proposed.
Investigating this further surfaced the decisive reason to stop here: the exact same N5 closure-lifting
invariant that had to be fixed for locals (§11) is *also* implicated for parameters, and worse — a
component parameter's generated identifier (`props.x`) is valid only inside that one component's own
function body, so treating a parameter's target as unconditionally "safe to lift" (the way a signal's
target correctly is) would be wrong in a way locals are not: a lifted action that reads `props.isDark`
would be broken regardless of where the parameter was declared relative to the lambda, because a promoted
action lives in a store, which has no `props` at all. Resolving *that* correctly is inseparable from N11's
own multi-hop promotion question — explicitly forbidden to implement or design further this milestone.
This is a genuine second, undecided question this investigation discovered but did not resolve, matching
the task's own Gate B escape valve exactly.

## 11. Local results

**Implemented, end to end.** `Symbols.local(name, {owner, ordinal})` → `'local:$path#$owner.$ordinal.$name'`.
Every ordinary `final`/`var` local (not `for`-loop/`catch` bindings, ADR-28 §17) gets a real symbol,
minted once via a pre-pass (§6), threaded through the same `Binding`/`_reference` mechanism every other
declaration kind already uses — zero changes needed to `_reference` itself. Confirmed live in the real,
independently-progressing `apps/macos/mac`: `formatBytes`'s `value`/`unit`/`units` — the exact motivating
case from M8-L/M8-M — now all carry real targets (§20).

**N5 (lift-closures) required a fix, and this was the decisive, load-bearing discovery of this milestone.**
N5's own header comment states a deliberate invariant: a targeted `logic.Ref` is unconditionally safe to
lift; an untargeted one names a free local and must not be. Giving locals a real target broke the premise
that made that check correct — a closure capturing an *enclosing* local would now look exactly like one
reading a signal. Fixed by computing one more precomputed id set (`walk(program)` filtered to
`logic.VarDecl`, mirroring the existing `signals` set — `program.ofKind` was tried first and found wrong,
§ Errors below), and extending `freeLocals`/`collectBound` to check, for a local's own target, whether it
was declared *inside* the lambda being lifted (`collectBoundIds`, the id-based sibling of the existing
name-based `collectBound`) rather than treating any target as automatically safe. Proven with 3 new,
mutation-sensitive tests (`n5.test.ts`): a closure capturing an outer local is still refused (`BRG2105`,
unchanged wording); a closure reading a local it declares *itself* now lifts correctly (previously
impossible to express, since such a local never had a target to check); a signal's own target remains
unconditionally safe, unaffected — 15/15 N5 tests pass, 0 regressions.

## 12. N11 impact

**None, deliberately.** `bind.Param`'s classification in `n11_promote_cross_route_state.ts` is untouched
— it still returns `{kind: 'forwarded'}` unconditionally, regardless of any future `target`. This
milestone gave no `target` to `bind.Param` at all (§10 — parameter identity is not implemented), so there
is nothing new for N11 to consume even if it were touched. `BRG2305` fires identically on `hello_bridge`
before and after (§3, §20) — confirmed, not assumed.

## 13. Generator (EmitScope) impact

`EmitScope.localName` already existed, already documented itself as covering exactly this case, and was
already consulted first in the `logic.Ref` case — confirmed nothing needed to change there. What was
missing was a populator. Fixed at the three places a statement body is lowered: `declareLocalActions`
(lifted actions, `component.ts`), and the inline, not-lifted `logic.Lambda` case (`expression.ts`) — a
third site this investigation found and fixed as a necessary consequence, not a bonus (a form validator
with its own local would otherwise hit the identical gap). A new, exported `localBindingsIn(body)`
(`expression.ts`) walks a body once, mapping each `logic.VarDecl`'s own id to `identifierOf(name)` — a
pure function, so two shadowed locals with the same spelling correctly get the same emitted text, and two
`const x` declarations in two nested JS blocks shadow exactly the way the two Dart declarations did,
without any disambiguating-suffix logic. No name-based fallback anywhere: `localName`'s lookup is by id,
always. `scope.node(target)` was tried first for this and found wrong (`logic.VarDecl` is never a
top-level document node, so `context.program.get`/`scope.node` cannot resolve one) — `localBindingsIn`'s
own body-walk was written to replace that approach entirely, not layered on top of it.

## 14. Real corpus results

Read-only analyze, both real apps, unchanged from M8-L/M8-M's own baseline (mac: 0 errors/95 warnings;
droid: 0 errors/124 warnings) — confirms nothing analyzer-facing drifted in Continuum's own,
independently-progressing source. `git status --short` in Continuum: 34 lines, identical before and
after this milestone's entire investigation — nothing touched.

Disposable whatif copies only (mac + droid, method unchanged from M8-L/M8-M, deleted after measurement):

| | mac before | mac after | droid before | droid after |
|---|---:|---:|---:|---:|
| `BRG3006` | 24 | **17** | 25 | **18** |
| `BRG3013` | 8 | 8 | 8 | 8 |
| total errors | 48 | **41** | 53 | **46** |
| total warnings | 17 | 17 | 19 | 19 |
| files emitted | 0 | 0 | 0 | 0 |

**This is a real reduction, not a reclassification** — unlike M8-L's own function-diagnostic fix (which
moved a fixed count from one code to another, total unchanged), 7 fewer errors fire in each app: 7 real
local-variable reads per app now resolve and generate correctly where they previously refused. The
remaining `BRG3006` population (`Theme.of`, `ContinuumFeature.values`, `double.infinity`, `_isLast`,
`_slides`, `e` (a catch parameter — ADR-28 §17's own named exclusion), `_env`/`onForget`/`_load`/
`_announceRevocation`/`_onboardingSlides` (parameters, or the M8-M-flagged action-to-action gap, §21)) is
confirmed heterogeneous, matching M8-I/M8-K's own prior characterization — not claimed fixed, not chased
further. Files emitted remains 0/0 in both apps — `BRG2301`/`BRG2303`/`BRG3001`/`BRG3002`/`BRG3004`/
`BRG3008` remain independent, untouched blockers.

## 15. FunctionDecl re-measurement

Not touched (explicitly forbidden this milestone). Confirmed directly, live, in real Continuum:
`formatBytes`'s `value`/`unit`/`units` reads all now carry real targets (`7fc4bc85fd459f20`,
`ef18e451a7182a8f`, `007ca9d1657bd963`) — the local-variable half of what blocked it (M8-L §10.7, M8-M) is
resolved. `formatBytes` still does not generate, because `logic.FunctionDecl` lowering itself does not
exist (M8-L's own, still-standing finding) — this milestone's fix removes one precondition, not the
remaining one. `describeTransferFailure` (switch-expression opacity) and `formatUptime` (already had no
locals) are both unaffected by anything in this milestone, exactly as predicted.

## 16. Regression evidence

`dart test`: 312/312 (306 pre-existing + 6 new local-identity tests), including unmodified: M7-N's own
store-member identity tests, M8-B's structured-build tests (evaluation-count/mutation semantics
unchanged), M8-D's enum-identity tests, M8-F's cross-package assembly tests, M8-H's write-nothing-action
tests, M8-J's top-level-identity tests. `pnpm --filter @bridge/compiler test`: 146/146 (143 + 3 new N5
tests), 0 regressions. `pnpm --filter @bridge/gen-react test`: 228/228 (222 + 6 new
`local_variables_build.test.ts`, including a real `tsc` build-proof), confirming M8-L's own
`toplevel_function_reference.test.ts` (BRG3013 classification) still passes unmodified — `logic.FunctionDecl`
references remain correctly `BRG3013`, never reverted to `BRG3006`. `just ci`: exit 0.

## 17. CI / determinism / fixed point

`just ci`: exit 0 (build, typecheck, the full TS test suite, `codegen-check` — a no-op pass, since no
schema changed this milestone, `lint`, `lint-negative`, `uir-lint`, `uir-test`, `analyzer-lint`,
`analyzer-test` 312/312, `dart-analyze` — all green in sequence). `just determinism`: the `counter` app's
own full 3-run pipeline completed and passed cleanly — uir, normalized, and emitted-files bytes identical
across all 3 runs, 10 files each — before the harness was killed by signal 15 partway into
`promoted-counter`'s own 3rd run, the same environmental/resource limitation recorded in every prior
session that ran this check (M8-F, M8-J, M8-L). Bounded substitute, run to completion: `bridge validate`
(build + determinism + fixed point) on the new `fixtures/apps/local_variables` fixture — the one
containing the new identity — both checks pass (`ok: true`, `deterministic`, `fixed point`). No test is
reported passing here that did not actually run.

## 18. Silent wrong-code findings

None new in shipped code. One real, load-bearing near-miss caught and fixed **before** it could ship as a
regression: N5's own closure-capture safety (§11) — had it shipped unfixed alongside the local-identity
work, a closure capturing an outer local would have been silently lifted into a standalone action with a
dangling reference, a genuinely wrong program that would have compiled. This is recorded as the single
most important correctness finding of this milestone, not a footnote — it is exactly the class of defect
these milestones' own discipline exists to catch before it reaches a fixture, a corpus run, or a user.

## 19. Action-to-action reference finding (M8-M's own, revisited)

Investigated only enough to classify, per the task's own instruction. **Independent of parameter/local
identity.** `referencedActions` (`component.ts`) discovers actions by walking the *render tree* only; an
action called solely from *inside another action's body* (never directly wired to a prop) is invisible to
it regardless of anything this milestone changed — confirmed by inspection, not re-fixtured, since neither
the extraction-side symbol work nor the generator's `localName` work touches `referencedActions` at all.
Some of the real Continuum `BRG3006` sites this milestone did *not* move (`_load`, `_announceRevocation`,
`_onboardingSlides`, §14) are plausibly this exact, separate gap — not confirmed site-by-site here, since
doing so is that gap's own investigation, not this one's.

## 20. Remaining blocker graph

1. **Parameter identity implementation** (§10) — architecturally authorized (ADR-28), blocked on a
   genuine, undecided second question: how a component-scoped target (`props.x`) interacts with N5's
   closure-lifting and, downstream, N11's own promotion decision — explicitly out of this milestone's
   scope to resolve.
2. **Action-to-action reference discovery** (§19, M8-M's own finding) — real, unmeasured beyond its
   existence, independent of everything else here.
3. `BRG1302` adjacent-string-literals (M8-K) — untouched.
4. Top-level `FieldDecl`/const generator lowering (M8-L §10.11) — untouched.
5. Switch-expression extraction (M8-L §9) — untouched, out of scope by this and prior milestones'
   exclusion lists.
6. `BRG2301`/`BRG2303` route-boundary blockers (M8-I) — untouched.
7. `logic.FunctionDecl` full lowering (M8-L) — still gated on the switch-expression gap for
   `describeTransferFailure`; `formatBytes` now has one fewer blocker (locals resolve) but still needs
   FunctionDecl lowering itself, which remains unimplemented by design.

## 21. Exact recommendation for M8-O

Two independent, real candidates, genuinely different in shape:

1. **Resolve the parameter/N5/N11 interaction** (§10, §20.1) — the natural continuation of this
   milestone's own ADR, and the one that would let `hello_bridge`'s own `BRG2305` finally move. This is
   real design work, not mechanical: it needs to decide what "safe to lift" means for a component-scoped
   target specifically, which is inseparable from deciding something about N11's own promotion model —
   recommend scoping it as its own ADR-level investigation, not assumed bounded going in.
2. **The action-to-action reference gap** (§19) — smaller, more mechanical-looking (extend
   `referencedActions`'s own discovery walk to recurse into already-discovered actions' own bodies), with
   real, if unconfirmed, Continuum evidence. A more conservative next step if the parameter question proves
   too large for one milestone.

Recommend #2 first if a smaller, higher-confidence milestone is preferred; #1 is the more consequential
one but should not be started without accepting it may itself end in another ADR-only STOP.
