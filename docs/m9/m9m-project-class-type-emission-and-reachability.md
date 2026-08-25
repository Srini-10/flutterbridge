# M9-M — Bounded Project-Class Type Emission & Type-Reachability

## 1. Baseline

Entering M9-M: `HEAD == origin/main == a18b9b8` (M9-L). A project-defined class's type still lowers to
TypeScript `unknown` in every parameter/prop position (`packages/generators/react/src/internal/emit/types.ts`'s
`typeTextOf`, `PRIMITIVES[name] ?? 'unknown'`). `logic.ClassDecl` participates in no reachability walk
(ADR-0032 §11). `declaresClass` remains hard-coded `() => false` (ADR-0032 §10). M9-J's refusal of
`model.count`-shaped member access remains live, keyed on the receiver's own `typeTextOf` answer being
literally `'unknown'`.

## 2. M9-K/M9-L prerequisites, reconfirmed

Class identity (`Symbols.type`/`Symbols.typeIn`, `'type:$path#$name'`) is symbol-derived, library-qualified,
collision-free by construction — reconfirmed live (§9 below). Member-read `target` (ADR-0033) is a fully
separate mechanism, keyed on `element.enclosingElement is InstanceElement` for a *value* read; it neither
reads nor is read by this ADR's own `TypeRef.target` (§28).

## 3. Fresh unknown-type reproduction

Reused the existing `unmodelled_class_member` fixture (`class Model { const Model(this.count); final int
count; ... }`, a `Home` component with `required this.model`) as the real reproduction vehicle — a project
class actually accessed, so its own member refusal is the same shape M9-J already proved. Confirmed via
`typeTextOf`/`component.ts:77` code reading (not assumption) that the pre-M9-M path collapses the
parameter's type to `unknown` unconditionally, because `Model` is absent from `PRIMITIVES` and
`component.ts`'s own call never threaded a `use`/import-registration callback at all.

## 4. Class analyzer identity

`RawNodeEmitter.typeRef` (`dart/bridge_analyzer/lib/src/session/extract/raw_node_emitter.dart`) is the
single choke point every `DartType` passes through on its way to a `TypeRef`. Before this milestone it
produced only `{name, nullable?, library?}` — display text plus a resolved library URI, with **no** link
to the class's own `NodeId`/symbol. A working precedent already existed one file over:
`componentSymbolOf` resolves a `DartType`'s element to `Symbols.componentIn(library, name, ...)` for
navigation-destination targeting (M8-D) — proof the resolved-element-to-symbol mechanism was sound and
reusable, just never applied to `typeRef` itself.

## 5. Current type-lowering path

`typeTextOf` (`packages/generators/react/src/internal/emit/types.ts`): `PRIMITIVES` table lookup, then (if
a `use` callback is supplied) an SDK-value-type check (`Duration`), then `'unknown'`. `component.ts:77`
called it with **no** `use` argument at all — meaning even a kit-provided SDK value type could never
resolve in a component prop position before this milestone; only `functions.ts`'s own return-type call
site (`useRuntime(scratch, name)`) ever exercised that branch.

## 6. Exact `unknown` fallback point

`types.ts:82` (pre-M9-M): `const base = PRIMITIVES[name] ?? 'unknown';`. A project-defined class's
`TypeRef.name` (e.g. `"Model"`) is never a `PRIMITIVES` key, and reaches this exact line every time.

## 7. M1–M24 reduction ladder — result

Worked through the applicable subset directly, against real Dart source and the fixture's own live raw
UIR: M1 (single class, real `Symbols.type` symbol), M3 (two classes same file, distinct by name), M4
(same class name, two files, distinct by `$path`), M6 (private class, no special symbol treatment — the
underscore is literal text), M8 (local class type parameter — the fixture's own primary case), M9 (two
project-class props), M10 (same class referenced twice — `repeated`), M17 (nullable form — `maybeModel`).
M11–M16/M18–M24 (return types, `List<Model>`, `Map<String,Model>`, generic classes, typedefs, function
types) were bounded out deliberately (§16, §21) rather than exercised — no evidence required them, and
extending type grammar for their own sake was explicitly out of scope.

