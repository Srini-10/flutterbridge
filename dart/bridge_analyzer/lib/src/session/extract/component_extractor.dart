/// Components — the widgets an application declares.
///
/// Layer: `session` (extraction).
///
/// ## The StatefulWidget pair
///
/// Flutter splits one component across two classes: `LoginScreen extends StatefulWidget` holds the
/// *parameters*, and `_LoginScreenState extends State<LoginScreen>` holds the *state* and the *build*.
/// That split is a consequence of Flutter's element tree, not of the user's design — nobody thinks of
/// them as two things — and every target we compile to has one component with both.
///
/// So extraction emits **one** `ui.Component`: named for the widget, parameterized by the widget's
/// fields, rendered and stated by the `State`. Reuniting the pair here is not normalization; it is
/// refusing to propagate a Flutter implementation detail into a target-neutral IR.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/dart/element/element.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/extract/expression_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';
import 'package:bridge_analyzer/src/session/extract/signal_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/transition_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/widget_extractor.dart';

/// Extracts components.
final class ComponentExtractor {
  /// Creates an extractor.
  const ComponentExtractor(
    this.out,
    this.widgets,
    this.signals,
    this.registry,
    this.context,
    this.transitions,
  );

  /// The record factory.
  final RawNodeEmitter out;

  /// For the render tree.
  final WidgetExtractor widgets;

  /// For the state.
  final SignalExtractor signals;

  /// The compiler's package knowledge. **This file has none of its own** (ISSUE-16).
  final AdapterRegistry registry;

  /// What the adapters run in.
  final AdapterContext context;

  /// Told which component a navigation happens from, so a transition can record its `source`.
  final TransitionExtractor transitions;

  /// Whether [node] declares a component.
  ///
  /// Asked of the registry, which asks the resolved supertypes — never the name. A class is a widget
  /// because of what it extends, and a class called `LoginButton` that extends nothing is not one.
  bool isComponent(ClassDeclaration node) => registry
      .recogniseWidget(context, node.declaredFragment?.element.thisType)
      .isComponentBase;

  /// Whether [node] is a widget that is not a stateless/stateful component — a `RenderObjectWidget`, an `InheritedWidget` (M12).
  bool isOtherWidget(ClassDeclaration node) {
    if (node.abstractKeyword != null || node.sealedKeyword != null) {
      return false;
    }
    final WidgetRecognition recognition = registry.recogniseWidget(context, node.declaredFragment?.element.thisType);
    return recognition.isWidget && !recognition.isComponentBase;
  }

  /// Declares [node] as a component with an opaque render: other classes name it (a `comp:` symbol), so it must exist, and the generator
  /// refuses each use by name.
  void extractOpaque(ClassDeclaration node) {
    final String name = node.namePart.typeName.lexeme;
    out.report(
      Codes.unknownWidget,
      'The widget `$name` is not a stateless or stateful component (a custom render object or an inherited widget): it cannot be '
      'lowered, and is preserved as an opaque component.',
      node,
    );
    out.emit(
      RawNode(
        kind: 'ui.Component',
        span: out.span(node),
        symbol: out.symbols.component(name),
        anchorSegment: name,
        fields: <String, RawValue>{
          'name': RawLiteral(name),
          'render': RawChild(out.opaqueUi(node, 'widget without a build method')),
        },
      ),
    );
  }

  /// Whether [node] is the `State` half of a `StatefulWidget` — and if so, of which widget.
  String? stateOf(ClassDeclaration node) =>
      registry.widgetOfState(node.declaredFragment?.element.thisType);

