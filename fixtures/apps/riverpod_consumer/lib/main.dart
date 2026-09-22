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

/// App B's own shape (`discover_page.dart`'s `_SwipeCard`, `customer_form_page.dart`,
/// `onboarding_page.dart`): a plain `StatelessWidget` — never `ConsumerWidget`/`ConsumerState`, which is
/// the whole point of `Consumer` — with the wrapper directly in its own `build()`'s render tree, an
/// unconditional position a hook can run from.
///
/// Both sites are expression-bodied — the one builder shape that inlines to a full render tree today
/// (`_widgetOfBody`'s `ExpressionFunctionBody` case). Real App B's own 5 sites are not this shape (every
/// one reads a `final` local first); `riverpod_consumer_unsupported_body` is that shape, and the
/// precise, separate refusal it hits — a pre-existing, general limitation shared by `Builder`/
/// `ListenableBuilder`/`ValueListenableBuilder`/`ListView.builder`/`GridView.builder` alike, not
/// something this milestone's own `Consumer` work introduced or is scoped to close
/// (`docs/m14/riverpod-usage-matrix.md` §4f).
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          children: [
            Consumer(builder: (context, ref, _) => Text('${ref.watch(countProvider)}')),
            const Footer(),
          ],
        ),
      ),
    );
  }
}

/// A second, independent `Consumer` site in a *different* plain `StatelessWidget` — proves the erasure
/// and hook-hoisting is genuinely per-component (each gets its own `useWatch`), not something that only
/// works for the first one reached.
class Footer extends StatelessWidget {
  const Footer({super.key});
  @override
  Widget build(BuildContext context) {
    return Consumer(builder: (context, ref, _) => Text('footer ${ref.watch(countProvider)}'));
  }
}
