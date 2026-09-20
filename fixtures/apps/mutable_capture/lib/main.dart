import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: const [
          SameScopeWidget(),
          MultipleLocalsWidget(),
          ReadOnlyCaptureWidget(),
          ShadowedMutationWidget(),
        ]),
      );
}

/// R1 — a mutable local declared, mutated, and read entirely within ONE callback's own body — no
/// capture at all. Already correct via ordinary declaration-tier identity (ADR-28, M9-A).
class SameScopeWidget extends StatefulWidget {
  const SameScopeWidget({super.key});
  @override
  State<SameScopeWidget> createState() => _SameScopeWidgetState();
}

class _SameScopeWidgetState extends State<SameScopeWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          var count = 0;
          count++;
          setState(() {
            _result = count;
          });
        },
        child: Text('$_result'),
      );
}

/// R10 — multiple mutable locals, both mutated within the same callback (including through the
/// `setState` splice, INV-22).
class MultipleLocalsWidget extends StatefulWidget {
  const MultipleLocalsWidget({super.key});
  @override
  State<MultipleLocalsWidget> createState() => _MultipleLocalsWidgetState();
}

class _MultipleLocalsWidgetState extends State<MultipleLocalsWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          var a = 1;
          var b = 2;
          setState(() {
            a++;
            b++;
            _result = a + b;
          });
        },
        child: Text('$_result'),
      );
}

/// R2/Case C — a mutable `build()`-level local, captured and READ ONLY (never written) from a nested
/// callback. Re-extracting a never-mutated initializer at the read site is sound (M8-B).
class ReadOnlyCaptureWidget extends StatefulWidget {
  const ReadOnlyCaptureWidget({super.key});
  @override
  State<ReadOnlyCaptureWidget> createState() => _ReadOnlyCaptureWidgetState();
}

class _ReadOnlyCaptureWidgetState extends State<ReadOnlyCaptureWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) {
    var base = 7;
    return ElevatedButton(
      onPressed: () {
        setState(() {
          _result = base;
        });
      },
      child: Text('$_result / base $base'),
    );
  }
}

/// R7 — a mutable `build()`-level local (read-only, used in the tree) shadowed by an inner, real local
/// of the identical name, which IS mutated. The inner mutation is safe; the outer, never-written local
/// is unaffected.
class ShadowedMutationWidget extends StatefulWidget {
  const ShadowedMutationWidget({super.key});
  @override
  State<ShadowedMutationWidget> createState() => _ShadowedMutationWidgetState();
}

class _ShadowedMutationWidgetState extends State<ShadowedMutationWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) {
    var value = 100;
    return ElevatedButton(
      onPressed: () {
        var value = 1;
        setState(() {
          value++;
          _result = value;
        });
      },
      child: Text('$_result / outer $value'),
    );
  }
}
