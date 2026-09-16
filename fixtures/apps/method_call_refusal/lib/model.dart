/// A plain, otherwise-fully-supported project-defined class — its constructor is bounded and
/// structural (M9-O). `multiply`'s own optional positional `bonus` parameter has NO default value
/// (`[int? bonus]`) — which is what keeps it outside the M10-E method subset (ADR-0043 requires an
/// optional positional parameter to carry an explicit default value; `[int? bonus]`, implicitly `null`
/// when omitted, remains deliberately out of scope — see `Model.multiply`'s own doc comment there):
/// every OTHER fact about this method — public, instance, concrete, non-generic, direct-`Object`-
/// superclass owner, positional-only — is exactly the M10-E-supported shape. Deliberately positional-only
/// at the CALL SITE too (`multiply(3, 2)`, not `multiply(3, bonus: 2)`) so this refuses via the same
/// `MethodCall.target`-absent path an entirely unsupported method would, rather than via the separate,
/// pre-existing named-argument refusal (see `NamedParamModel`, below, for that separate case). Valid
/// Dart throughout: this file's own job is to prove the method call refuses honestly, not that the source
/// itself is invalid. (Before M10-E, `bonus` carried a default value — `[int bonus = 0]` — and that WAS
/// the reason this refused; ADR-0043 made that shape eligible, so this fixture's own negative control was
/// updated to the one optional-parameter shape still out of scope, preserving its original intent.)
class Model {
  final int count;

  Model(this.count);

  int multiply(int factor, [int? bonus]) => count * factor + (bonus ?? 0);
}

/// `scale`'s own second parameter is NAMED (`{int bonus = 0}`) — out of scope regardless of whether it
/// carries a default (ADR-0043 §7/§14: a named argument has no positional call-site equivalent without
/// either an options-object rewrite or call-site-name-threading, materially larger scope than M10-E's
/// own). Called with named-argument syntax (`scale(3, bonus: 2)`), so this exercises the SEPARATE,
/// pre-existing named-ARGUMENT refusal (`refuseNamedArgs`) rather than `Model.multiply`'s own
/// method-eligibility one, above — both refusal paths stay honestly distinct.
class NamedParamModel {
  final int count;

  NamedParamModel(this.count);

  int scale(int factor, {int bonus = 0}) => count * factor + bonus;
}

/// `AsyncModel.scale` meets every ADR-0039 GATE (public, instance, concrete, non-static, required-
/// positional-only) — `_externalMethodTarget` does not check `isAsync`, so this still resolves a `target`
/// at the extraction layer (proven directly, `extraction_test.dart`). The TypeScript generator's own
/// `emitFunctionModules` loop is the layer that declines to emit a helper for an `async` method, and this
/// fixture proves the generator refuses honestly (`BRG3013`) in that case too, rather than falling through
/// to the naive `receiver.method(args)` lowering an eligible-but-un-helpered target would otherwise reach.
class AsyncModel {
  final int count;

  AsyncModel(this.count);

  Future<int> scale(int factor) async => count * factor;
}

/// A direct self-recursive method (M10-B §26/§48) — `countdown` meets every ADR-0039 gate on its own, but
/// its own body calls itself: the fixed-point retry loop in `emitFunctionModules` can never make `countdown`
/// itself first, since its own dependency IS itself, so it never converges — the existing "target set but
/// no helper" refusal (`BRG3013`) handles it, with no separate recursion-detection code needed or added.
class RecursiveModel {
  final int count;

  RecursiveModel(this.count);

  int countdown(int n) => n <= 0 ? count : countdown(n - 1);
}

/// A method that meets every ADR-0039 gate on its own, but whose own body calls a SIBLING method that
/// does NOT (`scaleUnsupported`'s own optional `bonus` parameter carries NO default value — `[int?
/// bonus]`, still out of scope even after ADR-0043; before M10-E this used `[int bonus = 0]`, which ADR-
/// 0043 made eligible, so this fixture's own negative control was updated to the one optional-parameter
/// shape still unsupported, preserving its original intent) — M10-B §45/§47's own "reachable unsupported
/// dependency" boundary: `compute` must not silently ship with a broken internal reference; it must
/// refuse (`BRG3013`) too, propagating the unsupported dependency rather than masking it.
class DependentModel {
  final int count;

  DependentModel(this.count);

