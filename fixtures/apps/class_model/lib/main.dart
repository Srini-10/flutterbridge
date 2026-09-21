import 'package:flutter/material.dart';

import 'shapes.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4)),
        ),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
      body: SingleChildScrollView(
          child: Column(children: [Models(), CounterHost()])));
}

class Models extends StatelessWidget {
  const Models({super.key});

  @override
  Widget build(BuildContext context) {
    final Point p = Point(1, 2);
    final Point q = Point.named(x: 4);
    final Shape s = Square(3);
    return Column(
      children: [
        Text(
          '> ${p.sum} ${q.sum} ${p.plus(q)} ${p.scaled(by: 3)} ${p.scaled()} ${Point.origin()}',
        ),
        Text('> ${p + q} ${Point.fromSum(9)} ${Point.zero()}'),
        Text('> ${s.describe()} ${Rect(2, 4).describe()}'),
        Text('> ${s is Rect} ${s is Square} ${Rect(1, 1) is Square}'),
        Text(
            '> ${Tally().hits} ${Tally.startingAt(9).hits} ${Tally().log.length} ${Tally().bump()}'),
        Text(
            '> ${Wrapper(1, 2)} ${Wrapper.twin(4)} ${Wrapper.of(5)} ${Wrapper.sum(2, 3)}'),
      ],
    );
  }
}

class CounterHost extends StatefulWidget {
  const CounterHost({super.key});

  @override
  State<CounterHost> createState() => _CounterHostState();
}

class _CounterHostState extends State<CounterHost> {
  final Counter _c = Counter(10);
  String _log = '';

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('tick'),
            onPressed: () {
              setState(() {
                _log = '$_log${_c.tick()},';
              });
            },
          ),
          ElevatedButton(
            child: const Text('tick5'),
            onPressed: () {
              setState(() {
                _c.tick(5);
              });
            },
          ),
          ElevatedButton(
            child: const Text('set'),
            onPressed: () {
              setState(() {
                _c.value = 100;
              });
            },
          ),
          Text('> ${_c.value} ${_c.start} [$_log]'),
        ],
      );
}
