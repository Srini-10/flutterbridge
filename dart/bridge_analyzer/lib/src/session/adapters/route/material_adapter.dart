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
import 'package:analyzer/dart/element/element.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/adapters/route/wrapper_resolver.dart';
import 'package:bridge_analyzer/src/session/adapters/widget/generated/material_catalog.dart';

/// Understands Flutter's own routing.
final class MaterialRouteAdapter implements RouteAdapter, TransitionAdapter {
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

    final Expression? generate = mapping.argumentFor('onGenerateRoute', node.argumentList);
    if (generate != null) {
      found.addAll(_generatedRoutes(context, generate));
    }

    return found;
  }

  /// Routes read out of an `onGenerateRoute:` callback, when its body is a literal switch.
  ///
  /// ## Why this is reading and not guessing
  ///
  /// `onGenerateRoute` is documented as building routes *at runtime*, and for an arbitrary function that
  /// is true — a path computed from a string, a table held in a variable, a redirect chain. This adapter
  /// used to stop there and report `BRG1304` for every one.
  ///
  /// M6-D measured what that costs: the corpus's dominant router is an `onGenerateRoute` whose body is a
  /// `switch` on `settings.name` where **every case label is a string literal and every destination is a
  /// named component**. That is a route table written as a switch, and refusing to read it left the
  /// largest application's entire routing surface invisible — `routes:` appears zero times in the corpus.
  ///
  /// Nothing here is inferred. A case label is read only when it is a compile-time constant, the
  /// destination only when it is a `MaterialPageRoute`-family construction whose builder returns a widget
  /// construction, and the switch only when its subject is the `name` of the callback's own
  /// `RouteSettings` parameter, **resolved to that parameter's element** rather than matched by spelling.
  /// Anything that does not fit keeps the diagnostic, which is now narrowed to the callbacks it is
  /// actually true of.
  List<RouteDeclaration> _generatedRoutes(AdapterContext context, Expression generate) {
    final ({FunctionBody body, FormalParameterList? params})? function = _functionOf(context, generate);
    if (function == null) {
      context.report(
        Codes.unsupportedWrapper,
        'This `onGenerateRoute` names a callback whose body this analyzer cannot see from here — it is '
        'declared in another file, or is not a function it can resolve. Its routes are not read into '
        'the static route graph, so cross-route state promotion (N11) will not see them.',
        generate,
      );
      return const <RouteDeclaration>[];
    }

    // The parameter the switch must be asking about. A callback takes exactly one `RouteSettings`, and
    // resolving it is what separates *this* settings object from any other value called `settings`.
    final FormalParameter? settings = function.params?.parameters.firstOrNull;
    final SwitchStatement? switchOn = _switchOn(function.body, settings);
    if (switchOn == null) {
      context.report(
        Codes.unsupportedWrapper,
        'This `onGenerateRoute` computes its routes rather than selecting them from a literal switch on '
        '`settings.name`, so they cannot be read into a static route graph. The routes it generates will '
        'be invisible to cross-route state promotion (N11).',
        generate,
      );
      return const <RouteDeclaration>[];
    }

    final List<RouteDeclaration> found = <RouteDeclaration>[];
    for (final SwitchMember member in switchOn.members) {
      // **`SwitchPatternCase`, not `SwitchCase`.** Dart 3 parses `case '/settings':` as a constant
      // *pattern*; the legacy `SwitchCase` node is what a pre-patterns switch produced. Matching only the
      // legacy one skipped every case in a modern file — silently, because the skip branch is the one
      // that handles `default:`. Two case labels became zero routes and zero diagnostics, which is the
      // worst shape a compiler bug can take: it looked exactly like the feature doing nothing.
      final Expression? label = switch (member) {
        SwitchPatternCase() =>
          member.guardedPattern.pattern is ConstantPattern
              ? (member.guardedPattern.pattern as ConstantPattern).expression
              : null,
        SwitchCase() => member.expression,
        // `default:` serves every unmatched name. That is not a path, and inventing one for it would be
        // the guess §A17.2 refused. It is left out silently: a fallback is not a missing route.
        _ => null,
      };
      if (label == null) {
        continue;
      }
      final String? path = _constantString(label);
      if (path == null) {
        context.report(
          Codes.unsupportedWrapper,
          'This route case is not a compile-time constant, so it cannot be placed in a static route '
          'graph.',
          label,
        );
        continue;
      }
      final Expression? destination = _caseDestination(context, member);
      if (destination == null) {
        context.report(
          Codes.unsupportedWrapper,
          'This route case does not return a page route whose builder constructs a widget, so the '
          'component it renders cannot be read. The route is left out rather than pointed at a guess.',
          member,
        );
        continue;
      }
      found.add(RouteDeclaration(path: path, at: member, component: destination));
    }
    return found;
  }

  /// The body and parameters of the callback [generate] names, when this unit can see them.
  ///
  /// Two forms, and both are fully present in the file being walked:
  ///
  ///   * an **inline closure** — `onGenerateRoute: (settings) { … }`;
  ///   * a **reference to a function declared in this unit** — resolved through the element model and
  ///     then located in this unit's own declarations, never by matching a name.
  ///
  /// A reference into another file returns null. `AdapterContext` carries one `CompilationUnit`, so
  /// there is no AST to read there, and reading it would need an async session lookup that the adapter
  /// interface is deliberately not shaped for.
  ({FunctionBody body, FormalParameterList? params})? _functionOf(
    AdapterContext context,
    Expression generate,
  ) {
    if (generate is FunctionExpression) {
      return (body: generate.body, params: generate.parameters);
    }

    final Element? element = switch (generate) {
      Identifier() => generate.element,
      PropertyAccess() => generate.propertyName.element,
      _ => null,
    };
    if (element == null) {
      return null;
    }

    // Located by **element identity** in this unit's own declarations. A same-named function in another
    // class is a different element and does not match, which is the whole reason this is not a name
    // lookup.
    for (final CompilationUnitMember member in context.unit.declarations) {
      switch (member) {
        case FunctionDeclaration() when member.declaredFragment?.element == element:
          return (
            body: member.functionExpression.body,
            params: member.functionExpression.parameters,
          );
        case ClassDeclaration():
          for (final ClassMember classMember in member.body.members) {
            if (classMember is MethodDeclaration &&
                classMember.declaredFragment?.element == element) {
              return (body: classMember.body, params: classMember.parameters);
            }
          }
        default:
          continue;
      }
    }
    return null;
  }

  /// The `switch` [body] is, when it switches on [settings]`.name` and nothing else.
  ///
  /// The subject is checked against the parameter's **element**, so a local variable that happens to be
  /// called `settings` is not mistaken for the callback's own. A body that does anything before the
  /// switch is refused rather than read past: a guard that returns early changes which routes exist.
  SwitchStatement? _switchOn(FunctionBody body, FormalParameter? settings) {
    final Element? parameter = settings?.declaredFragment?.element;
    if (parameter == null) {
      return null;
    }

    final Statement? only = switch (body) {
      BlockFunctionBody() when body.block.statements.length == 1 => body.block.statements.single,
      _ => null,
    };
    if (only is! SwitchStatement) {
      return null;
    }

    final Expression subject = only.expression;
    if (subject is! PropertyAccess && subject is! PrefixedIdentifier) {
      return null;
    }
    final (Expression target, String property) = switch (subject) {
      PropertyAccess() => (subject.target!, subject.propertyName.name),
      PrefixedIdentifier() => (subject.prefix, subject.identifier.name),
      _ => throw StateError('unreachable'),
    };
    if (property != MaterialCatalog.navigationSettingsNameProp) {
      return null;
    }
    return target is Identifier && target.element == parameter ? only : null;
  }

  /// The widget a case returns, reached through the page route it builds.
  ///
  /// `case '/chat': return MaterialPageRoute(builder: (_) => ChatScreen(...));` — the route object is
  /// framework machinery and the widget is the destination, which is the **same shape**
  /// `TransitionDeclaration.toWidget` reads for an imperative push. So it is read with the same three
  /// helpers: the route recognised by its **resolved type**, the builder found through the wrapper-aware
  /// argument mapping, and [_returned] unwrapping the closure.
  ///
  /// The first version of this reimplemented all three by hand and matched the constructor's *lexeme*.
  /// That is name matching — a class called `MaterialPageRoute` that extends nothing is not one — and it
  /// also simply did not work: it read no destination at all. Reusing what already worked fixed the rule
  /// violation and the bug in one edit, which is the usual relationship between those two.
  Expression? _caseDestination(AdapterContext context, SwitchMember member) {
    for (final Statement statement in member.statements) {
      if (statement is! ReturnStatement) {
        continue;
      }
      final Expression? route = statement.expression;
      if (route is! InstanceCreationExpression) {
        return null;
      }
      if (!MaterialCatalog.navigationRouteTypes.any(
        (String type) => AdapterContext.isA(route.staticType, type, package: _package),
      )) {
        return null;
      }

      final ArgumentMapping mapping = WrapperResolver.mappingFor(route, context.unit);
      final Expression? builder = mapping.argumentFor(
        MaterialCatalog.navigationBuilderProp,
        route.argumentList,
      );
      return builder is FunctionExpression ? _returned(builder) : null;
    }
    return null;
  }

  // ── transitions (Spec v2.4 §A17) ───────────────────────────────────────────────────────────────

  @override
  bool claimsTransition(AdapterContext context, MethodInvocation node) {
    final String method = node.methodName.name;
    if (!MaterialCatalog.navigationPushRoute.contains(method) &&
        !MaterialCatalog.navigationPushPath.contains(method) &&
        !MaterialCatalog.navigationPop.contains(method)) {
      return false;
    }

    // **Resolved, not named.** An application's own `push` on its own class is not Flutter's, and
    // claiming it would put an edge in the route graph that the program does not have. This is the
    // lesson ISSUE-18 taught with `setState`: wonderous declares its own, and matching on the name
    // alone was wrong.
    final String? library = node.methodName.element?.library?.identifier;
    if (library == null || !library.startsWith(_package)) {
      return false;
    }

    // The method must belong to the navigator itself. `package:flutter/` is a large place, and
    // `push` is not a rare name in it.
    final String? owner = node.methodName.element?.enclosingElement?.name;
    return owner != null && MaterialCatalog.navigationTypes.contains(owner);
  }

  @override
  NavigateAction? navigationActionOf(AdapterContext context, MethodInvocation node) {
    // Read off the catalog's own vocabulary (ADR-18), never a literal here: `pushReplacement` is a
    // Flutter fact, and `session/extract/` may not contain the word — nor may this file invent a second
    // list that can drift from the one extraction already uses.
    final String method = node.methodName.name;
    if (MaterialCatalog.navigationPop.contains(method)) {
      return method == 'popUntil' ? NavigateAction.popUntil : NavigateAction.pop;
    }
    if (MaterialCatalog.navigationPushRoute.contains(method) ||
        MaterialCatalog.navigationPushPath.contains(method)) {
      if (method.startsWith('pushReplacement')) {
        return NavigateAction.replace;
      }
      // `pushAndRemoveUntil`, `pushNamedAndRemoveUntil` and `popAndPushNamed` compose two stack
      // effects. ADR-0025 models neither composition, and all three measure zero in the corpus, so
      // they are left to the refusal that already covers them rather than lowered to the nearer half.
      if (method.contains('RemoveUntil') || method == 'popAndPushNamed') {
        return null;
      }
      return NavigateAction.push;
    }
    return null;
  }

  @override
  TransitionDeclaration? transitionOf(AdapterContext context, MethodInvocation node) {
    final String method = node.methodName.name;

    // A pop is not an edge. It returns along one that already exists, and the nav graph gains nothing
    // from a node for it (§A17.3).
    if (MaterialCatalog.navigationPop.contains(method)) {
      return null;
    }

    // `Expression implements Argument`, so `argumentExpression` reads a positional argument and a
    // named one alike; `is! NamedArgument` is what separates them.
    final List<Expression> positional = <Expression>[
      for (final Argument argument in node.argumentList.arguments)
        if (argument is! NamedArgument) argument.argumentExpression,
    ];

    if (MaterialCatalog.navigationPushPath.contains(method)) {
      return _toPath(context, node, positional);
    }
    return _toWidget(context, node, positional);
  }

  /// `Navigator.pushNamed(context, '/home')` — the destination is a route the program declares.
  TransitionDeclaration? _toPath(
    AdapterContext context,
    MethodInvocation node,
    List<Expression> positional,
  ) {
    // Static form passes `context` first; the instance form (`Navigator.of(context).pushNamed(…)`)
    // does not. The path is the first argument that is a string, which is true of both.
    for (final Expression argument in positional) {
      final String? path = _constantString(argument);
      if (path == null) {
        continue;
      }

      // `pushNamed(context, '/x', arguments: foo)` carries **one untyped object**, with no parameter
      // name — and `RouteArgument` requires a name, because a generator has to pass it to something.
      // We cannot name it, and we will not invent one, so the fact that it exists is reported rather
      // than dropped in silence (INV-4).
      final Argument? carried = node.argumentList.arguments
          .whereType<NamedArgument>()
          .where((NamedArgument a) => a.name.lexeme == 'arguments')
          .firstOrNull;
      if (carried != null) {
        context.report(
          Codes.unsupportedWrapper,
          'This navigation carries an `arguments:` object to a named route. Flutter passes it as one '
          'untyped value with no parameter name, and a route argument must have a name for a '
          'generator to pass it to anything. It is reported rather than dropped silently, and rather '
          'than given a name it does not have.',
          carried,
        );
      }

      return TransitionDeclaration.toPath(path: path, at: node);
    }

    context.report(
      Codes.unsupportedWrapper,
      'This navigation names its route with something that is not a compile-time constant, so the '
      'destination cannot be resolved statically. The edge will be missing from the route graph, and '
      'cross-route state promotion (N11) will not see it.',
      node,
    );
    return null;
  }

  /// `Navigator.push(context, MaterialPageRoute(builder: (_) => HomeScreen(id: 3)))`.
  ///
  /// The destination is **constructed inline**: there is no path, and this does not invent one
  /// (§A17.6). It returns the expression that builds the widget; resolving *that* to a component is
  /// extraction's job, because it needs the resolved scope an adapter does not have.
  TransitionDeclaration? _toWidget(
    AdapterContext context,
    MethodInvocation node,
    List<Expression> positional,
  ) {
    for (final Expression argument in positional) {
      if (!MaterialCatalog.navigationRouteTypes.any(
        (String type) => AdapterContext.isA(argument.staticType, type, package: _package),
      )) {
        continue;
      }
      if (argument is! InstanceCreationExpression) {
        break; // a route held in a variable — reported below
      }

      final ArgumentMapping mapping = WrapperResolver.mappingFor(argument, context.unit);
      final Expression? builder = mapping.argumentFor(
        MaterialCatalog.navigationBuilderProp,
        argument.argumentList,
      );

      // `builder: (context) => HomeScreen(…)` — the destination is what the closure returns.
      final Expression? destination = builder is FunctionExpression ? _returned(builder) : null;
      if (destination == null) {
        break;
      }

      return TransitionDeclaration.toWidget(
        widget: destination,
        at: node,
        arguments: _argumentsOf(destination),
      );
    }

    context.report(
      Codes.unsupportedWrapper,
      'This navigation builds its destination in a way the adapter cannot read — a route held in a '
      'variable, or a builder that does more than return a widget. The edge will be missing from the '
      'route graph rather than guessed at.',
      node,
    );
    return null;
  }

  /// The expression a closure returns, or null if it does more than return one.
  ///
  /// `(_) => HomeScreen()` is an [ExpressionFunctionBody]; `(_) { return HomeScreen(); }` is a
  /// [BlockFunctionBody] with one `return`. Both are the same destination written two ways. A body that
  /// does anything else is computing its destination, and this does not guess at what it computes.
  static Expression? _returned(FunctionExpression closure) {
    final FunctionBody body = closure.body;
    if (body is ExpressionFunctionBody) {
      return body.expression;
    }
    if (body is BlockFunctionBody) {
      final NodeList<Statement> statements = body.block.statements;
      if (statements.length != 1) {
        return null;
      }
      final Statement only = statements.single;
      return only is ReturnStatement ? only.expression : null;
    }
    return null;
  }

  /// The named arguments carried to the destination, in source order.
  ///
  /// Left as expressions. Turning one into a `bind.*` needs the resolved scope, which lives in the
  /// extractor — an adapter that tried would be guessing at const-vs-signal-vs-param.
  static List<TransitionArgument> _argumentsOf(Expression destination) {
    if (destination is! InstanceCreationExpression) {
      return const <TransitionArgument>[];
    }
    return <TransitionArgument>[
      for (final Argument argument in destination.argumentList.arguments)
        if (argument is NamedArgument)
          TransitionArgument(
            name: argument.name.lexeme,
            value: argument.argumentExpression,
          ),
    ];
  }

  static String? _constantString(Expression node) {
    if (node is SimpleStringLiteral) {
      return node.value;
    }
    return node.computeConstantValue()?.value?.toStringValue();
  }
}
