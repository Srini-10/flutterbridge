import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Panel(title: 'Menu', items: <String>['a'])));
}

/// A top-level widget function.
Widget badge(String text, {int count = 0}) => Text('> badge $text $count');

class Panel extends StatelessWidget {
  const Panel({super.key, required this.title, this.items = const <String>[]});

  final String title;
  final List<String> items;

  Widget _header(String text, {bool bold = false}) => Text('> ${bold ? text.toUpperCase() : text}');

  /// The argument is written with the parameter's own name: it must resolve in the caller.
  Widget _tag(String t) => Text('> tag $t');

  Widget _row(String item) {
    final String label = '- $item';
    return Text('> $label ${item.length}');
  }

  /// A helper that calls a helper, and a conditional.
  Widget _body(BuildContext context, List<String> items) =>
      items.isEmpty ? const Text('> empty') : Column(children: [for (final String i in items) _row(i)]);

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _header(title, bold: true),
        _header('sub'),
        _body(context, items),
        badge(title, count: items.length),
        badge('x'),
        for (final String t in items) _tag(t),
      ],
    );
  }
}

class PanelHost extends StatelessWidget {
  const PanelHost({super.key});

  @override
  Widget build(BuildContext context) => const Panel(title: 'Menu', items: <String>['a', 'b']);
}

class Counter extends StatefulWidget {
  const Counter({super.key});

  @override
  State<Counter> createState() => _CounterState();
}

class _CounterState extends State<Counter> {
  int n = 0;

  Widget _button(String label, int delta) => ElevatedButton(
        onPressed: () => setState(() {
          n += delta;
        }),
        child: Text(label),
      );

  Widget _shown() => Text('> n=$n');

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _shown(),
        _button('inc', 1),
        _button('dec', -1),
      ],
    );
  }
}
