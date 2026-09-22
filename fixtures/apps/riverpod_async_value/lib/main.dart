import 'package:flutter/foundation.dart';
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

/// The dominant real shape (App B: 149 `FutureProvider` declarations against 24 `StreamProvider` ones) —
/// AsyncValue's own consumption surface does not depend on which produced it.
final itemsProvider = FutureProvider<List<String>>((ref) async {
  await Future<void>.delayed(const Duration(milliseconds: 1));
  return <String>['a', 'b'];
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(itemsProvider);

    // `.when`/`.maybeWhen`/`.whenData` in a *non*-widget position — a plain value each callback
    // produces, not a widget the render tree has to place. This is the shape this fix supports; a widget
    // returned directly into the tree is a separate, pre-existing limitation (`WidgetPositionScreen`,
    // `fixtures/apps/riverpod_async_value_widget_position`).
    final label = async.when(
      data: (items) => 'items: ${items.length}',
      error: (e, st) => 'error: $e',
      loading: () => 'loading',
    );
    final maybeLabel = async.maybeWhen(data: (items) => 'has ${items.length}', orElse: () => 'none');
    final mapped = async.whenData((items) => items.length);

    // Every property real App B code reads.
    final items = async.valueOrNull ?? const <String>[];
    final value = async.value ?? const <String>[];
    final loading = async.isLoading;
    final hasError = async.hasError;
    final hasValue = async.hasValue;
    final err = async.error;
    final trace = async.stackTrace;

    return Scaffold(
      body: Center(
        child: Column(
          children: [
            Text('$label $maybeLabel ${mapped.valueOrNull}'),
            Text('$items $value $loading $hasError $hasValue $err $trace'),
            ElevatedButton(
              onPressed: () {
                // `.requireValue` — inside a callback, matching real usage (App B: 10 occurrences).
                final n = ref.read(itemsProvider).requireValue.length;
                debugPrint('$n');
              },
              child: const Text('go'),
            ),
          ],
        ),
      ),
    );
  }
}