  /// Extracts the component [node] declares, pairing it with [state] when it has one.
  ///
  /// Returns the component's symbol, so a route can refer to it.
  String? extract(
    ClassDeclaration node, {
    required Scope enclosing,
    ClassDeclaration? state,
  }) {
    final String name = node.namePart.typeName.lexeme;
    final String symbol = out.symbols.component(name);

    // A navigation anywhere in this component — an action body, a button's onPressed — happens *from*
    // this component, and that is its transition's `source`. Set before the state and render are walked,
    // where those navigations are, and cleared after so a navigation outside any component records none.
    transitions.enclosingComponent = symbol;

    // Parameters come from the *widget* class's final fields — which is exactly what its constructor
    // sets, and what a caller passes.
    final List<RawValue> params = <RawValue>[];
    final List<Binding> paramBindings = <Binding>[];

    // What the widget's own constructor says about each field: `this.nested = false` is optional with a default,
    // `required this.name` is required. Before ADR-0053 every field with no initializer was `required`, so a defaulted
    // constructor parameter — one of the commonest idioms in Flutter — lost its default and became a mandatory prop.
    final Map<String, FormalParameter> constructorParams = <String, FormalParameter>{};
    final Map<String, Expression> initFieldValues = <String, Expression>{};
    for (final ClassMember member in node.body.members) {
      if (member is! ConstructorDeclaration) {
        continue;
      }
      _refuseUnmodelledConstructor(member, stateful: state != null);
      if (member.name == null) {
        for (final FormalParameter parameter in member.parameters.parameters) {
          if (parameter is FieldFormalParameter) {
            constructorParams[parameter.name.lexeme] = parameter;
          }
        }
        // `: destructive = false` — a field the constructor computes from constants. No caller can pass it, so its value is its default.
        for (final ConstructorInitializer initializer in member.initializers) {
          if (initializer is ConstructorFieldInitializer) {
            initFieldValues[initializer.fieldName.name] = initializer.expression;
          }
        }
      }
    }

    for (final ClassMember member in node.body.members) {
      if (member is! FieldDeclaration || member.isStatic) {
        continue;
      }
      for (final VariableDeclaration variable in member.fields.variables) {
        final String field = variable.name.lexeme;
        if (field == 'key') {
          continue;
        }
        final FormalParameter? formal = constructorParams[field];
        final bool required = formal != null ? formal.isRequired : variable.initializer == null && initFieldValues[field] == null;
        params.add(
          RawMap(<String, RawValue>{
            'name': RawLiteral(field),
            'type': out.typeRef(variable.declaredFragment?.element.type, at: variable),
            if (required) 'required': const RawLiteral(true),
            if (formal?.defaultClause case final FormalParameterDefaultClause clause)
              'defaultValue': RawChild(signals.expressions.extract(clause.value, enclosing))
            // `final int base = 10;` — a field the constructor does not take: no caller can supply it, so its
            // initializer is its value. Before this it resolved to `null` (`intAdd(x, null)`).
            else if (formal == null && variable.initializer != null)
              'defaultValue': RawChild(signals.expressions.extract(variable.initializer!, enclosing))
            else if (formal == null && initFieldValues[field] != null)
              'defaultValue': RawChild(signals.expressions.extract(initFieldValues[field]!, enclosing)),
          }),
        );
        paramBindings.add(Binding(name: field, binds: Binds.parameter));
      }
    }

    // The class that actually builds. For a StatelessWidget it is the widget itself; for a
    // StatefulWidget it is the State.
    final ClassDeclaration builder = state ?? node;
    final String owner = builder.namePart.typeName.lexeme;

    // Identified *before* signal extraction (M8-H), so the exact node — not its name — can be excluded
    // from action discovery: `build` is the render tree, already extracted below by `WidgetExtractor`,
    // never an ordinary callable method regardless of whether it writes state.
    final MethodDeclaration? build = _buildMethod(builder);
    if (build == null && (node.abstractKeyword != null || node.sealedKeyword != null)) {
      // An abstract base: nothing renders it, and nothing needs a declaration for it.
      transitions.enclosingComponent = null;
      return null;
    }
    if (build == null) {
      // A widget class with no `build` — a `RenderObjectWidget`, an `InheritedWidget`, an abstract base. Other classes refer to it (its
      // symbol is a component's), so it is declared, with an opaque render that names why: the generator refuses each use explicitly
      // rather than the reference dangling (BRG1201).
      out.report(
        Codes.unknownWidget,
        'The widget `$name` has no `build` method (a custom render object or an inherited widget): it cannot be lowered, and is '
        'preserved as an opaque component.',
        node,
      );
      out.emit(
        RawNode(
          kind: 'ui.Component',
          span: out.span(node),
          symbol: symbol,
          anchorSegment: name,
          fields: <String, RawValue>{
            'name': RawLiteral(name),
            if (params.isNotEmpty) 'params': RawList(params),
            'render': RawChild(out.opaqueUi(node, 'widget without a build method')),
          },
        ),
      );
      transitions.enclosingComponent = null;
      return symbol;
    }

    final ClassState classState = signals.extract(
      builder,
      owner: owner,
      storeScope: 'component',
      enclosing: enclosing,
      renderMethod: build,
    );

    // Parameters go **inside** the class's own field bindings, so they win.
    //
    // For a StatelessWidget the two are the same fields, and signal extraction has just bound them as
    // plain fields — which shadowed the parameter bindings and turned every prop read into a
    // `bind.Expr`. wonderous produced zero `bind.Param` across 152 components before this line moved.
    //
    // Inside a State, `widget.title` reaches the widget's parameters; binding `widget` is what makes
    // that resolve rather than becoming a read of an unknown name.
    final Scope withParams = classState.scope.child(<Binding>[
      ...paramBindings,
      if (state != null) const Binding(name: 'widget', binds: Binds.parameter),
    ]);

    // `build(BuildContext context)` — and, for a ConsumerWidget, `build(context, ref)`.
    final Scope buildScope = withParams.child(<Binding>[
      for (final FormalParameter parameter
          in build.parameters?.parameters ?? const <FormalParameter>[])
        if (parameter.name != null)
          Binding(name: parameter.name!.lexeme, binds: Binds.parameter),
    ]);

    // A separate owner/ordinal pair for the render tree's own collection-for items (M9-F,
    // `Scope.forWidgetTree`'s own doc explains why this is not `Scope.forBody` reused) — numbered once,
    // over the *whole* build method body (never just `rendered`: a structured build body — a preceding
    // `final items = [...]` before the `return`, or an `if`-branching one, §"structured build-method
    // extraction" above — still has its own collection-fors extracted from `build.body`, not from a
    // single returned expression), the same "one pre-order pass, keyed by resolved Element" scheme M9-A
    // already proved collision-free for statement-level for-loops. Used for both branches below.
    final Scope renderScope = Scope.forWidgetTree(buildScope, owner: symbol, body: build.body);

    final (RawNode render, List<RawValue>? prelude) = _render(build, renderScope);

    out.emit(
      RawNode(
        kind: 'ui.Component',
        span: out.span(node),
        symbol: symbol,
        anchorSegment: name,
        fields: <String, RawValue>{
          'name': RawLiteral(name),
          if (params.isNotEmpty) 'params': RawList(params),
          if (classState.signals.isNotEmpty)
            'localSignals': RawList(classState.signals.map(RawRef.new).toList()),
          if (classState.effects.isNotEmpty) 'effects': RawList(classState.effects.map(RawRef.new).toList()),
          if (prelude != null && prelude.isNotEmpty) 'prelude': RawList(prelude),
          'render': RawChild(render),
        },
      ),
    );

    _variants(node, build: build, classScope: classState.scope, enclosing: enclosing, stateful: state != null);

    transitions.enclosingComponent = null;
    return symbol;
  }

