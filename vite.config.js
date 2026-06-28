import { defineConfig } from 'vite';

// In prod the dashboard is served behind nginx, which routes same-origin paths
// (/api, /memory, /gateway, /voice, /tts, /speaker, /camera) to each service. Mirror
// that here so `npm run dev` resolves the SAME relative paths — pointed at the canonical
// box (override the host with VITE_PROXY_HOST). Without this, dev cannot reach the hub
// once server-handler.ts uses relative URLs. `rewrite` strips the prefix to match nginx's
// trailing-slash proxy_pass; `ws: true` carries the Socket.IO upgrade for /api + /camera.
// EXCEPTION: memory-service mounts its routes UNDER /memory/, so its nginx block has NO
// trailing slash (prefix preserved) — mirror that here with `keepPrefix` (no rewrite).
const HOST = process.env.VITE_PROXY_HOST || 'http://192.168.1.232';
const at = (port) => HOST.replace(/:\d+$/, '') + ':' + port;
const strip = (prefix) => (path) => path.replace(new RegExp('^' + prefix), '');
const proxy = (prefix, port, ws = false, keepPrefix = false) => ({
  target: at(port),
  changeOrigin: true,
  ws,
  ...(keepPrefix ? {} : { rewrite: strip(prefix) }),
});

/** @type {import('vite').UserConfig} */
export default defineConfig({
  server: {
    port: 8081,
    proxy: {
      '/api':     proxy('/api', 8088, true),    // hub REST + Socket.IO device/sensor stream
      '/camera':  proxy('/camera', 8082, true), // ESP32 JPEG frame Socket.IO
      '/memory':  proxy('/memory', 8120, false, true), // pattern-discovery queue (keep /memory prefix)
      '/gateway': proxy('/gateway', 8090),      // llm-gateway (agent /route)
      '/voice':   proxy('/voice', 8110),        // voice-pipeline (Whisper transcribe)
      '/tts':     proxy('/tts', 8100),          // tts-service (Fish)
      '/speaker': proxy('/speaker', 8112),      // voiceprint enroll/verify
    }
  },
  publicDir: './public',
  optimizeDeps: {
    include: ['bindrjs', 'socket.io-client']
  },
  build: {
    commonjsOptions: {
      include: [/bindrjs/, /socket\.io-client/]
    }
  }
});
