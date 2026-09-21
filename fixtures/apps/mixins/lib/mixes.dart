mixin Greeter {
  String name = 'anon';
  String greet() => 'hi $name';
  int get shout => name.length;
  String title();
}

mixin Counted {
  int count = 0;
  void bump() {
    count++;
  }

  String greet() => 'counted $count';
}

class Person with Greeter, Counted {
  Person(String n) {
    name = n;
  }

  @override
  String title() => 'Dr $name';
}

class Base {
  String say() => 'base';
  String who() => 'base';
}

mixin Louder on Base {
  @override
  String say() => '${super.say()}!';
}

class Talker extends Base with Louder {
  @override
  String who() => 'talker';
}

abstract mixin class Flag {
  bool on = false;
  void flip() {
    on = !on;
  }
}

class Switch1 with Flag {}

class Named {
  String title() => 'named';
}

/// The mixin's abstract `title()` is satisfied by the superclass; it must not replace it.
class Guest extends Named with Greeter {}

/// A class declares the field a mixin also declares: the class's own wins.
class Preset with Counted {
  @override
  int count = 7;
}

String describe(Object o) => o is Greeter ? 'greeter' : (o is Flag ? 'flag' : 'other');
