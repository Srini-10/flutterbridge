/// A SEPARATE Dart file (M10-F) — proving safe-navigation on a nullable, cross-file-typed component
/// parameter carries its real emitted type and composes correctly, exactly as a same-file nullable
/// receiver does (ADR-0044).
class OtherModel {
  final int value;

  OtherModel(this.value);

  int get doubled => value * 2;
}
