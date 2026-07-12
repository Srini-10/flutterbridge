/// Canonical ordering.
///
/// Layer: `builder`.
///
/// The builder makes exactly two ordering decisions, and this file is both of them:
///
/// * **Maps are sorted.** A map's key order carries no meaning, so it must not be allowed to carry
///   accidental meaning: two runs that discovered `props` in a different order must serialize to the
///   same bytes.
/// * **Lists are never sorted.** A list's order *is* the meaning — children appear in the order they
///   appear on screen. Sorting one would silently rearrange a user's UI.
///
/// Everything else about ordering follows from those two sentences.
library;

import 'dart:collection';

/// Returns [map] with its keys in ascending order, recursively.
///
/// Dart maps iterate in insertion order — that is, in the order the compiler happened to discover
/// things, which is not a specification (D1–D5).
Map<String, Object?> canonicalizeMap(Map<String, Object?> map) {
  final SplayTreeMap<String, Object?> out = SplayTreeMap<String, Object?>();
  for (final MapEntry<String, Object?> entry in map.entries) {
    if (entry.value == null) {
      continue; // an absent field is absent, not null
    }
    out[entry.key] = _canonicalizeValue(entry.value);
  }
  return out;
}

Object? _canonicalizeValue(Object? value) {
  if (value is Map<String, Object?>) return canonicalizeMap(value);
  if (value is List<Object?>) {
    // Order preserved, deliberately. See the library doc.
    return value.map(_canonicalizeValue).toList();
  }
  return value;
}

/// Orders the program's top-level nodes.
///
/// The declarations of a program have no inherent order — a file does not "come before" a store — so
/// they are emitted in a stable, content-independent order: by kind, then by id. Without this, the
/// document's line order would depend on the order the extractor happened to walk the project.
List<T> canonicalizeProgram<T>(
  Iterable<T> nodes, {
  required String Function(T) kindOf,
  required String Function(T) idOf,
}) {
  final List<T> sorted = nodes.toList()
    ..sort((T a, T b) {
      final int byKind = kindOf(a).compareTo(kindOf(b));
      return byKind != 0 ? byKind : idOf(a).compareTo(idOf(b));
    });
  return List<T>.unmodifiable(sorted);
}
