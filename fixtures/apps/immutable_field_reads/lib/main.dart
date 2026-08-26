import 'package:flutter/material.dart';

import 'model.dart';

// A trivial, unrelated root — gives the generated router a real entry point (this generator's own,
// pre-existing, unrelated gap in the zero-route case) without requiring a `Model` value to exist
// anywhere: `logic.New` on a project class remains refused, so nothing in this fixture ever constructs
// one. `Home`, below, stays independent and unreferenced — the same convention
// `unmodelled_class_member`/`class_type_emission` both already use for the component under test.
void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table — a bare component. `model` is a direct, required parameter (never
// nullable, never aliased) — the exact bounded receiver shape ADR-0035 §23 supports.
class Home extends StatelessWidget {
  const Home({super.key, required this.model});

  final Model model;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('${model.count}'),
        Text(model.name),
      ],
    );
  }
}
