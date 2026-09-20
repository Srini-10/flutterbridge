# M11-H — Architectural Frontier Investigation: Persistent Cross-Render Mutable State & Binding Ownership

**Outcome: A3** — a semantically faithful representation of a mutable binding whose identity must survive a
callback (and possibly a rebuild) requires new compiler *and* runtime architecture. Nothing was
implemented. This milestone changed no code, no schema, no test, and no fixture.

Evidence labels used throughout: **[observed]** a live probe (real analyzer → real UIR → real generator),
**[analyzer-proven]** read from the analyzer's own code and confirmed by a probe, **[runtime-executed]** the
real `@bridge/runtime-react` executed in Node, **[source]** read from source only, **[refused]** a
deliberate refusal, **[not run]** not executed.

## 1. Baseline

`HEAD == origin/main == b4c0d96` (M11-G, `fix: refuse a write to a build()-level local instead of
emitting 0++`). The brief names `264f407` as the baseline, but that commit is M11-F; the brief's own rule
("M11-G's final state must be treated as the baseline") selects `b4c0d96`, the commit that introduced
`BRG1311`. Recorded, not silently reconciled.

`git status --porcelain` showed only the deliberately preserved
`fixtures/apps/hello_bridge/analysis_options.yaml` drift. Baseline counts, each run alone with its full log
and exit code captured: `dart test` — 601 passed (exit 0); `pnpm --filter @bridge/gen-react exec vitest
run` — 589 passed, 65 files (exit 0). A first attempt ran both suites concurrently and both reported
failures; that was load-induced and is **not counted**. Both were re-run in isolation and passed.

## 2. Current architecture (as it bears on mutable state)

- **`build()`-level locals** are not declarations. `component_extractor.dart`'s `_structuredBody` takes the
  leading run of single-variable `VariableDeclarationStatement`s and registers each as
  `Binding(binds: Binds.local, inlineValue: initializer)`. `_reference` checks `inlineValue` *before*
  `symbol`, so every read re-extracts the initializer in place. No `logic.VarDecl`, no `symbol`, no
  ordinal is minted for them. There is no `isFinal`/`isConst` check anywhere in that function.
- **`ui.Component.render` has no statement slot.** Its type is the `ui.*` union; `logic.*` statements
  cannot appear in it (M8-M §13 answer 8; schema `l2.json` `Component`).
- **Persistent state has exactly one representation:** `ui.Component.localSignals`, documented in the
  schema as "Component-scoped state — the State fields (Spec §2.3)". It is emitted as
  `const [_x] = useState(() => signal(init)); const _x$ = useSignal(_x);` — created once per mounted
  instance, recreated on remount, never global.
- **Callbacks** that write state are promoted (N5) to `sig.Action` and emitted as `const handle_<id> = …`
  *inside the component function body*, i.e. re-created on every render, before the returned JSX
  (`component.ts` `emitComponent`: `declareLocalSignals` → `declareLocalActions` → `return <…>`).
- **`setState(() {…})`** is spliced open at extraction time (INV-22); no generated construct corresponds to
  "request a rebuild".
- **Re-render trigger.** React re-renders when a `useSignal` snapshot changes. `Signal.set` ignores an
  `Object.is`-equal write (ADR-20 R3, `graph.ts:227`).

## 3. M11-G reproduction

Fresh probes, each a complete project (real `pubspec`, `flutter pub get`, real analyzer, real
`bridge build`). All **[observed]**.

| Probe | Source shape | Result |
|---|---|---|
| R0 | `final base = 7;` read in `onPressed` via `setState(() { _result = base; })` | Analyzer: read site is `logic.Lit 7`. Emitted `_result.set(7);` |
| R1 | `var count = 0; count++; return Text('$count');` (no capture) | **No analyzer diagnostic.** `render` is `ui.Opaque` ("build body with statements"). Generator: `BRG3004`, nothing written |
| R2 | `var base = 7;` read-only in a callback | Byte-identical output to R0 (only ids/names differ) — `final` vs `var` is not distinguished |
| R3 | `count++` inside a callback | `BRG1311`, "the graph was rejected. No output written." |
| R4 | `count = 5` inside a callback | `BRG1311`, same |

