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
        children: [ListSection(), LifecycleSection(), IntSection()],
      ),
    ),
  );
}

// ---- collections: mutated in place, shared with a child by prop ---------------------------------------------------

class Badge extends StatelessWidget {
  const Badge({
    super.key,
    required this.items,
    this.title = 'items',
    this.onAdd,
  });

  final List<int> items;
  final String title;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text('child $title: ${items.join(',')}'),
      ElevatedButton(
        child: const Text('child add'),
        onPressed: () {
          items.add(items.length + 100);
          onAdd!();
        },
      ),
    ],
  );
}

class ListSection extends StatefulWidget {
  const ListSection({super.key});

  @override
  State<ListSection> createState() => _ListSectionState();
}

class _ListSectionState extends State<ListSection> {
  final List<int> _items = <int>[3, 1, 2];
  final Map<String, int> _counts = <String, int>{};

  @override
  Widget build(BuildContext context) => Column(
    children: [
      ElevatedButton(
        child: const Text('add'),
        onPressed: () {
          setState(() {
            _items.add(_items.length);
            _counts['adds'] = (_counts['adds'] ?? 0) + 1;
          });
        },
      ),
      ElevatedButton(
        child: const Text('sort'),
        onPressed: () {
          setState(() {
            _items.sort();
          });
        },
      ),
      ElevatedButton(
        child: const Text('remove first'),
        onPressed: () {
          setState(() {
            _items.removeAt(0);
          });
        },
      ),
      Text('parent: ${_items.join(',')} adds=${_counts['adds'] ?? 0}'),
      Badge(
        items: _items,
        onAdd: () {
          setState(() {});
        },
      ),
    ],
  );
}

// ---- lifecycle: initState / dispose ---------------------------------------------------------------------------------

class Probe extends StatefulWidget {
  const Probe({super.key, required this.log});

  final List<String> log;

  @override
  State<Probe> createState() => _ProbeState();
}

class _ProbeState extends State<Probe> {
  int _n = 1;

  @override
  void initState() {
    super.initState();
    _n = _n + 41;
    widget.log.add('init');
  }

  @override
  void dispose() {
    widget.log.add('dispose');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Text('probe n=$_n');
}

class LifecycleSection extends StatefulWidget {
  const LifecycleSection({super.key});

  @override
  State<LifecycleSection> createState() => _LifecycleSectionState();
}

class _LifecycleSectionState extends State<LifecycleSection> {
  bool _show = true;
  String _shown = '';
  final List<String> _log = <String>[];

  @override
  Widget build(BuildContext context) => Column(
    children: [
      ElevatedButton(
        child: const Text('toggle probe'),
        onPressed: () {
          setState(() {
            _show = !_show;
          });
        },
      ),
      ElevatedButton(
        child: const Text('show log'),
        onPressed: () {
          setState(() {
            _shown = _log.join(',');
          });
        },
      ),
      Text('log: $_shown'),
      if (_show) Probe(log: _log),
    ],
  );
}

// ---- integers: exact or loud ------------------------------------------------------------------------------------------

class IntSection extends StatefulWidget {
  const IntSection({super.key});

  @override
  State<IntSection> createState() => _IntSectionState();
}

class _IntSectionState extends State<IntSection> {
  int _n = 1;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      ElevatedButton(
        child: const Text('shift'),
        onPressed: () {
          setState(() {
            _n = _n << 20;
          });
        },
      ),
      ElevatedButton(
        child: const Text('mod'),
        onPressed: () {
          setState(() {
            _n = (_n - 5) % 7;
          });
        },
      ),
      Text('int n=$_n'),
    ],
  );
}
