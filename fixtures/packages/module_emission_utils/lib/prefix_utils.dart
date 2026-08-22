// Rung N of the M8-U reduction ladder — a cross-file, same-package call: `withPrefix` (this file)
// calls `shout` (format_utils.dart), proving the import model correctly crosses a module boundary
// within one package.

import 'format_utils.dart';

String withPrefix(String s) => 'Mr. ${shout(s)}';
