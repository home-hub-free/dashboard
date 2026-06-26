# Dashboard Design System

Source of truth for the Home Hub dashboard UI. Read this before redesigning any
area, and validate changes visually (see [Validating changes](#validating-changes)).

The dashboard is a touch-first, dark-mode, wall-mounted home hub. Design priorities,
in order:

1. **Glanceability** — "what's on" must read in under a second from across a room.
2. **One-tap action** — the most common action (toggle a light) is a single tap.
3. **Calm** — warm, muted palette; motion is quick and subtle, never flashy.

---

## 1. Tokens

All design tokens live in `src/styles/_variables.scss` as CSS custom properties on
`:root`. **Never hard-code a color, radius, spacing, shadow, or duration** — use a
token so the system stays coherent. `src/styles/colors.scss` holds legacy aliases
(`--primary`, `--surface`, …) mapping onto the new names for older call sites; prefer
the `--color-*` tokens in new code.

- **Spacing** — 8px base scale (`--space-1`…`--space-20`) plus aliases
  (`--space-xs`…`--space-2xl`) and `--gap-*`.
- **Typography** — Satoshi (variable) is the body font; `--font-size-*`,
  `--font-weight-*`, `--line-height-*` ramps are defined.
- **Radius** — generic `--radius-xs`…`--radius-full`, plus the semantic geometry the
  tile dashboard runs on: `--radius-tile` (22px, device tiles + overlay sheet),
  `--radius-chip` (18px, sensor chips / smaller cards), `--radius-control` (12px,
  inputs / buttons / toggle segments). Keep surfaces on this rhythm.
- **Motion** — `--duration-*` (150–500ms) and `--ease-*`. Default transition for
  state changes is ~200ms `--ease-in-out`. Tile presses use `transform: scale(0.97)`.
- **Z-index** — use the `--z-*` scale, never raw numbers.
- **`--tap-target-min: 44px`** — the WCAG minimum interactive size. Every tappable
  control must meet it (see [Tap targets](#5-tap-targets)).

---

## 2. Color semantics

Dark mode: warm charcoal backgrounds (`--color-background` #1a1a1a), raised surfaces
(`--color-surface` #3a3a3a, `--color-surface-secondary` #303030), warm-cream text
(`--color-text-primary` #e8e4da).

**Three distinct accent meanings — keep them separate:**

| Meaning | Token | Where |
|---|---|---|
| **A light is on** (illumination) | `--gradient-active-warm` (amber) + `--glow-active-warm` | `.cat-light.on`, `.cat-dimmable-light.on` |
| **Another device is active** (e.g. blinds open) | `--gradient-active-cool` (teal) + `--glow-active-cool` | `.cat-blinds.on` |
| **Interactive / brand** | `--color-primary` (sage) | nav-active, buttons, focus rings, sliders |

The warm/teal/sage split is deliberate: a device-state fill must never read the same
as an interactive control. Amber and teal are reserved for device state; sage is the
brand/interaction color. **Do not paint buttons teal or device states sage.**

State/status colors use the semantic set: `--color-success` (on / detected /
enabled), `--color-error` (off / danger / remove), `--color-warning`,
`--color-info`. Device/automation state aliases (`--color-device-on`,
`--color-automation-enabled`, …) map onto these.

**Text on filled accent surfaces** uses `--color-on-fill` (near-black) and its muted
variants — verified ≥6:1 on both the warm and teal fills.

### Contrast (WCAG AA)
Body/status text must clear **4.5:1** on its background. The gotcha: text that
passes on the page background can fail on a *raised* surface. `--color-text-tertiary`
is tuned (#b0a89c) to clear 4.5:1 on `--color-surface` and `--color-surface-secondary`
— if you darken it, re-check on-surface contrast. `--color-text-secondary` (≈5.1:1
on surface) is the safe choice for on-surface helper/status copy.

---

## 3. Elevation

Two tiers, applied consistently:

- **Resting surfaces** (device tiles, sensor chips, automation/assistant cards) are
  **flat: `background: --color-surface` + `1px solid --color-border`, no shadow.**
- **Floating layers** (detail overlay, toasts) carry a real shadow:
  `--shadow-modal` for the overlay sheet, `--shadow-lg`/`--shadow-md` for transient
  popups.

The warm/teal **glow** on a lit tile is a *state accent*, not elevation — don't add a
drop shadow to resting tiles to "match" it.

---

## 4. Core patterns

### Device tile (`tiles.scss`, `views/home/devices/`)
The whole tile is the switch for single-actuator devices. Tiles are **channel-driven**:
`decorateDevice()` projects each device into channels, each tagged with a `control`
(`chip` / `slider` / `stepper` / `readout` / `none`), and the template renders
generically — no per-category layout. Lit tiles get the warm/teal fill + glow + the
on-fill text treatment. `manual` lock shows as a dashed border. Cooler and camera
tiles are `wide` (span 2 columns).

### Sensor chip (`tiles.scss`, `views/home/sensors/`)
Horizontally-scrolling environment band (`#sensors.env-band`). A right-edge mask
hints there's more off-screen. Boolean sensors show a state dot (`.on` → success +
glow); temp/humidity show two metrics.

### Detail overlay (`components.scss` `#overlay-modal`, `overlay-modal.ts`)
A floating sheet that animates open from the tapped element's rect to a near-full
viewport rect, with `maxHeight` + internal `overflow: scroll` (never let content
overflow the sheet). Header = round icon + title. Form rows are `.form-group`
(label + control). Sub-settings sit on a recessed `.device-setting` surface.

### Buttons
Primary = filled `--color-primary`. A companion/secondary action is **outlined**
(transparent bg, `--color-primary-light` text, border) — never two filled primaries
side by side. All buttons honor `--tap-target-min` and use `scale(0.97)` on press.

### Automations list (`views/automations/`)
One card per target device (round device icon + name), with each rule as a recessed
row carrying a **live enabled dot + left accent** (success when enabled, muted gray
+ dimmed when disabled). Rule sentences are generated in `automations-list.service.ts`.

---

## 5. Tap targets

Every interactive control must have a ≥44px (`--tap-target-min`) hit area. Where the
*visual* element is intentionally smaller (the tile `⋯`, the cooler `±` steppers,
the cooler chips), expand the **hit area** with an invisible `::before { position:
absolute; inset: -Npx }` rather than enlarging the glyph — this avoids layout shift.

---

## 6. SCSS architecture & specificity caveats

`src/styles/style.scss` is the single entry; **import order matters**. Files load:
variables → colors (legacy aliases) → animations → buttons → cards → forms →
responsive → inputs → platform-styles → **tiles → components** (last). Later files
win on equal specificity, so the modern tile/component rules intentionally load last
to beat legacy layout.

Two recurring traps:

- **`buttons.scss` has a high-specificity global `button:not(...)` reset** that paints
  every button with the primary color and `width: 100%`. To render a button
  differently (e.g. the cooler chips, which must be content-width and state-colored),
  scope your rule under a container **id** (`#devices .chip`) so the id specificity
  beats the global reset.
- **Platform mixins** (`platform-styles/`) lay out `#devices`/`#sensors` with 3-id
  selectors. The tile layout re-asserts itself with matching-specificity rules under
  `#main-content #tab-content …` in the `>=640px` media query — match that specificity
  if you override.

When in doubt, scope under the owning container id rather than escalating with
`!important`.

---

## 7. bindrjs reactivity gotchas

The dashboard renders via `bindrjs` (external npm dep; templates are `.html?raw`
strings with `{{ }}`/`${ }` interpolation and `:`-prefixed directives). Watch for:

- **Loop variables substitute only when followed by `.` or `)`.** When passing a
  loop item to a handler, pass primitive property accesses (`channel.deviceId`,
  `channel.key`) — not the bare loop var followed by a comma — or the substitution
  silently breaks. See the channel-control handlers in `devices.html`/`devices.ts`.
- **Attribute binding can't reliably drive `:selected`** (it emits `selected=""` even
  for false). Order `<option>`s so the intended value is first and let the browser
  auto-select it (see `zones.service.ts` `zoneOptions`).
- **Reassign to re-render gated branches.** A child that gates rendering must be
  *reassigned* (`obj.current = {…}`), not mutated in place, for the dependent template
  region to re-render. Leaf inputs that gate nothing can mutate in place.

---

## 8. Component file convention

Each UI piece is three files: `<name>.ts` (class + logic + `Bind`/`Component`),
`<name>.html` (imported `?raw`), `<name>.model.ts` (state + WS event types). Views
live under `src/views/`, shared chrome under `src/components/`.

---

## Validating changes

There is no design tool in the loop — validate visually. The dashboard fetches all
state from the hub; for isolated UI work, run the Vite dev server and drive it headless
with Playwright, stubbing the API routes (`get-devices`, `get-sensors`,
`get-effects-dynamic`, `get-zones`) with representative fixtures. Screenshot Home
(mobile + desktop), Automations, Assistant, and an open detail overlay, and check:
visual hierarchy, the warm/teal/sage separation, on-surface text contrast, tap-target
sizes, and transitions.
