// The FlutterBridge example — a Flutter application that compiles to a React project.
//
// Everything here is inside the supported surface, on purpose: this is what a new user runs first, and an
// example that fails to compile teaches the wrong lesson. `bridge build` in this directory produces a
// Next.js project with no diagnostics at all.
//
// What it exercises, and why each one is here:
//
//   * `ColorScheme.fromSeed` — the seed is the app's one colour token, and N10 derives the 46 Material
//     roles from it. Without it, every themed widget is correctly refused (INV-20).
//   * a component signal (`_count`) written by a `setState` callback — the whole reactivity model.
//   * a list built from data, which extraction expands into a `ui.List`.
//   * a `Scaffold`/`AppBar` shell, which is what every real screen is inside.

import 'package:flutter/material.dart';

void main() => runApp(const CounterApp());

class CounterApp extends StatelessWidget {
  const CounterApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        ),
        home: const CounterScreen(),
      );
}

class CounterScreen extends StatefulWidget {
  const CounterScreen({super.key});

  @override
  State<CounterScreen> createState() => _CounterScreenState();
}

class _CounterScreenState extends State<CounterScreen> {
  int _count = 0;
  List<String> _history = const <String>[];

  void _increment() {
    setState(() {
      _count = _count + 1;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('FlutterBridge')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('You have pushed the button $_count times.'),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: _increment,
                  child: const Text('Increment'),
                ),
                const Divider(height: 32),
                ListView.builder(
                  shrinkWrap: true,
                  itemCount: _history.length,
                  itemBuilder: (BuildContext context, int index) => ListTile(
                    key: ValueKey<String>(_history[index]),
                    title: Text(_history[index]),
                  ),
                ),
              ],
            ),
          ),
        ),
        floatingActionButton: FloatingActionButton(
          tooltip: 'Increment',
          onPressed: _increment,
          child: const Icon(Icons.add),
        ),
      );
}
