import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:formatters/fields.dart';

// The oracle for the generated React components: each scenario mounts a widget and performs steps (`@enter:N:text` types into the Nth text field; anything
// else taps that button); after mounting and every step this records the `Text`s starting with "> " (`tests/formatters_execution.test.ts`).
// `WRITE_EXPECTED=1 flutter test` rewrites `expected.json`.

final Map<String, Widget Function()> widgets = <String, Widget Function()>{
  'Fields': () => const Fields(),
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
        final String label = step! as String;
        if (label.startsWith('@enter:')) {
          final List<String> parts = label.substring(7).split(':');
          await tester.enterText(find.byType(TextField).at(int.parse(parts[0])), parts.sublist(1).join(':'));
        } else {
          await tester.tap(find.widgetWithText(ElevatedButton, label));
        }
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
