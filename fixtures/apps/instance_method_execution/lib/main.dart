import 'package:flutter/material.dart';

import 'model.dart';

void main() => runApp(const MaterialApp(home: MethodCallOnLocal()));

// `model` is a LOCAL VARIABLE — constructed in this same build method (M9-O), never a parameter — and
// `model.multiply(3)` calls an eligible instance method (ADR-0039, M10-A). This is exactly the shape the
// M9-R closure fix `fixtures/apps/method_call_refusal` proves refuses when a method is NOT eligible; this
// fixture proves the sibling positive case: an eligible method call lowers to `Model_multiply(model, 3)`,
// never a runtime class or prototype method.
class MethodCallOnLocal extends StatelessWidget {
  const MethodCallOnLocal({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    // `subtract(5, 2)` is non-commutative — swapping the two arguments changes the result, so a
    // passing left-to-right argument-order proof (M10-A §15/§16) cannot be an accident of
    // commutativity. `doubled` (a getter) alongside `multiply`/`subtract` (methods) proves both helper
    // kinds coexist on the identical class and receiver (M10-A §29).
    return Text('${model.multiply(3)} / ${model.subtract(5, 2)} / ${model.doubled}');
  }
}

// The sibling positive case to `MethodCallOnLocal`, above: `model` arrives as a real widget
// CONSTRUCTOR PARAMETER (an external receiver, M9-N's own terms) rather than a value this same build
// method constructs (M9-O). M10-A §6/§26/§57 requires both to lower through the identical helper, with
// no hidden "was this locally constructed" marker anywhere in the runtime representation.
class ExternalReceiverDemo extends StatelessWidget {
  const ExternalReceiverDemo({super.key, required this.model});

  final Model model;

  @override
  Widget build(BuildContext context) {
    return Text('${model.multiply(3)} / ${model.subtract(5, 2)} / ${model.doubled}');
  }
}

// Not wired into the route table either — its own job is the parameter/field-shadowing proof
// (M10-A §11-14), not the route table. `box.combine(5)` calls a method whose own parameter shadows the
// field of the identical name across two separate local declarations; `box.exactCombine(5)` proves the
// identical fact within a single expression (the brief's own §13/§58 literal form); `box.doubledViaLocal()`
// calls a zero-parameter method whose own body shadows the field with a local instead.
class ShadowingDemo extends StatelessWidget {
  const ShadowingDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final box = Box(4);
    return Text('${box.combine(5)} / ${box.exactCombine(5)} / ${box.doubledViaLocal()}');
  }
}
