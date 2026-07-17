/// The widget tree.
///
/// Layer: `session` (extraction).
///
/// A Dart expression that produces a `Widget` → a `ui.*` node. This is the part of the compiler that
/// makes the whole thing a *UI* compiler rather than a Dart-to-JS transpiler.
///
/// ## What it does not do
///
/// It does not normalize, and it does not map. `Container` is extracted as `ui.Element{component:
/// Container}` — not as a `<div>` with CSS, not merged with its padding, not simplified. Which CSS a
/// `Container` becomes is N-pass and generator work, and doing it here would bake one target's answer
/// into the IR every target has to share (ADR-2).
///
/// It also does not guess. A widget it has no structural rule for becomes `ui.Opaque` carrying its own
/// Dart source and a `BRG1301` — never a plausible-looking `ui.Element` with invented children. C1's
/// evidence is the reason: **not one** unknown construct in two real applications was genuinely
/// unconvertible, so an unknown widget is a gap in the catalog, not a dead end — and it must stay
/// visible until someone fills it.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/extract/annotation_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/binding_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/expression_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';

/// Extracts widget trees.
final class WidgetExtractor {
  /// Creates an extractor.
  const WidgetExtractor(
    this.out,
    this.expressions,
    this.bindings,
    this.annotations,
    this.registry,
    this.context,
  );

  /// The record factory.
  final RawNodeEmitter out;

  /// For props and callbacks.
  final ExpressionExtractor expressions;

  /// For classifying prop values.
  final BindingExtractor bindings;

  /// For the accessibility a widget states.
  final AnnotationExtractor annotations;

  /// The compiler's package knowledge. **This file has none of its own** (ISSUE-16).
  final AdapterRegistry registry;

  /// What the adapters run in.
  final AdapterContext context;

  /// Whether [type] is a widget — asked of the registry, never of the name.
  bool isWidget(DartType? type) => registry.recogniseWidget(context, type).isWidget;

  /// An anchor segment: the widget's name, plus whatever makes it unique among its siblings.
  ///
  /// A child of a `children:` list is identified by its position; a child of a named slot is
  /// identified by the slot. Two `ListenableBuilder`s in a `Scaffold`'s `body` and `bottomSheet` are
  /// two places on the screen, and an anchor that cannot tell them apart cannot address either
  /// (BRG1205 — found on compass_app).
  static String _segment(String name, int? index, [String? slot]) {
    if (slot != null) {
      return '$slot:$name';
    }
    return index == null ? name : '$name[$index]';
  }

  /// Extracts the widget [node] produces.
  RawNode extract(Expression node, Scope scope, {int? index, String? slot}) {
    switch (node) {
      case ParenthesizedExpression():
        return extract(node.expression, scope);

      // `cond ? A() : B()` — a conditional subtree, not an opaque expression. The generator emits a
      // branch; it does not evaluate a Dart ternary.
      case ConditionalExpression():
        return RawNode(
          kind: 'ui.Cond',
          span: out.span(node),
          anchorSegment: _segment('if', index, slot),
          fields: <String, RawValue>{
            'test': RawChild(bindings.extract(node.condition, scope)),
            // The two branches are two places on the screen, and an override addresses one of them.
            // Without distinct segments they claim the same anchor (BRG1205).
            'then': RawChild(extract(node.thenExpression, scope, slot: 'then')),
            'otherwise': RawChild(extract(node.elseExpression, scope, slot: 'otherwise')),
          },
        );

      case InstanceCreationExpression():
        return _element(
          node,
          name: node.constructorName.type.name.lexeme,
          constructorName: node.constructorName.name?.name,
          arguments: node.argumentList,
          scope: scope,
          index: index,
          slot: slot,
        );

      // `items.map((i) => Tile(i)).toList()` — a list, and its template. Extracting it as an opaque
      // expression would hide the one thing the generator needs: that there is a repeat here.
      case MethodInvocation() when _mapToList(node) != null:
        return _list(node, _mapToList(node)!, scope, index: index, slot: slot);

      case MethodInvocation():
        // A call that returns a widget — a `_buildHeader()` helper, or a widget-returning method.
        // Faithfully an expression that yields a subtree, and there is no `ui.*` node for that, so it
        // is opaque *at the UI level* while remaining fully modelled as an expression inside.
        return out.opaqueUi(node, 'widget returned by a call', type: node.staticType);

      case SimpleIdentifier() || PrefixedIdentifier() || PropertyAccess():
        return out.opaqueUi(node, 'widget held in a variable', type: node.staticType);

      case Expression():
        out.report(
          Codes.unknownWidget,
          'This expression produces a widget in a way extraction has no rule for. It is preserved '
          'verbatim as ui.Opaque rather than guessed at.',
          node,
        );
        return out.opaqueUi(node, 'unrecognised widget expression', type: node.staticType);
    }
  }

