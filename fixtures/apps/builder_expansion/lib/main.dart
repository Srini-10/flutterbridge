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
          ExpressionIndexed(),
          BlockIndexed(),
          GridIndexed(),
          PropsPreserved(),
        ]),
      );
}

/// Expression-bodied, indexes one collection: expands to ui.List.
class ExpressionIndexed extends StatefulWidget {
  const ExpressionIndexed({super.key});

  @override
  State<ExpressionIndexed> createState() => _ExpressionIndexedState();
}

class _ExpressionIndexedState extends State<ExpressionIndexed> {
  List<String> _items = <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: ListView.builder(
          itemCount: _items.length,
          itemBuilder: (BuildContext c, int i) => Text(_items[i]),
        ),
      );
}

/// Block-bodied with a single return, indexes one collection: also expands.
class BlockIndexed extends StatefulWidget {
  const BlockIndexed({super.key});

  @override
  State<BlockIndexed> createState() => _BlockIndexedState();
}

class _BlockIndexedState extends State<BlockIndexed> {
  List<String> _items = <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: ListView.builder(
          itemCount: _items.length,
          itemBuilder: (BuildContext c, int i) {
            return Text(_items[i]);
          },
        ),
      );
}

/// GridView.builder that indexes one collection: expands.
class GridIndexed extends StatefulWidget {
  const GridIndexed({super.key});

  @override
  State<GridIndexed> createState() => _GridIndexedState();
}

class _GridIndexedState extends State<GridIndexed> {
  List<String> _items = <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: GridView.builder(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2),
          itemCount: _items.length,
          itemBuilder: (BuildContext c, int i) => Text(_items[i]),
        ),
      );
}

/// The container and its props survive the expansion: a horizontal, padded, shrink-wrapped, reversed list
/// must still say so. Until M11-I the `ui.List` replaced the `ListView`, and every one of these was dropped
/// with no diagnostic.
class PropsPreserved extends StatefulWidget {
  const PropsPreserved({super.key});

  @override
  State<PropsPreserved> createState() => _PropsPreservedState();
}

class _PropsPreservedState extends State<PropsPreserved> {
  List<String> _items = <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(16),
          shrinkWrap: true,
          reverse: true,
          itemCount: _items.length,
          itemBuilder: (BuildContext c, int i) => Text(_items[i]),
        ),
      );
}
