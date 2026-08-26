# M9-R — Final M9 Closure

**M9 CLOSED.**

## 1. Baseline

Started clean at `b9d257d` (`HEAD == origin/main`), the M9-Q commit. Only the pre-existing, already-known
`fixtures/apps/hello_bridge/analysis_options.yaml` drift was present in the working tree; left untouched
throughout.

## 2. Closure scope

M9-R is an audit-and-reconciliation milestone, not a feature milestone. Its own production changes are
limited to exactly one class the governing brief itself pre-authorized: closing a silent-wrong-code path
by making an already-unsupported operation refuse honestly instead of lowering incorrectly (§22 below).
No new Dart semantic capability was added. There is no M9-S.

## 3. No-new-feature rule — honored

Nothing in this closure adds: instance methods, setters, mutable field writes, static members, private
runtime members, inheritance dispatch, overriding, interfaces/mixins runtime behavior, generic project
classes, constructor defaults/optionals/factories/redirects/bodies/initializer lists, const
canonicalization, alias/data-flow expansion, whole-program subtype analysis, a runtime class, or a
prototype. Confirmed by `git diff --stat` against every production file this milestone touched: one file
(`expression.ts`) gained two small, additive disjuncts to an existing refusal condition and one new,
narrowly-scoped helper function — nothing else in the compiler's own capability surface changed.

## 4. M9-A → M9-Q timeline (condensed dependency chain)

| Milestone | Delivered | Depends on |
|---|---|---|
| M9-A/B/C | Loop/multi-declaration/growing-scope local identity (ADR-28 amendments) | — |
| M9-D/E | Dialog inline destination + dismissal provenance (ADR-0025 D2) | M9-A–C's own local-identity discipline |
| M9-F | Collection-for item parameter identity (ADR-28 amendment) | M9-A–C |
| M9-G | Snackbar presentation semantics (ADR-0030) | M9-D/E's own inline-destination pattern |
| M9-H | Resolved-analyzer-error pre-extraction gate (BRG1310, ADR-0031) | — |
| M9-I | Getter investigation; architecture-blocker evidence; no implementation (Outcome B) | — |
| M9-J | Honest unsupported project-class member refusal (BRG3013) | M9-H (analyzer-error precedence) |
| M9-K | Owner-qualified class/member declaration identity (ADR-0032) | M9-J's own refusal needed something to eventually narrow |
| M9-L | Instance member read provenance — `target` as declaration identity, never dispatch (ADR-0033) | M9-K |
| M9-M | Project-class type-only emission and type reachability (ADR-0034) | M9-K (class identity) |
| M9-N | Bounded immutable field shape and receiver-based reads (ADR-0035) | M9-K/L/M |
| M9-O | Bounded structural project-class construction (ADR-0036) | M9-M/N |
| M9-P | Constructor-specific structural mapping, required named field-formals (ADR-0037) | M9-O |
| M9-Q | Bounded structural instance getter execution (ADR-0038) | M9-K/L/M/N/O/P (every prerequisite M9-I found missing) |
| M9-R | This milestone — freeze, audit, close | M9-A through M9-Q |

Every link verified against current source while writing this document, not assumed from prior milestone
summaries — most directly by re-reading `_instanceMemberTarget`'s own governing comment (M9-L/ADR-0033)
before any M9-Q code was written, and by re-deriving M9-Q's own dispatch-safety argument from
`_dispatchSafeReceiverClass` (shared between ADR-0035 and ADR-0038) rather than trusting either ADR's own
prose in isolation.

## 5. Final architecture dependency graph

```
M9-H (BRG1310 gate)
  └─ everything below only ever runs on resolved-error-free source

M9-K (owner-qualified identity)
  └─ M9-L (target = provenance, never dispatch)
       ├─ M9-M (type-only emission, type reachability)
       │    └─ M9-N (bounded field shape + receiver-based reads)
       │         └─ M9-O (bounded structural construction)
       │              └─ M9-P (constructor-specific mapping, named field-formals)
       │                   └─ M9-Q (bounded getter execution)
       └─ (M9-J's own refusal condition narrows as each of the above ships its own target-attachment)

M9-A/B/C/F (local/parameter declaration identity) — orthogonal, consumed by M9-O/P/Q's own
  parameter/local binding (Scope.forBody) without new work
M9-D/E/G — orthogonal navigation/presentation semantics, unaffected by the class-member chain
```

