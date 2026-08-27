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
