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
    // Symbols already emitted by an earlier file, for the declarations whose symbol is deliberately
    // **application-scoped** rather than file-scoped. See [_isApplicationScoped].
    final Set<String> shared = <String>{};

    await for (final ResolvedUnit unit in input.session.resolveAll()) {
      for (final RawNode record in Extractor(
        path: unit.relativePath,
        packageName: input.project.packageName,
        unit: unit.result.unit,
        diagnostics: context.diagnostics,
      ).extract()) {
        final String? symbol = record.symbol;
        if (symbol != null && _isApplicationScoped(symbol) && !shared.add(symbol)) {
          continue;
        }
        records.add(record);
      }
    }

    return ExtractionResult(records: records);
  }
}

/// Whether [symbol] names a declaration that belongs to the **application** rather than to a file.
///
/// ## The defect this exists to fix, found by running a real application
///
/// `Symbols.token` is the one symbol constructor that is deliberately not file-scoped, and it says so:
///
/// > A design token. **Not** file-scoped: a token is a property of the application, and the same token
/// > declared in two places is the same token.
///
/// The *emission* did not match. A `TokenExtractor` is built per unit and flushed per unit, so two files
/// that hoist the same literal colour (M4-E) each emitted an `app.Token` under the same symbol — and
/// `ReferenceResolver.declare` correctly reported `BRG1202`, because two declarations sharing a symbol
/// would silently merge.
///
/// It is invisible in a small program and fatal in a large one. M5-A ran the analyzer over a 113-file,
/// 47 800-line application and got **496 `BRG1202` errors**, all of them this — `token:color.colorFFFFFFFF`
/// declared by every file that mentioned white — and the run was refused. The repository's own fixtures
/// never had two files hoisting one colour.
///
/// Deduplicating here rather than in the extractor is deliberate: the extractor sees one file and cannot
/// know a token was already emitted, while this loop is the one place that sees them all. First in the
/// project's fixed order wins, so the surviving span is deterministic (D1).
///
/// The check is on the symbol's own grammar rather than on the record's kind, because it is a statement
/// about *symbols*: everything else `Symbols` produces embeds `$path` and is therefore file-scoped by
/// construction. A second application-scoped symbol would be added here and nowhere else.
bool _isApplicationScoped(String symbol) => symbol.startsWith('token:');
