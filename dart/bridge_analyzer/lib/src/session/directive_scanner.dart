/// Reads a file's directives out of a parsed unit.
///
/// Layer: `session` — inside the analyzer quarantine (ADR-14).
///
/// Produces plain `model` data. The `workspace` layer resolves what this produces without ever seeing
/// an analyzer AST node, which is the whole point of the quarantine: the next time the analyzer
/// redesigns its AST — as version 14 did — the damage is confined to this directory.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/model/directive_ref.dart';
import 'package:bridge_analyzer/src/session/source_parser.dart';

/// Extracts every directive that names another file.
final class DirectiveScanner {
  /// Creates a scanner.
  const DirectiveScanner();

  /// Scans [parsed] and returns its directives, in source order.
  List<DirectiveRef> scan(ParsedUnit parsed) {
    final List<DirectiveRef> found = <DirectiveRef>[];

    for (final Directive directive in parsed.unit.directives) {
      switch (directive) {
        case ImportDirective():
          _add(found, parsed, DirectiveKind.import, directive.uri);
          // A conditional import — `import 'stub.dart' if (dart.library.io) 'io.dart';` — names more
          // than one file, and *every* one of them must exist, because which is chosen depends on the
          // platform being compiled for, not on the analyzer.
          for (final Configuration configuration in directive.configurations) {
            _add(found, parsed, DirectiveKind.import, configuration.uri);
          }
        case ExportDirective():
          _add(found, parsed, DirectiveKind.export, directive.uri);
          for (final Configuration configuration in directive.configurations) {
            _add(found, parsed, DirectiveKind.export, configuration.uri);
          }
        case PartDirective():
          _add(found, parsed, DirectiveKind.part, directive.uri);
        case Directive():
          // `library`, `part of`, and augmentations name no file we have to find.
          break;
      }
    }

    return found;
  }

  void _add(List<DirectiveRef> into, ParsedUnit parsed, DirectiveKind kind, StringLiteral literal) {
    final String? uri = literal.stringValue;
    if (uri == null) {
      // An interpolated URI. It is not legal Dart, so the user's own analyzer has already said so,
      // and there is nothing here for us to resolve.
      return;
    }
    into.add(
      DirectiveRef(
        kind: kind,
        uri: uri,
        span: parsed.spanAt(literal.offset, literal.length),
      ),
    );
  }
}