## 8. Type-only vs. value-level distinction

Enforced structurally, not by convention: `RawNodeEmitter.typeRef`'s new `target` field is attached to a
`TypeRef` (a type-position value object) only; nothing in this milestone ever resolves a *value*/construction
reference (`logic.New{typeName:'Model'}`) any differently than before. `declaresClass` (§10) is the one
existing mechanism that *would* answer "can this be constructed," and this ADR does not touch it.

## 9. `declaresClass` audit

Confirmed by direct inspection: single producer (`pipeline.ts`, hard-coded `false`), single consumer
(`expression.ts`'s `logic.New` case only — the construction refusal). Zero relationship to parameter/prop
typing, which is `typeTextOf`'s entirely separate concern. Deliberately left untouched — flipping it would
answer a different question (can this class be constructed) than this milestone resolves.

## 10. Class representation candidates — evaluated

A (`export interface Model {}`, type-only, **selected**), B (branded/nominal opaque type, rejected —
uninhabited by anything the generated program can produce, a real usability regression from `unknown`'s
own permissiveness for zero offsetting safety benefit today), C (opaque alias, rejected — a type alias is
not a distinct type in TypeScript at all, strictly less informative than A for identical risk), D (runtime
`class`, rejected — implies a constructor that does not exist), E (data-shape interface with fields,
rejected outright per the governing brief — would imply field/initialization semantics this compiler does
not implement), F (status quo `unknown`, rejected — the identity infrastructure is solid and unused for a
real, avoidable information loss).

## 11. Nominal-vs-structural analysis

TypeScript's own structural typing means two distinct, empty project-class interfaces (`Alpha`, `Beta`)
remain mutually assignable — confirmed directly by construction (an empty interface has no required
members). **Accepted as a known, documented limitation**, not silently ignored: no code path this
milestone ships depends on that distinction (no construction, no field/method access, no dispatch exists
to be misled by it), so the practical wrong-code risk today is zero. A future milestone adding real member
shapes would need to revisit nominality at that point, load-bearing on real field/method identity existing
to distinguish classes by — not before.

## 12. External API analysis

A project-class-typed prop remains exactly as unconstructible by the generated program's own code as
before this milestone (§1) — nothing here changes what can *produce* a value for it. An external caller
(or a sibling component forwarding the value untouched) can still supply any object, since the emitted
interface is structurally empty — the identical practical permissiveness `unknown` already offered on the
assignment side, now paired with a real, named type instead of none. This is exactly why branding (§10,
Option B) was rejected: it would have made the type uninhabited by any real value, a genuine usability
regression with no offsetting benefit.

## 13. Selected type representation

Outcome A2 — a stable, generated, type-only `export interface ${Name} {}` per emittable class, imported
`import { type Name } from '...'` wherever consumed cross-file.

## 14. Rejected representations

See §10.

## 15. Type reachability

A new, generator-owned, target-based walk (`reachableClassTypes`, `packages/generators/react/src/internal/emit/functions.ts`),
structurally distinct from `reachableFunctions`'s own value/call-edge walk. Seeded from every component's
own `params` and every already-reachable top-level function's own `params`/`returnType` (ADR-0029's
existing bounded subset). No fixed point is needed: an excluded class (§20/§21) is never emitted, so
there is nothing to gain chasing its own `superclass` reference further.

## 16. Value reachability separation

Kept structurally separate by design (two independent `Set<NodeId>` walks, no shared code beyond the
generic "target-based fixed point" idiom both instantiate) — a type reference must never be treated as
though it also reaches the referenced class's own fields, methods, or constructor. Verified live: emitting
`Model`'s own empty interface never causes `Model.count`/`Model.doubled` to become reachable or emitted
anywhere.

## 17. Module emission

