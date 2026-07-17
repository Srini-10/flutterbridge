/// Route transitions.
///
/// Layer: `session` (extraction).
///
/// **This file contains no package knowledge.** There is no `if (method == 'push')` here: it asks the
/// adapter registry what navigation a call performs, and turns the answer into a record. Adapters know
/// `Navigator.push` and `context.go`; this knows `app.RouteTransition` (ISSUE-16, ADR-18).
///
/// A route transition is the **edge** N11 (`promote-cross-route-state`, ADR-11) is defined over. The
/// route graph had nodes and no edges until this ran: the analyzer emitted `app.Route` declarations
/// but never a transition, so N11 had nothing to promote across and no generator could emit navigation.
/// This is the consumer that closes that gap — the recognition side (`TransitionAdapter.transitionOf`)
/// has existed since the v2.4 §A17 groundwork; nothing turned its answers into records.
///
/// ## Where a navigation is found, and why here rather than on a separate walk
///
/// Routes and tokens are collected by a standalone visitor because they are declarations, resolvable
/// from a construction alone. A transition's **arguments** are not: `HomeScreen(isDark: _isDark)` binds
/// `_isDark` to a signal only if the scope says `_isDark` is one, and that scope exists only during the
/// scoped walk of the method the navigation sits in. So transition extraction hangs off the expression
/// extractor — every navigation is a `MethodInvocation`, and every `MethodInvocation` passes through it
/// with its scope in hand.
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

/// Turns the navigations adapters find into `app.RouteTransition` records.
final class TransitionExtractor {
  /// Creates an extractor.
  TransitionExtractor(this.out, this.registry, this.context, this.bindings);

  /// The record factory.
  final RawNodeEmitter out;

  /// The compiler's package knowledge — all of it.
  final AdapterRegistry registry;

  /// What the adapters run in.
  final AdapterContext context;

  /// For turning an argument's value expression into a `bind.*`.
  final BindingExtractor bindings;

  /// The component the navigation currently being extracted happens from — the transition's `source`.
  ///
  /// Set by the component extractor at the top of each component and cleared after, so a navigation in
  /// a component's action body or build tree records where it happens, and a navigation in a top-level
  /// function — which has no component — records no source rather than the previous component's.
  String? enclosingComponent;

  /// Navigation call sites already turned into a transition, by AST identity.
  ///
  /// One call site is one edge. A method's body can be walked more than once — a `build` that both
  /// renders and (because a callback it creates writes a signal) reads as an action is walked as each —
  /// and the same `Navigator.push` node would then reach here twice. It is the *same* navigation, so it
  /// is the *same* edge: the second offer is dropped rather than emitting a duplicate node.
  final Set<MethodInvocation> _seen = Set<MethodInvocation>.identity();

  /// Emits a transition for [node] if any adapter recognises it as a navigation.
  ///
  /// Called for every `MethodInvocation` during the scoped walk; the overwhelming majority are not
  /// navigations, and for them `transitionOf` returns null and this does nothing. A recognised
  /// navigation that carries no edge — a `Navigator.pop()` — also returns null and is not a node
  /// (§A17.3).
  void maybeExtract(MethodInvocation node, Scope scope) {
    final TransitionDeclaration? declaration = registry.transitionOf(context, node);
    if (declaration == null) {
      return;
    }

    // One call site is one edge, even if the method holding it is walked twice.
    if (!_seen.add(node)) {
      return;
    }

    // Exactly one of the two destinations, mirroring the schema (§A17). The adapter's own constructors
    // make this exclusive — `toPath` sets `path`, `toWidget` sets `widget` — so this reads whichever
    // one it set.
    final RawValue? destination = _destination(declaration);
    if (destination == null) {
      // The inline destination is not a component this project declares (an inline `Container`, a
      // widget from a package). It was reported where that was discovered; there is no edge to emit.
      return;
    }
    final bool toRoute = declaration.path != null;

    out.emit(
      RawNode(
        kind: 'app.RouteTransition',
        span: out.span(declaration.at),
        fields: <String, RawValue>{
          if (toRoute) 'target': destination else 'component': destination,
          if (_arguments(declaration.arguments, scope) case final List<RawValue> args
              when args.isNotEmpty)
            'arguments': RawList(args),
          if (enclosingComponent != null) 'source': RawRef(enclosingComponent!),
        },
      ),
    );
  }

