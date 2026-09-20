import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(
            colorScheme:
                ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: SingleChildScrollView(
          child: Column(children: [
            LifecycleHost(),
            UpdateHost(),
            OrderHost(),
            AsyncHost(),
            InitOnly(),
          ]),
        ),
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// initState / didUpdateWidget / dispose, observed through a log the host owns.
// ---------------------------------------------------------------------------------------------------------------------

class Probe extends StatefulWidget {
  const Probe(
      {super.key, required this.name, required this.log, required this.tag});

  final String name;
  final List<String> log;
  final String tag;

  @override
  State<Probe> createState() => _ProbeState();
}

class _ProbeState extends State<Probe> {
  int _a = 5;
  int _b = 0;
  String _seen = 'none';

  @override
  void initState() {
    super.initState();
    // A leading run of pure assignments: Flutter runs it before the first build, so the first frame has it.
    _b = _a + 1;
    _seen = 'tag ${widget.tag}';
    // Behaviour: it must run, once, in order.
    widget.log.add('init ${widget.name}');
    // After it, so it cannot move before the log entry.
    _a = 100;
  }

  @override
  void dispose() {
    widget.log.add('dispose ${widget.name}');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Text('> ${widget.name} a=$_a b=$_b $_seen tag=${widget.tag}'),
          ElevatedButton(
            child: Text('bump ${widget.name}'),
            onPressed: () {
              setState(() {
                _b = _b + 10;
              });
            },
          ),
        ],
      );
}

class LifecycleHost extends StatefulWidget {
  const LifecycleHost({super.key});

  @override
  State<LifecycleHost> createState() => _LifecycleHostState();
}

class _LifecycleHostState extends State<LifecycleHost> {
  bool _show = true;
  String _tag = 'a';
  String _shown = '';
  final List<String> _log = <String>[];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('hide'),
            onPressed: () {
              setState(() {
                _show = false;
              });
            },
          ),
          ElevatedButton(
            child: const Text('show'),
            onPressed: () {
              setState(() {
                _show = true;
              });
            },
          ),
          ElevatedButton(
            child: const Text('retag'),
            onPressed: () {
              setState(() {
                _tag = _tag == 'a' ? 'b' : 'a';
              });
            },
          ),
          ElevatedButton(
            child: const Text('rebuild'),
            onPressed: () {
              setState(() {});
            },
          ),
          // The log is read only here, so what is shown is the same in Flutter (which does not rebuild when a child
          // appends to it) and in the generated component (which does): only this button changes `_shown`.
          ElevatedButton(
            child: const Text('refresh'),
            onPressed: () {
              setState(() {
                _shown = _log.join(' | ');
              });
            },
          ),
          Text('> log: $_shown'),
          if (_show) Probe(name: 'p1', log: _log, tag: _tag),
        ],
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// didUpdateWidget: called when the parent hands the State a new widget — every parent rebuild, equal or not — and
// never for the State's own setState. It writes only its own state, so the count is comparable with Flutter's.
// ---------------------------------------------------------------------------------------------------------------------

class UpdateProbe extends StatefulWidget {
  const UpdateProbe({super.key, required this.tag});

  final String tag;

  @override
  State<UpdateProbe> createState() => _UpdateProbeState();
}

class _UpdateProbeState extends State<UpdateProbe> {
  int _updates = 0;
  String _last = 'none';
  int _own = 0;

  @override
  void didUpdateWidget(UpdateProbe oldWidget) {
    super.didUpdateWidget(oldWidget);
    _updates = _updates + 1;
    _last = '${oldWidget.tag}>${widget.tag}';
  }

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Text('> upd n=$_updates last=$_last tag=${widget.tag} own=$_own'),
          ElevatedButton(
            child: const Text('ownSetState'),
            onPressed: () {
              setState(() {
                _own = _own + 1;
              });
            },
          ),
        ],
      );
}

class UpdateHost extends StatefulWidget {
  const UpdateHost({super.key});

  @override
  State<UpdateHost> createState() => _UpdateHostState();
}