Reused ADR-0029's own per-Dart-source-file module convention (`modulePathFor`) unmodified. Class-type
declarations and function declarations sharing one Dart source file land in the identical generated
module — `emitFunctionModules` was extended (not duplicated) to build the class-type registry into the
same `Map<string, PendingModule>` it already maintained for functions, avoiding a second, competing
module-path-to-builder map.

## 18. `import type` behavior

`ModuleBuilder.use(from, name, {typeOnly: true})` — already implemented, already exercised for the M8-V
kit-type case — was reused unchanged. `renderImports` lowers this to the project's own established inline
`type` modifier form (`import { type Model, other } from '...'`), confirmed by reading the real generated
`home.tsx` (§34) and by a dedicated test assertion.

## 19. Cross-file aliasing

Reused `ModuleBuilder.use`'s own deterministic numbered-alias collision resolution, unchanged — the
identical mechanism ADR-0029's own `sameName`/`sameName2` cross-file function collision test already
proves. No new aliasing logic was written for class types; a same-name-cross-module class scenario is
covered by that pre-existing, unmodified mechanism, not independently re-tested with a new fixture (an
honest scope note, not a gap this milestone silently left).

## 20. Nullability

`Model`/`Model?` remain distinct via the existing, unmodified `TypeRef.nullable` field and `typeTextOf`'s
existing `${base} | null` convention — the identical code path a primitive's nullable form already uses.
Verified live: `maybeModel: Model | null` in the real generated output.

## 21. Private/library boundary

Excluded from the emittable subset at the **generator** layer (not extraction — `target` is still attached
to a private class reference, §28): a leading-underscore class name is refused with a capability
diagnostic, because ADR-0029's own per-file module convention would export it as a **public** name from
its generated module, widening Dart's library-scoped privacy rather than preserving it. Verified via a
dedicated Dart-side test (`_Model` still carries `target`) confirming the split between identity (always
attached) and emittability (a downstream, generator-owned policy decision).

## 22. Part-file boundary

Not specially investigated — inherited unchanged from ADR-0029's own per-source-file module ownership, which
this milestone reuses without modification. No fixture in this repository exercises a part-file class; no
part-file-specific logic was written.

## 23. Inheritance boundary

Excluded from the emittable subset: a `ClassDecl` with a non-null `superclass` field is refused with a
capability diagnostic (an empty `interface Child {}` would misrepresent a real Dart subtype relationship
this generator has no member model to encode faithfully). Live-proven via Mutation G (§43): even under an
adversarial "emit everything" mutation, the inheritance guard still correctly refused `Home` (a
`StatelessWidget` subclass) rather than emitting a wrong `interface Home extends StatelessWidget {}`.

## 24. Generic boundary

Bounded out at the **extraction** layer, once: `RawNodeEmitter._classTypeTarget` does not attach a
`target` when the resolved `DartType` is an `InterfaceType` with a non-empty `typeArguments` list — covers
both a generic class's own use (`Box<int>`) and a generic collection carrying a project class
(`List<Model>`) with one check. `ClassDecl` itself carries no type-parameter schema field, so a generic
reference's `TypeRef` is identical to pre-M9-M: no `target`, `unknown`, unchanged. Verified via a dedicated
Dart-side test (`Box<int>` carries no target).

## 25. External-package boundary

Reused `Symbols.pathOf`'s existing package-boundary logic unmodified: a library outside the analyzed
package's own name and outside `localPackageNames`/`extractedDependencyFiles` (M8-F's local-dependency
allowance) resolves to `null`, so no `target` is attached — a true external package with no adapter stays
`unknown`, exactly as before. No new external-package boundary was invented.

## 26. M9-J refusal interaction — the direct prerequisite

