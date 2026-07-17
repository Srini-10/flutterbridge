/// State — signals, derivations, actions, effects, stores.
///
/// Layer: `session` (extraction).
///
/// ADR-4 fixes the compiler's model of reactivity: **a signal graph, and nothing else.** No generator
/// ever sees a `setState`. So this is the module that has to decide, for every field of every class,
/// whether it is *state* — and being wrong in either direction is a bug with no compile-time symptom.
/// Miss a signal and the UI never updates. Invent one and it re-renders forever.
///
/// ## What counts as state
///
/// | Dart | Why |
/// | --- | --- |
/// | a non-`final` instance field | it can be assigned, so it can change |
/// | a `final ValueNotifier`/`ChangeNotifier` field | the *box* is final; the value inside is not |
/// | **a `final` field the class mutates** | `final Set<String> _ids = {}` + `_ids.add(x)` |
///
/// That third row is the one that is easy to get wrong, and getting it wrong is not a near-miss: it is
/// the exact bug C1 documented, and which `sig.Action`'s own schema description warns about.
/// `FavoritesStore._favoriteIds` is `final`, and it is mutated on every toggle — through `add` and
/// `remove`, never by assignment. A "final means constant" rule drops it, the store ends up with no
/// signals, and the generated React state never updates.
///
/// So reactivity is decided by **what the class does to the field**, not by the `final` keyword. A
/// `final` field nothing ever mutates is genuinely constant, and subscribing to it would cost a
/// re-render that can never fire.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/extract/expression_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';

/// The state a class owns.
final class ClassState {
  /// Creates a description of a class's state.
  const ClassState({
    required this.signals,
    required this.derived,
    required this.actions,
    required this.effects,
    required this.scope,
  });

  /// The symbols of the class's signals, in declaration order.
  final List<String> signals;

  /// The symbols of its derived values (its getters over state).
  final List<String> derived;

  /// The symbols of its actions (its methods that write state).
  final List<String> actions;

  /// The symbols of its lifecycle effects.
  final List<String> effects;

  /// A scope in which the class's fields — signals included — resolve.
  ///
  /// This is what makes `Text(_name)` inside `build` come out as a `bind.Signal` rather than a
  /// `bind.Expr`: the name is in scope, and the scope knows it is reactive.
  final Scope scope;
}

/// Extracts state.
final class SignalExtractor {
  /// Creates an extractor.
  const SignalExtractor(this.out, this.expressions, this.registry);

  /// The record factory.
  final RawNodeEmitter out;

  /// For initializers and bodies.
  final ExpressionExtractor expressions;

  /// The compiler's package knowledge. **This file has none of its own** (ISSUE-16): which methods are
  /// lifecycle hooks, and which types hold state, are facts about Flutter, not about Dart.
  final AdapterRegistry registry;

