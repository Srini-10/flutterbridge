/// The incremental analyzer.
///
/// Layer: `incremental`.
///
/// Re-analyzes only the files that can possibly have changed the output, and produces a program that
/// is **byte-identical to a clean build of the same sources**. That identity is the entire contract.
/// A faster build that produces different bytes is not a faster build; it is a wrong one, and it is
/// the failure mode (risk R8, ADR-5) that destroys a compiler's credibility permanently, because the
/// symptom shows up somewhere else entirely.
///
/// ## How identity is guaranteed, rather than hoped for
///
/// Three properties, and each is load-bearing:
///
/// 1. **A declaration's id depends only on its symbol** (M1-T3). So a file that *is* rebuilt resolves
///    a reference into a file that is *not* rebuilt to exactly the id the cached file was built with.
///    Without this, per-file caching would be impossible, not merely difficult.
/// 2. **The cache stores bytes, not objects.** A cached record is the canonical line the clean build
///    would have written. Nothing is re-serialized, so nothing can be re-serialized differently.
/// 3. **The program's order is imposed over all files at once**, after the merge, by the same
///    (kind, id) rule the clean build uses. So the order cannot depend on which files were rebuilt,
///    or on the order they were discovered in.
///
/// Given those three, "incremental == clean" is not a property that has to be tested into existence.
/// It is tested (thoroughly) because "cannot see how it could fail" is not the same as "cannot fail".
library;

import 'dart:convert';

import 'package:bridge_analyzer/src/builder/canonical_builder.dart';
import 'package:bridge_analyzer/src/builder/canonical_sort.dart';
import 'package:bridge_analyzer/src/cache/analysis_cache.dart';
import 'package:bridge_analyzer/src/cache/cache_key.dart';
import 'package:bridge_analyzer/src/cache/content_hash.dart';
import 'package:bridge_analyzer/src/cache/module_artifact.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/incremental/dependency_graph.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_uir/bridge_uir.dart' as uir;
import 'package:meta/meta.dart';

/// Produces a file's digest. Implemented in the `session` layer, which owns the parser.
typedef DigestProvider = FileDigest Function(String path, String source);

/// Produces a file's raw records.
///
/// **Asynchronous, and it has to be** (ISSUE-13). M1-T5 declared this seam synchronous, because the
/// incremental machinery could be built and proved without an extractor. M1-T8 then discovered the
/// obvious: extraction needs a *resolved* unit, and `package:analyzer` only resolves asynchronously.
/// A synchronous extractor cannot resolve, so a synchronous seam is a seam nothing can plug into.
///
/// The **algorithm below is unchanged**. Only the signature moved: the one call that produces records
/// is awaited. Everything that makes incremental builds sound — the digests, the fingerprint split,
/// the cache keys, the merge order — is untouched, which is why the byte-identity property survives
/// the correction rather than having to be re-established.
typedef ModuleExtractor = Future<List<RawNode>> Function(String path, String source);

/// The result of an incremental analysis.
@immutable
final class IncrementalResult {
  /// Creates a result.
  const IncrementalResult({
    required this.program,
    required this.stats,
    required this.rebuilt,
    required this.digests,
  });

  /// The program, or `null` if it was not fit to produce.
  final CanonicalProgram? program;

  /// What the cache did.
  final CacheStats stats;

  /// The files that were actually re-extracted, sorted. The number an incremental build is judged on.
  final List<String> rebuilt;

  /// Every file's digest, so a caller can see what changed and why.
  final Map<String, FileDigest> digests;
}

/// Analyzes a project, reusing everything it soundly can.
final class IncrementalAnalyzer {
  /// Creates an analyzer.
  const IncrementalAnalyzer({
    required this.cache,
    required this.digestProvider,
    required this.extractor,
    this.context = const VersionContext(),
  });

  /// Where artifacts are kept.
  final AnalysisCache cache;

  /// How a file's digest is computed, when it is not cached.
  final DigestProvider digestProvider;

  /// How a file's records are extracted, when they are not cached.
  final ModuleExtractor extractor;

  /// What makes this build's artifacts distinct.
  final VersionContext context;

