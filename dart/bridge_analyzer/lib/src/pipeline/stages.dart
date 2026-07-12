/// The load and emit stages, and the types that flow between them.
///
///     LOAD  ──▶  EXTRACT  ──▶  CANONICAL  ──▶  EMIT
///     (M1-T1)    (M1-T8)       (M1-T3)         (M1-T5)
///
/// `extract` and `canonical` live in their own directories; the pipeline that composes all four is
/// in `pipeline.dart`.
///
/// Layer: `pipeline`.
library;

import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/emit/ndjson_emitter.dart';
import 'package:bridge_analyzer/src/emit/record_writer.dart';
import 'package:bridge_analyzer/src/errors/internal_error.dart';
import 'package:bridge_analyzer/src/model/project.dart';
import 'package:bridge_analyzer/src/pipeline/canonical/canonical_stage.dart';
import 'package:bridge_analyzer/src/pipeline/stage.dart';
import 'package:bridge_analyzer/src/session/analysis_session.dart';
import 'package:bridge_analyzer/src/workspace/import_resolver.dart';
import 'package:bridge_analyzer/src/workspace/preflight.dart';
import 'package:bridge_analyzer/src/workspace/project_loader.dart';
import 'package:meta/meta.dart';

/// The request the analyzer was invoked with.
@immutable
final class AnalyzerRequest {
  /// Creates a request to analyze [projectRoot], writing UIR to [outputPath].
  const AnalyzerRequest({required this.projectRoot, required this.outputPath});

  /// Directory containing the project's `pubspec.yaml`.
  final String projectRoot;

  /// Where the NDJSON output is written.
  final String outputPath;
}

/// What `load` produces: a described project and an open analysis session over it.
final class LoadResult {
  /// Creates a load result.
  const LoadResult({required this.project, required this.session});

  /// The project, as data.
  final ProjectInfo project;

  /// The resolved-analysis session over it.
  final AnalysisSessionHandle session;
}

/// What `emit` produces: the written artifacts.
@immutable
final class EmitResult {
  /// Creates an emit result.
  const EmitResult({
    required this.outputPath,
    required this.recordCount,
    required this.manifestPath,
  });

  /// Where the NDJSON document was written.
  final String outputPath;

  /// How many records it contains.
  final int recordCount;

  /// Where the manifest that describes it was written.
  final String manifestPath;
}

/// **LOAD** — establish that the project can be analyzed, and open a session over it.
///
/// Implemented (M1-T1; preflight added in M1-T7). Refuses an unfit environment rather than degrading
/// (INV-5).
///
/// Three things happen, in this order, and none of them resolves a unit:
///
/// 1. **Discovery** (`ProjectLoader`) — the pubspec, the package config, `lib/`. A missing one of
///    these is an `EnvironmentFailure`: exit 3, no output.
/// 2. **Shape** — a package with no `flutter` dependency gets a warning (BRG0105) and is analyzed
///    anyway. It is a legitimate thing to point the analyzer at; it just has no widgets in it.
/// 3. **Preflight** (`Preflight`) — every directive in `lib/` must point at a file that exists. This
///    is the one that matters, and `workspace/preflight.dart` explains at length why: without it, a
///    project that has not been `pub get`-ed, `build_runner`-ed or `gen-l10n`-ed does not fail. It
///    silently extracts to garbage.
final class LoadStage extends Stage<AnalyzerRequest, LoadResult> {
  /// Creates the load stage.
  const LoadStage({ProjectLoader loader = const ProjectLoader()}) : _loader = loader;

  final ProjectLoader _loader;

  @override
  String get name => 'load';

  @override
  String get owner => 'M1-T1';

  @override
  bool get isImplemented => true;

  @override
  Future<LoadResult> execute(AnalyzerRequest input, StageContext context) async {
    final LoadedProject loaded = _loader.load(input.projectRoot);
    final ProjectInfo project = loaded.info;

    if (!project.isFlutterProject) {
      context.diagnostics.add(
        Diagnostic(
          code: Codes.notAFlutterProject,
          message:
              'Package `${project.packageName}` does not depend on the flutter SDK, so it contains '
              'no widgets and extraction will find nothing to convert.',
          hint: 'If you meant to analyze a Flutter application, check --project.',
        ),
      );
    }

    final AnalysisSessionHandle session = AnalysisSessionHandle(project: project);

    final Preflight preflight = Preflight(
      resolver: ImportResolver(
        packageConfig: loaded.packageConfig,
        projectRoot: project.root,
      ),
    );

    // Every file is read and parsed here, and read and parsed again when it is resolved. That is the
    // price of the check, and it is worth paying: a parse is roughly an order of magnitude cheaper
    // than a resolution, and this runs before *any* resolution — so on the projects that fail it, the
    // whole expensive pass is what we avoid.
    bool unfit = false;
    for (final String file in project.libraryFiles) {
      final List<Diagnostic> dangling = preflight.check(
        file,
        session.directivesOf(file, session.readSource(file)),
      );
      for (final Diagnostic diagnostic in dangling) {
        context.diagnostics.add(diagnostic);
        unfit = true;
      }
    }

    if (unfit) {
      throw const PreflightFailed();
    }

    return LoadResult(project: project, session: session);
  }
}

/// Signals that the project's own imports do not resolve, so it must not be analyzed.
///
/// Carries no message: the reasons are diagnostics — one per dangling directive, each naming the
/// command that fixes it — and are already recorded. Distinct from [EnvironmentFailure], which
/// carries exactly one reason, because a project that has not been code-generated has as many
/// reasons as it has `part` directives, and they are worth showing.
@immutable
final class PreflightFailed implements Exception {
  /// Creates the signal.
  const PreflightFailed();

  @override
  String toString() => 'the project has unresolved imports; see diagnostics';
}

/// **EMIT** — write the canonical UIR as NDJSON, atomically.
///
/// Implemented (M1-T4). The sole serialization boundary: past this stage the graph stops being Dart
/// objects and becomes bytes that the rest of the compiler reads.
final class EmitStage extends Stage<CanonicalResult, EmitResult> {
  /// Creates the emit stage writing to [outputPath].
  const EmitStage({required this.outputPath, NdjsonEmitter emitter = const NdjsonEmitter()})
    : _emitter = emitter;

  /// Where the NDJSON will be written.
  final String outputPath;

  final NdjsonEmitter _emitter;

  @override
  String get name => 'emit';

  @override
  String get owner => 'M1-T4';

  @override
  bool get isImplemented => true;

  @override
  Future<EmitResult> execute(CanonicalResult input, StageContext context) async {
    final WrittenOutput? written = _emitter.emit(
      program: input.program,
      outputPath: outputPath,
      diagnostics: context.diagnostics,
    );

    if (written == null) {
      // The emitter recorded why, and wrote nothing. The pipeline turns this into a clean failure.
      throw const EmitRejected();
    }

    return EmitResult(
      outputPath: written.documentPath,
      recordCount: written.recordCount,
      manifestPath: written.manifestPath,
    );
  }
}

/// Signals that the emitter refused to write.
///
/// Carries no message: the reasons are diagnostics, which are data and are already recorded.
@immutable
final class EmitRejected implements Exception {
  /// Creates the signal.
  const EmitRejected();

  @override
  String toString() => 'the emitter refused to write; see diagnostics';
}
