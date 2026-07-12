import { defineConfig } from 'tsup';

// JS emit only: declarations are emitted by `tsc -b` (TS project references, Spec §1.3),
// so the two emitters never fight over dist/.
export default defineConfig({
  entry: ['src/index.ts'],
  // `material-color-utilities` ships ESM whose own internal imports have no file extensions, which Node
  // cannot resolve and a bundler can. Bundling it in is not a preference — it is the only way the
  // package loads at all. It is a pure function of a seed colour, so nothing about determinism changes.
  noExternal: ['@material/material-color-utilities'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  dts: false,
  clean: false,
  sourcemap: true,
  splitting: false,
  treeshake: false,
});
