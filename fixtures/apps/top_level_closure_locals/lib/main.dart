import 'package:flutter/material.dart';

void main() => runApp(const App());

/// The regression shape: a local (`base`), declared with `final` inside a *statement*-bodied top-level
/// closure (not an expression-bodied one — `() => expr` never reached the broken path at all, since it has
/// no `logic.VarDecl` of its own), read by a *later* statement in the same body.
final int Function() doubler = () {
  final base = 3;
  return base * 2;
};

/// Two locals, one reassigned (`let`, not `const`) after being read — proves both keywords and a
/// read-then-write ordering, not just the single-read shape above.
final String Function(String) greeting = (String name) {
  var greeting = 'Hello';
  final loud = greeting.toUpperCase();
  greeting = '$loud, $name!';
  return greeting;
};

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
        home: const HomeScreen(),
      );
}

/// Referenced from a *second* component — not `App` itself — matching the shape real evidence hit this
/// through (a Riverpod provider's own create closure, read from a widget elsewhere in the tree).
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Text('${doubler()} ${greeting('Ada')}'),
        ),
      );
}
