import 'dart:convert';
import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gestures/gestures.dart';

// The oracle for the generated React components. Each scenario in `scenarios.json` names a widget and the steps to
// perform: a plain label taps that ElevatedButton; `@tap:`, `@double:`, `@long:`, `@down:` name a `Text` to press, `@up` /
// `@cancel` end a held press, `@hover:` / `@unhover` move a mouse, `@key:` sends a key, `@wait:ms` advances time. After
// mounting and after every step this records the output `Text`s (those starting with "> "). The generated component is
// driven through the same script in jsdom and must show the same texts (`tests/gestures_execution.test.ts`).
//
// `flutter test` checks the recorded `expected.json` is current; `WRITE_EXPECTED=1 flutter test` rewrites it.

final Map<String, Widget Function()> widgets = <String, Widget Function()>{
  'TapOnly': () => const TapOnly(),
  'Phases': () => const Phases(),
  'Doubles': () => const Doubles(),
  'Longs': () => const Longs(),
  'Inks': () => const Inks(),
  'Hovers': () => const Hovers(),
  'Focuses': () => const Focuses(),
  'Full': () => const Full(),
  'Nested': () => const Nested(),
  'Inert': () => const Inert(),
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
      TestGesture? held;
      TestGesture? mouse;
      for (final Object? step in entry.value as List<dynamic>) {
        final String label = step! as String;
        if (label.startsWith('@wait:')) {
          await tester.pump(Duration(milliseconds: int.parse(label.substring(6))));
        } else if (label.startsWith('@tap:')) {
          await tester.tap(find.text(label.substring(5)));
          await tester.pump();
        } else if (label.startsWith('@double:')) {
          final Finder target = find.text(label.substring(8));
          await tester.tap(target);
          await tester.pump(const Duration(milliseconds: 50));
          await tester.tap(target);
          await tester.pump();
        } else if (label.startsWith('@long:')) {
          await tester.longPress(find.text(label.substring(6)));
          await tester.pump();
        } else if (label.startsWith('@down:')) {
          held = await tester.startGesture(tester.getCenter(find.text(label.substring(6))));
          await tester.pump();
        } else if (label == '@up') {
          await held!.up();
          await tester.pump();
        } else if (label == '@cancel') {
          await held!.cancel();
          await tester.pump();
        } else if (label.startsWith('@hover:')) {
          if (mouse == null) {
            mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
            await mouse.addPointer(location: const Offset(790, 3990));
          }
          await mouse.moveTo(tester.getCenter(find.text(label.substring(7))));
          await tester.pump();
        } else if (label == '@unhover') {
          await mouse!.moveTo(const Offset(790, 3990));
          await tester.pump();
        } else if (label.startsWith('@key:')) {
          final LogicalKeyboardKey key = <String, LogicalKeyboardKey>{
            'tab': LogicalKeyboardKey.tab,
            'enter': LogicalKeyboardKey.enter,
            'space': LogicalKeyboardKey.space,
          }[label.substring(5)]!;
          await tester.sendKeyEvent(key);
          await tester.pump();
        } else {
          await tester.tap(find.widgetWithText(ElevatedButton, label));
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
