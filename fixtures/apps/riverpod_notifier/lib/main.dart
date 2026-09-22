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
final tickProvider = StateProvider<int>((ref) => 0);

/// App B's own `DiscoverDeck` shape: `build()` watches another provider, registers `ref.onDispose`, and
/// `ref.listen`s a third, writing `state` from the listener's own callback.
final deckProvider = NotifierProvider.autoDispose<DeckNotifier, int>(DeckNotifier.new);

class DeckNotifier extends AutoDisposeNotifier<int> {
  @override
  int build() {
    final base = ref.watch(baseProvider);
    ref.onDispose(() {});
    ref.listen(tickProvider, (previous, next) {
      state = base + next;
    });
    return base;
  }

  void bump() {
    state = state + 1;
  }
}

/// App B's own `DiscoverSwipeHintSeenNotifier` shape: an ordinary instance method, called from outside
/// `build()`, writing `state` after an `await`.
final hintSeenProvider = NotifierProvider.autoDispose<HintSeenNotifier, bool>(HintSeenNotifier.new);

class HintSeenNotifier extends AutoDisposeNotifier<bool> {
  @override
  bool build() => false;

  Future<void> markSeen() async {
    await Future<void>.delayed(const Duration(milliseconds: 1));
    state = true;
  }
}

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(deckProvider);
    final seen = ref.watch(hintSeenProvider);
    return Scaffold(
      body: Center(
        child: Column(
          children: [
            Text('$count $seen'),
            ElevatedButton(
              onPressed: () {
                ref.read(deckProvider.notifier).bump();
                ref.read(hintSeenProvider.notifier).markSeen();
              },
              child: const Text('go'),
            ),
          ],
        ),
      ),
    );
  }
}
