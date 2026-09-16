import 'other_model.dart';

/// M11-B: bounded async method calls via explicit `await` (ADR-0046) — an `async` method call lowers to a
/// real, `Promise`-returning, callable function ONLY when the Dart call is the direct operand of an
/// `AwaitExpression`. Never inferred from the callee's own `Future`-returning type; never promoted from a
/// bare, un-awaited call (see `fixtures/apps/method_call_refusal`'s own `AsyncModel`, unaffected).
class Model {
  final int count;
  Model(this.count);

  /// R1/R2 — the smallest positive case: an instance method, awaited, no arguments.
  Future<int> load() async => count * 2;

  /// R5 — arguments, including an optional-with-default one (M10-C/M10-E), composed unchanged.
  Future<int> scale(int factor, [int bonus = 0]) async => count * factor + bonus;

  /// R4 — a static async method (M11-A composed with M11-B for the first time).
  static Future<int> loadStatic(int x) async => x * 3;

  /// R6 — scalar return-type coverage beyond `int`.
  Future<double> loadDouble() async => count.toDouble();

  /// R7a — return-value composition: an awaited `Future<ProjectClass>`, its own further member read
  /// (M10-D return-value chaining, composed with `async`/`await` for the first time). Cross-file (R3).
  Future<OtherModel> createOther() async => OtherModel(count);

  /// R7b — composition: an `async` method's own body awaits ANOTHER `async` method of the SAME class,
  /// unqualified (M10-B internal composition, composed with `async`/`await`), then composes the awaited
  /// value with ordinary arithmetic — proves the awaited VALUE, not the `Future`, is what arithmetic sees.
  Future<int> useSelf() async => (await load()) + 1;
}
