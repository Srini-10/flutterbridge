/// Expressions.
///
/// Layer: `session` (extraction).
///
/// Dart expression → `logic.*` raw record. What has a UIR node becomes that node; what does not
/// becomes `logic.OpaqueExpr` carrying its own source, plus a `BRG1302`. Nothing is ever dropped
/// (INV-4), and nothing is ever guessed.
///
/// ## Assignment
///
/// `logic.Assign` exists because of this milestone (Spec v2.2 §A10). Before it, the `Expr` union had
/// no assignment at all, and every `setState` body could only be carried as a Dart source string that
/// no generator could compile. It is the reason M1-T8 stopped before it started.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/token.dart';
import 'package:analyzer/dart/constant/value.dart';
import 'package:analyzer/dart/element/element.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/colour_constants.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';
import 'package:bridge_analyzer/src/session/extract/symbol_table.dart';

/// Extracts expressions.
final class ExpressionExtractor {
  /// Creates an extractor emitting through [out], consulting [registry] for framework facts.
  ExpressionExtractor(this.out, this.registry);

  /// The record factory.
  final RawNodeEmitter out;

  /// The adapters. Consulted for two things here: which types' static consts are values (ADR-0023), and
  /// what counts as a colour (M4-E).
  final AdapterRegistry registry;

  /// Where a hoisted literal colour becomes an `app.Token`. Wired after construction, because the token
  /// extractor and this one are built in the same pass and neither can precede the other.
  late final String Function(String hex, AstNode at) hoistColour;


  /// Dart's assignment operators, and the enum value each maps to (Spec v2.2 §A10).
  ///
  /// A table rather than a `switch` with a default: an operator missing from here must produce an
  /// `OpaqueExpr` and a diagnostic, never a silently wrong guess at what the user meant to write.
  static const Map<String, String> assignmentOperators = <String, String>{
    '=': 'assign',
    '+=': 'addAssign',
    '-=': 'subtractAssign',
    '*=': 'multiplyAssign',
    '/=': 'divideAssign',
    '~/=': 'truncatingDivideAssign',
    '%=': 'moduloAssign',
    '??=': 'ifNullAssign',
    '&=': 'bitAndAssign',
    '|=': 'bitOrAssign',
    '^=': 'bitXorAssign',
    '<<=': 'shiftLeftAssign',
    '>>=': 'shiftRightAssign',
    '>>>=': 'unsignedShiftRightAssign',
  };

