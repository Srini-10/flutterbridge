import 'package:flutter/material.dart';

import 'bag.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: const [
          DoubleInterpolation(),
          JoinDefault(),
          JoinSeparator(),
          ProjectClassJoin(),
        ]),
      );
}

/// A double interpolates as Dart prints it: an integral value keeps its .0.
class DoubleInterpolation extends StatefulWidget {
  const DoubleInterpolation({super.key});

  @override
  State<DoubleInterpolation> createState() => _DoubleInterpolationState();
}

class _DoubleInterpolationState extends State<DoubleInterpolation> {
  double _d = 3.0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _d = _d * 2;
              });
            },
            child: const Text('go'),
          ),
          Text('$_d'),
        ],
      );
}

/// List.join() with no argument joins with the empty string, not JavaScript's comma.
class JoinDefault extends StatefulWidget {
  const JoinDefault({super.key});

  @override
  State<JoinDefault> createState() => _JoinDefaultState();
}

class _JoinDefaultState extends State<JoinDefault> {
  List<String> _w = <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _w = <String>['c', 'd'];
              });
            },
            child: const Text('go'),
          ),
          Text(_w.join()),
        ],
      );
}

/// List.join(sep) and indexOf mean the same in both languages and pass through.
class JoinSeparator extends StatefulWidget {
  const JoinSeparator({super.key});

  @override
  State<JoinSeparator> createState() => _JoinSeparatorState();
}

class _JoinSeparatorState extends State<JoinSeparator> {
  List<String> _w = <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _w = <String>['b', 'a'];
              });
            },
            child: const Text('go'),
          ),
          Text('${_w.join(',')}:${_w.indexOf('a')}'),
        ],
      );
}

/// A project class whose own methods are named `add` and `join` — the collection policy keys on the
/// receiver's resolved `dart:core` type, never the method's name, so an eligible method call on this class
/// still lowers to its helper (ADR-0039) and is not refused as a `List`/`Set` method.
class ProjectClassJoin extends StatelessWidget {
  const ProjectClassJoin({super.key});

  @override
  Widget build(BuildContext context) {
    final bag = Bag(2);
    return Text('${bag.add(3)} / ${bag.join(4)}');
  }
}
