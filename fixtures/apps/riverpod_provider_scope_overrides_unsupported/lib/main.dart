import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AppPreferences {
  const AppPreferences(this.label);
  final String label;
}

final appPreferencesProvider = Provider<AppPreferences>((ref) => const AppPreferences('default'));

Future<String> loadConfigLabel() async => 'from-disk';

/// App B's own real shape (`apps/customer/lib/main.dart`): `appPreferencesProvider.overrideWithValue(
/// AppPreferences(prefs))`, where `prefs` is `main()`'s own local from `await
/// SharedPreferences.getInstance();` — reproduced here with a plain awaited function instead of the real
/// package, since the dependency itself is not what this fixture tests.
Future<void> main() async {
  final label = await loadConfigLabel();
  runApp(
    ProviderScope(
      overrides: [
        appPreferencesProvider.overrideWithValue(AppPreferences(label)),
      ],
      child: const App(),
    ),
  );
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(home: const HomeScreen());
}

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(appPreferencesProvider);
    return Text(prefs.label);
  }
}
