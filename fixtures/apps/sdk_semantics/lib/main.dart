import 'package:flutter/material.dart';

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
  Widget build(BuildContext context) => const Scaffold(
        body: SingleChildScrollView(
          child: Column(
            children: [
              StringOps(),
              NumOps(),
              SwitchOps(),
              IncrementOps(),
              CallHost(),
              FutureOps(),
              NullChain(),
              StaleHost(),
            ],
          ),
        ),
      );
}

class StringOps extends StatefulWidget {
  const StringOps({super.key});

  @override
  State<StringOps> createState() => _StringOpsState();
}

class _StringOpsState extends State<StringOps> {
  String _s = '';

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('empty'),
            onPressed: () {
              setState(() {
                _s = '';
              });
            },
          ),
          ElevatedButton(
            child: const Text('ab'),
            onPressed: () {
              setState(() {
                _s = 'ab';
              });
            },
          ),
          ElevatedButton(
            child: const Text('xay'),
            onPressed: () {
              setState(() {
                _s = 'xay';
              });
            },
          ),
          ElevatedButton(
            child: const Text('dollar'),
            onPressed: () {
              setState(() {
                _s = r'a$b';
              });
            },
          ),
          Text('> ${_s.isEmpty} ${_s.isNotEmpty} ${_s.length}'),
          Text(
            '> ${_s.contains('a')} ${_s.padLeft(5, '*')} ${_s.padRight(4, '-')} ${_s.padLeft(4)} ${_s.padLeft(6, 'ab')}',
          ),
          Text(
            '> ${_s.toUpperCase()} ${_s.startsWith('a')} ${_s.endsWith('b')} ${_s.indexOf('a')} ${_s.lastIndexOf('a')}',
          ),
          Text(
            '> ${_s.replaceAll('a', r'$&$&')} ${_s.replaceFirst('a', 'Z')} ${_s * 2} [${_s * 0}]',
          ),
          Text('> ${_s.isEmpty ? 'required' : 'ok'}'),
          Text(
            '> ${_s.split('a').length} [${_s.trim()}] ${_s.length >= 2 ? _s.substring(1) : 'short'} ${_s.isNotEmpty ? _s.codeUnitAt(0) : -1}',
          ),
        ],
      );
}

class NumOps extends StatefulWidget {
  const NumOps({super.key});

  @override
  State<NumOps> createState() => _NumOpsState();
}

class _NumOpsState extends State<NumOps> {
  int _n = 3;
  double _d = 2.5;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('inc'),
            onPressed: () {
              setState(() {
                _n++;
              });
            },
          ),
          ElevatedButton(
            child: const Text('negate'),
            onPressed: () {
              setState(() {
                _n = -_n;
                _d = -_d;
              });
            },
          ),
          ElevatedButton(
            child: const Text('negzero'),
            onPressed: () {
              setState(() {
                _d = -0.0;
              });
            },
          ),
          Text(
            '> ${_n.isEven} ${_n.isOdd} ${_n.isNegative} ${_d.isNegative} ${_d.isFinite} ${_d.isNaN}',
          ),
        ],
      );
}

enum Shade { light, mid, dark }

class SwitchOps extends StatefulWidget {
  const SwitchOps({super.key});

  @override
  State<SwitchOps> createState() => _SwitchOpsState();
}

class _SwitchOpsState extends State<SwitchOps> {
  int _k = 0;
  Shade _shade = Shade.light;
  String _mode = 'a';
  String _out = '';

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('next'),
            onPressed: () {
              setState(() {
                _k = _k + 1;
                _shade = _shade == Shade.light
                    ? Shade.mid
                    : (_shade == Shade.mid ? Shade.dark : Shade.light);
                _mode = _mode == 'a' ? 'b' : (_mode == 'b' ? 'c' : 'a');
                String out = '';
                switch (_k) {
                  case 0:
                    out = 'zero';
                    break;
                  case 1:
                  case 2:
                    out = 'small';
                    break;
                  case 3:
                    out = 'three';
                    break;
                  default:
                    out = 'many';
                }
                switch (_mode) {
                  case 'a':
                    out = '$out/A';
                    break;
                  case 'b':
                    out = '$out/B';
                    break;
                  default:
                    out = '$out/other';
                }
                switch (_shade) {
                  case Shade.light:
                    out = '$out/L';
                    break;
                  case Shade.mid:
                    out = '$out/M';
                    break;
                  case Shade.dark:
                    out = '$out/D';
                    break;
                }
                _out = out;
              });
            },
          ),
          Text('> switch $_k $_out'),
          Text('> enum ${_shade.name} $_shade'),
        ],
      );
}

