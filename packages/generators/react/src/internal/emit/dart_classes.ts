// General Dart classes → TypeScript classes (M12, ADR-0055).
//
// A project class that is not a plain record (`constructibleConstructors`, ADR-0036/0037) is *general*: the analyzer carries its
// constructors, type parameters, interfaces and mixins on the `ClassDecl` (`library` marks it), and this file turns it into a
// real TypeScript class. Until M12 a class could only be a type-only interface plus helper functions, with construction refused
// — which is why every Riverpod state class, DTO and model of a real application was `BRG3002`/`BRG3013`.
//
// ## The shape
//
// Every Dart constructor becomes TWO members, because Dart's constructor semantics (initializers run before the superclass
// constructor; named, redirecting and factory constructors; `super.named(...)`) do not fit JavaScript's single `constructor`:
//
//     static $new(x, y)      { const $self = new Point(); $self.$init(x, y); return $self; }     // Point(x, y)
//     $init(x, y)            { this.$fields(); this.x = x; this.y = y; }                         // its body
//     static $origin() ...   $init_origin() ...                                                    // Point.origin()
//
// so a subclass's `$init` calls `super.$init_named(...)` exactly where Dart says, and `this(...)` redirection is a call to a
// sibling `$init`. A factory constructor is a static method only. Declaration initializers (`int y = 5;`) run first, in
// `$fields()`.
//
// ## The calling convention
//
// A TypeScript function has no named arguments, so every callable a class declares takes its parameters **positionally, in
// declaration order — positional ones, then named ones — and every call site passes all of them**, `undefined` for an omitted one.
// The callee declares each optional parameter with its Dart default (`by: number = 2`), which JavaScript applies exactly when the
// argument is `undefined`; an explicit `null` is not `undefined`, so `f(by: null)` overrides the default as it does in Dart. A
// call site's argument order is decided from the *callee's signature* (`callArguments`), never guessed from the names.
//
// ## Operators and `is`
//
// `operator +` is `$add`, `==` is `$eq` (`OPERATOR_NAMES`); a binary expression whose left operand is a general class with that
// operator calls it. `x is T` is `dartIs(x, T)`: each class carries `static $isA(type)`, which walks its superclass, interfaces
// and mixins lazily — at call time, so two classes that reference each other never see an unevaluated class at module load.

import type { NodeId } from '@bridge/uir';

type Node = Record<string, unknown>;

const kindOf = (node: Node): string => (typeof node['kind'] === 'string' ? node['kind'] : '<unknown>');
const asArray = (value: unknown): Node[] => (Array.isArray(value) ? (value as Node[]) : []);

/** Dart operator → the TypeScript method name a general class declares for it. */
export const OPERATOR_NAMES: Readonly<Record<string, string>> = {
  '==': '$eq',
  '+': '$add',
  '-': '$sub',
  '*': '$mul',
  '/': '$div',
  '~/': '$tdiv',
  '%': '$mod',
  '<': '$lt',
  '>': '$gt',
  '<=': '$le',
  '>=': '$ge',
  '[]': '$get',
  '[]=': '$set',
  '&': '$and',
  '|': '$or',
  '^': '$xor',
  '<<': '$shl',
  '>>': '$shr',
  '~': '$not',
  'unary-': '$neg',
};

/** Every general class in the program, by id: a `ClassDecl` the analyzer marked with its `library` (M12). */
export function generalClassesOf(nodes: readonly unknown[]): Map<NodeId, Node> {
  const general = new Map<NodeId, Node>();
  for (const node of nodes as Node[]) {
    if ((kindOf(node) === 'logic.ClassDecl' || kindOf(node) === 'logic.EnumDecl') && typeof node['library'] === 'string' && typeof node['id'] === 'string') {
      general.set(node['id'] as NodeId, node);
    }
  }
  return general;
}

/** The `TypeRef.target` of a type, if it names a class. */
export const targetOfType = (type: unknown): NodeId | undefined =>
  type !== null && typeof type === 'object' && typeof (type as Node)['target'] === 'string'
    ? ((type as Node)['target'] as NodeId)
    : undefined;

