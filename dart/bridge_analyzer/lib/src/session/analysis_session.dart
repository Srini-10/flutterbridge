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
import 'package:analyzer/dart/ast/ast.dart';
// `packageConfigFile` (M8-F) exists only on the internal implementation, not the public
// `AnalysisContextCollection` factory (see the constructor doc below). ADR-14 already accepts that
// this file, and only this file, may reach past the public API when the public one has no seam for
// something the compiler genuinely needs.
// ignore: implementation_imports
import 'package:analyzer/src/dart/analysis/analysis_context_collection.dart' show AnalysisContextCollectionImpl;
import 'package:bridge_analyzer/src/model/directive_ref.dart';
import 'package:bridge_analyzer/src/model/project.dart';
import 'package:bridge_analyzer/src/session/directive_scanner.dart';
import 'package:bridge_analyzer/src/session/session_digest_provider.dart';
import 'package:bridge_analyzer/src/session/source_parser.dart';
import 'package:bridge_analyzer/src/workspace/package_config.dart';
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
  ///
  /// [packageConfig] resolves every local dependency's root (M8-F) — the same config `load` already
  /// parsed to build [ProjectInfo.dependencyLibraryFiles], so the two stay consistent by construction
  /// rather than by two callers agreeing to compute the same closure twice.
  AnalysisSessionHandle({
    required this.project,
    required PackageConfig packageConfig,
    SourceParser parser = const SourceParser(),
    DirectiveScanner scanner = const DirectiveScanner(),
  }) : _packageConfig = packageConfig,
       _parser = parser,
       _scanner = scanner,
       _collection = AnalysisContextCollectionImpl(
         includedPaths: <String>[
           project.root,
           // A local dependency's *package root* (the parent of its `lib/`), not its `libRoot` itself —
           // `AnalysisContextCollection` roots a context at the directory carrying the package's own
           // `pubspec.yaml`/`analysis_options.yaml`, the same shape `project.root` already is for the
           // root package. Sorted by `localDependenciesOf`, so this list — and therefore which context
           // resolves which file — does not depend on `pub`'s own JSON key order (D1).
           for (final PackageEntry dependency in packageConfig.localDependenciesOf(project.packageName))
             p.dirname(dependency.libRoot),
         ],
         // A local dependency (M8-F) is never itself `pub get`-ed — that is exactly what makes it a
         // *dependency* rather than a project of its own — so it carries no `.dart_tool/package_config.json`
         // for `AnalysisContextCollection`'s own per-root auto-discovery to find by walking up from its
         // root. Left unset, that walk resolves each dependency root against whatever config it happens
         // to find first (its own root package's, if one was ever `pub get`-ed standalone; an ancestor's,
         // if the layout happens to nest one root under another; or none, in which case even Flutter SDK
         // types fail to resolve). All three are directory-layout accidents, not a property of the
         // program — proven directly: this repo's own `fixtures/packages/cross_package_ui` carries a
         // stray standalone `package_config.json` from an earlier manual `pub get`, which silently
         // propped up the M8-F build-proof fixture even though Continuum's real `continuum_ui_kit` (never
         // independently `pub get`-ed, and not nested under any ancestor's `.dart_tool`) fails the exact
         // same resolution with the same code unchanged. Naming the config explicitly makes every
         // included root — root project and every local dependency alike — resolve through the one
         // package graph the root project itself was `pub get`-ed against, which is what
         // `ProjectInfo.packageConfigPath` already names.
         packageConfigFile: project.packageConfigPath,
         // The SDK the project was *resolved* against, not the one running us. `ProjectInfo.dartSdkPath`
         // derives it from the resolved package graph; `null` keeps `package:analyzer`'s own default,
         // which is the right answer for a plain Dart package.
         sdkPath: project.dartSdkPath,
       );

  /// The project being analyzed.
  final ProjectInfo project;

  final PackageConfig _packageConfig;
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
  ///
  /// A local dependency's own file (M8-F) is not project-relative at all — it is named as a full
  /// `package:<name>/…` URI (`ProjectInfo.dependencyLibraryFiles`'s own shape) and resolved through
  /// [PackageConfig.resolvePackageUri], the same mechanism that already resolves *any* `package:` URI
  /// a reference inside the project names. There is no second, ad hoc path-joining rule for a
  /// dependency file — it goes through the one resolver every cross-file reference already trusts.
  String _hostPath(String relativePath) {
    if (relativePath.startsWith('package:')) {
      final String? resolved = _packageConfig.resolvePackageUri(relativePath);
      if (resolved != null) {
        return resolved;
      }
    }
    return p.joinAll(<String>[project.root, ...p.url.split(relativePath)]);
  }

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
  ///
  /// Root files first, then each local dependency's own files (M8-F) — `project.libraryFiles` then
  /// `project.dependencyLibraryFiles`, both already fixed in a deterministic order by `load`. A
  /// project with no local dependency walks exactly the sequence it always did.
  Stream<ResolvedUnit> resolveAll() async* {
    for (final String relativePath in <String>[...project.libraryFiles, ...project.dependencyLibraryFiles]) {
      // A `part of` file (M8-F) — commonly generated code (`build_runner`, `drift`, `json_serializable`)
      // — is not its own library, so `getResolvedUnit` has nothing to resolve it *as*; its declarations
      // arrive already, as part of the resolved unit for the library that `part`s it in. Checked by a
      // cheap parse, the same tool `preflight.dart` already uses for exactly this reason (`SourceParser`'s
      // own doc: "cannot fail in the interesting way, because a file that does not parse is a file the
      // user can see is broken") — never by the file's own name (`*.g.dart` is a convention, not a
      // guarantee; a hand-written part file has no reason to follow it).
      if (project.dependencyLibraryFiles.contains(relativePath) && _isPartFile(relativePath)) {
        continue;
      }
      final ResolvedUnit? unit = await resolve(relativePath);
      if (unit != null) {
        yield unit;
      }
    }
  }

  /// Whether [relativePath] is a `part of` file, decided by parsing it, never resolving it.
  bool _isPartFile(String relativePath) {
    final ParsedUnit parsed = _parser.parse(path: relativePath, source: readSource(relativePath));
    return parsed.unit.directives.any((Directive d) => d is PartOfDirective);
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
