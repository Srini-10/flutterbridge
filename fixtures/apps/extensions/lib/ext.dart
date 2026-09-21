extension StringX on String {
  String get shout => '${toUpperCase()}!';
  int count(String c) => split(c).length - 1;
  String pad({int width = 5, String fill = '.'}) => padRight(width, fill);
}

extension ListX<T> on List<T> {
  T? get second => length > 1 ? this[1] : null;
  List<T> rotated() => <T>[...skip(1), first];
}

extension on int {
  int get doubled => this * 2;
  bool get isBig => this > 10;
}

extension NullX on String? {
  String orDash() => this ?? '-';
}

class Box {
  Box(this.n);
  int n;
}

extension BoxX on Box {
  int get plus1 => n + 1;
  set plus1(int v) => n = v - 1;
  Box bump() {
    n++;
    return this;
  }

  String describe() => 'box $plus1 ${bump().plus1}';
}

String use() {
  final Box b = Box(3);
  b.plus1 = 10;
  final String d = b.describe();
  return '${'abc'.shout} ${'banana'.count('a')} ${'x'.pad(width: 3)} ${'y'.pad()} ${<int>[1, 2, 3].second} ${<int>[].second} ${<int>[1, 2, 3].rotated().join(',')} ${4.doubled} ${12.isBig} ${4.isBig} ${(null as String?).orDash()} ${'q'.orDash()} ${b.n} $d';
}
