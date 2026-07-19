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

    test('and app.Route records them too, so the route itself links to them (ADR-0025 D1)', () async {
      // This test used to pin the *gap*: `app.Route` recorded only the component, and the arguments the
      // construction site passed reached the document only as the `props` of a `ui.Element` nobody could
      // navigate to from a route. M7-D closed it, and BRG3018 stopped firing for this shape at the same
      // moment — which is what the old version of this test said would happen.
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

      final Map<String, dynamic> route = ofKind(nodes, 'app.Route').single;
      expect(route['component'], isA<String>());

      final List<Object?> arguments = route['arguments']! as List<Object?>;
      // Source order, not sorted: it is the order the author wrote, and it is the only order that means
      // anything for a positional-looking read of the list.
      expect(
        arguments.map((Object? a) => (a! as Map<String, dynamic>)['name']).toList(),
        <String>['label', 'step'],
      );

      for (final Object? argument in arguments) {
        final Map<String, dynamic> entry = argument! as Map<String, dynamic>;
        // `primitive` on emit. N11 owns what becomes of an argument across a URL boundary (ADR-11); the
        // analyzer records that the value is bound and nothing more.
        expect(entry['transport'], 'primitive');
      }

      // The values themselves. A `name` that is right with a `binding` that is wrong passes a presence
      // check and renders the wrong screen.
      final Map<String, dynamic> label =
          (arguments.first! as Map<String, dynamic>)['binding']! as Map<String, dynamic>;
      expect(label['kind'], 'bind.Const');
      expect(label['value'], 'Taps');

      final Map<String, dynamic> step =
          (arguments.last! as Map<String, dynamic>)['binding']! as Map<String, dynamic>;
      expect(step['kind'], 'bind.Const');
      expect(step['value'], 2);
    });

    test('is emitted exactly once, though two walks reach the construction that declares it', () async {
      // Routes are emitted from a standalone walk of the unit and their *scopes* are banked by the scoped
      // walks. If the two were ever both allowed to emit, this would be two identical routes at `/` — a
      // duplicate symbol, and a route table with the same path twice.
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

      expect(ofKind(nodes, 'app.Route'), hasLength(1));
    });
  });

  group('a route argument is bound in the scope it was written in (M7-D)', () {
    // **The reason this work needed a scope at all.** `home: Panel(isDark: _isDark)` is a *reactive read*
    // if and only if the enclosing scope says `_isDark` is a signal. The route extractor runs on a walk
    // that has no scope, so without the scope being banked for it these bindings degrade to `bind.Expr`
    // over a bare `logic.Ref` — which compiles, renders once, and never updates again. That is the
    // failure mode with no symptom at compile time (see `binding_extractor.dart`), so it is pinned here
    // by the classification rather than by the argument's presence.
    //
    // The shape is `fixtures/apps/hello_bridge`'s, deliberately: a `StatefulWidget` root passing one
    // signal and one action into the component its `home:` route renders.
    Future<List<Map<String, dynamic>>> statefulRoot() => extractNodes('''
import 'package:flutter/material.dart';

class Panel extends StatelessWidget {
  const Panel({required this.isDark, required this.onToggle, super.key});
  final bool isDark;
  final void Function() onToggle;
  @override
  Widget build(BuildContext context) => const Text('panel');
}

class App extends StatefulWidget {
  const App({super.key});
  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  bool _isDark = false;

  void _toggleTheme() {
    setState(() {
      _isDark = !_isDark;
    });
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        home: Panel(isDark: _isDark, onToggle: _toggleTheme),
      );
}
''');

    /// The route's argument named [name].
    Map<String, dynamic> argument(List<Map<String, dynamic>> nodes, String name) {
      final Map<String, dynamic> route = ofKind(nodes, 'app.Route').single;
      final List<Object?> arguments = route['arguments']! as List<Object?>;
      return arguments
              .cast<Map<String, dynamic>>()
              .firstWhere((Map<String, dynamic> a) => a['name'] == name)['binding']!
          as Map<String, dynamic>;
    }

    test('a signal read is bind.Signal, naming the signal the component declares', () async {
      final List<Map<String, dynamic>> nodes = await statefulRoot();

      final Map<String, dynamic> app = ofKind(nodes, 'ui.Component')
          .firstWhere((Map<String, dynamic> c) => c['name'] == 'App');
      final List<Object?> localSignals = app['localSignals']! as List<Object?>;

      final Map<String, dynamic> isDark = argument(nodes, 'isDark');
      expect(
        isDark['kind'],
        'bind.Signal',
        reason: 'without the enclosing scope `_isDark` is an unrecognised name, and the route would '
            'record a read that never re-renders',
      );
      // The *same* signal the component declares, not merely some signal: a `bind.Signal` naming the
      // wrong id is a subscription to the wrong state.
      expect(localSignals, contains(isDark['signal']));
    });

    test('an action tear-off resolves to the action, so the callback is a reference and not a name', () async {
      final List<Map<String, dynamic>> nodes = await statefulRoot();

      final Map<String, dynamic> onToggle = argument(nodes, 'onToggle');
      expect(onToggle['kind'], 'bind.Expr');
      final Map<String, dynamic> expr = onToggle['expr']! as Map<String, dynamic>;
      expect(expr['kind'], 'logic.Ref');
      expect(expr['name'], '_toggleTheme');

      // A `target` is a promise that something declares this symbol, and only the scope can keep it. The
      // generator emits a call for a reference with a target and reports BRG3006 for one without.
      final Object? target = expr['target'];
      expect(target, isNotNull, reason: 'an action tear-off must resolve to the sig.Action it names');
      expect(
        ofKind(nodes, 'sig.Action').map((Map<String, dynamic> a) => a['id']),
        contains(target),
      );
    });

    test('the route and the ui.Element agree, node for node', () async {
      // The strongest statement of correctness available: the arguments a route records are *the same
      // bindings* the widget tree records for the same construction. Node ids are content hashes, so
      // equal ids mean the two classifications are identical rather than merely similar — and a route
      // bound in a weaker scope would produce a different node and fail here.
      final List<Map<String, dynamic>> nodes = await statefulRoot();

      final Map<String, dynamic> element = ofKind(nodes, 'ui.Element').firstWhere(
        (Map<String, dynamic> e) =>
            (e['component'] as Map<String, dynamic>?)?['name'] == 'Panel',
      );
      final Map<String, dynamic> props = element['props']! as Map<String, dynamic>;

      for (final String name in <String>['isDark', 'onToggle']) {
        expect(
          argument(nodes, name)['id'],
          (props[name]! as Map<String, dynamic>)['id'],
          reason: '`$name` must be classified identically as a route argument and as a widget prop',
        );
      }
    });
  });

  group('a route whose page is built by a builder', () {
    test('binds its arguments too — the construction is reached as an expression, not as a widget', () async {
      // The other half of the coverage. `MaterialApp(home:)` reaches the widget extractor; a route table's
      // `(context) => Panel(...)` reaches the *expression* extractor, inside a lambda scope neither walk
      // shares. Both must bank a scope, and this is the one that fails if only the widget path does.
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
  Widget build(BuildContext context) => MaterialApp(
        routes: <String, Widget Function(BuildContext)>{
          '/detail': (BuildContext context) => const Panel(label: 'Detail'),
        },
      );
}
''');

      final Map<String, dynamic> route = ofKind(nodes, 'app.Route')
          .firstWhere((Map<String, dynamic> r) => r['path'] == '/detail');
      final List<Object?> arguments = route['arguments']! as List<Object?>;
      final Map<String, dynamic> label = arguments.single! as Map<String, dynamic>;
      expect(label['name'], 'label');
      expect((label['binding']! as Map<String, dynamic>)['value'], 'Detail');
    });

    test('and so does a go_router route declared outside every component', () async {
      // A `GoRouter` in a top-level variable is declared where no component's walk goes. It is still
      // found — the standalone walk reaches the whole unit — and its page's scope is still banked, by the
      // expression walk of the initializer. A route here must not be lost, which is the hazard of moving
      // route emission onto the scoped walk instead.
      final String project = createProject(
        name: 'app',
        dependencies: <String, Map<String, String>>{
          'flutter': flutterPackage,
          'go_router': goRouterPackage,
        },
        libraries: <String, String>{
          'main.dart': '''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class Panel extends StatelessWidget {
  const Panel({required this.label, super.key});
  final String label;
  @override
  Widget build(BuildContext context) => Text(label);
}

final GoRouter router = GoRouter(
  routes: <RouteBase>[
    GoRoute(
      path: '/detail',
      builder: (BuildContext context, GoRouterState state) =>
          const Panel(label: 'Detail'),
    ),
  ],
);
''',
        },
      );

      final Directory out = Directory.systemTemp.createTempSync('route_args_go_');
      addTearDown(() => out.deleteSync(recursive: true));
      await const BridgeAnalyzer().run(
        AnalyzerRequest(projectRoot: project, outputPath: '${out.path}/uir.ndjson'),
      );
      final List<Map<String, dynamic>> nodes = File('${out.path}/uir.ndjson')
          .readAsLinesSync()
          .where((String line) => line.isNotEmpty)
          .map((String line) => jsonDecode(line) as Map<String, dynamic>)
          .toList();

      final Map<String, dynamic> route = ofKind(nodes, 'app.Route').single;
      expect(route['path'], '/detail');
      final Map<String, dynamic> label =
          (route['arguments']! as List<Object?>).single! as Map<String, dynamic>;
      expect(label['name'], 'label');
      expect((label['binding']! as Map<String, dynamic>)['value'], 'Detail');
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
