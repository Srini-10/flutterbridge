import 'package:flutter/material.dart';

import 'recs.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Recs()));
}

class Recs extends StatelessWidget {
  const Recs({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${records()}'),
        Text('> ${lists(<int>[1, 2, 3, 4])} | ${lists(<int>[7])} | ${lists(<int>[])}'),
        Text('> ${maps(<String, Object?>{'id': 5, 'n': 'ann'})} | ${maps(<String, Object?>{'id': -1, 'n': 'x'})} | ${maps(<String, Object?>{'id': 1})}'),
        Text('> ${sw(<int>[])} | ${sw(<int>[9])} | ${sw(<int>[1, 2, 3])} | ${sw(<String, Object?>{'id': 3})} | ${sw((1, 2))} | ${sw((x: 3, y: 4))} | ${sw('s')} | ${sw(<int>[1, 2, 3, 4])} | ${sw(<String, Object?>{'x': 1})} | ${sw(<String, Object?>{'flag': null})} | ${sw((1, 2, 3))}'),
        Text('> ${note(<int>[5])} ${note(<int>[])}'),
        Text('> ${flow(<(String, int)>[('a', 1), ('b', 2)])}'),
      ],
    );
  }
}
