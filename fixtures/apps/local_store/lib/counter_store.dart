import 'package:flutter/foundation.dart';

/// A declared store (ADR-27) — a `ChangeNotifier` a component instantiates and owns directly, never
/// shared through a `<StoreProvider>`. Exercises every member kind M7-N resolves:
///
///   * `_count`  -> `sig.Signal` (mutated by `increment`/`add`, so it is reactive — `signal_extractor.dart`'s
///     own rule, unrelated to this milestone).
///   * `doubled` -> `sig.Derived` (an explicit getter over state).
///   * `increment` -> `sig.Action`, no parameters — also read as a tear-off (`onPressed: store.increment`).
///   * `add`       -> `sig.Action`, one parameter — a direct call (`store.add(1)`).
class CounterStore extends ChangeNotifier {
  int _count = 0;

  int get count => _count;
  int get doubled => _count * 2;

  void increment() {
    _count += 1;
    notifyListeners();
  }

  void add(int n) {
    _count += n;
    notifyListeners();
  }
}
