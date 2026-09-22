import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() => runApp(const ProviderScope(child: App()));

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
        home: const HomeScreen(),
      );
}

final baseProvider = Provider<int>((ref) => 3);

final doubledProvider = Provider<int>((ref) => ref.watch(baseProvider) * 2);

final labelProvider = Provider<String>((ref) => 'value is ${ref.watch(doubledProvider)}');

final filterProvider = StateProvider<String>((ref) => 'all');

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final label = ref.read(labelProvider);
    final filter = ref.read(filterProvider);
    return Scaffold(
      body: Column(
        children: [
          Text(label),
          Text('filter: $filter'),
          ElevatedButton(
            onPressed: () {
              ref.read(filterProvider.notifier).state = 'b';
              ref.invalidate(baseProvider);
            },
            child: const Text('Change'),
          ),
        ],
      ),
    );
  }
}
