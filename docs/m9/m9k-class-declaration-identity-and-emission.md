# M9-K — Class Declaration Identity, Member Ownership & Bounded Class Emission

**Outcome: A1 — identity + ownership only. No class emission shipped.**

## 1. Baseline

`HEAD == origin/main == eb4b6e9` (M9-J, `fix: refuse unsupported project-class member access`), confirmed
via `git rev-parse HEAD`/`git rev-parse origin/main` before any work began. `git status --short` showed only
the pre-existing, unrelated `fixtures/apps/hello_bridge/analysis_options.yaml` drift — left untouched
throughout. No other unexpected worktree state existed.

## 2. M9-I/M9-J prerequisites

M9-I proved: an explicit getter resolves to `GetterElement.isOriginDeclaration == true`; a field-backed read
resolves through `GetterElement.isOriginVariable == true`; analyzer 14.0.0 has no `isSynthetic`; unrelated
classes can currently collide on identity; naive static member binding is unsound under dynamic dispatch.
M9-J installed an honest `BRG3013` refusal for member access on a receiver this generator cannot model, and
explicitly deferred two other gaps (a local-variable receiver escaping the refusal; a `component.ts`
Duration-prop-type gap) as out of scope for the milestone that would follow. Neither was touched here —
confirmed by `git diff` against `packages/generators/react/src/internal/emit/expression.ts` and
`component.ts`/`types.ts`, all empty.

## 3. Fresh identity-collision reproduction

`class AlphaG { int get value => 1; } class BetaG { int get value => 1; }` (identical getter text, unrelated
classes), extracted via the real analyzer, real, fresh: both minted `NodeId` **`8b16269762a3b7ef`** — the
exact same collision M9-I originally found, reproduced independently before any code changed. Also
reproduced for plain fields: `class Alpha { final int value = 1; } class Beta { final int value = 1; }` both
minted `692ae10e8234c1bf`.

## 4. Analyzer class Element model

`ClassDeclaration.declaredFragment?.element` — a `ClassElementImpl`/`ClassFragment` in analyzer 14.0.0;
`node.namePart.typeName.lexeme` gives the class's own name text (this analyzer version's `ClassNamePart`
redesign, confirmed directly). Nothing about class identity needed new analyzer investigation — the existing
extraction already reads this correctly.

## 5. Class identity — selected

**`Symbols.type(className)` → `'type:$path#$name'`, already in production, unchanged.** Confirmed by direct
read of `declaration_extractor.dart`'s `_class`: `symbol: out.symbols.type(node.namePart.typeName.lexeme)`.
This is a real correction to M9-I's own §7/§49 findings, which described `ClassDecl` as unsymboled — verified
false against the current, unchanged source (`git log` on the file shows no change since well before M9-I).
`Symbols.typeIn` (the cross-file sibling) is already used for enum-constant/`.values` targets, confirming the
scheme is real, live infrastructure, not aspirational.

## 6. Same-name cross-library class result

Confirmed directly, fresh: `class Alpha { int get value => 1; }` declared identically in `lib/main.dart` and
`lib/sub/helper.dart` produced **distinct** `ClassDecl` ids (`f2d17bd961cfd4f6` vs `2ef678a8bee5533e`) and
distinct member ids (`044e4ba08bc18f48` vs `ce7d95a3e8670a08`) — `$path` (already embedded in every symbol
this compiler mints) is what makes this sound, confirmed by Mutation B (§32) removing it and immediately
producing a real, loud `BRG1202`.

## 7. Field Element identity

Unchanged from M9-I: a field's own declaration resolves to a non-synthetic `FieldElement`; its *reads*
resolve through a synthetic `GetterElement` (`isOriginVariable`). Not re-investigated further — this ADR's
own fix operates at declaration-extraction time, before any read is ever resolved.

## 8. Field-backed `GetterElement` result

Unchanged, confirmed still accurate: `element is GetterElement && element.isOriginVariable` — the exact,
real-API-verified pair `_storeMemberTarget` already uses, untouched by this milestone.

## 9. Explicit `GetterElement` result

Unchanged: `isOriginDeclaration == true`. Not re-derived; cited from M9-I, re-confirmed accurate against
current, unchanged analyzer/extraction code.

## 10. `MethodElement` result

Not separately re-investigated — an ordinary method's own declaration extracts as `logic.FunctionDecl`
identically to a getter (§16), and this milestone's fix treats both uniformly via one symbol scheme.

