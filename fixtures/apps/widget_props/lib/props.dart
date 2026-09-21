import 'package:flutter/material.dart';

/// Three widget-valued parameters: one required, two optional lists.
class Bar extends StatelessWidget {
  const Bar({super.key, required this.header, this.actions, this.leading = const <Widget>[]});

  final Widget header;
  final List<Widget>? actions;
  final List<Widget> leading;

  @override
  Widget build(BuildContext context) {
    return Row(children: [header, ...leading, ...?actions]);
  }
}

/// A nullable widget and a list read as values.
class Card2 extends StatelessWidget {
  const Card2({super.key, this.title, this.items = const <Widget>[]});

  final Widget? title;
  final List<Widget> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> title=${title == null ? 'none' : 'some'} items=${items.length}'),
        if (title != null) title!,
        ...items,
      ],
    );
  }
}

class Props extends StatefulWidget {
  const Props({super.key});

  @override
  State<Props> createState() => _PropsState();
}

class _PropsState extends State<Props> {
  bool extra = false;
  int n = 2;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton(onPressed: () => setState(() => extra = !extra), child: const Text('toggle')),
        ElevatedButton(onPressed: () => setState(() => n++), child: const Text('more')),
        Bar(
          header: const Text('> H'),
          leading: [const Text('> L1'), if (extra) const Text('> L2')],
          actions: [for (int i = 0; i < n; i++) Text('> A$i')],
        ),
        const Bar(header: Text('> H2')),
        Card2(title: extra ? const Text('> T') : null, items: [const Text('> i1'), Text('> i2 $n')]),
        const Card2(),
      ],
    );
  }
}
