/// <reference types="vite/client" />

declare module "*.html" {
    const content: string;
    export default content;
}

declare module 'socket.io-client/dist/socket.io.js' {
    export * from 'socket.io-client'
}
