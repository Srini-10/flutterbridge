/// M10-C: bounded instance-method calls with MULTIPLE arguments, proving the receiver is evaluated
/// before any argument, arguments are evaluated left-to-right, and every sub-expression is evaluated
/// exactly once — never reordered, never duplicated, never rewritten to a different target. Builds on
/// the single-argument architecture already proven in M10-A (ADR-0039) and the same-receiver composition
/// already proven in M10-B (ADR-0040); this milestone adds no new representation, only new call shapes.
class Model {
  final int count;

  Model(this.count);

  int get doubled => count * 2;
  int multiply(int factor) => count * factor;

  /// Three required-positional arguments, pairwise non-commutative AND non-associative — swapping any
  /// two of `a`/`b`/`c`, or changing which is added vs. subtracted, changes the result. A passing
  /// left-to-right, receiver-first assertion on this method cannot be an accident of commutativity.
  int weighted(int a, int b, int c) => count * 100 + a * 10 - b * 3 + c;

  /// One argument is itself a call to ANOTHER bounded member (a getter) and a second is a call to a
  /// THIRD bounded member (a method) on the identical receiver — nested helper composition inside
  /// argument position, not merely inside a receiver or a bare return expression (M10-B proved the
  /// latter; this is the argument-position sibling).
  int weightedWithSelfArgs(int a) => weighted(a, doubled, multiply(2));

  /// A parameter named identically to the field `count` — the bounded body must read the ARGUMENT that
  /// was passed in, never re-target the field of the identical name (the argument-binding sibling of
  /// M10-A/B's own receiver/getter/field shadowing proofs).
  int shadowedArg(int count) => count * 2;
}

/// A top-level function, not a local one — the receiver-comes-from-a-function-call reduction-ladder
/// shape, without also exercising an unrelated, unsupported local-function-declaration statement inside
/// a build method (out of this milestone's own scope).
Model makeModel() => Model(9);

/// A SEPARATE project class whose own getter and method both return a `Model` — the receiver-of-a-
/// different-class proof (a getter-produced and a method-produced receiver, each of a DIFFERENT project
/// class than the method ultimately being called on). This is the exact shape that exposed a real,
/// pre-existing project-type-reachability gap (`classIdsNeedingTypes` never chased a discovered class's
/// own field/member types transitively, and the class-emission loop could process `ModelHolder` before
/// `Model` even when both were discovered) — fixed as part of this milestone, not merely exercised by it.
class ModelHolder {
  final Model model;

  ModelHolder(this.model);

  Model get exposedModel => model;
  Model buildModel() => model;
}
