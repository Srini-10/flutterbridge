import 'package:flutter/material.dart';

import 'model.dart';

void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// R1 — a primitive method result, standalone.
class PrimitiveResultDemo extends StatelessWidget {
  const PrimitiveResultDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.multiply(3)}');
  }
}

// R2 — a primitive method result inside an arithmetic expression.
class PrimitiveResultInExpressionDemo extends StatelessWidget {
  const PrimitiveResultInExpressionDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.multiply(3) + 2}');
  }
}

// R3 — multiple method results combined in one expression, left-to-right.
class MultipleResultsDemo extends StatelessWidget {
  const MultipleResultsDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.multiply(2) + model.multiply(3)}');
  }
}

// R4 — a getter call on a method's own result.
class GetterAfterMethodDemo extends StatelessWidget {
  const GetterAfterMethodDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.next().doubled}');
  }
}

// R5 — an immutable field read on a method's own result.
class FieldAfterMethodDemo extends StatelessWidget {
  const FieldAfterMethodDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.next().count}');
  }
}

// R6 (same class) — the critical chaining case: a method call on a method's own result.
class MethodAfterMethodDemo extends StatelessWidget {
  const MethodAfterMethodDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.next().multiply(3)}');
  }
}

// R6 (cross-class) — the same critical chaining case, but the method called on the result belongs to a
// DIFFERENT class than the one the chain started on. The exact shape that exposed the cross-class
// method-helper emission-ordering gap this milestone found and fixed (ADR-0042 §5).
class CrossClassChainDemo extends StatelessWidget {
  const CrossClassChainDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final leader = Leader(7);
    return Text('${leader.chain()}');
  }
}

// R7 — a receiver constructed inline, immediately followed by a method call whose own result is
// immediately the receiver of a further field read. No intermediate local at any step.
class LocalConstructionResultDemo extends StatelessWidget {
  const LocalConstructionResultDemo({super.key});

  @override
  Widget build(BuildContext context) {
    return Text('${Model(7).transform(2).count}');
  }
}

// R8 — the sibling positive case to the local-receiver demos above: `model` arrives as a real widget
// constructor parameter (an external receiver, M9-N's own terms), not a value this build method
// constructs. Method-result chaining must hold identically for an external receiver.
class ExternalReceiverResultDemo extends StatelessWidget {
  const ExternalReceiverResultDemo({super.key, required this.model});

  final Model model;

  @override
  Widget build(BuildContext context) {
    return Text('${model.multiply(3)} / ${model.next().doubled}');
  }
}

// R9 — a project-class return declared in a SEPARATE Dart file, chained with a further getter call.
class CrossFileReturnDemo extends StatelessWidget {
  const CrossFileReturnDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.toOther().value} / ${model.toOther().doubled}');
  }
}

// R9 (field-only) — `Wrapped` has no getter or method of its own, reachable exclusively through
// `Model.wrap()`'s own return type — isolates the transitive class-type-reachability fixed point
// (ADR-0041 §3) from the "also independently a member-owner class" case `OtherModel` itself is.
class WrappedFieldOnlyReturnDemo extends StatelessWidget {
  const WrappedFieldOnlyReturnDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.wrap().value}');
  }
}
