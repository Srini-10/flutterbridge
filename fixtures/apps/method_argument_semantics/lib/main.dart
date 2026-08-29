import 'package:flutter/material.dart';

import 'model.dart';

void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table — its own job is the multi-argument evaluation-order proof itself.
// `weighted(1, 2, 3)` is non-commutative in every position; `weightedWithSelfArgs(4)` nests a getter
// call AND a method call, on the identical receiver, inside its own argument list.
class MethodArgumentOrderDemo extends StatelessWidget {
  const MethodArgumentOrderDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text(
      '${model.weighted(1, 2, 3)} / ${model.weightedWithSelfArgs(4)} / ${model.shadowedArg(9)}',
    );
  }
}

// The receiver is CONSTRUCTED INLINE, at the call site itself — never bound to a local first. Proves the
// constructed-receiver shape already known to work for a single argument (M10-A) also holds for a
// multi-argument call, with zero new code required.
class ConstructedReceiverDemo extends StatelessWidget {
  const ConstructedReceiverDemo({super.key});

  @override
  Widget build(BuildContext context) {
    return Text('${Model(7).multiply(3)} / ${Model(7).weighted(1, 2, 3)}');
  }
}

// The receiver comes from a TOP-LEVEL FUNCTION call, not a constructor call or a local variable — a
// further reduction-ladder receiver shape (a function-produced receiver) than either of the above.
class FunctionReceiverDemo extends StatelessWidget {
  const FunctionReceiverDemo({super.key});

  @override
  Widget build(BuildContext context) {
    return Text('${makeModel().multiply(4)}');
  }
}

// The receiver is produced by a getter/method declared on a DIFFERENT project class (`ModelHolder`), which
// itself returns a `Model` — the cross-class receiver proof, and the exact shape that exposed the
// project-type-reachability gap this milestone fixes (see `ModelHolder`'s own doc comment, model.dart).
class CrossClassReceiverDemo extends StatelessWidget {
  const CrossClassReceiverDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final container = ModelHolder(Model(7));
    return Text('${container.exposedModel.multiply(3)} / ${container.buildModel().multiply(4)}');
  }
}

// The FULL nested-construction chain, entirely inline: a `ModelHolder` constructed with an inline `Model`,
// immediately followed by a method call whose own RESULT is immediately the receiver of a further method
// call. No intermediate local at any step.
class NestedConstructionDemo extends StatelessWidget {
  const NestedConstructionDemo({super.key});

  @override
  Widget build(BuildContext context) {
    return Text('${ModelHolder(Model(5)).buildModel().multiply(2)}');
  }
}

// The sibling positive case to `MethodArgumentOrderDemo`: `model` arrives as a real widget constructor
// parameter (an external receiver, M9-N's own terms), not a value this build method constructs. The
// multi-argument evaluation-order guarantee must hold identically for an external receiver.
class ExternalReceiverArgOrderDemo extends StatelessWidget {
  const ExternalReceiverArgOrderDemo({super.key, required this.model});

  final Model model;

  @override
  Widget build(BuildContext context) {
    return Text('${model.weighted(1, 2, 3)} / ${model.weightedWithSelfArgs(4)}');
  }
}