  int scaleUnsupported(int factor, [int? bonus]) => count * factor + (bonus ?? 0);

  int compute() => scaleUnsupported(2);
}

/// `applyCallback`'s own parameter `fn` is required-positional (meeting ADR-0039's own gate as it was
/// stated before M10-C) but FUNCTION-TYPED — a real, live-probed gap found while investigating M10-C's
/// own "closures/function-valued method references" non-goal: this generator has no lowering for a Dart
/// function type (`typeTextOf` renders it `unknown`), so admitting this method emitted a helper whose own
/// body CALLED a parameter typed `unknown` — code that reached `tsc` as "not callable", never this
/// compiler's own honest `BRG3013`. Fixed at the identical extraction-layer gate the generic-method and
/// optional-parameter exclusions already live at (`_externalMethodTarget`).
class CallbackModel {
  final int count;

  CallbackModel(this.count);

  int applyCallback(int Function(int) fn) => fn(count);
}

/// `getDynamic`'s own parameter list is empty (trivially eligible), but its own RETURN type is `dynamic`
/// — the source itself declined to state a type. A real, live-probed gap found while investigating M10-D
/// (ADR-0042 §4): before the return-type eligibility gate existed, this still resolved a `target` and
/// reached a real, un-refused helper whose own signature rendered the return type `unknown` — safe only
/// by accident wherever a caller happened to consume it in a position `unknown` also satisfies, and a real
/// `tsc --strict` failure, never this compiler's own honest `BRG3013`, the moment a caller chained a
/// further member off the result.
class DynamicReturnModel {
  final int count;

  DynamicReturnModel(this.count);

  dynamic getDynamic() => count;
}

/// `getList`'s own return type is a generic instantiation (`List<int>`) — excluded by the identical
/// `_dispatchSafeReceiverClass` check a RECEIVER's own type already must pass (`typeArguments.isNotEmpty`),
/// reused verbatim for a RETURN type (ADR-0042 §3/§4).
class GenericReturnModel {
  final int count;

  GenericReturnModel(this.count);

  List<int> getList() => [count];
}

/// `getDerived`'s own return type (`Derived`) has an explicit superclass (`Base`) — excluded by the
/// identical `_dispatchSafeReceiverClass` check a SUBCLASS-typed RECEIVER already fails (ADR-0038 §10's
/// own dynamic-dispatch safety argument, reused verbatim for a RETURN type). Proves the refusal correctly
/// attributes the FIRST unsupported edge (`Derived`, not `getDerived` itself) when a further member is
/// read off the unsupported result (M9-J's own pre-existing "refuse once, at the first unsupported edge"
/// discipline).
class Base {
  final int count;

  Base(this.count);
}

class Derived extends Base {
  Derived(super.count);
}

class SubclassReturnModel {
  final int count;

  SubclassReturnModel(this.count);

  Derived getDerived() => Derived(count);
}

/// M10-F (ADR-0044 §6) — proves safe navigation on a receiver that is NOT a bare reference refuses
/// honestly rather than silently duplicating a call or a computed-getter evaluation.
class NavModel {
  final int count;

  NavModel(this.count);

  int get doubled => count * 2;

  /// A genuine (computed) getter, never field-backed — a safe-navigated receiver of THIS shape is
  /// deliberately excluded (ADR-0044 §5/§19): provably pure in this bounded model, but duplicating it
  /// would cross this project's own "receiver evaluated exactly once" discipline for no real capability
  /// gain. Nullable so a null-aware access on it is meaningful, not merely redundant.
  NavModel? get builder => NavModel(count);

  /// `builder` is a BARE (implicit-`this`) reference here — a `SimpleIdentifier`, exactly like a true
  /// parameter or field, but resolving to a GENUINE getter rather than a field. Proves the "safe to
  /// duplicate" boundary is drawn on the RESOLVED ELEMENT (`GetterElement.isOriginVariable`), never on
  /// the AST shape alone.
  int describeBuilder() => builder?.doubled ?? -1;
}

/// A top-level function returning a nullable `NavModel` — a null-aware access on ITS OWN RESULT is a
/// CALL receiver, never a bare reference.
NavModel? maybeNavModel() => NavModel(7);

