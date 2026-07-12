/// The NDJSON emitter — the serialization boundary.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:bridge_analyzer/src/builder/canonical_builder.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/emit/ndjson_emitter.dart';
import 'package:bridge_analyzer/src/emit/output_manifest.dart';
import 'package:bridge_analyzer/src/emit/record_writer.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

const SourceSpan span = SourceSpan(file: 'lib/a.dart', line: 10, column: 3);

/// A `ui.Text` record. [value] is put through the emitter, so it doubles as a UTF-8 probe.
RawNode textRecord(String value) => RawNode(
  kind: 'ui.Text',
  span: span,
  fields: <String, RawValue>{
    'value': RawChild(
      RawNode(
        kind: 'bind.Const',
        span: span,
        fields: <String, RawValue>{'value': RawLiteral(value)},
      ),
    ),
  },
);

RawNode signal(String symbol) => RawNode(
  kind: 'sig.Signal',
  span: span,
  symbol: symbol,
  fields: const <String, RawValue>{
    'type': RawMap(<String, RawValue>{'name': RawLiteral('bool')}),
    'scope': RawLiteral('component'),
  },
);

RawNode store(String symbol, List<String> signals) => RawNode(
  kind: 'app.Store',
  span: span,
  symbol: symbol,
  fields: <String, RawValue>{
    'name': RawLiteral(symbol.split(':').last),
    'origin': const RawLiteral('declared'),
    'signals': RawList(signals.map(RawRef.new).toList()),
  },
);

/// Builds a canonical program, which is the only legal input to the emitter.
CanonicalProgram programOf(List<RawNode> records) {
  final CanonicalProgram? program = const CanonicalBuilder().build(records, DiagnosticSink());
  expect(program, isNotNull, reason: 'the fixture must be a valid graph');
  return program!;
}

/// Emits into a fresh temp directory and hands back what landed on disk.
({WrittenOutput? output, DiagnosticSink diagnostics, String dir}) emit(
  CanonicalProgram program, {
  String name = 'program.l2.ndjson',
}) {
  final Directory dir = Directory.systemTemp.createTempSync('emit_');
  addTearDown(() => dir.deleteSync(recursive: true));

  final DiagnosticSink diagnostics = DiagnosticSink();
  final WrittenOutput? output = const NdjsonEmitter().emit(
    program: program,
    outputPath: p.join(dir.path, name),
    diagnostics: diagnostics,
  );
  return (output: output, diagnostics: diagnostics, dir: dir.path);
}

