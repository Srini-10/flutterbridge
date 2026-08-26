/// A plain, project-defined data class — two public, immutable (`final`) fields, a field-formal
/// constructor (never itself lowered — the generated interface's own field shape, ADR-0035 §12/§15, is
/// authoritative, independent of the constructor that exists only in source), and no other members.
class Model {
  final int count;
  final String name;

  Model(this.count, this.name);
}
