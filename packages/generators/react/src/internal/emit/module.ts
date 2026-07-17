// The module builder — one emitted file, and the two resolvers every emitter goes through.
//
// ## Why imports and symbols are resolved here and not at the call site
//
// An emitter deep in a UI tree discovers it needs `useSignal` while it is halfway through a JSX attribute. It
// cannot write an import there. So it *declares* the need — `module.use('@bridge/runtime-react', 'useSignal')`
// — and gets back the local name to write. The import block is rendered at the end, from the accumulated set.
//
// That indirection buys the two properties the milestone is judged on:
//
// - **Determinism.** Imports are emitted sorted by specifier, then by imported name — never in discovery
//   order, which depends on the order a tree happened to be walked. Two runs produce the same bytes; a
//   refactor of the walk order produces the same bytes.
// - **Correctness under collision.** Two Flutter classes can both be called `Item`. The symbol resolver
//   renames the second (`Item2`) rather than emitting a file that shadows one with the other. A generator
//   that let them collide would emit code that compiles and references the wrong type.
//
// ## Why not a real AST + printer (ts-morph, babel)
//
// It was considered and refused. A printer is a large dependency in the plugin realm — where ADR-8 lint-bans
// I/O and the whole point is a narrow, auditable surface — and it would make the emitted text a function of
// *its* version, so a dependency bump would rewrite every generated file in the corpus. The output here is
// small, its shape is fixed by the emitters, and formatting is settled by construction rather than by a pass
// over a tree (see `writeTo`).

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';

/** Anything an emitted file needs from another module. */
interface ImportRequest {
  /** The module specifier, e.g. `@bridge/runtime-react`. */
  readonly from: string;
  /** The exported name. */
  readonly name: string;
  /** Whether it is only a type. Type-only imports are grouped into `import type { ... }`. */
  readonly typeOnly: boolean;
}

/** Reserved words and globals a generated identifier must never be. */
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
  'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'as', 'implements', 'interface', 'let', 'package', 'private', 'protected', 'public',
  'static', 'yield', 'await', 'async', 'undefined', 'NaN', 'Infinity', 'globalThis', 'window', 'document',
]);

/**
 * Turns any string into a legal TypeScript identifier.
 *
 * Deterministic and total: the same input always gives the same output, and every input gives *some* output.
 * A Dart name is already close to a JS name, so this is mostly a guard against the cases that are not —
 * a leading digit, a `$`-mangled synthetic name, an empty string.
 *
 * @param raw - the name from the source program.
 * @returns a legal identifier.
 */
export function identifierOf(raw: string): string {
  let cleaned = raw.replace(/[^\p{L}\p{N}_$]/gu, '_');
  if (cleaned === '' || /^\d/.test(cleaned)) cleaned = `_${cleaned}`;
  // A private Dart field is `_favoriteIds`; the underscore carries no meaning in the output and reads as a
  // convention it does not have here. It is kept anyway — renaming it would make the generated symbol stop
  // matching the source the reviewer is diffing against, which is the property ADR-6 protects.
  return RESERVED.has(cleaned) ? `${cleaned}_` : cleaned;
}

/** `favorites_store` / `FavoritesStore` → `favorites-store`, for file names. */
export function fileNameOf(raw: string): string {
  return (
    raw
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'unnamed'
  );
}

/**
 * Accumulates the text of one file, its imports, and its module-scope names.
 *
 * Not a general-purpose printer: it knows how to indent, how to render an import block, and nothing else
 * about TypeScript. Everything structural is the emitters' business.
 */
export class ModuleBuilder {
  /** Where this file goes, relative to the output root. */
  public readonly path: string;

  private readonly lines: string[] = [];
  private readonly imports: ImportRequest[] = [];
  /** Module-scope names already taken, and the node that took each — so a collision can be reported. */
  private readonly declared = new Map<string, string>();
  private indent = 0;
  private banner: string | null = null;

  public constructor(path: string) {
    this.path = path;
  }

  /**
   * Reserves a module-scope name for `owner`, renaming on collision.
   *
   * Two Flutter classes can legitimately share a name across libraries — the analyzer keeps them apart by
   * symbol, the file system cannot. The second one to ask gets `Item2`. Emitting both as `Item` would
   * produce a file that compiles and silently means the wrong thing, which is the failure this exists to
   * prevent.
   *
   * @param preferred - the name to use if it is free.
   * @param owner - the node id claiming it, for the collision report.
   * @returns the name actually reserved.
   */
  public declare(preferred: string, owner: string): string {
    const base = identifierOf(preferred);
    const existing = this.declared.get(base);
    if (existing === undefined) {
      this.declared.set(base, owner);
      return base;
    }
    if (existing === owner) return base;
    for (let suffix = 2; ; suffix++) {
      const candidate = `${base}${suffix}`;
      if (!this.declared.has(candidate)) {
        this.declared.set(candidate, owner);
        return candidate;
      }
    }
  }

