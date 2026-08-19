import 'package:flutter/material.dart';

/// Reached only by an inline push — no declarative route names it. Reads every argument itself
/// (single-hop), which is what makes `count`/`onIncrement` promotable and what makes this fixture
/// distinct from `hello_bridge`'s forwarding-only `LoginScreen`.
class DetailScreen extends StatelessWidget {
  const DetailScreen({
    super.key,
    required this.title,
    required this.count,
    required this.enabled,
    required this.onIncrement,
  });

  final String title;
  final int count;
  final bool enabled;
  final VoidCallback onIncrement;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('Count: $count'),
                Text('Enabled: $enabled'),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: onIncrement,
                  child: const Text('Increment'),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(context);
                  },
                  child: const Text('Go back'),
                ),
              ],
            ),
          ),
        ),
      );
}
