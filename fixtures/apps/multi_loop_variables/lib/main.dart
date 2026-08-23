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

  // A: two declarations, both read in the condition, both updaters, and the body.
  void _twoDeclarations() {
    var out = '';
    for (var i = 0, j = 10; i < j; i++, j--) {
      out += '$i,$j;';
    }
    _log = out;
  }

  // B: three declarations.
  void _threeDeclarations() {
    var out = '';
    for (var i = 0, j = 1, k = 2; i < 3; i++, j++, k++) {
      out += '$i$j$k;';
    }
    _log = out;
  }

  // C: byte-identical initializer content — must not collapse to one declaration.
  void _sameContent() {
    var out = '';
    for (var i = 0, j = 0; i < j || i < 2; i++, j++) {
      out += '$i,$j;';
    }
    _log = out;
  }

  // D: nested multi-declaration loops sharing both variable names — the inner declarations must never
  // conflate with the outer ones.
  void _nested() {
    var out = '';
    for (var i = 0, j = 2; i < j; i++, j--) {
      for (var i = 0, j = 1; i < j; i++, j--) {
        out += 'inner:$i,$j;';
      }
      out += 'outer:$i,$j;';
    }
    _log = out;
  }

  // E/F: two unrelated actions, each declaring a multi-declaration loop under identical names — must
  // keep them distinct.
  void _crossActionA() {
    var out = '';
    for (var i = 0, j = 5; i < j; i++, j--) {
      out += '$i,$j;';
    }
    _log = 'A:$out';
  }

  void _crossActionB() {
    var out = '';
    for (var i = 0, j = 3; i < j; i++, j--) {
      out += '$i,$j;';
    }
    _log = 'B:$out';
  }

  // G: an ordinary local sharing a name with a loop declaration, at a later point in the same body.
  void _localCollision() {
    var out = '';
    for (var i = 0, j = 5; i < j; i++, j--) {
      out += '$i,$j;';
    }
    final int i = 99;
    out += 'after:$i';
    _log = out;
  }

  // H: the condition and updaters may be omitted.
  void _omittedClauses() {
    var out = '';
    for (var i = 0, j = 5;;) {
      if (i >= j) break;
      out += '$i,$j;';
      i++;
      j--;
    }
    _log = out;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(_log),
          ElevatedButton(onPressed: _twoDeclarations, child: const Text('two')),
          ElevatedButton(onPressed: _threeDeclarations, child: const Text('three')),
          ElevatedButton(onPressed: _sameContent, child: const Text('sameContent')),
          ElevatedButton(onPressed: _nested, child: const Text('nested')),
          ElevatedButton(onPressed: _crossActionA, child: const Text('crossA')),
          ElevatedButton(onPressed: _crossActionB, child: const Text('crossB')),
          ElevatedButton(onPressed: _localCollision, child: const Text('localCollision')),
          ElevatedButton(onPressed: _omittedClauses, child: const Text('omittedClauses')),
        ],
      ),
    );
  }
}
