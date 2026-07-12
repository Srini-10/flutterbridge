/// The diagnostics and reporting contract.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:test/test.dart';

const SourceSpan span = SourceSpan(file: 'lib/a.dart', line: 2, column: 5, length: 4);
const SourceSpan other = SourceSpan(file: 'lib/b.dart', line: 9, column: 1);

const MapSourceProvider sources = MapSourceProvider(<String, String>{
  'lib/a.dart': 'void main() {\n    foo();\n}\n',
});

Diagnostic errorAt(SourceSpan at, {String message = 'Something is wrong.'}) => Diagnostic(
  code: Codes.unresolvedReference,
  message: message,
  span: at,
  hint: 'Do this instead.',
  related: const <RelatedLocation>[
    RelatedLocation(span: other, message: 'first declared here'),
  ],
  fixes: const <FixSuggestion>[
    FixSuggestion(description: 'rename it', span: span, replacement: 'bar'),
  ],
);

DiagnosticReport reportOf(List<Diagnostic> diagnostics) {
  final DiagnosticSink sink = DiagnosticSink()..addAll(diagnostics);
  return DiagnosticReport(diagnostics: sink.sorted());
}

void main() {
  group('the registry', () {
    test('every code carries a title and an explanation', () {
      for (final DiagnosticCode code in Codes.all) {
        expect(code.id, matches(RegExp(r'^BRG\d{4}$')));
        expect(code.title, isNotEmpty, reason: '${code.id} has no title');
        expect(code.explanation, isNotEmpty, reason: '${code.id} has no explanation');
        expect(code.docsSlug, isNotEmpty);
      }
    });

    test('a title is not a message: it never names a specific occurrence', () {
      // Titles belong to the code, messages to the occurrence. A title with a quoted symbol in it is
      // a message that wandered into the registry.
      for (final DiagnosticCode code in Codes.all) {
        expect(code.title, isNot(contains('"')), reason: '${code.id} title looks like a message');
        expect(code.title.length, lessThan(60), reason: '${code.id} title is too long to scan');
      }
    });
  });

  group('explain — offline documentation', () {
    test('explains a code without a network, a docs site, or a project', () {
      final String? text = const Explainer().explain('BRG0102');

      expect(text, isNotNull);
      expect(text, contains('BRG0102'));
      expect(text, contains('Dependencies have not been fetched'));
      expect(text, contains('flutter pub get'), reason: 'it must say what to actually do');
      expect(text, contains('Severity: error'));
    });

    test('is case-insensitive, because nobody types codes in caps', () {
      expect(const Explainer().explain('brg1201'), isNotNull);
    });

    test('an unknown code is an error, not an empty answer', () {
      expect(const Explainer().explain('BRG9999'), isNull);
    });

    test('lists every code in ascending order', () {
      final List<String> lines = const Explainer().list().trim().split('\n');

      expect(lines.length, Codes.all.length);
      final List<String> ids = lines.map((String l) => l.split('  ').first).toList();
      expect(ids, orderedEquals(List<String>.of(ids)..sort()));
    });
  });

  group('the human reporter', () {
    test('shows the offending line with a caret under the span', () {
      final String out = const HumanReporter(sources: sources).render(
        reportOf(<Diagnostic>[
          errorAt(span),
        ]),
      );

      expect(out, contains('error[BRG1201]: Unresolved reference'));
      expect(out, contains('--> lib/a.dart:2:5'));
      expect(out, contains('    foo();'), reason: 'the source line itself');
      expect(out, contains('^^^^'), reason: "a caret of the span's width");
      expect(out, contains('= help: Do this instead.'));
      expect(out, contains('= note: lib/b.dart:9:1: first declared here'));
      expect(out, contains('= fix: rename it'));
      expect(out, contains('= docs: bridge_analyzer explain BRG1201'));
    });

    test('renders usefully when the source cannot be read', () {
      // From a cache, from another machine, from a CI job that already cleaned its workspace.
      final String out = const HumanReporter().render(reportOf(<Diagnostic>[errorAt(span)]));

      expect(out, contains('BRG1201'));
      expect(out, contains('Something is wrong.'));
      expect(out, contains('lib/a.dart:2:5'), reason: 'losing the excerpt must not lose the where');
    });

    test('renders a diagnostic that has no location at all', () {
      final String out = const HumanReporter().render(
        reportOf(<Diagnostic>[
          Diagnostic(code: Codes.noPubspec, message: 'No pubspec.yaml in /tmp/x.'),
        ]),
      );

      expect(out, contains('BRG0101'));
      expect(out, contains('No pubspec.yaml in /tmp/x.'));
    });

    test('summarises', () {
      final String out = const HumanReporter().render(
        reportOf(<Diagnostic>[
          errorAt(span),
          Diagnostic(code: Codes.noPubspec, message: 'x', severity: Severity.warning),
        ]),
      );

      expect(out, contains('1 error, 1 warning found.'));
    });

    test('says so when there is nothing to say', () {
      expect(const HumanReporter().render(reportOf(<Diagnostic>[])), 'No issues found.\n');
    });

    test('emits no colour unless asked — colour is noise in a log file', () {
      final String plain = const HumanReporter().render(reportOf(<Diagnostic>[errorAt(span)]));
      final String coloured = const HumanReporter(
        colour: true,
      ).render(reportOf(<Diagnostic>[errorAt(span)]));

      expect(plain, isNot(contains('\x1B[')));
      expect(coloured, contains('\x1B[31m'));
    });
  });

  group('the machine reporter', () {
    test('emits the committed shape', () {
      final String out = const JsonReporter().render(reportOf(<Diagnostic>[errorAt(span)]));
      final Map<String, dynamic> json = jsonDecode(out) as Map<String, dynamic>;

      expect(json['reportVersion'], reportVersion);
      expect((json['tool']! as Map<String, dynamic>)['name'], 'bridge_analyzer');
      expect((json['summary']! as Map<String, dynamic>)['errors'], 1);
      expect((json['summary']! as Map<String, dynamic>)['total'], 1);

      final Map<String, dynamic> d =
          (json['diagnostics']! as List<dynamic>).single as Map<String, dynamic>;
      expect(d['code'], 'BRG1201');
      expect(d['severity'], 'error');
      expect(d['category'], 'extraction');
      expect(d['title'], 'Unresolved reference');
      expect(d['message'], 'Something is wrong.');
      expect(d['docsSlug'], 'unresolved-reference');
      expect(d['location'], <String, Object?>{
        'column': 5,
        'file': 'lib/a.dart',
        'length': 4,
        'line': 2,
      });
      expect(d['hint'], 'Do this instead.');
      expect((d['related']! as List<dynamic>).length, 1);
      expect((d['fixes']! as List<dynamic>).single, <String, Object?>{
        'description': 'rename it',
        'location': <String, Object?>{'column': 5, 'file': 'lib/a.dart', 'length': 4, 'line': 2},
        'replacement': 'bar',
      });
    });

    test('omits absent fields rather than emitting nulls', () {
      final String out = const JsonReporter().render(
        reportOf(<Diagnostic>[
          Diagnostic(code: Codes.noPubspec, message: 'x'),
        ]),
      );
      final Map<String, dynamic> d =
          ((jsonDecode(out) as Map<String, dynamic>)['diagnostics']! as List<dynamic>).single
              as Map<String, dynamic>;

      expect(
        d.containsKey('location'),
        isFalse,
        reason: 'absent and null are different statements',
      );
      expect(d.containsKey('hint'), isFalse);
      expect(d.containsKey('related'), isFalse);
      expect(d.containsKey('fixes'), isFalse);
    });

    test('is canonical: keys sorted, no whitespace variance', () {
      final String out = const JsonReporter().render(reportOf(<Diagnostic>[errorAt(span)]));

      expect(out.trim(), isNot(contains('  ')), reason: 'indentation is not information');
      final Map<String, dynamic> json = jsonDecode(out) as Map<String, dynamic>;
      expect(json.keys.toList(), orderedEquals(List<String>.of(json.keys)..sort()));
    });

    test('is byte-identical across runs — no timestamp, no hostname', () {
      String run() => const JsonReporter().render(reportOf(<Diagnostic>[errorAt(span)]));
      expect(run(), run());
    });

    test('the committed schema describes every field the reporter emits', () {
      // INV-16: the JSON shape is a committed schema. A field the reporter emits but the schema does
      // not describe is a contract a consumer cannot rely on.
      final Map<String, dynamic> schema =
          jsonDecode(File('schema/diagnostic-report.schema.json').readAsStringSync())
              as Map<String, dynamic>;
      final Map<String, dynamic> defs = schema[r'$defs']! as Map<String, dynamic>;
      final Map<String, dynamic> diagnostic = defs['diagnostic']! as Map<String, dynamic>;
      final Set<String> described = (diagnostic['properties']! as Map<String, dynamic>).keys
          .toSet();

      final String out = const JsonReporter().render(reportOf(<Diagnostic>[errorAt(span)]));
      final Map<String, dynamic> emitted =
          ((jsonDecode(out) as Map<String, dynamic>)['diagnostics']! as List<dynamic>).single
              as Map<String, dynamic>;

      expect(
        emitted.keys.toSet().difference(described),
        isEmpty,
        reason: 'the reporter emits a field the committed schema does not describe',
      );
      expect(
        (schema['properties']! as Map<String, dynamic>).keys.toSet(),
        containsAll(<String>['reportVersion', 'tool', 'summary', 'diagnostics']),
      );
    });
  });

  group('ordering is part of the contract', () {
    test('the report order does not depend on the order diagnostics were produced', () {
      String render(List<Diagnostic> diagnostics) =>
          const JsonReporter().render(reportOf(diagnostics));

      final List<Diagnostic> a = <Diagnostic>[
        errorAt(const SourceSpan(file: 'lib/z.dart', line: 1, column: 1)),
        errorAt(const SourceSpan(file: 'lib/a.dart', line: 9, column: 1)),
        errorAt(const SourceSpan(file: 'lib/a.dart', line: 2, column: 1)),
      ];

      expect(
        render(a),
        render(a.reversed.toList()),
        reason: 'a CI job that diffs two reports must not see traversal order',
      );
    });
  });

  group('the CLI', () {
    test('explain works with no project at all', () {
      final ProcessResult result = Process.runSync('dart', <String>[
        'run',
        'bin/bridge_analyzer.dart',
        'explain',
        'BRG1201',
      ]);

      expect(result.exitCode, ExitCodes.ok);
      expect(result.stdout, contains('Unresolved reference'));
    });

    test('an unknown code exits non-zero rather than printing nothing', () {
      final ProcessResult result = Process.runSync('dart', <String>[
        'run',
        'bin/bridge_analyzer.dart',
        'explain',
        'BRG9999',
      ]);

      expect(result.exitCode, isNot(ExitCodes.ok));
      expect(result.stderr, contains('is not a diagnostic code'));
    });

    test('--format json puts the report on stdout, and nothing else', () {
      // A CI job pipes stdout into a file and expects JSON in it. A progress message in the middle
      // of that JSON is how a pipeline breaks.
      final Directory dir = Directory.systemTemp.createTempSync('cli_');
      addTearDown(() => dir.deleteSync(recursive: true));
      File('${dir.path}/pubspec.yaml').writeAsStringSync('name: broken\n');

      final ProcessResult result = Process.runSync('dart', <String>[
        'run',
        'bin/bridge_analyzer.dart',
        '--project',
        dir.path,
        '--out',
        '${dir.path}/out.ndjson',
        '--format',
        'json',
      ]);

      expect(result.exitCode, ExitCodes.environmentFailure);

      final Map<String, dynamic> json = jsonDecode(result.stdout as String) as Map<String, dynamic>;
      expect(json['reportVersion'], reportVersion);
      expect(
        ((json['diagnostics']! as List<dynamic>).single as Map<String, dynamic>)['code'],
        'BRG0102',
      );
    });
  });
}