/** A class, then its superclasses, as far as they are general classes. */
export function classChain(id: NodeId, general: ReadonlyMap<NodeId, Node>): Node[] {
  const chain: Node[] = [];
  const seen = new Set<NodeId>();
  let current: NodeId | undefined = id;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const decl = general.get(current);
    if (decl === undefined) break;
    chain.push(decl);
    current = targetOfType(decl['superclass']);
  }
  return chain;
}

/** A method, getter or setter named `name` in the class or a superclass; the nearest wins, as in Dart. */
export function findMember(
  id: NodeId,
  name: string,
  general: ReadonlyMap<NodeId, Node>,
): { readonly owner: Node; readonly member: Node } | undefined {
  for (const decl of classChain(id, general)) {
    for (const member of asArray(decl['methods'])) {
      if (member['name'] === name && member['isStatic'] !== true) return { owner: decl, member };
    }
  }
  return undefined;
}

/** A field named `name` in the class or a superclass. */
export function findField(id: NodeId, name: string, general: ReadonlyMap<NodeId, Node>): Node | undefined {
  for (const decl of classChain(id, general)) {
    for (const field of asArray(decl['fields'])) if (field['name'] === name) return field;
  }
  return undefined;
}

/** The constructor of `decl` called `name` (`undefined` for the unnamed one). */
export function constructorOf(decl: Node, name: string | undefined): Node | undefined {
  const constructors = asArray(decl['constructors']);
  const found = constructors.find((c) => (c['name'] as string | undefined) === name);
  if (found !== undefined) return found;
  // A class with no explicit constructor has the implicit default one.
  return name === undefined && constructors.length === 0 ? { params: [] } : undefined;
}

/**
 * The argument texts for a call to a callable with `params`, in the callee's order, `undefined` for an omitted parameter and
 * trailing omissions dropped (the callee's defaults apply).
 *
 * @param positional - the positional arguments, already emitted.
 * @param named - the named arguments by name, already emitted.
 * @returns the texts, or `{ unknown: name }` for a named argument the callee has no parameter for.
 */
export function callArguments(
  params: readonly Node[],
  positional: readonly string[],
  named: Readonly<Record<string, string>>,
): string[] | { readonly unknown: string } {
  const remaining = new Set(Object.keys(named));
  const out: string[] = [];
  let index = 0;
  for (const param of params) {
    const name = String(param['name'] ?? '');
    if (param['named'] === true) {
      if (name in named) {
        out.push(named[name] as string);
        remaining.delete(name);
      } else {
        out.push('undefined');
      }
    } else {
      out.push(index < positional.length ? (positional[index] as string) : 'undefined');
      index++;
    }
  }
  for (const name of remaining) return { unknown: name };
  while (out.length > 0 && out[out.length - 1] === 'undefined') out.pop();
  return out;
}

/** The suffix a constructor's members carry: `` for the unnamed one, `_name` for a named one. */
export const ctorSuffix = (name: string | undefined): string => (name === undefined || name === '' ? '' : `_${name}`);

/** The instance initializer of a class's constructor. Unique per class: a subclass's `$init` has other parameters than its superclass's, and TypeScript rejects an override with incompatible ones. */
export const initName = (className: string, name: string | undefined): string => `$init_${className}${ctorSuffix(name)}`;

/** The static factory a `logic.New` of this constructor calls: `$new`, `$origin`, … */
export const ctorFactoryName = (name: string | undefined, className: string): string =>
  `${name === undefined || name === '' ? '$new' : `$${name}`}$${className}`;

/** What emitting one class needs from the generator, passed in so this file imports none of it. */
export interface ClassEmitContext {
  readonly general: ReadonlyMap<NodeId, Node>;
  /** The TypeScript type text of a `TypeRef`. */
  readonly typeText: (type: Node | undefined) => string;
  /** The name a general class is declared under (and, if it lives in another module, imports as). */
  readonly nameOf: (id: NodeId) => string | undefined;
  /** Emits an expression in the scope of a parameter list (the constructor's or method's own). */
  readonly expr: (node: Node, params: readonly Node[]) => string;
  /** Emits a statement list in the scope of a parameter list. */
  readonly body: (statements: readonly Node[], params: readonly Node[]) => string[];
  readonly identifier: (raw: string) => string;
  readonly report: (message: string, nodeId?: string) => void;
}