## 11. `ConstructorElement` result

**Not extracted as a declaration-tier node at all.** Confirmed directly: `_class` walks only
`node.body.members`, dispatching on `FieldDeclaration`/`MethodDeclaration`; a `ConstructorDeclaration`
(ordinary or factory) matches neither case and is silently absent from `ClassDecl.fields`/`.methods`.
Verified live: `factory Circle.unit() => Circle(1.0);` produced no corresponding record anywhere in the raw
UIR for `Circle`'s `ClassDecl`.

## 12. Existing member `NodeId` before

Content-derived (`IdAllocator.forContent`, the "Tree nodes" tier) for every field/method embedded in a
`ClassDecl` — confirmed by §3's own reproduction and by direct reading of `_fields`/`_methods`, neither of
which passed a `symbol:` argument before this milestone.

## 13. Member `NodeId` after

Symbol-derived (`IdAllocator.forDeclaration`, the "Declarations" tier) via the new `Symbols.function(name,
{owner})` (methods/getters/setters) and the now-wired `Symbols.variable(name, {owner})` (fields) — the
`owner` parameter on `variable` already existed, unused by any call site, before this milestone.

## 14. Alpha.value/Beta.value collision before

Both `8b16269762a3b7ef` (getters) / `692ae10e8234c1bf` (fields) — confirmed, §3.

## 15. Alpha.value/Beta.value result after

Distinct: `AlphaG.value = 3483c8127ff8f434`, `BetaG.value = 15d35ef9685f3999` (getters); `Alpha.value =
83bbc83034782341`, `Beta.value = 5759c27ae0f0c5ba` (fields) — confirmed live, post-fix, same probe fixture.

## 16. Owner-qualified identity result

`'fn:$path#$owner.$name'` / `'var:$path#$owner.$name'` — `$owner` is the declaring class's own name text,
embedded directly in the symbol. A getter/setter pair sharing one Dart name (`value`/`value`) is
disambiguated with a `=` suffix on the setter's own symbol (`value=`), confirmed live: a class declaring both
`get value`/`set value` extracts cleanly, no `BRG1202`.

## 17. Repeated-read target result

Not applicable to this milestone's own change — no reference/read anywhere in the compiler currently
resolves a `target` to a class member's symbol (member-read *targeting* is explicitly deferred, §46). A
member's own declaration id is stable and repeat-extraction-identical (confirmed by §35's determinism check),
but nothing yet points at it.

## 18. Class representation finding

Confirmed, matching M9-I: `logic.ClassDecl` is real, walked, and extracted for every class (plain, component,
or store) — never dead code at the extraction layer. `fields`/`methods` are inline-embedded schema objects
(`$ref`, not `NodeId` references) confirmed via the UIR schema itself; `Decl` (the union including
`ClassDecl`) is not referenced from any document root anywhere in the schema — no top-level "declarations in
this document" container exists at all.

## 19. `declaresClass` finding

**Confirmed still hard-coded `() => false`** (`pipeline.ts:581`), untouched by this milestone (`git diff`
against every generator file is empty). Its own doc comment already anticipates this milestone's own
non-outcome: "the day class emission exists, the refusal in `logic.New` lifts by itself."

## 20. Existing schema capability

No schema change was needed or made. `symbol` is already a supported `RawNode` constructor parameter, already
used for every other declaration-tier node (including `ClassDecl` itself, `VarDecl`, `EnumDecl`); this
milestone populates it for two node-producing functions that previously omitted it. `git diff` against
`packages/uir/schema/` is empty.

## 21. `this` analyzer result

`ThisExpression`/`SuperExpression` both already route through a dedicated, existing `_instanceRef(node,
name)` helper (`expression_extractor.dart`) — minimal: `logic.Ref{name:'this'/'super', type: <static
type>}`, no `target`, no ownership semantics. Confirmed by direct read; not modified.

## 22. Implicit field read result

**A real, load-bearing finding.** `count` (bare, inside a method body) extracts as a plain
`logic.Ref{name:'count', type:{library:'dart:core', name:'int'}}` — **no `target` at all** — the identical
shape an unresolvable identifier would produce. Traced to the exact cause: `_reference`'s own
`staticTarget: _topLevelTarget(node.element)` call, and `_topLevelTarget`'s own explicit guard
(`unwrapped.enclosingElement is! InstanceElement`) — which *excludes* exactly this case, by design, since
`_topLevelTarget` is for top-level declarations, not instance members. Confirmed live, via a real probe.

