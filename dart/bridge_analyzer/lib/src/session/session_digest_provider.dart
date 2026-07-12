/// The production digest provider.
///
/// Layer: `session` — inside the analyzer quarantine (ADR-14).
///
/// M1-T5 defined the incremental machinery against a seam — `DigestProvider`, a function from a file
/// to its [FileDigest] — and left the seam open, because computing a digest means reading Dart syntax,
/// and only this layer is allowed to. This is the thing that plugs into it.
///
/// It does not import the `incremental` layer, and it does not need to: the `DigestProvider` typedef
/// is a function type, and [SessionDigestProvider.digest] satisfies it structurally. The layer graph
/// stays acyclic (`session` may not import `incremental`), and the `pipeline` layer — which may
/// import both — is the only place that knows they fit together.
library;

import 'package:bridge_analyzer/src/cache/module_artifact.dart';
import 'package:bridge_analyzer/src/session/source_parser.dart';
import 'package:bridge_analyzer/src/session/unit_digest.dart';

/// Computes a file's digest by parsing it.
///
/// Parsing, not resolving. A digest answers *what does this file export, and what does it import* —
/// neither of which needs a type. The distinction is what makes an incremental build cheap: resolving
/// a file in order to find out that it did not need resolving would defeat the entire exercise.
final class SessionDigestProvider {
  /// Creates a provider for the package named [packageName], so that `package:<self>/…` imports are
  /// recognised as internal to the project.
  SessionDigestProvider({
    required String packageName,
    SourceParser parser = const SourceParser(),
  }) : _computer = DigestComputer(packageName: packageName),
       _parser = parser;

  final DigestComputer _computer;
  final SourceParser _parser;

  /// Computes the digest of the project-relative [path] with the given [source].
  ///
  /// Structurally a `DigestProvider` (M1-T5).
  FileDigest digest(String path, String source) => _computer.compute(
    path: path,
    unit: _parser.parse(path: path, source: source).unit,
    source: source,
  );
}
