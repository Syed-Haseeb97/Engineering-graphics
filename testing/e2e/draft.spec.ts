import { expect, test } from '@playwright/test';

test.describe('2D Precision Drafting Canvas E2E Test', () => {
  test('draws a 3-view first-angle drawing of a cube using only UI, reloads, and confirms restored', async ({
    page,
  }) => {
    // 1. Navigate to 2D drafting canvas
    await page.goto('/draft.html');

    // Verify initial layout
    await expect(page.locator('.logo-title')).toHaveText('Engineering Graphics');
    await expect(page.locator('.badge')).toHaveText('2D Precision Drafting');
    await expect(page.locator('#draft-canvas')).toBeVisible();

    const commandInput = page.locator('#input-command-bar');
    const submitBtn = page.locator('#form-command button[type="submit"]');

    async function enterCommand(text: string): Promise<void> {
      await commandInput.fill(text);
      await submitBtn.click();
    }

    // 2. Draw Front View (Square above XY line: x 20..70, y 10..60)
    await page.locator('#tool-line').click();
    await enterCommand('20,10');
    await enterCommand('70,10');
    await enterCommand('70,60');
    await enterCommand('20,60');
    await enterCommand('20,10');
    await page.keyboard.press('Escape');

    // 3. Draw Projectors (Thin construction lines downwards and rightwards)
    await page.locator('#tool-projector').click();
    await enterCommand('20,10');
    await enterCommand('20,-50'); // vertical projector down to top view
    await enterCommand('70,10');
    await enterCommand('70,-50');
    await page.keyboard.press('Escape');

    // 4. Draw Top View (Square below XY line: x 20..70, y -10..-60)
    await page.locator('#tool-line').click();
    await enterCommand('20,-10');
    await enterCommand('70,-10');
    await enterCommand('70,-60');
    await enterCommand('20,-60');
    await enterCommand('20,-10');
    await page.keyboard.press('Escape');

    // 5. Draw Side View (Square to right of front view: x 90..140, y 10..60)
    await page.locator('#tool-line').click();
    await enterCommand('90,10');
    await enterCommand('140,10');
    await enterCommand('140,60');
    await enterCommand('90,60');
    await enterCommand('90,10');
    await page.keyboard.press('Escape');

    // 6. Place Linear Dimension on Front View
    await page.locator('#tool-dim-linear').click();
    await enterCommand('20,10');
    await enterCommand('70,10');
    await enterCommand('45,25'); // offset position
    await page.keyboard.press('Escape');

    // Verify entity count: 4 (front) + 2 (projectors) + 4 (top) + 4 (side) + 1 (dim) = 15 entities
    const entityCountEl = page.locator('#status-entities');
    await expect(entityCountEl).toHaveText('15 entities');

    // Confirm autosave status
    const autosaveEl = page.locator('#status-autosave');
    await expect(autosaveEl).toContainText(/saved/i);

    // Give IndexedDB transaction a moment to persist
    await page.waitForTimeout(500);

    // 7. Reload page to test persistence
    await page.reload();

    // 8. Confirm drawing entities are restored from IndexedDB
    await expect(page.locator('#draft-canvas')).toBeVisible();
    await expect(entityCountEl).toHaveText('15 entities');
    await expect(autosaveEl).toContainText(/Restored|saved/i);
  });
});
