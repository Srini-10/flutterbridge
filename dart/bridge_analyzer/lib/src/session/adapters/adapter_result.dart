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
