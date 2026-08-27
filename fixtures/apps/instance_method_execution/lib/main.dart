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
    return Text('${model.multiply(3)}');
  }
}

// Not wired into the route table either — its own job is the parameter/field-shadowing proof
// (M10-A §11-14), not the route table. `box.combine(5)` calls a method whose own parameter shadows the
// field of the identical name; `box.doubledViaLocal()` calls a zero-parameter method whose own body
// shadows the field with a local instead.
class ShadowingDemo extends StatelessWidget {
  const ShadowingDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final box = Box(4);
    return Text('${box.combine(5)} / ${box.doubledViaLocal()}');
  }
}
