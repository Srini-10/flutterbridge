/// The diagnostics framework: codes, construction, and stable ordering.
@TestOn('vm')
library;

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:test/test.dart';

void main() {
  group('registry', () {
    test('every registered code has a unique id', () {
      final Set<String> ids = Codes.all.map((DiagnosticCode c) => c.id).toSet();
      expect(ids.length, Codes.all.length);
    });

    test('codes are enumerated in ascending id order', () {
      final List<String> ids = Codes.all.map((DiagnosticCode c) => c.id).toList();
      expect(ids, orderedEquals(List<String>.of(ids)..sort()));
    });

    test('every code carries a category, a default severity and a docs slug', () {
      for (final DiagnosticCode code in Codes.all) {
        expect(code.id, matches(RegExp(r'^BRG\d{4}$')));
        expect(code.docsSlug, isNotEmpty);
      }
    });

    test('lookup by id', () {
      expect(Codes.byId('BRG0102'), Codes.noPackageConfig);
      expect(Codes.byId('BRG9999'), isNull);
    });
  });

  group('construction', () {
    test('a diagnostic inherits its code default severity unless told otherwise', () {
      final Diagnostic inherited = Diagnostic(code: Codes.noPubspec, message: 'x');
      expect(inherited.severity, Codes.noPubspec.defaultSeverity);

      final Diagnostic overridden = Diagnostic(
        code: Codes.noPubspec,
        message: 'x',
        severity: Severity.warning,
      );
      expect(overridden.severity, Severity.warning);
    });

    test('the framework carries hints, related locations and fix suggestions', () {
      const SourceSpan span = SourceSpan(file: 'lib/a.dart', line: 3, column: 5, length: 4);
      final Diagnostic diagnostic = Diagnostic(
        code: Codes.noPubspec,
        message: 'message',
        span: span,
        hint: 'do this instead',
        related: const <RelatedLocation>[
          RelatedLocation(
            span: SourceSpan(file: 'lib/b.dart', line: 1, column: 1),
            message: 'declared here',
          ),
        ],
        fixes: const <FixSuggestion>[
          FixSuggestion(description: 'rename', span: span, replacement: 'newName'),
        ],
      );

      expect(diagnostic.hint, 'do this instead');
      expect(diagnostic.related.single.message, 'declared here');
      expect(diagnostic.fixes.single.replacement, 'newName');
    });

    test(
      'diagnostics are immutable: related and fixes cannot be mutated through the diagnostic',
      () {
        final Diagnostic diagnostic = Diagnostic(code: Codes.noPubspec, message: 'x');
        expect(
          () => diagnostic.related.add(
            const RelatedLocation(
              span: SourceSpan(file: 'a', line: 1, column: 1),
              message: 'nope',
            ),
          ),
          throwsUnsupportedError,
        );
      },
    );
  });

  group('ordering', () {
    test('diagnostics sort by file, line, column, then code — never by insertion order', () {
      final DiagnosticSink sink = DiagnosticSink()
        ..add(
          Diagnostic(
            code: Codes.noPubspec,
            message: 'third',
            span: const SourceSpan(file: 'lib/b.dart', line: 1, column: 1),
          ),
        )
        ..add(
          Diagnostic(
            code: Codes.noPubspec,
            message: 'second',
            span: const SourceSpan(file: 'lib/a.dart', line: 9, column: 1),
          ),
        )
        ..add(
          Diagnostic(
            code: Codes.noPubspec,
            message: 'first',
            span: const SourceSpan(file: 'lib/a.dart', line: 2, column: 4),
          ),
        );

      expect(
        sink.sorted().map((Diagnostic d) => d.message).toList(),
        <String>['first', 'second', 'third'],
      );
    });

    test('spanless diagnostics sort before located ones', () {
      final DiagnosticSink sink = DiagnosticSink()
        ..add(
          Diagnostic(
            code: Codes.noPubspec,
            message: 'located',
            span: const SourceSpan(file: 'lib/a.dart', line: 1, column: 1),
          ),
        )
        ..add(Diagnostic(code: Codes.noPackageConfig, message: 'project-wide'));

      expect(sink.sorted().first.message, 'project-wide');
    });

    test('sorting is stable across runs regardless of insertion order', () {
      List<String> order(List<int> insertion) {
        final DiagnosticSink sink = DiagnosticSink();
        for (final int i in insertion) {
          sink.add(
            Diagnostic(
              code: Codes.noPubspec,
              message: 'd$i',
              span: SourceSpan(file: 'lib/${String.fromCharCode(97 + i)}.dart', line: 1, column: 1),
            ),
          );
        }
        return sink.sorted().map((Diagnostic d) => d.message).toList();
      }

      expect(order(<int>[0, 1, 2]), order(<int>[2, 0, 1]));
      expect(order(<int>[0, 1, 2]), order(<int>[1, 2, 0]));
    });
  });
}
