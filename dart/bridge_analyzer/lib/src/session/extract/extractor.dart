/// The extractor.
///
/// Layer: `session` (extraction) — inside the analyzer quarantine (ADR-14).
///
/// One resolved unit in, a list of `RawNode` out. It owns no state between files, holds no globals
/// (ADR-15), and constructs nothing itself: every record is built by the one emitter, and every
/// concern belongs to one extractor.
///
///     ResolvedUnit
///           │
///           ▼
///     DeclarationExtractor ──▶ ComponentExtractor ──▶ WidgetExtractor ──▶ BindingExtractor
///           │                        │                                          │
///           │                        └──▶ SignalExtractor                       │
///           ├──▶ RouteExtractor                                                 ▼
///           └──▶ TokenExtractor                        ExpressionExtractor ◀──▶ StatementExtractor
///                                                                  │
///                                                                  ▼
///                                                            RawNodeEmitter
///
/// ## Why extraction lives in `session`
///
/// ADR-14 quarantines `package:analyzer` to the `session` layer, and an extractor is nothing *but*
/// analyzer AST walking — so it is inside the quarantine, not next to it. The alternative, a new
/// top-level `extract` layer, would have required widening the rule that says only one directory
/// touches the analyzer API. The rule is there because analyzer 14 redesigned its AST under us; the
/// next redesign should still land in one place.
///
/// ## One walk
///
/// Each unit is visited **once**. The declaration extractor descends; routes and tokens are collected
/// on the same pass by a visitor that looks at constructions. Nothing walks the tree twice, and nothing
/// is quadratic: a widget tree of depth *d* and size *n* is visited in O(n).
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/extract/annotation_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/binding_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/component_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/declaration_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/expression_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/route_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';
import 'package:bridge_analyzer/src/session/extract/signal_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/statement_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/token_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/transition_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/widget_extractor.dart';

/// Extracts one resolved compilation unit.
final class Extractor {
  /// Creates an extractor for the file at project-relative [path].
  factory Extractor({
    required String path,
    required String packageName,
    required CompilationUnit unit,
    required DiagnosticSink diagnostics,
    AdapterRegistry? registry,
  }) {
    // The compiler's entire package knowledge, in one object. An extractor that wanted to know whether
    // something was a `GoRoute` would have to go through here — and there is nowhere else to ask.
    final AdapterRegistry adapters = registry ?? AdapterRegistry.production();
    final AdapterContext context = AdapterContext(
      packageName: packageName,
      path: path,
      unit: unit,
    );

    final RawNodeEmitter out = RawNodeEmitter(
      path: path,
      packageName: packageName,
      lineInfo: unit.lineInfo,
      diagnostics: diagnostics,
      registry: adapters,
    );

    final ExpressionExtractor expressions = ExpressionExtractor(out, adapters);
    // Expressions and statements are mutually recursive — a lambda body holds statements, a statement
    // holds expressions — so one of them must be wired after construction. The alternative is a single
    // class that does both, which is the God extractor this design exists to avoid.
    final StatementExtractor statements = StatementExtractor(out, expressions, adapters);
    expressions.statements = statements;

    final BindingExtractor bindings = BindingExtractor(out, expressions);

    // A navigation is a method invocation, so the transition extractor hangs off the expression
    // extractor rather than the standalone route/token walk: it needs the scope a navigation's
    // arguments bind against, and that exists only on the scoped walk.
    final TransitionExtractor transitions = TransitionExtractor(out, adapters, context, bindings);
    expressions.transitions = transitions.maybeExtract;

    final AnnotationExtractor annotations = AnnotationExtractor(adapters, context);
    final WidgetExtractor widgets = WidgetExtractor(
      out,
      expressions,
      bindings,
      annotations,
      adapters,
      context,
    );
    final SignalExtractor signals = SignalExtractor(out, expressions, adapters);
    final ComponentExtractor components = ComponentExtractor(
      out,
      widgets,
      signals,
      adapters,
      context,
      transitions,
    );

    // Wired after construction, like the expression/statement pair above and for the same reason: the
    // expression extractor hoists a literal colour into a token (INV-20, M4-E) and the token extractor emits
    // it, so each needs the other and neither can be built first.
    final TokenExtractor tokens = TokenExtractor(out, adapters, context);
    expressions.hoistColour = tokens.hoistColour;

    return Extractor._(
      out: out,
      unit: unit,
      context: context,
      components: components,
      declarations: DeclarationExtractor(out, expressions, components, signals),
      routes: RouteExtractor(out, adapters, context),
      tokens: tokens,
    );
  }