  /// The render tree of [build] in [renderScope], and the statements it runs first (a statement-bodied build, ADR-0062).
  (RawNode, List<RawValue>?) _render(MethodDeclaration build, Scope renderScope) {
    final Expression? rendered = _returnedWidget(build.body);
    if (rendered != null) {
      return (widgets.extract(rendered, renderScope), null);
    }
    if (_preludeShape(build.body) case final _PreludeShape shape) {
      // Statements, then `return <tree>`: the statements are extracted as statements, the tree in the scope they leave.
      final ExpressionExtractor expressions = signals.expressions;
      final bool was = expressions.widgetValues;
      expressions.widgetValues = true;
      final (List<RawValue> statements, Scope after) = expressions.statements.statementsThrough(shape.before, renderScope);
      expressions.widgetValues = was;
      return (widgets.extract(shape.returned, after), statements);
    }
    return (
      _structuredBody(build.body, renderScope) ?? out.opaqueUi(build.body, 'build body with statements'),
      null,
    );
  }

  /// One component per *named or factory constructor* of a widget class (M12, ADR-0063): `AppListRow.destructive(...)` is
  /// `AppListRow_destructive`, with the constructor's own parameters. A factory's render is the widget it returns; a generative named
  /// constructor's is the class's `build`, with each field bound to a parameter, to the initializer-list value, or to its own default.
  void _variants(
    ClassDeclaration node, {
    required MethodDeclaration build,
    required Scope classScope,
    required Scope enclosing,
    required bool stateful,
  }) {
    final String className = node.namePart.typeName.lexeme;
    for (final ClassMember member in node.body.members) {
      if (member is! ConstructorDeclaration || member.name == null || (stateful && member.factoryKeyword == null)) {
        continue;
      }
      final String ctor = member.name!.lexeme;
      final String name = '${className}_$ctor';
      final String symbol = out.symbols.component(name);

      final List<RawValue> params = <RawValue>[];
      final List<Binding> paramBindings = <Binding>[];
      for (final FormalParameter parameter in member.parameters.parameters) {
        final String? paramName = parameter.name?.lexeme;
        if (paramName == null || parameter is SuperFormalParameter || paramName == 'key') {
          continue;
        }
        params.add(
          RawMap(<String, RawValue>{
            'name': RawLiteral(paramName),
            'type': out.typeRef(parameter.declaredFragment?.element.type, at: parameter),
            if (parameter.isRequired) 'required': const RawLiteral(true),
            if (parameter.defaultClause case final FormalParameterDefaultClause clause)
              'defaultValue': RawChild(signals.expressions.extract(clause.value, enclosing)),
          }),
        );
        paramBindings.add(Binding(name: paramName, binds: Binds.parameter));
      }
      final Scope ctorScope = enclosing.child(paramBindings);

      final RawNode render;
      List<RawValue>? prelude;
      if (member.factoryKeyword != null) {
        final Expression? returned = switch (member.body) {
          ExpressionFunctionBody(:final Expression expression) => expression,
          BlockFunctionBody(block: Block(statements: [ReturnStatement(:final Expression? expression)])) => expression,
          _ => null,
        };
        if (returned == null) {
          continue;
        }
        render = widgets.extract(returned, Scope.forWidgetTree(ctorScope, owner: symbol, body: member.body));
      } else {
        final List<Binding> fieldBindings = <Binding>[...paramBindings];
        final Map<String, Expression> initValues = <String, Expression>{
          for (final ConstructorInitializer i in member.initializers)
            if (i is ConstructorFieldInitializer) i.fieldName.name: i.expression,
        };
        final Set<String> viaParam = <String>{
          for (final FormalParameter p in member.parameters.parameters)
            if (p is FieldFormalParameter) p.name.lexeme,
        };
        for (final ClassMember m in node.body.members) {
          if (m is! FieldDeclaration || m.isStatic) {
            continue;
          }
          for (final VariableDeclaration v in m.fields.variables) {
            final String field = v.name.lexeme;
            if (viaParam.contains(field)) {
              fieldBindings.add(Binding(name: field, binds: Binds.parameter));
            } else if (initValues[field] case final Expression value) {
              fieldBindings.add(Binding(name: field, binds: Binds.local, inlineValue: value, inlineScope: ctorScope));
            } else if (v.initializer case final Expression value) {
              fieldBindings.add(Binding(name: field, binds: Binds.local, inlineValue: value, inlineScope: enclosing));
            }
          }
        }
        final Scope buildScope = classScope.child(<Binding>[
          ...fieldBindings,
          for (final FormalParameter p in build.parameters?.parameters ?? const <FormalParameter>[])
            if (p.name != null) Binding(name: p.name!.lexeme, binds: Binds.parameter),
        ]);
        (render, prelude) = _render(build, Scope.forWidgetTree(buildScope, owner: symbol, body: build.body));
      }
      out.emit(
        RawNode(
          kind: 'ui.Component',
          span: out.span(member),
          symbol: symbol,
          anchorSegment: name,
          fields: <String, RawValue>{
            'name': RawLiteral(name),
            if (params.isNotEmpty) 'params': RawList(params),
            if (prelude != null && prelude.isNotEmpty) 'prelude': RawList(prelude),
            'render': RawChild(render),
          },
        ),
      );
    }
  }

