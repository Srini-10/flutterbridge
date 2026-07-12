/// A directive, as data.
///
/// Layer: `model` — depends on `util` only.
///
/// The `session` layer parses a file and produces these; the `workspace` layer resolves them. Neither
/// hands the other an analyzer AST node, which is what keeps the analyzer quarantine (ADR-14) a
/// quarantine and not a suggestion.
library;

import 'package:bridge_analyzer/src/model/source_span.dart';
import 'package:meta/meta.dart';

/// The three directives that name another file.
enum DirectiveKind {
  /// `import 'x.dart';`
  import,

  /// `export 'x.dart';`
  export,

  /// `part 'x.g.dart';`
  ///
  /// The one that matters most in practice. A project using `freezed` or `json_serializable` is a
  /// pile of `part 'user.freezed.dart';` lines, and every one of them dangles until `build_runner`
  /// has run — which is exactly the state C1 found `compass_app` in.
  part;

  /// The word to use when talking about this directive to a human.
  String get word => name;
}

/// One directive's URI and where it was written.
@immutable
final class DirectiveRef {
  /// Creates a reference.
  const DirectiveRef({required this.kind, required this.uri, required this.span});

  /// Which directive it was.
  final DirectiveKind kind;

  /// The URI, exactly as written in the source.
  final String uri;

  /// Where it was written.
  final SourceSpan span;
}
