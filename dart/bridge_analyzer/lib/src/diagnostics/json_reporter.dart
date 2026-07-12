/// The machine reporter.
///
/// Layer: `diagnostics`.
///
/// The contract every downstream consumer reads: IDEs, CI jobs, the TypeScript half of the compiler.
/// Its shape is committed as `schema/diagnostic-report.schema.json` and versioned by
/// [reportVersion] (INV-16).
///
/// **Additive-only until a major.** A consumer must be able to ignore fields it does not know, and a
/// new optional field must never break one. Removing a field, renaming one, or changing its meaning
/// is a breaking change and bumps [reportVersion] — at which point a consumer that does not
/// recognise the version must refuse to interpret the report rather than guess at it.
///
/// Output is canonical: keys sorted, no whitespace variance, no timestamps. Two runs over the same
/// diagnostics produce byte-identical JSON, so a CI job can diff two reports and a test can pin one.
library;

import 'dart:collection';
import 'dart:convert';

import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_report.dart';
import 'package:bridge_analyzer/src/diagnostics/reporter.dart';
import 'package:bridge_analyzer/src/model/source_span.dart';

/// Renders a report as canonical JSON.
final class JsonReporter implements Reporter {
  /// Creates a reporter.
  ///
  /// [pretty] is for a human squinting at a file; a machine consumer should leave it off, and CI
  /// pipelines that diff reports must, because indentation is not information.
  const JsonReporter({this.pretty = false});

  /// Whether to indent.
  final bool pretty;

  @override
  String render(DiagnosticReport report) {
    final Object? json = _canonical(<String, Object?>{
      'reportVersion': reportVersion,
      'tool': <String, Object?>{'name': 'bridge_analyzer', 'version': report.toolVersion},
      'summary': <String, Object?>{
        'errors': report.summary.errors,
        'warnings': report.summary.warnings,
        'infos': report.summary.infos,
        'total': report.summary.total,
      },
      'diagnostics': report.diagnostics.map(_diagnostic).toList(),
    });

    return pretty
        ? '${const JsonEncoder.withIndent('  ').convert(json)}\n'
        : '${jsonEncode(json)}\n';
  }

  Map<String, Object?> _diagnostic(Diagnostic diagnostic) => <String, Object?>{
    'code': diagnostic.code.id,
    'severity': diagnostic.severity.name,
    'category': diagnostic.code.category.name,
    'title': diagnostic.code.title,
    'message': diagnostic.message,
    'docsSlug': diagnostic.code.docsSlug,
    if (diagnostic.span != null) 'location': _location(diagnostic.span!),
    if (diagnostic.hint != null) 'hint': diagnostic.hint,
    if (diagnostic.related.isNotEmpty)
      'related': diagnostic.related
          .map(
            (RelatedLocation related) => <String, Object?>{
              'location': _location(related.span),
              'message': related.message,
            },
          )
          .toList(),
    // Fixes are machine-applicable by construction: a span and the text to put there, nothing more
    // expressive. Anything more expressive stops being mechanically applicable, which is the whole
    // point of shipping them to an IDE.
    if (diagnostic.fixes.isNotEmpty)
      'fixes': diagnostic.fixes
          .map(
            (FixSuggestion fix) => <String, Object?>{
              'description': fix.description,
              'location': _location(fix.span),
              'replacement': fix.replacement,
            },
          )
          .toList(),
  };

  Map<String, Object?> _location(SourceSpan span) => <String, Object?>{
    'file': span.file,
    'line': span.line,
    'column': span.column,
    if (span.length > 0) 'length': span.length,
  };

  /// Sorts every map key, recursively. Insertion order is the order the compiler happened to build
  /// the report in, which is not a specification.
  static Object? _canonical(Object? value) {
    if (value is Map<String, Object?>) {
      final SplayTreeMap<String, Object?> out = SplayTreeMap<String, Object?>();
      for (final MapEntry<String, Object?> entry in value.entries) {
        if (entry.value != null) {
          out[entry.key] = _canonical(entry.value);
        }
      }
      return out;
    }
    if (value is List<Object?>) {
      return value.map(_canonical).toList();
    }
    return value;
  }
}
