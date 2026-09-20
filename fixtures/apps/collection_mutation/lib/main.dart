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
            ListOps(),
            FinalListOps(),
            SetOps(),
            MapOps(),
            NestedOps(),
            AliasOps(),
            PropsParent(),
            CallbackCapture(),
            MultiMutation(),
            NoopMutations(),
            NoSetState(),
            ParentRebuild(),
            CollectionFor(),
            ComparatorSort(),
            ShuffleSort(),
          ]),
        ),
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// List — every mutator, on a non-final field.
// ---------------------------------------------------------------------------------------------------------------------

class ListOps extends StatefulWidget {
  const ListOps({super.key});

  @override
  State<ListOps> createState() => _ListOpsState();
}

class _ListOpsState extends State<ListOps> {
  List<int> _l = <int>[3, 1, 2];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('add'),
              onPressed: () {
                setState(() {
                  _l.add(_l.length + 10);
                });
              }),
          ElevatedButton(
              child: const Text('insert'),
              onPressed: () {
                setState(() {
                  _l.insert(0, 9);
                });
              }),
          ElevatedButton(
              child: const Text('removeAt'),
              onPressed: () {
                setState(() {
                  _l.removeAt(0);
                });
              }),
          ElevatedButton(
              child: const Text('remove'),
              onPressed: () {
                setState(() {
                  _l.remove(1);
                });
              }),
          ElevatedButton(
              child: const Text('removeLast'),
              onPressed: () {
                setState(() {
                  _l.removeLast();
                });
              }),
          ElevatedButton(
              child: const Text('clear'),
              onPressed: () {
                setState(() {
                  _l.clear();
                });
              }),
          ElevatedButton(
              child: const Text('sort'),
              onPressed: () {
                setState(() {
                  _l.sort();
                });
              }),
          ElevatedButton(
              child: const Text('assign'),
              onPressed: () {
                setState(() {
                  _l[0] = _l[0] + 5;
                });
              }),
          ElevatedButton(
              child: const Text('addAll'),
              onPressed: () {
                setState(() {
                  _l.addAll(<int>[7, 8]);
                });
              }),
          ElevatedButton(
              child: const Text('removeWhere'),
              onPressed: () {
                setState(() {
                  _l.removeWhere((x) => x > 7);
                });
              }),
          ElevatedButton(
              child: const Text('insertAll'),
              onPressed: () {
                setState(() {
                  _l.insertAll(1, <int>[4, 4]);
                });
              }),
          ElevatedButton(
              child: const Text('reset'),
              onPressed: () {
                setState(() {
                  _l = <int>[3, 1, 2];
                });
              }),
          Text('> ${_l.join(',')}'),
          Text('> len ${_l.length}'),
          Text('> first ${_l.isEmpty ? 'none' : '${_l.first}'}'),
        ],
      );
}

// A `final` field is never re-assigned, so in Dart the only way its content changes is in place.
class FinalListOps extends StatefulWidget {
  const FinalListOps({super.key});

  @override
  State<FinalListOps> createState() => _FinalListOpsState();
}

class _FinalListOpsState extends State<FinalListOps> {
  final List<int> _l = <int>[1];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('add'),
              onPressed: () {
                setState(() {
                  _l.add(_l.length + 1);
                });
              }),
          ElevatedButton(
              child: const Text('removeAt'),
              onPressed: () {
                setState(() {
                  _l.removeAt(0);
                });
              }),
          ElevatedButton(
              child: const Text('clear'),
              onPressed: () {
                setState(() {
                  _l.clear();
                });
              }),
          Text('> ${_l.join(',')}'),
        ],
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// Set and Map.
// ---------------------------------------------------------------------------------------------------------------------

class SetOps extends StatefulWidget {
  const SetOps({super.key});

  @override
  State<SetOps> createState() => _SetOpsState();
}

