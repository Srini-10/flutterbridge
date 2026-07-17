/// The canonical UIR builder.
///
/// Layer: `builder`.
///
/// Converts the extractor's raw records into canonical, strongly typed UIR — and refuses to produce
/// anything else. This stage does **no normalization and no optimization**: it does not desugar a
/// builder widget, fold a constant, or promote a signal. It constructs what the extractor saw, in
/// canonical form, or it fails.
///
/// It is the only place in the compiler that constructs UIR nodes, and everything downstream is
/// entitled to assume the graph it receives is canonical.
///
/// ## The three phases
///
/// 1. **Declare.** Every symbol in the program is declared before anything is resolved, so a forward
///    reference resolves exactly as a backward one does. Resolution must not depend on the order the
///    extractor walked the project.
/// 2. **Build.** Records become typed nodes: references resolved, ids allocated, maps sorted, list
///    order preserved. Every failure is a diagnostic, and a failed node is never a partial node.
/// 3. **Validate.** The graph is checked as a whole. No invalid graph leaves this stage.
library;

import 'package:bridge_analyzer/src/builder/builder_context.dart';
import 'package:bridge_analyzer/src/builder/canonical_sort.dart';
import 'package:bridge_analyzer/src/builder/node_factory.dart';
import 'package:bridge_analyzer/src/builder/route_index.dart';
import 'package:bridge_analyzer/src/builder/validation.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;
import 'package:meta/meta.dart';

/// A canonical UIR program: the builder's product.
///
/// Every node in it is a generated `bridge_uir` type, validated by the generated deserializer, with
/// a stable id, a span, resolved references, and children in source order.
@immutable
final class CanonicalProgram {
  /// Creates a program.
  CanonicalProgram({required List<uir.UirNode> nodes})
    : nodes = List<uir.UirNode>.unmodifiable(nodes);

  /// The program's top-level nodes, in canonical order (by kind, then id).
  final List<uir.UirNode> nodes;

  /// The program as NDJSON records — one canonical JSON object per node.
  ///
  /// This is the analyzer's output contract (INV-1, Spec §2.5). The emit stage writes exactly this.
  List<Map<String, Object?>> toRecords() => nodes.map((uir.UirNode node) => node.toJson()).toList();
}

/// Builds canonical UIR from raw extraction records.
final class CanonicalBuilder {
  /// Creates a builder.
  const CanonicalBuilder();

  /// Builds [records].
  ///
  /// Returns `null` if the graph is not fit to leave the frontend — with at least one error
  /// diagnostic in [diagnostics] explaining why. It never returns a partially valid program, and it
  /// never repairs the extractor's output: a compiler that quietly fixes its own frontend's mistakes
  /// is a compiler whose frontend nobody ever fixes.
  /// [externalSymbols] are declarations owned by files this pass is not building — an incremental
  /// build takes them from the cache. Declaring them lets a rebuilt file resolve a reference into a
  /// cached one, to the same id the cached file was built with.
  CanonicalProgram? build(
    List<RawNode> records,
    DiagnosticSink diagnostics, {
    Iterable<String> externalSymbols = const <String>[],
  }) {
    final BuilderContext context = BuilderContext(diagnostics: diagnostics);

    externalSymbols.forEach(context.resolver.declareExternal);

    // Phase 1 — declare every symbol, so forward references resolve.
    //
    // Guarded: a cyclic raw graph would otherwise recurse forever *here*, before the build phase's
    // cycle guard ever sees it. A stack overflow is a far worse diagnostic than a sentence.
    final Set<RawNode> declaring = Set<RawNode>.identity();
    for (final RawNode record in records) {
      _declare(record, context, declaring);
    }

    // The route table, now that every route has an id. A `RawRouteRef` — a navigation naming a path —
    // resolves against this, because a path becomes a route only by matching the routes that exist,
    // and no single file has them all (§A17).
    context.routeIndex = _routeIndex(records, context);

    // Phase 2 — build. Every record is attempted, even after one fails: an author fixing ten
    // problems wants to see ten problems.
    final NodeFactory factory = NodeFactory(context);
    final List<uir.UirNode> built = <uir.UirNode>[];
    for (final RawNode record in records) {
      final uir.UirNode? node = factory.build(record);
      if (node != null) {
        built.add(node);
      }
    }

    if (diagnostics.hasErrors) {
      return null;
    }

    // Phase 3 — canonical program order. Top-level declarations have no inherent order, so they get
    // a stable one that does not depend on how the project was walked.
    final List<uir.UirNode> ordered = canonicalizeProgram<uir.UirNode>(
      built,
      kindOf: (uir.UirNode node) => node.kind,
      idOf: (uir.UirNode node) => node.toJson()['id']! as String,
    );

    // Phase 4 — validate the whole graph.
    if (!GraphValidator(context).validate(ordered)) {
      return null;
    }

    return CanonicalProgram(nodes: ordered);
  }

  /// Declares [record] and every record beneath it that carries a symbol.
  ///
  /// [seen] holds the records currently on the path. A record that contains itself is left for the
  /// build phase to report as `BRG1206`: declaring is not the place to raise a diagnostic about
  /// structure, and reporting it twice would be worse than reporting it once.
  void _declare(RawNode record, BuilderContext context, Set<RawNode> seen) {
    if (!seen.add(record)) {
      return;
    }
    final String? symbol = record.symbol;
    if (symbol != null) {
      context.resolver.declare(symbol, record.span);
    }
    for (final RawValue value in record.fields.values) {
      _declareValue(value, context, seen);
    }
  }

  void _declareValue(RawValue value, BuilderContext context, Set<RawNode> seen) {
    switch (value) {
      case RawChild(:final RawNode node):
        _declare(node, context, seen);
      case RawList(:final List<RawValue> items):
        for (final RawValue item in items) {
          _declareValue(item, context, seen);
        }
      case RawMap(:final Map<String, RawValue> entries):
        for (final RawValue entry in entries.values) {
          _declareValue(entry, context, seen);
        }
      case RawLiteral():
      case RawRef():
      case RawRouteRef():
        break;
    }
  }

  /// The route table: every `app.Route`'s path, paired with the id its symbol resolves to.
  ///
  /// Routes are top-level records — a nested `GoRoute` is emitted on its own, carrying the joined path
  /// — so this one pass over the records finds them all. A route whose symbol somehow did not resolve
  /// is left out rather than indexed under a null id; that is a different failure, and it has its own
  /// diagnostic.
  RouteIndex _routeIndex(List<RawNode> records, BuilderContext context) {
    final List<({String path, String id})> routes = <({String path, String id})>[];
    for (final RawNode record in records) {
      if (record.kind != 'app.Route' || record.symbol == null) {
        continue;
      }
      final RawValue? path = record.fields['path'];
      if (path is! RawLiteral || path.value is! String) {
        continue;
      }
      final String? id = context.resolver.resolve(record.symbol!, record.span);
      if (id != null) {
        routes.add((path: path.value! as String, id: id));
      }
    }
    return RouteIndex(routes);
  }
}
