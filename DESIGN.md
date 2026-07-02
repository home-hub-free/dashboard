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

Dark mode, "Nocturne Console": cool blue-black backgrounds (`--color-background`
#0b0e16), raised surfaces (`--color-surface` #171d2c, `--color-surface-secondary`
#121724, `--color-surface-tertiary` #1f2638), cool near-white text
(`--color-text-primary` #eef1f8).

**Three distinct accent meanings — keep them separate:**

| Meaning | Token | Where |
|---|---|---|
| **A light is on** (illumination) | `--gradient-active-warm` (gold) + `--glow-active-warm` | `.cat-light.on`, `.cat-dimmable-light.on` |
| **Another device is active** (e.g. blinds open) | `--gradient-active-cool` (electric cyan) + `--glow-active-cool` | `.cat-blinds.on` |
| **Interactive / brand** | `--color-primary` (iris violet) | nav-active, buttons, focus rings, sliders |

The gold/cyan/iris split is deliberate: a device-state fill must never read the same
as an interactive control. Gold and cyan are reserved for device state; iris is the
brand/interaction color. **Do not paint buttons cyan or device states iris.**

State/status colors use the semantic set: `--color-success` (on / detected /
enabled), `--color-error` (off / danger / remove), `--color-warning`,
`--color-info`.

**Text on filled accent surfaces** uses `--color-on-fill` (near-black) and its muted
variants — verified ≥6:1 on both the gold and cyan fills.

### Contrast (WCAG AA)
Body/status text must clear **4.5:1** on its background. The gotcha: text that
passes on the page background can fail on a *raised* surface. `--color-text-tertiary`
is tuned (#8c96af) to clear 4.5:1 on `--color-surface` and `--color-surface-secondary`
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

The gold/cyan **glow** on a lit tile is a *state accent*, not elevation — don't add a
drop shadow to resting tiles to "match" it.

---

## 4. Core patterns

### Device tile (`ui/tiles.scss`, `views/home/devices/`)
The whole tile is the switch for single-actuator devices. Tiles are **channel-driven**:
`decorateDevice()` projects each device into channels, each tagged with a `control`
(`chip` / `slider` / `stepper` / `readout` / `none`), and the template renders
generically — no per-category layout. Lit tiles get the gold/cyan fill + glow + the
on-fill text treatment. `manual` lock shows as a dashed border. Cooler and camera
tiles are `wide` (span 2 columns).

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
side by side. All buttons honor `--tap-target-min` and use `scale(0.97)` on press.

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
visual hierarchy, the gold/cyan/iris separation, on-surface text contrast, tap-target
sizes, and transitions.
