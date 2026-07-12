/// The analyzer pipeline.
///
/// Layer: `pipeline`.
library;

import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/errors/internal_error.dart';
import 'package:bridge_analyzer/src/pipeline/canonical/canonical_stage.dart';
import 'package:bridge_analyzer/src/pipeline/extract/extract_stage.dart';
import 'package:bridge_analyzer/src/pipeline/stage.dart';
import 'package:bridge_analyzer/src/pipeline/stages.dart';
import 'package:bridge_analyzer/src/util/exit_codes.dart';
import 'package:meta/meta.dart';

/// How a run finished.
enum RunStatus {
  /// Every stage ran and output was written.
  completed,

  /// The pipeline reached a stage this build does not implement, and stopped there.
  ///
  /// A transient state that exists only while the compiler is being built. It is deliberately not
  /// success: an empty output is indistinguishable from a successful extraction of an empty project,
  /// so the analyzer refuses to write one.
  pendingImplementation,

  /// The environment was unfit and the analyzer refused to run (INV-5). No output was written.
  environmentFailure,

  /// The canonical builder refused to produce a graph (M1-T3).
  ///
  /// The reasons are diagnostics. No output is written: an invalid graph must never leave the
  /// frontend, because everything downstream is written against the assumption that it cannot.
  invalidGraph,
}

/// The outcome of a run.
@immutable
final class AnalyzerResult {
  /// Creates a result.
  AnalyzerResult({
    required this.status,
    required List<Diagnostic> diagnostics,
    required List<String> stagesRun,
    this.pendingStage,
    this.output,
    List<String>? rebuilt,
  }) : diagnostics = List<Diagnostic>.unmodifiable(diagnostics),
       stagesRun = List<String>.unmodifiable(stagesRun),
       rebuilt = rebuilt == null ? null : List<String>.unmodifiable(rebuilt);

  /// How the run finished.
  final RunStatus status;

  /// Every diagnostic, in the sink's stable total order.
  final List<Diagnostic> diagnostics;

  /// The names of the stages that executed, in order.
  final List<String> stagesRun;

  /// The stage the pipeline stopped at, if [status] is [RunStatus.pendingImplementation].
  final StageDescriptor? pendingStage;

  /// The written artifact, if the run completed.
  final EmitResult? output;

  /// The files this build actually re-extracted, sorted — or `null` if it was a clean build.
  ///
  /// The number an incremental build is judged on. A one-line change to a method *body* that rebuilds
  /// the whole project is a cache that does not work, and this is how you see it.
  final List<String>? rebuilt;

  /// Whether any diagnostic is an error.
  bool get hasErrors => diagnostics.any((Diagnostic d) => d.severity == Severity.error);

  /// The process exit code this result maps to (INV-5, Spec §9.1).
  int get exitCode => switch (status) {
    RunStatus.environmentFailure => ExitCodes.environmentFailure,
    RunStatus.invalidGraph => ExitCodes.diagnosticsError,
    // The compiler could not do what was asked, and that is the compiler's fault, not the
    // user's. Non-zero so CI can never mistake a half-built analyzer for a successful run.
    RunStatus.pendingImplementation => ExitCodes.internalError,
    RunStatus.completed => hasErrors ? ExitCodes.diagnosticsError : ExitCodes.ok,
  };
}

/// The analyzer pipeline: LOAD → EXTRACT → EMIT, in the order Spec §3.1 fixes.
///
/// The order is not configurable, and the stages are not a list of interchangeable plugins. This is
/// the compiler frontend's shape, and it is fixed by the specification.
final class AnalyzerPipeline {
  /// Creates a pipeline from its three stages.
  ///
  /// Exposed so that tests can substitute a stage; production code should use
  /// [AnalyzerPipeline.production].
  const AnalyzerPipeline({
    required Stage<AnalyzerRequest, LoadResult> load,
    required Stage<LoadResult, ExtractionResult> extract,
    required Stage<ExtractionResult, CanonicalResult> canonical,
    required Stage<CanonicalResult, EmitResult> emit,
  }) : _load = load,
       _extract = extract,
       _canonical = canonical,
       _emit = emit;

  /// The production pipeline for [request].
  factory AnalyzerPipeline.production(AnalyzerRequest request) => AnalyzerPipeline(
    load: const LoadStage(),
    extract: const ExtractStage(),
    canonical: const CanonicalStage(),
    emit: EmitStage(outputPath: request.outputPath),
  );

