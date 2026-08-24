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
import 'package:analyzer/dart/element/element.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/model/source_span.dart';
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

        // A **manual store subscription/disposal call** on a locally-owned store instance (ADR-27) —
        // `_favorites.addListener(_onChange)`/`.removeListener(_onChange)`/`.dispose()`. Erased for the
        // same reason `notifyListeners()` is: `useLocalStore`'s own reactivity and disposal already carry
        // this meaning, and the call's name is one no downstream pass may know.
        if (registry.isStoreLifecycleCall(expression)) {
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
          // The same erasure, in the same non-block position — a manual store subscription/disposal call
          // (ADR-27).
          if (registry.isStoreLifecycleCall(expression)) {
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
          final RawNode? navigate = navigateOf(expression, node, scope);
          if (navigate != null) {
            return navigate;
          }
        } else if (expression is AwaitExpression && expression.expression is MethodInvocation) {
          // `await Navigator.push(context, ...);` (M7-H) — the same navigation, awaited. Recognition
          // already worked before this branch existed: `app.RouteTransition` is minted from the
          // expression walk regardless of which statement shape wraps the call (`transitions?.call`
          // fires for every `MethodInvocation`, per `TransitionExtractor`'s own header). What did not
          // work is *this* lowering — `expression is MethodInvocation` above is false for an
          // `AwaitExpression`, so the call fell through to a generic `logic.ExprStmt` and the departure
          // stayed unperformed (`BRG3008`) even though the edge existed.
          //
          // Only lowered when nothing in the function runs after it. The runtime kit's `push`/`replace`
          // are synchronous (`RouterInstance.push(destination): void`) — there is no way to await the
          // eventual pop — so the only thing `await` adds here is *pausing this function* until the
          // pushed screen is later popped. Dropping the `await` is unobservable when nothing follows it;
          // dropping it when something does would silently run that continuation immediately instead of
          // waiting for the user to navigate back, which is exactly the ordering guarantee this file's
          // own header comment protects. So the unsafe shape is left exactly as it was: a generic
          // `logic.ExprStmt`, refused downstream by the same `BRG3013` this always reported, never
          // silently reordered.
          if (_isLastStatementOfFunctionBody(node)) {
            final RawNode? navigate = navigateOf(
              expression.expression as MethodInvocation,
              node,
              scope,
            );
            if (navigate != null) {
              return navigate;
            }
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
        // in the shape the schema can hold. Extracted sequentially (M9-C): `b`'s own initializer sees
        // `a`, the identical growing-scope pattern [_declarationList] documents.
        final (List<RawNode> nodes, _) = _declarationList(node.variables.variables, node.variables, scope);
        return _asStatement(nodes, out.span(node));

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
        // `return switch (subject) { A => x, B => y };` (M8-Y) — the narrow, proven-safe subset of Dart
        // 3's switch expression this extractor admits. Checked before the generic handling below, so an
        // admitted shape never reaches `expressions.extract` and never becomes opaque. Lives on the
        // expression extractor (not here) because a `=>`-bodied function's own `return` is never a real
        // `ReturnStatement` — `expression_extractor.dart`'s own `bodyOf` reaches the identical shape from
        // an `ExpressionFunctionBody` instead, and both call sites must share one implementation.
        final Expression? returned = node.expression;
        if (returned is SwitchExpression) {
          final RawNode? lowered = expressions.switchExpressionAsReturn(returned, node, scope);
          if (lowered != null) return lowered;
        }
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
                    if (clause.exceptionParameter != null) ...<String, RawValue>{
                      'exceptionName': RawLiteral(clause.exceptionParameter!.name.lexeme),
                      // A real declaration-tier node (ADR-28, amended M8-S) — `exceptionName` above
                      // stays, unchanged, as the plain descriptive string it always was; this is the
                      // identity a `logic.Ref` inside the catch body now resolves against, the same way
                      // any other local's own `logic.VarDecl` already does.
                      'exceptionDecl': RawChild(
                        RawNode(
                          kind: 'logic.VarDecl',
                          span: out.span(clause.exceptionParameter!),
                          symbol: _catchExceptionSymbol(clause.exceptionParameter!, scope),
                          fields: <String, RawValue>{
                            'name': RawLiteral(clause.exceptionParameter!.name.lexeme),
                            'type': out.typeRef(
                              clause.exceptionParameter!.declaredFragment?.element.type ??
                                  clause.exceptionType?.type,
                              at: clause.exceptionParameter!,
                            ),
                            'isFinal': const RawLiteral(true),
                          },
                        ),
                      ),
                    },
                    if (clause.stackTraceParameter != null)
                      'stackTraceName': RawLiteral(clause.stackTraceParameter!.name.lexeme),
                    'body': RawChild(
                      extract(
                        clause.body,
                        // The exception and its stack trace are bound inside the catch body, and
                        // nowhere else. The exception binding carries the same symbol as its own
                        // `exceptionDecl` node above (M8-S) — a pure lookup, computed twice, cannot
                        // disagree with itself regardless of which call runs first. The stack-trace
                        // binding remains nameless, unimplemented by design (M8-S's own doc).
                        scope.child(<Binding>[
                          if (clause.exceptionParameter != null)
                            Binding(
                              name: clause.exceptionParameter!.name.lexeme,
                              binds: Binds.local,
                              symbol: _catchExceptionSymbol(clause.exceptionParameter!, scope),
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
    // A declaration-tier symbol (ADR-28) — `null` for a `for`/`catch` binding, which never reaches
    // this function with an ordinal available (`_localSymbol` returns `null` when [Scope.ordinalOf`]
    // has nothing for this declaration's own element, matching `_declaring`'s identical check below).
    symbol: _localSymbol(node, scope),
    fields: <String, RawValue>{
      'name': RawLiteral(node.name.lexeme),
      'type': out.typeRef(node.declaredFragment?.element.type ?? list.type?.type, at: node),
      if (node.initializer != null)
        'initializer': RawChild(expressions.extract(node.initializer!, scope)),
      if (list.isFinal || list.isConst) 'isFinal': const RawLiteral(true),
    },
  );

  /// [node]'s own declaration-tier symbol (ADR-28), or `null` if [scope] has no ordinal for it —
  /// [Scope.forBody]'s pre-pass only numbers an ordinary `final`/`var` declaration (ADR-28 §17), so a
  /// `for`/`catch` binding, or a declaration reached outside any body (which cannot happen for a real
  /// `VariableDeclarationStatement`), correctly yields `null` here rather than a manufactured id.
  ///
  /// Called from both [_variable] (the node itself) and [_declaring] (the binding a later reference
  /// resolves against) on the *same* `VariableDeclaration`, so both independently compute the identical
  /// string — a pure lookup, not a side-effecting counter, is what makes that safe regardless of which
  /// one runs first (`scope.dart`'s own `_ordinalsOf` doc explains why).
  String? _localSymbol(VariableDeclaration node, Scope scope) {
    final String? owner = scope.owner;
    final Element? element = node.declaredFragment?.element;
    if (owner == null || element == null) return null;
    final int? ordinal = scope.ordinalOf(element);
    if (ordinal == null) return null;
    return out.symbols.local(node.name.lexeme, owner: owner, ordinal: ordinal);
  }

  /// [param]'s own declaration-tier symbol (ADR-28, amended M8-S for a catch clause's exception
  /// binding) — `null` on the same terms as [_localSymbol]: no enclosing owner, no resolved element, or
  /// no ordinal (`scope.dart`'s `_OrdinalVisitor` numbers only the exception binding, never the
  /// stack-trace one — a `catch (e, s)`'s own `s` correctly yields `null` here, unimplemented by design).
  /// Called from both [_variable]'s own catch-clause analogue (the `exceptionDecl` node built below) and
  /// the child scope's own `Binding`, on the *same* `CatchClauseParameter`, for the identical reason
  /// [_localSymbol]'s own doc gives: a pure lookup cannot disagree with itself regardless of call order.
  String? _catchExceptionSymbol(CatchClauseParameter param, Scope scope) {
    final String? owner = scope.owner;
    final Element? element = param.declaredFragment?.element;
    if (owner == null || element == null) return null;
    final int? ordinal = scope.ordinalOf(element);
    if (ordinal == null) return null;
    return out.symbols.local(param.name.lexeme, owner: owner, ordinal: ordinal);
  }

  /// [node]'s own declaration-tier symbol (ADR-28, amended M9-A for a for-in loop's own declared
  /// variable) — `null` on the same terms as [_localSymbol]: no enclosing owner, no resolved element, or
  /// no ordinal. Called from both [_for]'s own `loopDecl` node and the loop body's own child scope, on
  /// the *same* `DeclaredIdentifier`, for the identical reason [_localSymbol]'s own doc gives: a pure
  /// lookup cannot disagree with itself regardless of call order.
  String? _forEachLoopVariableSymbol(DeclaredIdentifier node, Scope scope) {
    final String? owner = scope.owner;
    final Element? element = node.declaredFragment?.element;
    if (owner == null || element == null) return null;
    final int? ordinal = scope.ordinalOf(element);
    if (ordinal == null) return null;
    return out.symbols.local(node.name.lexeme, owner: owner, ordinal: ordinal);
  }

  RawNode _for(ForStatement node, Scope scope) {
    final ForLoopParts parts = node.forLoopParts;

    switch (parts) {
      // `for (final x in xs)`
      case ForEachPartsWithDeclaration():
        final DeclaredIdentifier loopVariable = parts.loopVariable;
        final String name = loopVariable.name.lexeme;
        final String? symbol = _forEachLoopVariableSymbol(loopVariable, scope);
        return RawNode(
          kind: 'logic.For',
          span: out.span(node),
          fields: <String, RawValue>{
            'loopVariable': RawLiteral(name),
            // A real declaration-tier node (ADR-28, amended M9-A) — `loopVariable` above stays,
            // unchanged, as the plain descriptive string it always was; this is the identity a
            // `logic.Ref` inside the loop body now resolves against, the same way any other local's own
            // `logic.VarDecl` already does.
            'loopDecl': RawChild(
              RawNode(
                kind: 'logic.VarDecl',
                span: out.span(loopVariable),
                symbol: symbol,
                fields: <String, RawValue>{
                  'name': RawLiteral(name),
                  'type': out.typeRef(
                    loopVariable.declaredFragment?.element.type ?? loopVariable.type?.type,
                    at: loopVariable,
                  ),
                  if (loopVariable.isFinal || loopVariable.isConst) 'isFinal': const RawLiteral(true),
                },
              ),
            ),
            'iterable': RawChild(expressions.extract(parts.iterable, scope)),
            'body': RawChild(
              extract(
                node.body,
                scope.withBinding(Binding(name: name, binds: Binds.local, symbol: symbol)),
              ),
            ),
          },
        );

      // `for (var i = 0; i < n; i++)` and `for (var i = 0, j = 10; i < j; i++, j--)`
      case ForPartsWithDeclarations():
        final List<VariableDeclaration> declared = parts.variables.variables;
        // Sequential (M9-C): `j`'s own initializer is extracted against a scope that already has `i` in
        // it, the same way `i`'s test/update/body reads already do — [_declarationList]'s own doc
        // explains why this is sound and why it does not fabricate a forward reference.
        final (List<RawNode> initNodes, Scope inner) = _declarationList(declared, parts.variables, scope);
        return RawNode(
          kind: 'logic.For',
          span: out.span(node),
          fields: <String, RawValue>{
            'init': RawChild(_asStatement(initNodes, out.span(parts.variables))),
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

  /// Extracts a declaration list — `var a = 1, b = 2;`'s own `variables`, or a C-style loop's own —
  /// **sequentially** (M9-C): each declaration's own initializer is extracted against the scope *before*
  /// it, and only afterward does that declaration itself enter scope, one at a time.
  ///
  /// This is the identical growing-scope pattern [statementsOf] already threads one statement to the
  /// next (this file's own top), applied one level deeper, inside a single declaration list — not a new
  /// scoping concept. It is what makes `var a = 1, b = a + 1;` resolve `a` inside `b`'s own initializer
  /// (real Dart; the two `dart analyze` probes this milestone ran first confirm it), and, just as
  /// importantly, what makes it structurally *impossible* to fabricate a resolution Dart itself refuses:
  /// `var a = a;` and `var a = b, b = 1;` are real Dart errors
  /// (`referenced_before_declaration`) precisely because neither name is in scope yet at the point its
  /// own initializer runs — and neither is it here, because a declaration's own binding is added to the
  /// running scope only *after* [_variable] has already read its initializer against the scope before it.
  ///
  /// The ordinal pre-pass (`scope.dart`'s `_OrdinalVisitor`) already numbers every declaration in the
  /// list structurally, before any of this runs — knowing a declaration's own eventual identity is not
  /// the same thing as that declaration being lexically visible yet, and this method is what keeps the
  /// two separate: [_localSymbol] is a pure function of the *declaration itself* (owner + ordinal), so
  /// computing it early costs nothing, but a `logic.Ref` only ever resolves against a name [Scope.lookup]
  /// actually finds — and an as-yet-undeclared name is not found, on exactly the same terms an ordinary,
  /// single declaration already refuses an out-of-scope read on.
  ///
  /// Returns each declaration's own `logic.VarDecl` (source order) and the scope *after* the whole list
  /// — what every following statement ([_declaring], independently) or a C-style loop's own test/update/
  /// body should resolve reads against.
  (List<RawNode>, Scope) _declarationList(
    List<VariableDeclaration> declared,
    VariableDeclarationList list,
    Scope scope,
  ) {
    Scope current = scope;
    final List<RawNode> nodes = <RawNode>[];
    for (final VariableDeclaration variable in declared) {
      nodes.add(_variable(variable, list, current));
      current = current.child(<Binding>[
        Binding(name: variable.name.lexeme, binds: Binds.local, symbol: _localSymbol(variable, current)),
      ]);
    }
    return (nodes, current);
  }

  /// [nodes] as a single statement — the node itself if there is exactly one, or all of them wrapped in
  /// a `logic.Block` (the schema's own `Stmt` union already admits a `Block` anywhere a `Stmt` is
  /// expected, M9-B) — the shape both a multi-declaration `var a = 1, b = 2;` and a C-style loop's own
  /// multi-declaration `init` need.
  RawNode _asStatement(List<RawNode> nodes, SourceSpan span) {
    if (nodes.length == 1) return nodes.single;
    return RawNode(
      kind: 'logic.Block',
      span: span,
      fields: <String, RawValue>{
        'statements': RawList(<RawValue>[for (final RawNode node in nodes) RawChild(node)]),
      },
    );
  }

  /// Whether [statement] is the last statement reachable in its own function's top-level body —
  /// nothing in the function executes after it, at any nesting depth.
  ///
  /// Deliberately narrow: `statement` must sit directly in the block that *is* the enclosing function's
  /// body (`BlockFunctionBody`), as its last entry. A statement last in a nested `if`/`while`/`try`
  /// block is not covered — something can still run after that block ends — and is left to the existing,
  /// safe refusal rather than a recursive walk up every enclosing construct this milestone found no
  /// evidence it needs (M7-H's task: do not broaden past what execution evidence demands).
  bool _isLastStatementOfFunctionBody(Statement statement) {
    final AstNode? block = statement.parent;
    if (block is! Block || block.statements.last != statement) {
      return false;
    }
    return block.parent is BlockFunctionBody;
  }

  /// The scope after [statement] — which differs from the scope before it only if it declared a name.
  Scope _declaring(Statement statement, Scope scope) {
    if (statement is! VariableDeclarationStatement) {
      return scope;
    }
    return scope.child(<Binding>[
      for (final VariableDeclaration variable in statement.variables.variables)
        Binding(
          name: variable.name.lexeme,
          binds: Binds.local,
          symbol: _localSymbol(variable, scope),
        ),
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
  RawNode? navigateOf(MethodInvocation expression, AstNode node, Scope scope) {
    final NavigateAction? action = registry.navigationActionOf(context, expression);
    if (action == null) {
      return null;
    }
    // ── a departure ────────────────────────────────────────────────────────────────────────────────
    //
    // The edge is asked for here rather than left to the expression walk, because this node *replaces*
    // the call: if the statement became a `logic.Navigate` and nothing else visited the invocation, the
    // transition would never be emitted and the departure would name nothing.
    //
    // The offer returns the edge's symbol, so the two are bound by construction. Nothing matches a span,
    // nothing matches a name, and the generator reconstructs nothing — it reads a `NodeId` (M7-B).
    if (action == NavigateAction.push || action == NavigateAction.replace) {
      final String? transition = expressions.transitions?.call(expression, scope);
      if (transition == null) {
        // No resolvable edge: an inline destination that is not a component this project declares, or a
        // path that names no route. Both are already reported where they were discovered. A
        // `logic.Navigate` with no transition would say *depart* without saying where — strictly worse
        // than the refusal it would replace, because the generator could no longer name what is missing.
        return null;
      }
      return RawNode(
        kind: 'logic.Navigate',
        span: out.span(node),
        fields: <String, RawValue>{
          'action': RawLiteral(action.name),
          'transition': RawRef(transition),
        },
      );
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

    // `dismisses` (M9-E, ADR-0025 amendment `0025-amendment-dialog-dismissal-scope.md`): set only for a
    // plain `pop`, and only when extraction is currently inside a dialog's own presentation
    // (`TransitionExtractor.presentingTransition`, set by `_destination` for the whole duration of that
    // dialog's own subtree extraction). `popUntil` never carries it — its own predicate stays unmodelled,
    // reported above, unchanged.
    final String? presenting = action == NavigateAction.pop ? expressions.presentingTransition?.call() : null;

    return RawNode(
      kind: 'logic.Navigate',
      span: out.span(node),
      fields: <String, RawValue>{
        'action': RawLiteral(action.name),
        if (presenting != null) 'dismisses': RawRef(presenting),
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
