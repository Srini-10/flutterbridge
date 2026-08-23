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

  // A: the second declaration resolves the first, inside its own initializer.
  void _twoStep() {
    var a = 1, b = a + 1;
    _log = '$a,$b';
  }

  // B: a three-step chain — each declaration resolves the one immediately before it.
  void _threeStep() {
    var a = 1, b = a + 1, c = b + 1;
    _log = '$a,$b,$c';
  }

  // C: a later declaration resolving more than one earlier declaration, not only its predecessor.
  void _resolvesBoth() {
    var a = 1, b = 2, c = a + b;
    _log = '$a,$b,$c';
  }

  // D: an outer local, visible throughout, plus a nested declaration list resolving sequentially.
  void _outerInteraction() {
    var x = 10;
    var out = '';
    {
      var a = x, b = a + x;
      out = '$a,$b';
    }
    _log = out;
  }

  // E: an ordinary local sharing a name with an earlier declaration-list member, at a later point.
  void _localCollision() {
    var a = 1, b = a + 1;
    var out = '$a,$b';
    final int a2 = 99;
    out += ',$a2';
    _log = out;
  }

  // F/G: two unrelated actions with byte-identical, resolved declaration lists — must keep them distinct.
  void _crossActionA() {
    var a = 1, b = a + 1;
    _log = 'A:$a,$b';
  }

  void _crossActionB() {
    var a = 1, b = a + 1;
    _log = 'B:$a,$b';
  }

  // H: a C-style loop's own second declaration resolves the first, inside its own initializer.
  void _loopTwoStep() {
    var out = '';
    for (var i = 0, j = i + 1; j < 5; i++, j++) {
      out += '$i,$j;';
    }
    _log = out;
  }

  // I: a C-style loop's own third declaration resolving both earlier ones.
  void _loopResolvesBoth() {
    var out = '';
    for (var i = 0, j = 1, k = i + j; k < 8; i++, j++, k++) {
      out += '$i,$j,$k;';
    }
    _log = out;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(_log),
          ElevatedButton(onPressed: _twoStep, child: const Text('twoStep')),
          ElevatedButton(onPressed: _threeStep, child: const Text('threeStep')),
          ElevatedButton(onPressed: _resolvesBoth, child: const Text('resolvesBoth')),
          ElevatedButton(onPressed: _outerInteraction, child: const Text('outerInteraction')),
          ElevatedButton(onPressed: _localCollision, child: const Text('localCollision')),
          ElevatedButton(onPressed: _crossActionA, child: const Text('crossA')),
          ElevatedButton(onPressed: _crossActionB, child: const Text('crossB')),
          ElevatedButton(onPressed: _loopTwoStep, child: const Text('loopTwoStep')),
          ElevatedButton(onPressed: _loopResolvesBoth, child: const Text('loopResolvesBoth')),
        ],
      ),
    );
  }
}
