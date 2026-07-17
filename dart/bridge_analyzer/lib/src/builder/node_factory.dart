/// Node construction.
///
/// Layer: `builder`.
///
/// **This is the only place in the compiler that constructs UIR nodes**, and it does so without
/// knowing what any of them are.
///
/// It turns a raw record into *canonical JSON* — references resolved, ids allocated, maps sorted,
/// list order preserved — and hands that to the generated dispatcher `uirNodeFromJson`. The typed
/// node comes back fully validated by the generated deserializer, or it does not come back at all.
///
/// Why not a hand-written factory with a case per node kind? Because it would be a second, parallel
/// description of the schema, and the two would drift. A generator exists precisely so that no human
/// has to keep sixty constructors in step with a JSON file. The factory below has no per-kind
/// knowledge whatsoever, and a schema change cannot leave it behind.
library;

import 'package:bridge_analyzer/src/builder/builder_context.dart';
import 'package:bridge_analyzer/src/builder/canonical_sort.dart';
import 'package:bridge_analyzer/src/builder/id_allocator.dart';
import 'package:bridge_analyzer/src/builder/validation.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;

/// Builds typed UIR nodes from raw records.
final class NodeFactory {
  /// Creates a factory working in [context].
  const NodeFactory(this.context);

  /// The build's state.
  final BuilderContext context;

  /// Builds [raw], and everything beneath it.
  ///
  /// Returns `null` if the record could not be built — an unresolved reference, an unknown kind, a
  /// field the schema rejects. A `null` is always accompanied by a diagnostic: the builder never
  /// returns a partially valid node, and never repairs the extractor's output (INV-4).
  ///
  /// [anchorPath] is the path of anchor segments from the program root to this node.
  uir.UirNode? build(RawNode raw, {List<String> anchorPath = const <String>[]}) {
    if (context.cycles.isOnPath(raw)) {
      context.diagnostics.add(cyclicRawGraph(raw));
      return null;
    }
    return context.cycles.guard(raw, () => _build(raw, anchorPath));
  }

  uir.UirNode? _build(RawNode raw, List<String> anchorPath) {
    final List<String> path = raw.anchorSegment == null
        ? anchorPath
        : <String>[...anchorPath, raw.anchorSegment!];

    // 1. Fields, canonically: references resolved, children built, maps sorted, list order kept.
    final Map<String, Object?> fields = <String, Object?>{};
    for (final MapEntry<String, RawValue> entry in raw.fields.entries) {
      final Object? value = _value(entry.value, raw, path);
      if (value == _unresolved) {
        return null; // the diagnostic is already recorded
      }
      if (value != null) {
        fields[entry.key] = value;
      }
    }

    // 2. The content the id is computed from: everything except id, anchor and span (Spec §2.3).
    final Map<String, Object?> content = canonicalizeMap(<String, Object?>{
      ...fields,
      'kind': raw.kind,
    });

    // 3. The id. A declaration's id comes from its symbol, not its content — see id_allocator.dart.
    final String id = raw.symbol != null
        ? context.resolver.declare(raw.symbol!, raw.span)
        : context.allocator.forContent(content);

    // 4. Interning. Two textually identical subtrees are the same node — that is what content
    //    addressing *means* — so building one twice must produce the same content. If it does not,
    //    two genuinely different contents have collided on one id, and that is fatal.
    //
    //    Compared **stripped**, because that is what the id is a function of. Comparing the unstripped
    //    content instead reports a collision whenever two identical subtrees sit on different lines
    //    (their children's spans differ), which in real code is constantly: `hello_bridge` alone has
    //    36 of them. M1-T8 found this; the builder's own tests never had two identical subtrees.
    final Map<String, Object?> identity =
        IdAllocator.stripped(content)! as Map<String, Object?>;
    final Map<String, Object?>? seen = context.interned[id];
    if (seen != null && !_sameContent(seen, identity)) {
      context.diagnostics.add(
        Diagnostic(
          code: Codes.idCollision,
          message:
              'Two different nodes were allocated the same id "$id". This is a hash collision or an '
              'unstable symbol, and it would silently merge two unrelated nodes.',
          span: raw.span,
        ),
      );
      return null;
    }
    context.interned[id] = identity;

    // 5. The anchor, when the node is separately addressable. Anchors are occurrence identity, so a
    //    collision is a real error: two nodes cannot occupy the same place.
    final String? anchor = raw.anchorSegment == null ? null : path.join('/');
    if (anchor != null) {
      final String? occupant = context.anchors[anchor];
      if (occupant != null && occupant != id) {
        context.diagnostics.add(
          Diagnostic(
            code: Codes.duplicateAnchor,
            message: 'Two nodes claim the anchor "$anchor".',
            span: raw.span,
            hint: 'An anchor is the key a human override is stored under; it must name one node.',
          ),
        );
        return null;
      }
      context.anchors[anchor] = id;
    }

    // 6. The typed node. The generated deserializer validates every field; if the record does not
    //    match the schema, no node is produced.
    final Map<String, Object?> json = canonicalizeMap(<String, Object?>{
      ...content,
      'id': id,
      'span': raw.span.toJson(),
      'anchor': ?anchor,
    });

    try {
      return uir.uirNodeFromJson(json, raw.kind);
    } on uir.UirParseError catch (error) {
      context.diagnostics.add(
        Diagnostic(
          code: Codes.invalidNode,
          message:
              'The extractor produced a "${raw.kind}" record the schema rejects: ${error.message}',
          span: raw.span,
          hint: 'At ${error.path}. This is a bug in extraction, not in the analyzed project.',
        ),
      );
      return null;
    }
  }

