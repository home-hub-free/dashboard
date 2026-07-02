# Home Hub UI Library

The component catalog for the dashboard. **Read this before building any new
screen, tab, or component** — everything you need already exists as a documented
primitive. `DESIGN.md` holds the design *principles* (color semantics, elevation,
bindrjs gotchas); this file holds the *parts list* and the recipes.

**Live gallery:** `npm run dev` → <http://localhost:8081/ui-kit.html> renders every
primitive below from the real stylesheet.

---

## 0. Architecture — where styles live

```
src/styles/
  style.scss          ← entry manifest (import order documented inside)
  ui/                 ← THE LIBRARY — generic, reusable. Build screens from these.
    _tokens.scss        design tokens + breakpoint mixins
    base.scss           body, ambient bg, shared keyframes, a11y guards
    buttons.scss        neutral <button> base + .btn-* variants, .toggle-button, .switch
    forms.scss          labels, inputs, selects, sliders, .form-group
    layout.scss         app shell, .page-head, .section-title, .page-col, .empty-state
    nav.scss            bottom bar (phone) / brand rail (desktop)
    panels.scss         .panel, .panel-row, .pill, .icon-bubble, .state-dot
    tiles.scss          device tile + channel controls + sensor chip
    overlay.scss        detail-overlay sheet + its form patterns
    toast.scss          popup messages
  views/              ← screen-specific composition (one file per screen)
    home.scss  automations.scss  assistant.scss  settings.scss  login.scss
```

**The rule:** if a style could serve two screens it goes in `ui/`; if it only makes
sense on one screen it goes in that view's file. Never add a new top-level SCSS
file without adding it to the `style.scss` manifest.

**Scoping over specificity wars.** The global `<button>`/`<input>` bases are
neutral, so you rarely need to out-specific anything. View-specific rules are
scoped under the view's container id (`#assistant .chat-row`, not `.chat-row`).
Some long selectors (`#main-content #tab-content …`) remain to out-rank legacy
shell rules — match that scoping if you override them, and never reach for
`!important`.

Legacy alias classes kept as co-selectors (old markup, same styles):
`.add-range-btn` = `.btn-primary` · `.remove-btn` = `.btn-quiet` ·
`.assistant-section` = `.panel` · `.household-row` = `.panel-row` ·
`.assistant-view` = `.page-col`. **Use the new names in new markup.**

---

## 1. Tokens (`ui/_tokens.scss`)

Never hard-code a color, spacing, radius, shadow, duration, or z-index — use the
custom property.

| Group | Tokens | Notes |
|---|---|---|
| Brand | `--color-primary(-light/-dark/…)` | iris violet — interactive only |
| Status | `--color-success/error/warning/info` (+`-light/-dark`, `-rgba-10/40`) | on/off/caution/neutral |
| Surfaces | `--color-background`, `--color-surface`, `--color-surface-secondary`, `--color-surface-tertiary`, `--color-border(-light)` | page → card → recessed control → recessed row |
| Text | `--color-text-primary/secondary/tertiary/disabled/inverse` | tertiary is AA-tuned for raised surfaces |
| Device state | `--gradient-active-warm` + `--glow-active-warm`, `--gradient-active-cool` + `--glow-active-cool`, `--color-on-fill(-muted/-faint)` | see §2 |
| Geometry | `--radius-tile` 22px · `--radius-chip` 18px · `--radius-control` 12px · `--tap-target-min` 44px | keep surfaces on this rhythm |
| Spacing | `--space-1…20` (8px scale), `--gap-*` | |
| Type | `--font-size-xs…4xl`, `--font-weight-*`, `--letter-spacing-*` | body font is Satoshi |
| Motion | `--duration-fast/normal/slow`, `--ease-in/out/in-out/bounce` | default state change ≈ 200ms in-out |
| Shadow | `--shadow-sm…2xl`, `--shadow-modal`, `--shadow-lift` | lift = resting-card depth; modal = floating layers |
| Z | `--z-dropdown…notification` | never raw numbers |

