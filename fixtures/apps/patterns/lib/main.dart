import 'package:flutter/material.dart';

import 'shapes.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Matches()));
}

class Matches extends StatelessWidget {
  const Matches({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${describe(Circle(12))} | ${describe(Circle(2))} | ${describe(Rect(1, 1))} | ${describe(Rect(2, 3))} | ${describe(Tri(1))}'),
        Text('> ${kind(null)} | ${kind(-3)} | ${kind(4)} | ${kind('s')} | ${kind(true)} | ${kind(2.5)}'),
        Text('> ${warmth(Tone.red)} ${warmth(Tone.green)} ${warmth(Tone.blue)}'),
        Text('> ${range(-5)} ${range(0)} ${range(7)} ${range(30)}'),
        Text('> ${stmt(Circle(5))} | ${stmt(Circle(0.5))} | ${stmt(Rect(1, 2))} | ${stmt(Tri(2))}'),
        Text('> ${maybe('abc')} ${maybe(null)} ${zeros('')} ${zeros(0)} ${zeros(false)} ${flow(Circle(1))} ${flow(Rect(1, 1))} ${flow(Tri(1))}'),
      ],
    );
  }
}
