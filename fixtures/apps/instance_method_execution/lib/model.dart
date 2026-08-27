/// A plain, otherwise-fully-supported project-defined class — its constructor is bounded and structural
/// (M9-O). `multiply` meets every ADR-0039 gate: public, instance, concrete, non-static, non-abstract,
/// non-external, non-generic, non-operator, uniformly required-positional parameters, and declared on a
/// class whose own superclass is `Object`. This is the M10-A canonical positive example.
class Model {
  final int count;

  Model(this.count);

  int multiply(int factor) => count * factor;

  /// Getter + method on the identical class (M10-A §29) — proves the M9-Q getter helper and the
  /// ADR-0039 method helper coexist on one class, sharing the identical structural receiver and
  /// `memberSelf` model, with distinct helper identities.
  int get doubled => count * 2;

  /// Two required-positional parameters, non-commutative — a receiver-then-argument evaluation-order
  /// proof (M10-A §15/§16) needs an operation where swapping `a`/`b` changes the result, so a passing
  /// test cannot be an accident of commutativity.
  int subtract(int a, int b) => count - a - b;

  /// Never called anywhere in this program (M10-A §28) — a real, otherwise-fully-eligible sibling
  /// method the reachability walk (`reachableMethods`/`directMethodRefs`, mirroring the getter-execution
  /// siblings) must never emit a helper for, proving reachability stays selective rather than "class is
  /// known → emit every one of its own methods."
  int unusedMultiplier(int factor) => count * factor * 100;
}

/// Parameter/field-shadowing proof (M10-A §11-14) — freshly proven for a method's own parameter binding,
/// not assumed from M9-Q's identical getter-level conclusion (Q59).
class Box {
  final int value;

  Box(this.value);

  /// `value` (the parameter) shadows the field `value` of the identical name. A bare `value` reference
  /// resolves to the parameter (block-bodied `_methods()`'s own `Scope.forBody(...).child([Binding...])`
  /// parameter binding, identical to a top-level function's); `this.value`, explicit under the shadow,
  /// still reaches the field.
  int combine(int value) {
    final int viaField = this.value;
    final int viaParam = value;
    return viaField + viaParam;
  }

  /// The exact single-expression form the governing brief's own §13/§58 name: `this.value` (the field)
  /// and the bare `value` (the shadowing parameter) combined in one expression, proving field identity,
  /// parameter identity, and explicit-`this` provenance resolve independently within the same
  /// sub-expression, not merely across two separate local declarations (`combine`, above).
  int exactCombine(int value) => this.value + value;

  /// A LOCAL variable named `value` shadows the field `value` directly — no parameter of the same name
  /// at all. Zero parameters, still a real instance method (not a getter): proves a method's own
  /// eligibility gate never required a non-empty parameter list.
  int doubledViaLocal() {
    final int value = this.value * 2;
    return value;
  }
}
