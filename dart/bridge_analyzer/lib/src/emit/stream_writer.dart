/// Streaming NDJSON output.
///
/// Layer: `emit`.
library;

import 'dart:io';

import 'package:bridge_analyzer/src/emit/canonical_serializer.dart';
import 'package:bridge_analyzer/src/io/atomic_file.dart';

/// Streams canonical NDJSON lines into a file, atomically.
///
/// **Streaming, not buffered.** A real application's UIR is tens of thousands of nodes; holding the
/// whole document in memory as one string before writing it would be a memory cost with no benefit,
/// and it is exactly the sort of thing that works fine on `hello_bridge` and falls over on a 30k-line
/// codebase.
///
/// **Atomic, via [AtomicFileWriter].** Either the whole document appears, or none of it does. A
/// truncated NDJSON file is still *valid* NDJSON — just with fewer records — so a partial write would
/// not be detected downstream. It would simply be a program with some of its nodes missing.
final class NdjsonStreamWriter {
  /// Creates a writer targeting [path].
  const NdjsonStreamWriter(
    this.path, {
    CanonicalSerializer serializer = const CanonicalSerializer(),
  }) : _serializer = serializer;

  /// The destination.
  final String path;

  final CanonicalSerializer _serializer;

  /// Writes [lines] as NDJSON, one per line, and returns how many were written.
  ///
  /// Each line is UTF-8, terminated by exactly one LF. There is no header, no footer, and no
  /// trailing blank line: a record is a line, and the file is its records.
  int write(Iterable<String> lines) {
    var count = 0;
    AtomicFileWriter(path).writeStreaming((RandomAccessFile sink) {
      for (final String line in lines) {
        sink.writeFromSync(_serializer.encodeLine(line));
        count++;
      }
    });
    return count;
  }
}
