// M0-T3 SPIKE — THROWAWAY CODE.
//
// Walks a Flutter project with package:analyzer (resolved ASTs — ADR-2) and dumps ad-hoc JSON:
// widget trees, state fields, stores, and navigation calls. There is no schema here on purpose
// (Blueprint M0-T3: "ad-hoc JSON, schema not required yet"). The deliverable of this task is the
// fidelity memo it produces, not this code. It is deleted at M1-T7.
//
// Usage:
//   dart run bin/spike_extract.dart --project <flutter-app-dir> --out <file.json>

import 'dart:convert';
import 'dart:io';

import 'package:analyzer/dart/analysis/analysis_context_collection.dart';
import 'package:analyzer/dart/analysis/results.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:path/path.dart' as p;

/// The MVP widget set (Blueprint §5.2). Used only to report coverage.
const List<String> mvpWidgets = <String>[
  'MaterialApp', 'Scaffold', 'AppBar', 'Text', 'TextField', 'ElevatedButton', 'TextButton',
  'IconButton', 'Icon', 'Image', 'Row', 'Column', 'Expanded', 'Flexible', 'SizedBox', 'Padding',
  'Center', 'Align', 'Container', 'Stack', 'Positioned', 'ListView', 'Card', 'ListTile',
  'CircularProgressIndicator', 'Divider', 'Spacer', 'GestureDetector', 'InkWell',
];

/// Widgets that carry semantics the compiler must special-case rather than map 1:1.
const List<String> structuralWidgets = <String>['FutureBuilder', 'StreamBuilder', 'Builder'];

late String projectRoot;
final List<Map<String, dynamic>> opaque = <Map<String, dynamic>>[];
final Set<String> widgetsSeen = <String>{};
int widgetNodeCount = 0;
int totalNodeCount = 0;

