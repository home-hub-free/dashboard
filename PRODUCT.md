---
title: Product — Home Hub Dashboard
summary: The dashboard's product/brand brief — audience (wall-first household), purpose (disappear into the house), local/private/AI-native positioning, the "Vesper" personality, and design/a11y principles.
status: LIVE
owner: dashboard
updated: 2026-07-11
tags: [dashboard, product, brand]
---

# Product

## Register

product

## Platform

web

## Users

The whole household, wall-first. Primary: family members glancing at or tapping the wall-mounted touch panel in passing — often from across a room, often in low light, usually mid-task (leaving the house, settling in for the evening). Phones are the secondary surface, same app, thumb-reach bottom nav. Guests occasionally use the panel. The builder (David) also maintains the system, but the dashboard is designed for the non-builders: nobody should need to understand the stack to use it.

## Product Purpose

The single front door to a self-hosted home automation stack: live device control (lights, blinds, doors, evaporative cooler, cameras), sensor state, automation rules, and the household's AI assistant — all running on hardware in the house. Success is the dashboard **disappearing into the house**: lights, climate, and the agent just work; the panel is glanced at, not operated, and nobody thinks about the software behind it.

## Positioning

Fully local, private, AI-native. The whole stack — devices, hub, LLM agent, voice, vision — runs on the household's own hardware with no cloud dependency, and the AI is a first-class resident of the house rather than a bolted-on service. Every screen reinforces that the house answers for itself.

## Brand Personality

Calm, instrumental, quiet — a control board in a house after dark ("Vesper"). It reports state; it doesn't perform, greet, or decorate. Warm accents belong to the house's own lights, not to the interface's ego. The emotional goal is settledness: a one-second glance tells you whether the house is okay.

## Anti-references

Home Assistant density: config-dense entity grids, everything-exposed dashboards, YAML-adjacent admin feel. This board is purpose-built and curated — a tile earns its place and its size; configuration lives behind the ⋯, never on the glance surface.

## Design Principles

1. **Disappear into the house.** The best session is a one-second glance. Anything that demands attention must be earning it (a failure, a question from the agent).
2. **Glance, then one tap.** House state reads in under a second from across the room; the most common action (toggle a light) is a single tap. Depth exists but is always behind the surface, never on it.
3. **Instrument, not appliance app.** The board tells you whether the house is settled — no greetings, no mascot energy, no decorative motion. Live values are visibly data (mono), state is shown as indicator lamps.
4. **Curated over configurable.** Screens are designed for this house, not generated from an entity list. Every room reads in the same scan order; every tile shows its one glanceable hierarchy and demotes the rest to the detail sheet.
5. **The house answers for itself.** Local-first is the product: the board keeps working when the cloud doesn't exist, degrades honestly (offline banner, optimistic writes with revert), and never pretends to know something it doesn't.

## Accessibility & Inclusion

WCAG AA contrast (≥4.5:1 body text, verified on raised surfaces, not just the page background — the full Vesper pair set is validated numerically). Every tappable control meets the 44px minimum hit area (`--tap-target-min`), expanded invisibly where the glyph is smaller. `prefers-reduced-motion` is honored everywhere, including the detail-overlay choreography. Touch-first: no hover-dependent affordances.
