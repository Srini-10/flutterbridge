import 'package:flutter/material.dart';

import 'counter_store.dart';

void main() => runApp(const LocalStoreApp());

class LocalStoreApp extends StatelessWidget {
  const LocalStoreApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const CountersScreen(),
      );
}

/// `_left`/`_right` — two independent instances of the same declared store, both owned by this one
/// component instance. Mutating one must never affect the other (ADR-27, Phase 10/14): the test this
/// fixture exists to prove.
class CountersScreen extends StatefulWidget {
  const CountersScreen({super.key});

  @override
  State<CountersScreen> createState() => _CountersScreenState();
}

class _CountersScreenState extends State<CountersScreen> {
  final CounterStore _left = CounterStore();
  final CounterStore _right = CounterStore();

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Local Store')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('Left: ${_left.count} (doubled: ${_left.doubled})'),
                ElevatedButton(onPressed: _left.increment, child: const Text('Left +1')),
                ElevatedButton(onPressed: () => _left.add(5), child: const Text('Left +5')),
                const SizedBox(height: 24),
                Text('Right: ${_right.count} (doubled: ${_right.doubled})'),
                ElevatedButton(onPressed: _right.increment, child: const Text('Right +1')),
                ElevatedButton(onPressed: () => _right.add(5), child: const Text('Right +5')),
              ],
            ),
          ),
        ),
      );
}
