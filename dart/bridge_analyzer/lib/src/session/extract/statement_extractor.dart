/// Statements.
///
/// Layer: `session` (extraction).
///
/// Dart statement → `logic.*` raw record. What has no node becomes `logic.OpaqueStmt` carrying its
/// source, plus a `BRG1302`. Nothing is dropped (INV-4).
///
/// Statement order is **semantic** and is never sorted. A `Block` whose statements were reordered is
/// a different program, and the one rule the canonical builder cannot save us from breaking is the one
/// where we hand it the wrong order to begin with.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/extract/expression_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';

/// Extracts statements.
final class StatementExtractor implements StatementExtractorRef {
  /// Creates an extractor emitting through [out], using [expressions] for the expressions inside.
  const StatementExtractor(this.out, this.expressions, this.registry, this.context);

  /// The record factory.
  final RawNodeEmitter out;

  /// The expression extractor. Mutually recursive with this one.
  final ExpressionExtractor expressions;

  /// The compiler's package knowledge. **This file has none of its own** (ISSUE-16): it does not know
  /// what `setState` is, and it must not. It asks.
  final AdapterRegistry registry;

  /// What the adapters run in — the same context every other extractor hands them.
  final AdapterContext context;

  @override
  List<RawValue> statementsOf(Block node, Scope scope) {
    // A block is a scope, and a variable declared in it is visible to the statements after it and to
    // nothing else. Threading the scope forward through the loop is what makes that true — and it is
    // why a `for` over the statements is not merely a `map`.
    Scope current = scope;
    final List<RawValue> out = <RawValue>[];

    for (final Statement statement in node.statements) {
      out.addAll(_statement(statement, current));
      current = _declaring(statement, current);
    }

    return out;
  }

  @override
  FunctionExpression? unwrapStateBatch(MethodInvocation node) =>
      registry.unwrapStateBatch(node);

  /// One source statement, as UIR statements — usually one, occasionally several.
  ///
  /// A **state-batching call** is spliced open (INV-22). `setState(() { _count++; })` is Flutter's way
  /// of saying *these mutations happened, now rebuild*; under ADR-4 the rebuild is implied by writing a
  /// signal, so the wrapper carries no meaning the UIR does not already have — and it carries a name no
  /// downstream pass is allowed to know. What survives is `_count++`, and nothing else.
  ///
  /// The extractor does not know what `setState` is. The adapter does, and that is the only place it may
  /// be known.
  List<RawValue> _statement(Statement statement, Scope scope) {
    if (statement is ExpressionStatement) {
      final Expression expression = statement.expression;
      if (expression is MethodInvocation) {
        final FunctionExpression? batched = registry.unwrapStateBatch(expression);
        if (batched != null) {
          return expressions.bodyOf(batched.body, scope);
        }
        // A **change notification** is erased outright — the one case where a statement expands to
        // nothing. ADR-4/ADR-20: *a signal write IS the notification*, so `notifyListeners()` announces
        // something the UIR has already recorded, and its name is one no downstream pass may know.
        //
        // Erasing rather than modelling is the same judgement `setState` gets one branch above: an action
        // that wrote no signal would announce nothing, so there is no observable behaviour to preserve.
        // Before this, the call survived as a reference to an undeclared name and the React generator
        // refused the whole program with BRG3006 — a diagnostic that was correct about the symbol and
        // wrong about whose problem it was.
        if (registry.isChangeNotification(expression)) {
          return const <RawValue>[];
        }
      }
    }
    return <RawValue>[RawChild(extract(statement, scope))];
  }