class _SetOpsState extends State<SetOps> {
  final Set<int> _s = <int>{1};

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('add2'),
              onPressed: () {
                setState(() {
                  _s.add(2);
                });
              }),
          ElevatedButton(
              child: const Text('add2again'),
              onPressed: () {
                setState(() {
                  _s.add(2);
                });
              }),
          ElevatedButton(
              child: const Text('remove1'),
              onPressed: () {
                setState(() {
                  _s.remove(1);
                });
              }),
          ElevatedButton(
              child: const Text('remove9'),
              onPressed: () {
                setState(() {
                  _s.remove(9);
                });
              }),
          ElevatedButton(
              child: const Text('addAll'),
              onPressed: () {
                setState(() {
                  _s.addAll(<int>[5, 2, 6]);
                });
              }),
          ElevatedButton(
              child: const Text('clear'),
              onPressed: () {
                setState(() {
                  _s.clear();
                });
              }),
          Text('> ${_s.toList().join(',')}'),
          Text('> size ${_s.length}'),
          Text('> has2 ${_s.contains(2)}'),
        ],
      );
}

class MapOps extends StatefulWidget {
  const MapOps({super.key});

  @override
  State<MapOps> createState() => _MapOpsState();
}

class _MapOpsState extends State<MapOps> {
  final Map<String, int> _m = <String, int>{};

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('setA'),
              onPressed: () {
                setState(() {
                  _m['a'] = 1;
                });
              }),
          ElevatedButton(
              child: const Text('bumpA'),
              onPressed: () {
                setState(() {
                  _m['a'] = (_m['a'] ?? 0) + 1;
                });
              }),
          ElevatedButton(
              child: const Text('setB'),
              onPressed: () {
                setState(() {
                  _m['b'] = 5;
                });
              }),
          ElevatedButton(
              child: const Text('removeA'),
              onPressed: () {
                setState(() {
                  _m.remove('a');
                });
              }),
          ElevatedButton(
              child: const Text('putIfAbsentB'),
              onPressed: () {
                setState(() {
                  _m.putIfAbsent('b', () => 99);
                });
              }),
          ElevatedButton(
              child: const Text('putIfAbsentC'),
              onPressed: () {
                setState(() {
                  _m.putIfAbsent('c', () => 7);
                });
              }),
          ElevatedButton(
              child: const Text('addAll'),
              onPressed: () {
                setState(() {
                  _m.addAll(<String, int>{'d': 1, 'a': 3});
                });
              }),
          ElevatedButton(
              child: const Text('clear'),
              onPressed: () {
                setState(() {
                  _m.clear();
                });
              }),
          Text('> ${_m.keys.join(',')}'),
          Text('> ${_m.values.join(',')}'),
          Text('> size ${_m.length}'),
          Text('> hasA ${_m.containsKey('a')}'),
          Text('> a ${_m['a'] ?? -1}'),
        ],
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// Nesting, aliases, props, callbacks.
// ---------------------------------------------------------------------------------------------------------------------

class NestedOps extends StatefulWidget {
  const NestedOps({super.key});

  @override
  State<NestedOps> createState() => _NestedOpsState();
}

class _NestedOpsState extends State<NestedOps> {
  final List<List<int>> _g = <List<int>>[
    <int>[1],
    <int>[2]
  ];
  final Map<String, List<int>> _index = <String, List<int>>{};

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton(
            child: const Text('addToFirst'),
            onPressed: () {
              setState(() {
                _g[0].add(5);
              });
            }),
        ElevatedButton(
            child: const Text('addRow'),
            onPressed: () {
              setState(() {
                _g.add(<int>[]);
              });
            }),
        ElevatedButton(
            child: const Text('addToLast'),
            onPressed: () {
              setState(() {
                _g.last.add(3);
              });
            }),
        ElevatedButton(
            child: const Text('dropFromSecond'),
            onPressed: () {
              setState(() {
                _g[1].removeAt(0);
              });
            }),
        ElevatedButton(
            child: const Text('bucketA'),
            onPressed: () {
              setState(() {
                _index.putIfAbsent('a', () => <int>[]).add(1);
              });
            }),
        ElevatedButton(
            child: const Text('bucketAagain'),
            onPressed: () {
              setState(() {
                _index.putIfAbsent('a', () => <int>[]).add(2);
              });
            }),
        ElevatedButton(
            child: const Text('cellAssign'),
            onPressed: () {
              setState(() {
                _g[0][0] = 100;
              });
            }),
        Text('> ${_g.map((r) => r.join(',')).join('|')}'),
        Text(
            '> ${_index.keys.join(',')}: ${_index.containsKey('a') ? _index['a']!.join(',') : '-'}'),
      ],
    );
  }
}

