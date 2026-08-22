# M8-Q — Action-via-effect / lifecycle reachability audit

**Date:** 2026-08-22. **Baseline:** `b336185` (== `origin/main`, clean tree, confirmed before any
change). **Type:** measurement only, docs-only. **M8-P's own hypothesis is disproven.**
`_announceRevocation` and `_env` do **not** fail because of an effect/lifecycle reachability gap. They
fail for a single, shared, different reason — one N11 (`promote-cross-route-state`, ADR-11) already
owns, and this milestone's own hard exclusions already name. No production code changed.

## Headline finding

M8-P's own doc named "action-via-effect/lifecycle reachability" as a hypothesis, correctly flagged as
unproven. It was wrong. Tracing both real symptoms to their exact source line and their exact UIR
position — not merely re-reading a diagnostic message — found that `_forget`'s only reference (the
action that calls `_announceRevocation` and reads `_env`) is not inside any lifecycle method at all. It
is a callback argument (`onForget: _forget`) crossing a route boundary into a *different* component
(`SettingsPage`). N11's own cross-route promotion machinery rewrites the destination component's read of
that callback to point **directly** at the source component's own action — correctly, by NodeId, no name
matching — but does not also make that action's own transitive dependencies (another signal it reads,
another action it calls) resolvable from the destination component's own generator scope, because those
belong to a different component's own local state. `sig.Effect` (lifecycle methods) turned out to have an
entirely separate, real, and unrelated property — the generator has no code path for it at all — found
during this investigation, not the cause of either named symptom, and recorded honestly as a second,
independent finding.

## 1. Checkpoint

```
git fetch origin && git checkout main
git status --short        → (clean)
git rev-parse HEAD          → b33618558dadaf004af64ab91821354c000fd938
git rev-parse origin/main   → b33618558dadaf004af64ab91821354c000fd938
```
`pnpm --filter @bridge/gen-react test`: 254/254 (21 files), fresh baseline, re-confirmed unchanged at
the end of this investigation (no code touched).

## 2. Fresh Continuum baseline

Read-only `bridge analyze`, both apps: mac 0 errors/95 warnings, droid 0 errors/124 warnings —
unchanged from M8-P's own last recorded numbers, confirming nothing analyzer-facing drifted. Continuum's
own tree: clean (`git status --short`, 0 lines) both before and after this investigation's own
disposable whatif measurement (deleted, never committed).

## 3. Real-site forensics — traced independently, not assumed to share a cause

**`_env`** (`apps/macos/mac/lib/pages/pairing_page.dart:38`, `PairingEnvironment? _env;`) — an ordinary,
nullable instance field of `_PairingPageState`, assigned once in `_bootstrap()` (`_env = env;`, a bare
assignment, not inside `setState`), read from many places including **directly in the render tree**
(`_env == null ? null : _openSettings`, line 535) and inside several ordinary instance methods.
Confirmed: its target (`b9bd6988577939f0`, a real `sig.Signal`) **is** present in `PairingPage`'s own
`ui.Component.localSignals` (26-entry list, directly verified) — `declareLocalSignals` unconditionally
declares every field in that list, so `_env`'s own render-tree read resolves correctly, on its own
terms, independent of anything this milestone investigated.

**`_announceRevocation`** (`pairing_page.dart:356`, `void _announceRevocation() { ... }`) — an ordinary
instance method, a real `sig.Action` by M8-H's own mechanism (every instance method becomes one). Its
**only** call site is inside `_forget`'s own body (`pairing_page.dart:339`,
`Future<void> _forget(PairedDeviceRecord device) async { _announceRevocation(); ... }`).

**`_forget` itself** — confirmed by direct search — has **exactly one** reference in the whole file:
`onForget: _forget` (line 404), a named argument passed to `SettingsPage(...)`, constructed inside
`Navigator.of(context).push(MaterialPageRoute<void>(builder: (context) => SettingsPage(...)))` inside
`_openSettings()`. **Not a lifecycle method, not an effect, not a plain render-tree call — a callback
forwarded across a route boundary.**

Answering §4's explicit questions:

- **A.** Yes, `_announceRevocation` is a `sig.Action`.
- **B.** M8-O's own `referencedActions` is not "not enough" — it is not reached at all for this action
  from `PairingPage`'s own generation, because `PairingPage`'s own render tree and its own action bodies
  never literally contain a reference to `_forget` (§5 proves exactly where it does live).
