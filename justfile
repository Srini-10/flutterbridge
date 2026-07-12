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

# Architecture rules (Spec §1.2) + stub-tag discipline (Blueprint §2).
lint:
    pnpm run lint:deps
    pnpm run lint:stubs

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

# BRIDGE-STUB(M4): golden corpus run (fixtures/apps/* through the full pipeline + verification suite).
corpus:
    @echo "corpus: not implemented until M4 (Blueprint §3, M4-T6)." && exit 1

# BRIDGE-STUB(M2): end-to-end walking skeleton (bridge build -> next build -> Playwright flows).
e2e:
    @echo "e2e: not implemented until M2 (Blueprint §3, M2-T22)." && exit 1
