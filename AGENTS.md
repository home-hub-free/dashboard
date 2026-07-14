---
title: AGENTS — dashboard
summary: Read-first for dashboard UI — read DESIGN + UI-LIBRARY before building, validate with Playwright, follow the .ts/.html/.model.ts component triple, mind the bindrjs reactive-render traps.
status: LIVE
owner: dashboard
updated: 2026-07-14
tags: [dashboard, agents, meta]
---

# AGENTS.md — dashboard

> Context for any AI coding session working in this project. Read this first.
> The [`README.md`](./README.md) is the overview; the hub contracts (HTTP API, WS events,
> auth) live in the root [`../CLAUDE.md`](../CLAUDE.md).

## Read before you touch any UI

- **[DESIGN.md](./DESIGN.md)** — the design *principles* (the four-lamp color semantics,
  elevation, tap targets, bindrjs reactivity gotchas). It is the source of truth for *why*
  the UI looks the way it does.
- **[UI-LIBRARY.md](./UI-LIBRARY.md)** — the component *catalog*. Everything you need to
  build a screen already exists as a documented primitive; use it before inventing markup.
  Live gallery at `/ui-kit.html` under `npm run dev`.
- **[PRODUCT.md](./PRODUCT.md)** — the audience and the bar ("disappear into the house";
  glance-then-one-tap; instrument, not appliance app).

Do not redesign an area without reading DESIGN + UI-LIBRARY first.

## Conventions

- **Component triple** — each UI piece is three files: `<name>.ts` (class + `Bind<State>`
  instance), `<name>.html` (template string imported with `?raw`), `<name>.model.ts`
  (TypeScript types for state + WS events). Keep all three in step.
- **bindrjs** wraps state in a Proxy so the template re-renders on property assignment
  (`bind.x = v`). The reactivity traps that bite are enumerated in DESIGN §7 / UI-LIBRARY
  §14 — read them before debugging a "won't re-render" or a leak.
- **Styles** are layered: `src/styles/ui/` (generic library) + `src/styles/views/`
  (per-screen). Add a new primitive to `ui/` and document it in UI-LIBRARY; keep
  screen-specific rules in `views/`.
- **Server calls** all go through `src/utils/server-handler.ts`; WS through
  `src/utils/ws-handler.ts`. Don't scatter `fetch()` across components.

## Validate visually

This is a visual product — **validate changes with Playwright** (screenshots), not just a
typecheck. DESIGN's *Validating changes* section is the workflow. A green `npm run build`
is necessary but not sufficient.

## Repo hygiene

Root repo (`/opt/home-hub-free`) is **local-only**; this `dashboard/` repo is the real
GitHub repo (`origin`, branch `main`) — commit and push here per its own convention.
