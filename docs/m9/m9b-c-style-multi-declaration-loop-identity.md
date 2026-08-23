# M9-B — C-style multi-declaration loop variable identity

**Baseline:** `e676bb1` (M9-A, "feat: preserve declaration identity for loop variables") == `origin/main`,
verified fresh from git, not assumed. Pre-existing, unrelated drift confirmed present and left untouched:
`fixtures/apps/hello_bridge/analysis_options.yaml`.

**Outcome: implemented.** Every declared variable in a C-style `for` loop's initializer —
`for (var i = 0, j = 10; i < j; i++, j--)`, `for (var i = 0, j = 1, k = 2; ...)`, and so on — now gets
the same declaration-tier identity a single-declaration C-style loop already has (M9-A). No new identity
concept, no schema change, no ADR amendment: the mechanism M9-A already built generalizes mechanically.

## 1. Exact problem

M9-A's own amendment (`docs/adr/0028-amendment-for-loop-variable-identity.md` §4) deliberately left this
shape unsupported: *"a C-style loop declaring more than one variable... `_for`'s own
`ForPartsWithDeclarations` case already emitted no `init` field at all for this shape."*

## 2. AST evidence, reproduced fresh

A real Dart probe (`fixtures/apps/m9b_probe/`, deleted after evidence extraction — the same discipline
M8-N's and M9-A's own probes used) confirmed, through the real analyzer, before any implementation began:

- `ForPartsWithDeclarations.variables` is a `VariableDeclarationList` — the **identical type**
  `VariableDeclarationStatement.variables` already uses (confirmed directly from
  `package:analyzer-14.0.0/lib/src/dart/ast/ast.dart`). Each declared variable (`i`, `j`, ...) is its own
  `VariableDeclaration` AST node with its own resolved `Element`, exactly as an ordinary local's is.
- `scope.dart`'s `_OrdinalVisitor.visitVariableDeclaration` (installed by M9-A) numbers **every**
  `VariableDeclaration` structurally, by AST parent shape alone — it does not check how many share one
  `ForPartsWithDeclarations`. Both `i` and `j` already had distinct ordinals *before* this milestone
  touched anything; the pre-M9-B code simply never asked for them.
- The only defect was in `_for()` itself: `'init': RawChild(...)` and the `inner` scope's own symbol
  computation were both gated on `declared.length == 1`, so a real, resolvable identity was computed and
  then thrown away for any loop declaring more than one variable.

## 3. Raw UIR before / after

Before (fresh probe, `for (var i = 0, j = 10; i < j; i++, j--) { out += '$i,$j;'; }`): `logic.For` has
**no `init` field at all**. Every `logic.Ref{name: 'i'}` / `{name: 'j'}` — in the condition, both
updaters, and the body — carries no `target`.

After: `logic.For.init` is a `logic.Block` of two `logic.VarDecl` nodes (`i`, `j`), each with a real,
symbol-derived id. Every read in the condition, both updaters, and the body carries a `target` pointing
at the correct one.

## 4. Exact identity-loss point

Confirmed by direct inspection, not assumed: `_for`'s own `ForPartsWithDeclarations` case
(`declared.length == 1` gating `_localSymbol`/`init` emission) — an extraction-time defect, identical in
shape to every prior loss point ADR-28's own family of fixes has found (M8-N, M8-S, M9-A). Not N5, not
normalization, not the generator (confirmed by the probe: the same raw-UIR absence of `target` appears
regardless of downstream stage).

## 5. Reduction ladder

All rungs reproduced through the real analyzer (`test/m9b_scratch_test.dart`, a temporary scratch file,
deleted after evidence extraction) before implementation, and as permanent tests after:

| Rung | Shape | Result |
|---|---|---|
| A | One declaration | M9-A control — unchanged |
| B | Two declarations | Supported (this milestone) |
| C | Same-content initializers (`i = 0, j = 0`) | Supported, distinct ids |
| D | Different-content initializers | Supported |
| E | `j`'s own initializer reads `i` (legal Dart) | `i`'s read inside `j`'s initializer stays unresolved — a pre-existing, shared characteristic (§9), not a regression |
| F | Condition reads both | Supported |
| G | Updaters read/write both | Supported |
| H | Body reads both, repeatedly | Supported |
| I | Body-local sharing a name | Supported (no collision) |
| J | Nested loops, same names | Supported (no collision) |
| K | Two unrelated actions, byte-identical loops | Supported (no collision) |
| L/M/N | Closure capturing one/both/neither declaration | N5-safe (§10) |
| O | `break`/`continue` | Unaffected, unchanged |
| P/Q | Omitted condition/updater | Unaffected, unchanged |
| R | Three declarations | Supported |
| — | More than one *ordinary* local statement declared inside the loop body | Out of scope, unaffected |

