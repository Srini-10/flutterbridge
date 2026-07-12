/// The package adapter registry (M1-T9).
///
/// Adapters are where the compiler's package knowledge lives — **all** of it. These tests run the real
/// pipeline against real, resolved projects with a real (stand-in) `go_router` on the package path,
/// because an adapter decides what a thing is from its **supertypes**, and a mock has none.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/adapters/route/gorouter_adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/route/material_adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/widget/flutter_adapter.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

import 'support/temp_project.dart';

/// Extracts a routed app and returns its routes.
Future<Routed> route(String source, {Map<String, String> extra = const <String, String>{}}) async {
  final String project = createProject(
    name: 'app',
    libraries: <String, String>{'main.dart': source, ...extra},
    dependencies: <String, Map<String, String>>{
      'flutter': flutterPackage,
      'go_router': goRouterPackage,
    },
  );
  final Directory out = Directory.systemTemp.createTempSync('adapter_');
  addTearDown(() => out.deleteSync(recursive: true));

  final AnalyzerResult result = await const BridgeAnalyzer().run(
    AnalyzerRequest(projectRoot: project, outputPath: p.join(out.path, 'uir.ndjson')),
  );

  final File document = File(p.join(out.path, 'uir.ndjson'));
  final List<Map<String, dynamic>> nodes = document.existsSync()
      ? document
            .readAsLinesSync()
            .where((String l) => l.isNotEmpty)
            .map((String l) => jsonDecode(l) as Map<String, dynamic>)
            .toList()
      : <Map<String, dynamic>>[];

  return Routed(
    result: result,
    bytes: document.existsSync() ? document.readAsStringSync() : '',
    routes: nodes.where((Map<String, dynamic> n) => n['kind'] == 'app.Route').toList(),
  );
}

/// The routes an app declares.
final class Routed {
  const Routed({required this.result, required this.routes, required this.bytes});

  final AnalyzerResult result;
  final List<Map<String, dynamic>> routes;
  final String bytes;

  List<String> get paths =>
      routes.map((Map<String, dynamic> r) => r['path']! as String).toList()..sort();

  List<Diagnostic> get errors =>
      result.diagnostics.where((Diagnostic d) => d.severity == Severity.error).toList();

  bool has(DiagnosticCode code) =>
      result.diagnostics.any((Diagnostic d) => d.code == code);
}

/// The screens every routing test needs.
const String screens = '''
import 'package:flutter/material.dart';

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => const Text('home');
}

class Detail extends StatelessWidget {
  const Detail({super.key});
  @override
  Widget build(BuildContext context) => const Text('detail');
}

class Login extends StatelessWidget {
  const Login({super.key});
  @override
  Widget build(BuildContext context) => const Text('login');
}
''';

