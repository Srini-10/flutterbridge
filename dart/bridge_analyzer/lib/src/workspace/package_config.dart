/// The package config.
///
/// Layer: `workspace`.
///
/// `.dart_tool/package_config.json` is the map from a `package:` URI to a directory on disk. It is
/// what `pub get` produces, and without it nothing resolves.
///
/// The analyzer reads it for one reason: to answer *does this import point at anything?* — cheaply,
/// without resolving a single unit. That question is the whole of the preflight check, and it is the
/// difference between refusing a project that has not been code-generated and extracting a confident
/// pile of garbage from it.
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/errors/internal_error.dart';
import 'package:meta/meta.dart';
import 'package:path/path.dart' as p;

/// One package, as the config describes it.
@immutable
final class PackageEntry {
  /// Creates an entry.
  const PackageEntry({required this.name, required this.libRoot});

  /// The package name, as it appears in a `package:` URI.
  final String name;

  /// The absolute directory that `package:<name>/…` resolves against.
  final String libRoot;
}

/// The resolved package config.
@immutable
final class PackageConfig {
  /// Creates a config.
  const PackageConfig({required this.path, required this.packages});

  /// Reads the config at [file].
  ///
  /// Throws [EnvironmentFailure] if it cannot be understood. A package config the analyzer cannot
  /// parse is indistinguishable, in its consequences, from one that is missing.
  factory PackageConfig.load(File file) {
    final Object? document;
    try {
      document = jsonDecode(file.readAsStringSync());
    } on FormatException catch (error) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.noPackageConfig.id,
        message: 'package_config.json is not valid JSON: ${error.message}',
        remedy: 'Run `flutter pub get` in the project, then re-run.',
      );
    }

    if (document is! Map<String, Object?>) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.noPackageConfig.id,
        message: 'package_config.json does not contain a JSON object.',
        remedy: 'Run `flutter pub get` in the project, then re-run.',
      );
    }

    final Object? raw = document['packages'];
    if (raw is! List<Object?>) {
      throw EnvironmentFailure(
        diagnosticCode: Codes.noPackageConfig.id,
        message: 'package_config.json has no "packages" list.',
        remedy: 'Run `flutter pub get` in the project, then re-run.',
      );
    }

    final Map<String, PackageEntry> packages = <String, PackageEntry>{};
    final String configDirectory = file.parent.path;

    for (final Object? entry in raw) {
      if (entry is! Map<String, Object?>) {
        continue;
      }
      final Object? name = entry['name'];
      final Object? rootUri = entry['rootUri'];
      if (name is! String || rootUri is! String) {
        continue;
      }

      // `rootUri` is relative to the *config file's directory*, and `packageUri` (default "lib/") is
      // relative to that. Getting either wrong resolves every import of that package to nothing.
      final String root = _resolve(configDirectory, rootUri);
      final String packageUri = entry['packageUri'] is String
          ? entry['packageUri']! as String
          : 'lib/';

      packages[name] = PackageEntry(name: name, libRoot: p.normalize(p.join(root, packageUri)));
    }

    return PackageConfig(path: file.path, packages: packages);
  }

  /// Where the config was read from.
  final String path;

  /// Every package it declares, by name.
  final Map<String, PackageEntry> packages;

  /// Whether [name] is a package this project can import.
  bool has(String name) => packages.containsKey(name);

  /// The Dart SDK this project was resolved against, or `null` when it cannot be derived.
  ///
  /// **The SDK a project is analyzed against must be the SDK it was resolved against**, and that is
  /// knowable from the project itself rather than from the machine running the analyzer. A Flutter
  /// project's `package_config.json` names `sky_engine`, which lives inside the Flutter SDK's own
  /// cache at `<flutter>/bin/cache/pkg/sky_engine` — so the Dart SDK beside it, at
  /// `<flutter>/bin/cache/dart-sdk`, is the one `flutter pub get` resolved this project with.
  ///
  /// Without this, `package:analyzer` falls back to deriving the SDK from `Platform.resolvedExecutable`
  /// — whatever `dart` happens to be running us. Two ways that is wrong:
  ///
  ///   * A machine with a standalone Dart on `PATH` *and* Flutter installed analyzes a Flutter project
  ///     against the standalone SDK's core libraries. It does not fail; it resolves against the wrong
  ///     `dart:core` and carries on, which is the quietly-wrong outcome the loader's schema check
  ///     exists to prevent one layer up.
  ///   * In an AOT binary `resolvedExecutable` is *the binary*, so the SDK is looked for beside it and
  ///     is not there. That is the concrete failure `dart compile exe` produced: `PathNotFoundException`
  ///     on `<binary dir>/lib/_internal/sdk_library_metadata/lib/libraries.dart`.
  ///
  /// Returns `null` for a plain Dart package, which has no `sky_engine` and for which the ambient SDK
  /// is the right answer.
  String? get dartSdkPath {
    final PackageEntry? skyEngine = packages['sky_engine'];
    if (skyEngine == null) {
      return null;
    }
    // `<flutter>/bin/cache/pkg/sky_engine/lib` → up past lib, sky_engine and pkg → `<flutter>/bin/cache`.
    final String cache = p.dirname(p.dirname(p.dirname(skyEngine.libRoot)));
    final String sdk = p.join(cache, 'dart-sdk');
    return Directory(sdk).existsSync() ? sdk : null;
  }

  /// Resolves a `package:` URI to an absolute file path, or `null` if the package is unknown.
  ///
  /// Returns a path whether or not the file exists: *the package resolves* and *the file exists* are
  /// different questions, and the caller wants to tell them apart.
  String? resolvePackageUri(String uri) {
    if (!uri.startsWith('package:')) {
      return null;
    }
    final String rest = uri.substring('package:'.length);
    final int slash = rest.indexOf('/');
    if (slash <= 0) {
      return null;
    }

    final PackageEntry? entry = packages[rest.substring(0, slash)];
    if (entry == null) {
      return null;
    }
    return p.normalize(p.join(entry.libRoot, rest.substring(slash + 1)));
  }

  static String _resolve(String base, String rootUri) {
    if (rootUri.startsWith('file://')) {
      return Uri.parse(rootUri).toFilePath();
    }
    if (p.isAbsolute(rootUri)) {
      return rootUri;
    }
    return p.normalize(p.join(base, rootUri));
  }
}
