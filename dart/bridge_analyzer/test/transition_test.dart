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

class RouteSettings {
  const RouteSettings({this.name, this.arguments});
  final String? name;
  final Object? arguments;
}

class MaterialPageRoute<T> extends Route<T> {
  MaterialPageRoute({required this.builder, this.settings});
  final Widget Function(BuildContext) builder;
  final RouteSettings? settings;
}

/// A page route under a different name — an application's own subclass, which is ordinary Flutter.
///
/// Recognition must be by **resolved supertype** (C1), so this has to read exactly as `MaterialPageRoute`
/// does. It is the fixture that makes a lexeme comparison fail: with only the SDK's own spelling present,
/// name matching and type matching are indistinguishable and a mutation to the wrong one survives.
class BrandedPageRoute<T> extends MaterialPageRoute<T> {
  BrandedPageRoute({required super.builder, super.settings});
}

/// A `MaterialApp` that also takes `onGenerateRoute`, so the router-as-a-function form is testable.
///
/// The base stand-in's `MaterialApp` has only `home`/`routes`/`theme`. Two real defects in the
/// onGenerateRoute reader reached a live Flutter project before anything caught them, precisely because
/// no fixture could express the shape — the harness gap was the root cause, not the missing test.
///
/// **Extends `MaterialApp`**, so the adapter claims it by resolved supertype exactly as it claims the
/// real thing. A stand-in that had to be recognised by its own name would be testing the wrong rule.
class RoutingApp extends MaterialApp {
  const RoutingApp({super.home, this.onGenerateRoute, super.theme, super.key});
  final Route<Object?>? Function(RouteSettings)? onGenerateRoute;
}

Object? showDialog<T>({required BuildContext context, required Widget Function(BuildContext) builder}) =>
    null;

Object? showModalBottomSheet<T>({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
}) => null;

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
  overlayNavigation();
  m7cGeneratedRoutes();
  m7bTransitionIdentity();
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

      // **The screen the navigation sits in survives.** This is the assertion that makes BRG1308 a
      // warning in fact rather than only in name, and it is the one a fix for the path departure keeps
      // breaking (M7-C §8).
      //
      // Dropping the edge must cost exactly the edge. The moment a `logic.Navigate` names the edge by
      // symbol, dropping the edge drops the departure too — and `node_factory._value` propagates that
      // upward through the statement list, the lambda, the element and the component, so the whole
      // screen goes with it. `Home` is then an ordinary declaration with no surviving node, which is
      // BRG1207, an **error**: the warning has become a build failure and the program is empty.
      //
      // Measured, not predicted: with the edge given a symbol this expectation fails with
      // `ui.Component: []` and `BRG1207 The declaration "comp:lib/main.dart#Home" is referenced, but
      // no node with its id survived the build`.
      expect(
        extracted.ofKind('ui.Component').map((Map<String, dynamic> c) => c['name']),
        containsAll(<String>['Home', 'Settings', 'App']),
        reason: 'an unresolved path must cost the edge, not the screen that navigates from it',
      );
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

