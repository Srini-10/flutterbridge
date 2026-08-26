# M9-Q — Executable Member Boundary: Bounded Derived Getters

## 1. Baseline

Started clean at `042d04e` (`HEAD == origin/main`), the M9-P commit. Only the pre-existing, already-known
`fixtures/apps/hello_bridge/analysis_options.yaml` drift was present in the working tree; left untouched
throughout.

## 2. M9-I re-evaluated from scratch

M9-I's own six blocking conditions (§21 of its own doc) were re-checked against the current codebase, not
assumed stale: (4) member declaration identity — **now solved** (M9-K, owner-qualified symbols); (5)
receiver ownership — **now solved** (M9-M's project-class type identity, M9-N's receiver-based reads); (6)
`this` semantics — **now solved** (ADR-0033's `_instanceMemberTarget`, already resolving getters/methods
generically, confirmed by direct code reading before any new code was written); (7) field/member
dependencies — **now solved** (M9-N); (8)/(9) dynamic dispatch/inheritance ambiguity — **newly solved
here** (ADR-0038 §10), by a receiver-class property requiring no corpus search, not by the
`isConstructedLocalReceiver`-style mechanism M9-I could not have anticipated; (15) "no full arbitrary
class implementation required" — confirmed still true: this milestone adds one new per-getter helper
function, nothing resembling a class.

## 3. Getter refusal reproduced fresh

`class Model { final int count; Model(this.count); int get doubled => count * 2; }`, read as
`model.doubled` from both an external prop and a locally-constructed value, reproduced — before any code
changed — as `BRG3013`-equivalent (`UnsupportedCapability`), via the pre-existing M9-J
`isUnmodelledMemberReceiver` path: `PropertyAccess.target` was absent for `doubled`, because
`_externalFieldTarget` (M9-N) explicitly requires `GetterElement.isOriginVariable` (the *synthetic*,
field-backed getter), never `isOriginDeclaration` (an *explicit* one) — confirmed by direct code reading.

## 4. The central architectural problem — answered

There is no runtime `Model` class or prototype, so `model.doubled` cannot literally execute a prototype
getter. This milestone answers the question directly: a module-level helper function, `Model_doubled(self)`,
called wherever the source read `model.doubled` — never a property access on the emitted object at all.
ADR-0038 records the full architecture; this doc records the evidence and process that produced it.

## 5. Member execution model — decision

Option A (top-level generated helper functions) was selected after evaluating all six candidates the
governing brief named (ADR-0038 §2). Option B (function values on object literals) was rejected on the
exact ground the brief itself anticipated: it would produce two incompatible representations of "a
`Model`" depending on whether the value arrived as an external prop or was constructed locally. Option C
(a runtime class) was rejected as reversing four milestones' worth of established runtime-free
architecture, absent an overwhelming reason — none was found.

## 6. Explicit receiver parameter model

Every helper takes `self` as its own first parameter; inside the body, both the implicit (`count`) and
explicit (`this.count`) forms of a field read rewrite to `self.count`. No free variable, no implicit
global `this`, no accidental binding to `props` unless the receiver genuinely is `props.model`.

## 7. `target` remains provenance, not dispatch

Reconfirmed directly, by reading `_instanceMemberTarget`'s own governing doc comment before writing any
new code: it already stated, for M9-L/M9-J, that `target` "is exactly as true for `Base.readImplicit`'s
own `value`... as it is for a `final` class with no subclasses at all — because nothing that reads
`target` anywhere in this codebase treats it as 'invoke this declaration instead of the receiver.'" This
milestone's own safety does not come from changing what `target` means; it comes from bounding *which
receivers* can ever get one for a getter (§8).

## 8. Dispatch-safe subset — derived, not assumed

The brief's own worry (`Base`/`Child`, `Child` overriding `Base.value`) was investigated by reasoning
through the *existing* class-eligibility gate (`_dispatchSafeReceiverClass`, shared with ADR-0035's own
`_externalFieldTarget`): a receiver typed as `Child` fails the "no explicit superclass" check on its own
type, unconditionally — so a member resolved against a `Child`-typed receiver can *never* reach this
mechanism at all, whether or not `Child` overrides the member, and with no need to search the program for
subclasses of `Base`. This was proven, not merely asserted, with a paired test: `child.doubled` (`Child
extends Base`) untargeted; `base.doubled` (identical getter, `Base`-typed receiver) targeted. A second,
independent test proved the `@override` check is *not* merely redundant with this gate: a class with no
superclass but implementing an interface (`implements`, which never changes `supertype`) still requires
the annotation check specifically to exclude an overriding implementation.

