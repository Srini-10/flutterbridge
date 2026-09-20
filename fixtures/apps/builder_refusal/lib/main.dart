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
          ConditionalBuilder(),
          CountOnlyBuilder(),
          CountOnlyBlockBuilder(),
          NestedBuilder(),
          SeparatedBuilder(),
          GridCountOnlyBuilder(),
        ]),
      );
}

/// A conditional return: not a walk of one collection, so it stays an element.
class ConditionalBuilder extends StatelessWidget {
  const ConditionalBuilder({super.key});

  final List<String> _items = const <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: ListView.builder(
          itemCount: _items.length,
          itemBuilder: (BuildContext c, int i) {
            if (i == 0) {
              return const Text('first');
            }
            return Text(_items[i]);
          },
        ),
      );
}

/// A count with no collection: nothing to iterate.
class CountOnlyBuilder extends StatelessWidget {
  const CountOnlyBuilder({super.key});

  final List<String> _items = const <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: ListView.builder(
          itemCount: 3,
          itemBuilder: (BuildContext c, int i) => Text('$i'),
        ),
      );
}

/// The same, block-bodied: the discriminator is the index, not the body form.
class CountOnlyBlockBuilder extends StatelessWidget {
  const CountOnlyBlockBuilder({super.key});

  final List<String> _items = const <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: ListView.builder(
          itemCount: 3,
          itemBuilder: (BuildContext c, int i) {
            return Text('$i');
          },
        ),
      );
}

/// A builder inside a builder.
class NestedBuilder extends StatelessWidget {
  const NestedBuilder({super.key});

  final List<String> _items = const <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: ListView.builder(
          itemCount: _items.length,
          itemBuilder: (BuildContext c, int i) => SizedBox(
            height: 40,
            child: ListView.builder(
              itemCount: _items.length,
              itemBuilder: (BuildContext c2, int j) => Text(_items[j]),
            ),
          ),
        ),
      );
}

/// ListView.separated: a second template between items.
class SeparatedBuilder extends StatelessWidget {
  const SeparatedBuilder({super.key});

  final List<String> _items = const <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: ListView.separated(
          itemCount: _items.length,
          itemBuilder: (BuildContext c, int i) => Text(_items[i]),
          separatorBuilder: (BuildContext c, int i) => const Divider(),
        ),
      );
}

/// GridView.builder with no collection.
class GridCountOnlyBuilder extends StatelessWidget {
  const GridCountOnlyBuilder({super.key});

  final List<String> _items = const <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 100,
        child: GridView.builder(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2),
          itemCount: 3,
          itemBuilder: (BuildContext c, int i) => Text('$i'),
        ),
      );
}
