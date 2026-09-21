class _Absent {
  const _Absent();
}

const Object _absent = _Absent();

T _identity<T>(T value) => value;

mixin _$Dto {
  String get name;
  int get age;

  $DtoCopyWith<Dto> get copyWith => _$DtoCopyWithImpl<Dto>(this as Dto, _identity);

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType &&
            other is Dto &&
            (identical(other.name, name) || other.name == name) &&
            (identical(other.age, age) || other.age == age));
  }

  @override
  int get hashCode => Object.hash(runtimeType, name, age);

  @override
  String toString() {
    return 'Dto(name: $name, age: $age)';
  }
}

abstract mixin class $DtoCopyWith<$Res> {
  factory $DtoCopyWith(Dto value, $Res Function(Dto) then) = _$DtoCopyWithImpl;
  $Res call({String name, int age});
}

class _$DtoCopyWithImpl<$Res> implements $DtoCopyWith<$Res> {
  _$DtoCopyWithImpl(this._self, this._then);

  final Dto _self;
  final $Res Function(Dto) _then;

  @override
  $Res call({Object? name = _absent, Object? age = _absent}) {
    return _then(
      Dto(
        name: _absent == name ? _self.name : name as String,
        age: _absent == age ? _self.age : age as int,
      ),
    );
  }
}

abstract class Dto with _$Dto {
  const factory Dto({required String name, required int age}) = _Dto;
}

class _Dto implements Dto {
  const _Dto({required this.name, required this.age});

  @override
  final String name;
  @override
  final int age;

  @override
  $DtoCopyWith<Dto> get copyWith => _$DtoCopyWithImpl<Dto>(this, _identity);

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other.runtimeType == runtimeType && other is _Dto && (identical(other.name, name) || other.name == name) && (identical(other.age, age) || other.age == age));
  }

  @override
  int get hashCode => Object.hash(runtimeType, name, age);

  @override
  String toString() {
    return 'Dto(name: $name, age: $age)';
  }
}

sealed class Load {
  const Load();
}

class Idle extends Load {
  const Idle();
}

class Loading extends Load {
  const Loading(this.pct);
  final int pct;
}

class Done extends Load {
  const Done(this.value);
  final Dto value;
}