  /// Extracts the state of [node], whose signals live in the returned scope.
  ///
  /// [owner] names the class for symbol purposes. [storeScope] is `store` for a `ChangeNotifier` —
  /// state that outlives any one component — and `component` for a `State`.
  ClassState extract(
    ClassDeclaration node, {
    required String owner,
    required String storeScope,
    required Scope enclosing,
  }) {
    final List<String> signals = <String>[];
    final List<String> derived = <String>[];
    final List<String> actions = <String>[];
    final List<String> effects = <String>[];
    final List<Binding> bindings = <Binding>[];

    // What the class mutates, by name. Collected before anything else, because whether a field is a
    // signal depends on it — and a name-based pass is all that is possible here: the scope that would
    // resolve the names is the very thing being built.
    final _MutatedNames mutated = _MutatedNames();
    node.accept(mutated);

    // ── 1. Signals first, so that everything else — a getter, an action body, a build method —
    //       resolves a field name to a *signal* rather than to a plain field. ──
    for (final ClassMember member in node.body.members) {
      if (member is! FieldDeclaration || member.isStatic) {
        continue;
      }
      for (final VariableDeclaration variable in member.fields.variables) {
        final String name = variable.name.lexeme;
        final bool reactive = !member.fields.isFinal ||
            mutated.names.contains(name) ||
            registry.isStateHolder(variable.declaredFragment?.element.type);

        if (!reactive) {
          // A constant of the object. No symbol: nothing declares it as a node, so a reference to it
          // must not claim a target that does not exist — that is BRG1201, and it would be our bug,
          // not the project's.
          bindings.add(Binding(name: name, binds: Binds.field));
          continue;
        }

        final String symbol = out.symbols.signal(name, owner: owner);
        signals.add(symbol);
        bindings.add(Binding(name: name, binds: Binds.signal, symbol: symbol));

        out.emit(
          RawNode(
            kind: 'sig.Signal',
            span: out.span(variable),
            symbol: symbol,
            fields: <String, RawValue>{
              'type': out.typeRef(variable.declaredFragment?.element.type, at: variable),
              'scope': RawLiteral(storeScope),
              if (variable.initializer != null)
                'initial': RawChild(
                  expressions.extract(variable.initializer!, enclosing),
                ),
            },
          ),
        );
      }
    }

    final Scope scope = enclosing.child(bindings);

    // ── 2. Everything that reads or writes those signals. ──
    for (final ClassMember member in node.body.members) {
      if (member is! MethodDeclaration || member.isStatic) {
        continue;
      }
      final String name = member.name.lexeme;

      // A lifecycle method is an effect, not an action. `initState` is not something the user calls.
      final String? timing = registry.lifecycleMethods[name];
      if (timing != null) {
        final String symbol = out.symbols.effect(timing, owner: owner);
        if (!effects.contains(symbol)) {
          effects.add(symbol);
          out.emit(
            RawNode(
              kind: 'sig.Effect',
              span: out.span(member),
              symbol: symbol,
              fields: <String, RawValue>{
                'timing': RawLiteral(timing),
                'body': RawList(expressions.bodyOf(member.body, scope)),
              },
            ),
          );
        }
        continue;
      }

      // A getter over state is a derivation: it recomputes when what it reads changes, and it is
      // never assigned. `bool get isEmpty => _items.isEmpty;`
      if (member.isGetter) {
        final String symbol = out.symbols.derived(name, owner: owner);
        final Expression? value = _returnedExpression(member.body);
        if (value == null) {
          continue;
        }
        derived.add(symbol);
        out.emit(
          RawNode(
            kind: 'sig.Derived',
            span: out.span(member),
            symbol: symbol,
            fields: <String, RawValue>{
              'deps': RawList(
                _signalsReadBy(member, scope).map(RawRef.new).toList(),
              ),
              'body': RawChild(expressions.extract(value, scope)),
              'type': out.typeRef(
                member.declaredFragment?.element.returnType ?? member.returnType?.type,
                at: member,
              ),
            },
          ),
        );
        continue;
      }

      // The method's own scope: its parameters, over the class's fields. A parameter shadows a field
      // of the same name — that is what Dart means — so a write to `id` in `set(int id)` is a write to
      // the parameter, and naming the field in `writes` would tell the generator to re-render on a
      // change that never happened. `logic.Ref` resolves a parameter to no target, because a
      // `ParamDecl` is a value and has no id: the body names it, and the action's own `params`
      // declares it (Spec v2.5 §A18).
      final Scope inner = _scopeOf(member.parameters, scope);

      // A method that writes state is an action. One that does not is just a method, and turning it
      // into an action would tell the generator to notify subscribers of a change that never happened.
      final List<String> writes = _signalsWrittenBy(member, inner);
      if (writes.isEmpty || member.isSetter) {
        continue;
      }

      final List<RawValue> params = _params(member.parameters, scope);
      final String symbol = out.symbols.action(name, owner: owner);
      actions.add(symbol);
      out.emit(
        RawNode(
          kind: 'sig.Action',
          span: out.span(member),
          symbol: symbol,
          fields: <String, RawValue>{
            // Absent, never empty. Absent *is* the schema's word for "takes none"; `[]` would be a
            // second spelling of it, and would change the content of every action that has none.
            if (params.isNotEmpty) 'params': RawList(params),
            'writes': RawList(writes.map(RawRef.new).toList()),
            'body': RawList(expressions.bodyOf(member.body, inner)),
            if (member.body.isAsynchronous) 'isAsync': const RawLiteral(true),
          },
        ),
      );
    }

    return ClassState(
      signals: signals,
      derived: derived,
      actions: actions,
      effects: effects,
      scope: scope,
    );
  }

