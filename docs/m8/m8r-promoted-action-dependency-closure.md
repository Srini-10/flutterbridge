# M8-R — N11 promoted-action dependency closure / route-boundary ownership audit

**Date:** 2026-08-22. **Baseline:** `6f46a70` (== `origin/main`, clean tree, confirmed before any
change). **Type:** architecture audit + bounded implementation. **Outcome: an earlier, honest refusal —
never a fuller promotion.** N11 now refuses to promote a `sig.Action` across a route boundary when the
action's own body depends on another component-scoped declaration N11 does not also carry. The refusal
fires at normalize time, names the exact unmet dependency by NodeId, and reuses `BRG2303` — an existing
code, not a new one. No schema change. No new runtime capability. `_forget`'s real Continuum failure now
surfaces three stages earlier, correctly attributed, instead of a downstream `BRG3006` that blamed the
generator for a defect N11 introduced.

## Headline finding

N11 (`promote-cross-route-state`, ADR-11) promotes a callback crossing a route boundary by moving **the
signals it writes, and the action itself** into a synthesized store — this is ADR-11's own scope,
verbatim, unchanged since M0-T7. It has never analyzed what the action's own body additionally *reads* or
*calls*. Read via the React generator's own emission code (traced fresh this milestone, not inferred): a
promoted action's body is lowered exactly once, standalone, inside the synthesized store module
(`emitStore`, `packages/generators/react/src/internal/emit/store.ts`), in a resolution scope that knows
only that store's own `signals`/`actions`. When the action's body references a sibling signal it never
writes, or calls a sibling action, that reference is unreachable from the store module by construction —
not a bug in the generator, a structural certainty. The failure previously surfaced two normalize/generate
stages later as `BRG3006` ("`_env` is not declared in this program"), which is false: `_env` **is**
declared. It is simply not reachable from where N11 put the reference that needed it. This milestone closes
that gap the only way the evidence supports — N11 now detects the unmet dependency itself, at the point it
is deciding whether to promote, and refuses with the diagnostic ADR-11 already built for exactly this
shape of problem (`BRG2303`, "closes over something that cannot be promoted").

## 1. Checkpoint

```
git fetch origin && git checkout main
git status --short        → (clean)
git rev-parse HEAD          → 6f46a707ef751be3e54c24a48e1fbeaf53865cee
git rev-parse origin/main   → 6f46a707ef751be3e54c24a48e1fbeaf53865cee
```
`pnpm --filter @bridge/compiler test`: 146/146 (10 files). `pnpm --filter @bridge/gen-react test`:
254/254 (21 files). Both re-confirmed at the fresh baseline, before any change.

## 2. ADR / spec audit — read fresh, in full, this milestone

- **ADR-11** (`docs/adr/0011-cross-route-state-promotion.md`, M0-T7): establishes N11 as the last
  normalization pass. Its own "Outputs" section, quoted exactly: *"promote the signals that action
  writes, and the action itself, into a synthesized `app.Store`... Remove the argument from the
  transition and the corresponding param from the destination component."* **Never once discusses what
  should happen to a value the promoted action merely reads, or another action it calls.** This is not an
  oversight this milestone can see evidence of resolving elsewhere — it is a genuine, undecided gap in the
  ADR's own scope, present since the pass was first specified.
- **ADR-11 amendment** (`docs/adr/0011-amendment-route-argument-promotion.md`, M7-E2/M7-E3): gives N11
  conditional authority to rewrite `ui.Component.params` and internal reads, narrowly — single boundary,
  multi-caller consensus, Option D (a promoted value is consumed exactly as any other store-scoped value
  already is — no new UIR vocabulary). **Explicitly, deliberately rejects "unscoped Option A (full
  recursive/multi-hop promotion)"** — quoted: *"rejected, not because it's undesirable, but because the
  UIR as it exists today cannot prove it without inferring from names, which is explicitly disallowed.
  This is a 'not yet,' not a 'no.'"* That rejection is about a **different** shape than this milestone's
  own subject: it concerns a *parameter* forwarded through a second component (untargeted, unprovable,
  `ParamDecl` has no id). This milestone's own subject — an *action's own body* referencing another
  declaration — is target-based and provable (§4). The amendment's caution is directly relevant evidence
  for how conservatively any expansion of N11's promotion scope must be justified, not direct authority
  over this exact case either way.
