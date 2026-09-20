import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(
            colorScheme:
                ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: const [
          DependencyChange(),
          Leaving(),
          StoreUser(),
        ]),
      );
}

/// `didChangeDependencies` fires when an inherited dependency changes — a function component has no hook for that.
class DependencyChange extends StatefulWidget {
  const DependencyChange({super.key});

  @override
  State<DependencyChange> createState() => _DependencyChangeState();
}

class _DependencyChangeState extends State<DependencyChange> {
  int _n = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _n = 1;
  }

  @override
  Widget build(BuildContext context) => Text('$_n');
}

/// A store's own `dispose`, which belongs to no component.
class CounterStore extends ChangeNotifier {
  int count = 0;

  @override
  void dispose() {
    count = 0;
    super.dispose();
  }
}

class StoreUser extends StatefulWidget {
  const StoreUser({super.key});

  @override
  State<StoreUser> createState() => _StoreUserState();
}

class _StoreUserState extends State<StoreUser> {
  final CounterStore _store = CounterStore();

  @override
  Widget build(BuildContext context) => Text('${_store.count}');
}

/// `deactivate` runs when the element leaves the tree, which React has no event for (it is not `dispose`).
class Leaving extends StatefulWidget {
  const Leaving({super.key});

  @override
  State<Leaving> createState() => _LeavingState();
}

class _LeavingState extends State<Leaving> {
  int _n = 0;

  @override
  void deactivate() {
    _n = 1;
    super.deactivate();
  }

  @override
  Widget build(BuildContext context) => Text('$_n');
}