/// M11-A (ADR-0045 §14) — proves a static member reference outside the newly-supported subset stays
/// refused honestly, exactly as before this milestone.
class StaticAccessModel {
  /// A static CONST field. Deliberately excluded (ADR-0045 §14/§16): wiring a `target` alone would not
  /// fix its refusal, since the SEPARATE, pre-existing, documented M8-P boundary — this generator does
  /// not yet lower a `logic.FieldDecl` to a module-level declaration at all — is what actually refuses
  /// it, unrelated to this milestone's own targeting work.
  static const int marker = 7;

  /// A PRIVATE static method — excluded by the identical `isPrivate` check every other member-eligibility
  /// gate in this codebase already applies (ADR-0045 §14's own explicit exclusion).
  static int _hidden(int x) => x * 3;

  /// Calls the private static method above with an explicit qualifier, so a REAL call site exists to
  /// refuse (a declaration with no reference is dead code, not a call-site refusal proof).
  static int callHidden(int x) => StaticAccessModel._hidden(x);

  /// A static method whose own RETURN type is `dynamic` — a real, live-probed gap found while mutation-
  /// testing M11-A's own first implementation: `_staticMemberTarget`'s first cut reused
  /// `_instanceMemberTarget` directly without also reusing `_externalMethodTarget`'s own return-type
  /// eligibility gate, reproducing the exact `unknown`-return silent-wrong-code shape ADR-0042 already
  /// closed once for INSTANCE methods (see `DynamicReturnModel`, above, its static sibling). Fixed by
  /// sharing `_isEligibleMethodShape` between both extraction-side gates.
  static dynamic getDynamic() => 5;
}

/// M11-B (ADR-0046 §6) — proves every async shape OUTSIDE the newly-supported subset stays refused
/// honestly, even when genuinely awaited.
class AsyncRefusalModel {
  final int count;
  AsyncRefusalModel(this.count);

  /// A generic async method — the identical M10-B/M11-A `typeParameters.isNotEmpty` exclusion, unaffected
  /// by `async`.
  Future<T> identity<T>(T value) async => value;

  /// Calls the generic method above WITH `await` — proves genuine awaiting does not bypass the pre-
  /// existing generic-method exclusion.
  Future<int> callIdentity() async => await identity(count);

  /// An async method whose own return type is `Future<dynamic>` — the unwrapped `dynamic` still fails the
  /// identical `_isEligibleMethodReturnType` gate a synchronous `dynamic` return already must (M11-B §7).
  Future<dynamic> getDynamicAsync() async => count;

  /// Calls the above WITH `await` — proves genuine awaiting does not bypass the return-type gate.
  Future<int> callDynamicAsync() async => await getDynamicAsync() as int;

  /// A PRIVATE async method — excluded by the identical `isPrivate` check every other gate applies,
  /// unaffected by `async`/`await`.
  Future<int> _hiddenAsync() async => count * 3;

  /// Calls the private async method above WITH `await` — proves genuine awaiting does not bypass privacy.
  Future<int> callHiddenAsync() async => await _hiddenAsync();

  /// A directly self-recursive async method, awaited — the identical fixed-point non-convergence argument
  /// (ADR-0040 §10) refuses it, unaffected by `async`/`await`: no member in the cycle can ever be "first."
  Future<int> countdownAsync(int n) async => n <= 0 ? count : await countdownAsync(n - 1);
}

/// A base class with a real async method, and a SUBCLASS that declares its OWN new (non-override) async
/// method, calling it bare (M11-B §6/§8, mirroring M11-A's own identical subclass-dispatch-safety
/// mutation-testing finding, ADR-0045 mutation 1a): the bare call's own owner class (`AsyncSubclass`
/// itself) has an explicit superclass, so `_dispatchSafeReceiverClass` refuses it — unaffected by
/// `async`/`await`. (An INHERITED, non-overridden method called bare from a subclass — the OTHER shape —
/// already resolves correctly, since the bare-call path's own receiver type is reconstructed from the
/// method's OWN declaring class, not the calling context's; this fixture does not need to re-prove that
/// positive case, already covered by `fixtures/apps/async_method_await`.)
class AsyncBase {
  final int count;
  AsyncBase(this.count);
}

class AsyncSubclass extends AsyncBase {
  AsyncSubclass(super.count);

  Future<int> loadNew() async => count * 2;

  /// Calls `loadNew` bare (implicit `this`), awaited.
  Future<int> useNew() async => await loadNew();
}
