// Shared Playwright helpers for settings drawer — strict selectors, no false-green gates.
import { expect, type Page } from "@playwright/test";

export const openSettings = async (page: Page): Promise<void> => {
  await page.getByLabel("Open settings").click();
  await expect(page.getByText("LM Studio URL", { exact: true })).toBeVisible({ timeout: 10_000 });
};

export const closeSettings = async (page: Page): Promise<void> => {
  await page.getByLabel("Close settings").click();
  await expect(page.getByText("LM Studio URL", { exact: true })).not.toBeVisible({ timeout: 5_000 });
};

export const saveSettings = async (page: Page): Promise<void> => {
  await page.getByText("Сохранить", { exact: true }).click();
  await expect(page.getByText("LM Studio URL", { exact: true })).not.toBeVisible({ timeout: 5_000 });
};

export const lmStudioUrlInput = (page: Page) => page.locator("input").first();
