/// go_router.
///
/// Layer: `session` (adapters).
///
/// ## Wrappers, and why this adapter reads code instead of guessing
///
/// Real applications do not construct `GoRoute` directly. wonderous declares:
///
/// ```dart
/// class AppRoute extends GoRoute {
///   AppRoute(String path, Widget Function(GoRouterState s) builder, {List<GoRoute> routes = const []})
///     : super(
///         path: path,
///         routes: routes,
///         pageBuilder: (context, state) { ... body: builder(state) ... },
///       );
/// }
/// ```
///
/// and then writes `AppRoute(ScreenPaths.home, (_) => HomeScreen())` — **positional** arguments, and a
/// page that is produced inside a closure. A reader that knows only `GoRoute(path:, builder:)` finds
/// **zero routes** in an application that declares a dozen. That is what wonderous did to us.
///
/// The temptation is to special-case it: *"first positional is the path, second is the builder."* That
/// is a heuristic, it is wrong for the next application, and ISSUE-16 forbids it.
///
/// So this adapter does the honest thing: it **reads the wrapper's constructor**. Every fact it needs
/// is written down in the user's own code.
///
/// * `super(path: path, …)` — the super argument `path` is a bare reference to the wrapper's first
///   positional parameter. So argument 0 at a call site *is* the route's path. That is not a guess; it
///   is what the constructor says.
/// * `pageBuilder: (context, state) { … builder(state) … }` — the super argument `pageBuilder` is a
///   closure that **invokes** the wrapper's `builder` parameter. So the wrapper's `builder` is what
///   produces the page. Again: not a guess. The data flow is right there.
///
/// Anything the wrapper does *not* forward is genuinely unknowable, and it becomes `BRG1304` rather
/// than an invention.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/element/element.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/adapters/route/wrapper_resolver.dart';

/// Understands `go_router`.
final class GoRouterAdapter implements RouteAdapter {
  /// Creates the adapter.
  const GoRouterAdapter();

  @override
  String get name => 'go_router';

  /// Ahead of Material. An application using go_router still constructs a `MaterialApp`, and its
  /// `home:`/`routes:` are usually absent or vestigial there — the router owns the routes.
  @override
  int get priority => 10;

  @override
  Set<String> get packages => const <String>{'package:go_router/'};

  @override
  Set<String> get symbols => const <String>{'GoRouter', 'GoRoute', 'ShellRoute'};

  @override
  Set<String> get annotations => const <String>{};

  /// The library go_router's own types come from.
  static const String _package = 'package:go_router/';

  @override
  bool claimsRoutes(AdapterContext context, InstanceCreationExpression node) =>
      AdapterContext.isA(node.staticType, 'GoRouter', package: _package);

  @override
  List<RouteDeclaration> routesOf(AdapterContext context, InstanceCreationExpression node) {
    for (final Argument argument in node.argumentList.arguments) {
      if (argument is NamedArgument && argument.name.lexeme == 'routes') {
        return _routes(context, argument.argumentExpression, parent: '');
      }
    }
    return const <RouteDeclaration>[];
  }

  /// A `routes:` list. Nests.
  List<RouteDeclaration> _routes(
    AdapterContext context,
    Expression routes, {
    required String parent,
  }) {
    if (routes is! ListLiteral) {
      return const <RouteDeclaration>[];
    }

    final List<RouteDeclaration> found = <RouteDeclaration>[];
    for (final CollectionElement element in routes.elements) {
      final RouteDeclaration? route = _route(context, element, parent: parent);
      if (route != null) {
        found.add(route);
      }
    }
    return found;
  }

