import 'package:flutter/material.dart';

import 'model.dart';

// A trivial, unrelated root — gives the generated router a real entry point without requiring a getter
// read anywhere on the route table. `ExternalReader`/`ConstructedReader`, below, stay independent and
// unreferenced — the same convention every other class-member fixture in this suite already uses for
// the components under test.
void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table. `model.doubled` reads an externally-supplied `Model` — the getter
// helper must operate identically whether its own receiver arrived as a prop (here) or was constructed
// locally (`ConstructedReader`, below) — ADR-0038 §7's own coherence requirement.
class ExternalReader extends StatelessWidget {
  const ExternalReader({super.key, required this.model});

  final Model model;

  @override
  Widget build(BuildContext context) => Text('${model.doubled}');
}

// Not wired into the route table. `Model(7)` is a bounded structural construction (M9-O); `.doubled` on
// the result must read identically to the external case above — the same generated helper, the same
// receiver-based field rewrite, no separate "constructed instance" code path.
class ConstructedReader extends StatelessWidget {
  const ConstructedReader({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.doubled}');
  }
}
