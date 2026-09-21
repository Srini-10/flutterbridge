import 'package:flutter/material.dart';

class Service {
  const Service(this.name);

  final String name;

  String hello() => 'hi $name';
}

class Shapes extends StatefulWidget {
  const Shapes({super.key, required this.title, this.service});

  final String title;
  final Service? service;

  @override
  State<Shapes> createState() => _ShapesState();
}

class _ShapesState extends State<Shapes> {
  final int base = 10;
  final Service plain = const Service('const');
  final Service made = Service('made');
  late final Service derived = widget.service ?? Service(widget.title);
  late final String label = 'L${widget.title}';
  // Named like the widget's own `title`: a bare `title` is this one, `widget.title` the widget's.
  String title = 'state-title';
  int steps = 0;
  int seen = 0;
  String log = 'idle';

  /// Runs a body with an arrow-bodied setState before the statements that follow it — all of which must still run.
  Future<void> run(Future<String> Function() body) async {
    setState(() => log = 'loading');
    seen = steps;
    try {
      final String result = await body();
      setState(() => log = result);
    } catch (e) {
      setState(() => log = 'failed');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> base=$base ${plain.hello()} ${made.hello()} ${derived.hello()} $label $title/${widget.title} steps=$steps seen=$seen log=$log'),
        ElevatedButton(
          onPressed: () {
            setState(() => steps = steps + 1);
            setState(() => title = '$title!');
          },
          child: const Text('step'),
        ),
        ElevatedButton(
          onPressed: () => run(() async {
            await Future<void>.delayed(const Duration(milliseconds: 10));
            return 'done ${derived.hello()}';
          }),
          child: const Text('run'),
        ),
        ElevatedButton(
          onPressed: () => run(() async {
            throw StateError('nope');
          }),
          child: const Text('fail'),
        ),
      ],
    );
  }
}

/// A host with no parameters (the oracle mounts components with none).
class ShapesHost extends StatelessWidget {
  const ShapesHost({super.key});

  @override
  Widget build(BuildContext context) => const Shapes(title: 'Home');
}
