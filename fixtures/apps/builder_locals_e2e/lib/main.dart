import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() => runApp(const ProviderScope(child: App()));

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Builder locals',
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
        home: const HomeScreen(),
      );
}

final countProvider = StateProvider<int>((ref) => 0);

const List<String> names = <String>['alpha', 'beta', 'gamma'];

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Builder locals')),
      body: Column(
        children: [
          // A plain `Builder`: a chain of two locals, one read twice.
          Builder(builder: (context) {
            final label = 'status';
            final shout = label.toUpperCase();
            return Row(children: [Text(label), Text(shout)]);
          }),
          // A `Consumer` whose only `ref.watch` is a local's initializer; the local is read twice and feeds a second.
          Consumer(builder: (context, ref, _) {
            final count = ref.watch(countProvider);
            final doubled = count * 2;
            return Column(children: [Text('count: $count'), Text('doubled: $doubled')]);
          }),
          Consumer(
            builder: (context, ref, _) => ElevatedButton(
              onPressed: () => ref.read(countProvider.notifier).state = ref.read(countProvider) + 1,
              child: const Text('Increment'),
            ),
          ),
          // An `itemBuilder` reading its item through a local.
          SizedBox(
            height: 180,
            child: ListView.builder(
              itemCount: names.length,
              itemBuilder: (context, i) {
                final name = names[i];
                return ListTile(title: Text(name));
              },
            ),
          ),
        ],
      ),
    );
  }
}