Future<void> main(List<String> args) async {
  final Map<String, String> opts = _parseArgs(args);
  projectRoot = p.normalize(p.absolute(opts['project'] ?? '.'));
  final String outPath = p.normalize(p.absolute(opts['out'] ?? 'out/spike.json'));

  final String libDir = p.join(projectRoot, 'lib');
  if (!Directory(libDir).existsSync()) {
    stderr.writeln('no lib/ in $projectRoot');
    exit(3);
  }

  // LESSON (feeds M1, INV-5): without .dart_tool/package_config.json the analyzer still returns a
  // ResolvedUnitResult — but every Flutter type resolves to InvalidType and extraction silently
  // degrades into a pile of opaque nodes. An extractor must fail loudly on a broken environment,
  // never emit a confident-looking partial result. Exit 3 = environment failure, no output written.
  final File pkgConfig = File(p.join(projectRoot, '.dart_tool', 'package_config.json'));
  if (!pkgConfig.existsSync()) {
    stderr.writeln('E: ${pkgConfig.path} is missing.');
    stderr.writeln('   Run `flutter pub get` in the project first. Refusing to extract.');
    exit(3);
  }

  final AnalysisContextCollection collection =
      AnalysisContextCollection(includedPaths: <String>[projectRoot]);

  final List<String> files = Directory(libDir)
      .listSync(recursive: true)
      .whereType<File>()
      .map((File f) => f.path)
      .where((String f) => f.endsWith('.dart'))
      .toList()
    ..sort(); // deterministic output (D1/D4 discipline, even in a spike)

  final List<Map<String, dynamic>> components = <Map<String, dynamic>>[];
  final List<Map<String, dynamic>> stores = <Map<String, dynamic>>[];
  final List<Map<String, dynamic>> plainClasses = <Map<String, dynamic>>[];
  final List<Map<String, dynamic>> navigation = <Map<String, dynamic>>[];
  final List<Map<String, dynamic>> endpoints = <Map<String, dynamic>>[];

  // Pass 1: collect every class declaration with its resolved unit.
  final List<_ClassCtx> classes = <_ClassCtx>[];
  for (final String file in files) {
    final Object result = await collection.contextFor(file).currentSession.getResolvedUnit(file);
    if (result is! ResolvedUnitResult) {
      opaque.add(<String, dynamic>{
        'file': _rel(file),
        'reason': 'unresolved-unit',
        'detail': result.runtimeType.toString(),
      });
      continue;
    }
    // Unresolved imports poison every downstream static type. Refuse to continue.
    final List<String> unresolvedUris = result.errors
        .map((Object e) => e.toString())
        .where((String e) => e.contains("Target of URI doesn't exist"))
        .toList();
    if (unresolvedUris.isNotEmpty) {
      stderr.writeln('E: unresolved imports in ${_rel(file)} — the element model is incomplete:');
      for (final String u in unresolvedUris.take(3)) {
        stderr.writeln('   $u');
      }
      stderr.writeln('   Refusing to extract against an unresolved element model.');
      exit(3);
    }
    for (final CompilationUnitMember member in result.unit.declarations) {
      if (member is ClassDeclaration) {
        classes.add(_ClassCtx(member, result));
      }
    }
  }

  // Pass 2: link State classes to their StatefulWidgets, then emit.
  final Map<String, _ClassCtx> stateClassOf = <String, _ClassCtx>{};
  for (final _ClassCtx c in classes) {
    final String sup = c.superSource;
    if (sup.startsWith('State<')) {
      final String widgetName = sup.substring(6, sup.length - 1);
      stateClassOf[widgetName] = c;
    }
  }

  for (final _ClassCtx c in classes) {
    final String sup = c.superSource;
    final String name = c.node.namePart.typeName.lexeme;

    if (sup == 'StatelessWidget') {
      components.add(_component(c, kind: 'stateless', stateCtx: null));
    } else if (sup == 'StatefulWidget') {
      components.add(_component(c, kind: 'stateful', stateCtx: stateClassOf[name]));
    } else if (sup == 'ChangeNotifier') {
      stores.add(_store(c));
    } else if (!sup.startsWith('State<')) {
      plainClasses.add(_plainClass(c));
    }
  }

  // Pass 3: navigation + endpoints (cross-cutting; collected by visitor).
  for (final _ClassCtx c in classes) {
    final _CallVisitor v = _CallVisitor(c);
    c.node.accept(v);
    navigation.addAll(v.navigation);
    endpoints.addAll(v.endpoints);
  }

  final List<String> unseenMvp =
      mvpWidgets.where((String w) => !widgetsSeen.contains(w)).toList()..sort();

  final Map<String, dynamic> out = <String, dynamic>{
    'spike': 'M0-T3',
    'note': 'Ad-hoc JSON. NOT the UIR schema. Feeds the M1 schema via the fidelity memo.',
    'project': p.basename(projectRoot),
    'files': files.map(_rel).toList(),
    'components': components,
    'stores': stores,
    'classes': plainClasses,
    'navigation': navigation,
    'endpoints': endpoints,
    'coverage': <String, dynamic>{
      'mvpWidgetsSeen': (widgetsSeen.where(mvpWidgets.contains).toList()..sort()),
      'mvpWidgetsNotExercisedByFixture': unseenMvp,
      'structuralWidgetsSeen':
          (widgetsSeen.where(structuralWidgets.contains).toList()..sort()),
      'otherWidgetsSeen': (widgetsSeen
          .where((String w) => !mvpWidgets.contains(w) && !structuralWidgets.contains(w))
          .toList()
        ..sort()),
    },
    'opaque': opaque,
    'stats': <String, dynamic>{
      'files': files.length,
      'components': components.length,
      'stores': stores.length,
      'widgetNodes': widgetNodeCount,
      'treeNodes': totalNodeCount,
      'opaqueNodes': opaque.length,
      'opaqueRatio': totalNodeCount == 0
          ? 0
          : double.parse((opaque.length / totalNodeCount).toStringAsFixed(4)),
    },
  };

  File(outPath).parent.createSync(recursive: true);
  File(outPath).writeAsStringSync('${const JsonEncoder.withIndent('  ').convert(out)}\n');

  stdout.writeln('wrote ${_rel(outPath)}');
  stdout.writeln('  components: ${components.length}  stores: ${stores.length}  '
      'widget nodes: $widgetNodeCount  opaque: ${opaque.length}/$totalNodeCount '
      '(${(out['stats']! as Map<String, dynamic>)['opaqueRatio']})');
  stdout.writeln('  MVP widgets exercised by fixture: '
      '${(out['coverage']! as Map<String, dynamic>)['mvpWidgetsSeen']}');
}

// ---------------------------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------------------------

