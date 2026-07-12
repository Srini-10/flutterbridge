/// Record writing.
///
/// Layer: `emit`.
library;

import 'package:bridge_analyzer/src/emit/canonical_serializer.dart';
import 'package:bridge_analyzer/src/emit/output_manifest.dart';
import 'package:bridge_analyzer/src/emit/stream_writer.dart';
import 'package:meta/meta.dart';
import 'package:path/path.dart' as p;

/// What was written.
@immutable
final class WrittenOutput {
  /// Creates a description of the written artifacts.
  const WrittenOutput({
    required this.documentPath,
    required this.manifestPath,
    required this.recordCount,
  });

  /// The NDJSON document.
  final String documentPath;

  /// The manifest that accompanies it.
  final String manifestPath;

  /// How many records the document holds.
  final int recordCount;
}

/// Writes a UIR document and its manifest.
///
/// The two are written **document first, manifest second**, and both atomically. The order is a
/// decision: a manifest is a claim about a document, so a manifest that exists without the document
/// it describes is a lie, while a document that exists without a manifest is merely incomplete. If
/// the process dies between the two writes, the failure mode should be the second one.
final class RecordWriter {
  /// Creates a writer.
  const RecordWriter({CanonicalSerializer serializer = const CanonicalSerializer()})
    : _serializer = serializer;

  final CanonicalSerializer _serializer;

  /// The manifest that accompanies the document at [documentPath].
  static String manifestPathFor(String documentPath) {
    final String directory = p.dirname(documentPath);
    final String base = p.basenameWithoutExtension(documentPath);
    return p.join(directory, '$base.manifest.json');
  }

  /// Writes [lines] to [documentPath], then [manifest] beside it.
  WrittenOutput write({
    required String documentPath,
    required List<String> lines,
    required OutputManifest manifest,
  }) {
    final int written = NdjsonStreamWriter(documentPath, serializer: _serializer).write(lines);

    final String manifestPath = manifestPathFor(documentPath);
    NdjsonStreamWriter(
      manifestPath,
      serializer: _serializer,
    ).write(<String>[_serializer.serializeMap(manifest.toJson())]);

    return WrittenOutput(
      documentPath: documentPath,
      manifestPath: manifestPath,
      recordCount: written,
    );
  }
}
