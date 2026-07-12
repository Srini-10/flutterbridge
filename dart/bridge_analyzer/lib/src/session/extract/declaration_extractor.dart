/// Declarations.
///
/// Layer: `session` (extraction).
///
/// The top level of a file: what it declares, and therefore what the rest of the program can refer to.
///
/// A class is not one thing. Depending on what it extends it is a **component**, a **store**, or plain
/// data — and the decision is made from the resolved supertypes, never from the name. Whichever it is,
/// the class itself is *also* still a `logic.ClassDecl`: a `LoginScreen` is a `ui.Component` **and** a
/// Dart class, and code elsewhere refers to the class.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/extract/component_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/expression_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';
import 'package:bridge_analyzer/src/session/extract/signal_extractor.dart';

/// Extracts top-level declarations.
final class DeclarationExtractor {
  /// Creates an extractor.
  const DeclarationExtractor(this.out, this.expressions, this.components, this.signals);

  /// The record factory.
  final RawNodeEmitter out;

  /// For initializers and bodies.
  final ExpressionExtractor expressions;

  /// For widget classes.
  final ComponentExtractor components;

  /// For stores.
  final SignalExtractor signals;

  /// Extracts [node], the `State` half of a stateful pair being supplied as [state] when there is one.
  void extract(CompilationUnitMember node, Scope scope, {ClassDeclaration? state}) {
    switch (node) {
      case ClassDeclaration():
        _class(node, scope, state: state);

      case EnumDeclaration():
        out.emit(
          RawNode(
            kind: 'logic.EnumDecl',
            span: out.span(node),
            symbol: out.symbols.type(node.namePart.typeName.lexeme),
            fields: <String, RawValue>{
              'name': RawLiteral(node.namePart.typeName.lexeme),
              'values': RawList(<RawValue>[
                for (final EnumConstantDeclaration constant in node.body.constants)
                  RawLiteral(constant.name.lexeme),
              ]),
            },
          ),
        );

      case FunctionDeclaration():
        _function(node, scope);

      case GenericTypeAlias():
        out.emit(
          RawNode(
            kind: 'logic.TypeAliasDecl',
            span: out.span(node),
            symbol: out.symbols.type(node.name.lexeme),
            fields: <String, RawValue>{
              'name': RawLiteral(node.name.lexeme),
              'aliased': out.typeRef(node.type.type, at: node),
            },
          ),
        );

      case TopLevelVariableDeclaration():
        for (final VariableDeclaration variable in node.variables.variables) {
          out.emit(
            RawNode(
              kind: 'logic.FieldDecl',
              span: out.span(variable),
              symbol: out.symbols.variable(variable.name.lexeme),
              fields: <String, RawValue>{
                'name': RawLiteral(variable.name.lexeme),
                'type': out.typeRef(variable.declaredFragment?.element.type, at: variable),
                if (variable.initializer != null)
                  'initializer': RawChild(expressions.extract(variable.initializer!, scope)),
                if (node.variables.isFinal || node.variables.isConst)
                  'isFinal': const RawLiteral(true),
                'isStatic': const RawLiteral(true),
              },
            ),
          );
        }

      // A mixin or an extension. The `Decl` union gained an opaque variant in v2.2 (§A11) precisely
      // so that these are *preserved* rather than silently discarded (INV-4). compass_app declares 11
      // mixins; before the amendment, all 11 would have vanished without a trace.
      case MixinDeclaration() || ExtensionDeclaration() || ExtensionTypeDeclaration():
        out.emit(out.opaqueDecl(node, _describe(node)));

      case CompilationUnitMember():
        out.emit(out.opaqueDecl(node, 'declaration'));
    }
  }

  void _class(ClassDeclaration node, Scope scope, {ClassDeclaration? state}) {
    // A widget. Emitted as a component *in addition to* the class: the class is what Dart code refers
    // to, and the component is what the generator emits.
    final bool isComponent = components.isComponent(node);
    final bool isStore = signals.isStore(node);

    if (isComponent) {
      components.extract(node, state: state, enclosing: scope);
    } else if (isStore) {
      _store(node, scope);
    }

    // A component's methods are already extracted — semantically. `build` *is* `ui.Component.render`,
    // and a store's mutators *are* its `sig.Action`s. Extracting them again as `logic.FunctionDecl`
    // would walk every widget tree twice (once as UI, once as plain Dart), cost a second full pass,
    // and produce a pile of "collection-if has no representation" warnings from `children:` lists that
    // are perfectly representable — as `ui.Cond`. The Dart-level view of the class stays; its bodies
    // live where they mean something.
    final bool semantic = isComponent || isStore;

    // Computed **once**. Calling these inside the `if (…isNotEmpty)` guard *and* again in the value
    // extracted every field and body twice — doubling the work, and emitting every diagnostic twice.
    final List<RawValue> fields = _fields(node, scope);
    final List<RawValue> methods = semantic ? const <RawValue>[] : _methods(node, scope);

    out.emit(
      RawNode(
        kind: 'logic.ClassDecl',
        span: out.span(node),
        symbol: out.symbols.type(node.namePart.typeName.lexeme),
        // No anchor. An anchor is *occurrence identity* — a place in the rendered UI that an override
        // addresses — and the `ui.Component` built from this class already claims that place. Two
        // nodes cannot occupy one (BRG1205), and a Dart class is not somewhere on the screen.
        fields: <String, RawValue>{
          'name': RawLiteral(node.namePart.typeName.lexeme),
          if (node.extendsClause != null)
            'superclass': out.typeRef(node.extendsClause!.superclass.type, at: node),
          if (fields.isNotEmpty) 'fields': RawList(fields),
          if (methods.isNotEmpty) 'methods': RawList(methods),
        },
      ),
    );
  }