- **ADR-28** (`docs/adr/0028-declaration-tier-identity-for-locals-and-parameters.md`, M8-N, self-authored):
  the precedent most structurally similar to this milestone's own question — a target being real and sound
  is not the same as being safely resolvable from every scope that might reach it. Directly informs §6.
- **N11's own current implementation** (`packages/compiler/src/internal/passes/n11_promote_cross_route_state.ts`,
  re-read in full this milestone): `classify()`'s `sig.Action` branch resolves a targeted `logic.Ref`,
  reads the action's own declared `writes: readonly NodeId[]` field, and returns `{kind:'action', writes,
  ...}` if non-empty. `promote()` adds the action's own id and every signal in `writes` to the synthesized
  store. **Nothing in this path inspects the action's own `body` at all.** `sig.Action` (schema,
  `packages/uir/src/generated/uir.ts:870-891`) carries no `scope`/`owner` field — unlike `sig.Signal`,
  which has `scope: 'component'|'store'`. An action's own component-ownership is not directly stated;
  it must be inferred from whether its id already appears in some *other* `app.Store`'s own `actions` set.

**Answering the ten questions the task requires before implementation:**

1. What does N11 promote today? — The action's own id, and the signals it directly *writes* (ADR-11's own
   words, unchanged). Never signals it reads, never actions it calls.
2. Ownership — an unpromoted `sig.Action`/component-scoped `sig.Signal` has no stated global lifetime; it
   is implicitly owned by whichever component's `State` class declared it (every Dart action is an
   instance method, per M8-H).
3. Does N11 rewrite the action's own body? — No. Confirmed directly: `rewrite()`'s `replacements` map
   never contains an entry for a promoted action's own id; only signals (their `scope`/`store` fields),
   boundary arguments, and component params are ever replaced.
4. Does N11 inspect action-body dependencies before this milestone? — No (§2, `classify()`, above).
5. Does `outboundHazard` inspect them? — No; it only inspects whether the *same-named* param is forwarded
   onward from the destination component, an unrelated, already-handled case (case 4 in N11's own doc
   comment).
6. Does consensus reason about anything beyond the promoted root? — No; `perBoundary`/`allPromotable`
   compare only each boundary's own top-level verdict.
7. Has any ADR already decided this? — No (§2, ADR-11's own silence, confirmed directly against its text).
8. Is the multi-hop-forwarding rejection the same case? — No — different mechanism (untargeted vs.
   targeted), see above.
9. Is the identity involved sound? — Yes: every dependency this milestone traced (`sig.Signal`,
   `sig.Action`) carries a real, targeted `NodeId`, confirmed live in the normalized document (§4).
10. Where does the generator put a promoted action's own body, and can it reach a sibling component-scoped
    declaration from there? — Traced directly (§3): inside the synthesized store module, in a scope that
    only knows that store's own contents. It cannot.

## 3. Generator trace — where a promoted action's body actually ends up (fresh this milestone)

Traced directly against `packages/generators/react/src/`:

- `pipeline.ts:158` loops **every** `app.Store` node, `origin` unchecked, and calls `emitStore`
  (`emit/store.ts`). `emitStore` (`store.ts:88-127`) iterates the store's own `actions` array and lowers
  each action's **full body inline**, once, inside the generated `defineStore(...)` closure. This is the
  **only** place a promoted action's body is ever generated.
- A component-tree `logic.Ref` targeting an action already listed in *any* store's `actions` array is
  excluded from `declareLocalActions`'s ordinary inline-lambda path (`component.ts:588`,
  `scope.isStoreOwned`) and instead resolved through `declareStoreConsumption`
  (`component.ts:313-389`) as `${storeLocal}.${property}` — a call into the store module, never a
  re-emitted body.
- Inside `emitStore`, the body is lowered under a scope (`store.ts:174-207`) whose `signalRead`/
  `localName` know **only** that store's own `signals`/`actions` maps, falling through to the base
  pipeline's defaults (`pipeline.ts:541-543`, all `() => undefined`) otherwise.
- `grep -rn "'origin'" packages/generators/react/src/` returns **nothing** — the generator never reads
  `origin`; a promoted store is generated by the identical code path as a hand-declared one.

**Conclusion, evidence-based, not inferred:** a promoted action's body is emitted exactly once, in a scope
that structurally cannot reach any declaration outside that store's own contents. This is not a missing
feature the generator could grow into — a store module has no notion of "which component instance," so
even if the generator tried to resolve a component-scoped signal from inside it, there would be no
principled answer to *which* instance's copy to read. The unresolved reference falls through to
`expression.ts`'s generic `UnresolvedReference` (`expression.ts:472-479`), and any `error`-severity
diagnostic makes the whole build emit zero files (`pipeline.ts:249-260`) — a correct, safe refusal, just a
very late and mis-attributed one.

## 4. Real Continuum dependency closure — `_forget`, complete, fresh

`grep -n "_forget\|_announceRevocation\|_env\b\|_session\b" apps/macos/mac/lib/pages/pairing_page.dart`,
run fresh this milestone (not reused from M8-Q):

```dart
Future<void> _forget(PairedDeviceRecord device) async {
  _announceRevocation();               // calls another action
  await _session?.cancel();            // _session: read + written here
  _session = null;                     // _forget's own write — already in `writes`
  await _env?.repository.forget(device.id);  // _env: read only, never written by _forget
  if (!mounted) return;
  setState({...});
}