  /// Extracts [node] in [scope].
  RawNode extract(Statement node, Scope scope) {
    switch (node) {
      case Block():
        return RawNode(
          kind: 'logic.Block',
          span: out.span(node),
          fields: <String, RawValue>{'statements': RawList(statementsOf(node, scope))},
        );

      case ExpressionStatement():
        // A state batch reached through a position that is not a block — `if (mounted) setState(…);`.
        // It is spliced open here too, as a Block, so that INV-22 holds *everywhere* a statement can
        // appear and not merely inside braces. One survivor in wonderous found this.
        final Expression expression = node.expression;
        if (expression is MethodInvocation) {
          final FunctionExpression? batched = registry.unwrapStateBatch(expression);
          if (batched != null) {
            return RawNode(
              kind: 'logic.Block',
              span: out.span(node),
              fields: <String, RawValue>{
                'statements': RawList(expressions.bodyOf(batched.body, scope)),
              },
            );
          }
          // The same erasure, in the same non-block position — `if (changed) notifyListeners();`. An
          // empty Block rather than nothing, because this path must return a statement: the `if` still
          // has a branch, and the branch now does nothing, which is exactly what the source meant once
          // the notification is implied by the write.
          if (registry.isChangeNotification(expression)) {
            return RawNode(
              kind: 'logic.Block',
              span: out.span(node),
              fields: const <String, RawValue>{'statements': RawList(<RawValue>[])},
            );
          }

          // A navigation performed for its effect — `Navigator.pop(context);` (ADR-0025 D2).
          //
          // The same shape as the two erasures above and for the same reason: what a call *means* is a
          // package fact, so the registry answers and this file never learns the word `Navigator`
          // (ADR-18). The difference is that a navigation is not erased — it becomes a node, because
          // unlike `notifyListeners` its effect is not already recorded anywhere else.
          //
          // INV-22 is what makes this mandatory rather than nice: `Navigator.pop` is a framework
          // runtime primitive, and it has been surviving extraction as a call to an unresolvable name
          // in violation of that invariant since the analyzer had a navigation adapter at all.
          final RawNode? navigate = navigateOf(expression, node);
          if (navigate != null) {
            return navigate;
          }
        }
        return RawNode(
          kind: 'logic.ExprStmt',
          span: out.span(node),
          fields: <String, RawValue>{
            'expr': RawChild(expressions.extract(node.expression, scope)),
          },
        );

      case VariableDeclarationStatement():
        // `var a = 1, b = 2;` is several declarations in one statement. The schema has one node per
        // declaration, so a multi-declaration statement becomes a Block of them — the same program,
        // in the shape the schema can hold.
        final List<VariableDeclaration> variables = node.variables.variables;
        if (variables.length == 1) {
          return _variable(variables.single, node.variables, scope);
        }
        return RawNode(
          kind: 'logic.Block',
          span: out.span(node),
          fields: <String, RawValue>{
            'statements': RawList(<RawValue>[
              for (final VariableDeclaration variable in variables)
                RawChild(_variable(variable, node.variables, scope)),
            ]),
          },
        );

      case IfStatement():
        return RawNode(
          kind: 'logic.If',
          span: out.span(node),
          fields: <String, RawValue>{
            'test': RawChild(expressions.extract(node.expression, scope)),
            'then': RawChild(extract(node.thenStatement, scope)),
            if (node.elseStatement != null)
              'otherwise': RawChild(extract(node.elseStatement!, scope)),
          },
        );

      case ForStatement():
        return _for(node, scope);

      case WhileStatement():
        return RawNode(
          kind: 'logic.While',
          span: out.span(node),
          fields: <String, RawValue>{
            'test': RawChild(expressions.extract(node.condition, scope)),
            'body': RawChild(extract(node.body, scope)),
          },
        );

      case DoStatement():
        return RawNode(
          kind: 'logic.While',
          span: out.span(node),
          fields: <String, RawValue>{
            'test': RawChild(expressions.extract(node.condition, scope)),
            'body': RawChild(extract(node.body, scope)),
            // The one bit that distinguishes `do {} while (c)` from `while (c) {}`: the body runs
            // once before the test. Dropping it would turn a loop that always runs into one that may
            // never run.
            'isDoWhile': const RawLiteral(true),
          },
        );

      case SwitchStatement():
        return RawNode(
          kind: 'logic.Switch',
          span: out.span(node),
          fields: <String, RawValue>{
            'subject': RawChild(expressions.extract(node.expression, scope)),
            'cases': RawList(<RawValue>[
              for (final SwitchMember member in node.members)
                RawMap(<String, RawValue>{
                  // A `default` has no test. Absent, not null: the two say different things.
                  if (member is SwitchCase)
                    'test': RawChild(expressions.extract(member.expression, scope)),
                  'body': RawList(<RawValue>[
                    for (final Statement statement in member.statements)
                      RawChild(extract(statement, scope)),
                  ]),
                }),
            ]),
          },
        );

      case ReturnStatement():
        return RawNode(
          kind: 'logic.Return',
          span: out.span(node),
          fields: <String, RawValue>{
            if (node.expression != null)
              'value': RawChild(expressions.extract(node.expression!, scope)),
          },
        );

      case TryStatement():
        return RawNode(
          kind: 'logic.TryCatch',
          span: out.span(node),
          fields: <String, RawValue>{
            'body': RawChild(extract(node.body, scope)),
            if (node.catchClauses.isNotEmpty)
              'catches': RawList(<RawValue>[
                for (final CatchClause clause in node.catchClauses)
                  RawMap(<String, RawValue>{
                    if (clause.exceptionType != null)
                      'exceptionType': out.typeRef(clause.exceptionType!.type, at: clause),
                    if (clause.exceptionParameter != null)
                      'exceptionName': RawLiteral(clause.exceptionParameter!.name.lexeme),
                    if (clause.stackTraceParameter != null)
                      'stackTraceName': RawLiteral(clause.stackTraceParameter!.name.lexeme),
                    'body': RawChild(
                      extract(
                        clause.body,
                        // The exception and its stack trace are bound inside the catch body, and
                        // nowhere else.
                        scope.child(<Binding>[
                          if (clause.exceptionParameter != null)
                            Binding(
                              name: clause.exceptionParameter!.name.lexeme,
                              binds: Binds.local,
                            ),
                          if (clause.stackTraceParameter != null)
                            Binding(
                              name: clause.stackTraceParameter!.name.lexeme,
                              binds: Binds.local,
                            ),
                        ]),
                      ),
                    ),
                  }),
              ]),
            if (node.finallyBlock != null)
              'finallyBlock': RawChild(extract(node.finallyBlock!, scope)),
          },
        );

      case BreakStatement():
        return RawNode(
          kind: 'logic.Break',
          span: out.span(node),
          fields: <String, RawValue>{
            if (node.label != null) 'label': RawLiteral(node.label!.name),
          },
        );

      case ContinueStatement():
        return RawNode(
          kind: 'logic.Continue',
          span: out.span(node),
          fields: <String, RawValue>{
            if (node.label != null) 'label': RawLiteral(node.label!.name),
          },
        );

      case EmptyStatement():
        return RawNode(kind: 'logic.Block', span: out.span(node));

      case Statement():
        // `yield`, a labelled statement, a local function declaration, a pattern-matching `if-case`.
        // Preserved, never dropped (INV-4).
        return out.opaqueStmt(node, _describe(node));
    }
  }

