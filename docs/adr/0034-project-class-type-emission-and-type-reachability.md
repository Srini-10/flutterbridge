# ADR-0034 — Project Class Type Emission and Type Reachability

## 1. Type-only vs. runtime class semantics

**Type-only.** This ADR authorizes a generated TypeScript *type* for a bounded subset of project-defined
Dart classes — never a runtime `class` declaration, never a constructor, never field/getter/method
lowering. `logic.New` stays refused for a project class exactly as it is today (`declaresClass` stays
`() => false`, untouched — see §17). A value that reaches a project-class-typed position at runtime is
still, today, unconstructible by anything this compiler emits; that is a real, known limitation of this
milestone's own scope, not something it papers over (§14 discusses it directly).

## 2. Dart class identity source

Unchanged, reused as-is (ADR-0032, reconfirmed fresh): `logic.ClassDecl`'s own `NodeId` is
`nodeIdOfSymbol('type:$path#$name')`, `$path` derived by `Symbols.pathOf`. Reconfirmed live: `class Model
{}` alone → `type:lib/main.dart#Model`; `Alpha`/`Beta` same file → distinct by name; `Model` in
`lib/main.dart` vs. `lib/sub/helper.dart` → distinct by `$path`; `class _Model {}` → `type:lib/main.dart#_Model`,
no special-casing (the underscore is literal text in the symbol, not a marker this ADR relies on
structurally — see §11 for where privacy *is* handled).

## 3. Generated TypeScript representation — selected

**Option A — an empty, type-only interface: `export interface Model {}`.** For every class in the
bounded initial subset (§13), the generator emits exactly this shape, in the module that owns the class's
own declaring Dart source file (§4, reusing ADR-0029's per-file convention unmodified).

**Rejected:**

- **Option D (runtime `class`)** — rejected outright. A runtime class implies a constructor value exists
  in the emitted JS; none does, and `logic.New` still refuses construction (§1). Emitting one would be a
  standing lie about what this generator can execute.
- **Option B/C (branded/nominal opaque type, opaque alias)** — rejected. A branded type (`unique symbol`
  marker) is uninhabited by construction: nothing in the emitted program can produce the brand (no
  constructor exists to mint it), and an external caller of the generated component cannot produce one
  without an unsafe cast either. That is a **strict usability regression** from today's `unknown` (which
  at least accepts any value on the *assignment* side) for a nominal-safety benefit this milestone cannot
  cash in — nothing downstream inspects, dispatches on, or constructs a value based on its brand, because
  no member/construction execution exists yet (§1). A plain type alias (`type Model = unknown`) was
  considered and rejected too: an alias is not a distinct type in TypeScript at all, so it buys strictly
  less than a real (if structurally weak) named interface — it wouldn't even distinguish `Alpha` from
  `Beta` in a hover tooltip, let alone in an error message.
- **Option E (data-shape interface with fields)** — rejected per the governing brief's own explicit
  instruction (§19): would falsely imply field semantics (initialization, mutability, dispatch) this
  compiler does not implement. `ClassDecl.fields` is never consulted by the emitted interface.
- **Option F (status quo, stay `unknown`)** — rejected: the identity infrastructure (ADR-0032) and the
  provenance infrastructure (ADR-0033) are both solid and unused; `unknown` is a real, avoidable loss of
  information for a genuinely bounded, safe subset.

## 4. Type reachability

A **new, generator-owned, target-based fixed-point walk**, structurally sibling to but a **distinct set**
from ADR-0029's `reachableFunctions` (value/call-edge reachability) — never the same walk, never
generalized into one (§5 below explains why). Seeded from every `TypeRef.target` found on a component's
own `params` and (where the existing bounded `FunctionDecl` subset already models a return/parameter type,
ADR-0029) a top-level function's own signature. When a seed resolves (`scope.node(target)`) to a
`logic.ClassDecl`, that class is marked type-reachable — and the walk does **not** expand into that
class's own `fields`/`methods`: type reachability terminates at the declaration itself, by construction
(there is nothing to recurse into — a `ClassDecl`'s own `superclass` field is the one place a type
reference could chain to another class, and inheritance is excluded from the emittable subset entirely,
§13, so this chain is moot for what is actually emitted).

## 5. Value reachability distinction

Kept **structurally separate** from `reachableFunctions` (ADR-0029), per the governing brief's own Option
C. A type edge (`param.type.target` → `ClassDecl`) and a value edge (`Ref.target` → `FunctionDecl`) answer
different questions — "what type must be nameable" vs. "what code must run" — and merging them would let a
type reference accidentally imply a member/constructor is reachable, exactly the hazard §1 rules out. Two
independent `Set<NodeId>` worklists, sharing no code beyond the generic "target-based fixed point" idiom
both ADR-0029 and this ADR independently instantiate.

