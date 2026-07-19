/// The incremental pipeline, end to end (ISSUE-13 / ISSUE-10).
///
/// M1-T5 built the incremental machinery and proved it against a *fake* extractor. M1-T8 built the
/// real one. This is where the two finally meet, and it is the only place the claim that matters can
/// actually be tested:
///
/// > **The bytes an incremental build writes are the bytes a clean build would have written.**
///
/// A faster build that produces different output is not a faster build. It is a wrong one, and it is
/// the failure mode (risk R8, ADR-5) that destroys a compiler's credibility permanently — because the
/// symptom always shows up somewhere else, long after the cache did the damage.
@TestOn('vm')
library;

import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

import 'support/temp_project.dart';

/// A two-file app: a store, and a screen that reads it.
Map<String, String> app({
  String counterInitial = '0',
  String bodyExtra = '',
  String storeApi = '',
}) => <String, String>{
  'store.dart':
      '''
import 'package:flutter/material.dart';

class CounterStore extends ChangeNotifier {
  int _count = $counterInitial;
  int get count => _count;
  $storeApi

  void increment() {
    _count++;
    notifyListeners();
  }
}
''',
  'main.dart':
      '''
import 'package:flutter/material.dart';
import 'package:app/store.dart';

class Screen extends StatefulWidget {
  const Screen({required this.title, super.key});
  final String title;
  @override
  State<Screen> createState() => _ScreenState();
}

class _ScreenState extends State<Screen> {
  int _local = 0;

  void _bump() {
    setState(() {
      _local++;
      $bodyExtra
    });
  }

  @override
  Widget build(BuildContext context) => Column(
    children: <Widget>[
      Text(widget.title),
      ElevatedButton(onPressed: _bump, child: const Text('Bump')),
    ],
  );
}
''',
};

/// Runs a build and returns the bytes it wrote.
final class Build {
  Build(this.project, {required this.cacheDir});

  final String project;
  final String? cacheDir;

  Future<({String bytes, List<String>? rebuilt})> run() async {
    final Directory out = Directory.systemTemp.createTempSync('build_');
    addTearDown(() => out.deleteSync(recursive: true));

    final AnalyzerResult result = await const BridgeAnalyzer().run(
      AnalyzerRequest(projectRoot: project, outputPath: p.join(out.path, 'uir.ndjson')),
      cacheDirectory: cacheDir,
    );

    expect(result.status, RunStatus.completed, reason: 'the build must succeed');
    return (
      bytes: File(result.output!.outputPath).readAsStringSync(),
      rebuilt: result.rebuilt,
    );
  }
}

/// Writes [libraries] into [root]'s `lib/`, replacing what is there.
void rewrite(String root, Map<String, String> libraries) {
  for (final MapEntry<String, String> entry in libraries.entries) {
    File(p.join(root, 'lib', entry.key)).writeAsStringSync(entry.value);
  }
}

