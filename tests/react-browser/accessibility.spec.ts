import { expect, studioChartCanvas, test } from "./studio-test.js";

// Serialize accessibility dialog cases: shared Studio state + focus timing are
// sensitive under default multi-worker contention on the Next.js app.
test.describe.configure({ mode: "serial" });

test("Studio interactive controls expose names, keyboard focus, status, and dialog semantics", async ({ page }) => {
  await page.goto("/");
  const unnamed = await page.evaluate(() => {
    const visible = (element: Element) => {
      const node = element as HTMLElement;
      return node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden";
    };
    const labelFor = (element: Element) => {
      const node = element as HTMLElement;
      const labelledBy = node.getAttribute("aria-labelledby");
      const labelledText = labelledBy === null ? "" : labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      const labelText = node.closest("label")?.textContent ?? "";
      const ariaText = node.getAttribute("aria-label") ?? "";
      return (ariaText || labelledText || labelText || node.textContent || "").replace(/\s+/g, " ").trim();
    };
    return Array.from(document.querySelectorAll("button,input,select,textarea,[role=button]"))
      .filter(visible)
      .filter((element) => (element as HTMLInputElement).type !== "hidden")
      .filter((element) => labelFor(element).length === 0)
      .map((element) => element.outerHTML.slice(0, 200));
  });
  expect(unnamed).toEqual([]);

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await expect(page.locator('[aria-live="polite"]').first()).toBeAttached();

  await page.getByRole("button", { name: "Rename watchlist", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rename watchlist" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Dialog value")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
});

test("Canvas charts expose a text summary and dialogs restore focus on Escape", async ({ page }) => {
  await page.goto("/");
  const canvas = studioChartCanvas(page).first();
  await expect(canvas).toHaveRole("img");
  await expect(canvas).toHaveAttribute("tabindex", "0");
  await expect(canvas).toHaveAttribute("aria-label", /Financial price chart; .*visible bars/);
  await canvas.focus();
  await expect(canvas).toBeFocused();

  const trigger = page.getByRole("button", { name: "Rename watchlist", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Rename watchlist" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-describedby", "studio-dialog-message");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Studio dialogs keep keyboard focus inside the modal", async ({ page }) => {
  await page.goto("/");
  // Wait until a watchlist is selected so the Rename control is actually mounted.
  const trigger = page.getByRole("button", { name: "Rename watchlist", exact: true });
  await expect(trigger).toBeVisible();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Rename watchlist" });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-studio-dialog-open="true"][data-studio-dialog-kind="prompt"]')).toBeVisible();
  const value = dialog.getByLabel("Dialog value");
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const apply = dialog.getByRole("button", { name: "Apply", exact: true });

  await expect(value).toBeVisible();
  await expect(value).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(apply).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(value).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(apply).toBeFocused();
});

test("Reduced-motion mode has no decorative Studio animation path", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByLabel("Search watchlist")).toBeVisible();
  const motion = await page.evaluate(() => ({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    animations: document.getAnimations().length,
    transitions: Array.from(document.querySelectorAll<HTMLElement>("*"))
      .some((element) => getComputedStyle(element).transitionDuration !== "0s"),
  }));
  expect(motion.reducedMotion).toBe(true);
  expect(motion.animations).toBe(0);
  expect(motion.transitions).toBe(false);
});