class AliasOps extends StatefulWidget {
  const AliasOps({super.key});

  @override
  State<AliasOps> createState() => _AliasOpsState();
}

class _AliasOpsState extends State<AliasOps> {
  final List<int> _l = <int>[1];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('viaLocalAlias'),
              onPressed: () {
                setState(() {
                  final alias = _l;
                  alias.add(2);
                });
              }),
          ElevatedButton(
              child: const Text('viaChainedAlias'),
              onPressed: () {
                setState(() {
                  final first = _l;
                  final second = first;
                  second.add(3);
                });
              }),
          ElevatedButton(
              child: const Text('viaCopy'),
              onPressed: () {
                setState(() {
                  final copy = _l.toList();
                  copy.add(99);
                });
              }),
          Text('> ${_l.join(',')}'),
        ],
      );
}

class PropsChild extends StatelessWidget {
  const PropsChild({super.key, required this.items, required this.onChanged});

  final List<int> items;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('childAdd'),
              onPressed: () {
                items.add(items.length + 1);
                onChanged();
              }),
          Text('> child ${items.join(',')}'),
        ],
      );
}

class PropsParent extends StatefulWidget {
  const PropsParent({super.key});

  @override
  State<PropsParent> createState() => _PropsParentState();
}

class _PropsParentState extends State<PropsParent> {
  final List<int> _items = <int>[1];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('parentAdd'),
              onPressed: () {
                setState(() {
                  _items.add(_items.length + 1);
                });
              }),
          PropsChild(
            items: _items,
            onChanged: () {
              setState(() {});
            },
          ),
          Text('> parent ${_items.join(',')}'),
        ],
      );
}

class CallbackCapture extends StatefulWidget {
  const CallbackCapture({super.key});

  @override
  State<CallbackCapture> createState() => _CallbackCaptureState();
}

class _CallbackCaptureState extends State<CallbackCapture> {
  final List<int> _l = <int>[];

  void _push() {
    setState(() {
      _l.add(_l.length);
    });
  }

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(onPressed: _push, child: const Text('push')),
          ElevatedButton(
              child: const Text('pushTwice'),
              onPressed: () {
                _push();
                _push();
              }),
          Text('> ${_l.join(',')}'),
        ],
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// Several mutations per setState; equal and no-op mutations; mutation without setState.
// ---------------------------------------------------------------------------------------------------------------------

class MultiMutation extends StatefulWidget {
  const MultiMutation({super.key});

  @override
  State<MultiMutation> createState() => _MultiMutationState();
}

class _MultiMutationState extends State<MultiMutation> {
  final List<int> _l = <int>[5];
  final Map<String, int> _m = <String, int>{};

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('many'),
              onPressed: () {
                setState(() {
                  _l.add(1);
                  _l.add(9);
                  _l.sort();
                  _l.removeAt(0);
                  _l.insert(1, 4);
                  _m['n'] = _l.length;
                });
              }),
          Text('> ${_l.join(',')}'),
          Text('> n ${_m['n'] ?? -1}'),
        ],
      );
}

class NoopMutations extends StatefulWidget {
  const NoopMutations({super.key});

  @override
  State<NoopMutations> createState() => _NoopMutationsState();
}

class _NoopMutationsState extends State<NoopMutations> {
  final List<int> _l = <int>[1, 2];
  final Set<int> _s = <int>{1};
  final Map<String, int> _m = <String, int>{'a': 1};

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('removeMissing'),
              onPressed: () {
                setState(() {
                  _l.remove(99);
                });
              }),
          ElevatedButton(
              child: const Text('addPresent'),
              onPressed: () {
                setState(() {
                  _s.add(1);
                });
              }),
          ElevatedButton(
              child: const Text('assignSame'),
              onPressed: () {
                setState(() {
                  _m['a'] = 1;
                  _l[0] = _l[0];
                });
              }),
          ElevatedButton(
              child: const Text('sortSorted'),
              onPressed: () {
                setState(() {
                  _l.sort();
                });
              }),
          ElevatedButton(
              child: const Text('emptySetState'),
              onPressed: () {
                setState(() {});
              }),
          Text('> ${_l.join(',')} ${_s.length} ${_m['a']}'),
        ],
      );
}

