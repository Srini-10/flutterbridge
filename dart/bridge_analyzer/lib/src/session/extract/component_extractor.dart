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
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';
import 'package:bridge_analyzer/src/session/extract/signal_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/widget_extractor.dart';

/// Extracts components.
final class ComponentExtractor {
  /// Creates an extractor.
  const ComponentExtractor(this.out, this.widgets, this.signals, this.registry, this.context);

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

  /// Whether [node] declares a component.
  ///
  /// Asked of the registry, which asks the resolved supertypes — never the name. A class is a widget
  /// because of what it extends, and a class called `LoginButton` that extends nothing is not one.
  bool isComponent(ClassDeclaration node) => registry
      .recogniseWidget(context, node.declaredFragment?.element.thisType)
      .isComponentBase;

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

    // Parameters come from the *widget* class's final fields — which is exactly what its constructor
    // sets, and what a caller passes.
    final List<RawValue> params = <RawValue>[];
    final List<Binding> paramBindings = <Binding>[];

    for (final ClassMember member in node.body.members) {
      if (member is! FieldDeclaration || member.isStatic) {
        continue;
      }
      for (final VariableDeclaration variable in member.fields.variables) {
        final String field = variable.name.lexeme;
        if (field == 'key') {
          continue;
        }
        params.add(
          RawMap(<String, RawValue>{
            'name': RawLiteral(field),
            'type': out.typeRef(variable.declaredFragment?.element.type, at: variable),
            if (variable.initializer == null) 'required': const RawLiteral(true),
          }),
        );
        paramBindings.add(Binding(name: field, binds: Binds.parameter));
      }
    }

    // The class that actually builds. For a StatelessWidget it is the widget itself; for a
    // StatefulWidget it is the State.
    final ClassDeclaration builder = state ?? node;
    final String owner = builder.namePart.typeName.lexeme;

    final ClassState classState = signals.extract(
      builder,
      owner: owner,
      storeScope: 'component',
      enclosing: enclosing,
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

    final MethodDeclaration? build = _buildMethod(builder);
    if (build == null) {
      // A widget class with no `build` — an abstract base, or one whose build lives in a mixin. It is
      // not a component we can render, and pretending otherwise would emit a component with an
      // invented body. `ui.Component.render` is required, so there is nothing honest to emit.
      return null;
    }

    // `build(BuildContext context)` — and, for a ConsumerWidget, `build(context, ref)`.
    final Scope buildScope = withParams.child(<Binding>[
      for (final FormalParameter parameter
          in build.parameters?.parameters ?? const <FormalParameter>[])
        if (parameter.name != null)
          Binding(name: parameter.name!.lexeme, binds: Binds.parameter),
    ]);

    final Expression? rendered = _returnedWidget(build.body);
    final RawNode render = rendered == null
        ? out.opaqueUi(build.body, 'build body with statements')
        : widgets.extract(rendered, buildScope);

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
          'render': RawChild(render),
        },
      ),
    );

    return symbol;
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
    BlockFunctionBody() when body.block.statements.length == 1 =>
      (body.block.statements.single as ReturnStatement?)?.expression,
    _ => null,
  };
}