  /// The transition's destination: a route named by path, or a component constructed inline.
  ///
  /// Returns null only for an inline destination that does not resolve to a project component — the one
  /// case with nothing legal to point at. A path always yields a `RawRouteRef`; whether that path names
  /// a route the program declares is the builder's question, answered against the whole route table
  /// (§A17), and an unmatched path is `BRG1308` there rather than a guess here.
  RawValue? _destination(TransitionDeclaration declaration) {
    final String? path = declaration.path;
    if (path != null) {
      return RawRouteRef(path);
    }

    final Expression widget = declaration.widget!;
    // A construction names its component by its *type*, resolved to the library that declares it — the
    // same resolution `app.Route.component` uses, and the only reliable one: a route in `main.dart`
    // naming a component `home_screen.dart` declares must resolve to *that* file's symbol (M1-T8).
    if (widget is! InstanceCreationExpression) {
      out.report(
        Codes.unsupportedWrapper,
        'This navigation constructs its destination with something other than a widget constructor, so '
        'the component it renders cannot be resolved. The edge is left out of the route graph rather '
        'than guessed at.',
        widget,
      );
      return null;
    }

    final String name = widget.constructorName.type.name.lexeme;
    final String? symbol = out.componentSymbolOf(widget.staticType, name);
    if (symbol == null) {
      out.report(
        Codes.unsupportedWrapper,
        'This navigation pushes `$name`, which is not a component this project declares — an inline '
        'tree, or a widget from a package. `app.RouteTransition.component` refers to a component by id, '
        'and inventing a symbol nothing declares would be a dangling reference (BRG1201). The edge is '
        'left out of the route graph, so cross-route state promotion (N11) will not see it.',
        widget,
      );
      return null;
    }
    return RawRef(symbol);
  }

  /// The arguments the navigation carries, each as `{name, transport, binding}`.
  ///
  /// The binding is classified in [scope] exactly as any other value is — a literal is `bind.Const`, a
  /// signal read is `bind.Signal`, a widget prop is `bind.Param` — which is what lets N11 tell a
  /// primitive that crosses a URL fine from a signal that must be promoted out of the component.
  ///
  /// `transport` is `primitive` on emit: the analyzer records the value as bound, and N11 is the pass
  /// that decides what becomes of it across the boundary (ADR-11). An argument whose value has no UIR
  /// representation is **omitted, not serialized as Dart source** — the expression extractor has
  /// already reported it (BRG1302), and a route argument that is an opaque string is one a generator
  /// could not pass to anything.
  List<RawValue> _arguments(List<TransitionArgument> arguments, Scope scope) {
    final List<RawValue> out = <RawValue>[];
    for (final TransitionArgument argument in arguments) {
      final RawNode binding = bindings.extract(argument.value, scope);
      if (_isOpaque(binding)) {
        continue;
      }
      out.add(
        RawMap(<String, RawValue>{
          'name': RawLiteral(argument.name),
          'transport': const RawLiteral('primitive'),
          'binding': RawChild(binding),
        }),
      );
    }
    return out;
  }

  /// Whether [binding] carries an expression the UIR has no node for.
  ///
  /// Only a `bind.Expr` can, and only when its expression is the opaque escape hatch. A `bind.Const`,
  /// `bind.Signal` or `bind.Param` is always representable; a `bind.Expr` over a `logic.Binary` or a
  /// `logic.Ref` is too. It is the `logic.OpaqueExpr` — a Dart source string — that a route argument
  /// must not become.
  static bool _isOpaque(RawNode binding) {
    if (binding.kind != 'bind.Expr') {
      return false;
    }
    final RawValue? expr = binding.fields['expr'];
    return expr is RawChild && expr.node.kind == 'logic.OpaqueExpr';
  }
}
