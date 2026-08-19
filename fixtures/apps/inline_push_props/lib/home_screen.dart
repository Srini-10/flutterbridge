import 'package:flutter/material.dart';

import 'detail_screen.dart';

/// Owns the state two inline pushes both forward — `_count`/`_increment` are what N11 should promote
/// (single-hop: `DetailScreen` reads/calls them itself), while `title`/`enabled` are plain constants
/// that differ per push and must never be resolved through promotion or a shared cache.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _count = 0;

  void _increment() {
    setState(() {
      _count = _count + 1;
    });
  }

  // The push sits directly inside the callback's own body — the shape
  // `dart/bridge_analyzer/test/transition_test.dart`'s own `screen()` helper uses, and the one route-
  // transition extraction is proven against. Routed through a separately-named method (as this fixture
  // first tried), the call is never found as a transition at all — a real, verified extraction
  // constraint, not the gap this milestone exists to fix. Recorded in
  // docs/m7/m7g-inline-push-prop-resolution.md rather than left as a silent fixture-authoring detail.

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('FlutterBridge')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('Home count: $_count'),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (BuildContext context) => DetailScreen(
                          title: 'Details',
                          count: _count,
                          enabled: true,
                          onIncrement: _increment,
                        ),
                      ),
                    );
                  },
                  child: const Text('Open Details'),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (BuildContext context) => DetailScreen(
                          title: 'Other',
                          count: _count,
                          enabled: false,
                          onIncrement: _increment,
                        ),
                      ),
                    );
                  },
                  child: const Text('Open Other'),
                ),
              ],
            ),
          ),
        ),
      );
}
