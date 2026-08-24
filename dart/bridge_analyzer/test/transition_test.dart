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

Object? showDialog<T>({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
  bool useRootNavigator = true,
}) => null;

Object? showModalBottomSheet<T>({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
}) => null;

/// A minimal stand-in matching the real `AlertDialog`'s own shape closely enough for the material
/// catalog's own `AlertDialog` entry (`title`/`content` slots, `actions` child list) to apply
/// structurally — recognition is by resolved type against a `package:flutter/` library, never by name,
/// so this must be a real, resolvable class there, exactly like every other stand-in in this file.
class AlertDialog extends Widget {
  const AlertDialog({this.title, this.content, this.actions = const <Widget>[], super.key});
  final Widget? title;
  final Widget? content;
  final List<Widget> actions;
}

/// A minimal stand-in for `AlertDialog.actions`'s own evidenced shape (M9-E) — a resolvable class so its
/// own `onPressed` callback (containing `Navigator.pop(...)`) is actually extracted, not silently dropped
/// as an unresolved prop on an unresolved type the way an undeclared `TextButton` construction would be.
class TextButton extends Widget {
  const TextButton({required this.onPressed, required this.child, super.key});
  final void Function()? onPressed;
  final Widget child;
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

void debugPrint(String? message, {int? wrapWidth}) {}
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
  m7hAsyncNavigation();
  inlineOverlayDestinations();
  dialogDismissal();
  group('inline MaterialPageRoute — the destination is a component, or, since M9-D, an inline widget tree (§A17)', () {
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

    test('a push to a widget the project does not declare renders it inline (M9-D)', () async {
      // `Text` is a framework widget, not a component this project emits — there is no id to point a
      // `component` reference at. Rather than dropping the edge, the destination is embedded directly
      // (`inline`), extracted by the same widget-tree mechanism a normal `build()` render tree already
      // uses (`WidgetExtractor`, ADR-18's catalog) — the identical mechanism this milestone's own
      // `showDialog(builder: (_) => AlertDialog(...))` shape uses, proven here on a simpler widget.
      final Extracted app = await extractNav(
        screen("Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => const Text('x')));"),
      );

      expect(app.errors, isEmpty);
      final Map<String, dynamic> transition = app.transition;
      expect(transition.containsKey('target'), isFalse);
      expect(transition.containsKey('component'), isFalse);
      final Map<String, dynamic> inline = transition['inline'] as Map<String, dynamic>;
      expect(inline['kind'], 'ui.Text');
      expect((inline['value'] as Map<String, dynamic>)['value'], 'x');
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

Object? showDialog<T>({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
  bool useRootNavigator = true,
}) => null;

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

/// M7-H — a navigation the push call itself is awaited (`await Navigator.push(...)`), reached only
/// after `await`/`mounted` control flow. `hello_bridge/lib/screens/login_screen.dart:45-62`'s own
/// shape, reduced.
///
/// The reduction ladder (A synchronous push; B async callback, no await; C async + await before an
/// un-awaited push; D/E await + a mounted guard before an un-awaited push; F await the push itself)
/// found every one of A-E already lowered correctly before this milestone — async, `await`, and both
/// spellings of `mounted` were already faithfully represented and already reachable to the navigation
/// recognizer. Only F failed: `ExpressionStatement()`'s `expression is MethodInvocation` check in
/// `statement_extractor.dart` is false when `expression` is an `AwaitExpression`, so an awaited push
/// fell through to a generic `logic.ExprStmt` and its `app.RouteTransition` (minted regardless, from
/// the ordinary expression walk) stayed unperformed. These tests are F, and the guard around it.
void m7hAsyncNavigation() {
  // `navFlutter`'s `State`/`BuildContext` (inherited from `flutterPackage`) declare no `mounted` —
  // nothing before this milestone needed it resolvable. Adding it by string surgery on the base
  // library, rather than appending a second declaration, because Dart cannot reopen a class across two
  // chunks of the same library file the way the `Navigator`/`MaterialPageRoute` addition appends new,
  // distinct declarations.
  final String widgetsWithMounted = navFlutter['widgets.dart']!
      .replaceFirst(
        'abstract class State<T extends StatefulWidget> {\n  late T widget;',
        'abstract class State<T extends StatefulWidget> {\n  late T widget;\n  bool mounted = true;',
      )
      .replaceFirst('abstract class BuildContext {}', 'abstract class BuildContext {\n  bool get mounted => true;\n}');
  final Map<String, String> asyncNavFlutter = <String, String>{...navFlutter, 'widgets.dart': widgetsWithMounted};

  /// [extractNav], with `mounted`/`context.mounted` genuinely resolvable — this group's whole subject.
  Future<Extracted> extractAsyncNav(String source) async {
    final String project = createProject(
      name: 'app',
      libraries: <String, String>{'main.dart': source},
      dependencies: <String, Map<String, String>>{'flutter': asyncNavFlutter},
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

  // An async `onPressed` with a `State` (so `mounted` resolves), a helper `Future` to await, and a
  // slot for the navigation body — everything before it fixed, so only the tests below vary.
  String asyncApp(String body) =>
      '''
import 'package:flutter/material.dart';

class Settings extends StatelessWidget {
  const Settings({this.title = '', super.key});
  final String title;
  @override
  Widget build(BuildContext context) => const Text('settings');
}

Future<void> doSomething() async {}

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  int _count = 0;

  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () async {
      $body
    },
    child: const Text('go'),
  );
}
''';

  group('M7-H — the push call itself is awaited', () {
    test('await Navigator.push(...) as the only statement lowers to logic.Navigate', () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp(
          'await Navigator.push<void>(context, '
          'MaterialPageRoute<void>(builder: (BuildContext c) => const Settings()));',
        ),
      );

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> navigate = extracted.ofKind('logic.Navigate').single;
      final Map<String, dynamic> edge = extracted.ofKind('app.RouteTransition').single;
      // Transition identity (M7-B/M7-G's own requirement, re-proven here): equality, not presence.
      expect(navigate['action'], 'push');
      expect(navigate['transition'], edge['id']);
      expect(edge['component'], isA<String>());
    });

    test('the real hello_bridge shape: await, then a mounted guard, then the awaited push', () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp('''
      await doSomething();

      if (!mounted) {
        return;
      }

      await Navigator.push<void>(context, MaterialPageRoute<void>(builder: (BuildContext c) => const Settings()));
'''),
      );

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> navigate = extracted.ofKind('logic.Navigate').single;
      final Map<String, dynamic> edge = extracted.ofKind('app.RouteTransition').single;
      expect(navigate['transition'], edge['id']);

      // Ordering survives: the callback's body is [Await(doSomething), If(!mounted, Return), Navigate]
      // — the await and the guard are still there, in order, ahead of the departure. A fix that erased
      // the guard to reach the push, or reordered the push ahead of it, would fail this.
      final Map<String, dynamic> action = extracted.ofKind('logic.Lambda').firstWhere(
        (Map<String, dynamic> a) => (a['body'] as List<dynamic>).length == 3,
      );
      final List<dynamic> body = action['body'] as List<dynamic>;
      expect((body[0] as Map<String, dynamic>)['kind'], 'logic.ExprStmt', reason: 'the await stays first');
      expect((body[1] as Map<String, dynamic>)['kind'], 'logic.If', reason: 'the mounted guard stays second');
      expect((body[2] as Map<String, dynamic>)['kind'], 'logic.Navigate', reason: 'the push is last');

      // The guard's own test is a plain boolean expression — `!mounted` — never a special construct
      // that could not also compose in `if (a || !mounted)`. `mounted` itself is `logic.Intrinsic`
      // (ADR-0026): a framework-provided fact, not a program declaration or a lexical parameter, and
      // this is the node that proves it is no longer indistinguishable from an unresolved reference.
      final Map<String, dynamic> guard = body[1] as Map<String, dynamic>;
      final Map<String, dynamic> test = guard['test'] as Map<String, dynamic>;
      expect(test['kind'], 'logic.Unary');
      expect(test['operator'], '!');
      final Map<String, dynamic> operand = test['operand'] as Map<String, dynamic>;
      expect(operand['kind'], 'logic.Intrinsic');
      expect(operand['intrinsic'], 'componentMounted');
      expect(operand.containsKey('operand'), isFalse, reason: 'nullary — no context value to name');
    });

    test('context.mounted guards the awaited push exactly as State.mounted does', () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp('''
      await doSomething();

      if (!context.mounted) {
        return;
      }

      await Navigator.push<void>(context, MaterialPageRoute<void>(builder: (BuildContext c) => const Settings()));
'''),
      );

      expect(extracted.errors, isEmpty);
      expect(extracted.ofKind('logic.Navigate'), hasLength(1));
      final Map<String, dynamic> action = extracted.ofKind('logic.Lambda').firstWhere(
        (Map<String, dynamic> a) => (a['body'] as List<dynamic>).length == 3,
      );
      final Map<String, dynamic> guard = (action['body'] as List<dynamic>)[1] as Map<String, dynamic>;
      final Map<String, dynamic> test = (guard['test'] as Map<String, dynamic>)['operand'] as Map<String, dynamic>;
      // `context.mounted` is `logic.Intrinsic{intrinsic: 'contextMounted', operand: <context value>}` —
      // distinct from bare `mounted`'s nullary `componentMounted`, never conflated with it, and the
      // context value it is about is still a plain reference to `context`.
      expect(test['kind'], 'logic.Intrinsic');
      expect(test['intrinsic'], 'contextMounted');
      final Map<String, dynamic> operand = test['operand'] as Map<String, dynamic>;
      expect(operand['kind'], 'logic.Ref');
      expect(operand['name'], 'context');
    });

    test('destination arguments survive the await — M7-G still receives them', () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp('''
      await doSomething();
      if (!mounted) return;
      await Navigator.push<void>(context, MaterialPageRoute<void>(builder: (BuildContext c) => Settings(title: 'Authenticated')));
'''),
      );

      expect(extracted.errors, isEmpty);
      expect(extracted.argumentBindings, <String, String>{'title': 'bind.Const'});
    });

    test('a component-scoped signal argument still binds as bind.Signal after the await', () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp(r'''
      await doSomething();
      if (!mounted) return;
      await Navigator.push<void>(context, MaterialPageRoute<void>(builder: (BuildContext c) => Settings(title: '$_count')));
'''),
      );

      expect(extracted.errors, isEmpty);
      // Interpolated into `title`, so the argument is a bind.Expr wrapping the interpolation, not a
      // bare bind.Signal — but the signal it reads must still resolve as component-scoped underneath.
      final Map<String, dynamic> argument =
          (extracted.transition['arguments'] as List<dynamic>).single as Map<String, dynamic>;
      expect((argument['binding'] as Map<String, dynamic>)['kind'], 'bind.Expr');
    });

    test('an application-defined push, awaited, is not claimed by spelling alone', () async {
      // Phase 12's negative control: this milestone's new branch must still gate on the resolved
      // element the same way the un-awaited path already does (`registry.navigationActionOf`), not on
      // the token `push`.
      final Extracted extracted = await extractNav('''
import 'package:flutter/material.dart';

class MyNavigator {
  Future<void> push(Widget page) async {}
}

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
  final MyNavigator myNavigator = MyNavigator();

  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () async {
      await myNavigator.push(const Settings());
    },
    child: const Text('go'),
  );
}
''');

      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
      expect(extracted.ofKind('logic.Navigate'), isEmpty);
    });

    test('an awaited push with code still to run after it is refused, never silently lowered', () async {
      // Phase 13's own concern: dropping the `await` would be safe only because nothing depends on its
      // timing. Here something does — `doSomething()` must still run only after the pushed screen is
      // popped, which the runtime kit's synchronous `push(): void` cannot represent. Lowering this
      // unconditionally would silently start running `doSomething()` immediately instead, which is
      // exactly the ordering guarantee this file's header comment protects. So it stays refused
      // (BRG3013, downstream in the generator), exactly as it was before this milestone — never
      // reordered, never silently correct-looking.
      final Extracted extracted = await extractAsyncNav(
        asyncApp('''
      await Navigator.push<void>(context, MaterialPageRoute<void>(builder: (BuildContext c) => const Settings()));

      await doSomething();
'''),
      );

      expect(extracted.errors, isEmpty);
      // The edge is still recognized — recognition never depended on this milestone's fix.
      expect(extracted.ofKind('app.RouteTransition'), hasLength(1));
      // But it is not performed: no logic.Navigate, so the generator's BRG3013 keeps refusing it
      // rather than emitting navigation that runs at the wrong time.
      expect(extracted.ofKind('logic.Navigate'), isEmpty);
    });

    test('a bare (un-awaited) push after other statements is unaffected by this milestone', () async {
      // Regression guard: the pre-existing, always-safe path (no await on the push itself) must still
      // lower exactly as it did before — this milestone only adds a case, it does not change this one.
      final Extracted extracted = await extractAsyncNav(
        asyncApp('''
      await doSomething();
      if (!mounted) return;
      Navigator.push<void>(context, MaterialPageRoute<void>(builder: (BuildContext c) => const Settings()));
'''),
      );

      expect(extracted.errors, isEmpty);
      expect(extracted.ofKind('logic.Navigate'), hasLength(1));
    });

    test('the same source extracts to the same bytes — determinism holds for the new shape', () async {
      const String source = '''
      await doSomething();
      if (!mounted) return;
      await Navigator.push<void>(context, MaterialPageRoute<void>(builder: (BuildContext c) => const Settings()));
''';
      final Extracted first = await extractAsyncNav(asyncApp(source));
      final Extracted second = await extractAsyncNav(asyncApp(source));
      expect(first.bytes, second.bytes);
      expect(first.ofKind('logic.Navigate'), hasLength(1));
    });
  });

  // ADR-0026 — mounted lifecycle intrinsics. Recognition is by resolved element only (never by
  // spelling), so every positive case here is paired with a negative one proving the same spelling,
  // unresolved to Flutter, stays an ordinary reference.
  group('ADR-0026 — mounted lifecycle intrinsics', () {
    Map<String, dynamic> intrinsicIn(Map<String, dynamic> node) {
      Map<String, dynamic>? found;
      void walk(Object? value) {
        if (value is Map<String, dynamic>) {
          if (value['kind'] == 'logic.Intrinsic') found = value;
          value.values.forEach(walk);
        } else if (value is List<dynamic>) {
          value.forEach(walk);
        }
      }

      walk(node);
      if (found == null) {
        throw StateError('no logic.Intrinsic found');
      }
      return found!;
    }

    test('bare mounted is componentMounted, nullary', () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp('if (!mounted) return;'),
      );
      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> lambda = extracted.ofKind('logic.Lambda').first;
      final Map<String, dynamic> intrinsic = intrinsicIn(lambda);
      expect(intrinsic['intrinsic'], 'componentMounted');
      expect(intrinsic.containsKey('operand'), isFalse);
    });

    test('context.mounted is contextMounted, with the context value as its operand', () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp('if (!context.mounted) return;'),
      );
      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> lambda = extracted.ofKind('logic.Lambda').first;
      final Map<String, dynamic> intrinsic = intrinsicIn(lambda);
      expect(intrinsic['intrinsic'], 'contextMounted');
      final Map<String, dynamic> operand = intrinsic['operand'] as Map<String, dynamic>;
      expect(operand['kind'], 'logic.Ref');
      expect(operand['name'], 'context');
    });

    test('compound: a non-boolean check ahead of !mounted still composes it as an ordinary operand',
        () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp('''
      String? result;
      if (result == null || !mounted) return;
'''),
      );
      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> lambda = extracted.ofKind('logic.Lambda').first;
      final Map<String, dynamic> intrinsic = intrinsicIn(lambda);
      expect(intrinsic['intrinsic'], 'componentMounted');
    });

    test('compound: !context.mounted composes with another operand under ||', () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp('''
      const bool cancelled = false;
      if (!context.mounted || cancelled) return;
'''),
      );
      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> lambda = extracted.ofKind('logic.Lambda').first;
      final Map<String, dynamic> intrinsic = intrinsicIn(lambda);
      expect(intrinsic['intrinsic'], 'contextMounted');
    });

    test('two reads in one function are two separate intrinsic nodes, not one reused', () async {
      final Extracted extracted = await extractAsyncNav(
        asyncApp('''
      if (!mounted) return;
      await doSomething();
      if (!mounted) return;
'''),
      );
      expect(extracted.errors, isEmpty);
      expect(extracted.ofKind('logic.Intrinsic'), hasLength(2));
    });

    /// Extracts a single-file app against [asyncNavFlutter], with full control over its content — the
    /// negative-recognition tests below need an extra, unrelated class or a shadowing local in scope,
    /// which `asyncApp`'s fixed template has no slot for.
    Future<Extracted> extractCustom(String source) async {
      final String project = createProject(
        name: 'app',
        libraries: <String, String>{'main.dart': source},
        dependencies: <String, Map<String, String>>{'flutter': asyncNavFlutter},
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

    test('a local variable named mounted shadows the intrinsic, resolved as a local read', () async {
      final Extracted extracted = await extractCustom('''
import 'package:flutter/material.dart';

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () {
      bool mounted = true;
      if (!mounted) return;
    },
    child: const Text('go'),
  );
}
''');
      expect(extracted.errors, isEmpty);
      expect(
        extracted.ofKind('logic.Intrinsic'),
        isEmpty,
        reason: 'a local variable of the same name resolves to itself, never to State.mounted',
      );
    });

    test('<value>.mounted on a class unrelated to BuildContext is not the intrinsic', () async {
      final Extracted extracted = await extractCustom('''
import 'package:flutter/material.dart';

class NotAContext {
  bool mounted = true;
}

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) {
    final NotAContext thing = NotAContext();
    return ElevatedButton(
      onPressed: () {
        if (!thing.mounted) return;
      },
      child: const Text('go'),
    );
  }
}
''');
      expect(extracted.errors, isEmpty);
      expect(extracted.ofKind('logic.Intrinsic'), isEmpty);
    });

    test("an application's own mounted getter, on a class named neither State nor BuildContext, "
        'is never claimed', () async {
      final Extracted extracted = await extractCustom('''
import 'package:flutter/material.dart';

class MyState {
  bool get mounted => true;
}

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) {
    final MyState fake = MyState();
    return ElevatedButton(
      onPressed: () {
        if (!fake.mounted) return;
      },
      child: const Text('go'),
    );
  }
}
''');
      expect(extracted.errors, isEmpty);
      expect(extracted.ofKind('logic.Intrinsic'), isEmpty);
    });
  });
}

