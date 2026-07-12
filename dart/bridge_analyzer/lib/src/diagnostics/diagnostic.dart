/// The diagnostic value types.
///
/// Layer: `diagnostics` — depends on `model` and `util`.
library;

import 'package:bridge_analyzer/src/model/source_span.dart';
import 'package:meta/meta.dart';

/// How much a diagnostic matters.
///
/// Ordered most-severe-first so that `Severity.values.indexOf` is a usable sort key.
enum Severity {
  /// The project cannot be compiled correctly. Exit code becomes `1`.
  error,

  /// Compilation proceeds, but something will convert imperfectly.
  warning,

  /// Something the compiler did that the user should know about — e.g. a state promotion (BRG2302).
  ///
  /// Info diagnostics exist so that the compiler's decisions are never silent.
  info,
}

/// The area of the compiler a code belongs to (Spec §9.2 code namespaces).
enum DiagnosticCategory {
  /// `BRG0xxx` — configuration and environment.
  configuration,

  /// `BRG1xxx` — extraction.
  extraction,

  /// `BRG2xxx` — mapping and legalization.
  mapping,

  /// `BRG3xxx` — generation.
  generation,

  /// `BRG4xxx` — verification.
  verification,
}

/// A machine-readable, permanently stable diagnostic identity.
///
/// Codes are registered exactly once (see `codes.dart`) and never reused: a user searching for
/// `BRG1002` five years from now must find the same meaning.
@immutable
final class DiagnosticCode implements Comparable<DiagnosticCode> {
  /// Creates a code. Prefer the registered constants; this constructor exists for the registry.
  const DiagnosticCode({
    required this.id,
    required this.category,
    required this.defaultSeverity,
    required this.docsSlug,
    required this.title,
    required this.explanation,
  });

  /// The identifier, e.g. `BRG1002`.
  final String id;

  /// Which part of the compiler owns it.
  final DiagnosticCategory category;

  /// The severity used unless a call site deliberately raises or lowers it.
  final Severity defaultSeverity;

  /// The slug for `bridge explain <code>` and the docs site.
  final String docsSlug;

  /// A short, invariant summary of what the code means.
  ///
  /// The *title* belongs to the code; the *message* belongs to the occurrence. "Unresolved reference"
  /// is a title; "reference to `sig:foo`, which is not declared anywhere" is a message. A reader
  /// scanning a hundred diagnostics reads titles; a reader fixing one reads the message.
  final String title;

  /// The offline documentation shown by `bridge_analyzer explain <code>`.
  ///
  /// Offline on purpose. A developer whose build just failed should not have to be online, or to
  /// find a docs site, to learn what the compiler is telling them.
  final String explanation;

  @override
  int compareTo(DiagnosticCode other) => id.compareTo(other.id);

  @override
  String toString() => id;

  @override
  bool operator ==(Object other) => other is DiagnosticCode && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

/// A secondary location that helps explain a diagnostic.
///
/// For example: the declaration of the signal a route argument refers to, when reporting that the
/// argument cannot cross a route boundary.
@immutable
final class RelatedLocation {
  /// Creates a related location.
  const RelatedLocation({required this.span, required this.message});

  /// Where.
  final SourceSpan span;

  /// Why this location matters to the diagnostic.
  final String message;
}

/// A machine-applicable suggested edit.
///
/// The framework carries these from M1-T1; individual diagnostics acquire them as they are written.
/// A fix is a *replacement of a span with text* — nothing more expressive, because anything more
/// expressive stops being mechanically applicable.
@immutable
final class FixSuggestion {
  /// Creates a fix that replaces [span] with [replacement].
  const FixSuggestion({
    required this.description,
    required this.span,
    required this.replacement,
  });

  /// Human-readable description, e.g. "Pass the product id instead of the product".
  final String description;

  /// The span to replace.
  final SourceSpan span;

  /// The text to put there.
  final String replacement;
}

/// One problem, reported to the user.
///
/// Immutable and totally ordered (see `DiagnosticSink.sorted`). A diagnostic never throws and never
/// aborts anything: it is data.
@immutable
final class Diagnostic {
  /// Creates a diagnostic.
  ///
  /// [severity] defaults to the code's registered default; pass it only to deliberately deviate.
  Diagnostic({
    required this.code,
    required this.message,
    this.span,
    this.hint,
    Severity? severity,
    List<RelatedLocation> related = const <RelatedLocation>[],
    List<FixSuggestion> fixes = const <FixSuggestion>[],
  }) : severity = severity ?? code.defaultSeverity,
       related = List<RelatedLocation>.unmodifiable(related),
       fixes = List<FixSuggestion>.unmodifiable(fixes);

  /// The registered code.
  final DiagnosticCode code;

  /// How much it matters.
  final Severity severity;

  /// What is wrong, in the user's terms.
  ///
  /// Spec §8: name the *construct and the fix*, never the compiler's internals.
  final String message;

  /// Where, if the diagnostic has a location. Configuration diagnostics may not.
  final SourceSpan? span;

  /// An optional next step for the user.
  final String? hint;

  /// Secondary locations that explain the diagnostic.
  final List<RelatedLocation> related;

  /// Mechanically applicable fixes, if any.
  final List<FixSuggestion> fixes;

  @override
  String toString() {
    final String where = span == null ? '' : ' $span';
    return '${severity.name}[${code.id}]$where: $message';
  }
}