const indent = (lines: readonly string[]): string[] => lines.map((line) => (line === '' ? '' : `  ${line}`));

/** `x: number = 2` — every optional parameter carries its Dart default, so an omitted (`undefined`) argument gets it. */
function paramList(params: readonly Node[], ctx: ClassEmitContext): string {
  return params
    .map((param) => {
      const name = ctx.identifier(String(param['name'] ?? '_'));
      const type = ctx.typeText(param['type'] as Node | undefined);
      const required = param['required'] === true || (param['named'] !== true && param['defaultValue'] === undefined && param['optionalPositional'] !== true);
      if (param['defaultValue'] !== undefined) return `${name}: ${type} = ${ctx.expr(param['defaultValue'] as Node, params)}`;
      if (required) return `${name}: ${type}`;
      // Optional with no default: Dart's absent value is `null`.
      return `${name}: ${type} = null as ${type}`;
    })
    .join(', ');
}

const argList = (names: readonly string[]): string => names.join(', ');

/** The names of a parameter list, in order — what a delegating call passes on. */
const paramNames = (params: readonly Node[], ctx: ClassEmitContext): string[] => params.map((p) => ctx.identifier(String(p['name'] ?? '_')));

/**
 * The source of one general class.
 *
 * @returns the lines, or `undefined` after reporting why the class has no lowering.
 */