  /// The scope [list]'s parameters bind, enclosed by [enclosing].
  ///
  /// The same shape the other parameterized constructs use — a top-level function, a lambda, a
  /// component's props — because a parameter means the same thing wherever it is written.
  static Scope _scopeOf(FormalParameterList? list, Scope enclosing) => enclosing.child(<Binding>[
    for (final FormalParameter parameter in list?.parameters ?? const <FormalParameter>[])
      if (parameter.name != null)
        Binding(name: parameter.name!.lexeme, binds: Binds.parameter),
  ]);

  /// The parameters [list] declares, as the `ParamDecl` value objects the schema asks for.
  ///
  /// **Read, never inferred.** Every field comes from what the source wrote: a parameter is `named`
  /// because it is written between braces, `required` because Dart says it is. An unresolved type is
  /// `out.typeRef`'s problem and is reported there — a plausible `dynamic` invented here would be a
  /// lie nothing downstream could detect (INV-4).
  ///
  /// **Source order is kept.** For a positional parameter the order *is* the meaning: swapping the two
  /// in `move(int from, int to)` compiles, and is wrong.
  ///
  /// [scope] is the one *enclosing* the method, which is where Dart evaluates a default: a default is
  /// a constant expression and cannot see the parameters it sits among.
  List<RawValue> _params(FormalParameterList? list, Scope scope) => <RawValue>[
    for (final FormalParameter parameter in list?.parameters ?? const <FormalParameter>[])
      RawMap(<String, RawValue>{
        'name': RawLiteral(parameter.name?.lexeme ?? '_'),
        'type': out.typeRef(parameter.declaredFragment?.element.type, at: parameter),
        if (parameter.isNamed) 'named': const RawLiteral(true),
        if (parameter.isRequired) 'required': const RawLiteral(true),
        // `[int n = 0]` and `{int n = 0}` — the only two places a default can be written. Lowered
        // through the ordinary expression path: a default is an expression, and it is not a special
        // kind of one.
        if (parameter.defaultClause case final FormalParameterDefaultClause clause)
          'defaultValue': RawChild(expressions.extract(clause.value, scope)),
      }),
  ];

  /// The signals [member] writes — **including through method calls on them**.
  ///
  /// C1's evidence, recorded in `sig.Action`'s own schema description: `FavoritesStore.toggle` mutates
  /// via `_favoriteIds.add/remove`, never by assignment. An assignment-only analysis returns an empty
  /// write set, and the generated React state never updates. So a mutating call on a signal counts.
  List<String> _signalsWrittenBy(MethodDeclaration member, Scope scope) {
    final _WriteFinder finder = _WriteFinder(scope);
    member.body.accept(finder);
    // Sorted: a write set is a *set*, and its order must not depend on the order the visitor happened
    // to walk the body in (D2).
    return finder.writes.toList()..sort();
  }

  List<String> _signalsReadBy(AstNode node, Scope scope) {
    final _ReadFinder finder = _ReadFinder(scope);
    node.accept(finder);
    return finder.reads.toList()..sort();
  }

  static Expression? _returnedExpression(FunctionBody body) => switch (body) {
    ExpressionFunctionBody() => body.expression,
    BlockFunctionBody() when body.block.statements.length == 1 =>
      (body.block.statements.single as ReturnStatement?)?.expression,
    _ => null,
  };

  /// Whether [node] is a store: state that outlives any one component.
  bool isStore(ClassDeclaration node) =>
      registry.isStoreBase(node.declaredFragment?.element.thisType);
}

/// Finds the names a class mutates, before any scope exists to resolve them against.
///
/// Deliberately name-based and deliberately over-inclusive: a local `x` that shadows a field `x` and
/// is mutated will mark the field reactive. That costs one signal that never changes. The opposite
/// error — missing a mutation — costs a UI that never updates, and is invisible until someone clicks.
final class _MutatedNames extends RecursiveAstVisitor<void> {
  /// Every name written, by assignment or by a mutating call.
  final Set<String> names = <String>{};