  /// Extracts [node] in [scope].
  RawNode extract(Expression node, Scope scope) {
    // A colour, before anything else. INV-20 (ADR-13) requires every colour a mapped widget paints to
    // resolve to an `app.Token`, and this is the only place in the pipeline that can make that true: a
    // colour's *value* exists in Dart's constant evaluator and nowhere downstream. `Colors.white` reaches
    // the compiler as a name with no value; `Color(0xFF2196F3)` as an integer nobody knows is a colour.
    //
    // Recognised by the resolved **type**, not by the parameter's name — so a colour nested three levels
    // deep inside a `BoxDecoration`'s `boxShadow` list is found by the same rule that finds a `ColoredBox`'s
    // `color`, and no widget is special-cased.
    if (_colour(node) case final RawNode colour) {
      return colour;
    }

    switch (node) {
      case ParenthesizedExpression():
        // Parentheses are grouping, not semantics. The tree already carries the precedence.
        return extract(node.expression, scope);

      case AssignmentExpression():
        return _assignment(node, scope);

      case PostfixExpression() when _isIncrement(node.operator):
        return _incrementDecrement(
          node,
          node.operand,
          node.operator,
          scope,
          writeType: node.writeType,
          isPostfix: true,
        );

      case PrefixExpression() when _isIncrement(node.operator):
        return _incrementDecrement(
          node,
          node.operand,
          node.operator,
          scope,
          writeType: node.writeType,
          isPostfix: false,
        );

      case IntegerLiteral() || DoubleLiteral() || BooleanLiteral() || NullLiteral():
        return _literal(node, _constValueOf(node));

      case SimpleStringLiteral():
        return _literal(node, node.value);

      case StringInterpolation():
        return RawNode(
          kind: 'logic.StringInterp',
          span: out.span(node),
          fields: <String, RawValue>{
            // Every interpolation is a reactive read: `Text('Hello $name')` must re-render when
            // `name` changes, and it can only do so if the parts survive as expressions.
            'parts': RawList(<RawValue>[
              for (final InterpolationElement part in node.elements)
                RawChild(
                  part is InterpolationExpression
                      ? extract(part.expression, scope)
                      : _literal(node, (part as InterpolationString).value),
                ),
            ]),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case SimpleIdentifier():
        // Bare `mounted` — Flutter's `State.mounted`, read the same way `widget.isDark` is (ADR-0026).
        if (registry.mountedIntrinsicOf(node) case final MountedKind kind) {
          return _intrinsic(kind, null, node);
        }
        return _reference(
          node,
          node.name,
          scope,
          type: _typeOfIdentifier(node),
          // An implicit instance-member read — `count`/`doubled` inside the class that declares it
          // (ADR-0033, M10-B) — is checked only after `_topLevelTarget` already found nothing: the
          // analyzer's own resolution never lets `node.element` be *both* a top-level declaration and an
          // instance member, so the two never compete. A local/parameter that shadows the member's own
          // name resolves `node.element` to that local/parameter instead (Dart's own scoping, not
          // reproduced here), so `_internalMemberTarget` correctly returns null for it and this falls
          // through to `binding?.symbol` below, unchanged.
          staticTarget: _topLevelTarget(node.element) ?? _internalMemberTarget(node.element),
        );

      // `MainAxisAlignment.center`, `http.get`, `Colors.blue` — the left-hand side is a *type* or an
      // *import prefix*, not a value. It has no static type, because it is not a thing that has one,
      // and asking for one produced 29 false BRG1303s in a seven-file fixture. A static access is a
      // reference to a declared constant; it is not a property read on a value.
      case PrefixedIdentifier() when _isStaticQualifier(node.prefix):
        if (_constValue(node) case final RawNode folded) {
          return folded;
        }
        return _reference(
          node,
          node.prefix.element is PrefixElement
              // An import prefix is not part of the name. `http.get` *is* `get`.
              ? node.identifier.name
              : '${node.prefix.name}.${node.identifier.name}',
          scope,
          staticTarget:
              _enumConstantTarget(node.identifier.element) ??
              _enumValuesTarget(node.identifier.element) ??
              _topLevelTarget(node.identifier.element),
        );

      case PrefixedIdentifier():
        // `context.mounted` — Flutter's `BuildContext.mounted` (ADR-0026). Checked ahead of
        // `_componentProp`: the two recognize different, mutually exclusive framework getters, and
        // neither depends on which runs first, but the intrinsic is checked here for the same reason
        // `widget.isDark` is checked next — both need the resolved element, not the spelling.
        if (registry.mountedIntrinsicOf(node) case final MountedKind kind) {
          return _intrinsic(kind, extract(node.prefix, scope), node);
        }
        // `widget.isDark` — a read of this component's own parameter. See `_componentProp`.
        if (_componentProp(node.prefix, node.identifier.name, node) case final RawNode prop) {
          return prop;
        }
        return RawNode(
          kind: 'logic.PropertyAccess',
          span: out.span(node),
          fields: <String, RawValue>{
            'receiver': RawChild(extract(node.prefix, scope)),
            'property': RawLiteral(node.identifier.name),
            // `model.count` (ADR-0035) — a bare-identifier receiver reaches the analyzer's AST as a
            // `PrefixedIdentifier`, never a `PropertyAccess` (that shape is reserved for a receiver
            // expression, e.g. `this.count`/`foo().count` — see the sibling case below). `node.prefix` is
            // never `this` here (a `ThisExpression` is never parsed as a `PrefixedIdentifier`'s own
            // prefix), so every reach of `_externalFieldTarget` from this case is a genuine external read.
            if (_storeMemberTarget(node.prefix.staticType, node.identifier.element) ??
                    _externalFieldTarget(node.prefix.staticType, node.identifier.element) ??
                    _externalGetterTarget(node.prefix.staticType, node.identifier.element)
                case final String symbol)
              'target': RawRef(symbol),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case PropertyAccess() when node.target != null:
        final Expression target = node.target!;
        if (target is Identifier && _isStaticQualifier(target)) {
          if (_constValue(node) case final RawNode folded) {
            return folded;
          }
          return _reference(
            node,
            '${target.name}.${node.propertyName.name}',
            scope,
            staticTarget:
                _enumConstantTarget(node.propertyName.element) ??
                _enumValuesTarget(node.propertyName.element) ??
                _topLevelTarget(node.propertyName.element),
          );
        }
        if (registry.mountedIntrinsicOf(node) case final MountedKind kind) {
          return _intrinsic(kind, extract(target, scope), node);
        }
        if (_componentProp(target, node.propertyName.name, node) case final RawNode prop) {
          return prop;
        }
        return RawNode(
          kind: 'logic.PropertyAccess',
          span: out.span(node),
          fields: <String, RawValue>{
            'receiver': RawChild(extract(target, scope)),
            'property': RawLiteral(node.propertyName.name),
            // `this.count`/`this.doubled` resolves through `_internalMemberTarget` (M10-B: a field stays
            // the broad, ungated M9-L identity resolution; an explicit getter is routed through the same
            // eligibility-gated `_externalGetterTarget` an external read already uses — see that
            // function's own doc). An external receiver (`model.count`/`model.doubled`, ADR-0035/0038)
            // resolves through the strictly narrower `_externalFieldTarget`/`_externalGetterTarget` gate
            // directly — never the broader `_instanceMemberTarget` unguarded, which would reopen exactly
            // the hazard M9-J's own refusal exists to prevent for every member shape ADR-0035 does not
            // explicitly prove safe.
            if (_storeMemberTarget(target.staticType, node.propertyName.element) ??
                    (target is ThisExpression
                        ? _internalMemberTarget(node.propertyName.element)
                        : _externalFieldTarget(target.staticType, node.propertyName.element) ??
                              _externalGetterTarget(target.staticType, node.propertyName.element))
                case final String symbol)
              'target': RawRef(symbol),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case MethodInvocation():
        return _invocation(node, scope);

      // `items[index]` — Dart's subscript, which **is** a method call: the language defines `a[b]` as
      // `a.operator[](b)`, and the analyzer resolves it to that operator's element. So it is modelled as one
      // rather than as an opaque expression, and no schema construct had to be invented for it.
      //
      // ## Why this was worth doing, beyond one operator
      //
      // It reached UIR as `logic.OpaqueExpr(reason: 'index')` until M4-H, and that single hole is what made
      // `ListView.builder` unsupportable. N3's own header says so:
      //
      // > What it *cannot* do is recover a template from `ListView.builder(itemCount: n, itemBuilder:
      // > (c, i) => W(items[i]))`, **because the collection is not named there — only indexed.**
      //
      // The collection *was* named — it is the receiver of the subscript — and extraction was throwing it
      // away. With the receiver visible, N3 can prove the builder is a for-each over that collection and
      // expand it. The owner was the analyzer, not the schema and not the compiler, and it was found by
      // reading real analyzer output rather than the triage note, which had recorded the owner as the
      // analyzer for the wrong reason ("cannot see an iterable to map over").
      //
      // An assignment *to* a subscript — `items[0] = x` — is not this case: it resolves to `operator []=`,
      // which takes the value as a second argument and is a statement rather than an expression. It stays
      // opaque, and `_target` reports it, because writing it as `operator[]` would silently drop the write.
      case IndexExpression() when !node.inSetterContext():
        return RawNode(
          kind: 'logic.MethodCall',
          span: out.span(node),
          fields: <String, RawValue>{
            'receiver': RawChild(extract(node.realTarget, scope)),
            // The operator's name as Dart spells it. A generator lowering this for a list or a map emits
            // `a[b]`, which is the same operator in JavaScript; one that cannot must report the method it
            // does not know, which is strictly better than an opaque blob with no receiver.
            'method': const RawLiteral('[]'),
            'args': RawList(<RawValue>[RawChild(extract(node.index, scope))]),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case FunctionExpressionInvocation():
        return RawNode(
          kind: 'logic.Call',
          span: out.span(node),
          fields: <String, RawValue>{
            'callee': RawChild(extract(node.function, scope)),
            ..._arguments(node.argumentList, scope),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case InstanceCreationExpression():
        return _construction(node, scope);

      case BinaryExpression():
        return RawNode(
          kind: 'logic.Binary',
          span: out.span(node),
          fields: <String, RawValue>{
            'operator': RawLiteral(node.operator.lexeme),
            'left': RawChild(extract(node.leftOperand, scope)),
            'right': RawChild(extract(node.rightOperand, scope)),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case PrefixExpression():
        return RawNode(
          kind: 'logic.Unary',
          span: out.span(node),
          fields: <String, RawValue>{
            'operator': RawLiteral(node.operator.lexeme),
            'operand': RawChild(extract(node.operand, scope)),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case ConditionalExpression():
        return RawNode(
          kind: 'logic.Conditional',
          span: out.span(node),
          fields: <String, RawValue>{
            'test': RawChild(extract(node.condition, scope)),
            'then': RawChild(extract(node.thenExpression, scope)),
            'otherwise': RawChild(extract(node.elseExpression, scope)),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case FunctionExpression():
        return lambda(node, scope);

      case AwaitExpression():
        return RawNode(
          kind: 'logic.Await',
          span: out.span(node),
          fields: <String, RawValue>{
            'operand': RawChild(extract(node.expression, scope)),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case ListLiteral():
        return _listLiteral(node, scope);

      case SetOrMapLiteral():
        return _mapLiteral(node, scope);

      case AsExpression():
        return RawNode(
          kind: 'logic.Cast',
          span: out.span(node),
          fields: <String, RawValue>{
            'operand': RawChild(extract(node.expression, scope)),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case PostfixExpression() when node.operator.type == TokenType.BANG:
        // `x!` — a null assertion.
        return RawNode(
          kind: 'logic.NullCheck',
          span: out.span(node),
          fields: <String, RawValue>{
            'operand': RawChild(extract(node.operand, scope)),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      // `this` and `super` are references to the enclosing instance. `super.initState()` is ordinary
      // Flutter — every `State` writes it — and an opaque node there would lose the call.
      case ThisExpression():
        return _instanceRef(node, 'this');

      case SuperExpression():
        return _instanceRef(node, 'super');

      case Expression():
        return _unsupported(node, scope);
    }
  }

  /// A lambda. Exposed because a widget callback prop is one, and the widget extractor needs it.
  ///
  /// Captured variables need no special handling: a closure's free names resolve through [scope], the
  /// same chain the enclosing code resolved them through, so a captured signal is still recognisably a
  /// signal inside the closure. That is the whole reason scopes are values rather than a mutable
  /// stack.
  RawNode lambda(FunctionExpression node, Scope scope) {
    final Scope inner = scope.child(<Binding>[
      for (final FormalParameter parameter in node.parameters?.parameters ?? const <FormalParameter>[])
        if (parameter.name != null)
          Binding(name: parameter.name!.lexeme, binds: Binds.parameter),
    ]);

    final FunctionBody body = node.body;
    return RawNode(
      kind: 'logic.Lambda',
      span: out.span(node),
      fields: <String, RawValue>{
        'params': RawList(<RawValue>[
          for (final FormalParameter parameter
              in node.parameters?.parameters ?? const <FormalParameter>[])
            RawMap(<String, RawValue>{
              'name': RawLiteral(parameter.name?.lexeme ?? '_'),
              'type': out.typeRef(parameter.declaredFragment?.element.type, at: parameter),
              if (parameter.isNamed) 'named': const RawLiteral(true),
              if (parameter.isRequired) 'required': const RawLiteral(true),
            }),
        ]),
        'body': RawList(bodyOf(body, inner)),
        if (body.isAsynchronous) 'isAsync': const RawLiteral(true),
        'type': out.typeRef(node.staticType, at: node),
      },
    );
  }

  /// A function body, as the statement list the schema asks for.
  ///
  /// `=> e` and `{ return e; }` are the same function. Turning the arrow into a `Return` here is not
  /// *normalization* in the pipeline sense — nothing semantic changes — it is refusing to make every
  /// downstream consumer handle two spellings of one thing.
  List<RawValue> bodyOf(FunctionBody body, Scope scope) {
    switch (body) {
      case ExpressionFunctionBody():
        // `() => setState(() { … })` — the arrow form of a state batch. Spliced open exactly as the
        // block form is (INV-22): what survives is the mutation, not the framework's word for it.
        final Expression value = body.expression;
        if (value is MethodInvocation) {
          final FunctionExpression? batched = statements.unwrapStateBatch(value);
          if (batched != null) {
            return bodyOf(batched.body, scope);
          }
          // `() => Navigator.pop(context)` — a navigation in the arrow form (ADR-0025 D2). It becomes
          // the statement, not a `Return` of it: the node models the *effect*, and the value an arrow
          // yields here is discarded by the callback that holds it.
          //
          // This is where the corpus actually writes navigation. Hooking only the block form left the
          // node unreachable in every real application.
          final RawNode? navigate = statements.navigateOf(value, body, scope);
          if (navigate != null) {
            return <RawValue>[RawChild(navigate)];
          }
        } else if (value is SwitchExpression) {
          // `String f(Reason r) => switch (r) { A => x, B => y };` (M8-Y) — the identical shape
          // `switchExpressionAsReturn` admits for a block-bodied `return`, reached here because an
          // arrow-bodied function's `return` is this `ExpressionFunctionBody`, never a real
          // `ReturnStatement`.
          final RawNode? lowered = switchExpressionAsReturn(value, body, scope);
          if (lowered != null) {
            return <RawValue>[RawChild(lowered)];
          }
        }
        return <RawValue>[
          RawChild(
            RawNode(
              kind: 'logic.Return',
              span: out.span(body),
              fields: <String, RawValue>{'value': RawChild(extract(body.expression, scope))},
            ),
          ),
        ];
      case BlockFunctionBody():
        return statements.statementsOf(body.block, scope);
      case EmptyFunctionBody():
        return const <RawValue>[];
      case FunctionBody():
        return <RawValue>[RawChild(out.opaqueStmt(body, 'function body'))];
    }
  }

  /// `logic.Switch` for a `return`'s own `switch (subject) { pattern => expr, ... }`, if every case is
  /// an unguarded `ConstantPattern` — an enum constant, a literal, or `null` — or `null` if any case is
  /// not (M8-Y). Shared by both real Dart shapes a `return switch` can take: a block-bodied function's
  /// real `ReturnStatement` (`statement_extractor.dart`) and an arrow-bodied function's
  /// `ExpressionFunctionBody` (`bodyOf`, above) — the two are the same program, and this is the one place
  /// that treats them identically rather than solving the shape twice.
  ///
  /// Reuses the existing `SwitchStatement` extraction's own shape exactly (`statement_extractor.dart`'s
  /// `case SwitchStatement()`): `subject` is the scrutinee, each case is `{test, body}`, and a case's
  /// `body` here is always exactly one synthesized `logic.Return` of that case's own result expression —
  /// the schema's own `SwitchCase.body: readonly Stmt[]` already holds a statement list, so no field is
  /// invented, only populated with the one statement a `return switch` case always implies.
  ///
  /// `ConstantPattern.expression` is resolved by the exact same `extract` the pre-existing old-style
  /// `case Reason.value:` arm already calls on `SwitchCase.expression` — the same expression node shape
  /// (`PrefixedIdentifier`/`PropertyAccess` for an enum constant), resolved by the same, already-correct
  /// machinery (M8-D). No new identity mechanism exists here to get wrong.
  ///
  /// Deliberately narrow, matched to real evidence, not to the language's own grammar (M8-V's own
  /// discipline): a `WildcardPattern`, a `LogicalOrPattern`, an `ObjectPattern`/`RecordPattern`/
  /// `ListPattern`/`MapPattern`, or any `guardedPattern.whenClause != null` (a `when` guard) is not an
  /// unguarded `ConstantPattern`, so this returns `null` for the *whole* switch — one unsupported case
  /// anywhere keeps every case opaque, never a partial lowering that silently drops a case, a guard, or a
  /// pattern this extractor cannot prove safe.
  RawNode? switchExpressionAsReturn(SwitchExpression expr, AstNode node, Scope scope) {
    final List<RawValue> cases = <RawValue>[];
    for (final SwitchExpressionCase case_ in expr.cases) {
      if (case_.guardedPattern.whenClause != null) return null;
      final DartPattern pattern = case_.guardedPattern.pattern;
      if (pattern is! ConstantPattern) return null;
      cases.add(
        RawMap(<String, RawValue>{
          'test': RawChild(extract(pattern.expression, scope)),
          'body': RawList(<RawValue>[
            RawChild(
              RawNode(
                kind: 'logic.Return',
                span: out.span(case_),
                fields: <String, RawValue>{'value': RawChild(extract(case_.expression, scope))},
              ),
            ),
          ]),
        }),
      );
    }
    return RawNode(
      kind: 'logic.Switch',
      span: out.span(node),
      fields: <String, RawValue>{
        'subject': RawChild(extract(expr.expression, scope)),
        'cases': RawList(cases),
      },
    );
  }

  /// The statement extractor, which is mutually recursive with this one: a lambda body holds
  /// statements, and a statement holds expressions.
  ///
  /// Set once, by the orchestrator. A late final rather than a constructor argument because the two
  /// extractors refer to each other, and neither can be constructed first.
  late final StatementExtractorRef statements;

  /// The transition extractor's hook, offered every method invocation so it can recognise a navigation.
  ///
  /// Nullable, and set once by the orchestrator, because a navigation is a `MethodInvocation` and this
  /// is where every one passes through *with its scope* — the scope a navigation's arguments need to
  /// bind (`HomeScreen(isDark: _isDark)` is a signal read only if the scope says so). Null in the rare
  /// build that extracts expressions without transition support (a unit test of this extractor alone).
  ///
  /// A function rather than an interface so this extractor need not import the transition extractor,
  /// which imports it — the orchestrator wires the two by passing a bound method.
  TransitionHook? transitions;

  /// The transition extractor's own query for whether a dialog's own presentation is currently being
  /// extracted, and which one (M9-E) — the same import-direction reason [transitions] is a function
  /// rather than a field access to `TransitionExtractor.presentingTransition` directly. Read by
  /// `StatementExtractor.navigateOf`'s own `pop` case to tag `logic.Navigate.dismisses`.
  PresentingTransitionHook? presentingTransition;

  /// The route extractor's hook, offered every construction so it can learn the scope it sits in.
  ///
  /// Routes are emitted from a standalone walk that has no scope (see `extractor.dart`), but a route's
  /// **arguments** must be bound in one: `home: LoginScreen(isDark: _isDark)` is a signal read only if
  /// the scope says `_isDark` is a signal. This is where a construction is reached *with* that scope, so
  /// it is where the answer is recorded for the standalone walk to use afterwards.
  ///
  /// Nullable and set once by the orchestrator, for the same reasons [transitions] is, and a function
  /// rather than an interface for the same reason: the route extractor builds argument bindings, which
  /// needs this extractor, so it cannot be imported *by* this extractor.
  ConstructionHook? constructions;

  /// Offers [node] to the [constructions] hook, if one is wired.
  ///
  /// A method rather than a bare field read because the widget extractor calls it too — a widget
  /// construction reaches *that* extractor and never this one, and both are places a route's page can be
  /// written. Routing both through here keeps one hook to wire rather than two.
  void noteConstruction(InstanceCreationExpression node, Scope scope) =>
      constructions?.call(node, scope);

  /// The widget-tree extractor's own hook (ADR-0030), set once by the orchestrator. Null in a build that
  /// extracts expressions without widget-tree support (a unit test of this extractor alone) — in which
  /// case `SnackBar.content` stays the ordinary, generic `logic.New` every other constructor argument
  /// gets, exactly as it did before this decision.
  WidgetContentHook? presentedContentOf;

  /// The direct `SnackBar(...)` literal currently recognized as a `ScaffoldMessenger.showSnackBar`
  /// argument, if any (ADR-0030 §7) — identity-tracked (never by spelling) so only *this* exact AST node,
  /// reached from *this* exact recognized call, has its own `content:` argument redirected through
  /// [presentedContentOf]. Consumed (reset to null) the instant `_construction` reaches it, so a `content:`
  /// key on any other, unrelated construction anywhere else — including deeper inside this same
  /// `SnackBar`'s own `content:` subtree, or inside its `action:` callback — never matches.
  InstanceCreationExpression? _recognizedSnackbarLiteral;

  /// Recognizes `ScaffoldMessenger.of(...).showSnackBar(SnackBar(...))` — or the same call one local
  /// variable removed (`final m = ScaffoldMessenger.of(context); m.showSnackBar(...)`) — by resolved
  /// identity only (ADR-0030 §6): the receiver's own resolved static type must be Flutter's real
  /// `ScaffoldMessengerState` (`package:flutter/`), never by the spelling `ScaffoldMessenger` or
  /// `showSnackBar` alone, so a project's own same-named class or method (a required negative control,
  /// ADR-0030 §6) is never confused with it. The single argument must be a *direct* `SnackBar(...)`
  /// literal, resolved to Flutter's real `SnackBar` — a stored reference (`final bar = SnackBar(...);
  /// ...showSnackBar(bar)`) is deliberately not recognized (ADR-0030 §12): there is no existing mechanism
  /// in this compiler that traces a `logic.Ref` back to its own initializer, and building one is out of
  /// this decision's scope.
  void _recognizeSnackbarPresentation(MethodInvocation node) {
    if (node.methodName.name != 'showSnackBar') {
      return;
    }
    final DartType? receiverType = node.realTarget?.staticType;
    if (!AdapterContext.isA(receiverType, 'ScaffoldMessengerState', package: _flutterPackage)) {
      return;
    }
    final List<Expression> positional = <Expression>[
      for (final Argument argument in node.argumentList.arguments)
        if (argument is Expression) argument,
    ];
    if (positional.length != 1) {
      return;
    }
    final Expression sole = positional.single;
    if (sole is! InstanceCreationExpression) {
      return;
    }
    if (!AdapterContext.isA(sole.staticType, 'SnackBar', package: _flutterPackage)) {
      return;
    }
    _recognizedSnackbarLiteral = sole;
  }

  /// The package prefix Flutter's own SDK types resolve under — `AdapterContext.isA`'s own `package:`
  /// argument, named here rather than repeated, matching `MaterialRouteAdapter._package` (ADR-0030
  /// recognizes Flutter's real `ScaffoldMessengerState`/`SnackBar` the same resolved-identity way that
  /// file recognizes `MaterialPageRoute` and friends).
  static const String _flutterPackage = 'package:flutter/';

  // ── assignment ────────────────────────────────────────────────────────────────────────────────

  RawNode _assignment(AssignmentExpression node, Scope scope) {
    final String lexeme = node.operator.lexeme;
    final String? operator = assignmentOperators[lexeme];

    if (operator == null) {
      // An operator Dart has and we do not know. Refuse to guess: `??=` mis-mapped to `=` writes when
      // it should not, and the bug is invisible.
      out.report(
        Codes.unsupportedSyntax,
        'The assignment operator `$lexeme` has no UIR representation.',
        node,
      );
      return out.opaqueExpr(node, 'assignment operator $lexeme');
    }

    return RawNode(
      kind: 'logic.Assign',
      span: out.span(node),
      fields: <String, RawValue>{
        'target': RawChild(_target(node.leftHandSide, node.writeType, scope)),
        'operator': RawLiteral(operator),
        'value': RawChild(extract(node.rightHandSide, scope)),
        'type': out.typeRef(node.staticType, at: node),
      },
    );
  }

  /// The target of a write.
  ///
  /// An lvalue is not an rvalue, and the analyzer knows it: the identifier on the left of `_isDark =
  /// true` has neither a static type nor an element, because it is not being *read*. The type of the
  /// place written to lives on the assignment, as `writeType` — and using it is the difference between
  /// a faithful `logic.Assign` and a stream of BRG1303s claiming the element model is broken.
  RawNode _target(Expression node, DartType? writeType, Scope scope) {
    switch (node) {
      case SimpleIdentifier():
        return _reference(node, node.name, scope, type: writeType);
      // A write to a static: `GoRouter.optionURLReflectsImperativeAPIs = true`. The left-hand side is
      // a type name, which is not a value and has no type — the same category error as reading one.
      case PrefixedIdentifier() when _isStaticQualifier(node.prefix):
        return _reference(
          node,
          '${node.prefix.name}.${node.identifier.name}',
          scope,
          type: writeType,
        );
      case PrefixedIdentifier():
        // `widget.isDark` — a read of this component's own parameter. See `_componentProp`.
        if (_componentProp(node.prefix, node.identifier.name, node) case final RawNode prop) {
          return prop;
        }
        return RawNode(
          kind: 'logic.PropertyAccess',
          span: out.span(node),
          fields: <String, RawValue>{
            'receiver': RawChild(extract(node.prefix, scope)),
            'property': RawLiteral(node.identifier.name),
            'type': out.typeRef(writeType, at: node),
          },
        );
      case PropertyAccess() when node.target != null:
        return RawNode(
          kind: 'logic.PropertyAccess',
          span: out.span(node),
          fields: <String, RawValue>{
            'receiver': RawChild(extract(node.target!, scope)),
            'property': RawLiteral(node.propertyName.name),
            'type': out.typeRef(writeType, at: node),
          },
        );
      case Expression():
        // An index write, `_cache[key] = value`. There is no index node in the UIR, so the target is
        // opaque — but its *type* is still known, and it comes from the assignment, not the target.
        out.report(
          Codes.unsupportedSyntax,
          'A write to `${node.toSource()}` has no UIR representation for its target. It is preserved '
          'as an opaque expression.',
          node,
        );
        return out.opaqueExpr(node, 'write target', type: writeType);
    }
  }

  RawNode _incrementDecrement(
    Expression node,
    Expression operand,
    Token operator,
    Scope scope, {
    required DartType? writeType,
    required bool isPostfix,
  }) => RawNode(
    kind: 'logic.Assign',
    span: out.span(node),
    fields: <String, RawValue>{
      'target': RawChild(_target(operand, writeType, scope)),
      'operator': RawLiteral(operator.lexeme == '++' ? 'increment' : 'decrement'),
      // `value` is absent: `++` has no operand. `isPostfix` is not decoration — `list[i++]` and
      // `list[++i]` read different elements.
      if (isPostfix) 'isPostfix': const RawLiteral(true),
      'type': out.typeRef(node.staticType, at: node),
    },
  );

  static bool _isIncrement(Token operator) =>
      operator.lexeme == '++' || operator.lexeme == '--';

  /// A read of the component's own parameter, when [receiver] is the framework's props getter (INV-22).
  ///
  /// `widget.isDark` inside a `State` is a read of the **component's parameter** `isDark`. Extraction
  /// already lifts a `StatefulWidget`'s fields onto `ui.Component.params`, so the receiver carries no
  /// information the UIR lacks — it is the framework's word for "my own props", and `widget` is a name no
  /// downstream pass may know.
  ///
  /// Emitted as a `logic.Ref` with a `name` and **no `target`**, which is exactly how a parameter
  /// reference is spelled (Spec v2.5 §A18.3): resolution is by name, within the enclosing scope. The React
  /// component emitter already turns that into `props.isDark`, so nothing downstream changes.
  ///
  /// Before this, the receiver reached the generator as an undeclared name and every component reading a
  /// prop was refused with BRG3006 — a diagnostic right about the symbol and wrong about whose problem it
  /// was.
  RawNode? _componentProp(Expression receiver, String property, Expression at) {
    if (!registry.isComponentPropsGetter(receiver)) {
      return null;
    }
    return RawNode(
      kind: 'logic.Ref',
      span: out.span(at),
      fields: <String, RawValue>{
        'name': RawLiteral(property),
        // The schema requires it, and the read's static type is the parameter's type — the same type the
        // component's `params` entry carries. Omitting it produced BRG1204 on the first run, which is the
        // validator doing exactly its job: "a bug in extraction, not in the analyzed project".
        'type': out.typeRef(at.staticType, at: at),
      },
    );
  }

  /// Whether [node] names a type or an import prefix rather than a value.
  ///
  /// `MainAxisAlignment` in `MainAxisAlignment.center` is a class; `http` in `http.get` is an import
  /// prefix. Neither is a value, neither has a static type, and treating either as an expression asks
  /// the analyzer a question with no answer.
  static bool _isStaticQualifier(Expression node) {
    if (node is! Identifier) {
      return false;
    }
    final Element? element = node.element;
    return element is InterfaceElement ||
        element is TypeAliasElement ||
        element is ExtensionElement ||
        element is PrefixElement;
  }

  // ── the rest ──────────────────────────────────────────────────────────────────────────────────

  RawNode _literal(Expression node, Object? value) => RawNode(
    kind: 'logic.Lit',
    span: out.span(node),
    fields: <String, RawValue>{
      if (value != null) 'value': RawLiteral(value),
      'type': out.typeRef(node.staticType, at: node),
    },
  );

  /// A framework liveness read — `mounted` or `<value>.mounted` (ADR-0026).
  ///
  /// [operand] is the already-extracted context value, for `contextMounted`; absent (`null`) for the
  /// nullary `componentMounted`, exactly as the schema requires.
  RawNode _intrinsic(MountedKind kind, RawNode? operand, Expression at) => RawNode(
    kind: 'logic.Intrinsic',
    span: out.span(at),
    fields: <String, RawValue>{
      'intrinsic': RawLiteral(kind.name),
      if (operand != null) 'operand': RawChild(operand),
      'type': out.typeRef(at.staticType, at: at),
    },
  );

  /// A name. If it resolves to a declaration something else can refer to, it carries a `target`.
  ///
  /// [staticTarget] is for a name lexical scope has no opinion on at all — a static/enum-qualified
  /// access (`Stage.ready`) is not a local, a parameter, or a field, so [Scope] never binds it, and
  /// nothing here asks it to (M8-D). It is resolved by the caller instead, from the reference's own
  /// analyzer element, before `_reference` is ever called.
  RawNode _reference(Expression node, String name, Scope scope, {DartType? type, String? staticTarget}) {
    final Binding? binding = scope.lookup(name);
    // A build-method local (M8-B): the render tree has no `logic.VarDecl` to point a `target` at, so the
    // value is carried by re-extracting the local's own initializer here instead of naming it.
    if (binding?.inlineValue case final Expression initializer) {
      return extract(initializer, scope);
    }
    final String? target = staticTarget ?? binding?.symbol;
    return RawNode(
      kind: 'logic.Ref',
      span: out.span(node),
      fields: <String, RawValue>{
        'name': RawLiteral(name),
        // A `target` is a promise that something declares this symbol. A local has none — nothing
        // outside its function can refer to it — and inventing one would be a promise we could not
        // keep, which the builder would then report as BRG1201.
        if (target != null) 'target': RawRef(target),
        'type': out.typeRef(type ?? node.staticType, at: node),
      },
    );
  }

  /// A colour expression, lowered to the **name of the token that holds it**.
  ///
  /// Every colour form real Flutter uses reaches here as one of three shapes, all confirmed by running the
  /// analyzer over them (the M4-E probe):
  ///
  ///     Color(0xFF2196F3)                        logic.New Color(Lit int)
  ///     Colors.white                             logic.Ref, type Color
  ///     Color.fromARGB(255, 33, 150, 243)        logic.New Color.fromARGB(Lit…)
  ///     Colors.blue.shade700                     logic.PropertyAccess, type Color
  ///     Theme.of(context).colorScheme.primary    nested PropertyAccess over a Call, type Color
  ///
  /// The first four **constant-evaluate**, so they are hoisted into an `app.Token` and replaced by that
  /// token's name. The fifth does not — it is a read of the ambient theme — but it does not need to: a chain
  /// ending in `colorScheme.<role>` already *names* a token, and that name is what the widget wants. So both
  /// paths converge on the same output, a string naming a token, and the runtime resolves it through the
  /// theme exactly as it resolves any other role.
  ///
  /// A colour that is neither constant nor a role read — `someCondition ? a : b`, a colour from a store —
  /// returns `null` and falls through to ordinary expression extraction, where the generator refuses it with
  /// a diagnostic naming the capability. Silently painting one of the branches would be the invention this
  /// pipeline exists to prevent.
  RawNode? _colour(Expression node) {
    final DartType? type = node.staticType;
    if (type is! InterfaceType || type.element.name != 'Color') {
      return null;
    }
    // Only a framework `Color`. An application class of the same name is its own type.
    final String library = type.element.library.identifier;
    if (!registry.isFrameworkLibrary(library)) {
      return null;
    }

    final String? token = _constantColourToken(node) ?? _roleOf(node);
    if (token == null) {
      return null;
    }
    return RawNode(
      kind: 'logic.Lit',
      span: out.span(node),
      fields: <String, RawValue>{
        'value': RawLiteral(token),
        // A token *name*, so the type is String — which is what it now is. Recording it as `Color` would
        // tell every later pass that a string is a colour.
        'type': const RawMap(<String, RawValue>{'name': RawLiteral('String'), 'library': RawLiteral('dart:core')}),
      },
    );
  }

  /// The token holding [node]'s constant value, or `null` if it is not constant.
  String? _constantColourToken(Expression node) {
    final DartObject? value = node.computeConstantValue()?.value;
    if (value == null) {
      return null;
    }
    final int? argb = packedArgbOf(value);
    if (argb == null) {
      return null;
    }
    return hoistColour(argbHex(argb), node);
  }

  /// The Material role a `…colorScheme.<role>` chain names, or `null`.
  ///
  /// The one colour form that is *not* constant and still resolves: reading the ambient theme. It is
  /// recognised structurally — a property read whose receiver is a property read named `colorScheme` — so
  /// `Theme.of(context).colorScheme.primary` and a `colorScheme` held in a local both work, and neither
  /// `Theme` nor `of` is named anywhere in this function.
  static String? _roleOf(Expression node) {
    final (Expression? receiver, String? property) = switch (node) {
      PropertyAccess() => (node.target, node.propertyName.name),
      PrefixedIdentifier() => (node.prefix, node.identifier.name),
      _ => (null, null),
    };
    if (receiver == null || property == null) {
      return null;
    }
    final String? receiverName = switch (receiver) {
      PropertyAccess() => receiver.propertyName.name,
      PrefixedIdentifier() => receiver.identifier.name,
      SimpleIdentifier() => receiver.name,
      _ => null,
    };
    return receiverName == 'colorScheme' ? property : null;
  }

  /// A static const extracted as its **value**, if the catalog says this type's consts are values.
  ///
  /// `Icons.star` resolves to `IconData(0xe5f9, fontFamily: 'MaterialIcons')`. Emitting a reference to
  /// the *name* would oblige every runtime kit to carry Flutter's ~2000-entry `Icons` table so that
  /// `Icons.star` resolves to something; the codepoint is the icon's actual identity, and it is what the
  /// constant holds. So the reference is replaced by the construction it denotes.
  ///
  /// Which types this applies to, and which of their fields to read, is the catalog's answer and not this
  /// function's — `MaterialCatalog.constValues`, per ADR-18. A second font-backed type is a JSON edit.
  ///
  /// `null` whenever anything is not exactly as expected: a type the catalog does not list, a constant
  /// the evaluator cannot resolve, a field that is absent or is not a primitive. Every one of those falls
  /// back to the ordinary reference, which is the behaviour that existed before — so this can only add
  /// information, never lose it.
  RawNode? _constValue(Expression node) {
    final DartType? type = node.staticType;
    final String? typeName = type is InterfaceType ? type.element.name : null;
    if (typeName == null) {
      return null;
    }
    final List<String>? fields = registry.constValueFieldsOf(typeName);
    if (fields == null) {
      return null;
    }
    final DartObject? value = node.computeConstantValue()?.value;
    if (value == null) {
      return null;
    }

    final Map<String, RawValue> namedArgs = <String, RawValue>{};
    for (final String field in fields) {
      final DartObject? read = value.getField(field);
      if (read == null || read.isNull) {
        // An unset optional — `fontPackage` on a Material icon. Absent rather than null: the emitted
        // construction should say what the constant says, and it says nothing about this field.
        continue;
      }
      final Object? primitive =
          read.toIntValue() ?? read.toDoubleValue() ?? read.toStringValue() ?? read.toBoolValue();
      if (primitive == null) {
        // A field this cannot read is a constant this cannot faithfully reproduce, so none of it is
        // used. A partial construction would silently drop whatever the field carried.
        return null;
      }
      // `namedArgs` maps a name to an **Expr node**, not to a value — the schema is explicit and
      // BRG1204 catches the difference. Each field becomes the `logic.Lit` it would have been had the
      // constant's initializer been written at this call site, which is exactly what it denotes.
      namedArgs[field] = RawChild(
        RawNode(
          kind: 'logic.Lit',
          span: out.span(node),
          fields: <String, RawValue>{
            'value': RawLiteral(primitive),
            'type': out.typeRef(read.type, at: node),
          },
        ),
      );
    }
    if (namedArgs.isEmpty) {
      return null;
    }

    return RawNode(
      kind: 'logic.New',
      span: out.span(node),
      fields: <String, RawValue>{
        'typeName': RawLiteral(typeName),
        'namedArgs': RawMap(namedArgs),
        'isConst': const RawLiteral(true),
        'type': out.typeRef(type, at: node),
      },
    );
  }

  RawNode _instanceRef(Expression node, String name) => RawNode(
    kind: 'logic.Ref',
    span: out.span(node),
    fields: <String, RawValue>{
      'name': RawLiteral(name),
      'type': out.typeRef(node.staticType, at: node),
    },
  );

  /// The type of the thing [node] names.
  ///
  /// `staticType` is the type of an identifier *read as a value* — and an identifier is not always
  /// read. It is `null` for the left-hand side of an assignment (`_isDark = true`, a write) and for
  /// the callee of an invocation (`setState(…)`, a name, not a value). Both are ordinary Dart, both
  /// are everywhere in Flutter code, and asking the analyzer for a type it never had produced a stream
  /// of false BRG1303s — an error whose whole purpose is to mean *the element model is broken*.
  ///
  /// So when there is no value type, the type comes from the element: a field has a type whether or
  /// not you are reading it.
  static DartType? _typeOfIdentifier(SimpleIdentifier node) {
    final DartType? read = node.staticType;
    if (read != null && read is! InvalidType) {
      return read;
    }
    return switch (node.element) {
      final FunctionTypedElement element => element.type,
      final VariableElement element => element.type,
      _ => read,
    };
  }

  RawNode _invocation(MethodInvocation node, Scope scope) {
    // A navigation is a method invocation, and this is the one place every invocation is reached with
    // the scope its arguments must bind against. The transition it emits is a *separate* top-level
    // record — the imperative call still becomes the `logic.MethodCall` below, because the code does
    // both: it navigates, and that navigation is a statement in the method's body.
    transitions?.call(node, scope);
    _recognizeSnackbarPresentation(node);

    Expression? target = node.realTarget;

    // `Uri.parse(...)`, `http.get(...)` — a static call, not a method on a receiver. The "receiver"
    // is a type name, which has no value and no type; modelling it as one is what produced the false
    // BRG1303s. It is a plain call whose callee happens to be qualified.
    final String callee = target is Identifier && _isStaticQualifier(target)
        ? (target.element is PrefixElement
              ? node.methodName.name
              : '${target.name}.${node.methodName.name}')
        : node.methodName.name;
    if (target is Identifier && _isStaticQualifier(target)) {
      target = null;
    }

    // A BARE instance method call (`multiply(4)`, implicit `this`, no explicit or cascade receiver at
    // all) has no `realTarget` — the analyzer only populates it for an explicit or cascade receiver, so
    // `target` (above) is `null` here exactly as it would be for a genuine top-level function/local
    // closure call (M10-B, found live via a probe: `Model.multiply`'s own bare internal call reached
    // this file as `logic.Call` with an unresolvable `callee` Ref, structurally identical to a call this
    // generator has no member model for). Detected here, ahead of the `target == null` bare-callee
    // branch below, by checking whether the resolved element is itself an ELIGIBLE instance method
    // (`_externalMethodTarget`, fed `_thisType`'s own reconstructed receiver — never the unguarded
    // `_instanceMemberTarget`, which would also admit a static/abstract/generic/optional-param method a
    // genuine external call already refuses) — and, if so, synthesizing the identical `this`-receiver
    // `logic.MethodCall` shape an explicit `this.multiply(4)` produces, so the generator has exactly one
    // shape to handle either way. Anything else (a top-level function, a store/component method, or an
    // instance method that is not independently eligible) falls through completely unchanged to the
    // existing `target == null` branch below.
    if (target == null) {
      final DartType? thisType = _thisType(node.methodName.element);
      final String? methodTarget = _externalMethodTarget(thisType, node.methodName.element);
      if (methodTarget != null) {
        return RawNode(
          kind: 'logic.MethodCall',
          span: out.span(node),
          fields: <String, RawValue>{
            // NOT `_instanceRef(node, 'this')` — that helper types the reference from `node.staticType`,
            // which for a `MethodInvocation` is the CALL's own return type (`int`, `multiply`'s own
            // return type), never the receiver's. `this` has no real AST node of its own to ask a static
            // type of here (a bare call synthesizes no such node), so the type is built directly from
            // `_thisType`'s own reconstructed receiver type instead (found live: the receiver's own
            // `type` field was silently `int`, not `Model`, before this fix).
            'receiver': RawChild(
              RawNode(
                kind: 'logic.Ref',
                span: out.span(node),
                fields: <String, RawValue>{'name': const RawLiteral('this'), 'type': out.typeRef(thisType, at: node)},
              ),
            ),
            'method': RawLiteral(node.methodName.name),
            'target': RawRef(methodTarget),
            ..._arguments(node.argumentList, scope),
            'type': out.typeRef(node.staticType, at: node),
          },
        );
      }
    }

    return RawNode(
      kind: target == null ? 'logic.Call' : 'logic.MethodCall',
      span: out.span(node),
      fields: <String, RawValue>{
        if (target == null)
          // The callee's type is the *function's* type, not the call's. A method name identifier has
          // no static type of its own — it is not a value — and asking it for one is what produced ten
          // false BRG1303s on `setState(...)` alone.
          'callee': RawChild(
            _reference(
              node.methodName,
              callee,
              scope,
              type: _typeOfIdentifier(node.methodName),
              staticTarget:
                  _enumConstantTarget(node.methodName.element) ?? _topLevelTarget(node.methodName.element),
            ),
          )
        else ...<String, RawValue>{
          'receiver': RawChild(extract(target, scope)),
          'method': RawLiteral(node.methodName.name),
          // `this.multiply(4)` and an external `model.multiply(4)` both resolve through the identical
          // `_externalMethodTarget` gate (M10-B) — `_receiverTypeFor` supplies `this`'s own reconstructed
          // type where an ordinary expression would supply its own `staticType`, exactly as the sibling
          // `PropertyAccess` case above already does for fields/getters.
          if (_storeMemberTarget(target.staticType, node.methodName.element) ??
                  _externalMethodTarget(_receiverTypeFor(target, node.methodName.element), node.methodName.element)
              case final String symbol)
            'target': RawRef(symbol),
        },
        ..._arguments(node.argumentList, scope),
        'type': out.typeRef(node.staticType, at: node),
      },
    );
  }

  /// The enum declaration [element] belongs to, when it is an enum constant declared in this project
  /// (M8-D).
  ///
  /// Resolved by `element.isEnumConstant` — a fact the analyzer already proved when it resolved the
  /// reference, never a guess from spelling — and by the constant's own enclosing element, which is
  /// the enum. `Symbols.typeIn` mirrors exactly how `logic.EnumDecl` registers its own symbol
  /// (`declaration_extractor.dart`'s `out.symbols.type(name)`), so the two agree by construction: both
  /// derive from the same declaring file and the same name, never matched against each other after the
  /// fact. A constant declared outside this project (an SDK enum, or one from a sibling workspace
  /// package this analysis root does not include) yields `null` — `Symbols.pathOf` returns `null` for a
  /// library this project does not declare, exactly as it already does for `_storeMemberTarget` below.
  String? _enumConstantTarget(Element? element) {
    // `Stage.ready` resolves to the *getter* Dart synthesizes for the constant, the same shape any
    // field read reaches this file as (`_storeMemberTarget`'s own `isOriginVariable` check, above) —
    // never the `FieldElement` directly. `.variable` is the one already-resolved step back to it.
    final Element? field = element is GetterElement && element.isOriginVariable ? element.variable : element;
    if (field is! FieldElement || !field.isEnumConstant) {
      return null;
    }
    final InstanceElement owner = field.enclosingElement;
    final String? name = owner.name;
    final String library = owner.library.identifier;
    if (name == null) {
      return null;
    }
    return Symbols.typeIn(
      library,
      name,
      packageName: out.packageName,
      localPackages: out.localPackageNames,
      extractedDependencyFiles: out.extractedDependencyFiles,
    );
  }

  /// The enum declaration [element] belongs to, when [element] is the `values` getter Dart's own
  /// compiler synthesizes for every enum (M8-Z) — never a user-declared member.
  ///
  /// `field.name == 'values'` looks like a name check, but it is not the same class of thing this
  /// project otherwise refuses to do (M8-V's own rule): Dart's own language grammar *reserves* `values`
  /// on an enum specifically — a user cannot declare an enum constant, or any other static member, with
  /// that name (a compile error). So the combination checked here — a *static* field named `values`
  /// whose *enclosing element is structurally an `EnumElement`* — cannot be satisfied by anything other
  /// than the one member the compiler itself puts there; there is no real Dart program this could ever
  /// misidentify. A project-defined **class** (not an enum) with its own `.values` static getter fails
  /// the `owner is EnumElement` check and is left completely alone, falling through exactly as it always
  /// did — proven directly, not assumed (§ reduction ladder).
  String? _enumValuesTarget(Element? element) {
    final Element? field = element is GetterElement && element.isOriginVariable ? element.variable : element;
    if (field is! FieldElement || !field.isStatic || field.name != 'values') {
      return null;
    }
    final InstanceElement owner = field.enclosingElement;
    if (owner is! EnumElement) {
      return null;
    }
    final String? name = owner.name;
    final String library = owner.library.identifier;
    if (name == null) {
      return null;
    }
    return Symbols.typeIn(
      library,
      name,
      packageName: out.packageName,
      localPackages: out.localPackageNames,
      extractedDependencyFiles: out.extractedDependencyFiles,
    );
  }

  /// The top-level declaration [element] resolves to, when it is a plain top-level variable or
  /// function this project (or a local dependency, M8-F) declares — the sibling of
  /// [_enumConstantTarget], for `protocolVersion`/`formatBytes`-shaped references whose declaring file
  /// is not the referring one (M8-J).
  ///
  /// A class's own static member is deliberately **not** handled here: `declaration_extractor.dart`'s
  /// own `_fields` never gives a static field a symbol the way a top-level variable's `_topLevelScope`
  /// binding already does (`Symbols.variable`) — so a static-member fix needs a declaration-side change
  /// too, which this milestone's own scope is top-level declarations, not class members. Left refused,
  /// same as before.
  String? _topLevelTarget(Element? element) {
    // The same unwrap `_enumConstantTarget` already does: a variable read reaches here as the
    // *synthetic getter* Dart creates for it, never the `TopLevelVariableElement` directly.
    final Element? unwrapped =
        element is GetterElement && element.isOriginVariable ? element.variable : element;
    if (unwrapped is TopLevelVariableElement) {
      final String? name = unwrapped.name;
      if (name == null) {
        return null;
      }
      return Symbols.variableIn(
        unwrapped.library.identifier,
        name,
        packageName: out.packageName,
        localPackages: out.localPackageNames,
        extractedDependencyFiles: out.extractedDependencyFiles,
      );
    }
    if (unwrapped is TopLevelFunctionElement) {
      final String? name = unwrapped.name;
      if (name == null) {
        return null;
      }
      return Symbols.functionIn(
        unwrapped.library.identifier,
        name,
        packageName: out.packageName,
        localPackages: out.localPackageNames,
        extractedDependencyFiles: out.extractedDependencyFiles,
      );
    }
    // An explicit top-level getter (`String get crossFileGetter => …`) — never a class's own getter,
    // which `enclosingElement` distinguishes structurally (an `InstanceElement`/`ExtensionElement`),
    // never by name. `declaration_extractor.dart`'s `_function` emits it exactly as it emits an
    // ordinary top-level function — `logic.FunctionDecl`, `Symbols.function` — because Dart's own AST
    // does not distinguish a `FunctionDeclaration` that happens to be a getter; neither does this.
    if (unwrapped is GetterElement &&
        unwrapped.isOriginDeclaration &&
        unwrapped.enclosingElement is! InstanceElement &&
        unwrapped.enclosingElement is! ExtensionElement) {
      final String? name = unwrapped.name;
      if (name == null) {
        return null;
      }
      return Symbols.functionIn(
        unwrapped.library.identifier,
        name,
        packageName: out.packageName,
        localPackages: out.localPackageNames,
        extractedDependencyFiles: out.extractedDependencyFiles,
      );
    }
    return null;
  }

  /// The store member [element] resolves to, when [receiverType] is a declared store (ADR-27).
  ///
  /// Resolved by the member's own declaring element, never by name: a `MethodElement` — a call, or a
  /// tear-off with no parens, which reaches the analyzer as the same `PropertyAccess`/`PrefixedIdentifier`
  /// shape a getter read does — resolves against the store's action symbol scheme; an explicit getter
  /// against its derived scheme; the implicit getter Dart synthesizes for a plain field against its
  /// signal scheme. A member declared outside this project (`addListener`, `notifyListeners`, `dispose` —
  /// `ChangeNotifier`'s own API, not the store's) yields `null`: `Symbols.pathOf` returns `null` for a
  /// library this project does not declare, which is exactly the fact that separates a store's own member
  /// from the framework surface every `ChangeNotifier` inherits.
  String? _storeMemberTarget(DartType? receiverType, Element? element) {
    if (element == null || !registry.isStoreBase(receiverType)) {
      return null;
    }
    final Element? owner = element.enclosingElement;
    final String? ownerName = owner?.name;
    final String? library = owner?.library?.identifier;
    final String? name = element.name;
    if (ownerName == null || library == null || name == null) {
      return null;
    }
    if (element is MethodElement) {
      return Symbols.actionIn(
        library,
        name,
        owner: ownerName,
        packageName: out.packageName,
        localPackages: out.localPackageNames,
        extractedDependencyFiles: out.extractedDependencyFiles,
      );
    }
    if (element is GetterElement) {
      // `isOriginVariable` — the implicit getter Dart synthesizes for a plain field — vs. an explicit
      // getter the author wrote (`isOriginDeclaration`). Not `isSynthetic`: deprecated in this analyzer
      // in favour of exactly this pair, for exactly this distinction.
      return element.isOriginVariable
          ? Symbols.signalIn(
              library,
              name,
              owner: ownerName,
              packageName: out.packageName,
              localPackages: out.localPackageNames,
              extractedDependencyFiles: out.extractedDependencyFiles,
            )
          : Symbols.derivedIn(
              library,
              name,
              owner: ownerName,
              packageName: out.packageName,
              localPackages: out.localPackageNames,
              extractedDependencyFiles: out.extractedDependencyFiles,
            );
    }
    return null;
  }

  /// The receiver type an INTERNAL (`this`/bare) instance-member access has, reconstructed from the
  /// resolved [element]'s own declaring class (M10-B) — `this` has no expression of its own to ask a
  /// static type of, and a bare identifier has no receiver expression at all, so both are recovered from
  /// the one fact that IS available: which class this member is declared on. Used to route internal
  /// access through the identical eligibility-gated `_external*Target` functions an external receiver
  /// already used, rather than the separate, unguarded [_instanceMemberTarget] internal access used to
  /// call directly — found, live, to be a real gap: `_instanceMemberTarget` does not check
  /// static/abstract/private/override/generic/required-positional, so `this.someLateOrPrivateField` (a
  /// field) or, once method/getter composition existed, `this.someGenericMethod()` would otherwise have
  /// slipped through a check external access already had.
  DartType? _thisType(Element? element) {
    final Element? owner = element?.enclosingElement;
    return owner is InstanceElement ? owner.thisType : null;
  }

  /// The receiver type to check member eligibility against, for either an external receiver expression
  /// or a literal `this` one (M10-B) — `_dispatchSafeReceiverClass`, and everything downstream of it, is
  /// a property of the member/class alone, never of how the receiver happened to be spelled, so both
  /// route through the identical `_external*Target` gate below, fed a differently-*sourced* (never
  /// differently-*checked*) receiver type.
  DartType? _receiverTypeFor(Expression? target, Element? element) =>
      target is ThisExpression ? _thisType(element) : target?.staticType;

  /// Resolves an INTERNAL (`this`/bare) field or explicit-getter reference — the sibling of
  /// `_externalFieldTarget ?? _externalGetterTarget` for an external one, except for a plain FIELD read,
  /// which stays routed through the broader [_instanceMemberTarget] unchanged: M9-L's own established
  /// identity-resolution scope resolves `target` for EVERY internal field read, deliberately regardless
  /// of eligibility (a real, pre-existing, and correct test: a `static` field read inside a `static`
  /// method still resolves) — `target` there is pure declaration provenance, and the field-shape
  /// eligibility check (public/final/non-static/non-late) already lives, separately, at the GENERATOR
  /// layer, in both the class's own type-interface-building code AND (M10-B) its member-`self`-rewrite,
  /// which now independently re-checks it before ever treating a field as `self`-rewritable.
  ///
  /// An explicit getter is different: unlike a field, it has no second, independent generator-side
  /// eligibility re-check the way the interface-building code already gives fields — the getter-HELPER
  /// emission loop trusts this extractor's own gate completely to have already excluded a
  /// static/abstract/private/`@override`d getter. So an internal getter read is routed through the
  /// identical `_externalGetterTarget` gate an external one already uses, never `_instanceMemberTarget`
  /// directly (M10-B: found live, an internal read of an otherwise-excluded getter would otherwise reach
  /// a generator that has no independent eligibility check for it at all).
  String? _internalMemberTarget(Element? element) {
    if (element is GetterElement && element.isOriginDeclaration) {
      return _externalGetterTarget(_thisType(element), element);
    }
    return _instanceMemberTarget(element);
  }

  /// The class member [element] resolves to, when its own `enclosingElement` is a class (ADR-0033) —
  /// the generalization of [_storeMemberTarget] beyond `isStoreBase`, to *any* project class's own
  /// field/getter/method. Resolved the identical way: by the member's own declaring element, never by
  /// name — the same `isOriginVariable`/`isOriginDeclaration` pair, the same `Symbols.pathOf`-backed
  /// project-boundary check that already keeps a framework class's own inherited API from being
  /// misattributed to a project class.
  ///
  /// **This is declaration *provenance*, never a dispatch instruction (ADR-0033 §2).** `target` here
  /// states a fact the analyzer already proved — "this identifier resolves to member X of class Y" — a
  /// fact that holds regardless of which concrete subtype the runtime receiver turns out to be. It is
  /// exactly as true for `Base.readImplicit`'s own `value` (resolving to `Base.value`, even though a
  /// `Child` instance dispatches `Child.value` at runtime) as it is for a `final` class with no
  /// subclasses at all — because nothing that reads `target` anywhere in this codebase treats it as
  /// "invoke this declaration instead of the receiver." Confirmed directly (ADR-0033's own audit): every
  /// existing consumer of `target` on a `PropertyAccess`/`MethodCall` still evaluates and emits the
  /// receiver expression unconditionally; `target` only ever selects *how* to lower the property/method
  /// spelling, never *whether* to bypass the receiver.
  ///
  /// This is pure symbol computation, never an eligibility gate (M10-B) — every direct caller is one of
  /// `_externalFieldTarget`/`_externalGetterTarget`/`_externalMethodTarget`, each of which checks the
  /// member's own eligibility (public, non-static, non-abstract, no `@override`, and so on) and owner
  /// consistency FIRST, calling this only once eligibility already passed, for BOTH an external receiver
  /// AND an internal (`this`/bare) one — `_receiverTypeFor`/`_thisType` (above) are what let an internal
  /// access route through the identical gate an external one always has, rather than a separately
  /// (and, until M10-B's own investigation found it, more weakly) checked path. An external read
  /// (`model.count`, from outside the class) reaches this exactly the same way an internal one now does,
  /// so M9-J's own refusal — gated on `target` being absent — is untouched by this function's own
  /// existence either way.
  String? _instanceMemberTarget(Element? element) {
    if (element == null) {
      return null;
    }
    final Element? owner = element.enclosingElement;
    if (owner is! InstanceElement) {
      return null;
    }
    // A component's own fields back its constructor parameters — already correctly represented as
    // `ui.Component.params`, resolved through `scope.paramInScope`/`_componentProp`, never through this
    // mechanism (a real regression this exclusion fixes: without it, a bare `base` read inside
    // `StatelessWidget.build()` — `base` being `W`'s *own* field — got a target, which made
    // `isParameterReceiver` (M9-J) stop recognizing it as a bare parameter and silently re-enabled the
    // exact `unknown`-receiver passthrough M9-J exists to refuse). A store's own fields are, symmetrically,
    // already correctly bound via `signal_extractor.dart`'s own `Binds.signal`/`.field`/`.storeInstance`
    // scope construction (ADR-27) — giving them a *second*, differently-prefixed target here would
    // conflict with, not complement, that mechanism. Both exclusions leave this function applying only to
    // a plain class — exactly `_class`'s own `semantic = isComponent || isStore` boundary.
    if (registry.isComponentBase(owner.thisType) ||
        registry.isStateBase(owner.thisType) ||
        registry.isStoreBase(owner.thisType)) {
      return null;
    }
    final String? ownerName = owner.name;
    final String library = owner.library.identifier;
    final String? name = element.name;
    if (ownerName == null || name == null) {
      return null;
    }
    if (element is MethodElement) {
      return Symbols.functionIn(
        library,
        name,
        owner: ownerName,
        packageName: out.packageName,
        localPackages: out.localPackageNames,
        extractedDependencyFiles: out.extractedDependencyFiles,
      );
    }
    if (element is GetterElement) {
      return element.isOriginVariable
          ? Symbols.variableIn(
              library,
              name,
              owner: ownerName,
              packageName: out.packageName,
              localPackages: out.localPackageNames,
              extractedDependencyFiles: out.extractedDependencyFiles,
            )
          : Symbols.functionIn(
              library,
              name,
              owner: ownerName,
              packageName: out.packageName,
              localPackages: out.localPackageNames,
              extractedDependencyFiles: out.extractedDependencyFiles,
            );
    }
    return null;
  }

  /// The `logic.FieldDecl` [element] resolves to, for an EXTERNAL field read (`model.count` — the
  /// receiver is some other expression, never `this`) — ADR-0035.
  ///
  /// A strictly narrower, independently-checked eligibility gate in front of [_instanceMemberTarget]'s
  /// own, already-proven field-backed resolution — never a second, competing symbol-computation path.
  /// [_instanceMemberTarget] alone is not safe to call for an external receiver as-is: it exists to
  /// record provenance for a read *inside* the declaring class's own body, where the receiver's exact
  /// runtime shape is not yet this compiler's concern. An external read is different — a target here
  /// makes M9-J's own refusal (`node['target'] === undefined`, the *first*, independent conjunct of its
  /// three-way check) stop firing outright, bypassing `isUnmodelledMemberReceiver`'s own class-level
  /// opinion entirely. So every exclusion that class-level check would otherwise have caught — an
  /// inherited class, a generic instantiation, a private class — must be re-checked here, explicitly,
  /// rather than assumed from `_classTypeTarget`'s own (deliberately more permissive, ADR-0034 §9/§11)
  /// behavior for `TypeRef.target`.
  ///
  /// Eligible only when ALL of: the receiver's static type is a non-generic `InterfaceType` whose
  /// element is a `ClassElement`; that class is public and has no explicit superclass (`Object` only);
  /// it is not a component/`State`/store base; the resolved member is a field-backed getter
  /// (`GetterElement.isOriginVariable`, never an explicit `isOriginDeclaration` getter); and the
  /// underlying field itself is `final`, not `static`, not `late`, and not private — every one of these
  /// checked via the real analyzer semantic API (`VariableElement.isFinal`/`.isStatic`/`.isLate`,
  /// `Element.isPrivate`), never by name text or AST modifier syntax.
  String? _externalFieldTarget(DartType? receiverType, Element? element) {
    final ClassElement? ownerClass = _dispatchSafeReceiverClass(receiverType);
    if (ownerClass == null) {
      return null;
    }
    if (element is! GetterElement || !element.isOriginVariable) {
      return null;
    }
    final PropertyInducingElement field = element.variable;
    if (!field.isFinal || field.isStatic || field.isLate || field.isPrivate) {
      return null;
    }
    // Owner consistency (ADR-0035 §7/§8) — never property-name equality. Dart's own resolution already
    // makes this structurally true for a direct, non-inherited access; asserted directly rather than
    // trusted implicitly.
    if (field.enclosingElement != ownerClass) {
      return null;
    }
    return _instanceMemberTarget(element);
  }

  /// The class a project-class-typed [receiverType] resolves to, when it is safe to execute one of its
  /// own instance members against — the shared eligibility gate [_externalFieldTarget] (ADR-0035) and
  /// [_externalGetterTarget] (ADR-0038) both apply, factored out once they were proven identical.
  ///
  /// Eligible only when: the type is a non-generic `InterfaceType` whose element is a public `ClassElement`
  /// with no explicit superclass (`Object` only) and not a component/`State`/store base. A receiver typed
  /// as a *subclass* (one with its own explicit superclass) is excluded here, unconditionally — which is
  /// also, structurally, the entire dynamic-dispatch safety argument ADR-0038 relies on for getters: since
  /// a subclass-typed receiver can never pass this check, a member resolved against it can never be
  /// reached through this function at all, regardless of whether some subclass overrides that member
  /// elsewhere in the program. No corpus-wide "does this class have a subclass" search is needed, or
  /// performed.
  ClassElement? _dispatchSafeReceiverClass(DartType? receiverType) {
    if (receiverType is! InterfaceType || receiverType.typeArguments.isNotEmpty) {
      return null;
    }
    final InterfaceElement ownerClass = receiverType.element;
    if (ownerClass is! ClassElement || ownerClass.isPrivate) {
      return null;
    }
    final InterfaceType? supertype = ownerClass.supertype;
    if (supertype != null && supertype.element.name != 'Object') {
      return null;
    }
    if (registry.isComponentBase(receiverType) ||
        registry.isStateBase(receiverType) ||
        registry.isStoreBase(receiverType)) {
      return null;
    }
    return ownerClass;
  }

  /// The `logic.FunctionDecl` [element] resolves to, for an EXTERNAL explicit-getter read (`model.doubled`
  /// — the receiver is some other expression, never `this`) — ADR-0038, the getter-execution sibling of
  /// [_externalFieldTarget].
  ///
  /// Eligible only when: [_dispatchSafeReceiverClass] admits the receiver's own type (§ its own doc —
  /// this is also the entire dynamic-dispatch exclusion); the resolved member is an explicit getter
  /// (`GetterElement.isOriginDeclaration`, never the field-backed `isOriginVariable` shape
  /// [_externalFieldTarget] already owns); it is non-static, non-abstract (a real body — Dart represents
  /// an interface-only getter's absence of one as `isAbstract`, checked as a real `Element`-level semantic
  /// fact, never by re-parsing the AST body text), non-external, and carries no `@override` annotation
  /// (`Element.hasOverride` — a getter that overrides an inherited one is refused even though its own
  /// class already passed the "no superclass" gate above, since `@override` without a superclass is
  /// itself invalid Dart and never actually reaches here; kept as an explicit, independent check rather
  /// than inferred from that fact, matching this codebase's own "defense in depth over assumed redundancy"
  /// discipline — ADR-0035 §21/M9-N's own precedent). Owner consistency (`element.enclosingElement !=
  /// ownerClass` — the identical check [_externalFieldTarget] already makes) excludes an inherited getter
  /// exactly as it excludes an inherited field.
  String? _externalGetterTarget(DartType? receiverType, Element? element) {
    final ClassElement? ownerClass = _dispatchSafeReceiverClass(receiverType);
    if (ownerClass == null) {
      return null;
    }
    if (element is! GetterElement || !element.isOriginDeclaration) {
      return null;
    }
    if (element.isStatic ||
        element.isAbstract ||
        element.isExternal ||
        element.isPrivate ||
        element.metadata.hasOverride) {
      return null;
    }
    if (element.enclosingElement != ownerClass) {
      return null;
    }
    return _instanceMemberTarget(element);
  }

  /// Whether [type] is safe to expose as a bounded instance method's own RETURN type (M10-D) — checked
  /// entirely through the real analyzer's own resolved type identity, never a type-name string or the
  /// generated TypeScript's own eventual `unknown` fallback text (Phase 4's own explicit requirement):
  /// `DartType.isDartCoreInt`/`isDartCoreDouble`/`isDartCoreNum`/`isDartCoreBool`/`isDartCoreString` for a
  /// `dart:core` value type, or [_dispatchSafeReceiverClass] — the identical gate a RECEIVER's own type
  /// already must pass — for a project class. `void`, `dynamic`, a generic instantiation (`List<int>`,
  /// `Future<int>`), a function type, a type parameter (`T`, from a generic method — already excluded
  /// independently, below, but harmless to re-exclude here too), and an external/unresolvable class all
  /// return `false`.
  bool _isEligibleMethodReturnType(DartType? type) {
    if (type == null) return false;
    if (type.isDartCoreInt || type.isDartCoreDouble || type.isDartCoreNum || type.isDartCoreBool || type.isDartCoreString) {
      return true;
    }
    return _dispatchSafeReceiverClass(type) != null;
  }

  /// The `logic.FunctionDecl` [element] resolves to, for an EXTERNAL instance method call
  /// (`model.multiply(3)`) — ADR-0039, the method-execution sibling of [_externalGetterTarget].
  ///
  /// Eligible only when: [_dispatchSafeReceiverClass] admits the receiver's own type (the identical
  /// dynamic-dispatch exclusion ADR-0038 §10 already established, reused verbatim — a subclass-typed
  /// receiver can never pass this gate, whether or not the subclass overrides the method); the resolved
  /// member is a real, ordinary `MethodElement` (this alone already excludes a getter/setter, which the
  /// analyzer resolves to distinct element types, and an operator invoked via ordinary call syntax, which
  /// it never is — `element.isOperator` is checked directly regardless, since Dart's own `[]`/`[]=`
  /// operators reach this file through the identical `logic.MethodCall` shape an ordinary call does,
  /// M4-H); it is non-static, non-abstract (a real body), non-external, non-private, carries no
  /// `@override` annotation, and is declared directly on the receiver's own class (owner consistency,
  /// identical to the getter/field checks). Its own parameters must be uniformly required-positional —
  /// no optional, named, or default-valued parameter — mirroring the identical boundary ADR-0037 already
  /// drew for a constructor's own field-formals, kept narrow deliberately rather than re-derived per
  /// capability.
  String? _externalMethodTarget(DartType? receiverType, Element? element) {
    final ClassElement? ownerClass = _dispatchSafeReceiverClass(receiverType);
    if (ownerClass == null) {
      return null;
    }
    if (element is! MethodElement || element.isOperator) {
      return null;
    }
    if (element.isStatic ||
        element.isAbstract ||
        element.isExternal ||
        element.isPrivate ||
        element.metadata.hasOverride) {
      return null;
    }
    if (element.enclosingElement != ownerClass) {
      return null;
    }
    // A generic METHOD (`T identity<T>(T value) => value;`) on an otherwise-eligible, non-generic
    // owner class is excluded here independently of `_dispatchSafeReceiverClass`'s own generic-class
    // check (§9/§40) — that gate only ever inspects the RECEIVER's own type arguments, never the
    // resolved member's own type parameters, so a generic method on a non-generic class would
    // otherwise slip through. `ClassDecl.methods`'s own `FunctionDecl` shape has no type-parameter
    // field to represent `T` faithfully in a helper signature, so this is excluded at the same layer
    // every other unsupported method shape is, rather than discovered downstream as a generator-side
    // `unknown`/broken-type emission.
    if (element.typeParameters.isNotEmpty) {
      return null;
    }
    // The method's own RETURN type (M10-D) — a `dart:core` value type already representable by the
    // existing `TypeRef`/`typeTextOf` machinery, or a project class satisfying the identical
    // dispatch-safety gate a RECEIVER already must ([_dispatchSafeReceiverClass]) — never `dynamic`, a
    // generic instantiation (`List<int>`), a function type, or an external/unresolvable class. A real,
    // live-probed gap found while investigating this milestone: before this check, a method returning
    // `dynamic` or `List<int>` still resolved a `target` and reached a real, un-refused helper whose own
    // signature rendered the return type `unknown` — safe only by accident wherever the caller happened
    // to consume it in a position `unknown` also satisfies (a template-literal interpolation), and a real
    // `tsc --strict` failure, never this compiler's own honest `BRG3013`, the moment a caller chained a
    // further member off the result or assigned it to a narrower type.
    //
    // Skipped entirely for an `async` method (`element.firstFragment.isAsynchronous`) — ADR-0039 §5's own
    // established, separately-tested split deliberately keeps the async EXCLUSION at the GENERATOR layer,
    // not here (an async method's return type is language-mandated to be `Future`/`FutureOr`/`Stream`-
    // shaped, which this gate would otherwise always reject, moving that exclusion to the wrong,
    // extraction, layer and breaking the pre-existing "an async method still resolves a target at THIS
    // layer" regression test).
    if (!element.firstFragment.isAsynchronous && !_isEligibleMethodReturnType(element.returnType)) {
      return null;
    }
    for (final FormalParameterElement param in element.formalParameters) {
      if (!param.isRequiredPositional) return null;
      // A function-typed parameter (`int Function(int) fn`) — M10-C non-goal "closures/function-valued
      // method references". Excluded here, at the identical eligibility gate every other unsupported
      // parameter shape is refused at, rather than discovered downstream: the generator has no lowering
      // for a Dart function type (`typeTextOf` renders it `unknown`), so admitting this method would
      // emit a helper whose own body *calls* a parameter typed `unknown` — code that reaches `tsc` as
      // "not callable", never this compiler's own honest `BRG3013` (a real, live-probed gap found while
      // investigating this milestone's own non-goal list, not a hypothetical).
      if (param.type is FunctionType) return null;
    }
    return _instanceMemberTarget(element);
  }

  RawNode _construction(InstanceCreationExpression node, Scope scope) {
    // A route's page can be constructed inside a plain expression — `GoRoute(builder: (c, s) =>
    // Screen(id: s.x))`, or a `MaterialApp(routes: {'/a': (c) => Screen()})` map — and this is where
    // such a construction is reached with the scope its arguments bind against.
    noteConstruction(node, scope);

    // Consumed by identity, not merely read, the instant this node is reached — so a `content:` key on
    // any other construction (including one nested inside this very `content:`/`action:` subtree) can
    // never accidentally match a stale recognition (ADR-0030 §7).
    final bool recognizedSnackbar = identical(node, _recognizedSnackbarLiteral);
    if (recognizedSnackbar) {
      _recognizedSnackbarLiteral = null;
    }
    final RawValue? presentedContent = recognizedSnackbar ? _presentedSnackbarContent(node, scope) : null;

    // `content:` is extracted exactly once — through `presentedContentOf` above when recognized, through
    // the ordinary path below otherwise — never both, which would extract the same expression twice
    // under two different anchors and collide (BRG1205).
    final String? constructorName = node.constructorName.name?.name;
    return RawNode(
      kind: 'logic.New',
      span: out.span(node),
      // A unique namespace for `presentedContent`'s own embedded subtree (ADR-0030), the same
      // `anchorSegment` idiom `TransitionExtractor` uses for an inline route-overlay destination
      // (M9-D) — without it, two structurally identical snack bars (`SnackBar(content: Text('Saved'))`
      // written twice) both claim the bare anchor `<file>#Text` and trip BRG1205.
      anchorSegment: presentedContent != null ? 'snackbar[${_snackbarOrdinal++}]' : null,
      fields: <String, RawValue>{
        'typeName': RawLiteral(node.constructorName.type.name.lexeme),
        if (constructorName != null) 'constructorName': RawLiteral(constructorName),
        ..._arguments(
          node.argumentList,
          scope,
          omit: presentedContent != null ? const {'content'} : const {},
          includeNamedOrder: true,
        ),
        'presentedContent': ?presentedContent,
        if (node.isConst) 'isConst': const RawLiteral(true),
        'type': out.typeRef(node.staticType, at: node),
      },
    );
  }

  /// The next unused ordinal for a recognized `SnackBar`'s own `anchorSegment` (ADR-0030) — mirrors
  /// `TransitionExtractor._ordinal` exactly, one counter per file, incremented once per recognized call.
  int _snackbarOrdinal = 0;

  /// `presentedContent` (ADR-0030 §7) for a recognized `SnackBar(...)`'s own `content:` argument — the
  /// real, embedded `ui.Element` [presentedContentOf] gives it, in place of the ordinary, generic
  /// `logic.New` the argument would otherwise become.
  ///
  /// Absent (not an error) when the hook is unwired (a unit test of this extractor alone) or `content:`
  /// itself is missing — `SnackBar`'s own required-ness is a Dart-level fact this extractor does not
  /// re-enforce; either way `content` simply falls through to the ordinary `namedArgs` extraction, since
  /// the caller only omits it from that path when this returns non-null.
  RawValue? _presentedSnackbarContent(InstanceCreationExpression node, Scope scope) {
    final WidgetContentHook? hook = presentedContentOf;
    if (hook == null) {
      return null;
    }
    for (final Argument argument in node.argumentList.arguments) {
      if (argument is NamedArgument && argument.name.lexeme == 'content') {
        return RawChild(hook(argument.argumentExpression, scope));
      }
    }
    return null;
  }

  /// Positional and named arguments, split as the schema splits them.
  ///
  /// [omit] excludes named-argument keys already extracted some other way (ADR-0030's `presentedContent`,
  /// for `content`) — extracting the same expression twice would give it two different anchors and one of
  /// them would collide with a sibling call's own (BRG1205).
  ///
  /// [includeNamedOrder] additionally emits `namedArgOrder` (ADR-0037) — the named-argument labels in
  /// this call's own real source order, captured here because it is the one place that order is still
  /// visible: `namedArgs` itself is a `RawMap`, canonicalized to sorted key order by the builder like
  /// every other named-argument map in the schema. Only [_construction] (`logic.New`) passes `true` —
  /// a bounded structural construction (ADR-0036) is the one place in this milestone that needs Dart's
  /// left-to-right argument evaluation order to survive into a generator's own emitted property order;
  /// `logic.Call`'s own two call sites below leave it `false`; `namedArgOrder` is absent for them, unchanged.
  Map<String, RawValue> _arguments(
    ArgumentList list,
    Scope scope, {
    Set<String> omit = const {},
    bool includeNamedOrder = false,
  }) {
    final List<RawValue> positional = <RawValue>[];
    final Map<String, RawValue> named = <String, RawValue>{};
    final List<String> namedOrder = <String>[];

    for (final Argument argument in list.arguments) {
      if (argument is NamedArgument) {
        if (omit.contains(argument.name.lexeme)) continue;
        named[argument.name.lexeme] = RawChild(extract(argument.argumentExpression, scope));
        namedOrder.add(argument.name.lexeme);
      } else if (argument is Expression) {
        positional.add(RawChild(extract(argument, scope)));
      }
    }

    return <String, RawValue>{
      if (positional.isNotEmpty) 'args': RawList(positional),
      if (named.isNotEmpty) 'namedArgs': RawMap(named),
      if (includeNamedOrder && namedOrder.isNotEmpty)
        'namedArgOrder': RawList(namedOrder.map(RawLiteral.new).toList()),
    };
  }

  RawNode _listLiteral(ListLiteral node, Scope scope) => RawNode(
    kind: 'logic.ListLit',
    span: out.span(node),
    fields: <String, RawValue>{
      'elements': RawList(<RawValue>[
        for (final CollectionElement element in node.elements)
          RawChild(_collectionElement(element, scope)),
      ]),
      'type': out.typeRef(node.staticType, at: node),
    },
  );

  RawNode _mapLiteral(SetOrMapLiteral node, Scope scope) {
    final List<RawValue> keys = <RawValue>[];
    final List<RawValue> values = <RawValue>[];

    for (final CollectionElement element in node.elements) {
      if (element is MapLiteralEntry) {
        keys.add(RawChild(extract(element.key, scope)));
        values.add(RawChild(extract(element.value, scope)));
      } else {
        // A set literal, or a spread/if/for inside a map. Keys and values are paired positionally by
        // the schema, so there is no honest way to put a lone element into one of them.
        out.report(
          Codes.unsupportedSyntax,
          'This collection element has no UIR representation inside a map or set literal.',
          element,
        );
      }
    }

    return RawNode(
      kind: 'logic.MapLit',
      span: out.span(node),
      fields: <String, RawValue>{
        if (keys.isNotEmpty) 'keys': RawList(keys),
        if (values.isNotEmpty) 'values': RawList(values),
        'type': out.typeRef(node.staticType, at: node),
      },
    );
  }

  /// One element of a collection literal.
  ///
  /// `...spread`, `if (c) e` and `for (x in xs) e` have no `Expr` node. Inside a *widget* list they do
  /// have a home — `ui.Cond` and `ui.List` — and the widget extractor uses it. Inside a plain Dart
  /// list they do not, and they become opaque rather than disappearing.
  RawNode _collectionElement(CollectionElement element, Scope scope) {
    if (element is Expression) {
      return extract(element, scope);
    }
    out.report(
      Codes.unsupportedSyntax,
      'A `${_describe(element)}` inside a non-widget collection has no UIR representation. It is '
      'preserved as an opaque expression.',
      element,
    );
    return RawNode(
      kind: 'logic.OpaqueExpr',
      span: out.span(element),
      fields: <String, RawValue>{
        'dartSource': RawLiteral(element.toSource()),
        'reason': RawLiteral(_describe(element)),
        'type': const RawMap(<String, RawValue>{'name': RawLiteral('dynamic')}),
      },
    );
  }

  RawNode _unsupported(Expression node, Scope scope) {
    final String reason = _describe(node);
    out.report(
      Codes.unsupportedSyntax,
      'A `$reason` has no UIR representation. It is preserved as an opaque expression, with its '
      'source text, so nothing is lost and a later milestone or an override can model it.',
      node,
    );
    return out.opaqueExpr(node, reason);
  }

  /// A construct's name, **as a Dart programmer would say it**.
  ///
  /// The fallback used to be `node.runtimeType.toString()`, which prints the *analyzer's own
  /// implementation class*: real applications produced diagnostics reading "A `AdjacentStringsImpl` has no
  /// UIR representation" and "A `RethrowExpressionImpl` …". That names a private class in a package the
  /// user does not depend on, for a construct they wrote as `'a' 'b'` and `rethrow`.
  ///
  /// M5-A's diagnostic audit found it by reading what two real applications actually printed — 25
  /// `AdjacentStringsImpl` and 4 `RethrowExpressionImpl` between them. Every construct a real program hit is
  /// now named; the fallback strips the `Impl` suffix the analyzer adds, so a construct nobody has met yet
  /// degrades to `AdjacentStrings` rather than to something that looks like a leak.
  static String _describe(AstNode node) => switch (node) {
    CascadeExpression() => 'cascade',
    SpreadElement() => 'spread',
    IfElement() => 'collection-if',
    ForElement() => 'collection-for',
    SwitchExpression() => 'switch expression',
    RecordLiteral() => 'record',
    IndexExpression() => 'index',
    IsExpression() => 'is-check',
    ThrowExpression() => 'throw expression',
    // `'a' 'b'` — Dart's adjacent string literals, which the language concatenates at compile time.
    AdjacentStrings() => 'adjacent string literals',
    RethrowExpression() => 'rethrow',
    AwaitExpression() => 'await expression',
    FunctionExpressionInvocation() => 'call of a function-valued expression',
    SetOrMapLiteral() => 'set or map literal',
    _ => _plainName(node),
  };

  /// A node's class name without the analyzer's `Impl` suffix.
  ///
  /// A last resort. It is still an implementation name, and still worse than a written one — but
  /// `AdjacentStrings` is at least a phrase a Dart programmer can search for, where `AdjacentStringsImpl`
  /// is a class they cannot see.
  static String _plainName(AstNode node) {
    final String name = node.runtimeType.toString();
    return name.endsWith('Impl') ? name.substring(0, name.length - 4) : name;
  }

  static Object? _constValueOf(Expression node) => switch (node) {
    IntegerLiteral() => node.value,
    DoubleLiteral() => node.value,
    BooleanLiteral() => node.value,
    _ => null,
  };
}

/// The half of the statement extractor that expressions need.
///
/// Narrow on purpose: an expression reaches into a statement for a block's statements, and — since
/// INV-22 — to ask whether a call is a framework state batch that must be spliced open. Nothing else.
abstract interface class StatementExtractorRef {
  /// A block's statements, in order. Order is semantic and is never sorted.
  List<RawValue> statementsOf(Block node, Scope scope);

  /// The closure a framework state-batching call wraps, if [node] is one.
  FunctionExpression? unwrapStateBatch(MethodInvocation node);

  /// A `logic.Navigate` for [node] if it is a navigation this models, spanning [at].
  ///
  /// Asked from the arrow-body path as well as the statement path, because `() => Navigator.pop(c)`
  /// and `{ Navigator.pop(c); }` are the same function and must extract to the same node. The first
  /// version of ADR-0025's implementation hooked only the statement form, and the whole corpus writes
  /// the arrow — the node reached UIR **zero** times until this existed.
  RawNode? navigateOf(MethodInvocation node, AstNode at, Scope scope);
}

/// Offers a method invocation to the transition extractor, with the scope its arguments bind against.
///
/// A function, not an interface, and it breaks a would-be import cycle: the transition extractor builds
/// argument bindings, which needs this extractor, so it cannot be imported *by* this extractor. The
/// orchestrator wires the two together by passing a bound method through this hook.
/// Returns the **symbol** of the `app.RouteTransition` the offer produced, or null when the call is not
/// a navigation or carries no resolvable edge.
///
/// Returning the symbol is what M7-B added, and it is the whole of transition identity: the statement
/// extractor asks for an edge and is told what that edge is called, so a `logic.Navigate` can name it
/// without anything ever searching for it.
typedef TransitionHook = String? Function(MethodInvocation node, Scope scope);

/// Reads the transition extractor's own `presentingTransition` field at the moment it is called (M9-E) —
/// the symbol of the `app.RouteTransition` whose own inline destination is currently being extracted, or
/// null when extraction is not currently inside one. A function, not a snapshotted value, because the
/// field it reads changes for the duration of a single `widgets.extract` call and must be read fresh at
/// the exact point a `Navigator.pop` is reached, not once at wiring time.
typedef PresentingTransitionHook = String? Function();

/// Offers a construction to the route extractor, with the scope its arguments bind against.
///
/// Returns nothing: unlike [TransitionHook] this records a fact for later rather than producing a node.
/// Routes are emitted from a walk that visits the whole unit once and therefore sees a route's page
/// *after* the router that declares it; the scope has to be banked at the moment it exists.
typedef ConstructionHook = void Function(InstanceCreationExpression node, Scope scope);

/// Extracts [widget] through the real widget-tree extractor, the same way an ordinary `build()` render
/// tree already is (ADR-0030) — offered so a recognized presentation call's own inline widget argument
/// (a `SnackBar`'s `content:`) gets a genuine `ui.Element` rather than the generic `logic.New` every
/// other constructor argument gets.
///
/// A function rather than an interface, for the same reason [TransitionHook] is: the widget extractor
/// imports this one (for the leaf expressions inside a widget's own properties), so this extractor
/// cannot import it back.
typedef WidgetContentHook = RawNode Function(Expression widget, Scope scope);
