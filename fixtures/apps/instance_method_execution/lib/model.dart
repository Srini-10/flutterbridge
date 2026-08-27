/// A plain, otherwise-fully-supported project-defined class — its constructor is bounded and structural
/// (M9-O). `multiply` meets every ADR-0039 gate: public, instance, concrete, non-static, non-abstract,
/// non-external, non-generic, non-operator, uniformly required-positional parameters, and declared on a
/// class whose own superclass is `Object`. This is the M10-A canonical positive example.
class Model {
  final int count;

  Model(this.count);

  int multiply(int factor) => count * factor;
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

  /// A LOCAL variable named `value` shadows the field `value` directly — no parameter of the same name
  /// at all. Zero parameters, still a real instance method (not a getter): proves a method's own
  /// eligibility gate never required a non-empty parameter list.
  int doubledViaLocal() {
    final int value = this.value * 2;
    return value;
  }
}
