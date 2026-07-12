# spikes/m0-extractor — THROWAWAY (M0-T3)

Spike extractor. Walks a Flutter project with `package:analyzer` (resolved ASTs, ADR-2) and dumps
**ad-hoc JSON** — widget trees, state fields, stores, navigation, endpoints.

**This is not the analyzer.** There is no schema, no tests, and no stability guarantee here; M0 is a
de-risk spike and its code is disposable by design (Blueprint §3, M0). The real extractor is
`dart/bridge_analyzer`, which begins at **M1-T7** against the UIR schema.

**Delete this directory at M1-T7.** Its output has already been distilled into the deliverable that
matters: [`docs/spikes/m0-t3-extraction-fidelity.md`](../../docs/spikes/m0-t3-extraction-fidelity.md).

## Run

```bash
# The target project must have been `flutter pub get`-ed, or extraction refuses to run (see F6).
cd fixtures/apps/hello_bridge && flutter pub get && cd -

cd spikes/m0-extractor
dart pub get
dart run bin/spike_extract.dart \
  --project ../../fixtures/apps/hello_bridge \
  --out out/hello_bridge.json
```

Output: `out/hello_bridge.json` (committed as the M0-T3 evidence artifact).
