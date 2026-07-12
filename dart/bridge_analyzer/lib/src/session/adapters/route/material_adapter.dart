/// Material / Navigator 1 routing.
///
/// Layer: `session` (adapters).
///
/// `MaterialApp(home:)` and `MaterialApp(routes: {…})` — the routing every Flutter app starts with,
/// and the one an application keeps until it outgrows it.
///
/// `home:` is not "a widget parameter that happens to be shown first": it is the application's entry
/// route, and N11 needs it in the graph like any other.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/adapters/route/wrapper_resolver.dart';

/// Understands Flutter's own routing.
final class MaterialRouteAdapter implements RouteAdapter {
  /// Creates the adapter.
  const MaterialRouteAdapter();

  @override
  String get name => 'flutter_material';

  /// After go_router. An application using go_router still constructs a `MaterialApp`, and it is the
  /// router that owns the routes there — so the router gets asked first.
  @override
  int get priority => 20;

  @override
  Set<String> get packages => const <String>{'package:flutter/'};

  @override
  Set<String> get symbols => const <String>{'MaterialApp', 'CupertinoApp', 'WidgetsApp', 'Navigator'};

  @override
  Set<String> get annotations => const <String>{};

  static const String _package = 'package:flutter/';

  @override
  bool claimsRoutes(AdapterContext context, InstanceCreationExpression node) =>
      symbols.any((String s) => AdapterContext.isA(node.staticType, s, package: _package));

  @override
  List<RouteDeclaration> routesOf(AdapterContext context, InstanceCreationExpression node) {
    final ArgumentMapping mapping = WrapperResolver.mappingFor(node, context.unit);
    final List<RouteDeclaration> found = <RouteDeclaration>[];

    final Expression? home = mapping.argumentFor('home', node.argumentList);
    if (home != null) {
      found.add(RouteDeclaration(path: '/', at: home, component: home));
    }

    final Expression? table = mapping.argumentFor('routes', node.argumentList);
    if (table is SetOrMapLiteral) {
      for (final CollectionElement element in table.elements) {
        if (element is! MapLiteralEntry) {
          continue;
        }
        final String? path = _constantString(element.key);
        if (path == null) {
          context.report(
            Codes.unsupportedWrapper,
            'This route key is not a compile-time constant, so it cannot be placed in a static route '
            'graph.',
            element.key,
          );
          continue;
        }
        found.add(
          RouteDeclaration(path: path, at: element, component: element.value),
        );
      }
    }

    // `onGenerateRoute:` builds routes at runtime, from a settings object. There is no static route
    // table to read — that is the whole point of the callback — so it is named, never guessed at.
    if (mapping.argumentFor('onGenerateRoute', node.argumentList) != null) {
      context.report(
        Codes.unsupportedWrapper,
        'onGenerateRoute builds routes at runtime, so they cannot be read into a static route graph. '
        'The routes it generates will be invisible to cross-route state promotion (N11).',
        node,
      );
    }

    return found;
  }

  static String? _constantString(Expression node) {
    if (node is SimpleStringLiteral) {
      return node.value;
    }
    return node.computeConstantValue()?.value?.toStringValue();
  }
}
