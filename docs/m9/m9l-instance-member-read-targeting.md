# M9-L — Instance Member-Read Targeting, `this` Semantics & Dispatch-Safe Provenance

## 1. Baseline

Entering M9-L: M9-K (`502684c`) gives every `logic.ClassDecl` and its own `FieldDecl`/`FunctionDecl`
members owner-qualified symbols (`var:path#Owner.name`, `fn:path#Owner.name`), fixing the
Alpha.value/Beta.value collision. Nothing yet *targets* those symbols from a read site — a `count`
read inside `Counter`'s own body, implicit or as `this.count`, carried no `target` at all. M9-J
(`eb4b6e9`) refuses `model.count`-shaped external reads outright (`BRG3013`), gated on the read's
`target` being absent. M9-L's mission: give internal reads (implicit and explicit `this.x`) truthful
`target`s without disturbing that refusal or inventing dispatch semantics FlutterBridge does not have.

## 2. Governing ADRs/docs read

ADR-0027 (store instance targeting, the direct template — `_storeMemberTarget`), ADR-0028 (local
scoping), ADR-0031 (resolved-errors gate, M9-H), ADR-0032 (class member declaration identity, M9-K),
`docs/m9/m9i-instance-derived-getter-modeling.md`, `docs/m9/m9j-unsupported-project-class-member-refusal.md`,
`docs/m9/m9k-class-declaration-identity-and-emission.md`, Spec v2.0 + amendments through v2.5.

## 3. Reproduction — implicit vs. explicit `this` (fresh probes)

Reproduced live, not assumed: a class with `int get implicitRead => count;` and
`int get explicitRead => this.count;` extracts `count` as a bare `logic.Ref` and `this.count` as a
`logic.PropertyAccess` with an explicit `ThisExpression` receiver — two different UIR shapes for the
same declaration, neither carrying a `target` before this milestone.

## 4. Dart dynamic dispatch semantics — real execution proof

A standalone `dart run` script (not `dart analyze`, actual runtime execution) proved virtual dispatch
for both spellings, even for reads inside the *base* class's own body:

```dart
class Base { int get value => 1; int get readImplicit => value; int get readExplicit => this.value; }
class Child extends Base { @override int get value => 2; }
```

`Child().readImplicit == 2` and `Child().readExplicit == 2` — Dart dispatches virtually regardless of
implicit/explicit spelling, confirmed by execution, not by reading the spec.

## 5. `target` ≠ static dispatch — the audit

