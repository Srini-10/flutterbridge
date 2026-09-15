/// M11-A: bounded static method access (ADR-0045) — a call to a project-defined class's own static
/// method lowers to a real, callable, module-level TypeScript function. No receiver exists to evaluate,
/// duplicate, or reorder — the entire evaluation-order/identity story reduces to "resolve the owner-
/// qualified symbol, then evaluate the arguments exactly like any other call" (ADR-0041, unchanged).
class Model {
  final int count;

  Model(this.count);

  int get doubled => count * 2;

  /// The smallest positive shape: no receiver, one required parameter.
  static int compute(int x) => x * 2;

  /// Multiple parameters, one optional-with-default (M10-C/M10-E) — proves static-method eligibility
  /// composes, unchanged, with the existing argument-evaluation/default-value machinery.
  static int scale(int x, [int bonus = 0]) => x * 3 + bonus;

  /// A static method's own body calling ANOTHER static method of the SAME class, unqualified (Dart
  /// permits a bare, same-class static reference) — proves static-to-static composition, and that the
  /// unqualified spelling resolves through the identical `_staticMemberTarget` path an explicitly
  /// `Model.`-qualified reference does.
  static int doubleCompute(int x) => compute(compute(x));

  /// A static method's own body calling an INSTANCE getter/method on a PARAMETER (M9-L/M10-A/B) — proves
  /// static-method composition with the pre-existing instance-member execution architecture, unaffected.
  static int composeWithInstance(Model m) => m.doubled + compute(m.count);
}
