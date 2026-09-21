// `DateTime`, `Timer` and `DeepCollectionEquality` — M12.
//
// `DartDateTime` keeps Dart's member names (`year`, `add`, `difference`, `isBefore`, `toIso8601String` …), so generated code calls them as written.
// A `DateTime` is a millisecond instant, local or UTC; Dart's microsecond part is not kept (JavaScript has none).

import { DartFormatException } from './dart_exceptions.js';
import { Duration } from '../widgets/animation.js';
import { dartHashAll } from './dart_core.js';

const pad = (n: number, width = 2): string => String(Math.abs(n)).padStart(width, '0');

/** Dart's `DateTime`: an instant, local or UTC. */
export class DartDateTime {
  private readonly date: Date;

  constructor(readonly millisecondsSinceEpoch: number, readonly isUtc: boolean = false) {
    this.date = new Date(millisecondsSinceEpoch);
  }

  /** `DateTime(year, month = 1, day = 1, hour = 0, minute = 0, second = 0, millisecond = 0)` (local). */
  static local(year: number, month = 1, day = 1, hour = 0, minute = 0, second = 0, millisecond = 0): DartDateTime {
    const d = new Date(2000, 0, 1);
    d.setFullYear(year, month - 1, day);
    d.setHours(hour, minute, second, millisecond);
    return new DartDateTime(d.getTime(), false);
  }

  /** `DateTime.utc(...)`. */
  static utc(year: number, month = 1, day = 1, hour = 0, minute = 0, second = 0, millisecond = 0): DartDateTime {
    const d = new Date(Date.UTC(2000, 0, 1));
    d.setUTCFullYear(year, month - 1, day);
    d.setUTCHours(hour, minute, second, millisecond);
    return new DartDateTime(d.getTime(), true);
  }

  /** `DateTime.now()`. */
  static now(): DartDateTime {
    return new DartDateTime(Date.now(), false);
  }

  /** `DateTime.fromMillisecondsSinceEpoch(ms, isUtc: …)`. */
  static fromMillisecondsSinceEpoch(ms: number, isUtc = false): DartDateTime {
    return new DartDateTime(ms, isUtc);
  }

