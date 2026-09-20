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
          RuntimeShift(),
          RuntimeMask(),
          RuntimeNot(),
          UnsafeFold(),
        ]),
      );
}

/// Shift of a runtime int.
class RuntimeShift extends StatefulWidget {
  const RuntimeShift({super.key});

  @override
  State<RuntimeShift> createState() => _RuntimeShiftState();
}

class _RuntimeShiftState extends State<RuntimeShift> {
  int _n = 1;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = _n << 40;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// Mask of a runtime int.
class RuntimeMask extends StatefulWidget {
  const RuntimeMask({super.key});

  @override
  State<RuntimeMask> createState() => _RuntimeMaskState();
}

class _RuntimeMaskState extends State<RuntimeMask> {
  int _n = 4294967295;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = _n & 4278190080;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// Unary ~ of a runtime int.
class RuntimeNot extends StatefulWidget {
  const RuntimeNot({super.key});

  @override
  State<RuntimeNot> createState() => _RuntimeNotState();
}

class _RuntimeNotState extends State<RuntimeNot> {
  int _n = 5;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = ~_n;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// A constant whose exact 64-bit result is not a safe integer is not folded.
class UnsafeFold extends StatefulWidget {
  const UnsafeFold({super.key});

  @override
  State<UnsafeFold> createState() => _UnsafeFoldState();
}

class _UnsafeFoldState extends State<UnsafeFold> {
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
