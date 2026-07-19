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
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/colour_constants.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';

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
        return _reference(node, node.name, scope, type: _typeOfIdentifier(node));

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
        );

      case PrefixedIdentifier():
        return RawNode(
          kind: 'logic.PropertyAccess',
          span: out.span(node),
          fields: <String, RawValue>{
            'receiver': RawChild(extract(node.prefix, scope)),
            'property': RawLiteral(node.identifier.name),
            'type': out.typeRef(node.staticType, at: node),
          },
        );

      case PropertyAccess() when node.target != null:
        final Expression target = node.target!;
        if (target is Identifier && _isStaticQualifier(target)) {
          if (_constValue(node) case final RawNode folded) {
            return folded;
          }
          return _reference(node, '${target.name}.${node.propertyName.name}', scope);
        }
        return RawNode(
          kind: 'logic.PropertyAccess',
          span: out.span(node),
          fields: <String, RawValue>{
            'receiver': RawChild(extract(target, scope)),
            'property': RawLiteral(node.propertyName.name),
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

  /// A name. If it resolves to a declaration something else can refer to, it carries a `target`.
  RawNode _reference(Expression node, String name, Scope scope, {DartType? type}) {
    final Binding? binding = scope.lookup(name);
    return RawNode(
      kind: 'logic.Ref',
      span: out.span(node),
      fields: <String, RawValue>{
        'name': RawLiteral(name),
        // A `target` is a promise that something declares this symbol. A local has none — nothing
        // outside its function can refer to it — and inventing one would be a promise we could not
        // keep, which the builder would then report as BRG1201.
        if (binding?.symbol != null) 'target': RawRef(binding!.symbol!),
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
            ),
          )
        else ...<String, RawValue>{
          'receiver': RawChild(extract(target, scope)),
          'method': RawLiteral(node.methodName.name),
        },
        ..._arguments(node.argumentList, scope),
        'type': out.typeRef(node.staticType, at: node),
      },
    );
  }

  RawNode _construction(InstanceCreationExpression node, Scope scope) {
    final String? constructorName = node.constructorName.name?.name;
    return RawNode(
      kind: 'logic.New',
      span: out.span(node),
      fields: <String, RawValue>{
        'typeName': RawLiteral(node.constructorName.type.name.lexeme),
        if (constructorName != null) 'constructorName': RawLiteral(constructorName),
        ..._arguments(node.argumentList, scope),
        if (node.isConst) 'isConst': const RawLiteral(true),
        'type': out.typeRef(node.staticType, at: node),
      },
    );
  }

  /// Positional and named arguments, split as the schema splits them.
  Map<String, RawValue> _arguments(ArgumentList list, Scope scope) {
    final List<RawValue> positional = <RawValue>[];
    final Map<String, RawValue> named = <String, RawValue>{};

    for (final Argument argument in list.arguments) {
      if (argument is NamedArgument) {
        named[argument.name.lexeme] = RawChild(extract(argument.argumentExpression, scope));
      } else if (argument is Expression) {
        positional.add(RawChild(extract(argument, scope)));
      }
    }

    return <String, RawValue>{
      if (positional.isNotEmpty) 'args': RawList(positional),
      if (named.isNotEmpty) 'namedArgs': RawMap(named),
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
}

/// Offers a method invocation to the transition extractor, with the scope its arguments bind against.
///
/// A function, not an interface, and it breaks a would-be import cycle: the transition extractor builds
/// argument bindings, which needs this extractor, so it cannot be imported *by* this extractor. The
/// orchestrator wires the two together by passing a bound method through this hook.
typedef TransitionHook = void Function(MethodInvocation node, Scope scope);
