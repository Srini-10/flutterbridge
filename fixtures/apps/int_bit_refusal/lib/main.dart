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
          ConstantShift(),
          ConstantProduct(),
          ConstantZeroDivision(),
          ConstantNegativeShift(),
        ]),
      );
}

/// 1 << 62 is exactly representable as a double but is not a safe integer: refused at build time.
class ConstantShift extends StatefulWidget {
  const ConstantShift({super.key});

  @override
  State<ConstantShift> createState() => _ConstantShiftState();
}

class _ConstantShiftState extends State<ConstantShift> {
  int _n = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = 1 << 62;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// A product that leaves the int domain: 3037000499 * 3037000499 (JavaScript would print …000).
class ConstantProduct extends StatefulWidget {
  const ConstantProduct({super.key});

  @override
  State<ConstantProduct> createState() => _ConstantProductState();
}

class _ConstantProductState extends State<ConstantProduct> {
  int _n = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = 3037000499 * 3037000499;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// A constant division by zero: Dart throws at runtime; JavaScript would produce Infinity.
class ConstantZeroDivision extends StatefulWidget {
  const ConstantZeroDivision({super.key});

  @override
  State<ConstantZeroDivision> createState() => _ConstantZeroDivisionState();
}

class _ConstantZeroDivisionState extends State<ConstantZeroDivision> {
  int _n = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = 5 ~/ 0;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// A constant shift by a negative count.
class ConstantNegativeShift extends StatefulWidget {
  const ConstantNegativeShift({super.key});

  @override
  State<ConstantNegativeShift> createState() => _ConstantNegativeShiftState();
}

class _ConstantNegativeShiftState extends State<ConstantNegativeShift> {
  int _n = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = 1 << -1;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}