Map<String, dynamic> _component(_ClassCtx c, {required String kind, _ClassCtx? stateCtx}) {
  final _ClassCtx buildHost = stateCtx ?? c;
  final MethodDeclaration? build = _method(buildHost, 'build');

  return <String, dynamic>{
    'name': c.node.namePart.typeName.lexeme,
    'kind': kind,
    'file': _rel(c.unit.path),
    'line': c.line(c.node.offset),
    // Widget constructor params == the widget class's final fields.
    'params': _fields(c)
        .map((Map<String, dynamic> f) => <String, dynamic>{'name': f['name'], 'type': f['type']})
        .toList(),
    if (stateCtx != null) 'stateClass': stateCtx.node.namePart.typeName.lexeme,
    // Extraction contract (Spec §2.3): State fields -> sig.Signal(scope: component).
    'signals': stateCtx == null
        ? <Map<String, dynamic>>[]
        : _fields(stateCtx)
            .where((Map<String, dynamic> f) => f['isStatic'] != true)
            .toList(),
    'effects': stateCtx == null ? <Map<String, dynamic>>[] : _effects(stateCtx),
    'actions': _actions(stateCtx ?? c),
    'render': build == null
        ? _opaque(buildHost, buildHost.node, 'no-build-method')
        : _walkBody(buildHost, build.body),
  };
}

Map<String, dynamic> _store(_ClassCtx c) {
  final List<Map<String, dynamic>> methods = <Map<String, dynamic>>[];
  for (final ClassMember m in c.node.body.members) {
    if (m is! MethodDeclaration) continue;
    final _WriteVisitor w = _WriteVisitor();
    m.body.accept(w);
    methods.add(<String, dynamic>{
      'name': m.name.lexeme,
      'isGetter': m.isGetter,
      'notifies': w.notifies,
      // A method that mutates state and notifies is a sig.Action; a getter over state is sig.Derived.
      'role': m.isGetter ? 'derived' : (w.notifies ? 'action' : 'method'),
      'writes': w.writes.toList()..sort(),
      'source': m.toSource().split('\n').first,
    });
  }
  return <String, dynamic>{
    'name': c.node.namePart.typeName.lexeme,
    'origin': 'changeNotifier',
    'file': _rel(c.unit.path),
    'line': c.line(c.node.offset),
    'signals': _fields(c),
    'members': methods,
  };
}

Map<String, dynamic> _plainClass(_ClassCtx c) => <String, dynamic>{
      'name': c.node.namePart.typeName.lexeme,
      'file': _rel(c.unit.path),
      'fields': _fields(c),
      'methods': c.node.body.members
          .whereType<MethodDeclaration>()
          .map((MethodDeclaration m) => <String, dynamic>{
                'name': m.name.lexeme,
                'isStatic': m.isStatic,
                'isAsync': m.body.isAsynchronous,
                'returns': m.returnType?.toSource(),
              })
          .toList(),
    };

List<Map<String, dynamic>> _fields(_ClassCtx c) {
  final List<Map<String, dynamic>> out = <Map<String, dynamic>>[];
  for (final ClassMember m in c.node.body.members) {
    if (m is! FieldDeclaration) continue;
    for (final VariableDeclaration v in m.fields.variables) {
      out.add(<String, dynamic>{
        'name': v.name.lexeme,
        'type': m.fields.type?.toSource() ?? v.initializer?.staticType?.getDisplayString(),
        'isFinal': m.fields.isFinal,
        'isLate': m.fields.isLate,
        'isStatic': m.isStatic,
        if (v.initializer != null) 'initial': v.initializer!.toSource(),
      });
    }
  }
  return out;
}

/// initState/dispose -> sig.Effect(timing: mount|unmount).
List<Map<String, dynamic>> _effects(_ClassCtx c) {
  final List<Map<String, dynamic>> out = <Map<String, dynamic>>[];
  for (final String hook in <String>['initState', 'dispose', 'didUpdateWidget']) {
    final MethodDeclaration? m = _method(c, hook);
    if (m == null) continue;
    out.add(<String, dynamic>{
      'timing': hook == 'initState'
          ? 'mount'
          : hook == 'dispose'
              ? 'unmount'
              : 'update',
      'from': hook,
      'statements': m.body is BlockFunctionBody
          ? (m.body as BlockFunctionBody)
              .block
              .statements
              .map((Statement s) => s.toSource())
              .toList()
          : <String>[m.body.toSource()],
    });
  }
  return out;
}

