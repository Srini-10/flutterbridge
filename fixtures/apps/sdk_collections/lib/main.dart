import 'package:flutter/material.dart';

import 'ops.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Ops()));
}

class Ops extends StatelessWidget {
  const Ops({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${search(<int>[1, 3, 5, 4])}'),
        Text('> ${search(<int>[1, 2, 3])}'),
        Text('> ${folds(<int>[1, 2, 3, 4])}'),
        Text('> ${shapes(<int>[1, 2, 3, 4])}'),
        Text('> ${singles(<int>[5], <int>[])}'),
        Text('> ${sets(<int>{1, 2, 3}, <int>{2, 3, 4})}'),
        Text('> ${maps(<String, int>{'a': 1, 'b': 2, 'c': 3})}'),
        Text('> ${constructors(<int>[1, 2])}'),
      ],
    );
  }
}