## 6. Cross-file imports

**Reused, not reinvented**: `ModuleBuilder.use(from, name, {typeOnly: true})` — already implemented,
already exercised for the M8-V kit-type case, already deterministic on a same-name collision (numbered
alias, identical to `ModuleBuilder.declare`'s own collision rule). No new import mechanism was written.
`modulePathFor(spanFile)` (ADR-0029 §4) is reused unmodified to compute which generated module owns a
given `ClassDecl`'s own declaring Dart source file.

## 7. `import type` behavior

Every project-class type reference is requested via `use(..., {typeOnly: true})`, which `renderImports`
already lowers to the inline `type` modifier form (`import { type Model } from './model'`) — the
project's own established style (verified by reading `module.ts`'s `renderImports`, not assumed), not
`import type { ... }` as a whole-statement form. Nothing downstream widens a type-only request to a value
import for a project class (§16, an explicit adversarial mutation, verifies this).

## 8. Nullability

`Model` / `Model?` remain distinct, via the existing, unmodified `TypeRef.nullable` field and
`typeTextOf`'s existing `${base} | null` convention — a project class's nullable form is handled by the
identical code path a primitive's already is; no new nullability logic was written.

## 9. Private class boundary

**Excluded from the emittable subset, deliberately.** ADR-0029's per-Dart-source-file module convention
would export a private (`_Model`) class as a **public** named export of its own generated module —
widening Dart's library-scoped privacy to unrestricted cross-module TypeScript visibility, a real fidelity
violation, not a cosmetic one. The type-reachability registry (§4) excludes any `ClassDecl` whose `name`
starts with `_` from the emittable set; its `TypeRef` falls back to `unknown`, unchanged from today.

## 10. Part-file boundary

Not specially investigated or bounded — inherited unchanged from ADR-0029's own per-Dart-source-file
module ownership, which this ADR reuses without modification. No fixture in this repository currently
exercises a part-file class; this ADR does not invent part-file handling, matching the brief's own
"do not redesign module architecture in M9-M" instruction.

## 11. Inheritance boundary