## 9. Getter eligibility — established via evidence, not the initial hypothesis alone

Final gate (`_externalGetterTarget`, ADR-0038 §10): dispatch-safe receiver class; `GetterElement
.isOriginDeclaration` (explicit); non-static; non-abstract (a real body); non-external; non-private;
`!metadata.hasOverride`; declared directly on the receiver's own class (owner consistency, mirroring
ADR-0035's identical check for fields). An adversarial mutation removing the private/static checks
specifically was **not** caught by any test — both are independently, redundantly excluded elsewhere (a
private member is unreachable cross-library in valid Dart; a static qualifier never reaches a
`PropertyAccess` at all) — recorded honestly as the identical "defense in depth" shape ADR-0035 §21
already established for fields, not chased into a contrived test.

## 10. Q1–Q20 getter reduction ladder — classified

| Rung | Shape | Result |
|---|---|---|
| Q1 | Expression-bodied getter, external read | Supported |
| Q2 | `this.field` explicit read | Supported — identical target to the implicit form |
| Q6 | Two distinct fields read | Supported |
| Q9/Q10/Q11 | Block body, local variable, `if`/`return` | Supported — reuses ADR-29's own statement machinery |
| Q17/Q62 | Inherited getter via subclass-typed receiver | Excluded — receiver class gate |
| Q19 | Private getter | Excluded — redundantly, by Dart's own cross-library privacy and this gate |
| Q34 | Abstract getter (no body) | Excluded — `isAbstract` |
| Q39 | Generic class | Excluded — shared class gate |
| — | Static getter | Excluded — redundantly, never reaches a `PropertyAccess` at all |
| — | Private class | Excluded — shared class gate |
| — | `@override`, isolated via `implements` | Excluded — independently load-bearing, proven (§8) |
| Q50 | Same getter name, two classes | No collision — owner-qualified identity |
| Q52 | Field (one class) vs. getter (another), same name | No confusion — resolved by `Element` kind, never text |
| Q59 | Local shadows field name | Resolves to the local |

