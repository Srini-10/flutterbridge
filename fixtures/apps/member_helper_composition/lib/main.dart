import 'package:flutter/material.dart';

import 'model.dart';

void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table — its own job is the composition proof itself (M10-B §72).
class CompositionDemo extends StatelessWidget {
  const CompositionDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.quadrupled()} / ${model.quadrupledExplicit()} / ${model.octupled()} / ${model.octupledExplicit()} / ${model.combined(3)} / ${model.shadowedByParam(9)} / ${model.shadowedByParamExplicit(9)} / ${model.earlyCaller()}');
  }
}

// Calls only `.a()` — the transitive half of the reachability proof (M10-B §56): `b`/`c` must also
// become reachable, purely because `a`'s own body calls `b`, which calls `c`.
class ChainFullDemo extends StatelessWidget {
  const ChainFullDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final chain = ChainFull(7);
    return Text('${chain.a()}');
  }
}

// Calls only `.b()`, on a SEPARATE class from `ChainFullDemo` (never `.a()` anywhere in this program) —
// the directional half of the reachability proof: `c` must become reachable (via `b`), but `a` must NOT.
class ChainPartialDemo extends StatelessWidget {
  const ChainPartialDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final chain = ChainPartial(7);
    return Text('${chain.b()}');
  }
}
