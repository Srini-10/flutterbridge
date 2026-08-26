/// A plain, project-defined data class — every instance field public, `final`, non-static, non-late,
/// no other constructor, no getter/setter/method beyond the field-formal constructor itself required to
/// prove the bounded subset (ADR-0036 §8/§10 permit an unrelated member; this fixture's own happy path
/// keeps the class minimal on purpose, so the negative controls below carry that coverage instead).
///
/// The constructor's own parameter order (`name`, then `count`) deliberately differs from the field
/// declaration order (`count`, then `name`) — the exact shape ADR-0036 §11/§12 requires a generator to
/// get right: the emitted object literal's property order must follow constructor/argument order, never
/// field-declaration order.
class Model {
  final int count;
  final String name;

  Model(this.name, this.count);
}
