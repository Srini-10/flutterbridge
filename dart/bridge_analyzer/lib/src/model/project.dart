/// The description of a Flutter project under analysis.
///
/// Layer: `model` — depends on `util` only.
library;

import 'package:meta/meta.dart';

/// An immutable description of the project the analyzer was pointed at.
///
/// Produced by the `load` stage; consumed by every stage after it. It is deliberately data, not a
/// handle: nothing here reaches back into the filesystem.
@immutable
final class ProjectInfo {
  /// Creates a project description.
  const ProjectInfo({
    required this.root,
    required this.packageName,
    required this.packageConfigPath,
    required this.libraryFiles,
    required this.isWorkspaceMember,
    required this.isFlutterProject,
    required this.dependencies,
    this.sdkConstraint,
    this.flutterConstraint,
  });

  /// Absolute path to the project root (the directory holding `pubspec.yaml`).
  final String root;

  /// The package's declared name, from `pubspec.yaml`.
  ///
  /// The name the authors gave it — never the directory name, which is an accident of checkout.
  final String packageName;

  /// Absolute path to the resolved `package_config.json`.
  ///
  /// In a Dart pub workspace (Dart 3.6+) this lives at the *workspace root*, not in the package
  /// directory. Discovered in M0-T6/C1 against `flutter/samples`, which our first implementation
  /// wrongly rejected as un-analyzable.
  final String packageConfigPath;

  /// Project-relative paths of every Dart library under `lib/`, in a deterministic order.
  ///
  /// Ordered by `sortedPaths` at construction: filesystem listing order is not a specification.
  final List<String> libraryFiles;

  /// Whether [packageConfigPath] was found above [root] — i.e. the project is a member of a pub
  /// workspace rather than a standalone package.
  final bool isWorkspaceMember;

  /// Whether the package depends on the `flutter` SDK.
  ///
  /// A package that does not is a plain Dart package. It can be analyzed — and is, so that a
  /// mis-pointed `--project` produces a report rather than a refusal — but it contains no widgets,
  /// so extraction will find nothing to convert.
  final bool isFlutterProject;

  /// Every declared dependency and dev-dependency name, sorted.
  ///
  /// Extraction reads this to decide which package adapters apply (`go_router`, `provider`, and the
  /// rest of the registry C1 sized). Sorted because it is reported, and a report whose order follows
  /// YAML key order is a report that cannot be diffed.
  final List<String> dependencies;

  /// The declared Dart SDK constraint, if any.
  final String? sdkConstraint;

  /// The declared Flutter SDK constraint, if any.
  final String? flutterConstraint;

  @override
  String toString() => 'ProjectInfo($packageName, ${libraryFiles.length} libraries)';
}
