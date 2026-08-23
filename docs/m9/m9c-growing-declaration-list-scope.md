# M9-C — Growing scope for multi-variable local declaration initializers

**Baseline:** `a63fce3` (M9-B, "feat: preserve identity for multi-variable loops") == `origin/main`,
verified fresh from git, not assumed. Pre-existing, unrelated drift confirmed present and left untouched:
`fixtures/apps/hello_bridge/analysis_options.yaml`.

**Outcome: implemented.** A later declaration in a declaration list — `var a = 1, b = a + 1;`, or a
C-style loop's own `for (var i = 0, j = i + 1; ...)` — now resolves an earlier declaration in the same
list, inside its own initializer. No new identity concept, no schema change, no ADR amendment: extraction
is now *sequential*, growing scope one declaration at a time — the same pattern this codebase's own
`statementsOf` already uses to thread scope from one statement to the next, applied one level deeper.

## 1. Exact premise

M9-B's own doc (`docs/m9/m9b-c-style-multi-declaration-loop-identity.md` §18) recorded this as the
remaining gap: *"A later declaration's own initializer reading an earlier one in the same list... is
extracted against the pre-loop scope, not a growing one — the same, pre-existing, shared choice
`VariableDeclarationStatement`'s own multi-declaration sibling case already makes."*

## 2. Dart language/analyzer semantics — proven first, via the real `dart analyze`, not assumed

