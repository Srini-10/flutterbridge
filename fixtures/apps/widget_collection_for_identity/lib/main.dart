import 'package:flutter/material.dart';

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF3F51B5))),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _selected = '';

  @override
  Widget build(BuildContext context) {
    final items = ['Alpha', 'Beta', 'Gamma'];
    final groups = [
      ['One', 'Two'],
      ['Three', 'Four'],
    ];
    final prefix = 'Item:';

    return Scaffold(
      body: Column(
        children: [
          // Repeated reads of the same item, and an outer local read alongside it.
          for (final item in items)
            Row(children: [Text('$prefix $item'), Text(item)]),

          // A closure (onPressed) capturing the item — proving each iteration's own callback closes
          // over the correct, per-iteration binding, not a shared/last one.
          for (final item in items)
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _selected = item;
                });
              },
              child: Text('select $item'),
            ),

          Text(_selected),

          // Nested collection-for, deliberately shadowing the outer name with the identical spelling —
          // proving the inner read resolves to the inner declaration, and the outer one is unaffected.
          for (final item in groups)
            Column(
              children: [
                for (final item in item)
                  Text(item),
              ],
            ),

          // Two sibling loops with the identical variable name — proving they never collide.
          for (final item in items)
            Text('sibling-a $item'),
          for (final item in items)
            Text('sibling-b $item'),

          // A nested collection-for whose own inner template reads BOTH the inner item and the outer
          // one — proving the inner scope resolves the outer item's own identity correctly too, not
          // just its own. Distinct names here (not shadowed) so both reads are separately observable.
          for (final group in groups)
            Column(
              children: [
                for (final entry in group)
                  Text('$group: $entry'),
              ],
            ),
        ],
      ),
    );
  }
}
