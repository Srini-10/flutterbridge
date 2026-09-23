import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class BrandConfig {
  const BrandConfig(this.appName, this.accent);
  final String appName;
  final int accent;

  static const BrandConfig neutral = BrandConfig('Neutral', 0x9e9e9e);

  BrandConfig copyWith({String? appName}) => BrandConfig(appName ?? this.appName, accent);
}

final compiledBrandDefaultsProvider = Provider<BrandConfig>((ref) => BrandConfig.neutral);

final accentColorProvider = Provider<int>((ref) => 0x2196f3);

/// App B's own second real shape: `.overrideWith((ref) => ...)`, an inline create closure reading another
/// provider — self-contained, no `main()`-local dependency.
final themeSeedProvider = Provider<int>((ref) => 0x9e9e9e);

/// App B's own root shape exactly: `runApp(ProviderScope(overrides: [...], child: App()))`, never nested,
/// both overrides self-contained.
void main() {
  runApp(
    ProviderScope(
      overrides: [
        compiledBrandDefaultsProvider.overrideWithValue(BrandConfig.neutral.copyWith(appName: 'Commerce')),
        themeSeedProvider.overrideWith((ref) => ref.watch(accentColorProvider)),
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
    final brand = ref.watch(compiledBrandDefaultsProvider);
    final seed = ref.watch(themeSeedProvider);
    return Text('${brand.appName} $seed');
  }
}
