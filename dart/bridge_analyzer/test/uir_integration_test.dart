/// The seam between the compiler frontend and the UIR models.
///
/// M1-T1 fixed `ExtractionResult` as a stream of **NDJSON records**, because records *are* the
/// analyzer's output contract (INV-1, Spec §2.5). Typed UIR nodes are the extractor's internal
/// representation, serialized to records at this boundary. This test pins that seam: a generated
/// node serializes to a record, the record survives the atomic NDJSON writer, and it parses back to
/// an equal node.
///
/// So M1-T8 fills in extraction with no signature in `bridge_analyzer` changing.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/src/emit/canonical_serializer.dart';
import 'package:bridge_analyzer/src/emit/stream_writer.dart';
import 'package:bridge_uir/bridge_uir.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

void main() {
  const SourceSpan span = SourceSpan(file: 'lib/screens/login_screen.dart', line: 72, column: 15);

  test('a UIR node round-trips through the analyzer NDJSON writer', () {
    final Directory dir = Directory.systemTemp.createTempSync('uir_seam_');
    addTearDown(() => dir.deleteSync(recursive: true));

    const UiElement element = UiElement(
      id: 'n1',
      span: span,
      component: WidgetRef(name: 'Column', library: 'package:flutter/material.dart'),
      children: <UiNode>[
        UiText(
          id: 'n2',
          span: span,
          value: ConstBinding(id: 'n3', span: span, value: 'Hello Bridge'),
        ),
      ],
    );

    final String out = p.join(dir.path, 'program.l2.ndjson');
    const CanonicalSerializer serializer = CanonicalSerializer();
    final int written = NdjsonStreamWriter(out).write(<String>[serializer.serialize(element)]);
    expect(written, 1);

    final String line = File(out).readAsLinesSync().first;
    final UiNode back = UiNode.fromJson(jsonDecode(line));

    expect(back, element, reason: 'the wire format must not lose anything the model carries');
  });

  test('records written by the sink are canonical, so two runs produce identical bytes', () {
    final Directory dir = Directory.systemTemp.createTempSync('uir_seam_');
    addTearDown(() => dir.deleteSync(recursive: true));

    // The same node, built with its fields supplied in a different order.
    const Store first = Store(
      id: 's1',
      span: span,
      name: 'CartStore',
      origin: StoreOrigin.promoted,
      signals: <NodeId>['sig1', 'sig2'],
    );
    const Store second = Store(
      signals: <NodeId>['sig1', 'sig2'],
      origin: StoreOrigin.promoted,
      name: 'CartStore',
      span: span,
      id: 's1',
    );

    final String a = p.join(dir.path, 'a.ndjson');
    final String b = p.join(dir.path, 'b.ndjson');
    const CanonicalSerializer serializer = CanonicalSerializer();
    NdjsonStreamWriter(a).write(<String>[serializer.serialize(first)]);
    NdjsonStreamWriter(b).write(<String>[serializer.serialize(second)]);

    expect(File(a).readAsBytesSync(), File(b).readAsBytesSync());
  });
}
