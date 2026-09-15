import 'package:flutter/material.dart';

import 'model.dart';
import 'other_model.dart';

void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// R1 — the smallest positive case: a single field read, safe-navigated on a component prop.
class SmallestPositiveDemo extends StatelessWidget {
  const SmallestPositiveDemo({super.key, required this.model});
  final Model? model;

  @override
  Widget build(BuildContext context) => Text('${model?.count}');
}

// R2 — multiple safe-navigated accesses in one expression: field, getter, and a method call with an
// optional-with-default argument (M10-C/M10-E), each independently guarded.
class MultipleAccessDemo extends StatelessWidget {
  const MultipleAccessDemo({super.key, required this.model});
  final Model? model;

  @override
  Widget build(BuildContext context) =>
      Text('${model?.count} / ${model?.doubled} / ${model?.multiply(3)} / ${model?.multiply(3, 1)}');
}

// R3 — safe navigation on a LOCAL VARIABLE bound to a nullable component prop, not the prop itself.
class LocalBindingDemo extends StatelessWidget {
  const LocalBindingDemo({super.key, required this.model});
  final Model? model;

  @override
  Widget build(BuildContext context) {
    final local = model;
    return Text('${local?.count} / ${local?.doubled} / ${local?.multiply(3)}');
  }
}

// R4 — safe navigation at the OUTER call, composing with the EXISTING member-composition mechanism
// (M10-B) at the INNER call: `quadrupled`'s own body calls `doubled` internally, unaffected by how
// `quadrupled` itself was reached.
class CompositionDemo extends StatelessWidget {
  const CompositionDemo({super.key, required this.model});
  final Model? model;

  @override
  Widget build(BuildContext context) => Text('${model?.quadrupled()}');
}

// R5 — safe navigation on a nullable, CROSS-FILE-typed component parameter.
class CrossFileDemo extends StatelessWidget {
  const CrossFileDemo({super.key, required this.other});
  final OtherModel? other;

  @override
  Widget build(BuildContext context) => Text('${other?.value} / ${other?.doubled}');
}

// R6 — safe navigation combined with `??` (a fallback for the short-circuited `null`).
class FallbackDemo extends StatelessWidget {
  const FallbackDemo({super.key, required this.model});
  final Model? model;

  @override
  Widget build(BuildContext context) => Text('${model?.count ?? -1}');
}

// R7 — shadowing: `Model.describe`'s own parameter is named identically to the class's own `doubled`
// getter, and its own body safe-navigates on the PARAMETER — proving the null-aware guard's own
// receiver resolution correctly reads the shadowing parameter, never the getter of the identical name.
// Also proves safe navigation works correctly INSIDE a method helper's own body, not only a component's
// own render tree.
class ShadowingDemo extends StatelessWidget {
  const ShadowingDemo({super.key, required this.model, required this.other});
  final Model model;
  final Model? other;

  @override
  Widget build(BuildContext context) => Text('${model.describe(other)}');
}
