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

class BrandConfig {
  const BrandConfig(this.companyName, this.supportPhone);
  final String companyName;
  final String supportPhone;
}

/// `brand_providers.dart`'s own shape.
final brandConfigProvider = Provider<BrandConfig>((ref) => const BrandConfig('Acme', '555-0100'));

class Session {
  const Session(this.userId, this.nickname);
  final String userId;
  final String? nickname;
}

/// `splash_page.dart`/`notifications_providers.dart`'s own shape: `AsyncValue`'s own `.valueOrNull`, then a
/// null-aware chain into it, all inside the selector.
final sessionProvider = FutureProvider<Session>((ref) async => const Session('u1', null));

/// `_product_panel.dart`'s own shape: `.select(...)` chained directly off a *family* application.
final itemsByFirmProvider = Provider.family<List<String>, String>((ref, firmId) => ['$firmId-a', '$firmId-b']);

/// `notifications_providers.dart`/`brand_providers.dart`'s own shape: `ref.watch(provider.select(...))`
/// used inside *another provider's own body*, not a widget — an ordinary provider-to-provider dependency,
/// not a hook, ADR-0048's hoisting rule does not apply here.
final greetingProvider = Provider<String>((ref) {
  final name = ref.watch(brandConfigProvider.select((b) => b.companyName));
  return 'Hello, $name';
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final companyName = ref.watch(brandConfigProvider.select((b) => b.companyName));
    final supportPhone = ref.watch(brandConfigProvider.select((b) => b.supportPhone));
    final nickname = ref.watch(sessionProvider.select((s) => s.valueOrNull?.nickname));
    final firstFirmItem = ref.watch(
      itemsByFirmProvider('firm-1').select((items) => items.isEmpty ? null : items.first),
    );
    final greeting = ref.watch(greetingProvider);
    return Scaffold(
      body: Center(
        child: Text('$companyName $supportPhone $nickname $firstFirmItem $greeting'),
      ),
    );
  }
}
