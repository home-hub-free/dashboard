import { defineConfig } from 'vite';

/** @type {import('vite').UserConfig} */
export default defineConfig({
  server: {
    port: 8081
  },
  assetsInclude: [
    '**/*.html'
  ],
  transforms: [
    {
      test: ({ path }) => path.endsWith(".html"),
      transform({ code }) {
        return `export default ${JSON.stringify(code)}`
      }
    },
  ],
  optimizeDeps: {
    include: [
      'bindrjs',
    ]
  },
  publicDir: './public'
});
