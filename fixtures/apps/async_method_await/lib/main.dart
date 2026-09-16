import 'package:flutter/material.dart';

import 'model.dart';

void main() => runApp(const AsyncMethodAwaitApp());

class AsyncMethodAwaitApp extends StatelessWidget {
  const AsyncMethodAwaitApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const DemoScreen(),
      );
}

/// One action per reduction-ladder rung, each assigning DIRECTLY from an awaited call (never through an
/// intermediate local variable, and never through a store's own instance field — both a pre-existing,
/// unrelated gap in this compiler's own local/field-reference scoping inside a store action's own body,
/// found and root-caused while building this fixture and deliberately left unfixed by M11-B; see
/// ADR-0046 §12) means neither a local declared, nor an instance field read, inside an action body yet
/// resolves reliably. This fixture's own job is to prove the SELECTED capability works end to end, not to
/// also fix an unrelated, pre-existing gap — so every action here constructs its own `Model` receiver
/// fresh, inline, at the awaited call site itself.
class DemoStore extends ChangeNotifier {
  int loadResult = 0;
  int scaleResult = 0;
  int staticResult = 0;
  double doubleResult = 0;
  int otherResult = 0;
  int composedResult = 0;

  /// R1/R2 — the smallest positive case: an instance method, awaited, no arguments.
  Future<void> runLoad() async {
    loadResult = await Model(7).load();
    notifyListeners();
  }

  /// R5 — arguments, including an optional-with-default one (M10-C/M10-E).
  Future<void> runScale() async {
    scaleResult = await Model(7).scale(3, 1);
    notifyListeners();
  }

  /// R4 — a static async method (M11-A composed with M11-B for the first time).
  Future<void> runStatic() async {
    staticResult = await Model.loadStatic(5);
    notifyListeners();
  }

  /// R6 — scalar return-type coverage beyond `int`.
  Future<void> runDouble() async {
    doubleResult = await Model(7).loadDouble();
    notifyListeners();
  }

  /// R7a — return-value composition: an awaited `Future<ProjectClass>`, its own further member read
  /// (M10-D return-value chaining, composed with `async`/`await` for the first time). Cross-file (R3).
  Future<void> runOther() async {
    otherResult = (await Model(7).createOther()).count;
    notifyListeners();
  }

  /// R7b — composition: an `async` method's own body awaits ANOTHER `async` method of the SAME class,
  /// unqualified (M10-B internal composition), then composes the awaited value with ordinary arithmetic.
  Future<void> runComposed() async {
    composedResult = await Model(7).useSelf();
    notifyListeners();
  }
}

class DemoScreen extends StatefulWidget {
  const DemoScreen({super.key});

  @override
  State<DemoScreen> createState() => _DemoScreenState();
}

class _DemoScreenState extends State<DemoScreen> {
  final DemoStore _store = DemoStore();

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Async Method Await')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('load: ${_store.loadResult}'),
                ElevatedButton(onPressed: () => _store.runLoad(), child: const Text('Run load')),
                Text('scale: ${_store.scaleResult}'),
                ElevatedButton(onPressed: () => _store.runScale(), child: const Text('Run scale')),
                Text('static: ${_store.staticResult}'),
                ElevatedButton(onPressed: () => _store.runStatic(), child: const Text('Run static')),
                Text('double: ${_store.doubleResult}'),
                ElevatedButton(onPressed: () => _store.runDouble(), child: const Text('Run double')),
                Text('other: ${_store.otherResult}'),
                ElevatedButton(onPressed: () => _store.runOther(), child: const Text('Run other')),
                Text('composed: ${_store.composedResult}'),
                ElevatedButton(onPressed: () => _store.runComposed(), child: const Text('Run composed')),
              ],
            ),
          ),
        ),
      );
}
