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

/// The simplest possible shape: a zero-arg constructor, `int` state, arithmetic through `state`.
class CounterController extends StateNotifier<int> {
  CounterController() : super(0);

  void increment() {
    state = state + 1;
  }
}

final counterProvider = StateNotifierProvider<CounterController, int>((ref) => CounterController());

abstract class Repository {
  Future<int> fetchValue();
}

class FakeRepository implements Repository {
  @override
  Future<int> fetchValue() async => 7;
}

sealed class LoadState {
  const LoadState();
}

class LoadStateInitial extends LoadState {
  const LoadStateInitial();
}

class LoadStateLoaded extends LoadState {
  const LoadStateLoaded(this.value);
  final int value;
}

class LoadController extends StateNotifier<LoadState> {
  LoadController(this._repository, {this.retries = 3}) : super(const LoadStateInitial());

  final Repository _repository;
  final int retries;

  Future<void> load() async {
    final value = await _repository.fetchValue();
    state = LoadStateLoaded(value);
  }
}

final repositoryProvider = Provider<Repository>((ref) => FakeRepository());

final loadControllerProvider = StateNotifierProvider<LoadController, LoadState>((ref) {
  return LoadController(ref.watch(repositoryProvider));
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.read(counterProvider);
    final state = ref.read(loadControllerProvider);
    final label = switch (state) {
      LoadStateInitial() => 'not loaded',
      LoadStateLoaded(:final value) => 'value $value',
    };
    return Scaffold(
      body: Column(
        children: [
          Text('Count: $count'),
          ElevatedButton(
            onPressed: () => ref.read(counterProvider.notifier).increment(),
            child: const Text('Increment'),
          ),
          Text(label),
          ElevatedButton(
            onPressed: () => ref.read(loadControllerProvider.notifier).load(),
            child: const Text('Load'),
          ),
        ],
      ),
    );
  }
}
