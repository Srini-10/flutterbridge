/// The file dependency graph.
///
/// Layer: `incremental`.
library;

import 'package:bridge_analyzer/src/cache/module_artifact.dart';
import 'package:meta/meta.dart';

/// Which files depend on which.
///
/// Built from digests, so it costs nothing beyond what change detection already needed.
@immutable
final class DependencyGraph {
  /// Creates a graph from [digests], keyed by project-relative path.
  factory DependencyGraph(Map<String, FileDigest> digests) {
    final Map<String, List<String>> edges = <String, List<String>>{};
    for (final MapEntry<String, FileDigest> entry in digests.entries) {
      // Only edges to files that are actually in the project: an import of something that does not
      // exist is the analyzed project's problem, not the graph's, and it must not become a phantom
      // node whose API fingerprint nobody can compute.
      edges[entry.key] = entry.value.imports.where(digests.containsKey).toList()..sort();
    }
    return DependencyGraph._(edges);
  }

  const DependencyGraph._(this._edges);

  final Map<String, List<String>> _edges;

  /// The files [path] imports directly, sorted.
  List<String> directDependenciesOf(String path) => _edges[path] ?? const <String>[];

  /// Every file [path] depends on, transitively, sorted.
  ///
  /// **Cycles are expected, not exceptional.** Dart allows two libraries to import each other, and
  /// real Flutter projects do it. A traversal that assumed a DAG would recurse forever on the first
  /// one it met, so the visited set is not an optimization here — it is the correctness condition.
  List<String> transitiveDependenciesOf(String path) {
    final Set<String> seen = <String>{};
    final List<String> stack = <String>[path];

    while (stack.isNotEmpty) {
      final String current = stack.removeLast();
      for (final String dependency in directDependenciesOf(current)) {
        if (seen.add(dependency)) {
          stack.add(dependency);
        }
      }
    }

    // A file is not its own dependency, even when a cycle makes it reachable from itself: its own
    // content hash is already in its key, so counting it twice would only make the key noisier.
    seen.remove(path);
    return seen.toList()..sort();
  }

  /// Every file that depends on [path], transitively, sorted.
  ///
  /// The other direction: *who has to be rebuilt if this file's surface changes?*
  List<String> transitiveDependentsOf(String path) {
    final Map<String, List<String>> reverse = <String, List<String>>{};
    for (final MapEntry<String, List<String>> entry in _edges.entries) {
      for (final String dependency in entry.value) {
        reverse.putIfAbsent(dependency, () => <String>[]).add(entry.key);
      }
    }

    final Set<String> seen = <String>{};
    final List<String> stack = <String>[path];

    while (stack.isNotEmpty) {
      final String current = stack.removeLast();
      for (final String dependent in reverse[current] ?? const <String>[]) {
        if (seen.add(dependent)) {
          stack.add(dependent);
        }
      }
    }

    seen.remove(path);
    return seen.toList()..sort();
  }
}
