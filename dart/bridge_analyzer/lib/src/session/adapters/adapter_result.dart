/// What an adapter hands back.
///
/// Layer: `session` (adapters).
///
/// **Canonical extraction data. Never UIR, never builder objects.** An adapter knows what `GoRoute`
/// means; it does not know what a `NodeId` is, how children are ordered, or what makes a graph valid.
/// If an adapter could return UIR, every package we ever support would be a place the compiler's
/// invariants could be broken from — and there is no limit to how many packages that is.
///
/// So the boundary is drawn here, deliberately narrow: an adapter answers questions *about Dart code*,
/// in the vocabulary of the framework it understands, and extraction turns those answers into records.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:meta/meta.dart';

/// A navigation an adapter recognised at a call site.
///
/// **The adapter states intent; it does not resolve it.** It says "this call goes to the path
/// `/wonder/3`" or "this call renders *that* expression" — it never mints a `NodeId`, because ids are
/// the builder's business and a path only becomes a route by matching it against the routes the
/// program actually declares.
///
/// Exactly one of [path] and [widget] is non-null, mirroring the destination rule the UIR carries
/// (Spec v2.4 §A17): a navigation either names a route that exists, or constructs its destination
/// inline — and the second has no path, and none is invented for it.
@immutable
final class TransitionDeclaration {
  /// A navigation to a **declared route**, named by the path it asks for — `context.go('/wonder/3')`.
  const TransitionDeclaration.toPath({
    required String this.path,
    required this.at,
    this.arguments = const <TransitionArgument>[],
  }) : widget = null;

  /// A navigation whose destination is **constructed inline** —
  /// `Navigator.push(context, MaterialPageRoute(builder: (_) => HomeScreen(id: 3)))`.
  ///
  /// [widget] is the expression that builds the destination (`HomeScreen(id: 3)`). It has no path, and
  /// the adapter does not invent one: which URL such a push *becomes* on a path-based target is a
  /// legalization decision, made in the layer that knows the target (§A17.6).
  const TransitionDeclaration.toWidget({
    required Expression this.widget,
    required this.at,
    this.arguments = const <TransitionArgument>[],
  }) : path = null;

  /// The path the navigation asks for, when it names a route. Null when [widget] is set.
  final String? path;

  /// The expression constructing the destination, when it is inline. Null when [path] is set.
  final Expression? widget;

  /// Where the navigation happens, for spans and diagnostics.
  final AstNode at;

  /// The arguments carried across the boundary, in source order.
  final List<TransitionArgument> arguments;
}

/// One argument a navigation carries to its destination.
///
/// The *value* is left as an [Expression]: turning it into a binding needs the resolved scope, which
/// is the extractor's, not the adapter's.
@immutable
final class TransitionArgument {
  /// Creates an argument.
  const TransitionArgument({required this.name, required this.value});

  /// The parameter name on the destination.
  final String name;

  /// The value passed, at the call site.
  final Expression value;
}

/// A route an adapter found.
///
/// The **component is an expression**, not a name and not a symbol. Resolving an expression to the
/// component it constructs means knowing which file declares it, which is extraction's job — and it is
/// exactly the sort of thing an adapter would get subtly wrong (M1-T8 did, once: a route in `main.dart`
/// naming a component that `login_screen.dart` declares).
@immutable
final class RouteDeclaration {
  /// Creates a route.
  const RouteDeclaration({
    required this.path,
    required this.at,
    this.component,
    this.children = const <RouteDeclaration>[],
    this.hasRedirect = false,
  });

  /// The route's path, **as the router resolves it** — a nested route carries its parent's prefix.
  ///
  /// Emitting `/details` for a route the application serves at `/wonder/details` would produce a route
  /// graph that does not match the application's own URLs, which is worse than no route graph: N11
  /// would promote state across a boundary that is not where it thinks it is.
  final String path;

  /// The expression that produces the page.
  final Expression? component;

  /// Where the route was declared, for spans and diagnostics.
  final AstNode at;

  /// Nested routes, already carrying the joined path.
  final List<RouteDeclaration> children;

  /// Whether the route declares a redirect.
  ///
  /// Recorded but not interpreted. A redirect is a guard, and guards are N-pass territory.
  final bool hasRedirect;
}

/// What an adapter knows about a widget class.
///
/// **Recognition only.** No transformation, no rewriting, no mapping to a target. The adapter says
/// *this is a widget, and this is what kind of thing it is*; what the compiler does about that is not
/// the adapter's business.
@immutable
final class WidgetRecognition {
  /// Creates a recognition.
  const WidgetRecognition({
    required this.isWidget,
    this.isTextWidget = false,
    this.isAsyncWidget = false,
    this.isComponentBase = false,
    this.isStateBase = false,
  });

  /// This type is a widget.
  final bool isWidget;

  /// Its whole purpose is a single text value (`Text`, `SelectableText`).
  final bool isTextWidget;

  /// It renders one of several things depending on an asynchronous value.
  final bool isAsyncWidget;

  /// A class extending it declares a component (`StatelessWidget`, `ConsumerWidget`, …).
  final bool isComponentBase;

  /// A class extending it is the `State` half of a stateful pair.
  final bool isStateBase;

  /// Nothing recognised.
  static const WidgetRecognition none = WidgetRecognition(isWidget: false);
}

/// A design token an adapter found.
@immutable
final class TokenDeclaration {
  /// Creates a token.
  const TokenDeclaration({
    required this.group,
    required this.name,
    required this.value,
    required this.at,
    required this.isDark,
    this.role,
  });

  /// The token group — `color`, `typography`, `space`, …
  final String group;

  /// The token's name.
  final String name;

  /// Its value, already JSON-representable.
  final Object value;

  /// Where it was declared.
  final AstNode at;

  /// Whether this is the dark value of the token rather than the light one.
  ///
  /// A Flutter app states the same token twice — in `theme:` and in `darkTheme:` — and it is **one**
  /// node with two values. Emitting on sight would declare `color.primary` twice with different
  /// content, which is a duplicate symbol (BRG1202) and rightly fatal.
  final bool isDark;

  /// The Material role, when the declaration names one.
  final String? role;
}

/// What an adapter knows about an annotation.
@immutable
final class AnnotationRecognition {
  /// Creates a recognition.
  const AnnotationRecognition({
    required this.name,
    this.isCodeGenerated = false,
    this.isDeprecated = false,
    this.isImmutable = false,
  });

  /// The annotation's name, as written.
  final String name;

  /// A code generator completes this declaration (`@freezed`, `@JsonSerializable`, `@riverpod`).
  final bool isCodeGenerated;

  /// The declaration is deprecated.
  final bool isDeprecated;

  /// The declaration promises immutability.
  final bool isImmutable;
}
