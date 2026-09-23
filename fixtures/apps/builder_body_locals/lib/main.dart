import 'package:flutter/material.dart';

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  final List<String> items = const ['a', 'b', 'c'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          // A local, read once.
          Builder(builder: (context) {
            final greeting = 'hello';
            return Text(greeting);
          }),
          // A local read twice — both reads must be emitted.
          Builder(builder: (context) {
            final label = 'twice';
            return Row(children: [Text(label), Text(label)]);
          }),
          // A chain: the second local's own initializer reads the first.
          Builder(builder: (context) {
            final base = 'chain';
            final upper = base.toUpperCase();
            return Text(upper);
          }),
          // An `itemBuilder` reading the item through a local — App B's own `final p = products[i];` shape.
          SizedBox(
            height: 120,
            child: ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, i) {
                final item = items[i];
                return ListTile(title: Text(item));
              },
            ),
          ),
        ],
      ),
    );
  }
}
