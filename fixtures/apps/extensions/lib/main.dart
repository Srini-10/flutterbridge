import 'package:flutter/material.dart';

import 'ext.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Uses()));
}

class Uses extends StatelessWidget {
  const Uses({super.key});

  @override
  Widget build(BuildContext context) => Text('> ${use()}');
}
