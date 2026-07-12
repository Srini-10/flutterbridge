/// Incremental analysis and the cache.
///
/// The test that matters is `incremental == clean`. Everything else here exists to make its failures
/// diagnosable.
@TestOn('vm')
library;

import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:bridge_analyzer/src/cache/analysis_cache.dart';
import 'package:bridge_analyzer/src/cache/cache_key.dart';
import 'package:bridge_analyzer/src/cache/cas.dart';
import 'package:bridge_analyzer/src/cache/content_hash.dart';
import 'package:bridge_analyzer/src/cache/module_artifact.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/emit/ndjson_emitter.dart';
import 'package:bridge_analyzer/src/emit/record_writer.dart';
import 'package:bridge_analyzer/src/incremental/change_set.dart';
import 'package:bridge_analyzer/src/incremental/dependency_graph.dart';
import 'package:bridge_analyzer/src/incremental/incremental_analyzer.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// A stand-in for extraction (M1-T8).
//
// It is deliberately dumb: one `sig.Signal` per declared symbol, plus one `ui.Text` carrying the
// file's body text. What it produces is irrelevant to what is being tested — *whether* a file needs
// re-extracting is the only question the incremental machinery answers, and the stub lets us count
// the answer exactly.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/// A source file, as the fake project sees it.
final class Fake {
  Fake({required this.api, required this.body, this.imports = const <String>[]});

  /// The exported surface — changing it must rebuild dependents.
  String api;

  /// The implementation — changing it must NOT rebuild dependents.
  String body;

  /// Project files imported.
  List<String> imports;

  String get source {
    final StringBuffer buffer = StringBuffer();
    for (final String import in imports) {
      buffer.writeln("import '${p.relative(import, from: 'lib')}';");
    }
    buffer
      ..writeln('class Api { void $api() {} }')
      ..writeln('void run() { $body }');
    return buffer.toString();
  }
}

/// Counts how often each file was extracted.
final class CountingExtractor {
  final Map<String, int> calls = <String, int>{};