**Excluded from the emittable subset.** A `ClassDecl` with a non-null `superclass` field (i.e., an
explicit `extends` clause — a plain `class Model {}` carries no `superclass` field at all, per
`declaration_extractor.dart`'s own `if (node.extendsClause != null)` guard) is excluded from the emittable
set: emitting `interface Child {}`, structurally unrelated to `interface Base {}` in the generated output,
would misrepresent a real Dart subtype relationship the generator has no mechanism to encode faithfully
(TypeScript's own `extends` on an empty interface would falsely claim a member-shape relationship neither
class has any modeled members for). Excluded classes fall back to `unknown`, with a capability diagnostic
naming the class and the reason (§20).

## 12. Generic-class boundary

**Excluded at the extraction layer, not the emission layer.** `RawNodeEmitter.typeRef` does not attach a
`target` when the resolved `DartType` is an `InterfaceType` with a non-empty `typeArguments` list — this
covers both a generic class's own use (`Box<int>`) and a built-in generic collection carrying a project
class as an argument (`List<Model>`) with one check, at the one place both shapes already flow through.
`ClassDecl` itself carries no type-parameter representation in the schema today (confirmed: `{name,
superclass?, fields?, methods?}`, no `typeParameters` field) — this ADR does not add one. A generic
reference's `TypeRef` is therefore identical to today's: `{name: 'Box<int>', library: ...}`, no `target`,
`unknown` in the generated output, unchanged.

## 13. External-instance/API boundary

A project-class-typed prop remains, after this ADR, exactly as unconstructible by the generated program's
own code as it was before (§1) — this ADR does not change what can produce a value for it. What changes is
only the *declared type* an external caller (or a sibling generated component forwarding the value
untouched) sees: `Model` instead of `unknown`. Because the emitted interface is structurally empty,
**any** object is still assignable to it from an external caller's own code — the same practical
permissiveness `unknown` already offered on the assignment side, now paired with a real name rather than
none. This ADR does not need callers to "manufacture" anything unusual; §3's rejection of branding is
exactly this concern resolved in the caller's favor.

## 14. M9-J refusal interaction — audited, and required to change

**A direct, in-scope prerequisite of this ADR, not adjacent scope.** M9-J's `isUnmodelledMemberReceiver`
(`expression.ts`) keys refusal on a direct string comparison: `typeTextOf(type) === 'unknown'`. Confirmed
by reading the exact source (not assumed): once this ADR makes `typeTextOf` return `'Model'` instead of
`'unknown'` for the bounded subset, that string comparison stops matching, and `model.count` would stop
being refused — a real, silent capability expansion this ADR must not ship. **Fix**: `isUnmodelledMemberReceiver`
gains an additional, independent disqualifying condition — `type['target'] !== undefined` — true whenever
the receiver's `TypeRef` carries a `target` resolving to any `logic.ClassDecl` this compiler extracted,
**regardless of whether the emission layer decided to give that class a real name or fall back to
`unknown`** (§9/§11/§12's excluded shapes still resolve a `target` at the extraction layer — see §2's
"target = identity, independent of downstream capability" design, mirroring ADR-0033's own target/dispatch
separation exactly). This is capability-based, not text-based: no class, of any shape, has member
execution support after this ADR ships, so the presence of a `target` alone is sufficient, correct grounds
for refusal — no duplicated "is this class in the emittable subset" logic is needed at the refusal site.

## 15. M9-L provenance interaction

Unaffected, reconfirmed: ADR-0033's member-`target` mechanism (`_instanceMemberTarget`, keyed on
`element.enclosingElement is InstanceElement`) is a completely different code path from this ADR's
`TypeRef.target` (keyed on a *type* reference's own resolved class element). Neither reads the other. A
member `target` is never treated as permission to emit a type; a `TypeRef.target` is never treated as
permission to execute a member (§14 makes this the opposite: a `TypeRef.target`'s presence is now a
refusal signal, not a permission signal).

## 16. Constructor exclusion

Unchanged. `declaresClass` stays `() => false` (§17) — this ADR does not flip it, because doing so would
answer a *different* question (can this class be constructed) that this ADR does not resolve. `logic.New`
on a project class remains refused, byte-identically, verified live.

## 17. `declaresClass` — audited, deliberately left alone

Confirmed by direct inspection: `declaresClass` is single-producer (`pipeline.ts`, hard-coded `false`),
single-consumer (`expression.ts`'s `logic.New` case only), and has zero relationship to parameter/prop
typing — that is `typeTextOf`'s own, entirely separate concern. Flipping `declaresClass` would only affect
whether `new Model(...)` is refused; it is not the mechanism this ADR needed, and this ADR does not touch
it. Its own doc comment ("the day class emission exists, the refusal in `logic.New` lifts by itself") is
about a *future* milestone that implements construction — not this one.

## 18. Getter/method exclusion

Unchanged — `ClassDecl.methods` is never read by this ADR's own emission path. A class's fields and
methods remain completely inert from the generator's point of view, exactly as ADR-0032 §11 left them.

## 19. Runtime output contract

Zero runtime output. Every import this ADR's own code requests is `typeOnly: true`; the emitted interface
itself (`export interface Model {}`) erases completely at `tsc` compile time — verified directly against a
real `tsc --strict` run (§ implementation, milestone doc). No `.js` bytes exist for a project-class type
at runtime, matching the "type-only, not runtime class" decision in §1 exactly.

## 20. Diagnostics

A new capability diagnostic (`BRG3013`-family, `UnsupportedCapability` — the existing code, not a new one)
is reported when a project-class-typed parameter's own class is excluded from the emittable subset for a
*structural* reason this milestone can name precisely: has a superclass (§11), is private (§9), or is
generic (§12 — reported only when detectable without a schema addition; a generic class's own use already
silently stays `unknown` exactly as before, so this diagnostic is emitted on a best-effort basis where the
extraction layer can tell, not guaranteed universally). An **unused**, never-dereferenced project-class
parameter of any shape (including an excluded one) is never diagnosed — matching M9-J §15's own precedent
exactly: a diagnostic fires at an actual capability boundary, never at a mere declaration.

## 21. Deterministic naming/imports

Inherited unmodified from existing, already-deterministic mechanisms: `Symbols.typeIn`/`nodeIdOfSymbol`
(pure functions of `(path, name)`), `ModuleBuilder.declare`/`use` (deterministic numbered-alias collision
resolution, already proven for both module-scope names and cross-module imports). No new
non-determinism is introduced; determinism is re-verified live (`just determinism`) rather than assumed.

## 22. Future migration to real executable classes

This ADR's own type-reachability registry (`NodeId → {modulePath, exportName}`) is the one piece a future
milestone implementing bounded member/constructor execution can build on directly — it already answers
"where does this class's own type live, and what is it called," which any real member-lowering milestone
would need identically. That future milestone must still independently prove its own dispatch-safety
contract (mirroring ADR-0033 §2) before wiring any member execution; nothing in this ADR grants it that
proof in advance.
