import 'package:flutter/material.dart';

import 'detail_screen.dart';

/// `hello_bridge/lib/screens/login_screen.dart`'s own shape, reduced: a named async method
/// (referenced by tear-off, not written inline in `onPressed`) that checks `mounted` and only then
/// awaits the push itself — `await Navigator.push(...)`, not a bare one. `_count`/`_increment` are
/// read by `DetailScreen` itself (single-hop), which is what makes them promotable under M7-F/N11;
/// `title` is a plain constant that must never be promoted.
///
/// No earlier `await Future.delayed(...)`/network stand-in, unlike `hello_bridge`'s own `_submit`:
/// `Duration`'s named constructor argument, and `Duration`/`Future` themselves reaching the
/// generator as opaque application classes, are `hello_bridge`'s own separate, pre-existing gaps
/// (BRG3002) — confirmed unaffected by this milestone (measured before and after, identical count).
/// Including one here would block this fixture's own `tsc` proof on a defect this milestone does not
/// own, for no gain: `dart/bridge_analyzer/test/transition_test.dart`'s reduction ladder already
/// proves an earlier `await` ahead of the guard extracts and orders correctly, exhaustively, at the
/// analyzer level — this fixture's job is the rest of the pipeline (N1–N11, the generator, `tsc`),
/// which does not need a second await to exercise.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _count = 0;
  bool _isSubmitting = false;

  void _increment() {
    setState(() {
      _count = _count + 1;
    });
  }

  Future<void> _submit() async {
    // A `setState` write, exactly as `hello_bridge`'s own `_submit` has — a method with no signal
    // write is just a method, never a `sig.Action`, so the extractor never reaches its body at all
    // (a real, evidenced rule; a state-free stand-in would test a shape this milestone found no
    // evidence needs solving).
    setState(() {
      _isSubmitting = true;
    });

    if (!mounted) {
      return;
    }

    setState(() {
      _isSubmitting = false;
    });

    await Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (BuildContext context) => DetailScreen(
          title: 'Authenticated',
          count: _count,
          onIncrement: _increment,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Async Push Guard')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('Home count: $_count'),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: _isSubmitting ? null : _submit,
                  child: const Text('Sign in'),
                ),
              ],
            ),
          ),
        ),
      );
}