/// Mutation with no `setState`: Flutter does not rebuild (the change shows on the next rebuild); the generated
/// component re-renders at once. That is the documented ADR-0048 deviation — the comparison for this scenario is made
/// only after a step that does rebuild.
class NoSetState extends StatefulWidget {
  const NoSetState({super.key});

  @override
  State<NoSetState> createState() => _NoSetStateState();
}

class _NoSetStateState extends State<NoSetState> {
  final List<int> _l = <int>[1];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('silentAdd'),
              onPressed: () {
                _l.add(_l.length + 1);
              }),
          ElevatedButton(
              child: const Text('rebuild'),
              onPressed: () {
                setState(() {});
              }),
          Text('> ${_l.join(',')}'),
        ],
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// A parent rebuild keeps a child's State — and so its collection.
// ---------------------------------------------------------------------------------------------------------------------

class KeptChild extends StatefulWidget {
  const KeptChild({super.key});

  @override
  State<KeptChild> createState() => _KeptChildState();
}

class _KeptChildState extends State<KeptChild> {
  final List<int> _l = <int>[];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('childAdd'),
              onPressed: () {
                setState(() {
                  _l.add(_l.length);
                });
              }),
          Text('> kept ${_l.join(',')}'),
        ],
      );
}

class ParentRebuild extends StatefulWidget {
  const ParentRebuild({super.key});

  @override
  State<ParentRebuild> createState() => _ParentRebuildState();
}

class _ParentRebuildState extends State<ParentRebuild> {
  int _n = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('rebuildParent'),
              onPressed: () {
                setState(() {
                  _n = _n + 1;
                });
              }),
          Text('> n $_n'),
          const KeptChild(),
        ],
      );
}

// ---------------------------------------------------------------------------------------------------------------------
// A list rendered as widgets; a comparator; shuffle.
// ---------------------------------------------------------------------------------------------------------------------

class CollectionFor extends StatefulWidget {
  const CollectionFor({super.key});

  @override
  State<CollectionFor> createState() => _CollectionForState();
}

class _CollectionForState extends State<CollectionFor> {
  final List<int> _l = <int>[1, 2];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('add'),
              onPressed: () {
                setState(() {
                  _l.add(_l.length + 1);
                });
              }),
          ElevatedButton(
              child: const Text('removeFirst'),
              onPressed: () {
                setState(() {
                  _l.removeAt(0);
                });
              }),
          for (final x in _l) Text('> item $x'),
        ],
      );
}

class ComparatorSort extends StatefulWidget {
  const ComparatorSort({super.key});

  @override
  State<ComparatorSort> createState() => _ComparatorSortState();
}

class _ComparatorSortState extends State<ComparatorSort> {
  final List<int> _l = <int>[3, 10, 2, 33, 1];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
              child: const Text('sortDesc'),
              onPressed: () {
                setState(() {
                  _l.sort((a, b) => b - a);
                });
              }),
          ElevatedButton(
              child: const Text('sortAsc'),
              onPressed: () {
                setState(() {
                  _l.sort();
                });
              }),
          Text('> ${_l.join(',')}'),
        ],
      );
}

class ShuffleSort extends StatefulWidget {
  const ShuffleSort({super.key});

  @override
  State<ShuffleSort> createState() => _ShuffleSortState();
}

class _ShuffleSortState extends State<ShuffleSort> {
  final List<int> _l = <int>[1, 2, 3, 4, 5, 6];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          // A shuffle's order is random in both languages; what is comparable is that it neither loses nor invents an
          // element, and that a following sort restores the order.
          ElevatedButton(
              child: const Text('shuffleThenSort'),
              onPressed: () {
                setState(() {
                  _l.shuffle();
                  _l.sort();
                });
              }),
          Text('> ${_l.join(',')}'),
        ],
      );
}