## 6. Permanent invariants — proved or falsified

Every invariant the governing brief named (I1–I18) was checked against current source and either directly
demonstrated by an existing test or (I13/I15) by a fresh live probe during this milestone's own audit.

| # | Invariant | Status | Evidence |
|---|---|---|---|
| I1 | Analyzer-invalid Dart → `BRG1310`, never masked | **HOLDS** | `dart/bridge_analyzer` "BRG1310 precedence" tests across M9-N/O/P/Q; re-confirmed structurally — `_class`/`_construction`/`_externalGetterTarget` are all reached only from already-resolved, error-free ASTs |
| I2 | Declaration identity is semantic, never name-only | **HOLDS** | `Symbols.function/variable/type` (owner-qualified); `FieldFormalParameterElement.field`; `GetterElement.isOriginDeclaration`/`.enclosingElement` — every M9-K–Q identity decision resolves through a real `Element`, confirmed by the stale-heuristic audit (§9) |
| I3 | `Alpha.value != Beta.value` even with identical text | **HOLDS** | M9-K's owner-qualified symbol scheme; re-proven directly by this milestone's own new 3-way field/getter/method test (§18) |
| I4 | `target` is provenance, never dispatch | **HOLDS** | `_instanceMemberTarget`'s own governing comment, unchanged since ADR-0033, re-read and re-confirmed correct for M9-Q's own new consumer |
| I5 | Type reachability ≠ executable/value reachability | **HOLDS** | `reachableClassTypes` (type) vs. `reachableFunctions`/`reachableGetters` (value) remain two structurally separate walks in `functions.ts`; a getter-reachable class is unioned into the type set (M9-Q), never the reverse |
| I6 | No runtime TS class/prototype required | **HOLDS** | Checked directly in every build-proof (`bounded_getter_execution_build`, `m9_class_closure_build`): `not.toContain('class Model')`, `not.toMatch(/\.prototype\b/)` |
| I7 | `model.count` → `receiver.count`, not a helper | **HOLDS** | M9-N's own direct receiver-property lowering, unchanged by M9-O/P/Q |
| I8 | Construction is a plain object literal, never `new Model(...)` | **HOLDS** | M9-O/P's own object-literal lowering; checked directly in every construction build-proof |
| I9 | Construction is constructor-specific | **HOLDS** | M9-P's own `constructibleConstructors` array, proven independent per constructor (ADR-0037 §6) |
| I10 | Named-argument source order survives generation | **HOLDS** | M9-P's own `namedArgOrder` mechanism, proven via a reversed-order test at both the unit and real-fixture level |
| I11 | Getter execution is helper-based, never a runtime property | **HOLDS** | Checked directly: `model.doubled` never appears in generated output; `Model_doubled(...)` does |
| I12 | Inside a helper, `count`/`this.count` → `self.count` | **HOLDS** | `scope.memberSelf` rewrite in both `logic.Ref` and `logic.PropertyAccess`; adversarially confirmed load-bearing (M9-Q Mutation B) |
| I13 | Dynamic-dispatch ambiguity stays excluded | **HOLDS** | `_dispatchSafeReceiverClass`'s own "no explicit superclass" gate, re-derived and re-proven during this audit (§19) — no whole-program subclass search anywhere |
| I14 | Methods remain unsupported | **HOLDS**, with one closure fix | A method call on a **parameter** receiver was already refused before this milestone; a method call on a **local** receiver was not (§22) — now fixed, both refuse |
| I15 | Unsupported member semantics → `BRG3013`, never a TS error first | **HOLDS after the M9-R fix** | Before the fix, a method call on a locally-constructed receiver reached `tsc` as its own, uncontrolled error — this was the one real violation this audit found, and it is now closed |
| I16 | No `any` escape hatch | **HOLDS** | Checked directly in every M9-N through M9-R build-proof |
| I17 | Deterministic output | **HOLDS** | `just determinism`, byte-identical; `getterOwnerOf`/`reachableGetters` built from a plain `Set` with a final `.sort()`, mirroring `reachableFunctions`'s own discipline |
| I18 | Fixed point | **HOLDS** | `bridge validate` on `m9_class_closure`: `deterministic: true`, `fixed point: true` |

## 7. Final supported capability matrix

