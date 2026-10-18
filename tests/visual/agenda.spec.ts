import { test, expect } from "@playwright/test";
import { seedSession, stubBackend } from "./stub";
import { expectOverlayScrollSane } from "./scroll-checks";

// Agenda view (LOCAL_AGENDA): month grid + day list render from the hub fixture, day selection
// drives the list, and the create overlay posts the hub's body shape. Stubbed backend.
test.describe("agenda", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context, page }) => {
    await seedSession(context, true);
    await stubBackend(page);
  });

  async function openAgenda(page: any, errors: string[]) {
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto("/");
    await page.waitForSelector("#devices .device-tile", { timeout: 30_000 });
    await page.locator(".menu-item", { hasText: "Agenda" }).first().click();
    await page.waitForSelector("#agenda .agenda-row", { timeout: 20_000 });
  }

  test("renders today's items, lamps on the grid, and follows a day tap", async ({ page }) => {
    const errors: string[] = [];
    await openAgenda(page, errors);

    // Today is selected by default and lists both of today's fixture items in time order.
    const rows = page.locator("#agenda .agenda-day .agenda-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Dentista");
    await expect(rows.nth(0).locator(".row-time .t")).toHaveText("9:30");
    await expect(rows.nth(1)).toContainText("Sacar la basura");
    await expect(rows.nth(1)).toContainText("cada martes");
    await expect(rows.nth(0).locator(".pill", { hasText: "David" })).toBeVisible(); // for_person u1 → roster name

    // The grid: today's cell is selected and carries both lamps; 42 cells.
    await expect(page.locator("#agenda .day-cell")).toHaveCount(42);
    const today = page.locator("#agenda .day-cell.selected");
    await expect(today).toHaveCount(1);
    await expect(today.locator(".mark.ev")).toHaveCount(1);
    await expect(today.locator(".mark.rem")).toHaveCount(1);

    // Tomorrow has the daily vitamins + the meeting. Click the cell AFTER today's (the grid is
    // chronological, so today's index + 1 = tomorrow — even across a month edge).
    const cells = page.locator("#agenda .day-cell");
    const n = await cells.count();
    let idx = -1;
    for (let i = 0; i < n; i++) if ((await cells.nth(i).getAttribute("class"))!.includes("selected")) idx = i;
    await cells.nth(idx + 1).click();
    await expect(page.locator("#agenda .agenda-day .section-title")).toHaveText("Tomorrow");
    const tRows = page.locator("#agenda .agenda-day .agenda-row");
    await expect(tRows).toHaveCount(2);
    await expect(tRows.nth(0)).toContainText("Vitaminas");
    await expect(tRows.nth(1)).toContainText("Junta con el equipo");
    await expect(tRows.nth(1)).toContainText("Office");

    // Upcoming digest exists and skips the selected day.
    await expect(page.locator("#agenda .agenda-upcoming")).toBeVisible();
    await expect(page.locator("#agenda .agenda-upcoming .upcoming-day", { hasText: "Tomorrow" })).toHaveCount(0);
    await expect(page.locator("#agenda .agenda-upcoming")).toContainText("Cumple de Ana");

    expect(errors, "no uncaught JS errors").toEqual([]);
  });

  test("month navigation re-fetches the window and Today returns", async ({ page }) => {
    const errors: string[] = [];
    await openAgenda(page, errors);
    const title = page.locator("#agenda .month-title");
    const before = await title.textContent();
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/agenda?from=") && r.method() === "GET"),
      page.locator("#agenda .month-btn[aria-label='Next month']").click(),
    ]);
    expect(req.url()).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
    await expect(title).not.toHaveText(before!);
    await page.locator("#agenda .month-today").click();
    await expect(title).toHaveText(before!);
    await expect(page.locator("#agenda .day-cell.selected.today")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("the create overlay posts the hub body shape for a weekly personal reminder", async ({ page }) => {
    const errors: string[] = [];
    await openAgenda(page, errors);
    await page.locator("#agenda .agenda-actions .btn-outline", { hasText: "New reminder" }).click();
    await page.waitForSelector("#agenda-item");
    await expect(page.locator("#agenda-item .oh-title")).toHaveText("New reminder");
    // Save is gated until there's a message.
    await expect(page.locator("#agenda-item .ag-hint")).toContainText("remind you of");
    await expect(page.locator("#agenda-item .btn-primary")).toHaveClass(/busy/);

    await page.fill("#ag_title", "Regar las plantas");
    await page.fill("#ag_time", "19:30");
    await page.locator("#agenda-item .toggle-button", { hasText: "Weekly" }).click();
    await expect(page.locator("#agenda-item .ag-days")).toBeVisible();
    // Monday + Friday (today's weekday is pre-selected; clear it by toggling if it's one of those).
    const mon = page.locator("#agenda-item .ag-day").nth(0);
    const fri = page.locator("#agenda-item .ag-day").nth(4);
    if (!(await mon.getAttribute("class"))!.includes("active")) await mon.click();
    if (!(await fri.getAttribute("class"))!.includes("active")) await fri.click();
    await page.locator("#agenda-item .toggle-button", { hasText: "Alejandra" }).click();
    await expect(page.locator("#agenda-item .ag-hint")).toHaveCount(0);
    await expect(page.locator("#agenda-item .btn-primary")).not.toHaveClass(/busy/);
    await expectOverlayScrollSane(page);

    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith("/api/agenda") && r.method() === "POST"),
      page.locator("#agenda-item .btn-primary").click(),
    ]);
    const body = req.postDataJSON();
    expect(body.kind).toBe("reminder");
    expect(body.message).toBe("Regar las plantas");
    expect(body.start).toMatch(/^\d{4}-\d{2}-\d{2}T19:30$/);
    expect(body.recurrence).toMatch(/^weekly:/);
    expect(body.recurrence.split(":")[1].split(",").map(Number)).toEqual(expect.arrayContaining([1, 5]));
    expect(body.for_person).toBe("u3");
    expect(body.remind_min).toBe(0);
    expect(req.headers()["authorization"]).toContain("Bearer");
    await expect(page.locator("#agenda-item")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("edit prefills the form and PATCHes; delete confirms inline and DELETEs", async ({ page }) => {
    const errors: string[] = [];
    await openAgenda(page, errors);
    const row = page.locator("#agenda .agenda-day .agenda-row", { hasText: "Dentista" });
    await row.locator(".row-edit").click();
    await page.waitForSelector("#agenda-item");
    await expect(page.locator("#agenda-item .oh-title")).toHaveText("Edit event");
    await expect(page.locator("#ag_title")).toHaveValue("Dentista");
    await expect(page.locator("#ag_time")).toHaveValue("09:30");
    await expect(page.locator("#ag_end")).toHaveValue("10:00");
    await expect(page.locator("#agenda-item .toggle-button.active", { hasText: "David" })).toHaveCount(1);
    await expect(page.locator("#agenda-item .toggle-button.active", { hasText: "15 min" })).toHaveCount(1);
    await page.fill("#ag_title", "Dentista (cambio)");
    const [patch] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/agenda/a1") && r.method() === "PATCH"),
      page.locator("#agenda-item .btn-primary").click(),
    ]);
    expect(patch.postDataJSON().title).toBe("Dentista (cambio)");

    await page.waitForSelector("#agenda .agenda-row");
    const rem = page.locator("#agenda .agenda-day .agenda-row", { hasText: "Sacar la basura" });
    await rem.locator(".row-del").click();
    await expect(rem.locator(".row-confirm-q")).toHaveText("Delete every occurrence?");
    const [del] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/agenda/a2") && r.method() === "DELETE"),
      rem.locator(".row-confirm-yes").click(),
    ]);
    expect(del.method()).toBe("DELETE");
    expect(errors).toEqual([]);
  });

  test("the Agenda is reachable on a phone and clears the bottom nav", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    await openAgenda(page, errors);
    await expect(page.locator("#agenda .day-cell")).toHaveCount(42);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(wide, "no horizontal page scroll on a phone").toBe(false);
    expect(errors).toEqual([]);
  });
});
