import 'package:flutter/material.dart';

import 'constants.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4)),
        ),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(body: Statics());
}

class Statics extends StatelessWidget {
  const Statics({super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(Spacing.md),
        child: Column(
          children: [
            Text(
              '> ${Spacing.xs} ${Spacing.md} ${Spacing.label} ${Spacing.steps.join(',')}',
            ),
            Text(
              '> $kMax $kName $kScale ${Spacing.wait.inSeconds} ${Spacing.doubled}',
            ),
            Text('> ${Limits.rows} ${Limits.cells}'),
          ],
        ),
      );
}