**Where the representation changes:** R0/R2 stay `inlineValue` → `_reference` → literal. R3/R4 reach
`_target` (the write-target path shared by `_assignment` and `_incrementDecrement`), where the
`inlineValue` check now refuses. R1 never reaches `_target` at all: the first non-declaration statement
(`count++`) ends the leading-declaration run, `_tail` rejects the body, and the whole render becomes
`ui.Opaque`; the refusal is at the *generator* (`BRG3004`), not the analyzer. M11-G's explanation holds,
with one refinement worth stating: R1 and the build-level write are refused by a different layer and code
than R3/R4.

## 4. Fresh analyzer evidence

**Question: can FlutterBridge reliably identify the same Dart mutable binding from declaration through
nested callback extraction and mutation?**

Two separate mechanisms exist, and the answer differs for each.

1. **Declaration identity — element-keyed, [analyzer-proven].** `Scope._ordinalsOf` (`scope.dart:104`) is a
   `RecursiveAstVisitor` that numbers every `VariableDeclaration` (statement-level or `for` header),
   `catch` binding and `DeclaredIdentifier`, keyed by the resolved `Element`, recursing into nested
   closures. Since M11-D `Scope.forWidgetTree` computes it for the render tree as well. So an ordinal
   *is computable* for a `build()`-level local. `_UsageFinder` also uses `Element` identity across nested
   closures. But `_structuredBody` never calls `_localSymbol`, so no symbol is minted for these locals.
2. **Reference/write resolution — name-keyed lexical `Scope` chain, [analyzer-proven].** `_reference` and
   `_target` call `scope.lookup(name)`. The guard for a write therefore depends on `Scope` modelling Dart's
   lexical rules, not on `Element`.

That second dependency is the risk, so it was attacked directly, aiming at a *false negative* (a write to
the real build-local that resolves to a different binding). Each probe writes a shadowing name in an inner
scope and then writes the real build-local after that scope closes. **[observed]** For every shape below
the analyzer reported exactly one `BRG1311` — on the trailing write to the real build-local — and no
diagnostic on the shadowed inner write:

bare `{}` block · `if` block · `for (var count…)` · `catch (count)` · closure parameter `(int count)` ·
`for (final count in …)` · `switch … case final int count`.

