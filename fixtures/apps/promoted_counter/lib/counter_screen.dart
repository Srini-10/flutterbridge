import 'package:flutter/material.dart';

/// The single-hop-promotable destination: it actually reads `count` and calls `onIncrement` itself,
/// rather than forwarding either further — the property that makes this fixture different from
/// `hello_bridge`'s `LoginScreen`.
class CounterScreen extends StatelessWidget {
  const CounterScreen({super.key, required this.count, required this.onIncrement});

  final int count;
  final VoidCallback onIncrement;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('FlutterBridge')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('You have pushed the button $count times.'),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: onIncrement,
                  child: const Text('Increment'),
                ),
              ],
            ),
          ),
        ),
        floatingActionButton: FloatingActionButton(
          tooltip: 'Increment',
          onPressed: onIncrement,
          child: const Icon(Icons.add),
        ),
      );
}
