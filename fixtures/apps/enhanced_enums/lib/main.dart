import 'package:flutter/material.dart';

import 'kinds.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: KindPicker()));
}

class Reading extends StatelessWidget {
  const Reading({super.key});

  @override
  Widget build(BuildContext context) {
    const MatchKind k = MatchKind.tune;
    return Column(
      children: [
        Text('> ${k.floor} ${k.pass} ${k.top} ${k.span.toStringAsFixed(2)}'),
        Text('> ${k.label()} ${k.name} ${k.index} $k ${MatchKind.values.length}'),
        Text('> ${MatchKind.words.passes(0.7)} ${MatchKind.loose.passes(0.1)} ${Mode.fast} ${Mode.slow.name}'),
        Text('> ${Level.fromTag('h').name} ${Level.fromTag('zz').name} ${Level.count()} ${Unit.magic()}'),
        Text('> ${Planet.earth.gravity.toStringAsFixed(2)} ${Planet.values.map((Planet p) => p.name).join(",")}'),
      ],
    );
  }
}

class KindPicker extends StatefulWidget {
  const KindPicker({super.key});

  @override
  State<KindPicker> createState() => _KindPickerState();
}

class _KindPickerState extends State<KindPicker> {
  MatchKind kind = MatchKind.words;

  void next() {
    setState(() {
      kind = MatchKind.values[(kind.index + 1) % MatchKind.values.length];
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${kind.label()} ${kind.pass} ${kind == MatchKind.tune} ${kind.passes(0.55)}'),
        ElevatedButton(onPressed: next, child: const Text('next')),
      ],
    );
  }
}
