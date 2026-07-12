/// **EXTRACT** — walk resolved ASTs and produce raw records.
///
/// Layer: `pipeline`.
///
/// The stage is a driver, not an extractor: it resolves each library in the deterministic order the
/// project fixed, hands the unit to the `session` layer's extractor, and concatenates. The extraction
/// itself lives inside the analyzer quarantine (ADR-14), because it is nothing but analyzer AST
/// walking — see `session/extract/extractor.dart`.
library;

import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/pipeline/stage.dart';
import 'package:bridge_analyzer/src/pipeline/stages.dart';
import 'package:bridge_analyzer/src/session/analysis_session.dart';
import 'package:bridge_analyzer/src/session/extract/extractor.dart';
import 'package:meta/meta.dart';

/// What `extract` produces: raw records, as the analyzer saw them.
///
/// Deliberately *not* UIR. Extraction knows Dart; it does not know how a `NodeId` is computed, how
/// children are ordered, or what makes a graph valid. Those belong to the canonical builder, and the
/// split means neither stage can corrupt the other's invariants.
@immutable
final class ExtractionResult {
  /// Creates an extraction result.
  const ExtractionResult({required this.records});

  /// The raw records, in the order the extractor produced them.
  ///
  /// The builder does not depend on that order — it declares every symbol before resolving any — but
  /// preserving it keeps extraction debuggable.
  final List<RawNode> records;
}

/// Walks resolved ASTs and produces raw records.
///
/// Implemented (M1-T8).
final class ExtractStage extends Stage<LoadResult, ExtractionResult> {
  /// Creates the extract stage.
  const ExtractStage();

  @override
  String get name => 'extract';

  @override
  String get owner => 'M1-T8';

  @override
  bool get isImplemented => true;

  @override
  Future<ExtractionResult> execute(LoadResult input, StageContext context) async {
    final List<RawNode> records = <RawNode>[];

    // `resolveAll` yields in the order `ProjectInfo` fixed — sorted, never filesystem order (D1). The
    // builder does not depend on it, but a deterministic *input* is what makes a deterministic output
    // provable rather than lucky.
    await for (final ResolvedUnit unit in input.session.resolveAll()) {
      records.addAll(
        Extractor(
          path: unit.relativePath,
          packageName: input.project.packageName,
          unit: unit.result.unit,
          diagnostics: context.diagnostics,
        ).extract(),
      );
    }

    return ExtractionResult(records: records);
  }
}