  // ── elements ──────────────────────────────────────────────────────────────────────────────────

  RawNode _element(
    Expression node, {
    required String name,
    required String? constructorName,
    required ArgumentList arguments,
    required Scope scope,
    int? index,
    String? slot,
  }) {
    final WidgetRecognition recognition = registry.recogniseWidget(context, node.staticType);
    if (recognition.isTextWidget) {
      return _text(node, name, arguments, scope, index: index, slot: slot);
    }
    if (recognition.isAsyncWidget) {
      return _async(node, name, arguments, scope, index: index, slot: slot);
    }

    final Map<String, RawValue> props = <String, RawValue>{};
    final Map<String, RawValue> slots = <String, RawValue>{};
    final List<RawValue> children = <RawValue>[];
    RawValue? key;

    // The parameter that holds this widget's ordered children.
    //
    // **Asked of the catalog first, and inferred from the type second.** It is *usually* `children`, and
    // the fact that it is not always was expensive: `CustomScrollView` uses `slivers` and `AppBar` uses
    // `actions`, and a hardcoded `case 'children':` sent both into `props`, where the list was extracted
    // as an opaque expression. The UI structure was gone — no pass and no generator could see those were
    // children — and it could not be recovered downstream, because rebuilding elements from expressions
    // loses the bind.Const/bind.Signal classification that only this pass, with a live scope, can make.
    //
    // The catalog covers the framework. It cannot cover the *application's own* widgets — `SeparatedRow`
    // is not in anybody's Material catalog — so for a widget the catalog has never heard of, the type
    // answers: a named parameter whose type is a **list of widgets** holds children. That is not a guess
    // about a name; it is what the element model says the parameter *is*.
    //
    // Only when there is exactly one such parameter. Two would be ambiguous, and `ui.Element` has one
    // `children` list — so rather than pick, extraction leaves them and says so.
    final String? childrenProp =
        registry.childrenPropOf(name) ?? _soleWidgetListParameter(arguments);

    for (final Argument argument in arguments.arguments) {
      if (argument is! NamedArgument) {
        // A positional argument to a widget — `Text`'s data, `Icon`'s icon. Handled by the widgets
        // that have one; for the rest it is a prop with no name, and the schema has nowhere to put it.
        if (argument is Expression) {
          props['_positional${props.length}'] = RawChild(bindings.extract(argument, scope));
        }
        continue;
      }

      final String label = argument.name.lexeme;
      final Expression value = argument.argumentExpression;

      switch (label) {
        case _ when label == childrenProp:
          children.addAll(_childList(value, scope));
        case 'key':
          key = RawChild(bindings.extract(value, scope));
        // `child` is a **slot**, not React children — a single child at a named place. The catalog says
        // so (`Center/Padding/SizedBox: slots:{child}`), and it is the single source of truth: the runtime
        // deliberately takes `child` as a prop, not `children`, and a hardcoded `case 'child'` here that
        // routed it into the `children` list emitted `<Center><X/></Center>` against a `Center` that reads
        // `props.child` — the subtree dropped, and the code did not typecheck (validation B1). So `child`
        // falls through to the slot resolution below like every other slot, named by the catalog.
        case _ when registry.isSlot(name, label) && isWidget(value.staticType):
          slots[label] = RawChild(extract(value, scope, slot: label));
        case _ when isWidget(value.staticType):
          // A widget in a parameter we have no slot name for — `separator`, `background`. It is still
          // a subtree, and it still belongs in `slots`: putting it in `props` as an expression would
          // hide a whole branch of the UI from every later pass.
          slots[label] = RawChild(extract(value, scope, slot: label));
        case _:
          props[label] = RawChild(bindings.extract(value, scope));
      }
    }

    // Accessibility the author stated explicitly. Losing it generates HTML that fails an audit the
    // Flutter app passed — a regression nobody asked for and nobody can see.
    final RawValue? semantics = annotations.semanticsOf(name, arguments);

    return RawNode(
      kind: 'ui.Element',
      span: out.span(node),
      // The anchor segment is what makes an override survive a reformat (Spec §2.4). It must be
      // unique among its siblings — two `SizedBox`es in one `Column` are two different places on the
      // screen — so a child carries its position: `SizedBox[2]`.
      anchorSegment: _segment(name, index, slot),
      fields: <String, RawValue>{
        'component': out.widgetRef(
          name,
          constructorName: constructorName,
          type: node.staticType,
        ),
        if (semantics case final RawValue value) 'semantics': value,
        if (props.isNotEmpty) 'props': RawMap(props),
        // Children keep source order. It is the order they appear on screen.
        if (children.isNotEmpty) 'children': RawList(children),
        if (slots.isNotEmpty) 'slots': RawMap(slots),
        if (key case final RawValue value) 'key': value,
      },
    );
  }