SCSS breakpoint mixins (media queries can't read custom properties):
`@include mobile-only` (<640) · `desktop-up` (≥640) · `wide-up` (≥1000) ·
`wall-up` (≥1400). Import via `@use`-style `@import "../ui/tokens";` in any file
that needs them.

## 2. Color semantics — the three accents

| Meaning | Paint | Where |
|---|---|---|
| **A light is on** | `--gradient-active-warm` + `--glow-active-warm` (GOLD) | `.device-tile.cat-light.on`, `.cat-dimmable-light.on` |
| **Another device active** | `--gradient-active-cool` + `--glow-active-cool` (CYAN) | `.device-tile.cat-blinds.on` |
| **Interactive / brand** | `--color-primary` (IRIS) | buttons, nav-active, focus, sliders, "you" accents |

Never paint a button gold/cyan or a device state iris. Text on any filled accent
uses `--color-on-fill` (+`-muted/-faint`). Green (`--color-success`) means
*enabled/detected/live* (dots, switches), red (`--color-error`) means
*off/destructive*.

## 3. Elevation

- **Resting surfaces** (tiles, panels, chips, cards): `--color-surface` +
  `1px solid --color-border` + `--shadow-lift`. No real drop shadow.
- **Floating layers** (overlay sheet, lightbox, toasts): `--shadow-modal` /
  `--shadow-lg`.
- The warm/cool **glow** on a lit tile is a state accent, not elevation.

---

## 4. Buttons (`ui/buttons.scss`)

A bare `<button>` is **neutral** (transparent, inherits color, 40px min-height,
48px on phones, iris focus ring). Every visible button picks a variant:

```html
<button class="btn-primary"><i class="iconoir-plus"></i> New Automation</button>
<button class="btn-outline">Companion action</button>
<button class="btn-danger">Delete</button>
<button class="btn-quiet"><i class="iconoir-trash"></i> Remove</button>
<button class="btn-icon btn-primary"><i class="iconoir-send"></i></button>
```

- `.btn-primary` — THE filled call-to-action. **One per group**; full-width by
  default (touch-first). Add `.btn-inline` to size to content.
- `.btn-outline` — the companion/secondary action. Never render two filled
  primaries side by side.
- `.btn-danger` — filled destructive *confirmation* (e.g. "Delete this rule?").
- `.btn-quiet` — text+icon destructive/dismiss (sign out, trash, forget).
- `.btn-icon` — square 44px icon-only button; combine with a color variant.
- **Busy convention:** bindrjs can't bind `:disabled` (§10) — add/remove a
  `.busy` class instead (`opacity .6; pointer-events none`) and guard in the
  handler.

Segmented choice (2–4 exclusive options):

```html
<div class="toggle-group">
  <button class="toggle-button active">Auto</button>
  <button class="toggle-button">Manual</button>
</div>
```

On/off switch (success = enabled):

```html
<button class="switch on" aria-label="Toggle rule"><span class="knob"></span></button>
```

## 5. Forms (`ui/forms.scss`)

```html
<div class="form-group">
  <label for="x_name">Name</label>
  <input id="x_name" type="text" />
</div>
```

- `.form-group` = label over control; `.form-group-inline` = one wrapping row.
- Text inputs, `<select>`, `<input type=range>`, checkbox/radio are styled at the
  element level — no class needed.
- Inputs stay ≥16px font on phones (iOS zoom) and cap at 500px wide on desktop
  (`.full-width` opts out).
- `.range-value` — bold numeric readout beside a slider.

## 6. Page scaffolding (`ui/layout.scss`)

Every screen mounts into the shell (`#main-content > #header + #tabs +
#tab-content`) and opens the same way:

```html
<div class="page-col my-view">
  <header class="page-head">
    <div class="ph-kicker">Rules</div>
    <h1 class="ph-title">What the house <em>does on its own.</em></h1>
    <p class="ph-lede">One-line plain-words description.</p>
  </header>
  <section class="panel"> … </section>
</div>
```

- `.page-col` — the single scrolling content column (max-width 1080 in-app).
- `.page-head` — kicker + display title (`em` takes the brand accent) + lede.
  On phones, views that need every vertical px may hide it (`#assistant` does).
- `.section-title` — uppercase micro-label heading a group (inside panels too).
- `.empty-state` — icon + line for "nothing here yet".

## 7. Panels, rows, pills (`ui/panels.scss`)

```html
<section class="panel">
  <p class="section-title">Household members</p>
  <p class="section-hint">Optional helper copy.</p>
  <div class="panel-row">
    <span class="icon-bubble sm"><i class="iconoir-user"></i></span>
    <span style="flex:1">Row content</span>
    <span class="state-dot on"></span>
    <button class="btn-quiet btn-inline"><i class="iconoir-trash"></i></button>
  </div>
</section>
```

- `.panel` — the resting content card (auto entrance animation inside
  `#tab-content`).
- `.panel-row` — recessed row on `--color-surface-tertiary`.
- `.pill` (+ `.pill-success` / `.pill-brand` / `.pill-outline`) — inline metadata
  chip (room name, count, "read-only", "established").
- `.icon-bubble` (+ `.sm/.lg/.brand`) — the round leading icon.
- `.state-dot` (+ `.on`) — live-state dot; pair its meaning with green=enabled.

## 8. Device tiles & sensor chips (`ui/tiles.scss`)

The Home wall. Tiles are **channel-driven**: `decorateDevice()` projects a device
into channels tagged `chip | slider | stepper | readout | none`, and the template
renders one control per channel — no per-category layout. Conventions:

- Root: `.device-tile cat-<category>` (+ `.on`, `.manual`, `.wide`).
- Anatomy: `.tile-inner > .tile-top (.tile-icon + .tile-edit) + .tile-body
  (.tile-name + .tile-meta) + .tile-controls`.
- `.tile-lock` — the "Manual" badge; `.manual` also dashes the border.
- Channel controls: `.chip` (boolean pill), `.tile-slider`, `.stepper` with
  `.step` buttons, `.readout` (`.readout-val.reached` turns success).
- Camera tiles are full-bleed: `.cam-wrap > img + .cam-who + .cam-health +
  .cam-label`.
- `.sensor-chip` — read-only reading: `.chip-head` + `.chip-reading` (state
  `.dot`, or `.th` with two `.metric`s).

Home layout (zone sections, bento grid, two-pane ≥1000px, env rail) lives in
`views/home.scss` — tiles themselves don't know about the grid.

## 9. Detail overlay (`ui/overlay.scss`)

`overlayModal.open(templateHtml, sourceRect)` animates the sheet from the tapped
element. Content pattern:

```html
<div class="edit-container">
  <div class="overlay-header">
    <span class="oh-icon"><i class="iconoir-light-bulb-on"></i></span>
    <span class="oh-title">${name}</span>
  </div>
  <div class="form-group"> <label>Name</label> <input type="text" /> </div>
  <div class="device-setting">          <!-- recessed sub-group -->
    <p class="section-title">Controls</p> …
  </div>
  <details class="overlay-advanced">    <!-- installer/power-user controls -->
    <summary><i class="iconoir-settings"></i><span>Advanced</span>
      <i class="iconoir-nav-arrow-down adv-chevron"></i></summary>
    <div class="device-setting"> … </div>
  </details>
</div>
```

Also in the overlay vocabulary: `.toggle-group`/`.toggle-button` rows,
`.status-group > .status-item > .status-value` readouts, the 24-hour
`.time-bar.day-bar` + `.time-range` + `.hour-ticks.day-ticks` schedule,
`.operational-range` rows, the `.zone-manage > .zone-add-row + .zone-remove`
zone editor, and the `.calibrate-setting` two-step flow. Keep content inside the
sheet (`maxHeight` + internal scroll) — never let it overflow.

## 10. Toasts (`ui/toast.scss`)

Use `PopupMessage` (`popup-message.ts`) — don't hand-roll; markup renders into
`#popup-message-container .toaster-container` with `from-top|from-bottom`.

## 11. Navigation (`ui/nav.scss`)

One component, two shapes: fixed **bottom bar** on phones, **brand rail** on
desktop (≥640px, 248px wide — content offsets by `$nav-rail-width`). To add a
destination: add the item in `nav-bar.constants.ts` and a view mount in
`menu-content.ts`; the nav styles need no changes. `.nav-refresh` is the
connection-status affordance, not a tab.

---

## 12. Responsive & mobile rules

Mobile-first; base styles are the phone layout. Breakpoints: **640px** (desktop
shell + rail), **1000px** (Home two-pane), **1400px** (wall density).

Non-negotiables on phones:

1. **Clear the bottom nav** — it's fixed and ~100px tall. Scrolling views pad
   their bottom (`.home-dash` uses 120px); full-height views size with
   `calc(100dvh - …)` (keep the `100vh` fallback line before it).
2. **Safe areas** — bottom-anchored bars add
   `env(safe-area-inset-bottom)` (see `.chat-composer`, `#nav-bar`); the header
   pads `env(safe-area-inset-top)`.
3. **≥16px input font** (iOS zoom) — already global; don't undo it.
4. **Tap targets ≥ 44px** (`--tap-target-min`). When the visual must be smaller
   (tile `⋯`, stepper `±`, chips), expand the hit area with an invisible
   `&::before { position:absolute; inset:-Npx }` — no layout shift.
5. **Full-width primaries** — `.btn-primary` is full-width by default; stack
   action pairs vertically under 640px rather than shrinking labels.
6. `dvh` tracks the on-screen keyboard; use it for anything that must stay above
   the composer/keyboard.

## 13. Motion

- Shared keyframes in `ui/base.scss`: `rd-fade` (view entrance), `rd-rise`
  (content region entrance), `spin`, `pulse`.
- Views fade in on tab switch automatically (`#tab-content > div`); panels and
  cards rise in. Put entrance animations on **stable bind roots** so a data tick
  doesn't replay them (see DESIGN.md §7 — reassign-to-re-render).
- Presses use `transform: scale(0.97)`; state changes ~200ms `--ease-in-out`.
- Everything must respect `prefers-reduced-motion` — the global guard in
  `base.scss` covers you unless you use `!important` animations (don't).

## 14. bindrjs gotchas (the ones that bite stylists)

Full list in `DESIGN.md` §7. The three that matter when writing markup:

1. Loop variables substitute only before `.` or `)` — pass primitive property
   accesses to handlers.
2. Attribute binding can't drive `:selected`/`:disabled` (emits the bare attr
   even when false) — order `<option>`s so the right one is first; use a `.busy`
   class instead of `:disabled`.
3. Reassign (don't mutate) objects that gate `:if` regions to re-render them.
   Keep live `<canvas>`/`<video>` outside re-rendered regions (see
   `.enroll-card`).

---

## 15. Recipe: adding a new screen/tab

1. **Mount it**: add the item to `nav-bar.constants.ts` and its view to
   `menu-content.ts` (renders into `<div id="<your-id>">`).
2. **Three files** under `src/views/<name>/`: `<name>.ts` (Bind class),
   `<name>.html` (`?raw` template), `<name>.model.ts` (types). Convention in
   DESIGN.md §8.
3. **Template skeleton**: `.page-col` → `.page-head` → `.panel` sections built
   from §4–§10 primitives. Scope anything custom under your view id.
4. **Styles**: create `src/styles/views/<name>.scss`, add it to the `style.scss`
   manifest. Reach for tokens + ui/ classes first; a new view file should be
   mostly layout.
5. **Promote, don't fork**: if you're about to copy a rule from another view,
   move it to `ui/` (generic name + co-selector for the old name) instead.
6. **Validate**: `npx playwright test` (stubbed backends — no services needed).
   Add your screen to `tests/visual/screens.spec.ts` so it's captured
   mobile + desktop, and eyeball: accent semantics (§2), on-surface contrast,
   tap targets, bottom-nav clearance.

## 16. Do / Don't

- **Do** use tokens for every color/space/radius/shadow/duration.
- **Do** keep one filled primary per action group; companion = `.btn-outline`.
- **Do** scope view styles under the view's container id.
- **Don't** hard-code hex, px radii, or z-index numbers.
- **Don't** paint device-state colors on interactive controls (or vice versa).
- **Don't** add drop shadows to resting tiles/panels ("to match the glow").
- **Don't** use `!important`; fix the scoping instead.
- **Don't** re-declare keyframes per component — they're in `ui/base.scss`.
