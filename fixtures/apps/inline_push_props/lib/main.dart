// The M7-G fixture — isolates inline `Navigator.push` destination-prop resolution from
// `hello_bridge`'s own push, which is entangled with unrelated extraction gaps (async/await,
// `mounted`) that leave its transition "unperformed" and refused by BRG3008 before
// `componentScreens`' prop-resolution defect ever becomes observable
// (docs/m7/gap-inline-push-props.md, docs/m7/m7g-inline-push-prop-resolution.md).
//
// `HomeScreen` pushes `DetailScreen` twice, synchronously, with different constant arguments each
// time — the fixture Phase 9/10 of M7-G need to prove destination identity is per-transition, not
// per-component.

import 'package:flutter/material.dart';

import 'home_screen.dart';

void main() => runApp(const InlinePushApp());

class InlinePushApp extends StatelessWidget {
  const InlinePushApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        ),
        home: const HomeScreen(),
      );
}
