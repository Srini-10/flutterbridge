# fixtures/app_a — pointer, not a copy

**App A is the existing production fixture: `fixtures/apps/hello_bridge`.**

It is analyzed **in place, read-only**. It is deliberately not copied here: duplicating a fixture
means the copy drifts, and the brief forbids modifying production fixtures. The compat tool takes a
`--project` path, so pointing it at the real thing costs nothing.

```bash
dart run bin/compat_report.dart \
  --project ../../fixtures/apps/hello_bridge \
  --name app_a \
  --out out/app_a.json \
  --report reports/app_a.md
```

App A is the *simple* application in this comparison — it was written to the frozen MVP subset
(Blueprint §5.1), so it is the control case: if the report cannot say "this one is fine", the report
format is useless.

App B (`fixtures/app_b`, `shop_bridge`) is the *hard* case, written for this spike.
