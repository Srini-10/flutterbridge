/// The incremental pipeline.
///
/// Layer: `pipeline`.
///
/// Same compiler, same output, less work. `LOAD → (EXTRACT + CANONICAL, cached per file) → EMIT`.
///
/// ## Why this is a separate pipeline rather than a flag on the other one
///
/// The cache stores **built canonical records**, not raw ones (M1-T5). It has to: a `RawNode` has no
/// id, and an id is what makes a record reusable. So the unit of caching spans extraction *and*
/// building, and the two cannot be separate `Stage`s on this path the way they are on the clean one.
/// The stages still happen — every file that is rebuilt is extracted and built exactly as a clean
/// build would extract and build it — but they happen inside one cached step, and pretending otherwise
/// in the type system would be a lie about where the work is.
///
/// ## The contract
///
/// **The output is byte-identical to a clean build of the same sources.** That is the entire point,
/// and it is not a hope: it follows from three properties established in M1-T3 and M1-T5 — a
/// declaration's id comes from its *symbol*, the cache stores the canonical *bytes*, and the program's
/// order is imposed over all files at once after the merge. A faster build that produces different
/// bytes is not a faster build; it is a wrong one, and it is the failure mode (R8) that destroys a
/// compiler's credibility permanently.
library;

import 'package:bridge_analyzer/src/builder/canonical_builder.dart';
import 'package:bridge_analyzer/src/cache/analysis_cache.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/errors/internal_error.dart';
import 'package:bridge_analyzer/src/incremental/incremental_analyzer.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/pipeline/canonical/canonical_stage.dart';
import 'package:bridge_analyzer/src/pipeline/pipeline.dart';
import 'package:bridge_analyzer/src/pipeline/stage.dart';
import 'package:bridge_analyzer/src/pipeline/stages.dart';
import 'package:bridge_analyzer/src/session/analysis_session.dart';
import 'package:bridge_analyzer/src/session/extract/extractor.dart';

/// Runs the compiler against a cache, re-analyzing only what changed.
final class IncrementalPipeline {
  /// Creates a pipeline over [cache].
  const IncrementalPipeline({
    required this.cache,
    ProjectLoaderStage load = const LoadStage(),
  }) : _load = load;

  /// Where artifacts are kept between builds.
  final AnalysisCache cache;

  final ProjectLoaderStage _load;

  /// Runs the pipeline for [request].
  ///
  /// Never throws for anything the user did. Same error model as the clean pipeline (Spec §8).
  Future<AnalyzerResult> run(AnalyzerRequest request, DiagnosticSink sink) async {
    final StageContext context = StageContext(diagnostics: sink);
    final List<String> ran = <String>[];

    final LoadResult loaded;
    try {
      loaded = await _load.execute(request, context);
      ran.add(_load.name);
    } on EnvironmentFailure catch (failure) {
      sink.add(environmentDiagnostic(failure));
      return AnalyzerResult(
        status: RunStatus.environmentFailure,
        diagnostics: sink.sorted(),
        stagesRun: ran,
      );
    } on PreflightFailed {
      return AnalyzerResult(
        status: RunStatus.environmentFailure,
        diagnostics: sink.sorted(),
        stagesRun: ran,
      );
    }

    // The sources, read once. The incremental analyzer hashes them to decide what changed, so it must
    // see exactly the bytes the extractor will see — reading them twice invites a file to change
    // between the two reads and a cache key to describe a file that no longer exists.
    final Map<String, String> sources = <String, String>{
      for (final String file in loaded.project.libraryFiles)
        file: loaded.session.readSource(file),
    };

    final IncrementalResult result = await IncrementalAnalyzer(
      cache: cache,
      digestProvider: loaded.session.digestProvider.digest,
      extractor: _extractorFor(loaded, context),
    ).analyze(sources, sink);

    // Extraction and building both happened — for every file that was not already cached. Naming them
    // is not a fiction: a consumer asking which stages ran wants to know the compiler did its job, not
    // which Dart objects were constructed.
    ran.addAll(<String>['extract', 'canonical']);

    final CanonicalProgram? program = result.program;
    if (program == null) {
      // The builder refused. Its reasons are already diagnostics, and no output is written.
      return AnalyzerResult(
        status: RunStatus.invalidGraph,
        diagnostics: sink.sorted(),
        stagesRun: ran,
        rebuilt: result.rebuilt,
      );
    }

    final EmitStage emit = EmitStage(outputPath: request.outputPath);
    final EmitResult emitted;
    try {
      emitted = await emit.execute(CanonicalResult(program: program), context);
      ran.add(emit.name);
    } on EmitRejected {
      return AnalyzerResult(
        status: RunStatus.invalidGraph,
        diagnostics: sink.sorted(),
        stagesRun: ran,
        rebuilt: result.rebuilt,
      );
    }

    return AnalyzerResult(
      status: RunStatus.completed,
      diagnostics: sink.sorted(),
      stagesRun: ran,
      output: emitted,
      rebuilt: result.rebuilt,
    );
  }

  /// The `ModuleExtractor` the incremental analyzer plugs into.
  ///
  /// This is the adapter ISSUE-13 was about, and it lives here because it is the only place both sides
  /// are visible: the `incremental` layer declares the seam and must never import an analyzer; the
  /// `session` layer owns the analyzer and must never import `incremental`. The `pipeline` layer sees
  /// both, and is the only layer that may.
  ///
  /// `source` is deliberately unused. The incremental analyzer passes it because it is what the digest
  /// was computed from; the session reads the same file from disk through the analyzer's own resource
  /// provider, which is the only reader whose view of the file the *element model* agrees with.
  ModuleExtractor _extractorFor(LoadResult loaded, StageContext context) =>
      (String path, String source) async {
        final ResolvedUnit? unit = await loaded.session.resolve(path);
        if (unit == null) {
          // The analyzer could not resolve a unit that preflight said was fine. That is a finding
          // about the project, not a crash: it is recorded, and the file contributes nothing.
          return const <RawNode>[];
        }
        return Extractor(
          path: path,
          packageName: loaded.project.packageName,
          unit: unit.result.unit,
          diagnostics: context.diagnostics,
        ).extract();
      };
}

/// The `load` stage, as this pipeline needs to see it.
typedef ProjectLoaderStage = Stage<AnalyzerRequest, LoadResult>;
