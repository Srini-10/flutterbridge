import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class Box {
  Box(this.constructor);

  final int constructor;

  @override
  String toString() => 'Box($constructor)';
}

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
    home: const Scaffold(body: Home()),
  );
}

class Home extends StatelessWidget {
  const Home({super.key});

  @override
  Widget build(BuildContext context) => Text('${Box(1)}');
}
