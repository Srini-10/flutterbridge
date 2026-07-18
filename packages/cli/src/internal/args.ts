// A small argument parser. The `bridge` surface is flags and positionals; it does not need a library.

/** A parsed command line. */
export interface Args {
  readonly command: string;
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, string | true>;
}

export class UsageError extends Error {}

/** Parses [argv] (without node/script). Throws [UsageError] on anything malformed. */
export function parseArgs(argv: readonly string[]): Args {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const body = arg.slice(2);
    if (body.length === 0) throw new UsageError('`--` is not a flag.');

    const eq = body.indexOf('=');
    if (eq !== -1) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }

    // `--flag value` only when the next argument is not itself a flag; otherwise it is a boolean.
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--') && VALUED.has(body)) {
      flags.set(body, next);
      i++;
    } else {
      flags.set(body, true);
    }
  }

  const [command = '', ...rest] = positionals;
  return { command, positionals: rest, flags };
}

/**
 * Flags that take a value. Everything else is boolean, so `--json <path>` cannot eat a positional.
 *
 * **This list and `value()` must agree, and they silently did not.** `--config` was added with the
 * production commands in M5-B, documented in `docs/guide/cli.md` as `--config <path>`, and never added
 * here — so the parser treated it as a boolean, `value(args, 'config')` found `true`, and the documented
 * form failed with *"--config needs a value."* while only `--config=<path>` worked. A flag can be read as
 * a value and declared as a boolean, and nothing connects the two declarations.
 *
 * `kind` and `depth` are the mirror image: declared here, read by nothing. They cost nothing and are left
 * rather than removed, because dropping them would change how `--kind x` parses — `x` would become a
 * positional and, for a command that takes a document path, a confusing one.
 */
const VALUED = new Set(['config', 'manifest', 'plugin', 'out', 'kind', 'depth']);

/** The value of [name], or undefined. Throws if it was given as a bare boolean. */
export function value(args: Args, name: string): string | undefined {
  const raw = args.flags.get(name);
  if (raw === undefined) return undefined;
  if (raw === true) throw new UsageError(`--${name} needs a value.`);
  return raw;
}

/** Whether the boolean flag [name] is set. */
export function flag(args: Args, name: string): boolean {
  return args.flags.get(name) === true;
}
