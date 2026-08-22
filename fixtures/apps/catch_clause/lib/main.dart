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
  String _log = 'idle';

  /// Two unrelated actions, each catching an exception under the identical name `e` — declaration-tier
  /// identity (ADR-28, amended M8-S), owner-qualified, keeps them distinct.
  void _first() {
    try {
      _log = 'ok';
    } on Object catch (e) {
      _log = 'first failed: $e';
    }
  }

  void _second() {
    try {
      _log = 'ok';
    } on Object catch (e) {
      _log = 'second failed: $e';
    }
  }

  /// An ordinary local and a catch exception binding sharing both a name and the same per-owner ordinal
  /// sequence (M8-S) — must never collide, even though both are named `total`.
  void _mixed() {
    final int total = 1;
    try {
      _log = 'total is $total';
    } on Object catch (total) {
      _log = 'mixed failed: $total';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(_log),
          ElevatedButton(onPressed: _first, child: const Text('first')),
          ElevatedButton(onPressed: _second, child: const Text('second')),
          ElevatedButton(onPressed: _mixed, child: const Text('mixed')),
        ],
      ),
    );
  }
}
