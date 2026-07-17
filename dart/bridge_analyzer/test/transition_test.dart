/// Route transition extraction (M3-C).
///
/// Every test runs the **real pipeline** against a **real, resolved** project. Extraction decides what
/// a navigation is from the resolved element of the call — a `push` that resolves into `package:flutter/`
/// is Flutter's, an application's own `push` on its own class is not — so a mock with no resolved
/// library would test nothing. A stand-in `flutter` and `go_router` with genuine `Navigator` and
/// context-extension members are written to disk and genuinely resolved.
///
/// The claim under test: the analyzer emits `app.RouteTransition` edges the compiler's N11 consumes
/// with **zero changes** — an inline push names the `ui.Component` it renders, a named push names the
/// `app.Route` it lands on, and every argument is bound in scope so a signal that crosses a boundary is
/// a `bind.Signal` N11 can promote and a primitive is a primitive it leaves alone.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

import 'support/temp_project.dart';

// ── stand-in packages with navigation ────────────────────────────────────────────────────────────

/// `flutter`, plus the `Navigator` and `MaterialPageRoute` the transition adapter recognises.
///
/// Recognition is by resolved element, not by name (ISSUE-18): `Navigator.push` is Flutter's because
/// `push`'s enclosing type is `Navigator` and its library is `package:flutter/`. So these must be real,
/// resolvable members of a real `Navigator` in a real `package:flutter/`.
final Map<String, String> navFlutter = <String, String>{
  ...flutterPackage,
  'widgets.dart':
      '${flutterPackage['widgets.dart']!}\n'
      '''
class Route<T> {
  Route();
}

class MaterialPageRoute<T> extends Route<T> {
  MaterialPageRoute({required this.builder});
  final Widget Function(BuildContext) builder;
}

class Navigator {
  static Object? push<T>(BuildContext context, Route<T> route) => null;
  static Object? pushReplacement<T, R>(BuildContext context, Route<T> route) => null;
  static Object? pushNamed<T>(BuildContext context, String routeName, {Object? arguments}) => null;
  static Object? pushReplacementNamed<T, R>(
    BuildContext context,
    String routeName, {
    Object? arguments,
  }) => null;
  static Object? popAndPushNamed<T, R>(
    BuildContext context,
    String routeName, {
    Object? arguments,
  }) => null;
  static void pop<T>(BuildContext context, [T? result]) {}
}
''',
};

/// `go_router`, plus the context extension whose `go`/`push`/`replace` are the navigations it owns.
final Map<String, String> navGoRouter = <String, String>{
  ...goRouterPackage,
  'go_router.dart':
      '${goRouterPackage['go_router.dart']!}\n'
      '''
extension GoRouterHelper on BuildContext {
  void go(String location, {Object? extra}) {}
  Object? push<T>(String location, {Object? extra}) => null;
  void pushReplacement(String location, {Object? extra}) {}
  void replace(String location, {Object? extra}) {}
  void goNamed(String name, {Object? extra}) {}
  void pop<T>([T? result]) {}
}
''',
};

/// Extracts a single-file navigation app against the nav-aware stand-in packages.
Future<Extracted> extractNav(
  String source, {
  Map<String, String> extra = const <String, String>{},
  bool goRouter = false,
}) async {
  final String project = createProject(
    name: 'app',
    libraries: <String, String>{'main.dart': source, ...extra},
    dependencies: goRouter
        ? <String, Map<String, String>>{'flutter': navFlutter, 'go_router': navGoRouter}
        : <String, Map<String, String>>{'flutter': navFlutter},
  );
  final Directory out = Directory.systemTemp.createTempSync('extract_');
  addTearDown(() => out.deleteSync(recursive: true));

  final AnalyzerResult result = await const BridgeAnalyzer().run(
    AnalyzerRequest(projectRoot: project, outputPath: '${out.path}/uir.ndjson'),
  );

  final File document = File('${out.path}/uir.ndjson');
  return Extracted(
    result: result,
    nodes: document.existsSync()
        ? document
              .readAsLinesSync()
              .where((String l) => l.isNotEmpty)
              .map((String l) => jsonDecode(l) as Map<String, dynamic>)
              .toList()
        : <Map<String, dynamic>>[],
    bytes: document.existsSync() ? document.readAsStringSync() : '',
  );
}

/// The result of extracting a project — the transition-focused view of it.
final class Extracted {
  const Extracted({required this.result, required this.nodes, required this.bytes});

  final AnalyzerResult result;
  final List<Map<String, dynamic>> nodes;
  final String bytes;

