/// A cross-file class whose own static method shares a NAME with `Model.compute` (model.dart) — proves
/// static-member target resolution is owner-qualified (by the resolved `Element`'s own `enclosingElement`
/// identity), never by bare method-name text (ADR-0045 §5).
class OtherModel {
  static int compute(int x) => x * 5;
}
