/// Pipeline construction, execution order, and the honesty of an incomplete build.
@TestOn('vm')
library;

import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/pipeline/canonical/canonical_stage.dart';
import 'package:bridge_analyzer/src/pipeline/extract/extract_stage.dart';
import 'package:bridge_analyzer/src/pipeline/pipeline.dart';
import 'package:bridge_analyzer/src/pipeline/stage.dart';
import 'package:bridge_analyzer/src/pipeline/stages.dart';
import 'package:test/test.dart';

import 'support/temp_project.dart';

void main() {
  const AnalyzerRequest request = AnalyzerRequest(
    projectRoot: '/nonexistent',
    outputPath: 'build/out.ndjson',
  );

  group('shape', () {
    test('the pipeline is LOAD -> EXTRACT -> EMIT, exactly as Spec §3.1 fixes it', () {
      expect(
        const BridgeAnalyzer().describe(request).map((StageDescriptor s) => s.name).toList(),
        <String>['load', 'extract', 'canonical', 'emit'],
      );
    });

    test('each stage names the milestone that owns its logic', () {
      final List<StageDescriptor> stages = const BridgeAnalyzer().describe(request);
      expect(stages[0].owner, 'M1-T1');
      expect(stages[1].owner, 'M1-T8');
      expect(stages[2].owner, 'M1-T3');
      expect(stages[3].owner, 'M1-T4');
    });

    test('only extraction remains unimplemented, and the build does not pretend otherwise', () {
      final List<StageDescriptor> stages = const BridgeAnalyzer().describe(request);
      expect(stages[0].isImplemented, isTrue, reason: 'load — M1-T1');
      expect(stages[1].isImplemented, isTrue, reason: 'extract — M1-T8');
      expect(stages[2].isImplemented, isTrue, reason: 'canonical — M1-T3');
      expect(stages[3].isImplemented, isTrue, reason: 'emit — M1-T4');
    });
  });

  group('execution', () {
    test('every stage runs, in order, and output is written', () async {
      final Directory out = Directory.systemTemp.createTempSync('pipeline_');
      addTearDown(() => out.deleteSync(recursive: true));

      final String project = createProject(
        name: 'fit_app',
        libraries: <String, String>{'a.dart': '// a\n', 'b.dart': '// b\n'},
      );

      final AnalyzerResult result = await const BridgeAnalyzer().run(
        AnalyzerRequest(projectRoot: project, outputPath: '${out.path}/out.ndjson'),
      );

      expect(result.status, RunStatus.completed);
      expect(result.stagesRun, <String>['load', 'extract', 'canonical', 'emit']);
      expect(result.exitCode, ExitCodes.ok);
    });

    test('a stage that is not implemented stops the pipeline rather than faking a result', () async {
      // Every stage is implemented as of M1-T8, so this is asserted against a substituted stage. The
      // rule it protects has not changed: an empty output is indistinguishable from a successful
      // extraction of an empty project, so a half-built compiler must never report success.
      final Directory out = Directory.systemTemp.createTempSync('pipeline_');
      addTearDown(() => out.deleteSync(recursive: true));
      final String project = createProject(name: 'fit_app');

      final AnalyzerPipeline pipeline = AnalyzerPipeline(
        load: const LoadStage(),
        extract: const _PendingExtract(),
        canonical: const CanonicalStage(),
        emit: EmitStage(outputPath: '${out.path}/out.ndjson'),
      );

      final AnalyzerResult result = await pipeline.run(
        AnalyzerRequest(projectRoot: project, outputPath: '${out.path}/out.ndjson'),
        DiagnosticSink(),
      );

      expect(result.status, RunStatus.pendingImplementation);
      expect(result.pendingStage?.name, 'extract');
      expect(result.output, isNull);
      expect(result.exitCode, isNot(ExitCodes.ok));
    });

    test('executing an unimplemented stage directly is a contract violation', () async {
      final String project = createProject(name: 'fit_app');
      final DiagnosticSink sink = DiagnosticSink();
      final LoadResult loaded = await const LoadStage().execute(
        AnalyzerRequest(projectRoot: project, outputPath: 'build/out.ndjson'),
        StageContext(diagnostics: sink),
      );

      // The pipeline checks isImplemented first. A caller that does not is broken, and must be told
      // so loudly rather than receive a plausible empty result.
      expect(
        () => const _PendingExtract().execute(loaded, StageContext(diagnostics: sink)),
        throwsA(isA<BridgeInternalError>()),
      );
    });
  });
}

/// A stage that has not been built yet — the state every stage was in before its milestone landed.
final class _PendingExtract extends Stage<LoadResult, ExtractionResult> {
  const _PendingExtract();

  @override
  String get name => 'extract';

  @override
  String get owner => 'M1-T8';

  @override
  bool get isImplemented => false;

  @override
  Future<ExtractionResult> execute(LoadResult input, StageContext context) async =>
      notImplemented();
}
