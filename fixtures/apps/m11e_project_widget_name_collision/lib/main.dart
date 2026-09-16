import 'package:flutter/material.dart';

import 'label_a.dart' as a;
import 'label_b.dart' as b;

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
      );
}

/// Two DIFFERENT classes, both named `Label`, declared in different files, composed side by side.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: const [
          a.Label(),
          b.Label(),
        ]),
      );
}