export function emitClassSource(decl: Node, className: string, ctx: ClassEmitContext): string[] | undefined {
  if (kindOf(decl) === 'logic.EnumDecl') return emitEnumSource(decl, className, ctx);
  const id = decl['id'] as NodeId;
  const superId = targetOfType(decl['superclass']);
  const superDecl = superId === undefined ? undefined : ctx.general.get(superId);
  if (decl['superclass'] !== undefined && superDecl === undefined) {
    ctx.report(
      `\`${className}\` extends a class this generator does not emit (${String((decl['superclass'] as Node)['name'])}): a project class ` +
        'may extend another project class, but not a framework or package class.',
      id,
    );
    return undefined;
  }
  if (asArray(decl['mixins']).length > 0) {
    ctx.report(`\`${className}\` applies a mixin (\`with\`), which the class model does not yet lower (ADR-0055).`, id);
    return undefined;
  }

  const typeParams = Array.isArray(decl['typeParameters']) ? (decl['typeParameters'] as string[]) : [];
  const generics = typeParams.length === 0 ? '' : `<${typeParams.join(', ')}>`;
  const superName = superId === undefined ? undefined : ctx.nameOf(superId);
  const superText = decl['superclass'] === undefined ? '' : ` extends ${superName ?? 'unknown'}${superTypeArguments(decl['superclass'] as Node, ctx)}`;
  const isAbstract = decl['isAbstract'] === true;
  const lines: string[] = [];

  // ── fields ─────────────────────────────────────────────────────────────────────────────────────
  const fields = asArray(decl['fields']).filter((f) => f['isStatic'] !== true);
  for (const field of fields) {
    lines.push(`${ctx.identifier(String(field['name']))}!: ${ctx.typeText(field['type'] as Node | undefined)};`);
  }

  // ── type identity: `x is Foo` ──────────────────────────────────────────────────────────────────
  const supers = [superId, ...asArray(decl['interfaces']).map((t) => targetOfType(t))].filter((t): t is NodeId => t !== undefined);
  const checks = [`type === ${className}`, ...supers.map((t) => `${ctx.nameOf(t) ?? 'undefined'}.$isA(type)`)];
  lines.push(`static $isA(type: unknown): boolean {`, `  return ${checks.join(' || ')};`, `}`);

  // ── declaration initializers ───────────────────────────────────────────────────────────────────
  const initialized = fields.filter((f) => f['initializer'] !== undefined);
  lines.push(`$fields_${className}(): void {`);
  for (const field of initialized) {
    lines.push(`  this.${ctx.identifier(String(field['name']))} = ${ctx.expr(field['initializer'] as Node, [])};`);
  }
  lines.push('}');

  // ── constructors ───────────────────────────────────────────────────────────────────────────────
  const declared = asArray(decl['constructors']);
  const constructors = declared.length > 0 ? declared : [{ params: [] } as Node];
  for (const ctor of constructors) {
    const name = ctor['name'] as string | undefined;
    const params = asArray(ctor['params']);
    const plist = paramList(params, ctx);
    const passing = argList(paramNames(params, ctx));

    if (ctor['isFactory'] === true) {
      const redirect = ctor['redirectedFactory'] as Node | undefined;
      const body: string[] = [];
      if (redirect !== undefined) {
        const targetId = targetOfType(redirect['type']);
        const targetDecl = targetId === undefined ? undefined : ctx.general.get(targetId);
        const targetCtor = targetDecl === undefined ? undefined : constructorOf(targetDecl, redirect['constructorName'] as string | undefined);
        if (targetDecl === undefined || targetCtor === undefined || targetId === undefined) {
          ctx.report(`the redirecting factory \`${className}${name === undefined ? '' : `.${name}`}\` targets a constructor this generator cannot resolve.`, id);
          return undefined;
        }
        const positional = params.filter((p) => p['named'] !== true).map((p) => ctx.identifier(String(p['name'])));
        const named = Object.fromEntries(params.filter((p) => p['named'] === true).map((p) => [String(p['name']), ctx.identifier(String(p['name']))]));
        const forwarded = callArguments(asArray(targetCtor['params']), positional, named);
        if (!Array.isArray(forwarded)) {
          ctx.report(`the redirecting factory \`${className}\` passes \`${forwarded.unknown}\`, which its target constructor does not take.`, id);
          return undefined;
        }
        body.push(`return ${ctx.nameOf(targetId) ?? 'undefined'}.${ctorFactoryName(redirect['constructorName'] as string | undefined, String((targetDecl as Node)['name']))}(${forwarded.join(', ')});`);
      } else {
        body.push(...ctx.body(asArray(ctor['body']), params));
      }
      lines.push(`static ${ctorFactoryName(name, className)}${generics}(${plist}): ${className}${generics} {`, ...indent(body), '}');
      continue;
    }

    // A generative constructor: the initialising half…
    const init: string[] = [];
    const redirectsTo = ctor['redirectsTo'] as Node | undefined;
    if (redirectsTo !== undefined) {
      const sibling = constructorOf(decl, redirectsTo['constructorName'] as string | undefined);
      if (sibling === undefined) {
        ctx.report(`\`${className}\` redirects to a constructor it does not declare.`, id);
        return undefined;
      }
      const passed = callArguments(
        asArray(sibling['params']),
        asArray(redirectsTo['args']).map((a) => ctx.expr(a, params)),
        Object.fromEntries(Object.entries((redirectsTo['namedArgs'] ?? {}) as Record<string, Node>).map(([k, v]) => [k, ctx.expr(v, params)])),
      );
      if (!Array.isArray(passed)) {
        ctx.report(`\`${className}\` redirects with \`${passed.unknown}\`, which the target constructor does not take.`, id);
        return undefined;
      }
      init.push(`this.${initName(className, redirectsTo['constructorName'] as string | undefined)}(${passed.join(', ')});`);
    } else {
      init.push(`this.$fields_${className}();`);
      for (const param of params) {
        if (typeof param['initializesField'] === 'string') {
          const field = ctx.identifier(param['initializesField']);
          init.push(`this.${field} = ${ctx.identifier(String(param['name']))};`);
        }
      }
      for (const entry of asArray(ctor['initializers'])) {
        init.push(`this.${ctx.identifier(String(entry['field']))} = ${ctx.expr(entry['value'] as Node, params)};`);
      }
      if (superDecl !== undefined && superId !== undefined) {
        const call = ctor['superCall'] as Node | undefined;
        const superName2 = call?.['constructorName'] as string | undefined;
        const superCtor = constructorOf(superDecl, superName2);
        if (superCtor === undefined) {
          ctx.report(`\`${className}\` calls a superclass constructor \`${superName2 ?? ''}\` that \`${String(superDecl['name'])}\` does not declare.`, id);
          return undefined;
        }
        // Explicit arguments, then any `super.x` parameters forwarded by name.
        const positional = asArray(call?.['args']).map((a) => ctx.expr(a, params));
        const named: Record<string, string> = Object.fromEntries(
          Object.entries((call?.['namedArgs'] ?? {}) as Record<string, Node>).map(([k, v]) => [k, ctx.expr(v, params)]),
        );
        for (const param of params) {
          if (param['isSuper'] !== true) continue;
          const text = ctx.identifier(String(param['name']));
          if (param['named'] === true) named[String(param['name'])] = text;
          else positional.push(text);
        }
        const passed = callArguments(asArray(superCtor['params']), positional, named);
        if (!Array.isArray(passed)) {
          ctx.report(`\`${className}\` passes \`${passed.unknown}\` to its superclass constructor, which does not take it.`, id);
          return undefined;
        }
        init.push(`super.${initName(String(superDecl['name']), superName2)}(${passed.join(', ')});`);
      }
    }
    init.push(...ctx.body(asArray(ctor['body']), params));

    lines.push(`${initName(className, name)}(${plist}): void {`, ...indent(init), '}');
    if (!isAbstract) {
      lines.push(
        `static ${ctorFactoryName(name, className)}${generics}(${plist}): ${className}${generics} {`,
        `  const $self = new ${className}${generics}();`,
        `  $self.${initName(className, name)}(${passing});`,
        '  return $self;',
        '}',
      );
    }
  }

  // ── members ────────────────────────────────────────────────────────────────────────────────────
  for (const method of asArray(decl['methods'])) {
    const raw = String(method['name']);
    const params = asArray(method['params']);
    const isStatic = method['isStatic'] === true;
    const returnType = ctx.typeText(method['returnType'] as Node | undefined);
    const isAsync = method['isAsync'] === true;
    const returns = isAsync ? `Promise<${returnType}>` : returnType;
    const staticPrefix = isStatic ? 'static ' : '';
    const abstractBody = method['isAbstract'] === true;
    const bodyLines = abstractBody ? [`throw new Error('${raw} is abstract');`] : ctx.body(asArray(method['body']), params);

    if (method['isOperator'] === true) {
      const mapped = OPERATOR_NAMES[raw === '-' && params.length === 0 ? 'unary-' : raw];
      if (mapped === undefined) {
        ctx.report(`the operator \`${raw}\` of \`${className}\` has no lowering (ADR-0055).`, String(method['id']));
        return undefined;
      }
      lines.push(`${mapped}(${paramList(params, ctx)}): ${returns} {`, ...indent(bodyLines), '}');
    } else if (method['isGetter'] === true) {
      lines.push(`get ${ctx.identifier(raw)}(): ${returns} {`, ...indent(bodyLines), '}');
    } else if (method['isSetter'] === true) {
      lines.push(`set ${ctx.identifier(raw)}(${paramList(params, ctx)}) {`, ...indent(bodyLines), '}');
    } else {
      lines.push(`${staticPrefix}${isAsync ? 'async ' : ''}${ctx.identifier(raw)}${methodGenerics(method)}(${paramList(params, ctx)}): ${returns} {`, ...indent(bodyLines), '}');
    }
  }

  return [
    `export ${isAbstract ? 'abstract ' : ''}class ${className}${generics}${superText} {`,
    ...indent(lines),
    '}',
  ];
}