  /// The single named parameter of [arguments] whose type is a list of widgets, if there is exactly one.
  ///
  /// `null` for none — and for *several*, because `ui.Element` holds one ordered `children` list and
  /// choosing between two candidates would be a guess. The caller leaves them in props, where they are
  /// visible as expressions rather than silently merged.
  String? _soleWidgetListParameter(ArgumentList arguments) {
    String? found;

    for (final Argument argument in arguments.arguments) {
      if (argument is! NamedArgument || !_isWidgetList(argument.argumentExpression.staticType)) {
        continue;
      }
      if (found != null) {
        return null;
      }
      found = argument.name.lexeme;
    }
    return found;
  }

  /// Whether [type] is a list whose elements are widgets.
  bool _isWidgetList(DartType? type) {
    if (type is! InterfaceType || type.element.name != 'List') {
      return false;
    }
    final List<DartType> arguments = type.typeArguments;
    return arguments.length == 1 && isWidget(arguments.single);
  }

  RawNode _text(
    Expression node,
    String name,
    ArgumentList arguments,
    Scope scope, {
    int? index,
    String? slot,
  }) {
    Expression? value;
    final Map<String, RawValue> style = <String, RawValue>{};

    for (final Argument argument in arguments.arguments) {
      if (argument is NamedArgument) {
        style[argument.name.lexeme] = RawChild(
          bindings.extract(argument.argumentExpression, scope),
        );
      } else if (argument is Expression && value == null) {
        value = argument;
      }
    }

    if (value == null) {
      return out.opaqueUi(node, '$name with no value', widget: name, type: node.staticType);
    }

    return RawNode(
      kind: 'ui.Text',
      span: out.span(node),
      anchorSegment: _segment(name, index, slot),
      fields: <String, RawValue>{
        // The binding is what carries reactivity: `Text(_name)` is a signal read and must re-render;
        // `Text('Sign in')` is a constant and must not.
        'value': RawChild(bindings.extract(value, scope)),
        if (style.isNotEmpty) 'style': RawMap(style),
      },
    );
  }

