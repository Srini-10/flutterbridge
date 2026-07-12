/// Routes.
///
/// Layer: `session` (extraction).
///
/// **This file contains no package knowledge.** There is no `if (name == 'GoRouter')` here, and there
/// never will be again (ISSUE-16). It asks the adapter registry what routes a construction declares,
/// and turns the answer into records. Adapters know `go_router`; this knows `app.Route`.
///
/// The route graph is not a nicety. **N11 (`promote-cross-route-state`, ADR-11) is defined over it**: a
/// signal or a callback that crosses a route boundary cannot be serialized into a URL, so it must be
/// promoted out of the component and into a store. A route graph that misses an edge is a normalization
/// pass that silently does nothing, and a generated app whose state vanishes on navigation.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';

/// Turns the routes adapters find into records.
final class RouteExtractor {
  /// Creates an extractor.
  const RouteExtractor(this.out, this.registry, this.context);

  /// The record factory.
  final RawNodeEmitter out;

  /// The compiler's package knowledge — all of it.
  final AdapterRegistry registry;

  /// What the adapters run in.
  final AdapterContext context;

  /// Extracts every route the construction [node] declares, if any adapter says it declares any.
  void extract(InstanceCreationExpression node) {
    registry.routesOf(context, node).forEach(_emit);
  }

  void _emit(RouteDeclaration route) {
    final Expression? component = route.component;

    // A ShellRoute has children but no page of its own. It is a layout, and a layout with no page is
    // not a route — its children are, and they carry the prefix.
    if (component != null) {
      final Expression? widget = _widgetOf(component);
      final String? name = _componentName(widget);
      final String? target = name == null
          ? null
          : out.componentSymbolOf(widget?.staticType, name);

      if (target == null) {
        // A route whose page is not a component this project declares — an inline tree, a call, a
        // widget from a package. `app.Route.component` refers to a component *by id*, and inventing a
        // symbol nothing declares would be BRG1201.
        out.report(
          Codes.unsupportedWrapper,
          'This route does not resolve to a component declared in this project, so it cannot be '
          'linked into the route graph. Cross-route state promotion (N11) will not see it.',
          route.at,
        );
      } else {
        out.emit(
          RawNode(
            kind: 'app.Route',
            span: out.span(route.at),
            symbol: out.symbols.route(route.path),
            fields: <String, RawValue>{
              'path': RawLiteral(route.path),
              'component': RawRef(target),
              if (_pathParams(route.path).isNotEmpty)
                'params': RawList(_pathParams(route.path)),
            },
          ),
        );
      }
    }

    route.children.forEach(_emit);
  }

  /// The widget expression a route's page comes from.
  ///
  /// A builder is `(context, state) => Screen()`, or a block body that returns one; for
  /// `MaterialApp(home:)` it is the widget itself.
  static Expression? _widgetOf(Expression node) {
    if (node is InstanceCreationExpression) {
      return node;
    }
    if (node is! FunctionExpression) {
      return null;
    }
    return switch (node.body) {
      final ExpressionFunctionBody body => body.expression,
      final BlockFunctionBody body => _returned(body.block),
      _ => null,
    };
  }

  static Expression? _returned(Block block) {
    for (final Statement statement in block.statements.reversed) {
      if (statement is ReturnStatement) {
        return statement.expression;
      }
    }
    return null;
  }

  /// The name of the component a route's page constructs.
  String? _componentName(Expression? widget) {
    if (widget is! InstanceCreationExpression) {
      return null;
    }
    // Asked of the registry, not of the name: a page is a component because its *type* is a widget.
    return registry.recogniseWidget(context, widget.staticType).isWidget
        ? widget.constructorName.type.name.lexeme
        : null;
  }

  /// `/wonder/:id` — the segment after the colon is a route parameter, and it is the transport N11
  /// reasons about. Reading it from the path is not inference: it is the router's own syntax.
  static List<RawValue> _pathParams(String path) => <RawValue>[
    for (final String segment in path.split('/'))
      if (segment.startsWith(':'))
        RawMap(<String, RawValue>{
          'name': RawLiteral(segment.substring(1)),
          // A URL segment is a string. It is not "probably an int": the transport is what it is, and
          // N11's job is to say when that is not enough.
          'type': const RawMap(<String, RawValue>{'name': RawLiteral('String')}),
          'required': const RawLiteral(true),
        }),
  ];
}
