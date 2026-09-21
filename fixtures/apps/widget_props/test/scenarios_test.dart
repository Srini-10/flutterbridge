import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:widget_props/props.dart';

// The oracle for the generated React components: each scenario mounts a widget and taps its buttons; after mounting and every tap this
// records the `Text`s starting with "> " (`tests/widget_props_execution.test.ts` drives the generated component the same way).
// `WRITE_EXPECTED=1 flutter test` rewrites `expected.json`.

final Map<String, Widget Function()> widgets = <String, Widget Function()>{
  'Props': () => const Props(),
};

List<String> outputs(WidgetTester tester) => <String>[
      for (final Text t in tester.widgetList<Text>(find.byType(Text)))
        if ((t.data ?? '').startsWith('> ')) t.data!,
    ];

void main() {
  final Map<String, dynamic> scripts = jsonDecode(
    File('test/scenarios.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final Map<String, List<List<String>>> recorded =
      <String, List<List<String>>>{};

  for (final MapEntry<String, dynamic> entry in scripts.entries) {
    testWidgets('scenario ${entry.key}', (WidgetTester tester) async {
      tester.view.physicalSize = const Size(800, 4000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(child: widgets[entry.key]!()),
          ),
        ),
      );
      final List<List<String>> trace = <List<String>>[outputs(tester)];
      for (final Object? step in entry.value as List<dynamic>) {
        await tester.tap(find.widgetWithText(ElevatedButton, step! as String));
        await tester.pump();
        trace.add(outputs(tester));
      }
      recorded[entry.key] = trace;
    });
  }

  tearDownAll(() {
    final String rendered =
        '${const JsonEncoder.withIndent('  ').convert(recorded)}\n';
    final File file = File('test/expected.json');
    if (Platform.environment['WRITE_EXPECTED'] == '1') {
      file.writeAsStringSync(rendered);
    } else if (file.readAsStringSync() != rendered) {
      throw StateError(
        'test/expected.json is stale: rerun with WRITE_EXPECTED=1 and review the diff.',
      );
    }
  });
}
