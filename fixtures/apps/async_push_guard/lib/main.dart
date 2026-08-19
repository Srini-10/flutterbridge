import 'package:flutter/material.dart';

import 'home_screen.dart';

void main() {
  runApp(const AsyncPushGuardApp());
}

class AsyncPushGuardApp extends StatelessWidget {
  const AsyncPushGuardApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        ),
        home: const HomeScreen(),
      );
}
