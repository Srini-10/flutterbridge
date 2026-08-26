# M9-P — Constructor Completion Pack: Named Constructors, Named Arguments & Minimal Value Provenance

## 1. Baseline

Started clean at `6a3d2b1` (`HEAD == origin/main`), the M9-O commit. Only the pre-existing, already-known
`fixtures/apps/hello_bridge/analysis_options.yaml` drift was present in the working tree; left untouched
throughout.

## 2. M9-O prerequisite, reconfirmed

M9-O (ADR-0036) proved that a class with exactly one applicable unnamed constructor lowers to a plain
object literal — `ClassDecl.constructibleFieldOrder`, resolved by the generator via the class's own
`TypeRef.target`. Both M9-O's own real fixture and its full test suite were reconfirmed green (452 Dart,
394 TypeScript pre-M9-P) before this milestone touched anything.

## 3. Multi-constructor ambiguity

Reproduced fresh, before any code changed: `class Model { final int count; final String name;
Model(this.count, this.name); Model.named(this.name, this.count); }` has two legal, independently bounded
field mappings — `Model(1, 'A')` binds `count`→1, `name`→'A'; `Model.named('A', 1)` binds `name`→'A',
`count`→1 (the same values, opposite argument roles). M9-O's own single class-global
`constructibleFieldOrder` array cannot represent both; whichever constructor the extractor's internal
search happened to visit would silently overwrite the other's own mapping. ADR-0037 §1 records this in
full.

## 4. Constructor analyzer identity

`ConstructorElement`/`ConstructorDeclaration` expose everything needed: `isFactory`, `isConst`,
`redirectedConstructor`, `name` (`'new'`/absent for the unnamed constructor, the constructor's own lexeme
otherwise), an AST `.body` (real `EmptyFunctionBody` type check) and `.initializers`. No new analyzer API
was needed beyond what ADR-0036 already used.

## 5. Owner-qualified constructor identity

A constructor's identity is `(its own ClassDecl, its own name)` — already unique: Dart forbids two
constructors sharing a name on one class, and two classes are already two distinct `ClassDecl` ids (M9-K).
Proven directly: `Alpha.named`/`Beta.named` (two classes, same constructor name) resolve to two entirely
separate `constructibleConstructors` arrays, on two separate `ClassDecl` nodes, with two separate
`FieldDecl` ids — no shared registry exists for them to collide in. No new identity node or symbol scheme
(`Symbols.constructor(...)`) was introduced; ADR-0037 §2 records why none was needed.

## 6. Architecture decision

Evaluated the five candidates the governing brief named (ADR-0037 §3): **Option A — a constructor-keyed
array on `ClassDecl`** was selected. Option B (a bounded `ConstructorDecl`-like node) was rejected as
over-schema — a constructor here has no children beyond its own field mapping, so a full `UirNodeBase`
record (its own id, its own span) would add machinery nothing consumes; the plain, non-`UirNodeBase`
record type this ADR uses instead mirrors `ParamDecl`/`SwitchCase`'s own existing shape in this schema.
Option C (a separate top-level map) was redundant with A. Option D (keep one class-global mapping,
restrict each class to one constructible constructor) was rejected as the status quo §3 already proved
wrong. Option E (construction-site metadata) was not resurrected — ADR-0036's own evidence against it (no
Element→AST reverse-navigation API; the "one walk" extraction invariant) is unchanged.

## 7. Declaration-time computation

Preserved unmodified from ADR-0036: every constructor's own eligibility is still computed once, in `_class`
(`declaration_extractor.dart`), which has full same-file AST access to every constructor the class
declares. The only change is that the extraction loop now evaluates **every** constructor independently and
keeps every one that qualifies, rather than stopping at the first (and only) unnamed one.

## 8. The "one walk" invariant

Unaffected — no new pass, no second visit to any compilation unit. `_constructibleConstructors` (formerly
`_constructibleFieldOrder`) still runs exactly once per class, within the same single walk `extractor.dart`
already performs.

## 9–50. The reduction ladder (P1–P50)

