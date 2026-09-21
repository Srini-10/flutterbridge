import 'package:flutter/material.dart';

import 'errors.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Catches()));
}

class Catches extends StatelessWidget {
  const Catches({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${classify(0)} | ${classify(1)} | ${classify(2)} | ${classify(3)}'),
        Text('> ${classify(4)} | ${classify(5)} | ${classify(6)} | ${classify(9)}'),
        Text('> ${unmatched(0)} | ${unmatched(2)} | ${unmatched(9)}'),
        Text('> ${withFinally(1)} | ${withFinally(9)} | ${castKind(5)} | ${castKind('s')}'),
      ],
    );
  }
}
