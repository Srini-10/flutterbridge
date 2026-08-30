import 'package:flutter/material.dart';

import 'model.dart';

void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table — its own job is the omitted-vs-supplied optional-argument proof itself.
class DefaultArgumentDemo extends StatelessWidget {
  const DefaultArgumentDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.multiply(3)} / ${model.multiply(3, 1)}');
  }
}

// Multiple trailing optional parameters, each independently omittable or supplied.
class MultipleDefaultsDemo extends StatelessWidget {
  const MultipleDefaultsDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.combine(1)} / ${model.combine(1, 5)} / ${model.combine(1, 5, 6)}');
  }
}

// An optional-parameter method composed with another bounded member on the same receiver (M10-B).
class ComposedDefaultDemo extends StatelessWidget {
  const ComposedDefaultDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.scaledAndDoubled(2)} / ${model.scaledAndDoubled(2, 5)}');
  }
}

// The sibling positive case to the local-receiver demos above: `model` arrives as a real widget
// constructor parameter (an external receiver, M9-N's own terms), not a value this build method
// constructs. Optional-argument omission must hold identically for an external receiver.
class ExternalReceiverDefaultDemo extends StatelessWidget {
  const ExternalReceiverDefaultDemo({super.key, required this.model});

  final Model model;

  @override
  Widget build(BuildContext context) {
    return Text('${model.multiply(3)} / ${model.multiply(3, 1)}');
  }
}