  /** Whether `name` is already taken at module scope. */
  public has(name: string): boolean {
    return this.declared.has(name);
  }

  /**
   * Declares a dependency on `name` from `from`, and returns the local name to write.
   *
   * Idempotent: asking twice adds one import.
   *
   * @param from - the module specifier.
   * @param name - the exported name.
   * @param options - `typeOnly` when the name is only used in type position.
   * @returns the local name.
   */
  public use(from: string, name: string, options: { readonly typeOnly?: boolean } = {}): string {
    const typeOnly = options.typeOnly ?? false;
    const existing = this.imports.find((i) => i.from === from && i.name === name);
    if (existing === undefined) {
      this.imports.push({ from, name, typeOnly });
    } else if (existing.typeOnly && !typeOnly) {
      // Asked for as a type first and as a value later: it must be a value import, or the value is not there
      // at runtime. Widening is safe; narrowing never happens.
      this.imports.splice(this.imports.indexOf(existing), 1, { from, name, typeOnly: false });
    }
    return name;
  }

  /** Sets the file's header comment. */
  public setBanner(text: string): void {
    this.banner = text;
  }

  /** Appends a line at the current indentation. An empty string emits a blank line with no trailing spaces. */
  public line(text = ''): void {
    this.lines.push(text === '' ? '' : `${'  '.repeat(this.indent)}${text}`);
  }

  /** Appends several lines. */
  public lineAll(texts: readonly string[]): void {
    for (const text of texts) this.line(text);
  }

  /** Runs `body` one indentation level deeper. */
  public block(body: () => void): void {
    this.indent++;
    try {
      body();
    } finally {
      this.indent--;
    }
  }

  /**
   * Renders the file.
   *
   * Import order is **sorted, not discovery order**: package imports first, then relative ones, each group
   * lexicographic, and names within a statement sorted too. Type-only names fold into the same statement via
   * `import { type X, Y }`.
   *
   * Discovery order would make the bytes depend on how the tree was walked, so every refactor of a walk would
   * rewrite every file. Plain lexicographic order would be equally deterministic and would put `./providers`
   * before `react`, which is not how anything else in this repository is written — and generated code that
   * does not look like hand-written code is generated code nobody reviews (ADR-6).
   *
   * @returns the complete file contents, newline-terminated.
   */
  public toSource(): string {
    const out: string[] = [];
    if (this.banner !== null) out.push(this.banner, '');
    out.push(...renderImports(this.imports));

    out.push(...this.lines);

    // Exactly one trailing newline, and no trailing blank lines. Formatting is settled here, by
    // construction, rather than by running a formatter over the result: a formatter is a second opinion about
    // the bytes, and a second opinion is a second thing that can change them.
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return `${out.join('\n')}\n`;
  }
}

/**
 * Whether a specifier points inside the generated project.
 *
 * `./x` and `@/x` are both local — `@/` is the tsconfig path alias the scaffolder configures, not a scope on
 * npm. Missing that is easy: `@/theme` and `@bridge/runtime-react` both begin with `@`, and sorting them
 * together puts the app's own modules above the packages they depend on.
 */
const isLocal = (specifier: string): boolean => specifier.startsWith('.') || specifier.startsWith('@/');

/**
 * The canonical order for a set of import specifiers.
 *
 * Exported so the scaffolder — whose files are fixed literals rather than emitter output — can be checked
 * against the same rule, and so a test can assert the rule rather than restate it.
 */
export function sortSpecifiers(specifiers: readonly string[]): string[] {
  return [...specifiers].sort((a, b) => {
    if (isLocal(a) !== isLocal(b)) return isLocal(a) ? 1 : -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Renders an import block: package imports, then relative, each sorted, then a blank line. */
function renderImports(imports: readonly ImportRequest[]): string[] {
  if (imports.length === 0) return [];
  const bySpecifier = new Map<string, ImportRequest[]>();
  for (const request of imports) {
    const group = bySpecifier.get(request.from);
    if (group === undefined) bySpecifier.set(request.from, [request]);
    else group.push(request);
  }
  const out: string[] = [];
  for (const specifier of sortSpecifiers([...bySpecifier.keys()])) {
    const group = [...(bySpecifier.get(specifier) ?? [])].sort((a, b) => (a.name < b.name ? -1 : 1));
    const names = group.map((i) => (i.typeOnly ? `type ${i.name}` : i.name));
    out.push(`import { ${names.join(', ')} } from '${specifier}';`);
  }
  out.push('');
  return out;
}

/** The symbol-collision code, re-exported so emitters do not import the codes module for one constant. */
export const SYMBOL_COLLISION = GeneratorDiagnosticCode.SymbolCollision;