Before touching any code, nine rungs were checked directly against `dart analyze` (SDK bundled with this
repo's own Flutter/Dart toolchain) in a throwaway probe package, deleted after evidence extraction:

| Shape | Dart result |
|---|---|
| `var a = 1, b = 2;` (independent) | Valid, 0 errors |
| `var a = 1, b = a + 1;` (second reads first) | **Valid, 0 errors** |
| `var a = 1, b = a + 1, c = b + 1;` (chain) | Valid, 0 errors |
| `var a = 1, b = 2, c = a + b;` (later reads two earlier) | Valid, 0 errors |
| `{ var x = 10; { var a = x, b = a + x; } }` (outer interaction) | Valid, 0 errors |
| `for (var i = 0, j = i + 1; j < 10; i++, j++)` | Valid, 0 errors |
| `var a = a;` (self-reference) | **Error** — `referenced_before_declaration` |
| `var a = b, b = 1;` (forward reference) | **Error** — `referenced_before_declaration` |

The premise holds: Dart genuinely resolves an earlier declaration inside a later one's own initializer,
in both ordinary multi-declaration statements and C-style loop declaration lists, and genuinely refuses
self- and forward-reference as compile errors (`referenced_before_declaration`) — not merely "unsupported"
but linguistically invalid. The implementation gate's first condition is satisfied by direct evidence, not
by assuming the milestone's own framing was correct.

## 3. Fresh reproduction (extraction-level)

A temporary scratch test (`test/m9c_scratch_test.dart`, deleted after evidence extraction, mirroring
M8-N's/M9-A's/M9-B's own probe discipline) ran the *real* `BridgeAnalyzer` over each rung and printed
every `logic.Ref`'s own `target`. Before this milestone: `errors: []` in every case (`BridgeAnalyzer`'s
own diagnostics do not surface the analyzer's own resolution errors — a separate, pre-existing,
unrelated characteristic, not this milestone's to fix, §9), and every cross-initializer read — `a` inside
`b`'s own initializer, `i` inside `j`'s — had **no `target`**, while reads after the whole declaration
list (in the body) already resolved correctly.

## 4. AST representation

`ForPartsWithDeclarations.variables` and `VariableDeclarationStatement.variables` are both a
`VariableDeclarationList` (already established, M9-B §2) — each declared variable its own
`VariableDeclaration`, its own resolved `Element`.

## 5. Current extraction timeline (before this milestone)

Traced precisely, in both call sites:

- `VariableDeclarationStatement` (multi-declaration): `for (final variable in variables)
  RawChild(_variable(variable, node.variables, scope))` — every declaration's own initializer extracted
  against the **same** `scope` (the one before the whole statement).
- `ForPartsWithDeclarations` (M9-B's own `_forInit`): identical shape, same `scope` for every declaration.

Meanwhile, this file's own top-level `statementsOf` (unrelated to either of the above, and unmodified by
this milestone) *already* threads scope forward **one statement at a time**: `current =
_declaring(statement, current)` after each. This is the identical pattern this milestone applies one
level deeper, inside a single declaration list — not a new scoping concept, a precedented one.

## 6. Exact identity/visibility loss point

Both call sites' own initializer-extraction loop, unconditionally passing the *pre-list* `scope` to every
declaration regardless of position — an extraction-time defect, the same category ADR-28's whole family
of fixes (M8-N, M8-S, M9-A, M9-B) has each found and fixed, in a new location. Not N5, not normalization,
not the generator (§12).

## 7. Raw UIR before / after

Before: `var a = 1, b = a + 1;` → `logic.Block` of two `logic.VarDecl`s; the `logic.Ref{name: 'a'}` inside
`b`'s own `initializer` carries no `target`.

After: the same `Ref` carries `target: <a's own VarDecl id>`. `a`'s own declaration id is **unchanged**
(content of the declaration itself does not depend on scope-extraction timing) — only the *read's* own
target, and therefore the read's own content-derived id, changes.

## 8. Reduction ladder

All rungs reproduced through the real analyzer, permanent tests (§14) added for the load-bearing ones:

| Rung | Shape | Result |
|---|---|---|
| A | `var a = 1;` (control) | Unchanged — byte-identical, confirmed by the full unmodified M9-A/M9-B suites passing |
| B | `var a = 1, b = 2;` | Unaffected (nothing to resolve) |
| C | `var a = 1, b = a + 1;` | Resolves (this milestone) |
| D | `var a = 1, b = a + 1, c = b + 1;` | Resolves, chained |
| E | `var a = 1, b = 2, c = a + b;` | Resolves both, not only the immediate predecessor |
| F | Repeated reads | Consistent target |
| G | Object-valued declarations | Not specially tested — no project-defined object construction shape exists that this milestone's own mechanism treats differently from a primitive; the identity/scope mechanism is type-agnostic by construction (it operates on the `Element`, never the value) |
| H | Outer-scope interaction | Outer local visible throughout; inner list resolves sequentially |
| I | Shadowing | Covered by H — the inner declaration list's own scope is a child of the outer one, exactly as `Scope.child` already guarantees |
| J | Same-content declarations | Never collapse (distinct ordinals) |
| K | Closure in a later initializer | Not applicable inside an action body via ordinary syntax without an intervening statement (Dart does not permit a bare lambda as a `var` initializer used as a captured-value site inside the same declaration list in a way this grammar exposes differently from §12's own N5 tests); tested instead at the N5 unit level (§13), the same division M9-A/M9-B use |
| L | Self-reference (`var a = a;`) | Real Dart error; left unresolved, not fabricated |
| M | Forward reference (`var a = b, b = 1;`) | Real Dart error; left unresolved, not fabricated |
| N | Three declarations in a C-style loop | Resolves |
| O | Loop: second reads first | Resolves |
| P | Loop: third reads first + second | Resolves |
| Q | Cross-owner identical lists | Never collide |
| R | Nested scopes, identical lists | Covered by H/I |
| S | Catch scope + declaration list | Never collide (shared ordinal sequence, unchanged) |
| T | Declaration list inside a loop body | Not a new case — a declaration list appearing as an ordinary statement inside a `logic.For.body` already goes through the identical `VariableDeclarationStatement` path, unaffected by loop nesting |

## 9. Identity vs. visibility — the central distinction, proven

The ordinal pre-pass (`scope.dart`'s `_OrdinalVisitor`, unmodified by this milestone) numbers every
declaration in a list **before** any of this runs — it knows every declaration's own eventual identity
up front, structurally. This milestone's own architecture keeps that fact strictly separate from lexical
*visibility*: `_localSymbol` (unmodified) is a pure function of the declaration itself (owner + ordinal),
so computing a symbol early costs nothing — but a `logic.Ref` only ever resolves against a name
`Scope.lookup` actually finds, and an as-yet-undeclared name is not found, because the new
`_declarationList` helper adds a declaration's own binding to the running scope only **after** its own
initializer has already been extracted. Proven directly by the two negative-control tests (self-reference,
forward-reference, §14) and by adversarial Mutation A (§17), which pre-registered the whole list up front
and immediately broke both negative controls.

`BridgeAnalyzer`'s own diagnostics do not surface the underlying analyzer's `referenced_before_declaration`
error for `var a = a;`/`var a = b, b = 1;` — a separate, pre-existing, unrelated characteristic (whether
`BridgeAnalyzer` should refuse ill-formed Dart before extracting at all is a different, out-of-scope
architectural question). What this milestone guarantees is narrower and load-bearing for its own scope:
regardless of whether the *source* is valid, this extractor never fabricates a resolution Dart itself does
not license.

## 10. ADR-28 applicability

Applies mechanically, unmodified. No new identity concept — this milestone concerns lexical visibility
*timing*, not declaration identity, exactly as anticipated in the milestone's own framing.

## 11. Progressive-scope architecture

One new, shared helper, `_declarationList` (`statement_extractor.dart`), replacing both call sites'
previous non-growing loops:

```
Scope current = scope;
for (final variable in declared) {
  nodes.add(_variable(variable, list, current));      // initializer sees `current`, not yet including `variable`
  current = current.child([Binding(..., symbol: _localSymbol(variable, current))]);  // now it does
}
return (nodes, current);   // the scope AFTER the whole list
```

`_declaring` (used by `statementsOf` to compute the scope for the *next sibling statement*) needed **zero
changes** — it already independently computes the correct final result (all declarations bound, correct
symbols) via the same pure `_localSymbol`, regardless of the *timing* used during initializer extraction;
order does not matter once every declaration is present. This is why the scope-leak audit (§Phase 7 of
this milestone's own instructions) found nothing to fix: the growing scope built inside
`_declarationList` never escapes its own loop — it is consumed locally (for initializer extraction) and,
for a C-style loop, returned once as the finished `inner` scope for `test`/`update`/`body`; every sibling
statement's own scope is still computed by the pre-existing, untouched `_declaring`.

## 12. Ordinary local / loop unification

Both call sites (`VariableDeclarationStatement`'s multi-declaration case, and `ForPartsWithDeclarations`)
now call the *same* `_declarationList` + `_asStatement` pair — the small, safe shared helper Phase 10 of
this milestone's own instructions asked for, reusing M9-B's own `_asStatement` (`logic.Block`-wrapping)
unchanged. `_forInit` (M9-B's own, single-purpose helper) was deleted; its logic is now `_declarationList`
itself, used by two call sites instead of one. No unrelated refactor was performed.

## 13. N5 interaction

Checked fresh (Phase 11's own hard requirement), not assumed. Two new tests
(`packages/compiler/tests/n5.test.ts`): a closure *outside* a two-member, cross-initializer-resolved
declaration list, capturing the second member, is refused (`BRG2105`) — proving the existing,
ADR-28-generalised, target-based check (`walk(program)`, unmodified) already covers a resolved
cross-initializer read exactly like any other local read. A closure that declares its *own*,
cross-initializer-resolved two-member list and reads both members lifts correctly — both captures bound,
not free. **Zero lines of `n5_lift_closures.ts` changed.**

## 14. Generator audit

Checked directly, before assuming: a real fixture (`fixtures/apps/growing_scope`) built end to end through
the *unmodified* generator produced fully correct output for every rung —
`let a = 1; let b = (a + 1); let c = (b + 1);` and `for (let i = 0, j = (i + 1); (j < 5); ...)` — with
**zero generator changes**. `localBindingsIn` (already generic, M9-A's own finding) picks up every
declaration regardless of which one's own initializer references which; `emitExpression`'s existing
`scope.localName(target)` resolution needed nothing new — a cross-initializer read is, to the generator,
indistinguishable from any other already-resolved local read.

## 15. Schema / ADR decision

**No schema change, no ADR amendment, no NodeId mechanism change, no runtime change** — confirmed by
direct inspection before implementation, matching this milestone's own Phase 13 gate. `init`/`logic.Block`
already representable (M9-B, unchanged); a declaration's own `id` derivation (owner + ordinal) is
unaffected by *when* its initializer is extracted; N5 and the generator both needed zero changes (§13,
§14). This milestone is purely an extraction-time scope-sequencing fix.

## 16. Implementation gate

All 16 conditions passed:

1. Dart semantics proven from the real analyzer (§2). 2. Gap reproduced fresh (§3). 3. Analyzer already
resolves earlier declarations correctly (§2, §3). 4. FlutterBridge lost the reference only due to
extraction scope timing (§5, §6). 5. ADR-28 identity remains sufficient, unchanged (§10). 6. No schema
change (§15). 7. No new NodeId mechanism (§15). 8. Growing scope represented without forward-reference
fabrication (§9, proven adversarially, §17 Mutation A). 9. Self-reference behaviour correct (§9, §14
tests). 10. Initializer evaluation order preserved (§14 build-proof, source order). 11. Scope does not
leak into siblings/outer scopes (§11). 12. Ordinary-local and C-style-loop semantics consistent (§12,
shared helper). 13. N5 remains safe, zero changes (§13). 14. Generator remains target-based, zero changes
(§14). 15. Unsupported shapes remain honestly refused — self-/forward-reference stay unresolved, not
newly refused with a diagnostic, matching the pre-existing BRG3006-style handling of any out-of-scope
name. 16. No application-specific behaviour introduced.

**Implementation performed: yes.**

## 17. Implementation

`dart/bridge_analyzer/lib/src/session/extract/statement_extractor.dart`:

- New shared helper `_declarationList(declared, list, scope) → (List<RawNode>, Scope)` — sequential,
  growing-scope extraction, replacing both call sites' previous static-scope loops.
- New shared helper `_asStatement(nodes, span)` — single node or `logic.Block`, reused from M9-B's own
  `_forInit` logic (which is deleted, folded into the two new, more general helpers).
- `VariableDeclarationStatement` case and `ForPartsWithDeclarations` case both rewritten to call the two
  new helpers instead of their own separate, ad hoc logic.

No other file changed in production code — `scope.dart` (the ordinal pre-pass), N5, and the generator all
needed zero changes, confirmed directly (§13, §14).

## 18. Tests

- `dart/bridge_analyzer/test/extraction_test.dart` — new group `'sequential declaration-list scope
  (ADR-28, amended M9-C)'`, 13 tests: ordinary two-step, three-step chain, later-resolves-both,
  byte-identical content, outer-scope interaction, ordinary-local collision, catch-binding collision,
  loop two-step, loop third-resolves-both, cross-action collision, self-reference negative control,
  forward-reference negative control, determinism. One obsolete M9-B test (asserting the now-superseded
  no-cross-initializer-resolution limitation) replaced with a pointer comment, matching the M8-S→M9-A→
  M9-B precedent.
- `packages/compiler/tests/n5.test.ts` — 2 new tests (§13).
- `packages/generators/react/tests/growing_scope_build.test.ts` — 10 new tests: real analyzer → real
  `bridge normalize` (N1–N11, unmodified) → real generator → real `tsc` against the real, unmocked
  `@bridge/runtime-react`.
- `fixtures/apps/growing_scope/` + `fixtures/uir/growing_scope.ndjson` — a new, permanent, generic
  fixture, the analyzer-produced golden verified deterministic (`bridge validate`) before being
  committed.

Negative controls: self-reference and forward-reference both stay unresolved (§9, §14).

## 19. Mutation / adversarial checks (Phase 17)

**Mutation A — pre-register the whole list.** `_declarationList` was temporarily changed to bind every
declaration into scope *before* extracting any initializer (fabricating forward-reference resolution).
Caught immediately by both negative-control tests (`var a = a;` resolved to itself; `var a = b, b = 1;`
resolved `b`). Reverted; `dart analyze` and the full extraction suite confirmed clean afterward.

**Mutation B — remove progressive registration after declaration #1.** `_declarationList` was temporarily
changed to extract every initializer first, in a separate loop, before registering *any* binding —
reproducing the exact pre-M9-C defect. Caught by four tests (`b = a + 1`, the three-step chain, the
later-resolves-both case, and the outer-scope-interaction case). Reverted; confirmed clean afterward.

**Mutation C — swap target ids between two earlier declarations.** `_declarationList` was temporarily
changed to swap each adjacent pair of symbols before registering them into scope (a declaration's own
node still got its own correct id; only the *binding* used for later resolution was corrupted). Caught by
six extraction tests immediately. Reproduced through the real `growing_scope` fixture for the
generated-code proof: `let a = 1; let b = (b + 1);` — `b`'s own initializer read *itself* instead of `a`
(a genuine self-reference in the emitted JS, which would throw at runtime under temporal-dead-zone
semantics — `tsc` does not catch this, since TDZ is a runtime concept, but the build-proof's own
exact-string assertions immediately would). Reverted; confirmed clean afterward.

All three mutations were reverted before running the final validation suite (§20) and before commit.

## 20. CI / determinism / fixed-point

- `just ci`: exit 0. Dart `bridge_analyzer` 366/366 ("All tests passed"). TS `@bridge/compiler` 159/159,
  `@bridge/gen-react` 34 files / 349 tests, all green.
- `just determinism`: exit 0, "byte-identical across every run" across all 5 tracked apps. (The first
  attempt this milestone hit an environmental SIGKILL, reported honestly rather than counted as a pass;
  the retry completed cleanly.)
- `bridge validate --json` on `fixtures/apps/growing_scope`: `{"ok": true, "checks": [{"deterministic":
  true}, {"fixed point": true}]}`.
- `git diff --check`: clean.

## 21. Regressions

M9-A's own for-loop identity group (11 tests) and build-proof (9 tests), and M9-B's own multi-declaration
loop group (9 tests, after the one obsolete test's removal) and build-proof (9 tests), all re-run fresh,
unmodified, all green — for-in identity, single- and multi-declaration C-style loop identity, nested
shadowing, and closure safety are all confirmed still correct. The full Dart suite (366/366) and full TS
suites (compiler 159/159, gen-react 349/349) cover every M8 generic capability this repository's own
tests exercise; none regressed.

## 22. Silent-wrong-code audit

The sequential extraction this milestone adds leaves no room for duplicate evaluation (each declaration's
own initializer is extracted exactly once, in source order), lost exceptions, or declaration-order drift
— checked directly (§8, §14) rather than assumed. Adversarial Mutation C (§19) demonstrated exactly the
silent-wrong-code shape this project's own discipline exists to catch: a swapped-but-structurally-valid
binding produced compiling-but-semantically-wrong code (`let b = (b + 1);`) that `tsc` alone would not
have caught — the build-proof's own exact-string, real-analyzer-sourced assertions did.

## 23. Remaining FlutterBridge-only blocker graph

Unchanged from M9-B except this milestone's own rung resolved. Newly recorded:

- `BridgeAnalyzer`'s own diagnostics do not surface `package:analyzer`'s own resolution errors (§9) — a
  real, narrow, well-scoped-once-someone-picks-it-up gap, but a materially different (and materially
  larger) architectural question — whether the analyzer should refuse ill-formed Dart before extracting
  at all — not this milestone's to fix, and not recommended as a direct follow-on without its own
  investigation.
- The widget-tree collection-for's own `itemParam` identity (M9-A §13, ADR-28 §4 territory) — unchanged.
- Private/derived getters, dialog destinations, `ScaffoldMessenger.of`, class-declaration module emission,
  a C-style loop declaring more than one variable with a comma-declaration-list initializer already
  covered (M9-B) — all otherwise unchanged from the M9-0 roadmap.

## 24. Recommended M9-D

Not preselected — matching this milestone's own instruction not to define M9-D from an external
application's needs. Two concrete, evidence-backed candidates:

1. **Dialog destinations / `ScaffoldMessenger.of`** — carried over from the M9-0/M9-A/M9-B roadmap, each
   needing a new ADR before implementation (M8-X's own finding).
2. **Whether `BridgeAnalyzer` should gate on the resolved unit's own analyzer errors** (§9/§23) — a real,
   if larger, architectural question this milestone's own investigation surfaced honestly, not
   pre-scoped, and likely deserving its own dedicated investigation milestone before any implementation
   is attempted.

**M9-D has not been started.**