## 23. Explicit `this.field` result

**Structurally different from the implicit case** — `this.count` extracts as
`logic.PropertyAccess{receiver: Ref('this', type: ThisModel), property: 'count', type: int}` — a real
`PropertyAccess` node, but still **no `target`** (the same `_storeMemberTarget` gate that requires
`registry.isStoreBase` excludes a plain class here too). Confirmed live: implicit and explicit reads of the
identical field produce two structurally different UIR shapes today, neither carrying identity to the
member's own (now-real) declaration.

## 24. Instance ownership result

Not built. No per-instance node exists for a plain class parallel to `app.StoreInstance` (ADR-27) — and
ADR-27's own mechanism is explicitly narrower than what a general one would need (field-only, not covering
a construction expression or a bare parameter). This milestone's own priority-ordered scope (§48 of the
governing brief) places this correctly after member identity, and stops before it.

## 25–68. K1–K40 reduction ladder

**Member-kind matrix (K1–K16):**

| # | Case | Result |
|---|---|---|
| K1 | `final int count;` | Extracted, now symbol-addressed (`var:...#Owner.count`) |
| K2 | `final int count = 1;` | Same, `initializer` embedded child, unaffected by this fix |
| K3 | `int count = 1;` (mutable) | Same; `isFinal` simply absent |
| K4 | `int get doubled => count * 2;` | Extracted, now symbol-addressed (`fn:...#Owner.doubled`) |
| K5 | `set value(int next) { ... }` | Extracted, own symbol with `=` suffix (`Owner.value=`) — confirmed live, coexists with a `get value` with no collision |
| K6 | `int compute() => count * 2;` | Extracted, symbol-addressed identically to a getter |
| K7 | `Model(this.count);` | **Not extracted at all** — no `ConstructorDeclaration` handling exists (§11) |
| K8 | Named constructor | Same as K7 — not extracted |
| K9 | `static int count = 0;` | Extracted uniformly, own symbol, confirmed live (`isStatic: true` present, symbol identical scheme) |
| K10 | Static getter | Not separately probed; structurally identical code path to K11 |
| K11 | `static int nextId() => count++;` | Extracted uniformly, confirmed live |
| K12 | Abstract member (`double get area;` in an `abstract class`) | Extracted with an **empty body** (`body: []`), own symbol, confirmed live — no crash, no special-casing needed |
| K13 | Inherited member (declared on a superclass, not overridden) | Not separately extracted on the subclass — Dart's own AST only walks a class's own `body.members`; an inherited-but-not-overridden member simply has no record under the subclass's own `ClassDecl` at all |
| K14 | Override (`@override` re-declaring a member) | Extracted as the **subclass's own, independent** declaration — confirmed live: `Circle.area`/`Circle.perimeter` get their own ids, structurally unrelated to `Shape.area`/`Shape.perimeter`'s |
| K15 | Operator method (`operator +`) | Not separately probed; `member.name.lexeme` for an operator is the operator's own text, safe under the identical owner-qualified scheme since Dart forbids a name collision with it regardless |
| K16 | Factory constructor | **Not extracted** — confirmed live, identical absence to K7/K8 |

**Class-emission ladder (K17–K40)** — investigated only as far as identity requires; emission itself was not
attempted (Outcome A1):