**A. Declarations / identity** — local variables: SUPPORTED. Loop variables: SUPPORTED (M9-A/B). Multi-
declaration locals: SUPPORTED (M9-B). Collection-for parameters: SUPPORTED (M9-F). Class declarations:
SUPPORTED (type-only, M9-M). Fields: SUPPORTED (bounded, M9-N). Explicit getters: SUPPORTED (bounded,
M9-Q). Methods: DEFERRED-M10+. Constructors: SUPPORTED (bounded, M9-O/P). Constructor names: SUPPORTED
(M9-P). Member ownership: SUPPORTED (M9-K). `this`: SUPPORTED (provenance only, M9-L; execution receiver,
M9-Q). Implicit member references: SUPPORTED (M9-L/N/Q).

**B. Project-class types** — public concrete non-generic type positions: SUPPORTED (M9-M). Cross-file
types: SUPPORTED (M9-M). Nullable project-class types: SUPPORTED (M9-M). Private classes:
REFUSED-BRG3013. Generic classes: REFUSED-BRG3013. Inherited classes (as the class being typed):
SUPPORTED for the type-only position (M9-M, deliberately permissive), REFUSED-BRG3013 for
field/construction/getter capability on such a class. External-package classes: REFUSED-BRG3013 (same
member model gap M9-J always named).

**C. Instance fields** — public final non-late field: SUPPORTED (M9-N). Nullable field: SUPPORTED
(M9-N, type-level). Primitive field types: SUPPORTED. Nested project-class field types: SUPPORTED where
the nested type is itself eligible (proven by `Parent.child` chains in `unmodelled_class_member`'s own
fixture). Mutable field: REFUSED-BRG3013. Late final: REFUSED-BRG3013. Private field: REFUSED-BRG3013.
Static field: REFUSED-BRG3013 (never reaches a `PropertyAccess` at all — a compound-name `Ref`). Inherited
field: REFUSED-BRG3013 (owner-consistency check).

**D. Construction** — unnamed bounded field-formal: SUPPORTED (M9-O). Named generative constructor:
SUPPORTED (M9-P). Required named field-formals: SUPPORTED (M9-P). Multiple constructors: SUPPORTED,
independently (M9-P). Constructor-specific field order: SUPPORTED (M9-P). Cross-file construction:
SUPPORTED (M9-O/P). Optional positional: REFUSED-BRG3013. Defaults: DEFERRED-M10+. Factory:
REFUSED-BRG3013. Redirect: REFUSED-BRG3013. Constructor body: REFUSED-BRG3013. Initializer list:
REFUSED-BRG3013. Const: REFUSED-BRG3013. Inheritance/super: REFUSED-BRG3013 (whole-class gate). Generics:
REFUSED-BRG3013.

**E. Executable members** — immutable field read: SUPPORTED (M9-N). Derived getter: SUPPORTED (M9-Q).
Repeated getter access: SUPPORTED, never memoized (M9-Q). Constructed-receiver getter: SUPPORTED (M9-Q,
proven identical to external). External-receiver getter: SUPPORTED (M9-Q). Instance method:
DEFERRED-M10+, and now correctly REFUSED-BRG3013 for every receiver shape (parameter or local — the M9-R
closure fix). Static getter: REFUSED-BRG3013 (never reaches a `PropertyAccess`). Static method:
NOT-APPLICABLE (methods themselves deferred). Private getter: REFUSED-BRG3013 (redundantly, with Dart's
own cross-library privacy). Inherited getter: REFUSED-BRG3013 (receiver-class gate). Overridden getter:
REFUSED-BRG3013 (both the receiver-class gate and, independently, `hasOverride`). Getter calling an
unsupported method: NOT-APPLICABLE (M9-Q's own bounded getter bodies never contain a method call in any
shipped fixture; the body-dependency scope is field-reads-only by design, ADR-0038 §13). Recursion:
REFUSED (a getter-to-getter reference is simply never discovered as reachable — ADR-0038 §13). Setters:
REFUSED-BRG3013 (never represented as `isGetter`; falls through as an ordinary, unsupported method-shaped
member). Writes: REFUSED-BRG3013 (mutable fields excluded at the whole-class gate).

**F. Navigation/presentation M9 features** — dialog inline destination: SUPPORTED (M9-D). Dialog
dismiss: SUPPORTED (M9-E). Collection-for: SUPPORTED (M9-F). Snackbar: SUPPORTED (M9-G). Analyzer error
gating: SUPPORTED (M9-H) — all four orthogonal to, and unaffected by, the class-member chain.

