/// The resolved-analysis session.
///
/// Layer: `session` — depends on `cache`, `workspace`, `model`, `errors`, `util`.
///
/// This is the only part of the compiler that knows `package:analyzer` exists. Everything above it
/// consumes resolved units through [AnalysisSessionHandle]; nothing above it imports the analyzer
/// API directly.
///
/// That boundary is deliberate and load-bearing. ADR-14 records that analyzer 14 shipped a redesigned
/// AST (`ClassDeclaration.body.members`, `NamedArgument`, a unified `FormalParameter`), and that
/// adapting to it cost three rounds of compile fixes. The next such redesign must be absorbable by
/// editing this directory and nothing else.
library;

import 'dart:io';

import 'package:analyzer/dart/analysis/analysis_context_collection.dart';
import 'package:analyzer/dart/analysis/results.dart';
import 'package:bridge_analyzer/src/model/directive_ref.dart';
import 'package:bridge_analyzer/src/model/project.dart';
import 'package:bridge_analyzer/src/session/directive_scanner.dart';
import 'package:bridge_analyzer/src/session/session_digest_provider.dart';
import 'package:bridge_analyzer/src/session/source_parser.dart';
import 'package:path/path.dart' as p;

/// A resolved compilation unit, with the project-relative path it came from.
final class ResolvedUnit {
  /// Creates a resolved unit.
  const ResolvedUnit({required this.relativePath, required this.result});

  /// The path of the unit, relative to the project root.
  final String relativePath;

  /// The resolved unit, with a complete element model.
  final ResolvedUnitResult result;
}

/// Owns the `package:analyzer` context for one project and hands out resolved units.
///
/// Constructed by the `load` stage; consumed by `extract`.
final class AnalysisSessionHandle {
  /// Creates a handle over [project].
  AnalysisSessionHandle({
    required this.project,
    SourceParser parser = const SourceParser(),
    DirectiveScanner scanner = const DirectiveScanner(),
  }) : _parser = parser,
       _scanner = scanner,
       _collection = AnalysisContextCollection(
         includedPaths: <String>[project.root],
         // The SDK the project was *resolved* against, not the one running us. `ProjectInfo.dartSdkPath`
         // derives it from the resolved package graph; `null` keeps `package:analyzer`'s own default,
         // which is the right answer for a plain Dart package.
         sdkPath: project.dartSdkPath,
       );

  /// The project being analyzed.
  final ProjectInfo project;

  final AnalysisContextCollection _collection;
  final SourceParser _parser;
  final DirectiveScanner _scanner;

  /// Computes file digests for the incremental cache (M1-T5).
  ///
  /// `digestProvider.digest` is structurally a `DigestProvider` — the seam M1-T5 defined and left
  /// open, because computing a digest means reading Dart syntax and only this layer may. It hangs
  /// here because this is the object that owns the parser, and the `incremental` layer must never
  /// acquire one.
  late final SessionDigestProvider digestProvider = SessionDigestProvider(
    packageName: project.packageName,
    parser: _parser,
  );

  /// The **host** path for a project-relative path.
  ///
  /// ## Two path domains, and the boundary between them
  ///
  /// Since M5-F this compiler has two kinds of path, and conflating them is what W-5 was:
  ///
  ///   * **Logical** — project-relative, always `/`-separated, on every platform. `span.file`, anchors,
  ///     node ids (ADR-17), digest keys and import edges are all this. They are identical on every OS by
  ///     construction, which is what makes UIR byte-identical and a cache shareable.
  ///   * **Host** — what `dart:io` and `package:analyzer` accept. Separated by whatever the OS uses.
  ///
  /// `p.join(root, 'lib/main.dart')` on Windows produces `C:\…\project\lib/main.dart` — a hybrid that
  /// belongs to neither domain, and `package:analyzer` rejects it outright:
  ///
  /// ```text
  /// Invalid argument(s): Only absolute normalized paths are supported:
  ///   C:\Users\RUNNER~1\AppData\Local\Temp\bridge_analyzer_test_…\lib/main.dart
  /// ```
  ///
  /// Splitting on the URL separator and re-joining with the host's is the conversion. It is a no-op on
  /// POSIX, which is exactly why the boundary went unnoticed until a Windows runner existed.
  String _hostPath(String relativePath) => p.joinAll(<String>[project.root, ...p.url.split(relativePath)]);

  /// Reads the source of the project-relative [relativePath].
  String readSource(String relativePath) => File(_hostPath(relativePath)).readAsStringSync();

  /// The directives of [relativePath], read by parsing [source].
  ///
  /// Parsing only. This runs *before* anything is resolved, because whether the project can be
  /// resolved at all is precisely the question the caller is about to answer with it — see
  /// `workspace/preflight.dart`, and the three separate occasions on which not asking it cost us a
  /// day.
  List<DirectiveRef> directivesOf(String relativePath, String source) =>
      _scanner.scan(_parser.parse(path: relativePath, source: source));

  /// Resolves every library under `lib/`, in the deterministic order fixed by [ProjectInfo].
  ///
  /// Yields lazily: a large application resolves thousands of units, and holding them all live at
  /// once is a memory cost with no benefit — extraction consumes each unit once.
  Stream<ResolvedUnit> resolveAll() async* {
    for (final String relativePath in project.libraryFiles) {
      final ResolvedUnit? unit = await resolve(relativePath);
      if (unit != null) {
        yield unit;
      }
    }
  }

  /// Resolves a single library, or returns `null` if the analyzer could not produce a resolved unit.
  ///
  /// Returning `null` rather than throwing is deliberate: an unresolvable unit is a *finding about
  /// the project*, which the caller turns into a diagnostic. It is not a compiler bug.
  Future<ResolvedUnit?> resolve(String relativePath) async {
    final String absolute = _hostPath(relativePath);
    final Object result = await _collection
        .contextFor(absolute)
        .currentSession
        .getResolvedUnit(absolute);
    if (result is! ResolvedUnitResult) {
      return null;
    }
    return ResolvedUnit(relativePath: relativePath, result: result);
  }
}