  Future<List<RawNode>> call(String path, String source) async {
    calls[path] = (calls[path] ?? 0) + 1;

    final SourceSpan span = SourceSpan(file: path, line: 1, column: 1);
    return <RawNode>[
      // A declaration, so cross-file references have something to point at.
      RawNode(
        kind: 'sig.Signal',
        span: span,
        symbol: 'sig:$path',
        fields: const <String, RawValue>{
          'type': RawMap(<String, RawValue>{'name': RawLiteral('bool')}),
          'scope': RawLiteral('component'),
        },
      ),
      // Something whose content depends on the file's text, so a body edit changes the output.
      RawNode(
        kind: 'ui.Text',
        span: span,
        fields: <String, RawValue>{
          'value': RawChild(
            RawNode(
              kind: 'bind.Const',
              span: span,
              fields: <String, RawValue>{'value': RawLiteral(source.hashCode.toString())},
            ),
          ),
        },
      ),
    ];
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────

/// A digest provider that does not need the analyzer: it reads the fake file's own structure.
///
/// The real one (`session/unit_digest.dart`) parses Dart. This one is exercised by the digest tests
/// against real source; here we only need the fingerprints to move when the right things move.
FileDigest fakeDigest(String path, String source) {
  final List<String> lines = source.split('\n');
  final String api = lines.firstWhere((String l) => l.startsWith('class Api'), orElse: () => '');
  final String body = lines.firstWhere((String l) => l.startsWith('void run'), orElse: () => '');
  final List<String> imports =
      lines
          .where((String l) => l.startsWith('import '))
          .map((String l) => p.normalize(p.join('lib', l.split("'")[1])))
          .toList()
        ..sort();

  return FileDigest(
    path: path,
    contentHash: hashString(source),
    apiFingerprint: hashString(api),
    implFingerprint: hashString(body),
    imports: imports,
  );
}

/// One project, analyzed repeatedly against one cache.
final class Harness {
  Harness() {
    final Directory dir = Directory.systemTemp.createTempSync('incr_');
    addTearDown(() => dir.deleteSync(recursive: true));
    root = dir.path;
    cache = AnalysisCache(store: ContentAddressableStore(p.join(root, '.bridge/cache/cas')));
  }

  late final String root;
  late final AnalysisCache cache;
  final CountingExtractor extractor = CountingExtractor();

  Future<IncrementalResult> analyze(Map<String, Fake> files, {AnalysisCache? using}) {
    final Map<String, String> sources = <String, String>{
      for (final MapEntry<String, Fake> e in files.entries) e.key: e.value.source,
    };
    return IncrementalAnalyzer(
      cache: using ?? cache,
      digestProvider: fakeDigest,
      extractor: extractor.call,
    ).analyze(sources, DiagnosticSink());
  }

  /// The emitted bytes for [files] — what a consumer downstream would actually receive.
  Future<List<int>> emit(Map<String, Fake> files, {AnalysisCache? using}) async {
    final IncrementalResult result = await analyze(files, using: using);
    expect(result.program, isNotNull);

    final Directory outDir = Directory.systemTemp.createTempSync('out_');
    final WrittenOutput? written = const NdjsonEmitter().emit(
      program: result.program!,
      outputPath: p.join(outDir.path, 'program.ndjson'),
      diagnostics: DiagnosticSink(),
    );
    final List<int> bytes = File(written!.documentPath).readAsBytesSync();
    outDir.deleteSync(recursive: true);
    return bytes;
  }

  /// A cache with nothing in it — a clean build.
  AnalysisCache get coldCache {
    final Directory dir = Directory.systemTemp.createTempSync('cold_');
    addTearDown(() => dir.deleteSync(recursive: true));
    return AnalysisCache(store: ContentAddressableStore(p.join(dir.path, 'cas')));
  }
}

Map<String, Fake> project() => <String, Fake>{
  'lib/base.dart': Fake(api: 'baseApi', body: 'print(1);'),
  'lib/middle.dart': Fake(api: 'middleApi', body: 'print(2);', imports: <String>['lib/base.dart']),
  'lib/leaf.dart': Fake(api: 'leafApi', body: 'print(3);', imports: <String>['lib/middle.dart']),
  'lib/lonely.dart': Fake(api: 'lonelyApi', body: 'print(4);'),
};

void main() {
  group('the contract: incremental == clean', () {
    test('an implementation edit rebuilds one file, and the bytes match a clean build', () async {
      final Harness h = Harness();
      final Map<String, Fake> files = project();

      await h.emit(files); // warm the cache
      h.extractor.calls.clear();

      files['lib/base.dart']!.body = 'print(99);';

      final List<int> incremental = await h.emit(files);
      final List<String> rebuilt = h.extractor.calls.keys.toList()..sort();
      final List<int> clean = await h.emit(files, using: h.coldCache);

      expect(
        rebuilt,
        <String>['lib/base.dart'],
        reason: 'a body edit is invisible to importers — nothing else may be rebuilt',
      );
      expect(incremental, clean, reason: 'THE contract (risk R8)');
    });

    test('an API edit rebuilds the file and its dependents, and the bytes still match', () async {
      final Harness h = Harness();
      final Map<String, Fake> files = project();

      await h.emit(files);
      h.extractor.calls.clear();

      files['lib/base.dart']!.api = 'renamedApi';

      final List<int> incremental = await h.emit(files);
      final List<String> rebuilt = h.extractor.calls.keys.toList()..sort();
      final List<int> clean = await h.emit(files, using: h.coldCache);

      expect(
        rebuilt,
        <String>['lib/base.dart', 'lib/leaf.dart', 'lib/middle.dart'],
        reason:
            'a surface change reaches every file that transitively imports it — and no further: '
            'lib/lonely.dart does not import it',
      );
      expect(incremental, clean);
    });

    test('adding a file rebuilds only it', () async {
      final Harness h = Harness();
      final Map<String, Fake> files = project();

      await h.emit(files);
      h.extractor.calls.clear();

      files['lib/added.dart'] = Fake(api: 'addedApi', body: 'print(5);');

      final List<int> incremental = await h.emit(files);
      final List<String> rebuilt = h.extractor.calls.keys.toList();
      final List<int> clean = await h.emit(files, using: h.coldCache);

      expect(rebuilt, <String>['lib/added.dart']);
      expect(incremental, clean);
    });

    test('removing a file rebuilds nothing, and its records disappear from the output', () async {
      final Harness h = Harness();
      final Map<String, Fake> files = project();

      final List<int> before = await h.emit(files);
      h.extractor.calls.clear();

      files.remove('lib/lonely.dart');

      final List<int> incremental = await h.emit(files);
      final Map<String, int> rebuilt = Map<String, int>.of(h.extractor.calls);
      final List<int> clean = await h.emit(files, using: h.coldCache);

      expect(rebuilt, isEmpty, reason: 'nothing that remains has changed');
      expect(incremental, clean);
      expect(incremental, isNot(before), reason: 'the removed file must be gone from the output');
    });

    test('no change at all rebuilds nothing', () async {
      final Harness h = Harness();
      final Map<String, Fake> files = project();

      await h.emit(files);
      h.extractor.calls.clear();

      final List<int> again = await h.emit(files);
      final Map<String, int> rebuilt = Map<String, int>.of(h.extractor.calls);
      final List<int> clean = await h.emit(files, using: h.coldCache);

      expect(rebuilt, isEmpty);
      expect(again, clean);
    });

    test('the order files are discovered in cannot reach the output', () async {
      final Harness h = Harness();
      final Map<String, Fake> files = project();

      final List<int> forwards = await h.emit(files, using: h.coldCache);
      final List<int> backwards = await h.emit(
        Map<String, Fake>.fromEntries(files.entries.toList().reversed),
        using: h.coldCache,
      );

      expect(forwards, backwards);
    });
  });

  group('digests and change detection', () {
    test('a body edit changes the impl fingerprint, not the API one', () async {
      final Fake file = Fake(api: 'a', body: 'print(1);');
      final FileDigest before = fakeDigest('lib/a.dart', file.source);

      file.body = 'print(2);';
      final FileDigest after = fakeDigest('lib/a.dart', file.source);

      expect(after.contentHash, isNot(before.contentHash));
      expect(after.implFingerprint, isNot(before.implFingerprint));
      expect(
        after.apiFingerprint,
        before.apiFingerprint,
        reason: 'importers cannot observe a body',
      );
    });

    test('the change set separates API changes from implementation changes', () async {
      final Map<String, Fake> files = project();
      final Map<String, FileDigest> before = <String, FileDigest>{
        for (final MapEntry<String, Fake> e in files.entries)
          e.key: fakeDigest(e.key, e.value.source),
      };

      files['lib/base.dart']!.api = 'changed';
      files['lib/middle.dart']!.body = 'changed';
      files.remove('lib/lonely.dart');
      files['lib/new.dart'] = Fake(api: 'n', body: 'n');

      final Map<String, FileDigest> after = <String, FileDigest>{
        for (final MapEntry<String, Fake> e in files.entries)
          e.key: fakeDigest(e.key, e.value.source),
      };

      final ChangeSet changes = ChangeSet.between(before, after);

      expect(changes.apiChanged, <String>['lib/base.dart']);
      expect(changes.implChanged, <String>['lib/middle.dart']);
      expect(changes.removed, <String>['lib/lonely.dart']);
      expect(changes.added, <String>['lib/new.dart']);
      expect(changes.unchanged, <String>['lib/leaf.dart']);
    });
  });

  group('the dependency graph', () {
    test('finds transitive dependencies and dependents', () async {
      final Map<String, Fake> files = project();
      final DependencyGraph graph = DependencyGraph(<String, FileDigest>{
        for (final MapEntry<String, Fake> e in files.entries)
          e.key: fakeDigest(e.key, e.value.source),
      });

      expect(
        graph.transitiveDependenciesOf('lib/leaf.dart'),
        <String>['lib/base.dart', 'lib/middle.dart'],
      );
      expect(
        graph.transitiveDependentsOf('lib/base.dart'),
        <String>['lib/leaf.dart', 'lib/middle.dart'],
      );
      expect(graph.transitiveDependentsOf('lib/lonely.dart'), isEmpty);
    });

    test('an import cycle terminates instead of recursing forever', () async {
      // Dart allows two libraries to import each other, and real projects do it.
      final Map<String, FileDigest> digests = <String, FileDigest>{
        'lib/a.dart': const FileDigest(
          path: 'lib/a.dart',
          contentHash: 'x',
          apiFingerprint: 'x',
          implFingerprint: 'x',
          imports: <String>['lib/b.dart'],
        ),
        'lib/b.dart': const FileDigest(
          path: 'lib/b.dart',
          contentHash: 'y',
          apiFingerprint: 'y',
          implFingerprint: 'y',
          imports: <String>['lib/a.dart'],
        ),
      };
      final DependencyGraph graph = DependencyGraph(digests);

      expect(graph.transitiveDependenciesOf('lib/a.dart'), <String>['lib/b.dart']);
      expect(graph.transitiveDependentsOf('lib/a.dart'), <String>['lib/b.dart']);
    });
  });

  group('the store', () {
    test('a corrupt entry is a miss, never a wrong answer', () async {
      final Directory dir = Directory.systemTemp.createTempSync('cas_');
      addTearDown(() => dir.deleteSync(recursive: true));

      final ContentAddressableStore store = ContentAddressableStore(dir.path);
      final CacheKey key = CacheKey.digest(const VersionContext(), 'abc');
      store.write(key, <int>[1, 2, 3]);
      expect(store.read(key), <int>[1, 2, 3]);

      // Something truncates the entry: a full disk, a killed process, a bad sector.
      File(store.pathFor(key)).writeAsBytesSync(<int>[1, 2]);

      expect(
        store.read(key),
        isNull,
        reason: 'the cache may make the compiler slower; it may never make it wrong',
      );
      expect(store.contains(key), isFalse, reason: 'and the bad entry is dropped');
    });

    test('a changed schema hash invalidates every key', () async {
      const VersionContext before = VersionContext(schemaHash: 'aaaa');
      const VersionContext after = VersionContext(schemaHash: 'bbbb');

      expect(
        CacheKey.module(before, 'content', const <String>[]),
        isNot(CacheKey.module(after, 'content', const <String>[])),
        reason:
            'a schema edited without a version bump is exactly when a stale cache is most '
            'convincing and most wrong',
      );
    });

    test('key parts cannot be confused with one another', () async {
      // Without length-prefixing, ['ab','c'] and ['a','bc'] would hash identically.
      expect(
        CacheKey.module(const VersionContext(), 'ab', const <String>['c']),
        isNot(CacheKey.module(const VersionContext(), 'a', const <String>['bc'])),
      );
    });

    test('prune evicts least-recently-used entries down to the budget', () async {
      final Directory dir = Directory.systemTemp.createTempSync('cas_');
      addTearDown(() => dir.deleteSync(recursive: true));

      final ContentAddressableStore store = ContentAddressableStore(dir.path);
      for (int i = 0; i < 10; i++) {
        store.write(
          CacheKey.digest(const VersionContext(), 'entry$i'),
          List<int>.filled(1000, 0),
        );
      }

      expect(store.size(), 10000);
      final int evicted = store.prune(maxBytes: 5000);

      expect(evicted, 5);
      expect(store.size(), lessThanOrEqualTo(5000));
    });
  });

  group('cross-file references', () {
    test('a rebuilt file resolves a reference into a file that was NOT rebuilt', () async {
      // This is the property that makes per-file caching possible: a declaration's id comes from its
      // symbol, so the cached file and the rebuilt one agree without ever meeting.
      final Harness h = Harness();
      final Map<String, Fake> files = project();

      final IncrementalResult first = await h.analyze(files);
      expect(first.program, isNotNull);

      files['lib/leaf.dart']!.body = 'print(42);';
      final IncrementalResult second = await h.analyze(files);

      expect(second.rebuilt, <String>['lib/leaf.dart']);
      expect(second.program, isNotNull, reason: 'no BRG1201 for symbols owned by cached files');

      final Set<String> firstIds = first.program!.nodes
          .map((uir.UirNode n) => n.toJson()['id']! as String)
          .toSet();
      final Set<String> secondIds = second.program!.nodes
          .map((uir.UirNode n) => n.toJson()['id']! as String)
          .toSet();

      expect(
        firstIds.difference(secondIds).length,
        lessThanOrEqualTo(1),
        reason: "only the edited file's content-addressed node may change id",
      );
    });
  });

  group('cache statistics', () {
    test('a warm build parses nothing and extracts nothing', () async {
      final Harness h = Harness();
      final Map<String, Fake> files = project();

      await h.analyze(files);
      final AnalysisCache warm = AnalysisCache(
        store: ContentAddressableStore(p.join(h.root, '.bridge/cache/cas')),
      );
      final IncrementalResult second = await h.analyze(files, using: warm);

      expect(second.stats.digestMisses, 0, reason: 'no file is parsed twice');
      expect(second.stats.extracted, 0, reason: 'no file is extracted twice');
      expect(second.stats.moduleHits, files.length);
    });
  });
}
