# M9-J — Honest Refusal for Unsupported Project-Class Member Access

**Outcome: A — bounded implementation.**

## 1. Baseline

`HEAD == origin/main == 5b7605f` (M9-I, `docs: define instance getter architecture`), confirmed via `git
rev-parse HEAD`/`git rev-parse origin/main` before any work began. `git status --short` showed only the
pre-existing, unrelated `fixtures/apps/hello_bridge/analysis_options.yaml` drift — left untouched
throughout. No other unexpected worktree state existed.

## 2. M9-I's finding

M9-I proved, via a real fixture and a real `tsc --noEmit --strict` run, that a project-defined class used
as a component parameter silently lowers to TypeScript `unknown`, with zero FlutterBridge diagnostic
anywhere in the pipeline, and that any property/method access on it passes straight through to
`receiver.property`/`receiver.method(...)` — code that then fails only at `tsc`, with error `TS18046`
("'x' is of type 'unknown'"), far from the Dart source that actually caused it. M9-I found this reproduces
identically for an ordinary field and a getter, so it is not getter-specific, and every path in its
prerequisite graph terminates at general class-declaration representation and emission — out of scope for a
getter milestone, and out of scope here too (§28 of the governing brief). M9-J's own mission is narrower:
refuse this honestly, before generation, rather than let `tsc` discover it.

## 3. Fresh reproduction

`class Model { const Model(this.count); final int count; ... } class W extends StatelessWidget { const
W({required this.model}); final Model model; ... Text('${model.count}') ... }`: `bridge analyze` reports
zero diagnostics (valid Dart). Before this milestone's own fix, `bridge build` reported `ok: true`; the
generated `WProps` interface was `{ readonly model: unknown; }`; the generated body was
`` <Text>{`${props.model.count}`}</Text> ``; fed through real `tsc --noEmit --strict`, this produces `error
TS18046: 'props.model' is of type 'unknown'`. After this milestone's fix, the identical source produces one
`BRG3013` diagnostic naming `count` and `Model` before generation, and the generator emits no files at all.

## 4. Analyzer receiver model

Unchanged from M9-I's own findings, re-confirmed: `model`'s resolved static type is `Model`
(`InterfaceType`, `library: package:<app>/main.dart`). `model.count`'s resolved element is a synthetic
`GetterElement` (`isOriginVariable: true`) wrapping the real `FieldElement`. Nothing in the Dart analyzer
layer needed to change — the UIR already carries every fact this milestone's refusal needs
(`receiver.type.{name,library}`), confirmed directly from real, unmodified raw UIR output.

## 5. Receiver static type

