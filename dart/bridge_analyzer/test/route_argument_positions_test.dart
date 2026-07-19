/// Where a component's constructor arguments end up, per position (M6-C).
///
/// The M6 gap document recorded that a route's constructor arguments "never reach" the generator. They do
/// — these tests are the evidence, and they exist so that the claim is checked by the suite rather than
/// re-derived by the next person to read the generator's symptom.
///
/// Three positions, because the corpus measurement found three and they behave differently. Each test
/// asserts the *document*, not the generated output: what the analyzer records is the question here.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:test/test.dart';

import 'support/temp_project.dart';

/// Extracts a single-file app and returns every node, nested ones included.
Future<List<Map<String, dynamic>>> extractNodes(String source) async {
  final String project = createProject(
    name: 'app',
    libraries: <String, String>{'main.dart': source},
  );
  final Directory out = Directory.systemTemp.createTempSync('route_args_');
  addTearDown(() => out.deleteSync(recursive: true));

  await const BridgeAnalyzer().run(
    AnalyzerRequest(projectRoot: project, outputPath: '${out.path}/uir.ndjson'),
  );

  final File document = File('${out.path}/uir.ndjson');
  if (!document.existsSync()) return <Map<String, dynamic>>[];
  return document
      .readAsLinesSync()
      .where((String line) => line.isNotEmpty)
      .map((String line) => jsonDecode(line) as Map<String, dynamic>)
      .toList();
}

/// Every node of [kind] anywhere in [nodes], including nested ones.
List<Map<String, dynamic>> ofKind(List<Map<String, dynamic>> nodes, String kind) {
  final List<Map<String, dynamic>> found = <Map<String, dynamic>>[];
  void walk(Object? value) {
    if (value is Map<String, dynamic>) {
      if (value['kind'] == kind) found.add(value);
      value.values.forEach(walk);
    } else if (value is List<Object?>) {
      value.forEach(walk);
    }
  }

  nodes.forEach(walk);
  return found;
}

void main() {
  group('a component constructed in a widget tree', () {
    test('carries its arguments as ui.Element props — this position works today', () async {
      final List<Map<String, dynamic>> nodes = await extractNodes('''
import 'package:flutter/material.dart';

class Badge extends StatelessWidget {
  const Badge({required this.text, super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Text(text);
}

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) =>
      const Column(children: <Widget>[Badge(text: 'hello')]);
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''');

      final Map<String, dynamic> badge = ofKind(nodes, 'ui.Element').firstWhere(
        (Map<String, dynamic> e) =>
            (e['component'] as Map<String, dynamic>?)?['name'] == 'Badge',
      );

      // The value itself, not merely that a prop exists — a prop bound to the wrong thing would pass a
      // presence check and emit the wrong screen.
      final Map<String, dynamic> props = badge['props'] as Map<String, dynamic>;
      expect((props['text'] as Map<String, dynamic>)['kind'], 'bind.Const');
      expect((props['text'] as Map<String, dynamic>)['value'], 'hello');
      // The element knows the component is the application's own, which is what lets a generator emit a
      // component call rather than a widget mapping.
      expect((badge['component'] as Map<String, dynamic>)['userDefined'], isTrue);
    });
  });

  group('a component named by a declarative route', () {
    test('has its arguments extracted onto the slot element, with full fidelity', () async {
      final List<Map<String, dynamic>> nodes = await extractNodes('''
import 'package:flutter/material.dart';

class Panel extends StatelessWidget {
  const Panel({required this.label, required this.step, super.key});
  final String label;
  final int step;
  @override
  Widget build(BuildContext context) => Text(label);
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) =>
      const MaterialApp(home: Panel(label: 'Taps', step: 2));
}
''');

      final Map<String, dynamic> panel = ofKind(nodes, 'ui.Element').firstWhere(
        (Map<String, dynamic> e) =>
            (e['component'] as Map<String, dynamic>?)?['name'] == 'Panel',
      );
      final Map<String, dynamic> props = panel['props'] as Map<String, dynamic>;

      // Both arguments, with their values. This is the assertion that refutes "they never reach it".
      expect((props['label'] as Map<String, dynamic>)['value'], 'Taps');
      expect((props['step'] as Map<String, dynamic>)['value'], 2);
    });

    test('but app.Route records only the component, so nothing links it to those props', () async {
      // The gap, stated as a test. When `app.Route.arguments` lands (see
      // docs/m6/GAP-route-constructor-arguments.md) this expectation is what changes, deliberately — and
      // BRG3018 stops firing at the same moment.
      final List<Map<String, dynamic>> nodes = await extractNodes('''
import 'package:flutter/material.dart';

class Panel extends StatelessWidget {
  const Panel({required this.label, super.key});
  final String label;
  @override
  Widget build(BuildContext context) => Text(label);
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) =>
      const MaterialApp(home: Panel(label: 'Taps'));
}
''');

      final Map<String, dynamic> route = ofKind(nodes, 'app.Route').single;
      expect(route['component'], isA<String>());
      expect(
        route.keys,
        isNot(contains('arguments')),
        reason: 'app.Route has no field for constructor arguments — the gap this test pins',
      );
    });
  });

  group('a component constructed by an imperative navigation', () {
    test('produces no app.RouteTransition at all — the call becomes ui.Opaque', () async {
      // The corpus measurement found this position carries far more arguments than `home:` does
      // (65 sites against 8), and it is the one with no node whatsoever. Recorded here so the M6-C
      // navigation work starts from a checked fact rather than from the schema's intent.
      // Raw: the fixture's own `$id` is Dart source for the *analyzed* program, not an interpolation in
      // this one.
      final List<Map<String, dynamic>> nodes = await extractNodes(r'''
import 'package:flutter/material.dart';

class Detail extends StatelessWidget {
  const Detail({required this.id, super.key});
  final int id;
  @override
  Widget build(BuildContext context) => Text('$id');
}

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => TextButton(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute<void>(builder: (BuildContext c) => const Detail(id: 7)),
          );
        },
        child: const Text('go'),
      );
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''');

      expect(ofKind(nodes, 'app.RouteTransition'), isEmpty);

      final Map<String, dynamic> opaque = ofKind(nodes, 'ui.Opaque').single;
      expect(opaque['reason'], 'widget returned by a call');
      expect(opaque['dartSource'], contains('Navigator.push'));
    });
  });
}
