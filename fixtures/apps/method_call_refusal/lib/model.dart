/// A plain, otherwise-fully-supported project-defined class — its constructor is bounded and
/// structural (M9-O). `multiply`'s own optional positional `bonus` parameter is what keeps it outside
/// the M10-A method subset (ADR-0039 requires every parameter to be required-positional — no optional,
/// named, or default-valued one — kept narrow deliberately rather than re-derived): every OTHER fact
/// about this method — public, instance, concrete, non-generic, direct-`Object`-superclass owner — is
/// exactly the M10-A-supported shape. Deliberately positional-only at the CALL SITE too (`multiply(3, 2)`,
/// not `multiply(3, bonus: 2)`) so this refuses via the same `MethodCall.target`-absent path an entirely
/// unsupported method would, rather than via the separate, pre-existing named-argument refusal. Valid
/// Dart throughout: this file's own job is to prove the method call refuses honestly, not that the source
/// itself is invalid.
class Model {
  final int count;

  Model(this.count);

  int multiply(int factor, [int bonus = 0]) => count * factor + bonus;
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
/// does NOT (`scaleUnsupported`'s own optional `bonus` parameter) — M10-B §45/§47's own "reachable
/// unsupported dependency" boundary: `compute` must not silently ship with a broken internal reference;
/// it must refuse (`BRG3013`) too, propagating the unsupported dependency rather than masking it.
class DependentModel {
  final int count;

  DependentModel(this.count);

  int scaleUnsupported(int factor, [int bonus = 0]) => count * factor + bonus;

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
