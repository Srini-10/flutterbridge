import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const DemoScreen(),
      );
}

/// R1 — a real, cataloged, parameterized callback (`Checkbox.onChanged`), the parameter read DIRECTLY,
/// no nested closure at all.
class DirectParamReadWidget extends StatefulWidget {
  const DirectParamReadWidget({super.key});
  @override
  State<DirectParamReadWidget> createState() => _DirectParamReadWidgetState();
}

class _DirectParamReadWidgetState extends State<DirectParamReadWidget> {
  bool _checked = false;
  @override
  Widget build(BuildContext context) => Checkbox(
        value: _checked,
        onChanged: (value) {
          _checked = value ?? false;
        },
      );
}

/// R2 — the parameter, captured and read from a NESTED closure (`setState`) — the ordinary, idiomatic
/// shape every real Flutter `onChanged` handler uses.
class NestedParamReadWidget extends StatefulWidget {
  const NestedParamReadWidget({super.key});
  @override
  State<NestedParamReadWidget> createState() => _NestedParamReadWidgetState();
}

class _NestedParamReadWidgetState extends State<NestedParamReadWidget> {
  bool _checked = false;
  @override
  Widget build(BuildContext context) => Checkbox(
        value: _checked,
        onChanged: (value) {
          setState(() {
            _checked = value ?? false;
          });
        },
      );
}

/// Multi-capture — the callback's own parameter AND a differently-named captured local, both read from
/// the same nested closure. Neither shadows the other; both must resolve correctly.
class ParamAndLocalWidget extends StatefulWidget {
  const ParamAndLocalWidget({super.key});
  @override
  State<ParamAndLocalWidget> createState() => _ParamAndLocalWidgetState();
}

class _ParamAndLocalWidgetState extends State<ParamAndLocalWidget> {
  bool _checked = false;
  @override
  Widget build(BuildContext context) => Checkbox(
        value: _checked,
        onChanged: (value) {
          final fallback = true;
          setState(() {
            _checked = value ?? fallback;
          });
        },
      );
}

/// R8 — an async parameterized callback, the identical guard applying regardless of `isAsync`.
class AsyncParamWidget extends StatefulWidget {
  const AsyncParamWidget({super.key});
  @override
  State<AsyncParamWidget> createState() => _AsyncParamWidgetState();
}

class _AsyncParamWidgetState extends State<AsyncParamWidget> {
  bool _checked = false;
  @override
  Widget build(BuildContext context) => Checkbox(
        value: _checked,
        onChanged: (value) async {
          await Future<void>.delayed(const Duration(milliseconds: 1));
          setState(() {
            _checked = value ?? false;
          });
        },
      );
}

/// `TextFormField.validator` — a parameterized callback that does NOT call `setState`, so N5 never
/// promotes it to a `sig.Action`; it stays an ordinary in-place `logic.Lambda`, lowered by
/// `expression.ts` directly rather than `component.ts`'s own action loop — the SECOND, independent call
/// site this milestone's guard had to reach. A differently-named local inside a nested bare block
/// (flattened by N7, M11-E's own Candidate A) never collides with the parameter.
class ValidatorWidget extends StatelessWidget {
  const ValidatorWidget({super.key});
  @override
  Widget build(BuildContext context) => TextFormField(
        validator: (value) {
          final normalized = value ?? '';
          if (normalized == '') {
            return 'required';
          }
          return null;
        },
      );
}

/// A store action taking a parameter, with a differently-named local declared inside a nested bare
/// block — the identical guard `store.ts`'s own action-body emission now also carries, proactively,
/// since the same flattening (N7) and splice (INV-22) risks apply there too.
class DemoStore extends ChangeNotifier {
  int result = 0;

  void runWith(int value) {
    {
      final doubled = value * 2;
      result = doubled;
    }
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
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () => _store.runWith(1),
        child: Text('result: ${_store.result}'),
      );
}
