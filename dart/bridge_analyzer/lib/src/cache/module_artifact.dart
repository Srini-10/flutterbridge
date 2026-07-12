/// What the cache stores.
///
/// Layer: `cache`.
///
/// Two artifacts, one per question the incremental build asks about a file:
///
/// * [FileDigest] — *what is this file, and what does it depend on?* Cheap, keyed by content alone.
/// * [ModuleArtifact] — *what UIR does this file produce?* Expensive, keyed by content **and** by the
///   API of everything it imports.
///
/// The cache stores **analyzer artifacts**, not Flutter concepts. Nothing here knows what a widget is.
library;

import 'dart:convert';

import 'package:bridge_analyzer/src/cache/content_hash.dart';
import 'package:meta/meta.dart';

/// A file's identity and its dependencies.
///
/// Computed from the file's own source and nothing else — which is exactly why it can be cached
/// against the content hash, and why an unchanged file is never parsed twice.
@immutable
final class FileDigest {
  /// Creates a digest.
  const FileDigest({
    required this.path,
    required this.contentHash,
    required this.apiFingerprint,
    required this.implFingerprint,
    required this.imports,
  });

  /// Reads a digest from its cached form.
  factory FileDigest.fromJson(Map<String, Object?> json) => FileDigest(
    path: json['path']! as String,
    contentHash: json['contentHash']! as String,
    apiFingerprint: json['apiFingerprint']! as String,
    implFingerprint: json['implFingerprint']! as String,
    imports: (json['imports']! as List<Object?>).cast<String>(),
  );

  /// The file, project-relative.
  final String path;

  /// A hash of the file's bytes. Any edit at all changes it.
  final String contentHash;

  /// A hash of the file's **declared surface**: the signatures it exports, without any bodies.
  ///
  /// This is the fingerprint that decides whether *other* files must be rebuilt. Renaming a private
  /// local does not change it; changing a widget's constructor does.
  final String apiFingerprint;

  /// A hash of the file's **implementation**: its bodies.
  ///
  /// Changing it invalidates this file's own downstream work and nothing else. Spec §7.2 calls this
  /// split "load-bearing", and it is: without it, editing one line of one method body would rebuild
  /// every file that transitively imports it — which, in a Flutter app, is all of them.
  final String implFingerprint;

  /// The project files this one imports, sorted.
  ///
  /// Only files inside the project: an import of `package:flutter/material.dart` cannot change during
  /// a build, and pinning the SDK is what the version context is for.
  final List<String> imports;

  /// The digest's cached form.
  Map<String, Object?> toJson() => <String, Object?>{
    'apiFingerprint': apiFingerprint,
    'contentHash': contentHash,
    'implFingerprint': implFingerprint,
    'imports': imports,
    'path': path,
  };
}

/// One UIR record, with the fields the program's canonical order is built from.
///
/// The line is kept verbatim. Re-serializing a cached node would risk producing bytes that differ
/// from the ones the clean build produced — and byte-identity is the whole promise (risk R8), so the
/// cache stores bytes, not objects.
@immutable
final class CachedRecord {
  /// Creates a record.
  const CachedRecord({required this.kind, required this.id, required this.line});

  /// Reads a record from its cached form.
  factory CachedRecord.fromJson(Map<String, Object?> json) => CachedRecord(
    kind: json['kind']! as String,
    id: json['id']! as String,
    line: json['line']! as String,
  );

  /// The node's kind — the primary sort key of the program's canonical order.
  final String kind;

  /// The node's id — the secondary sort key.
  final String id;

  /// The node's canonical NDJSON line, exactly as the emitter would have written it.
  final String line;

  /// The record's cached form.
  Map<String, Object?> toJson() => <String, Object?>{'id': id, 'kind': kind, 'line': line};
}

/// The UIR a single file produced.
@immutable
final class ModuleArtifact {
  /// Creates an artifact.
  const ModuleArtifact({required this.path, required this.records, required this.symbols});

  /// Reads an artifact from its cached form.
  factory ModuleArtifact.fromJson(Map<String, Object?> json) => ModuleArtifact(
    path: json['path']! as String,
    records: (json['records']! as List<Object?>)
        .map((Object? r) => CachedRecord.fromJson(r! as Map<String, Object?>))
        .toList(),
    symbols: (json['symbols']! as List<Object?>).cast<String>(),
  );

  /// The file that produced it.
  final String path;

  /// The declaration symbols this file declares, sorted.
  ///
  /// Kept so that a file being rebuilt can resolve a reference into a file that is **not** being
  /// rebuilt. Without it, an incremental build would report every cross-file reference as unresolved
  /// (`BRG1201`) the moment one of the two files came from the cache — which is to say, immediately.
  final List<String> symbols;

  /// The top-level records it contributed, in the order the extractor produced them.
  ///
  /// The *program's* order is imposed later, over all files at once — so this order never reaches the
  /// output, and a file's records may be stored however the extractor happened to walk it.
  final List<CachedRecord> records;

  /// The artifact's cached form.
  Map<String, Object?> toJson() => <String, Object?>{
    'path': path,
    'records': records.map((CachedRecord r) => r.toJson()).toList(),
    'symbols': symbols,
  };

  /// The artifact's canonical bytes, for storage.
  ///
  /// Canonical, so that storing the same artifact twice writes the same bytes — a cache whose entries
  /// differ byte-for-byte between runs cannot be verified, and an unverifiable cache is one you end
  /// up trusting on faith.
  List<int> encode() => utf8.encode(jsonEncode(toJson()));

  /// The hash of those bytes — used to verify that what came out is what went in.
  String get integrity => hashBytes(encode());
}