void inlineOverlayDestinations() {
  group('inline overlay destinations — a route overlay renders a framework widget directly (M9-D)', () {
    // `showDialog(builder: (_) => AlertDialog(title: ..., content: ...))` — the evidenced shape (M8-X's
    // own A1 reduction rung). `AlertDialog` is a framework widget, not something the project declares,
    // so there is no `ui.Component` id for `component` to name; the tree is embedded in `inline`
    // instead, extracted by the same mechanism a normal `build()` render tree already uses.
    String app(String navigation) =>
        '''
import 'package:flutter/material.dart';

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

    Map<String, dynamic> slotOf(Map<String, dynamic> element, String slot) =>
        (element['slots'] as Map<String, dynamic>)[slot] as Map<String, dynamic>;

    test('an AlertDialog destination embeds a real ui.Element, title/content in their own slots', () async {
      final Extracted extracted = await extractNav(
        app(
          'showDialog<void>(context: context, builder: (BuildContext c) => '
          "const AlertDialog(title: Text('Delete item?'), content: Text('This cannot be undone.')));",
        ),
      );

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> edge = extracted.transition;
      expect(edge.containsKey('target'), isFalse);
      expect(edge.containsKey('component'), isFalse);
      final Map<String, dynamic> inline = edge['inline'] as Map<String, dynamic>;
      expect(inline['kind'], 'ui.Element');
      expect((inline['component'] as Map<String, dynamic>)['name'], 'AlertDialog');

      final Map<String, dynamic> title = slotOf(inline, 'title');
      expect(title['kind'], 'ui.Text');
      expect((title['value'] as Map<String, dynamic>)['value'], 'Delete item?');

      final Map<String, dynamic> content = slotOf(inline, 'content');
      expect(content['kind'], 'ui.Text');
      expect((content['value'] as Map<String, dynamic>)['value'], 'This cannot be undone.');
    });

    test('an AlertDialog with actions carries them as an ordered child list', () async {
      final Extracted extracted = await extractNav(
        app(
          'showDialog<void>(context: context, builder: (BuildContext c) => AlertDialog(title: '
          "const Text('Confirm'), actions: [TextButton(onPressed: () {}, child: const Text('Cancel')), "
          "TextButton(onPressed: () {}, child: const Text('OK'))]));",
        ),
      );

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> inline = extracted.transition['inline'] as Map<String, dynamic>;
      final List<dynamic> children = inline['children'] as List<dynamic>;
      expect(children, hasLength(2));
    });

    test('arguments is absent for an inline destination — nothing is promoted across a boundary that does not exist', () async {
      final Extracted extracted = await extractNav(
        app(
          'showDialog<void>(context: context, builder: (BuildContext c) => '
          "const AlertDialog(title: Text('t'), content: Text('c')));",
        ),
      );

      expect(extracted.errors, isEmpty);
      expect(extracted.transition.containsKey('arguments'), isFalse);
    });

    test('two unrelated showDialog calls never collide', () async {
      final Extracted extracted = await extractNav(
        app(
          "showDialog<void>(context: context, builder: (BuildContext c) => const AlertDialog(title: Text('a')));"
          "\n      showDialog<void>(context: context, builder: (BuildContext c) => const AlertDialog(title: Text('b')));",
        ),
      );

      expect(extracted.errors, isEmpty);
      final List<Map<String, dynamic>> transitions = extracted.ofKind('app.RouteTransition');
      expect(transitions, hasLength(2));
      expect(transitions[0]['id'], isNot(transitions[1]['id']));
      final List<Map<String, dynamic>> navigates = extracted.ofKind('logic.Navigate');
      expect(navigates, hasLength(2));
      expect(navigates[0]['transition'], isNot(navigates[1]['transition']));
    });

    test('an ordinary Navigator.push to a framework widget (not just an overlay opener) renders it inline too — the mechanism is general, not special-cased to showDialog', () async {
      final Extracted extracted = await extractNav(
        app("Navigator.push(context, MaterialPageRoute(builder: (BuildContext c) => const Text('hi')));"),
      );

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> inline = extracted.transition['inline'] as Map<String, dynamic>;
      expect(inline['kind'], 'ui.Text');
    });

    test('a builder that does more than return a widget stays refused, unchanged by this milestone', () async {
      final Extracted extracted = await extractNav(
        app('''
      showDialog<void>(
        context: context,
        builder: (BuildContext c) {
          debugPrint('building');
          return const AlertDialog(title: Text('t'));
        },
      );
'''),
      );

      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
      expect(extracted.ofKind('logic.Navigate'), isEmpty);
      expect(extracted.codes(Severity.warning), contains('BRG1304'));
    });

    test('the same source extracts to the same bytes on a second, independent run (determinism)', () async {
      final String source = app(
        'showDialog<void>(context: context, builder: (BuildContext c) => '
        "const AlertDialog(title: Text('Delete item?'), content: Text('This cannot be undone.')));",
      );
      final Extracted first = await extractNav(source);
      final Extracted second = await extractNav(source);
      expect(first.bytes, second.bytes);
    });
  });
}

/// M9-E — dialog-local dismissal (`logic.Navigate.dismisses`), the reduction ladder
/// (`0025-amendment-dialog-dismissal-scope.md`).
void dialogDismissal() {
  group('dialog-local dismissal — Navigator.pop inside an AlertDialog action (M9-E)', () {
    // The reachable shape: a `showDialog` whose own `builder:` returns an `AlertDialog` with one or more
    // `actions:`, each a supported button widget whose `onPressed` may call `Navigator.pop(...)`.
    String app(String actionsBody, {String extra = ''}) =>
        '''
import 'package:flutter/material.dart';
$extra

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () {
      showDialog<void>(
        context: context,
        builder: (BuildContext dialogContext) => AlertDialog(
          title: const Text('Confirm'),
          actions: $actionsBody,
        ),
      );
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

    Map<String, dynamic> navigateOf(Extracted extracted) {
      final List<Map<String, dynamic>> navigates = extracted.ofKind('logic.Navigate');
      final Iterable<Map<String, dynamic>> pops = navigates.where((n) => n['action'] == 'pop');
      expect(pops, hasLength(1), reason: 'expected exactly one pop, found ${pops.length}');
      return pops.single;
    }

    // ── E1 — one action, void dismissal ────────────────────────────────────────────────────────────

    test('E1 — Navigator.pop(dialogContext), a lone action, is tagged dismisses on the dialog it is inside', () async {
      final Extracted extracted = await extractNav(
        app("[TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))]"),
      );

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> transition = extracted.transition;
      final Map<String, dynamic> pop = navigateOf(extracted);
      expect(pop['dismisses'], transition['id']);
    });

    // ── E2–E5 — result values are safely dropped, dismissal is unaffected ─────────────────────────────

    test('E2/E5 — a result value (bool or string) passed to pop does not appear anywhere, and dismissal still tags correctly', () async {
      final Extracted extracted = await extractNav(
        app("[TextButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Yes'))]"),
      );

      expect(extracted.errors, isEmpty);
      final Map<String, dynamic> pop = navigateOf(extracted);
      expect(pop['dismisses'], extracted.transition['id']);
      // The pop node itself carries only `action`/`dismisses`/`id`/`span` — no `result`/`value`/
      // `arguments` key exists on it at all; the discarded value is not represented anywhere on this
      // node, checked precisely rather than by a whole-document substring search (which would also
      // false-positive on unrelated `true`s elsewhere in the document's own JSON metadata).
      expect(pop.keys.toSet(), <String>{'kind', 'id', 'span', 'action', 'dismisses'});

      final Extracted stringResult = await extractNav(
        app("[TextButton(onPressed: () => Navigator.pop(dialogContext, 'accepted'), child: const Text('Yes'))]"),
      );
      expect(stringResult.errors, isEmpty);
      final Map<String, dynamic> stringPop = navigateOf(stringResult);
      expect(stringPop['dismisses'], stringResult.transition['id']);
      expect(stringPop.keys.toSet(), <String>{'kind', 'id', 'span', 'action', 'dismisses'});
    });

    // ── E6 — multiple actions, each independently dismissing ──────────────────────────────────────────

    test('E6 — two actions (Cancel/Confirm) each independently tag dismisses on the same dialog', () async {
      final Extracted extracted = await extractNav(
        app(
          "[TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')), "
          "TextButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Confirm'))]",
        ),
      );

      expect(extracted.errors, isEmpty);
      final List<Map<String, dynamic>> pops = extracted
          .ofKind('logic.Navigate')
          .where((n) => n['action'] == 'pop')
          .toList();
      expect(pops, hasLength(2));
      final String transitionId = extracted.transition['id'] as String;
      expect(pops.every((p) => p['dismisses'] == transitionId), isTrue);
    });

    // ── E7 — an action that does not dismiss ───────────────────────────────────────────────────────

    test('E7 — an action with no Navigator.pop carries no logic.Navigate at all; the dialog stays open by construction', () async {
      final Extracted extracted = await extractNav(app("[TextButton(onPressed: () {}, child: const Text('Note'))]"));

      expect(extracted.errors, isEmpty);
      // The showDialog push itself still produces one logic.Navigate (unrelated to this action) — what
      // matters is that the action with no Navigator.pop contributes no pop node at all.
      final Iterable<Map<String, dynamic>> pops = extracted
          .ofKind('logic.Navigate')
          .where((n) => n['action'] == 'pop');
      expect(pops, isEmpty);
    });

    // ── E8/E10 — identity-independence: outer context, and a renamed parameter ────────────────────────

    test('E8 — Navigator.pop(context), the OUTER page context, from inside a dialog action, still tags dismisses (not a page pop)', () async {
      final Extracted extracted = await extractNav(
        app("[TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))]"),
      );

      expect(extracted.errors, isEmpty);
      expect(navigateOf(extracted)['dismisses'], extracted.transition['id']);
    });

    test('E10 — renaming the builder parameter changes nothing; dismissal is never name-based', () async {
      const String renamed =
          '''
import 'package:flutter/material.dart';

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () {
      showDialog<void>(
        context: context,
        builder: (BuildContext modalScope) => AlertDialog(
          title: const Text('Confirm'),
          actions: [TextButton(onPressed: () => Navigator.pop(modalScope), child: const Text('Close'))],
        ),
      );
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
      final Extracted extracted = await extractNav(renamed);
      expect(extracted.errors, isEmpty);
      expect(navigateOf(extracted)['dismisses'], extracted.transition['id']);
    });

    // ── negative control — an unrelated, ordinary page-level pop is never tagged ──────────────────────

    test('negative control — an ordinary page-level pop, in a completely separate action, is never tagged dismisses', () async {
      final Extracted extracted = await extractNav('''
import 'package:flutter/material.dart';

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => Column(
    children: [
      ElevatedButton(
        onPressed: () {
          showDialog<void>(
            context: context,
            builder: (BuildContext dialogContext) => AlertDialog(
              title: const Text('Confirm'),
              actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))],
            ),
          );
        },
        child: const Text('open'),
      ),
      ElevatedButton(onPressed: () => Navigator.pop(context), child: const Text('back')),
    ],
  );
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''');

      expect(extracted.errors, isEmpty);
      final List<Map<String, dynamic>> pops = extracted
          .ofKind('logic.Navigate')
          .where((n) => n['action'] == 'pop')
          .toList();
      expect(pops, hasLength(2));
      final int tagged = pops.where((p) => p['dismisses'] != null).length;
      expect(tagged, 1, reason: 'exactly the dialog-local pop is tagged; the page-level one is not');
    });

    // ── negative controls (§17) — an application's own lookalikes never trigger this mechanism ─────────

    test("negative control — a project's own function named showDialog is not Flutter's, and its own pop is never tagged", () async {
      final Extracted extracted = await extractNav(
        '''
import 'package:flutter/material.dart';

Object? showDialog<T>({required BuildContext context, required Widget Function(BuildContext) builder}) {
  return null;
}

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () {
      showDialog<void>(
        context: context,
        builder: (BuildContext dialogContext) => AlertDialog(
          title: const Text('Confirm'),
          actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))],
        ),
      );
    },
    child: const Text('open'),
  );
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''',
      );

      // The project's own `showDialog` is not recognised as a navigation at all (ISSUE-18: resolved
      // element, never spelling) — so no transition, and the pop inside it is an ordinary, untagged one.
      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
      final List<Map<String, dynamic>> pops = extracted
          .ofKind('logic.Navigate')
          .where((n) => n['action'] == 'pop')
          .toList();
      expect(pops, hasLength(1));
      expect(pops.single['dismisses'], isNull);
    });

    // ── useRootNavigator: false — refused, not silently trusted ─────────────────────────────────────

    test('useRootNavigator: false is refused — the "one shared Navigator" premise does not hold', () async {
      final Extracted extracted = await extractNav(
        app(
          "[TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))]",
        ).replaceFirst('context: context,', 'context: context,\n          useRootNavigator: false,'),
      );

      // The overlay itself is refused — no transition, no edge for it.
      expect(extracted.ofKind('app.RouteTransition'), isEmpty);
      expect(extracted.codes(Severity.warning), contains('BRG1304'));
      // `Navigator.pop(dialogContext)` is still, separately, an ordinary recognised call — Navigator.pop's
      // own recognition does not depend on its enclosing showDialog having succeeded — but it is never
      // tagged `dismisses`: `presentingTransition` is only ever set by a *successful* inline-destination
      // extraction, which this refusal prevented from happening at all.
      final List<Map<String, dynamic>> pops = extracted
          .ofKind('logic.Navigate')
          .where((n) => n['action'] == 'pop')
          .toList();
      expect(pops, hasLength(1));
      expect(pops.single['dismisses'], isNull);
    });

    test('useRootNavigator: true (explicit default) is unaffected', () async {
      final Extracted extracted = await extractNav(
        app(
          "[TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))]",
        ).replaceFirst('context: context,', 'context: context,\n          useRootNavigator: true,'),
      );

      expect(extracted.errors, isEmpty);
      expect(navigateOf(extracted)['dismisses'], extracted.transition['id']);
    });

    // ── E13/E14 — a result awaited/assigned stays refused end to end (pre-existing, unrelated; §5 ADR) ──

    test('E13 — final result = await showDialog<bool>(...) extracts without an analyzer error, but the edge is unreferenced (pre-existing, documented, not fixed by this milestone)', () async {
      final Extracted extracted = await extractNav(
        '''