Rungs this milestone did not ship (Q13/Q14 recursive/mutually-recursive getters, Q15 getter-calling-method,
Q16 mutable/private/static/late field reads, Q18 external getter): excluded by the same field-only,
non-recursive body-dependency scope decision (§13 of ADR-0038), not individually re-derived — each is
either subsumed by an existing exclusion (Q16 by M9-N's own field eligibility) or by the deliberate
"getter→fields only" scope boundary (Q13/Q14/Q15).

## 11. Method investigation — Outcome A1, not A2

Method parameter identity was investigated directly, not assumed: `_methods()`'s own
`Scope.forBody(...).child([Binding(name:..., binds: Binds.parameter)...])` is the *identical* mechanism
`_function` (top-level functions) already uses and this whole compiler has relied on since M1–M3 — so
parameter identity itself is not a missing prerequisite. What stopped short of a method implementation
within this milestone was a comparably rigorous receiver-then-argument evaluation-order proof and a
parameter/field-shadowing proof under `this.field`, mirroring the depth ADR-0037 required for named
arguments before shipping them. Per the governing brief's own explicit priority ("ship getters only... do
not create another M9 method milestone"), this is recorded as a deliberate stop: **Outcome A1**, methods
deferred to M10+.

## 12. Schema decision

One field added, on the existing `logic.FunctionDecl` (already used both for top-level functions and,
unsymboled until now, for class methods): `isGetter: boolean`. No new node kind, no `GetterDecl`, no
duplicate body representation — `ClassDecl.methods` already carried everything a getter's own execution
needs (name, params, body, return type); the one missing fact was "is this specific entry a getter,"
which distinguishes it from an ordinary method for reachability-walk purposes (a method call reaches the
generator as `logic.MethodCall`, never `logic.PropertyAccess`, so the two could not structurally collide
even without the flag, but the flag makes the distinction explicit and queryable rather than inferred from
call-site shape alone). `shared.json`'s `x-uir-version`: `1.14.0` → `1.15.0`.

## 13. ADR gate

ADR-0038 (next number after ADR-0037, confirmed via `ls docs/adr/`) written and reviewed before any
production code changed, covering all 20 required decisions the governing brief named — architecture,
identity, module ownership, dispatch safety, execution semantics, and explicit M10+ deferrals.

## 14. Implementation gate

All getter-specific conditions (1–19) and all global conditions (29–37) the governing brief listed were
satisfied — most directly evidenced by §3–§11 above; none failed. Method-specific conditions (20–28) were
not fully proven within this milestone's own scope, so per the gate's own instruction ("if getter gates
pass but method gates fail: ship getters only"), only getters shipped.

## 15. Analyzer changes

`dart/bridge_analyzer/lib/src/session/extract/declaration_extractor.dart`: `_methods()` gained
`if (member.isGetter) 'isGetter': const RawLiteral(true),`.
`dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart`: `_externalFieldTarget`'s own
class-eligibility check factored out into a new, shared `_dispatchSafeReceiverClass`; a new
`_externalGetterTarget` (ADR-0038 §10) wired into both the `PrefixedIdentifier()` and `PropertyAccess()`
external-read cases, alongside the existing `_externalFieldTarget` call.

## 16. Compiler/N-pass changes

None. `isGetter` and every getter's own body pass through N1–N11 unmodified.

## 17. Generator changes

`packages/generators/react/src/internal/emit/expression.ts`: `EmitScope` gained `getterHelpers` (a
`functionModules`-shaped map, keyed by a getter's own embedded id) and `memberSelf` (set only while
emitting a member helper's own body). `case 'logic.Ref':` and `case 'logic.PropertyAccess':` each gained an
early check rewriting an implicit/explicit field read to `self.<field>` while `memberSelf` is set.
`case 'logic.PropertyAccess':` additionally resolves `target` against `getterHelpers`, emitting a call to
the resolved helper (receiver evaluated once, as the helper's one argument) in place of the ordinary
`receiver.property` lowering.
`packages/generators/react/src/internal/emit/functions.ts`: `emitFunctionModules` gained a
`getterOwnerOf` index (getter id → owning `ClassDecl` id, built once from the full node list — `FunctionDecl`
embedded on `ClassDecl.methods` is not itself `scope.node()`-addressable, the identical structural fact
ADR-0034/0036/0037 already established), a `reachableGetters` walk (mirroring `reachableFunctions`'s own
discipline, with no fixed-point pass into a getter's own body — ADR-0038 §13), and a class-type-reachability
union so a getter-only-reachable class (never itself a component param/return type) still gets a real
emitted interface for `self`'s own type to reference. Emission itself is folded into the existing
per-class type-interface loop, reusing its own `pending`/`classOf`/`scratch`-module machinery.

## 18. Runtime changes

None.

## 19. Tests added

- Dart: 19 new tests in `'bounded structural instance getter execution provenance (ADR-0038, M9-Q)'`, plus
  two pre-existing M9-N tests updated to reflect the new, intentional M9-Q boundary (an explicit getter and
  a private field's own public getter are now legitimately targeted — by the getter mechanism, not the
  field one). Full suite: 519/519 passing (500 pre-M9-Q + 19 new).
- TypeScript: 11 new hand-authored-UIR unit tests (`bounded_getter_execution.test.ts`) plus a 5-test real
  build-proof file (`bounded_getter_execution_build.test.ts`). Full suite: 427/427 passing (416 pre-M9-Q +
  11 net new).

## 20. Real fixture

`fixtures/apps/bounded_getter_execution/` — `lib/model.dart` (`class Model { final int count; Model(this
.count); int get doubled => count * 2; }`) and `lib/main.dart`, with two bare, unrouted components:
`ExternalReader` (receives `Model` as a prop) and `ConstructedReader` (constructs one locally via M9-O),
both reading `model.doubled` — proving the identical helper serves both receiver origins.

## 21. Real build proof

`bounded_getter_execution_build.test.ts`: generator reports no error; both components call
`Model_doubled(...)` with no `.doubled` property access, no `new Model`, no `class Model`, no `any`; the
generated module carries `export function Model_doubled(self: Model): number { return (self.count * 2); }`;
real `tsc --strict` against the real, unmocked `@bridge/runtime-react`.

## 22. Adversarial mutations

Five mutations performed; every revert confirmed via `git diff --numstat` matching the pre-mutation
baseline exactly.

1. **Mutation A — helper identity from name text alone (shared `owner` param).** **Not caught** by the
   original "same getter name, two classes" test — a genuine gap, since the two classes' own names
   differed, so the preferred *text* never actually collided regardless of `owner`. A new test was added —
   two distinct declarations requesting the identical preferred text (`Foo_bar.baz` and `Foo.bar_baz`,
   both `Foo_bar_baz`) — and the mutation was re-run and confirmed caught by that test alone (the second
   declaration silently overwrote the first).
2. **Mutation B — drop the explicit-receiver rewrite (free variable instead).** Caught: 9 of 11 unit/build
   tests failed (a bare, unbound `count` reference inside the helper body, and the real fixture failing to
   typecheck).
3. **Mutations D/H — remove owner-consistency and `@override` checks together.** **Not caught** by the
   existing inheritance/override tests on the first pass — both used a class with a real superclass, so
   the *class*-level gate (not the member-level checks under test) already excluded them, redundantly. A
   new, deliberately isolated test was added (`implements`, not `extends` — proven not to touch
   `supertype`) and the mutation was re-run and confirmed caught by that test alone.
4. **Mutation E — remove all per-member checks (isStatic/isAbstract/isExternal/isPrivate/hasOverride).**
   Caught by 2 of 19 tests (abstract, the isolated `@override`/`implements` test) — private and static
   were *not* caught, confirmed to be redundantly protected elsewhere (§9), an honest finding rather than a
   forced additional test.
5. **Mutation F — force getter reachability empty.** Caught: 9 of 11 unit/build tests failed (no helper
   ever emitted, every getter read refused).

## 23. Real evaluation/re-evaluation proof

A getter reading two distinct fields off one receiver expression was proven to emit that receiver's own
text exactly once (`Model_combined({ a: 7, b: 8 })`, not once per field) — the concrete argument against
inlining (Option D). Re-evaluation (no memoization) was proven by two independent read sites of the
identical getter, each independently emitting its own call to the shared helper — confirmed structurally
(the helper itself is an ordinary function; nothing wraps it in a memoizing construct anywhere in this
generator).

## 24. M9-N/M9-M/M9-L/M9-K/M9-J/M9-H regressions

All reconfirmed via the full regression suite and by direct inspection: `_dispatchSafeReceiverClass` is
`_externalFieldTarget`'s own prior logic, factored out losslessly (confirmed via the full M9-N test group,
19/19 passing including two intentionally updated for the new M9-Q boundary); M9-J's refusal shape is
unchanged; M9-K/M9-L identity and provenance are unread and unmodified by this milestone's own new code
paths beyond consuming `_instanceMemberTarget`'s own pre-existing, unmodified resolution.

## 25. Validation

- `dart analyze --fatal-infos` (all touched files): clean.
- `dart test` (`dart/bridge_analyzer`, full suite): 519/519 passing.
- `pnpm --filter @bridge/gen-react test` (full suite): 427/427 passing.
- `just build`, `just typecheck`, `just lint`, `just codegen-check`: all green.
- `just ci`: exit code 0, end to end.
- `just determinism`: byte-identical across three runs of every corpus fixture it exercises.
- Real fixture build-proof: `bridge normalize` (N1–N11, unmodified) → generator → real `tsc --strict`,
  passing.

## 26. Silent-wrong-code audit

- A class-global "all members executable" flag: never introduced — eligibility is computed per member,
  per read site, via `_externalGetterTarget`'s own full gate every time.
- Helper collision from name-text coincidence: adversarially confirmed impossible (Mutation A, corrected).
- Inherited/overridden getter treated as safe: adversarially confirmed excluded, independently of both the
  superclass gate and the `@override` check (Mutations D/H, corrected test).
- Getter result cached/memoized: not applicable — the helper is an ordinary function; confirmed by
  inspection, no memoizing construct exists in its own emission path.
- Runtime class/prototype emitted: checked directly in the build proof — absent.
- `any` introduced anywhere: checked directly — absent.
- M9-N field capability weakened: unaffected — `_dispatchSafeReceiverClass` is the identical prior logic.

## 27. FlutterBridge-only boundary

No reference to Continuum, or to any application beyond this repository's own fixtures, in ADR-0038, this
milestone doc, the Dart/TypeScript implementation, the new fixture, or any new test — confirmed by review
of every touched file's own content.

## 28. `hello_bridge` drift

`fixtures/apps/hello_bridge/analysis_options.yaml`'s pre-existing, already-known drift remains untouched,
unstaged, and uncommitted throughout this milestone.

## 29. M9-R — the final milestone, not started

No file under this milestone's own scope begins M9-R's own closure work. Per the fixed remaining M9 plan,
M9-Q is the final capability-expansion milestone; M9-R closes M9 itself. No further executable-member
milestone is recommended — everything this milestone deliberately deferred (methods, private/static
members, member-to-member calls, recursion, async, generics, inheritance-based construction) belongs to
M10+'s own backlog, not to a new M9 sub-milestone.
