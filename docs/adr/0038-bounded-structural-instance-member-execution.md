# ADR-0038 — Bounded Structural Instance Member Execution

## 1. The structural runtime instance model, reused unmodified

A project-defined class value remains exactly what ADR-0034/ADR-0035/ADR-0036/ADR-0037 already made it: a
plain JS object satisfying the class's own generated field shape, indistinguishable whether it arrived as
an external prop or was built by this compiler's own bounded structural construction. This ADR introduces
no second representation, no marker, no hidden tag distinguishing a "constructed" instance from an
"external" one — a getter execution must, and does, behave identically for both (§7).

## 2. Member helper model — Option A, selected

Of the six candidates the governing brief named:

- **A — top-level generated member helper functions** (selected): `function Model_doubled(self: Model):
  number { return self.count * 2; }`, called as `Model_doubled(model)`. Reuses ADR-29's own
  `logic.FunctionDecl` module-emission machinery almost directly — a getter's own body already extracts
  through the identical `Scope.forBody`/parameter-binding/statement-emission path a top-level function's
  does (`_methods` reuses `_params`, `expressions.bodyOf`, exactly as `_function` does).
- **B — attach function values to object literals** (`{ count: 7, multiply(factor) {...} }`): rejected —
  an externally-supplied structural prop (M9-N) would never carry such a function, producing two
  incompatible representations of "a `Model`" depending on how one arrived. Treated with the suspicion the
  brief itself demanded, and rejected on exactly the ground it anticipated.
- **C — a runtime TypeScript class**: rejected — would solve prototype methods/getters natively, but
  reverses the entire runtime-free structural model M9-M/N/O/P already established and validated across
  four milestones. Not adopted absent an overwhelming correctness reason, and none was found: Option A
  proves member execution does not need it.
- **D — inline the getter body at each use site**: rejected outright, for the identical reasons M9-I
  already gave and this ADR reconfirms directly (§8): a receiver with a side effect would be evaluated
  once per field the getter's own body reads, not once.
- **E — helpers for getters only, methods deferred**: this is the outcome actually selected (§14) — not
  because methods are unsafe in principle, but because the evidence this milestone gathered supports
  getters completely and stops short of a comparably thorough method-argument-evaluation-order proof
  within this milestone's own scope.
- **F — no executable members in M9**: not selected — the prerequisite graph M9-I named as blocking
  (owner-qualified member identity, truthful receiver/`this` provenance, project-class type identity,
  receiver-based field reads, structural construction) is now fully built (M9-K/L/M/N/O/P), and this ADR's
  own investigation found no new prerequisite failure serious enough to justify another deferral.

## 3. Explicit receiver parameter

Every helper takes its own receiver explicitly, as its first (and, for a getter, only) parameter, named
`self` by convention. No implicit `this`, no free variable, no binding to `props` unless the receiver
*is* `props.model` — the helper's own body never knows or cares how its caller obtained the receiver.

## 4. Member identity

A member's identity is `(its own owning `ClassDecl`, its own declared name)` — the identical composition
ADR-0037 §2 already established for a constructor, applied here to a getter. Dart forbids a class from
declaring two members with the same name (a getter and a same-named method cannot coexist), and two
classes are already two distinct `ClassDecl` ids (M9-K) — so this identity is collision-free by
construction, with no new symbol scheme.

## 5. Helper identity

The generated helper's own display name (`Model_doubled`) is a human-readable convenience, never the
source of collision safety. Safety comes from `ModuleBuilder.declare(preferred, owner)`'s own `owner`
parameter — the getter's own unique declaration id — exactly the mechanism ADR-29/ADR-0034 already rely
on for a same-named function or class in one file. Proven directly: two declarations that produce the
*identical* preferred text (`Foo_bar`'s own `baz` and `Foo`'s own `bar_baz`, both requesting
`Foo_bar_baz`) still resolve to two distinct exports (`Foo_bar_baz`, `Foo_bar_baz2`) — this is the
adversarial case that actually exercises `declare`'s own collision path, as opposed to two getters whose
preferred text merely happens to differ because their owning classes are named differently.

## 6. Module ownership and runtime imports

