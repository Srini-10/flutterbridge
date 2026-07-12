/// Import resolution, and the preflight check it exists for.
///
/// Layer: `workspace`.
///
/// ## Why this is here at all
///
/// Without a complete element model, `package:analyzer` does not fail. It hands back a *resolved*
/// unit in which every Flutter type is `InvalidType` — and extraction, seeing types it does not
/// recognise, produces a confident-looking tree of opaque nodes instead of an error.
///
/// That happened, and it cost a debugging cycle to notice (M0-T3, finding F6): 38 widgets became 0
/// widgets purely because `pub get` had not been run, with no error anywhere.
///
/// C1 then found the more interesting version of the same thing on real projects. **Flutter Gallery
/// does not resolve until `flutter gen-l10n` has run**; **compass_app** depends on `freezed` and
/// `json_serializable`, so it does not resolve until `build_runner` has. Neither is a broken project.
/// Both are projects whose *generated code has not been generated yet* — a state the analyzer must
/// name, not stumble into.
///
/// So the loader checks, before resolving a single unit, that every import points at something. It is
/// cheap — parse, look at the directives, consult the package config — and it turns the worst failure
/// mode the analyzer has into a sentence that tells the user which command to run.
library;

import 'dart:io';

import 'package:bridge_analyzer/src/workspace/package_config.dart';
import 'package:meta/meta.dart';
import 'package:path/path.dart' as p;

/// What became of one import.
@immutable
final class ImportResolution {
  const ImportResolution._({required this.uri, required this.target, required this.reason});

  /// The import resolved to a file that exists.
  factory ImportResolution.resolved(String uri, String target) =>
      ImportResolution._(uri: uri, target: target, reason: null);

  /// The import points at nothing, for [reason].
  factory ImportResolution.unresolved(String uri, UnresolvedReason reason) =>
      ImportResolution._(uri: uri, target: null, reason: reason);

  /// The import URI, as written.
  final String uri;

  /// The file it resolves to, when it resolves.
  final String? target;

  /// Why it does not resolve, when it does not.
  final UnresolvedReason? reason;

  /// Whether the import points at something.
  bool get isResolved => reason == null;
}

/// Why an import does not resolve.
///
/// The distinction is the whole point. "You have not run `pub get`" and "you have not run
/// `build_runner`" and "you have a typo" are three different problems with three different fixes, and
/// a single "unresolved import" would leave the user to guess which one they have.
enum UnresolvedReason {
  /// The package is not in the package config: it is not a dependency, or `pub get` has not run.
  unknownPackage,

  /// The package resolves, but the file inside it does not exist.
  missingFile,

  /// The file is generated (`.g.dart`, `.freezed.dart`, …) and has not been generated.
  ///
  /// Distinguished from [missingFile] because the fix is a command, not an edit.
  missingGeneratedFile,

  /// The import is of the synthetic `package:flutter_gen` — Flutter's localizations output.
  ///
  /// Distinguished again, because the command is a different one, and because a project depending on
  /// it may not build on a current Flutter at all: the synthetic package was removed.
  missingLocalizations,
}

/// Resolves import URIs against a project.
final class ImportResolver {
  /// Creates a resolver for [packageConfig].
  const ImportResolver({required this.packageConfig, required this.projectRoot});

  /// The project's package config.
  final PackageConfig packageConfig;

  /// The project root, for relative imports.
  final String projectRoot;

  /// File suffixes produced by code generators, in the order they are matched.
  static const List<String> generatedSuffixes = <String>[
    '.g.dart',
    '.freezed.dart',
    '.gr.dart',
    '.config.dart',
    '.mocks.dart',
  ];

  /// Resolves [uri], written inside the file at project-relative [fromFile].
  ///
  /// `dart:` imports always resolve: the SDK is pinned, and an import of `dart:async` cannot be the
  /// user's problem.
  ImportResolution resolve(String uri, {required String fromFile}) {
    if (uri.startsWith('dart:')) {
      return ImportResolution.resolved(uri, uri);
    }

    if (uri.startsWith('package:')) {
      // Flutter's synthetic localizations package. It is not a real package on disk, and recent
      // Flutter removed it entirely — so an import of it is either "run gen-l10n" or "this project
      // predates the removal", and the diagnostic says both.
      if (uri.startsWith('package:flutter_gen/')) {
        return packageConfig.has('flutter_gen')
            ? ImportResolution.resolved(uri, uri)
            : ImportResolution.unresolved(uri, UnresolvedReason.missingLocalizations);
      }

      final String? target = packageConfig.resolvePackageUri(uri);
      if (target == null) {
        return ImportResolution.unresolved(uri, UnresolvedReason.unknownPackage);
      }
      return File(target).existsSync()
          ? ImportResolution.resolved(uri, target)
          : ImportResolution.unresolved(uri, _missingReason(uri));
    }

    // A relative import, resolved against the importing file's directory.
    final String target = p.normalize(
      p.join(projectRoot, p.dirname(fromFile), uri),
    );
    return File(target).existsSync()
        ? ImportResolution.resolved(uri, target)
        : ImportResolution.unresolved(uri, _missingReason(uri));
  }

  static UnresolvedReason _missingReason(String uri) =>
      generatedSuffixes.any(uri.endsWith)
      ? UnresolvedReason.missingGeneratedFile
      : UnresolvedReason.missingFile;
}