  /// Analyzes [sources], keyed by project-relative path.
  Future<IncrementalResult> analyze(
    Map<String, String> sources,
    DiagnosticSink diagnostics,
  ) async {
    // Files are visited in sorted order throughout. Nothing here may depend on the order a directory
    // listing, a hash map, or an editor's save happened to produce (D1-D5).
    final List<String> paths = sources.keys.toList()..sort();

    // ── 1. Digests. An unchanged file is never parsed: its digest is keyed by content alone. ──
    final Map<String, FileDigest> digests = <String, FileDigest>{};
    for (final String path in paths) {
      final String source = sources[path]!;
      final String contentHash = hashString(source);

      FileDigest? digest = cache.readDigest(contentHash);
      if (digest == null || digest.path != path) {
        // A cache hit under a different path means two files have identical content — legal, and the
        // digest is still valid, but it must be re-stamped with *this* file's path.
        digest = digestProvider(path, source);
        cache.writeDigest(digest);
      }
      digests[path] = digest;
    }

    final DependencyGraph graph = DependencyGraph(digests);

    // ── 2. Module keys. A file is rebuilt when its own bytes change, or when the *surface* of
    //       something it imports changes — and not otherwise (Spec §7.2). ──
    final Map<String, CacheKey> keys = <String, CacheKey>{};
    for (final String path in paths) {
      keys[path] = CacheKey.module(
        context,
        digests[path]!.contentHash,
        <String>[
          for (final String dependency in graph.transitiveDependenciesOf(path))
            '$dependency ${digests[dependency]!.apiFingerprint}',
        ],
      );
    }

    // ── 3. What is cached, and what is not. ──
    final Map<String, ModuleArtifact> cached = <String, ModuleArtifact>{};
    final List<String> stale = <String>[];
    for (final String path in paths) {
      final ModuleArtifact? artifact = cache.readModule(keys[path]!);
      if (artifact == null) {
        stale.add(path);
      } else {
        cached[path] = artifact;
      }
    }

    // ── 4. Extract the stale files. ──
    //
    // Extraction happens before any building, because a file being rebuilt may refer to a symbol
    // declared in another file being rebuilt, and the builder must know the whole symbol table before
    // it resolves anything. (The same reason the builder declares before it resolves, one level up.)
    final Map<String, List<RawNode>> extracted = <String, List<RawNode>>{};
    for (final String path in stale) {
      // Sequential, not concurrent. The order files are extracted in must not be able to influence
      // the output, and the cheapest way to guarantee that is not to have an order at all — but the
      // analysis session is a single shared context, and hammering it from many futures at once buys
      // little and risks a great deal. `stale` is already sorted, so this is deterministic.
      extracted[path] = await extractor(path, sources[path]!);
    }

    // Every symbol in the program: from the artifacts of files we kept, and from the raw records of
    // files we are rebuilding.
    final Set<String> allSymbols = <String>{
      for (final ModuleArtifact artifact in cached.values) ...artifact.symbols,
      for (final List<RawNode> records in extracted.values) ..._symbolsOf(records),
    };

    // ── 5. Build the stale files. ──
    for (final String path in stale) {
      final List<RawNode> records = extracted[path]!;
      final Set<String> own = _symbolsOf(records);

      final CanonicalProgram? built = const CanonicalBuilder().build(
        records,
        diagnostics,
        // Everything declared elsewhere — whether in a cached file or in another file of this same
        // rebuild — resolves to the id its own file gave it, because ids of declarations come from
        // symbols (M1-T3).
        externalSymbols: allSymbols.difference(own),
      );

      if (built == null) {
        return IncrementalResult(
          program: null,
          stats: cache.stats,
          rebuilt: stale..sort(),
          digests: digests,
        );
      }

      final ModuleArtifact artifact = ModuleArtifact(
        path: path,
        symbols: own.toList()..sort(),
        records: <CachedRecord>[
          for (final uir.UirNode node in built.nodes)
            CachedRecord(
              kind: node.kind,
              id: node.toJson()['id']! as String,
              // The canonical line, stored verbatim. See the library doc, point 2.
              // The exact bytes the emitter would write. Any other encoder here and an incremental
              // build stops being byte-identical to a clean one — quietly.
              line: uir.canonicalEncode(node.toJson()),
            ),
        ],
      );

      cache.writeModule(keys[path]!, artifact);
      cached[path] = artifact;
    }

    // ── 6. Merge. ──
    //
    // Order is imposed here, over the whole program, by the same rule a clean build uses. So it
    // cannot depend on which files were rebuilt, nor on the order they were visited.
    //
    // Deduplicated by id: two files may contain textually identical subtrees, and content addressing
    // means those *are* the same node (M1-T3). Keeping both would emit it twice.
    final Map<String, CachedRecord> byId = <String, CachedRecord>{};
    for (final String path in paths) {
      for (final CachedRecord record in cached[path]!.records) {
        byId[record.id] = record;
      }
    }

    final List<uir.UirNode> nodes = canonicalizeProgram<uir.UirNode>(
      byId.values.map((CachedRecord r) => uir.uirNodeFromJson(jsonDecode(r.line))).toList(),
      kindOf: (uir.UirNode node) => node.kind,
      idOf: (uir.UirNode node) => node.toJson()['id']! as String,
    );

    return IncrementalResult(
      program: CanonicalProgram(nodes: nodes),
      stats: cache.stats,
      rebuilt: stale..sort(),
      digests: digests,
    );
  }

  /// Every declaration symbol in [records], including those nested inside them.
  static Set<String> _symbolsOf(List<RawNode> records) {
    final Set<String> symbols = <String>{};
    for (final RawNode record in records) {
      _collect(record, symbols);
    }
    return symbols;
  }

  static void _collect(RawNode node, Set<String> symbols) {
    final String? symbol = node.symbol;
    if (symbol != null) {
      symbols.add(symbol);
    }
    for (final RawValue value in node.fields.values) {
      _collectValue(value, symbols);
    }
  }

  static void _collectValue(RawValue value, Set<String> symbols) {
    switch (value) {
      case RawChild(:final RawNode node):
        _collect(node, symbols);
      case RawList(:final List<RawValue> items):
        for (final RawValue item in items) {
          _collectValue(item, symbols);
        }
      case RawMap(:final Map<String, RawValue> entries):
        for (final RawValue entry in entries.values) {
          _collectValue(entry, symbols);
        }
      case RawLiteral():
      case RawRef():
      // A route reference names a path, not a declaration symbol, so it contributes no symbol to the
      // dependency set. The path is resolved against the whole route table at build time (§A17).
      case RawRouteRef():
        break;
    }
  }
}