  void _record(Expression? target) {
    final String? name = switch (target) {
      SimpleIdentifier() => target.name,
      PropertyAccess() when target.target is ThisExpression => target.propertyName.name,
      PrefixedIdentifier() when target.prefix.name == 'this' => target.identifier.name,
      _ => null,
    };
    if (name != null) {
      names.add(name);
    }
  }

  @override
  void visitAssignmentExpression(AssignmentExpression node) {
    _record(node.leftHandSide);
    super.visitAssignmentExpression(node);
  }

  @override
  void visitPostfixExpression(PostfixExpression node) {
    if (node.operator.lexeme == '++' || node.operator.lexeme == '--') {
      _record(node.operand);
    }
    super.visitPostfixExpression(node);
  }

  @override
  void visitPrefixExpression(PrefixExpression node) {
    if (node.operator.lexeme == '++' || node.operator.lexeme == '--') {
      _record(node.operand);
    }
    super.visitPrefixExpression(node);
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    if (_WriteFinder.mutators.contains(node.methodName.name)) {
      _record(node.realTarget);
    }
    super.visitMethodInvocation(node);
  }
}

/// Finds the signals a body writes.
final class _WriteFinder extends RecursiveAstVisitor<void> {
  _WriteFinder(this._scope);

  final Scope _scope;
  final Set<String> writes = <String>{};

  /// Methods that mutate the receiver rather than returning a new value.
  ///
  /// A list is not a fact about the world; it is a list of the mutating methods of Dart's collections,
  /// and a method missing from it is a missed write. It is deliberately conservative in the *safe*
  /// direction: a false positive costs one extra re-render, a false negative costs a UI that is wrong.
  static const Set<String> mutators = <String>{
    'add',
    'addAll',
    'clear',
    'insert',
    'insertAll',
    'remove',
    'removeAt',
    'removeLast',
    'removeRange',
    'removeWhere',
    'retainWhere',
    'sort',
    'shuffle',
    'fillRange',
    'setAll',
    'setRange',
    'putIfAbsent',
    'update',
    'updateAll',
  };

  void _record(Expression? target) {
    final String? name = switch (target) {
      SimpleIdentifier() => target.name,
      PropertyAccess() when target.target is ThisExpression => target.propertyName.name,
      PrefixedIdentifier() when target.prefix.name == 'this' => target.identifier.name,
      _ => null,
    };
    if (name == null) {
      return;
    }
    final Binding? binding = _scope.lookup(name);
    if (binding?.binds == Binds.signal && binding?.symbol != null) {
      writes.add(binding!.symbol!);
    }
  }

  @override
  void visitAssignmentExpression(AssignmentExpression node) {
    _record(node.leftHandSide);
    super.visitAssignmentExpression(node);
  }

  @override
  void visitPostfixExpression(PostfixExpression node) {
    if (node.operator.lexeme == '++' || node.operator.lexeme == '--') {
      _record(node.operand);
    }
    super.visitPostfixExpression(node);
  }

  @override
  void visitPrefixExpression(PrefixExpression node) {
    if (node.operator.lexeme == '++' || node.operator.lexeme == '--') {
      _record(node.operand);
    }
    super.visitPrefixExpression(node);
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    if (mutators.contains(node.methodName.name)) {
      _record(node.realTarget);
    }
    super.visitMethodInvocation(node);
  }
}

/// Finds the signals an expression reads.
final class _ReadFinder extends RecursiveAstVisitor<void> {
  _ReadFinder(this._scope);

  final Scope _scope;
  final Set<String> reads = <String>{};

  @override
  void visitSimpleIdentifier(SimpleIdentifier node) {
    final Binding? binding = _scope.lookup(node.name);
    if (binding?.binds == Binds.signal && binding?.symbol != null) {
      reads.add(binding!.symbol!);
    }
    super.visitSimpleIdentifier(node);
  }
}
