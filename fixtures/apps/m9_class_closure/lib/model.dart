/// The complete, integrated bounded project-class subset M9 closes with, on one class:
///
/// - a required-named structural constructor (`Model.named`, M9-P/ADR-0037) — the constructor's own
///   parameter order (`name`, then `count`) deliberately the reverse of field declaration order, so a
///   correct construction proves argument-evaluation order is preserved, not merely emitted;
/// - two immutable instance fields, readable directly off the receiver (M9-N/ADR-0035);
/// - one bounded, dispatch-safe derived getter (M9-Q/ADR-0038).
///
/// `Model` itself has no superclass/`implements`/`with` — the whole-class prerequisite every one of
/// these three capabilities shares.
class Model {
  final int count;
  final String name;

  Model.named({required this.name, required this.count});

  int get doubled => count * 2;
}