  /// Sentinel for "this value failed to build". Distinct from `null`, which means "absent".
  static const Object _unresolved = Object();

  Object? _value(RawValue value, RawNode owner, List<String> path) {
    switch (value) {
      case RawLiteral(:final Object? value):
        return value;

      case RawRef(:final String symbol):
        final String? id = context.resolver.resolve(symbol, owner.span);
        return id ?? _unresolved;

      case RawRouteRef(:final String path):
        // A navigation naming a path resolves to the one route that serves it (§A17). Unlike a symbol
        // reference, a path that matches nothing is not a bug in extraction — it is a route the program
        // does not declare, or declares through a wrapper the adapter could not read. So it is a
        // warning (BRG1308), not the error a dangling symbol is, and only the transition that named it
        // is dropped: `_unresolved` propagates up and the owning `app.RouteTransition` is not built.
        final String? routeId = context.routeIndex.resolve(path);
        if (routeId == null) {
          context.diagnostics.add(
            Diagnostic(
              code: Codes.unresolvedRoute,
              message:
                  'This navigation goes to "$path", which matches no route the program declares — by '
                  'exact path or by a parameterized pattern. The edge is dropped rather than pointed '
                  'at a route that is not there.',
              span: owner.span,
            ),
          );
          return _unresolved;
        }
        return routeId;

      case RawChild(:final RawNode node):
        final uir.UirNode? child = build(node, anchorPath: path);
        return child == null ? _unresolved : child.toJson();

      case RawList(:final List<RawValue> items):
        final List<Object?> out = <Object?>[];
        for (final RawValue item in items) {
          final Object? built = _value(item, owner, path);
          if (built == _unresolved) return _unresolved;
          out.add(built);
        }
        // Order preserved. A list's order is its meaning.
        return out;

      case RawMap(:final Map<String, RawValue> entries):
        final Map<String, Object?> out = <String, Object?>{};
        for (final MapEntry<String, RawValue> entry in entries.entries) {
          final Object? built = _value(entry.value, owner, path);
          if (built == _unresolved) return _unresolved;
          out[entry.key] = built;
        }
        // Sorted: a map's key order carries no meaning and must not acquire any.
        return canonicalizeMap(out);
    }
  }

  /// Whether two contents are the same node.
  ///
  /// Compared with **`canonicalEncode`** — the same encoder the id is a hash of (§A15, §A16). Any other
  /// comparator is a second opinion about what a node *is*, and the two opinions disagree the moment
  /// they disagree about a number: `100` and `100.0` canonicalize to the same bytes, so they are the
  /// same id — and a comparator that still sees them as different reports a collision between a node
  /// and itself. (They found each other immediately: 13 false collisions on compass_app.)
  bool _sameContent(Map<String, Object?> a, Map<String, Object?> b) =>
      uir.canonicalEncode(a) == uir.canonicalEncode(b);
}
