import { defineConfig } from 'vite';

/** @type {import('vite').UserConfig} */
export default defineConfig({
  assetsInclude: [
    '**/*.html'
  ],
  transforms: [
    {
      test: ({ path }) => path.endsWith(".html"),
      transform({ code }) {
        return code;
      },
    },
  ],
});