class IncrementOps extends StatefulWidget {
  const IncrementOps({super.key});

  @override
  State<IncrementOps> createState() => _IncrementOpsState();
}

class _IncrementOpsState extends State<IncrementOps> {
  int _a = 1;
  int _b = 2;
  int _r = 0;
  int _w = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('expr'),
            onPressed: () {
              setState(() {
                _r = _a++ + ++_b;
              });
            },
          ),
          ElevatedButton(
            child: const Text('loop'),
            onPressed: () {
              setState(() {
                int w = 0;
                while (true) {
                  if (++w > 4) {
                    break;
                  }
                }
                _w = w;
              });
            },
          ),
          ElevatedButton(
            child: const Text('chain'),
            onPressed: () {
              setState(() {
                _a = _b = 7;
              });
            },
          ),
          Text('> inc a=$_a b=$_b r=$_r w=$_w'),
        ],
      );
}

class Picker extends StatelessWidget {
  const Picker({super.key, required this.fmt, this.onPick});

  final int Function(int) fmt;
  final ValueChanged<int>? onPick;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Text('> fmt ${fmt.call(4)} ${fmt(5)}'),
          ElevatedButton(
            child: const Text('pick'),
            onPressed: () {
              onPick?.call(3);
            },
          ),
        ],
      );
}

class CallHost extends StatefulWidget {
  const CallHost({super.key});

  @override
  State<CallHost> createState() => _CallHostState();
}

class _CallHostState extends State<CallHost> {
  int _picked = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Text('> picked $_picked'),
          Picker(
            fmt: (x) => x * 2,
            onPick: (v) {
              setState(() {
                _picked = _picked + v;
              });
            },
          ),
        ],
      );
}

class FutureOps extends StatefulWidget {
  const FutureOps({super.key});

  @override
  State<FutureOps> createState() => _FutureOpsState();
}

class _FutureOpsState extends State<FutureOps> {
  String _status = 'idle';

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('run'),
            onPressed: () {
              setState(() {
                _status = 'running';
              });
              Future.delayed(const Duration(milliseconds: 5)).whenComplete(() {
                setState(() {
                  _status = 'completed';
                });
              });
            },
          ),
          Text('> future $_status'),
        ],
      );
}

class Chain extends StatefulWidget {
  const Chain({super.key, this.items});

  final List<String>? items;

  @override
  State<Chain> createState() => _ChainState();
}

class _ChainState extends State<Chain> {
  @override
  Widget build(BuildContext context) =>
      Text('> chain ${widget.items?.length} ${widget.items?.join('+')}');
}

class NullChain extends StatelessWidget {
  const NullChain({super.key});

  @override
  Widget build(BuildContext context) => const Column(
        children: [
          Chain(),
          Chain(items: ['x', 'y']),
        ],
      );
}

/// A handler that captures a prop reads several signals it has just written. Each read must see the write before it.
class StaleProbe extends StatefulWidget {
  const StaleProbe({super.key, required this.step});

  final int step;

  @override
  State<StaleProbe> createState() => _StaleProbeState();
}

class _StaleProbeState extends State<StaleProbe> {
  int _a = 0;
  int _b = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('twice'),
            onPressed: () {
              setState(() {
                _a = _a + widget.step;
                _a = _a + widget.step;
                _b = _a * 2;
              });
            },
          ),
          Text('> stale a=$_a b=$_b'),
        ],
      );
}

class StaleHost extends StatelessWidget {
  const StaleHost({super.key});

  @override
  Widget build(BuildContext context) => const StaleProbe(step: 5);
}