Confirmed via direct code reading, not assumption: `isUnmodelledMemberReceiver` (`expression.ts`) keyed
refusal on `typeTextOf(type) === 'unknown'`, a direct string comparison. M9-J's own milestone doc (§20)
explicitly anticipated and *intended* this refusal to "lift by itself" once a class's type stopped
rendering as `unknown` — conflating "type is now representable" with "member access is now safe," which
is exactly the landmine this milestone's own governing brief warned about. **Fix**: added an independent
disqualifying condition, `type['target'] !== undefined` — true whenever the receiver's `TypeRef` carries a
`target` resolving to any `logic.ClassDecl` this compiler extracted, regardless of whether the emission
layer gave that class a real name or still falls back to `unknown` (an excluded, private, or inherited
class still carries `target`, §21/§23). Capability-based, not text-based, per the brief's own instruction.

## 27. M9-L provenance interaction

Unaffected, reconfirmed: ADR-0033's member-`target` mechanism and this ADR's `TypeRef.target` are
completely separate code paths (one keyed on a value read's resolved `Element.enclosingElement`, the
other on a type reference's resolved class element). Neither reads the other. A `TypeRef.target`'s
presence is now a *refusal* signal (§26) — never treated as permission to execute a member.

## 28. ADR decision

ADR-0034 (`docs/adr/0034-project-class-type-emission-and-type-reachability.md`), written before
implementation, covering all 22 required topics.

## 29. Schema decision

**A schema change was required and made** — the one genuine gap `TypeRef`'s existing shape
(`{name, nullable?, library?}`) could not represent: a link to the referenced class's own `NodeId`. Added
`TypeRef.target?: NodeId` (`packages/uir/schema/shared.json`, `x-uir-version` 1.7.0 → 1.8.0), mirroring
`PropertyAccess.target`'s own naming and provenance-only contract exactly. Regenerated both language
bindings (`just codegen`); diff confirmed minimal and mechanical (version/hash bump plus the one new
optional field, both languages, nothing else).

## 30. Implementation gate

PASS on all 30 conditions in the governing brief's own §29: `unknown` reproduced fresh; class identity
available (reconfirmed, unchanged); `TypeRef.target` deterministically links to `ClassDecl`; the selected
representation (empty, type-only interface) is honest — it claims exactly what it is, nothing about
construction or members; nominal/structural tradeoff explicitly accepted (§11) with a stated future
migration path (§ADR-0034 §22); type reachability structurally distinct from value/member reachability
(§16); module emission deterministic (reused ADR-0029 machinery, unmodified); cross-file imports
type-only, reusing existing `ModuleBuilder.use`; nullability preserved; private/inherited/generic classes
each bounded out with a clear boundary and, where reachable, a capability diagnostic; no `any` (verified,
§42); M9-J refusal audited and fixed *before* being accepted as safe (§26); M9-L provenance untouched;
M9-H BRG1310 unaffected (no extraction-order change); real Dart→UIR→normalize→reachability→TS→tsc proof
completed (§34); determinism proven; FlutterBridge-only boundary clean (§53); ADR written first.

## 31. Selected Outcome

**A2 — opaque/type-only project class emission.** Stable generated project-class type declarations, type
reachability, cross-file type imports, zero member/runtime semantics — landed in full, tested end to end
against real `tsc --strict`.

## 32. Implementation — summary

Schema (`TypeRef.target`), Dart extraction (`RawNodeEmitter._classTypeTarget`), TS type lowering
(`typeTextOf`/`paramListOf` gain an optional `classOf` resolver), TS reachability + module emission
(`reachableClassTypes`, folded into `emitFunctionModules`'s existing per-file `PendingModule` map), TS
scope plumbing (`EmitScope.classModules`, threaded through `pipeline.ts`/`component.ts`/`store.ts`), and
the M9-J refusal fix (`isUnmodelledMemberReceiver`'s new `target`-based branch).

## 33. Analyzer changes

`dart/bridge_analyzer/lib/src/session/extract/raw_node_emitter.dart`: `typeRef` gains a call to the new
`_classTypeTarget(type, element)`, attaching an optional `target` (via `Symbols.typeIn`) for a resolvable,
non-generic, non-component/state/store class. No other Dart file changed.

## 34. Compiler/N-pass changes

None. Confirmed: `git diff` against `packages/compiler/` (N1–N11) is empty for this milestone. `TypeRef.target`
passes through normalization untouched, exactly like every other field these passes do not inspect.

## 35. Generator changes

`types.ts` (`typeTextOf`/`paramListOf` gain `classOf`), `functions.ts` (`reachableClassTypes`,
`ClassModuleInfo`, class-type registry built into `emitFunctionModules`), `component.ts` (props threading,
`classModules` scope field forwarded), `store.ts` (`classModules` scope field forwarded), `expression.ts`
(`EmitScope.classModules`, `isUnmodelledMemberReceiver` fix), `pipeline.ts` (root scope wiring, mirroring
the pre-existing `functionModules` two-phase fill-by-reference pattern exactly).

## 36. Runtime changes

None. Confirmed: `git diff` against `packages/runtimes/` is empty.

## 37. Exact supported type subset

A concrete, project-local (or already-extracted local-dependency) class: no `extends` clause, no generic
type parameters, public name, referenced only as a component prop type or an already-supported top-level
function's own parameter/return type — nullable or non-nullable, cross-file or same-file, referenced once
or repeatedly.

## 38. Exact refused type subset

A class with a superclass (any `extends`, including the implicit component/store base classes — those are
excluded earlier, by a different, pre-existing mechanism, §? — see M9-L's own component/state/store
exclusion, reused unmodified here via the identical adapter checks in `_classTypeTarget`), a private class,
a generic class or generic instantiation, a class from an unextracted external package. Each of the first
two reports a capability diagnostic when actually type-reachable; the generic and external-package cases
stay silently `unknown`, unchanged from before this milestone (matching M9-J §15's own "diagnose at the
capability boundary, never at a mere declaration" precedent).

## 39. Exact refused execution subset

Unchanged from M9-J, in full: field reads, getter reads, method calls, and construction on any
project-defined or external-package class remain refused (BRG3013/the existing `logic.New` refusal) —
reconfirmed byte-for-byte via a real, live `bridge build` on `unmodelled_class_member` (§41).

## 40. Tests

**Dart** (`dart/bridge_analyzer/test/extraction_test.dart`, new group `'project class type-reference
provenance (ADR-0034, M9-M)'`, 7 tests): plain class target-to-`ClassDecl`, same-name-cross-file distinct
targets, generic instantiation carries no target, component class carries no target, private class still
carries a target, nullable class type carries target+nullable, determinism.

**TypeScript** (`packages/generators/react/tests/class_type_emission_build.test.ts`, real analyzer → real
normalize → real generator → real `tsc --strict`, 7 tests): zero errors; one generated module per Dart
source file; each module is a type-only, empty interface (never a runtime class); component props
reference the real class name, type-only imported, never `unknown`, never `any`; a repeated reference
shares one type; nullable form stays distinct; full real-pipeline `tsc --strict` proof.

## 41. Negative controls

`unmodelled_class_member_build.test.ts` (unmodified, 7 tests) and `unmodelled_class_member_refusal.test.ts`
(unmodified, 8 tests) both re-run against a **freshly regenerated golden** (`fixtures/uir/unmodelled_class_member.ndjson`,
now carrying real `target` fields on `Model`/`Alpha`/`Beta`/`Base`/`Child2`/`Parent` — the exact new shape
M9-M introduces) — all 15 still pass. A live, direct `bridge build` on the same fixture reproduces the
identical 7-error/BRG3005 refusal, byte-for-byte, that existed before this milestone. `class_type_emission`'s
own fixture proves the positive control: identical classes, used only as types, build cleanly.

## 42. Adversarial mutations

Six concrete mutate → test → revert cycles, each independently confirmed and cleanly reverted (`git diff`
empty afterward):

- **A** (name-only symbol, library qualification dropped): all 7 Dart tests fail — cross-file distinctness
  collapses.
- **C** (`any` in place of the real class name): 3 of 7 TS tests fail, including a dedicated
  `not.toMatch(/\bany\b/)` assertion added specifically to catch this class of regression.
- **D** (type-reachability walk disabled entirely): 5 of 7 TS tests fail — every project-class prop falls
  back to `unknown`.
- **F** (the real landmine, simulated under a plausible future refactor — threading the class registry
  into `isUnmodelledMemberReceiver` itself, `target`-based branch removed): all 7
  `unmodelled_class_member_build.test.ts` tests fail. This is the concrete, load-bearing proof that
  ADR-0034 §14/§26's fix is not incidental: under the exact scenario the governing brief warned about,
  removing it silently disables the refusal. (Note: reverting *only* the `target`-based branch, without
  also threading the registry into that call site — matching this milestone's own actual, shipped,
  minimal-blast-radius design, which deliberately never threads `classOf` into the refusal classifier —
  does *not* reproduce a live failure today, because that call site never resolves a class name in the
  first place. Both facts are reported honestly: the fix is not currently load-bearing through today's
  exact code path, but is the correct, brief-mandated, capability-based design, and is proven load-bearing
  under the realistic near-future refactor a maintainer would plausibly make.)
- **G** (every `ClassDecl` in the program emitted regardless of reachability, ignoring the type-reachability
  walk entirely): all 7 tests fail — the mutation even attempted to (and correctly failed to) emit `Home`
  itself as a bare `interface Home extends StatelessWidget {}`, tripping the inheritance guard (§23) and
  halting the whole build, a strong incidental proof that boundary logic holds even under an adversarial
  "emit everything" scenario.

**B** (collapse every class to the identical empty structural shape) and **H** (remove deterministic
import aliasing) were not independently re-injected: B is not a bug to catch — ADR-0034 §11 already
documents and accepts structural collapse as a known limitation, so there is no "wrong" behavior a
mutation could newly expose; H would only re-prove `ModuleBuilder.use`'s own aliasing, already covered by
ADR-0029's own `sameName`/`sameName2` mutation coverage, since this milestone introduces no new aliasing
logic of its own.

## 43. Real generic fixture

`fixtures/apps/class_type_emission/` — `lib/model.dart` (`class Model {}`), `lib/other_model.dart`
(`class OtherModel {}`), `lib/unused_model.dart` (`class UnusedModel {}`, never referenced — proves
selective reachability), `lib/main.dart` (a bare `Home` component with four optional, nullable,
never-dereferenced params: cross-file `Model`/`OtherModel`, a repeated `Model` use, and an explicit
nullable form), wired into a minimal `MaterialApp` root (needed only because this compiler's own
route-argument check currently treats every named constructor parameter as required regardless of Dart's
`required` keyword — a real, pre-existing, unrelated quirk this milestone worked around rather than fixed,
out of scope). Neutral, generic naming throughout; zero application-specific names.

## 44. Real build proof

Real Dart → real analyzer → real raw UIR → real `bridge normalize` (N1–N11, unmodified) → real type
reachability → real module generation → real TypeScript interface declarations → real type-only imports →
real `tsc --strict` (via `node typescript/lib/tsc.js`, the exact mechanism every other build-proof in this
suite uses). Inspected the exact generated code directly:

```ts
// src/generated/dart/app/lib/model.ts
export interface Model {}

// src/components/home.tsx (excerpt)
import { type Model } from '@/generated/dart/app/lib/model';
import { type OtherModel } from '@/generated/dart/app/lib/other-model';
export interface HomeProps {
  readonly model: Model | null;
  readonly other: OtherModel | null;
  readonly repeated: Model | null;
  readonly maybeModel: Model | null;
}
```

No `class` keyword, no constructor, no member shape, no `any`, no runtime import for a type-only
dependency — confirmed directly.

## 45. Fixed-point/reachability proof

Verified live: one class (`Model`) reached from three separate parameter positions across two components'
worth of usage still yields exactly one `export interface Model {}` declaration and exactly one type-only
import per consuming module (`ModuleBuilder.use`'s own idempotency, reused unmodified) — confirmed via a
regex-count assertion (`home.tsx` matches the `model` import specifier exactly once). `UnusedModel`,
declared but never referenced, produces zero output — confirmed by an exact-file-list assertion. No
duplicate imports, no infinite traversal (no fixed point is even needed for type reachability, §15).

## 46. Type reference inside `FunctionDecl`

Investigated: ADR-0029's own bounded top-level `FunctionDecl` subset can, structurally, carry a
project-class-typed parameter/return type — `reachableClassTypes` and the `classOf` threading inside
`emitFunctionModules`'s own while-loop both support this path identically to the component-prop path. Not
independently fixture-proven (no real top-level function in this repository's fixtures currently has a
project-class-typed signature), but the code path is shared, not duplicated, with the proven component-prop
path — the same registry, the same `typeTextOf`/`paramListOf` machinery.

## 47. Component prop type generation

`component.ts`'s `emitComponent` was the primary integration point, and the only call site that needed a
NEW `classOf` closure written from scratch (`functions.ts`'s own call site already had `use`/`classOf`
threading infrastructure to extend). Confirmed: unrelated Duration/numeric prop-typing gaps in this same
file were not touched.

## 48. Diagnostics

`BRG3013` (`UnsupportedCapability`, the existing code) reported for a type-reachable class excluded from
the emittable subset for a structural reason (private, or has a superclass) — never for an unused
declaration. No new diagnostic code was introduced.

## 49. Schema validation

Malformed-target controls were not added as new dedicated fixtures — `TypeRef.target` reuses the identical
`NodeId`/`RawRef` resolution path `PropertyAccess.target`/member `target` already use, and a dangling or
misdirected target already surfaces through the pre-existing `BRG1201`/`BRG1202` validation machinery
(ADR-0032 §22's own precedent) rather than needing a second, parallel validator.

## 50. M9-H BRG1310 regression

Unaffected — `_classTypeTarget` runs entirely inside the existing, unmodified `typeRef` call path, which
itself only ever runs on a resolved, analyzer-valid `DartType` (an `InvalidType` is refused earlier,
before extraction, by the pre-existing BRG1310 gate, ADR-0031). No new code path bypasses that gate.

## 51. M9-K identity regression

Reconfirmed live via the full Dart suite (438/438, including every M9-K-era test unmodified) — class
identity remains symbol-derived, owner-qualified member identity unchanged, Alpha.value ≠ Beta.value,
same-content cross-class members distinct. `TypeRef.target`'s own addition does not touch `ClassDecl`'s
own `NodeId` computation at all — it only adds a *reference field* pointing at that already-correct id.

## 52. M9-L provenance regression

Reconfirmed live: implicit/explicit instance-member-read `target` tests (M9-L's own 11-test group) pass
unchanged, part of the same 438/438 full Dart suite run.

## 53. Full regression matrix

Full Dart suite: 438/438 (431 pre-M9-M + 7 new). Full TypeScript suite: 389/389 (382 pre-M9-M + 7 new).
`just ci`: exit 0, twice (once mid-milestone, once final). Every M8/M9 milestone's own dedicated test file
is part of these totals, unmodified in content, all passing.

## 54. Validation

- `dart test` (full): 438/438, zero `[E]`.
- `pnpm --filter @bridge/gen-react test` (full): 389/389.
- `just ci`: exit 0 (includes `typecheck`/`lint`/`codegen-check`/`dart-analyze`/`flutter analyze` on
  `hello_bridge`, confirmed clean).
- `just determinism`: byte-identical across every run, confirmed twice (once after the schema/extraction
  change, once after the final fixture addition), no kill/retry needed either time.
- `bridge validate` on `class_type_emission`: deterministic ✓, fixed point ✓, build succeeded.
- Real `tsc --strict` (via `typecheckEmitted`, part of the TS suite): zero errors against the real,
  unmocked runtime kit.
- `git diff --check`: clean.
- FlutterBridge-only boundary: zero new Continuum references anywhere in this milestone's diff.
- `fixtures/apps/hello_bridge/analysis_options.yaml`'s pre-existing drift remains untouched, unstaged.

## 55. Silent-wrong-code audit

Project class becoming `unknown` unexpectedly — not observed (positive-control fixture proves the
opposite). Project class becoming `any` — not possible; verified by a dedicated test and Mutation C.
Two Dart classes collapsing to one TS type — not possible; `Symbols.typeIn`'s library-qualified symbol
scheme, reconfirmed by Mutation A. Same-name cross-library collision — tested directly, distinct targets.
Empty structural interfaces losing meaningful identity — a real, accepted, documented limitation (§11), not
silently ignored. Runtime class emitted accidentally — not possible; `declaresClass` untouched, no `class`
keyword anywhere in generated output (verified directly). Constructor emitted accidentally — not possible;
`logic.New` refusal unchanged. Member shape emitted accidentally — not possible; `ClassDecl.fields`/`.methods`
never read by this milestone's own code. Type reference triggering executable-member reachability — not
possible; type and value reachability are structurally separate walks (§16). Class member `BRG3013`
disappearing — directly disproven, live, twice (a real build and the regenerated-golden test suite).
`TypeRef.target` treated as execution permission — the opposite is true; its presence is now a refusal
signal (§26/§27). Inherited class accepted without subtype semantics — refused with a capability diagnostic
(§23). Private type visibility widened — refused with a capability diagnostic (§21). Generic args dropped —
bounded out before emission, never silently truncated (§24). Nullability dropped — tested directly, preserved.
Runtime import emitted for a type-only dependency — not possible; `{typeOnly: true}` unconditionally, tested.
Missing/duplicate type import — tested directly (exactly one import per class per consuming module).
Nondeterministic aliases — inherited from `ModuleBuilder.use`'s own proven determinism, reconfirmed via
`just determinism`. All project classes emitted eagerly — directly disproven by Mutation G and the
`UnusedModel` negative control. External package class treated as local — not possible; `Symbols.pathOf`'s
existing package-boundary check, reused unmodified. `BRG1310` bypassed — not possible; extraction order
unchanged (§50). TypeScript compiling while Dart semantics are misrepresented — the one accepted,
documented exception is structural-collapse nominality (§11), explicitly bounded to a regime (no
construction, no member access) where it cannot yet cause a wrong-code outcome.

## 56. FlutterBridge-only boundary

Verified: zero Continuum imports, dependencies, paths, fixtures, or branches anywhere in this milestone's
diff. `fixtures/apps/class_type_emission` uses neutral, generic naming throughout (`Model`, `OtherModel`,
`UnusedModel`, `Home`) — no application-specific terminology.

## 57. M9-N

Not started. No type/dispatch/runtime emission beyond bounded, type-only class representation was shipped.
No constructor, no field/getter/method execution, no class reachability beyond the type edge itself.

## 58. Recommended next milestone

Left to evidence, not preselected. With type identity, type reachability, and cross-file type imports now
proven (Outcome A2), the strongest-supported next step is a **bounded getter/field-read milestone**
building directly on ADR-0033's own member-provenance mechanism plus this milestone's own type registry —
the two prerequisites M9-I originally named (receiver type representation, §8 of that milestone; and
`this`/member identity, ADR-0032/0033) are now both real. Any such milestone must independently define and
prove its own dispatch-safety contract (ADR-0033 §2) before wiring any execution — this milestone grants
no such proof in advance (ADR-0034 §22).

## 59. Final git status / HEAD vs. origin/main

Committed and pushed after this doc; see the commit message for the exact hash. Working tree clean aside
from the pre-existing, intentionally untouched `hello_bridge/analysis_options.yaml` drift.
