import { expect, test } from '@playwright/test';

test.describe('Phase 1 Teaching Viewer Smoke Test', () => {
  test('loads page, builds cone, steps through 3 stages, and exports SVG', async ({ page }) => {
    // 1. Navigate to viewer app
    await page.goto('/');

    // Verify header and initial layout
    await expect(page.locator('.logo-title')).toHaveText('Engineering Graphics');
    const banner = page.locator('#validation-banner');
    await expect(banner).toBeVisible();

    // 2. Select and configure Cone
    const solidSelect = page.locator('#solid-type');
    await solidSelect.selectOption('CONE');

    await page.locator('#input-base-size').fill('25');
    await page.locator('#input-height').fill('70');
    await page.locator('#input-theta').fill('45');
    await page.locator('#input-phi').fill('30');
    await page.locator('#input-vp').fill('25');

    // Submit form to trigger computation
    await page.locator('button[type="submit"]').click();

    // Wait for solving to complete (loading spinner hides)
    await expect(page.locator('#loading-indicator')).toBeHidden({ timeout: 15000 });

    // Verify first-quadrant validation banner is valid
    await expect(banner).toHaveClass(/valid/);
    await expect(banner).toContainText(/Valid first quadrant/i);

    // 3. Verify Stage 1 is loaded
    const stageIndicator = page.locator('#stage-indicator');
    await expect(stageIndicator).toContainText('Stage 1 of 3');

    // Verify 2D projection sheet rendered lines
    const sheetSvg = page.locator('#sheet-container svg');
    await expect(sheetSvg).toBeVisible({ timeout: 20000 });
    await expect(sheetSvg.locator('line')).not.toHaveCount(0);

    // Verify 3D inspector canvas is rendered
    const inspectorCanvas = page.locator('#inspector-container canvas');
    await expect(inspectorCanvas).toBeVisible();

    // 4. Step through stages
    const nextBtn = page.locator('#btn-next-stage');
    const prevBtn = page.locator('#btn-prev-stage');

    // Step to Stage 2
    await nextBtn.click();
    await expect(stageIndicator).toContainText('Stage 2 of 3');
    await expect(prevBtn).toBeEnabled();

    // Step to Stage 3
    await nextBtn.click();
    await expect(stageIndicator).toContainText('Stage 3 of 3');
    await expect(nextBtn).toBeDisabled();

    // 5. Export SVG
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export-svg').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('projection_stage_3.svg');

    // Read and verify SVG content
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    if (stream) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const svgContent = Buffer.concat(chunks).toString('utf-8');
      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('first-angle-symbol');
      expect(svgContent).toContain('FRONT VIEW');
      expect(svgContent).toContain('TOP VIEW');
    }
  });
});