  /// Reports a constructor of a widget class whose effect is not "arguments become fields" (BRG1304, ADR-0053).
  ///
  /// A component receives its props by name, so an initializer list that computes a field, a `factory`, a redirecting
  /// constructor and a named constructor would all vanish from the generated component without a trace. `super(...)` and
  /// `assert(...)` initializers are not behaviour the output needs, and are not reported.
  void _refuseUnmodelledConstructor(ConstructorDeclaration constructor, {required bool stateful}) {
    final Set<String> paramNames = <String>{
      for (final FormalParameter p in constructor.parameters.parameters)
        if (p.name != null) p.name!.lexeme,
    };
    final bool redirects = constructor.initializers.any((ConstructorInitializer i) => i is RedirectingConstructorInvocation) ||
        constructor.redirectedConstructor != null;
    // An initializer-list value that reads a constructor parameter is computed per construction; only constants become defaults.
    final bool computesFromParams = constructor.initializers.any(
      (ConstructorInitializer i) =>
          constructor.name == null && i is ConstructorFieldInitializer && _mentionsAny(i.expression, paramNames),
    );
    // A named or factory constructor is its own component (`_variants`) — for a stateless widget.
    final bool variantUnsupported = constructor.name != null && (stateful && constructor.factoryKeyword == null);
    if (!redirects && !computesFromParams && !variantUnsupported) {
      return;
    }
    out.report(
      Codes.unmodelledConstructor,
      'The widget constructor `${constructor.toSource().split('{').first.trim()}` does something other than turn its '
      'arguments into fields (a redirecting constructor, an initializer-list value computed from a parameter, or a named constructor of '
      'a stateful widget), and a component receives its props by name, so it would be silently absent from the generated component.',
      constructor,
    );
  }

  static bool _mentionsAny(Expression expression, Set<String> names) {
    final _NameFinder finder = _NameFinder(names);
    expression.accept(finder);
    return finder.found;
  }

  /// A build body that is statements followed by one `return <widget>` — and that `_structuredBody` cannot hold: a statement other
  /// than a plain `final x = expr;`, or a local the build mutates (M12, ADR-0062). Null for anything else, including a body with an
  /// early return (the structured path owns those).
  _PreludeShape? _preludeShape(FunctionBody body) {
    if (body is! BlockFunctionBody) {
      return null;
    }
    final List<Statement> statements = body.block.statements;
    if (statements.length < 2 || statements.last is! ReturnStatement) {
      return null;
    }
    final Expression? returned = (statements.last as ReturnStatement).expression;
    if (returned == null) {
      return null;
    }
    final List<Statement> before = statements.sublist(0, statements.length - 1);
    // What the structured path (`ui.Cond` trees) already handles: single-variable locals with initializers, and an `if` that returns.
    // Anything else — or a local the build mutates — is a prelude; an early `return <widget>` inside it returns from the component.
    bool structured = true;
    for (final Statement statement in before) {
      final _ReturnFinder finder = _ReturnFinder();
      statement.accept(finder);
      if (statement is IfStatement && finder.found) {
        continue;
      }
      if (finder.found ||
          statement is! VariableDeclarationStatement ||
          statement.variables.variables.length != 1 ||
          statement.variables.variables.single.initializer == null) {
        structured = false;
        break;
      }
      final Element? element = statement.variables.variables.single.declaredFragment?.element;
      if (element != null && _isMutatedIn(statements, element)) {
        structured = false;
        break;
      }
    }
    return structured ? null : _PreludeShape(before, returned);
  }

  /// The `build` method, if the class has one.
  static MethodDeclaration? _buildMethod(ClassDeclaration node) {
    for (final ClassMember member in node.body.members) {
      if (member is MethodDeclaration && member.name.lexeme == 'build') {
        return member;
      }
    }
    return null;
  }

  /// The widget a `build` returns, when it returns one directly.
  ///
  /// A build with statements before the return is common and legitimate; its render tree is still the
  /// returned widget, but the statements around it have no `ui.*` home. Rather than drop them, the
  /// caller keeps the whole body opaque — visible, and fixable later.
  static Expression? _returnedWidget(FunctionBody body) => switch (body) {
    ExpressionFunctionBody() => body.expression,
    BlockFunctionBody(block: Block(statements: [ReturnStatement(:final Expression? expression)])) =>
      expression,
    _ => null,
  };

  /// Decomposes a `build`-shaped body whose statements are: zero or more `final x = expr;` locals,
  /// then a return-shaped tail (a bare `return`, an early-return `if` chain, or a terminal
  /// `if`/`else` where both branches return) — the multi-statement shapes real applications were
  /// measured to need (`docs/m8/m8a-real-application-baseline.md` §5, §15; M8-B).
  ///
  /// Everything else — a bare expression statement, a mutating statement, a loop, a `switch`, an `if`
  /// whose branch does anything but return, statements after a terminal `if`/`else` — returns `null`,
  /// unrecognised, and the caller falls back to the existing opaque body.
  ///
  /// The grammar this accepts *is* the side-effect boundary (M8-B Phase 7): nothing it admits can
  /// mutate anything outside a fresh temporary, so nothing the transform below reorders or
  /// duplicates can have an externally observable effect. It does not otherwise sniff for purity —
  /// Flutter's own contract already requires `build()` to have none.
  RawNode? _structuredBody(FunctionBody body, Scope scope) {
    if (body is! BlockFunctionBody) {
      return null;
    }
    final List<Statement> statements = body.block.statements;

    int i = 0;
    Scope withLocals = scope;
    final List<Element> declared = <Element>[];
    while (i < statements.length) {
      final Statement statement = statements[i];
      if (statement is! VariableDeclarationStatement) {
        break;
      }
      final List<VariableDeclaration> variables = statement.variables.variables;
      if (variables.length != 1) {
        // `var a = 1, b = 2;` in one statement — the schema has no multi-declaration shape for a
        // render-tree local, and no real build method needed one (M8-A's census).
        return null;
      }
      final VariableDeclaration variable = variables.single;
      final Expression? initializer = variable.initializer;
      final Element? element = variable.declaredFragment?.element;
      if (initializer == null || element == null) {
        // Nothing to substitute a bare `late Widget child;` with.
        return null;
      }
      declared.add(element);
      // A mutable object mutated by the build cannot be substituted at each read (BRG1313, M12).
      if (_isMutatedIn(statements, element)) {
        out.report(
          Codes.mutatedBuildLocal,
          'The build-method local `${variable.name.lexeme}` holds an object that the build mutates, and a build-method local is '
          'substituted at every read (ADR-0048): each read would get its own object.',
          variable,
          hint: 'Hold it in a field of the State class, or mutate it inside a callback.',
        );
        return null;
      }
      withLocals = withLocals.withBinding(
        Binding(name: variable.name.lexeme, binds: Binds.local, inlineValue: initializer),
      );
      i++;
    }

    final RawNode? tail = _tail(statements, i, withLocals);
    if (tail == null) {
      return null;
    }

    // Every declared local must be read somewhere in the method — an unused one would otherwise
    // vanish from the output along with whatever its initializer did (Phase 7: no silent effect
    // dropping). A local can be read from a later local's own initializer as well as from the tail,
    // so the whole statement list is scanned, not just the tail.
    final _UsageFinder usage = _UsageFinder();
    for (final Statement statement in statements) {
      statement.accept(usage);
    }
    if (declared.any((Element element) => !usage.elements.contains(element))) {
      return null;
    }

    return tail;
  }

  /// The render tree at [statements]\[[index]\] onward — a plain return, an early-return `if` chain,
  /// or a terminal `if`/`else` where both branches return. `null` for anything else.
  RawNode? _tail(List<Statement> statements, int index, Scope scope) {
    if (index >= statements.length) {
      return null;
    }
    final Statement statement = statements[index];

    if (statement is ReturnStatement) {
      if (index != statements.length - 1 || statement.expression == null) {
        return null;
      }
      return widgets.extract(statement.expression!, scope);
    }

    if (statement is IfStatement) {
      final Expression? thenReturn = _bareReturn(statement.thenStatement);
      if (thenReturn == null) {
        return null;
      }

      if (statement.elseStatement == null) {
        // `if (c) return A;` — the fallback is whatever comes after it.
        final RawNode? otherwise = _tail(statements, index + 1, scope);
        if (otherwise == null) {
          return null;
        }
        return _cond(statement, thenReturn, otherwise, scope, index);
      }

      // `if (c) { return A; } else { return B; }` — both branches terminal, so nothing may follow.
      if (index != statements.length - 1) {
        return null;
      }
      final Expression? elseReturn = _bareReturn(statement.elseStatement!);
      if (elseReturn == null) {
        return null;
      }
      return _cond(
        statement,
        thenReturn,
        widgets.extract(elseReturn, scope, slot: 'otherwise'),
        scope,
        index,
      );
    }

    return null;
  }

  /// `return X;`, bare or as the sole statement of a `{ return X; }` block. `null` for anything else,
  /// including a value-less `return;`.
  static Expression? _bareReturn(Statement statement) => switch (statement) {
    ReturnStatement(:final Expression? expression) => expression,
    Block(statements: [ReturnStatement(:final Expression? expression)]) => expression,
    _ => null,
  };

  RawNode _cond(
    IfStatement source,
    Expression thenExpression,
    RawNode otherwise,
    Scope scope,
    int index,
  ) => RawNode(
    kind: 'ui.Cond',
    span: out.span(source),
    anchorSegment: 'if[$index]',
    fields: <String, RawValue>{
      'test': RawChild(widgets.bindings.extract(source.expression, scope)),
      'then': RawChild(widgets.extract(thenExpression, scope, slot: 'then')),
      'otherwise': RawChild(otherwise),
    },
  );
}

/// Finds which declarations a statement tree reads, by resolved element — never by name (M8-B).
final class _UsageFinder extends RecursiveAstVisitor<void> {
  final Set<Element> elements = <Element>{};

