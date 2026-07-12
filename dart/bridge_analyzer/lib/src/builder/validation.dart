/// Graph validation.
///
/// Layer: `builder`.
///
/// The last gate before UIR leaves the frontend. **No invalid graph may pass it** — everything
/// downstream (normalization, every generator, verification) is written against the assumption that
/// the UIR it receives is canonical, and an assumption that is only usually true is worse than no
/// assumption at all.
///
/// Validation reports; it never repairs. A graph the builder cannot vouch for is rejected with
/// diagnostics, and the pipeline stops.
library;


import 'package:bridge_analyzer/src/builder/builder_context.dart';
import 'package:bridge_analyzer/src/builder/id_allocator.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/model/source_span.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;

/// Validates a built program.
final class GraphValidator {
  /// Creates a validator working in [context].
  const GraphValidator(this.context);

  /// The build's state.
  final BuilderContext context;

  /// Checks [nodes], reporting every problem found.
  ///
  /// Returns `true` when the graph is fit to leave the builder.
  bool validate(List<uir.UirNode> nodes) {
    final int before = context.diagnostics.length;

    _checkIdsAreFunctional(nodes);
    _checkReferencesResolve(nodes);
    _checkRequiredSpans(nodes);

    return context.diagnostics.length == before && !context.diagnostics.hasErrors;
  }

  /// Every id denotes exactly one content.
  ///
  /// Not "every id occurs once": ids are content-addressed, so two identical subtrees share one, and
  /// that is the point. What must never happen is one id denoting two *different* things — that
  /// would silently merge unrelated nodes, and it is the failure mode content addressing has.
  void _checkIdsAreFunctional(List<uir.UirNode> nodes) {
    final Map<String, String> seen = <String, String>{};

    void walk(Map<String, Object?> json) {
      final Object? id = json['id'];
      if (id is String) {
        final String content = _contentOf(json);
        final String? previous = seen[id];
        if (previous != null && previous != content) {
          context.diagnostics.add(
            Diagnostic(
              code: Codes.idCollision,
              message: 'Id "$id" denotes two different nodes.',
              span: _spanOf(json),
            ),
          );
        }
        seen[id] = content;
      }
      for (final Object? value in json.values) {
        _forEachNode(value, walk);
      }
    }

    for (final uir.UirNode node in nodes) {
      walk(node.toJson());
    }
  }

  /// Every id a node refers to exists in the program.
  ///
  /// A reference the resolver could not resolve is already `BRG1201` and the node was never built,
  /// so this catches the other direction: an id that *was* produced but names nothing — which would
  /// mean a declaration was dropped after being referenced.
  void _checkReferencesResolve(List<uir.UirNode> nodes) {
    final Set<String> declared = <String>{};

    void collect(Map<String, Object?> json) {
      final Object? id = json['id'];
      if (id is String) declared.add(id);
      for (final Object? value in json.values) {
        _forEachNode(value, collect);
      }
    }

    for (final uir.UirNode node in nodes) {
      collect(node.toJson());
    }

    // Every symbol declared *by this pass* must correspond to a node that survived it. Symbols from
    // files the incremental build did not rebuild are resolved but not present, by design.
    for (final String symbol in context.resolver.localSymbols) {
      final String? id = context.resolver.resolve(
        symbol,
        const SourceSpan(file: '', line: 1, column: 1),
      );
      if (id != null && !declared.contains(id)) {
        context.diagnostics.add(
          Diagnostic(
            code: Codes.orphanReference,
            message:
                'The declaration "$symbol" is referenced, but no node with its id survived the build.',
            hint: 'A node was dropped after something referred to it. The graph would have a hole.',
          ),
        );
      }
    }
  }

  /// Every node has a span.
  ///
  /// The generated deserializer already requires it, so a violation here means a node was
  /// constructed some other way — which is exactly the thing the builder exists to prevent.
  void _checkRequiredSpans(List<uir.UirNode> nodes) {
    void walk(Map<String, Object?> json) {
      if (json.containsKey('id') && !json.containsKey('span')) {
        context.diagnostics.add(
          Diagnostic(
            code: Codes.invalidNode,
            message: 'A "${json['kind']}" node has no span.',
          ),
        );
      }
      for (final Object? value in json.values) {
        _forEachNode(value, walk);
      }
    }

    for (final uir.UirNode node in nodes) {
      walk(node.toJson());
    }
  }

  /// Calls [visit] for every embedded node inside [value].
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

  /// A node's identity: everything the id was computed from, and nothing else.
  ///
  /// Stripped **recursively**, exactly as `IdAllocator.forContent` strips before hashing. Removing
  /// only the top level leaves the children's spans in, so two structurally identical subtrees on
  /// different lines compare unequal — and this check then reports a collision between a node and
  /// itself. It must compare what the id is a function of, or it is not checking identity at all.
  static String _contentOf(Map<String, Object?> json) =>
      uir.canonicalEncode(IdAllocator.stripped(json));

  static SourceSpan? _spanOf(Map<String, Object?> json) {
    final Object? span = json['span'];
    if (span is! Map<String, Object?>) return null;
    final Object? file = span['file'];
    final Object? line = span['line'];
    final Object? column = span['column'];
    if (file is! String || line is! int || column is! int) return null;
    return SourceSpan(file: file, line: line, column: column);
  }
}

/// Guards against a raw graph that embeds itself.
///
/// UIR trees are embedded, not referenced, so a cycle in the *raw* input would make the builder
/// recurse forever. The extractor should never produce one — but "should never" is not a guarantee,
/// and a stack overflow is a much worse diagnostic than a sentence explaining what happened.
final class CycleGuard {
  /// Creates a guard.
  CycleGuard();

  final Set<RawNode> _onPath = Set<RawNode>.identity();

  /// Runs [body] with [node] on the path, or reports a cycle and returns `null`.
  T? guard<T>(RawNode node, T? Function() body) {
    if (!_onPath.add(node)) {
      return null;
    }
    try {
      return body();
    } finally {
      _onPath.remove(node);
    }
  }

  /// Whether [node] is currently being built (i.e. embedding it again would be a cycle).
  bool isOnPath(RawNode node) => _onPath.contains(node);
}

/// The diagnostic raised when a raw graph embeds itself.
Diagnostic cyclicRawGraph(RawNode node) => Diagnostic(
  code: Codes.cyclicGraph,
  message: 'The extractor produced a "${node.kind}" record that contains itself.',
  span: node.span,
  hint: 'UIR trees are embedded, not referenced, so a cycle cannot be represented.',
);
