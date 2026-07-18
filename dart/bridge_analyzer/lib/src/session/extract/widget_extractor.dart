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
import 'package:analyzer/dart/ast/visitor.dart';
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
    // A rebuild-scoping wrapper is not part of the UI, and INV-22 says it must not survive. See
    // [_inlineRebuildBuilder].
    final (String, String?)? rebuild = registry.rebuildBuilderOf(name);
    if (rebuild != null) {
      final RawNode? inlined = _inlineRebuildBuilder(
        arguments: arguments,
        scope: scope,
        builderProp: rebuild.$1,
        valueProp: rebuild.$2,
        // The inlined body takes the *wrapper's* place in the tree, so it must take its anchor position
        // too. Without this two `ListenableBuilder`s in one `Column` both inlined to a `Text` and claimed
        // the anchor `…/Column/Text` — which is BRG1205, and it fired on the first run of this code. It is
        // also the semantically right answer: an override attached to that position still addresses it.
        index: index,
        slot: slot,
      );
      if (inlined != null) {
        return inlined;
      }
    }

    // A lazy builder — `ListView.builder(itemCount:, itemBuilder:)` — is a `ui.List`, when it can be
    // *proved* to be one. See [_lazyList].
    final (String, String)? lazy = registry.lazyBuilderOf(name, constructorName);
    if (lazy != null) {
      final RawNode? expanded = _lazyList(
        node,
        name: name,
        arguments: arguments,
        scope: scope,
        builderProp: lazy.$1,
        countProp: lazy.$2,
        index: index,
        slot: slot,
      );
      if (expanded != null) {
        return expanded;
      }
    }

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

    // Positional arguments are counted separately from `props`, because the index a name is keyed by is
    // the argument's position in the *call*, not its position among whatever has been extracted so far.
    // Keying by `props.length` — as this did before ADR-0023 — made `_positional0` mean "the first
    // positional argument" only when no named argument preceded it.
    int positional = 0;

    for (final Argument argument in arguments.arguments) {
      if (argument is! NamedArgument) {
        // A positional argument. The catalog names it (ADR-0023): `Image.asset`'s path is `name`,
        // `Icon`'s is `icon`. Where it does not, the old synthetic key stands — the argument is still
        // present and still correctly typed, and a generator that cannot interpret it refuses the widget
        // rather than rendering it wrong.
        if (argument is Expression) {
          final int index = positional++;
          final String label =
              registry.positionalPropOf(name, constructorName, index) ?? '_positional$index';
          props[label] = RawChild(bindings.extract(argument, scope));
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
  /// The body of a rebuild-scoping builder, extracted as UI — or `null` when it cannot be.
  ///
  /// ## Why the wrapper does not survive
  ///
  /// `ListenableBuilder`, `ValueListenableBuilder` and `Builder` exist because Flutter's `setState` rebuilds
  /// a whole `State`: a program that wants a narrower rebuild has to draw the boundary by hand. INV-22 names
  /// exactly this class of thing —
  ///
  /// > `setState`, `context.watch`, a `Consumer` wrapper, a hook's lifecycle helper — these are framework
  /// > *machinery*, not program semantics. Their meaning is already carried by UIR constructs.
  ///
  /// — and here it is carried by the signal graph. ADR-4 and ADR-20 make a signal read *be* the
  /// subscription, so the rebuild scope is computed rather than declared, and a `BuildContext` has no UIR
  /// meaning at all. Keeping the wrapper would leave every downstream pass and every generator a Flutter
  /// fact to learn to ignore.
  ///
  /// ## What binds to what
  ///
  /// The builder's parameters are `(BuildContext context, [T value,] Widget? child)`. Only `value` means
  /// anything, and it means *the listenable's current value* — so it is bound to the listenable's own
  /// binding, which for a `ValueNotifier` is a signal (the catalog lists it among its `stateHolders`).
  /// Reading `value` in the body then produces exactly the `bind.Signal` that reading the notifier would.
  ///
  /// ## When it declines
  ///
  /// - the builder is not a closure written at the call site — there is no body to inline;
  /// - the widget passes `child:`, whose whole point is a subtree the builder receives *without*
  ///   rebuilding. Inlining would drop that argument, so the wrapper stays and is refused by name instead;
  /// - the listenable is not a plain name, so there is no binding to bind `value` to.
  ///
  /// Each case falls through to ordinary element extraction, where the generator refuses it with a reason.
  RawNode? _inlineRebuildBuilder({
    required ArgumentList arguments,
    required Scope scope,
    required String builderProp,
    required String? valueProp,
    int? index,
    String? slot,
  }) {
    Expression? builder;
    Expression? listenable;
    bool hasChild = false;
    for (final Argument argument in arguments.arguments) {
      if (argument is! NamedArgument) {
        continue;
      }
      final String label = argument.name.lexeme;
      if (label == builderProp) {
        builder = argument.argumentExpression;
      } else if (valueProp != null && label == valueProp) {
        listenable = argument.argumentExpression;
      } else if (label == 'child') {
        hasChild = true;
      }
    }
    if (builder is! FunctionExpression || hasChild) {
      return null;
    }

    Scope inner = scope;
    if (valueProp != null) {
      // `(context, value, child)` — the value is the second parameter, which is Flutter's fixed signature.
      final List<FormalParameter> params =
          builder.parameters?.parameters ?? const <FormalParameter>[];
      if (params.length < 2 || listenable is! SimpleIdentifier) {
        return null;
      }
      final String? valueName = params[1].name?.lexeme;
      final Binding? source = scope.lookup(listenable.name);
      if (valueName == null || source == null) {
        return null;
      }
      // Bound to the *listenable's own binding*, symbol included. A `ValueNotifier` is a signal, so reading
      // `value` in the body yields the same `bind.Signal` that reading the notifier directly would — which
      // is the whole reason the wrapper carries no information.
      inner = scope.withBinding(
        Binding(name: valueName, binds: source.binds, symbol: source.symbol),
      );
    }

    return _widgetOfBody(builder.body, inner, index: index, slot: slot);
  }

  /// A lazy builder as a `ui.List`, or `null` when it cannot be proved to be one.
  ///
  /// ## What is proved, and why nothing less will do
  ///
  /// `ListView.builder(itemCount: n, itemBuilder: (context, i) => W)` is a for-each over a collection
  /// **only when** the builder does nothing with `i` except index one collection, and `n` is that
  /// collection's length. Then the loop visits every element of it exactly once, in order — which is what
  /// `ui.List` means. Anything else is a builder over an index range, which `ui.List` cannot express, and
  /// guessing would emit a loop over the wrong thing.
  ///
  /// So three conditions are checked, and all three must hold:
  ///
  ///   1. the builder is a closure taking `(BuildContext, int)`;
  ///   2. every use of its index parameter is `C[i]`, for **one** collection expression `C`;
  ///   3. the count is `C.length`, for the same `C`.
  ///
  /// When they do not, this returns `null` and the widget extracts as an ordinary element — whose
  /// `itemBuilder` prop is then a closure the generator refuses by name, which is the honest outcome.
  ///
  /// ## Why this is here and not in N3
  ///
  /// N3 is called `expand-builders` and its header named this exact gap. It still cannot close it: the
  /// template is a *widget subtree*, and building one from the expression the closure returns means redoing
  /// the const/signal/param classification of every prop — which needs the resolved scope, and the resolved
  /// scope exists only here. It is the same reason N8 refuses to rebuild elements from expressions
  /// (`BRG2110`). N3 keeps verifying, and reports any builder that still arrives un-expanded.
  ///
  /// M4-H is where this became possible at all: until then `C[i]` reached UIR as an opaque expression, so
  /// condition 2 could not even be tested. N3's header blamed the shape of `ListView.builder` — *"the
  /// collection is not named there — only indexed"* — when the collection was named, and extraction was
  /// discarding it.
  RawNode? _lazyList(
    Expression node, {
    required String name,
    required ArgumentList arguments,
    required Scope scope,
    required String builderProp,
    required String countProp,
    int? index,
    String? slot,
  }) {
    Expression? builderArg;
    Expression? countArg;
    for (final Argument argument in arguments.arguments) {
      if (argument is! NamedArgument) {
        continue;
      }
      final String label = argument.name.lexeme;
      if (label == builderProp) {
        builderArg = argument.argumentExpression;
      } else if (label == countProp) {
        countArg = argument.argumentExpression;
      }
    }
    if (builderArg is! FunctionExpression || countArg == null) {
      return null;
    }

    // (1) `(BuildContext context, int i)`. The index is the second parameter; Flutter's signature is fixed.
    final List<FormalParameter> params =
        builderArg.parameters?.parameters ?? const <FormalParameter>[];
    if (params.length != 2) {
      return null;
    }
    final String? indexName = params[1].name?.lexeme;
    if (indexName == null) {
      return null;
    }

    // (2) every use of the index is `C[i]`, for one C.
    final _IndexedCollections indexed = _IndexedCollections(indexName);
    builderArg.body.accept(indexed);
    if (!indexed.everyUseIsAnIndex || indexed.sources.length != 1) {
      return null;
    }
    final Expression source = indexed.sources.values.single;

    // (3) the count is `C.length`, for the same C.
    if (countArg is! PropertyAccess && countArg is! PrefixedIdentifier) {
      return null;
    }
    final String countText = countArg.toSource();
    if (countText != '${source.toSource()}.length') {
      return null;
    }

    // Proved. The item parameter is synthetic — Flutter's builder never names the item, only the index —
    // and the template keeps saying `C[i]`, which is what the author wrote and what lowers correctly with
    // the index in scope. Naming it after the widget keeps two lists in one parent from colliding.
    const String itemParam = 'item';
    final Scope inner = scope.withBinding(
      Binding(name: indexName, binds: Binds.parameter),
    ).withBinding(const Binding(name: itemParam, binds: Binds.parameter));

    return RawNode(
      kind: 'ui.List',
      span: out.span(node),
      anchorSegment: _segment(name, index, slot),
      fields: <String, RawValue>{
        'source': RawChild(bindings.extract(source, scope)),
        'itemParam': const RawLiteral(itemParam),
        'indexParam': RawLiteral(indexName),
        'template': RawChild(_widgetOfBody(builderArg.body, inner)),
      },
    );
  }

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
  RawNode _widgetOfBody(FunctionBody body, Scope scope, {int? index, String? slot}) {
    switch (body) {
      case ExpressionFunctionBody():
        return extract(body.expression, scope, index: index, slot: slot);
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
          return extract(last.expression!, scope, index: index, slot: slot);
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

/// Finds every use of a builder's index parameter, and what it indexes.
///
/// The proof obligation behind [WidgetExtractor._lazyList] condition 2: a `ListView.builder` is a for-each
/// only if its index is used *for nothing but* indexing, and indexes only one collection. A builder that
/// also writes `Text('Item \$i')`, or that indexes two lists, is a builder over a range — real, common, and
/// not a `ui.List`.
///
/// Collections are keyed by source text. That is exact rather than approximate here: two occurrences of
/// `_items[i]` in one closure are the same collection precisely when they are written the same way, and a
/// closure that indexes `a.b[i]` and `a.c[i]` yields two keys and is correctly rejected.
class _IndexedCollections extends RecursiveAstVisitor<void> {
  _IndexedCollections(this.indexName);

  /// The builder's index parameter.
  final String indexName;

  /// Collection source text → the expression, for every `C[index]` seen.
  final Map<String, Expression> sources = <String, Expression>{};

  /// Whether every reference to [indexName] so far has been as an index.
  bool everyUseIsAnIndex = true;

  @override
  void visitIndexExpression(IndexExpression node) {
    final Expression subscript = node.index;
    final Expression target = node.realTarget;
    if (subscript is SimpleIdentifier && subscript.name == indexName) {
      sources[target.toSource()] = target;
      // The receiver is still walked — `a[b[i]]` must not be mistaken for a plain indexed read — but the
      // subscript is not, because this *is* its use and counting it again would fail the check it passes.
      target.accept(this);
      return;
    }
    super.visitIndexExpression(node);
  }

  @override
  void visitSimpleIdentifier(SimpleIdentifier node) {
    if (node.name == indexName) {
      everyUseIsAnIndex = false;
    }
    super.visitSimpleIdentifier(node);
  }
}