  @override
  void visitSimpleIdentifier(SimpleIdentifier node) {
    if (node.element case final Element element) {
      elements.add(element);
    }
    super.visitSimpleIdentifier(node);
  }
}

/// Whether [statements] mutate the object [local] holds: a mutating call on a collection, any method call or property write on an
/// instance of a class with a mutable field, or an index write.
bool _isMutatedIn(List<Statement> statements, Element local) {
  final _MutationFinder finder = _MutationFinder(local);
  for (final Statement statement in statements) {
    statement.accept(finder);
  }
  return finder.mutated;
}

final class _MutationFinder extends RecursiveAstVisitor<void> {
  _MutationFinder(this.local);

  final Element local;
  bool mutated = false;

  bool _isLocal(Expression? e) => e is SimpleIdentifier && e.element == local;

  DartType? get _type {
    final Element e = local;
    return e is LocalVariableElement ? e.type : null;
  }

  bool get _isCollection {
    final DartType? type = _type;
    return type != null && (type.isDartCoreList || type.isDartCoreSet || type.isDartCoreMap);
  }

  bool get _hasMutableFields {
    final DartType? type = _type;
    final Element? owner = type is InterfaceType ? type.element : null;
    if (owner is! ClassElement || owner.library.isInSdk) {
      return false;
    }
    return owner.fields.any((FieldElement f) => !f.isStatic && !f.isFinal && f.isOriginDeclaration);
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    if (_isLocal(node.realTarget)) {
      if (_isCollection ? collectionMutators.contains(node.methodName.name) : _hasMutableFields) {
        mutated = true;
      }
    }
    super.visitMethodInvocation(node);
  }

