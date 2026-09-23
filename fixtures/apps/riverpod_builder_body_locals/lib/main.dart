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

final countProvider = Provider<int>((ref) => 3);
final itemsProvider = FutureProvider<List<String>>((ref) async => ['a', 'b']);

/// A plain `StatelessWidget` — no `ref` of its own; `Consumer` is the only source of one.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          // One leading `ref.watch` local, read once — `customer_form_page.dart`/`discover_page.dart`'s shape.
          Consumer(builder: (context, ref, _) {
            final count = ref.watch(countProvider);
            return Text('count $count');
          }),
          // The same local read twice.
          Consumer(builder: (context, ref, _) {
            final count = ref.watch(countProvider);
            return Row(children: [Text('a $count'), Text('b ${count + 1}')]);
          }),
          // App B's own `.valueOrNull ?? const []` initializer.
          Consumer(builder: (context, ref, _) {
            final options = ref.watch(itemsProvider).valueOrNull ?? const <String>[];
            return Text('options ${options.length}');
          }),
          const ItemsView(),
        ],
      ),
    );
  }
}

class ItemsView extends ConsumerWidget {
  const ItemsView({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(itemsProvider);
    return async.when(
      loading: () => const CircularProgressIndicator(),
      error: (e, st) => Text('err $e'),
      data: (items) {
        final n = items.length;
        return Text('$n items');
      },
    );
  }
}
