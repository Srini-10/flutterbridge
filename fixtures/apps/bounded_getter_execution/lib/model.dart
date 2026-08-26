/// A plain, project-defined data class — one immutable field, one bounded, dispatch-safe explicit
/// getter (ADR-0038). `Model` itself has no superclass/`implements`/`with`, so no project-declared
/// subclass could ever type a receiver that would make `doubled`'s own resolved provenance ambiguous —
/// the entire dynamic-dispatch safety argument this milestone relies on (ADR-0038 §2).
class Model {
  final int count;

  Model(this.count);

  int get doubled => count * 2;
}
