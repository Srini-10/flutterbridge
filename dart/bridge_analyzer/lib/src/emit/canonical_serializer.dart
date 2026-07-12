/// Canonical serialization.
///
/// Layer: `emit`.
///
/// One node in, one line out. The line is *canonical*: the same node always produces the same bytes,
/// on any machine, in any process, in any order.
///
/// The generated models already serialize canonically — `toJson()` sorts map keys recursively and
/// omits nulls (Spec §2.5, ADR-7). This module is what turns that JSON into **bytes**, and the
/// decisions it makes are the ones `jsonEncode` would otherwise make for us silently.
library;

import 'dart:convert';

import 'package:bridge_uir/bridge_uir.dart' as uir;

/// Turns UIR nodes into canonical NDJSON lines.
final class CanonicalSerializer {
  /// Creates a serializer.
  const CanonicalSerializer();

  /// Serializes [node] to a single canonical JSON line, **without** its terminating newline.
  ///
  /// * **No pretty printing.** Whitespace is not information, so it must not be allowed to vary.
  /// * **Map keys sorted, nulls omitted.** Guaranteed by the generated `toJson()`.
  /// * **List order preserved.** A list's order is its meaning.
  /// * **No trailing metadata.** A line is a node and nothing else.
  String serialize(uir.UirNode node) => uir.canonicalEncode(node.toJson());

  /// Serializes an already-canonical JSON map — used for the manifest, which is not a UIR node.
  String serializeMap(Map<String, Object?> json) => uir.canonicalEncode(json);

  /// The UTF-8 bytes of [line], plus exactly one LF.
  ///
  /// **UTF-8, and LF.** Not the platform's line ending: a document written on Windows and one written
  /// on Linux must be byte-identical, or every determinism guarantee in the compiler stops at the
  /// operating-system boundary. `\n` is written explicitly for the same reason `jsonEncode` is
  /// preferred to string interpolation — the encoding is a decision, so it is made here, once.
  List<int> encodeLine(String line) => utf8.encode('$line\n');
}
