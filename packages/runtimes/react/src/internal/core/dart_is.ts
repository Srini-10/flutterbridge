// `x is T` for a class the generator emitted (M12, ADR-0055).
//
// Every emitted class carries `static $isA(type)`, which is true for the class itself and — asked lazily, at call time — for
// its superclass, interfaces and mixins. So a test against a supertype, or an interface a class only `implements`, is answered
// by the class graph the Dart source declared, and two classes that reference each other never see an unevaluated one.

/** Whether `value` is an instance of `type` (a class emitted by the generator), or of a subtype of it. */
export function dartIs(value: unknown, type: unknown): boolean {
  if (value === null || value === undefined || typeof value !== 'object') return false;
  const constructor = (value as { constructor?: { $isA?: (type: unknown) => boolean } }).constructor;
  return typeof constructor?.$isA === 'function' && constructor.$isA(type) === true;
}

/**
 * Runs after a call that may have changed the object a signal holds (`_c.tick()`), and tells the signal — the same announcement a
 * collection helper makes (`notifyMutation`), for a class instance whose mutators are the program's own methods (M12). Returns the
 * call's value.
 */
export function touchAfter<T>(signal: { touch(): void }, value: T): T {
  signal.touch();
  return value;
}
