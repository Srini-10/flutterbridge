/// Project discovery.
///
/// Layer: `workspace` — depends on `diagnostics`, `model`, `errors`, `util`.
///
/// This module answers exactly one question: *is this directory a project that can be analyzed, and
/// where is everything?* It refuses rather than guesses. Nothing downstream has to re-check what it
/// establishes.
///
/// It does not resolve a single unit, and it does not decide whether the project's *imports* point at
/// anything — that is `preflight.dart`, which needs a parser and therefore runs from the `session`
/// layer's side of the analyzer quarantine (ADR-14). The `load` stage composes the two.
library;

import 'dart:io';

import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/errors/internal_error.dart';
import 'package:bridge_analyzer/src/model/project.dart';
import 'package:bridge_analyzer/src/util/ordering.dart';
import 'package:bridge_analyzer/src/workspace/package_config.dart';
import 'package:bridge_analyzer/src/workspace/pubspec.dart';
import 'package:glob/glob.dart';
import 'package:meta/meta.dart';
import 'package:path/path.dart' as p;
import 'package:yaml/yaml.dart';

/// A loaded project: the data every stage sees, plus the package config the preflight check needs.
///
/// The split exists because [ProjectInfo] is a `model` type and must stay one — plain data, no
/// filesystem, no workspace types. [PackageConfig] is a `workspace` type, and only the `load` stage
/// has any business with it.
@immutable
final class LoadedProject {
  /// Creates a loaded project.
  const LoadedProject({required this.info, required this.packageConfig});

  /// The project, as data.
  final ProjectInfo info;

  /// The resolved package config, for resolving `package:` URIs.
  final PackageConfig packageConfig;
}

/// Loads a project from a directory, or refuses.
///
/// The refusal is the point. An analyzer pointed at a project whose dependencies have not been
/// fetched still gets a *resolved* AST back from `package:analyzer` — one in which every Flutter type
/// is `InvalidType`. Extraction then produces a confident-looking tree of opaque nodes instead of an
/// error. That failure was observed in M0-T3 (F6) and cost a full debugging cycle, so an unfit
/// environment is an [EnvironmentFailure] here, before a single unit is resolved.
final class ProjectLoader {
  /// Creates a loader.
  const ProjectLoader();

  /// How far up the directory tree to look for a pub-workspace root.
  static const int _maxWorkspaceDepth = 8;