  final Stage<AnalyzerRequest, LoadResult> _load;
  final Stage<LoadResult, ExtractionResult> _extract;
  final Stage<ExtractionResult, CanonicalResult> _canonical;
  final Stage<CanonicalResult, EmitResult> _emit;

  /// The pipeline's shape: its stages, in execution order.
  List<StageDescriptor> get stages => List<StageDescriptor>.unmodifiable(<StageDescriptor>[
    _load.descriptor,
    _extract.descriptor,
    _canonical.descriptor,
    _emit.descriptor,
  ]);

  /// Runs the pipeline.
  ///
  /// Never throws for anything the *user* did: an unfit environment becomes
  /// [RunStatus.environmentFailure] plus a diagnostic. A [BridgeInternalError] is deliberately *not*
  /// caught here — a violated invariant must reach the process boundary, where it is reported as a
  /// bug in the compiler (Spec §8).
  Future<AnalyzerResult> run(AnalyzerRequest request, DiagnosticSink sink) async {
    final StageContext context = StageContext(diagnostics: sink);
    final List<String> ran = <String>[];

    final LoadResult loaded;
    try {
      loaded = await _load.execute(request, context);
      ran.add(_load.name);
    } on EnvironmentFailure catch (failure) {
      sink.add(_environmentDiagnostic(failure));
      return AnalyzerResult(
        status: RunStatus.environmentFailure,
        diagnostics: sink.sorted(),
        stagesRun: ran,
      );
    } on PreflightFailed {
      // The project's imports do not resolve. Its reasons are already diagnostics — one per dangling
      // directive — and the environment is unfit for exactly the reason INV-5 exists: analyzing it
      // anyway would produce output, and the output would be wrong.
      return AnalyzerResult(
        status: RunStatus.environmentFailure,
        diagnostics: sink.sorted(),
        stagesRun: ran,
      );
    }

    if (!_extract.isImplemented) {
      return AnalyzerResult(
        status: RunStatus.pendingImplementation,
        diagnostics: sink.sorted(),
        stagesRun: ran,
        pendingStage: _extract.descriptor,
      );
    }
    final ExtractionResult extracted = await _extract.execute(loaded, context);
    ran.add(_extract.name);

    if (!_canonical.isImplemented) {
      return AnalyzerResult(
        status: RunStatus.pendingImplementation,
        diagnostics: sink.sorted(),
        stagesRun: ran,
        pendingStage: _canonical.descriptor,
      );
    }

    final CanonicalResult canonical;
    try {
      canonical = await _canonical.execute(extracted, context);
      ran.add(_canonical.name);
    } on BuilderRejectedGraph {
      // The builder's reasons are already diagnostics. No output is written.
      return AnalyzerResult(
        status: RunStatus.invalidGraph,
        diagnostics: sink.sorted(),
        stagesRun: ran,
      );
    }

    if (!_emit.isImplemented) {
      return AnalyzerResult(
        status: RunStatus.pendingImplementation,
        diagnostics: sink.sorted(),
        stagesRun: ran,
        pendingStage: _emit.descriptor,
      );
    }
    final EmitResult emitted;
    try {
      emitted = await _emit.execute(canonical, context);
      ran.add(_emit.name);
    } on EmitRejected {
      // Nothing was written. A consumer that finds no document knows there is no document.
      return AnalyzerResult(
        status: RunStatus.invalidGraph,
        diagnostics: sink.sorted(),
        stagesRun: ran,
      );
    }

    return AnalyzerResult(
      status: RunStatus.completed,
      diagnostics: sink.sorted(),
      stagesRun: ran,
      output: emitted,
    );
  }

  Diagnostic _environmentDiagnostic(EnvironmentFailure failure) => environmentDiagnostic(failure);
}

/// The diagnostic an [EnvironmentFailure] becomes.
///
/// Shared by both pipelines: an unfit environment is unfit whether or not there is a cache.
Diagnostic environmentDiagnostic(EnvironmentFailure failure) {
  final DiagnosticCode? code = Codes.byId(failure.diagnosticCode);
  if (code == null) {
    throw BridgeInternalError(
      'diagnostics.unregistered-code',
      'EnvironmentFailure carries unregistered code ${failure.diagnosticCode}.',
      context: <String, String>{'code': failure.diagnosticCode},
    );
  }
  return Diagnostic(code: code, message: failure.message, hint: failure.remedy);
}