Every existing producer/consumer of `target` on a `PropertyAccess`/`MethodCall` (`_storeMemberTarget`,
`_topLevelTarget`, `_enumConstantTarget`, the generator's own `expression.ts`) was audited directly:
the receiver expression is *always* still evaluated and emitted; `target` only ever selects how to
lower the property/method spelling (e.g. a store's `.get()` suffix). Nothing anywhere treats `target`
as "invoke this declaration directly, skip the receiver." This is the load-bearing fact of the whole
milestone — full detail in ADR-0033 §1.

## 6. Canonical target — field-backed accessors

The field's own `FieldDecl` declaration, never a separate synthetic-getter identity. Proven via
`GetterElement.isOriginVariable`: the implicit accessor Dart synthesizes for a plain field resolves
through `Symbols.variableIn`, the identical scheme the field's own `FieldDecl` already carries.

## 7. Canonical target — explicit getters

An ordinary `Symbols.functionIn`-derived symbol, keyed by `GetterElement.isOriginDeclaration` (i.e.
`!isOriginVariable`). Repeated reads of the same getter resolve to the identical target; two unrelated
classes with byte-identical getter bodies resolve to distinct targets (ADR-0032 regression, re-verified).

## 8. `this`-representation options evaluated

A. Dedicated `logic.This` node — rejected, no schema change needed.
B. `Ref` to a synthetic instance binding — rejected, no such binding is ever created or needed.
C. Reuse intrinsic machinery — rejected, `this`/`super` already have their own shim (`_instanceRef`).
D. Member-relative receiver marker (`InstanceMemberRead`, distinct from `PropertyAccess`) — rejected,
would require a real schema addition (`implicitReceiver: true`) proven unnecessary by §9 below.
E. Keep the existing structural difference (implicit `Ref` vs. explicit `PropertyAccess`) — **selected**.

## 9. Selected `this`-representation

Option E: kept the pre-existing `_instanceRef(node, 'this')` shim unmodified
(`logic.Ref{name:'this', type: <static type>}`). Provenance is derived directly from
`Element.enclosingElement`, never by resolving `this` itself to anything — so no new node or binding
was needed to answer "what does this read refer to." Full rationale: ADR-0033 §3.

## 10. Reduction ladder (L1–L28) — summary

Worked through the governing brief's own 28-item ladder live, against real probe fixtures: bare field
read, `this.field` read, getter-to-getter chain (implicit and explicit), local shadowing a field,
parameter shadowing a field, inherited (not overridden) member, same-name cross-class members, static
member inside a static method, extension getter (must stay untargeted), analyzer-invalid getter body
(must stay `BRG1310`, never reach member-target logic), component's own field read inside its own
`build()` (must stay untargeted — M9-J boundary), `State`'s own store-instance field (must stay bound
via ADR-27's own mechanism, not this one). Every item resolved correctly on the first fully-corrected
implementation (post the two regressions in §38–39); each item now has a permanent regression test
(§27–37).

## 11. Scope/shadowing audit approach

Confirmed by direct code reading, not assumption: `_instanceMemberTarget` is keyed exclusively on
`element.enclosingElement is InstanceElement`, where `element` is the analyzer's own resolved
`node.element` for a `SimpleIdentifier`. There is no name-string comparison anywhere in the function —
grepped the full body for `.name ==` / `==.*name` patterns used as a matching heuristic: none exist.

## 12. Local-shadows-field — proof

Live: a local `final count = ...;` inside a method whose enclosing class also declares a field `count`
resolves `node.element` to the local's own `LocalVariableElement`, whose `enclosingElement` is the
method, not the class — so `_instanceMemberTarget` structurally never fires. The read correctly targets
the local's own ADR-28 `VarDecl`, not the field.

## 13. Parameter-shadows-field — no heuristic

Live: a parameter `count` shadowing a field of the same name resolves `node.element` to the
`FormalParameterElement`. No target is invented (parameter identity itself remains M8-N's own,
separately-deferred gap) — critically, no fallback ever assumes "name matches a field, so target the
field." §46 stress-tests this directly by injecting exactly that heuristic and confirming it is caught.

## 14. Instance receiver ownership determination

`owner.name` and `owner.library.identifier` (`owner = element.enclosingElement as InstanceElement`) are
the class name and declaring library — identical to how `_class`'s own extraction already names and
paths a class. No separate ownership computation was introduced.

## 15. Dynamic-dispatch boundary — real proof

`Base.readImplicit`'s own `value` read resolves to `Base.value`'s own declaration (the analyzer's own
static answer), *even though* `Child().readImplicit` dispatches to `Child.value` at runtime (§4). These
do not conflict, because of §5: `target` states a static fact, never an execution instruction.

## 16. Dispatch-safe subset definition — Strategy A selected

Strategy A (provenance-only, allowed even for virtual accesses) was selected over Strategy B
(restrict targeting to a provably non-overridable subset). B was evaluated and rejected: it would solve
a problem provenance-only targeting does not have (nothing consumes `target` as a dispatch instruction),
at the cost of a general override/subtype-safety analysis this compiler has nowhere else. Full
reasoning: ADR-0033 §2.

## 17. External vs. member-body read separation

`_instanceMemberTarget` is invoked from exactly two extraction sites: a bare `SimpleIdentifier`
(implicit read) and a `PropertyAccess` whose receiver is structurally a `ThisExpression` (explicit
`this.x`). An external read (`model.count`, receiver is some other expression) never reaches this
function at all — the call site itself is the boundary, not an internal check. Re-verified after both
regression fixes (§38–39): `model.count`'s own receiver `Ref` still carries no `target` (§34).

## 18. Schema audit

`logic.PropertyAccess.target` and `logic.MethodCall.target` already existed (ADR-27). No schema change
was made or needed — confirmed by reading `packages/uir/src/generated/uir.ts`'s own `PropertyAccess`
interface: `target?: NodeId` was already present, doc-commented for the store case, now also serving the
instance-member case with an unchanged type.

## 19. ADR gate

ADR-0033 (`docs/adr/0033-instance-member-read-provenance.md`) was written before implementation began,
covering all 15 required topics: target semantics, provenance-vs-dispatch decision, `this`
representation, implicit/explicit canonicalization, field/getter canonical identity, shadowing
precedence, dispatch preservation, inheritance boundary, future generator contract, M9-J interaction,
class-emission prerequisite, diagnostics, determinism, and N5/closure safety.

## 20. Implementation gate — result

PASS. Every one of the governing brief's 25 gate conditions was satisfied: provenance-only targeting
(no dispatch instruction anywhere), zero generator changes, M9-J refusal untouched (and, after real
regressions, provably untouched — §38–39), no schema change, ADR written first, N5 investigated and
proven unreachable rather than modified speculatively.

## 21. Outcome selected

**A1 — canonical `this` + provenance only.** Implicit and explicit instance-member reads now carry a
truthful, owner-qualified `target`; nothing else changed. A2 (bounded internal member dependencies) and
A3 (bounded external targeting metadata) were not pursued — A1 alone satisfies the milestone's stated
goal. B (architecture-only, no implementation) was exceeded, since A1 shipped a working, tested
mechanism.

## 22. Reachability/class-emission interaction check

Confirmed unaffected: `packages/generators/react/src/internal/emit/functions.ts`'s `reachableFunctions`
still cannot resolve a target pointing at an embedded class member, since such members are never
top-level document records — `scope.node(target)` returns `undefined` for them. M9-L's new targets are
structurally invisible to that walk; class emission is not, and cannot be, accidentally activated.

## 23. Normalization/pass audit

Searched every normalization pass (N1–N8) for `Ref`/`PropertyAccess`/`target`/`receiver` handling.
Every existing pass that inspects `target` (the store-lowering passes) is already gated on the
`sig:`/`der:`/`act:` symbol prefix scheme M9-L's new `var:`/`fn:` targets never collide with. No pass
mistakes an instance-member target for a lexical local, a top-level, a store binding, or another
class's member.

## 24. N5/closure safety investigation

A real hazard was investigated, not assumed away: N5 (`n5_lift_closures.ts`) treats any targeted `Ref`
as globally reachable and safe to lift unconditionally, carving out only `logic.VarDecl` (ADR-28's own
lexical exception). Proven live that this milestone's own targets can never reach a position N5
processes: `bind.Expr` wrapping (N5's own trigger shape) is applied exclusively by
`component_extractor.dart`'s widget-tree/callback-prop extraction; a plain class's own method body
(where `_instanceMemberTarget` operates, after the component/state/store exclusions of §38–40) never
produces one — confirmed by extracting `int Function() get reader => () => count;` and observing the
`logic.Lambda` as a bare `Return.value`, never `bind.Expr`-wrapped. N5 itself was not modified.

## 25. Zero generator emission confirmation

`git diff` against `packages/generators/react/` for this milestone is empty. Confirmed directly before
writing this doc: no file under `packages/generators/` or `packages/runtimes/` was touched.

## 26. Fixture/test strategy decision

Used analyzer test fixtures (`dart/bridge_analyzer/test/extraction_test.dart`) as the acceptance
surface, per the brief's own fallback clause, rather than a new `fixtures/apps/member_read_targeting`
app. Reasoning: every required scenario (implicit/explicit identity, shadowing, inheritance,
cross-class collision, static members, M9-J boundary, BRG1310 precedence, extension exclusion,
determinism) is expressible and independently assertable against raw UIR in-process, without the
overhead of a full fixture app plus golden regeneration for a milestone that ships zero generator
changes. A new test group, `'instance member-read provenance (ADR-0033, M9-L)'`, was added with 11
tests and 4 helper functions (`classDecl`, `method`, `field`, `readOf`).

## 27. Test — implicit/explicit identity

`implicitRead`'s `count` and `explicitRead`'s `this.count` resolve to the identical `target`
(`Counter`'s own `FieldDecl` id). Passes.

## 28. Test — getter-to-getter chain

`quadrupled` (implicit `doubled`) and `quadrupledExplicit` (`this.doubled`) both resolve `doubled` to
its own `FunctionDecl`. Passes.

## 29. Test — local shadowing

A local `count` shadowing the field targets the local's own `VarDecl`; the identical body's explicit
`this.count` still targets the field. Passes — proves shadowing is receiver-sensitive, not a blanket
per-body rule (§12).

## 30. Test — parameter shadowing

A parameter `count` shadowing the field carries no target at all (no invented parameter identity).
Passes (§13).

## 31. Test — inherited member

`Base2.readImplicit`'s own `value` targets `Base2.value`, never `Child2.value`. Passes (§15).

## 32. Test — cross-class collision (Alpha≠Beta)

Two unrelated classes with byte-identical getter bodies remain distinct, and targeting agrees with
identity. Passes — re-confirms the ADR-0032 collision fix under the new targeting mechanism.

## 33. Test — static member

A static field read inside a static method resolves correctly through the same owner-qualified scheme.
Passes — confirmed no separate "static-as-instance" code path exists or is needed (§47).

## 34. Test — component field / M9-J regression

Originally written asserting `BRG3013` from the Dart-only `extract()` helper — **structurally wrong**,
since `BRG3013` is a generator-side diagnostic (`packages/generators/react/src/internal/diagnostics/codes.ts`)
that a Dart-only extraction test can never produce; the TS-side refusal has its own dedicated coverage
(`unmodelled_class_member_build.test.ts`). Caught by actually running the test (`dart test`), not by
inspection alone. Rewritten to assert the fact this Dart layer is actually responsible for: the
`model.count` read's own receiver `Ref` (`model`) carries no `target`, which is the precondition M9-J's
`isParameterReceiver` check depends on. Passes after the rewrite.

## 35. Test — BRG1310 precedence

An analyzer-invalid getter body (`missingIdentifier`) is refused as `BRG1310` before any member-target
logic runs. Passes — unchanged from M9-H.

## 36. Test — extension getter exclusion

An extension getter is never targeted by this mechanism (its `enclosingElement` is not an
`InstanceElement` in the class-member sense this function checks). Passes.

## 37. Test — determinism

The same source, extracted twice independently, produces byte-identical targets. Passes — `Symbols.*`
remain pure functions of `(path, owner, name)`.

## 38. Real regression #1 — component field mistargeting (found and fixed)

The first implementation of `_instanceMemberTarget` had no component exclusion. A component's own field
(`W`'s `base`, backing `required this.base`) got a target when read implicitly inside `W.build()` —
because a `StatelessWidget`'s own field backs its constructor parameter, and `build()` runs with
`this` = the widget instance. This broke `isParameterReceiver`'s `receiver['target'] === undefined`
check (M9-J), silently re-enabling the exact unknown-receiver passthrough M9-J exists to refuse. Found
via a live probe (`base.readImplicit` producing `ok: true` instead of the expected refusal). Fixed by
adding `registry.isComponentBase(owner.thisType)` (and, at this point, `isStoreBase`) to the exclusion.

## 39. Real regression #2 — State-class mistargeting (found and fixed, 66 failures)

After the first fix, the full `dart test` run surfaced 66 failures, root-caused to one shape:
`BRG1201: Reference to "var:lib/main.dart#_ScreenState.store", which is not declared anywhere in the
program`. `isComponentBase` does not cover `State` classes — `MaterialCatalog.componentBases` and
`MaterialCatalog.stateBase` are separate catalog categories. `_ScreenState extends State<Screen>` was
still treated as a plain class, wrongly giving its own store-instance field a `var:` target that nothing
declares (the field is properly bound via `signal_extractor.dart`'s own `sig:`-prefixed mechanism,
ADR-27). Fixed by adding a third exclusion, `isStateBase`. Found by running the full suite after the
first fix rather than assuming it was sufficient — exactly the "prove it, don't assume it" discipline
this whole session has followed. Post-fix: 420/420 (then, later, 431/431 with the new test group).

## 40. New adapter methods added

`isComponentBase(DartType?)` and `isStateBase(DartType?)`, mirroring the pre-existing `isStoreBase`
exactly across all four adapter files: declared on `WidgetAdapter` (`adapter.dart`), fanned out via
`widgetAdapters.any(...)` (`adapter_registry.dart`), stubbed `=> false` (`gap_adapter.dart`), and
implemented via `_extendsAny` against `MaterialCatalog.componentBases`/`{MaterialCatalog.stateBase}`
(`flutter_adapter.dart`).

## 41. `_methods` Scope-construction prerequisite bug — found and fixed

A separate, real prerequisite gap: `declaration_extractor.dart`'s `_methods` never called
`Scope.forBody(...)` for a plain class's methods, unlike `_function` (top-level), which does — meaning a
local variable declared inside a class method body never got its own ADR-28 target. Confirmed via a
side-by-side probe: the identical `final count = 10; return count;` shape produced a correct `target` at
top level but none at all inside a class method. Fixed by rewriting `_methods` to build a per-method
child `Scope` (mirroring `_function`) before constructing each method's `RawNode`. Without this fix,
locals inside class methods would have been indistinguishable from unresolvable identifiers — a
prerequisite for §12's own shadowing proof to be meaningful at all.

## 42. Adversarial mutation A — owner removed from member identity

Removed `owner: ownerName` from all three `Symbols.functionIn`/`variableIn` call sites inside
`_instanceMemberTarget`. Result: 9 of 11 new tests failed, including the cross-class collision test
(§32) — the exact Alpha≠Beta regression this mutation targets. Reverted; confirmed `git diff` against
the pre-mutation file was empty.

## 43. Adversarial mutations C/D — implicit-only and explicit-only wiring

**C** (implicit wiring removed, explicit left intact): `staticTarget: _topLevelTarget(node.element)`
only, dropping `?? _instanceMemberTarget(node.element)`. Result: 6 of 11 tests failed (every assertion
on an implicit read's target). **D** (explicit wiring removed, implicit left intact): dropped the
`(target is ThisExpression ? _instanceMemberTarget(...) : null)` branch from the `PropertyAccess` case.
Result: 4 tests failed (every assertion on an explicit `this.x` read's target). Together these prove
the two call sites are each independently load-bearing, not redundant. Both reverted and reconfirmed
clean.

## 44. Adversarial mutation F — field/getter symbol collapse

Removed the `element.isOriginVariable` ternary in the `GetterElement` branch, forcing every field-backed
accessor through `Symbols.functionIn` instead of `Symbols.variableIn`. Result: 7 of 11 tests failed —
a field-backed accessor's target no longer equals the field's own `FieldDecl` id, breaking canonical
identity (§6). Reverted and reconfirmed clean.

## 45. Adversarial mutation G — exclusion removed (reproduces the real regression)

Removed the `isComponentBase || isStateBase || isStoreBase` guard entirely, as a formal, deliberate
mutation exercise (distinct from — but confirming — the real regression found during development,
§38–39). Result: only 1 of 11 new tests failed directly, but the **full** `dart test` suite produced 69
failures across the same component/state/store test groups the real regression hit. Reverted; full
suite reconfirmed 431/431 clean afterward.

## 46. Adversarial mutation I — name-based shadowing heuristic injected

Injected the exact heuristic ADR-0033 §7 forbids — "if the name matches a field, assume `this.field`" —
as a fallback at the `SimpleIdentifier` call site: when `_instanceMemberTarget(node.element)` is null,
look up a getter of the same name on the innermost enclosing `ClassDeclaration` and target that instead,
regardless of whether `node.element` actually resolved to a shadowing local/parameter. Result: exactly
the two shadowing tests (§29, §30) failed — the local now wrongly targeted the field, and the shadowed
parameter gained an invented target. Reverted; `git diff` against the pre-mutation file was empty
(confirmed identical).

## 47. Mutations B/E/H — architectural rationale

**B** (implicit read resolves by textual name, not `Element`): not independently injectable as a
distinct mutation from I — the design has exactly one resolution path (`node.element`, analyzer-
resolved), and any name-based injection surfaces through the identical shadowing-test failure I already
demonstrates. **E** (treat `target` as a dispatch instruction / emit a helper-bind): not applicable —
M9-L ships zero generator changes (§25), so there is no consumer of these targets yet to mutate into
treating them as dispatch. ADR-0033 §10 records the constraint any future consumer must respect. **H**
(resolve a static member as an instance member): not a real bug to inject — a static member's own
`enclosingElement` genuinely is the class's `InstanceElement` in the analyzer's own model, and M9-K's
owner-qualified symbol scheme is already correct for static members by construction (§33 tests this
directly); there is no separate, incorrect "static-as-instance" code path to disable.

## 48. Full validation

- `dart test test/extraction_test.dart --name "instance member-read provenance"`: 11/11 pass.
- `dart test` (full suite): 431/431 pass (420 pre-existing + 11 new), zero `[E]` markers.
- `just ci`: exit 0, full clean — includes `pnpm` build/lint/typecheck/codegen-check, `dart analyze`,
  full `dart test`, and `flutter analyze` on `fixtures/apps/hello_bridge` ("No issues found!").
- `just determinism`: completed clean (see run output).
- `git status --porcelain`: only the files listed in §49's commit are modified/new; the pre-existing,
  unrelated `fixtures/apps/hello_bridge/analysis_options.yaml` drift remains untouched, exactly as every
  prior milestone in this session has left it.
- FlutterBridge-only boundary: `git diff` for every changed/new file contains zero new "Continuum"
  references (pre-existing mentions in `symbol_table.dart` doc comments and `extraction_test.dart`'s
  M8-A/M8-C provenance comments are untouched by this milestone's diff — confirmed via `git diff | grep
  -i continuum`, empty).

## 49. M9-M recommendation

Left to evidence, as instructed — not preselected. With truthful instance-member-read provenance now
established (A1), the strongest-supported next step is **(B) `this`/instance-field emission**, since
targeting is now proven and the dispatch-safety contract (ADR-0033 §2/§10) is documented for a future
consumer to respect. **(A) bounded class type emission** and **(D) getter lowering** remain plausible
alternatives with their own prerequisites still unaudited. This milestone does **not** start M9-M, does
not touch any generator, and ships no type/dispatch/runtime emission of any kind — identity and
provenance only, per the brief's own closing priority order.
