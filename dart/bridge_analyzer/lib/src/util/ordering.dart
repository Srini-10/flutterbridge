/// Deterministic ordering primitives.
///
/// Layer: `util` — depends on nothing inside this package (Spec §1.2: utilities remain
/// dependency-free).
///
/// Determinism (Spec §3.5, D1–D5) is not a property the compiler acquires later; it is a property
/// every ordering decision must already have. Every place the compiler iterates a collection whose
/// natural order is unspecified — a directory listing, a hash map, a set — it iterates through one
/// of these functions instead.
library;

import 'dart:collection';

/// Sorts file paths into a stable, platform-independent order.
///
/// `Directory.listSync` order is filesystem-dependent and therefore forbidden as an iteration order.
List<String> sortedPaths(Iterable<String> paths) => paths.toList()..sort();

/// A view of [map] whose iteration order is its keys in ascending order.
///
/// Dart's `Map` iterates in insertion order, which makes serialization depend on the order in which
/// the compiler happened to discover things. Canonical output requires key order to depend only on
/// the keys themselves (Spec §2.5).
SplayTreeMap<K, V> canonicalMap<K extends Comparable<K>, V>(Map<K, V> map) =>
    SplayTreeMap<K, V>.of(map);

/// Recursively rewrites [value] so that every map it contains iterates its keys in ascending order.
///
/// Applied immediately before serialization: it is what makes two runs over identical input produce
/// byte-identical output.
Object? canonicalJson(Object? value) {
  if (value is Map<String, Object?>) {
    final SplayTreeMap<String, Object?> sorted = SplayTreeMap<String, Object?>();
    for (final MapEntry<String, Object?> entry in value.entries) {
      sorted[entry.key] = canonicalJson(entry.value);
    }
    return sorted;
  }
  if (value is List<Object?>) {
    return value.map(canonicalJson).toList();
  }
  return value;
}

/// Compares two values by a sequence of comparators, in order, returning the first non-zero result.
///
/// Used to give every sort a *total* order. A comparator that can return 0 for two distinct items
/// leaves their relative order to the sort implementation, which is exactly the kind of latent
/// nondeterminism that survives testing and then breaks a cache.
int compareBy<T>(T a, T b, List<Comparator<T>> comparators) {
  for (final Comparator<T> comparator in comparators) {
    final int result = comparator(a, b);
    if (result != 0) {
      return result;
    }
  }
  return 0;
}
