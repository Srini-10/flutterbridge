import 'dart:convert';
import 'dart:io';

import 'package:exceptions/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// The oracle for the generated React components. Each scenario in `scenarios.json` names a widget and the buttons to
// tap; after mounting and after every tap this records the output `Text`s (those starting with "> "). The generated
// component is driven through the same script in jsdom and must show the same texts
// (`packages/generators/react/tests/exceptions_execution.test.ts`).
//
// `flutter test` checks the recorded `expected.json` is current; `WRITE_EXPECTED=1 flutter test` rewrites it.

final Map<String, Widget Function()> widgets = <String, Widget Function()>{
  'Catches': () => const Catches(),
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
      for (final Object? label in entry.value as List<dynamic>) {
        if (label == '@wait') {
          // Time passes: a `Future.delayed` under test fires when the clock is advanced.
          await tester.pump(const Duration(milliseconds: 50));
        } else {
          await tester.tap(
            find.widgetWithText(ElevatedButton, label! as String),
          );
          await tester.pump();
        }
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
