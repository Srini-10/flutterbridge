# Continuous integration and release qualification

Two workflows, answering two different questions.

| Workflow | Question | When | Platforms |
| --- | --- | --- | --- |
| [`ci.yml`](../../.github/workflows/ci.yml) | did this change break anything? | every push and PR | Linux |
| [`release.yml`](../../.github/workflows/release.yml) | would this work on a machine we do not own? | tags, manual, weekly | **Linux · macOS · Windows** |

`ci.yml` is the fast gate. `release.yml` is slower — it installs a Flutter SDK, packs real tarballs,
publishes them to a real registry, installs them globally and drives a browser — and it is what qualifies
a release.

## Why the release matrix exists

M5-E found that the CLI **could not run on Windows at all**. Three POSIX-only assumptions, none caught by
any test, because every test ran on macOS:

- `bridge doctor` shelled out to `/usr/bin/env which dart`;
- `spawn` ran without a shell, and `dart`/`npx` are `.bat`/`.cmd` on Windows, so `CreateProcess` refused
  them;
- the typecheck stage invoked `/usr/bin/env npx`.

The fixes are in. This workflow is what turns them from *believed* into *observed*.

## What the matrix runs

### `pipeline` — every platform, the same steps

Checkout → line-ending check → toolchains → install → build → `codegen:check` → test → typecheck →
portability → stub tags → Dart analyze and test (both packages) → then the compiler itself, through its
public entry point on a real Flutter project:

```bash
bridge init && bridge doctor && bridge build && bridge validate && bridge clean
```

`bridge` is invoked as its own binary, never by importing the generator — the thing under test is the CLI a
user runs, including how it spawns `dart`, which is exactly what was broken.

Each platform then writes a **fingerprint**: the sha256 of `uir.ndjson` and `normalized.ndjson`.

### `reproducible` — the same bytes everywhere

Downloads all three fingerprints and fails if they differ. This is the property that makes a cache
shareable and a golden meaningful, and until M5-F **nothing checked it across operating systems** — only
across repeated runs on one machine.

Two defects were found by reasoning about this property before the workflow could run:

| Defect | Effect on Windows | Fix |
| --- | --- | --- |
| Line endings | CRLF sources change `span.length`; the golden byte-compare fails | [`.gitattributes`](../../.gitattributes) pins `eol=lf` |
| Path separators | `p.relative` yields `lib\main.dart`, which reaches `span.file` → anchor → **node id**, so every id differs | `p.url.joinAll(p.split(…))` in `project_loader.dart` |

The second is the more serious: anchors are hashed into content addresses (ADR-17), so Windows would have
produced a wholly different document rather than a slightly different one.

### `install` — packaging, from outside the workspace

Packs, publishes to a local Verdaccio, `npm install -g @bridge/cli`, then runs the whole user workflow in a
directory that contains only `lib/` and `pubspec.yaml`. Nothing may reference the checkout — a workspace
assumption fails here by construction.

Registry, publish and install are **one step**, deliberately: a background process started in an earlier
step is not reliably alive in a later one, least of all on the Windows runner.

### `browser` — Linux only, and why

Playwright's browser download dominates the job, and the suite asserts what the *generated application*
does, which is a property of the emitted code rather than of the host. The host-dependent half — that
`bridge build` produces that code at all — runs on all three platforms in `pipeline`.

This is a deviation, and it is recorded in the workflow at the point it happens. If a browser defect ever
proves platform-specific, this is the job to widen.

## Running the gates locally

```bash
just ci                  # everything ci.yml runs
just lint                # architecture rules + stub tags + portability
just e2e                 # the browser suite
just determinism         # 3 complete pipeline runs, byte-compared
just release-check       # ci + packed tarballs asserted installable
```

`node tools/check-portability.mjs` is the one worth knowing about: it catches **case-exact import** and
**CRLF** problems from any host, including the platform where they are invisible. Its limits are documented
in its own header — `tsc` already covers TypeScript casing, so the value is Dart and `.mjs`.

## Pinned versions

| | | Why |
| --- | --- | --- |
| Node | `24.6.0` | `dependency-cruiser` refuses 25; 24 is the current LTS-adjacent line |
| Flutter | `3.44.0` | matches what the docs claim validation was performed against |
| pnpm | `11.11.0` | lockfile compatibility |

A floating version would make a red run ambiguous: broken by us, or by an SDK release?

## Interpreting a failure

| Job red | Likely cause |
| --- | --- |
| `line endings are LF` | `.gitattributes` not honoured; the checkout converted files |
| `portability` | a case-inexact import, or a CRLF file was committed |
| `reproducible` | a host detail reached UIR — a path, a timestamp, a locale-dependent sort |
| `install` on one platform only | a packaging or process-spawning assumption |
| `bridge doctor` on Windows only | executable resolution — see M5-E's release blockers |