void main() {
  group('format', () {
    test('one node per line, LF-terminated, with no trailing blank line', () {
      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
        programOf(<RawNode>[signal('sig:a'), signal('sig:b'), textRecord('x')]),
      );
      final List<int> bytes = File(result.output!.documentPath).readAsBytesSync();
      final String text = utf8.decode(bytes);

      expect(result.output!.recordCount, 3);
      expect(text.split('\n').where((String l) => l.isNotEmpty).length, 3);
      expect(text.endsWith('\n'), isTrue, reason: 'exactly one newline after every record');
      expect(text.endsWith('\n\n'), isFalse, reason: 'and no trailing blank line');
      expect(bytes.where((int b) => b == 13), isEmpty, reason: 'LF only — never CRLF');
    });

    test('no pretty printing and no whitespace variance', () {
      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
        programOf(<RawNode>[textRecord('x')]),
      );
      final String line = File(result.output!.documentPath).readAsLinesSync().single;

      expect(line, isNot(contains('\n')));
      expect(line, isNot(contains('  ')), reason: 'whitespace is not information');
      expect(line.startsWith('{'), isTrue);
      expect(line.endsWith('}'), isTrue, reason: 'a line is a node and nothing else');
    });

    test('map keys are sorted in the serialized bytes', () {
      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
        programOf(<RawNode>[textRecord('x')]),
      );
      final String line = File(result.output!.documentPath).readAsLinesSync().single;
      final Map<String, dynamic> json = jsonDecode(line) as Map<String, dynamic>;

      expect(json.keys.toList(), orderedEquals(List<String>.of(json.keys)..sort()));
    });

    test('UTF-8: non-ASCII content survives the round trip byte for byte', () {
      // A currency sign, an accented letter, a CJK character, and an emoji.
      const String tricky = 'Ça coûte 5€ — 価格 🚀';
      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
        programOf(<RawNode>[textRecord(tricky)]),
      );

      final String line = utf8.decode(File(result.output!.documentPath).readAsBytesSync()).trim();
      final uir.UiText back = uir.UiText.fromJson(jsonDecode(line));

      expect((back.value as uir.ConstBinding).value, tricky);
    });
  });

  group('round-trip', () {
    test('every emitted line parses back into the node it came from', () {
      final CanonicalProgram program = programOf(<RawNode>[
        store('store:Cart', <String>['sig:a']),
        signal('sig:a'),
        textRecord('hello'),
      ]);
      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
        program,
      );

      final List<uir.UirNode> back = File(result.output!.documentPath)
          .readAsLinesSync()
          .where((String l) => l.isNotEmpty)
          .map((String l) => uir.uirNodeFromJson(jsonDecode(l)))
          .toList();

      expect(back.length, program.nodes.length);
      for (int i = 0; i < back.length; i++) {
        expect(back[i].toJson(), program.nodes[i].toJson());
      }
    });
  });

  group('determinism', () {
    test('two runs over the same program produce byte-identical documents', () {
      List<int> run() {
        final CanonicalProgram program = programOf(<RawNode>[
          store('store:Cart', <String>['sig:a', 'sig:b']),
          signal('sig:a'),
          signal('sig:b'),
          textRecord('x'),
        ]);
        final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
          program,
        );
        return File(result.output!.documentPath).readAsBytesSync();
      }

      expect(run(), run());
    });

    test('the order records were discovered in does not change the bytes', () {
      List<int> run(List<RawNode> records) {
        final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
          programOf(records),
        );
        return File(result.output!.documentPath).readAsBytesSync();
      }

      final List<RawNode> forwards = <RawNode>[signal('sig:a'), signal('sig:b'), textRecord('x')];
      final List<RawNode> backwards = forwards.reversed.toList();

      expect(run(forwards), run(backwards));
    });

    test('the manifest is byte-identical across runs — no timestamp, no hostname', () {
      List<int> run() {
        final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
          programOf(<RawNode>[textRecord('x')]),
        );
        return File(result.output!.manifestPath).readAsBytesSync();
      }

      expect(run(), run());
    });
  });

  group('manifest', () {
    test('records what produced the document', () {
      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
        programOf(<RawNode>[signal('sig:a'), textRecord('x')]),
      );

      final Map<String, dynamic> manifest =
          jsonDecode(File(result.output!.manifestPath).readAsLinesSync().single)
              as Map<String, dynamic>;

      expect(manifest['uirVersion'], uir.uirVersion);
      expect(manifest['schemaHash'], uir.uirSchemaHash);
      expect(manifest['recordCount'], 2);
      expect(manifest['buildVersion'], isNotEmpty);
      expect(manifest['format'], 'ndjson/1');
      expect(manifest['diagnosticCount'], 0);
    });

    test('is written beside the document, and its keys are sorted', () {
      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
        programOf(<RawNode>[textRecord('x')]),
      );

      expect(
        result.output!.manifestPath,
        p.join(result.dir, 'program.l2.manifest.json'),
      );

      final Map<String, dynamic> manifest =
          jsonDecode(File(result.output!.manifestPath).readAsLinesSync().single)
              as Map<String, dynamic>;
      expect(manifest.keys.toList(), orderedEquals(List<String>.of(manifest.keys)..sort()));
    });

    test('the build version it stamps is the one in pubspec.yaml', () {
      // The manifest claims which analyzer wrote the document. A stale claim is a false one, so the
      // constant is kept in step with the pubspec by this test rather than by discipline.
      final String declared = File(
        'pubspec.yaml',
      ).readAsLinesSync().firstWhere((String l) => l.startsWith('version:')).split(':').last.trim();

      expect(const OutputManifest(recordCount: 0, diagnosticCount: 0).buildVersion, declared);
    });
  });

  group('refusal — no partial output, ever', () {
    test('a dangling reference is BRG1207, and no file is created', () {
      // The program is built legally, then a signal is removed from it: the store still refers to it.
      final CanonicalProgram intact = programOf(<RawNode>[
        store('store:Cart', <String>['sig:a']),
        signal('sig:a'),
      ]);
      final CanonicalProgram holed = CanonicalProgram(
        nodes: intact.nodes.where((uir.UirNode n) => n is! uir.Signal).toList(),
      );

      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(holed);

      expect(result.output, isNull);
      expect(
        result.diagnostics.sorted().map((Diagnostic d) => d.code),
        contains(Codes.orphanReference),
      );
      expect(
        Directory(result.dir).listSync(),
        isEmpty,
        reason:
            'no document, no manifest, and no temp file — a partial NDJSON file is still valid '
            'NDJSON, so it would never be detected downstream',
      );
    });

    test('nodes out of canonical order are BRG1208, and nothing is written', () {
      final CanonicalProgram ordered = programOf(<RawNode>[signal('sig:a'), textRecord('x')]);
      final CanonicalProgram scrambled = CanonicalProgram(
        nodes: ordered.nodes.reversed.toList(),
      );

      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
        scrambled,
      );

      expect(result.output, isNull);
      expect(
        result.diagnostics.sorted().map((Diagnostic d) => d.code),
        contains(Codes.nonCanonicalOrder),
      );
      expect(Directory(result.dir).listSync(), isEmpty);
    });

    test('a refusal leaves any previous document untouched', () {
      final Directory dir = Directory.systemTemp.createTempSync('emit_');
      addTearDown(() => dir.deleteSync(recursive: true));
      final String path = p.join(dir.path, 'program.ndjson');

      // A good write.
      final DiagnosticSink first = DiagnosticSink();
      const NdjsonEmitter().emit(
        program: programOf(<RawNode>[textRecord('good')]),
        outputPath: path,
        diagnostics: first,
      );
      final List<int> before = File(path).readAsBytesSync();

      // A bad one to the same path.
      final CanonicalProgram intact = programOf(<RawNode>[
        store('store:Cart', <String>['sig:a']),
        signal('sig:a'),
      ]);
      final DiagnosticSink second = DiagnosticSink();
      final WrittenOutput? bad = const NdjsonEmitter().emit(
        program: CanonicalProgram(
          nodes: intact.nodes.where((uir.UirNode n) => n is! uir.Signal).toList(),
        ),
        outputPath: path,
        diagnostics: second,
      );

      expect(bad, isNull);
      expect(File(path).readAsBytesSync(), before, reason: 'the previous document survives intact');
    });
  });

  group('scale', () {
    test('a large graph streams out and reads back whole', () {
      final List<RawNode> records = List<RawNode>.generate(
        5000,
        (int i) => textRecord('node $i'),
      );

      final ({DiagnosticSink diagnostics, String dir, WrittenOutput? output}) result = emit(
        programOf(records),
      );

      // The nodes are distinct, so all 5000 survive interning.
      expect(result.output!.recordCount, 5000);

      final List<String> lines = File(
        result.output!.documentPath,
      ).readAsLinesSync().where((String l) => l.isNotEmpty).toList();
      expect(lines.length, 5000);

      // And every one of them is a node, not a truncated line.
      for (final String line in lines) {
        expect(() => uir.uirNodeFromJson(jsonDecode(line)), returnsNormally);
      }
    });
  });
}
