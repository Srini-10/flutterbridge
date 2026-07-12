/// The output manifest.
///
/// Layer: `emit`.
///
/// Every UIR document is accompanied by a manifest saying what produced it. Without one, a consumer
/// holding a `.ndjson` file has no way to know which schema it conforms to, and its only options are
/// to guess or to trust — both of which are how a version skew becomes a silent miscompile rather
/// than an error message.
library;

import 'package:bridge_analyzer/src/util/build_info.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;
import 'package:meta/meta.dart';

/// The wire-format identifier. Bumped only when the *shape* of the file changes, never for content.
const String generationFormat = 'ndjson/1';

/// What produced a UIR document.
///
/// **Deterministic by construction.** There is no timestamp, no hostname, no user, no run id, and no
/// absolute path in it — a manifest that changed on every run would make every output byte-unstable
/// and every cache key useless, which would defeat the point of having one.
@immutable
final class OutputManifest {
  /// Creates a manifest.
  const OutputManifest({
    required this.recordCount,
    required this.diagnosticCount,
    this.uirVersion = uir.uirVersion,
    this.schemaHash = uir.uirSchemaHash,
    this.buildVersion = bridgeBuildVersion,
    this.format = generationFormat,
  });

  /// The UIR schema version the document conforms to.
  final String uirVersion;

  /// A hash of the schema sources the models were generated from.
  ///
  /// Two documents with the same `uirVersion` but different schema hashes were produced by different
  /// schemas — which is a version that was edited without being bumped, and worth knowing about.
  final String schemaHash;

  /// How many records the document contains.
  final int recordCount;

  /// The version of `bridge_analyzer` that produced it.
  final String buildVersion;

  /// The wire format, e.g. `ndjson/1`.
  final String format;

  /// How many diagnostics the run produced.
  ///
  /// A document can be emitted with warnings, so this is not always zero. It is never non-zero with
  /// *errors*: an invalid graph is never written at all.
  final int diagnosticCount;

  /// The manifest's canonical JSON form.
  Map<String, Object?> toJson() => <String, Object?>{
    'buildVersion': buildVersion,
    'diagnosticCount': diagnosticCount,
    'format': format,
    'recordCount': recordCount,
    'schemaHash': schemaHash,
    'uirVersion': uirVersion,
  };
}
