/// A cross-file class (M11-B §R3/R4/R7 composition) whose own `count` field an awaited, `Future`-returning
/// method may return (M10-D return-value chaining, composed with `async`/`await` for the first time).
class OtherModel {
  final int count;
  OtherModel(this.count);
}
