import { defineConfig } from 'vite';

/** @type {import('vite').UserConfig} */
export default defineConfig({
  server: {
    port: 8081
  },
  publicDir: './public',
  // optimizeDeps: {
  //   include: [
  //     'bindrjs'
  //   ]
  // }
});
