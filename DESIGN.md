# Dashboard Design System

Source of truth for the Home Hub dashboard UI **principles**. The component
catalog — every reusable class with markup snippets, plus the recipe for adding
a new screen — lives in [`UI-LIBRARY.md`](./UI-LIBRARY.md) (live gallery at
`/ui-kit.html` under `npm run dev`). Read both before redesigning any area, and
validate changes visually (see [Validating changes](#validating-changes)).

The dashboard is a touch-first, dark-mode, wall-mounted home hub. Design priorities,
in order:

1. **Glanceability** — "what's on" must read in under a second from across a room.
2. **One-tap action** — the most common action (toggle a light) is a single tap.
3. **Calm** — warm, muted palette; motion is quick and subtle, never flashy.

---

## 1. Tokens

All design tokens live in `src/styles/ui/_tokens.scss` as CSS custom properties on
`:root`. **Never hard-code a color, radius, spacing, shadow, or duration** — use a
token so the system stays coherent.

- **Spacing** — 8px base scale (`--space-1`…`--space-20`) plus aliases
  (`--space-xs`…`--space-2xl`) and `--gap-*`.
- **Typography — two materials.** **Archivo** (variable, local woff2 in
  `public/Fonts/Tablero/`) is the label/UI face; display text (room names, screen
  titles, tile names) additionally sets `font-stretch: var(--font-stretch-display)`
  (≈122% — the width axis is the voice). **IBM Plex Mono**
  (`--font-family-data`) sets every LIVE VALUE — temps, %, counts, times — with
  `"tnum" 1`; a reading must be visibly different material from its label. No
  letterspaced-uppercase eyebrows anywhere; small uppercase mono is allowed only
  as a *data label* (speaker tags, badges), never as a section header.
- **Radius** — generic `--radius-xs`…`--radius-full`, plus the semantic geometry the
  board runs on: `--radius-tile` (10px, device plates + overlay sheet),
  `--radius-chip` (8px, chips / smaller cards), `--radius-control` (8px,
  inputs / buttons / toggle segments). Plates, not blobs.
- **Motion — mechanical.** `--duration-*` (120–400ms), `--ease-out` default.
  Press = `transform: translateY(1px)` (a switch throw) — never scale, never a
  hover lift. Entrances are a quick 200–260ms rise; reduced-motion is honored.
- **Z-index** — use the `--z-*` scale, never raw numbers.
- **`--tap-target-min: 44px`** — the WCAG minimum interactive size. Every tappable
  control must meet it (see [Tap targets](#5-tap-targets)).

---

## 2. Color semantics

Dark mode, **"Tablero"** — a labeled control board in THIS house: pine and
handmade wood, brick walls, white walls under warm light, plants everywhere.
Ink-black page (`--color-background` #0f0d0b), warm plates (`--color-surface`
#1a1715, `--color-surface-secondary` #141210, `--color-surface-tertiary` #23201c),
bone ink (`--color-text-primary` #ece4d6). Every accent is a **material from the
room, desaturated to stay calm**. The walls are flat — **no ambient gradients,
no glows, no gradient fills anywhere**. State is shown as INDICATOR LAMPS: a flat
color fill and/or a small dot. (The `--gradient-*`/`--glow-*` token names survive
for compat but resolve to flat fills / flat inset rings.)

**Four distinct accent meanings — keep them separate:**

| Meaning | Token | Where |
|---|---|---|
| **A light is on** (illumination) | `--color-active-warm` (**honey** #e6a959 — lamplight on pine) | `.cat-light.on`, `.cat-dimmable-light.on`, room-rail/house-bar lamps |
| **Another device is active** (e.g. blinds open) | `--color-active-cool` (**stone blue** #7d9ab5) | `.cat-blinds.on` |
| **Live / enabled / ok** | `--color-success` (**sage** #74a980 — the plants) | `.switch.on`, boolean chips, motion lamps, WS dot |
| **Interactive / brand** | `--color-primary` (**clay** #c97a5b — the brick) | nav-active lamp bar, buttons, focus rings, sliders |

A device-state fill must never read the same as an interactive control. Honey and
stone blue are reserved for device state; clay is the brand/interaction color.
**Do not paint buttons stone blue or device states clay.** Clay (muted red-orange)
and honey (yellow-orange) sit near each other — keep brand ink on *controls* and
honey on *slabs/lamps* so scale keeps them apart.

State/status colors use the semantic set: `--color-success` (on / detected /
enabled), `--color-error` (off / danger / remove), `--color-warning`,
`--color-info`.

**Text on filled accent surfaces** uses `--color-on-fill` (warm near-black) and its
muted variants — verified ≥5.7:1 on the gold, dusk-blue and success fills. The same
rule covers the clay brand fill via `--color-text-inverse`: **bone text
FAILS on the brand fill** — filled buttons always use the dark ink.

### Contrast (WCAG AA)
Body/status text must clear **4.5:1** on its background. The gotcha: text that
passes on the page background can fail on a *raised* surface. `--color-text-tertiary`
is tuned (#a09788; 6.1:1 on surface, 5.5:1 on the tertiary surface) — if you darken
it, re-check on-surface contrast. `--color-text-secondary` (≈10:1 on surface) is the
safe choice for on-surface helper/status copy.

---

## 3. Elevation

Two tiers, applied consistently:

- **Resting surfaces** (device plates, sensor chips, automation/assistant cards) are
  **flat: `background: --color-surface` + `1px solid --color-border`, no shadow.**
- **Floating layers** (detail overlay, toasts) carry a real shadow:
  `--shadow-modal` for the overlay sheet, `--shadow-lg`/`--shadow-md` for transient
  popups.

A lit tile is a flat lamp fill — never add a glow or drop shadow to signal state.

---

## 4. Core patterns

### Room rail + fused room sections (`views/home.scss`, `views/home/devices/`)
The board's **signature**: a sticky strip of switch-plate room tabs (one per group:
Pinned → rooms in registry order → Cameras), each with a lamp dot that lights amber
when the room has lights on. Tap = expand + scroll to that room — the one-tap
findability path on a wall panel or phone; the text filter hides behind the rail's
search key. Each room's header **fuses its sensors' ambient glance** (temp/humidity
mono readout + motion lamp, from the shared store) and carries a "Lights off" action
while any light in the room is on; zones with only sensors still render as rooms.
The same jump-rail idiom heads Settings (`.settings-rail`).

### Pinned strip (`views/home/devices/pins.service.ts`)
Per-member shortcuts: the device sheet's "Pin to the top of Home" switch stores
device ids in the signed-in user's `prefs.pins` (hub `PATCH /auth/users/:id` —
NB the hub replaces the whole prefs blob; always spread the existing prefs). The
Pinned group renders first on the board, per login — the wall panel's login is
the wall's pin set.

### House bar (`views/home/status/`)
One slim instrument row atop Home: date · "N lights on" lamp readout with a
house-wide **All off** · live weather. No greeting, no clock — a control board
doesn't say good afternoon, it tells you whether the house is settled.

### Load / offline / failure (table stakes)
First load renders **skeleton plates** (calm opacity pulse, no shimmer) until the
initial resync settles (`sync:done` on the bus) — never flash an empty state before
the hub has answered once. While the socket is down, the shell shows the slim
`.hub-offline` banner (ws:status). Device writes stay optimistic with revert +
a toast that names what failed.

### Device tile (`ui/tiles.scss`, `views/home/devices/`)
The whole tile is the switch for single-actuator devices. Tiles are **channel-driven**:
`decorateDevice()` projects each device into channels, each tagged with a `control`
(`chip` / `slider` / `stepper` / `readout` / `none`), and the template renders
generically — no per-category layout. Lit tiles get the gold/dusk-blue fill + glow +
the on-fill text treatment. `manual` lock shows as a dashed border.

**A tile earns its size — three tiers.**
- **Compact** (`.compact` — light, door, blinds, dimmable, audio satellite): a
  one-row plate (icon · name+status · ⋯, `--tile-min-height-compact`) that grows
  an extra row only for a *live* control — a lit dimmable's brightness slider
  (hidden while off), the satellite's mic chip. On phones a compact plate is a
  full-width switch row; ≥640px they tile 2-up. The tier is category-stable so a
  toggle never reshuffles the grid.
- **Wide** (cooler): a full-width band with the glance hierarchy below.
- **Media** (camera, camera-equipped satellite): full-width live view.

**A tile is glanceable, not exhaustive.** The cooler is the reference case: one hero
readout (room temp, with the setpoint as its label), one status line ("Cooling ·
fan + water"), and the fan/water chips — the unit temp and the target stepper are
demoted to the detail overlay (`control: "none"` in `decorateDevice`). The satellite
follows the same rule: the tile keeps only the mic chip (privacy is immediate) and
a "Low battery" note when true; volume / camera flip / eco / battery % live in the
detail sheet's **Controls** section. Follow that hierarchy before adding a fourth
data point to any tile.

**One scan order in every room** (`sortTiles` in `devices.ts`): lights → blinds →
doors → climate → speakers → cameras/media last — findability comes from the
pattern repeating room after room (the Pinned strip keeps the member's own order).

### Camera tile & lightbox (`ui/tiles.scss`, `ui/overlay.scss`)
Tap = **fullscreen live lightbox** (`openCameraLive` → `.cam-live`): the stream
edge-to-edge on black, name/health up top, "who is here" + the PTZ D-pad and
saved-view chips along the bottom, safe-area padded. Config is behind the **⋯ on
the cam label** (hub edit sheet, or the tune overlay for vision-only cams) —
watching is the tile's primary action, matching every other tile where tap = act,
⋯ = configure.

### Sensor chip (`ui/tiles.scss`, `views/home/sensors/`)
Horizontally-scrolling environment band (`#sensors.env-band`). A right-edge mask
hints there's more off-screen. Boolean sensors show a state dot (`.on` → success +
glow); temp/humidity show two metrics.

### Detail overlay (`ui/overlay.scss`, `overlay-modal.ts`)
A floating sheet that animates open from the tapped element's rect to a near-full
viewport rect, with `maxHeight` + internal `overflow: scroll` (never let content
overflow the sheet). Header = round icon + title. Form rows are `.form-group`
(label + control). Sub-settings sit on a recessed `.device-setting` surface.

### Buttons
Primary = filled `--color-primary`. A companion/secondary action is **outlined**
(transparent bg, `--color-primary-light` text, border) — never two filled primaries
side by side. Full-width on phones only; ≥640px they size to content
(`align-self: flex-start` inside column-flex panels) — a button is a control, not
a banner. All buttons honor `--tap-target-min`; press = `translateY(1px)`.

### Assistant chat panel (`views/assistant/`, `styles/views/assistant.scss`)
Two panes: conversation history (left) + the open transcript with the composer (right); narrow
screens show one pane at a time (`.chat-panel.pane-chat`) with a back button, and hide the
editorial page-head so the composer stays above the fixed bottom nav. History is per-member
(hub `/assistant/chats` scopes to the login) and includes satellite threads the member started —
voice rows carry a **room chip** (`.chat-zone`), the composer's live thread a success dot. Bubbles:
user = recessed + iris right edge; Aura = background tier, left-aligned. Old chats open read-only
(`ended` badge + resume hint). The stale hero `.voice-talk` styles were removed from the old
redesign layer — `#assistant` owns the compact composer now. Gotcha: iconoir's `send-diagonal`
mask-icon is broken upstream (zero-size clipPath rect → invisible); use `iconoir-send`.

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

`src/styles/style.scss` is the single entry manifest. Two layers:

- **`src/styles/ui/`** — the UI library (tokens → base → buttons/forms →
  layout/nav → panels/tiles/overlay/toast). Generic and reusable; new screens
  are built from these. Catalog: [`UI-LIBRARY.md`](./UI-LIBRARY.md).
- **`src/styles/views/`** — one file per screen (home, automations, assistant,
  settings, login) holding only that screen's composition and one-offs.

If a rule could serve two screens it belongs in `ui/`; single-screen rules go in
the view file. Never add a top-level SCSS file without registering it in the
`style.scss` manifest.

The old global button reset (auto-primary paint + mobile `width:100%`) is gone —
a bare `<button>` is now **neutral** and every visible button opts into a
`.btn-*` variant. Two caveats survive:

- The **app shell** (`ui/layout.scss`) still lays out `#tab-content` with legacy
  id-scoped rules; the modern surfaces out-rank them with
  `#main-content #tab-content …` selectors — match that scoping if you override
  (e.g. the Home grid rules in `views/home.scss`).
- Scope view-specific styles under the view's container id (`#assistant .chat-row`)
  rather than escalating with `!important`.

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
visual hierarchy, the honey/stone/sage/clay separation, on-surface text contrast, tap-target
sizes, and transitions.
