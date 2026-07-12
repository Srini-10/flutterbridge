/// The NDJSON emitter.
///
/// Layer: `emit`.
///
/// **The sole serialization boundary between `bridge_analyzer` and the rest of the compiler.**
/// Nothing downstream ever sees a Dart object: it sees this document. Which means every invariant the
/// builder established has to survive the trip through here, or it was never established at all.
///
/// The emitter does four things, in this order, and stops at the first failure:
///
/// 1. **Validate** the graph — ordering, references, and that every node actually serializes.
/// 2. **Serialize** it to canonical lines.
/// 3. **Write** it atomically: the whole document, or none of it.
/// 4. **Stamp** a manifest beside it saying which schema produced it.
///
/// It never repairs, never truncates, and never writes a partial file.
library;

import 'package:bridge_analyzer/src/builder/canonical_builder.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/emit/output_manifest.dart';
import 'package:bridge_analyzer/src/emit/record_writer.dart';
import 'package:bridge_analyzer/src/emit/validation.dart';

/// Emits canonical UIR as NDJSON.
final class NdjsonEmitter {
  /// Creates an emitter.
  const NdjsonEmitter({
    EmitValidator validator = const EmitValidator(),
    RecordWriter writer = const RecordWriter(),
  }) : _validator = validator,
       _writer = writer;

  final EmitValidator _validator;
  final RecordWriter _writer;

  /// Emits [program] to [outputPath].
  ///
  /// Returns `null` if the program was not fit to write, having recorded why. **No file is created
  /// in that case** — not an empty one, not a partial one, not a stale one. A consumer that finds no
  /// document knows there is no document; a consumer that finds half a document cannot tell.
  WrittenOutput? emit({
    required CanonicalProgram program,
    required String outputPath,
    required DiagnosticSink diagnostics,
  }) {
    // Validation returns the very lines it validated, so what was checked is what gets written.
    final List<String>? lines = _validator.validate(program.nodes, diagnostics);
    if (lines == null) {
      return null;
    }

    return _writer.write(
      documentPath: outputPath,
      lines: lines,
      manifest: OutputManifest(
        recordCount: lines.length,
        diagnosticCount: diagnostics.length,
      ),
    );
  }
}
