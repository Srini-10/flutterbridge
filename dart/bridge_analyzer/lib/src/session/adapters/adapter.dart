/// The adapter contract.
///
/// Layer: `session` (adapters).
///
/// ## The rule this exists to enforce
///
/// **No extractor may contain `if (className == 'GoRoute')`.** Package-specific knowledge lives here
/// and nowhere else (ISSUE-16). Extraction owns Dart syntax; adapters own package vocabulary; neither
/// owns application semantics.
///
/// The reason is not tidiness. Every package we support is a place the compiler could be wrong about
/// somebody's application, and there is no limit to how many packages that is — so the *set* of things
/// that can be wrong has to be enumerable, reviewable, and testable in one place. An extractor with a
/// `go_router` branch in it is an extractor that will grow a `beamer` branch, an `auto_route` branch,
/// and a `bloc` branch, until nobody can say what the compiler believes.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';

/// A package the compiler understands.
///
/// Compiled in, never loaded. No reflection, no plugin discovery, no runtime registration: the set of
/// adapters in a build is a fact about that build, visible in the source, and identical on every
/// machine. A registry that can differ between two runs is a registry that can make the compiler
/// non-deterministic, which is the one thing it may never be.
abstract interface class PackageAdapter {
  /// The adapter's name, e.g. `go_router`. Unique, and used to break ties deterministically.
  String get name;

  /// Lower runs first. Ties are broken by [name], so the order is total and never depends on the
  /// order adapters happened to be listed in.
  int get priority;

  /// The library prefixes this adapter claims, e.g. `package:go_router/`.
  Set<String> get packages;

  /// The type names it understands, e.g. `{GoRouter, GoRoute, ShellRoute}`.
  Set<String> get symbols;

  /// The annotations it understands.
  Set<String> get annotations;
}

/// An adapter that finds routes.
abstract interface class RouteAdapter implements PackageAdapter {
  /// Whether this adapter recognises the construction [node] as declaring routes.
  bool claimsRoutes(AdapterContext context, InstanceCreationExpression node);

  /// The routes [node] declares.
  ///
  /// Returns an empty list — never null — when it recognises the construction but finds no routes in
  /// it. The distinction between *not mine* and *mine, and empty* is the difference between a second
  /// adapter getting a chance and a silent hole in the route graph.
  List<RouteDeclaration> routesOf(AdapterContext context, InstanceCreationExpression node);
}

/// An adapter that recognises widgets.
///
/// ## INV-22 — no framework runtime primitive may survive extraction
///
/// **After extraction, no framework lifecycle or runtime primitive may remain in the UIR.**
///
/// `setState`, `context.watch`, a `Consumer` wrapper, a hook's lifecycle helper — these are framework
/// *machinery*, not program semantics. Their meaning is already carried by UIR constructs: `setState`'s
/// half that matters is "these signals were written", and writing a `sig.Signal` says that. The other
/// half — "mark this widget dirty" — is a Flutter implementation detail that no other target has.
///
/// A primitive left in the UIR is a Flutter fact that every downstream pass and every generator must
/// then learn to ignore. It happened once, and it cost a milestone: `setState` survived extraction, and
/// N5 — which may not know what Flutter is (ISSUE-16) — correctly refused to lift a single closure in
/// three real applications, because it saw an unresolvable free name (ISSUE-18).
///
/// Erasing them is the adapter's job, and it is the *only* place it can be done: the extractor may not
/// know the name `setState`, and neither may any normalization pass.
abstract interface class WidgetAdapter implements PackageAdapter {
  /// What this adapter knows about [type].
  WidgetRecognition recognise(AdapterContext context, DartType? type);

  /// Named parameters of [widget] that are a *single named child* rather than a prop — `Scaffold`'s
  /// `body`, `AppBar`'s `title`.
  bool isSlot(String widget, String parameter);

  /// The parameter of [widget] that holds an **ordered list** of children, if it has one.
  ///
  /// Often `children` — and **not always**. `CustomScrollView` uses `slivers`; `AppBar` uses `actions`.
  /// Extraction hardcoded the literal string `children` until M2-T10A, and every list under any other
  /// name fell through into `props`, where it was extracted as an opaque expression: the UI structure
  /// was simply gone, and no pass and no generator could see it.
  String? childrenPropOf(String widget);

  /// Instance methods that are lifecycle hooks, and the effect timing each one is.
  Map<String, String> get lifecycleMethods;

  /// Types whose *value* is state even when the field holding them is `final` — `ValueNotifier`,
  /// `TextEditingController`.
  bool isStateHolder(DartType? type);

  /// Whether a class extending [type] is a store: state that outlives any one component.
  bool isStoreBase(DartType? type);

  /// Whether [library] is the framework rather than the application.
  bool isFrameworkLibrary(String library);

  /// The widget a `State<T>` is the state *of*, or `null` if [type] is not a state class.
  ///
  /// `class _LoginScreenState extends State<LoginScreen>` → `LoginScreen`. The type argument is the
  /// link, and it is the only reliable one: the `_XState` naming convention is a convention, and real
  /// code breaks it.
  String? widgetOfState(DartType? type);

  /// The accessibility a widget's own arguments state.
  ///
  /// `Semantics(label: …)`, `Image(semanticLabel: …)`, `ExcludeSemantics()`. Losing it generates HTML
  /// that fails an audit the Flutter app passed — a regression nobody asked for and nobody can see.
  Map<String, Object?> semanticsOf(String widget, Map<String, Object?> constantArguments);

  /// The closure a **state-batching call** wraps, if [node] is one (INV-22).
  ///
  /// `setState(() { _count++; })` is Flutter's way of saying *these mutations happened, now rebuild*.
  /// Under ADR-4 the rebuild is implied by writing a signal, so the wrapper carries no meaning the UIR
  /// does not already have — and it carries one the UIR must never have: the name `setState`.
  ///
  /// Returns the inner closure, whose statements are spliced in where the call was. Returns `null` for
  /// anything else, which is almost everything.
  FunctionExpression? unwrapStateBatch(MethodInvocation node);
}

/// An adapter that recognises design tokens.
abstract interface class ThemeAdapter implements PackageAdapter {
  /// Whether [node] declares a theme this adapter understands.
  bool claimsTheme(AdapterContext context, InstanceCreationExpression node);

  /// The tokens [node] declares.
  ///
  /// **Extraction never derives a colour** (ADR-13, A2). `ColorScheme.fromSeed(seedColor: X)` yields
  /// exactly one token — the seed — and N10 derives the other 45 roles from it. Guessing them here
  /// would invent 45 colours the user never wrote, they would be subtly wrong, and every one would be
  /// indistinguishable from a value chosen deliberately.
  List<TokenDeclaration> tokensOf(AdapterContext context, InstanceCreationExpression node);
}

/// An adapter that recognises annotations.
abstract interface class AnnotationAdapter implements PackageAdapter {
  /// What this adapter knows about [annotation], or `null` if it does not know it.
  AnnotationRecognition? recognise(AdapterContext context, Annotation annotation);
}