  /** `DateTime.parse(text)`; `DateTime.tryParse` is the same returning null. */
  static parse(text: string): DartDateTime {
    const m = /^([+-]?\d{4,6})-?(\d\d)-?(\d\d)(?:[ T](\d\d)(?::?(\d\d)(?::?(\d\d)(?:[.,](\d+))?)?)?)?\s*(Z|[+-]\d\d(?::?\d\d)?)?$/i.exec(text.trim());
    if (m === null) throw new DartFormatException('Invalid date format', text);
    const [, y, mo, d, h, mi, s, frac, zone] = m;
    const ms = frac === undefined ? 0 : Math.round(Number(`0.${frac}`) * 1000);
    const parts = [Number(y), Number(mo), Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0), ms] as const;
    if (zone === undefined) return DartDateTime.local(...parts);
    const utc = DartDateTime.utc(...parts);
    if (zone.toUpperCase() === 'Z') return utc;
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0)) * 60_000;
    return new DartDateTime(utc.millisecondsSinceEpoch - offset, true);
  }

  static tryParse(text: string): DartDateTime | null {
    try {
      return DartDateTime.parse(text);
    } catch {
      return null;
    }
  }

  get year(): number { return this.isUtc ? this.date.getUTCFullYear() : this.date.getFullYear(); }
  get month(): number { return (this.isUtc ? this.date.getUTCMonth() : this.date.getMonth()) + 1; }
  get day(): number { return this.isUtc ? this.date.getUTCDate() : this.date.getDate(); }
  get hour(): number { return this.isUtc ? this.date.getUTCHours() : this.date.getHours(); }
  get minute(): number { return this.isUtc ? this.date.getUTCMinutes() : this.date.getMinutes(); }
  get second(): number { return this.isUtc ? this.date.getUTCSeconds() : this.date.getSeconds(); }
  get millisecond(): number { return this.isUtc ? this.date.getUTCMilliseconds() : this.date.getMilliseconds(); }
  /** Monday is 1 and Sunday is 7. */
  get weekday(): number {
    const day = this.isUtc ? this.date.getUTCDay() : this.date.getDay();
    return day === 0 ? 7 : day;
  }

  add(duration: { readonly inMilliseconds: number }): DartDateTime {
    return new DartDateTime(this.millisecondsSinceEpoch + duration.inMilliseconds, this.isUtc);
  }

  subtract(duration: { readonly inMilliseconds: number }): DartDateTime {
    return new DartDateTime(this.millisecondsSinceEpoch - duration.inMilliseconds, this.isUtc);
  }

  difference(other: DartDateTime): Duration {
    return new Duration({ milliseconds: this.millisecondsSinceEpoch - other.millisecondsSinceEpoch });
  }

  isBefore(other: DartDateTime): boolean { return this.millisecondsSinceEpoch < other.millisecondsSinceEpoch; }
  isAfter(other: DartDateTime): boolean { return this.millisecondsSinceEpoch > other.millisecondsSinceEpoch; }
  isAtSameMomentAs(other: DartDateTime): boolean { return this.millisecondsSinceEpoch === other.millisecondsSinceEpoch; }
  compareTo(other: DartDateTime): number { return Math.sign(this.millisecondsSinceEpoch - other.millisecondsSinceEpoch); }
  toUtc(): DartDateTime { return this.isUtc ? this : new DartDateTime(this.millisecondsSinceEpoch, true); }
  toLocal(): DartDateTime { return this.isUtc ? new DartDateTime(this.millisecondsSinceEpoch, false) : this; }
  get hashCode(): number { return this.millisecondsSinceEpoch | 0; }
  /** `a == b`: the same instant. */
  $eq(other: unknown): boolean { return other instanceof DartDateTime && this.isAtSameMomentAs(other) && this.isUtc === other.isUtc; }

  private text(separator: string): string {
    const year = this.year;
    const y = year >= 0 && year <= 9999 ? pad(year, 4) : `${year < 0 ? '-' : '+'}${pad(year, 6)}`;
    const ms = this.millisecond;
    return `${y}-${pad(this.month)}-${pad(this.day)}${separator}${pad(this.hour)}:${pad(this.minute)}:${pad(this.second)}.${pad(ms, 3)}${this.isUtc ? 'Z' : ''}`;
  }

  toIso8601String(): string { return this.text('T'); }
  toString(): string { return this.text(' '); }
}

/** `Timer` / `Timer.periodic` (`dart:async`). */
export class DartTimer {
  private handle: ReturnType<typeof setTimeout> | undefined;
  private active = true;
  private ticks = 0;

  private constructor() {}

  /** `Timer(duration, callback)`. */
  static once(duration: { readonly inMilliseconds: number }, callback: () => void): DartTimer {
    const timer = new DartTimer();
    timer.handle = setTimeout(() => {
      timer.active = false;
      timer.ticks = 1;
      callback();
    }, duration.inMilliseconds);
    return timer;
  }

  /** `Timer.periodic(duration, callback)`. */
  static periodic(duration: { readonly inMilliseconds: number }, callback: (timer: DartTimer) => void): DartTimer {
    const timer = new DartTimer();
    timer.handle = setInterval(() => {
      timer.ticks++;
      callback(timer);
    }, duration.inMilliseconds);
    return timer;
  }

  cancel(): void {
    if (this.handle !== undefined) {
      clearTimeout(this.handle);
      clearInterval(this.handle);
    }
    this.active = false;
  }

  get isActive(): boolean { return this.active; }
  get tick(): number { return this.ticks; }
}

const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b) ? false : a === b;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((x) => b.has(x));
  if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && equal(v, b.get(k)));
  const eq = (a as { $eq?: (other: unknown) => boolean }).$eq;
  return typeof eq === 'function' ? eq.call(a, b) : false;
};

/** `package:collection`'s `DeepCollectionEquality`: `==` that looks inside lists, sets and maps. */
export class DartDeepCollectionEquality {
  equals(a: unknown, b: unknown): boolean { return equal(a, b); }
  hash(value: unknown): number {
    if (Array.isArray(value)) return dartHashAll(value.map((v) => this.hash(v)));
    if (value instanceof Set) return [...value].reduce<number>((h, v) => (h + this.hash(v)) | 0, 0);
    if (value instanceof Map) return [...value].reduce<number>((h, [k, v]) => (h + (this.hash(k) ^ this.hash(v))) | 0, 0);
    return dartHashAll([value]);
  }
}