/// M7-B — transition identity.
///
/// A departure's `logic.Navigate` names the `app.RouteTransition` it performs, **by `NodeId`**. What
/// these pin is that the binding is real: the id in the statement is the id of the edge. Nothing
/// downstream searches for it, which is the whole point — no span matching, no name matching, and the
/// generator reads a reference rather than reconstructing one.
void overlayNavigation() {
  group('a route overlay is a navigation to an inline destination', () {
    String app(String navigation) =>
        '''
import 'package:flutter/material.dart';

class Sheet extends StatelessWidget {
  const Sheet({super.key});
  @override
  Widget build(BuildContext context) => const Text('sheet');
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
    child: const Text('open'),
  );
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''';

    test('showDialog is a push, bound to the edge it performs', () async {
      // `showDialog` pushes a `DialogRoute` — ADR-0024 cites the SDK line. So an overlay is not a
      // separate concept from navigation, and it closes with the same construct.
      //
      // It is claimed **separately from the navigator methods** because it is a top-level function: the
      // navigator lookup keys on the enclosing type being `Navigator`, which could never match one. That
      // is why it fell through to a generic "not declared in this program" for as long as it did (M6-E).
      final Extracted extracted = await extractNav(
        app('showDialog<void>(context: context, builder: (BuildContext c) => const Sheet());'),
      );

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> navigate = extracted.ofKind('logic.Navigate').single;
      final Map<String, dynamic> edge = extracted.ofKind('app.RouteTransition').single;

      expect(navigate['action'], 'push');
      expect(navigate['transition'], edge['id']);
      // An inline destination: a component, never a path. §A17.6 — no URL, and none invented.
      expect(edge['component'], isA<String>());
      expect(edge['target'], isNull);
    });

    test('showModalBottomSheet is the same shape', () async {
      final Extracted extracted = await extractNav(
        app('showModalBottomSheet<void>(context: context, builder: (BuildContext c) => const Sheet());'),
      );

      expect(extracted.ofKind('logic.Navigate').single['action'], 'push');
      expect(extracted.ofKind('app.RouteTransition').single['component'], isA<String>());
    });

    test("an application's own showDialog is not Flutter's", () async {
      // C1, again. `showDialog` is an ordinary identifier and an application may declare one; claiming it
      // by spelling would put an edge in the route graph the program does not have. What makes it
      // Flutter's is that it resolves into `package:flutter/` — nothing about the call site says so.
      final Extracted extracted = await extractNav('''
import 'package:flutter/material.dart';

Object? showDialog<T>({required BuildContext context, required Widget Function(BuildContext) builder}) =>
    null;

class Sheet extends StatelessWidget {
  const Sheet({super.key});
  @override
  Widget build(BuildContext context) => const Text('sheet');
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
      showDialog<void>(context: context, builder: (BuildContext c) => const Sheet());
    },
    child: const Text('open'),
  );
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''');

      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
      expect(extracted.ofKind('logic.Navigate'), isEmpty);
    });

    test('an overlay whose builder does more than return a widget is refused, not guessed at', () async {
      final Extracted extracted = await extractNav(
        app('''
      showDialog<void>(
        context: context,
        builder: (BuildContext c) {
          debugPrint('building');
          return const Sheet();
        },
      );
'''),
      );

      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
      expect(extracted.ofKind('logic.Navigate'), isEmpty);
      expect(extracted.codes(Severity.warning), contains('BRG1304'));
    });
  });
}

void m7bTransitionIdentity() {
  group('M7-B — a departure names its edge', () {
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

    test('an inline push binds logic.Navigate.transition to the edge id', () async {
      final Extracted extracted = await extractNav(
        app(
          'Navigator.push<void>(context, '
          'MaterialPageRoute<void>(builder: (BuildContext c) => const Settings()));',
        ),
      );

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> navigate = extracted.ofKind('logic.Navigate').single;
      final Map<String, dynamic> edge = extracted.ofKind('app.RouteTransition').single;

      expect(navigate['action'], 'push');
      // The binding, and it is the milestone: not "a transition is present" but *the same id*. An
      // assertion on presence alone would pass against a node pointing at the wrong edge.
      expect(navigate['transition'], edge['id']);
      // The edge still carries the destination, so nothing downstream reconstructs one.
      expect(edge['component'], isA<String>());
    });

    test('pushReplacement binds the same way, with the replace action', () async {
      final Extracted extracted = await extractNav(
        app(
          'Navigator.pushReplacement<void, void>(context, '
          'MaterialPageRoute<void>(builder: (BuildContext c) => const Settings()));',
        ),
      );

      final Map<String, dynamic> navigate = extracted.ofKind('logic.Navigate').single;
      expect(navigate['action'], 'replace');
      expect(navigate['transition'], extracted.ofKind('app.RouteTransition').single['id']);
    });

    test('a path destination gets no identity, so the departure keeps refusing', () async {
      // A path resolves against the route table and its edge is **dropped** when nothing serves it
      // (BRG1308, a warning by design). A symbol would make the builder require that node to survive —
      // BRG1207 sweeps every declared symbol — so a path transition is deliberately given none, and the
      // departure keeps the capability refusal instead of naming an edge that might not be there.
      final Extracted extracted = await extractNav(
        app("Navigator.pushNamed(context, '/settings');"),
      );

      expect(extracted.errors, isEmpty);
      // The edge exists and resolves.
      expect(extracted.ofKind('app.RouteTransition').single['target'], isA<String>());
      // The departure does not.
      expect(extracted.ofKind('logic.Navigate'), isEmpty);
    });

    test('a pop carries no transition — §A17.3 says there is no edge to name', () async {
      final Extracted extracted = await extractNav(app('Navigator.pop(context);'));

      final Map<String, dynamic> navigate = extracted.ofKind('logic.Navigate').single;
      expect(navigate['action'], 'pop');
      expect(navigate.keys, isNot(contains('transition')));
      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
    });
  });
}