  @override
  void visitAssignmentExpression(AssignmentExpression node) {
    final Expression lhs = node.leftHandSide;
    final bool onLocal = (lhs is PrefixedIdentifier && lhs.prefix.element == local) ||
        (lhs is PropertyAccess && _isLocal(lhs.target)) ||
        (lhs is IndexExpression && _isLocal(lhs.target));
    if (onLocal) {
      mutated = true;
    }
    super.visitAssignmentExpression(node);
  }
}

/// The statements before a `build`'s final `return`, and the returned widget.
final class _PreludeShape {
  const _PreludeShape(this.before, this.returned);

  final List<Statement> before;
  final Expression returned;
}

/// Finds a `return` inside a statement — one that is not inside a nested function expression.
final class _ReturnFinder extends RecursiveAstVisitor<void> {
  bool found = false;

  @override
  void visitReturnStatement(ReturnStatement node) {
    found = true;
  }

  @override
  void visitFunctionExpression(FunctionExpression node) {
    // A closure's own returns are its own.
  }
}

/// Whether a subtree mentions one of [names] as a simple identifier.
final class _NameFinder extends RecursiveAstVisitor<void> {
  _NameFinder(this.names);

  final Set<String> names;
  bool found = false;

  @override
  void visitSimpleIdentifier(SimpleIdentifier node) {
    if (names.contains(node.name)) {
      found = true;
    }
  }
}