/// Every method becomes a candidate sig.Action; `setState` bodies give us the `writes` list.
List<Map<String, dynamic>> _actions(_ClassCtx c) {
  final List<Map<String, dynamic>> out = <Map<String, dynamic>>[];
  for (final ClassMember m in c.node.body.members) {
    if (m is! MethodDeclaration) continue;
    final String name = m.name.lexeme;
    if (<String>['build', 'initState', 'dispose', 'didUpdateWidget', 'createState'].contains(name)) {
      continue;
    }
    final _WriteVisitor w = _WriteVisitor();
    m.body.accept(w);
    if (w.setStateCount == 0 && w.writes.isEmpty && !w.notifies) continue;
    out.add(<String, dynamic>{
      'name': name,
      'isAsync': m.body.isAsynchronous,
      'setStateCalls': w.setStateCount,
      'writes': w.writes.toList()..sort(),
      'awaits': w.awaits,
      'guards': w.guards,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Widget-tree walk
// ---------------------------------------------------------------------------------------------

Map<String, dynamic> _walkBody(_ClassCtx c, FunctionBody body) {
  if (body is ExpressionFunctionBody) return _walk(c, body.expression);
  if (body is BlockFunctionBody) {
    final List<Statement> statements = body.block.statements;
    // A build() that is anything more than straight-line returns is a fidelity finding, so we
    // record the shape rather than flattening it away.
    final List<Map<String, dynamic>> branches = <Map<String, dynamic>>[];
    for (final Statement s in statements) {
      if (s is ReturnStatement && s.expression != null) {
        branches.add(<String, dynamic>{'when': 'default', 'node': _walk(c, s.expression!)});
      } else if (s is IfStatement) {
        final Statement then = s.thenStatement;
        final Block? block = then is Block ? then : null;
        final ReturnStatement? ret = block?.statements.whereType<ReturnStatement>().firstOrNull ??
            (then is ReturnStatement ? then : null);
        branches.add(<String, dynamic>{
          'when': s.expression.toSource(),
          'node': ret?.expression == null
              ? _opaque(c, s, 'if-without-return')
              : _walk(c, ret!.expression!),
        });
      } else if (s is VariableDeclarationStatement) {
        branches.add(<String, dynamic>{'let': s.variables.toSource()});
      } else {
        branches.add(<String, dynamic>{'stmt': s.toSource()});
      }
    }
    totalNodeCount++;
    return <String, dynamic>{'kind': 'block', 'branches': branches};
  }
  return _opaque(c, body, 'unsupported-body');
}

Map<String, dynamic> _walk(_ClassCtx c, Expression e) {
  totalNodeCount++;

  if (e is InstanceCreationExpression) {
    final String type = e.constructorName.type.toSource();
    final String? ctor = e.constructorName.name?.name;
    if (_isWidget(e.staticType)) {
      widgetsSeen.add(type.split('<').first);
      widgetNodeCount++;
      final Map<String, dynamic> props = <String, dynamic>{};
      final Map<String, dynamic> slots = <String, dynamic>{};

      for (final Argument arg in e.argumentList.arguments) {
        if (arg is NamedArgument) {
          final String name = arg.name.lexeme;
          final Expression v = arg.argumentExpression;
          if (_isWidget(v.staticType) || v is ListLiteral || v is FunctionExpression) {
            slots[name] = _walk(c, v);
          } else {
            props[name] = _prop(c, v);
          }
        } else if (arg is Expression) {
          // Positional args (e.g. Text('Sign in')) — the common case for Text/Icon.
          props['\$positional'] = <Map<String, dynamic>>[
            ...(props['\$positional'] as List<Map<String, dynamic>>? ??
                <Map<String, dynamic>>[]),
            _prop(c, arg),
          ];
        }
      }
      return <String, dynamic>{
        'kind': 'widget',
        'type': type,
        if (ctor != null) 'ctor': ctor, // ListView.builder -> ctor: "builder"
        'const': e.isConst,
        'line': c.line(e.offset),
        if (props.isNotEmpty) 'props': props,
        if (slots.isNotEmpty) 'slots': slots,
      };
    }
    // Non-widget construction inside a tree: EdgeInsets, TextStyle, MaterialPageRoute, Duration…
    return <String, dynamic>{
      'kind': 'value',
      'type': type,
      'const': e.isConst,
      'source': e.toSource(),
    };
  }

  if (e is ListLiteral) {
    final List<dynamic> items = <dynamic>[];
    for (final CollectionElement el in e.elements) {
      if (el is Expression) {
        items.add(_walk(c, el));
      } else if (el is IfElement) {
        totalNodeCount++;
        items.add(<String, dynamic>{
          'kind': 'collection-if', // -> UICond (normalization N2)
          'test': el.expression.toSource(),
          'then': el.thenElement is Expression
              ? _walk(c, el.thenElement as Expression)
              : _opaque(c, el, 'non-expression-if-element'),
          if (el.elseElement != null)
            'else': el.elseElement is Expression
                ? _walk(c, el.elseElement! as Expression)
                : _opaque(c, el, 'non-expression-else-element'),
        });
      } else {
        items.add(_opaque(c, el, 'unsupported-collection-element'));
      }
    }
    return <String, dynamic>{'kind': 'list', 'items': items};
  }

  if (e is ConditionalExpression) {
    return <String, dynamic>{
      'kind': 'cond', // -> UICond
      'test': e.condition.toSource(),
      'then': _walk(c, e.thenExpression),
      'else': _walk(c, e.elseExpression),
    };
  }

  if (e is FunctionExpression) {
    // builder / itemBuilder closures: the input to UIAsync (N4) and UIList (N3).
    return <String, dynamic>{
      'kind': 'closure',
      'params': e.parameters?.parameters
              .map((FormalParameter fp) => <String, dynamic>{
                    'name': fp.name?.lexeme,
                    'type': fp.type?.toSource(),
                  })
              .toList() ??
          <Map<String, dynamic>>[],
      'body': _walkBody(c, e.body),
    };
  }

  if (e is MethodInvocation && _isWidget(e.staticType)) {
    return <String, dynamic>{
      'kind': 'call-widget',
      'source': e.toSource(),
      'staticType': e.staticType?.getDisplayString(),
    };
  }

  if (e is SimpleIdentifier || e is PrefixedIdentifier || e is PropertyAccess) {
    return <String, dynamic>{
      'kind': 'ref',
      'source': e.toSource(),
      'staticType': e.staticType?.getDisplayString(),
    };
  }

  return _opaque(c, e, 'unsupported-expression');
}

/// Props are not walked as trees; we record enough to classify them at M1.
Map<String, dynamic> _prop(_ClassCtx c, Expression v) {
  totalNodeCount++;
  final String? type = v.staticType?.getDisplayString();

  if (v is StringInterpolation) {
    return <String, dynamic>{
      'bind': 'interp', // reactive text: an edge in the reactivity graph
      'source': v.toSource(),
      'parts': v.elements
          .whereType<InterpolationExpression>()
          .map((InterpolationExpression i) => i.expression.toSource())
          .toList(),
    };
  }
  if (v is Literal) return <String, dynamic>{'bind': 'const', 'value': v.toSource(), 'type': type};
  if (v is ConditionalExpression) {
    return <String, dynamic>{'bind': 'expr', 'source': v.toSource(), 'type': type};
  }
  if (v is FunctionExpression) {
    return <String, dynamic>{'bind': 'handler', 'source': v.toSource(), 'type': type};
  }
  if (v is InstanceCreationExpression) {
    return <String, dynamic>{
      'bind': 'value',
      'source': v.toSource(),
      'type': type,
      'const': v.isConst,
    };
  }
  if (v is SimpleIdentifier || v is PrefixedIdentifier || v is PropertyAccess) {
    return <String, dynamic>{'bind': 'ref', 'source': v.toSource(), 'type': type};
  }
  if (v is MethodInvocation || v is BinaryExpression) {
    return <String, dynamic>{'bind': 'expr', 'source': v.toSource(), 'type': type};
  }
  return _opaque(c, v, 'unsupported-prop');
}

Map<String, dynamic> _opaque(_ClassCtx c, AstNode n, String reason) {
  final Map<String, dynamic> node = <String, dynamic>{
    'kind': 'opaque',
    'reason': reason,
    'file': _rel(c.unit.path),
    'line': c.line(n.offset),
    'source': n.toSource(),
    'staticType': n is Expression ? n.staticType?.getDisplayString() : null,
  };
  opaque.add(node);
  return node;
}

bool _isWidget(DartType? t) {
  if (t is! InterfaceType) return false;
  if (t.getDisplayString() == 'Widget') return true;
  return t.allSupertypes.any((InterfaceType s) => s.getDisplayString() == 'Widget');
}

// ---------------------------------------------------------------------------------------------
// Visitors
// ---------------------------------------------------------------------------------------------

/// Collects the writes/awaits/guards inside a method body — the raw material for sig.Action.
class _WriteVisitor extends RecursiveAstVisitor<void> {
  final Set<String> writes = <String>{};
  final List<String> awaits = <String>[];
  final List<String> guards = <String>[];
  int setStateCount = 0;
  bool notifies = false;

  @override
  void visitMethodInvocation(MethodInvocation node) {
    final String name = node.methodName.name;
    if (name == 'setState') setStateCount++;
    if (name == 'notifyListeners') notifies = true;
    super.visitMethodInvocation(node);
  }

  @override
  void visitAssignmentExpression(AssignmentExpression node) {
    writes.add(node.leftHandSide.toSource());
    super.visitAssignmentExpression(node);
  }

  @override
  void visitAwaitExpression(AwaitExpression node) {
    awaits.add(node.expression.toSource());
    super.visitAwaitExpression(node);
  }

  @override
  void visitIfStatement(IfStatement node) {
    final String cond = node.expression.toSource();
    // `if (!mounted) return;` has no React analogue — a fidelity finding, so we record it.
    if (cond.contains('mounted')) guards.add(cond);
    super.visitIfStatement(node);
  }
}

/// Collects Navigator.* calls and http.* calls.
class _CallVisitor extends RecursiveAstVisitor<void> {
  _CallVisitor(this.ctx);

  final _ClassCtx ctx;
  final List<Map<String, dynamic>> navigation = <Map<String, dynamic>>[];
  final List<Map<String, dynamic>> endpoints = <Map<String, dynamic>>[];

  @override
  void visitMethodInvocation(MethodInvocation node) {
    final String? target = node.target?.toSource();
    final String name = node.methodName.name;

    if (target == 'Navigator') {
      final Map<String, dynamic> entry = <String, dynamic>{
        'method': name, // push | pop | …
        'file': _rel(ctx.unit.path),
        'line': ctx.line(node.offset),
        'source': node.toSource().replaceAll(RegExp(r'\s+'), ' '),
      };

      // Navigator.push(context, MaterialPageRoute(builder: (ctx) => HomeScreen(...)))
      for (final Argument arg in node.argumentList.arguments) {
        if (arg is InstanceCreationExpression &&
            arg.constructorName.type.toSource().contains('MaterialPageRoute')) {
          entry['route'] = 'MaterialPageRoute';
          for (final Argument a in arg.argumentList.arguments) {
            if (a is NamedArgument && a.name.lexeme == 'builder') {
              final Expression? body = _returnedExpression(a.argumentExpression);
              if (body is InstanceCreationExpression) {
                entry['target'] = body.constructorName.type.toSource();
                entry['propsPassed'] = body.argumentList.arguments
                    .whereType<NamedArgument>()
                    .map((NamedArgument ne) => <String, dynamic>{
                          'name': ne.name.lexeme,
                          'source': ne.argumentExpression.toSource(),
                          'type': ne.argumentExpression.staticType?.getDisplayString(),
                        })
                    .toList();
              }
            }
          }
        }
      }
      navigation.add(entry);
    }

    if (target == 'http' && <String>['get', 'post', 'put', 'delete', 'patch'].contains(name)) {
      final Expression? first = node.argumentList.arguments.whereType<Expression>().firstOrNull;
      endpoints.add(<String, dynamic>{
        'method': name.toUpperCase(),
        'uri': first?.toSource(),
        'file': _rel(ctx.unit.path),
        'line': ctx.line(node.offset),
        'enclosing': ctx.node.namePart.typeName.lexeme,
      });
    }

    super.visitMethodInvocation(node);
  }

  Expression? _returnedExpression(Expression closure) {
    if (closure is! FunctionExpression) return null;
    final FunctionBody body = closure.body;
    if (body is ExpressionFunctionBody) return body.expression;
    if (body is BlockFunctionBody) {
      return body.block.statements.whereType<ReturnStatement>().firstOrNull?.expression;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------------------------

class _ClassCtx {
  _ClassCtx(this.node, this.unit);

  final ClassDeclaration node;
  final ResolvedUnitResult unit;

  String get superSource => node.extendsClause?.superclass.toSource() ?? '';

  int line(int offset) => unit.lineInfo.getLocation(offset).lineNumber;
}

MethodDeclaration? _method(_ClassCtx c, String name) => c.node.body.members
    .whereType<MethodDeclaration>()
    .where((MethodDeclaration m) => m.name.lexeme == name)
    .firstOrNull;

String _rel(String path) => p.relative(path, from: p.dirname(projectRoot));

Map<String, String> _parseArgs(List<String> args) {
  final Map<String, String> out = <String, String>{};
  for (int i = 0; i < args.length - 1; i++) {
    if (args[i].startsWith('--')) out[args[i].substring(2)] = args[i + 1];
  }
  return out;
}