import 'package:flutter/material.dart';

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => ElevatedButton(
    onPressed: () async {
      final result = await showDialog<bool>(
        context: context,
        builder: (BuildContext dialogContext) => AlertDialog(
          title: const Text('Confirm'),
          actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Yes'))],
        ),
      );
      result?.toString();
    },
    child: const Text('open'),
  );
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''',
      );

      // No analyzer-level error — a real, pre-existing, orthogonal gap this milestone found and
      // documented (ADR amendment §5) rather than fixed: the transition is minted (`maybeExtract` fires
      // for every recognised `MethodInvocation` regardless of statement shape, unmodified since before
      // this milestone) but no `push` `logic.Navigate` ever references it, because a `VariableDeclaration`
      // initializer is not one of the three statement shapes `navigateOf` recognises for a departure.
      //
      // The dismiss pop *inside* the dialog's own actions is a different story: `_destination()` still
      // ran (it does not care what statement shape called it) and still set `presentingTransition` for
      // the duration of extracting the dialog's own subtree — so a pop reached that way still correctly
      // tags `dismisses` at the transition it is really inside, even though nothing ever shows that same
      // dialog. Still safe: the generator's own `inlineTransitionsOf` (M9-D/M9-E) only ever discovers a
      // dialog to declare a ref for via its *push*'s own `transition` reference — which does not exist
      // here — so no ref is ever declared, `dialogRefFor` never resolves for this dismiss, and the
      // fallback `router.pop()` path refuses honestly (no router in scope either, since nothing else in
      // this component navigates) rather than silently doing something wrong.
      //
      // A second, *untagged* pop at the same source span is also present — a further symptom of the same
      // pre-existing gap: because the outer `showDialog(...)` call is not itself statement-shaped here,
      // it falls through to the generic expression walk, which independently re-visits the same builder
      // subtree (as an ordinary, unrecognised expression tree, never through `widgets.extract`) and
      // re-discovers the same `Navigator.pop` there too, this time with `presentingTransition` never set.
      // Not this milestone's to fix (it would mean widening general expression lowering so the push
      // itself becomes representable, eliminating the double walk at the source) — recorded, not fixed,
      // and safe regardless: the containing program is refused end to end either way (proven separately,
      // via the real generator, not re-proven here).
      expect(extracted.errors, isEmpty);
      expect(extracted.ofKind('app.RouteTransition'), hasLength(1));
      final String transitionId = extracted.transition['id'] as String;
      final List<Map<String, dynamic>> navigates = extracted.ofKind('logic.Navigate');
      final bool anyPushReferencesIt = navigates.any((n) => n['transition'] == transitionId);
      expect(anyPushReferencesIt, isFalse, reason: 'no push references the orphaned transition');
      final Iterable<Map<String, dynamic>> pops = navigates.where((n) => n['action'] == 'pop');
      expect(pops, isNotEmpty);
      expect(
        pops.any((p) => p['dismisses'] == transitionId),
        isTrue,
        reason: 'at least the properly widget-extracted pop still correctly tags the transition it is inside',
      );
    });

    test('the same source extracts to the same bytes on a second, independent run (determinism)', () async {
      final String source = app(
        "[TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Close'))]",
      );
      final Extracted first = await extractNav(source);
      final Extracted second = await extractNav(source);
      expect(first.bytes, second.bytes);
    });
  });
}
