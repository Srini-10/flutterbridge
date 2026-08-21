import 'package:flutter/material.dart';

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF3F51B5))),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _log = 0;

  /// Two unrelated actions, each declaring a `final int total = 1;` — textually identical, so a
  /// content-derived id would collapse them into one declaration (ADR-28 §2). Declaration-tier identity,
  /// owner-qualified, keeps them distinct.
  void _first() {
    final int total = 1;
    _log = total;
  }

  void _second() {
    final int total = 1;
    _log = total;
  }

  /// A local read twice in one expression — the declaration must be evaluated once, and both reads
  /// resolve to the same binding (ADR-28 §14 evaluation-count proof).
  void _twice() {
    final int value = 21;
    _log = value + value;
  }

  /// A `var` local, reassigned twice — mutation is not silently frozen into an immutable binding
  /// (ADR-28 §15).
  void _mutate() {
    var count = 0;
    count = count + 1;
    count++;
    _log = count;
  }

  /// Lexical shadowing at two nesting depths, with distinct initializer values so the proof does not
  /// depend on the two declarations coincidentally sharing content (ADR-28 §5, §18).
  void _shadow() {
    final int level = 1;
    if (_log == 0) {
      final int level = 2;
      _log = level;
    }
    _log = level;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text('$_log'),
          ElevatedButton(onPressed: _first, child: const Text('first')),
          ElevatedButton(onPressed: _second, child: const Text('second')),
          ElevatedButton(onPressed: _twice, child: const Text('twice')),
          ElevatedButton(onPressed: _mutate, child: const Text('mutate')),
          ElevatedButton(onPressed: _shadow, child: const Text('shadow')),
        ],
      ),
    );
  }
}
