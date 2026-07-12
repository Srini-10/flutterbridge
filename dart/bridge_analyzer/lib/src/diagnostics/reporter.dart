/// The reporting contract.
///
/// Layer: `diagnostics`.
///
/// A reporter turns a [DiagnosticReport] into text. Every reporter is **pure and deterministic**: the
/// same report always renders to the same string. No timestamps, no absolute paths, no hostnames, no
/// colour unless it is asked for — a report that changes between two identical runs cannot be
/// golden-tested, diffed in CI, or trusted.
///
/// `Reporter` and `SourceProvider` are single-method interfaces on purpose: they are extension
/// points, implemented by several classes and injected. Collapsing them into top-level functions,
/// as `one_member_abstracts` suggests, would mean the CLI could no longer choose a renderer at
/// runtime — which is the entire job.
// ignore_for_file: one_member_abstracts
library;

import 'dart:io';

import 'package:bridge_analyzer/src/diagnostics/diagnostic_report.dart';
import 'package:path/path.dart' as p;

/// Renders a report.
abstract interface class Reporter {
  /// Renders [report] to a string.
  String render(DiagnosticReport report);
}

/// Where a reporter gets source text, for excerpts.
///
/// Optional by design. A diagnostic must render usefully even when its file cannot be read — from a
/// cache, from a different machine, from a CI job that has already cleaned its workspace. The excerpt
/// is an enhancement, never a dependency. See `NoSourceProvider`, the default.
abstract interface class SourceProvider {
  /// The source of [file], or `null` if it cannot be read.
  String? sourceOf(String file);
}

/// A provider that knows nothing.
///
/// The default: reporters must work without source, so the default must prove it.
final class NoSourceProvider implements SourceProvider {
  /// Creates a provider.
  const NoSourceProvider();

  @override
  String? sourceOf(String file) => null;
}

/// A provider backed by an in-memory map, keyed by project-relative path.
final class MapSourceProvider implements SourceProvider {
  /// Creates a provider over the given sources.
  const MapSourceProvider(this._sources);

  final Map<String, String> _sources;

  @override
  String? sourceOf(String file) => _sources[file];
}

/// A provider that reads source from the project on disk.
///
/// Reads are best-effort and never throw: a file that has been moved, deleted or is unreadable costs
/// the excerpt, not the diagnostic.
final class FileSourceProvider implements SourceProvider {
  /// Creates a provider rooted at [projectRoot]. Diagnostic paths are project-relative.
  const FileSourceProvider(this.projectRoot);

  /// The project root the paths are relative to.
  final String projectRoot;

  @override
  String? sourceOf(String file) {
    try {
      final File source = File(p.join(projectRoot, file));
      return source.existsSync() ? source.readAsStringSync() : null;
    } on FileSystemException {
      return null;
    }
  }
}
