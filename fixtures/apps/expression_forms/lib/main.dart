import 'package:flutter/material.dart';

import 'forms.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Forms()));
}

class Forms extends StatelessWidget {
  const Forms({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${tryNeed(3)} ${tryNeed(null)} ${rethrown()}'),
        Text('> ${describeAll(<Map<String, Object?>>[{'id': 1}, {'id': 2, 'label': 'b'}])} ${identity<int>(7)} ${(identity<String>)('s')}'),
        Text('> ${asDouble(<String, Object?>{'k': 3}, 'k')} ${asDouble(<String, Object?>{}, 'k')} ${once()}'),
        Text('> ${makeBuffer().label} ${makeBuffer().total} ${makeBuffer().items.length}'),
        Text('> ${lists(true, <int>[2, 3])} | ${lists(false, <int>[])}'),
        Text('> ${sets(<int>[3, 4])} ${maps(true, <String, int>{'c': 3})} ${maps(false, <String, int>{})}'),
        Text('> ${adjacent(4)} ${lists(true, <int>[1], <int>[7, 8])}'),
        Text('> ${castInt(3)} ${castInt('x')} ${castInt(null)} ${castNullable(null)} ${castNullable('s')} ${castNullable(4)} ${castList(<int>[1, 2])} ${castList('no')}'),
        Text('> ${castDto(Dto(3))} ${castDto(null)} ${castDto('s')}'),
        Text('> ${roundings(2.5)} ${roundings(-2.5)} ${roundings(-0.4)} ${roundings(3.7)} ${roundings(-3.7)} ${roundings(0.5)}'),
        Text('> ${(7.5).clamp(0, 5).toDouble()} ${(-3).clamp(0, 5).toInt()} ${(2.5).clamp(0, 5).toDouble()} ${(-4.5).abs()} ${(12).abs()}'),
      ],
    );
  }
}

class Cascades extends StatefulWidget {
  const Cascades({super.key});

  @override
  State<Cascades> createState() => _CascadesState();
}

class _CascadesState extends State<Cascades> {
  Buffer buffer = Buffer();
  bool flag = false;

  void step() {
    setState(() {
      buffer = Buffer()
        ..add(buffer.total + 1)
        ..add(10)
        ..label = 'n${buffer.items.length}';
      flag = !flag;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${buffer.total} ${buffer.label} ${lists(flag, <int>[buffer.total])}'),
        ElevatedButton(onPressed: step, child: const Text('step')),
      ],
    );
  }
}
