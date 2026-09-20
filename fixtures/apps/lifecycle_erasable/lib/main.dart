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
          SuperOnly(),
          ControllerDispose(),
        ]),
      );
}

/// Only `super.initState()`: a framework no-op, nothing to lower.
class SuperOnly extends StatefulWidget {
  const SuperOnly({super.key});

  @override
  State<SuperOnly> createState() => _SuperOnlyState();
}

class _SuperOnlyState extends State<SuperOnly> {
  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) => const Text('hi');
}

/// A framework controller disposing itself: the runtime kit owns its lifetime.
class ControllerDispose extends StatefulWidget {
  const ControllerDispose({super.key});

  @override
  State<ControllerDispose> createState() => _ControllerDisposeState();
}

class _ControllerDisposeState extends State<ControllerDispose> {
  final TextEditingController _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(controller: _c);
}
