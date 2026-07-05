/// <reference types="vite/client" />

// Build stamp injected by vite.config.js `define` (see version-guard.ts).
declare const __APP_VERSION__: string;

declare module "*.html" {
    const content: string;
    export default content;
}

declare module 'socket.io-client/dist/socket.io.js' {
    export * from 'socket.io-client'
}
