/// Offline diagnostic documentation.
///
/// Layer: `diagnostics`.
///
/// `bridge_analyzer explain BRG1201` prints what a code means, why it exists, and what to do about
/// it — **without a network connection and without a docs site** (Spec §9.2).
///
/// That is deliberate. A developer whose build just failed is, by definition, in the middle of
/// something. Making them open a browser to find out what `BRG1201` means is a tax on the worst
/// moment of their day, and the explanation is three sentences that already live in the binary.
library;

import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';

/// Renders explanations of diagnostic codes.
final class Explainer {
  /// Creates an explainer.
  const Explainer();

  /// Explains [id], or reports that it is not a code.
  ///
  /// Returns `null` when [id] is unregistered, so a caller can choose the exit code: an unknown code
  /// is a user error, not an empty answer.
  String? explain(String id) {
    final DiagnosticCode? code = Codes.byId(id.toUpperCase());
    if (code == null) {
      return null;
    }

    return '${code.id}: ${code.title}\n'
        '\n'
        'Severity: ${code.defaultSeverity.name}\n'
        'Category: ${code.category.name}\n'
        '\n'
        '${code.explanation}\n';
  }

  /// Every code, one per line, in ascending id order.
  ///
  /// The order is a guarantee: this output is diffed by whoever reviews a new diagnostic.
  String list() {
    final StringBuffer out = StringBuffer();
    for (final DiagnosticCode code in Codes.all) {
      out.writeln('${code.id}  ${code.defaultSeverity.name.padRight(7)}  ${code.title}');
    }
    return out.toString();
  }
}