## 8. Final diagnostic matrix

| Source category | Analyzer state | Diagnostic | Compiler behavior |
|---|---|---|---|
| Invalid Dart type/unresolved identifier/invalid final-field init/invalid constructor | `Severity.error` | `BRG1310` | Extraction refuses before any M9 capability check runs (M9-H) |
| Unsupported project getter (inherited/overridden/static/abstract/private) | valid | `BRG3013` | `_externalGetterTarget` attaches no `target`; M9-J's own refusal fires |
| Unsupported method (any receiver shape) | valid | `BRG3013` | M9-J's refusal, now firing for both parameter and local receivers (M9-R fix) |
| Factory/redirect/const/body/initializer-list constructor | valid | `BRG3013` | `_constructibleConstructorEntry` omits the constructor from `constructibleConstructors`; the ordinary construction refusal fires |
| Mutable/private/static project field access | valid | `BRG3013` | `_externalFieldTarget` attaches no `target` |
| Generic class usage outside the bounded subset | valid | `BRG3013` | `_dispatchSafeReceiverClass`/whole-class gate excludes it |
| Malformed internal UIR (bad `TypeRef.target`, dangling constructor field target, etc.) | n/a | `BRG12xx` | Schema/canonical validation — confirmed no generator crash occurs on a malformed document; the parser/validator layer rejects it first |

No category falls through to a raw TypeScript error as its *first* meaningful diagnostic — this was the
exact property the M9-R closure fix (§22) restored for the one case where it did not already hold.

## 9. Stale `unknown`/name-based heuristic audit

A dedicated agent-run audit of `expression.ts`/`types.ts`/`functions.ts` found **no stale capability
inference**. The one place `'unknown'` text is still compared (`isUnmodelledMemberReceiver`) already
checks `TypeRef.target`'s presence *first* and unconditionally returns true for it — a target-bearing type
is caught before the text comparison ever runs, so it does not matter whether an eligible project class
still happens to render as `unknown` text (it does not, since M9-M). The text fallback is correctly scoped
to genuinely untargeted types (`dynamic`, an external-package class, an unrecognized SDK collection).