Also **[observed]**: a shadowing local in a sibling callback (`s_outer_write_inner_shadow`) is not
refused while the outer write in another callback is (1 error, at the outer write's line); a write to a
callback *parameter* named like an outer read build-local is not refused; a write after an early `return;`
is still refused (the guard is structural, not flow-sensitive — conservative, safe).

**Answer:** the *same binding* is identifiable for the purpose of refusing a write, by the lexical scope
chain, and that is exercised for seven scope shapes. Element identity for the build-local exists in the
analyzer but is deliberately never converted into a UIR-visible identity. Where identity is *lost*:
at the extraction boundary — `_structuredBody` replaces the declaration with a substitutable expression,
so the UIR contains no node that says "this binding".

## 5. Reduction ladder

All **[observed]** with the real analyzer; generator outcomes noted where the analyzer admitted the shape.

| # | Shape | Result |
|---|---|---|
| R1 | Write in the same `build()` (no capture) | `ui.Opaque` → `BRG3004` (generator) |
| R2 | Captured read (`var` and `final`) | Inlined literal; identical output |
| R3 | Captured write, plain `=` and `++`, `+=` | `BRG1311` |
| R4 | Two callbacks sharing one binding (one writes, one reads) | `BRG1311` (1) |
| R5 | Read-after-write in the same callback | `BRG1311` at the write |
| R6 | Opposing writers (`count++` / `count--`) | `BRG1311` ×2, one per write |
| R7 | Inner local shadowing, mutated | Not refused; outer unaffected (M11-G fixture `mutable_capture`) |
| R8 | Outer write + sibling-callback inner shadow | Exactly 1 `BRG1311`, at the outer write |
| R9 | Callback parameter shadowing an outer read local | Param write not refused; the write target is a `Ref` named `v` with no `target` (parameters are resolved by name in the lambda's own scope; generator output for this shape not inspected) |
| R10 | Nested `setState`-spliced write | `BRG1311` |
| R11 | Write inside vs outside `setState` | Both `BRG1311`; `setState` does not change the answer |
| R12 | State-field comparison | `int _result` → `useState(() => signal(0))`, persistent per instance |
| R13 | Callback surviving a rebuild | Not reachable: the only construct that could observe it (a write) is refused. §8/A reasons about it from observed facts |
| R14 | Repeated build | Same as R13 |
| R15 | Old vs new callback | Same as R13 |
| R16 | Two captured locals, one written | `BRG1311` on the written one only; the other stays inlined |
| R17 | Cross-component: `Child(n: c)` with a read-only `var c` | Admitted; the prop is `logic.Lit 3` — a **value** copy. With a write elsewhere: `BRG1311`. Cross-file adds nothing: a build-local cannot cross a file boundary except as a constructor argument value |
| R18 | Write after an unconditional `return;` | `BRG1311` (not flow-sensitive) |
| R19 | Recursive local function reading a build-local | Local function declaration is `logic.OpaqueStmt`; generator `BRG3004` + `BRG3006` |

Also **[observed]**: a *local function that writes* the build-local (`void inner() { count++; }`) does not
reach `_target` — the declaration is opaque and the generator refuses it. It is safe, but the layer that
protects it is the generator, not `BRG1311`.

## 6. Binding and lifetime model

The twelve concepts, kept separate:

- **Value** — an immutable datum (`Lit 7`). **Local lexical binding** — a name→declaration in a scope.
- **Mutable lexical binding** — a binding whose value can change after initialisation.
- **Captured binding** — a binding read/written by a closure defined inside its scope.
- **Callback closure** — the function object; one is created per evaluation of the enclosing expression.
- **Component instance** — the mounted `State`/React component instance. **Rebuild** — one invocation of
  `build()` / one render function call.
- **Callback surviving rebuilds** — a closure object still reachable (e.g. still installed) after a later
  rebuild. **Shared mutable state between callbacks** — two closures capturing the *same* binding.
- **Callback retaining an old binding** — a surviving closure that still sees the binding of the build that
  created it. **Binding recreated every build / persisting across builds** — the lifetime distinction.

**Dart's rule:** a `build()` local is created fresh on every `build()` call. Every closure created in that
call captures *that call's* binding. A later `build()` gets a new binding and new closures; Flutter installs
the new closures. It is neither per-instance nor global.

**Three problems, separated:**

- **A. Declaration identity** — solvable inside the analyzer (§4): ordinals exist. Not the blocker.
- **B. Mutable binding representation** — needs a UIR node that carries "binding + current value" *and* a
  place to put it. `render` has no statement slot; `logic.Lit` is an immutable value; `sig.Signal` means
  persistent State. No existing node fits without abuse.
- **C. Lifetime/ownership** — the blocker. Dart's lifetime is "per `build()` call". The generated
  program's only render schedule is "per re-render", and §7 shows those are not the same schedule.

## 7. State-ownership matrix

From the actual architecture evidence above. "Existing representation" is what the code does today.

| Binding kind | Created when | Owned by | Mutable | Capturable | Survives rebuild | Existing representation |
|---|---|---|---|---|---|---|
| Build-level local (`final`/`var`) | each `build()` call | that call | Dart: yes (`var`) | yes | no (new one per build) | `Binding.inlineValue`, re-extracted at every read; **writes refused** (`BRG1311`) |
| Local inside a callback/action body | each invocation of that callback | that invocation | yes | yes, by nested closures | no | `logic.VarDecl` + `Ref.target` (ADR-28); emitted as a `let`/`const` in the handler |
| Callback parameter | each invocation | that invocation | yes | yes | no | `params` on `logic.Lambda` / `sig.Action`; reserved-name collision guard `BRG3019` |
| State field | once per State/instance mount | the instance | yes | yes | **yes** (recreated on remount) | `ui.Component.localSignals` → `useState(() => signal(x))` |
| Store state | once per store instance | the store | yes | yes | yes, beyond the component | `sig.Signal` `scope: store` (N11) |
| Generated callback itself | each render (`const handle_x` in the body) | that render | n/a | n/a | recreated per render | `sig.Action`, top-level node, emitted in the component body |

The empty cell is the missing row: *a per-`build()` mutable binding that closures can write*. There is no
representation for it, and the two nearest ones (State field, callback-local) have the wrong lifetime.

## 8. Hypotheses evaluated

**A — plain JS closure over a per-render `let` in the component body.** Topology looks right: `handle_x`
is already declared per render in the body, so a `let` beside it would be re-created per render and
captured by that render's handlers. But "JS closures support this" is not the requirement; the requirement
is that *renders coincide with Dart rebuilds*. They do not:

- `setState(() {})` compiles to an empty handler `() => {}` **[observed]** — nothing forces a re-render.
- An `Object.is`-equal `Signal.set` notifies nobody **[runtime-executed]**: after `s.set(1)`, two further
  `s.set(1)` produced zero additional notifications (`{"afterChange":1,"afterTwoEqualWrites":1}`).
  Dart's `setState(() { _x = sameValue; })` always rebuilds.

So the generated re-render schedule is a strict subset of Dart's rebuild schedule. Concretely, for
`var count = 0; onPressed: () { count++; setState(() { _result = count; }); }` Dart resets `count` on
every rebuild, so `_result` stays at 1. A per-render `let` would reset only when `_result` *changes*:
press 1 → `_result` 0→1, re-render, `count` = 0; press 2 → `_result.set(1)` is equal, **no re-render**, the
same closure survives; press 3 → that closure's `count` is 2, so `_result` = 2. Dart never leaves 1.
**Correction (M11-H follow-up, ADR-0048):** this paragraph originally placed the divergence at press 2; the
model was later *executed* and the divergence is at press 3 (`[r=1, r=1, r=2, r=1]`, real React + real runtime
`signal`, against real Flutter's `[r=1, r=1, r=1, r=1]`). The conclusion stands; the derived detail was off
by one, which is itself the argument for executing rather than deriving. Hypothesis A therefore
does not preserve Dart semantics without changing the rebuild trigger — runtime architecture.

**B — generated component-local mutable cell (`useState`/`useRef`).** Creation once per mount, remount
recreates, never global, no explicit disposal — well behaved, and it is *exactly* what a State field is
already. That is the problem: a persistent cell has the wrong lifetime for a build-local (it would count
1, 2, 3… where Dart stays at 1). Faithful only if Dart's source used a State field, which needs no new
mechanism.

**C — transform a build-local into an existing State-field.** Semantic investigation only. Same lifetime
error as B, *plus* it would re-type the program (a value the author declared per-build becomes
instance-persistent). This is the prohibited "lift every `var` to State" cheat, in disguise.

**D — a UIR binding node.** Required by A (there is nowhere to declare the `let`). Justification exists —
`ui.Component.render` genuinely has no statement slot — but it is a schema change, hence an architecture
milestone (§10), and on its own it would still leave A's rebuild-schedule divergence unsolved.

## 9. Architecture gate result

**A3 — runtime/compiler architecture required; do not implement.**

- A1 (existing architecture supports a bounded safe subset): the only safe subset already exists —
  read-only capture — and it is what M8-B/M11-G ship. Nothing further is bounded-safe.
- A2 (small local binding/provenance representation): a binding node alone (Hypothesis D) is not
  sufficient; the lifetime problem in §8/A survives it.
- A3: the missing piece is a *rebuild-equivalence mechanism* (or an explicit decision to define
  per-render, not per-build, as the contract) — runtime plus compiler.

## 10. UIR/schema decision

Answers to the gate questions:

1. *Can existing UIR carry a mutable build-level binding?* No: `render` has no `logic.*` slot; `VarDecl`
   has no place to live there.
2. *Could `sig.Signal` carry it?* Only with the wrong (persistent) lifetime.
3. *Could `logic.Lit` carry it?* Only as an immutable value — that is precisely the M11-G defect.
4. *Would a new node be needed?* Yes, for A or D.
5. *Is that a schema change?* Yes (`packages/uir/schema/l2.json`, regenerated `uir.ts`/`uir.dart`,
   schema hash bump, golden regeneration). Per CLAUDE.md hard rule 1 it needs an ADR documenting a
   *proven contradiction* in the frozen spec; §7–§8 show a gap, not a contradiction, because the spec's
   own idiom (State fields) already expresses persistent state.
6. *Does `Ref.target` suffice for identity if a node existed?* Yes — the ordinal scheme (ADR-28) would
   mint it — but that is Problem A, not the blocker.

**Decision: no schema change.**

## 11. Implementation decision

**No implementation.** Of the ten conditions the brief requires, these fail: *lifetime understood* is
satisfied only as "not reproducible by the current render schedule"; *UIR sufficient or justified* fails
(§10); *no new runtime architecture* fails (§8/A); *valid JS/TS binding topology* holds for A but is
insufficient without the third; *behaviourally testable* fails — the only runtime that would observe it is
a browser, and building a harness is out of scope. The gate outcome is A3, so the default outcome
("no implementation") stands.

## 12. Refusal boundaries

Supported (unchanged): read-only capture of a build-level local (`final` or `var`, inlined at each read);
declaration-tier locals mutated within their own callback (ADR-28); parameters and State fields.

Refused, and remaining so:

- Any write to a build-level local from any nesting depth — **`BRG1311`** (Dart-side, blocks the graph).
  **`BRG1311` was not weakened, moved, or altered.**
- A build-level local with a write in `build()` itself, or a body whose leading run is followed by
  anything other than an admitted tail — `ui.Opaque` → generator `BRG3004`.
- A local function (any depth, including a writing one and a recursive one) — opaque → `BRG3004`/`BRG3006`.

## 13. Silent-wrong-code audit (A–Z)

Categories are grouped; each was probed, is impossible by construction, or is refused.

- **Wrong value from `Lit` substitution of a mutated local** — was the M11-G defect; **[refused]** by
  `BRG1311`, exercised by R3, R4, R6, R10, R18 and seven shadow-shape probes.
- **False negative from name-keyed resolution** — **[observed]** none across the seven scope-leak shapes
  (§4). This is the highest-value new evidence in this milestone.
- **False positive (over-refusal)** — **[observed]** none: shadowed inner writes and parameter writes are
  admitted; refusals count exactly one per real write.
- **State accidentally global / leaks between siblings or files** — impossible: nothing new is emitted;
  existing `useState`-per-instance state is unchanged.
- **Resets per callback invocation / per render / survives remount / initialised too late or more than
  once** — not reachable, because no persistent build-binding is emitted. §8/A analyses what *would* occur.
- **Duplicate generated declarations** — no declaration is added; existing `BRG3019` still guards
  sibling/parameter collisions.
- **Nondeterministic binding identity** — no new identity minted. **Incidental [observed]:** the two
  `Lit 7` nodes in R0 and R2 carry the *same* node id (`5e9693aae317d4a4`) although they come from
  different declarations at different lines, i.e. literal ids appear content-derived. Pre-existing,
  unrelated to this milestone, not investigated further — flagged only.
- **Local-function write bypassing `BRG1311`** — **[observed]** it never reaches `_target`; safe because the
  generator refuses the opaque declaration. Layered protection, not a hole.
- **Rebuild-schedule divergence (Hypothesis A)** — derived from two observed facts, later **[runtime-executed]** in jsdom by the M11-H follow-up (ADR-0048). This is the reason for A3, not a defect in shipped code (no such binding is emitted).
- **Incidental, unrelated [observed]:** `ListView.builder(itemBuilder: (c, i) { return Text('$i'); })` with a
  block-bodied builder emits `<ListView />` with **no diagnostic** at all, even with no captured local
  (control probe `q_builder_ctl`). The `itemBuilder` prop is present in the UIR and not emitted. This is
  independent of mutable capture, was **not** investigated, and is not fixed here. It is a candidate for a
  future frontier because it is a silent drop.

## 14. Mutation results

Not applicable: nothing was implemented. No mutation testing was run, and none is claimed.

## 15. Test evidence

No tests were added. Baseline suites passed unmodified: Dart 601, TypeScript 589 (§1). The evidence in
this document comes from ~30 throw-away probe projects in the session scratchpad, all outside the
repository; they are not committed and are not fixtures.

## 16. Runtime-validation boundary

No browser path was executed. Directly executed: the real `@bridge/runtime-react` `signal`/`subscribe`
in Node (§8/A). Everything about React render timing beyond that — including the press-2 scenario — is
derived, not run **[not run]** *at the time of this section; the follow-up executed it in jsdom — see §19*. No claim of runtime correctness is made for any binding kind here.

## 17. Relationship to `rsc-split`

Not touched. Inventory only: `rsc-split` remains a separate, unimplemented lead (M11-F, Outcome B). This
milestone's finding is independent of it — a persistent binding would live in a client component either
way.

## 18. Next concrete evidence required

Any future work on this frontier needs, *before* a design is proposed:

1. *(Resolved by ADR-0048, §19.)* A decision, by the spec's owner, on the contract: is the target's semantics "per-`build()` call" (needs
   rebuild-equivalence) or an explicitly documented "per-render" approximation? Everything downstream
   depends on this and it is not a compiler-internal question.
2. If rebuild-equivalence is wanted: evidence of what re-render trigger the runtime could honour for
   `setState(() {})` and equal-value writes, and its cost — an ADR against ADR-20 R3.
3. Only then, an ADR for a UIR binding node, evidenced by a *proven contradiction* with the spec.
4. *(Executed in jsdom by §19; a real browser was not used.)* A browser-executed check of the press-2 scenario (§8/A) to convert the derived divergence to an observed
   one, using an existing browser path if one applies.

Separately, and not part of this frontier: the silent `ListView.builder` block-bodied `itemBuilder` drop
(§13) deserves its own investigation.

## 19. Follow-up: the semantic decision (ADR-0048)

Written after §1–§18, on the same baseline (`725310b`, worktree drift unchanged). It answers the one
question §18 left open — *what is the lifetime of a build-local across generated re-renders, and what
triggers a rebuild* — and records the decision as **ADR-0048**, which this section summarises.
No code, schema, test or fixture changed.

**What changed our evidence.** §8 *derived* the Hypothesis A/B divergence. This follow-up *executed* it, and
the derivation was wrong in a detail (§8 now carries a correction). Ground truth came from real Flutter
(`flutter test`), the candidates from hand-written models on the real `react`, `react-dom` and
`@bridge/runtime-react` in jsdom:

| Scenario | Real Flutter | A: per-render `let` | B: persistent cell |
|---|---|---|---|
| S1 `var count=0; count++; setState(() { _result = count; })`, 4 taps | `[1,1,1,1]` (5 builds) | `[1,1,2,1]` | `[1,2,3,4]` |
| S2 `inc, inc, show(setState(){}), inc, show` | `[2,1]` | `[1,2]` | — |
| S3 State field | `[1,2,3,4]` | — | (B is this shape) |

StrictMode changed only render counts. The models are hand-written because `BRG1311` correctly prevents
generating them; they reject A and B by counter-example and prove nothing positive.

**Exact triggers (all observed).** Generated: an `Object.is`-changing write to a signal read via
`useSignal`; a parent render (no `memo`); a consumed provider changing. Flutter: every `setState`
(unconditionally), a non-identical parent rebuild, an inherited-widget change. `setState(() {})` compiles to an
empty handler; an equal `set` notifies nobody; a State-field write *without* `setState` re-renders (Flutter
would not). The full difference table is ADR-0048 D3.

**Decision (ADR-0048).** The contract preserves the rendered result as a function of props, State fields
and inherited state — not `build()` invocations. A build-local therefore has **no lifetime**: it is a name
for an expression, which is what `inlineValue` already is. Mutating one depends on exactly what the contract
declines to preserve, so `BRG1311` is the contract's boundary and stays; the supported alternative is a
State field. A faithful implementation would need seven pieces (ADR-0048 D6), three of them unbounded, and
a spec-level decision to make Flutter's rebuild schedule normative. **No schema change is required** by the
decision (D7).

**Incidental, both [observed], neither investigated further.** (1) Tested in-place mutations of a State-held
collection are refused loudly — `.add` fails strict `tsc` (`TS2339`), index assignment is `BRG3004`/`BRG3006`,
a project-class field write is `BRG3013` — so none was found to go silently stale; this is a sample, not a
proof. (2) `bridge build` reported "succeeded" for the `.add` probe until `tsc` ran, because dependencies were
not installed and the typecheck step was skipped ("dependencies are not installed") — expected, but it means
a `bridge build` without `npm install` is not a typecheck.

**Reproduction.** S1 (Flutter): a `StatefulWidget` whose `build` declares `var count = 0;` and whose
`ElevatedButton.onPressed` does `count++; setState(() { _result = count; });`, tapped four times with
`tester.tap` + `pump`, reading the `Text` after each. Models (JS): `S1_A` declares `let count = 0` in the
component body beside `const [_result] = useState(() => signal(0))` and `_result.set(count)` in the handler;
`S1_B` keeps `count` in a second `useState(() => signal(0))`. Both mount under `createRoot` with `act`,
dispatch four click events, and read `textContent`.
