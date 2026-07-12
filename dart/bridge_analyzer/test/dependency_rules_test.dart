/// The Dart-side equivalent of the TypeScript domain's dependency-cruiser rules (Spec §1.2).
///
/// A layered architecture that is only documented is not layered. These rules are executable, they
/// run in CI, and they fail the build the first time someone imports upward.
@TestOn('vm')
library;

import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:test/test.dart';

/// The layer graph. A layer may import only the layers listed for it — nothing else, and never
/// itself upward.
///
/// `util` is deliberately empty: utilities remain dependency-free.
const Map<String, Set<String>> allowedDependencies = <String, Set<String>>{
  'util': <String>{},
  'model': <String>{'util'},
  'errors': <String>{'util'},
  'diagnostics': <String>{'model', 'errors', 'util'},
  'io': <String>{'util'},
  'cache': <String>{'io', 'util'},
  'builder': <String>{'diagnostics', 'errors', 'model', 'util'},
  'incremental': <String>{'builder', 'cache', 'diagnostics', 'errors', 'model', 'util'},
  'emit': <String>{'builder', 'diagnostics', 'errors', 'io', 'model', 'util'},
  'workspace': <String>{'diagnostics', 'errors', 'model', 'util'},
  // `diagnostics` was added in M1-T8: extraction is the first thing the session layer does that
  // can *find* something, and Spec §8 says a finding is a diagnostic, never an exception.
  'session': <String>{'cache', 'diagnostics', 'model', 'workspace', 'errors', 'util'},
  'pipeline': <String>{
    'builder',
    'cache',
    'emit',
    'incremental',
    'diagnostics',
    'errors',
    'io',
    'model',
    'session',
    'workspace',
    'util',
  },
};

void main() {
  final Directory srcDir = Directory(p.join('lib', 'src'));

  test('every source file lives in a declared layer', () {
    for (final File file in _dartFiles(srcDir)) {
      final String layer = _layerOf(file);
      expect(
        allowedDependencies.containsKey(layer),
        isTrue,
        reason:
            '${file.path} is in undeclared layer "$layer". '
            'Create modules the specification defines, not new ones.',
      );
    }
  });

  test('no layer imports a layer it is not allowed to', () {
    for (final File file in _dartFiles(srcDir)) {
      final String layer = _layerOf(file);
      final Set<String> allowed = allowedDependencies[layer]!;

      for (final String imported in _internalImports(file)) {
        if (imported == layer) {
          continue; // intra-layer imports are fine
        }
        expect(
          allowed.contains(imported),
          isTrue,
          reason:
              'Illegal import: "$layer" -> "$imported" in ${file.path}.\n'
              '"$layer" may only import: ${allowed.join(', ')}.',
        );
      }
    }
  });

  test('util is dependency-free', () {
    for (final File file in _dartFiles(Directory(p.join('lib', 'src', 'util')))) {
      expect(
        _internalImports(file).where((String layer) => layer != 'util'),
        isEmpty,
        reason: '${file.path} imports another layer. Utilities remain dependency-free (Spec §1.2).',
      );
    }
  });

  test('only the session layer may import package:analyzer', () {
    for (final File file in _dartFiles(srcDir)) {
      final bool importsAnalyzer = file.readAsStringSync().contains("import 'package:analyzer/");
      if (!importsAnalyzer) {
        continue;
      }
      expect(
        _layerOf(file),
        'session',
        reason:
            '${file.path} imports package:analyzer directly.\n'
            'ADR-14: the analyzer AST is quarantined in the session layer so that the next AST '
            'redesign is absorbable by editing one directory.',
      );
    }
  });

  test('there are no import cycles between layers', () {
    final Map<String, Set<String>> actual = <String, Set<String>>{};
    for (final File file in _dartFiles(srcDir)) {
      final String layer = _layerOf(file);
      actual
          .putIfAbsent(layer, () => <String>{})
          .addAll(
            _internalImports(file).where((String other) => other != layer),
          );
    }

    for (final String layer in actual.keys) {
      for (final String dependency in actual[layer] ?? <String>{}) {
        expect(
          actual[dependency]?.contains(layer) ?? false,
          isFalse,
          reason: 'Import cycle: "$layer" <-> "$dependency".',
        );
      }
    }
  });
}

List<File> _dartFiles(Directory dir) =>
    dir
        .listSync(recursive: true)
        .whereType<File>()
        .where((File f) => f.path.endsWith('.dart'))
        .toList()
      ..sort((File a, File b) => a.path.compareTo(b.path));

/// The layer a file belongs to: the directory directly under `lib/src`.
String _layerOf(File file) {
  final List<String> parts = p.split(p.relative(file.path, from: p.join('lib', 'src')));
  return parts.length == 1 ? 'src' : parts.first;
}

/// The layers this file imports from within the package.
Set<String> _internalImports(File file) {
  final RegExp importPattern = RegExp("import 'package:bridge_analyzer/src/([a-z_]+)/");
  return importPattern
      .allMatches(file.readAsStringSync())
      .map((RegExpMatch m) => m.group(1)!)
      .toSet();
}
