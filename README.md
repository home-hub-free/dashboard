---
title: dashboard — the Home Hub UI
summary: Overview of the vanilla-TS/Vite dashboard (the household's front door, prod :8181 → hub :8088) — run/build commands, the component-triple convention, bindrjs, pointers to DESIGN/UI-LIBRARY/PRODUCT.
status: LIVE
owner: dashboard
updated: 2026-07-14
tags: [dashboard, ui, vite]
---

# dashboard

The **Home Hub dashboard** — the household's single front door to the self-hosted home
automation stack. It renders live device control (lights, blinds, doors, evaporative
cooler, cameras), sensor state, automation rules, and the AI assistant chat. Touch-first,
dark-mode, wall-mounted; phones are the secondary surface.

Vanilla TypeScript bundled with **Vite** — no framework. Reactivity comes from
[`bindrjs`](https://www.npmjs.com/package/bindrjs), a small Proxy-based data-binding library
(an independent npm package, consumed as an external dependency). Served in prod on
**:8181**; it targets the hub on **:8088** (same-origin `/api/` via nginx by default).

## Commands

```bash
npm run dev       # Vite dev server with --host (LAN accessible); UI kit at /ui-kit.html
npm run build     # tsc + vite build → dist/
npm run prod      # build + serve dist/ on port 8181 via http-server
npm run link      # link local bindrjs + dev (use for bindrjs development)
```

## Where things are

- **`src/main.ts`** — entry: inits NavBar + MainContent + WebSockets.
- **`src/main-content/menu-items/`** — the screens (home, automations, assistant).
- **`src/utils/server-handler.ts`** — every `fetch()` to the hub; the server URL lives here
  (`VITE_SERVER_URL` override, else same-origin `/api/`).
- **`src/utils/ws-handler.ts`** — Socket.IO client (device/sensor declare + update events).
- **`src/styles/`** — layered `ui/` (generic library) + `views/` (per-screen).

**Component convention** — each UI piece is a triple: `<name>.ts` (class + `Bind<State>`),
`<name>.html` (template string, imported `?raw`), `<name>.model.ts` (state + WS event types).

## Docs

- [PRODUCT.md](./PRODUCT.md) — who it's for and what "done" means (the "Vesper" brief).
- [DESIGN.md](./DESIGN.md) — design **principles** (color semantics, elevation, bindrjs gotchas).
- [UI-LIBRARY.md](./UI-LIBRARY.md) — the component **catalog** + recipe for a new screen.
- [AGENTS.md](./AGENTS.md) — read-first for any AI coding session here.
- Hub contracts (HTTP API, WS events, auth) live in the root
  [`../CLAUDE.md`](../CLAUDE.md).
