import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
        home: const HomeScreen(),
      );
}

/// A general (non-Riverpod) class exercising every expression-body shape the bug could reach.
class Counter {
  int value = 0;

  /// Expression-bodied `void`, an assignment — the reported bug's own exact shape.
  void increment() => value = value + 1;

  /// Expression-bodied, non-`void` — must keep returning its value (unaffected by the fix).
  int doubled() => value * 2;

  /// Statement-bodied `void` — already correct before the fix, must stay correct.
  void reset() {
    value = 0;
  }

  /// Expression-bodied `void`, a call (not an assignment) — the bug is about discarding *any* value,
  /// not only an assignment's.
  void log() => debugPrint('value is $value');
}

/// An extension setter — implicitly `void` (Dart's own rule for every setter), arrow-bodied, an
/// assignment. A different extraction path (`declaration_extractor.dart`'s `_extension`) from an ordinary
/// method's (`_methods`), and must be fixed the same way.
extension CounterX on Counter {
  set plus1(int v) => value = value + v;
}

/// A top-level function — the third extraction path (`_function`), arrow-bodied `void`, calling another
/// method (not an assignment, matching `log()`'s own shape at the top level instead of a method's).
void resetAll(Counter c) => c.reset();

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _counter = Counter();
  int taps = 0;

  /// A lifecycle method (`sig.Effect`'s own extraction path, `signal_extractor.dart`), arrow-bodied
  /// `void` — Flutter's own contract requires `dispose()` to be `void`, so this is always the shape.
  @override
  void dispose() => super.dispose();

  /// A widget action (`sig.Action`'s own extraction path), arrow-bodied `void`, a call — not
  /// `setState(...)`/`Navigator.pop(...)`, so it reaches the void-discard decision directly rather than
  /// through the pre-existing batch-splice/navigate special cases.
  void logTaps() => debugPrint('taps: $taps');

  /// An `async` widget action, arrow-bodied `Future<void>` — the `Future`-unwrapped void check.
  Future<void> logAsync() async => debugPrint('async taps: $taps');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text('${_counter.value} ${_counter.doubled()} $taps'),
          ElevatedButton(
            onPressed: () {
              setState(() {
                _counter.increment();
                _counter.plus1 = 2;
                _counter.log();
                resetAll(_counter);
                taps = taps + 1;
                logTaps();
              });
              logAsync();
            },
            child: const Text('go'),
          ),
        ],
      ),
    );
  }
}
