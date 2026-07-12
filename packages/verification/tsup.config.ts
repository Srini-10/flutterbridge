import { defineConfig } from 'tsup';

// JS emit only: declarations are emitted by `tsc -b` (TS project references, Spec §1.3),
// so the two emitters never fight over dist/.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  dts: false,
  clean: false,
  sourcemap: true,
  splitting: false,
  treeshake: false,
});
