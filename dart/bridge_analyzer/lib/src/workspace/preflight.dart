/// The preflight check.
///
/// Layer: `workspace`.
///
/// ## The failure this exists to prevent
///
/// `package:analyzer` does not fail on an incomplete element model. Pointed at a project whose
/// dependencies have not been fetched, or whose generated code has not been generated, it returns a
/// perfectly well-formed **resolved** unit in which every type it could not find is `InvalidType`.
/// Extraction, which asks each expression what its type is, then sees types it does not recognise and
/// does the reasonable thing: it produces opaque nodes. The output is a confident, plausible,
/// well-ordered, deterministic tree of nothing — and no error is raised anywhere.
///
/// We have run into this three times:
///
/// * **M0-T3, finding F6** — 38 widgets became 0 widgets because `pub get` had not been run. It cost
///   a full debugging cycle to notice, because nothing in the output *looked* wrong.
/// * **C1, Flutter Gallery** — does not resolve until `flutter gen-l10n` has run.
/// * **C1, compass_app** — depends on `freezed` and `json_serializable`, so every `part
///   'x.freezed.dart';` in it dangles until `build_runner` has run.
///
/// None of those three is a broken project. All three are projects in a state the analyzer must be
/// able to *name*. So before a single unit is resolved, every directive in `lib/` is checked against
/// the package config. It is cheap — a parse and a map lookup, no resolution — and it converts the
/// worst failure mode the compiler has into a sentence naming the command to run.
///
/// INV-5: an unfit environment is refused. It is never analyzed anyway.
library;

import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/model/directive_ref.dart';
import 'package:bridge_analyzer/src/workspace/import_resolver.dart';

/// Checks that every directive in a project points at something.
final class Preflight {
  /// Creates a check against [resolver].
  const Preflight({required this.resolver});

  /// Resolves a URI to a file.
  final ImportResolver resolver;

  /// Checks the directives of one file, and returns a diagnostic for each that dangles.
  ///
  /// Returns them in the order the directives appear. The sink imposes the report's total order; this
  /// only has to avoid introducing a nondeterministic one.
  List<Diagnostic> check(String relativePath, List<DirectiveRef> directives) {
    final List<Diagnostic> found = <Diagnostic>[];

    for (final DirectiveRef directive in directives) {
      final ImportResolution resolution = resolver.resolve(directive.uri, fromFile: relativePath);
      if (resolution.isResolved) {
        continue;
      }

      found.add(
        Diagnostic(
          code: Codes.unresolvedImport,
          message:
              'The ${directive.kind.word} of `${directive.uri}` does not resolve to any file, so '
              'the element model would be incomplete. Every type it provides would silently become '
              'InvalidType, and extraction would produce opaque nodes instead of an error.',
          span: directive.span,
          hint: _hint(resolution.reason!, directive),
        ),
      );
    }

    return found;
  }

  /// What the user should actually do — which is the entire value of this check.
  ///
  /// The four reasons have four different fixes, and a single "unresolved import" would leave the
  /// user to guess which one they have.
  String _hint(UnresolvedReason reason, DirectiveRef directive) => switch (reason) {
    UnresolvedReason.unknownPackage =>
      'No package named `${_packageOf(directive.uri)}` is in the package config. Either it is not a '
          'dependency of this project — add it to pubspec.yaml — or dependencies have not been '
          'fetched: run `flutter pub get`.',
    UnresolvedReason.missingGeneratedFile =>
      '`${directive.uri}` is generated code that has not been generated. Run '
          '`dart run build_runner build --delete-conflicting-outputs`, then re-run.',
    UnresolvedReason.missingLocalizations =>
      '`package:flutter_gen` is the synthetic package `flutter gen-l10n` produces. Run '
          '`flutter gen-l10n`, then re-run. (Recent Flutter releases removed the synthetic package '
          'entirely; a project still importing it may need `synthetic-package: false` in l10n.yaml '
          'and an import of the generated file by path.)',
    UnresolvedReason.missingFile =>
      'The package resolves, but `${directive.uri}` is not in it. Check the path — and if this is a '
          'recently added dependency, run `flutter pub get`.',
  };

  static String _packageOf(String uri) {
    final String rest = uri.substring('package:'.length);
    final int slash = rest.indexOf('/');
    return slash < 0 ? rest : rest.substring(0, slash);
  }
}
