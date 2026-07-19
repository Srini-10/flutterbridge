# Migration

**There is nothing to migrate from.** `0.1.0` is the first public release; no earlier version was
published, so no project can be running one.

This page exists so the question has an answer rather than a 404, and so the policy is stated before it is
needed.

## Upgrading from 0.1.0 to a later release

Two things to know, both enforced rather than documented-at:

**1. The `@bridge/*` packages upgrade together.** The compiler train pins its members to each other
exactly, so npm cannot construct a mixed install. `npm install -g @bridge/cli@latest` moves all of them.

**2. Re-analyze after upgrading.**

```bash
bridge clean && bridge build
```

Documents under `.bridge/` record the UIR schema they were built against, and a new compiler **refuses**
one built against a different schema — exit code 3, with the remedy in the message:

```text
.bridge/uir.ndjson cannot be read.
  this document was built against UIR schema fc4e4eb130c9f948 (v1.4.0), and this compiler reads … (v1.5.0).
  → run `bridge analyze` to rebuild it with this version.
```

The refusal is the feature. An old document still *deserializes* — with a field missing, or an enum the
reader has never heard of — and the compiler would carry on and be quietly wrong.

## Your generated application

The emitted `package.json` depends on `@bridge/runtime-react` through a **caret range** (`^0.1.0`), so a
compatible kit release is a drop-in `npm install` in your output directory with no regeneration.

Pre-1.0, a caret is bounded by the minor: `^0.1.0` admits `0.1.x` and not `0.2.0`. A `0.2.0` kit means
regenerating. That is semver's rule for `0.x` rather than a policy of ours.

## If a release breaks you

`0.x` means the API can change in a minor release. When one does, it will be in
[CHANGELOG.md](../../CHANGELOG.md) under **Changed** with the reason, and — where the change is mechanical
— the command that performs it.

See [version compatibility](../guide/compatibility.md) for what is checked, and what is not.
