import 'package:flutter/material.dart';

import 'dto.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Dtos()));
}

String show(Load l) => switch (l) {
      Idle() => 'idle',
      Loading(:final int pct) => 'loading $pct',
      Done(:final Dto value) => 'done ${value.name}/${value.age}',
    };

class Dtos extends StatelessWidget {
  const Dtos({super.key});

  @override
  Widget build(BuildContext context) {
    const Dto a = Dto(name: 'ada', age: 36);
    final Dto b = a.copyWith(age: 37);
    final Dto c = a.copyWith(name: 'bob', age: 1);
    final Dto d = a.copyWith();
    return Column(
      children: [
        Text('> $a | $b | $c | $d'),
        Text('> ${a == d} ${a == b} ${a.hashCode == d.hashCode} ${identical(a, d)}'),
        Text('> ${show(const Idle())} | ${show(const Loading(40))} | ${show(Done(b))}'),
      ],
    );
  }
}

class Editor extends StatefulWidget {
  const Editor({super.key});

  @override
  State<Editor> createState() => _EditorState();
}

class _EditorState extends State<Editor> {
  Dto dto = const Dto(name: 'x', age: 1);
  Load load = const Idle();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${dto.name} ${dto.age} ${show(load)}'),
        ElevatedButton(
          onPressed: () => setState(() {
            dto = dto.copyWith(age: dto.age + 1);
            load = Loading(dto.age * 10);
          }),
          child: const Text('older'),
        ),
        ElevatedButton(
          onPressed: () => setState(() {
            dto = dto.copyWith(name: '${dto.name}!');
            load = Done(dto);
          }),
          child: const Text('shout'),
        ),
      ],
    );
  }
}