- **C.** `_env` is an ordinary component-scoped `sig.Signal` (M7-F/ADR-4's own model) — not a store, not a
  local, not a parameter.
- **D.** Independent of `_announceRevocation`'s own failure in cause, but not in *mechanism* — both are
  symptoms of the same structural fact (§5), reached through the same rewritten reference.
- **E.** Neither declaration ever disappears from the UIR — both are real, present, targeted, confirmed
  live in the normalized document.
- **F.** No, the target survives normalization intact — traced directly, byte-identical id before and
  after `bridge normalize`.
- **G.** Neither a reachability problem in `referencedActions`'s own sense (M8-O's mechanism is proven
  still correct, §9), nor a scope-population bug, nor an extraction problem. It is a **cross-component
  reference problem**, created by N11's own promotion/rewrite step (§5, §6).

## 4. Minimal reduction — real Dart, isolates the exact mechanism

Real fixture (`fixtures/apps/m8q_probe/`, temporary, deleted after evidence extraction) reproduces both
symptoms exactly, minimally:

```dart
class _HomeScreenState extends State<HomeScreen> {
  Env? _env;
  @override
  void initState() { super.initState(); _env = const Env(); }
  @override
  void dispose() { if (_env != null) { _log = 1; } super.dispose(); }   // C/D/F/G controls
  void _announce() { if (_env != null) { _log = 2; } }                   // = _announceRevocation
  Future<void> _forget() async { _announce(); if (_env != null) { _log = 3; } }
  void _openDetail() =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (context) => Detail(onForget: _forget)));
  @override
  Widget build(BuildContext context) =>
      ElevatedButton(onPressed: _env == null ? null : _openDetail, child: Text('$_log'));  // U control
}
```

Real `bridge build`: **exactly** `_announce` and `_env` report `BRG3006` — nothing else. `dispose()`'s
and `initState()`'s own bodies (rungs C/D/F/G, `sig.Effect`) produce **zero** diagnostics of their own —
not success, not failure, simply never visited (§7). Rung U (the direct render-tree read) produces no
diagnostic either — it resolves fine, on its own, exactly as §3 predicted from the real source alone.

## 5. Exact loss point — traced to the precise UIR field, not inferred

`_forget`'s own `sig.Action.body`, inspected directly: `[{ kind: 'logic.Navigate', action: 'push',
transition: 'ae96a52a...' }]` — **the `Detail(onForget: _forget)` construction, and the reference to
`_forget` inside it, is not present here at all.** The `app.RouteTransition` node itself carries no
`arguments` field either. Searching the *entire* normalized document for a `logic.Ref{name: '_forget'}`
finds exactly one, and it is **inside `Detail`'s own `ui.Component.render` tree** —
`.render.props.onPressed.expr`, a `logic.Ref{name: '_forget', target: <the real HomeScreen _forget
action's own id>}`. `Detail`'s own generated component (a different component than `HomeScreen`) reads
`widget.onForget` and finds, structurally, a direct reference to `_forget` — a `sig.Action` declared on
an entirely different `State` class.

## 6. Root cause — N11's own cross-route rewrite, confirmed at its own source

`n11_promote_cross_route_state.ts`'s own header comment states the exact mechanism, unprompted:
*"A promoted argument that satisfies a required destination-component parameter... a `bind.Param` read
of it inside that component's own render tree is rewritten to read the promoted store directly
(`bind.Signal`, or a `logic.Ref` at the promoted action)."* This is ADR-11's own cross-route-state-
promotion machinery (amended M7-E3), doing exactly what it is designed to do: when a callback argument
forwarded across a route boundary resolves to a real `sig.Action`, N11 rewrites the *destination*
component's own read of it to point directly at that action — by NodeId, correctly, no name matching
anywhere in this mechanism. What it does **not** do is verify, or provide any way to satisfy, the
promoted/rewritten action's **own further dependencies** — `_forget` itself reads `_env` (a signal it
does not write, so outside `writes`, the only set N11's own promotion tracks) and calls `_announce`
(a whole separate action, likewise untracked by `writes`). Once the reference lives inside `Detail`'s own
render tree, `Detail`'s own `declareLocalActions`/M8-O's own transitive walk correctly discovers
`_forget`, correctly discovers `_announce` transitively from *its* body (M8-O working exactly as
designed, §9) — and then correctly, honestly fails to resolve `_env`/`_announce` from `Detail`'s own
scope, because they are `HomeScreen`'s own local state, not `Detail`'s.

**This is the single, shared root cause of both real symptoms.** Not effect/lifecycle reachability —
M8-P's own named hypothesis — which this milestone's own evidence (§4, §7) directly contradicts.

## 7. `sig.Effect` — a real, separate, unrelated finding

`grep -rln "sig.Effect" packages/generators/react/src/` returns **nothing**. The React generator has no
code path for `sig.Effect` anywhere — `initState`/`dispose` bodies are not walked, not attempted, and
produce no diagnostic of their own, confirmed directly by the minimal fixture (§4): `dispose()`'s own
`_log = 1;` assignment, and `initState()`'s own `_env = const Env();`, are silently absent from every
generated component, with nothing telling an author so. This is real, and worth naming precisely — but
it did not cause either of M8-P's own named symptoms (§4's controls prove this directly: removing the
lifecycle bodies from consideration entirely, the `_announce`/`_env` failures persist unchanged, sourced
from the route-boundary path alone), and building lifecycle/effect lowering (React's own `useEffect`
semantics, cleanup functions, dependency arrays) is a genuinely new capability, not a reachability fix —
explicitly out of this milestone's own scope ("no broad lifecycle architecture changes").