void _announceRevocation() {
  final session = _session;            // reads _session too
  ...
}
```

`_forget`'s complete dependency closure, classified:

| Dependency | UIR kind | Owner | In `_forget`'s own `writes`? | N11 promotes it? |
|---|---|---|---|---|
| `_session` (write) | `sig.Signal`, component-scoped | `PairingPage` | yes | yes (already correct) |
| `_env` (read) | `sig.Signal`, component-scoped | `PairingPage` | no | **no — the real gap** |
| `_announceRevocation` (call) | `sig.Action`, component-owned | `PairingPage` | n/a (a call, not a write) | **no — the real gap** |

`_announceRevocation` itself further reads `_session` — already covered transitively once `_session` is
correctly promoted alongside `_forget`, so this milestone's fix does not need to walk into a *called*
action's own body to find *its* dependencies; refusing on the call itself (§6) is sufficient and correctly
conservative (§11).

`_forget`'s only reference anywhere in the file is `onForget: _forget` (line 404), a named argument to
`SettingsPage(...)`, constructed inside an imperative `Navigator.push` inside `_openSettings()` — a route
boundary, confirmed fresh, matching M8-Q's own prior trace exactly.

## 5. Minimal reduction — real Dart, through the real compiler, fresh this milestone

A temporary fixture (`flutter pub get`-ed, `flutter analyze`-clean, deleted after evidence extraction — no
permanent fixture is needed; see §14) reproduced the exact shape:

```dart
class _M8rProbeAppState extends State<M8rProbeApp> {
  int _count = 0;
  String _status = 'idle';
  void _markBusy() { setState(() { _status = 'busy'; }); }
  void _forget() {
    _markBusy();                                    // calls another action
    if (_status == 'busy') { setState(() { _count = _count + 1; }); }  // _forget's own write
  }
  @override
  Widget build(BuildContext context) => MaterialApp(
    home: DetailScreen(count: _count, onForget: _forget),
  );
}
```

**Before the fix**, `bridge build --json`: `normalize` succeeds silently confident —
`bridge diagnostics` shows `BRG2302` ("`onForget` crosses a route boundary... promoted... never silent")
and `BRG2304` (param removed) — then `generate` fails with two `BRG3006`s: `` `_markBusy` is not declared
in this program `` and `` `_status` is not declared in this program ``, followed by `BRG3005` (zero files
emitted). Both targets are real, live, correctly-typed declarations — the message is false for this cause,
exactly as M8-Q found for the real Continuum case.

**After the fix**, `bridge build --json`: `normalize` itself fails —
`` BRG2303: The callback `onForget` crosses a route boundary but closes over a call to `_markBusy`, another
action this pass does not also promote, which cannot be promoted into a store. ``
`generate` is never reached. `promoted_counter` (the existing, real, self-contained-action fixture,
`fixtures/apps/promoted_counter/`, unchanged) continues to build clean, 11 files, confirmed fresh — the
safe case is not regressed.

## 6. Self-containment analysis

An action is safe for N11 to promote today when every `target`ed reference in its own body resolves to:
(a) one of the signals it directly writes (already carried, always safe — no ownership change, no
duplication), (b) a `sig.Signal` already `scope: 'store'` (already global — reading it from anywhere is
already correct, unaffected by this pass), or (c) a framework/runtime primitive with no UIR target at all
(untargeted `logic.Ref`s — a local, a parameter — are ADR-28/N5's own identity, never this pass' concern,
and are explicitly *not* treated as evidence of anything, matching ADR-11's own refusal to infer from
names). It is **not** self-contained, and this milestone now refuses it, when a targeted reference resolves
to (d) a component-scoped `sig.Signal` it does not write, or (e) any other `sig.Action`. Tested directly
against the reduction ladder (§5): case (a)/(b)/(c) promote; case (d)/(e) refuse. No schema change was
needed to make this determination — `sig.Signal.scope` and `sig.Action` membership in an already-collected
`Map<NodeId, AnyUirNode>` are both information N11 already has in scope.

## 7. Dependency-closure classification

For `_forget`'s own real closure (§4): `_session` (write) — action-local in the relevant sense (it is
what the action promotes *because* it writes it — ADR-11's own existing category, untouched). `_env`
(read) — component-owned state, category (d) above. `_announceRevocation` (call) — component-owned
behavior, category (e) above. Neither `_env` nor `_announceRevocation` is module/global, store-owned,
destination-owned, or framework/runtime. **Promoting `_forget()` does not mean copying `_env` into the
destination** — moving a component-*instance*-scoped signal into a global, singleton store would silently
change its lifecycle (one value per app, not one per component instance) the moment more than one
`PairingPage` instance could ever exist; this is a real, structural reason recursive promotion is unsafe in
general (§8, §9), not merely unprovable.

## 8. Architecture options — compared against the evidence above

- **Option A (recursive declaration promotion):** rejected. Promoting `_env` and `_announceRevocation`
  alongside `_forget` would require *also* promoting anything **they** in turn depend on (transitively),
  and would change a component-instance-scoped signal into a store-scoped (global, singleton) one — the
  exact category of change ADR-11's own amendment already declined to authorize even for the *simpler*,
  fully-provable parameter-forwarding case (§2). Two `PairingPage` instances would be forced to share one
  `_env`, a real behavior change, not a mechanical rewrite. Structurally the same shape as "unscoped Option
  A," now one level deeper.
- **Option B (source-owned callable bridge):** rejected on architecture grounds, not merely unimplemented.
  `_forget` is reached via an imperative `Navigator.push`, which the React generator maps to an ordinary
  URL/route-based navigation (confirmed by §3's own store/component architecture — nothing in the
  generator preserves an underlying, still-mounted source-component instance across a route change the way
  Flutter's own `Navigator` stack does). There is no live `PairingPage` instance left to call back into
  once the destination route is active; "keep it live and bridge to it" does not hold in the generated
  target the way it does in the source framework.
- **Option C (explicit dependency threading):** rejected. `_announceRevocation` is function-typed;
  INV-18 already forbids a function-typed route-boundary argument except where already handled. `_env` is
  a non-primitive object; threading it directly would hit `BRG2301` (ADR-11a) unless it too is promoted —
  which collapses back into Option A's own rejected shape.
- **Option D (refuse non-self-contained promotion):** the option this milestone implements. Requires no
  new promotion semantics — `BRG2303` already exists, precisely for "closes over something that cannot be
  promoted." Every one of the fourteen gate conditions (§10) is satisfiable by a refusal-only change.
- **Option E:** no third architecture emerged from this milestone's own evidence that both (a) preserves
  correct per-instance semantics and (b) avoids inferring identity from names. Not adopted.

## 9. Ten safety questions

1. Signal-state duplication — does not arise; nothing new is promoted.
2. Source-signal mutation after the source unmounts — does not arise, same reason.
3. `BuildContext`/component-local-resource capture — already covered by the pre-existing `unpromotable`
   path (`logic.Lambda` N5 declined to lift); unaffected.
4. Evaluation-count alteration — none; refusal changes no runtime behavior, only earlier reporting.
5. Two destinations getting separate copies — cannot arise; nothing is duplicated.
6. Cyclic-dependency infinite traversal — `unownedDependency` (§11) walks one action's own body once,
   non-recursively into callees; a cycle in the *caller graph* (A calls B calls A) cannot loop the walk
   itself, since only `selfId` is excluded and any other call is an immediate refusal, not a recursive
   descent.
7. Double emission of shared dependencies — does not arise; nothing new is emitted.
8. Target-valid-but-wrong-scope resolution — this is precisely the failure mode being closed; the fix
   detects it before promotion rather than after.
9. React-hook-ownership invalidating the architecture — moot for a refusal-only change; no new hook usage
   is introduced.
10. Navigation-replacement lifetime assumptions — moot for the same reason; Option D asserts nothing about
    lifetime, it only declines to promote.

All ten are answered safely for Option D. Options A/B/C each fail at least one (§8).

## 10. N11 ownership

N11 already owns the promote/refuse decision for every other unsupported shape (`BRG2301`, `BRG2303`,
`BRG2305`, `BRG2306`) — this is the same kind of decision, applied one layer deeper (an action's own body,
not just its top-level shape). The dependency-closure check needed is a single-level, target-based walk of
one action's own `body` field, using data (`actions`, `signals` maps) N11 already builds for itself; it
requires no new analysis pass and no data N11 does not already hold at the point `classify()` runs.
Declarations are never cloned or re-homed by this fix — nothing crosses the line into "a later compiler
transformation" territory. This confirms and answers M8-Q's own deferred question (§23 of that doc): this
is real N11-owned work, correctly scoped, not a generator concern — the generator's own emission is proven
correct in §3; it was never where the defect lived.

## 11. Diagnostic timing

Before this fix, N11 reported `BRG2302`/`BRG2304` (info: "promoted, never silent") for a promotion that
was, in fact, unsound — confirmed false-positive-confident by the real Continuum trace (§4, §12). The
truth surfaced two stages later as a generic, mis-attributed `BRG3006`. This fix moves the true diagnosis
to the only point in the pipeline that has the information needed to make it correctly: N11 itself, at
normalize time, before any store is synthesized and before any component read is rewritten. `BRG2303`
already existed for exactly this class of failure ("closes over something that cannot be promoted... an
override must supply it") — reused verbatim, no new code minted.

## 12. Implementation gate

1. Failure reproduced — yes, fresh (§4, §5).
2. Complete dependency graph known — yes (§4, §7).
3. Ownership semantics proven — yes (§3, §6, §7).
4. ADR-11 does not prohibit the selected behavior — yes for Option D: refusal is exactly what `BRG2303`
   already exists for (ADR-11's own text); it would fail for Options A/B/C (§8).
5. No unresolved lifetime semantics — yes; a refusal introduces none.
6. No signal/state duplication possible — yes; nothing new is promoted.
7. No name matching required — yes; detection is `target`-only (§6, §13).
8. NodeId/target-based solution — yes.
9. N11 clearly the correct owner — yes (§10).
10. No unresolved ParamDecl architecture required — yes; concerns only `sig.Action`/`sig.Signal` targets.
11. No new runtime capability required — yes; purely a normalize-time check.
12. No schema change required — yes (§2, §6).
13. Reduction ladder demonstrates a safe supported subset — yes (§5): self-contained actions still
    promote; dependent ones now refuse honestly instead of silently mis-promoting.
14. Unsupported shapes can still be honestly refused — yes; this is precisely what the fix does.

**All fourteen conditions pass, for the refusal-only (Option D) implementation.** GATE: PASS, scoped
strictly to detection-and-refusal — not to any form of promotion this milestone did not prove safe.

## 13. Implementation

`packages/compiler/src/internal/passes/n11_promote_cross_route_state.ts` — one new helper,
`unownedDependency(action, selfId, writes, actions, signals)`, called from `classify()`'s `sig.Action`
branch after the existing `writes.length === 0` check. It walks `action.body` once via the existing
`walkNode` helper (`normalize/pass.ts`, already used elsewhere in the compiler — no new traversal
mechanism introduced), and for every `logic.Ref` with a `target` other than the action's own id:

- if the target resolves to another `sig.Action`, refuses (a call this pass does not also promote);
- if the target resolves to a `sig.Signal` with `scope === 'component'` not already in the action's own
  `writes`, refuses (a read this pass does not also promote);
- an already store-scoped signal, or an untargeted reference (a local, a parameter), is not flagged —
  matching §6's own self-containment definition exactly.

On a match, `classify()` returns `{kind: 'unpromotable', reason: ...}` instead of `{kind: 'action', ...}`,
routing through the existing `BRG2303` reporting path unchanged. No other function in the file was
touched. Zero lines changed in `rewrite()`, `promote()`, or any diagnostic-reporting code — the fix is
entirely a refinement of what `classify()` is willing to call promotable.

**Known, deliberate conservatism (documented, not hidden):** the check does not attempt to determine
whether a called action is *itself* independently being promoted in the same N11 run (which could, in
principle, make the call safe). Doing so would require classification to be interleaved with promotion
decisions across boundaries — real, added complexity this milestone's own evidence does not require to
close the actual Continuum gap, and over-refusing a theoretically-safe case is the same conservative
default ADR-11 already chose for `BRG2303`'s existing cases. Recorded as a deferred question (§17).

## 14. Tests

Five new tests added to `packages/compiler/tests/n9_n10_n11.test.ts`, in the existing `N11 — promote cross
route state` suite, using the file's own established synthetic-UIR helpers (extended with
`actionWithBody`/`bodyRef`/`callStmt`/`assignStmt`, matching `n5.test.ts`'s own conventions):

1. A promoted action calling another action is refused (`BRG2303`), naming the callee; confirms the
   argument is left untouched (not half-stripped) and no store is synthesized.
2. A promoted action reading a component-scoped signal it never writes is refused, naming the read.
3. A promoted action reading an *already store-scoped* signal is unaffected — confirms the fix does not
   over-refuse global state.
4. A self-call (recursion) is not treated as an unowned dependency — confirms `selfId` exclusion.
5. An untargeted reference inside the body (a local, a parameter) is never guessed at by name — confirms
   the fix is target-only, and **would fail if someone later replaced target identity with name
   matching**: the local/parameter here is named `total`, colliding with nothing, and must not trigger a
   refusal on its own.

All 151 tests (146 existing + 5 new) pass. `pnpm --filter @bridge/compiler exec tsc --noEmit`: clean.

## 15. Real Continuum re-measurement — fresh, before/after, same commit pair

Read-only, via a temporary `bridge.json` pointing `source` at the real
`apps/macos/mac` app and `work`/`out` outside the Continuum tree (no writes into Continuum at all;
`git status --short` in Continuum confirmed empty before and after both runs):

**Before** (compiler rebuilt from the `6f46a70` state, fix stashed): normalize diagnostics include
`BRG2302` ("`onForget` crosses a route boundary... promoted... never silent") and `BRG2304` (param
removed) — a confident, wrong "success."

**After** (fix restored, compiler rebuilt): the same normalize pass now reports
`` BRG2303: ...closes over a call to `_announceRevocation`, another action this pass does not also
promote... ``  — an immediate, correctly-attributed, error-severity refusal, at the earliest point the
compiler has enough information to make it. `onExportLogs`'s pre-existing `BRG2303` ("no state that the
compiler can name") is unchanged — that refusal predates this fix.

This is the "earlier refusal, not fewer errors" outcome the milestone explicitly treats as a correctness
improvement: `_forget`'s downstream `BRG3006`/`BRG3005` (mis-attributed, three stages later) is replaced
by one correctly-attributed `BRG2303` at normalize time. Total generator-stage diagnostic counts for the
real apps were not separately re-tallied — the case that mattered (`_forget`) is now caught before
`generate` ever runs, so the comparison that counts is normalize-stage attribution, not a raw count.

## 16. Regression matrix

| Area | Check | Result |
|---|---|---|
| ADR-11/M7-E3 core promotion | existing N11 test suite (signal case, action case, consensus, outbound hazard, live object, unpromotable lambda, primitive, store-scoped signal, fixed point) | all pass, unmodified |
| M7-N | `pnpm --filter @bridge/gen-react test` (254/254) | unaffected — this milestone touched only the compiler package |
| M8-D (enum identity) | covered by gen-react suite | unaffected |
| M8-F (cross-package assembly) | covered by gen-react suite | unaffected |
| M8-H (write-nothing action) | `writes.length === 0` check untouched, still runs before the new check | unaffected |
| M8-J (top-level reference identity) | unaffected — different UIR kinds (`logic.FieldDecl`/`FunctionDecl`) | unaffected |
| M8-N (declaration-tier identity, ADR-28) | untargeted refs inside an action body are explicitly *not* flagged (§14, test 5) | unaffected, confirmed by new test |
| M8-O (transitive action reference discovery) | `referencedActions` untouched; re-confirmed via the react suite | unaffected |
| M8-P (top-level `FieldDecl` lowering) | unaffected — different code path | unaffected |
| M8-Q (action/effect reachability) | this milestone directly implements M8-Q's own §23 recommendation | addressed, not merely unaffected |

`just ci`: full green (build, typecheck, test, codegen-check, lint, lint-negative, uir-lint, uir-test,
analyzer-lint, analyzer-test, dart-analyze — includes the Dart analyzer/UIR suites and `hello_bridge`'s own
`flutter analyze`). `just determinism`: retried after one killed attempt (signal 15, unrelated to this
change — an environmental resource/time limit under concurrent work, consistent with prior milestones'
experience in this same session); the clean retry, run alone, completed byte-identical across all 5 fixture
apps, 3 runs each (`counter`, `promoted-counter`, `inline-push-props`, `async-push-guard`,
`local-store`) — first killed attempt reported honestly, not counted as green.

## 17. Deferred questions

1. **Whether a called action that is itself independently self-contained (or independently promoted in
   the same N11 run) could safely be allowed** — this milestone's own fix conservatively refuses every
   call to another action, never attempting cross-boundary promotion interleaving (§13's own documented
   conservatism). A future milestone could investigate whether interleaving classification and promotion
   across the whole boundary set (rather than per-action) can prove some of these cases safe without
   inferring from names — but the real Continuum case this milestone was scoped to (`_forget`) does not
   need it: `_announceRevocation` is not independently promotable (M8-Q confirmed it is never itself a
   route-boundary argument).
2. **`sig.Effect`** — M8-Q's own separate, unrelated finding (zero generator lowering for lifecycle
   methods). This milestone's own findings do not change its scope or urgency; still deferred, still
   independent.
3. **`onExportLogs`'s own `BRG2303`** ("no state that the compiler can name") predates this milestone and
   is untouched — a different, pre-existing refusal category (`writes.length === 0`), not investigated
   further here.
4. Whether ADR-11 itself should be formally amended to state the dependency-closure refusal rule this
   milestone implements as *policy*, rather than leaving it as an unwritten consequence of `classify()`'s
   own logic — a documentation question, not a behavioral one; not required for this milestone's own gate
   to pass, but would make the rule discoverable without reading the pass' own source.

## 18. Hard exclusions — confirmed untouched

`sig.Effect` lowering: not implemented, not touched. ParamDecl identity: not touched — the fix concerns
only `sig.Action`/`sig.Signal` targets. Parameter/N5/N11 forwarding architecture broadly: untouched outside
the narrow, evidence-bounded scope this milestone's own primary question authorized (N11's own
dependency-closure refusal, not any new forwarding mechanism). Catch-clause parameter identity: untouched.
`FunctionDecl`/`FieldDecl` full lowering: untouched. Module-emission architecture: untouched. `BRG2301`:
untouched. `BRG2303` override system: reused, not redesigned. Switch-expression / adjacent-string-literal
extraction: untouched. `ui.Async`, `themeMode`: untouched. Continuum application source: **not modified** —
confirmed by `git status --short` in Continuum, empty, both before and after every measurement (§4, §15).
M8-S: not started.

## 19. Validation

`just ci`: green (§16). `just determinism`: green on retry, first attempt honestly reported as killed, not
counted (§16). `bridge validate` was not run as a separate step — no new permanent fixture was added
(§ below) for it to validate beyond what `just determinism`'s own fixed-point/byte-identical checks already
cover for the five existing fixture apps, one of which (`promoted_counter`) directly exercises this pass'
own safe-promotion path. `git diff --check`: clean. The disposable probe fixture and the disposable
Continuum whatif check directory were both deleted after evidence extraction; Continuum's own tree confirmed
clean (`git status --short`, empty) as the final step.

**No new permanent fixture was committed.** N11's own existing test suite is, and always has been,
synthetic-UIR-only (confirmed by reading every existing test in `n9_n10_n11.test.ts` — no test in that
file is backed by a real Dart fixture); this milestone's five new tests follow that same, already-
established convention exactly, rather than introducing a different one. The real-fixture and real-
Continuum evidence this milestone required is fully captured in this document (§4, §5, §15) instead.

## 20. Exact recommendation for what's next

The remaining blocker graph this milestone leaves behind: (1) whether call-dependency refusal could be
loosened for provably-independently-promotable callees (§17.1) — real, bounded, not urgent; (2)
`sig.Effect` lowering (§17.2, M8-Q's own finding) — real, separate, larger in scope; (3) everything M8-Q's
own remaining blocker graph already listed and this milestone did not touch (module-emission architecture,
`_log`'s third-party-class blocker, `protocolVersion`'s own route-boundary blocker, parameter/N5/N11
interaction generally, catch-clause parameter identity, `BRG1302`/switch-expression/`FunctionDecl` full
lowering) — all unchanged, all still open. Recommend the next milestone pick whichever of (1)/(2) is
highest-value independently; neither depends on the other.
