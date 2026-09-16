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

/// The callback's own parameter `value`, shadowed by a same-named local declared inside the nested,
/// spliced-open `setState` call that reads it.
class ShadowedCheckboxWidget extends StatefulWidget {
  const ShadowedCheckboxWidget({super.key});
  @override
  State<ShadowedCheckboxWidget> createState() => _ShadowedCheckboxWidgetState();
}

class _ShadowedCheckboxWidgetState extends State<ShadowedCheckboxWidget> {
  bool _checked = false;
  @override
  Widget build(BuildContext context) => Checkbox(
        value: _checked,
        onChanged: (value) {
          setState(() {
            final value = true;
            _checked = value;
          });
        },
      );
}

/// The same shape, but through `expression.ts`'s own in-place `logic.Lambda` path rather than
/// `component.ts`'s action loop: `TextFormField.validator` calls no `setState`, so N5 never promotes
/// it — its own parameter, shadowed by a same-named local inside a nested bare block (N7-flattened).
class ShadowedValidatorWidget extends StatelessWidget {
  const ShadowedValidatorWidget({super.key});
  @override
  Widget build(BuildContext context) => TextFormField(
        validator: (value) {
          {
            final value = 'shadowed';
            return value;
          }
        },
      );
}

/// The same shape, at a store action: the action's own parameter, shadowed by a same-named local
/// declared inside a nested bare block.
class DemoStore extends ChangeNotifier {
  int result = 0;

  void runWith(int value) {
    {
      final value = 99;
      result = value;
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
