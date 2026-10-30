import { expect, test } from "@playwright/test";

test("Studio Market Replay Lab exposes causal controls and bounded research panels", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  const lab = page.getByTestId("market-replay-lab");
  await expect(lab).toBeVisible();
  await expect(lab.getByText("Deterministic fixture only", { exact: false })).toBeVisible();
  await expect(lab.getByText(/Source studio-market-replay-fixture@1/)).toBeVisible();
  await expect(lab.getByText(/Time & Sales/)).toBeVisible();
  await expect(lab.getByText("CVD and Footprint", { exact: true })).toBeVisible();
  await expect(lab.getByText("Current depth", { exact: true })).toBeVisible();

  const initialCursor = await lab.getByText(/Cursor/).textContent();
  await lab.getByRole("button", { name: "Next event", exact: true }).click();
  await expect(lab.getByText(/Cursor/)).not.toHaveText(initialCursor ?? "");
  await lab.getByRole("button", { name: "Next completed candle", exact: true }).click();
  await expect(lab.locator("[data-replay-state]")).toHaveAttribute("data-replay-state", /paused|completed/);

  await lab.getByLabel("Replay clock policy").selectOption("receive-time");
  await expect(lab.getByText(/receive-time/)).toBeVisible();
  await lab.getByRole("button", { name: "Exit", exact: true }).click();
  await expect(lab.locator("[data-replay-state]")).toHaveAttribute("data-replay-state", "idle");
  expect(errors).toEqual([]);
});
