import 'package:flutter/material.dart';

void main() {
  runApp(const StructuredBuildApp());
}

class StructuredBuildApp extends StatelessWidget {
  const StructuredBuildApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
      home: const GreetingScreen(),
    );
  }
}

class GreetingScreen extends StatefulWidget {
  const GreetingScreen({super.key});

  @override
  State<GreetingScreen> createState() => _GreetingScreenState();
}

class _GreetingScreenState extends State<GreetingScreen> {
  bool _loading = true;
  bool _greeted = false;

  void _finishLoading() {
    setState(() {
      _loading = false;
    });
  }

  void _greet() {
    setState(() {
      _greeted = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final greeting = _greeted ? 'Hello again!' : 'Welcome';
    if (_loading) {
      return Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const CircularProgressIndicator(),
              ElevatedButton(onPressed: _finishLoading, child: const Text('Continue')),
            ],
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Structured Build')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(greeting),
            ElevatedButton(onPressed: _greet, child: const Text('Greet')),
          ],
        ),
      ),
    );
  }
}