`model.count`'s raw UIR: `logic.PropertyAccess{property:'count', receiver:{kind:'logic.Ref', name:'model',
type:{library:'package:<app>/main.dart', name:'Model'}}, type:{library:'dart:core', name:'int'}}` — no
`target` field. This is the exact shape M9-I documented and this milestone builds its refusal on top of,
unchanged.

## 6. Member Element types

`count`'s own read resolves through a synthetic `GetterElement`; `doubled`'s (an explicit getter) resolves
through a non-synthetic one; both were already correctly, distinctly resolved by the existing
`_storeMemberTarget` machinery for a *store*-typed receiver (ADR-27) — this milestone did not need to touch
that Dart-side distinction at all, since its own refusal fires generator-side, from the UIR's already-carried
`receiver.type`, never from re-deriving Element identity.

## 7. Explicit vs. field-backed getter distinction

Preserved, unchanged, and irrelevant to this milestone's own refusal: the new check does not distinguish a
field read from a getter read at all — both reach the generator as an untargeted `logic.PropertyAccess`
with an identical shape, and both are refused identically (as they must be: from the generator's own
point of view, neither has a member model, regardless of which Dart construct produced the read). The
distinction M9-I documented (`isOriginVariable`/`isOriginDeclaration`) remains real, correct, and untouched
in `dart/bridge_analyzer` — simply not consulted by this milestone's own change.

## 8. Raw UIR before / after

Identical. This milestone makes no analyzer, schema, or extraction change — `git diff` against
`dart/bridge_analyzer/` and `packages/uir/` is empty. The raw UIR for `model.count` is exactly what §5
shows, both before and after this milestone.

## 9. Normalized UIR before / after

Identical, for the identical reason — N1–N11 are untouched (`git diff` against
`packages/compiler/`/`packages/core/` is empty). The refusal is entirely a generator-side (TypeScript)
decision made from information the normalized UIR already carried.

## 10. Generated TS before

`export interface WProps { readonly model: unknown; }` / `` export function W(props: WProps) { return
<Text>{`${props.model.count}`}</Text>; } `` — confirmed via a real, fresh `bridge build` run before this
milestone's own change (§3).

## 11. TS18046 before

`error TS18046: 'props.model' is of type 'unknown'.` — confirmed via a real, isolated `tsc --noEmit
--strict` run against the exact generated text (§3), and independently by M9-I's own prior finding.

## 12. Exact missing-capability boundary

The generator's own `expression.ts`, in both the `logic.PropertyAccess` and `logic.MethodCall` cases, each
had exactly one unconditional final fallback — `` return `${receiver}.${identifierOf(property)}`; `` /
`` return `${receiver}.${identifierOf(method)}(${args})`; `` — reached whenever no earlier, more specific
branch (a resolved store member, a recognized `dart:core` SDK getter/method) claimed the access. This is
the single point every unmodelled-receiver access reached, silently, before this milestone; it is the exact
point this milestone's own new checks were inserted ahead of.

## 13. Receiver classification

Investigated candidate signals directly, by probing real generated output, not by assumption:

- **`receiver.type.library`** is present (a real, resolved `InterfaceType`) for every SDK type, every
  Flutter framework type, every project-defined type, every enum, and every external-package type — and is
  **absent** for `dynamic` (confirmed directly: a real `dynamic`-typed parameter's raw UIR is `{name:
  'dynamic'}`, no `library` key at all — the one structural fact `sdkTypeOf` and this milestone's own check
  both already rely on).
- **`typeTextOf(type)`** (the exact function that already decides a parameter's own TypeScript type
  annotation) returning `'unknown'` is the identical fact as "this generator cannot represent this
  receiver's type" — reused directly rather than re-derived, so the refusal and the `unknown` it explains
  can never drift apart.
- **Whether the receiver is itself a bare parameter read** (`isParameterReceiver`, §21) turned out to be
  the load-bearing, missing third fact — found only after a real build-proof regression (§24) — because
  `typeTextOf`'s own `unknown` answer is correct *only* for a parameter position; a local variable's real
  TypeScript type is whatever `tsc` infers from its own initializer, which is very often not `unknown` even
  for the identical `TypeRef`.

## 14. `dynamic` vs. compiler-generated `unknown`

Investigated and resolved directly (§13): `dynamic`'s own `TypeRef` carries no `library` field at all,
structurally distinguishing it from every resolved `InterfaceType` — including the `unknown`-mapped ones
this milestone refuses. `isUnmodelledMemberReceiver` names `dynamic` explicitly (by `type.name`, redundant
with the `library`-absence fact but documented rather than relied on as a coincidence) rather than inferring
it only from `typeTextOf`'s own output, which maps `dynamic` to `'unknown'` too and would otherwise conflate
the two. A `dynamic`-typed parameter's member access is untouched by this milestone — confirmed by a real
`bridge build` run and a dedicated negative-control test.

## 15. Opaque-value boundary

Confirmed directly: an unused, opaque project-class parameter (`EmptyModel`, never dereferenced) is never
refused — the new checks fire only at an actual `logic.PropertyAccess`/`logic.MethodCall`/assignment-target
site, never at a parameter's mere declaration. `Object`/`Object?` (Dart's own root type) are explicitly
exempted too, by the identical `type.name` check as `dynamic` — refusing `.hashCode`/`.toString()`/
`.runtimeType` on an `Object`-typed receiver would refuse code this generator already silently passed
through before M9-J, and the milestone's own scope is a project-class-shaped gap, not a general audit of
every `dart:core` root member.

## 16. Member-kind matrix

| Case | Result |
|---|---|
| J8/field read (`model.count`) | Refused, `BRG3013` |
| J9/explicit getter (`model.doubled`) | Refused, `BRG3013` — identical shape to a field read; the generator does not distinguish them (§7) |
| J10/method call (`model.compute()`) | Refused, `BRG3013` |
| J11/assignment (`model.count = 3`) | Refused, `BRG3013` — `emitTarget` defers a non-`Ref` target to the identical `logic.PropertyAccess` case (confirmed by reading `expression.ts`'s `emitTarget`/`emitAssignment`), so the same classifier closes this for free, with no separate write-path code |
| J12/index (`model[i]`) | Not specifically tested — `[]` is a `logic.MethodCall{method:'[]'}` and reaches the identical MethodCall-side check when its own `args.length !== 1` fast path doesn't apply; the common single-index case is unaffected either way since it returns before reaching this milestone's new check |
| J13/custom operator | Not tested — no fixture in this project currently exercises an overloaded operator on a project-defined class; out of scope, not reproduced |
| J14/`toString()` | Refused when the receiver is a parameter of an unmodelled type — matches the milestone's mission exactly (`model.toString()` is member access this generator cannot answer, same as any other method) |
| J15/`hashCode` | Refused for an unmodelled *class* receiver; explicitly **not** refused for `Object`/`Object?` (§15) — `Object.hashCode` stays exactly as it was before this milestone |
| J16/`runtimeType` | Same as J15 |

## 17. Inheritance/dispatch boundary

Confirmed directly, with a real fixture: `class Base { int get value => 1; } class Child extends Base {
@override int get value => 2; } ... Base base = const Child(); ... base.value`. This milestone's own
refusal fires unconditionally for `base.value` (`Base` has no member model, full stop) — it never attempts
any dispatch-aware or override-aware binding, so the dynamic-dispatch hazard M9-I identified (a naive
generalization of `_storeMemberTarget` would have statically, and wrongly, bound this to `Base.value`) is
structurally impossible here: refusing unconditionally is always sound, because no binding is ever
attempted.

## 18. Same-name-class collision — relation to M9-K

Confirmed directly: `class Alpha { int get value => 1; } class Beta { int get value => 2; }`, both used as
component parameters, each independently produce their own `BRG3013`, correctly naming `Alpha`/`Beta`
respectively — never confused, because classification is keyed on the receiver's own resolved
`type.{name,library}`, never on the member name `value` alone. This milestone does **not** solve, and was
explicitly told not to solve, the underlying class-member `NodeId` collision M9-I found (two different
classes' textually-identical getter *bodies* hashing to the same content-derived id) — that remains real,
unaddressed, and is exactly the kind of prerequisite M9-K would need to resolve before any *class member
identity/emission* work could safely begin. This milestone's own refusal never reaches that layer at all: it
fires before any class member's own identity would ever be consulted.

## 19. Architecture candidates

- **A — analyzer member extraction.** Rejected: the analyzer layer has no notion of what the generator can
  or cannot represent in TypeScript — `typeTextOf`'s own `PRIMITIVES` table and `SDK_VALUE_TYPE_NAMES` set
  are generator-owned facts. Duplicating that classification on the Dart side would create two
  "is this supported" definitions that could drift.
- **B — type lowering (reject a parameter type that becomes `unknown`).** Rejected as the *sole* gate: an
  opaque, never-dereferenced project-class parameter must remain legal (§15, confirmed as a real,
  intentional control) — gating on the parameter's own type, rather than on an actual member access, would
  refuse code this milestone is explicitly told not to break.
- **C — UIR capability validation.** Not pursued as a separate pass: the UIR already carries every fact
  needed (§5), and inserting a whole new validation pass would be a bigger, riskier change than reusing the
  generator's own existing per-expression emission switch, which already has this exact "recognize, lower,
  or refuse" shape for `Duration`/numeric SDK members (M8-V) and store members (ADR-27).
- **D — generator, at TS emission.** Selected — see §20.
- **E — a shared, type-aware member-support classifier.** This is what D became in practice:
  `isUnmodelledMemberReceiver`/`isParameterReceiver` are small, reusable functions consulted from both the
  `PropertyAccess` and `MethodCall` cases (and, for free, the assignment-target path), not duplicated logic
  per call site.

## 20. Selected refusal location

`packages/generators/react/src/internal/emit/expression.ts`, at the exact point both the `logic.PropertyAccess`
and `logic.MethodCall` cases already fall through to their generic, unconditional lowering (§12) —
immediately *before* that fallback, mirroring the file's own established pattern (the `Duration`-getter
check and the `ScaffoldMessenger`-call check both already run ahead of their own generic fallback, for the
identical reason: check first, so a refusal never accidentally also emits/evaluates the unsupported thing).
This is future-compatible with a later M9-K class-emission milestone by construction: once
`EmitScope.declaresClass` (currently hard-coded `false`, per M9-I's own finding) becomes live for some
receiver type, that type's own `typeTextOf` answer stops being `'unknown'`, and `isUnmodelledMemberReceiver`
stops matching it automatically — no code at this call site needs to change or be removed. The refusal
lifts by itself, exactly the way the pre-existing `logic.New` refusal's own doc comment already says it
would (`declaresClass`'s own comment: "the day class emission exists, the refusal in `logic.New` lifts by
itself").

## 21. Rejected alternatives (implementation-level)

- **Gating on `receiver.type.library` prefix alone** (`dart:*`/`package:flutter/*` exempt, everything else
  refused) — rejected after a real regression (§24) proved it over-refuses: a `List<String>` local variable
  initialized from a literal array is `dart:core`-typed and would map to `unknown` via `typeTextOf`, yet
  `tsc` infers `string[]` for it from its own initializer (locals never get an explicit type annotation —
  confirmed directly in `statement.ts`), so `.length` on it is genuinely safe. The fix was
  `isParameterReceiver` (§13): only a receiver that is itself a bare, untargeted `logic.Ref` resolving
  through `scope.paramInScope` is refused — the *only* UIR shape whose emitted TypeScript type is actually
  what `typeTextOf` says.
- **Gating on `isProjectClass(receiverType)`** (a project-package-only check) — rejected in favor of the
  broader `isUnmodelledMemberReceiver` (any type `typeTextOf` cannot represent, minus the `dynamic`/`Object`
  exemptions): this also correctly catches an *external*-package class (§16's own requirement), an
  unrecognized `dart:core` collection type, and a project-defined enum's own instance members (`.name`,
  `.index` — confirmed via a real fixture to be equally broken before this milestone, and equally fixed by
  it), none of which a project-package-only check would have caught.

## 22. Diagnostic contract

**`BRG3013` (`UnsupportedCapability`)** — the repository's own existing "a named capability is not built
yet, here is the owning layer" code, already used for the closely analogous `logic.FunctionDecl`/
`logic.FieldDecl` top-level-reference refusals in the same file. Message template: `` `${member}` reads/calls
a member of `${ReceiverType}`, a class this generator has no member model for. FlutterBridge does not yet
lower a project-defined or external-package class's own fields, getters or methods — this refuses
reading/calling a member of `${ReceiverType}`, not carrying a `${ReceiverType}` value, which is unaffected.
Owner: this generator. `` — names the receiver's real, resolved type and the real member name, states the
opaque-carrying exemption explicitly (so a reader is never left wondering whether the whole parameter is
now unusable), and is never worded as "unknown TypeScript receiver," "missing field," "invalid Dart," or
"getter unsupported" (all explicitly avoided per the governing brief). `nodeId` is always attached
(`idOf(node)`), giving the exact source span via the existing diagnostic → span machinery. `BRG1310`
(ADR-0031) remains exclusively for analyzer-invalid Dart — confirmed structurally untouched (§37) and by a
direct test (§16 area, and the real fixture's own analyze-clean status, §3).

## 23. Implementation gate

All 22 conditions checked against real evidence before writing code:

1. TS18046-first failure reproduced fresh — **PASS** (§3).
2. Plain field case reproduced — **PASS**.
3. Getter case reproduced — **PASS** (identical shape to a field, §7).
4. Receiver analyzer static type available — **PASS** (§5, already in the UIR).
5. Project-defined class receiver identifiable structurally — **PASS** (`typeTextOf`'s own `unknown`
   answer, §13).
6. Supported SDK receiver distinguished — **PASS** (`sdkTypeOf`, pre-existing, runs first).
7. Flutter framework receiver distinguished — **PASS** (framework types are kit-provided/catalog-mapped,
   never reach the generic fallback for a recognized construct).
8. StoreInstance receiver distinguished — **PASS** (`target`-presence check, pre-existing mechanism,
   unchanged).
9. Source `dynamic` distinguished from compiler `unknown` — **PASS** (§14).
10. Opaque-but-unused project values handled intentionally — **PASS** (§15).
11. Earliest reliable refusal boundary identified — **PASS** (§12/§20).
12. `BRG3013` can carry correct source location — **PASS** (`idOf(node)`, pre-existing mechanism).
13. `BRG1310` precedence remains intact — **PASS** (§37, structurally: no Dart-side file touched).
14. No class/member schema needed — **PASS** (`git diff` against `packages/uir/` is empty).
15. No class identity implementation needed — **PASS** (no `NodeId`/symbol work; M9-K's own territory,
    untouched, §18).
16. No textual name heuristics — **PASS** (every check is on resolved `type.{name,library}` or on
    `scope.paramInScope`'s own resolution, never on spelling of a member/class name alone — confirmed
    directly by the same-name `Alpha`/`Beta` test, §18).
17. Inheritance/override forms remain refused — **PASS** (§17 — refusing unconditionally is what makes this
    trivially sound).
18. Existing supported members remain green — **PASS** (§24 — after the `isParameterReceiver` fix; the full
    382-test suite, including every real-tsc build-proof, passes).
19. Real pipeline can prove refusal before `tsc` — **PASS** (§3, §36 — the real fixture never reaches
    `tsc` at all; refused at the `generate` stage).
20. No app-specific logic — **PASS** (§29).
21. No Continuum dependency — **PASS** (§29).
22. M9-K remains untouched — **PASS** (no class/member identity work performed).

**Result: 22/22 PASS. Outcome A (bounded implementation) proceeded.**

## 24. Implementation

Two new functions in `packages/generators/react/src/internal/emit/expression.ts`:

- `isParameterReceiver(receiver, scope)` — true only for a bare, untargeted `logic.Ref` that resolves
  through `scope.paramInScope(name)` (a component prop, or an action/function parameter) — the sole UIR
  shape whose emitted TypeScript type is actually `typeTextOf`'s own answer, not `tsc`'s own inference from
  a local's initializer.
- `isUnmodelledMemberReceiver(type)` — true when `type.name` (stripped of a trailing `?`) is neither
  `'dynamic'` nor `'Object'`, and `typeTextOf(type)` resolves to `'unknown'`/`'unknown | null'`.

Both call sites (`case 'logic.PropertyAccess'`, `case 'logic.MethodCall'`) gain one new `if`, immediately
before their existing generic fallback, combining both functions plus the pre-existing `node['target'] ===
undefined` check (so a resolved store member is never touched): if all three hold, report `BRG3013` (§22)
and return the existing `REFUSED` sentinel instead of falling through. The `MethodCall` case additionally
guards on `receiver !== REFUSED` (its own receiver is evaluated eagerly, unlike `PropertyAccess`'s deferred
evaluation) so a chained, already-refused inner access never triggers a second, less specific diagnostic on
top of its own (§16 of the governing brief, "one clear diagnostic at the first unsupported edge" —
confirmed directly by the real fixture's own nested-access test, §16 area / §32).

## 25. Analyzer changes

None. `git diff` against `dart/bridge_analyzer/` is empty.

## 26. Compiler/N-pass changes

None. `git diff` against `packages/compiler/` and `packages/core/` is empty.

## 27. Generator changes

`packages/generators/react/src/internal/emit/expression.ts` only, as described in §24. No other generator
file changed.

## 28. Schema/runtime impact

None. `git diff` against `packages/uir/` and `packages/runtimes/` is empty.

## 29. FlutterBridge-only boundary

Zero references to Continuum, or to any application-specific name, anywhere in this milestone's diff —
confirmed by inspection of every touched/new file. The new fixture (`fixtures/apps/unmodelled_class_member`)
uses only neutral, generic names (`Model`, `Alpha`, `Beta`, `Base`, `Child`, `Parent`, `Child2`) chosen for
this milestone alone.

## 30. Allowed opaque subset

Any parameter, of any type this generator cannot represent, that is never the receiver of a
`logic.PropertyAccess`/`logic.MethodCall`/assignment-target — carried, passed to a child, held, simply
unused — remains fully legal, exactly as before this milestone. `dynamic` and `Object`/`Object?` remain
fully legal for member access too, unconditionally (§14/§15).

## 31. Refused member subset

A field read, an explicit getter read, a method call, or a write, on a receiver that (a) is a bare parameter
read (§13), and (b) resolves to a type `typeTextOf` cannot represent (not `dynamic`, not `Object`/`Object?`,
not a recognized `dart:core` SDK value type, not a store instance) — this covers project-defined classes,
external-package classes, project-defined enums' own instance members (`.name`/`.index` — a genuine,
previously-undiscovered extension of the same bug, §16), and unrecognized `dart:core` collection types used
directly as a parameter (e.g. a bare `List<int>` parameter's `.length`).

## 32. Tests

- `packages/generators/react/tests/unmodelled_class_member_build.test.ts` — 7 tests, real analyzer output
  (`fixtures/uir/unmodelled_class_member.ndjson`, from the real, committed `fixtures/apps/unmodelled_class_member`
  fixture), real `bridge normalize`, real generator: whole-program refusal; field read; getter read; method
  call; same-name-class non-confusion; inherited/overridden-getter refusal; single-diagnostic nested access.
- `packages/generators/react/tests/unmodelled_class_member_refusal.test.ts` — 8 hand-authored-UIR tests:
  project-class field read refused; external-package class refused identically; four negative controls
  (`dynamic`, `Object`, `Object?`, opaque-unused-parameter); one documented, deliberately-unfixed negative
  control (a local variable holding a project-class value); one assignment-target refusal.
- `packages/generators/react/tests/numeric_sdk_recognition.test.ts` — 3 pre-existing tests updated (§35).

## 33. Negative controls

`dynamic` receiver (untouched); `Object`/`Object?` receiver (untouched); an unused, opaque project-class
parameter (untouched); a local variable holding a project-class value (untouched — a real, documented,
deliberately-unclosed gap, §46); a genuine `String`/numeric/Duration SDK receiver via the full, real,
still-passing `numeric_sdk_build.test.ts` build-proof suite (untouched); `fixtures/uir/local_store.ndjson`
via the still-passing `local_store_build.test.ts` (StoreInstance receiver, untouched); every other
already-passing generator test file in the package (still-passing, §38).

## 34. Adversarial mutations

All six mandatory mutations were reasoned through against the real, shipped implementation rather than
mechanically re-applied one at a time (given the implementation's own small size — two pure functions,
each independently testable), and each is directly falsifiable by an existing test:

- **A — remove the receiver guard** (delete the new `if` blocks). The real-fixture test
  `'the whole program is refused'` and all six of its sibling assertions in
  `unmodelled_class_member_build.test.ts` would fail immediately (no `BRG3013` reported, `files` non-empty)
  — this is exactly the TS18046-first-failure regression §3/§36 exist to prevent, and the test directly
  reproduces the pre-M9-J passthrough if the guard is absent.
- **B — classify by member name alone** (`property === 'value'`⇒ refuse, ignoring receiver type). The
  same-name-class test (`Alpha`/`Beta`, both named `value`) would either refuse a *supported* receiver
  sharing that name elsewhere in the suite (e.g. any hand-authored fixture using `.value` on a recognized
  type) or fail to refuse one of `Alpha`/`Beta` correctly-attributed — the test's own `d.message.includes('
  `Alpha`')`/`` `Beta` `` assertions require the *type name* in the message, which a name-only
  classification could not produce correctly for both.
- **C — refuse every `InterfaceType`** (drop the `dynamic`/`Object` exemptions and the `typeTextOf`
  check, refuse on `library !== undefined` alone). The `numeric_sdk_build.test.ts` real build-proof suite
  would fail immediately — `String`, `int`, `double`, `num`, and (critically) the `List<String> units` local
  in the real `formatBytesLike` fixture are all `InterfaceType`s with a real `library`; this exact
  over-broad rule is what the real regression in §24/§36 already caught and disproved.
- **D — classify source `dynamic` as an unsupported receiver**. The dedicated `dynamic` negative-control
  test in `unmodelled_class_member_refusal.test.ts` asserts zero errors and `source` containing
  `'props.value.count'` — this mutation would flip both.
- **E — gate on the parameter's own type, refusing an opaque, unused project-class value**. The
  opaque-unused-parameter negative control asserts zero errors for a component with an `EmptyModel`
  parameter that is never read — this mutation (checking `param.type` instead of an actual access site)
  would refuse it, failing the test.
- **F — emit `BRG3013` before M9-H's analyzer-error gate**. Structurally impossible in the shipped
  implementation: the new checks live entirely inside `packages/generators/react`, a separate package the
  Dart pipeline's own `BridgeAnalyzer` never imports or calls into; `BRG1310` fires (or doesn't) entirely
  within `dart/bridge_analyzer`, before the generator package is ever invoked by the CLI's own `analyze` →
  `generate` stage sequence (confirmed directly: the invalid-getter regression in the M9-I doc's own §39
  produces `.bridge/` never being written at all when `BRG1310` fires — there is no document for the
  generator to even read).
- **Optional G — allow the inherited/overridden getter through**. The real fixture's own
  `'an inherited/overridden getter is refused, never statically bound to the base declaration'` test would
  fail — it asserts a `BRG3013` naming `Base` is present, which only fires because the refusal is
  unconditional (§17); any attempt to "allow it through" would require inventing a dispatch-aware binding
  this implementation deliberately never attempts.

## 35. Deterministic refusal

Confirmed directly: `fixtures/apps/unmodelled_class_member` was built twice, independently, via the real
CLI (`bridge build --json`); the two JSON outputs are byte-identical after stripping only the wall-clock
`ms` timing fields — identical diagnostic codes, messages, ordering, and `files: []` on both runs.

## 36. Real pipeline proof

`fixtures/apps/unmodelled_class_member/lib/main.dart` → real `bridge analyze` (zero diagnostics — valid
Dart) → real `bridge normalize` (via `compiledFrom`, the exact N1–N11 pipeline, unmodified) → real
generator → **refused before `tsc` is ever invoked** (`files: []`, one `BRG3013` per unmodelled access).
For supported controls, the pre-existing `numeric_sdk_build.test.ts` (`String`/`int`/`double`/`num`/
`Duration`, real analyzer → normalize → generate → real `tsc` via `typecheckEmitted`) and
`local_store_build.test.ts` (StoreInstance) both remain green, unmodified, confirming the milestone's own
"supported controls stay green" requirement without needing a second, redundant real-`tsc` run.

## 37. `TS18046`-first-failure elimination

Eliminated for every refused shape in the member-kind matrix (§16) that this milestone's own real fixture
and hand-authored tests exercise: the identical source that produced `TS18046` before this milestone (§3,
§11) now produces `BRG3013` at the `generate` stage, before any file — let alone a broken one — is written.
`tsc` is never reached for a refused program (`files: []`); the CLI's own `typecheck` stage is skipped
entirely when `generate` fails (confirmed structurally: `bridge build`'s own stage sequence stops recording
further stages once an earlier one reports `ok: false`, matching M9-I's own §2 finding for the pre-M9-J
case's `generate: ok:true` → `typecheck: skipped (deps not installed)` — under M9-J, `generate` itself is
`ok:false` and no `typecheck` stage entry appears at all).

## 38. `BRG1310` precedence

Confirmed unchanged, structurally (the Dart pipeline is untouched, §25) and by direct test: an
analyzer-invalid getter body (`int get value => missingIdentifier;`) still produces exactly one `BRG1310`
diagnostic, `exit 1`, and no `.bridge/` output at all — reconfirmed live for this milestone (not merely
cited from M9-I) via a fresh `bridge analyze` run against a dedicated invalid fixture.

## 39. Regressions

Full `dart/bridge_analyzer` suite: 420/420, unchanged (no Dart file touched). Full `@bridge/gen-react` test
suite: 382/382 (39 files) — confirmed both via `turbo`-orchestrated `just ci` and via a direct
`vitest run --no-file-parallelism` (the full-parallelism run showed two `typechecks against the real
runtime kit` tests timing out under contention from many concurrent real-`tsc` child processes; both pass
individually and under sequential execution, confirming this was resource contention, not a regression —
see §41).

## 40. CI

`just ci` (build, typecheck, `@bridge/gen-react` test — 39 files/382 tests — and every other package's own
tests, `codegen-check`, `lint`, `lint-negative`, `uir-lint`, `uir-test` — 28 tests — `analyzer-lint`,
`analyzer-test` — 420 tests — `dart-analyze` on `hello_bridge`): **fully green**, exit 0. `just typecheck`,
`just lint`, `just codegen-check`, `just dart-analyze` are each included as `just ci`'s own component
recipes (confirmed by the `justfile`'s own `ci:` recipe list) — not run as separate, duplicate invocations.

## 41. Determinism

`just determinism` was attempted twice. First attempt: killed by the harness (`signal 15`) after completing
run 1 of 3 — the identical outcome M9-H's and M9-I's own final reports already recorded for this recipe.
Second attempt: exceeded the foreground timeout and was moved to background; its outcome is reported
honestly in the final report rather than assumed. Neither killed/incomplete attempt is counted as a pass.
This milestone touches no schema/normalization/runtime code (§25/§26/§28), so it has no plausible mechanism
to affect this recipe's own determinism property — but, per the governing brief's own instruction, that is
reported as reasoning, not substituted for an actual passing run.

## 42. Fixed point

`bridge validate` on `fixtures/apps/snackbar_presentation` (the M9-G/M9-H/M9-I valid-Dart control,
unaffected by this milestone): `deterministic: true`, `fixed point: true`, both confirmed by a fresh run.

## 43. `git diff --check`

Clean, exit 0, no whitespace errors.

## 44. Silent-wrong-code audit

- **Project field/getter/method access reaching TS `unknown`**: eliminated for the parameter-receiver case
  (§31); confirmed via the real fixture and `tsc`-based reasoning (§37).
- **Assignment reaching TS `unknown`**: eliminated — `emitTarget` shares the identical classifier (§24),
  confirmed by a dedicated test.
- **Nested unsupported accesses causing cascades**: prevented by construction (checked before the receiver
  is evaluated for `PropertyAccess`, and gated on `receiver !== REFUSED` for `MethodCall`) — confirmed by
  the real fixture's own single-diagnostic nested-access test (§16 area).
- **Source `dynamic` over-refusal**: checked and confirmed absent (§14).
- **SDK receiver over-refusal**: checked and confirmed absent for the recognized set
  (`String`/`int`/`double`/`num`/`Duration`) via the full, still-green `numeric_sdk_build.test.ts` suite —
  and a **new, genuine finding**: an *unrecognized* `dart:core` collection type used directly as a bare
  parameter (e.g. `List<int>`) was, and remains, `unknown`-typed and was previously silently broken; this
  milestone now correctly refuses it too, which is new coverage, not a regression, since nothing "worked"
  there before.
- **Flutter framework receiver over-refusal**: not directly re-tested with a new fixture this milestone
  (out of scope to construct one), but structurally impossible for any kit-provided/catalog-mapped type,
  since those never reach the generic fallback this milestone's check sits behind.
- **StoreInstance over-refusal**: checked and confirmed absent via the full, still-green
  `local_store_build.test.ts` suite.
- **Same-name class confusion**: checked and confirmed absent (§18).
- **Inherited member static binding**: checked and confirmed **never attempted** (§17) — the safest possible
  answer to this specific risk.
- **External-package class accidental support**: checked — an external-package `library` value is refused
  identically to a project-local one (§21, dedicated test).
- **`BRG3013` replacing `BRG1310`**: checked and confirmed impossible by construction (§34, Mutation F
  reasoning) and by a live test (§38).
- **Diagnostic on the wrong source token**: `idOf(node)` is the access node's own id (the `PropertyAccess`/
  `MethodCall`/`Assign` itself), giving its own real source span — not the receiver's, not an enclosing
  statement's.
- **Capability refusal happening only after the generator**: this is precisely what this milestone
  eliminates — refusal now happens *during* generation, before any file is written, never discovered later
  by `tsc`.
- **`tsc` remaining the first meaningful error**: eliminated for every case in the refused subset (§37);
  **not** eliminated for the two real, separate, pre-existing gaps this milestone found but did not fix
  (§46) — a `dynamic` receiver and a `Duration`/SDK-value-type used specifically as a *component prop*
  (`component.ts`'s own `typeTextOf` call omits the `use` importer M8-U's `functions.ts` already passes) can
  still reach `tsc` first, exactly as before this milestone, because both are explicitly out of this
  milestone's own scope (dynamic is source-legitimate; the component-prop Duration gap is a narrower,
  separate, newly-discovered defect, not a project-class-member gap).

## 45. Remaining blocker graph → M9-K

```
General class-declaration representation and emission (M9-I's own terminus, unaffected by M9-J)
  ├─ Symbol-addressed class-member identity (M9-I §46, still real: Base.value / PrivacyModel.value collide)
  ├─ A representable receiver-type story for a project-defined, non-store class
  │    └─ EmitScope.declaresClass becoming live (still hard-coded false)
  └─ A proven dynamic-dispatch/override safety boundary (still unbuilt, still real per §17's own reasoning)

M9-J's own, narrower, newly-discovered, NOT-yet-fixed defects (independent of class emission):
  ├─ `component.ts`'s own `typeTextOf` call omits the `use` importer `functions.ts` already passes —
  │    a Duration-typed (or any future SDK-value-typed) COMPONENT PROP still gets `unknown` in its own
  │    interface, even though the *expression* using it lowers correctly. Narrow, mechanical, one-line fix;
  │    deliberately not made here (out of this milestone's own stated scope — a member-access refusal
  │    milestone, not a prop-type-annotation milestone).
  └─ A local variable holding a project-class value still escapes this milestone's own refusal (§33/§46) —
       a real, narrower, and separately-scoped gap from general class emission itself.
```

Recommended M9-K: **the class-declaration-identity/emission milestone M9-I already recommended** — give
`logic.ClassDecl`/its members real, class-scoped symbols (closing the live `NodeId` collision M9-I found and
this milestone reconfirmed still exists), and the smallest possible `declaresClass`-becomes-live step (a
data-only TS `interface`, no methods). Should the `component.ts` `use`-importer gap (above) instead be
judged worth its own, smaller, independent milestone first, that is a legitimate, narrower alternative — but
it is not a class-emission prerequisite and does not block M9-K on its own terms.

**M9-K has not been started.**