A getter's own helper is emitted into the identical per-Dart-file module its owning class's own type
interface already lives in (ADR-0034's `modulePathFor`) — co-located, not a new file convention. Unlike a
type reference, a helper *is* a runtime value: a cross-file caller imports it as an ordinary runtime
import (`import { Model_doubled } from '...'`), never `{ typeOnly: true }` — this is the first point in
this line of work where a project-class-typed module legitimately needs a runtime, not merely a
type-only, cross-file import, and it is represented as exactly that, not disguised as a type import.

## 7. Coherence across external and constructed receivers

A getter's own eligibility (§10 below) and lowering depend only on the class's own declaration and the
member's own body — never on how a particular value was obtained. Proven directly, in the real fixture:
`ExternalReader`'s own `props.model.doubled` and `ConstructedReader`'s own `Model(7).doubled` (M9-O's
construction) both lower to a call to the identical `Model_doubled` helper.

## 8. Getter execution semantics: re-evaluated every access, receiver evaluated once

Dart re-runs a getter's own body on every access; this ADR's own lowering does the same — `Model_doubled`
is an ordinary function call, never memoized, never cached, so two reads of `model.doubled` in one
render call it twice, matching Dart's own semantics exactly. The receiver expression is emitted exactly
once per read site, as the helper's one argument, regardless of how many of the getter's own fields it
reads internally — proven directly with a getter reading two distinct fields off one receiver expression,
confirming the receiver's own emitted text appears once, not once per field. This is the concrete argument
against Option D (§2): inlining the getter's own body at the use site would have emitted the receiver's
text once per field reference inside that body, duplicating any side effect it carried.

## 9. `target` remains provenance, dispatch safety is a receiver-class property, not a target property

`PropertyAccess.target` continues to mean exactly what ADR-0033 already established: a resolved
declaration-identity fact, never an instruction to statically dispatch regardless of what a receiver
"really is" at runtime. This ADR's own safety does not come from treating `target` differently — it comes
from *never letting `target` be attached at all* for a receiver whose own static type could ever be a
subclass (§10). `target`'s own meaning is unchanged; the *set of receivers it can appear on* is what this
ADR bounds.

## 10. Dispatch-safe subset — a receiver-class property, no corpus search

A getter is executable-eligible only when: the receiver's own resolved static type is a non-generic
`InterfaceType` whose element is a public `ClassElement` with no explicit superclass (`Object` only) and
is not a component/`State`/store base (`_dispatchSafeReceiverClass`, factored out of, and shared with,
ADR-0035's own `_externalFieldTarget`); the member itself is `GetterElement.isOriginDeclaration` (explicit,
never the field-backed synthetic form ADR-0035 already owns), non-static, non-abstract (a real body),
non-external, non-private, and carries no `@override` annotation; and it is declared directly on that same
class (`element.enclosingElement == ownerClass`, never merely inherited).

**The entire dynamic-dispatch exclusion follows from the first clause alone, with no subclass search.** A
receiver typed as `Child` (`Child extends Base`) can never pass the "no explicit superclass" check on its
own type — so a member resolved against a `Child`-typed receiver can never reach a helper at all, whether
or not `Child` overrides the member, and whether or not any subclass exists anywhere else in the program.
Reading the identical getter directly off a `Base`-typed receiver, by contrast, is targeted — proven as a
paired positive/negative test. This is precisely the "prefer class declaration restrictions over corpus
inference" instruction the governing brief gave, satisfied structurally rather than by a whole-program
"does this class have a subclass" pass, which was considered and rejected as unnecessary once this
argument was proven, not merely asserted.

Verified independently, via `implements` (which — unlike `extends`/`with` — never changes a class's own
resolved `supertype`): a class with **no** explicit superclass but a member marked `@override` (satisfying
an interface) is still excluded, proving the `hasOverride` check is independently load-bearing and not
merely redundant with the superclass gate every other override example in this suite happens to also
fail through.

## 11. Getter body reduction ladder — what shipped

Expression-bodied and block-bodied getters, local variables, `if`/`return`, multiple statements, and
reads of more than one field all work — inherited without new code, because a getter's own body reuses
the identical statement/expression-emission machinery ADR-29's own top-level functions already use.
Getter-to-getter and getter-to-method calls are **not** supported in this milestone — see §14.

## 12. Internal field-read rewrite

Inside a helper's own body, both the implicit form (`count`, extracted as a bare `logic.Ref` whose
`target` is the field's own id) and the explicit form (`this.count`, extracted as a `logic.PropertyAccess`
whose receiver is `this`) rewrite to `self.<field>` — the identical field target both forms already carry
(ADR-0033), consumed by one new, narrowly-scoped check in `expression.ts`'s `logic.Ref`/`logic.PropertyAccess`
cases, active only while `scope.memberSelf` is set (i.e., only while emitting a member helper's own body;
absent everywhere else, so no other body's own field/local/parameter resolution is affected). A local
variable that shadows a field name resolves to the local — proven directly — because the rewrite only
ever fires when `target` resolves to an entry in the *class's own* embedded `fields` array; a local's own
`target` (its own ADR-28 declaration identity) never does.

## 13. Member-body dependency rules — no cross-member matrix

A getter's own body is supported only insofar as it reads fields (and locals derived from them); a read of
another getter or method inside a getter's own body is not specially recognized, and falls through to
whatever the ordinary, unrelated refusal path for an unresolved instance-member reference already is. This
was a deliberate scope decision (§14), not an oversight: no fixed-point reachability walk into a getter's
own body was built, matching the governing brief's own "prefer first support set: getter→fields... do not
force the full matrix" instruction.

## 14. Selected Outcome: A1 — bounded getter execution only

Methods are deferred to M10+. Investigation found no evidence that a bounded method subset is unsound —
required-positional method parameters already reuse the identical, already-proven `Scope.forBody`
parameter-binding mechanism a getter's own zero-parameter case does not need to exercise — but a
comparably thorough proof of method receiver-then-argument evaluation order, and of the interaction
between a method's own parameters and a field of the identical name (shadowing, proven only for a
getter's own locals here), was not built within this milestone's own scope. Per the governing brief's own
explicit instruction ("do not force A2... if methods fail the gate: ship getters only... do not create
another M9 method milestone"), this is recorded as a deliberate stop, not a failure — M9-Q is the final M9
capability-expansion milestone; a bounded method subset, if ever pursued, belongs to M10+.

## 15. Private, static, and generic member boundaries — unchanged, doubly redundant where inherited

Private and static getters are excluded both by `_externalGetterTarget`'s own explicit checks *and*,
independently, by facts already established elsewhere (a private member is unreachable from outside its
own library in valid Dart; a static qualifier extracts as a compound-name `logic.Ref`, never a
`PropertyAccess`, before `_externalGetterTarget` is ever consulted) — confirmed directly by an adversarial
mutation removing the explicit checks, which neither test caught, exactly mirroring the "defense in depth"
precedent ADR-0035 §21 already established for fields. Generic classes are excluded via the shared
`_dispatchSafeReceiverClass` gate (a generic instantiation's own `typeArguments` are non-empty),
independent of getters specifically.

## 16. M9-J refusal migration — member-specific, never whole-class

The existing `!kitProvided && ...` / `isUnmodelledMemberReceiver` refusal is unchanged in shape. A getter
read reaching a resolved helper (`scope.getterHelpers.get(target)`) is a new, earlier-checked path — not a
new disjunctive exemption on the refusal condition itself, since a getter read already carried a `target`
once `_externalGetterTarget` proved it eligible, and the *value* of that target (does it resolve to a
`getterHelpers` entry) is what the `PropertyAccess` case now additionally consults. Every unsupported
member — an ineligible getter, any method, any operator, any setter — still reaches the identical,
unchanged refusal it always did. Eligibility remains member-specific throughout: an eligible getter never
implies its own class's other members (an unrelated unsupported method, say) become executable — there is
no `classExecutable` flag anywhere in this design.

## 17. M9-N field interaction

Unaffected and directly reused: `_dispatchSafeReceiverClass` is the identical class-eligibility gate
`_externalFieldTarget` already used, factored out once both needed it verbatim. A field and a getter of
the identical property name on two different classes are never confused — capability is selected by the
member's own resolved `Element` kind (`GetterElement.isOriginDeclaration` vs. `.isOriginVariable`), never
by property-name text, proven directly.

## 18. M9-O/P construction interaction

Unaffected: a getter's own eligibility and lowering never inspect `constructibleConstructors` or how a
receiver was produced. Proven directly (§7) — the real fixture's own `ConstructedReader` exercises exactly
this interaction end to end.

## 19. Determinism

`getterOwnerOf` and `reachableGetters` are built once, from the full node list and a plain `Set`, never an
unordered map whose iteration order could vary; the final `[...found].sort()` (mirroring
`reachableFunctions`'s own discipline) makes helper-emission order independent of discovery order.
Reconfirmed via a dedicated same-source, two-run extraction test, and via `just determinism` over the
existing corpus.

## 20. Future migration

Nothing here forecloses a future method milestone, a richer member-to-member reachability walk, or (if
ever truly warranted) a runtime-class migration — this ADR's own helper model, receiver rewrite, and
identity scheme are additive and were not designed around getters specifically; a method would reuse every
piece of this ADR except the missing argument-evaluation-order proof §14 names as the actual gap.