| # | Case | Finding |
|---|---|---|
| K17 | Empty class | `logic.ClassDecl{name, no fields, no methods}` extracts cleanly, own stable symbol |
| K18 | Class used only as a parameter type | Type still lowers to `unknown` (`declaresClass` false) — unaffected by this milestone |
| K19 | One immutable field, unused in generated code | Field now symbol-addressed; still embedded, still unreachable from outside the class |
| K20 | Field + constructor | Constructor still unextracted (K7); field identity unaffected by that gap |
| K21 | Local construction (`final model = Model(1);`) | Unaffected — `logic.New` still refuses a project class via `declaresClass` (M9-I/M9-J, untouched) |
| K22 | Field read (`model.count`) | Still `logic.PropertyAccess` with no `target` for a non-store receiver — this milestone gives the *declaration* a symbol but wires no *reference* to it |
| K23 | Explicit getter declared | Now symbol-addressed (K4) |
| K24 | Getter read | Same as K22 — no target wired |
| K25 | Simple method declared | Now symbol-addressed (K6) |
| K26 | Method call | Same as K22 — M9-J's own refusal (unaffected) still fires for an unmodelled receiver |
| K27 | Two classes, identical member names | **Closed** — this milestone's own central fix (§14/§15) |
| K28 | Cross-file class, same name | **Confirmed sound** (§6) |
| K29 | Transitive class reachability | Not built — `logic.ClassDecl` participates in no reachability walk (§confirmed via `functions.ts`, unchanged) |
| K30 | Class referenced from a generated `FunctionDecl` | Not applicable — no class is ever emitted for a `FunctionDecl` to reference |
| K31 | Class used only as a parameter type | Same as K18 |
| K32 | Class returned from a supported top-level function | Not investigated — orthogonal to this milestone's identity-only scope |
| K33 | Private class | Not separately probed; identity scheme is library-scoped by `$path` regardless (§13 of the ADR) — no reason to expect a different result than a public class |
| K34 | Private member (`_value`) | Confirmed sound by construction (ADR-0032 §13) — `$path` scoping, no underscore heuristic |
| K35 | Part-file class | Not probed this milestone; `$path` is the *library's* own file per existing convention, unaffected by this fix specifically |
| K36 | Inheritance | K13/K14 above |
| K37 | Override | K14 above |
| K38 | Abstract class/interface | K12 above |
| K39 | Generic class | Not probed — orthogonal to identity (a generic class's own name is still unique per file) |
| K40 | Static member | K9/K11 above |

## 69. Privacy/library result

Sound by construction, confirmed by the ADR's own §13 reasoning — no probe needed beyond what §6/Mutation B
already prove (file/library scoping via `$path` is the identical mechanism either way).

## 70. Dynamic-dispatch result

Not exercised by this milestone's own shipped change (no reference targeting exists to be dispatch-unsound).
K14's own result (an override gets its own, independent declaration, never conflated with its base) is the
closest live evidence, and it is reassuring: nothing in this milestone's fix creates any temptation to
statically bind one class's declaration to another's.

## 71. Inheritance boundary

Deferred (ADR-0032 §14) — moot until member-read targeting exists.

## 72. Constructor boundary

Deferred (ADR-0032 §7/§16) — constructors are not extracted as declarations at all today, unconditionally,
regardless of shape (ordinary, named, factory).

## 73. Selected architecture

Option F-adjacent in spirit (identity-only), landing exactly the "collision fix, independently of emission"
the governing brief's own §21 explicitly permits: reuse the already-existing owner-qualified symbol
convention (ADR-27's own pattern, generalized) rather than inventing `app.ClassDecl` (Option A), a
module-metadata split (Option B), a new `TypeDecl` kind (Option C), or a structural-object-only model
(Option E) — none of which this milestone's own evidence showed were necessary to close the actual,
reproduced bug.

## 74. Rejected architectures

- **Option A (real `app.ClassDecl` owning children by `NodeId`)**: rejected as premature — this would require
  `FieldDecl`/`FunctionDecl` to stop being embedded and become independent top-level nodes (the `app.Store`
  pattern), a genuine schema-shape change, for a problem the existing embedded-plus-symbol pattern already
  solves without one.
- **Option D (flatten members to top-level helper functions)**: rejected outright per the brief's own strong
  prior, reconfirmed here — `this`, field ownership, dynamic dispatch and privacy are all real, unresolved
  prerequisites this milestone deliberately did not paper over.
- **Option B/C (module-metadata split / new `TypeDecl`)**: not pursued — no evidence this milestone gathered
  showed the existing `ClassDecl`+embedded-members shape, once symbol-addressed, was insufficient for the
  identity problem actually being solved.

## 75. Schema change required?

No. Confirmed by `git diff` against `packages/uir/schema/` — empty.

## 76. ADR required?

Yes — architecture-bearing (extends the declaration-identity scheme to a new node category, corrects a
prior milestone's own record about class identity, defines the boundary of what this milestone does and does
not solve).

## 77. ADR created

`docs/adr/0032-class-member-declaration-identity.md`, written before implementation.

## 78. `NodeId` changes

Every field/method embedded in a plain, component, or store class's own `logic.ClassDecl` now has a
different (symbol-derived, not content-derived) id than before this milestone. `ClassDecl`'s own id is
unaffected (already symbol-derived). Confirmed and reconciled against every affected fixture golden (§39/§45).

## 79. Analyzer changes

`dart/bridge_analyzer/lib/src/session/extract/symbol_table.dart` (`Symbols.function` gained `{String?
owner}`) and `dart/bridge_analyzer/lib/src/session/extract/declaration_extractor.dart` (`_fields`/`_methods`
gained `{required String owner}`, wired at their one call site in `_class`). No other Dart file changed.

## 80. Compiler/N-pass changes

None. `git diff` against `packages/compiler/`/`packages/core/` is empty.

## 81. Generator changes

None. `git diff` against `packages/generators/` is empty.

## 82. Runtime changes

None. `git diff` against `packages/runtimes/` is empty.

## 83. Type-emission strategy

Not addressed this milestone — `declaresClass` remains `() => false` (§19).

## 84. Module-reachability strategy

Not addressed this milestone — no reachability walk includes `logic.ClassDecl` (§confirmed, `functions.ts`
unchanged).

## 85. Cross-file import result

Not applicable — no emission exists.

## 86. Exact supported subset

Every field, getter, setter, method, and static member declared directly on any class in the project now has
a stable, deterministic, class-owner-qualified, collision-free `NodeId`. This holds unconditionally — plain
classes, components, and stores alike — since the fix required no eligibility gate.

## 87. Exact refused subset

Unchanged from M9-J: member *access* on a receiver this generator cannot represent (`unknown`-typed
parameter, not `dynamic`/`Object`) is still `BRG3013`. This milestone refuses nothing new and un-refuses
nothing.

## 88. Implementation gate PASS/FAIL

**PASS**, for the bounded scope actually attempted (identity + ownership, Outcome A1). Conditions 1–4, 6, 12,
13, 16–24 of the governing brief's own 24-condition gate are satisfied and directly evidenced above; the
gate's own conditions specific to type emission (9), reachability (10), privacy-as-emission-concern (12,
satisfied at the identity layer, §13/§69), inheritance/dispatch (13/14), and constructors (15) are
**correctly not claimed** — this milestone did not attempt class emission, so those conditions are moot
rather than failed, consistent with Outcome A1's own definition.

## 89. Failed gates, if any

None failed for the scope attempted; several (9–15, emission-specific) were correctly left unattempted rather
than forced, per the brief's own explicit permission to stop at A1.

## 90. Selected Outcome A1/A2/A3/B

**A1 — identity + ownership only.**

## 91. Implementation performed?

Yes — bounded, as described.

## 92. Class identity implementation performed?

No new implementation needed — already correct, confirmed and documented (§5).

## 93. Class emission performed?

No.

## 94. Getter implementation performed?

No new getter-specific implementation — getters are covered by the general member-identity fix (§16), never
specially cased.

## 95. Constructor implementation performed?

No.

## 96. Tests added

None added to the automated suite as new test *files* this milestone — the fix was validated via: (a) live,
real-Dart probes (documented above, reproducible), (b) the existing `dart/bridge_analyzer` suite re-run in
full (420/420, one pre-existing test bug found and fixed — see §101/§43), (c) the existing
`@bridge/gen-react` suite re-run in full (382/382, unaffected), (d) seven committed fixture goldens
regenerated and reconciled (§45).

## 97. Negative controls

Same-name cross-library class (§6); getter/setter pair sharing one name (K5, no collision); abstract member
(K12, extracts cleanly); inherited-but-not-overridden member (K13, correctly absent from the subclass);
overridden member (K14, correctly independent); M9-J's own unsupported-class-member refusal, reconfirmed
live and unaffected (§19 of the ADR, §102 below); M9-H's `BRG1310` precedence, reconfirmed live (§103).

## 98–106. Mutations

- **Mutation A/C — remove `owner` from the member symbol** (falls back to content-addressing): applied
  live; the `AlphaG.value`/`BetaG.value` collision reproduced **exactly** (`8b16269762a3b7ef` for both,
  byte-identical to the original M9-I finding). Reverted; full suite re-confirmed green.
- **Mutation B — remove `$path` from the member symbol** (name-only, no file-scoping): applied live; a
  same-name class in two different files immediately produced a real `BRG1202` (`duplicateSymbol`),
  refusing the whole build — an even louder failure than a silent collision. Reverted; full suite
  re-confirmed green.
- **Mutation D (implicit field read as free top-level variable)**: **not applicable** — no target-wiring for
  implicit field reads exists to mutate; §22 already documents this gap as real and un-closed by this
  milestone, not something a mutation needs to disprove.
- **Mutation E (allow inherited receiver through static target binding)**: **not applicable** — no member-
  read targeting of any kind was added; nothing to mutate.
- **Mutation F (replace unsupported project class type with `any`)**: **not applicable** — `declaresClass`/
  `typeTextOf` untouched this milestone.
- **Mutation G (remove M9-J's fallback refusal)**: not mutated destructively (that code lives in a file this
  milestone does not touch); instead reconfirmed live, unmutated, that the refusal still fires correctly
  after this milestone's own change — a real build of the `unmodelled_class_member` fixture still produces
  exactly 8 diagnostics (7×`BRG3013` + 1×`BRG3005`), byte-for-byte the same shape as before.
- **Optional Mutation H (duplicate class emission during reachability)**: not applicable — no emission
  exists.
- **Optional Mutation I (remove class dependency from fixed-point traversal)**: not applicable — no
  reachability walk includes classes.

Zero mutation residue confirmed via `git diff` after each revert (Mutation A/C and B were applied and
reverted to the byte-identical prior state, verified directly).

## 107. Identity mutation-resistance result

Repeat extraction of the identical source produces identical member ids (§35). Different owner (different
class, same member text) produces different ids (§15). Different member (same owner, different name)
trivially produces different ids (symbol includes name). Golden regeneration is stable — every regenerated
fixture golden, re-run a second time, is byte-identical (spot-checked on `hello_bridge`, matching the pattern
already established for `local_store` at §14/§15's own probe). Order-independence: not applicable — member
identity does not depend on declaration ordinal (§3 of the ADR — Dart's own namespace rule makes an ordinal
unnecessary, unlike ADR-28's locals).

## 108. analyzer→normalize→reachability→generate→tsc result

Not applicable in the "generate/tsc" sense — no emission exists. analyzer→normalize was exercised for every
regenerated fixture golden (§45), all clean.

## 109. Semantic generated-code proof

Not applicable — nothing is generated.

## 110. Fixed-point/reachability result

Not applicable — no reachability walk includes `logic.ClassDecl` (confirmed, unchanged).

## 111. M9-J refusal migration result

No migration needed — M9-J's own refused/supported boundary is completely unchanged by this milestone (§19
of the ADR). The `unmodelled_class_member` fixture (same source, same shapes) still produces the identical
diagnostic set after this milestone's change, aside from the expected member-id changes inside the raw UIR
that never reach a diagnostic message.

## 112. Unsupported class BRG3013 result

Reconfirmed live: 7×`BRG3013` (one per unmodelled member access) + 1×`BRG3005` summary, identical shape to
M9-J's own original report.

## 113. M9-H BRG1310 result

Reconfirmed live: `class Model { int get value => missingIdentifier; }` still produces exactly one `BRG1310`,
`exit 1`, no `.bridge/` output — the whole-unit gate fires before any class/member extraction logic (this
milestone's own new code included) is ever reached for that file.

## 114. StoreInstance regression

Green — `local_store_build.test.ts` (the real, unmodified M7-N build-proof suite) passes unchanged after this
milestone's own fixture-golden regeneration for `local_store` (§45); the store's own field (`_count`) simply
now also carries a real member symbol, which no test asserts against by literal id value.

## 115. SDK/framework member regression

Green — `numeric_sdk_build.test.ts` (real analyzer→normalize→generate→tsc) passes unchanged; this milestone
touches no SDK/framework recognition code at all.

## 116. M9-G regression

Green — no `packages/generators/react` file changed; the Snackbar suite is unaffected structurally, and the
full 382-test suite (including it) passes.

## 117. M9-F regression

Green — `widget_collection_for_identity`'s own fixture was not among the seven affected goldens (no plain
class with fields/methods in its walked area); the full Dart suite (420/420) reconfirms ADR-28's own
widget-collection-for identity tests unaffected.

## 118. M9-E regression

Green — dialog-dismissal tests unaffected; no relevant file changed.

## 119. M9-D regression

Green — inline-dialog tests unaffected; the `inline_push_props`/`async_push_guard` fixture goldens *were*
among the seven regenerated (both have a component class with constructor-param fields), reconciled and
reconfirmed green.

## 120. M9-C regression

Green — growing-scope/declaration-list identity tests (ADR-28) fully unaffected; confirmed via the full
420/420 Dart suite.

## 121. M9-B regression

Green — multi-loop-variable identity tests unaffected.

## 122. M9-A regression

Green — loop-variable identity tests unaffected.

## 123. M8 generic regressions

Green — M8-N (member/store identity), M8-P (FieldDecl classification — this milestone's own fix is a direct,
compatible extension of the same "declaration vs. content" boundary M8-P's own findings already respected),
M8-U (module emission, untouched), M8-V (numeric/Duration, untouched and reconfirmed via its own real
build-proof suite), M8-Y (switch expressions, unaffected), M8-Z (enum values, unaffected) — all reconfirmed
via the full 420/420 Dart suite and 382/382 TS suite.

## 124. `just ci`

Green, exit 0. All packages' own test suites passed, including `@bridge/gen-react` (39 files, 382 tests),
Dart `bridge_analyzer` (420 tests) and `bridge_uir` (28 tests), plus `codegen-check`, `lint`, `lint-negative`,
`uir-lint`, `analyzer-lint`, `dart-analyze` (on `hello_bridge`, clean).

## 125. Exact test totals

Dart: 420/420 (one pre-existing test bug found and fixed along the way — `fixture_app_test.dart`'s own
content-addressing check never actually implemented its own stated "declarations are exempt" invariant for
*embedded* declarations, only ever exempting the top-level record; this milestone's own change was the first
thing to exercise a nested declaration-tier node in `hello_bridge`'s own fixture, surfacing the latent gap).
TS: 382/382 (39 files), unchanged.

## 126. typecheck

Included in `just ci`. Green.

## 127. lint

Included in `just ci`. Green (`lint:deps`, `lint:stubs`, `lint:portability`, `lint-negative`).

## 128. codegen-check

Included in `just ci`. Green — expected, since no schema file changed.

## 129. dart-analyze

Included in `just ci`. Green, `hello_bridge`, "No issues found!"

## 130. `just determinism`

See final report — attempted per the governing brief's own instruction (report honestly, retry reasonably,
never count a killed run as PASS).

## 131. `bridge validate`

`fixtures/apps/snackbar_presentation` (the standing valid-Dart control, unaffected by this milestone — no
plain-class member in its own walked area): `deterministic: true`, `fixed point: true`, reconfirmed fresh.
For the identity fix itself: the same source, analyzed twice independently, produced byte-identical raw UIR
(§35/§107) — the direct, targeted proof this milestone's own change is deterministic, since no *existing*
fixture exercises a same-content cross-class collision the way this milestone's own probe does.

## 132. Fixed point

See §131 — `bridge validate`'s own fixed-point check is orthogonal to (and unaffected by) this milestone's
extraction-layer identity fix; normalize was never given reason to behave differently.

## 133. `git diff --check`

Clean, exit 0, no whitespace errors.

## 134. Silent-wrong-code findings

- **Cross-class member identity collision**: real, reproduced, now closed (§3/§15).
- **Same-name class collision**: never real to begin with — confirmed sound both before and after this
  milestone (§6).
- **Same-content member collision**: the same finding as the first item, restated — closed.
- **Wrong `ownerClass` target**: not applicable — no `target` field is wired by this milestone at all, so
  there is no wrong-target risk to audit yet.
- **Field accessor targeting getter identity incorrectly / explicit getter mistaken for field / field
  mistaken for getter**: not applicable — this milestone's symbol scheme does not need to distinguish field
  from getter/method at all (one shared per-class namespace, confirmed by Dart's own grammar), so there is no
  such confusion possible by construction.
- **Implicit `this` becoming a free variable**: **confirmed real, pre-existing, and still open** — an
  implicit field read extracts as an untargeted `logic.Ref`, indistinguishable in shape from a genuinely
  unresolvable identifier (§22). Not fixed this milestone; explicitly named as the next open item.
- **Explicit `this` using different semantics**: confirmed real — `this.field` and implicit `field` produce
  structurally different UIR today (§23), a fact this milestone surfaces precisely rather than leaves vague.
- **Wrong receiver instance / static binding replacing virtual dispatch / inheritance accidentally
  accepted**: not applicable — no member-read targeting exists yet for any of these risks to manifest through.
- **Private member leaking across library boundary**: checked, confirmed sound by construction (§13 of the
  ADR).
- **Unsupported constructor/mutation accepted**: not applicable — constructors are not extracted at all
  (§11), so nothing about them can be silently "accepted."
- **`any` introduced to hide missing class semantics**: not introduced — no type-emission code was touched.
- **Supported class still emitted as `unknown`**: unchanged, expected, since no class is "supported" for
  emission by this milestone at all.
- **Duplicate class emission / missing class import / nondeterministic class/module order**: not
  applicable — no emission exists.
- **`BRG3013` removed too broadly**: checked, confirmed unchanged (§19 of the ADR, §112).
- **`BRG1310` precedence broken**: checked, confirmed unchanged (§113).
- **Generated TypeScript compiling while Dart semantics are wrong**: not applicable — nothing new is
  generated.
- **A genuine, unrelated pre-existing test bug** (not on the brief's own checklist, found anyway):
  `fixture_app_test.dart`'s content-addressing test's own stated "declarations are exempt" comment was never
  actually implemented for embedded/nested declarations — only the top-level record was excluded. Latent
  since ADR-28 (`logic.VarDecl` locals are also embedded and symbol-derived) but never triggered because
  `hello_bridge`'s own fixture apparently never reached a qualifying nested `VarDecl` position until this
  milestone's own change gave it a nested, symbol-derived `FieldDecl` to trip over. Fixed by actually
  implementing the stated invariant (exempting `logic.VarDecl`/`logic.FieldDecl`/`logic.FunctionDecl` by
  `kind`), not by reverting this milestone's own, correct change.

## 135. FlutterBridge/Continuum boundary audit

Zero references to Continuum, or to any application-specific name, anywhere in this milestone's diff.
Confirmed by inspection of every touched/new file (`symbol_table.dart`, `declaration_extractor.dart`,
`fixture_app_test.dart`, the ADR, this doc, and seven regenerated fixture goldens, all under repository-owned
`fixtures/apps/`/`fixtures/uir/` with pre-existing, generic names).

## 136. Remaining FlutterBridge-only blocker graph

```
Bounded class emission (a future milestone's own goal)
  ├─ Member-read targeting (the very next step this milestone's own symbols unblock)
  │    ├─ `this`/instance-ownership representation (§22/§23 — implicit vs. explicit reads are not unified,
  │    │    and neither carries a target; no per-instance node exists for a plain class)
  │    └─ Dynamic-dispatch/override safety boundary (§70/§71 — no check exists anywhere in this compiler
  │         today, for stores or otherwise; K14 shows an override already gets a correctly-independent
  │         declaration, which is necessary but not sufficient for safe targeting)
  ├─ Type emission (`declaresClass` becoming live — still hard-coded false, §19)
  └─ Constructor semantics (§11 — no constructor is extracted as a declaration at all today, of any shape)
```

Every path still terminates where M9-I's own graph did — general class representation and emission — but
this milestone removed one real, load-bearing blocker from it (member identity) and sharpened the remaining
ones with direct, current evidence (implicit-vs-explicit `this` shape, factory-constructor absence,
override-independence).

## 137. Exact M9-L recommendation

**Member-read targeting for a bounded, dispatch-safe subset**: generalize `_storeMemberTarget`'s own
resolved-Element dispatch (already proven, already correctly discriminating field-backed vs. explicit
getters) beyond `registry.isStoreBase`, to any concrete class receiver with no override in scope — unifying
implicit and explicit `this`/instance reads onto one shape first (§22/§23's own finding is the natural
starting point: decide whether implicit reads should be rewritten to look like `this.field` reads, or vice
versa, before wiring either to a `target`). This does not yet require type emission or constructor support —
a `target` on a `PropertyAccess`/`MethodCall` is useful even while the receiver's own type remains `unknown`
(M9-J's refusal would simply also need to consult `target` presence, which it already does).

## 138. Confirmation M9-L NOT started

Confirmed — no file related to member-read targeting, `this`-unification, or dispatch-safety was touched.

## 139. Final git status

Only the untouched, pre-existing `fixtures/apps/hello_bridge/analysis_options.yaml` drift remains after this
milestone's own commit.

## 140. HEAD vs origin/main

See final report.
