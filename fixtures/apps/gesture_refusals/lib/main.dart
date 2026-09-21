import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
    home: const Scaffold(body: Refusals()),
  );
}

class Refusals extends StatelessWidget {
  const Refusals({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        GestureDetector(onPanUpdate: (DragUpdateDetails d) {}, child: const Text('pan')),
        GestureDetector(onForcePressStart: (ForcePressDetails d) {}, child: const Text('force')),
        GestureDetector(onSecondaryTap: () {}, child: const Text('secondary')),
        InkWell(onTap: () {}, onHighlightChanged: (bool h) {}, child: const Text('highlight')),
        LayoutBuilder(
          builder: (BuildContext context, BoxConstraints c) => Text('min ${c.minWidth} tight ${c.isTight}'),
        ),
      ],
    );
  }
}
