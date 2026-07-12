/// Bindings — how a value gets into a widget.
///
/// Layer: `session` (extraction).
///
/// A `Binding` is the L2 answer to *where does this prop's value come from?*, and it is the single
/// most important classification extraction makes. The four answers are not cosmetic:
///
/// | | | The generator emits |
/// | --- | --- | --- |
/// | `bind.Const` | a literal | the value, inline, and never re-renders for it |
/// | `bind.Param` | a widget parameter | a prop read |
/// | `bind.Signal` | reactive state | a **reactive read** — the thing that must re-render |
/// | `bind.Expr` | anything else | the expression, evaluated |
///
/// Getting `bind.Signal` wrong in either direction is a real bug with no symptom at compile time:
/// classify a signal read as `bind.Expr` and the UI never updates; classify a constant as a signal
/// and it re-renders forever.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/extract/expression_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';

/// Classifies an expression into a `Binding`.
final class BindingExtractor {
  /// Creates an extractor.
  const BindingExtractor(this.out, this.expressions);

  /// The record factory.
  final RawNodeEmitter out;

  /// The expression extractor, for everything that is not a special case.
  final ExpressionExtractor expressions;

  /// The binding for [node] in [scope].
  RawNode extract(Expression node, Scope scope) {
    final Expression expression = node is ParenthesizedExpression ? node.expression : node;

    // A literal is a constant. It is not "an expression that happens to be constant": a generator
    // emits it inline and never subscribes to it, and that difference is the whole point.
    //
    // A *null* literal is the exception, and not by choice. `bind.Const.value` is required, and
    // canonical JSON omits nulls (INV-1) — so `value: null` serializes to exactly the same bytes as no
    // value at all, and the schema rejects it (BRG1204, found on compass_app's `heroTag: null`). A
    // null constant therefore travels as `bind.Expr(logic.Lit)`, whose `value` is *optional* and
    // whose absence already means null. Same meaning, and it validates.
    final Object? constant = _literalValue(expression);
    if (constant != null) {
      return RawNode(
        kind: 'bind.Const',
        span: out.span(expression),
        fields: <String, RawValue>{'value': RawLiteral(constant)},
      );
    }

    // A bare name. What it *is* decides what the binding is — and the scope chain already knows,
    // because the component extractor put the signals and the params in it.
    if (expression is SimpleIdentifier) {
      final Binding? binding = scope.lookup(expression.name);
      switch (binding?.binds) {
        case Binds.signal when binding!.symbol != null:
          return RawNode(
            kind: 'bind.Signal',
            span: out.span(expression),
            fields: <String, RawValue>{'signal': RawRef(binding.symbol!)},
          );
        case Binds.parameter:
          return RawNode(
            kind: 'bind.Param',
            span: out.span(expression),
            fields: <String, RawValue>{'param': RawLiteral(expression.name)},
          );
        case _:
          break;
      }
    }

    // `widget.title` — inside a State, this reaches the widget's parameters. It is a prop read, and
    // the parameter it reads is the one after the dot. Leaving it as a `bind.Expr` would hide every
    // prop of every StatefulWidget from the generator.
    final String? param = _widgetParam(expression, scope);
    if (param != null) {
      return RawNode(
        kind: 'bind.Param',
        span: out.span(expression),
        fields: <String, RawValue>{'param': RawLiteral(param)},
      );
    }

    // A path into a signal: `_user.name`, `_controller.value`. Still a reactive read — of the same
    // signal — and `path` is what tells the generator which field of it to render.
    final _SignalPath? path = _signalPath(expression, scope);
    if (path != null) {
      return RawNode(
        kind: 'bind.Signal',
        span: out.span(expression),
        fields: <String, RawValue>{
          'signal': RawRef(path.symbol),
          if (path.path.isNotEmpty)
            'path': RawList(path.path.map(RawLiteral.new).toList()),
        },
      );
    }

    return RawNode(
      kind: 'bind.Expr',
      span: out.span(expression),
      fields: <String, RawValue>{'expr': RawChild(expressions.extract(expression, scope))},
    );
  }

  /// The widget parameter [node] reads, if it reads one through `widget.`.
  String? _widgetParam(Expression node, Scope scope) {
    final (Expression? receiver, String? name) = switch (node) {
      PrefixedIdentifier() => (node.prefix, node.identifier.name),
      PropertyAccess() => (node.target, node.propertyName.name),
      _ => (null, null),
    };
    if (receiver is! SimpleIdentifier || name == null || receiver.name != 'widget') {
      return null;
    }
    return scope.lookup('widget')?.binds == Binds.parameter ? name : null;
  }

  /// The signal a property chain bottoms out in, if it bottoms out in one.
  ///
  /// `_user.address.city` → signal `_user`, path `[address, city]`. A `ValueNotifier`'s `.value` is
  /// the notifier itself, so `_count.value` is signal `_count` with an empty path — the `.value` is
  /// Flutter's plumbing, not a field of the state.
  _SignalPath? _signalPath(Expression node, Scope scope) {
    final List<String> path = <String>[];
    Expression current = node;

    while (true) {
      switch (current) {
        case PropertyAccess():
          path.insert(0, current.propertyName.name);
          final Expression? target = current.target;
          if (target == null) {
            return null;
          }
          current = target;
        case PrefixedIdentifier():
          path.insert(0, current.identifier.name);
          current = current.prefix;
        case SimpleIdentifier():
          final Binding? binding = scope.lookup(current.name);
          if (binding?.binds != Binds.signal || binding?.symbol == null) {
            return null;
          }
          if (path.isNotEmpty && path.first == 'value') {
            path.removeAt(0);
          }
          return _SignalPath(binding!.symbol!, path);
        case _:
          return null;
      }
    }
  }

  static Object? _literalValue(Expression node) => switch (node) {
    IntegerLiteral() => node.value,
    DoubleLiteral() => node.value,
    BooleanLiteral() => node.value,
    SimpleStringLiteral() => node.value,
    _ => null,
  };
}

final class _SignalPath {
  const _SignalPath(this.symbol, this.path);
  final String symbol;
  final List<String> path;
}
