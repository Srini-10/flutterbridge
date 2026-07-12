/// The `bridge_analyzer` command-line interface.
///
/// ```text
/// bridge_analyzer --project <dir> --out <file.ndjson> [--format text|json] [--colour]
/// bridge_analyzer explain <BRG code>
/// bridge_analyzer explain --list
/// ```
///
/// The process boundary. Its one responsibility is to make sure that **no exception escapes**
/// (Spec §8): user problems leave as diagnostics and an exit code; compiler bugs leave as a
/// structured internal error and exit code 2. Nothing leaves as an unhandled stack trace.
library;

import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';

Future<void> main(List<String> arguments) async {
  try {
    if (arguments.isNotEmpty && arguments.first == 'explain') {
      exit(_explain(arguments.skip(1).toList()));
    }
    exit(await _analyze(arguments));

    // A BridgeInternalError is deliberately an Error: it means the compiler violated one of its own
    // invariants, which is a bug and not a recoverable condition. The process boundary is precisely
    // where it must nonetheless be caught — Spec §8 requires that no exception escapes the compiler
    // boundary, and a raw stack dump is not a compiler contract. Hence the lint is suppressed here,
    // and only here.
    // ignore: avoid_catching_errors
  } on BridgeInternalError catch (error, stack) {
    stderr
      ..writeln(error)
      ..writeln(stack);
    exit(ExitCodes.internalError);
  }
}

/// `bridge_analyzer explain BRG1201` — offline, because a developer whose build just failed should
/// not have to be online to find out why.
int _explain(List<String> arguments) {
  if (arguments.isEmpty || arguments.first == '--list') {
    stdout.write(const Explainer().list());
    return ExitCodes.ok;
  }

  final String? explanation = const Explainer().explain(arguments.first);
  if (explanation == null) {
    stderr.writeln(
      'bridge_analyzer: "${arguments.first}" is not a diagnostic code. '
      'Run `bridge_analyzer explain --list` to see them all.',
    );
    return ExitCodes.environmentFailure;
  }

  stdout.write(explanation);
  return ExitCodes.ok;
}

Future<int> _analyze(List<String> arguments) async {
  final Map<String, String> options = _parseOptions(arguments);
  final bool json = options['format'] == 'json';
  final String? project = options['project'];
  final String? out = options['out'];

  if (project == null || out == null) {
    stderr.writeln(
      'usage: bridge_analyzer --project <dir> --out <file.ndjson> [--format text|json]\n'
      '                       [--cache <dir>]   re-analyze only what changed\n'
      '       bridge_analyzer explain <BRG code>',
    );
    return ExitCodes.environmentFailure;
  }

  final AnalyzerResult result = await const BridgeAnalyzer().run(
    AnalyzerRequest(projectRoot: project, outputPath: out),
    // With a cache, only the files whose bytes changed — or whose dependencies changed *surface* —
    // are re-analyzed. The output is byte-identical to a clean build either way; that identity is the
    // contract, and it is what makes the cache safe to use rather than merely fast.
    cacheDirectory: options['cache'],
  );

  // The report goes to stdout when it is machine-readable, and to stderr when it is not.
  //
  // A CI job pipes stdout into a file and expects JSON in it; a human watching a terminal expects
  // the *output artifact* on stdout and the commentary beside it. Mixing the two is how a pipeline
  // ends up with a progress message in the middle of its JSON.
  final Reporter reporter = json
      ? const JsonReporter()
      : HumanReporter(
          sources: FileSourceProvider(project),
          colour: arguments.contains('--colour') || arguments.contains('--color'),
        );

  final DiagnosticReport report = DiagnosticReport(diagnostics: result.diagnostics);
  (json ? stdout : stderr).write(reporter.render(report));

  if (!json) {
    switch (result.status) {
      case RunStatus.completed:
        final EmitResult? output = result.output;
        if (output != null) {
          stderr.writeln(
            'wrote ${output.outputPath} (${output.recordCount} records) '
            'and ${output.manifestPath}',
          );
          // The number an incremental build is judged on. A one-line body edit that rebuilds the
          // whole project is a cache that does not work, and this is where you see it.
          final List<String>? rebuilt = result.rebuilt;
          if (rebuilt != null) {
            stderr.writeln(
              rebuilt.isEmpty
                  ? 'incremental: nothing changed; no file was re-analyzed'
                  : 'incremental: re-analyzed ${rebuilt.length} file(s): ${rebuilt.join(', ')}',
            );
          }
        }
      case RunStatus.pendingImplementation:
        final StageDescriptor? pending = result.pendingStage;
        stderr
          ..writeln('bridge_analyzer: stages run: ${result.stagesRun.join(' -> ')}')
          ..writeln(
            'bridge_analyzer: stopped at "${pending?.name}" — not implemented in this build '
            '(owned by ${pending?.owner}). No output written.',
          );
      case RunStatus.invalidGraph:
        stderr.writeln('bridge_analyzer: the graph was rejected. No output written.');
      case RunStatus.environmentFailure:
        stderr.writeln('bridge_analyzer: environment unfit. No output written.');
    }
  }

  return result.exitCode;
}

Map<String, String> _parseOptions(List<String> arguments) {
  final Map<String, String> options = <String, String>{};
  for (int i = 0; i < arguments.length - 1; i++) {
    if (arguments[i].startsWith('--')) {
      options[arguments[i].substring(2)] = arguments[i + 1];
    }
  }
  return options;
}
