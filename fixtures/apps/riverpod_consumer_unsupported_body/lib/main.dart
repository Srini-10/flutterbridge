import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() => runApp(const ProviderScope(child: App()));

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(home: const HomeScreen());
}

final countProvider = Provider<int>((ref) => 3);
const items = <String>['a', 'b', 'c'];

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Column(children: const [BlockBody(), ItemTemplate()]);
  }
}

/// App B's `onboarding_page.dart`/`discover_page.dart` shape: a `final` local, then an `if` deciding what is
/// returned (`if (resolved == null) return const SizedBox.shrink();`). A block of only leading locals and one
/// `return` is supported (`riverpod_builder_body_locals`); control flow deciding the return is not — a `ui.*`
/// node has no representation for an early `return`, and guessing which branch runs would be inventing.
class BlockBody extends StatelessWidget {
  const BlockBody({super.key});
  @override
  Widget build(BuildContext context) {
    return Consumer(
      builder: (context, ref, _) {
        final count = ref.watch(countProvider);
        if (count == 0) {
          return const SizedBox.shrink();
        }
        return Text('$count');
      },
    );
  }
}

/// `search_page.dart`'s own `_Results` shape: `Consumer` reached only from a `GridView.builder`'s own
/// `itemBuilder`. Expression-bodied throughout, so the `ui.List` proves and the diagnostic exercised is
/// the hook-hoisting refusal, not `BlockBody`'s own opaque-body one.
class ItemTemplate extends StatelessWidget {
  const ItemTemplate({super.key});
  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      itemCount: items.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2),
      itemBuilder: (context, i) =>
          Consumer(builder: (context, ref, _) => Text('${items[i]} ${ref.watch(countProvider)}')),
    );
  }
}
