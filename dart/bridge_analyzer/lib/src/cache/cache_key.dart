/// Cache keys.
///
/// Layer: `cache`.
///
/// A cache key answers exactly one question: *would recomputing this produce the same bytes?* If it
/// can ever answer "yes" when the truth is "no", the compiler serves a stale artifact and every
/// guarantee downstream is void.
///
/// **Cache unsoundness is the worst failure this platform can have** (ADR-5, risk R8) — worse than
/// being slow, worse than crashing, because it is silent and it is convincing. So the rule for
/// adding an input to a key is: when in doubt, include it. A key that is too specific costs a cache
/// miss. A key that is too loose costs correctness.
library;

import 'package:bridge_analyzer/src/cache/content_hash.dart';
import 'package:bridge_analyzer/src/util/build_info.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;
import 'package:meta/meta.dart';

/// The parts of a cache key that are the same for every file in a run.
///
/// Changing any of them changes every key, which is the point: a new analyzer, a new schema or a new
/// UIR version must never be able to serve artifacts produced by the old one.
@immutable
final class VersionContext {
  /// Creates a context. The defaults are what the running build actually is.
  const VersionContext({
    this.analyzerVersion = bridgeBuildVersion,
    this.uirVersion = uir.uirVersion,
    this.schemaHash = uir.uirSchemaHash,
  });

  /// The version of `bridge_analyzer`.
  final String analyzerVersion;

  /// The UIR schema version.
  final String uirVersion;

  /// A hash of the schema sources the models were generated from.
  ///
  /// Deliberately separate from [uirVersion]: a schema edited without a version bump is precisely the
  /// case where a stale cache would be most convincing and most wrong.
  final String schemaHash;

  /// The context, as key parts.
  List<String> get parts => <String>[analyzerVersion, uirVersion, schemaHash];
}

/// A key into the content-addressable store.
@immutable
final class CacheKey {
  const CacheKey._(this.value);

  /// The key of a file's *digest* — its content hash, its fingerprints, and its imports.
  ///
  /// Depends only on the file's own bytes. That is what makes an unchanged file nearly free: its
  /// digest comes back from the cache without the file ever being parsed.
  factory CacheKey.digest(VersionContext context, String contentHash) =>
      CacheKey._(hashParts(<String>['digest', ...context.parts, contentHash]));

  /// The key of a file's *module artifact* — the UIR records extracted from it.
  ///
  /// Depends on two things:
  ///
  /// 1. **The file's own content hash.** Not its impl fingerprint: UIR nodes carry spans, so moving a
  ///    line — even by adding a comment — changes the emitted bytes. A key that ignored that would
  ///    serve UIR whose spans point at the wrong lines.
  /// 2. **The API fingerprint of every file it depends on, transitively.**
  ///
  /// The second is the entire purpose of the API/impl split (Spec §7.2, ADR-5). A file's UIR embeds
  /// types resolved from its imports, so it must be rebuilt when an import's *surface* changes — and
  /// must **not** be rebuilt when only an import's *body* changes. Get that backwards in one
  /// direction and the cache is useless (everything rebuilds, always); get it backwards in the other
  /// and it is unsound (UIR built against a type that no longer exists).
  ///
  /// [dependencyApis] must be sorted by the caller: the iteration order of a dependency set is not a
  /// specification.
  factory CacheKey.module(
    VersionContext context,
    String contentHash,
    List<String> dependencyApis,
  ) => CacheKey._(hashParts(<String>['module', ...context.parts, contentHash, ...dependencyApis]));

  /// The key's textual form. Also its address in the store.
  final String value;

  @override
  String toString() => value;

  @override
  bool operator ==(Object other) => other is CacheKey && other.value == value;

  @override
  int get hashCode => value.hashCode;
}
