/// Pre-write validation.
///
/// Layer: `emit`.
///
/// The builder (M1-T3) already validated this graph. This validates it again, and the duplication is
/// deliberate.
///
/// The emitter is the **serialization boundary**: past it, the graph stops being Dart objects that a
/// type system can vouch for and becomes bytes that anyone can read. Everything downstream — every
/// pass, every generator, the whole TypeScript half of the compiler — trusts what comes out of here
/// without re-deriving it. A bad document that escapes is a bad document that surfaces three stages
/// later, in a generator, as something inexplicable.
///
/// So this is the last place the compiler can still say "no" cheaply, and it says it about the thing
/// it is actually about to do: **serialize these exact bytes**.
library;

import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/emit/canonical_serializer.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;

/// Validates a program immediately before it is written.
final class EmitValidator {
  /// Creates a validator.
  const EmitValidator({CanonicalSerializer serializer = const CanonicalSerializer()})
    : _serializer = serializer;

  final CanonicalSerializer _serializer;

  /// Checks [nodes], reporting to [diagnostics].
  ///
  /// Returns the serialized lines when the program is fit to write, and `null` when it is not.
  /// Returning the lines is not an optimization — it is the point. The check that "serialization
  /// succeeds" is only meaningful if the bytes that were checked are the bytes that get written; if
  /// the emitter re-serialized afterwards, it would be writing something this function never saw.
  List<String>? validate(List<uir.UirNode> nodes, DiagnosticSink diagnostics) {
    final int before = diagnostics.length;

    _checkOrdering(nodes, diagnostics);
    _checkReferencesResolve(nodes, diagnostics);

    final List<String>? lines = _serializeAll(nodes, diagnostics);

    if (diagnostics.length != before || lines == null) {
      return null;
    }
    return lines;
  }

  /// Top-level nodes are in canonical order: by kind, then by id.
  ///
  /// The builder produced them that way. If they are not, something reordered them in between, and
  /// the document would differ between two runs that computed the same graph.
  void _checkOrdering(List<uir.UirNode> nodes, DiagnosticSink diagnostics) {
    for (int i = 1; i < nodes.length; i++) {
      final ({String kind, String id}) previous = _key(nodes[i - 1]);
      final ({String kind, String id}) current = _key(nodes[i]);

      final int byKind = previous.kind.compareTo(current.kind);
      final bool ordered = byKind < 0 || (byKind == 0 && previous.id.compareTo(current.id) <= 0);

      if (!ordered) {
        diagnostics.add(
          Diagnostic(
            code: Codes.nonCanonicalOrder,
            message:
                'Top-level nodes are not in canonical order: "${previous.kind}" precedes '
                '"${current.kind}". Two runs over the same graph would write different bytes.',
          ),
        );
        return; // one report is enough; the document is not fit to write either way
      }
    }
  }

  /// Every `NodeId` a node refers to is present in the document.
  ///
  /// The generated `uirReferenceFields` map says which fields hold references — a `NodeId` is a
  /// `String` once the types are erased, so without the schema's help this check would have to guess
  /// which strings are ids, and a check that guesses is worse than no check.
  void _checkReferencesResolve(List<uir.UirNode> nodes, DiagnosticSink diagnostics) {
    final Set<String> present = <String>{};
    final Map<String, String> references = <String, String>{}; // referenced id -> referring kind

    void walk(Map<String, Object?> json) {
      final Object? id = json['id'];
      final Object? kind = json['kind'];
      if (id is String) {
        present.add(id);
      }

      if (kind is String) {
        for (final String field in uir.uirReferenceFields[kind] ?? const <String>[]) {
          final Object? value = json[field];
          if (value is String) {
            references[value] = kind;
          } else if (value is List<Object?>) {
            for (final Object? item in value) {
              if (item is String) references[item] = kind;
            }
          }
        }
      }

      for (final Object? value in json.values) {
        _forEachNode(value, walk);
      }
    }

    for (final uir.UirNode node in nodes) {
      walk(node.toJson());
    }

    final List<String> dangling =
        references.keys.where((String id) => !present.contains(id)).toList()..sort();

    for (final String id in dangling) {
      diagnostics.add(
        Diagnostic(
          code: Codes.orphanReference,
          message:
              'A "${references[id]}" node refers to "$id", which is not in the document. The emitted '
              'graph would have a hole in it.',
        ),
      );
    }
  }

  /// Every node serializes.
  ///
  /// It should be impossible for a generated model to fail here. "Should be impossible" is not a
  /// guarantee, and the alternative to checking is writing half a file and discovering the problem
  /// when something downstream cannot parse it.
  List<String>? _serializeAll(List<uir.UirNode> nodes, DiagnosticSink diagnostics) {
    final List<String> lines = <String>[];
    for (final uir.UirNode node in nodes) {
      try {
        lines.add(_serializer.serialize(node));
      } on Object catch (error) {
        diagnostics.add(
          Diagnostic(
            code: Codes.serializationFailed,
            message: 'A "${node.kind}" node could not be serialized: $error',
          ),
        );
        return null;
      }
    }
    return lines;
  }

  static ({String kind, String id}) _key(uir.UirNode node) =>
      (kind: node.kind, id: node.toJson()['id']! as String);

  static void _forEachNode(Object? value, void Function(Map<String, Object?>) visit) {
    if (value is Map<String, Object?>) {
      if (value.containsKey('kind') && value.containsKey('id')) {
        visit(value);
      } else {
        for (final Object? nested in value.values) {
          _forEachNode(nested, visit);
        }
      }
    } else if (value is List<Object?>) {
      for (final Object? item in value) {
        _forEachNode(item, visit);
      }
    }
  }
}
