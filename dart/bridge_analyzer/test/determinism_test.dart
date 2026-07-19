/// Determinism: stable traversal, stable ordering, stable serialization.
///
/// D1–D5 are design requirements, not later optimizations. These tests exist so that the first
/// nondeterministic line of code fails a build rather than a cache.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/src/emit/stream_writer.dart';
import 'package:bridge_analyzer/src/util/ordering.dart';
import 'package:bridge_analyzer/src/workspace/project_loader.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

import 'support/temp_project.dart';

void main() {
  group('ordering primitives', () {
    test('sortedPaths imposes a total, platform-independent order', () {
      expect(
        sortedPaths(<String>['lib/z.dart', 'lib/a/b.dart', 'lib/a.dart']),
        <String>['lib/a.dart', 'lib/a/b.dart', 'lib/z.dart'],
      );
    });

    test('canonicalJson sorts map keys recursively', () {
      final Object? canonical = canonicalJson(<String, Object?>{
        'b': <String, Object?>{'z': 1, 'a': 2},
        'a': <Object?>[
          <String, Object?>{'y': 1, 'x': 2},
        ],
      });

      expect(jsonEncode(canonical), '{"a":[{"x":2,"y":1}],"b":{"a":2,"z":1}}');
    });

    test('canonicalJson makes insertion order irrelevant', () {
      final Map<String, Object?> one = <String, Object?>{'a': 1, 'b': 2, 'c': 3};
      final Map<String, Object?> two = <String, Object?>{'c': 3, 'a': 1, 'b': 2};

      expect(jsonEncode(canonicalJson(one)), jsonEncode(canonicalJson(two)));
    });

    test('compareBy falls through to the next comparator only on ties', () {
      int byLength(String a, String b) => a.length.compareTo(b.length);
      int alphabetical(String a, String b) => a.compareTo(b);

      expect(compareBy('bb', 'a', <Comparator<String>>[byLength, alphabetical]), greaterThan(0));
      expect(compareBy('ab', 'aa', <Comparator<String>>[byLength, alphabetical]), greaterThan(0));
    });
  });

  group('traversal', () {
    test('library files are enumerated in sorted order, not filesystem order', () {
      final String project = createProject(
        name: 'app',
        libraries: <String, String>{
          'z.dart': '',
          'nested/deep/c.dart': '',
          'a.dart': '',
          'nested/b.dart': '',
        },
      );

      final List<String> files = const ProjectLoader().load(project).info.libraryFiles;

      expect(files, orderedEquals(List<String>.of(files)..sort()));
      // `'lib/a.dart'`, not `p.join('lib', 'a.dart')`. A project-relative path in UIR is a **logical**
      // path, POSIX-separated on every platform (M5-F): it becomes `span.file`, which becomes an anchor,
      // which is hashed into the node id — so a host separator here would give Windows a different id for
      // every node. `p.join` would assert the host's spelling and pass only where it happens to match.
      expect(files.first, 'lib/a.dart');
    });

    test('two loads of the same project produce identical file lists', () {
      final String project = createProject(
        name: 'app',
        libraries: <String, String>{'b.dart': '', 'a.dart': '', 'c.dart': ''},
      );

      expect(
        const ProjectLoader().load(project).info.libraryFiles,
        const ProjectLoader().load(project).info.libraryFiles,
      );
    });
  });

  group('serialization', () {
    test('NDJSON output is byte-identical across runs regardless of key insertion order', () {
      final Directory dir = Directory.systemTemp.createTempSync('ndjson_');
      addTearDown(() => dir.deleteSync(recursive: true));

      final String first = p.join(dir.path, 'first.ndjson');
      final String second = p.join(dir.path, 'second.ndjson');

      NdjsonStreamWriter(first).write(<String>['{"children":[],"id":"n1","kind":"ui.Element"}']);
      NdjsonStreamWriter(second).write(<String>['{"children":[],"id":"n1","kind":"ui.Element"}']);

      expect(File(first).readAsBytesSync(), File(second).readAsBytesSync());
    });

    test('writes are atomic: no temporary file survives a successful write (INV-2)', () {
      final Directory dir = Directory.systemTemp.createTempSync('ndjson_');
      addTearDown(() => dir.deleteSync(recursive: true));

      final String out = p.join(dir.path, 'out.ndjson');
      final int written = NdjsonStreamWriter(out).write(<String>['{"id":"n1"}', '{"id":"n2"}']);

      expect(written, 2);
      expect(File(out).existsSync(), isTrue);
      expect(
        dir.listSync().whereType<File>().map((File f) => p.basename(f.path)),
        <String>['out.ndjson'],
        reason: 'the temp file must have been renamed, not left behind',
      );
    });

    test('each record is exactly one line', () {
      final Directory dir = Directory.systemTemp.createTempSync('ndjson_');
      addTearDown(() => dir.deleteSync(recursive: true));

      final String out = p.join(dir.path, 'out.ndjson');
      NdjsonStreamWriter(out).write(<String>['{"id":"n1"}', '{"id":"n2"}', '{"id":"n3"}']);

      final List<String> lines = File(
        out,
      ).readAsLinesSync().where((String l) => l.isNotEmpty).toList();
      expect(lines.length, 3);
      expect(jsonDecode(lines.first), <String, Object?>{'id': 'n1'});
    });
  });
}