  RawNode _variable(VariableDeclaration node, VariableDeclarationList list, Scope scope) => RawNode(
    kind: 'logic.VarDecl',
    span: out.span(node),
    fields: <String, RawValue>{
      'name': RawLiteral(node.name.lexeme),
      'type': out.typeRef(node.declaredFragment?.element.type ?? list.type?.type, at: node),
      if (node.initializer != null)
        'initializer': RawChild(expressions.extract(node.initializer!, scope)),
      if (list.isFinal || list.isConst) 'isFinal': const RawLiteral(true),
    },
  );

  RawNode _for(ForStatement node, Scope scope) {
    final ForLoopParts parts = node.forLoopParts;

    switch (parts) {
      // `for (final x in xs)`
      case ForEachPartsWithDeclaration():
        final String name = parts.loopVariable.name.lexeme;
        return RawNode(
          kind: 'logic.For',
          span: out.span(node),
          fields: <String, RawValue>{
            'loopVariable': RawLiteral(name),
            'iterable': RawChild(expressions.extract(parts.iterable, scope)),
            'body': RawChild(
              extract(node.body, scope.withBinding(Binding(name: name, binds: Binds.local))),
            ),
          },
        );

      // `for (var i = 0; i < n; i++)`
      case ForPartsWithDeclarations():
        final List<VariableDeclaration> declared = parts.variables.variables;
        final Scope inner = scope.child(<Binding>[
          for (final VariableDeclaration variable in declared)
            Binding(name: variable.name.lexeme, binds: Binds.local),
        ]);
        return RawNode(
          kind: 'logic.For',
          span: out.span(node),
          fields: <String, RawValue>{
            if (declared.length == 1)
              'init': RawChild(_variable(declared.single, parts.variables, scope)),
            if (parts.condition != null)
              'test': RawChild(expressions.extract(parts.condition!, inner)),
            if (parts.updaters.isNotEmpty)
              'update': RawList(<RawValue>[
                for (final Expression updater in parts.updaters)
                  RawChild(expressions.extract(updater, inner)),
              ]),
            'body': RawChild(extract(node.body, inner)),
          },
        );

      case ForLoopParts():
        return out.opaqueStmt(node, 'for loop');
    }
  }

