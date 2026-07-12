/// Parsing, and only parsing.
///
/// Layer: `session` — inside the analyzer quarantine (ADR-14).
///
/// Parsing is not resolution. It needs no element model, no package config, and no `pub get`; it is
/// an order of magnitude cheaper than resolution; and it cannot fail in the interesting way, because
/// a file that does not parse is a file the user can see is broken.
///
/// Two things run on parsed units, both before resolution is attempted at all: the preflight check
/// (*does every directive point at something?*) and the incremental digest (*has anything anyone
/// depends on changed?*). Neither needs types, and neither may pay for them.
library;

import 'package:analyzer/dart/analysis/results.dart';
import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/source/line_info.dart';
import 'package:bridge_analyzer/src/model/source_span.dart';

/// A parsed unit and the line map needed to turn its offsets into spans.
final class ParsedUnit {
  /// Creates a parsed unit.
  const ParsedUnit({required this.path, required this.unit, required this.lineInfo});

  /// The project-relative path the source came from.
  ///
  /// Relative, always. An absolute path in a diagnostic makes a report that cannot be compared
  /// between two machines, or between a developer's laptop and CI.
  final String path;

  /// The unit.
  final CompilationUnit unit;

  /// The line map.
  final LineInfo lineInfo;

  /// The span of [offset], [length] characters long.
  SourceSpan spanAt(int offset, int length) {
    final CharacterLocation location = lineInfo.getLocation(offset);
    return SourceSpan(
      file: path,
      line: location.lineNumber,
      column: location.columnNumber,
      length: length,
    );
  }
}

/// Parses Dart source.
final class SourceParser {
  /// Creates a parser.
  const SourceParser();

  /// Parses [source], attributing it to the project-relative [path].
  ///
  /// Syntax errors are not thrown and not reported here. A file that does not parse still yields a
  /// unit — a partial one — and the directives that *were* parsed are still worth checking. The
  /// user's own `dart analyze` is a better reporter of a syntax error than we would be, and
  /// duplicating it would only add noise to our report.
  ParsedUnit parse({required String path, required String source}) {
    final ParseStringResult result = parseString(
      content: source,
      path: path,
      throwIfDiagnostics: false,
    );
    return ParsedUnit(path: path, unit: result.unit, lineInfo: result.lineInfo);
  }
}
