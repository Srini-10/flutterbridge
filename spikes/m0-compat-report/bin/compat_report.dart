// M0-T6 SPIKE — THROWAWAY.
//
// Compatibility report prototype. Points package:analyzer at a Flutter project and reports what the
// planned compiler could support, partially support, or not support at all.
//
// It generates NO UIR, NO React, and rewrites nothing. It is an analyzer and a report writer.
// Deleted when `bridge analyze` (M1/M2) exists for real.
//
// Usage:
//   dart run bin/compat_report.dart --project <dir> --name app_a --out out/app_a.json --report reports/app_a.md
//   dart run bin/compat_report.dart --matrix out/app_a.json,out/app_b.json --report-dir reports

import 'dart:convert';
import 'dart:io';

import 'package:analyzer/dart/analysis/analysis_context_collection.dart';
import 'package:analyzer/dart/analysis/results.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:path/path.dart' as p;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Catalogs — the frozen MVP subset (Blueprint §5.2), plus what we recognise beyond it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/// Inside the frozen MVP: the compiler is planned to handle these at M2.
const Set<String> mvpWidgets = <String>{
  'MaterialApp', 'Scaffold', 'AppBar', 'Text', 'TextField', 'ElevatedButton', 'TextButton',
  'IconButton', 'Icon', 'Image', 'Row', 'Column', 'Expanded', 'Flexible', 'SizedBox', 'Padding',
  'Center', 'Align', 'Container', 'Stack', 'Positioned', 'ListView', 'Card', 'ListTile',
  'CircularProgressIndicator', 'Divider', 'Spacer', 'GestureDetector', 'InkWell', 'FutureBuilder',
};

/// Recognised, has a plausible web analogue, but OUTSIDE the frozen MVP. Planned, not promised.
const Set<String> mappableWidgets = <String>{
  'Form', 'TextFormField', 'GridView', 'PageView', 'SingleChildScrollView', 'Scrollbar', 'Wrap',
  'Chip', 'FloatingActionButton', 'BottomNavigationBar', 'NavigationBar', 'TabBar', 'TabBarView',
  'Drawer', 'AlertDialog', 'SnackBar', 'Switch', 'Checkbox', 'Radio', 'Slider', 'DropdownButton',
  'PopupMenuButton', 'Tooltip', 'CircleAvatar', 'Opacity', 'ClipRRect', 'ClipOval', 'Material',
  'RefreshIndicator', 'StreamBuilder', 'ListenableBuilder', 'AnimatedBuilder',
  'ValueListenableBuilder', 'LayoutBuilder', 'AnimatedContainer', 'AnimatedOpacity', 'Transform',
  'DataTable', 'Table', 'Stepper', 'ExpansionTile', 'OutlinedButton', 'FilledButton', 'Tab',
  'SafeArea', 'Placeholder', 'Builder', 'DecoratedBox', 'ConstrainedBox', 'AspectRatio',
  'FractionallySizedBox', 'IntrinsicHeight', 'IntrinsicWidth',
};

/// Widgets with no straightforward web/React analogue in the planned pipeline.
const Set<String> unsupportedWidgets = <String>{
  'CustomPaint', 'CustomMultiChildLayout', 'CustomSingleChildLayout', 'Hero', 'FadeTransition',
  'SlideTransition', 'ScaleTransition', 'RotationTransition', 'AnimatedWidget', 'ShaderMask',
  'BackdropFilter', 'AndroidView', 'UiKitView', 'PlatformViewLink', 'Texture',
};

/// Class supertypes that decide what a class *is*.
const String kStateless = 'StatelessWidget';
const String kStateful = 'StatefulWidget';
const String kChangeNotifier = 'ChangeNotifier';
const String kCustomPainter = 'CustomPainter';
const String kInherited = 'InheritedWidget';

