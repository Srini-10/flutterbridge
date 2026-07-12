// One string comparator, for everything the generator sorts.
//
// **Never `localeCompare`.** Collation is an ambient property of the host: it depends on the platform's
// ICU data and on `LANG`/`LC_COLLATE`, neither of which is an input to this compiler. Under `tr_TR` the
// dotted and dotless `i` do not sort where an English locale puts them, and under any locale
// `'a'.localeCompare('B')` is negative while code-unit order says positive. A compiler that promises
// byte-identical output on every machine cannot sort by a rule the machine chooses.
//
// UTF-16 code-unit order is the same everywhere, and it is what `Array.prototype.sort` uses by default
// and what §A15's canonical key ordering is defined in terms of.

/** Compares [a] and [b] by UTF-16 code unit — the same order on every machine, in every locale. */
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
