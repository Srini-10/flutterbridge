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

class Session {
  const Session(this.userId, this.nickname);
  final String userId;
  final String? nickname;
}

typedef MaybeSession = Session?;

/// The control: a non-nullable project class already worked (self-heals via `tsc`'s own inference).
final sessionProvider = FutureProvider<Session>((ref) async => const Session('u1', null));

/// The bug: a nullable project class as a `FutureProvider`'s own declared type argument.
final maybeSessionProvider = FutureProvider<Session?>((ref) async => null);

/// The identical bug one level deeper: `List` is itself external, so `Session`'s own `target` needs the fix
/// to propagate through *two* external generics (`FutureProvider<List<...>>`), not stop at the outermost.
final sessionsProvider = FutureProvider<List<Session>?>((ref) async => const [Session('u2', 'n2')]);

/// The control: a nullable primitive, unaffected either way.
final countProvider = Provider<int?>((ref) => null);

/// The control: a nullable kit-mirrored SDK value type (a different resolution path than a project class).
final maybeDurationProvider = Provider<Duration?>((ref) => null);

/// A type alias resolving to a nullable project class — the analyzer's own resolved-element type is already
/// the aliased type by the time extraction sees it.
final aliasedSessionProvider = FutureProvider<MaybeSession>((ref) async => null);

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final maybeSession = ref.watch(maybeSessionProvider).valueOrNull;
    final sessions = ref.watch(sessionsProvider).valueOrNull;
    final count = ref.watch(countProvider);
    final duration = ref.watch(maybeDurationProvider);
    final aliased = ref.watch(aliasedSessionProvider).valueOrNull;
    return Scaffold(
      body: Center(
        child: Text(
          '${session?.userId} ${maybeSession?.nickname} ${sessions?.length} $count $duration ${aliased?.userId}',
        ),
      ),
    );
  }
}
