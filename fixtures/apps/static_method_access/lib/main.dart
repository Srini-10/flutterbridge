import 'package:flutter/material.dart';

import 'model.dart';
import 'other_model.dart';

void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// R1 — the smallest positive case: a static method call, no receiver at all.
class SmallestPositiveDemo extends StatelessWidget {
  const SmallestPositiveDemo({super.key});

  @override
  Widget build(BuildContext context) => Text('${Model.compute(3)}');
}

// R2 — multiple static calls in one expression, including one with an optional-default argument
// (M10-C/M10-E) supplied and omitted.
class MultipleCallsDemo extends StatelessWidget {
  const MultipleCallsDemo({super.key});

  @override
  Widget build(BuildContext context) =>
      Text('${Model.compute(3)} / ${Model.scale(3)} / ${Model.scale(3, 1)}');
}

// R3a — composition: a static method's own body calls ANOTHER static method of the same class.
class StaticToStaticCompositionDemo extends StatelessWidget {
  const StaticToStaticCompositionDemo({super.key});

  @override
  Widget build(BuildContext context) => Text('${Model.doubleCompute(3)}');
}

// R3b — composition: a static method's own body calls an INSTANCE getter/method on a parameter
// (M9-L/M10-A/B), unaffected by this milestone.
class StaticToInstanceCompositionDemo extends StatelessWidget {
  const StaticToInstanceCompositionDemo({super.key, required this.model});
  final Model model;

  @override
  Widget build(BuildContext context) => Text('${Model.composeWithInstance(model)}');
}

// R4/R6 — cross-file AND identity: `OtherModel.compute` shares a NAME with `Model.compute` but is a
// DIFFERENT owner — proves target resolution is owner-qualified, never name-based.
class CrossFileDemo extends StatelessWidget {
  const CrossFileDemo({super.key});

  @override
  Widget build(BuildContext context) => Text('${Model.compute(3)} / ${OtherModel.compute(3)}');
}
