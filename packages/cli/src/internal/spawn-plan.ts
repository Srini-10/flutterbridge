// How a subprocess is launched, per platform.
//
// ## The problem, stated exactly
//
// Windows has **two** argument parsers and they do not agree:
//
//   1. **`CommandLineToArgvW`** — how a program splits its own command line back into `argv`. Documented
//      at `learn.microsoft.com/windows/win32/api/shellapi/nf-shellapi-commandlinetoargvw`:
//        * arguments are delimited by whitespace;
//        * a string in double quotes is one argument, whitespace included;
//        * `\"` is a literal quote;
//        * backslashes are literal **unless they immediately precede a quote**;
//        * `2n` backslashes then `"` → `n` backslashes, and the quote delimits;
//        * `2n+1` backslashes then `"` → `n` backslashes and a literal quote.
//
//   2. **`cmd.exe`** — which additionally processes `& | < > ( ) ^ %` and strips `^`.
//
// M5-E set `shell: true` on Windows because `dart`, `npx` and `flutter` are **batch files** there, and
// `CreateProcess` executes `.exe` and refuses `.bat`/`.cmd` — without a shell, three of `bridge build`'s
// four stages died with `ENOENT` on a program plainly on `PATH`.
//
// That fix was correct about batch files and wrong about everything else: `shell: true` sends **every**
// argument through `cmd.exe`, and M5-E only quoted arguments containing whitespace. The Windows CI run
// caught it with `node -e 'process.stdout.write("ok")'`, which contains no whitespace at all, went
// through unquoted, and was re-parsed into fragments by `cmd.exe`.
//
// ## The fix, and why it is shaped this way
//
// **A shell is used only when a shell is required.** A real executable is spawned directly, so libuv's
// own `quote_cmd_arg` — which implements the rules above and has been exercised by every Node program on
// Windows for a decade — does the quoting. Nothing here re-implements it for the common path.
//
// Only a batch file goes through `cmd.exe`, and then arguments are quoted here. That path is narrow by
// construction: the arguments this CLI passes to `dart`/`npx` are file paths and literal flags, and a
// **double quote cannot occur in a Windows path** — `" < > : / \ | ? *` are reserved filename characters.
// So the hard case cannot arise there, and the implementation is still written to the documented rules
// rather than to that observation.
//
// When the program cannot be resolved, the plan falls back to `shell: true` — the M5-E behaviour, which
// is known to launch batch files. An unresolvable program should fail as `ENOENT` from the spawn, not as
// a different launch strategy chosen by this function.

/** How to launch a program: what to exec, with which arguments, and whether a shell is involved. */
export interface SpawnPlan {
  /** The program to execute. */
  readonly program: string;
  /** The arguments, encoded for whichever parser will read them. */
  readonly args: readonly string[];
  /** Whether `child_process.spawn` should route through a shell. */
  readonly shell: boolean;
}

/** Extensions Windows treats as batch files, which `CreateProcess` cannot execute. */
const BATCH_EXTENSIONS: readonly string[] = ['.bat', '.cmd'];

/**
 * Whether `program` names a batch file, given a resolver for programs found on `PATH`.
 *
 * `resolve` returns the full path Windows would execute, or `undefined` when it cannot say. Injected
 * rather than called directly so this stays a pure function — the encoding is the part worth testing on
 * every platform, and filesystem probing is not.
 */
export function needsShell(program: string, resolve: (name: string) => string | undefined): boolean {
  const named = program.toLowerCase();
  if (BATCH_EXTENSIONS.some((extension) => named.endsWith(extension))) return true;
  // An explicit extension that is not a batch extension needs no shell.
  if (/\.[a-z0-9]+$/i.test(named)) return false;

  const resolved = resolve(program);
  // Unresolvable: fall back to a shell, which is M5-E's behaviour and launches batch files. Choosing the
  // *narrower* strategy here would turn "not on PATH" into "spawned the wrong way".
  if (resolved === undefined) return true;
  return BATCH_EXTENSIONS.some((extension) => resolved.toLowerCase().endsWith(extension));
}

/**
 * Encodes one argument for `CommandLineToArgvW`.
 *
 * The algorithm the rules above imply, and the one Microsoft's own tooling uses: quote when the argument
 * is empty or contains whitespace or a quote; double the backslashes that precede a quote (and those at
 * the very end, which precede the closing quote); escape each embedded quote.
 *
 * @param argument - the argument as the caller means it.
 * @returns the argument as the command line must spell it.
 */
export function encodeArgument(argument: string): string {
  // An argument with nothing special in it is already its own encoding, and quoting it would be noise in
  // every command line a user is shown.
  if (argument !== '' && !/[\s"]/.test(argument)) return argument;

  let encoded = '"';
  let backslashes = 0;

  for (const character of argument) {
    if (character === '\\') {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      // `2n+1` backslashes then `"` → `n` backslashes and a literal quote.
      encoded += '\\'.repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
      continue;
    }
    encoded += '\\'.repeat(backslashes) + character;
    backslashes = 0;
  }

  // Trailing backslashes precede the closing quote, so they must be doubled — otherwise the last one
  // escapes the quote that ends the argument and the parse runs on into the next one.
  return `${encoded}${'\\'.repeat(backslashes * 2)}"`;
}

/** `cmd.exe` metacharacters. It strips the `^` and passes the character through. */
const CMD_METACHARACTERS = /[()%!^"<>&|]/g;

/**
 * Encodes one argument for a command line that `cmd.exe` reads **before** the program does.
 *
 * Two passes, because there are two parsers: `CommandLineToArgvW` first, so the program recovers the
 * argument the caller meant; then `^` before every `cmd.exe` metacharacter, including the quotes the
 * first pass produced, because `cmd.exe` consumes the `^` and hands the rest on.
 */
export function encodeForShell(argument: string): string {
  return encodeArgument(argument).replace(CMD_METACHARACTERS, (character) => `^${character}`);
}

/**
 * How to launch `program` with `argv` on `platform`.
 *
 * @param program - the program name or path.
 * @param argv - its arguments, as the caller means them.
 * @param platform - `process.platform`.
 * @param resolve - resolves a bare program name to the file Windows would execute.
 * @returns the plan `run` should hand to `child_process.spawn`.
 */
export function spawnPlan(
  program: string,
  argv: readonly string[],
  platform: string,
  resolve: (name: string) => string | undefined = () => undefined,
): SpawnPlan {
  // POSIX: no shell, no re-parsing, nothing to encode. `spawn` passes the vector through.
  if (platform !== 'win32') {
    return { program, args: [...argv], shell: false };
  }

  if (!needsShell(program, resolve)) {
    // A real executable. libuv applies the `CommandLineToArgvW` rules when it builds the command line,
    // and re-encoding here would escape the escapes.
    return { program, args: [...argv], shell: false };
  }

  return {
    program: encodeForShell(program),
    args: argv.map(encodeForShell),
    shell: true,
  };
}
