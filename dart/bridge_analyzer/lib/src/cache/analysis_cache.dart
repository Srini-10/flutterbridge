/// The analysis cache.
///
/// Layer: `cache`.
///
/// A typed façade over the byte store: digests in, digests out; artifacts in, artifacts out. It also
/// counts hits and misses, because a cache whose hit rate nobody measures is a cache nobody notices
/// has stopped working.
library;

import 'dart:convert';

import 'package:bridge_analyzer/src/cache/cache_key.dart';
import 'package:bridge_analyzer/src/cache/cas.dart';
import 'package:bridge_analyzer/src/cache/module_artifact.dart';
import 'package:meta/meta.dart';

/// What a run got out of the cache.
@immutable
final class CacheStats {
  /// Creates stats.
  const CacheStats({
    required this.digestHits,
    required this.digestMisses,
    required this.moduleHits,
    required this.moduleMisses,
  });

  /// Files whose digest was recovered without parsing them.
  final int digestHits;

  /// Files that had to be parsed.
  final int digestMisses;

  /// Files whose UIR was recovered without extracting from them.
  final int moduleHits;

  /// Files that had to be extracted.
  final int moduleMisses;

  /// How many files were re-extracted. The number an incremental build is judged on.
  int get extracted => moduleMisses;

  @override
  String toString() =>
      'digests ${digestHits}h/${digestMisses}m, modules ${moduleHits}h/${moduleMisses}m';
}

/// Caches analyzer artifacts.
///
/// Deliberately **not** a query engine. Spec §7.2 and ADR-5 place the memoized query graph in
/// `@bridge/compiler`, on the TypeScript side; the analyzer's job in that design is to produce
/// per-file modules and the fingerprints the engine keys on. This class is that job, and nothing more
/// — building a second, parallel query engine here would be two engines to keep sound instead of one.
final class AnalysisCache {
  /// Creates a cache over [store].
  AnalysisCache({required this.store, this.context = const VersionContext()});

  /// Where the bytes live.
  final ContentAddressableStore store;

  /// What makes this build's artifacts distinct from another's.
  final VersionContext context;

  var _digestHits = 0;
  var _digestMisses = 0;
  var _moduleHits = 0;
  var _moduleMisses = 0;

  /// What the run got out of the cache so far.
  CacheStats get stats => CacheStats(
    digestHits: _digestHits,
    digestMisses: _digestMisses,
    moduleHits: _moduleHits,
    moduleMisses: _moduleMisses,
  );

  /// The cached digest of the file whose content hashes to [contentHash], if any.
  FileDigest? readDigest(String contentHash) {
    final List<int>? bytes = store.read(CacheKey.digest(context, contentHash));
    if (bytes == null) {
      _digestMisses++;
      return null;
    }
    _digestHits++;
    return FileDigest.fromJson(jsonDecode(utf8.decode(bytes)) as Map<String, Object?>);
  }

  /// Stores [digest].
  void writeDigest(FileDigest digest) => store.write(
    CacheKey.digest(context, digest.contentHash),
    utf8.encode(jsonEncode(digest.toJson())),
  );

  /// The cached module artifact under [key], if any.
  ModuleArtifact? readModule(CacheKey key) {
    final List<int>? bytes = store.read(key);
    if (bytes == null) {
      _moduleMisses++;
      return null;
    }
    _moduleHits++;
    return ModuleArtifact.fromJson(jsonDecode(utf8.decode(bytes)) as Map<String, Object?>);
  }

  /// Stores [artifact] under [key].
  void writeModule(CacheKey key, ModuleArtifact artifact) => store.write(key, artifact.encode());
}
