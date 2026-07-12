/// The loader against a real, `pub get`-ed Flutter application.
///
/// Everything else in the suite builds its own projects, which makes them hermetic and fast but also
/// makes them *ours*: a fixture cannot surprise the code that generated it. This file points the
/// loader at `fixtures/apps/hello_bridge` — a real Flutter app, with a real package config, resolving
/// against a real Flutter SDK — and checks that it is accepted.
///
/// It **skips** when the fixture has not been `flutter pub get`-ed, because a package config is a
/// build artifact and is not in version control. CI runs it in the `dart (fixture apps)` job, which
/// has Flutter and does run `flutter pub get` first. If you are running the suite locally and see it
/// skipped, run `flutter pub get` in the fixture.
@TestOn('vm')
// Resolving a real Flutter application against the real SDK is not a 30-second job — the default
// timeout is sized for unit tests, and this is the opposite of one.
@Timeout(Duration(minutes: 3))
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

/// The fixture, relative to `dart/bridge_analyzer/`.
final String fixture = p.normalize(
  p.join(Directory.current.path, '..', '..', 'fixtures', 'apps', 'hello_bridge'),
);

bool get isPubGot => File(p.join(fixture, '.dart_tool', 'package_config.json')).existsSync();

void main() {
  late Directory outDir;
  setUp(() {
    outDir = Directory.systemTemp.createTempSync('fixture_');
    addTearDown(() => outDir.deleteSync(recursive: true));
  });

  group(
    'hello_bridge — a real Flutter application',
    () {
      test('is accepted: every import resolves, and the project is described correctly', () async {
        final AnalyzerResult result = await const BridgeAnalyzer().run(
          AnalyzerRequest(projectRoot: fixture, outputPath: '${outDir.path}/fixture.ndjson'),
        );

        expect(
          result.diagnostics.where((Diagnostic d) => d.severity == Severity.error),
          isEmpty,
          reason:
              'a real, pub-got Flutter app must compile without errors. If this fails, read the '
              'diagnostics: they name the command that fixes it.',
        );
        expect(
          result.status,
          RunStatus.completed,
          reason: 'a real Flutter application compiles all the way to UIR',
        );
        expect(result.output!.recordCount, greaterThan(0));

        // Warnings are expected, and they are honest: `a[i]` and `throw e` genuinely have no UIR node,
        // so they travel as Opaque with their source intact (INV-4). What must not happen is a warning
        // being reported twice — which it was, until the class extractor stopped computing its fields
        // and methods twice over.
        final List<Diagnostic> warnings = result.diagnostics
            .where((Diagnostic d) => d.severity == Severity.warning)
            .toList();
        expect(
          warnings.map((Diagnostic d) => '${d.code.id}${d.span}').toSet().length,
          warnings.length,
          reason: 'the same finding must not be reported twice',
        );
      });

      test('every tree node in the emitted document is content-addressed (ADR-17)', () async {
        // The property the whole compiler rests on: a tree node's id **is** the hash of its own
        // canonical content. Anchors, cache keys, incremental invalidation and every override that ever
        // addresses a node all assume it.
        //
        // `validation.dart` already checks that ids are *injective* — that one id never denotes two
        // different contents. That catches a collision. It does not catch a builder that mints an id
        // some other way entirely, and this does: it recomputes every id from scratch.
        //
        // Declarations are exempt, and must be: their id is sha256('d:' + symbol), and the symbol is a
        // source coordinate that is deliberately not carried in the document.
        final String path = '${outDir.path}/fixture.ndjson';
        await const BridgeAnalyzer().run(
          AnalyzerRequest(projectRoot: fixture, outputPath: path),
        );

        var checked = 0;

        void checkNested(Object? value) {
          if (value is List<Object?>) {
            value.forEach(checkNested);
            return;
          }
          if (value is! Map<String, Object?>) return;

          final Object? id = value['id'];
          if (value['kind'] is String && id is String) {
            expect(
              uir.nodeIdOfContent(uir.stripIdentity(value)! as Map<String, Object?>),
              id,
              reason:
                  'the id of a nested ${value['kind']} is not the hash of its content. Content '
                  'addressing is broken, and every anchor and cache key in this compiler is a lie.',
            );
            checked++;
          }
          value.values.forEach(checkNested);
        }

        for (final String line in File(path).readAsLinesSync().where((String l) => l.isNotEmpty)) {
          // The top-level record itself is a declaration (symbol-addressed); everything under it is not.
          final Map<String, Object?> node = jsonDecode(line) as Map<String, Object?>;
          for (final MapEntry<String, Object?> entry in node.entries) {
            if (entry.key != 'id') checkNested(entry.value);
          }
        }

        expect(checked, greaterThan(50), reason: 'this fixture must exercise a real tree');
      });

      test('a real app is refused the moment one of its imports stops resolving', () async {
        // The check earning its keep, on the real thing. A file that imports a package the project
        // does not depend on is exactly what a half-finished `pub get` leaves behind — and the
        // analyzer must refuse it rather than resolve every Flutter type to InvalidType and extract
        // a confident pile of nothing (M0-T3, F6).
        final File intruder = File(p.join(fixture, 'lib', '_preflight_probe.dart'));
        addTearDown(() {
          if (intruder.existsSync()) {
            intruder.deleteSync();
          }
        });
        intruder.writeAsStringSync("import 'package:not_a_dependency/x.dart';\n");

        final AnalyzerResult result = await const BridgeAnalyzer().run(
          AnalyzerRequest(projectRoot: fixture, outputPath: '${outDir.path}/fixture.ndjson'),
        );

        expect(result.status, RunStatus.environmentFailure);
        expect(result.exitCode, ExitCodes.environmentFailure);
        expect(result.output, isNull);
        expect(result.diagnostics.single.code, Codes.unresolvedImport);
        expect(result.diagnostics.single.span?.file, p.join('lib', '_preflight_probe.dart'));
      });
    },
    skip: isPubGot
        ? null
        : 'fixtures/apps/hello_bridge has no package_config.json — run `flutter pub get` in it.',
  );
}
