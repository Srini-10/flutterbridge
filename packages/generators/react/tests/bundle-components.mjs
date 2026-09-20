// Bundles emitted components for `execute.ts`. A separate process because esbuild refuses to run inside jsdom's
// patched globals (`new TextEncoder().encode('') instanceof Uint8Array` is false there).
import { build } from 'esbuild';

const { root, entry, outfile, runtimeEntry, nodePath } = JSON.parse(process.argv[2]);
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts', sourcefile: 'entry.ts' },
  bundle: true,
  format: 'iife',
  globalName: '__bundle',
  platform: 'browser',
  outfile,
  jsx: 'automatic',
  logLevel: 'error',
  nodePaths: [nodePath],
  alias: { '@': `${root}/src`, '@bridge/runtime-react': runtimeEntry },
  define: { 'process.env.NODE_ENV': '"development"' },
});
