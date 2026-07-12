/// Diagnostic collection.
///
/// Layer: `diagnostics`.
library;

import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/util/ordering.dart';

/// Collects diagnostics during a run and hands back a deterministically ordered view.
///
/// This is the one deliberately mutable object in the compiler, and its mutability is bounded: it is
/// created per run, it is never global, and it only ever grows. Everything it hands out is
/// unmodifiable.
final class DiagnosticSink {
  final List<Diagnostic> _diagnostics = <Diagnostic>[];

  /// Records [diagnostic].
  void add(Diagnostic diagnostic) => _diagnostics.add(diagnostic);

  /// Records every diagnostic in [diagnostics].
  void addAll(Iterable<Diagnostic> diagnostics) => _diagnostics.addAll(diagnostics);

  /// Whether any diagnostic is an error.
  ///
  /// Drives the process exit code, so it is deliberately the *only* question the pipeline asks.
  bool get hasErrors => _diagnostics.any((Diagnostic d) => d.severity == Severity.error);

  /// How many diagnostics have been recorded.
  int get length => _diagnostics.length;

  /// The diagnostics, in a stable total order: by file, then line, then column, then code.
  ///
  /// Insertion order is the order in which the compiler happened to visit things, which is not a
  /// specification. Two runs over identical input must produce byte-identical reports (D1–D5), so
  /// the sort key must depend only on the diagnostics themselves.
  ///
  /// Diagnostics without a span (configuration problems) sort before those with one: they describe
  /// the project rather than a place in it.
  List<Diagnostic> sorted() {
    final List<Diagnostic> copy = List<Diagnostic>.of(_diagnostics)
      ..sort(
        (Diagnostic a, Diagnostic b) => compareBy<Diagnostic>(a, b, <Comparator<Diagnostic>>[
          (Diagnostic x, Diagnostic y) => _spanRank(x).compareTo(_spanRank(y)),
          (Diagnostic x, Diagnostic y) =>
              x.span == null || y.span == null ? 0 : x.span!.compareTo(y.span!),
          (Diagnostic x, Diagnostic y) => x.code.compareTo(y.code),
          (Diagnostic x, Diagnostic y) => x.message.compareTo(y.message),
        ]),
      );
    return List<Diagnostic>.unmodifiable(copy);
  }

  static int _spanRank(Diagnostic d) => d.span == null ? 0 : 1;
}