## 8. Reachability graph audit — M8-O's own mechanism, re-verified, still correct

`referencedActions`'s current model, read in full again this milestone: `roots = render only`, exactly
as M8-O left it, with a fixed-point walk over each newly-discovered action's own body. This milestone
adds no evidence that this model is wrong **for what it is scoped to** — every root it is asked to
resolve (a render tree, or an already-discovered action's own body) it resolves correctly, cycle-safe,
deterministic, by NodeId only (§9's own re-confirmation). The gap this milestone found is **upstream** of
`referencedActions` entirely: which document `_forget`'s own reference structurally lives in is decided
by N11, before the generator's own per-component `referencedActions` call ever runs. "Roots = render +
effects" (M8-P's own implied fix shape) would not have helped either symptom — neither is reached through
an effect at all.

## 9. M8-O regression check — explicitly verified, not assumed

The minimal fixture's own evidence is itself the regression proof: `_openDetail` (direct, render-
referenced) is correctly discovered and emitted; `_forget` and `_announce`, once structurally present in
`Detail`'s own render tree (via N11's rewrite, not via any change this milestone made), are correctly,
transitively discovered by the *same*, *unmodified* `referencedActions` fixed-point walk — confirmed by
the fact that **both** fail with the identical, honest "not declared" message, for the identical,
correct reason (their own dependencies are not in `Detail`'s scope) — not a crash, not a silent drop, not
a duplicate emission. M8-O's own cycle/dedup/determinism guarantees are untouched by anything this
milestone found, because nothing here required changing `referencedActions` at all.

## 10. Identity requirement

Every reference traced this milestone — `_forget`'s own, `_announce`'s own, `_env`'s own — carries a
real, sound `target`, confirmed live, matching or exceeding the requirement §7 of the task sets. **The
gap is not an identity gap.** N11's own rewrite is itself identity-based (it resolves the promoted
action's real `NodeId`, never a name) — the problem is what happens *after* a sound, correctly-identified
reference is relocated into a scope that cannot satisfy its own further, equally sound references.

## 11. Fix candidates — evaluated, all rejected for the same underlying reason

- **Option A/B (additional discovery roots, or a generalized executable-root helper):** does not apply.
  Neither symptom is reached through an effect or any other execution root `referencedActions` does not
  already walk (render, and transitively, action bodies) — the reference lives in `Detail`'s own render
  tree, which **is** already a root. Adding effect roots would fix nothing here (§8's own conclusion,
  proven by the minimal fixture's controls).
- **Option C (emit every action unconditionally):** would hide the real problem rather than solve it —
  `_forget`'s body would still reference `_env`/`_announce`, which still would not exist in `Detail`'s
  scope; this trades an honest `BRG3006` for a program that does not compile, or, worse, one that
  compiles and is silently wrong if a name happened to collide. Rejected outright, and explicitly
  forbidden by the milestone's own instructions regardless.
- **Option D (effect-local scope injection):** does not apply — the failing occurrences are not inside
  any effect (§4's own controls).
- **The one candidate that would actually address the root cause** — making N11's own promotion also
  carry (or refuse to promote/rewrite when it cannot carry) an action's own transitive dependencies —
  is squarely inside N11's own cross-route-state-promotion architecture, the exact "parameter/N5/N11
  forwarding architecture" this milestone's own hard exclusions name. Not evaluated further as an
  implementation option this milestone; recorded as the real, correctly-owned next step (§17).

## 12. Implementation gate

Per §9's ten conditions:

1. Failure reproduced — yes (§4).
2. Declaration identity sound — yes (§10).
3. Normalization preserves identity — yes (§3.F).
4. Exact generator loss point proven — yes, but **it is not a generator loss point** (§6) — the
   generator faithfully emits what N11 hands it; the loss is upstream.
5. **Fix can remain entirely identity-based — moot; there is no generator-side fix this milestone's own
   evidence supports, identity-based or otherwise, because the generator is not where the defect is.**
6. No schema change required — true, but irrelevant to whether to implement here.
7. No ADR-level decision required — **false in spirit**: correctly handling a promoted/rewritten
   action's own transitive dependencies is exactly the kind of decision ADR-11/M7-E3 already made
   deliberately narrow (*"promote the signals that action writes... and the action itself"* — reads and
   further calls were never in scope for that pass, by design, not by oversight).
8. Existing unreachable-action behavior remains correct — true, unaffected, nothing here changes it.
9. M8-O transitive behavior remains correct — confirmed (§9).
10. **Fix does not require broad architecture changes — false.** The real fix lives inside N11's own
    forwarding architecture, explicitly excluded from this milestone.

**Conditions 4/5/7/10 fail. GATE: FAIL.** Per the task's own instruction: STOP implementation; produce
this docs-only report.

## 13. Reduction-ladder results (summary; full detail in §3–§4)

| Rung | Shape | Result |
|---|---|---|
| A | render → action | unaffected, already correct (M8-O) |
| B | render → A → B | unaffected, already correct (M8-O) |
| C/D | effect → action(s) | **not the cause** — `sig.Effect` bodies are never walked at all (§7), unrelated to either real symptom |
| E | effect → signal read | same as C/D — never walked |
| F | effect → ordinary field read | same as C/D — never walked |
| G | effect → local variable | not separately fixtured — subsumed by C/D's own finding (nothing inside any effect is ever reached) |
| H | effect → top-level `FieldDecl` | not separately fixtured — same reasoning |
| I | effect → top-level `FunctionDecl` | not separately fixtured — same reasoning |
| J | effect → write-nothing action | not separately fixtured — same reasoning |
| K | effect → async action | not separately fixtured — same reasoning |
| L | effect → parameterized action | not separately fixtured — same reasoning |
| M | action reachable both render and effect | not separately fixtured — moot, given C/D's own finding |
| N | effect → action cycle | not separately fixtured — moot |
| O | completely unreachable action | unaffected, already correct (M8-O) — not touched by anything this milestone found |
| **route-boundary action forward (the real shape)** | render → action A → *(N11 rewrite)* → destination component's own render tree → action B (A's callee) → B's own dependencies | **the actual, proven cause of both real symptoms** |

## 14. Schema / ADR

**No schema change required or proposed.** **No ADR authored** — the correct next step (§17) is itself
an investigation into whether ADR-11's own scope should be revisited, not a decision this milestone is
positioned to make.

## 15. Implementation

**None.** No Dart, TypeScript, schema, or ADR file was changed. The temporary probe fixture
(`fixtures/apps/m8q_probe/`) was deleted after evidence extraction; the disposable Continuum whatif copy
used for real-corpus tracing was deleted, never committed; Continuum's own tree confirmed clean (`git
status --short`, 0 lines) both before and after.

## 16. Diagnostic classification

Unchanged, correctly: `_announceRevocation` and `_env` both still report `BRG3006`
("not declared in this program"). This milestone confirms the message is **honest** for this specific
cause, unlike M8-L's/M8-P's own findings (a targeted `FunctionDecl`/`FieldDecl` reference misreported as
absent when the declaration genuinely existed and was resolvable *in the scope the generator was asking
from*) — here, `_env`/`_announce`'s declarations exist, but are **not** resolvable from `Detail`'s own
scope, which is a materially different, and correct, situation: there is no honest "unsupported
capability" framing available, because the underlying capability (reading another component's own
private state from inside a different component) is not something any generator should ever support —
it would be semantically wrong, not merely unimplemented. `BRG3006`'s own wording is imprecise here (it
was written for the "genuinely absent" case), but weakening or reclassifying it was not attempted, since
doing so without ALSO fixing N11's own promotion boundary would just relabel a correct refusal, which
this milestone's own instructions forbid ("do not fake support or silence diagnostics").

## 17. Real Continuum results — unchanged, by design

No code changed, so no diagnostic moved. Fresh analyze (§2) confirms nothing drifted. The real-corpus
whatif trace (§3, disposable, deleted) confirms the mechanism found in the minimal fixture (§4–§6) is
exactly what real Continuum exhibits — `_announceRevocation`'s and `_env`'s flagged occurrences both
live inside `SettingsPage`'s own render/action tree (the real analogue of `Detail`), reached via the
`onForget: _forget`-shaped route-boundary rewrite, not via any lifecycle method. `BRG3006`/`BRG3013`
counts are identical to M8-P's own last recorded numbers (mac 17/9, droid 18/9) — no regression, no
improvement, exactly as expected for a docs-only milestone.

## 18. Regression matrix

No code changed. Explicitly re-confirmed, not merely assumed unaffected: `pnpm --filter @bridge/gen-react
test`: 254/254 (21 files, M7-N/M8-D/M8-F/M8-H/M8-J/M8-L/M8-N/M8-O/M8-P's own suites all included,
unmodified, all passing). M8-N's `local_variables` and M8-O's `transitive_actions` fixtures were not
re-validated this milestone specifically (no reason to, given zero code changed since M8-P's own last
validation of both) — their own test suites, run as part of the full 254, confirm nothing regressed.

## 19. Hard exclusions

None of the excluded items were implemented. `_env`'s own root cause (§6) was traced directly into
"parameter/N5/N11 forwarding architecture" — one of the milestone's own explicitly named exclusions —
and left untouched, precisely as instructed: *"If investigation proves `_env` belongs to one of these
categories, document it and leave it untouched."*

## 20. Validation

No production code changed, so `just ci`/`just determinism` were not re-run as a distinct validation
step for this milestone's own (nonexistent) diff — the checkpoint's own `just ci` (green, confirmed at
the `b336185` commit) already covers the exact tree state this milestone leaves behind. `pnpm --filter
@bridge/gen-react test` was re-run directly (§1, §18) as the narrowest sufficient confirmation that
nothing was silently left broken by this milestone's own (exploratory-only) fixture work. `git diff
--check`: clean, empty diff.

## 21. Silent wrong-code findings

One, found and explicitly *not* worked around: had this milestone implemented Option C (emit every
action unconditionally) or any name-based fallback to "solve" the missing scope, it would have produced
exactly the silently-wrong-code class of defect these milestones exist to prevent — a generated
`Detail`/`SettingsPage` component that compiles but reads a variable that does not exist in its own
scope, or, worse, one that a naive name-based resolver accidentally binds to an unrelated same-named
local. Not attempted. `sig.Effect`'s own silent absence (§7) is itself worth flagging as a standing risk
class (an author's `initState`/`dispose` logic disappears with no diagnostic at all) — real, but not
newly introduced by anything here, and not fixed here either.

## 22. Remaining blocker graph

1. **N11's own promotion boundary does not account for a promoted/rewritten action's own further
   dependencies** (§6, §11) — the actual, now-precisely-located root cause of both real symptoms this
   milestone was asked to investigate. Squarely "parameter/N5/N11 forwarding architecture."
2. **`sig.Effect` has zero generator lowering** (§7) — real, separate, silent (no diagnostic at all).
   A genuinely new capability, not a reachability fix.
3. Module-emission architecture for a top-level declaration (M8-P §8) — untouched.
4. `_log`'s own third-party-class blocker; `protocolVersion`'s own route-boundary blocker (M8-P) —
   untouched, and now understood to be a close relative of *this* milestone's own finding (both are
   route-boundary-argument shapes N11 owns).
5. Parameter/N5/N11 interaction generally (M8-N §10) — this milestone's own finding is a concrete,
   real instance of exactly this already-named, already-deferred question.
6. Catch-clause parameter identity (M8-O §22) — untouched.
7. `BRG1302`/switch-expression extraction/`FunctionDecl` full lowering — untouched.

## 23. Exact recommendation for M8-R

**Do not implement a generator-side fix for either `_announceRevocation` or `_env`.** The real next step
is an investigation — not yet an implementation — into ADR-11/N11's own promotion scope: whether "promote
the signals an action writes, and the action itself" should be extended to also require (or verify) that
the promoted action's own further reads and calls are either (a) already promotable by the same
consensus, (b) refused explicitly with a *correctly-owned* diagnostic naming N11 as the blocker (rather
than the generator's own generic `BRG3006`), or (c) provably self-contained. This is real ADR-11-adjacent
architectural work, not a bounded generator patch — recommend scoping the next milestone explicitly as an
N11/compiler-side investigation, not another generator-reachability audit, since this milestone's own
evidence shows the generator side is already correct and has nothing further to prove.

`sig.Effect` lowering (§7) is a second, independent, real candidate — larger in scope (genuine new
`useEffect`-shaped capability), with a real, if silent, correctness gap (no diagnostic at all, an
author's lifecycle logic simply vanishes) — worth its own separately-scoped milestone if lifecycle
methods become a priority, but not smaller or more bounded than the N11 investigation above.
