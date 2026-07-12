/// The compiler frontend's entry point.
///
/// Layer: `pipeline` (the facade above it).
library;

import 'package:bridge_analyzer/src/cache/analysis_cache.dart';
import 'package:bridge_analyzer/src/cache/cas.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/pipeline/incremental_pipeline.dart';
import 'package:bridge_analyzer/src/pipeline/pipeline.dart';
import 'package:bridge_analyzer/src/pipeline/stage.dart';
import 'package:bridge_analyzer/src/pipeline/stages.dart';

/// Analyzes a Flutter project and emits UIR.
///
/// The whole compiler frontend, behind one method. Stateless and safe to reuse: every run gets its
/// own diagnostic sink and its own analysis session, so two runs cannot influence each other. There
/// is no global mutable state anywhere beneath this class, which is what makes concurrent runs and
/// the persistent-server mode (M5) possible without redesign.
final class BridgeAnalyzer {
  /// Creates an analyzer.
  const BridgeAnalyzer();

  /// Runs the full pipeline for [request].
  ///
  /// Returns an [AnalyzerResult] for anything that is the *project's* fault — including an unfit
  /// environment. Throws `BridgeInternalError` only for a bug in the compiler.
  ///
  /// Give [cacheDirectory] to build **incrementally**: only the files whose bytes changed, or whose
  /// dependencies changed *surface*, are re-analyzed. The output is byte-identical to a clean build of
  /// the same sources — that identity is the contract, and it is what makes the cache safe to trust
  /// rather than merely fast.
  Future<AnalyzerResult> run(AnalyzerRequest request, {String? cacheDirectory}) {
    final DiagnosticSink sink = DiagnosticSink();

    if (cacheDirectory == null) {
      return AnalyzerPipeline.production(request).run(request, sink);
    }

    return IncrementalPipeline(
      cache: AnalysisCache(store: ContentAddressableStore(cacheDirectory)),
    ).run(request, sink);
  }

  /// The pipeline's shape for [request], without running it.
  ///
  /// Lets a caller (and `bridge doctor`) see the stage order and which stages this build implements.
  List<StageDescriptor> describe(AnalyzerRequest request) =>
      AnalyzerPipeline.production(request).stages;
}