  List<Map<String, dynamic>> ofKind(String kind) {
    final List<Map<String, dynamic>> found = <Map<String, dynamic>>[];
    void walk(Object? value) {
      if (value is Map<String, dynamic>) {
        if (value['kind'] == kind) {
          found.add(value);
        }
        value.values.forEach(walk);
      } else if (value is List<dynamic>) {
        value.forEach(walk);
      }
    }

    nodes.forEach(walk);
    return found;
  }

  /// The one transition. Fails loudly if there is not exactly one.
  Map<String, dynamic> get transition {
    final List<Map<String, dynamic>> found = ofKind('app.RouteTransition');
    expect(found, hasLength(1), reason: 'expected exactly one transition, found ${found.length}');
    return found.single;
  }

  /// The id of the one node of [kind] — the routes and components a transition points at.
  String idOf(String kind) {
    final List<Map<String, dynamic>> found = ofKind(kind);
    expect(found, hasLength(1), reason: 'expected exactly one $kind, found ${found.length}');
    return found.single['id'] as String;
  }

  /// The arguments a transition carries, as `{name: bindKind}`.
  Map<String, String> get argumentBindings => <String, String>{
    for (final Map<String, dynamic> argument
        in (transition['arguments'] as List<dynamic>? ?? <dynamic>[]).cast<Map<String, dynamic>>())
      '${argument['name']}': '${(argument['binding'] as Map<String, dynamic>?)?['kind']}',
  };

  List<Diagnostic> get errors =>
      result.diagnostics.where((Diagnostic d) => d.severity == Severity.error).toList();

  List<String> codes(Severity severity) => result.diagnostics
      .where((Diagnostic d) => d.severity == severity)
      .map((Diagnostic d) => d.code.id)
      .toList();
}

// A screen that runs [body] from a button, so the navigation sits in a callback that captures the
// build method's `context` — which is where a real `context.go` or `Navigator.push(context, …)` is.
String screen(String body, {String extra = ''}) =>
    '''
import 'package:flutter/material.dart';
$extra

class Detail extends StatelessWidget {
  const Detail({this.id = 0, this.count = 0, this.onTap, this.data, super.key});
  final int id;
  final int count;
  final void Function()? onTap;
  final Object? data;
  @override
  Widget build(BuildContext context) => const Text('detail');
}

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  int _count = 0;

  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () {
      $body
    },
    child: const Text('go'),
  );
}
''';

