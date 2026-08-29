import 'package:flutter/material.dart';

import 'model.dart';

// A trivial, unrelated root — gives the generated router a real entry point without requiring the
// unsupported call anywhere on the route table.
void main() => runApp(const MaterialApp(home: RootScreen()));

class RootScreen extends StatelessWidget {
  const RootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Text('root');
}

// Not wired into the route table. `model` is a LOCAL VARIABLE — constructed in this same build method
// (M9-O), never a parameter — and `model.multiply(3, 2)` calls an instance method whose own SECOND
// parameter is optional, which ADR-0039/M10-A never supports (every parameter must be required-positional
// — no optional, named, or default-valued one — excluded deliberately, not yet). Before the M9-R closure
// fix, the pre-existing M9-J refusal's own receiver-shape check (`isParameterReceiver`) did not recognize
// this receiver at all, so a call like this one silently lowered to `{ count: 7 }.multiply(3, 2)` — a real
// TypeScript error, reached at `tsc` time rather than as this compiler's own honest `BRG3013`. This
// fixture exists to prove that gap stays closed even for a method whose FIRST parameter is required-
// positional, the exact shape M10-A does support (`fixtures/apps/instance_method_execution`) — refusal
// here is driven by `bonus` being optional, alone.
class MethodCallOnLocal extends StatelessWidget {
  const MethodCallOnLocal({super.key});

  @override
  Widget build(BuildContext context) {
    final model = Model(7);
    return Text('${model.multiply(3, 2)}');
  }
}

// Not wired into the route table either. `AsyncModel.scale` meets every OTHER ADR-0039 gate — the
// `async` keyword alone is what keeps it unsupported, and only at the TypeScript generator layer (see
// `model.dart`'s own doc comment): `_externalMethodTarget` still resolves a `target` for it.
class AsyncMethodCallOnLocal extends StatelessWidget {
  const AsyncMethodCallOnLocal({super.key});

  @override
  Widget build(BuildContext context) {
    final model = AsyncModel(7);
    return Text('${model.scale(3)}');
  }
}

// Not wired into the route table either (M10-B). `countdown` calls itself — the fixed-point retry loop
// can never make it succeed (its own dependency is itself), so it stays refused, with no special
// recursion check anywhere in the generator.
class RecursiveMethodCallOnLocal extends StatelessWidget {
  const RecursiveMethodCallOnLocal({super.key});

  @override
  Widget build(BuildContext context) {
    final model = RecursiveModel(7);
    return Text('${model.countdown(3)}');
  }
}

// Not wired into the route table either (M10-B). `compute` itself meets every ADR-0039 gate, but its own
// body calls `scaleUnsupported`, which does not — the unsupported dependency must propagate, refusing
// `compute` too, rather than silently shipping a call to a helper that was never emitted.
class ReachableUnsupportedDependencyDemo extends StatelessWidget {
  const ReachableUnsupportedDependencyDemo({super.key});

  @override
  Widget build(BuildContext context) {
    final model = DependentModel(7);
    return Text('${model.compute()}');
  }
}

// Not wired into the route table either (M10-C). `applyCallback`'s own parameter is function-typed —
// see `CallbackModel`'s own doc comment for the real gap this fixture proves stays closed.
class FunctionTypedParamCallOnLocal extends StatelessWidget {
  const FunctionTypedParamCallOnLocal({super.key});

  @override
  Widget build(BuildContext context) {
    final model = CallbackModel(7);
    return Text('${model.applyCallback((x) => x * 2)}');
  }
}
