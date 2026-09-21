import 'package:flutter/material.dart';

enum Kind { constructor, valueOf, plain }

class Box {
  Box(this.ctor, this.prototype);

  final int ctor;
  final String prototype;

  @override
  String toString() => 'Box($ctor,$prototype)';

  int valueOf() => ctor * 2;

  bool hasOwnProperty(String name) => name == prototype;
}

String toLocaleString(int length) => 'L$length';

class Names extends StatefulWidget {
  const Names({super.key, required this.prototype, this.length = 3});

  final String prototype;
  final int length;

  @override
  State<Names> createState() => _NamesState();
}

class _NamesState extends State<Names> {
  int valueOf = 1;
  String hasOwnProperty = 'h';
  final Map<String, int> counts = <String, int>{'constructor': 1, 'toString': 2, '__proto__': 3};
  Kind kind = Kind.constructor;
  Box box = Box(4, 'p');

  String describe(String toString, int isPrototypeOf) => '$toString-$isPrototypeOf';

  @override
  Widget build(BuildContext context) {
    final String propertyIsEnumerable = 'pie';
    return Column(
      children: [
        Text('> ${widget.prototype} ${widget.length} $valueOf $hasOwnProperty ${counts['constructor']} ${counts['toString']} ${counts['__proto__']} ${counts.containsKey('valueOf')} ${kind.name} $box ${box.valueOf()} ${box.hasOwnProperty('p')} ${toLocaleString(widget.length)} ${describe('a', 2)} $propertyIsEnumerable ${counts.toString()} ${<int>[1, 2].toString()}'),
        ElevatedButton(
          onPressed: () => setState(() {
            valueOf++;
            hasOwnProperty += 'x';
            counts['constructor'] = counts['constructor']! + 10;
            counts['valueOf'] = 7;
            kind = Kind.valueOf;
            box = Box(box.ctor + 1, 'q');
          }),
          child: const Text('go'),
        ),
      ],
    );
  }
}

class NamesHost extends StatelessWidget {
  const NamesHost({super.key});

  @override
  Widget build(BuildContext context) => const Names(prototype: 'C');
}
