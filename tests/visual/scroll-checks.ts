import { Page, expect } from "@playwright/test";

// Standing scroll-sanity assertions for the open overlay-modal sheet
// (`.overlay-modal-content .content` — components/overlay-modal/overlay-modal.ts).
// EFFECT_CREATION_FOLLOWUPS.md Phase 1 / 1.1: "most of the times we update modal
// UI, odd scroll behaviors appear" — this makes that a standing check any spec
// can call after opening an overlay, rather than a per-incident regression spec.
// The viewport-pinning technique (assert the container's bounding box sits at
// the origin regardless of how far the PAGE has scrolled) is the same one
// overlay-scroll.spec.ts uses for the historical rd-rise/fixed-position
// regression — reused here rather than re-derived, per that spec's own header
// comment. This helper takes no stubs of its own (unlike overlay-scroll.spec.ts,
// which stubs vision/face-review) — it only reads DOM geometry, so it drops
// into any spec that already has an overlay open.

/**
 * Assert the currently-open overlay-modal sheet is scroll-sane:
 *  (a) `.content` never overflows HORIZONTALLY;
 *  (b) IF `.content` overflows vertically, the sheet itself is what scrolls
 *      (a programmatic `scrollTop` write actually sticks) and its LAST
 *      interactive control can be scrolled into view and is still actionable
 *      there;
 *  (c) the overlay container stays pinned to the VIEWPORT (not the scrolled
 *      page) — the historical bug this guards: a retained CSS transform on an
 *      ancestor re-based `position: fixed` off that ancestor instead of the
 *      viewport (see overlay-scroll.spec.ts's header comment).
 *
 * Call this with the overlay already open and settled (post any :if-gated
 * content you want covered — e.g. after expanding "Advanced", or after
 * staging arms) so `.content`'s scrollHeight reflects what's actually there.
 */
export async function expectOverlayScrollSane(page: Page): Promise<void> {
  const container = page.locator(".overlay-modal-content");
  await expect(container).toBeVisible();
  const content = container.locator(".content");
  await expect(content).toBeVisible();

  // Wait for the sheet's open animation to settle before measuring geometry.
  // overlay-modal.ts's openOverlay() can leave `.content` at the TAPPED
  // ELEMENT's small start-rect for up to ~300ms (its `opening` class/state)
  // before the deferred finalRect() lands it at the real sheet size — and this
  // harness's prefers-reduced-motion does not always short-circuit that path
  // (a known quirk — see EFFECT_CREATION_REPAIR's Phase-1 handoff note; func.spec.ts's
  // pre-existing overflow check works around the same race with an explicit
  // waitForTimeout(300)). Measuring mid-animation would catch the tiny starting
  // rect and misreport it as a horizontal-overflow bug. Skipped entirely under a
  // true reduced-motion run, where `opening` is never set in the first place.
  await expect(container).not.toHaveClass(/opening/, { timeout: 5000 });

  // (a) horizontal overflow — +1 tolerates sub-pixel rounding, same tolerance
  // func.spec.ts's pre-existing narrow-viewport overflow check uses.
  const { scrollWidth, clientWidth } = await content.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth, "overlay content has no horizontal overflow").toBeLessThanOrEqual(clientWidth + 1);

  // (c) viewport-pinned, not page-pinned. `.overlay-modal-content` is
  // `position: fixed; top:0; left:0; height:100%; width:100%` (overlay.scss) —
  // its bounding box must sit at the viewport's origin and never exceed it,
  // regardless of the underlying page's scroll position.
  const box = (await container.boundingBox())!;
  expect(Math.abs(box.y), "overlay stays pinned to the viewport top").toBeLessThan(2);
  expect(Math.abs(box.x), "overlay stays pinned to the viewport left").toBeLessThan(2);
  const viewport = page.viewportSize();
  if (viewport) {
    expect(box.width, "overlay does not exceed the viewport width").toBeLessThanOrEqual(viewport.width + 1);
    expect(box.height, "overlay does not exceed the viewport height").toBeLessThanOrEqual(viewport.height + 1);
  }

  // (b) vertical overflow — conditional; a short overlay (e.g. a freshly
  // opened, mostly-empty builder) legitimately has none, and there's nothing
  // further to assert in that case.
  const { scrollHeight, clientHeight } = await content.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  if (scrollHeight > clientHeight + 1) {
    // The container itself is the thing that scrolls (not a child, not the
    // page underneath it) — a programmatic scrollTop write must actually
    // stick.
    await content.evaluate((el) => { el.scrollTop = 0; });
    await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const stuck = await content.evaluate((el) => el.scrollTop > 0);
    expect(stuck, "overlay content actually scrolls vertically").toBe(true);

    // The last interactive control must be reachable by scrolling it into
    // view, and still actionable there. `trial: true` runs every
    // actionability check (visible, stable, enabled, receives pointer
    // events) WITHOUT firing the action — this helper must never mutate
    // app state (e.g. tap a real "Save automation" button) out from under
    // whichever spec called it.
    const controls = content.locator("button, input, select, textarea, a[href], [role='slider'], [tabindex]");
    const lastControl = controls.last();
    await lastControl.scrollIntoViewIfNeeded();
    await expect(lastControl).toBeInViewport();
    await lastControl.click({ trial: true });
  }
}