  /// A `ChangeNotifier` and its kin: state that outlives any one component.
  void _store(ClassDeclaration node, Scope scope) {
    final String name = node.namePart.typeName.lexeme;
    final ClassState state = signals.extract(
      node,
      owner: name,
      // The whole point of a store: `store` scope, not `component`. A signal in a store survives a
      // route change, which is exactly what N11 promotes component signals *into*.
      storeScope: 'store',
      enclosing: scope,
    );

    out.emit(
      RawNode(
        kind: 'app.Store',
        span: out.span(node),
        symbol: out.symbols.store(name),
        fields: <String, RawValue>{
          'name': RawLiteral(name),
          // `declared`, never `promoted`: promotion is N11's word, and a store the user wrote is not a
          // store the compiler synthesized. Conflating them would make the two indistinguishable in
          // the output, and N11's own diagnostics meaningless.
          'origin': const RawLiteral('declared'),
          if (state.signals.isNotEmpty)
            'signals': RawList(state.signals.map(RawRef.new).toList()),
          if (state.derived.isNotEmpty)
            'derived': RawList(state.derived.map(RawRef.new).toList()),
          if (state.actions.isNotEmpty)
            'actions': RawList(state.actions.map(RawRef.new).toList()),
        },
      ),
    );
  }

  List<RawValue> _fields(ClassDeclaration node, Scope scope) => <RawValue>[
    for (final ClassMember member in node.body.members)
      if (member is FieldDeclaration)
        for (final VariableDeclaration variable in member.fields.variables)
          RawChild(
            RawNode(
              kind: 'logic.FieldDecl',
              span: out.span(variable),
              fields: <String, RawValue>{
                'name': RawLiteral(variable.name.lexeme),
                'type': out.typeRef(variable.declaredFragment?.element.type, at: variable),
                if (variable.initializer != null)
                  'initializer': RawChild(expressions.extract(variable.initializer!, scope)),
                if (member.fields.isFinal || member.fields.isConst)
                  'isFinal': const RawLiteral(true),
                if (member.isStatic) 'isStatic': const RawLiteral(true),
              },
            ),
          ),
  ];

  List<RawValue> _methods(ClassDeclaration node, Scope scope) => <RawValue>[
    for (final ClassMember member in node.body.members)
      if (member is MethodDeclaration)
        RawChild(
          RawNode(
            kind: 'logic.FunctionDecl',
            span: out.span(member),
            fields: <String, RawValue>{
              'name': RawLiteral(member.name.lexeme),
              'returnType': out.typeRef(
                member.declaredFragment?.element.returnType ?? member.returnType?.type,
                at: member,
              ),
              'params': RawList(_params(member.parameters, scope)),
              'body': RawList(expressions.bodyOf(member.body, scope)),
              if (member.body.isAsynchronous) 'isAsync': const RawLiteral(true),
              if (member.isStatic) 'isStatic': const RawLiteral(true),
            },
          ),
        ),
  ];

  void _function(FunctionDeclaration node, Scope scope) {
    final FunctionExpression function = node.functionExpression;
    final Scope inner = scope.child(<Binding>[
      for (final FormalParameter parameter
          in function.parameters?.parameters ?? const <FormalParameter>[])
        if (parameter.name != null)
          Binding(name: parameter.name!.lexeme, binds: Binds.parameter),
    ]);

    out.emit(
      RawNode(
        kind: 'logic.FunctionDecl',
        span: out.span(node),
        symbol: out.symbols.function(node.name.lexeme),
        fields: <String, RawValue>{
          'name': RawLiteral(node.name.lexeme),
          'returnType': out.typeRef(
            node.declaredFragment?.element.returnType ?? node.returnType?.type,
            at: node,
          ),
          'params': RawList(_params(function.parameters, inner)),
          'body': RawList(expressions.bodyOf(function.body, inner)),
          if (function.body.isAsynchronous) 'isAsync': const RawLiteral(true),
        },
      ),
    );
  }

  List<RawValue> _params(FormalParameterList? list, Scope scope) => <RawValue>[
    for (final FormalParameter parameter in list?.parameters ?? const <FormalParameter>[])
      RawMap(<String, RawValue>{
        'name': RawLiteral(parameter.name?.lexeme ?? '_'),
        'type': out.typeRef(parameter.declaredFragment?.element.type, at: parameter),
        if (parameter.isNamed) 'named': const RawLiteral(true),
        if (parameter.isRequired) 'required': const RawLiteral(true),
      }),
  ];

  static String _describe(CompilationUnitMember node) => switch (node) {
    MixinDeclaration() => 'mixin',
    ExtensionDeclaration() => 'extension',
    ExtensionTypeDeclaration() => 'extension type',
    _ => 'declaration',
  };
}
