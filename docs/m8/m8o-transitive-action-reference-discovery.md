# M8-O — Transitive action reference discovery

**Date:** 2026-08-22. **Baseline:** `a62dc8f` (== `origin/main`, clean tree, confirmed before any
change). **Type:** generator fix, implemented. M8-N's own hypothesis is **confirmed**, exactly as
stated, by direct source reading before a single fixture was built, then proven end to end through the
real pipeline: `referencedActions` seeds only from `component['render']` and never walks a discovered
action's own body, so an action referenced only from another action is a real, correctly-identified
`sig.Action` the generator simply never looked for.

## Headline finding

The hypothesis was right on every count the milestone asked it to prove: identity was never the problem
(extraction, symbols, and normalization all already worked); the loss was entirely in one generator
function's traversal root. The fix is a fixed-point walk added to that one function, owned entirely by
the generator, touching no schema, no analyzer, no compiler pass, no ADR. Real Continuum evidence
confirms it resolves a real site (`_load`) in both apps — but also, correctly and expectedly, surfaces
two *different*, already-known, out-of-scope gaps (a top-level logger variable, a catch-clause parameter)
for code that discovery now reaches for the first time. Net `BRG3006` count moves by +1 in both apps,
not down — and that is the **correct** outcome, not a regression: this milestone's own semantic boundary
(discovery only, never rewriting what a body means) explicitly anticipates that reaching more code
surfaces more of what was already true about it.

## 1. Checkpoint

```
git fetch origin && git checkout main
git status --short        → (clean)
git rev-parse HEAD          → a62dc8f2de3f2cf5324772ff46e023d2fd4c3323
git rev-parse origin/main   → a62dc8f2de3f2cf5324772ff46e023d2fd4c3323
```
`pnpm --filter @bridge/gen-react test`: 228/228 (18 files), fresh baseline.

## 2. Minimal reproduction

Real fixture (deleted after evidence extraction, then rebuilt as the permanent one, §14):

```dart
class _ExampleState extends State<Example> {
  void inner() { setState(() { count++; }); }
  void outer() { inner(); }
  @override
  Widget build(BuildContext context) =>
      ElevatedButton(onPressed: outer, child: Text('$count'));
}
```

Real `bridge build` (analyze → normalize → generate), before any code change:

```
BRG3006  `inner` is not declared in this program, so there is nothing to emit for it. …
```

## 3. Raw UIR action graph

```json
{ "id": "28426d4633517b0a", "kind": "sig.Action",   // outer
  "body": [{ "expr": { "kind": "logic.Call",
    "callee": { "kind": "logic.Ref", "name": "inner", "target": "c0e7f3421aec657b" } } }] }
{ "id": "c0e7f3421aec657b", "kind": "sig.Action", "writes": ["462c22813a6e146f"] }  // inner
```

`outer`'s call to `inner` carries `target: "c0e7f3421aec657b"` — **exactly** `inner`'s own declared id.

## 4. Normalized action graph

`bridge normalize`: `9 nodes in, 9 nodes out, passes that changed the program: none`. N5 has nothing to
lift here (`outer`/`inner` are already named `sig.Action`s from M8-H's own mechanism, never inline
`logic.Lambda`s) — the target survives byte-identical.

## 5. Target identity result

Sound, at every stage measured: real element resolution at extraction (M8-H's own action-naming pass,
unrelated to this milestone), a real symbol-derived id, a real `target`, unchanged by normalization.
Answering Phase 4 directly:

1. Both actions already extracted — yes.
2. Action ids declaration-safe — yes (symbol-derived, `Symbols.action`, unrelated to M8-N).
3. References already targeted — yes.
4. Target survives normalization — yes, byte-identical.
5. N5 alters these references — no; nothing here is an inline closure.
6. Failure entirely generator-side — **yes**, confirmed by source reading (§6) before any fixture ran.
7. M8-N local identity interacts — no; `local:`/`act:` symbols are disjoint namespaces, and this
   fixture's actions declare no locals. (Continuum's own real sites, §14, do mix the two — `_load`'s
   discovery is orthogonal to any local inside it, confirmed by the diagnostics that moved being about
   an unrelated top-level variable and a catch parameter, never a plain local.)

## 6. Exact loss point — `referencedActions`'s prior algorithm

`packages/generators/react/src/internal/emit/component.ts`, read in full before any change:

- Two call sites, both passing **`component['render']`** — `declareLocalActions` (line 588, decides
  which actions get emitted as closures) and `componentReaches` (line 203, decides whether to hoist
  `useRouter()`/`useMounted()`).
