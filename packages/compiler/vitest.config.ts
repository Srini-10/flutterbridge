import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        // See tsup.config.ts: the package's own ESM imports have no file extensions. Node cannot resolve
        // them; a bundler can. Inlining it is how the tests load it at all.
        inline: [/@material\/material-color-utilities/],
      },
    },
  },
});
