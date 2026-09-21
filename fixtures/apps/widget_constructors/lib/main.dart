import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: TagList()));
}

class Tag extends StatelessWidget {
  const Tag({super.key, required this.label, this.tone = 'plain'}) : danger = false;

  /// A named constructor: its own parameters, and an initializer list that sets two fields.
  const Tag.danger({super.key, required this.label}) : tone = 'red', danger = true;

  /// A factory: it returns another constructor's widget.
  factory Tag.count(int n) => Tag(label: 'count $n', tone: 'num');

  final String label;
  final String tone;
  final bool danger;

  @override
  Widget build(BuildContext context) => Text('> $label $tone ${danger ? '!' : '.'}');
}

class TagList extends StatelessWidget {
  const TagList({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Tag(label: 'a'),
        const Tag.danger(label: 'b'),
        Tag.count(3),
        const Tag(label: 'c', tone: 'blue'),
      ],
    );
  }
}
