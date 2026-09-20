import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

int hits = 0;

class Registry {
  static int created = 0;
}

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
  Widget build(BuildContext context) => Scaffold(body: Column(children: [Text('$hits'), Text('${Registry.created}')]));
}