## 6. Identity architecture

ADR-28's existing `Symbols.local(name, {owner, ordinal})` scheme, unmodified. The ordinal sequence is the
**same shared sequence** every other declaration-tier binding already uses (ordinary locals, catch
bindings, for-in and single-declaration C-style loop variables) — no new, per-loop or per-declaration-list
namespace. `scope.dart` needed **zero changes**: `_OrdinalVisitor` already numbered every declaration in a
multi-declaration list before this milestone; only `_for`'s own length-based gate, in
`statement_extractor.dart`, needed to be lifted.

## 7. Ordinal collision analysis

Proven directly (`extraction_test.dart`'s new group, 10 tests): two declarations in one loop never
collide (distinct ordinals from the shared sequence); byte-identical initializer content never collapses
two declarations to one id; nested loops sharing both variable names never conflate inner and outer;
cross-action loops sharing names never collide; an ordinary local sharing a name with a loop declaration
never collides; a catch-bound exception sharing a name with a loop declaration never collides. An
**adversarial mutation** (Phase 13, §12) forced every declaration in a multi-declaration loop to share
ordinal 0 — caught not only by the new collision tests but by the **builder's own** `BRG1202`/`BRG1203`
safety net (*"Two declarations share the symbol..."*, *"This is a hash collision... it would silently
merge two unrelated nodes"*), confirming defense-in-depth independent of this milestone's own tests.

## 8. Schema decision

**No schema change.** `logic.For.init` is typed `Stmt` in the schema, and `Stmt` already admits `Block`
(the same union every other statement position does). A `logic.Block` of `logic.VarDecl` children is the
**identical representation** `VariableDeclarationStatement`'s own multi-declaration sibling case
(`var a = 1, b = 2;`, pre-dating this milestone) already uses. `init` losslessly holds any number of
declared variables today, structurally, with zero schema changes — confirmed by inspection *before*
writing any implementation, per this milestone's own schema-decision gate.

## 9. ADR decision

**No new ADR, and no amendment document.** M9-A's own amendment already anticipated exactly this
extension, structurally (`_OrdinalVisitor`'s existing doc comment: *"a structural pre-pass numbers every
declaration by AST shape alone, regardless of which of them extraction currently gives a real node
to"*) — this milestone did not invent a new identity rule; it removed a length-based gate that withheld
an identity the architecture already made available. Per this milestone's own Phase 7 instruction ("at
most the existing for-loop amendment may need a small amendment if the schema representation changes") —
no schema change occurred (§8), so no amendment is needed. `scope.dart` itself required **zero changes,
including its own doc comments** — M9-A's own prose already described the shared, structural pre-pass
accurately and needed no correction; `git diff` against the M9-A baseline confirms this file has no net
change (the Phase 13 adversarial mutation there was fully reverted).

The one genuine representational choice this milestone made — reusing `logic.Block` for `init` rather
than inventing a dedicated multi-declaration field — is not a new architectural decision either: it is the
same choice `VariableDeclarationStatement`'s own sibling case already made, years earlier in this
codebase's own history, reused here rather than re-derived.

## 10. Generator scoping

`localBindingsIn` needed **zero changes** — it is already a generic, recursive walk finding every
`logic.VarDecl` regardless of nesting depth or field name, exactly as M9-A's own finding proved for
`loopDecl`. One change was required: `statement.ts`'s `logic.For` case previously assumed `init` was
always a single `logic.VarDecl` (`emitStatement(node['init'], scope).join(' ').replace(/;$/, '')`) — a
new `initClauseOf` helper now handles both the single-declaration case (unchanged output, byte-for-byte,
confirmed by the full, unmodified M9-A test suite passing) and the `logic.Block` case, emitting one
`let`/`const` keyword (read from the first declaration — sound, because Dart's own grammar allows exactly
one keyword per declaration list) followed by a comma-separated declarator list —
`let i = 0, j = 10`. This is target-based throughout: each declarator's own identifier text comes from
`identifierOf(decl['name'])`, the same function every other declaration already uses, and every *read* of
`i`/`j` resolves via the same `EmitScope.localName(target)` lookup `localBindingsIn`'s map already
populates generically. No name-based heuristic was added anywhere.

## 11. N5 interaction

Re-checked fresh, not assumed (Phase 9's own hard gate). `init: logic.Block` nests each declaration one
level deeper than M9-A's own single-`init`/`loopDecl` case — `walk(program)`'s `collect()` is fully
generic over field names and nesting depth (confirmed by direct reading, `packages/compiler/src/internal/
normalize/pass.ts`), so it needed no change to keep finding every declaration. Two new tests
(`packages/compiler/tests/n5.test.ts`) prove it: a closure capturing the **second** declaration of an
enclosing multi-declaration loop is refused (`BRG2105`), and a closure that declares and reads its **own**
entirely-nested multi-declaration loop (both declarations) lifts correctly. **Zero lines of
`n5_lift_closures.ts` changed.**

## 12. Semantic equivalence

Dart's `for (var i = 0, j = 10; i < j; i++, j--)` and the emitted `for (let i = 0, j = 10; (i < j); i = i
+ 1, j = j - 1)` are semantically equivalent for the admitted subset: both languages evaluate a
comma-declarator initializer list left to right (§3 reduction rung E's own finding — Dart allows a later
declaration's initializer to read an earlier one, and JS's own `let i = 0, j = i + 1` does too, though this
milestone does not resolve that specific cross-initializer read, §5/§9 below), both evaluate a
comma-separated update expression list left to right (unchanged from M9-A's own fix), and JS's `let`
inside a `for(...)` header creates one lexical binding per declared name, shadowing exactly the way two
Dart declarations at different loop-nesting depths already do (confirmed directly by the nested-loop
build-proof test, §14). No evaluation-order, scope, mutation, or closure-capture mismatch was found for
the admitted subset.

## 13. Implementation gate

All 12 conditions passed:

1. Reproduced fresh (§2–§4). 2. Every declaration has a usable analyzer `Element` (§2). 3. ADR-28's
`Symbols.local` applies without a new concept (§6). 4. Collision-free (§7). 5. Shadowing correct (§7, §14).
6. Existing UIR (`Stmt`'s own `Block` variant) represents the subset losslessly, zero schema change (§8).
7. Generator consumes identity target-based, no name heuristics (§10). 8. N5 safe, zero changes (§11).
9. Dart/JS semantics equivalent for the admitted subset (§12). 10. Unsupported shapes remain refused —
none were newly introduced by this milestone; `j`'s own initializer reading `i` stays exactly as
unresolved as the pre-existing ordinary-local sibling case already leaves it (§9). 11. No architecture
weakened. 12. No application-specific behaviour introduced.

**Implementation performed: yes.**

## 14. Tests

- `dart/bridge_analyzer/test/extraction_test.dart` — new group `'C-style multi-declaration loop variable
  identity (ADR-28, amended M9-B)'`, 10 tests: two declarations (condition/updater/body), three
  declarations, byte-identical content, repeated reads, nested same-name loops, ordinary-local collision,
  catch-binding collision, cross-initializer read (documents the pre-existing, shared, non-regression
  limitation), omitted clauses, determinism. One obsolete M9-A test (asserting the now-superseded
  no-identity limitation) replaced with a pointer comment, matching the M8-S→M9-A precedent.
- `packages/compiler/tests/n5.test.ts` — 2 new tests (§11), plus a `classicForMulti` UIR-construction
  helper mirroring `forIn`/`tryCatch`.
- `packages/generators/react/tests/multi_loop_variables_build.test.ts` — 9 new tests: real analyzer → real
  `bridge normalize` (N1–N11, unmodified) → real generator → real `tsc` against the real, unmocked
  `@bridge/runtime-react`.
- `fixtures/apps/multi_loop_variables/` + `fixtures/uir/multi_loop_variables.ndjson` — a new, permanent,
  generic fixture, the analyzer-produced golden verified deterministic (`bridge validate`) before being
  committed.

Negative controls: cross-initializer read stays unresolved (§9); omitted condition/updater unaffected.

## 15. Adversarial / mutation checks (Phase 13)

**Mutation 1 — forced ordinal collision.** `_OrdinalVisitor`'s `ForPartsWithDeclarations` branch was
temporarily changed to assign ordinal `0` to every declaration, unconditionally. Caught by the
`'nested multi-declaration loops with the same variable names never collide'` test — and, independently,
by the **builder's own** `BRG1202`/`BRG1203` diagnostics (*"Two declarations share the symbol..."*, *"This
is a hash collision... it would silently merge two unrelated nodes"*), a defense-in-depth layer this
milestone did not have to add. Reverted; `dart analyze` and the full extraction suite confirmed clean
afterward.

**Mutation 2 — swapped target ids.** The `inner` scope's own Binding construction was temporarily changed
to assign each declaration's symbol to its *neighbour* instead of itself (`i` bound to `j`'s symbol and
vice versa). No diagnostic fired (a swapped-but-valid symbol still resolves to *some* declaration) —
exactly the silent-wrong-code shape this project's own discipline exists to catch by content, not by
error count. Reproduced through the real fixture: the declaration line stayed correct (`let i = 0, j =
10`), but the condition, updaters, and body all read the swapped identifiers
(`for (let i = 0, j = 10; (j < i); j = j + 1, i = i - 1)` — semantically inverted, silently compiling).
The build-proof test's own exact-string assertions (`toContain('for (let i = 0, j = 10; (i < j); i = i +
1, j = j - 1)')`) would have failed against this output. Reverted; `dart analyze` and the full extraction
suite confirmed clean afterward.

## 16. CI / determinism / fixed-point

- `just ci`: exit 0. Dart `bridge_analyzer` 354/354 ("All tests passed"). TS `@bridge/compiler` 157/157,
  `@bridge/gen-react` 32 files / 329 tests, all green.
- `just determinism`: full e2e harness across the 5 tracked apps — "byte-identical across every run,"
  exit 0, no environmental kill this run.
- `bridge validate --json` on `fixtures/apps/multi_loop_variables`: `{"ok": true, "checks":
  [{"deterministic": true}, {"fixed point": true}]}`.
- `git diff --check`: clean.

## 17. Regressions

M9-A's own for-loop identity group re-run fresh, unmodified, all 11 tests green; its own build-proof
(`loop_variables_build.test.ts`) unmodified, all 9 tests green — for-in identity, single-declaration
C-style identity, nested shadowing, and closure safety are all confirmed still correct. The full Dart
suite (354/354) and full TS suites (compiler 157/157, gen-react 329/329) cover every M8 generic capability
this repository's own tests exercise; none regressed.

## 18. Remaining FlutterBridge-only blocker graph

Unchanged from M9-A except this milestone's own rung resolved. Newly recorded:

- A later declaration's own initializer reading an earlier one in the same list
  (`for (var i = 0, j = i + 1; ...)`) is extracted against the pre-loop scope, not a growing one — the
  same, pre-existing, shared choice `VariableDeclarationStatement`'s own multi-declaration sibling case
  already makes for `final a = 1, b = a + 1;`. A future milestone could thread growing scope across a
  declaration list for *both* cases at once — a real, narrow, well-scoped, generically-useful gap, but
  unrelated to loop identity specifically and not this milestone's to fix.
- The widget-tree collection-for's own `itemParam` identity (M9-A §13, ADR-28 §4 territory) — unchanged.
- Private/derived getters, dialog destinations, `ScaffoldMessenger.of`, class-declaration module emission
  — all unchanged from the M9-0 roadmap, none touched.

## 19. Recommended M9-C

Not preselected — matching this milestone's own instruction not to define M9-C from an external
application's needs. Two concrete, evidence-backed candidates:

1. **Cross-initializer growing scope** (§18) — the narrowest, most closely related to this milestone's own
   mechanism, affecting both ordinary multi-declaration locals and multi-declaration loops identically.
2. **Dialog destinations / `ScaffoldMessenger.of`** — carried over from the M9-0/M9-A roadmap, each
   needing a new ADR before implementation.

**M9-C has not been started.**
