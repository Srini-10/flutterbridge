/// The contract between extraction and the canonical builder.
///
/// Layer: `model` — depends on `util` only.
///
/// Extraction (M1-T8) walks resolved Dart and produces *raw* records: what the analyzer saw, with
/// references still expressed as **symbols** rather than ids, and with no ids allocated at all.
/// The canonical builder turns those into typed UIR.
///
/// The split matters. Extraction knows Dart; it does not know how a `NodeId` is computed, how
/// children are ordered, or what makes a graph valid. The builder knows those things and nothing
/// about Dart. Neither can corrupt the other's invariants.
///
/// A raw record is deliberately *not* a UIR node: it cannot be, because a UIR node needs an id, and
/// an id needs the finished content. Raw records are what exists before that fixed point is reached.
library;

import 'package:bridge_analyzer/src/model/source_span.dart';
import 'package:meta/meta.dart';

/// A value in a raw record.
///
/// Sealed: the builder switches over it exhaustively, so a new raw value kind breaks the builder at
/// compile time rather than being silently ignored.
@immutable
sealed class RawValue {
  const RawValue();
}

/// A literal: a string, number, boolean, or null.
@immutable
final class RawLiteral extends RawValue {
  /// Creates a literal.
  const RawLiteral(this.value);

  /// The value, which must already be JSON-representable.
  final Object? value;
}

/// A reference to a declaration, by the **symbol** extraction knows it under.
///
/// The builder resolves it to a `NodeId`. An unresolved symbol is `BRG1201` — never a null, never a
/// guess (INV-4: the compiler does not invent information it does not have).
@immutable
final class RawRef extends RawValue {
  /// Creates a reference to [symbol].
  const RawRef(this.symbol);

  /// The declaration's symbol, e.g. `sig:lib/screens/login_screen.dart#_LoginScreenState._email`.
  final String symbol;
}

/// A reference to a route, by the concrete **path** a navigation names.
///
/// Unlike [RawRef], which names a declaration by the symbol it was declared under, a route reference
/// names a route by the URL a navigation asks to go to — `context.go('/wonder/3')`. The declaring file
/// is not known at the call site, and for a parameterized route (`/wonder/:id`) the concrete path is
/// not the declared path at all, so a symbol cannot be built here. The builder resolves it against the
/// route table it alone can see (§A17): a path matches the one route whose pattern it fits, and a path
/// that matches none is `BRG1308` — the edge is dropped, never guessed at.
@immutable
final class RawRouteRef extends RawValue {
  /// Creates a reference to the route the navigation to [path] lands on.
  const RawRouteRef(this.path);

  /// The concrete path the navigation names, e.g. `/wonder/3`.
  final String path;
}

/// A nested node, embedded in its parent.
@immutable
final class RawChild extends RawValue {
  /// Creates an embedded child.
  const RawChild(this.node);

  /// The child.
  final RawNode node;
}

/// An ordered list of values.
///
/// **Order is semantic and is never sorted.** It is the order the widgets appear in, and the builder
/// preserves it exactly (Spec §2.3).
@immutable
final class RawList extends RawValue {
  /// Creates a list.
  const RawList(this.items);

  /// The items, in source order.
  final List<RawValue> items;
}

/// A string-keyed map of values.
///
/// Unlike [RawList], a map has no meaningful order: the builder emits it in canonical (sorted) key
/// order, so two runs that discovered the keys in different orders serialize identically.
@immutable
final class RawMap extends RawValue {
  /// Creates a map.
  const RawMap(this.entries);

  /// The entries.
  final Map<String, RawValue> entries;
}

/// One record produced by extraction.
///
/// It carries what the analyzer saw and nothing the analyzer could not have known: no id, no
/// resolved reference, no ordering decision.
@immutable
final class RawNode {
  /// Creates a raw record of [kind] at [span].
  const RawNode({
    required this.kind,
    required this.span,
    this.symbol,
    this.anchorSegment,
    this.fields = const <String, RawValue>{},
  });

  /// The UIR node kind this record becomes, e.g. `ui.Element`. Must exist in the schema; an unknown
  /// kind is `BRG1206`.
  final String kind;

  /// Where in the Dart source it came from.
  final SourceSpan span;

  /// The symbol other records refer to this one by, when it is a declaration.
  ///
  /// Absent for the overwhelming majority of records: an expression inside a widget tree is not
  /// something anything else refers to.
  final String? symbol;

  /// This record's segment of its anchor path, e.g. `Column[0]`.
  ///
  /// The builder composes the full anchor from the segments on the path from the root. Absent means
  /// the node is not separately addressable by a human, and inherits no anchor.
  final String? anchorSegment;

  /// The record's fields, keyed by the schema's field names.
  final Map<String, RawValue> fields;
}
