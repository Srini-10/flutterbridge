import 'package:flutter/material.dart';

import 'model.dart';

// A trivial, unrelated root — gives the generated router a real entry point without requiring the
// unsupported call anywhere on the route table.
void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table. `model` is a LOCAL VARIABLE — constructed in this same build method
// (M9-O), never a parameter — and `model.multiply(3)` calls an instance method, which M9-Q never
// supports. Before the M9-R closure fix, the pre-existing M9-J refusal's own receiver-shape check
// (`isParameterReceiver`) did not recognize this receiver at all, so this call silently lowered to
// `{ count: 7 }.multiply(3)` — a real TypeScript error (`multiply` does not exist), reached at `tsc` time
// rather than as this compiler's own honest `BRG3013`. This fixture exists to prove that gap closed.
class MethodCallOnLocal extends StatelessWidget {
  const MethodCallOnLocal({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.multiply(3)}');
  }
}