  /// Loads the project rooted at [projectRoot].
  ///
  /// Throws [EnvironmentFailure] if the project cannot be analyzed.
  LoadedProject load(String projectRoot) {
    final String root = p.normalize(p.absolute(projectRoot));

    final File pubspecFile = File(p.join(root, 'pubspec.yaml'));
    if (!pubspecFile.existsSync()) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.noPubspec.id,
        message: 'The project directory has no pubspec.yaml, so it is not a Dart package.',
        remedy: 'Point --project at the directory containing pubspec.yaml.',
      );
    }
    final Pubspec pubspec = Pubspec.load(pubspecFile);

    final File? configFile = _findPackageConfig(root);
    if (configFile == null) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.noPackageConfig.id,
        message:
            'The project has no .dart_tool/package_config.json, and none was found at any parent '
            'workspace root. Without it every Flutter type resolves to InvalidType, and extraction '
            'would silently produce garbage rather than fail.',
        remedy: 'Run `flutter pub get` in the project, then re-run.',
      );
    }
    final PackageConfig packageConfig = PackageConfig.load(configFile);

    final Directory libDir = Directory(p.join(root, 'lib'));
    if (!libDir.existsSync()) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.noLibraryDirectory.id,
        message: 'The project has no lib/ directory, so there is nothing to extract.',
        remedy: 'Point --project at a Flutter application package.',
      );
    }

    // The package config is stale if it does not know the package it sits next to — which is what a
    // pubspec renamed since the last `pub get` looks like. Every `package:<self>/…` import in the
    // project would dangle, and the preflight check would report every one of them. Saying it once,
    // here, is the difference between one actionable line and a hundred confusing ones.
    if (!packageConfig.has(pubspec.name)) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.noPackageConfig.id,
        message:
            "The package config does not list this project's own package, `${pubspec.name}`, so "
            'it is stale — it predates the current pubspec.yaml.',
        remedy: 'Run `flutter pub get` in the project, then re-run.',
      );
    }

    // `p.url.joinAll(p.split(…))`, not a bare `p.relative`.
    //
    // ## Why the separator is normalised here
    //
    // A project-relative path stops being a filesystem path the moment it is written into UIR. It becomes
    // `span.file`, which becomes an **anchor** — `'${raw.span.file}#$segment'` in `node_factory.dart` since
    // M5-C's D4 — and an anchor is hashed into the node's id (ADR-17). So the path separator ends up inside
    // every content address in the document.
    //
    // `p.relative` uses the *host's* separator. On Windows that is `\`, so the same Flutter source would
    // produce `lib\main.dart`, anchors reading `lib\main.dart#_CounterScreenState`, and therefore **a
    // different id for every node** — not a cosmetic difference but a wholly different document, failing
    // every committed golden and sharing no cache entry with any other platform.
    //
    // M5-F found this by tracing the chain rather than by running Windows, which nobody here can do. It is
    // the second of two cross-platform reproducibility defects in this milestone; the other was line
    // endings, which changed `span.length` the same way and for the same underlying reason — a host detail
    // reaching output that is supposed to describe only the program.
    //
    // POSIX separators are the canonical form because UIR is exchanged between two language domains and
    // read on machines that did not produce it. On POSIX hosts this is a no-op.
    final List<String> libraryFiles = sortedPaths(
      libDir
          .listSync(recursive: true)
          .whereType<File>()
          .map((File f) => f.path)
          .where((String f) => f.endsWith('.dart'))
          .map((String f) => p.url.joinAll(p.split(p.relative(f, from: root)))),
    );

    // Every local dependency's own Dart source (M8-F) — a `path:` dependency, or a pub-workspace
    // member, per `PackageEntry.isLocal`. Named as full `package:<name>/…` URIs so a dependency file
    // can never collide with a [libraryFiles] entry, and so `AnalysisSessionHandle` can resolve either
    // shape back to a host path through the one mechanism, `PackageConfig.resolvePackageUri`, that
    // already exists for exactly this. Sorted by package name, then by path within it — deterministic
    // regardless of `pub`'s own JSON key order or any directory's listing order (D1).
    final List<String> dependencyLibraryFiles = <String>[
      for (final PackageEntry dependency in packageConfig.localDependenciesOf(pubspec.name))
        ..._dependencyLibraryFiles(dependency),
    ];

    return LoadedProject(
      info: ProjectInfo(
        root: root,
        packageName: pubspec.name,
        packageConfigPath: configFile.path,
        libraryFiles: List<String>.unmodifiable(libraryFiles),
        dependencyLibraryFiles: List<String>.unmodifiable(dependencyLibraryFiles),
        isWorkspaceMember: !p.isWithin(root, configFile.path),
        isFlutterProject: pubspec.isFlutter,
        dependencies: List<String>.unmodifiable(pubspec.allDependencyNames),
        sdkConstraint: pubspec.sdkConstraint,
        flutterConstraint: pubspec.flutterConstraint,
        dartSdkPath: packageConfig.dartSdkPath,
      ),
      packageConfig: packageConfig,
    );
  }

  /// Finds `package_config.json` for [root], walking up to a pub-workspace root if necessary.
  ///
  /// In a Dart pub workspace (Dart 3.6+) the file lives at the *workspace* root, not in the member
  /// package. C1 proved this the expensive way: checking only `<root>/.dart_tool` rejected
  /// `flutter/samples` — a perfectly analyzable project — as unfit.
  File? _findPackageConfig(String root) {
    String dir = root;
    for (int depth = 0; depth < _maxWorkspaceDepth; depth++) {
      final File candidate = File(p.join(dir, '.dart_tool', 'package_config.json'));
      if (candidate.existsSync()) {
        return candidate;
      }
      final String parent = p.dirname(dir);
      if (parent == dir) {
        return null;
      }
      dir = parent;
    }
    return null;
  }

  /// Every `.dart` file under [dependency]'s own `lib/`, as `package:<name>/…` URIs — the same
  /// discovery [load] runs for the root project's own `libraryFiles`, aimed at a different directory
  /// and named in the dependency's own URI space instead of project-relative to the root.
  ///
  /// A missing directory yields no files rather than refusing: a dependency this project cannot use
  /// yet (an empty package, or one with no `lib/` at all) is not this project's own unfitness, and
  /// `preflight.dart` already refuses on an import that does not resolve — the case that actually
  /// matters.
  ///
  /// Filtered by the dependency's *own* `analyzer.exclude` globs (M8-F), when it declares one in its
  /// own `analysis_options.yaml` — never this project's. A package that excludes its own generated
  /// bindings (drift, protobuf, `json_serializable`) from its own analysis is telling
  /// `AnalysisContextCollection` the same thing: `contextFor` genuinely has no context for a path an
  /// exclude glob covers, so walking past that opt-out is not a capability gained, it is a crash.
  List<String> _dependencyLibraryFiles(PackageEntry dependency) {
    final Directory libDir = Directory(dependency.libRoot);
    if (!libDir.existsSync()) {
      return const <String>[];
    }
    final String packageRoot = p.dirname(dependency.libRoot);
    final List<Glob> excludes = _analysisExcludeGlobs(packageRoot);
    return sortedPaths(
      libDir
          .listSync(recursive: true)
          .whereType<File>()
          .map((File f) => f.path)
          .where((String f) => f.endsWith('.dart'))
          .where((String f) {
            final String fromRoot = p.url.joinAll(p.split(p.relative(f, from: packageRoot)));
            return !excludes.any((Glob glob) => glob.matches(fromRoot));
          })
          .map(
            (String f) =>
                'package:${dependency.name}/${p.url.joinAll(p.split(p.relative(f, from: dependency.libRoot)))}',
          ),
    );
  }

  /// The `analyzer.exclude` globs [packageRoot]'s own `analysis_options.yaml` declares, or none.
  ///
  /// Read directly, never through an `include:` chain — an exclude a package inherits from a shared
  /// lint ruleset is not the kind of "this file is generated, do not analyze it" fact this exists to
  /// honour, and resolving `include:` would mean fetching *another* package's `analysis_options.yaml`
  /// for a question this project never asked. A malformed file is treated the same as an absent one:
  /// this is best-effort discovery, not a correctness check on the dependency's own configuration —
  /// `preflight.dart` already owns refusing an unfit project, and this is never the root one.
  List<Glob> _analysisExcludeGlobs(String packageRoot) {
    final File file = File(p.join(packageRoot, 'analysis_options.yaml'));
    if (!file.existsSync()) {
      return const <Glob>[];
    }
    try {
      final Object? document = loadYaml(file.readAsStringSync());
      if (document is! YamlMap) return const <Glob>[];
      final Object? analyzer = document['analyzer'];
      if (analyzer is! YamlMap) return const <Glob>[];
      final Object? exclude = analyzer['exclude'];
      if (exclude is! YamlList) return const <Glob>[];
      return <Glob>[for (final Object? pattern in exclude) if (pattern is String) Glob(pattern)];
    } on Object {
      return const <Glob>[];
    }
  }
}