  RouteDeclaration? _route(
    AdapterContext context,
    CollectionElement element, {
    required String parent,
  }) {
    // `routes: [ _timelineRoute, _collectionRoute, AppRoute(...) ]` — a route held in a variable is
    // legal, common, and not something we can follow without inlining the program. Named, not guessed.
    if (element is! InstanceCreationExpression) {
      if (element is Expression) {
        context.report(
          Codes.unsupportedWrapper,
          'This route is not constructed here, so its path and component cannot be read. Only routes '
          'declared inline can be linked into the route graph.',
          element,
        );
      }
      return null;
    }

    final bool isRoute = AdapterContext.isA(element.staticType, 'GoRoute', package: _package);
    final bool isShell = AdapterContext.isA(element.staticType, 'ShellRoute', package: _package);
    if (!isRoute && !isShell) {
      return null;
    }

    // The argument mapping. For a direct `GoRoute(path: …)` it is the identity; for a wrapper it is
    // whatever the wrapper's own constructor says it is.
    final ArgumentMapping mapping = WrapperResolver.mappingFor(element, context.unit);

    final Expression? pathArgument = mapping.argumentFor('path', element.argumentList);
    final Expression? builder =
        mapping.argumentFor('builder', element.argumentList) ??
        mapping.argumentFor('pageBuilder', element.argumentList);
    final Expression? children = mapping.argumentFor('routes', element.argumentList);
    final bool hasRedirect = mapping.argumentFor('redirect', element.argumentList) != null;

    // A ShellRoute has no path of its own: it wraps its children in a layout. Its children still have
    // paths, and they are still absolute, so the shell contributes nothing to the prefix.
    if (isShell && !isRoute) {
      return children == null
          ? null
          : RouteDeclaration(
              path: parent,
              at: element,
              children: _routes(context, children, parent: parent),
              hasRedirect: hasRedirect,
            );
    }

    String? path = _constantString(pathArgument);

    // wonderous declares `static String splash = '/'` — a *mutable* static, which the constant
    // evaluator correctly refuses. Its initializer is right there in the file, though, and reading it
    // is reading the code, not guessing at a convention.
    //
    // The assumption — and it IS one — is that nobody reassigns the field at runtime. That is not
    // provable from one file, so it is **disclosed**, every time, rather than made quietly. A user who
    // makes the field `const` removes the assumption entirely, and the diagnostic says so.
    if (path == null && pathArgument != null) {
      path = _declaredInitializer(pathArgument, context.unit);
      if (path != null) {
        context.report(
          Codes.unsupportedWrapper,
          "This route's path comes from `${pathArgument.toSource()}`, which is a mutable static, not "
          '''
a constant. The compiler read its declared initializer ("$path") — but if it is reassigned at '''
          'runtime, the route graph will be wrong. Declaring it `const` removes the assumption.',
          pathArgument,
        );
      }
    }

    if (path == null) {
      if (pathArgument != null) {
        context.report(
          Codes.unsupportedWrapper,
          "This route's path is not a compile-time constant, so it cannot be placed in a static route "
          'graph.',
          pathArgument,
        );
      } else if (mapping.isWrapper) {
        context.report(
          Codes.adapterRejected,
          'The wrapper `${mapping.wrapperName}` does not forward a `path` to GoRoute in a way that '
          'can be read, so its routes cannot be recovered.',
          element,
        );
      }
      return null;
    }

    final String full = _join(parent, path);

    return RouteDeclaration(
      path: full,
      at: element,
      component: builder,
      children: children == null
          ? const <RouteDeclaration>[]
          : _routes(context, children, parent: full),
      hasRedirect: hasRedirect,
    );
  }

  /// The string [node] evaluates to, at compile time.
  ///
  /// Real routing tables name their paths through constants — `path: Routes.login`, where `Routes.login`
  /// is `static const login = '/login'`. A literal-only reader finds nothing in compass_app, which
  /// declares eight routes.
  ///
  /// wonderous uses `static String` (not `const`), and the evaluator correctly refuses those: a path
  /// that is not constant is a path that could differ between runs, and it has no place in a static
  /// graph. That is a real limitation, honestly reported, not a bug.
  static String? _constantString(Expression? node) {
    if (node == null) {
      return null;
    }
    if (node is SimpleStringLiteral) {
      return node.value;
    }
    return node.computeConstantValue()?.value?.toStringValue();
  }

  /// The string a **mutable static** field was declared with, if it was declared with one here.
  ///
  /// Matched on the resolved element of the receiver, never on its name: two classes may be called
  /// `ScreenPaths`, and reading the wrong one's field would produce a route graph that quietly does not
  /// match the application.
  static String? _declaredInitializer(Expression node, CompilationUnit unit) {
    final (Expression? receiver, String? field) = switch (node) {
      PrefixedIdentifier() => (node.prefix, node.identifier.name),
      PropertyAccess() => (node.target, node.propertyName.name),
      _ => (null, null),
    };
    if (receiver is! Identifier || field == null) {
      return null;
    }

    final Element? owner = receiver.element;
    if (owner is! InterfaceElement) {
      return null;
    }

    for (final CompilationUnitMember member in unit.declarations) {
      if (member is! ClassDeclaration ||
          !identical(member.declaredFragment?.element, owner)) {
        continue;
      }
      for (final ClassMember classMember in member.body.members) {
        if (classMember is! FieldDeclaration || !classMember.isStatic) {
          continue;
        }
        for (final VariableDeclaration variable in classMember.fields.variables) {
          if (variable.name.lexeme == field) {
            final Expression? initializer = variable.initializer;
            return initializer is SimpleStringLiteral ? initializer.value : null;
          }
        }
      }
    }
    return null;
  }

  static String _join(String parent, String path) {
    if (path.startsWith('/')) {
      return path;
    }
    if (parent.isEmpty) {
      return '/$path';
    }
    return parent.endsWith('/') ? '$parent$path' : '$parent/$path';
  }
}
