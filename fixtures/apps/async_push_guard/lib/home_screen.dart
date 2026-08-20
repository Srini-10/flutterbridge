import 'package:flutter/material.dart';

import 'detail_screen.dart';

/// `hello_bridge/lib/screens/login_screen.dart`'s own shape, reduced: a named async method
/// (referenced by tear-off, not written inline in `onPressed`) that awaits a real, Duration-backed
/// delay, checks `mounted` only once that delay resolves, and only then awaits the push itself —
/// `await Navigator.push(...)`, not a bare one. `_count`/`_increment` are read by `DetailScreen`
/// itself (single-hop), which is what makes them promotable under M7-F/N11; `title` is a plain
/// constant that must never be promoted.
///
/// The `Future.delayed(Duration(...))` is real, not a stand-in: through M7-J this fixture had none,
/// because `Duration`/`Future` reaching the generator as opaque application classes (BRG3002) was a
/// separate, pre-existing gap this fixture's `tsc` proof could not clear regardless. M7-L closed that
/// gap — the kit already carried `Duration` for M4-H's implicit animations, and `delay(Duration)`
/// wraps it in a `Promise<void>` — so the delay this comment used to explain away now belongs here,
/// exercising the real await this fixture's mounted/navigate guard is meant to guard. 30ms: long
/// enough for a Playwright test to unmount the tree mid-flight without a real race, short enough that
/// no browser test waits on it meaningfully (Phase 17, M7-L).
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

    await Future<void>.delayed(const Duration(milliseconds: 30));

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
