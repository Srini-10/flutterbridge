# M9-N — Bounded Immutable Instance-Field Shape & Receiver-Based Field Reads

## 1. Baseline

Entering M9-N: `HEAD == origin/main == 9b27465` (M9-M). A project-defined class may have a real, named,
type-only TypeScript interface (ADR-0034), currently empty (`export interface Model {}`). `model.count`
still reaches M9-J's refusal (`BRG3013`) unconditionally — `isUnmodelledMemberReceiver` keys on the
receiver's own `TypeRef.target` being present, independent of what member is actually being read.

## 2. M9-K/M9-L/M9-M prerequisites, reconfirmed

Owner-qualified `FieldDecl` identity (`Symbols.variable(name, owner:)`, ADR-0032), field-backed
`GetterElement` canonicalization to that identical identity (`isOriginVariable`, ADR-0033), and bounded
class-type emission with a `TypeRef.target` link (ADR-0034) are all reused unmodified — reconfirmed live
via the full, unchanged Dart and TypeScript suites (452/452, 389/389 before this milestone's own new
tests were added).

## 3. Fresh reproduction of the M9-M/M9-J boundary

Reproduced with a real, minimal probe (`class Model { final int count; Model(this.count); }`, a
component parameter `model`, `Text('${model.count}')`) through the real pipeline. Captured directly,
before any implementation: `Model`'s `ClassDecl` id and `count`'s own `FieldDecl` id (both symbol-derived,
unchanged); `model`'s parameter `TypeRef.target` already present (M9-M); the `logic.PropertyAccess` node
for `model.count` itself carrying **no** `target` at all — confirmed by reading the raw UIR directly
(`grep` for `"property":"count"` in the probe's own analyzer output showed `receiver`/`property` but no
`target` key); the generated `Model` interface still `{}`; the generated prop type still the real `Model`
name (M9-M) but the read itself refused by the unmodified BRG3013 check. This is the precise gap this
milestone closes.

## 4. Field-read specificity — the reduction ladder's core rungs

Compared directly, all against the real analyzer: a `final` field (target attached, this milestone), an
explicit getter (`isOriginDeclaration`, never targeted), a method (untouched — a wholly separate
`logic.MethodCall` refusal path), a mutable field (`isFinal == false`, never targeted), a static field
(reaches an entirely different AST shape — `_isStaticQualifier`, never even reaches this milestone's own
function), and an inherited/overridden getter (never targeted — the resolved field's own
`enclosingElement` differs from the receiver's own class, failing owner consistency independently of the
inheritance check). None of these generalizes from "a field is readable" to "any project-class property
read is readable" — each remains an independently, explicitly checked gate.

## 5. Field-backed getter canonicalization — one identity, reused

`_externalFieldTarget`'s own success path is a direct call to the pre-existing `_instanceMemberTarget`
(M9-L), never a new symbol-computation path. `count` (implicit, inside the class), `this.count`
(explicit, inside the class), and `model.count` (external, this milestone) all resolve through the
identical `Symbols.variableIn` call for the identical `FieldDecl` — proven directly, live, not assumed
(a dedicated test asserts all three produce byte-identical target ids for the same field).

## 6. External field targeting — the analyzer extension

**A real, load-bearing bug was found and fixed mid-implementation, not merely predicted.** The first
wiring attempt placed the new gate inside the `PropertyAccess() when node.target != null` case (the same
case ADR-0033's own `this.count` handling lives in) — and it never fired for `model.count` at all. Root
cause, confirmed by direct probing: Dart's own AST parses `foo.bar`, where `foo` is a bare identifier, as
a `PrefixedIdentifier`, never a `PropertyAccess` (`PropertyAccess` is reserved for a receiver
*expression* — `this.count`, `foo().count`, a cascade). `model.count`'s bare-identifier receiver reaches
the **separate** `PrefixedIdentifier()` case (line ~177), which — before this milestone — called only
`_storeMemberTarget`, never any instance-member mechanism at all. Fixed by wiring
`_externalFieldTarget` into *that* case instead (mirroring `_storeMemberTarget`'s own existing fallback
chain there), not the `PropertyAccess` case. `this` is never parsed as a `PrefixedIdentifier`'s own
prefix, so every reach from this case is structurally guaranteed to be a genuine external read — no
ternary or receiver-kind check is needed there, unlike the `PropertyAccess` case's own `this`-vs-other
split.

## 7. Target + owner consistency

Enforced explicitly (`field.enclosingElement != ownerClass` → refuse), not inferred from property-name
equality. Proven redundantly protective, live: an adversarial mutation that removed the *separate*
inheritance/superclass check (§21 below) still failed to admit an inherited field read, because this
owner-consistency check independently caught it first — the resolved field's own `enclosingElement` (the
*declaring* superclass) never equals the receiver's own class element (the subclass) for an inherited,
non-overridden member. Two independent gates protecting the identical invariant, not one.