  /// `FutureBuilder` / `StreamBuilder`.
  ///
  /// Partial by design, and honestly so. `ui.Async` has `loading`, `error` and `data` slots, but a
  /// Flutter builder expresses those as `if (snapshot.hasData)` *inside* one closure — recovering the
  /// three branches from the one body is a **normalization** (an N-pass over `ui.Cond`), not an
  /// extraction. So extraction records what is written: the source, the data parameter, and the body.
  RawNode _async(
    Expression node,
    String name,
    ArgumentList arguments,
    Scope scope, {
    int? index,
    String? slot,
  }) {
    Expression? source;
    FunctionExpression? builder;

    for (final Argument argument in arguments.arguments) {
      if (argument is! NamedArgument) {
        continue;
      }
      switch (argument.name.lexeme) {
        case 'future' || 'stream':
          source = argument.argumentExpression;
        case 'builder':
          final Expression value = argument.argumentExpression;
          if (value is FunctionExpression) {
            builder = value;
          }
      }
    }

    if (source == null || builder == null) {
      return out.opaqueUi(node, '$name without a source or builder', widget: name);
    }

    final List<FormalParameter> params =
        builder.parameters?.parameters ?? const <FormalParameter>[];
    final String dataParam = params.length > 1 ? (params[1].name?.lexeme ?? 'snapshot') : 'snapshot';

    final Scope inner = scope.child(<Binding>[
      for (final FormalParameter parameter in params)
        if (parameter.name != null)
          Binding(name: parameter.name!.lexeme, binds: Binds.parameter),
    ]);

    return RawNode(
      kind: 'ui.Async',
      span: out.span(node),
      anchorSegment: _segment(name, index, slot),
      fields: <String, RawValue>{
        'source': RawChild(bindings.extract(source, inner)),
        'dataParam': RawLiteral(dataParam),
        'data': RawChild(_widgetOfBody(builder.body, inner)),
      },
    );
  }

  // ── lists and conditions inside children ──────────────────────────────────────────────────────

  /// The children of a `children:` argument.
  ///
  /// A children list is where Dart's collection syntax and the UI meet, and it is the one place where
  /// `if` and `for` inside a literal *do* have UIR nodes — `ui.Cond` and `ui.List`. Everywhere else
  /// they are opaque. That asymmetry is not an inconsistency: in a widget list they are UI structure,
  /// and everywhere else they are just Dart.
  List<RawValue> _childList(Expression node, Scope scope) {
    // `children: items.map((i) => Tile(i)).toList()` — a repeat, spelled as a method chain. It is the
    // single most common way real Flutter code builds a children list, and it is a `ui.List`, not an
    // opaque blob.
    final _MapToList? mapped = _mapToList(node);
    if (mapped != null) {
      return <RawValue>[RawChild(_list(node, mapped, scope, index: 0))];
    }

    if (node is! ListLiteral) {
      // `children: someList` — a whole list from elsewhere. No `ui.*` node holds "the children are
      // whatever that is", so it is one opaque child rather than an invented list.
      return <RawValue>[RawChild(out.opaqueUi(node, 'children from an expression'))];
    }

    final List<RawValue> children = <RawValue>[];
    for (int i = 0; i < node.elements.length; i++) {
      children.add(RawChild(_childElement(node.elements[i], scope, index: i)));
    }
    return children;
  }

