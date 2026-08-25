import 'package:flutter/material.dart';

// ── the target shape (M9-J §1 of the milestone brief) ───────────────────────

class Model {
  const Model(this.count);
  final int count;
  int get doubled => count * 2;
  int compute() => count + 1;
}

// ── same-name-class negative control (never confused by member name alone) ─

class Alpha {
  const Alpha();
  int get value => 1;
}

class Beta {
  const Beta();
  int get value => 2;
}

// ── inherited/overridden getter — must never be statically bound ───────────

class Base {
  const Base();
  int get value => 1;
}

class Child extends Base {
  const Child();
  @override
  int get value => 2;
}

// ── nested access — one refusal at the first unsupported edge ──────────────

class Child2 {
  const Child2(this.name);
  final String name;
}

class Parent {
  const Parent(this.child);
  final Child2 child;
}

// Not wired into a `MaterialApp`/route table — a bare component, exercised the same way every other
// generator-level fixture in this milestone's own investigation was (M9-I's own probes did the same).
// Each parameter's own member access, independently, is the shape under test; none of this needs a route.
class Home extends StatelessWidget {
  const Home({
    super.key,
    required this.model,
    required this.alpha,
    required this.beta,
    required this.base,
    required this.parent,
  });

  final Model model;
  final Alpha alpha;
  final Beta beta;
  final Base base;
  final Parent parent;

  @override
  Widget build(BuildContext context) {
    return Text(
      '${model.count}-${model.doubled}-${model.compute()}-${alpha.value}-${beta.value}-${base.value}-${parent.child.name}',
    );
  }
}
