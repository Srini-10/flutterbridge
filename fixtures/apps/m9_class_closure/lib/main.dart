import 'package:flutter/material.dart';

import 'model.dart';

// A trivial, unrelated root — gives the generated router a real entry point without requiring the
// integrated class path anywhere on the route table. `ClassClosureDemo`, below, stays independent and
// unreferenced — the same convention every other class-capability fixture in this suite already uses.
void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table. `Model.named(name: 'A', count: 7)` calls the required-named
// constructor with its own labels in the OPPOSITE order from the constructor's own declaration
// (`name`, then `count`) — a correct lowering preserves the call's own real source order. `model.count`/
// `model.name` are direct, receiver-based field reads (M9-N); `model.doubled` executes through the
// generated getter helper (M9-Q) — never a runtime prototype property. No method is called anywhere in
// this fixture: methods remain refused, deferred to M10+.
class ClassClosureDemo extends StatelessWidget {
  const ClassClosureDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model.named(name: 'A', count: 7);
    return Column(
      children: [
        Text('${model.count}'),
        Text(model.name),
        Text('${model.doubled}'),
      ],
    );
  }
}