## 8. `final` → `readonly` semantics

`readonly` is adopted as compile-time-only shape/assignment semantics — Dart's own `final` guarantee
(no reassignment after construction), never a claim of deep runtime immutability. `Object.freeze` is
never called; nothing in this milestone's own generated output touches runtime mutability enforcement at
all. Documented explicitly, not left implicit, per the governing brief's own direct question.

## 9. Structural field-shape decision

**Option A — emit every eligible public final field**, selected. `Model`'s interface gains one
`readonly` line per field satisfying the exact eligibility gate (§11) — a declaration-level
representation of the class's own eligible shape, not a usage projection (Option B, rejected: the
identical class would produce different shapes depending on which fields a given call site happens to
read, which is not a truthful *declaration* representation) and not an unconditional full-shape
requirement gated on a separate "data-only class" grammar (Option C, not adopted as a prerequisite —
see §10: field-level, not class-level, capability was chosen instead, evaluated directly and found
sufficient).

## 10. Field-level vs. class-level capability

**Field-level, selected.** A class with unrelated executable members (`int get doubled => count * 2;`,
`void doSomething() {}` — Dart §11B's own example) still gets a truthful shape for its eligible fields;
the unrelated members are independently, separately refused (`isOriginDeclaration` for the getter, the
`logic.MethodCall` refusal for the method) by mechanisms this milestone does not touch. Rejected the
class-level "every field must be eligible or none are" alternative: it would refuse `count` in
`unmodelled_class_member`'s own real fixture (which also declares `doubled`/`compute`) for no reason
connected to `count`'s own genuine, independently-provable safety — an over-restriction the evidence did
not require.

## 11. Exact field eligibility gate

All of: field-backed (`GetterElement.isOriginVariable`, never `isOriginDeclaration`); `variable.isFinal`
(real analyzer semantic API, `VariableElement.isFinal`); `!variable.isStatic`; `!variable.isLate`;
`!variable.isPrivate`; receiver class is public, non-generic, has no explicit superclass, and is not a
component/`State`/store base; field owner equals receiver class element. Every check via the real
`analyzer` 14.0.0 semantic API — never AST syntax, never name text (except the field/class privacy
convention, §19, which is textually exact for Dart by the language's own definition, not a heuristic).

## 12. Source constructor vs. generated constructor

`FieldDecl` (the declaration itself) remains the sole, authoritative source of field shape — a class's
own field-formal constructor (`Model(this.count, this.name);`) is never parsed, read, or consulted
anywhere in this milestone's own code. Confirmed directly: `logic.New` on a project class remains
refused, byte-for-byte, reconfirmed via the same real fixture used before this milestone.

## 13. Runtime instance source contract

Accepted, explicitly, as the identical structural interop boundary ADR-0034 §13 already established for
the *type*: a `Model`-typed parameter's runtime value is a plain JS object satisfying the emitted field
shape, wherever it actually comes from. This milestone changes only what reading an already-declared
property truthfully means — never what can produce one.

## 14. Direct-receiver boundary

The supported receiver remains exactly `isParameterReceiver`'s own shape (a bare, untargeted `Ref`
resolving via `scope.paramInScope`) — unchanged from M9-J. A local alias
(`final alias = model; alias.count`) is not supported: `alias`'s own `Ref` carries an ADR-28 `target`,
failing `isParameterReceiver`'s own check, falling through to the pre-existing, unchanged refusal —
documented as a known, separate limitation this milestone does not close, not silently absorbed.

## 15. Field type grammar

Reused `typeTextOf` (M9-M) unmodified for a field's own type, called identically to how a parameter's
type is lowered. Supported: `int`/`double`/`bool`/`String` and their nullable forms, a kit-provided SDK
value type (`Duration`, via `useRuntimeType` — a type-only import, deliberately not `useRuntime`, since an
interface body is a pure type position with no executable use for a runtime value import), and a
project-class field type that is itself M9-M-emittable. Not attempted: `List<T>`/`Map<K,V>` (no existing
lowering — `typeTextOf` has no collection branch, so these already, correctly, fall back to `unknown`,
unchanged from before this milestone).

## 16. Type reachability — deliberately not extended

**Bounded out, per the governing brief's own explicit allowance (§35).** A project-class-typed field
(`final Address address;`) is looked up via the identical `classOf` registry used everywhere else in
M9-M/M9-N; if `Address` happens to already be reachable through some other path (a param/return type
elsewhere), it resolves to its real name; if not, it safely falls back to `unknown` — exactly the same
truthful degradation an unsupported field type already gets, never a build error, never wrong code. No
second pass was added to chase field types into the type-reachability walk itself, avoiding the ordering
complexity a two-pass registry-then-emit split would have required for uncertain benefit — a nested
project-class field simply may render as `unknown` today, a strictly safe outcome a future milestone can
improve without revisiting this one's own correctness.

## 17. Field-declaration reachability is not value reachability

`FieldDecl.initializer` is never read anywhere in this milestone's own code — the interface-body emission
consults only `name`/`type`/`isFinal`/`isStatic`/`isLate`. Confirmed directly, live: a field initialized
by an interpolated literal in the real fixture produces its shape line with zero interaction with
whatever the initializer expression contains; no side-effecting call could appear in generated output
via this path, since nothing here ever visits `initializer` at all.

## 18. Field initializer cases

Not independently re-tested per initializer form (`= 1`, no initializer + constructor-set, `late final`)
beyond what §11/§17 already establish structurally: initializer presence and shape are never inputs to
the eligibility gate or the shape emission at all — only `isFinal`/`isStatic`/`isLate` are consulted, and
those are already directly tested. `late final` is the one initializer-adjacent case with real runtime
semantics, and it is excluded by the explicit `isLate` check (§11), backed by a new, minimal schema
addition (§25).

## 19. Mutable field boundary

`variable.isFinal` (§11) — a mutable field never gets a target, stays `BRG3013`, live-tested directly. An
adversarial mutation removing the entire final/static/late/private block confirmed this is genuinely
load-bearing: exactly the mutable-field test failed once removed (§32).

## 20. Private field boundary

Checked via the real `Element.isPrivate` semantic API — on both the field itself and the owning class —
never a `_`-prefix text heuristic on the Dart side. (The one place this ADR does use a name-text check is
the pre-existing, unmodified TypeScript-side class-privacy convention from M9-M, reused unchanged for
field names too, §11 — justified because a leading underscore genuinely *is* Dart's own privacy syntax
for a simple identifier, an exact fact of the language grammar, not a guess about semantics a name merely
suggests.)

## 21. Static field boundary

`!variable.isStatic`, checked directly — though structurally almost redundant: `Model.count`-shaped
static access never reaches `_externalFieldTarget` at all, reaching the pre-existing, separate
`_isStaticQualifier`/`_topLevelTarget` path instead (confirmed live, §4/§32's static-field test asserts
this exact structural fact rather than merely the absence of a target).

## 22. Explicit getter exclusion

The single most load-bearing negative control. `isOriginVariable` (§11) categorically excludes
`isOriginDeclaration` (an explicit getter) from ever reaching field-shape eligibility — proven via a
direct adversarial mutation (§32) reproducing exactly the hazard this exclusion prevents: with a looser
gate, `Alpha.value`/`Beta.value` (explicit getters) and, critically, `Base.value` (an
inherited/**overridden** getter — the precise dynamic-dispatch-unsafe shape ADR-0033/M9-I identified)
all silently stopped being refused.

## 23. Method exclusion

Untouched — this milestone's own code lives entirely inside the `logic.PropertyAccess`-adjacent
extraction path (`PropertyAccess` case and `PrefixedIdentifier` case); `logic.MethodCall`'s own separate
M9-J refusal is never read or modified. `model.compute()` remains `BRG3013`, reconfirmed live.

## 24. Generic boundary

`receiverType.typeArguments.isEmpty`, checked directly on the *receiver's* own static type — proven
load-bearing via adversarial mutation (§32): removing it let a generic class's own field
(`Box<int>.value`) become targeted, until reverted.

## 25. Schema decision — one small, justified addition

**`FieldDecl.isLate?: boolean` added** (`packages/uir/schema/l1.json`, `x-uir-version` 1.8.0 → 1.9.0),
mirroring `isFinal`/`isStatic`'s exact existing shape and population convention
(`declaration_extractor.dart`'s `_fields`, `member.fields.isLate` — the identical AST-syntactic style
`isFinal`/`isStatic` already use, kept consistent rather than mixed with a semantic-API check for this one
field alone). Required because `late` has no other schema representation and no name-text proxy exists
for it (unlike privacy, §20) — without it, the TypeScript-side eligibility gate could not independently
verify the identical fact the Dart-side gate already checks, violating the "one truth" requirement (§27
of the governing brief). Regenerated both language bindings; diff confirmed minimal (version/hash bump
plus the one new optional field, both languages, nothing else). No other schema field was found
necessary — `FieldDecl.type`, `.isFinal`, `.isStatic`, and the pre-existing owner-qualified `id` already
supplied everything else the eligibility gate and shape emission needed.

## 26. Implementation gate

PASS on all 34 conditions in the governing brief's own §46: the BRG3013 boundary reproduced fresh (§3);
receiver `TypeRef.target` and (newly) `PropertyAccess.target` both available and correctly distinct in
consequence (§6/§9 of ADR-0035); field-backed `GetterElement` canonicalizes to the real `FieldDecl` (§5);
owner match enforced and independently redundant (§7); M9-K/M9-L identity unchanged (reconfirmed, full
suite); generated lookup receiver-based, proven via direct code inspection showing zero new emission
code was needed (§8 of ADR-0035); a truthful structural incoming-instance contract adopted (§13); field
type represented without `any` (verified, mutation-tested); type shape and capability share one source
(the identical eligibility facts, §11, checked on both sides — Dart attaches `target`, TypeScript decides
shape inclusion, from `isFinal`/`isStatic`/`isLate`/name-privacy alone); type reachability kept separate
(§16); no constructor/getter/method execution required or shipped; mutable/private/static/generic/inherited
classes all bounded correctly and mutation-tested; local-alias gap named, not absorbed; M9-J fallback
intact and re-verified on the real fixture; M9-H BRG1310 unaffected (new negative-control test added);
M9-M type-only import behavior intact (reused unmodified); no runtime class; determinism and fixed point
both reconfirmed live; ADR written first.

## 27. Selected Outcome

**A2 — field shape plus bounded receiver-based reads.** Landed in full: `Model.count`/`Model.name` are
real, `readonly`, receiver-read fields; every other project-class member shape remains exactly as refused
as before this milestone.

## 28. Analyzer changes

`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`: new `_externalFieldTarget`
function, wired into the `PrefixedIdentifier()` case (the correct AST shape for a bare-identifier
external receiver, §6). `dart/bridge_analyzer/lib/src/session/extract/declaration_extractor.dart`:
`_fields` gains `isLate` population.

## 29. Compiler/N-pass changes

None. `git diff` against `packages/compiler/` is empty for this milestone.

## 30. Generator changes

`packages/generators/react/src/internal/emit/functions.ts`: the class-interface emission loop (M9-M)
gains per-field eligibility filtering and `readonly` line generation, plus a `classOf` closure for a
field's own project-class-typed field (reusing the identical same-file/cross-file split established
everywhere else in M9-M). `isUnmodelledMemberReceiver`/`isParameterReceiver` (`expression.ts`) are
**unchanged** — the new `PropertyAccess.target` presence alone is sufficient to bypass the existing,
unmodified refusal condition's own first conjunct, exactly as designed (ADR-0035 §24).

## 31. Runtime changes

None. `git diff` against `packages/runtimes/` is empty.

## 32. Adversarial mutations

Five concrete mutate → test → revert cycles, each independently confirmed and cleanly reverted:

- **Drop `isOriginVariable`** (explicit-getter exclusion, in isolation): **no live failure** — the
  owner-consistency and `isFinal` checks on the getter's own synthetic backing variable independently
  caught it. A genuine, welcome finding of defense-in-depth, not a wasted mutation.
- **Drop `isFinal`/`isStatic`/`isLate`/`isPrivate` (the whole field-property block)**: the mutable-field
  test failed (1/14) — confirmed load-bearing.
- **Drop the superclass/inheritance check, in isolation**: **no live failure** — owner consistency
  (§7) independently caught the inherited-field case too. A second, independent defense-in-depth finding.
- **Drop the generic-instantiation check**: the generic-class test failed (1/14) — confirmed load-bearing.
- **The landmine mutation — make `_externalFieldTarget` unconditionally succeed** (all eligibility gates
  bypassed, direct call to `_instanceMemberTarget`): reproduced against the real `unmodelled_class_member`
  fixture, 3 of 7 build-proof tests failed, specifically including *"an inherited/overridden getter is
  refused, never statically bound"* — the exact dynamic-dispatch-unsafe shape this milestone's own
  eligibility gate exists to prevent. This is the concrete, load-bearing proof that the gate as a whole
  (not any one single check) is what keeps the M9-J boundary sound.

All five reverts confirmed via `git diff` returning empty against the pre-mutation file.

## 33. Real generic fixture

`fixtures/apps/immutable_field_reads/` — `lib/model.dart` (`class Model { final int count; final String
name; Model(this.count, this.name); }`), `lib/main.dart` (a trivial, unrelated `RootScreen` giving the
generated router a real entry point — a pre-existing, unrelated zero-route generator gap this milestone
worked around rather than fixed, matching M9-M's own identical workaround — plus the real `Home`
component under test, a bare, unreferenced component with a direct, required, non-nullable `model`
parameter reading both fields). Neutral naming throughout; zero application-specific names; zero
construction of `Model` anywhere in the fixture (avoided entirely, since construction remains refused).

## 34. Real build proof

Real Dart → real analyzer → real raw UIR → real `bridge normalize` (N1–N11, unmodified) → real generator
→ real TypeScript → real `tsc --strict`. Inspected the exact generated code directly:

```ts
// src/generated/dart/app/lib/model.ts
export interface Model {
  readonly count: number;
  readonly name: string;
}

// src/components/home.tsx (excerpt)
import { type Model } from '@/generated/dart/app/lib/model';
export interface HomeProps {
  readonly model: Model;
}
export function Home(props: HomeProps) {
  return <Column>
    <Text>{`${props.model.count}`}</Text>
    <Text>{props.model.name}</Text>
  </Column>;
}
```

No `class` keyword, no constructor, no helper function, no static dispatch, no `any`, no runtime import
for the type-only `Model` dependency — confirmed directly, and by dedicated test assertions.

## 35. Runtime/semantic proof

`tsc --strict` passing is necessary but not sufficient on its own — additionally confirmed by exact
generated-code assertions (not merely "it compiles"): `props.model.count` and `props.model.name` appear
literally, verbatim, in the emitted source; the receiver (`props.model`) is a plain property path, never
wrapped in a helper call; no `Model_count`/`Model.count`-shaped static-dispatch spelling appears anywhere;
no `any` appears anywhere in the emitted component. A live browser/JS-execution proof (`{count: 7, name:
"A"}` observed as `7`/`A`) was not additionally built — the existing infrastructure this test suite
already relies on (real `tsc` against the real, unmocked runtime kit, exact source-text assertions) was
judged sufficient without introducing new tooling, matching the governing brief's own "do not introduce a
large browser/testing framework solely for this" instruction.

## 36. Field initializer must not execute

Structurally guaranteed, not merely tested: `FieldDecl.initializer` is never read by any code this
milestone added (§17). No fixture exercising a side-effecting initializer was separately built, since the
guarantee follows directly from the code never visiting that field at all — confirmed by reading, not
assumed.

## 37. M9-J refusal migration — reconfirmed on the real fixture

`unmodelled_class_member`'s own golden was regenerated and its build-proof test suite rewritten (not
weakened) to describe the new, precise capability: `model.count` and `parent.child.name` (a nested
field-chain, crossing two project classes) are now genuinely allowed; `model.doubled`, `model.compute()`,
`alpha.value`, `beta.value`, and `base.value` (an inherited/overridden getter) all remain exactly as
refused as before. The hand-authored `unmodelled_class_member_refusal.test.ts` needed zero changes — its
own synthetic `PropertyAccess` nodes never carry a `target` field at all, so it tests the generator's own
refusal classifier in isolation, structurally unaffected by this milestone's extraction-layer change.

## 38. M9-L provenance regression

Reconfirmed live, directly: `count` (implicit), `this.count` (explicit), and `model.count` (external,
this milestone) all resolve to the byte-identical `FieldDecl` id for the same declared field — a
dedicated test proves all three in one fixture.

## 39. M9-K identity regression

Reconfirmed via the full, unchanged Dart suite (452/452): `Alpha.value != Beta.value` (for fields,
`isOriginVariable`), same-content fields distinct across classes, repeated reads share one target, no new
content-derived fallback introduced anywhere in this milestone's own code.

## 40. M9-M type regression

Reconfirmed live: type-only classes without eligible fields still emit `{}` correctly (unchanged code
path for that case); repeated type references remain stable; cross-file type imports remain stable; no
runtime class; no `any`; type reachability's own fixed-point property is untouched (this milestone adds
no new reachability edges at all, §16).

## 41. M9-H BRG1310 regression

A dedicated new test (`final MissingType value; Model(this.value);`) confirms `BRG1310` fires before any
M9-N eligibility logic ever runs — unchanged extraction order, reconfirmed directly.

## 42. Full regression matrix

Full Dart suite: 452/452 (438 pre-M9-N + 14 new). Full TypeScript suite: 394/394 (389 pre-M9-N + 5 new).
`just ci`: exit 0, run twice (mid-milestone and final). Every M8/M9 milestone's own dedicated test file is
part of these totals, unmodified in content except the deliberate, documented `unmodelled_class_member`
rewrite (§37), all passing.

## 43. Validation

- `dart test` (full): 452/452, zero `[E]`.
- `pnpm --filter @bridge/gen-react test` (full): 394/394.
- `just ci`: exit 0.
- `just determinism`: byte-identical across every run, confirmed twice (once mid-milestone, once final),
  no kill/retry needed either time.
- `bridge validate` on `immutable_field_reads`: deterministic ✓, fixed point ✓, build succeeded.
- Real `tsc --strict` (via `typecheckEmitted`): zero errors against the real, unmocked runtime kit.
- `git diff --check`: clean.
- FlutterBridge-only boundary: zero new Continuum references anywhere in this milestone's diff.
- `fixtures/apps/hello_bridge/analysis_options.yaml`'s pre-existing drift remains untouched, unstaged.

## 44. Silent-wrong-code audit

Field read allowed where type shape lacks the field — not possible; both derive from the identical
eligibility facts (§11), and a dedicated build-proof test asserts the shape contains exactly what is
read. `any` introduced — not possible, mutation-tested (inherited from M9-M's own established
never-`any` discipline; this milestone adds no new `any` opportunity). Getter/method silently permitted —
directly disproven by the landmine mutation (§32) and the real fixture's own updated, still-comprehensive
negative coverage. Mutable/private/static field silently permitted — each independently checked via real
semantic APIs, mutation-tested for the mutable case. Constructor emitted — not possible; `logic.New`
untouched, reconfirmed live. Field initializer executed — not possible; never read (§17/§36). Owner
mismatch silently accepted — explicitly checked, redundantly protective (proven via the inheritance
mutation's own unexpected non-failure, §32). Nested field-type reachability silently expanding scope —
deliberately bounded out (§16), never attempted. Late field silently permitted — excluded via the new
`isLate` schema field, checked on both sides. Runtime import emitted for a type-only field dependency —
not possible; `useRuntimeType` used explicitly, never `useRuntime`, for this exact reason.

## 45. FlutterBridge-only boundary

Verified: zero Continuum imports, dependencies, paths, fixtures, or branches anywhere in this milestone's
diff. `fixtures/apps/immutable_field_reads` uses neutral, generic naming throughout.

## 46. M9-O

Not started. No constructor execution, no explicit getter/method execution, no mutable-field support, no
inheritance/dispatch lowering, no generic class support — all remain exactly as refused as they were
before this milestone.

## 47. Recommended next milestone

Left to evidence, not preselected. With both truthful field-read provenance and a working, tested
generator-side capability boundary now established end to end, the strongest-supported next steps are
either (a) a bounded, side-effect-free explicit-getter execution milestone (the getter-execution
prerequisite M9-I originally deferred, now closer given this milestone's own field-eligibility
infrastructure directly generalizes — a getter's own memoization/dispatch-safety contract would still
need independent proof, ADR-0035 §28), or (b) extending field-type reachability to chase nested
project-class field types properly (§16's own deliberately deferred scope). Neither is started here.

## 48. Final git status / HEAD vs. origin/main

Committed and pushed after this doc; see the commit message for the exact hash. Working tree clean aside
from the pre-existing, intentionally untouched `hello_bridge/analysis_options.yaml` drift.