/// Imports that immediately constrain what is convertible.
const Map<String, String> riskyImports = <String, String>{
  'dart:io': 'dart:io is not available on the web at all.',
  'dart:ffi': 'dart:ffi is native interop; there is no web or React analogue.',
  'dart:isolate': 'Isolates have no direct React analogue.',
  'dart:mirrors': 'dart:mirrors is not supported on any Flutter target.',
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════

late String projectRoot;

class Site {
  Site(this.file, this.line);
  final String file;
  final int line;
  String get ref => '$file:$line';
}

class Report {
  final Map<String, int> widgetCounts = <String, int>{};
  final Map<String, List<Site>> widgetSites = <String, List<Site>>{};

  /// Widget classes DECLARED BY THIS APP. They are not "unknown constructs" — they are the thing
  /// being compiled. Reporting a user's own screen as an unrecognised construct is a false positive.
  final Set<String> userWidgets = <String>{};

  final List<String> statelessWidgets = <String>[];
  final List<String> statefulWidgets = <String>[];
  final List<String> stateClasses = <String>[];
  final List<String> stores = <String>[];
  final List<String> painters = <String>[];
  final List<String> inheritedWidgets = <String>[];

  final Map<String, List<Site>> navigation = <String, List<Site>>{};
  final Map<String, List<Site>> networkCalls = <String, List<Site>>{};
  final Map<String, List<Site>> constructs = <String, List<Site>>{};
  final Map<String, List<Site>> imports = <String, List<Site>>{};

  final List<Map<String, dynamic>> warnings = <Map<String, dynamic>>[];

  int files = 0;
  int loc = 0;
  int awaits = 0;
  int asyncMethods = 0;
  int setStateCalls = 0;
  int routeTableEntries = 0;
  bool hasOnGenerateRoute = false;

  void hit(Map<String, List<Site>> bucket, String key, Site site) {
    bucket.putIfAbsent(key, () => <Site>[]).add(site);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

Future<void> main(List<String> args) async {
  final Map<String, String> opts = _parseArgs(args);

  if (opts.containsKey('matrix')) {
    _writeMatrix(opts['matrix']!.split(','), opts['report-dir'] ?? 'reports');
    return;
  }

  projectRoot = p.normalize(p.absolute(opts['project'] ?? '.'));
  final String name = opts['name'] ?? p.basename(projectRoot);
  final String outPath = opts['out'] ?? 'out/$name.json';
  final String reportPath = opts['report'] ?? 'reports/$name.md';

  // Lesson from M0-T3 (F6): a missing element model degrades extraction silently. Refuse instead.
  //
  // C1 FINDING: in a Dart *pub workspace* (Dart 3.6+, e.g. flutter/samples), `package_config.json`
  // lives at the WORKSPACE ROOT, not in the package directory. Checking only <project>/.dart_tool
  // rejects a perfectly analyzable project — a false negative. Walk up to find it.
  if (_findPackageConfig(projectRoot) == null) {
    stderr.writeln('E: no .dart_tool/package_config.json for $projectRoot (nor in any parent '
        'workspace root). Run `flutter pub get` first. Refusing to analyze.');
    exit(3);
  }

  final Map<String, dynamic> json = await _analyze(name);

  File(outPath).parent.createSync(recursive: true);
  File(outPath).writeAsStringSync('${const JsonEncoder.withIndent('  ').convert(json)}\n');

  File(reportPath).parent.createSync(recursive: true);
  File(reportPath).writeAsStringSync(_renderMarkdown(json));

  final Map<String, dynamic> compat = json['compatibility']! as Map<String, dynamic>;
  stdout.writeln('$name: ${compat['level']}');
  stdout.writeln('  wrote $outPath and $reportPath');
}

Future<Map<String, dynamic>> _analyze(String name) async {
  final Report r = Report();

  final AnalysisContextCollection collection =
      AnalysisContextCollection(includedPaths: <String>[projectRoot]);

  final List<String> files = Directory(p.join(projectRoot, 'lib'))
      .listSync(recursive: true)
      .whereType<File>()
      .map((File f) => f.path)
      .where((String f) => f.endsWith('.dart'))
      .toList()
    ..sort(); // determinism

  for (final String file in files) {
    final Object result = await collection.contextFor(file).currentSession.getResolvedUnit(file);
    if (result is! ResolvedUnitResult) continue;

    final List<String> unresolved = result.errors
        .map((Object e) => e.toString())
        .where((String e) => e.contains("Target of URI doesn't exist"))
        .toList();
    if (unresolved.isNotEmpty) {
      stderr.writeln('E: unresolved imports in ${_rel(file)}; the element model is incomplete.');
      exit(3);
    }

    r.files++;
    r.loc += File(file).readAsLinesSync().length;
    result.unit.accept(_Scanner(r, result));
  }

  _deriveWarnings(r);
  return _toJson(name, r);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Scanner
// ═══════════════════════════════════════════════════════════════════════════════════════════════

class _Scanner extends RecursiveAstVisitor<void> {
  _Scanner(this.r, this.unit);

  final Report r;
  final ResolvedUnitResult unit;

  Site _site(int offset) => Site(_rel(unit.path), unit.lineInfo.getLocation(offset).lineNumber);

  @override
  void visitImportDirective(ImportDirective node) {
    final String uri = node.uri.stringValue ?? '';
    if (riskyImports.containsKey(uri) ||
        uri.startsWith('package:flutter/services') ||
        uri.startsWith('package:http') ||
        uri.startsWith('package:dio')) {
      r.hit(r.imports, uri, _site(node.offset));
    }
    super.visitImportDirective(node);
  }

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final String name = node.namePart.typeName.lexeme;
    final String sup = node.extendsClause?.superclass.toSource() ?? '';
    final String withs =
        node.withClause?.mixinTypes.map((NamedType t) => t.toSource()).join(',') ?? '';

    if (sup == kStateless) {
      r.statelessWidgets.add(name);
      r.userWidgets.add(name);
    }
    if (sup == kStateful) {
      r.statefulWidgets.add(name);
      r.userWidgets.add(name);
    }
    if (sup.startsWith('State<')) r.stateClasses.add(name);
    if (sup == kChangeNotifier) r.stores.add(name);
    if (sup == kCustomPainter) {
      r.painters.add(name);
      r.hit(r.constructs, 'CustomPainter subclass', _site(node.offset));
    }
    if (sup == kInherited) r.inheritedWidgets.add(name);
    if (sup.startsWith('RenderObject') || sup.startsWith('RenderBox')) {
      r.hit(r.constructs, 'RenderObject subclass', _site(node.offset));
    }
    if (withs.contains('TickerProviderStateMixin')) {
      r.hit(r.constructs, 'TickerProvider mixin (explicit animation)', _site(node.offset));
    }

    super.visitClassDeclaration(node);
  }

  /// Module-level mutable state: `final CartStore cartStore = CartStore();`
  @override
  void visitTopLevelVariableDeclaration(TopLevelVariableDeclaration node) {
    for (final VariableDeclaration v in node.variables.variables) {
      final DartType? t = v.initializer?.staticType;
      if (t is InterfaceType &&
          t.allSupertypes.any((InterfaceType s) => s.getDisplayString() == kChangeNotifier)) {
        r.hit(r.constructs, 'module-level store singleton', _site(v.offset));
      }
    }
    super.visitTopLevelVariableDeclaration(node);
  }

  @override
  void visitMethodDeclaration(MethodDeclaration node) {
    if (node.body.isAsynchronous) r.asyncMethods++;
    super.visitMethodDeclaration(node);
  }

  @override
  void visitFunctionDeclaration(FunctionDeclaration node) {
    if (node.functionExpression.body.isAsynchronous) r.asyncMethods++;
    super.visitFunctionDeclaration(node);
  }

  @override
  void visitAwaitExpression(AwaitExpression node) {
    r.awaits++;
    super.visitAwaitExpression(node);
  }

  @override
  void visitInstanceCreationExpression(InstanceCreationExpression node) {
    final String raw = node.constructorName.type.toSource();
    final String type = raw.split('<').first;
    final String? ctor = node.constructorName.name?.name;
    final Site site = _site(node.offset);

    if (_isWidget(node.staticType)) {
      final String key = ctor == null ? type : '$type.$ctor';
      r.widgetCounts[key] = (r.widgetCounts[key] ?? 0) + 1;
      r.hit(r.widgetSites, key, site);
    } else {
      // Non-widget constructions that matter to convertibility.
      if (type == 'MethodChannel' || type == 'EventChannel' || type == 'BasicMessageChannel') {
        r.hit(r.constructs, 'platform channel ($type)', site);
      }
      if (type == 'AnimationController') {
        r.hit(r.constructs, 'AnimationController', site);
      }
      if (type == 'TextEditingController') {
        r.hit(r.constructs, 'TextEditingController', site);
      }
      if (type == 'HttpClient') {
        r.hit(r.networkCalls, 'dart:io HttpClient', site);
      }
      if (type == 'GlobalKey' && raw.contains('FormState')) {
        r.hit(r.constructs, 'GlobalKey<FormState>', site);
      }
    }

    super.visitInstanceCreationExpression(node);
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    final String? target = node.target?.toSource();
    final String m = node.methodName.name;
    final Site site = _site(node.offset);

    if (target == 'Navigator') {
      r.hit(r.navigation, 'Navigator.$m', site);
      _checkRouteArguments(node, site);
    }
    if (target == 'http' && <String>['get', 'post', 'put', 'delete', 'patch'].contains(m)) {
      r.hit(r.networkCalls, 'http.${m.toUpperCase()}', site);
    }
    if (m == 'compute') r.hit(r.constructs, 'compute() (isolate)', site);
    if (target == 'Isolate' && m == 'spawn') r.hit(r.constructs, 'Isolate.spawn', site);
    if (m == 'invokeMethod' || m == 'invokeListMethod') {
      r.hit(r.constructs, 'platform channel invocation', site);
    }
    if (m == 'setState') r.setStateCalls++;

    super.visitMethodInvocation(node);
  }

  /// The ISSUE-1 detector (M0-T3): does anything non-serialisable cross a route boundary?
  void _checkRouteArguments(MethodInvocation node, Site site) {
    for (final Argument a in node.argumentList.arguments) {
      // Navigator.pushNamed(context, '/x', arguments: <object>)
      if (a is NamedArgument && a.name.lexeme == 'arguments') {
        final DartType? t = a.argumentExpression.staticType;
        final String ts = t?.getDisplayString() ?? 'dynamic';
        if (t is FunctionType) {
          r.hit(r.constructs, 'callback passed across a route', site);
        } else if (!_isPrimitive(ts)) {
          r.hit(r.constructs, 'object passed across a route ($ts)', site);
        }
      }
      // Navigator.push(context, MaterialPageRoute(builder: (_) => Screen(cb: ...)))
      if (a is InstanceCreationExpression &&
          a.constructorName.type.toSource().contains('MaterialPageRoute')) {
        for (final Argument b in a.argumentList.arguments) {
          if (b is NamedArgument && b.name.lexeme == 'builder') {
            final Expression? body = _returned(b.argumentExpression);
            if (body is InstanceCreationExpression) {
              for (final Argument prop in body.argumentList.arguments) {
                if (prop is NamedArgument &&
                    prop.argumentExpression.staticType is FunctionType) {
                  r.hit(r.constructs, 'callback passed across a route', site);
                }
              }
            }
          }
        }
      }
    }
  }

  Expression? _returned(Expression closure) {
    if (closure is! FunctionExpression) return null;
    final FunctionBody b = closure.body;
    if (b is ExpressionFunctionBody) return b.expression;
    if (b is BlockFunctionBody) {
      return b.block.statements.whereType<ReturnStatement>().firstOrNull?.expression;
    }
    return null;
  }

  @override
  void visitSetOrMapLiteral(SetOrMapLiteral node) {
    // MaterialApp(routes: {'/': ..., '/checkout': ...})
    final String? t = node.staticType?.getDisplayString();
    if (t != null && t.contains('WidgetBuilder')) {
      r.routeTableEntries += node.elements.length;
      r.hit(r.navigation, 'named routes table', _site(node.offset));
    }
    super.visitSetOrMapLiteral(node);
  }

  @override
  void visitNamedArgument(NamedArgument node) {
    if (node.name.lexeme == 'onGenerateRoute') {
      r.hasOnGenerateRoute = true;
      r.hit(r.navigation, 'onGenerateRoute', _site(node.offset));
    }
    if (node.name.lexeme == 'validator') {
      r.hit(r.constructs, 'form validator', _site(node.offset));
    }
    super.visitNamedArgument(node);
  }
}

bool _isPrimitive(String t) =>
    <String>['int', 'double', 'num', 'String', 'bool', 'Null', 'dynamic', 'Object'].contains(t) ||
    t.startsWith('Map<String, dynamic>');

bool _isWidget(DartType? t) {
  if (t is! InterfaceType) return false;
  if (t.getDisplayString() == 'Widget') return true;
  return t.allSupertypes.any((InterfaceType s) => s.getDisplayString() == 'Widget');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Warnings + classification
// ═══════════════════════════════════════════════════════════════════════════════════════════════

void _warn(
  Report r, {
  required String code,
  required String title,
  required String why,
  required String impact,
  required String likelyCompilerBehavior,
  required String owner,
  required List<Site> where,
}) {
  r.warnings.add(<String, dynamic>{
    'code': code,
    'title': title,
    'why': why,
    'impact': impact,
    'likelyCompilerBehavior': likelyCompilerBehavior,
    'owner': owner,
    'where': (where.map((Site s) => s.ref).toList()..sort()),
  });
}

void _deriveWarnings(Report r) {
  List<Site> sites(String key) => r.constructs[key] ?? <Site>[];
  List<Site> matching(bool Function(String) pred) => r.constructs.entries
      .where((MapEntry<String, List<Site>> e) => pred(e.key))
      .expand((MapEntry<String, List<Site>> e) => e.value)
      .toList();

  final List<Site> routeCallbacks = sites('callback passed across a route');
  if (routeCallbacks.isNotEmpty) {
    _warn(r,
        code: 'W01',
        title: 'A callback is passed across a route boundary',
        why: 'A route is a URL in the React target. A closure cannot be serialised to a URL, so the '
            'callee cannot receive it.',
        impact: 'The receiving screen loses the callback entirely; any state it toggled through that '
            'callback stops working.',
        likelyCompilerBehavior: 'Promote the captured state into a shared store and turn the callback '
            'into a store action. This is the open ISSUE-1 (M0-T3 memo §5); the decision is deferred '
            'to the architecture review, so today the compiler would have to flag it, not fix it.',
        owner: 'normalization (open issue) / bridge_lints',
        where: routeCallbacks);
  }

  final List<Site> routeObjects = matching((String k) => k.startsWith('object passed across a route'));
  if (routeObjects.isNotEmpty) {
    _warn(r,
        code: 'W02',
        title: 'A non-primitive object is passed as a route argument',
        why: 'Flutter passes a live Dart object through `Navigator.pushNamed(arguments:)`. A URL '
            'route can carry an id, not an object graph.',
        impact: 'The destination screen must re-fetch or re-derive the object from an identifier, '
            'which changes its data-loading shape.',
        likelyCompilerBehavior: 'Lower the argument to a route parameter (an id) plus a data load on '
            'the destination route; flag when the object cannot be reduced to an identifier.',
        owner: 'normalization + generator',
        where: routeObjects);
  }

  final List<Site> singletons = sites('module-level store singleton');
  if (singletons.isNotEmpty) {
    _warn(r,
        code: 'W03',
        title: 'Module-level mutable store singleton',
        why: 'A top-level `ChangeNotifier` instance is process-global. In Flutter that is one user. '
            'On a Next.js server the module is shared across *all* requests.',
        impact: 'If such a store is touched during SSR, one user can see another user\'s cart. This '
            'is a correctness and privacy bug, not a styling one.',
        likelyCompilerBehavior: 'Emit the store as a per-request/provider-scoped instance and mark '
            'the component tree that touches it as client-only.',
        owner: 'generator (RSC boundary) + runtime (state runtime)',
        where: singletons);
  }

  final List<Site> channels = matching((String k) => k.startsWith('platform channel'));
  if (channels.isNotEmpty) {
    _warn(r,
        code: 'W04',
        title: 'Platform channels',
        why: 'MethodChannel/EventChannel call into native Android/iOS code. There is no native side '
            'on the web.',
        impact: 'Any feature behind the channel cannot be converted at all; it needs a web '
            'implementation written by a human (an HTTP endpoint, a browser API, or a stub).',
        likelyCompilerBehavior: 'Emit an Opaque node and require an override; never guess a '
            'substitute.',
        owner: 'analyzer (detect) + documentation (override workflow)',
        where: channels);
  }

  final List<Site> isolates = matching((String k) => k.contains('isolate') || k.startsWith('Isolate'));
  if (isolates.isNotEmpty) {
    _warn(r,
        code: 'W05',
        title: 'Isolates / compute()',
        why: 'Isolates are Dart\'s concurrency model. The browser equivalent (Web Workers) has a '
            'different memory and messaging model.',
        impact: 'Work offloaded from the UI thread would run on the main thread instead, or must be '
            'rewritten against Web Workers.',
        likelyCompilerBehavior: 'Out of scope for the MVP: flag as unsupported and require an '
            'override.',
        owner: 'analyzer (detect) + documentation',
        where: isolates);
  }

  final List<Site> painters = matching((String k) => k.contains('CustomPainter')) +
      (r.widgetSites['CustomPaint'] ?? <Site>[]);
  if (painters.isNotEmpty) {
    _warn(r,
        code: 'W06',
        title: 'CustomPainter / CustomPaint',
        why: 'Imperative canvas drawing. Spec §7 names this as the automation boundary.',
        impact: 'The painted widget cannot be generated; it needs a hand-written React component.',
        likelyCompilerBehavior: 'Emit an Opaque node keyed by a stable anchor and route it to the '
            'override system, so the human writes it once and regeneration preserves it.',
        owner: 'generator (override system)',
        where: painters);
  }

  final List<Site> anim = matching((String k) => k.contains('Animation') || k.contains('TickerProvider'));
  if (anim.isNotEmpty) {
    _warn(r,
        code: 'W07',
        title: 'Explicit animation (AnimationController / TickerProvider)',
        why: 'Explicit animation choreography is outside the MVP; only implicit animations are '
            'planned to map cleanly.',
        impact: 'Transitions driven by a controller will not be reproduced.',
        likelyCompilerBehavior: 'The animation runtime handles the implicit cases; a controller '
            'timeline flags for an override.',
        owner: 'runtime (animation engine)',
        where: anim);
  }

  for (final MapEntry<String, List<Site>> e in r.imports.entries) {
    if (!riskyImports.containsKey(e.key)) continue;
    _warn(r,
        code: 'W08',
        title: 'Web-incompatible import: ${e.key}',
        why: riskyImports[e.key]!,
        impact: 'Any code path reaching this import cannot run in a browser, converted or not.',
        likelyCompilerBehavior: 'Refuse to convert the enclosing unit; require an override or a '
            'web-specific implementation.',
        owner: 'analyzer (detect) + bridge_lints (prevent, for new projects)',
        where: e.value);
  }

  final List<Site> streams = r.widgetSites['StreamBuilder'] ?? <Site>[];
  if (streams.isNotEmpty) {
    _warn(r,
        code: 'W09',
        title: 'StreamBuilder',
        why: 'Streams are outside the frozen MVP (only FutureBuilder is in).',
        impact: 'Live-updating UI will not be generated at MVP.',
        likelyCompilerBehavior: 'Planned: map to a subscription (useSyncExternalStore / query '
            'subscription). Recognised, not yet supported.',
        owner: 'normalization + runtime (state runtime)',
        where: streams);
  }

  r.warnings.sort((Map<String, dynamic> a, Map<String, dynamic> b) =>
      (a['code']! as String).compareTo(b['code']! as String));
}

/// Descriptive, not numeric. The reasoning is the product; the counts are only evidence for it.
Map<String, String> _classify(Report r, List<String> unsupported) {
  final bool hasHardBlockers = r.imports.keys.any(riskyImports.containsKey) ||
      r.constructs.keys.any((String k) =>
          k.startsWith('platform channel') || k.contains('isolate') || k.startsWith('Isolate'));
  final bool hasOverridables = unsupported.isNotEmpty;

  if (hasHardBlockers) {
    return <String, String>{
      'level': 'Low Compatibility',
      'reasoning':
          'The application depends on capabilities that do not exist in a browser at all — '
          '${_join(<String>[
                if (r.imports.keys.any(riskyImports.containsKey))
                  'web-incompatible imports (${r.imports.keys.where(riskyImports.containsKey).join(', ')})',
                if (r.constructs.keys.any((String k) => k.startsWith('platform channel')))
                  'platform channels',
                if (r.constructs.keys.any((String k) => k.contains('isolate') || k.startsWith('Isolate')))
                  'isolates',
              ])}. These are not gaps in the compiler; they are gaps in the target platform. Converting '
          'this application means a human first decides what those capabilities become on the web. '
          'The UI layer itself may still convert well — see the supported/partial lists.',
    };
  }
  if (hasOverridables) {
    return <String, String>{
      'level': 'Medium Compatibility',
      'reasoning':
          'Everything the application needs exists on the web, but some constructs sit outside the '
          'frozen MVP and would need overrides or post-MVP support (${unsupported.take(4).join(', ')}'
          '${unsupported.length > 4 ? ', …' : ''}). These are bounded, per-widget costs rather than '
          'architectural blockers.',
    };
  }
  final String warningNote = r.warnings.isEmpty
      ? ''
      : ' It is not free of conversion issues, however: ${r.warnings.length} warning(s) '
          '(${r.warnings.map((Map<String, dynamic> w) => w['code'] as String).join(', ')}) describe '
          'constructs that convert imperfectly and need a decision or an override.';
  return <String, String>{
    'level': 'High Compatibility',
    'reasoning':
        'Every construct found is inside the frozen MVP subset, or is a recognised widget with a '
        'planned mapping. Nothing in this application requires a capability the web lacks.$warningNote',
  };
}

String _join(List<String> parts) =>
    parts.length <= 1 ? parts.join() : '${parts.take(parts.length - 1).join(', ')} and ${parts.last}';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Output
// ═══════════════════════════════════════════════════════════════════════════════════════════════

Map<String, dynamic> _toJson(String name, Report r) {
  final List<String> supported = <String>[];
  final List<String> partial = <String>[];
  final List<String> unsupported = <String>[];
  final List<String> unknown = <String>[];
  final List<String> userComponents = <String>[];

  for (final String key in r.widgetCounts.keys.toList()..sort()) {
    final String base = key.split('.').first;
    if (r.userWidgets.contains(base)) {
      userComponents.add(key);
    } else if (mvpWidgets.contains(base)) {
      supported.add(key);
    } else if (unsupportedWidgets.contains(base)) {
      unsupported.add(key);
    } else if (mappableWidgets.contains(base)) {
      partial.add(key);
    } else {
      unknown.add(key);
    }
  }

  // Non-widget unsupported constructs.
  for (final String k in r.constructs.keys.toList()..sort()) {
    if (k.startsWith('platform channel') ||
        k.contains('isolate') ||
        k.startsWith('Isolate') ||
        k.contains('CustomPainter') ||
        k == 'AnimationController' ||
        k.contains('TickerProvider') ||
        k.startsWith('RenderObject')) {
      unsupported.add(k);
    }
  }
  for (final String k in r.imports.keys.where(riskyImports.containsKey).toList()..sort()) {
    unsupported.add('import $k');
  }
  unsupported.sort();

  final Map<String, String> compat = _classify(r, unsupported);

  Map<String, dynamic> sites(Map<String, List<Site>> m) => <String, dynamic>{
        for (final String k in m.keys.toList()..sort())
          k: (m[k]!.map((Site s) => s.ref).toList()..sort()),
      };

  return <String, dynamic>{
    'spike': 'M0-T6',
    'app': name,
    'project': _projectName(),
    'toolchain': <String, String>{
      'flutter': _flutterVersion(),
      'dart': Platform.version.split(' ').first,
    },
    'summary': <String, dynamic>{
      'dartFiles': r.files,
      'linesOfCode': r.loc,
      'widgetInstantiations':
          r.widgetCounts.values.fold<int>(0, (int a, int b) => a + b),
      'distinctWidgetTypes': r.widgetCounts.length,
      'statelessWidgets': r.statelessWidgets.length,
      'statefulWidgets': r.statefulWidgets.length,
      'stateClasses': r.stateClasses.length,
      'storesOrControllers': r.stores.length,
      'customPainters': r.painters.length,
      'inheritedWidgets': r.inheritedWidgets.length,
      'asyncMethods': r.asyncMethods,
      'awaitExpressions': r.awaits,
      'setStateCalls': r.setStateCalls,
      'namedRouteEntries': r.routeTableEntries,
      'hasOnGenerateRoute': r.hasOnGenerateRoute,
      'networkCallSites':
          r.networkCalls.values.fold<int>(0, (int a, List<Site> b) => a + b.length),
      'userDefinedComponents': userComponents.length,
      'unsupportedConstructs': unsupported.length,
      'unknownConstructs': unknown.length,
    },
    'declarations': <String, dynamic>{
      'stateless': r.statelessWidgets..sort(),
      'stateful': r.statefulWidgets..sort(),
      'stores': r.stores..sort(),
      'painters': r.painters..sort(),
    },
    'widgets': <String, dynamic>{
      for (final String k in r.widgetCounts.keys.toList()..sort()) k: r.widgetCounts[k],
    },
    'userComponents': userComponents,
    'supported': supported,
    'partial': partial,
    'unsupported': unsupported,
    'unknown': unknown,
    'navigation': sites(r.navigation),
    'network': sites(r.networkCalls),
    'constructs': sites(r.constructs),
    'riskyImports': sites(r.imports),
    'warnings': r.warnings,
    'compatibility': compat,
  };
}

/// The pubspec's declared name, not the directory name — a report should call the app what its
/// authors call it.
String _projectName() {
  final File f = File(p.join(projectRoot, 'pubspec.yaml'));
  if (f.existsSync()) {
    for (final String line in f.readAsLinesSync()) {
      if (line.startsWith('name:')) return line.substring(5).trim();
    }
  }
  return p.basename(projectRoot);
}

String _flutterVersion() {
  final File f = File(p.join(projectRoot, '.dart_tool', 'version'));
  if (f.existsSync()) return f.readAsStringSync().trim();
  final ProcessResult res = Process.runSync('flutter', <String>['--version', '--machine']);
  if (res.exitCode == 0) {
    try {
      final Map<String, dynamic> j = jsonDecode(res.stdout as String) as Map<String, dynamic>;
      return j['frameworkVersion'] as String;
    } catch (_) {
      // fall through
    }
  }
  return 'unknown';
}

String _renderMarkdown(Map<String, dynamic> j) {
  final Map<String, dynamic> s = j['summary']! as Map<String, dynamic>;
  final Map<String, dynamic> c = j['compatibility']! as Map<String, dynamic>;
  final StringBuffer b = StringBuffer();

  b.writeln('# Compatibility report — ${j['app']} (`${j['project']}`)');
  b.writeln();
  b.writeln('> Generated by the M0-T6 spike. **Analysis only** — no UIR, no code, no rewriting.');
  b.writeln();
  b.writeln('## Compatibility: ${c['level']}');
  b.writeln();
  b.writeln(c['reasoning']);
  b.writeln();

  b.writeln('## Summary');
  b.writeln();
  b.writeln('| | |');
  b.writeln('| --- | --- |');
  b.writeln('| Project | `${j['project']}` |');
  final Map<String, dynamic> tc = j['toolchain']! as Map<String, dynamic>;
  b.writeln('| Flutter | ${tc['flutter']} |');
  b.writeln('| Dart | ${tc['dart']} |');
  for (final String k in s.keys) {
    b.writeln('| ${_humanize(k)} | ${s[k]} |');
  }
  b.writeln();

  void list(String title, String note, List<dynamic> items) {
    b.writeln('## $title');
    b.writeln();
    b.writeln(note);
    b.writeln();
    if (items.isEmpty) {
      b.writeln('_None._');
    } else {
      for (final dynamic i in items) {
        b.writeln('- `$i`');
      }
    }
    b.writeln();
  }

  list('Application components', 'Widgets declared by this application. These are what the compiler generates; they are not framework constructs to be mapped.', j['userComponents']! as List<dynamic>);
  list('Supported features', 'Inside the frozen MVP subset (Blueprint §5.2).', j['supported']! as List<dynamic>);
  list('Partially supported', 'Recognised, has a plausible web mapping, but outside the frozen MVP — planned, not promised.', j['partial']! as List<dynamic>);
  list('Unsupported features', 'Outside the MVP with no straightforward mapping. Not solved here.', j['unsupported']! as List<dynamic>);
  list('Unknown constructs', 'Widgets the tool does not recognise at all. Every entry here is a gap in the catalog, and a place a user will need guidance.', j['unknown']! as List<dynamic>);

  b.writeln('## Navigation');
  b.writeln();
  final Map<String, dynamic> nav = j['navigation']! as Map<String, dynamic>;
  if (nav.isEmpty) {
    b.writeln('_None detected._');
  } else {
    b.writeln('| Pattern | Sites |');
    b.writeln('| --- | --- |');
    for (final String k in nav.keys) {
      b.writeln('| `$k` | ${(nav[k]! as List<dynamic>).map((dynamic v) => '`$v`').join(', ')} |');
    }
  }
  b.writeln();

  b.writeln('## Network');
  b.writeln();
  final Map<String, dynamic> net = j['network']! as Map<String, dynamic>;
  if (net.isEmpty) {
    b.writeln('_None detected._');
  } else {
    b.writeln('| Call | Sites |');
    b.writeln('| --- | --- |');
    for (final String k in net.keys) {
      b.writeln('| `$k` | ${(net[k]! as List<dynamic>).map((dynamic v) => '`$v`').join(', ')} |');
    }
  }
  b.writeln();

  b.writeln('## Warnings');
  b.writeln();
  final List<dynamic> warnings = j['warnings']! as List<dynamic>;
  if (warnings.isEmpty) {
    b.writeln('_None._');
  }
  for (final dynamic w in warnings) {
    final Map<String, dynamic> m = w as Map<String, dynamic>;
    b.writeln('### ${m['code']} — ${m['title']}');
    b.writeln();
    b.writeln('**Why.** ${m['why']}');
    b.writeln();
    b.writeln('**Impact.** ${m['impact']}');
    b.writeln();
    b.writeln('**Likely compiler behaviour.** ${m['likelyCompilerBehavior']}');
    b.writeln();
    b.writeln('**Owner.** ${m['owner']}');
    b.writeln();
    b.writeln('**Where.** ${(m['where']! as List<dynamic>).map((dynamic v) => '`$v`').join(', ')}');
    b.writeln();
  }

  return b.toString();
}

String _humanize(String key) => key
    .replaceAllMapped(RegExp('[A-Z]'), (Match m) => ' ${m[0]!.toLowerCase()}')
    .replaceFirstMapped(RegExp('^[a-z]'), (Match m) => m[0]!.toUpperCase());

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Matrix + summary across apps
// ═══════════════════════════════════════════════════════════════════════════════════════════════

void _writeMatrix(List<String> jsonPaths, String reportDir) {
  final List<Map<String, dynamic>> apps = jsonPaths
      .map((String f) => jsonDecode(File(f.trim()).readAsStringSync()) as Map<String, dynamic>)
      .toList();

  final Map<String, String> status = <String, String>{};
  final Set<String> features = <String>{};
  // userComponents are deliberately excluded: an app's own screens are not a "feature" that can be
  // compared across apps.
  for (final Map<String, dynamic> a in apps) {
    for (final String k in <String>['supported', 'partial', 'unsupported', 'unknown']) {
      for (final dynamic f in a[k]! as List<dynamic>) {
        features.add(f as String);
        status[f] = <String, String>{
          'supported': 'Supported',
          'partial': 'Partial',
          'unsupported': 'Unsupported',
          'unknown': 'Unknown',
        }[k]!;
      }
    }
  }

  bool has(Map<String, dynamic> app, String feature) => <String>['supported', 'partial', 'unsupported', 'unknown']
      .any((String k) => (app[k]! as List<dynamic>).contains(feature));

  final List<String> sorted = features.toList()
    ..sort((String a, String b) {
      const Map<String, int> order = <String, int>{
        'Supported': 0,
        'Partial': 1,
        'Unsupported': 2,
        'Unknown': 3,
      };
      final int byStatus = order[status[a]]!.compareTo(order[status[b]]!);
      return byStatus != 0 ? byStatus : a.compareTo(b);
    });

  final StringBuffer m = StringBuffer();
  m.writeln('# Compatibility matrix');
  m.writeln();
  m.writeln('> ✓ = the application uses this construct. The **Status** column is what FlutterBridge');
  m.writeln('> can do with it, per the frozen MVP (Blueprint §5.2) — it is a property of the compiler,');
  m.writeln('> not of the app.');
  m.writeln();
  m.write('| Feature | Status |');
  for (final Map<String, dynamic> a in apps) {
    m.write(' ${a['app']} |');
  }
  m.writeln();
  m.write('| --- | --- |');
  for (final int _ in List<int>.filled(apps.length, 0)) {
    m.write(' --- |');
  }
  m.writeln();
  for (final String f in sorted) {
    m.write('| `$f` | ${status[f]} |');
    for (final Map<String, dynamic> a in apps) {
      m.write(' ${has(a, f) ? '✓' : '✗'} |');
    }
    m.writeln();
  }
  m.writeln();

  File(p.join(reportDir, 'compatibility-matrix.md')).writeAsStringSync(m.toString());

  final StringBuffer s = StringBuffer();
  s.writeln('# Compatibility summary');
  s.writeln();
  s.writeln('| App | Project | Verdict | Files | Widgets | Stateful | Stores | Unsupported | Unknown |');
  s.writeln('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (final Map<String, dynamic> a in apps) {
    final Map<String, dynamic> sm = a['summary']! as Map<String, dynamic>;
    final Map<String, dynamic> c = a['compatibility']! as Map<String, dynamic>;
    s.writeln('| ${a['app']} | `${a['project']}` | **${c['level']}** | ${sm['dartFiles']} | '
        '${sm['widgetInstantiations']} | ${sm['statefulWidgets']} | ${sm['storesOrControllers']} | '
        '${sm['unsupportedConstructs']} | ${sm['unknownConstructs']} |');
  }
  s.writeln();
  for (final Map<String, dynamic> a in apps) {
    final Map<String, dynamic> c = a['compatibility']! as Map<String, dynamic>;
    s.writeln('## ${a['app']} — ${c['level']}');
    s.writeln();
    s.writeln(c['reasoning']);
    s.writeln();
    final List<dynamic> w = a['warnings']! as List<dynamic>;
    if (w.isNotEmpty) {
      s.writeln('Warnings: ${w.map((dynamic x) => '`${(x as Map<String, dynamic>)['code']}`').join(', ')}');
      s.writeln();
    }
  }
  File(p.join(reportDir, 'summary.md')).writeAsStringSync(s.toString());

  stdout.writeln('wrote $reportDir/compatibility-matrix.md and $reportDir/summary.md');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

/// Finds package_config.json for a project, honouring pub-workspace layouts (C1 finding).
File? _findPackageConfig(String start) {
  String dir = start;
  for (int i = 0; i < 5; i++) {
    final File f = File(p.join(dir, '.dart_tool', 'package_config.json'));
    if (f.existsSync()) return f;
    final String parent = p.dirname(dir);
    if (parent == dir) break;
    dir = parent;
  }
  return null;
}

String _rel(String path) => p.relative(path, from: projectRoot);

Map<String, String> _parseArgs(List<String> args) {
  final Map<String, String> out = <String, String>{};
  for (int i = 0; i < args.length - 1; i++) {
    if (args[i].startsWith('--')) out[args[i].substring(2)] = args[i + 1];
  }
  return out;
}
