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
          SortInPlace(),
          AddInPlace(),
          SetContains(),
          MapRemove(),
          ListInterpolation(),
          NumInterpolation(),
        ]),
      );
}

/// List.sort() sorts in place (unobservable by a signal) and compares differently.
class SortInPlace extends StatefulWidget {
  const SortInPlace({super.key});

  @override
  State<SortInPlace> createState() => _SortInPlaceState();
}

class _SortInPlaceState extends State<SortInPlace> {
  List<int> _n = <int>[10, 9, 1];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n.sort();
              });
            },
            child: const Text('go'),
          ),
          Text('${_n.length}'),
        ],
      );
}

/// List.add does not exist on an array and mutates in place.
class AddInPlace extends StatefulWidget {
  const AddInPlace({super.key});

  @override
  State<AddInPlace> createState() => _AddInPlaceState();
}

class _AddInPlaceState extends State<AddInPlace> {
  List<int> _n = <int>[1];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n.add(2);
              });
            },
            child: const Text('go'),
          ),
          Text('${_n.length}'),
        ],
      );
}

/// Set.contains is has() in JavaScript.
class SetContains extends StatefulWidget {
  const SetContains({super.key});

  @override
  State<SetContains> createState() => _SetContainsState();
}

class _SetContainsState extends State<SetContains> {
  Set<int> _s = <int>{};

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _s = <int>{};
              });
            },
            child: const Text('go'),
          ),
          Text('${_s.contains(1)}'),
        ],
      );
}

/// Map.remove is delete() in JavaScript.
class MapRemove extends StatefulWidget {
  const MapRemove({super.key});

  @override
  State<MapRemove> createState() => _MapRemoveState();
}

class _MapRemoveState extends State<MapRemove> {
  Map<String, int> _m = <String, int>{'a': 1};

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _m.remove('a');
              });
            },
            child: const Text('go'),
          ),
          Text('${_m.length}'),
        ],
      );
}

/// Dart prints a List as [1, 2]; JavaScript prints 1,2.
class ListInterpolation extends StatefulWidget {
  const ListInterpolation({super.key});

  @override
  State<ListInterpolation> createState() => _ListInterpolationState();
}

class _ListInterpolationState extends State<ListInterpolation> {
  List<int> _n = <int>[1, 2];

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _n = <int>[3];
              });
            },
            child: const Text('go'),
          ),
          Text('$_n'),
        ],
      );
}

/// A num is an int or a double, and JavaScript cannot say which.
class NumInterpolation extends StatefulWidget {
  const NumInterpolation({super.key});

  @override
  State<NumInterpolation> createState() => _NumInterpolationState();
}

class _NumInterpolationState extends State<NumInterpolation> {
  num _x = 3.0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                _x = 4.0;
              });
            },
            child: const Text('go'),
          ),
          Text('$_x'),
        ],
      );
}
