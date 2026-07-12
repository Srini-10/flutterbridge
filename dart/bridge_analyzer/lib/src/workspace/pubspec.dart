/// The pubspec.
///
/// Layer: `workspace`.
///
/// Parsed with a real YAML parser, not a line scan. A pubspec is YAML, and a project whose
/// dependencies are written in a style the analyzer did not anticipate must not be silently
/// misunderstood — `dependencies:` written across a flow map, a name in quotes, a comment in the
/// middle of the list. The version of this file that scanned for a line beginning with `name:` would
/// have got all three wrong.
library;

import 'dart:io';

import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/errors/internal_error.dart';
import 'package:meta/meta.dart';
import 'package:yaml/yaml.dart';

/// A project's `pubspec.yaml`, as far as the analyzer cares about it.
@immutable
final class Pubspec {
  /// Creates a pubspec.
  const Pubspec({
    required this.name,
    required this.dependencies,
    required this.devDependencies,
    this.sdkConstraint,
    this.flutterConstraint,
  });

  /// Reads and parses the pubspec at [file].
  ///
  /// Throws [EnvironmentFailure] if the file is not a pubspec the analyzer can use. A malformed
  /// pubspec is the project's problem and the user can fix it; guessing at it is not an option, since
  /// every subsequent decision — which package this is, whether it is Flutter — depends on it.
  factory Pubspec.load(File file) {
    final Object? document;
    try {
      document = loadYaml(file.readAsStringSync());
    } on YamlException catch (error) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.malformedPubspec.id,
        message: 'pubspec.yaml is not valid YAML: ${error.message}',
        remedy: 'Fix pubspec.yaml, then re-run.',
      );
    }

    if (document is! YamlMap) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.malformedPubspec.id,
        message: 'pubspec.yaml does not contain a YAML mapping.',
        remedy: 'Fix pubspec.yaml, then re-run.',
      );
    }

    final Object? name = document['name'];
    if (name is! String || name.isEmpty) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.malformedPubspec.id,
        message: 'pubspec.yaml declares no package name.',
        remedy: 'Add a `name:` to pubspec.yaml.',
      );
    }

    final Map<String, String?> dependencies = _dependencies(document['dependencies']);
    final Map<String, String?> devDependencies = _dependencies(document['dev_dependencies']);
    final Object? environment = document['environment'];

    return Pubspec(
      name: name,
      dependencies: dependencies,
      devDependencies: devDependencies,
      sdkConstraint: environment is YamlMap ? environment['sdk'] as String? : null,
      flutterConstraint: environment is YamlMap ? environment['flutter'] as String? : null,
    );
  }

  /// The package's declared name.
  ///
  /// The name its authors gave it — never the directory name, which is an accident of checkout.
  final String name;

  /// Runtime dependencies, name to version constraint. A `null` constraint means an SDK or path
  /// dependency, which has no version.
  final Map<String, String?> dependencies;

  /// Development dependencies.
  final Map<String, String?> devDependencies;

  /// The Dart SDK constraint, if declared.
  final String? sdkConstraint;

  /// The Flutter SDK constraint, if declared.
  final String? flutterConstraint;

  /// Whether this is a Flutter package.
  ///
  /// A Flutter package depends on the `flutter` SDK. A package that does not is a plain Dart package:
  /// it can be analyzed, but it contains no widgets, so extraction will find nothing to convert.
  bool get isFlutter => dependencies.containsKey('flutter');

  /// Every dependency the analyzer might care about, sorted.
  ///
  /// Sorted because it is reported, and a report whose order depends on YAML key order is a report
  /// that cannot be diffed.
  List<String> get allDependencyNames =>
      <String>{...dependencies.keys, ...devDependencies.keys}.toList()..sort();

  static Map<String, String?> _dependencies(Object? node) {
    if (node == null) {
      return const <String, String?>{};
    }
    if (node is! YamlMap) {
      throw BridgeInternalError(
        'workspace.malformed-dependencies',
        'A dependency section of pubspec.yaml is not a mapping.',
      );
    }

    final Map<String, String?> out = <String, String?>{};
    for (final MapEntry<Object?, Object?> entry in node.entries) {
      final Object? key = entry.key;
      if (key is! String) {
        continue;
      }
      // A dependency's value is a version string, or a map (an SDK, path, or git dependency). The
      // analyzer only ever needs to know *that* the dependency exists, and its version when it has
      // one — so a map becomes a null constraint rather than an error.
      out[key] = entry.value is String ? entry.value! as String : null;
    }
    return out;
  }
}
