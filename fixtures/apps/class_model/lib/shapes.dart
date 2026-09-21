class Point {
  const Point(this.x, this.y);
  const Point.origin()
      : x = 0,
        y = 0;
  Point.named({required this.x, this.y = 5});
  Point.fromSum(int total)
      : x = total ~/ 2,
        y = total - total ~/ 2;

  final int x;
  final int y;

  int get sum => x + y;
  Point plus(Point other) => Point(x + other.x, y + other.y);
  Point scaled({int by = 2}) => Point(x * by, y * by);
  Point operator +(Point other) => plus(other);
  static Point zero() => const Point(0, 0);
  static int created = 0;

  @override
  String toString() => 'Point($x, $y)';
}

abstract class Shape {
  Shape(this.name);
  final String name;
  double area();
  String describe() => '$name area=${area()}';
}

class Rect extends Shape {
  Rect(this.w, this.h) : super('rect');
  final double w;
  final double h;

  @override
  double area() => w * h;
}

class Square extends Rect {
  Square(double side) : super(side, side);

  @override
  String describe() => 'square ' + super.describe();
}

class Counter {
  Counter(this.start) : value = start;
  final int start;
  int value;
  int tick([int by = 1]) {
    value += by;
    return value;
  }
}

class Tally {
  Tally();
  Tally.startingAt(int start) : hits = start;
  int hits = 3;
  final List<int> log = <int>[1];
  int bump() {
    hits = hits + 1;
    log.add(hits);
    return log.length;
  }
}

class Wrapper {
  Wrapper(this.a, this.b);
  Wrapper.twin(int a) : this(a, a);
  factory Wrapper.of(int a) => Wrapper(a, 0);
  factory Wrapper.sum(int a, int b) {
    return Wrapper(a + b, 0);
  }
  final int a;
  final int b;
  @override
  String toString() => 'W($a,$b)';
}
