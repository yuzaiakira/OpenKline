import { expect, test } from "@playwright/test";

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
