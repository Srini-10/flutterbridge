/// The report envelope.
///
/// Layer: `diagnostics`.
///
/// A report is what a *consumer* receives: an IDE, a CI job, a downstream compiler stage, a human.
/// It is the diagnostics plus everything needed to interpret them without asking a second question —
/// how many there were, of what severity, and what produced them.
library;

import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/util/build_info.dart';
import 'package:meta/meta.dart';

/// The version of the report *format*, not of the analyzer.
///
/// Bumped only when the shape changes incompatibly. Additive changes — a new optional field — do not
/// bump it (INV-16), because a consumer that ignores unknown fields must keep working. A consumer
/// that sees a `reportVersion` it does not know must refuse to interpret the report rather than guess
/// at it.
const int reportVersion = 1;

/// How many diagnostics of each severity a run produced.
@immutable
final class DiagnosticSummary {
  /// Creates a summary.
  const DiagnosticSummary({required this.errors, required this.warnings, required this.infos});

  /// Counts the severities in [diagnostics].
  factory DiagnosticSummary.of(List<Diagnostic> diagnostics) => DiagnosticSummary(
    errors: diagnostics.where((Diagnostic d) => d.severity == Severity.error).length,
    warnings: diagnostics.where((Diagnostic d) => d.severity == Severity.warning).length,
    infos: diagnostics.where((Diagnostic d) => d.severity == Severity.info).length,
  );

  /// How many errors.
  final int errors;

  /// How many warnings.
  final int warnings;

  /// How many informational diagnostics.
  ///
  /// Info diagnostics exist so the compiler's decisions are never silent — a promoted signal
  /// (`BRG2302`) is reported *because* the user should know it happened, not because anything is
  /// wrong.
  final int infos;

  /// The total.
  int get total => errors + warnings + infos;

  /// Whether anything is an error.
  bool get hasErrors => errors > 0;
}

/// Everything a consumer needs to act on a run's diagnostics.
@immutable
final class DiagnosticReport {
  /// Creates a report from [diagnostics], which must already be in the sink's stable order.
  DiagnosticReport({required List<Diagnostic> diagnostics, this.toolVersion = bridgeBuildVersion})
    : diagnostics = List<Diagnostic>.unmodifiable(diagnostics),
      summary = DiagnosticSummary.of(diagnostics);

  /// The diagnostics, in a stable total order (file, line, column, code, message).
  ///
  /// The order is part of the contract. A CI job that diffs two reports, or a golden test that pins
  /// one, would otherwise see spurious changes caused by nothing but the order the compiler happened
  /// to visit things in.
  final List<Diagnostic> diagnostics;

  /// The severity counts.
  final DiagnosticSummary summary;

  /// The version of the analyzer that produced the report.
  final String toolVersion;
}
