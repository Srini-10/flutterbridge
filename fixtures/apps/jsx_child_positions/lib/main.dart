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
          ConditionalChild(),
          ConditionalList(),
        ]),
      );
}

/// A collection-if between a Column's children: a `ui.Cond` in JSX child position.
class ConditionalChild extends StatefulWidget {
  const ConditionalChild({super.key});

  @override
  State<ConditionalChild> createState() => _ConditionalChildState();
}

class _ConditionalChildState extends State<ConditionalChild> {
  bool _flag = false;

  @override
  Widget build(BuildContext context) => Column(children: [
        if (_flag) const Text('shown'),
        ElevatedButton(
          onPressed: () {
            setState(() {
              _flag = !_flag;
            });
          },
          child: const Text('toggle'),
        ),
      ]);
}

/// A collection-if whose branch is a list: a `ui.Cond` whose `then` is an element that contains a `ui.List`.
class ConditionalList extends StatefulWidget {
  const ConditionalList({super.key});

  @override
  State<ConditionalList> createState() => _ConditionalListState();
}

class _ConditionalListState extends State<ConditionalList> {
  bool _flag = true;
  List<String> _items = <String>['a', 'b'];

  @override
  Widget build(BuildContext context) => Column(children: [
        if (_flag)
          SizedBox(
            height: 80,
            child: ListView.builder(
              itemCount: _items.length,
              itemBuilder: (BuildContext c, int i) => Text(_items[i]),
            ),
          ),
      ]);
}
