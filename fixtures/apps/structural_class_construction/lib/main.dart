import 'package:flutter/material.dart';

import 'model.dart';

// A trivial, unrelated root — gives the generated router a real entry point without requiring a `Model`
// construction anywhere on the route table. `Home`, below, stays independent and unreferenced — the
// same convention `unmodelled_class_member`/`class_type_emission`/`immutable_field_reads` all already
// use for the component under test.
void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table — a bare component. `Model('A', 7)` is a bounded structural
// construction (ADR-0036): the constructor's own parameter order — `name` then `count` — differs from
// the field's own declaration order, so a correct emitter must produce `{ name: 'A', count: 7 }`, never
// `{ count: 7, name: 'A' }` (which would betray a naive field-declaration-order implementation).
//
// Both fields are read twice below. A pre-existing, out-of-scope limitation in this generator's own
// component build-method desugaring inlines a build-method local's initializer at each read site
// rather than sharing one `logic.VarDecl` — so `Model('A', 7)` is independently re-emitted at each
// read. Harmless here: both arguments are pure literals, so re-evaluating them has no observable effect
// and does not contradict the "exactly-once evaluation" guarantee this milestone proves separately, in
// isolation, for its own object-literal lowering.
class Home extends StatelessWidget {
  const Home({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model('A', 7);
    return Column(
      children: [
        Text('${model.count}'),
        Text(model.name),
      ],
    );
  }
}
