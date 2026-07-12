/// Reference resolution.
///
/// Layer: `builder`.
///
/// Extraction refers to declarations by **symbol** — the name it knew them by in the Dart source.
/// The builder turns each symbol into a `NodeId`. Every component, store, signal, action, route,
/// endpoint, theme and widget reference goes through here.
///
/// A symbol that names nothing is a hard error (`BRG1201`). It is never resolved to null, never
/// dropped, and never invented: a dangling reference that reaches the compiler becomes a node tree
/// that looks complete and is not.
library;

import 'package:bridge_analyzer/src/builder/id_allocator.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/model/source_span.dart';

/// Resolves declaration symbols to node ids.
///
/// Two-phase by construction: every declaration is *declared* before anything is *resolved*, so a
/// forward reference — a store that names a signal declared later in the file — resolves exactly as
/// a backward one does. Resolution must not depend on the order the extractor walked the project.
final class ReferenceResolver {
  /// Creates a resolver reporting to [diagnostics].
  ReferenceResolver({
    required DiagnosticSink diagnostics,
    IdAllocator allocator = const IdAllocator(),
  }) : _diagnostics = diagnostics,
       _allocator = allocator;

  final DiagnosticSink _diagnostics;
  final IdAllocator _allocator;

  /// symbol -> id, for every declaration seen.
  final Map<String, String> _ids = <String, String>{};

  /// symbol -> where it was declared, for the "declared here" half of a diagnostic.
  final Map<String, SourceSpan> _declaredAt = <String, SourceSpan>{};

  /// Symbols declared by a file that is not being built in this pass.
  final Set<String> _external = <String>{};

  /// Declares [symbol], allocating its id.
  ///
  /// Returns the id. Declaring the same symbol twice with a different span is `BRG1202`: two
  /// declarations sharing a symbol would resolve to one node, silently merging them.
  String declare(String symbol, SourceSpan span) {
    final SourceSpan? existing = _declaredAt[symbol];
    if (existing != null && existing != span) {
      _diagnostics.add(
        Diagnostic(
          code: Codes.duplicateSymbol,
          message: 'Two declarations share the symbol "$symbol".',
          span: span,
          hint:
              'Symbols must identify exactly one declaration; the extractor produced a collision.',
          related: <RelatedLocation>[
            RelatedLocation(span: existing, message: 'first declared here'),
          ],
        ),
      );
      return _ids[symbol]!;
    }

    _declaredAt[symbol] = span;
    return _ids.putIfAbsent(symbol, () => _allocator.forDeclaration(symbol));
  }

  /// Declares [symbol] as belonging to a file that is not being built now.
  ///
  /// An incremental build rebuilds a few files and takes the rest from the cache. A rebuilt file may
  /// still refer to a declaration in a cached one, and that reference must resolve to the *same* id
  /// the cached file was built with — which it does, because a declaration's id is a function of its
  /// symbol and nothing else (see `id_allocator.dart`). That property is what makes per-file caching
  /// possible at all.
  ///
  /// External symbols are never duplicate-checked (their real declaration is elsewhere) and are never
  /// expected to have a node in this pass's output.
  String declareExternal(String symbol) {
    _external.add(symbol);
    return _ids.putIfAbsent(symbol, () => _allocator.forDeclaration(symbol));
  }

  /// Resolves [symbol] to a node id, or `null` if it names nothing.
  ///
  /// A `null` return is always accompanied by `BRG1201`, so a caller that propagates it cannot lose
  /// the error.
  String? resolve(String symbol, SourceSpan usedAt) {
    final String? id = _ids[symbol];
    if (id != null) {
      return id;
    }

    _diagnostics.add(
      Diagnostic(
        code: Codes.unresolvedReference,
        message: 'Reference to "$symbol", which is not declared anywhere in the program.',
        span: usedAt,
        hint:
            'The extractor emitted a reference to a declaration it never emitted. This is a bug in '
            'extraction, not in the analyzed project.',
      ),
    );
    return null;
  }

  /// Every declared symbol, in a stable order.
  List<String> get symbols => _ids.keys.toList()..sort();

  /// Every symbol declared by a file in *this* pass, in a stable order.
  List<String> get localSymbols =>
      _ids.keys.where((String s) => !_external.contains(s)).toList()..sort();
}