/// M7-C — a router written as an `onGenerateRoute` switch.
///
/// Both defects these pin reached a live Flutter project before anything caught them, because no fixture
/// could express the shape. That is why the stand-in gained `RouteSettings` and `RoutingApp`: the harness
/// gap was the root cause, and a test that could not have been written is not a test that was forgotten.
void m7cGeneratedRoutes() {
  group('M7-C — onGenerateRoute is read when it is a literal switch', () {
    String app(String body) =>
        '''
import 'package:flutter/material.dart';

class Settings extends StatelessWidget {
  const Settings({super.key});
  @override
  Widget build(BuildContext context) => const Text('settings');
}

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => const Text('home');
}

class App extends StatelessWidget {
  const App({super.key});

  static Route<Object?>? generate(RouteSettings settings) {
    $body
  }

  @override
  Widget build(BuildContext context) => RoutingApp(onGenerateRoute: generate);
}
''';

    test('every literal case becomes an app.Route', () async {
      // Dart 3 parses `case '/settings':` as a **SwitchPatternCase** holding a constant pattern; the
      // legacy `SwitchCase` node is what a pre-patterns switch produced. Matching only the legacy one
      // skipped every case *silently*, because that branch is the one handling `default:` — two labels
      // became zero routes and zero diagnostics, indistinguishable from the feature doing nothing.
      final Extracted extracted = await extractNav(
        app('''
    switch (settings.name) {
      case '/settings':
        return MaterialPageRoute<Object?>(builder: (BuildContext c) => const Settings());
      default:
        return MaterialPageRoute<Object?>(builder: (BuildContext c) => const Home());
    }
'''),
      );

      expect(extracted.errors, isEmpty);
      final List<Map<String, dynamic>> routes = extracted.ofKind('app.Route');
      // The labelled case only. `default:` serves every unmatched name and is not a path — inventing one
      // for it is the guess §A17.2 refused.
      expect(routes.map((Map<String, dynamic> r) => r['path']), <String>['/settings']);
      // And it points at a real component, not merely at *something*.
      expect(routes.single['component'], isA<String>());
    });

    test('a page-route subclass under another name is still a page route', () async {
      // The first implementation matched the constructor's *lexeme*. A subclass named anything else is
      // what separates that from resolved-type recognition — and it is ordinary Flutter, not a corner.
      final Extracted extracted = await extractNav(
        app('''
    switch (settings.name) {
      case '/settings':
        return BrandedPageRoute<Object?>(builder: (BuildContext c) => const Settings());
      default:
        return null;
    }
'''),
      );

      expect(extracted.ofKind('app.Route').single['path'], '/settings');
    });

    test('a non-constant case is reported, not guessed at', () async {
      final Extracted extracted = await extractNav(
        app('''
    const String dynamicPath = 'x';
    switch (settings.name) {
      case dynamicPath + '/y':
        return MaterialPageRoute<Object?>(builder: (BuildContext c) => const Settings());
      default:
        return null;
    }
'''),
      );

      expect(extracted.ofKind('app.Route'), isEmpty);
    });

    test('a body that is not a single switch keeps the refusal', () async {
      // A callback that computes its routes is what BRG1304 is genuinely true of. The diagnostic was
      // narrowed to that case rather than weakened.
      final Extracted extracted = await extractNav(
        app('''
    if (settings.name == null) {
      return null;
    }
    return MaterialPageRoute<Object?>(builder: (BuildContext c) => const Home());
'''),
      );

      expect(extracted.ofKind('app.Route'), isEmpty);
      expect(extracted.codes(Severity.warning), contains('BRG1304'));
    });
  });
}
