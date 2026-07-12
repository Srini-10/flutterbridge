/// The analysis session: parsing, directives, and the digest seam.
@TestOn('vm')
library;

import 'package:bridge_analyzer/src/cache/module_artifact.dart';
import 'package:bridge_analyzer/src/incremental/incremental_analyzer.dart';
import 'package:bridge_analyzer/src/model/directive_ref.dart';
import 'package:bridge_analyzer/src/session/directive_scanner.dart';
import 'package:bridge_analyzer/src/session/session_digest_provider.dart';
import 'package:bridge_analyzer/src/session/source_parser.dart';
import 'package:test/test.dart';

const SourceParser parser = SourceParser();
const DirectiveScanner scanner = DirectiveScanner();

List<DirectiveRef> directivesOf(String source) =>
    scanner.scan(parser.parse(path: 'lib/a.dart', source: source));

void main() {
  group('the directive scanner', () {
    test('finds imports, exports and parts, in source order', () {
      final List<DirectiveRef> found = directivesOf('''
library;
import 'dart:async';
import 'package:flutter/material.dart';
export 'src/a.dart';
part 'a.g.dart';
''');

      expect(
        found.map((DirectiveRef d) => '${d.kind.name}:${d.uri}'),
        orderedEquals(<String>[
          'import:dart:async',
          'import:package:flutter/material.dart',
          'export:src/a.dart',
          'part:a.g.dart',
        ]),
      );
    });

    test('finds every URI of a conditional import', () {
      // `import 'stub.dart' if (dart.library.io) 'io.dart';` names two files, and both must exist:
      // which one is chosen depends on the platform being compiled for, not on the analyzer.
      final List<DirectiveRef> found = directivesOf(
        "import 'stub.dart' if (dart.library.io) 'io.dart' if (dart.library.js) 'web.dart';\n",
      );

      expect(found.map((DirectiveRef d) => d.uri), <String>['stub.dart', 'io.dart', 'web.dart']);
    });

    test('spans point at the URI, not the line', () {
      final DirectiveRef found = directivesOf("// a comment\nimport 'x.dart';\n").single;

      expect(found.span.line, 2);
      expect(found.span.column, 8, reason: 'the opening quote of the string literal');
      expect(found.span.length, "'x.dart'".length);
    });

    test('a file that does not parse still yields the directives that do', () {
      // The user's own `dart analyze` is a better reporter of a syntax error than we would be. What we
      // must not do is throw away the directives we *can* see because of one we cannot.
      final List<DirectiveRef> found = directivesOf("import 'a.dart';\nclass Broken {\n");

      expect(found.single.uri, 'a.dart');
    });

    test('ignores directives that name no file', () {
      expect(directivesOf("library foo;\npart of 'a.dart';\n"), isEmpty);
    });
  });

  group('the digest provider', () {
    test('is structurally a DigestProvider — the seam M1-T5 left open', () {
      // The `session` layer may not import `incremental`, and does not. The typedef is a function
      // type, so the fit is structural, and `pipeline` is the only layer that sees both sides. If this
      // assignment ever stops compiling, the seam has drifted.
      final SessionDigestProvider provider = SessionDigestProvider(packageName: 'app');
      final DigestProvider seam = provider.digest;

      final FileDigest digest = seam('lib/a.dart', 'int f() => 1;\n');
      expect(digest.path, 'lib/a.dart');
      expect(digest.apiFingerprint, isNotEmpty);
    });

    test('an edit to a body changes impl but not api — the whole point of the split', () {
      final SessionDigestProvider provider = SessionDigestProvider(packageName: 'app');

      final FileDigest before = provider.digest('lib/a.dart', 'int f() => 1;\n');
      final FileDigest after = provider.digest('lib/a.dart', 'int f() => 2;\n');

      expect(after.apiFingerprint, before.apiFingerprint);
      expect(after.implFingerprint, isNot(before.implFingerprint));
      expect(after.contentHash, isNot(before.contentHash));
    });

    test('an import of the analyzed package itself is recorded as an internal dependency', () {
      final SessionDigestProvider provider = SessionDigestProvider(packageName: 'app');

      final FileDigest digest = provider.digest(
        'lib/a.dart',
        "import 'package:app/b.dart';\nimport 'package:flutter/material.dart';\n",
      );

      expect(
        digest.imports,
        <String>['lib/b.dart'],
        reason: 'a third-party import cannot change during a build; an internal one can',
      );
    });
  });
}
