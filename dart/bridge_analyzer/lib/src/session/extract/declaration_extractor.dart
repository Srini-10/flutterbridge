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
import 'package:analyzer/dart/element/element.dart';
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
    final String className = node.namePart.typeName.lexeme;
    final List<RawValue> fields = _fields(node, scope, owner: className);
    final List<RawValue> methods = semantic ? const <RawValue>[] : _methods(node, scope, owner: className);
    final List<RawValue>? constructibleConstructors =
        semantic ? null : _constructibleConstructors(node, owner: className);

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
          if (constructibleConstructors != null) 'constructibleConstructors': RawList(constructibleConstructors),
        },
      ),
    );
  }

  /// The constructor-keyed field mapping for a bounded, structurally-constructible class (ADR-0036,
  /// generalized to multiple constructors by ADR-0037) — present only when the class satisfies the
  /// **whole-class** prerequisite: every instance field is public, final, non-static, non-late; the class
  /// itself is public, non-generic, and has no explicit superclass/`implements`/`with`.
  ///
  /// Each of the class's own constructors is then evaluated **independently** (ADR-0037 §9): a
  /// constructor is included only when it is non-const, non-factory, does not redirect, has an empty body
  /// (`is EmptyFunctionBody`, the real AST type, never source-string trimming), an empty initializer list,
  /// and field-formal parameters that are uniformly required-positional or uniformly required-named
  /// (never mixed) and cover every instance field exactly once. A constructor failing its own eligibility
  /// is simply absent from the result — it neither disqualifies a sibling constructor nor is disqualified
  /// by one (the "safe + unsafe sibling" case, ADR-0037 §23). The implicit default constructor (no
  /// explicit constructors, no instance fields) yields one trivial unnamed/positional/empty entry.
  ///
  /// Resolved exclusively from `FieldFormalParameterElement.field` — never from parameter-name or
  /// field-name text equality (ADR-0036 §7/§24, unchanged). Absent entirely (not merely empty) when the
  /// whole-class prerequisite itself fails; the generator's own existing construction refusal (`BRG3002`)
  /// is unchanged for both cases — this function does not report a diagnostic itself.
  ///
  /// An unrelated explicit getter/method does **not** disqualify the class (ADR-0036 §25) — mirroring
  /// ADR-0035's own field-level, not whole-class, read-capability policy: this check is only about
  /// whether the class's own *fields* form a complete, unambiguous record, never about its executable
  /// members, which remain independently, unconditionally refused wherever they are read or called.
  List<RawValue>? _constructibleConstructors(ClassDeclaration node, {required String owner}) {
    if (owner.startsWith('_')) return null;
    if (node.extendsClause != null) return null;
    if (node.implementsClause != null) return null;
    if (node.withClause != null) return null;
    if (node.namePart.typeParameters != null) return null;
    if (node.abstractKeyword != null) return null;

    final List<VariableDeclaration> instanceFields = <VariableDeclaration>[
      for (final ClassMember member in node.body.members)
        if (member is FieldDeclaration && !member.isStatic)
          for (final VariableDeclaration variable in member.fields.variables) variable,
    ];
    for (final VariableDeclaration variable in instanceFields) {
      final VariableElement? element = variable.declaredFragment?.element;
      if (element is! FieldElement || !element.isFinal || element.isLate || element.isPrivate) {
        return null;
      }
    }

    final List<ConstructorDeclaration> constructors = <ConstructorDeclaration>[
      for (final ClassMember member in node.body.members)
        if (member is ConstructorDeclaration) member,
    ];

    if (constructors.isEmpty) {
      // The implicit default constructor — trivially eligible only when there is nothing to initialize.
      if (instanceFields.isNotEmpty) return null;
      return <RawValue>[
        const RawMap(<String, RawValue>{'kind': RawLiteral('positional'), 'fields': RawList(<RawValue>[])}),
      ];
    }

    final List<RawValue> eligible = <RawValue>[];
    for (final ConstructorDeclaration ctor in constructors) {
      final RawValue? entry = _constructibleConstructorEntry(
        ctor,
        owner: owner,
        instanceFieldCount: instanceFields.length,
      );
      if (entry != null) eligible.add(entry);
    }
    return eligible;
  }

  /// One eligible entry of [_constructibleConstructors], for a single constructor — or `null` if [ctor]
  /// does not, on its own, satisfy ADR-0037 §8/§10's constructor-level eligibility.
  RawValue? _constructibleConstructorEntry(
    ConstructorDeclaration ctor, {
    required String owner,
    required int instanceFieldCount,
  }) {
    if (ctor.factoryKeyword != null) return null;
    if (ctor.constKeyword != null) return null;
    if (ctor.redirectedConstructor != null) return null;
    if (ctor.body is! EmptyFunctionBody) return null;
    if (ctor.initializers.isNotEmpty) return null;

    // A constructor mixing required-positional and required-named field-formals is excluded entirely
    // (ADR-0037 §15) — narrower than Dart itself allows, kept out of the first subset deliberately.
    bool? named;
    final List<String> order = <String>[];
    final Set<Element> targeted = <Element>{};
    for (final FormalParameter param in ctor.parameters.parameters) {
      final bool isNamedParam = param.isRequiredNamed;
      if (!isNamedParam && !param.isRequiredPositional) return null;
      named ??= isNamedParam;
      if (named != isNamedParam) return null;
      if (param is! FieldFormalParameter) return null;
      final FormalParameterElement? paramElement = param.declaredFragment?.element;
      if (paramElement is! FieldFormalParameterElement) return null;
      final FieldElement? field = paramElement.field;
      if (field == null) return null;
      if (!field.isFinal || field.isStatic || field.isLate || field.isPrivate) return null;
      if (!targeted.add(field)) return null;
      final String? name = field.name;
      if (name == null) return null;
      order.add(out.symbols.variable(name, owner: owner));
    }
    if (targeted.length != instanceFieldCount) return null;

    return RawMap(<String, RawValue>{
      if (ctor.name != null) 'name': RawLiteral(ctor.name!.lexeme),
      'kind': RawLiteral(named == true ? 'named' : 'positional'),
      'fields': RawList(order.map(RawRef.new).toList()),
    });
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

  /// [owner] anchors every field's own symbol to its declaring class (ADR-0032) — the fix for the
  /// cross-class collision two structurally-identical fields (same name, type, no initializer) in
  /// unrelated classes would otherwise produce: `logic.FieldDecl` carries no `symbol:` of its own
  /// before this, so the canonical builder falls back to content-addressing it (`IdAllocator.forContent`)
  /// exactly like an expression, and two fields with identical content hash to the same id.
  List<RawValue> _fields(ClassDeclaration node, Scope scope, {required String owner}) => <RawValue>[
    for (final ClassMember member in node.body.members)
      if (member is FieldDeclaration)
        for (final VariableDeclaration variable in member.fields.variables)
          RawChild(
            RawNode(
              kind: 'logic.FieldDecl',
              span: out.span(variable),
              symbol: out.symbols.variable(variable.name.lexeme, owner: owner),
              fields: <String, RawValue>{
                'name': RawLiteral(variable.name.lexeme),
                'type': out.typeRef(variable.declaredFragment?.element.type, at: variable),
                if (variable.initializer != null)
                  'initializer': RawChild(expressions.extract(variable.initializer!, scope)),
                if (member.fields.isFinal || member.fields.isConst)
                  'isFinal': const RawLiteral(true),
                if (member.isStatic) 'isStatic': const RawLiteral(true),
                // ADR-0035: the one field-eligibility fact `isFinal`/`isStatic` cannot express — a
                // `late final` field carries its own runtime initialization/error semantics a bounded,
                // side-effect-free field-shape read must not misrepresent.
                if (member.fields.isLate) 'isLate': const RawLiteral(true),
              },
            ),
          ),
  ];

  /// [owner] anchors every method/getter/setter's own symbol to its declaring class (ADR-0032) — the
  /// identical fix [_fields] applies, for the identical reason: M9-I's own real probe found two
  /// unrelated classes' textually-identical `int get value => 1;` getters colliding on one NodeId
  /// before this (`8b16269762a3b7ef` for both), because `logic.FunctionDecl` embedded here carried no
  /// `symbol:` either. Only ever called for a **plain** class (`_class`'s own `semantic` guard) — a
  /// component's `build()`/a store's mutators already have their own, separate, correct identity
  /// (`ui.Component.render`/`sig.Action`) and are never re-extracted here.
  ///
  /// Each method body gets its **own** child scope (ADR-0033), keyed on its own symbol as `owner` —
  /// mirroring [_function] exactly. Before this, every method body was extracted against the *class's*
  /// own enclosing scope directly, so a local declared inside a method never got its own ADR-28 target
  /// (a real, reproduced bug this milestone found: `final count = 10; return count;` inside a method
  /// extracted the read as a bare, untargeted `logic.Ref`, structurally identical to an unresolvable
  /// identifier, even though the identical shape at the top level already correctly targeted its own
  /// `logic.VarDecl`). Fixing scope construction is also what makes instance-member targeting sound: a
  /// local/parameter that shadows a field's own name now resolves to its *own* declaration first (Dart's
  /// own analyzer resolution — never a name-based guess), so `_instanceMemberTarget` correctly never
  /// fires for a shadowed read.
  List<RawValue> _methods(ClassDeclaration node, Scope scope, {required String owner}) {
    final List<RawValue> methods = <RawValue>[];
    for (final ClassMember member in node.body.members) {
      if (member is! MethodDeclaration) {
        continue;
      }
      // A getter and its own setter share one Dart name (`value`/`value`) but are two distinct
      // declarations — the `=` suffix on a setter's own symbol (mirroring Dart's own convention for
      // referring to one, `Type#value=`) is what keeps the pair from colliding into one `BRG1202` the
      // moment a class declares both, which real Dart source commonly does.
      final String symbol = out.symbols.function(
        member.isSetter ? '${member.name.lexeme}=' : member.name.lexeme,
        owner: owner,
      );
      final Scope inner = Scope.forBody(scope, owner: symbol, body: member.body).child(<Binding>[
        for (final FormalParameter parameter in member.parameters?.parameters ?? const <FormalParameter>[])
          if (parameter.name != null) Binding(name: parameter.name!.lexeme, binds: Binds.parameter),
      ]);
      methods.add(
        RawChild(
          RawNode(
            kind: 'logic.FunctionDecl',
            span: out.span(member),
            symbol: symbol,
            fields: <String, RawValue>{
              'name': RawLiteral(member.name.lexeme),
              'returnType': out.typeRef(
                member.declaredFragment?.element.returnType ?? member.returnType?.type,
                at: member,
              ),
              'params': RawList(_params(member.parameters, inner)),
              'body': RawList(expressions.bodyOf(member.body, inner)),
              if (member.body.isAsynchronous) 'isAsync': const RawLiteral(true),
              if (member.isStatic) 'isStatic': const RawLiteral(true),
              if (member.isGetter) 'isGetter': const RawLiteral(true),
            },
          ),
        ),
      );
    }
    return methods;
  }

  void _function(FunctionDeclaration node, Scope scope) {
    final FunctionExpression function = node.functionExpression;
    // The same symbol the node itself is emitted under (below), so a local declared in this body and
    // `Scope.forBody`'s owner agree by construction (ADR-28).
    final String symbol = out.symbols.function(node.name.lexeme);
    final Scope inner = Scope.forBody(scope, owner: symbol, body: function.body).child(<Binding>[
      for (final FormalParameter parameter
          in function.parameters?.parameters ?? const <FormalParameter>[])
        if (parameter.name != null)
          Binding(name: parameter.name!.lexeme, binds: Binds.parameter),
    ]);

    out.emit(
      RawNode(
        kind: 'logic.FunctionDecl',
        span: out.span(node),
        symbol: symbol,
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