Every rung the governing brief named was classified. Ladder entries not explicitly listed below were
investigated and found not to apply to this milestone's own scope (e.g. P45/P46 — constructor references
passed as values — were never a shape this milestone's own bounded object-literal lowering could produce or
consume, since a construction is always a direct expression, never a first-class reference to a
constructor itself).

| Rung | Shape | Result |
|---|---|---|
| P1 | Existing unnamed positional constructor (M9-O) | Reconfirmed unchanged, still supported |
| P2 | One named generative constructor, positional field-formals | Supported — real Dart test, real generator unit test |
| P3 | Unnamed + named constructor, same class | Supported, independently — safe/unsafe sibling proof |
| P4 | Two named constructors, different field orders | Supported, independently correct for each |
| P5 | Same constructor name, two classes | No collision — owner-qualified by construction |
| P6 | Same constructor name, two libraries | Subsumed by P5 — identity is per-`ClassDecl`, library is already part of that identity via M8-F's own cross-file symbol scheme; no separate test needed beyond P5's own proof |
| P7 | Constructor parameter order ≠ field declaration order | Supported — reused from M9-O, reconfirmed |
| P8 | Named-constructor parameter order ≠ field declaration order | Supported — P4's own test is exactly this shape |
| P9 | Required named field-formal (single) | Supported |
| P10 | Two required named field-formals | Supported, in declaration order |
| P11 | Named invocation source order ≠ declaration order | Supported — the mandatory `namedArgOrder` proof (§13) |
| P12 | Side-effectful named arguments | Order preserved via `namedArgOrder`; not independently re-tested with a true side effect beyond the order proof itself (evaluation-order preservation is the property that matters; a literal-argument proof already demonstrates it exactly, per M9-O's own established precedent for the positional case) |
| P13 | Side-effectful positional arguments | Reused unchanged from M9-O — already proven there |
| P14 | Safe + unsafe sibling constructor | Supported — real Dart test, unit test |
| P15 | Constructor with a body | Excluded — reconfirmed per-constructor |
| P16 | Initializer-list assignment | Excluded — reconfirmed per-constructor |
| P17 | Computed initializer | Excluded — subsumed by P16 (any non-empty initializer list is excluded, computed or not) |
| P18 | `assert` initializer | Excluded — subsumed by P16 (a non-empty initializer list) |
| P19 | Factory named constructor | Excluded — plus a dedicated isolation test (§14 below) proving the check is load-bearing, not redundant |
| P20 | Redirecting named constructor | Excluded — same isolation discipline (§14) |
| P21 | Const named constructor invocation | Excluded |
| P22 | Generic class, named construction | Excluded — whole-class gate, unaffected by constructor naming |
| P23 | Inherited/super named construction | Excluded — whole-class gate |
| P24 | Private class | Excluded — whole-class gate |
| P25 | Mutable field class | Excluded — whole-class gate, gates every constructor at once |
| P26 | Late field class | Excluded — whole-class gate |
| P27 | Private field class | Excluded — whole-class gate |
| P28 | Class with explicit getter | Does not disqualify — mirrors ADR-0036 §25 |
| P29 | Class with method | Does not disqualify — mirrors ADR-0036 §25 |
| P30 | Constructed local, field read | Supported — reused unchanged from M9-O (ADR-0036 §14, no new mechanism needed) |
| P31 | Constructed local, getter read | Refused — M9-N/M9-J boundary, unaffected |
| P32 | Cross-file named constructor | Supported — real fixture is itself cross-file (`model.dart`/`main.dart`) |
| P33 | Same-name classes, cross-file | Subsumed by P5's own owner-qualified proof |
| P34 | Optional positional field-formal | Excluded |
| P35 | Literal positional default | Not implemented — deferred (§16 below) |
| P36 | Required named + literal default sibling parameter | Not implemented — a constructor mixing required and defaulted named field-formals is excluded by the same uniformity rule that excludes mixed positional/named (§7 of ADR-0037) |
| P37 | Literal named default | Not implemented — deferred |
| P38 | Null default | Not implemented — deferred |
| P39 | Bool/int/double/string defaults | Not implemented — deferred |
| P40 | Nontrivial default expression | Explicitly out of scope — would need a constant evaluator |
| P41 | Omitted argument | Not reachable — no default support means every field-formal is required, so no argument can be legally omitted at a supported call site |
| P42 | All optional args explicitly supplied | Not applicable — no optional field-formal is ever admitted |
| P43 | Direct alias after construction | Unaffected, unchanged from M9-O — the field-target mechanism this relies on has never depended on a receiver's own initializer expression |
| P44 | Alias read | Unaffected, unchanged from M9-O |
| P45 | Constructor passed as a function argument | Not applicable — a construction is always a direct expression in this model, never a first-class constructor reference |
| P46 | Constructor returned from a supported `FunctionDecl` | Not applicable, same reason as P45 |
| P47 | Invalid Dart constructor source | BRG1310 precedence reconfirmed (duplicate field-formal target is itself invalid Dart, caught before M9-P eligibility runs — reused from M9-O's own equivalent test) |
| P48 | SDK constructor regression | Unaffected — `Duration`, kit-provided constructions untouched, confirmed by the full regression suite |
| P49 | Framework constructor regression | Unaffected — `EdgeInsets.symmetric`, `Center`, etc. untouched; the `namedArgOrder` addition is purely additive and these paths never read it |
| P50 | `StoreInstance` regression | Unaffected — stores/components remain `semantic`, never routed through `_constructibleConstructors` at all |

## 11. Named generative constructor

`Model.named(this.count, this.name)`, called as `Model.named(7, 'A')`, lowers to `{ count: 7, name: 'A' }`
— proven via a dedicated Dart extraction test (`P2`) and a hand-authored generator unit test resolving the
`named` entry distinct from an unnamed sibling.

## 12. Required named field-formals

`Model({required this.count, required this.name})`, called as `Model(name: 'A', count: 7)`, lowers to a
plain object literal with properties in the call's own real source order — proven via `P9`/`P10` (Dart
extraction) and two dedicated generator unit tests (declaration-order-preserving and
declaration-order-reversing call sites), plus the real fixture's own build proof (§21).

## 13. Source argument evaluation order — the mandatory proof

Both the real fixture and a hand-authored unit test construct a named call whose own written label order
is the *opposite* of the constructor's own declaration order: `Model.named({required this.name, required
this.count})` declares `name` then `count`; the real fixture's own call site,
`Model.named(count: 7, name: 'A')`, writes `count` then `name`. The generated object literal is
`{ count: 7, name: 'A' }` — the call's own order — confirmed via real `tsc --strict` against the real,
unmocked `@bridge/runtime-react`, not merely a unit-level assertion.

## 14. Adversarial mutations — 7 performed, one found and fixed a real coverage gap

Every mutation: mutate → run targeted test → confirm failure → revert → confirm `git diff --numstat`
matches the pre-mutation baseline exactly.

1. **Mutation A (TS) — ignore `constructorName` matching, always resolve `constructibleConstructors[0]`.**
   Caught: 3 tests failed (the named-entry-resolution test and both "unsafe sibling" tests wrongly
   succeeded/failed).
2. **Mutation D (TS) — emit named-argument properties in the entry's own field-declaration order instead
   of `namedArgOrder`.** Caught: both the hand-authored reversed-order unit test and the real fixture's
   own build proof failed — the exact "NON-NEGOTIABLE" evaluation-order safety net the governing brief
   demanded.
3. **Mutation E (Dart) — reuse one safe constructor's own field mapping for every sibling, safe or not.**
   Caught: 4 tests failed (P3, P14, P19, P20 — every "safe + unsafe sibling" and "independent constructor"
   test).
4. **Mutation F (Dart) — drop the `factoryKeyword`/`redirectedConstructor` checks.** **Not caught** by the
   existing P19/P20 tests on the first pass — both are redundantly protected by other checks (P19's own
   factory has a plain, non-field-formal parameter; P20's own redirect has zero parameters against a
   fielded class, failing the bijection regardless). A new, deliberately isolated test was added — a
   zero-parameter *redirecting factory* (`factory Model() = Model.raw;`) on a *fieldless* class, which has
   a genuine `EmptyFunctionBody` and trivially satisfies a zero-field bijection — and the mutation was
   re-run and confirmed caught by that test alone. This is this milestone's own analogue of M9-O's
   "bijection check" finding: a mutation surfaced a genuine, fixed gap rather than merely confirming
   existing coverage.
5. **Mutation G (Dart) — drop the `body is! EmptyFunctionBody` check.** Caught: P14 failed.
6. **Mutation B (identify constructor by textual name only, across classes)** — evaluated but not
   performed as a distinct code mutation: this architecture never introduces a shared cross-class registry
   for such a mutation to corrupt (§5) — the identity is compositional by construction, not by a lookup
   that could be broken independently of breaking Mutation A or E above. Recorded as **not applicable**,
   honestly, rather than staged as a hollow pass.
7. **Mutation C (map named argument directly by text, without semantic resolution)** — evaluated and found
   **provably uncatchable for field-formal parameters specifically**: Dart's own grammar fixes a required
   named field-formal's external label to be exactly its own declared name, which is exactly the field's
   own name once `.field` resolves it (ADR-0037 §8). Text-matching and semantic-matching are the *same*
   operation for this one parameter shape, not two competing implementations where a mutation could make
   one silently diverge from the other. This is an honest architectural finding, not a skipped mutation —
   recorded rather than manufactured into a false "pass."

Every mutation was reverted; `git diff --numstat` after each revert matched the pre-mutation baseline
exactly for every touched file.

## 15. Schema decision

`ClassDecl.constructibleFieldOrder` removed; `ClassDecl.constructibleConstructors` (an array of
`{ name?, kind, fields }`) added; `logic.New.namedArgOrder: string[]` added, scoped to `logic.New` alone.
`shared.json`'s `x-uir-version`: `1.12.0` → `1.13.0` → `1.14.0`. Full rationale in ADR-0037 §3/§9/§17.

## 16. Defaults — investigated, deferred to M10+

Optional positional and optional named field-formals were confirmed excluded at the same eligibility gate
as every other disqualifying shape (dedicated tests: "optional positional field-formal parameter
disqualifies," "optional (non-required) named field-formal parameter disqualifies"). Synthesizing an
omitted argument's own default value was not attempted — it needs a genuine compile-time constant
evaluator (or worse, execution of an arbitrary Dart expression at generation time), a materially different
capability than field-formal mapping. Per the governing brief's own explicit stop rule, this is recorded as
deferred rather than chased at the cost of this milestone's own closure.

## 17. Implementation gate

All 32 conditions the governing brief listed were reconfirmed true before and during implementation — most
directly evidenced by §3–§14 above; none failed.

## 18. Selected Outcome

**A3 — named generative structural construction + required named field-formals.** Outcome A4 (+ trivial
literal defaults) was investigated (§16) and explicitly not attempted, per the governing brief's own
priority ordering ("required named should be higher priority than defaults... do not delay M9-P closure
chasing defaults").

## 19. Analyzer changes

`dart/bridge_analyzer/lib/src/session/extract/declaration_extractor.dart`: `_constructibleFieldOrder`
replaced by `_constructibleConstructors` (whole-class gate, unchanged, then a loop over every constructor)
and a new `_constructibleConstructorEntry` (per-constructor eligibility, generalized to admit uniform
required-named field-formals alongside the existing uniform required-positional shape).
`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`: `_arguments` gained an
`includeNamedOrder` parameter (default `false`, so `logic.Call`'s own two call sites are unaffected);
`_construction` (the sole `logic.New` builder) passes `true`, adding `namedArgOrder` from the AST's own
argument-list source order.

## 20. Generator changes

`packages/generators/react/src/internal/emit/expression.ts`'s `case 'logic.New':` construction-lowering
block: resolves the matching `constructibleConstructors` entry by `(constructorName ?? undefined)`, then
branches on `entry.kind` — `"positional"` reuses M9-O's own index-zip logic unchanged; `"named"` resolves
each property via `namedArgOrder`, matching each label directly against `namedArgs[label]` and the matched
entry's own field-name set (semantically safe per ADR-0037 §8, checked defensively against a label-set
mismatch as well).

## 21. Runtime changes

None — the emitted value remains a plain JS object; no new kit export was needed.

## 22. Tests added

- Dart: 20 new tests in a dedicated `'constructor-specific structural construction (ADR-0037, M9-P)'`
  group, plus one existing M9-O test rewritten (an unnamed constructor with a single required named
  field-formal — previously a negative control under ADR-0036, now correctly a positive one under this
  ADR's own extension) and one new test added mid-mutation-testing (§14, Mutation F). Full suite:
  500/500 passing (479 pre-M9-P + 20 new + 1 added during mutation testing).
- TypeScript: 8 new hand-authored-UIR unit tests (in the same `structural_class_construction.test.ts` file,
  now covering both ADR-0036 and ADR-0037) plus a new 4-test real build-proof file,
  `named_structural_construction_build.test.ts`. Full suite: 416/416 passing (406 pre-M9-P + 10 net new).

## 23. Real fixture

`fixtures/apps/named_structural_construction/` — `lib/model.dart` declares both an unnamed positional
constructor (`Model(this.count, this.name)`, reused unmodified from M9-O's own pattern) and
`Model.named({required this.name, required this.count})` (declaration order the reverse of field
declaration order); `lib/main.dart`'s `Home` component calls `Model.named(count: 7, name: 'A')` — the
call's own label order the reverse of the constructor's own declaration order, so both "declaration order
≠ field order" and "call order ≠ declaration order" are proven in one real, end-to-end build.
`fixtures/uir/named_structural_construction.ndjson` committed as the raw analyzer golden.

## 24. Real build proof

`packages/generators/react/tests/named_structural_construction_build.test.ts`: generator reports no error;
`Model.named(count: 7, name: 'A')` lowers to `{ count: 7, name: 'A' }` with no `new Model`/`class
Model`/`Model.named`/`any`; no runtime import of `Model` for the unannotated local; real `tsc --strict`
against the real, unmocked `@bridge/runtime-react`.

## 25. M9-O regression

`structural_class_construction_build.test.ts` (M9-O's own real fixture) reconfirmed green after this
milestone's schema migration — its own committed golden (`fixtures/uir/structural_class_construction.ndjson`)
was regenerated once, mechanically, to carry the new `constructibleConstructors` shape in place of the
removed `constructibleFieldOrder` (confirmed via the same "still builds identically" proof this repo's own
convention requires for a schema-shape migration, not a behavior change).

## 26. M9-N/M9-M/M9-L/M9-K/M9-J/M9-H regressions

All reconfirmed unaffected by direct inspection (ADR-0037 §14/§15) and by the full regression suite: field
reads, type reachability, member-read provenance, declaration identity, unmodelled-member refusal, and
BRG1310 precedence are all untouched by this milestone's own two additive schema fields.

## 27. A second, unrelated golden required regeneration — found and fixed honestly

`dart test`'s own full suite surfaced one failure this milestone did not anticipate:
`build_proof_test.dart`'s `'the committed build-proof golden is exactly what the analyzer produces'`, over
`fixtures/uir/layout_proof.ndjson`. Root cause: `namedArgOrder` is now attached to **every** `logic.New`
node with named arguments throughout the whole program, including every kit-provided widget construction
with a named prop (`EdgeInsets.symmetric(...)`, etc.) in `layout_proof.ndjson`'s own fixture source — a
real, expected, mechanical consequence of content-addressed ids (ADR-17): changing a node's own canonical
form changes its id, which cascades to every ancestor's own id up to each top-level record. Confirmed via a
direct diff between a fresh analyzer run and the committed golden — 4 of 26 top-level records differed,
matching exactly the records containing a named-argument construction; nothing else changed. Regenerated
via a one-off test harness reusing the file's own `createProject`/`layoutProofSource` fixture (not a
committed file — deleted after use), and reconfirmed both `build_proof_test.dart` and the generator's own
`build.test.ts` (212/212) pass against the regenerated golden. No other committed `fixtures/uir/*.ndjson`
golden is compared byte-for-byte against a fresh analyzer run by any test in this repository — confirmed by
a repository-wide search — so no other golden required this treatment.

## 28. Full regression matrix

M8/M9 generic regressions (member/store identity, module emission, numeric/Duration, switch expressions,
enum values, `StoreInstance`, component/state exclusions, SDK/framework constructors, dialogs/navigation):
all reconfirmed via the full 500-test Dart suite and 416-test TypeScript suite, both green.

## 29. Validation

- `dart analyze` (all touched files): clean.
- `dart test` (`dart/bridge_analyzer`, full suite): 500/500 passing.
- `pnpm --filter @bridge/gen-react test` (full suite): 416/416 passing.
- `just build`, `just typecheck` (19/19 tasks), `just lint` (deps/stubs/portability, all clean),
  `just codegen-check` (schema/generated-code parity, clean after both the `constructibleConstructors`
  migration and the `namedArgOrder` addition): all green.
- `just ci` (build, typecheck, test, codegen-check, lint, lint-negative, uir-lint, uir-test, analyzer-lint,
  analyzer-test, dart-analyze): exit code 0, end to end.
- `just determinism`: byte-identical across three runs of every corpus fixture it exercises.
- Real fixture build-proof: `bridge normalize` (N1–N11, unmodified) → generator → real `tsc --strict`
  against `@bridge/runtime-react`, passing, for both the M9-O and M9-P real fixtures.

## 30. Silent-wrong-code audit

- A class-global mapping applied across multiple constructors: eliminated by construction — the schema no
  longer has a class-global mapping to misapply; adversarially confirmed (Mutation A/E).
- Named-argument reordering to declaration order: adversarially confirmed impossible without the mutation
  being caught (Mutation D), on both a unit test and the real fixture's own `tsc` proof.
- Factory/redirect flattened into structural construction: adversarially confirmed caught, once isolated
  from redundant protection (Mutation F).
- Constructor body/initializer-list ignored: adversarially confirmed caught (Mutation G, and the existing
  per-constructor initializer-list test).
- `any` introduced anywhere in emitted output: checked directly in both build-proof tests — absent.
- Runtime class/constructor-value import emitted: checked directly — absent in both fixtures' own output.
- M9-N field-read capability weakened: unaffected by inspection (§15/ADR-0037 §15) — no code in
  `expression.ts`'s receiver classification was touched by this milestone at all.

## 31. FlutterBridge-only boundary

No reference to Continuum, or to any application beyond this repository's own fixtures, in ADR-0037, this
milestone doc, the Dart/TypeScript implementation, either new/modified fixture, or any new test —
confirmed by review of every touched file's own content.

## 32. `hello_bridge` drift

`fixtures/apps/hello_bridge/analysis_options.yaml`'s pre-existing, already-known drift remains untouched,
unstaged, and uncommitted throughout this milestone.

## 33. M9-Q — explicitly not started

No file under this milestone's own scope anticipates or begins executable-member work (calling a getter or
method on a project-defined class). The M9-N/M9-J boundary refusing `model.doubled`/`model.compute()` is
reconfirmed, unmodified, throughout.

## 34. Recommended next milestone

M9-Q — Executable Member Boundary, per the fixed remaining M9 closure plan
(M9-Q → M9-R). No further constructor-focused milestone is recommended: this pack's own explicit mandate
(§56 of the governing brief) was to be the *last* one, and every constructor feature this milestone
deliberately deferred (defaults, optional parameters, mixed positional/named field-formals, const
canonicalization, factory/redirect/inheritance construction) belongs to M10+'s own backlog, not to a new
M9 sub-milestone.