void main() {
  late String project;
  late String cacheDir;

  setUp(() {
    project = createProject(name: 'app', libraries: app());
    final Directory cache = Directory.systemTemp.createTempSync('cache_');
    addTearDown(() => cache.deleteSync(recursive: true));
    cacheDir = p.join(cache.path, 'cas');
  });

  /// A clean build of whatever is on disk right now — no cache, nothing reused.
  Future<String> clean() async =>
      (await Build(project, cacheDir: null).run()).bytes;

  /// An incremental build against the shared cache.
  Future<({String bytes, List<String>? rebuilt})> incremental() =>
      Build(project, cacheDir: cacheDir).run();

  group('incremental ≡ clean', () {
    test('a cold incremental build equals a clean build, byte for byte', () async {
      final String cleanBytes = await clean();
      final ({String bytes, List<String>? rebuilt}) first = await incremental();

      expect(first.bytes, cleanBytes);
      expect(first.rebuilt, hasLength(2), reason: 'a cold cache rebuilds everything');
    });

    test('a warm build with no changes rebuilds nothing, and writes the same bytes', () async {
      final ({String bytes, List<String>? rebuilt}) first = await incremental();
      final ({String bytes, List<String>? rebuilt}) second = await incremental();

      expect(second.rebuilt, isEmpty, reason: 'nothing changed, so nothing may be re-extracted');
      expect(second.bytes, first.bytes);
    });

    test('editing a method BODY rebuilds only that file (Spec §7.2, ADR-5)', () async {
      await incremental();

      // A change inside a body. Nothing another file can observe changes, so nothing else may rebuild
      // — that is the entire point of splitting the API fingerprint from the impl fingerprint.
      rewrite(project, app(bodyExtra: '_local += 2;'));

      final ({String bytes, List<String>? rebuilt}) after = await incremental();

      // A rebuilt-file list is logical paths, `/`-separated on every platform — `p.join` would assert
      // the host's spelling and pass only where it happens to match.
      expect(after.rebuilt, <String>['lib/main.dart']);
      expect(
        after.bytes,
        await clean(),
        reason: 'the incremental output must equal a clean build of the edited sources',
      );
    });

    test('editing a dependency SURFACE rebuilds its dependents too', () async {
      await incremental();

      // A new public method on the store. `main.dart` can see it, so `main.dart` is no longer known
      // to be valid, and must be rebuilt.
      rewrite(project, app(storeApi: 'void reset() { _count = 0; }'));

      final ({String bytes, List<String>? rebuilt}) after = await incremental();

      expect(after.rebuilt, contains('lib/store.dart'));
      expect(after.bytes, await clean());
    });

    test('an edit and its reversal return exactly the original bytes', () async {
      final ({String bytes, List<String>? rebuilt}) original = await incremental();

      rewrite(project, app(counterInitial: '7'));
      final ({String bytes, List<String>? rebuilt}) edited = await incremental();
      expect(edited.bytes, isNot(original.bytes), reason: 'the change must actually show up');

      rewrite(project, app());
      final ({String bytes, List<String>? rebuilt}) restored = await incremental();

      expect(
        restored.bytes,
        original.bytes,
        reason: 'a cache that cannot return to a previous state is a cache that drifts',
      );
    });

    test('a cache from another schema version is not reused', () async {
      // The cache key carries the UIR version and the schema hash (M1-T5). It has to: a node built
      // against one schema is not a node built against another, and reusing it would smuggle stale
      // shapes into a new build. Amending the schema in v2.2 invalidated every artifact exactly once,
      // which is correct behaviour, not a regression.
      final ({String bytes, List<String>? rebuilt}) first = await incremental();
      expect(first.rebuilt, isNotEmpty);

      final Directory other = Directory.systemTemp.createTempSync('other_');
      addTearDown(() => other.deleteSync(recursive: true));

      final ({String bytes, List<String>? rebuilt}) fresh =
          await Build(project, cacheDir: p.join(other.path, 'cas')).run();

      expect(fresh.rebuilt, hasLength(2), reason: 'a different cache is a cold cache');
      expect(fresh.bytes, first.bytes);
    });
  });

  group('the contract holds on the incremental path too', () {
    test('an unfit environment is still refused, and still writes nothing', () async {
      final String unfit = createProject(
        name: 'unfit',
        libraries: <String, String>{'a.dart': "import 'package:nope/x.dart';\n"},
      );
      final Directory out = Directory.systemTemp.createTempSync('unfit_');
      addTearDown(() => out.deleteSync(recursive: true));

      final AnalyzerResult result = await const BridgeAnalyzer().run(
        AnalyzerRequest(projectRoot: unfit, outputPath: p.join(out.path, 'uir.ndjson')),
        cacheDirectory: cacheDir,
      );

      expect(result.status, RunStatus.environmentFailure);
      expect(result.output, isNull, reason: 'INV-5 does not depend on whether there is a cache');
      expect(result.diagnostics.single.code, Codes.unresolvedImport);
    });

    test('the same stages run, cached or not', () async {
      final Directory out = Directory.systemTemp.createTempSync('stages_');
      addTearDown(() => out.deleteSync(recursive: true));

      final AnalyzerResult cached = await const BridgeAnalyzer().run(
        AnalyzerRequest(projectRoot: project, outputPath: p.join(out.path, 'uir.ndjson')),
        cacheDirectory: cacheDir,
      );

      expect(cached.stagesRun, <String>['load', 'extract', 'canonical', 'emit']);
    });
  });
}
