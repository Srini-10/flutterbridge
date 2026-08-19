import 'package:flutter/material.dart';

/// Reached only by the awaited, guarded push in `home_screen.dart`. Reads every argument itself
/// (single-hop), which is what makes `count`/`onIncrement` promotable under M7-F/N11 — `title`
/// stays an ordinary per-push constant, never promoted.
class DetailScreen extends StatelessWidget {
  const DetailScreen({
    super.key,
    required this.title,
    required this.count,
    required this.onIncrement,
  });

  final String title;
  final int count;
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
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: onIncrement,
                  child: const Text('Increment'),
                ),
              ],
            ),
          ),
        ),
      );
}