function methodGenerics(_method: Node): string {
  return '';
}

function superTypeArguments(_superclass: Node, _ctx: ClassEmitContext): string {
  return '';
}

/** Constant names a class cannot carry as static members. */
const RESERVED_STATICS: ReadonlySet<string> = new Set(['name', 'length', 'prototype', 'values', 'caller', 'arguments']);

/**
 * An *enhanced* enum (fields, methods, constants with arguments) as a class with one static instance per constant (ADR-0056). A
 * plain enum stays its value names. Identity is the instance, so `==`, `switch` and map keys work as they do in Dart, and
 * `toString()` is `Name.constant`.
 */
function emitEnumSource(decl: Node, className: string, ctx: ClassEmitContext): string[] | undefined {
  const id = decl['id'] as NodeId;
  const values = (Array.isArray(decl['values']) ? decl['values'] : []) as string[];
  const clash = values.find((v) => RESERVED_STATICS.has(v));
  if (clash !== undefined) {
    ctx.report(`the constant \`${className}.${clash}\` cannot be a static member of the emitted class (\`${clash}\` is reserved on every class).`, id);
    return undefined;
  }
  const lines: string[] = ['name!: string;', 'index!: number;'];
  for (const field of asArray(decl['fields'])) {
    lines.push(`${ctx.identifier(String(field['name']))}!: ${ctx.typeText(field['type'] as Node | undefined)};`);
  }
  lines.push(`static $isA(type: unknown): boolean {`, `  return type === ${className};`, `}`);

  const declared = asArray(decl['constructors']);
  const constructors = declared.length > 0 ? declared : [{ params: [] } as Node];
  for (const ctor of constructors) {
    const params = asArray(ctor['params']);
    const init: string[] = [];
    for (const param of params) {
      if (typeof param['initializesField'] === 'string') {
        init.push(`this.${ctx.identifier(param['initializesField'])} = ${ctx.identifier(String(param['name']))};`);
      }
    }
    for (const entry of asArray(ctor['initializers'])) {
      init.push(`this.${ctx.identifier(String(entry['field']))} = ${ctx.expr(entry['value'] as Node, params)};`);
    }
    init.push(...ctx.body(asArray(ctor['body']), params));
    lines.push(`${initName(className, ctor['name'] as string | undefined)}(${paramList(params, ctx)}): void {`, ...indent(init), '}');
  }

  let hasToString = false;
  for (const method of asArray(decl['methods'])) {
    const raw = String(method['name']);
    if (raw === 'toString') hasToString = true;
    const params = asArray(method['params']);
    const returnType = ctx.typeText(method['returnType'] as Node | undefined);
    const isAsync = method['isAsync'] === true;
    const returns = isAsync ? `Promise<${returnType}>` : returnType;
    const body = ctx.body(asArray(method['body']), params);
    if (method['isGetter'] === true) lines.push(`get ${ctx.identifier(raw)}(): ${returns} {`, ...indent(body), '}');
    else if (method['isOperator'] === true) {
      const mapped = OPERATOR_NAMES[raw];
      if (mapped === undefined) {
        ctx.report(`the operator \`${raw}\` of the enum \`${className}\` has no lowering.`, id);
        return undefined;
      }
      lines.push(`${mapped}(${paramList(params, ctx)}): ${returns} {`, ...indent(body), '}');
    } else {
      lines.push(`${method['isStatic'] === true ? 'static ' : ''}${isAsync ? 'async ' : ''}${ctx.identifier(raw)}(${paramList(params, ctx)}): ${returns} {`, ...indent(body), '}');
    }
  }
  if (!hasToString) lines.push('toString(): string {', `  return '${className}.' + this.name;`, '}');

  // One instance per constant, built in declaration order; `values` after them.
  asArray(decl['constants']).forEach((constant, index) => {
    const name = String(constant['name']);
    const ctor = constructorOf(decl, constant['constructorName'] as string | undefined);
    const params = asArray(ctor?.['params']);
    const positional = asArray(constant['args']).map((a) => ctx.expr(a, []));
    const named = Object.fromEntries(
      Object.entries((constant['namedArgs'] ?? {}) as Record<string, Node>).map(([k, v]) => [k, ctx.expr(v, [])]),
    );
    const passed = callArguments(params, positional, named);
    const text = Array.isArray(passed) ? passed.join(', ') : '';
    lines.push(
      `static readonly ${ctx.identifier(name)}: ${className} = (() => {`,
      `  const $self = new ${className}();`,
      `  $self.name = '${name}';`,
      `  $self.index = ${index};`,
      `  $self.${initName(className, constant['constructorName'] as string | undefined)}(${text});`,
      '  return $self;',
      '})();',
    );
  });
  lines.push(`static readonly values: readonly ${className}[] = [${values.map((v) => `${className}.${ctx.identifier(v)}`).join(', ')}];`);
  return [`export class ${className} {`, ...indent(lines), '}'];
}