void main() {
  group('the registry', () {
    test('dispatches in (priority, name) order, whatever order it was given', () {
      final AdapterRegistry a = AdapterRegistry(<PackageAdapter>[
        const FlutterWidgetAdapter(),
        const GoRouterAdapter(),
        const MaterialRouteAdapter(),
      ]);
      final AdapterRegistry b = AdapterRegistry(<PackageAdapter>[
        const MaterialRouteAdapter(),
        const FlutterWidgetAdapter(),
        const GoRouterAdapter(),
      ]);

      expect(
        a.adapters.map((PackageAdapter x) => x.name),
        b.adapters.map((PackageAdapter x) => x.name),
        reason: 'the order adapters are listed in must not decide what code means',
      );
      expect(
        a.adapters.first.name,
        'go_router',
        reason: 'go_router is asked before Material: a go_router app still builds a MaterialApp',
      );
    });

    test('a package nobody claims yields nothing, and is not an error', () async {
      final Routed app = await route('''
import 'package:flutter/material.dart';
$screens
class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const Home();
}
''');

      expect(app.routes, isEmpty);
      expect(app.errors, isEmpty, reason: 'an app with no router is not a broken app');
    });

    test('two adapters claiming one declaration at one priority is BRG1306', () {
      // A configuration defect, not a preference: which adapter won would depend on the order of a
      // list in our source, and the meaning of a user's program may never depend on that.
      final AdapterRegistry registry = AdapterRegistry(<PackageAdapter>[
        const _Rival('rival_b'),
        const _Rival('rival_a'),
      ]);

      final CompilationUnit unit = parseString(
        // `new` explicitly: without resolution, `Thing()` parses as a method invocation.
        content: 'final x = new Thing();\n',
        throwIfDiagnostics: false,
      ).unit;
      final InstanceCreationExpression node = _firstConstruction(unit);
      final AdapterContext context = AdapterContext(
        packageName: 'app',
        path: 'lib/main.dart',
        unit: unit,
      );

      registry.routesOf(context, node);

      expect(context.findings, hasLength(1));
      expect(context.findings.single.code, Codes.adapterConflict);
      expect(
        context.findings.single.message,
        contains('rival_a'),
        reason: 'the conflict names both adapters, so it can actually be fixed',
      );
    });

    test('a genuine priority difference is not a conflict — it is the resolution', () {
      final AdapterRegistry registry = AdapterRegistry(<PackageAdapter>[
        const _Rival('rival_b', priority: 30),
        const _Rival('rival_a'),
      ]);

      final CompilationUnit unit = parseString(
        // `new` explicitly: without resolution, `Thing()` parses as a method invocation.
        content: 'final x = new Thing();\n',
        throwIfDiagnostics: false,
      ).unit;
      final AdapterContext context = AdapterContext(
        packageName: 'app',
        path: 'lib/main.dart',
        unit: unit,
      );

      registry.routesOf(context, _firstConstruction(unit));

      expect(context.findings, isEmpty, reason: 'first match, deterministically');
    });
  });

  group('go_router', () {
    test('nested routes carry their parent path', () async {
      final Routed app = await route('''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
$screens
final router = GoRouter(
  routes: <RouteBase>[
    GoRoute(
      path: '/home',
      builder: (BuildContext c, GoRouterState s) => const Home(),
      routes: <RouteBase>[
        GoRoute(path: 'detail', builder: (BuildContext c, GoRouterState s) => const Detail()),
      ],
    ),
  ],
);
''');

      expect(app.errors, isEmpty);
      expect(
        app.paths,
        <String>['/home', '/home/detail'],
        reason: 'a child served at /home/detail must not be recorded as /detail',
      );
    });

    test('a ShellRoute is a layout: it contributes children, not a path', () async {
      final Routed app = await route('''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
$screens
final router = GoRouter(
  routes: <RouteBase>[
    ShellRoute(
      builder: (BuildContext c, GoRouterState s, Widget child) => child,
      routes: <RouteBase>[
        GoRoute(path: '/home', builder: (BuildContext c, GoRouterState s) => const Home()),
        GoRoute(path: '/login', builder: (BuildContext c, GoRouterState s) => const Login()),
      ],
    ),
  ],
);
''');

      expect(app.paths, <String>['/home', '/login']);
    });

    test('a path parameter becomes a route param', () async {
      final Routed app = await route('''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
$screens
final router = GoRouter(
  routes: <RouteBase>[
    GoRoute(path: '/detail/:id', builder: (BuildContext c, GoRouterState s) => const Detail()),
  ],
);
''');

      expect(app.paths, <String>['/detail/:id']);
      expect(app.routes.single['params'], hasLength(1));
    });

    test('a path named by a constant resolves — real routing tables use them', () async {
      final Routed app = await route('''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
$screens
abstract final class Paths {
  static const String login = '/login';
}

final router = GoRouter(
  routes: <RouteBase>[
    GoRoute(path: Paths.login, builder: (BuildContext c, GoRouterState s) => const Login()),
  ],
);
''');

      expect(app.paths, <String>['/login']);
    });
  });

  group('wrappers — the reason this milestone exists', () {
    test('a custom GoRoute subclass is read from its own constructor, not from a convention', () async {
      // This is wonderous, reduced: positional `path`, and a page produced *inside* the closure the
      // wrapper hands to super. Nothing here is a heuristic — every fact is in the constructor.
      final Routed app = await route('''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
$screens
class AppRoute extends GoRoute {
  AppRoute(String path, Widget Function(GoRouterState s) build, {List<RouteBase> routes = const <RouteBase>[]})
    : super(
        path: path,
        routes: routes,
        pageBuilder: (BuildContext context, GoRouterState state) => build(state),
      );
}

final router = GoRouter(
  routes: <RouteBase>[
    AppRoute('/home', (GoRouterState s) => const Home(), routes: <RouteBase>[
      AppRoute('detail', (GoRouterState s) => const Detail()),
    ]),
  ],
);
''');

      expect(app.errors, isEmpty);
      expect(
        app.paths,
        <String>['/home', '/home/detail'],
        reason: 'the wrapper forwards `path` positionally and `routes` by name — and says so',
      );
    });

    test('a wrapper that forwards nothing readable is reported, never guessed', () async {
      final Routed app = await route('''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
$screens
class OpaqueRoute extends GoRoute {
  OpaqueRoute(String name)
    : super(path: '/fixed', builder: _build);

  static Widget _build(BuildContext c, GoRouterState s) => const Home();
}

final router = GoRouter(
  routes: <RouteBase>[OpaqueRoute('whatever')],
);
''');

      // `path: '/fixed'` is a literal in the wrapper, not forwarded from an argument — so the call
      // site tells us nothing, and no argument of `OpaqueRoute('whatever')` is the path. The compiler
      // says so rather than deciding that the first argument probably is one.
      expect(app.routes, isEmpty);
      expect(app.has(Codes.adapterRejected) || app.has(Codes.unsupportedWrapper), isTrue);
      expect(app.errors, isEmpty, reason: 'an unreadable wrapper is a warning, not a failure');
    });

    test('a route held in a variable is named, not silently dropped', () async {
      final Routed app = await route('''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
$screens
final home = GoRoute(path: '/home', builder: (BuildContext c, GoRouterState s) => const Home());

final router = GoRouter(routes: <RouteBase>[home]);
''');

      expect(app.routes, isEmpty);
      expect(
        app.has(Codes.unsupportedWrapper),
        isTrue,
        reason: 'a route the compiler cannot see is a route N11 will silently do nothing for',
      );
    });
  });

  group('material', () {
    test('MaterialApp(home:) is the route at /', () async {
      final Routed app = await route('''
import 'package:flutter/material.dart';
$screens
class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''');

      expect(app.paths, <String>['/']);
    });

    test('MaterialApp(routes:) is a route table', () async {
      final Routed app = await route('''
import 'package:flutter/material.dart';
$screens
class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    routes: <String, Widget Function(BuildContext)>{
      '/': (BuildContext c) => const Home(),
      '/login': (BuildContext c) => const Login(),
    },
  );
}
''');

      expect(app.paths, <String>['/', '/login']);
    });
  });

  group('determinism', () {
    test('the same routed app extracts to the same bytes, every time', () async {
      const String source = '''
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
$screens
final router = GoRouter(
  routes: <RouteBase>[
    GoRoute(path: '/home', builder: (BuildContext c, GoRouterState s) => const Home()),
    GoRoute(path: '/login', builder: (BuildContext c, GoRouterState s) => const Login()),
  ],
);
''';

      final Routed first = await route(source);
      final Routed second = await route(source);

      expect(first.bytes, second.bytes);
      expect(first.bytes, isNotEmpty);
    });
  });
}

/// The first construction in a unit.
InstanceCreationExpression _firstConstruction(CompilationUnit unit) {
  final TopLevelVariableDeclaration declaration =
      unit.declarations.single as TopLevelVariableDeclaration;
  return declaration.variables.variables.single.initializer! as InstanceCreationExpression;
}

/// An adapter that claims everything — two of them at one priority is the conflict BRG1306 names.
final class _Rival implements RouteAdapter {
  const _Rival(this.name, {this.priority = 10});

  @override
  final String name;

  @override
  final int priority;

  @override
  Set<String> get packages => const <String>{'package:rival/'};

  @override
  Set<String> get symbols => const <String>{};

  @override
  Set<String> get annotations => const <String>{};

  @override
  bool claimsRoutes(AdapterContext context, InstanceCreationExpression node) => true;

  @override
  List<RouteDeclaration> routesOf(AdapterContext context, InstanceCreationExpression node) =>
      const <RouteDeclaration>[];
}
