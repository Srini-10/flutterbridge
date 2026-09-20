import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: const [
          InitStateAssign(),
          DidUpdateAssign(),
          DisposeAssign(),
        ]),
      );
}

/// `initState` sets a field: the generated component used to start at 0 with no diagnostic.
class InitStateAssign extends StatefulWidget {
  const InitStateAssign({super.key});

  @override
  State<InitStateAssign> createState() => _InitStateAssignState();
}

class _InitStateAssignState extends State<InitStateAssign> {
  int _n = 0;

  @override
  void initState() {
    super.initState();
    _n = 5;
  }

  @override
  Widget build(BuildContext context) => Text('$_n');
}

/// `didUpdateWidget` reacts to a changed widget: the `update` timing.
class DidUpdateAssign extends StatefulWidget {
  const DidUpdateAssign({super.key, this.label = 'a'});

  final String label;

  @override
  State<DidUpdateAssign> createState() => _DidUpdateAssignState();
}

class _DidUpdateAssignState extends State<DidUpdateAssign> {
  int _n = 0;

  @override
  void didUpdateWidget(covariant DidUpdateAssign oldWidget) {
    super.didUpdateWidget(oldWidget);
    _n = 1;
  }

  @override
  Widget build(BuildContext context) => Text('$_n');
}

/// `dispose` does work of its own besides the framework's.
class DisposeAssign extends StatefulWidget {
  const DisposeAssign({super.key});

  @override
  State<DisposeAssign> createState() => _DisposeAssignState();
}

class _DisposeAssignState extends State<DisposeAssign> {
  int _n = 0;

  @override
  void dispose() {
    _n = 0;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Text('$_n');
}
