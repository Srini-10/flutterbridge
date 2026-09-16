import 'package:flutter/material.dart';

void main() => runApp(const RenderTreeCallbackShadowRefusalApp());

class RenderTreeCallbackShadowRefusalApp extends StatelessWidget {
  const RenderTreeCallbackShadowRefusalApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const ShadowedCaptureWidget(),
      );
}

/// R6 — a local declared in the outer callback, shadowed by a same-named local declared inside the
/// nested `setState` call that reads it. Both declarations resolve correctly and distinctly at
/// extraction time (the read targets the INNER one) — but `setState`'s own body is spliced open with no
/// block boundary left in the emitted statement list, so this generator refuses rather than emit
/// `const value = 1; const value = 2;` back to back, which is not valid TypeScript.
class ShadowedCaptureWidget extends StatefulWidget {
  const ShadowedCaptureWidget({super.key});
  @override
  State<ShadowedCaptureWidget> createState() => _ShadowedCaptureWidgetState();
}

class _ShadowedCaptureWidgetState extends State<ShadowedCaptureWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          final value = 1;
          setState(() {
            final value = 2;
            _result = value;
          });
        },
        child: Text('$_result'),
      );
}