- A single non-recursive walk (`visit`): for every `logic.Ref{target}` found anywhere in the tree, if
  the target resolves (`scope.node`) to a `sig.Action` and nothing else already names it
  (`scope.localName(target) === undefined`, guarding against a store's own action), add it.
- **Never walks an action's own `body`.** An action discovered by this walk is added to the result set,
  but its body is never itself searched for further action references.
- Deduplicates by `NodeId` in a `Set` — never by name; already correct on this count.
- Deterministic: results sorted by id string before returning.
- No cycle protection existed, because none was needed — the walk is one level deep by construction, so
  a cycle *between actions* could never be reached in the first place.
- `componentReaches` already, independently, extended one level further for its own purpose (checking a
  directly-referenced action's own body for a `logic.Navigate`/`logic.Intrinsic`) — but this was its own,
  separate, one-level-only extension (M7-H), not a general transitive-discovery mechanism, and it shared
  the same blind spot for anything two hops away.

## 7. Reduction ladder — real Dart, every rung

Built as one comprehensive real fixture (`fixtures/apps/transitive_actions`, §14). All raw ids/targets
confirmed directly from `bridge analyze` output before implementation; all generated-output rows
confirmed directly from `bridge build` output after.

| Rung | Shape | Raw target result | Before (generator) | After (generator) |
|---|---|---|---|---|
| A | render → A | targeted, real | emits A | unchanged |
| B | render → A → B | B's ref targets B's own id | `BRG3006` on B | **A and B both emitted** |
| C | render → A2 → B2 → C2 | chained targets, each correct | `BRG3006` on B2, C2 | **all three emitted, chained calls** |
| D | render → A3 → {B3, C3} | two distinct targets in one body | `BRG3006` on B3, C3 | **both discovered, `a3` calls both** |
| E | (= C, D combined in one owner) | — | — | — |
| F | A4 → A4 (self) | `target == A4's own id` | A4 itself was directly referenced, so it emitted, but recursed into an undeclared self before this fix would have applied to a *transitive*-only self-cycle; the transitive walk's own cycle-safety is what's being proven here, and it holds | **exactly one declaration, self-calling, no infinite walk** |
| G | A4b → B4b → A4b (mutual) | cross-targeting, both directions | `BRG3006` on B4b (only A4b directly referenced) | **both emitted, exactly once each, cross-calling correctly** |
| H | two owners, action name `b` in each | distinct ids, distinct targets (already true pre-M8-O, an existing-mechanism check) | unaffected either way — confirms no name-based cross-talk | unaffected — confirmed no collision |
| I | A5 → B5(int) | parameterized call, target correct | `BRG3006` on B5 | **B5 emitted with its typed parameter, called with the literal argument** |
| J | A6 → B6 (async) | target correct, `isAsync: true` on B6 | `BRG3006` on B6 | **B6 emitted `async`, isAsync preserved** |
| K | A7 → B7 (write-nothing, M8-H domain) | target correct, `writes` absent | `BRG3006` on B7 | **B7 emitted with no fabricated write** |
| L | render → A8 → B8, **and** render → B8 directly | B8 referenced twice, one target | `BRG3006` on B8 (direct ref alone still resolved once, but the transitive edge was separately broken before this) | **B8 declared exactly once, both call sites reference the same declaration** |
| M | `unused` — reachable from nothing | no reference to it anywhere | correctly absent (already true — nothing changed the "must reach something" rule) | **still correctly absent** — this milestone did not turn "reachable" into "declared in the component" |
| N | action ref inside `if`/nested closure/local expression | already-representable grammar (M7-H/M8-H's own domains) | not separately fixtured — the whole ladder above already exercises `if`-guarded bodies (F, G) | unaffected — the existing statement/expression emitters handle these unconditionally on what's inside them, exactly as before |

## 8. Reduction ladder — cycle behavior, explicitly

Both F (self) and G (mutual) confirmed, from real generated TypeScript (§14): exactly one `const
handle_X = ...` per action, regardless of how many times it is called or by how many other actions.
`found` is a `Set<NodeId>`; a candidate already in it is never re-queued for its own body to be walked
again — cycle-safety falls out of the data structure, with no separate "visited" state to keep in sync.
A declaration/caller-order-reversal test (`transitive_action_reference.test.ts`, synthetic UIR,
forward-declared vs. reverse-declared identical program) confirms byte-identical generated output either
way.

## 9. Unreferenced-action behavior

Confirmed negative, both via the real fixture (`unused`, never emitted, §14) and a synthetic unit test —
an action reachable from nothing is never declared. This milestone does not change "reachable" into
"emit everything in the component."

## 10. Multiple owners / collision safety

Confirmed via real Dart (`_ExampleState.a`/`.b` and `_SecondScreenState.a`/`.b`, identically named,
same-shaped bodies, different classes): distinct symbols, distinct ids, distinct `target`s — the
*existing* owner-qualified symbol scheme (`Symbols.action`, unrelated to this milestone) already
guarantees this; M8-O's own discovery mechanism adds nothing that could compromise it, since it resolves
exclusively by `NodeId`, never by the `name` field a `logic.Ref` also happens to carry.

## 11. Parameterized actions

Already fully supported by the existing action-call representation (rung I) — `logic.Call` with typed
arguments, `sig.Action.params` on the declaration — confirmed unconditionally correct once B5 became
discoverable; no separate call-lowering problem found or touched.

## 12. Async / write-nothing actions

Both confirmed unaffected in kind, only in reachability (rungs J, K): `isAsync` carried through
unconditionally by the existing emission code (`declareLocalActions`'s own `action['isAsync'] === true`
check, untouched); a write-nothing action (M8-H's own domain) emits with no fabricated `.set(...)` call,
exactly as it already does for a directly-referenced one.

## 13. N5 interaction

**None, and this fixture is real, direct evidence, not merely an assumption.** `bridge normalize` on
`transitive_actions` reports `passes that changed the program: none` — every action in this fixture is
already a named `sig.Action` (M8-H's own naming mechanism, run at extraction, before N5 ever sees the
document), never an inline `bind.Expr(logic.Lambda)` N5 would lift. N5's own job — giving an *unnamed*
closure a name — is orthogonal to this milestone's own job — discovering *already-named* actions another
already-named action calls. No compiler semantic change was required or considered further; the gate's
own condition 9 (§16) is satisfied by direct evidence, not by absence of a fixture that would have shown
otherwise.

## 14. Real build-proof fixture

Committed: `fixtures/apps/transitive_actions/` (+ `fixtures/uir/transitive_actions.ndjson`, the raw
analyzer golden). Covers rungs A, B, C, D, F, G, I, J, K, L, M in one real, `flutter analyze`-clean app.
Real `bridge build`: **0 errors**, 11 files emitted (only the pre-existing, unrelated `BRG3002`
no-design-tokens warning). Inspected the generated `example.tsx` directly — every claim in §7's table is
read off real generated TypeScript, not inferred:

```ts
const handle_9d87759d = () => {              // a4, self-cycle
  if ((count.get() > 1000)) { handle_9d87759d(); }
  count.set(count.peek() + 1);
};
const handle_026190a7 = () => {               // a4b, mutual cycle
  if ((count.get() < 1000)) { handle_1d7fc331(); }
};
const handle_1d7fc331 = () => {               // b4b
  count.set(count.peek() + 1);
  if ((count.get() < 1000)) { handle_026190a7(); }
};
const handle_45f1e1e4 = () => {               // b8 — declared once
  count.set(count.peek() + 1);
};
// ...onPressed={handle_45f1e1e4} directly, and handle_71ab6da0 (a8) also calls handle_45f1e1e4() —
// one declaration, two call sites.
```
`unused` (resets `count` to `0`) never appears — no `count.set(0)` anywhere in the file.

Two committed test files: `transitive_action_reference.test.ts` (9 synthetic-UIR unit tests — precise,
isolated identity assertions: direct, one-hop, fan-out, self-cycle, mutual cycle, direct+transitive
dedup, unreferenced absence, cross-owner collision safety, order-reversal determinism) and
`transitive_actions_build.test.ts` (10 tests against the real, committed fixture, including a real `tsc`
build-proof). `pnpm --filter @bridge/gen-react test`: 247/247 (228 + 19 new), 0 regressions.

## 15. Architecture decision

Matches Phase 6's own conceptual sketch closely, verified against the actual codebase before adopting it
rather than copied blind: `referencedActions` itself becomes the fixed-point primitive (not a wrapper
around it), because it is the single function both consumers (`declareLocalActions`,
`componentReaches`) already share — fixing it once fixes both, including `componentReaches`'s own,
previously one-level-only reach for `useRouter()`/`useMounted()` hoisting, a second, real consequence
this investigation found beyond the milestone's own named hypothesis. Implementation:

- `directActionRefs(value, scope, found)` — the *exact* single-level walk `referencedActions` used to
  *be*, factored out so it can be called once for the render tree and again for each newly-discovered
  action's own body, writing into a shared `Set<NodeId>` rather than returning a fresh one.
- `referencedActions(tree, scope)` — seeds `found` from the tree (unchanged behavior for a program with
  no action-to-action edges), then a `while (queue.length > 0)` loop: each pass walks only the ids the
  *previous* pass discovered, diffs against `found` to find genuinely new ones, and queues those for the
  next pass. Terminates because `found` only grows and the program has finitely many actions; a cycle
  falls out of the `Set` semantics, not a separately-maintained visited flag.
- Sorted, `NodeId`-only, at the very end — unchanged return contract, so nothing downstream of
  `referencedActions` needed to change.

**No schema change, no analyzer change, no compiler/N-pass change.** Confirmed by the final diff: one
generator file, plus the test/fixture additions.

## 16. Implementation gate

Per Phase 15's ten conditions, all confirmed true by direct evidence (§3–§13), not assumed:

1. Referenced action already exists as `sig.Action` — yes.
2. Reference already has a valid target — yes.
3. Target survives normalization — yes.
4. Action body itself within existing supported semantics — yes, for every rung this milestone measured
   (§7); genuinely unsupported bodies remain genuinely refused (§17, `_log`/`e` in real Continuum).
5. Failure is specifically non-recursive discovery — yes, confirmed by source reading before any fixture.
6. `NodeId`-based traversal sufficient — yes, no name matching anywhere in the fix.
7. No schema change required — confirmed.
8. No ADR-level semantic decision required — confirmed; this is reachability, not a new identity or
   promotion model.
9. N5 requires no new semantic model — confirmed directly (§13), not merely assumed absent.
10. Deterministic output preserved — confirmed (§8's reversal test, plus the unchanged final `sort()`).

**GATE: PASS.** Implemented.

## 17. Real Continuum results

Read-only analyze, both apps, unchanged (mac: 0 errors/95 warnings; droid: 0 errors/124 warnings) —
confirms nothing analyzer-facing drifted. Disposable whatif copies (mac + droid, same established
method, deleted after measurement; Continuum's own tree confirmed clean before and after, and unrelated
to this milestone's own work — the real Continuum repository received an independent commit from its own
maintainer during this investigation, confirmed via `git log`, and nothing here touched or was affected
by it beyond one incidental, reverted `.bridge/uir.ndjson` regeneration from a read-only `analyze` call):

| | mac before | mac after | droid before | droid after |
|---|---:|---:|---:|---:|
| `BRG3006` | 17 | 18 | 18 | 19 |
| total errors | 41 | 42 | 46 | 47 |
| `BRG3013` | 8 | 8 | 8 | 8 |
| files emitted | 0 | 0 | 0 | 0 |

**Do not read this as a regression — it is not one, and the milestone's own instruction ("classify only
sites proven by target identity") is exactly what this table's own diff (below) does.** In each app,
diffing the actual `BRG3006` messages before/after:

- **One real site resolves**: `_load` (`packages/ui-kit/lib/src/settings_page.dart`'s `SettingsPage`) —
  reachable via `_confirmForget() → _load()`, an action-to-action edge exactly like this milestone's own
  fixture rung B, now correctly discovered and emitted in both apps.
- **Two new, honest diagnostics surface** — for code that discovery now reaches for the first time, not
  because of anything wrong with this milestone's own fix:
  - `_log` — a real, pre-existing gap (M8-L §10.11 / M8-N §10: a top-level `FieldDecl`/const/variable
    target is not generator-lowerable) — `final _log = Logger('Pairing');` in `pairing_page.dart`, read
    inside `_announceRevocation`, which becomes reachable only once `_exportLogs`'s own further reach
    surfaces it.
  - `e` — a catch-clause parameter (`on Object catch (e)` in `_exportLogs`) — deliberately excluded from
    ADR-28's own local-variable identity work (M8-N §17: "a `for`-loop-declared variable or a `catch`
    clause binding... neither is numbered here"), correctly still refused once the action containing it
    becomes reachable.

**Both are already-classified, out-of-scope gaps this milestone explicitly must not touch** — confirmed,
not assumed, by tracing each site to its real source line. `files emitted` remains `0/0` in both apps —
`BRG2301`/`BRG2303`/`BRG3001`/`BRG3002`/`BRG3004`/`BRG3008` remain independent, untouched blockers, as
before.

## 18. Regression evidence

`pnpm --filter @bridge/gen-react test`: 247/247 (228 + 19 new), including unmodified: M7-F's promoted
store consumption tests, M7-N's local store/member identity tests, M8-B's structured-build tests, M8-D's
enum-identity tests, M8-F's cross-package assembly tests, M8-H's write-nothing-action tests (the exact
mechanism rung K's write-nothing transitive action depends on), M8-J's top-level-identity tests, M8-L's
`toplevel_function_reference.test.ts` (`BRG3013` classification, still passing, still never reverting to
`BRG3006`), M8-N's `local_variables_build.test.ts` — explicitly re-run and confirmed producing byte-
identical generated TypeScript to before this milestone (its own fixture has no action-to-action edges,
so `referencedActions`'s new fixed-point loop runs zero extra iterations for it and returns the same set
it always did). `just ci`: exit 0.

## 19. CI / determinism / fixed point

`just ci`: exit 0 (build, typecheck — two pre-existing `string | undefined` strictness errors in the new
test file's own regex-match handling were found and fixed before this run, not shipped — full TS test
suite, `codegen-check` — no-op, no schema changed — `lint`, `lint-negative`, `uir-lint`, `uir-test`,
`analyzer-lint`, `analyzer-test` 312/312 unchanged, `dart-analyze`). `just determinism`: **completed in
full this session** — every one of the five e2e apps (`counter`, `promoted-counter`,
`inline-push-props`, `async-push-guard`, `local-store`), 3 pipeline runs each, byte-identical
uir/normalized/emitted-files hashes across all three runs of each, `exit 0`, "byte-identical across
every run." (An earlier attempt in this same session, run concurrently with other work, was killed by
signal 15 after one partial run — the same documented environmental/resource limitation seen in every
prior session; re-run alone, it completed cleanly, and this is the result reported.) Also run to
completion: `bridge validate` (build + determinism + fixed point) on the new
`fixtures/apps/transitive_actions` fixture — both checks pass (`ok: true`). No test is reported passing
here that did not actually run.

## 20. Silent wrong-code findings

None. The one near-miss this investigation was watching for specifically (per M8-N's own precedent, §13)
— N5 mistakenly treating a newly-reachable action-to-action edge as something it must lift or rewrite —
was checked directly and confirmed not to occur (`normalize` reports zero passes changed for the real
fixture). No diagnostic was weakened to make anything pass; the two newly-surfaced `BRG3006` sites in
Continuum (§17) are exactly as honest and correct as the ones this milestone's own fix resolved — neither
suppressed, neither reworded, neither given a false "fixed" status.

## 21. Remaining blocker graph

1. Top-level `FieldDecl`/const generator lowering (M8-L §10.11, M8-N §10) — now confirmed to have at
   least one additional real site (`_log`) that only became visible because of this milestone's own fix,
   not a new discovery of the gap itself.
2. Parameter/N5/N11 interaction (M8-N §10, §20.1) — untouched.
3. Catch-clause/`for`-loop-variable identity (M8-N §17) — the `e` site confirms this is a real, if
   narrow, adjacent gap with at least one concrete Continuum occurrence now visible.
4. `BRG1302` adjacent-string-literals (M8-K) — untouched.
5. Switch-expression extraction (M8-L §9) — untouched.
6. `BRG2301`/`BRG2303` route-boundary blockers (M8-I) — untouched.
7. `logic.FunctionDecl` full lowering (M8-L) — untouched; unrelated to action discovery.

## 22. Exact recommendation for M8-P

Two candidates surfaced directly by this milestone's own real-Continuum measurement, both smaller and
more concretely evidenced than M8-N's own two open candidates:

1. **Top-level `FieldDecl` generator lowering** (blocker 1) — the sibling fix to M8-L's own `BRG3013`
   reclassification (§10.11 of that milestone: give a targeted `logic.Ref` to a `logic.FieldDecl` the
   same structural `UnsupportedCapability` treatment `logic.FunctionDecl` already got, rather than the
   misleading `BRG3006`), now with a second, real, freshly-confirmed Continuum site (`_log`) in addition
   to M8-J's own `protocolVersion`. Diagnostic-only, in M8-L's own precedented shape, looks like the
   smallest, most directly-evidenced next step.
2. **Catch-clause parameter identity** — a narrower extension of ADR-28's own local-variable model
   (M8-N §17's own named exclusion), with one concrete Continuum site (`e`) now visible. Smaller in
   scope than the parameter/N5/N11 question M8-N left open, and does not share that question's own
   entanglement with N11's promotion model — a catch parameter, like an ordinary local, is genuinely
   only ever readable from within its own lexical scope.

Recommend #1 first: it is the more directly comparable continuation of M8-L's own already-implemented,
already-proven-safe pattern, with concrete evidence this milestone's own measurement — not a guess —
just added.
