sealed class Shape {}

class Circle extends Shape {
  Circle(this.r);
  final double r;
}

class Rect extends Shape {
  Rect(this.w, this.h);
  final double w;
  final double h;
}

class Tri extends Shape {
  Tri(this.b);
  final int b;
}

enum Tone { red, green, blue }

String describe(Shape s) => switch (s) {
      Circle(r: final double r) when r > 10 => 'big circle $r',
      Circle(:final double r) => 'circle $r',
      Rect(w: 1.0, h: 1.0) => 'unit',
      Rect(:final double w, :final double h) => 'rect $w x $h',
      _ => 'other',
    };

String kind(Object? o) => switch (o) {
      null => 'null',
      int n when n < 0 => 'neg $n',
      int n => 'int $n',
      String s => 'str $s',
      bool b => 'bool $b',
      _ => 'obj',
    };

String warmth(Tone t) => switch (t) {
      Tone.red || Tone.green => 'warm',
      Tone.blue => 'cool',
    };

String range(int n) => switch (n) {
      < 0 => 'neg',
      0 => 'zero',
      >= 1 && <= 9 => 'digit',
      _ => 'big',
    };

String stmt(Shape s) {
  switch (s) {
    case Circle(:final double r) when r > 1:
      return 'c>1 $r';
    case Circle():
      return 'c';
    case Rect():
      return 'rect';
    default:
      return 'other';
  }
}

int? maybe(String? s) => switch (s) {
      var t? => t.length,
      _ => null,
    };

String zeros(Object? o) => switch (o) {
      0 => 'zero',
      '' => 'empty',
      _ => 'other',
    };

String flow(Shape s) {
  String out = '';
  switch (s) {
    case Circle():
      out = 'c';
    case Rect():
      out = 'r';
    default:
      out = 'o';
  }
  return out;
}
