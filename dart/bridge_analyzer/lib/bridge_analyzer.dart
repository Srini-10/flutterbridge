/// The FlutterBridge compiler frontend.
///
/// Loads a Flutter project through `package:analyzer`, extracts resolved semantics, and emits UIR as
/// NDJSON (Spec v2.1 §3.1, ADR-2). **It never generates target code.**
///
/// ## The public contract
///
/// Everything exported from this library is part of the compiler's contract and is expected to
/// survive to v1.0. Implementation lives under `src/` and is not exported: the AST types of
/// `package:analyzer`, the resolved-unit handles, the loader, and the individual stages are all
/// deliberately invisible from outside. ADR-14 is the reason — analyzer 14 redesigned its AST, and the
/// next such redesign must be absorbable without touching a single consumer.
///
/// ## Usage
///
/// ```dart
/// final result = await const BridgeAnalyzer().run(
///   const AnalyzerRequest(projectRoot: '/path/to/app', outputPath: 'out/app.uir.ndjson'),
/// );
/// exitCode = result.exitCode;
/// ```
///
/// ## The error model (Spec §8)
///
/// * A problem in the user's project is a `Diagnostic`. It is collected, ordered, and reported. It
///   never throws.
/// * An unfit environment is an `EnvironmentFailure` — reported as a diagnostic, exit code 3, and
///   **no output written** (INV-5).
/// * A violated invariant is a `BridgeInternalError`. It throws, and it is always a bug in the
///   compiler.
///
/// No other exception may cross this boundary.
library;

export 'src/diagnostics/codes.dart' show Codes;
export 'src/diagnostics/diagnostic.dart'
    show Diagnostic, DiagnosticCategory, DiagnosticCode, FixSuggestion, RelatedLocation, Severity;
export 'src/diagnostics/diagnostic_report.dart'
    show DiagnosticReport, DiagnosticSummary, reportVersion;
export 'src/diagnostics/explain.dart' show Explainer;
export 'src/diagnostics/human_reporter.dart' show HumanReporter;
export 'src/diagnostics/json_reporter.dart' show JsonReporter;
export 'src/diagnostics/reporter.dart'
    show FileSourceProvider, MapSourceProvider, NoSourceProvider, Reporter, SourceProvider;
export 'src/errors/internal_error.dart' show BridgeInternalError, EnvironmentFailure;
export 'src/model/project.dart' show ProjectInfo;
export 'src/model/source_span.dart' show SourceSpan;
export 'src/pipeline/analyzer.dart' show BridgeAnalyzer;
export 'src/pipeline/pipeline.dart' show AnalyzerResult, RunStatus;
export 'src/pipeline/stage.dart' show StageDescriptor;
export 'src/pipeline/stages.dart' show AnalyzerRequest, EmitResult;
export 'src/util/exit_codes.dart' show ExitCodes;
