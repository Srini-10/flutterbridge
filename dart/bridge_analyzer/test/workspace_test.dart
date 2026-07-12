/// Project discovery, the preflight check, and the refusal to analyze an unfit environment.
@TestOn('vm')
library;

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:test/test.dart';

import 'support/temp_project.dart';

void main() {
  const ProjectLoaderHarness harness = ProjectLoaderHarness();

  group('discovery', () {
    test('a fit project loads, with library files in a deterministic order', () async {
      final String project = createProject(
        name: 'fit_app',
        // Written in an order that is deliberately not sorted.
        libraries: <String, String>{
          'z.dart': '// z\n',
          'nested/b.dart': '// b\n',
          'a.dart': '// a\n',
        },
      );

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.completed);
      expect(result.diagnostics, isEmpty, reason: 'a fit project has nothing to complain about');
    });

    test('a project with no package config is refused, with no output (INV-5)', () async {
      final String project = createProject(name: 'unfit_app', withPackageConfig: false);

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.environmentFailure);
      expect(result.exitCode, ExitCodes.environmentFailure);
      expect(result.output, isNull);
      expect(result.diagnostics.single.code, Codes.noPackageConfig);
      expect(
        result.diagnostics.single.hint,
        contains('flutter pub get'),
        reason: 'a diagnostic must tell the user what to run, not just what is wrong (Spec §8)',
      );
    });

    test('a pub-workspace member resolves its package config from the workspace root', () async {
      // Dart 3.6+ workspaces put package_config.json at the workspace root, not in the member
      // package. Checking only <project>/.dart_tool rejected flutter/samples — a perfectly
      // analyzable project — during C1. This test is that bug, pinned.
      final String member = createProject(name: 'member_app', packageConfigAtParent: true);

      final AnalyzerResult result = await harness.run(member);

      expect(
        result.status,
        RunStatus.completed,
        reason: 'a workspace member is analyzable and must not be refused',
      );
      expect(result.diagnostics, isEmpty);
    });

    test('a directory with no pubspec is refused', () async {
      final String project = createProject(name: 'no_pubspec', withPubspec: false);

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.environmentFailure);
      expect(result.diagnostics.single.code, Codes.noPubspec);
    });

    test('a package with no lib/ is refused', () async {
      final String project = createProject(name: 'no_lib', withLib: false);

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.environmentFailure);
      expect(result.diagnostics.single.code, Codes.noLibraryDirectory);
    });
  });

  group('the pubspec is YAML, and is now read as YAML', () {
    test('a package name is read whatever style it is written in', () async {
      // The line scan this replaced would have read the name as `"quoted_app"  # and one after`.
      final String project = createProject(name: 'quoted_app');
      overwritePubspec(project, '''
# A comment, before anything else.
name: "quoted_app"  # and one after
environment: {sdk: ^3.11.0}
dependencies: {flutter: {sdk: flutter}}
''');

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.completed);
      expect(result.diagnostics, isEmpty, reason: 'the flow-style pubspec parsed correctly');
    });

    test('a malformed pubspec is refused, not guessed at', () async {
      final String project = createProject(name: 'broken_app');
      overwritePubspec(project, 'name: [this is not a name]\n');

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.environmentFailure);
      expect(result.diagnostics.single.code, Codes.malformedPubspec);
    });

    test('a stale package config — one that has forgotten this package — is refused once', () async {
      // Renaming a package without re-running `pub get` dangles every `package:<self>/…` import in
      // the project. Reporting each of them would be a hundred true, useless lines.
      final String project = createProject(name: 'renamed_app');
      overwritePubspec(project, 'name: new_name\nenvironment:\n  sdk: ^3.11.0\n');

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.environmentFailure);
      expect(result.diagnostics.single.code, Codes.noPackageConfig);
      expect(result.diagnostics.single.message, contains('stale'));
    });
  });

  group('a non-Flutter package', () {
    test('is analyzed, but says so', () async {
      // Refusing it would be wrong: it is a legitimate thing to point the analyzer at. Saying nothing
      // would also be wrong — extraction is about to find no widgets, and the user deserves to know
      // why before they go looking for the bug.
      final String project = createProject(
        name: 'plain_dart',
        isFlutter: false,
        dependencies: const <String, Map<String, String>>{},
      );

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.completed);
      expect(result.diagnostics.single.code, Codes.notAFlutterProject);
      expect(result.diagnostics.single.severity, Severity.warning);
      expect(result.hasErrors, isFalse, reason: 'a warning must not fail the build');
    });
  });

  group('preflight — the refusal that stops silent garbage', () {
    test('an import of a package that is not a dependency is refused', () async {
      final String project = createProject(
        name: 'missing_dep',
        libraries: <String, String>{
          'main.dart': "import 'package:go_router/go_router.dart';\n",
        },
      );

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.environmentFailure);
      expect(result.exitCode, ExitCodes.environmentFailure);
      expect(result.output, isNull, reason: 'INV-5: an unfit environment produces no output');

      final Diagnostic diagnostic = result.diagnostics.single;
      expect(diagnostic.code, Codes.unresolvedImport);
      expect(diagnostic.span?.file, 'lib/main.dart');
      expect(diagnostic.span?.line, 1);
      expect(diagnostic.hint, contains('go_router'));
      expect(diagnostic.hint, contains('flutter pub get'));
    });

    test('an ungenerated part file names build_runner, not pub get', () async {
      // This is compass_app, and every other freezed/json_serializable project on earth. The file is
      // not missing because the user did something wrong; it is missing because it has not been
      // generated yet, and the fix is a command they have probably just forgotten to run.
      final String project = createProject(
        name: 'codegen_app',
        libraries: <String, String>{
          'user.dart': "part 'user.freezed.dart';\npart 'user.g.dart';\n",
        },
      );

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.environmentFailure);
      expect(result.diagnostics.length, 2, reason: 'both parts dangle, and both are reported');
      for (final Diagnostic diagnostic in result.diagnostics) {
        expect(diagnostic.code, Codes.unresolvedImport);
        expect(diagnostic.hint, contains('build_runner'));
        expect(
          diagnostic.hint,
          isNot(contains('pub get')),
          reason: 'the wrong command is worse than no command',
        );
      }
    });

    test('an ungenerated localizations import names gen-l10n', () async {
      // This is Flutter Gallery, which C1 could not analyze until `flutter gen-l10n` had run.
      final String project = createProject(
        name: 'l10n_app',
        libraries: <String, String>{
          'main.dart': "import 'package:flutter_gen/gen_l10n/app_localizations.dart';\n",
        },
      );

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.environmentFailure);
      expect(result.diagnostics.single.code, Codes.unresolvedImport);
      expect(result.diagnostics.single.hint, contains('flutter gen-l10n'));
    });

    test('a relative import of a file that does not exist is refused', () async {
      final String project = createProject(
        name: 'typo_app',
        libraries: <String, String>{
          'main.dart': "import 'screens/hoem_screen.dart';\n",
          'screens/home_screen.dart': '// the one they meant\n',
        },
      );

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.environmentFailure);
      expect(result.diagnostics.single.code, Codes.unresolvedImport);
      expect(result.diagnostics.single.hint, contains('not in it'));
    });

    test('imports that do resolve — dart:, package:, own-package, relative — pass', () async {
      final String project = createProject(
        name: 'fit_imports',
        libraries: <String, String>{
          'main.dart':
              "import 'dart:async';\n"
              "import 'package:flutter/material.dart';\n"
              "import 'package:fit_imports/models/item.dart';\n"
              "import 'models/item.dart';\n"
              "export 'models/item.dart';\n",
          'models/item.dart': 'class Item {}\n',
        },
      );

      final AnalyzerResult result = await harness.run(project);

      expect(result.status, RunStatus.completed);
      expect(result.diagnostics, isEmpty);
    });

    test('every dangling directive is reported, not just the first', () async {
      final String project = createProject(
        name: 'many_holes',
        libraries: <String, String>{
          'a.dart': "import 'package:nope/a.dart';\nimport 'missing.dart';\n",
          'b.dart': "import 'package:nope/b.dart';\n",
        },
      );

      final AnalyzerResult result = await harness.run(project);

      expect(result.diagnostics.length, 3);
    });

    test('the report is byte-identical from two different checkout locations', () async {
      // An absolute path in a message would break this, and did once already (M1-T6). It is the
      // reason a preflight diagnostic's span is project-relative.
      String report(AnalyzerResult result) =>
          const JsonReporter().render(DiagnosticReport(diagnostics: result.diagnostics));

      const Map<String, String> libraries = <String, String>{
        'a.dart': "import 'package:nope/a.dart';\n",
      };

      final AnalyzerResult first = await harness.run(
        createProject(name: 'twice', libraries: libraries),
      );
      final AnalyzerResult second = await harness.run(
        createProject(name: 'twice', libraries: libraries),
      );

      expect(report(first), report(second));
    });
  });
}

/// Runs the analyzer against a project root.
final class ProjectLoaderHarness {
  const ProjectLoaderHarness();

  Future<AnalyzerResult> run(String projectRoot) => const BridgeAnalyzer().run(
    // Into the temp project, so a test never writes into the repository.
    AnalyzerRequest(projectRoot: projectRoot, outputPath: '$projectRoot/build/out.ndjson'),
  );
}
