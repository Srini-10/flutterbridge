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
import 'package:meta/meta.dart';
import 'package:path/path.dart' as p;

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

    return LoadedProject(
      info: ProjectInfo(
        root: root,
        packageName: pubspec.name,
        packageConfigPath: configFile.path,
        libraryFiles: List<String>.unmodifiable(libraryFiles),
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
}
