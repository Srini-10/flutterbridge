class AppError implements Exception {
  AppError(this.code);
  final int code;

  @override
  String toString() => 'AppError($code)';
}

void raise(int mode) {
  switch (mode) {
    case 0:
      throw FormatException('bad');
    case 1:
      throw StateError('state');
    case 2:
      throw AppError(7);
    case 3:
      throw 'plain';
    case 4:
      throw ArgumentError('arg');
    case 5:
      throw Exception('ex');
    case 6:
      throw UnsupportedError('nope');
    default:
      return;
  }
}

String classify(int mode) {
  try {
    raise(mode);
    return 'none';
  } on FormatException catch (e) {
    return 'format ${e.message}';
  } on StateError catch (e) {
    return 'state ${e.message}';
  } on AppError catch (e) {
    return 'app ${e.code}';
  } on Exception catch (e) {
    return 'exception $e';
  } on Error catch (e) {
    return 'error $e';
  } catch (e) {
    return 'other $e';
  }
}

String unmatched(int mode) {
  try {
    try {
      raise(mode);
      return 'fine';
    } on FormatException catch (e) {
      return 'inner ${e.message}';
    }
  } catch (e) {
    return 'outer $e';
  }
}

String withFinally(int mode) {
  final List<String> log = <String>[];
  try {
    try {
      raise(mode);
      log.add('ok');
    } finally {
      log.add('finally');
    }
  } catch (e) {
    log.add('caught $e');
  }
  return log.join(',');
}

/// A failed `as` throws a Dart `TypeError`, which is an `Error`, not an `Exception`.
String castKind(Object? v) {
  try {
    return 'int ${v as int}';
  } on Exception catch (e) {
    return 'exception $e';
  } on Error catch (e) {
    return 'error';
  }
}
