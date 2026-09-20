import 'package:flutter/material.dart';

void main() => runApp(const MaterialApp(home: Screen()));

class Base {
  const Base();
  int get value => 1;
}

/// Overrides `value`: Dart dispatches `base.value` to this at runtime when a `Child` is passed as a `Base`.
class Child extends Base {
  const Child();

  @override
  int get value => 2;
}

class Show extends StatelessWidget {
  const Show({super.key, required this.base});

  final Base base;

  @override
  Widget build(BuildContext context) => Text('${base.value}');
}

/// The only way for a `Child` to reach `Show.base` is to construct one here. It is refused.
class Screen extends StatelessWidget {
  const Screen({super.key});

  @override
  Widget build(BuildContext context) => const Show(base: Child());
}
