import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

void main() => runApp(const ActionScopeApp());

class ActionScopeApp extends StatelessWidget {
  const ActionScopeApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const DemoScreen(),
      );
}

/// M11-C: a local variable declared inside a store action's own body, and read by a LATER statement in
/// the same body, resolves correctly (ADR-0047, if written) — `store.ts`'s own `actionScope` now wires
/// `localName` via `localBindingsIn`, mirroring the identical, already-proven mechanism
/// `functions.ts`'s own member-helper loop and `component.ts`'s own sibling `actionScope` already use.
class ActionScopeStore extends ChangeNotifier {
  int result = 0;
  int shadowField = 100;

  /// R1/R2/R3 — the smallest positive case: a local declared, then read by a LATER statement in the same
  /// action body.
  void runLocal() {
    final value = 1;
    final computed = value + 1;
    result = computed;
    notifyListeners();
  }

  /// R4 — a nested lexical block `{}` inside an action body.
  void runNestedBlock() {
    final outer = 1;
    {
      final inner = 2;
      result = outer + inner;
    }
    notifyListeners();
  }

  /// R7 — shadowing: a local named identically to a FIELD-BACKED SIGNAL (`shadowField`). Dart's own
  /// lexical scoping means the bare read inside this method resolves to the LOCAL, never the signal —
  /// already correctly proven at extraction (the read's own `target` names the local's declaration, not
  /// the signal); this proves the SAME is true once generated.
  void runShadow() {
    final shadowField = 2;
    result = shadowField;
    notifyListeners();
  }

  /// The negative control R7 needs: the FIELD-BACKED SIGNAL itself, read from a DIFFERENT action with NO
  /// shadowing local in scope — proves the shadowing action above did not somehow "poison" the signal.
  void runReadField() {
    result = shadowField;
    notifyListeners();
  }

  /// R8a/R8b — sibling scope isolation: two DIFFERENT actions on the SAME store, each declaring a local
  /// of the IDENTICAL name — must never collide.
  void runSiblingA() {
    final value = 10;
    result = value;
    notifyListeners();
  }

  void runSiblingB() {
    final value = 20;
    result = value;
    notifyListeners();
  }

  /// R10 — a MUTABLE local (reassigned after its own declaration) — proves the fix is unconditional on
  /// mutability, never a separate primitive.
  void runMutable() {
    var count = 0;
    count = count + 1;
    result = count;
    notifyListeners();
  }
}

class DemoScreen extends StatefulWidget {
  const DemoScreen({super.key});

  @override
  State<DemoScreen> createState() => _DemoScreenState();
}

class _DemoScreenState extends State<DemoScreen> {
  final ActionScopeStore _store = ActionScopeStore();

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Action Scope')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('result: ${_store.result}'),
                ElevatedButton(onPressed: _store.runLocal, child: const Text('Run local')),
                ElevatedButton(onPressed: _store.runNestedBlock, child: const Text('Run nested block')),
                ElevatedButton(onPressed: _store.runShadow, child: const Text('Run shadow')),
                ElevatedButton(onPressed: _store.runReadField, child: const Text('Run read field')),
                ElevatedButton(onPressed: _store.runSiblingA, child: const Text('Run sibling A')),
                ElevatedButton(onPressed: _store.runSiblingB, child: const Text('Run sibling B')),
                ElevatedButton(onPressed: _store.runMutable, child: const Text('Run mutable')),
              ],
            ),
          ),
        ),
      );
}
