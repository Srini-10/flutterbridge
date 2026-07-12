/// Atomic file writing.
///
/// Layer: `io` — depends on `util` only.
///
/// This layer knows about *bytes and files*. It knows nothing about UIR, NDJSON, or records: that is
/// the `emit` layer's job, and keeping the two apart is what lets ADR-7's deferred binary encoding
/// land later behind an unchanged writer.
library;

import 'dart:io';

import 'package:path/path.dart' as p;

/// Writes a file atomically: content goes to a temporary file, which is then renamed into place.
///
/// **INV-2.** A rename is atomic within a filesystem, so a crashed, killed or out-of-disk analyzer
/// leaves either the previous output or none at all. It never leaves a half-written file — which a
/// downstream consumer would happily parse, because a truncated NDJSON document is still a valid
/// NDJSON document with fewer records in it. That is the failure this class exists to make
/// impossible.
final class AtomicFileWriter {
  /// Creates a writer targeting [path].
  const AtomicFileWriter(this.path);

  /// The destination.
  final String path;

  /// Streams bytes into the file, atomically.
  ///
  /// [write] is handed a sink for the temporary file. If it throws, the temporary file is removed
  /// and the destination is left untouched.
  void writeStreaming(void Function(RandomAccessFile sink) write) {
    final File target = File(path);
    target.parent.createSync(recursive: true);

    final File temp = File(p.join(target.parent.path, '.${p.basename(path)}.tmp'));
    final RandomAccessFile sink = temp.openSync(mode: FileMode.write);

    try {
      write(sink);
    } on Object {
      sink.closeSync();
      if (temp.existsSync()) {
        temp.deleteSync();
      }
      rethrow;
    }

    sink
      ..flushSync()
      ..closeSync();
    temp.renameSync(target.path);
  }
}
