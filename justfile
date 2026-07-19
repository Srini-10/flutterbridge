# FlutterBridge task runner — bridges the TypeScript (pnpm/turbo) and Dart (flutter/melos) domains.
# Spec v2.0 §1.3. Milestone gates are run via `just ci`.

set shell := ["bash", "-uc"]

fixture_app := "fixtures/apps/hello_bridge"

# List available recipes.
default:
    @just --list

# Install all workspace dependencies (TS domain).
install:
    pnpm install --frozen-lockfile

# Build every TS package (turbo: codegen -> build).
build:
    pnpm run build

# Run every TS package's tests.
test:
    pnpm run test

# Typecheck every TS package.
typecheck:
    pnpm run typecheck

# Architecture rules (Spec §1.2) + stub-tag discipline (Blueprint §2) + platform portability.
lint:
    pnpm run lint:deps
    pnpm run lint:stubs
    pnpm run lint:portability

# Prove the architecture rules actually fail a wrong import (M0-T1 acceptance criterion).
lint-negative:
    pnpm run verify:depcruise-negative

# Regenerate the UIR models from the schema (both languages).
codegen:
    pnpm run codegen

# Fail if a generated model has drifted from the schema.
codegen-check:
    pnpm run codegen:check

# Dart domain: the UIR models (generated).
uir-lint:
    cd dart/bridge_uir && dart analyze --fatal-infos

uir-test:
    cd dart/bridge_uir && dart test --reporter=compact

# Dart domain: the compiler frontend (bridge_analyzer).
analyzer-lint:
    cd dart/bridge_analyzer && dart analyze --fatal-infos

analyzer-test:
    cd dart/bridge_analyzer && dart test --reporter=compact

# Dart domain: static analysis of the fixture app(s).
dart-analyze:
    cd {{fixture_app}} && flutter analyze

# Dart domain: prove the fixture app still compiles for web.
dart-build:
    cd {{fixture_app}} && flutter build web --no-tree-shake-icons

# Full local gate — mirrors CI.
ci: build typecheck test codegen-check lint lint-negative uir-lint uir-test analyzer-lint analyzer-test dart-analyze

# ── release (M5-C) ────────────────────────────────────────────────────────────

# Copy the Dart analyzer into @bridge/cli so that publishing the CLI publishes the frontend with it.
# Runs automatically as the CLI's `prepack`; here for inspecting the result.
bundle-analyzer:
    node tools/bundle-analyzer.mjs

# Pack every publishable package into release/, and assert each tarball is installable.
# Checks what only shows from outside the workspace: no `workspace:`/`catalog:` protocols survived,
# every declared entry point is actually inside, and the CLI carries the analyzer and its lockfile.
package: build
    node tools/pack-release.mjs

# Build a native analyzer for THIS platform. Optional: ~3x faster startup than running from source
# (3.1s vs 9.0s on examples/counter), at the cost of being one platform's binary. Point BRIDGE_ANALYZER
# at the result. The npm package deliberately ships source instead — see tools/bundle-analyzer.mjs.
analyzer-binary:
    cd dart/bridge_analyzer && dart compile exe bin/bridge_analyzer.dart -o ../../release/bridge_analyzer
    @echo "built release/bridge_analyzer — export BRIDGE_ANALYZER=$(pwd)/release/bridge_analyzer"

# The full release gate: everything CI checks, then prove the tarballs are installable.
release-check: ci package

# BRIDGE-STUB(M4): golden corpus run (fixtures/apps/* through the full pipeline + verification suite).
corpus:
    @echo "corpus: not implemented until M4 (Blueprint §3, M4-T6)." && exit 1

# ── browser validation (M5-D) ──────────────────────────────────────────────────

# The full browser suite: generate a real app, npm install, next build, then drive it in Chromium.
# Retires the M2 stub this recipe used to be — its text named exactly this pipeline.
# Needs a Flutter SDK and `pnpm --filter @bridge/e2e exec playwright install chromium` once.
e2e:
    pnpm --filter @bridge/e2e run e2e

# Rebuild only the applications the browser suite runs against, without launching a browser.
e2e-fixtures:
    pnpm --filter @bridge/e2e run build-fixtures

# Prove the whole pipeline is reproducible: 3 complete runs, byte-compared.
determinism:
    pnpm --filter @bridge/e2e exec node src/determinism.mjs

# Measure the pipeline and the browser. Measurement only — never optimize without one.
measure:
    pnpm --filter @bridge/e2e exec node src/measure.mjs