  /// The scope after [statement] — which differs from the scope before it only if it declared a name.
  Scope _declaring(Statement statement, Scope scope) {
    if (statement is! VariableDeclarationStatement) {
      return scope;
    }
    return scope.child(<Binding>[
      for (final VariableDeclaration variable in statement.variables.variables)
        Binding(name: variable.name.lexeme, binds: Binds.local),
    ]);
  }

  /// A `logic.Navigate` for [expression] spanning [node], or null when it is not one.
  ///
  /// ## Why only a return, for now
  ///
  /// ADR-0025 D2 covers push, replace, pop and popUntil. Only the two **returns** are lowered here.
  ///
  /// A departure needs `transition` — the `app.RouteTransition` it performs — and a transition is
  /// referenced by `NodeId`. Ids are content-addressed and minted by the builder (ADR-17), so at
  /// extraction time the edge this call produces has no id to name yet. Emitting a departure without
  /// its transition would produce a node that says *go somewhere* and not where: strictly worse than
  /// the refusal it replaces, because the generator could no longer tell the developer what is
  /// missing. So a departure keeps `BRG3013`, which names the capability and the owning layer.
  ///
  /// A return needs no such reference — §A17.3 rules that a pop is not a transition, so `transition`
  /// is absent by design and there is nothing to wire. That is the same asymmetry that decided
  /// ADR-0025 in favour of a statement over a field on the edge, and it is why the returns are
  /// implementable first rather than by convenience.
  ///
  /// Returns are also the majority of the corpus: 143 uses against 83 departures (M6-D).
  @override
  RawNode? navigateOf(MethodInvocation expression, AstNode node) {
    final NavigateAction? action = registry.navigationActionOf(context, expression);
    if (action == null) {
      return null;
    }
    if (action != NavigateAction.pop && action != NavigateAction.popUntil) {
      return null;
    }

    // `popUntil`'s predicate is not modelled and is not silently dropped: a generator that lowered
    // this as a plain pop would remove one entry where the program removes several, which is a wrong
    // screen rather than a missing one.
    if (action == NavigateAction.popUntil) {
      out.report(
        Codes.unsupportedWrapper,
        'This pops until a predicate holds. `logic.Navigate` records the action but not the '
        'predicate (ADR-0025 D2), so a generator cannot know where to stop. It is recorded as a '
        'navigation rather than dropped, and a target that cannot express the predicate must refuse '
        'it rather than pop once.',
        expression,
      );
    }

    return RawNode(
      kind: 'logic.Navigate',
      span: out.span(node),
      fields: <String, RawValue>{
        'action': RawLiteral(action.name),
      },
    );
  }

  static String _describe(Statement node) => switch (node) {
    YieldStatement() => 'yield',
    LabeledStatement() => 'labelled statement',
    FunctionDeclarationStatement() => 'local function declaration',
    AssertStatement() => 'assert',
    PatternVariableDeclarationStatement() => 'pattern declaration',
    _ => node.runtimeType.toString(),
  };
}
