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

  // A: for-in with `final`.
  void _forIn() {
    final items = <String>['x', 'y'];
    var out = '';
    for (final item in items) {
      out += item;
    }
    _log = out;
  }

  // B: C-style loop, its own declared variable read in the test, the update, and the body.
  void _classicFor() {
    var out = '';
    for (var i = 0; i < 3; i++) {
      out += '$i';
    }
    _log = out;
  }

  // C: nested loops, distinct names — an inner read must never resolve to the outer declaration.
  void _nested() {
    final outers = <String>['a'];
    final inners = <String>['b'];
    var out = '';
    for (final outer in outers) {
      for (final inner in inners) {
        out += outer;
        out += inner;
      }
    }
    _log = out;
  }

  // D: same-name nested shadowing — the inner loop's own `value` must never leak into the outer read
  // that follows it.
  void _shadowed() {
    final first = <String>['a'];
    final second = <String>['b'];
    var out = '';
    for (final value in first) {
      for (final value in second) {
        out += value;
      }
      out += value;
    }
    _log = out;
  }

  // E: a body-local whose own initializer reads the loop variable.
  void _bodyLocal() {
    final items = <String>['x'];
    var out = '';
    for (final item in items) {
      final itemCopy = item;
      out += itemCopy;
    }
    _log = out;
  }

  // F/G: two unrelated actions, each declaring a for-in loop variable under the identical name `item` —
  // declaration-tier identity, owner-qualified, must keep them distinct.
  void _crossActionA() {
    final items = <String>['a'];
    var out = '';
    for (final item in items) {
      out += item;
    }
    _log = 'A:$out';
  }

  void _crossActionB() {
    final items = <String>['b'];
    var out = '';
    for (final item in items) {
      out += item;
    }
    _log = 'B:$out';
  }

  // H: a loop variable and an ordinary local sharing a name in the same owning body, at different
  // points — must never collide, even though both are named `item`.
  void _localCollision() {
    final items = <String>['z'];
    var out = '';
    for (final item in items) {
      out += item;
    }
    final item = 'after';
    out += item;
    _log = out;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(_log),
          ElevatedButton(onPressed: _forIn, child: const Text('forIn')),
          ElevatedButton(onPressed: _classicFor, child: const Text('classicFor')),
          ElevatedButton(onPressed: _nested, child: const Text('nested')),
          ElevatedButton(onPressed: _shadowed, child: const Text('shadowed')),
          ElevatedButton(onPressed: _bodyLocal, child: const Text('bodyLocal')),
          ElevatedButton(onPressed: _crossActionA, child: const Text('crossA')),
          ElevatedButton(onPressed: _crossActionB, child: const Text('crossB')),
          ElevatedButton(onPressed: _localCollision, child: const Text('localCollision')),
        ],
      ),
    );
  }
}