  RawNode _childElement(CollectionElement element, Scope scope, {int? index, String? slot}) {
    switch (element) {
      case Expression():
        return extract(element, scope, index: index, slot: slot);

      // `if (isLoggedIn) Profile()` — the same thing a ternary means, spelled the way Flutter code
      // actually spells it. C1 counted 37 of these in wonderous alone.
      case IfElement():
        final CollectionElement? otherwise = element.elseElement;
        return RawNode(
          kind: 'ui.Cond',
          span: out.span(element),
          // A condition is a place in the tree, and it needs a name of its own. Without one its
          // branches hang directly off the parent, and two `if (x) Text(…)`s in one `Column` claim the
          // same anchor (BRG1205 — found on wonderous, which has 37 collection-ifs).
          anchorSegment: _segment('if', index),
          fields: <String, RawValue>{
            'test': RawChild(bindings.extract(element.expression, scope)),
            'then': RawChild(_childElement(element.thenElement, scope, slot: 'then')),
            if (otherwise != null)
              'otherwise': RawChild(_childElement(otherwise, scope, slot: 'otherwise')),
          },
        );

      // `for (final item in items) Tile(item)`
      case ForElement():
        final ForLoopParts parts = element.forLoopParts;
        if (parts is ForEachPartsWithDeclaration) {
          final String name = parts.loopVariable.name.lexeme;
          return RawNode(
            kind: 'ui.List',
            span: out.span(element),
            anchorSegment: _segment('for', index),
            fields: <String, RawValue>{
              'source': RawChild(bindings.extract(parts.iterable, scope)),
              'itemParam': RawLiteral(name),
              'template': RawChild(
                _childElement(
                  element.body,
                  scope.withBinding(Binding(name: name, binds: Binds.parameter)),
                ),
              ),
            },
          );
        }
        return out.opaqueUi(element, 'for-element');

      // `...items.map((i) => Tile(i))`
      case SpreadElement():
        final _MapToList? mapped = _mapToList(element.expression);
        if (mapped != null) {
          return _list(element.expression, mapped, scope, index: index);
        }
        return out.opaqueUi(element.expression, 'spread');

      case CollectionElement():
        return out.opaqueUi(element, 'collection element');
    }
  }

  /// `xs.map((x) => W(x)).toList()`, or `xs.map((x) => W(x))`.
  _MapToList? _mapToList(Expression node) {
    MethodInvocation? invocation = node is MethodInvocation ? node : null;
    if (invocation == null) {
      return null;
    }

    // `.toList()` is plumbing: a list and a lazy iterable of widgets are the same children.
    if (invocation.methodName.name == 'toList') {
      final Expression? target = invocation.realTarget;
      invocation = target is MethodInvocation ? target : null;
      if (invocation == null) {
        return null;
      }
    }

    if (invocation.methodName.name != 'map') {
      return null;
    }
    final Expression? source = invocation.realTarget;
    final List<Argument> args = invocation.argumentList.arguments;
    if (source == null || args.length != 1) {
      return null;
    }
    final Argument callback = args.single;
    if (callback is! FunctionExpression) {
      return null;
    }
    final List<FormalParameter> params =
        callback.parameters?.parameters ?? const <FormalParameter>[];
    if (params.length != 1 || params.single.name == null) {
      return null;
    }
    return _MapToList(source, params.single.name!.lexeme, callback.body);
  }

  RawNode _list(Expression node, _MapToList mapped, Scope scope, {int? index, String? slot}) {
    final Scope inner = scope.withBinding(
      Binding(name: mapped.itemParam, binds: Binds.parameter),
    );
    return RawNode(
      kind: 'ui.List',
      span: out.span(node),
      anchorSegment: _segment('for', index, slot),
      fields: <String, RawValue>{
        'source': RawChild(bindings.extract(mapped.source, scope)),
        'itemParam': RawLiteral(mapped.itemParam),
        'template': RawChild(_widgetOfBody(mapped.body, inner)),
      },
    );
  }

  /// The single widget a function body returns.
  RawNode _widgetOfBody(FunctionBody body, Scope scope) {
    switch (body) {
      case ExpressionFunctionBody():
        return extract(body.expression, scope);
      case BlockFunctionBody():
        // A builder with statements in it — `final x = ...; return Column(...)`. The returned widget
        // is the subtree; the statements around it are not expressible as a `ui.*` node, so the whole
        // body stays opaque rather than silently losing them.
        final Statement last = body.block.statements.isEmpty
            ? body.block
            : body.block.statements.last;
        if (body.block.statements.length == 1 &&
            last is ReturnStatement &&
            last.expression != null) {
          return extract(last.expression!, scope);
        }
        return out.opaqueUi(body, 'builder body with statements');
      case FunctionBody():
        return out.opaqueUi(body, 'builder body');
    }
  }

}

/// The source and parameter of an `xs.map((x) => …)`.
final class _MapToList {
  const _MapToList(this.source, this.itemParam, this.body);
  final Expression source;
  final String itemParam;
  final FunctionBody body;
}
