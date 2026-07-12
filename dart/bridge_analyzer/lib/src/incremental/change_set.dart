/// Change detection.
///
/// Layer: `incremental`.
///
/// Compares two sets of digests and says what happened between them. Nothing here decides what to
/// *do* about it — that is the planner's job, and keeping the two apart means the answer to "what
/// changed" can be tested without reference to any policy about what to rebuild.
library;

import 'package:bridge_analyzer/src/cache/module_artifact.dart';
import 'package:meta/meta.dart';

/// What changed between two runs.
@immutable
final class ChangeSet {
  /// Creates a change set. Every list is sorted.
  ChangeSet({
    required List<String> added,
    required List<String> removed,
    required List<String> apiChanged,
    required List<String> implChanged,
    required List<String> unchanged,
  }) : added = List<String>.unmodifiable(added..sort()),
       removed = List<String>.unmodifiable(removed..sort()),
       apiChanged = List<String>.unmodifiable(apiChanged..sort()),
       implChanged = List<String>.unmodifiable(implChanged..sort()),
       unchanged = List<String>.unmodifiable(unchanged..sort());

  /// Compares [previous] digests to [current] ones.
  factory ChangeSet.between(
    Map<String, FileDigest> previous,
    Map<String, FileDigest> current,
  ) {
    final List<String> added = <String>[];
    final List<String> removed = <String>[];
    final List<String> apiChanged = <String>[];
    final List<String> implChanged = <String>[];
    final List<String> unchanged = <String>[];

    for (final MapEntry<String, FileDigest> entry in current.entries) {
      final FileDigest? before = previous[entry.key];
      if (before == null) {
        added.add(entry.key);
        continue;
      }
      if (before.contentHash == entry.value.contentHash) {
        unchanged.add(entry.key);
        continue;
      }
      // The file changed. *How* it changed is what decides the blast radius.
      if (before.apiFingerprint != entry.value.apiFingerprint) {
        apiChanged.add(entry.key);
      } else {
        // Content moved but the surface did not: a body edit, a comment, a reformat. Nothing that
        // imports this file can observe the difference.
        implChanged.add(entry.key);
      }
    }

    for (final String path in previous.keys) {
      if (!current.containsKey(path)) {
        removed.add(path);
      }
    }

    return ChangeSet(
      added: added,
      removed: removed,
      apiChanged: apiChanged,
      implChanged: implChanged,
      unchanged: unchanged,
    );
  }

  /// Files that are new.
  final List<String> added;

  /// Files that are gone.
  final List<String> removed;

  /// Files whose **exported surface** changed. Their dependents must be rebuilt too.
  final List<String> apiChanged;

  /// Files whose implementation changed but whose surface did not.
  ///
  /// They are rebuilt; **nothing that imports them is**. This one distinction is the difference
  /// between an incremental build and a full one: in a Flutter app, almost every edit is this kind,
  /// and almost every file transitively imports almost every other.
  final List<String> implChanged;

  /// Files that did not change at all.
  final List<String> unchanged;

  /// Whether anything changed.
  bool get isEmpty => added.isEmpty && removed.isEmpty && apiChanged.isEmpty && implChanged.isEmpty;

  @override
  String toString() =>
      '+${added.length} -${removed.length} api:${apiChanged.length} '
      'impl:${implChanged.length} same:${unchanged.length}';
}