void main() {
  group('inline MaterialPageRoute — the destination is a component (§A17)', () {
    test('a push targets the ui.Component it constructs, not a route', () async {
      final Extracted app = await extractNav(
        screen('Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => const Detail()));'),
      );

      expect(app.errors, isEmpty);
      final Map<String, dynamic> t = app.transition;
      expect(t['component'], isA<String>(), reason: 'component names a ui.Component by id');
      expect(t['target'], isNull, reason: 'an inline push has no path, so no route target');
      // The component it points at is the Detail component this project declares.
      final String detail = app
          .ofKind('ui.Component')
          .firstWhere((Map<String, dynamic> c) => c['name'] == 'Detail')['id'] as String;
      expect(t['component'], detail);
    });

    test('constructor arguments are extracted, each bound in scope', () async {
      final Extracted app = await extractNav(
        screen(
          'Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => Detail(id: 3, count: _count)));',
        ),
      );

      expect(app.errors, isEmpty);
      // A literal is a constant; a component-scoped signal read is a reactive read. The difference is
      // exactly what N11 reasons about across the boundary.
      expect(app.argumentBindings, <String, String>{'id': 'bind.Const', 'count': 'bind.Signal'});
    });

    test('a push to a widget the project does not declare is reported, and drops the edge', () async {
      // `Text` is a framework widget, not a component this project emits. There is no id to point at,
      // and inventing one would be a dangling reference. Reported (BRG1304), edge omitted.
      final Extracted app = await extractNav(
        screen("Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => const Text('x')));"),
      );

      expect(app.ofKind('app.RouteTransition'), isEmpty);
      expect(app.codes(Severity.warning), contains('BRG1304'));
    });
  });

  group('named routes — the destination is a declared app.Route', () {
    // A MaterialApp with a route table, plus a Home that navigates into it.
    String app(String navigation) =>
        '''
import 'package:flutter/material.dart';

class Settings extends StatelessWidget {
  const Settings({super.key});
  @override
  Widget build(BuildContext context) => const Text('settings');
}

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () {
      $navigation
    },
    child: const Text('go'),
  );
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    routes: <String, Widget Function(BuildContext)>{
      '/settings': (BuildContext context) => const Settings(),
    },
  );
}
''';

    test('pushNamed resolves to the route the table declares', () async {
      final Extracted extracted = await extractNav(app("Navigator.pushNamed(context, '/settings');"));

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> t = extracted.transition;
      expect(t['target'], extracted.idOf('app.Route'));
      expect(t['component'], isNull);
    });

    test('pushReplacementNamed resolves the same way', () async {
      final Extracted extracted = await extractNav(
        app("Navigator.pushReplacementNamed(context, '/settings');"),
      );
      expect(extracted.transition['target'], extracted.idOf('app.Route'));
    });

    test('popAndPushNamed resolves the same way', () async {
      final Extracted extracted = await extractNav(
        app("Navigator.popAndPushNamed(context, '/settings');"),
      );
      expect(extracted.transition['target'], extracted.idOf('app.Route'));
    });

    test('a path that matches no route is BRG1308, and the edge is dropped', () async {
      final Extracted extracted = await extractNav(app("Navigator.pushNamed(context, '/nope');"));

      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
      expect(extracted.codes(Severity.warning), contains('BRG1308'));
      expect(extracted.errors, isEmpty, reason: 'an unresolved route is a warning, not a build failure');
    });

    test('a runtime route name is refused (BRG1304), never guessed', () async {
      final Extracted extracted = await extractNav(
        app("const String where = '/settings'; Navigator.pushNamed(context, where.toString());"),
      );

      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
      expect(extracted.codes(Severity.warning), contains('BRG1304'));
    });
  });

  group('go_router — path navigation resolves against the routes it declares', () {
    String app(String navigation) =>
        '''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class Profile extends StatelessWidget {
  const Profile({super.key});
  @override
  Widget build(BuildContext context) => const Text('profile');
}

class Item extends StatelessWidget {
  const Item({super.key});
  @override
  Widget build(BuildContext context) => const Text('item');
}

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () {
      $navigation
    },
    child: const Text('go'),
  );
}

final GoRouter router = GoRouter(
  routes: <RouteBase>[
    GoRoute(path: '/profile', builder: (BuildContext c, GoRouterState s) => const Profile()),
    GoRoute(path: '/item/:id', builder: (BuildContext c, GoRouterState s) => const Item()),
  ],
);
''';

    test('context.go resolves to the exact route', () async {
      final Extracted extracted = await extractNav(app("context.go('/profile');"), goRouter: true);

      expect(extracted.errors, isEmpty);
      final String profile = extracted
          .ofKind('app.Route')
          .firstWhere((Map<String, dynamic> r) => r['path'] == '/profile')['id'] as String;
      expect(extracted.transition['target'], profile);
    });

    test('context.push to a concrete path matches a parameterized route', () async {
      // `/item/42` is served by the route declared `/item/:id`. Matching the pattern is the router's
      // own rule, not a guess.
      final Extracted extracted = await extractNav(app("context.push('/item/42');"), goRouter: true);

      final String item = extracted
          .ofKind('app.Route')
          .firstWhere((Map<String, dynamic> r) => r['path'] == '/item/:id')['id'] as String;
      expect(extracted.transition['target'], item);
    });

    test('context.replace resolves the same way', () async {
      final Extracted extracted = await extractNav(app("context.replace('/profile');"), goRouter: true);
      final String profile = extracted
          .ofKind('app.Route')
          .firstWhere((Map<String, dynamic> r) => r['path'] == '/profile')['id'] as String;
      expect(extracted.transition['target'], profile);
    });

    test('a path built at runtime is refused, not guessed', () async {
      // `seg` is a non-final field — a signal, a runtime value — so `/item/$seg` is not a compile-time
      // constant and the destination cannot be resolved statically. Refused (BRG1304), not guessed.
      final Extracted extracted = await extractNav(
        r'''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  String seg = '42';
  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () {
      context.go('/item/$seg');
    },
    child: const Text('go'),
  );
}
''',
        goRouter: true,
      );
      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
      expect(extracted.codes(Severity.warning), contains('BRG1304'));
    });
  });

  group('a pop is not an edge (§A17.3)', () {
    test('Navigator.pop emits no transition', () async {
      final Extracted app = await extractNav(screen('Navigator.pop(context);'));
      expect(app.ofKind('app.RouteTransition'), isEmpty);
      expect(app.errors, isEmpty);
    });

    test('context.pop emits no transition', () async {
      final Extracted app = await extractNav(
        screen('context.pop();', extra: "import 'package:go_router/go_router.dart';"),
        goRouter: true,
      );
      expect(app.ofKind('app.RouteTransition'), isEmpty);
    });
  });

  group('arguments — represented values only, and what crosses is bound honestly', () {
    test('a component-scoped signal argument is a bind.Signal — the shape N11 promotes', () async {
      // This is the promotion path proved at the source: `_count` is a component-scoped signal, and it
      // crosses a route boundary. N11 (`promote-cross-route-state`) sees a `bind.Signal` whose signal is
      // `scope: component` and promotes it into a store. The extractor's job is to bind it as one.
      final Extracted app = await extractNav(
        screen('Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => Detail(count: _count)));'),
      );

      expect(app.errors, isEmpty);
      final Map<String, dynamic> argument =
          (app.transition['arguments'] as List<dynamic>).single as Map<String, dynamic>;
      final Map<String, dynamic> binding = argument['binding'] as Map<String, dynamic>;
      expect(binding['kind'], 'bind.Signal');

      // And the signal it names is component-scoped, which is what makes it promotable rather than
      // already-shared store state.
      final String signalId = binding['signal'] as String;
      final Map<String, dynamic> signal =
          app.ofKind('sig.Signal').firstWhere((Map<String, dynamic> s) => s['id'] == signalId);
      expect(signal['scope'], 'component');
    });

    test('a callback argument is captured, never dropped', () async {
      // A closure crossing a boundary is the case ADR-11 exists for. It is captured as a binding — a
      // `bind.Expr` over a `logic.Lambda` — so N11 can rule on it (promote it, or route it to an
      // override, BRG2303); it is never silently discarded.
      final Extracted app = await extractNav(
        screen('Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => Detail(onTap: () {})));'),
      );

      expect(app.errors, isEmpty);
      expect(app.argumentBindings, <String, String>{'onTap': 'bind.Expr'});
    });

    test('an argument with no UIR representation is omitted and reported, never serialized as source',
        () async {
      // A record literal has no `logic.*` node. Rather than carry `(1, 2)` as a Dart source string a
      // generator could not pass to anything, the argument is dropped and the reason is reported.
      final Extracted app = await extractNav(
        screen('Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => Detail(data: (1, 2))));'),
      );

      // The push still produces a transition; the unrepresentable argument is simply not on it.
      expect(app.ofKind('app.RouteTransition'), hasLength(1));
      expect(app.argumentBindings.containsKey('data'), isFalse,
          reason: 'the opaque argument is omitted, not serialized');
      expect(app.codes(Severity.warning), contains('BRG1302'));
    });
  });

  group('source — where the navigation happens from', () {
    test('the transition records the component it navigates from', () async {
      final Extracted app = await extractNav(
        screen('Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => const Detail()));'),
      );
      final String home = app
          .ofKind('ui.Component')
          .firstWhere((Map<String, dynamic> c) => c['name'] == 'Home')['id'] as String;
      expect(app.transition['source'], home);
    });
  });

  group('determinism and incremental equality (D1–D5, ADR-5)', () {
    const String source =
        'Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => Detail(count: _count)));';

    test('the same source extracts to the same bytes', () async {
      final Extracted first = await extractNav(screen(source));
      final Extracted second = await extractNav(screen(source));
      expect(first.bytes, second.bytes);
      expect(first.ofKind('app.RouteTransition'), hasLength(1));
    });

    test('a transition survives an incremental rebuild unchanged', () async {
      final String project = createProject(
        name: 'app',
        libraries: <String, String>{'main.dart': screen(source)},
        dependencies: <String, Map<String, String>>{'flutter': navFlutter},
      );
      final Directory cache = Directory.systemTemp.createTempSync('cache_');
      addTearDown(() => cache.deleteSync(recursive: true));
      final String cacheDir = p.join(cache.path, 'cas');

      Future<String> build({String? withCache}) async {
        final Directory out = Directory.systemTemp.createTempSync('build_');
        addTearDown(() => out.deleteSync(recursive: true));
        final AnalyzerResult result = await const BridgeAnalyzer().run(
          AnalyzerRequest(projectRoot: project, outputPath: p.join(out.path, 'uir.ndjson')),
          cacheDirectory: withCache,
        );
        expect(result.status, RunStatus.completed);
        return File(result.output!.outputPath).readAsStringSync();
      }

      final String clean = await build();
      final String incremental = await build(withCache: cacheDir);
      expect(incremental, clean, reason: 'the transition an incremental build writes is the clean one');
    });
  });
}
