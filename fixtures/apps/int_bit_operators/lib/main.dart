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
          RuntimeShift(),
          RuntimeMask(),
          RuntimeNot(),
          RuntimeArithmetic(),
          RuntimeModulo(),
          RuntimeOverflow(),
          DoubleModulo(),
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

/// A shift of a runtime int is exact 64-bit: 1 << 40 is 1099511627776 (JavaScript: 256).
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

/// A mask of a runtime int is exact: 4294967295 & 4278190080 is 4278190080 (JavaScript: -16777216).
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
                _n &= 4278190080;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// ~ of a runtime int.
class RuntimeNot extends StatefulWidget {
  const RuntimeNot({super.key});

  @override
  State<RuntimeNot> createState() => _RuntimeNotState();
}

class _RuntimeNotState extends State<RuntimeNot> {
  int _n = 4294967296;

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

/// Ordinary int arithmetic through the checked helpers: a counter, a product, a compound assignment.
class RuntimeArithmetic extends StatefulWidget {
  const RuntimeArithmetic({super.key});

  @override
  State<RuntimeArithmetic> createState() => _RuntimeArithmeticState();
}

class _RuntimeArithmeticState extends State<RuntimeArithmetic> {
  int _n = 6;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = _n * 7;
                _n += 1;
                _n++;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// % with a negative divisor and ~/ toward zero: 7 % -3 is 1 (the old formula gave -2).
class RuntimeModulo extends StatefulWidget {
  const RuntimeModulo({super.key});

  @override
  State<RuntimeModulo> createState() => _RuntimeModuloState();
}

class _RuntimeModuloState extends State<RuntimeModulo> {
  int _a = 7;
  int _b = -3;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _a = _a % _b;
                _b = _b ~/ 2;
              });
            },
            child: const Text('go'),
          ),
          Text('${_a} ${_b}'),
        ],
      );
}

/// Leaving the int domain at runtime is loud: 3037000499 * 3037000499 throws BRG4011 instead of rendering the
/// rounded value JavaScript would produce (9223372030926249000; Dart's exact int is 9223372030926249001).
class RuntimeOverflow extends StatefulWidget {
  const RuntimeOverflow({super.key});

  @override
  State<RuntimeOverflow> createState() => _RuntimeOverflowState();
}

class _RuntimeOverflowState extends State<RuntimeOverflow> {
  int _n = 3037000499;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = _n * _n;
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// `%` and `~/` on doubles: 7.5 % -2 is 1.5 (non-negative), and 7.5 ~/ 2 is 3 (an int, truncated toward zero).
class DoubleModulo extends StatefulWidget {
  const DoubleModulo({super.key});

  @override
  State<DoubleModulo> createState() => _DoubleModuloState();
}

class _DoubleModuloState extends State<DoubleModulo> {
  double _d = 7.5;
  int _q = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _q = _d ~/ 2;
                _d = _d % -2;
              });
            },
            child: const Text('go'),
          ),
          Text('$_d $_q'),
        ],
      );
}
