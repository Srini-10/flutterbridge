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
          FoldedShift(),
          FoldedMask(),
          FoldedNegative(),
          BoolAnd(),
          BoolXor(),
        ]),
      );
}

/// 1 << 40 folds to its exact 64-bit value (JavaScript would print 256).
class FoldedShift extends StatefulWidget {
  const FoldedShift({super.key});

  @override
  State<FoldedShift> createState() => _FoldedShiftState();
}

class _FoldedShiftState extends State<FoldedShift> {
  int _n = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = 1 << 40;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// 0xFFFFFFFF & 0xFFFF0000 folds exactly (JavaScript would print -65536).
class FoldedMask extends StatefulWidget {
  const FoldedMask({super.key});

  @override
  State<FoldedMask> createState() => _FoldedMaskState();
}

class _FoldedMaskState extends State<FoldedMask> {
  int _n = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = 0xFFFFFFFF & 0xFFFF0000;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// A negative folded result is parenthesised.
class FoldedNegative extends StatefulWidget {
  const FoldedNegative({super.key});

  @override
  State<FoldedNegative> createState() => _FoldedNegativeState();
}

class _FoldedNegativeState extends State<FoldedNegative> {
  int _n = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = -8 >> 1;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// bool & is non-short-circuit logic returning a bool (JavaScript returns 0).
class BoolAnd extends StatefulWidget {
  const BoolAnd({super.key});

  @override
  State<BoolAnd> createState() => _BoolAndState();
}

class _BoolAndState extends State<BoolAnd> {
  bool _a = true;
  bool _b = false;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _b = !_b;
              });
            },
            child: const Text('go'),
          ),
          Text('${_a & _b}'),
        ],
      );
}

/// bool ^ returns a bool.
class BoolXor extends StatefulWidget {
  const BoolXor({super.key});

  @override
  State<BoolXor> createState() => _BoolXorState();
}

class _BoolXorState extends State<BoolXor> {
  bool _a = true;
  bool _b = true;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _b = !_b;
              });
            },
            child: const Text('go'),
          ),
          Text('${_a ^ _b}'),
        ],
      );
}