  Extractor._({
    required this.out,
    required this.unit,
    required this.context,
    required this.components,
    required this.declarations,
    required this.routes,
    required this.tokens,
  });

  /// The record factory.
  final RawNodeEmitter out;

  /// The unit being extracted.
  final CompilationUnit unit;

  /// What the adapters run in — and where their findings land.
  final AdapterContext context;

  /// Components, and the State classes they pair with.
  final ComponentExtractor components;

  /// Top-level declarations.
  final DeclarationExtractor declarations;

  /// Routes.
  final RouteExtractor routes;

  /// Design tokens.
  final TokenExtractor tokens;

  /// Extracts the unit, and returns its records.
  List<RawNode> extract() {
    final Scope scope = _topLevelScope();

    // A StatefulWidget is two classes that are one component. Pair them before extracting, so the
    // component extractor sees both halves at once — and so the State class is not also extracted as a
    // component in its own right, which would emit two components for one screen.
    final Map<String, ClassDeclaration> states = <String, ClassDeclaration>{};
    for (final CompilationUnitMember member in unit.declarations) {
      if (member is ClassDeclaration) {
        final String? widget = components.stateOf(member);
        if (widget != null) {
          states[widget] = member;
        }
      }
    }

    for (final CompilationUnitMember member in unit.declarations) {
      // The State half is extracted *through* its widget, never on its own.
      if (member is ClassDeclaration && components.stateOf(member) != null) {
        continue;
      }
      declarations.extract(
        member,
        scope,
        state: member is ClassDeclaration ? states[member.namePart.typeName.lexeme] : null,
      );
    }

    // Routes and tokens are declared *inside* expressions — `MaterialApp(routes: …)` sits in a build
    // method, and a `ColorScheme` in a theme. They are collected on the same walk rather than a second
    // one: two passes over a large application's AST is a cost with no benefit.
    unit.accept(_ConstructionVisitor(routes, tokens));

    // Tokens are merged, not emitted on sight: `theme:` and `darkTheme:` state the same token twice,
    // and it is one node with two values.
    tokens.flush();

    // What the adapters could not do. Reported here, in the extractor's voice, so that two adapters
    // cannot describe the same problem two different ways.
    for (final AdapterFinding finding in context.findings) {
      out.report(finding.code, finding.message, finding.at);
    }

    return out.records;
  }

  /// The names a file's own top level puts in scope.
  ///
  /// Only this file's declarations. A name imported from another file resolves to a symbol *that
  /// file* owns, and the builder links the two by symbol — which is the whole reason extraction never
  /// allocates ids (M1-T3).
  Scope _topLevelScope() {
    final List<Binding> bindings = <Binding>[];

    for (final CompilationUnitMember member in unit.declarations) {
      switch (member) {
        case ClassDeclaration():
          bindings.add(
            Binding(
              name: member.namePart.typeName.lexeme,
              binds: Binds.topLevel,
              symbol: out.symbols.type(member.namePart.typeName.lexeme),
            ),
          );
        case EnumDeclaration():
          bindings.add(
            Binding(
              name: member.namePart.typeName.lexeme,
              binds: Binds.topLevel,
              symbol: out.symbols.type(member.namePart.typeName.lexeme),
            ),
          );
        case FunctionDeclaration():
          bindings.add(
            Binding(
              name: member.name.lexeme,
              binds: Binds.topLevel,
              symbol: out.symbols.function(member.name.lexeme),
            ),
          );
        case TopLevelVariableDeclaration():
          for (final VariableDeclaration variable in member.variables.variables) {
            bindings.add(
              Binding(
                name: variable.name.lexeme,
                binds: Binds.topLevel,
                symbol: out.symbols.variable(variable.name.lexeme),
              ),
            );
          }
        case CompilationUnitMember():
          break;
      }
    }

    return Scope.root().child(bindings);
  }
}

/// Finds the constructions that declare routes and tokens, wherever in the file they are.
///
/// Routes and tokens are declared *inside* expressions — a `GoRouter` sits in a top-level variable, a
/// `ColorScheme` inside a `ThemeData` inside a `MaterialApp` inside a `build`. They are collected on
/// the same walk as everything else rather than a second one: two passes over a large application's
/// AST is a cost with no benefit.
final class _ConstructionVisitor extends RecursiveAstVisitor<void> {
  _ConstructionVisitor(this._routes, this._tokens);

  final RouteExtractor _routes;
  final TokenExtractor _tokens;

  @override
  void visitInstanceCreationExpression(InstanceCreationExpression node) {
    _routes.extract(node);
    _tokens.extract(node);
    super.visitInstanceCreationExpression(node);
  }
}
