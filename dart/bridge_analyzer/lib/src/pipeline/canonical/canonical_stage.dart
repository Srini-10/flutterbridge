/// **CANONICAL** — turn raw records into canonical, strongly typed UIR.
///
/// Layer: `pipeline`.
///
/// Implemented (M1-T3). No normalization, no optimization: this stage constructs what the extractor
/// saw, in canonical form, or it fails with diagnostics.
library;

import 'package:bridge_analyzer/src/builder/canonical_builder.dart';
import 'package:bridge_analyzer/src/pipeline/extract/extract_stage.dart';
import 'package:bridge_analyzer/src/pipeline/stage.dart';
import 'package:meta/meta.dart';

/// What `canonical` produces: a validated UIR program.
@immutable
final class CanonicalResult {
  /// Creates a canonical result.
  const CanonicalResult({required this.program});

  /// The program. Every node is a generated `bridge_uir` type.
  final CanonicalProgram program;
}

/// Builds canonical UIR.
final class CanonicalStage extends Stage<ExtractionResult, CanonicalResult> {
  /// Creates the canonical stage.
  const CanonicalStage({CanonicalBuilder builder = const CanonicalBuilder()}) : _builder = builder;

  final CanonicalBuilder _builder;

  @override
  String get name => 'canonical';

  @override
  String get owner => 'M1-T3';

  @override
  bool get isImplemented => true;

  @override
  Future<CanonicalResult> execute(ExtractionResult input, StageContext context) async {
    final CanonicalProgram? program = _builder.build(input.records, context.diagnostics);
    if (program == null) {
      // The builder recorded why. The pipeline sees the errors and stops cleanly — no exception
      // crosses this boundary, and no invalid graph continues.
      throw const BuilderRejectedGraph();
    }
    return CanonicalResult(program: program);
  }
}

/// Signals that the builder refused to produce a graph.
///
/// Carries no message: the reasons are diagnostics, which are data and are already recorded. This
/// exists only to unwind the stage, and the pipeline turns it into a clean failure.
@immutable
final class BuilderRejectedGraph implements Exception {
  /// Creates the signal.
  const BuilderRejectedGraph();

  @override
  String toString() => 'the canonical builder rejected the graph; see diagnostics';
}
