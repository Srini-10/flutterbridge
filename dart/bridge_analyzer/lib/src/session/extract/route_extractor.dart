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
///
/// ## Where a route's arguments are bound (ADR-0025 D1)
///
/// A route *declaration* is resolvable from a construction alone — a path and a type — which is why
/// routes are collected by a standalone walk of the unit (`extractor.dart`). Its **arguments** are not:
/// `home: LoginScreen(isDark: _isDark)` binds `_isDark` to a signal only if the scope says `_isDark` is
/// one, and classifying without a scope would record a signal read as an opaque expression — worse than
/// recording nothing, because the generator would then emit a value that never updates.
///
/// The transition extractor solves the same problem by hanging off the *scoped* expression walk. A route
/// cannot: emitting from that walk would emit a route twice whenever a method body is walked twice (a
/// `build` that also reads as an action), and would lose a route declared where no scoped walk goes.
///
/// So the scope is **banked, not chased**. Every construction reached during a scoped walk offers itself
/// through `RouteExtractor.noteScope`; the standalone walk runs afterwards — `Extractor.extract` orders it so — and by
/// then the scope of every construction that could be a route's page is known. Emission stays in one
/// place, in one order, and each argument is bound in exactly the scope it was written in.
///
/// A construction no scoped walk reached has no banked scope, and then **no arguments are recorded at
/// all**. That is the status quo rather than a regression, and it is the only honest answer: the
/// alternative is to classify names against a scope that does not describe them.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/extract/binding_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';

/// Turns the routes adapters find into records.
final class RouteExtractor {
  /// Creates an extractor.
  RouteExtractor(this.out, this.registry, this.context, this.bindings);

  /// The record factory.
  final RawNodeEmitter out;

  /// The compiler's package knowledge — all of it.
  final AdapterRegistry registry;

  /// What the adapters run in.
  final AdapterContext context;

  /// For turning an argument's value expression into a `bind.*`.
  final BindingExtractor bindings;

  /// The scope each construction was reached in, by AST identity.
  ///
  /// Identity, not equality: two `Panel(label: 'Taps')` written in two methods are two constructions in
  /// two scopes, and an equality-keyed map would give the second one the first one's names.
  final Map<InstanceCreationExpression, Scope> _scopes =
      Map<InstanceCreationExpression, Scope>.identity();

  /// Banks the scope [node] was reached in, for [extract] to bind its arguments against later.
  ///
  /// **First reach wins.** A method body can be walked more than once — a `build` that both renders and
  /// reads as an action — and the scopes those walks carry are equivalent for the names an argument can
  /// mention. Taking the first makes the recorded answer independent of how many times a body happens to
  /// be walked, which is the same reasoning `TransitionExtractor._seen` is built on.
  ///
  /// Only a construction with a named argument is banked. One without cannot produce a route argument —
  /// [_arguments] reads named arguments and nothing else — so its scope would be recorded and never
  /// asked for, and a file's constructions are overwhelmingly of that kind.
  void noteScope(InstanceCreationExpression node, Scope scope) {
    if (node.argumentList.arguments.any((Argument a) => a is NamedArgument)) {
      _scopes.putIfAbsent(node, () => scope);
    }
  }

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
              if (_arguments(widget) case final List<RawValue> args when args.isNotEmpty)
                'arguments': RawList(args),
            },
          ),
        );
      }
    }

    route.children.forEach(_emit);
  }

  /// The arguments the route's construction site passes to its page, each as `{name, transport,
  /// binding}` (ADR-0025 D1).
  ///
  /// The same record an `app.RouteTransition` carries, produced the same way: the binding is classified
  /// in the scope the construction was written in, so a literal is `bind.Const`, a signal read is
  /// `bind.Signal` and a widget prop is `bind.Param`. That classification is the whole value of the
  /// field — it is what lets N11 tell a primitive that crosses a URL fine from a signal that must be
  /// promoted out of the component.
  ///
  /// `transport` is `primitive` on emit. The analyzer records that the value is bound; **N11 decides
  /// what becomes of it across the boundary** (ADR-11), exactly as it does for a transition. Guessing a
  /// transport here would pre-empt the pass that owns the question.
  ///
  /// **Named arguments only.** `RouteArgument.name` is "the parameter name on the destination", and a
  /// positional argument does not state one at the call site. Naming it would mean reading the resolved
  /// constructor's parameter list, which is a separate piece of work; recording a made-up name is not an
  /// option (INV-4).
  ///
  /// Returns empty when the construction has no banked scope — see this file's header. Empty is also
  /// what a route with no arguments yields, and the two are deliberately indistinguishable in the
  /// document: the field is absent either way, which is what it has always been.
  List<RawValue> _arguments(Expression? widget) {
    if (widget is! InstanceCreationExpression) {
      return const <RawValue>[];
    }
    final Scope? scope = _scopes[widget];
    if (scope == null) {
      return const <RawValue>[];
    }

    final List<RawValue> arguments = <RawValue>[];
    for (final Argument argument in widget.argumentList.arguments) {
      if (argument is! NamedArgument) {
        continue;
      }
      final RawNode binding = bindings.extract(argument.argumentExpression, scope);
      // An argument whose value has no UIR representation is omitted, not serialized as Dart source.
      // The expression extractor has already reported it (BRG1302).
      if (BindingExtractor.isOpaque(binding)) {
        continue;
      }
      arguments.add(
        RawMap(<String, RawValue>{
          'name': RawLiteral(argument.name.lexeme),
          'transport': const RawLiteral('primitive'),
          'binding': RawChild(binding),
        }),
      );
    }
    return arguments;
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