Name-based checks audited: `logic.New`'s constructor-name match (`constructors.find(c => c.name ===
constructorName)`) is scoped *inside* one already-NodeId-resolved class's own array — safe, since Dart
forbids two same-named constructors on one class. The getter helper's own display name
(`${name}_${getterName}`) is presentation-only; collision safety comes from `ModuleBuilder.declare`'s own
`owner` (NodeId) parameter, adversarially proven in M9-Q's own Mutation A. `declaresClass` is a name-string
lookup wired everywhere as `() => false` — inert by construction, flagged as a minor future cleanup
candidate, not a live risk.

## 10. Dead/abandoned schema audit

`logic.New.fieldTargets` (M9-O's abandoned construction-site design) and `ClassDecl.constructibleFieldOrder`
(M9-O's original class-global mapping, superseded by M9-P's `constructibleConstructors`): **zero
occurrences** in any schema file, generated binding, or production source — confirmed by a repository-wide
search. Both names survive only in ADR-0036/0037 and the M9-O/P milestone docs' own historical narration of
*why* the final design differs from the first draft, which is the correct, honest place for them to remain.

## 11. Final schema inventory (M9-added fields)

| Field | Producer | Consumer | Validator | Still required? |
|---|---|---|---|---|
| `TypeRef.target` | `_classTypeTarget` (M9-M) | `classModules`, every field/getter/construction target resolution (M9-N–Q) | schema `NodeId` pattern | Yes — foundational |
| `FieldDecl.isLate` | `_fields` (M9-N) | `_externalFieldTarget`, `_constructibleConstructorEntry` | schema boolean | Yes |
| `ClassDecl.constructibleConstructors` | `_constructibleConstructors` (M9-P, replacing M9-O's `constructibleFieldOrder`) | `logic.New` lowering (`expression.ts`) | schema array/object | Yes |
| `logic.New.namedArgOrder` | `_arguments(includeNamedOrder: true)` (M9-P) | named-constructor property-order emission | schema string array | Yes |
| `FunctionDecl.isGetter` | `_methods` (M9-Q) | `getterOwnerOf`, `reachableGetters`, helper emission | schema boolean | Yes |

All five are exercised by at least one dedicated determinism test; none is orphaned.

## 12. ADR reconciliation

| ADR | Status |
|---|---|
| ADR-0025 (D2 inline destinations) | MATCHES IMPLEMENTATION |
| ADR-0027 (locally-owned store instances) | MATCHES IMPLEMENTATION |
| ADR-0028 + amendments (declaration identity) | MATCHES IMPLEMENTATION |
| ADR-0029 (top-level function emission) | MATCHES IMPLEMENTATION; directly reused by M9-Q's own helper emission |
| ADR-0030 (Snackbar) | MATCHES IMPLEMENTATION |
| ADR-0031 (BRG1310 gate) | MATCHES IMPLEMENTATION |
| ADR-0032 (class member declaration identity) | MATCHES IMPLEMENTATION |
| ADR-0033 (instance member read provenance) | MATCHES IMPLEMENTATION; its own "target is provenance, never dispatch" argument is the load-bearing citation for M9-Q's entire dispatch-safety design |
| ADR-0034 (type-only emission/reachability) | MATCHES IMPLEMENTATION |
| ADR-0035 (bounded field shape/reads) | MATCHES IMPLEMENTATION; `_externalFieldTarget`'s own class-eligibility logic is now shared, not duplicated, with ADR-0038 |
| ADR-0036 (bounded structural construction) | SUPERSEDED PARTIALLY — its own §6/§7 (construction-site `fieldTargets`) were corrected in-document before commit to describe the final `ClassDecl`-level design; superseded again in *architecture* (not correctness) by ADR-0037's constructor-keyed generalization |
| ADR-0037 (constructor-specific mapping) | MATCHES IMPLEMENTATION |
| ADR-0038 (bounded getter execution) | MATCHES IMPLEMENTATION |

No ADR statement was found to be silently contradicted by current code. M9-I's own historical finding
("getters remain unsupported... six of 22 conditions fail") is not stale — it was true at M9-I's own time;
ADR-0038 §2/§14 explicitly narrates which of those six conditions M9-K through M9-Q resolved and how. No
ADR text was rewritten; every evolution is forward-referenced from the earlier document's own successor
relationship (M9-I → M9-Q; M9-O → M9-P).

## 13. Milestone document reconciliation

No stale "getters remain unsupported"/"only one constructor"/"member targets are absent" statement was
found presented as *current* fact in any M9 milestone doc — M9-I, M9-J, M9-N, and M9-O's own docs each
describe the state *as of their own milestone*, and M9-M/N/O/P/Q's own docs each open with a "prerequisite,
reconfirmed" section naming exactly what they build on. This document is the authoritative current-state
summary; no historical doc required editing to remain honest.

## 14. Final project-class runtime representation

A project-class value is, always, a plain JS object literal satisfying the class's own generated field
shape — indistinguishable whether it arrived as an external prop (M9-N) or was produced by this compiler's
own bounded structural construction (M9-O/P). No constructor function, no prototype, no hidden marker.
Executable members (bounded getters, M9-Q) are ordinary module-level functions taking that same plain
object as an explicit first argument. One representation, proven coherent for both origins directly in
`m9_class_closure`'s own real build-proof.

## 15. Type reachability

Structurally separate from value/executable reachability throughout: `reachableClassTypes` (a component's
own params, a reachable function's own params/return type) is a distinct walk from `reachableFunctions`
(top-level function calls) and `reachableGetters` (M9-Q, getter reads) — the latter's own discovered
classes are unioned into the type set so a getter-only-reachable class still gets a real interface, without
ever conflating "this type is referenced" with "this type's own members are executable."

## 16. Member identity

`(owning ClassDecl id, member's own name)` throughout M9-K–Q — collision-free by Dart's own grammar (no
two same-named members on one class) composed with M9-K's own distinct `ClassDecl` ids. No member ever
needed a separate symbol scheme; `Symbols.function`/`variable` (owner-qualified) sufficed for every one of
fields, methods, getters, and constructors.

## 17. Member provenance

`target` on a `PropertyAccess`/`MethodCall`/`Ref` states a resolved declaration fact, never a dispatch
instruction — unchanged since ADR-0033, re-verified directly against its own governing comment before
M9-Q's own new consumer was written, and holding for every consumer added since (M9-N field reads, M9-O
construction's own `type.target`, M9-Q getter helpers).

## 18. Immutable field reads

`model.count` → `props.model.count` (external) or `{ count: 7 }.count` (constructed) — a direct receiver
property access, never a helper or static lookup, unchanged since M9-N. Re-confirmed via the M9-R closure
audit's own new 3-way field/getter/method test: a field never appears in `ClassDecl.methods` at all,
confirming the two mechanisms (M9-N fields, M9-Q getters) partition Dart's own member declarations without
overlap.

## 19. Structural construction

`Model(7)`/`Model.named(...)` → a plain object literal, argument-evaluation order preserved (positional:
M9-O; named, via `namedArgOrder`: M9-P), independent of field-declaration order. No runtime constructor is
ever called.

## 20. Constructor-specific construction

`ClassDecl.constructibleConstructors` is a per-constructor array; two constructors on one class (e.g.
`Model.first`/`Model.second` with swapped field orders) produce two independent entries, proven directly in
M9-P's own dedicated tests, never a class-global mapping one constructor could silently overwrite.

## 21. Required named field-formals

`Model({required this.count})` supported; matched to a call's own `namedArgs` by field name — provably safe
because Dart's own grammar fixes a required named field-formal's external label to be exactly its own
field's name (ADR-0037 §8), never a text-matching guess.

## 22. Named argument evaluation order — and the one closure fix this milestone made

**Closure fix (I15/I13 §22 of the governing brief).** Fresh reproduction during this audit — `final model =
Model(7); model.multiply(3);` (a valid Dart method call on a locally-constructed receiver) — found this
silently lowered to `{ count: 7 }.multiply(3)`, a nonexistent-property access that would have reached `tsc`
as its own, uncontrolled error rather than this compiler's own `BRG3013`. Root cause: the pre-existing
M9-J refusal's own receiver-shape check (`isParameterReceiver`) recognized only a bare *parameter*
receiver — a deliberate, well-reasoned M9-J-era restriction (a **local's** real TypeScript type is often
something `tsc` infers as genuinely safe even when the underlying Dart type is `unknown`-shaped, e.g. `final
List<String> units = [...]; units.length`) that predates M9-O's own construction feature and could not have
anticipated it. Once M9-O shipped, a local *could* legitimately hold a bounded-construction value whose own
inferred TypeScript shape is *exactly* as narrow as the source class's own eligible field set — there is no
way for `tsc` to infer something *broader* for such a value the way it can for an array literal, so the
original argument for excluding locals from this refusal does not extend to this specific, newly-possible
shape.

**Fix**: a new, narrowly-scoped `isKnownProjectClassReceiver(type)` (`typeof type?.target === 'string'`),
added as an additional disjunct alongside `isParameterReceiver` in both the `PropertyAccess` and
`MethodCall` refusal conditions. Proven safe by construction, not merely tested: it fires only for a
receiver whose own resolved type this compiler has *already proven* a real declaration for
(`TypeRef.target`, ADR-0034) — the identical fact that already makes an external prop's field/getter read
safe to attach a `target` to (ADR-0035/0038) — so extending the *refusal* to the same receiver shape closes
exactly the gap those two features' own success opened, without touching the untargeted-type case the
original `isParameterReceiver` restriction still correctly protects.

**Regression + mutation**: one new unit test (`unmodelled_class_member_refusal.test.ts`) and one new real
fixture + build-proof (`method_call_refusal`/`method_call_refusal_build.test.ts`) added; the pre-existing
"local variable... untouched" test was corrected to distinguish the still-valid untargeted case from the
now-refused targeted case, rather than silently left describing the old, now-incorrect boundary. One
mutate→test→revert cycle performed (removing both new disjuncts): the new unit test failed as expected;
reverted; `git diff --numstat` confirmed a clean revert. Full regression suite (435 TS, 520 Dart) reconfirmed
green after the fix.

**Named-argument order itself** (the feature, not the fix): unaffected by this closure fix — `namedArgOrder`
continues to record real source order (M9-P), consumed only when a matched `constructibleConstructors`
entry's own `kind` is `"named"`, which requires `node['target']` to already be a resolved construction —
an entirely separate code path from the refusal condition this fix touched.

## 23. Getter helper execution

Unchanged from M9-Q, reconfirmed: `model.doubled` → `Model_doubled(self)`, receiver evaluated once,
re-executed on every source access, never memoized, identical for external and constructed receivers.

## 24. Runtime import model

Reconfirmed directly in `m9_class_closure`'s own generated output: a cross-file getter use imports its
helper as an ordinary runtime import (`import { Model_doubled } from ...`), never `{ typeOnly: true }`; a
field-only or construction-only consumer imports nothing beyond the type (or nothing at all, for an
unannotated local). No eager helper import for an unreachable getter — `reachableGetters`'s own walk is
member-level, not class-wide.

## 25. Method refusal — reconfirmed, and one shape fixed

A method call on a **parameter** receiver was already, correctly, `BRG3013` before this milestone. A
method call on a **local** receiver was not — fixed in §22. Both shapes now refuse identically. Methods
remain, unambiguously, `DEFERRED-M10+` — not "not yet tested," not "probably unsupported."

## 26. Inheritance refusal

Reconfirmed via a fresh `Base`/`Child` probe (also present as a dedicated M9-Q unit/Dart test): a
`Child`-typed receiver can never pass `_dispatchSafeReceiverClass`'s own "no explicit superclass" check,
so a member resolved against it can never reach a helper — regardless of whether `Child` overrides the
member, and with zero whole-program subclass search anywhere in this codebase.

## 27. Constructor deferred semantics

Optional/default parameters, factory, redirecting, constructor bodies, arbitrary initializer lists, and
const canonicalization all remain `REFUSED-BRG3013` (excluded at `_constructibleConstructorEntry`'s own
per-constructor gate) — confirmed unchanged by this milestone; none of M9-R's own work touched
`declaration_extractor.dart`'s construction-eligibility logic.

## 28. Schema inventory

See §11.

## 29. ADR reconciliation

See §12.

## 30. Fixture inventory (M9-scoped, new or load-bearing)

| Fixture | Purpose | Status |
|---|---|---|
| `unmodelled_class_member` | M9-J's own refusal boundary, real Dart | Still necessary — parameter-receiver coverage across field/getter/method/inheritance/same-name |
| `class_type_emission` | M9-M type-only emission | Still necessary |
| `immutable_field_reads` | M9-N field reads | Still necessary |
| `structural_class_construction` | M9-O unnamed construction | Still necessary |
| `named_structural_construction` | M9-P named/required-named construction | Still necessary |
| `bounded_getter_execution` | M9-Q getter execution, external + constructed | Still necessary |
| `m9_class_closure` (new) | M9-R — one integrated positive proof: named construction + field reads + getter, no method | New, neutral, deterministic |
| `method_call_refusal` (new) | M9-R — the one closure-fix negative proof, real analyzer to real refusal | New, neutral, deterministic |

No fixture was deleted. No fixture duplicates another's own primary purpose closely enough to warrant
removal — each isolates one milestone's own capability boundary, which `m9_class_closure` does not replace
(it integrates; it does not re-derive each one's own negative-control depth).

## 31. Silent-wrong-code audit

Of the 36 categories the governing brief listed, one was a genuine, confirmed **BLOCKER** (now **FIXED**):
category 32, "unsupported valid source reaches TS error first" (§22). Every other category: **PASS** —
confirmed either by an existing, still-passing adversarial mutation (M9-K through M9-Q's own, re-run where
touched) or by direct inspection during this audit (stale schema, stale `unknown` heuristics, name-based
identity, runtime-class/prototype emission, `any` — none found).

## 32. Test-quality audit

Reviewed every M9-K through M9-Q test group for semantic-vs-snapshot assertions, negative controls, owner
collisions, evaluation-order controls, and refusal-reason checks. One weakness found and corrected during
this audit itself: `unmodelled_class_member_refusal.test.ts`'s own "local variable... untouched" test used
a hand-authored type with no `target` at all, which (after M9-M shipped) no longer represents a *realistic*
eligible-project-class shape — corrected to explicitly split the untargeted (still-untouched) and targeted
(now-refused) cases rather than leaving one test silently describing an outdated boundary.

## 33. Regression audit

Dart: 520/520 (519 pre-M9-R + 1 new 3-way kind-separation test). TypeScript: 435/435 (427 pre-M9-R + 8 new:
1 corrected + 1 new unit test in `unmodelled_class_member_refusal`, 5 in `m9_class_closure_build`, 2 in
`method_call_refusal_build`). Every M9-A through M9-Q milestone's own dedicated test group was re-run by
the full suite run, not merely assumed covered by `just ci`'s own aggregate pass — the milestone-by-milestone
totals above are drawn from the actual test-runner output, not inferred.

## 34. M8 regression audit

Full `just ci`/`dart test`/`pnpm test` runs exercise the complete M8 suite unmodified alongside M9's own;
520/520 and 435/435 include every M8-era group (store/member identity, module emission, numeric/Duration,
switch expressions, enum `.values`) with zero new failures anywhere in that set.

## 35. Framework/SDK control audit

`sdkTypeOf`'s own `library === 'dart:core'` check and `isKitProvided`'s own `package:flutter/...` check
remain the sole gates distinguishing a framework/SDK receiver from a project class — confirmed unchanged
and untouched by this milestone; the M9-R closure fix's own new `isKnownProjectClassReceiver` check only
ever fires on a `TypeRef.target`, which `_classTypeTarget`/`_dispatchSafeReceiverClass` never attach to an
SDK or framework type in the first place.

## 36. CI

`just ci` (build, typecheck, test, codegen-check, lint, lint-negative, uir-lint, uir-test, analyzer-lint,
analyzer-test, dart-analyze): exit code 0. Dart 520/520, TypeScript 435/435, `flutter analyze` clean.

## 37. Determinism

`just determinism`: byte-identical across three runs of every corpus fixture it exercises.

## 38. Fixed point

`bridge validate` on `m9_class_closure`: `deterministic: true`, `fixed point: true`.

## 39. Real `tsc` proof

`m9_class_closure_build.test.ts`'s own final test runs real `node typescript/lib/tsc.js -p
tsconfig.check.json --strict` against the generated project — passing, with a type-only `Model` import
plus a separate runtime `Model_doubled` import, a plain object-literal construction, and no `any`.

## 40. FlutterBridge-only audit

Repository-wide search for `Continuum`/`continuum` outside `docs/`: every occurrence is a code comment
citing real-corpus *evidence* for a design decision (per CLAUDE.md's own explicit provenance exception) —
never an import, a dependency, a fixture source, or a compiler branch. Confirmed for every file the search
surfaced, including this milestone's own new files (zero occurrences).

## 41. M10+ backlog

Grouped by architecture theme:

- **Executable members, continued**: instance methods (parameter identity already proven sound via
  `Scope.forBody`; the missing piece is a rigorous argument-evaluation-order + shadowing proof), setters,
  static members, private runtime members, method tear-offs, getter tear-offs, recursive/cross-member
  helper calls, async methods.
- **Constructor completeness**: optional/default parameters, factory constructors, redirecting
  constructors, constructor bodies, arbitrary initializer lists, const canonicalization.
- **Object-model breadth**: inherited/override dispatch, super calls, mutable fields/writes, generic
  project classes, generic methods, extension members, operators, full `runtimeType` fidelity.
- **Value flow**: broader alias/data-flow provenance beyond the direct-construction case M9-O/Q already
  cover.

## 42. Exact next recommended architecture theme

**A — instance methods, using the M9-Q helper architecture.** Parameter binding is already proven sound;
the receiver-rewrite and reachability machinery M9-Q built is directly reusable (a method helper is
`function Model_multiply(self: Model, factor: number): number`, mechanically identical in shape to a
getter helper with parameters). The remaining work is narrowly scoped: a receiver-then-argument
evaluation-order proof and a parameter/field-shadowing proof under `this.field`, mirroring the depth
ADR-0037 already required before shipping named constructor arguments. This is assessed as higher-value
and lower-risk than B (value-flow expansion, which has no comparably narrow next increment), C (richer
constructor semantics, already the most complete of the four themes after M9-O/P), or D (inheritance
dispatch, which the M9-Q/M9-R audit both found is *correctly and cheaply excluded* rather than blocking
anything real). Not implemented here — recommendation only.

## 43. M9 CLOSED

Every capability from M9-A through M9-Q is internally coherent, every unsupported Dart semantic refuses
honestly (with the one confirmed-and-fixed exception at §22), no schema is orphaned or contradictory, no
ADR is contradicted by implementation, and every generated output is deterministic and fixed-point stable.
FlutterBridge supports a bounded structural subset of project-defined classes: type-only nominal
provenance, selected immutable instance fields, bounded generative structural construction, required
named field-formal construction, and bounded derived getter execution. Instance methods, mutable state,
inheritance dispatch, and the remainder of Dart's full object model are explicitly deferred, per §41, to
M10+.

**M9 is closed. There is no M9-S.**
