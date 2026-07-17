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
    _checkTransitionDestinations(nodes, diagnostics);

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
  /// Every `app.RouteTransition` names exactly one destination, of the right kind (Spec v2.4 §A17).
  ///
  /// A transition either names a route that exists (`target` -> an `app.Route`) or constructs its
  /// destination inline (`component` -> a `ui.Component`). Both, or neither, is meaningless.
  ///
  /// **This is checked here because the schema cannot state it** (§A17.4). The dialect has no way to
  /// say "exactly one of these two properties", and it could not help with the kinds either: a
  /// `NodeId` is a `String`, and nothing about a string's shape says what it points at. That is not a
  /// gap to apologise for — it is the same reason `_checkReferencesResolve` and
  /// `_checkIdsAreFunctional` exist. An invariant the type system cannot hold is held here, at the
  /// serialization boundary, before anything downstream can believe it.
  void _checkTransitionDestinations(List<uir.UirNode> nodes, DiagnosticSink diagnostics) {
    final Map<String, String> kindOf = <String, String>{};

    void index(Map<String, Object?> json) {
      final Object? id = json['id'];
      final Object? kind = json['kind'];
      if (id is String && kind is String) kindOf[id] = kind;
      for (final Object? value in json.values) {
        _forEachNode(value, index);
      }
    }

    for (final uir.UirNode node in nodes) {
      index(node.toJson());
    }

    void check(Map<String, Object?> json) {
      if (json['kind'] == 'app.RouteTransition') {
        final Object? target = json['target'];
        final Object? component = json['component'];
        final String id = json['id'] as String? ?? '(no id)';

        if ((target == null) == (component == null)) {
          diagnostics.add(
            Diagnostic(
              code: Codes.malformedTransition,
              message:
                  target == null
                      ? 'The route transition "$id" names no destination. A transition with nowhere '
                          'to go is not an edge.'
                      : 'The route transition "$id" names both a route ("$target") and a component '
                          '("$component"). It goes to one place.',
            ),
          );
        } else if (target is String && kindOf[target] != null && kindOf[target] != 'app.Route') {
          // A dangling id is `_checkReferencesResolve`'s to report; this is about naming the *wrong
          // kind* of node, which resolves perfectly and means something false.
          diagnostics.add(
            Diagnostic(
              code: Codes.malformedTransition,
              message:
                  'The route transition "$id" names "$target" as its target route, but that node is '
                  'a ${kindOf[target]}. Only an app.Route can be a target; a destination with no '
                  'path belongs in `component` (Spec v2.4 §A17).',
            ),
          );
        } else if (component is String &&
            kindOf[component] != null &&
            kindOf[component] != 'ui.Component') {
          diagnostics.add(
            Diagnostic(
              code: Codes.malformedTransition,
              message:
                  'The route transition "$id" names "$component" as the component it renders, but '
                  'that node is a ${kindOf[component]}.',
            ),
          );
        }
      }

      for (final Object? value in json.values) {
        _forEachNode(value, check);
      }
    }

    for (final uir.UirNode node in nodes) {
      check(node.toJson());
    }
  }

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
