// The M7-F fixture — isolates single-hop route-argument promotion from `hello_bridge`'s multi-hop
// forwarding (docs/m7/gap-inline-push-props.md, docs/m7/m7e3-route-interface-promotion.md).
//
// `_count`/`_increment` live on the application root, exactly as `hello_bridge`'s `_isDark`/
// `_toggleTheme` do — but `CounterScreen`, unlike `hello_bridge`'s `LoginScreen`, actually *reads*
// `count` and *calls* `onIncrement` itself, rather than merely forwarding both into a second screen.
// That is the one structural difference that makes this fixture single-hop-promotable where
// `hello_bridge`'s own route is not.

import 'package:flutter/material.dart';

import 'counter_screen.dart';

void main() => runApp(const PromotedCounterApp());

class PromotedCounterApp extends StatefulWidget {
  const PromotedCounterApp({super.key});

  @override
  State<PromotedCounterApp> createState() => _PromotedCounterAppState();
}

class _PromotedCounterAppState extends State<PromotedCounterApp> {
  int _count = 0;

  void _increment() {
    setState(() {
      _count = _count + 1;
    });
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        ),
        home: CounterScreen(count: _count, onIncrement: _increment),
      );
}
