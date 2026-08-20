import 'package:cross_package_ui/greeting_card.dart';
import 'package:flutter/material.dart';

void main() {
  runApp(const CrossPackageApp());
}

class CrossPackageApp extends StatelessWidget {
  const CrossPackageApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cross Package')),
      body: const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            GreetingCard(name: 'Ada'),
          ],
        ),
      ),
    );
  }
}
