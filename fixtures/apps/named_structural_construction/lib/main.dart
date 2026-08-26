import 'package:flutter/material.dart';

import 'model.dart';

// A trivial, unrelated root — gives the generated router a real entry point without requiring a `Model`
// construction anywhere on the route table. `Home`, below, stays independent and unreferenced — the
// same convention every other class-construction fixture in this suite already uses for the component
// under test.
void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table — a bare component. `Model.named(count: 7, name: 'A')` calls the
// required-named constructor with its own labels in `count`, `name` order — the OPPOSITE of that
// constructor's own declaration order (`name`, then `count`, in `model.dart`). A correct lowering must
// preserve the call's own real source order, never the constructor's own declaration order.
class Home extends StatelessWidget {
  const Home({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model.named(count: 7, name: 'A');
    return Column(
      children: [
        Text('${model.count}'),
        Text(model.name),
      ],
    );
  }
}
