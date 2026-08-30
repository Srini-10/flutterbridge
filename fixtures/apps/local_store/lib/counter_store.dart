import 'package:flutter/foundation.dart';

/// A declared store (ADR-27) — a `ChangeNotifier` a component instantiates and owns directly, never
/// shared through a `<StoreProvider>`. Exercises every member kind M7-N resolves:
///
///   * `_count`  -> `sig.Signal` (mutated by `increment`/`add`, so it is reactive — `signal_extractor.dart`'s
///     own rule, unrelated to this milestone).
///   * `doubled` -> `sig.Derived` (an explicit getter over state).
///   * `increment` -> `sig.Action`, no parameters — also read as a tear-off (`onPressed: store.increment`).
///   * `add`       -> `sig.Action`, one parameter — a direct call (`store.add(1)`).
///   * `bump`      -> `sig.Action`, one OPTIONAL parameter with a default value (M10-E, ADR-0043 §3) — a
///     real, pre-existing, previously-undetected bug found while investigating M10-E's own bounded
///     optional-method-parameter capability: `paramListOf` (the shared parameter-list renderer this
///     action, `add`/`increment`, and every M10 method helper all use) already inspected a `defaultValue`
///     UIR field, but never emitted it — every ACTION with an optional-and-defaulted parameter, called
///     with the argument omitted, generated a real `tsc --strict` failure ("Expected 1 arguments, but got
///     0"), unrelated to this fixture's own pre-M10-E job (proving multi-instance store isolation,
///     ADR-27) and never previously exercised by any call site here. Fixed as a direct, correct
///     consequence of the ONE shared fix M10-E's own capability requires.
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

  void bump([int n = 5]) {
    _count += n;
    notifyListeners();
  }
}
