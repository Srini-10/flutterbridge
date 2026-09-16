import 'package:flutter/material.dart';

import 'child_widget.dart';
import 'child_widget.dart' as aliased;
import 'label_a.dart';
import 'label_b.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
      );
}

/// R2/R3 — a project widget composed directly as a child slot (`Scaffold.body`), nested one level
/// inside a `Column`.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: const [
          // R2/R3 — direct composition, nested inside Column.
          ChildWidget(label: 'direct'),
          // R9 — a repeated reference to the SAME widget resolves to the SAME import, once.
          ChildWidget(label: 'again'),
          // An import alias carries no analyzer-level meaning — the SAME class, SAME target.
          aliased.ChildWidget(label: 'aliased'),
          // R5 — two DIFFERENT classes, declared in different files, composed side by side. Each
          // must resolve to its OWN file, never the other's. (A shared CLASS NAME across files is a
          // separate, deliberately refused shape — see `m11e_project_widget_name_collision`.)
          LabelA(),
          LabelB(),
        ]),
      );
}