class _UpdateHostState extends State<UpdateHost> {
  String _tag = 'a';
  bool _show = true;
  int _tick = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('retagU'),
            onPressed: () {
              setState(() {
                _tag = _tag == 'a' ? 'b' : 'a';
              });
            },
          ),
          ElevatedButton(
            child: const Text('rebuildU'),
            onPressed: () {
              // A rebuild that changes something in the parent but nothing the child is given.
              setState(() {
                _tick = _tick + 1;
              });
            },
          ),
          ElevatedButton(
            child: const Text('toggleU'),
            onPressed: () {
              setState(() {
                _show = !_show;
              });
            },
          ),
          Text('> tick $_tick'),
          if (_show) UpdateProbe(tag: _tag),
        ],
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// The order in which lifecycle methods of *different* components run (ADR-0052 — where React and Flutter differ).
// ---------------------------------------------------------------------------------------------------------------------

class LogNode extends StatefulWidget {
  const LogNode(
      {super.key, required this.name, required this.log, required this.nested});

  final String name;
  final List<String> log;
  final bool nested;

  @override
  State<LogNode> createState() => _LogNodeState();
}

class _LogNodeState extends State<LogNode> {
  @override
  void initState() {
    super.initState();
    widget.log.add('init ${widget.name}');
  }

  @override
  void dispose() {
    widget.log.add('dispose ${widget.name}');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(children: [
        Text('> node ${widget.name}'),
        if (widget.nested) LogNode(name: 'b', log: widget.log, nested: false),
      ]);
}

class OrderHost extends StatefulWidget {
  const OrderHost({super.key});

  @override
  State<OrderHost> createState() => _OrderHostState();
}

class _OrderHostState extends State<OrderHost> {
  bool _show = true;
  String _shown = '';
  final List<String> _log = <String>[];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('hideOrder'),
            onPressed: () {
              setState(() {
                _show = false;
              });
            },
          ),
          ElevatedButton(
            child: const Text('showOrder'),
            onPressed: () {
              setState(() {
                _show = true;
              });
            },
          ),
          ElevatedButton(
            child: const Text('refreshOrder'),
            onPressed: () {
              setState(() {
                _shown = _log.join(' | ');
              });
            },
          ),
          Text('> order: $_shown'),
          if (_show) LogNode(name: 'a', log: _log, nested: true),
          if (_show) LogNode(name: 'c', log: _log, nested: false),
        ],
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// Lifecycle + async: work started in initState that must not touch a State that has gone.
// ---------------------------------------------------------------------------------------------------------------------

class AsyncProbe extends StatefulWidget {
  const AsyncProbe({super.key});

  @override
  State<AsyncProbe> createState() => _AsyncProbeState();
}

class _AsyncProbeState extends State<AsyncProbe> {
  String _status = 'waiting';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    await Future.delayed(const Duration(milliseconds: 10));
    if (!mounted) return;
    setState(() {
      _status = 'done';
    });
  }

  @override
  Widget build(BuildContext context) => Text('> async $_status');
}

class AsyncHost extends StatefulWidget {
  const AsyncHost({super.key});

  @override
  State<AsyncHost> createState() => _AsyncHostState();
}

class _AsyncHostState extends State<AsyncHost> {
  bool _show = true;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            child: const Text('toggleAsync'),
            onPressed: () {
              setState(() {
                _show = !_show;
              });
            },
          ),
          Text('> async host ${_show ? 'shown' : 'hidden'}'),
          if (_show) const AsyncProbe(),
        ],
      );
}

// initState with nothing but pure assignments and a super call: the whole body runs before the first build.
class InitOnly extends StatefulWidget {
  const InitOnly({super.key});

  @override
  State<InitOnly> createState() => _InitOnlyState();
}

class _InitOnlyState extends State<InitOnly> {
  int _n = 0;
  String _label = '';
  List<int> _items = <int>[];

  @override
  void initState() {
    super.initState();
    _n = 5;
    _label = 'n=$_n';
    _items = <int>[_n, _n + 1];
  }

  @override
  Widget build(BuildContext context) =>
      Text('> init-only $_n $_label ${_items.join(',')}');
}
