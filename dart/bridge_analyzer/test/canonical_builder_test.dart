/// The canonical builder.
@TestOn('vm')
library;

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:bridge_analyzer/src/builder/canonical_builder.dart';
import 'package:bridge_analyzer/src/builder/id_allocator.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;
import 'package:test/test.dart';

const SourceSpan spanA = SourceSpan(file: 'lib/a.dart', line: 10, column: 3);
const SourceSpan spanB = SourceSpan(file: 'lib/b.dart', line: 40, column: 7);

/// A `ui.Text` record whose value is a constant binding.
RawNode textRecord(String value, {String? anchor, SourceSpan span = spanA}) => RawNode(
  kind: 'ui.Text',
  span: span,
  anchorSegment: anchor,
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

/// A `sig.Signal` with a proper TypeRef value object (TypeRef is not a node, so it is a raw map).
RawNode signal(String symbol, {String? store, SourceSpan span = spanA}) => RawNode(
  kind: 'sig.Signal',
  span: span,
  symbol: symbol,
  fields: <String, RawValue>{
    'type': const RawMap(<String, RawValue>{'name': RawLiteral('bool')}),
    'scope': const RawLiteral('component'),
    if (store != null) 'store': RawRef(store),
  },
);

/// An `app.Store` declaration referring to its signals by symbol.
RawNode store(String symbol, List<String> signalSymbols, {SourceSpan span = spanA}) => RawNode(
  kind: 'app.Store',
  span: span,
  symbol: symbol,
  fields: <String, RawValue>{
    'name': RawLiteral(symbol.split(':').last),
    'origin': const RawLiteral('declared'),
    'signals': RawList(signalSymbols.map(RawRef.new).toList()),
  },
);

({CanonicalProgram? program, DiagnosticSink diagnostics}) run(List<RawNode> records) {
  final DiagnosticSink diagnostics = DiagnosticSink();
  final CanonicalProgram? program = const CanonicalBuilder().build(records, diagnostics);
  return (program: program, diagnostics: diagnostics);
}

void main() {
  group('construction', () {
    test('every node is a generated bridge_uir type, never a map', () {
      final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(<RawNode>[
        textRecord('Sign in'),
      ]);

      expect(result.program, isNotNull);
      expect(result.program!.nodes.single, isA<uir.UiText>());
      expect(result.diagnostics.sorted(), isEmpty);
    });

    test('children are embedded as typed nodes, and their order is preserved', () {
      final RawNode column = RawNode(
        kind: 'ui.Element',
        span: spanA,
        anchorSegment: 'Column[0]',
        fields: <String, RawValue>{
          'component': const RawMap(<String, RawValue>{'name': RawLiteral('Column')}),
          'children': RawList(<RawValue>[
            RawChild(textRecord('first')),
            RawChild(textRecord('second')),
            RawChild(textRecord('third')),
          ]),
        },
      );

      final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(<RawNode>[
        column,
      ]);
      final uir.UiElement built = result.program!.nodes.single as uir.UiElement;

      expect(
        built.children!.map((uir.UiNode n) => ((n as uir.UiText).value as uir.ConstBinding).value),
        <String>['first', 'second', 'third'],
        reason: 'a list order IS the meaning; the builder never sorts one',
      );
    });

    test('a declaration and everything referring to it resolve, in either declaration order', () {
      // The store is listed BEFORE the signals it refers to: a forward reference.
      final List<RawNode> records = <RawNode>[
        store('store:CartStore', <String>['sig:a', 'sig:b']),
        signal('sig:a'),
        signal('sig:b'),
      ];

      final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(records);
      expect(result.diagnostics.sorted(), isEmpty);

      final uir.Store built = result.program!.nodes.whereType<uir.Store>().single;
      final Set<String> signalIds = result.program!.nodes
          .whereType<uir.Signal>()
          .map((uir.Signal s) => s.id)
          .toSet();

      expect(built.signals!.toSet(), signalIds, reason: 'forward references must resolve');
    });
  });

  group('ids', () {
    test('are deterministic: the same input yields the same ids, every run', () {
      final List<Map<String, Object?>> first = run(<RawNode>[textRecord('x')]).program!.toRecords();
      final List<Map<String, Object?>> second = run(<RawNode>[
        textRecord('x'),
      ]).program!.toRecords();

      expect(first, second);
    });

    test('do not depend on the order records arrive in', () {
      final List<RawNode> records = <RawNode>[signal('sig:a'), signal('sig:b')];

      final CanonicalProgram forwards = run(records).program!;
      final CanonicalProgram backwards = run(records.reversed.toList()).program!;

      expect(forwards.toRecords(), backwards.toRecords());
    });

    test('survive an unrelated edit elsewhere in the file', () {
      // The same node, moved down 200 lines by an edit above it. `span` is excluded from the hash,
      // so the id must not move with it — otherwise every save invalidates the whole cache and
      // orphans every override anchor.
      final String atTop =
          run(<RawNode>[textRecord('x')]).program!.nodes.single.toJson()['id']! as String;
      final String moved =
          run(<RawNode>[
                textRecord('x', span: const SourceSpan(file: 'lib/a.dart', line: 210, column: 3)),
              ]).program!.nodes.single.toJson()['id']!
              as String;

      expect(moved, atTop);
    });

    test('a declaration id depends on its symbol, not on its contents', () {
      // Editing the body of a store must not change the id of the store.
      final String before =
          (run(<RawNode>[store('store:Cart', <String>[])]).program!.nodes.single as uir.Store).id;

      final List<RawNode> after = <RawNode>[
        store('store:Cart', <String>['sig:a']),
        signal('sig:a'),
      ];
      final uir.Store rebuilt = run(after).program!.nodes.whereType<uir.Store>().single;

      expect(rebuilt.id, before);
    });

    test('two textually identical subtrees are the same node — content addressing', () {
      const IdAllocator allocator = IdAllocator();
      final String one = allocator.forContent(<String, Object?>{
        'kind': 'bind.Const',
        'value': 'x',
      });
      final String two = allocator.forContent(<String, Object?>{
        'value': 'x',
        'kind': 'bind.Const',
      });

      expect(one, two, reason: 'key insertion order must not change an id');
    });

    test('different content yields different ids', () {
      final String a =
          run(<RawNode>[textRecord('a')]).program!.nodes.single.toJson()['id']! as String;
      final String b =
          run(<RawNode>[textRecord('b')]).program!.nodes.single.toJson()['id']! as String;

      expect(a, isNot(b));
    });
  });

  group('canonical output', () {
    test('serialization is byte-stable across runs', () {
      List<Map<String, Object?>> build() => run(<RawNode>[
        store('store:Cart', <String>['sig:a']),
        signal('sig:a'),
        textRecord('x'),
      ]).program!.toRecords();

      expect(build().toString(), build().toString());
    });

    test('top-level nodes are ordered by kind then id, not by discovery order', () {
      final CanonicalProgram program = run(<RawNode>[
        textRecord('x'),
        signal('sig:a'),
        store('store:Cart', <String>['sig:a']),
      ]).program!;

      final List<String> kinds = program.nodes.map((uir.UirNode n) => n.kind).toList();
      expect(kinds, orderedEquals(List<String>.of(kinds)..sort()));
    });

    test('map keys are sorted, whatever order the extractor produced them in', () {
      final Map<String, Object?> json = run(<RawNode>[
        const RawNode(
          kind: 'ui.Element',
          span: spanA,
          fields: <String, RawValue>{
            'component': RawMap(<String, RawValue>{
              'name': RawLiteral('Text'),
              'library': RawLiteral('package:flutter/material.dart'),
            }),
          },
        ),
      ]).program!.nodes.single.toJson();

      final Map<String, Object?> component = json['component']! as Map<String, Object?>;
      expect(component.keys.toList(), orderedEquals(List<String>.of(component.keys)..sort()));
    });
  });

  group('rejection — no invalid graph leaves the builder', () {
    test('an unresolved reference is BRG1201, and no program is returned', () {
      final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(<RawNode>[
        store('store:Cart', <String>['sig:missing']),
      ]);

      expect(result.program, isNull);
      expect(result.diagnostics.sorted().single.code, Codes.unresolvedReference);
    });

    test('a record the schema rejects is BRG1204', () {
      // `sig.Signal` requires `type` and `scope`; this record has neither.
      final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(<RawNode>[
        const RawNode(kind: 'sig.Signal', span: spanA, symbol: 'sig:broken'),
      ]);

      expect(result.program, isNull);
      expect(result.diagnostics.sorted().single.code, Codes.invalidNode);
    });

    test('an unknown node kind is BRG1204', () {
      final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(<RawNode>[
        const RawNode(kind: 'ui.Invented', span: spanA),
      ]);

      expect(result.program, isNull);
      expect(result.diagnostics.sorted().single.code, Codes.invalidNode);
    });

    test('two declarations sharing a symbol is BRG1202', () {
      final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(<RawNode>[
        signal('sig:a'),
        signal('sig:a', span: spanB),
      ]);

      expect(result.program, isNull);
      expect(
        result.diagnostics.sorted().map((Diagnostic d) => d.code),
        contains(Codes.duplicateSymbol),
      );
    });

    test('two nodes claiming one anchor is BRG1205', () {
      final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(<RawNode>[
        textRecord('one', anchor: 'Screen/Text[0]'),
        textRecord('two', anchor: 'Screen/Text[0]'),
      ]);

      expect(result.program, isNull);
      expect(
        result.diagnostics.sorted().map((Diagnostic d) => d.code),
        contains(Codes.duplicateAnchor),
      );
    });

    test('a raw graph that contains itself is BRG1206 rather than a stack overflow', () {
      final List<RawValue> children = <RawValue>[];
      final RawNode cyclic = RawNode(
        kind: 'ui.Element',
        span: spanA,
        fields: <String, RawValue>{
          'component': const RawMap(<String, RawValue>{'name': RawLiteral('Column')}),
          'children': RawList(children),
        },
      );
      children.add(RawChild(cyclic)); // the node now contains itself

      final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(<RawNode>[
        cyclic,
      ]);

      expect(result.program, isNull);
      expect(
        result.diagnostics.sorted().map((Diagnostic d) => d.code),
        contains(Codes.cyclicGraph),
      );
    });

    test('every builder failure is a diagnostic, never an exception', () {
      // Four different ways to be wrong, none of which may escape as an exception.
      for (final List<RawNode> broken in <List<RawNode>>[
        <RawNode>[const RawNode(kind: 'ui.Invented', span: spanA)],
        <RawNode>[
          store('store:Cart', <String>['sig:missing']),
        ],
        <RawNode>[const RawNode(kind: 'sig.Signal', span: spanA, symbol: 'sig:x')],
        <RawNode>[signal('sig:a'), signal('sig:a', span: spanB)],
      ]) {
        final ({DiagnosticSink diagnostics, CanonicalProgram? program}) result = run(broken);
        expect(result.program, isNull);
        expect(result.diagnostics.hasErrors, isTrue);
      }
    });
  });
}
