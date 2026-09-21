import 'dart:async';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Statics()));
}

class Cell {
  Cell(this.v);
  int v;
}

bool same(Object? a, Object? b) => identical(a, b);

bool sameCell() {
  final Cell a = Cell(1);
  final Cell b = a;
  return identical(a, b);
}

bool otherCell() {
  final Cell a = Cell(1);
  final Cell b = Cell(1);
  return identical(a, b);
}

/// `visibleForTesting` is a package `const` (an object): the "argument omitted" sentinel pattern copy-with code uses.
String pick(Object? value) => value == visibleForTesting ? 'omitted' : 'given';

int hashOf(Object? a, Object? b) => Object.hash(a, b);

class Statics extends StatelessWidget {
  const Statics({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${same(1, 1)} ${same(0.0, -0.0)} ${same(double.nan, double.nan)} ${same('a', 'a')} ${sameCell()} ${otherCell()}'),
        Text('> ${pick(visibleForTesting)} ${pick(3)} ${pick(null)}'),
        Text('> ${hashOf(1, 'a') == hashOf(1, 'a')} ${hashOf(1, 2) == hashOf(2, 1)} ${Object.hashAll([1, 2]) == hashOf(1, 2)} ${hashOf(true, 1) == hashOf(false, 1)} ${hashOf('ab', 1) == hashOf('ba', 1)} ${hashOf(null, 1) == hashOf(0, 1)}'),
        Text('> ${double.infinity} ${double.negativeInfinity} ${double.nan.isNaN} ${double.maxFinite} ${double.minPositive}'),
      ],
    );
  }
}

class Unawaited extends StatefulWidget {
  const Unawaited({super.key});

  @override
  State<Unawaited> createState() => _UnawaitedState();
}

class _UnawaitedState extends State<Unawaited> {
  int n = 0;

  Future<void> bump() async {
    setState(() {
      n += 1;
    });
    await Future<void>.delayed(const Duration(milliseconds: 1));
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> $n'),
        ElevatedButton(onPressed: () => unawaited(bump()), child: const Text('go')),
      ],
    );
  }
}
