import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Rows()));
}

class Rows extends StatelessWidget {
  const Rows({super.key});

  @override
  Widget build(BuildContext context) {
    final List<Widget> rows = <Widget>[];
    for (var i = 0; i < 3; i++) {
      rows.add(Text('> row $i'));
    }
    if (rows.length > 5) {
      rows.add(const Text('> many'));
    }
    final String label = rows.length > 2 ? 'many' : 'few';
    return Column(
      children: [
        Text('> $label ${rows.length}'),
        ...rows,
        for (var j = 0; j < 2; j++) Text('> tail $j'),
      ],
    );
  }
}

class Toggle extends StatefulWidget {
  const Toggle({super.key});

  @override
  State<Toggle> createState() => _ToggleState();
}

class _ToggleState extends State<Toggle> {
  int n = 0;

  @override
  Widget build(BuildContext context) {
    final List<String> items = <String>[];
    for (var k = 0; k < n; k++) {
      items.add('item $k');
    }
    final Widget footer = n > 2 ? const Text('> big') : const Text('> small');
    return Column(
      children: [
        Text('> n=$n'),
        ...items.map((String s) => Text('> $s')),
        footer,
        ElevatedButton(
          onPressed: () => setState(() {
            n++;
          }),
          child: const Text('add'),
        ),
      ],
    );
  }
}
