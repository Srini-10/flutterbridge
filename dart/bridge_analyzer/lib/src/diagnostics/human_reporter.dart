/// The human reporter.
///
/// Layer: `diagnostics`.
///
/// Renders diagnostics the way a person reads them: what is wrong, where, what the code was doing
/// there, and what to do about it. Spec §8 is explicit that a message must name *the construct and
/// the fix*, never the compiler's internals — this is the module that has to honour that, because it
/// is the one a developer actually sees.
///
/// ```text
/// error[BRG1201]: Unresolved reference
///   --> lib/screens/login_screen.dart:55:5
///    |
/// 55 |     Navigator.push<void>(
///    |     ^^^^^^^^^ Reference to "sig:theme", which is not declared anywhere in the program.
///    |
///    = help: Run `flutter pub get` in the project, then re-run.
///    = note: lib/main.dart:12:3: first declared here
///    = fix: pass the product id instead of the product
///    = docs: bridge_analyzer explain BRG1201
/// ```
library;

import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_report.dart';
import 'package:bridge_analyzer/src/diagnostics/reporter.dart';
import 'package:bridge_analyzer/src/model/source_span.dart';

/// Renders a report for a terminal.
final class HumanReporter implements Reporter {
  /// Creates a reporter.
  ///
  /// [colour] is off by default. Colour is for a terminal a person is looking at; it is noise in a
  /// log file and it breaks a golden test, so it must be asked for.
  const HumanReporter({this.sources = const NoSourceProvider(), this.colour = false});

  /// Where source excerpts come from, when they can be had at all.
  final SourceProvider sources;

  /// Whether to emit ANSI colour.
  final bool colour;

  @override
  String render(DiagnosticReport report) {
    if (report.diagnostics.isEmpty) {
      return 'No issues found.\n';
    }

    final StringBuffer out = StringBuffer();
    for (final Diagnostic diagnostic in report.diagnostics) {
      out.writeln(_renderOne(diagnostic));
    }
    out.write(_summary(report.summary));
    return out.toString();
  }

  String _renderOne(Diagnostic diagnostic) {
    // Headline: severity, code, and the *code's* title — not the message. A reader scanning a
    // hundred diagnostics reads headlines; the message is for the one they stop at.
    final StringBuffer out = StringBuffer()
      ..writeln(
        '${_colour(diagnostic.severity.name, _severityColour(diagnostic.severity))}'
        '[${diagnostic.code.id}]: ${diagnostic.code.title}',
      );

    final SourceSpan? span = diagnostic.span;
    if (span != null) {
      out
        ..writeln('  --> $span')
        ..write(_excerpt(span, diagnostic.message));
    } else {
      // A configuration diagnostic describes the project, not a place in it.
      out.writeln('  ${diagnostic.message}');
    }

    final String? hint = diagnostic.hint;
    if (hint != null) {
      out.writeln('   = help: $hint');
    }

    for (final RelatedLocation related in diagnostic.related) {
      out.writeln('   = note: ${related.span}: ${related.message}');
    }

    for (final FixSuggestion fix in diagnostic.fixes) {
      out.writeln('   = fix: ${fix.description}');
    }

    out.writeln('   = docs: bridge_analyzer explain ${diagnostic.code.id}');
    return out.toString();
  }

  /// The offending line, with a caret under the span.
  ///
  /// Falls back to just the message when the source cannot be read — see [SourceProvider]. Losing the
  /// excerpt must never lose the diagnostic.
  String _excerpt(SourceSpan span, String message) {
    final String? source = sources.sourceOf(span.file);
    if (source == null) {
      return '   |\n   | $message\n   |\n';
    }

    final List<String> lines = source.split('\n');
    if (span.line < 1 || span.line > lines.length) {
      return '   |\n   | $message\n   |\n';
    }

    final String line = lines[span.line - 1];
    final String number = span.line.toString();
    final String gutter = ' ' * number.length;

    // A zero-length span is a point; give it a single caret so it is still visible.
    final int width = span.length > 0 ? span.length : 1;
    final String caret = ' ' * (span.column - 1) + _colour('^' * width, _AnsiColour.red);

    return '$gutter |\n'
        '$number | $line\n'
        '$gutter | $caret $message\n'
        '$gutter |\n';
  }

  String _summary(DiagnosticSummary summary) {
    final List<String> parts = <String>[
      if (summary.errors > 0) '${summary.errors} error${summary.errors == 1 ? '' : 's'}',
      if (summary.warnings > 0) '${summary.warnings} warning${summary.warnings == 1 ? '' : 's'}',
      if (summary.infos > 0) '${summary.infos} info${summary.infos == 1 ? '' : 's'}',
    ];
    return '${parts.join(', ')} found.\n';
  }

  static _AnsiColour _severityColour(Severity severity) => switch (severity) {
    Severity.error => _AnsiColour.red,
    Severity.warning => _AnsiColour.yellow,
    Severity.info => _AnsiColour.blue,
  };

  String _colour(String text, _AnsiColour colour) =>
      this.colour ? '\x1B[${colour.code}m$text\x1B[0m' : text;
}

enum _AnsiColour {
  red(31),
  yellow(33),
  blue(34)
  ;

  const _AnsiColour(this.code);

  final int code;
}
