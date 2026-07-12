/// The content-addressable store.
///
/// Layer: `cache`.
///
/// A flat key/value store on disk at `.bridge/cache/cas/` (Spec §7.2). Keys are hashes; values are
/// bytes. It knows nothing about UIR, files, or Flutter — it is a place to put bytes and get them
/// back, and its only interesting properties are the ones that keep it from lying.
library;

import 'dart:io';

import 'package:bridge_analyzer/src/cache/cache_key.dart';
import 'package:bridge_analyzer/src/cache/content_hash.dart';
import 'package:bridge_analyzer/src/io/atomic_file.dart';
import 'package:path/path.dart' as p;

/// A content-addressable store of bytes.
final class ContentAddressableStore {
  /// Creates a store rooted at [root], typically `<project>/.bridge/cache/cas`.
  const ContentAddressableStore(this.root);

  /// The store's directory.
  final String root;

  /// The default size budget (Spec §7.2: 2 GB).
  static const int defaultMaxBytes = 2 * 1024 * 1024 * 1024;

  /// Where [key] lives.
  ///
  /// Sharded by the first two characters. A directory with a hundred thousand entries in it is slow
  /// on every filesystem anyone actually uses, and the shard costs nothing.
  String pathFor(CacheKey key) =>
      p.join(root, key.value.substring(0, 2), '${key.value.substring(2)}.bin');

  /// Whether [key] is present.
  bool contains(CacheKey key) => File(pathFor(key)).existsSync();

  /// Reads [key], or returns `null` if it is absent — **or corrupt**.
  ///
  /// The stored bytes are verified against the integrity hash written beside them. A truncated cache
  /// entry (a full disk, a killed process on a filesystem without atomic renames, a bad sector) would
  /// otherwise be handed to the compiler as though it were a real artifact. A corrupt entry is
  /// treated exactly like a miss: it is dropped, and the work is redone. **The cache may make the
  /// compiler slower. It may never make it wrong.**
  List<int>? read(CacheKey key) {
    final File file = File(pathFor(key));
    if (!file.existsSync()) {
      return null;
    }

    final List<int> bytes = file.readAsBytesSync();
    final File integrity = File('${file.path}.sha');
    if (!integrity.existsSync() || integrity.readAsStringSync() != hashBytes(bytes)) {
      // Corrupt or half-written. Drop it and take the miss.
      _delete(key);
      return null;
    }

    // Touch, so that eviction is least-recently-*used* rather than least-recently-written.
    file.setLastAccessedSync(file.lastModifiedSync());
    return bytes;
  }

  /// Writes [bytes] under [key], atomically.
  ///
  /// The value is written before its integrity hash. If the process dies between the two, the entry
  /// has no hash and is therefore treated as corrupt on the next read — a miss, never a wrong answer.
  void write(CacheKey key, List<int> bytes) {
    final String path = pathFor(key);
    AtomicFileWriter(path).writeStreaming((RandomAccessFile sink) => sink.writeFromSync(bytes));
    AtomicFileWriter(
      '$path.sha',
    ).writeStreaming((RandomAccessFile sink) => sink.writeStringSync(hashBytes(bytes)));
  }

  /// How many bytes the store currently occupies.
  int size() => _entries().fold(0, (int total, File file) => total + file.lengthSync());

  /// Evicts least-recently-used entries until the store is within [maxBytes].
  ///
  /// Returns how many entries were evicted. A cache with no bound is a disk-full incident waiting for
  /// a large enough repository.
  int prune({int maxBytes = defaultMaxBytes}) {
    final List<File> files = _entries()
      ..sort((File a, File b) {
        final int byAge = a.lastAccessedSync().compareTo(b.lastAccessedSync());
        // Ties broken by path: eviction must not depend on directory iteration order.
        return byAge != 0 ? byAge : a.path.compareTo(b.path);
      });

    int total = files.fold<int>(0, (int sum, File f) => sum + f.lengthSync());
    var evicted = 0;

    for (final File file in files) {
      if (total <= maxBytes) {
        break;
      }
      total -= file.lengthSync();
      final File integrity = File('${file.path}.sha');
      file.deleteSync();
      if (integrity.existsSync()) {
        integrity.deleteSync();
      }
      evicted++;
    }
    return evicted;
  }

  void _delete(CacheKey key) {
    for (final String path in <String>[pathFor(key), '${pathFor(key)}.sha']) {
      final File file = File(path);
      if (file.existsSync()) {
        file.deleteSync();
      }
    }
  }

  List<File> _entries() {
    final Directory dir = Directory(root);
    if (!dir.existsSync()) {
      return <File>[];
    }
    return dir
        .listSync(recursive: true)
        .whereType<File>()
        .where((File f) => f.path.endsWith('.bin'))
        .toList();
  }
}
