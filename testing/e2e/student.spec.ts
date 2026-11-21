import { expect, test } from '@playwright/test';

test.describe('Student UI E2E Flow', () => {
  test('login as fake student, open assignment, draw, check work, submit, and view scorecard with 3D reference model', async ({
    page,
  }) => {
    // Log browser console and handle unexpected dialogs
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('BROWSER ERROR:', msg.text());
      }
    });
    page.on('dialog', async (dialog) => {
      console.warn('BROWSER DIALOG:', dialog.message());
      await dialog.accept();
    });

    // 1. Mock grading API backend endpoints robustly
    await page.route('**/attempts**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes('/check')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            score: 85,
            metrics: {
              recall: 0.85,
              precision: 0.9,
              lineType: 0.95,
              dimensions: 1.0,
            },
            hints: [
              {
                id: 'missing_top_visible',
                ruleId: 'missing_edges',
                view: 'TOP',
                count: 1,
                level1: 'Check the outer boundary in the top view.',
                level2: 'A visible outline or edge is missing in the top view.',
                level3:
                  'All visible boundaries and intersection edges in plan must be drawn with continuous thick lines.',
              },
            ],
            summary: {
              totalExpectedEdges: 12,
              matchedEdges: 10,
              missingEdges: 2,
              extraEdges: 0,
              wrongTypeEdges: 0,
            },
          }),
        });
        return;
      }

      if (url.includes('/submit')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            submissionId: 'sub-98765432-1000-final',
            gradeId: 'grd-55555555-9999-auto',
            score: 88,
            breakdown: {
              recall: 0.88,
              precision: 0.92,
              lineType: 0.9,
            },
            feedback:
              'Excellent technical drawing adhering to first-angle orthographic projection standards and IS line styles.',
            isLate: false,
          }),
        });
        return;
      }

      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            attemptId: 'att-10000000-0000-demo',
            problem: {
              topic: 'PROJECTION_OF_SOLIDS',
              statement:
                'A cone of base 50 mm diameter and axis 60 mm long rests on the HP on a point of its base circumference. Its axis is inclined at 30° to the HP and 35° to the VP. Draw its front and top views.',
              publicParams: {
                baseDia: 50,
                height: 60,
                theta: 30,
                phi: 35,
                distVP: 30,
              },
              viewsRequired: ['FRONT_VIEW', 'TOP_VIEW'],
              attemptNo: 1,
            },
          }),
        });
        return;
      }

      await route.continue();
    });

    // 2. Clear local storage & navigate to student app
    await page.goto('/student.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Verify Login Screen
    await expect(page.locator('.login-title')).toHaveText('Engineering Graphics');
    await expect(page.locator('.login-subtitle')).toContainText('Student CAD');

    // 3. Login using demo student preset (Aarav Patel - Section A)
    const demoStudentBtn = page.locator('#btn-demo-aarav');
    await expect(demoStudentBtn).toBeVisible();
    await demoStudentBtn.click();

    // 4. Verify Assignments Dashboard
    await expect(page.locator('#user-display-name')).toHaveText('Aarav Patel');
    await expect(page.locator('.page-title')).toHaveText('Course Assignments');

    // Open first available assignment
    const startBtn = page.locator('.btn-start-assignment').first();
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // 5. Verify Problem Workspace
    await expect(page.locator('#problem-statement')).toContainText('A cone of base 50 mm diameter');
    await expect(page.locator('#status-connection')).toHaveText('Online');
    await expect(page.locator('#student-draft-canvas')).toBeVisible();

    // Initial entity count: 1 (the default XY reference line)
    const entityCountEl = page.locator('#canvas-entity-count');
    await expect(entityCountEl).toHaveText('Entities: 1');

    // 6. Draw lines using the command input bar
    const commandBar = page.locator('#command-input-bar');
    await commandBar.fill('20,10');
    await commandBar.press('Enter');
    await commandBar.fill('70,10');
    await commandBar.press('Enter');
    await page.keyboard.press('Escape');

    // Entities count should now be 2
    await expect(entityCountEl).toHaveText('Entities: 2');

    // 7. Click "Check My Work" to inspect progress
    const checkBtn = page.locator('#btn-check-work');
    await checkBtn.click();

    // Verify Feedback Drawer slides in
    await expect(page.locator('#drawer-panel')).toBeVisible();
    await expect(page.locator('#preview-score-value')).toHaveText('85%');

    // Verify Progressive Level 1 -> Level 2 Hint Reveal
    const hintL1 = page.locator('#hint-l1-0');
    const hintL2 = page.locator('#hint-l2-0');
    await expect(hintL1).toBeVisible();
    await expect(hintL1).toContainText('Check the outer boundary in the top view.');
    await expect(hintL2).toBeHidden();

    // Unlock Level 2
    const unlockBtn = page.locator('#btn-unlock-0');
    await unlockBtn.click();
    await expect(hintL2).toBeVisible();
    await expect(hintL2).toContainText('A visible outline or edge is missing in the top view.');

    // Close Feedback Drawer
    await page.locator('#btn-close-drawer').click();
    await expect(page.locator('#drawer-panel')).toBeHidden();

    // 8. Submit Drawing
    const submitBtn = page.locator('#btn-submit-drawing');
    await submitBtn.click();

    // Verify Submit Confirmation Modal
    await expect(page.locator('.modal-dialog')).toBeVisible();
    await expect(page.locator('#modal-entity-count')).toHaveText('2');

    // Confirm Submission
    const confirmBtn = page.locator('#btn-confirm-submit');
    await confirmBtn.click();

    // 9. Verify Final Scorecard & Result Screen
    await expect(page.locator('#result-final-score')).toHaveText('88');
    await expect(page.locator('#result-feedback-text')).toContainText(
      'Excellent technical drawing adhering to first-angle orthographic projection',
    );

    // Verify 3D Reference Viewer is unlocked AFTER submission
    await expect(page.locator('.badge-unlocked')).toBeVisible();
    await expect(page.locator('#reference-3d-container')).toBeVisible();

    // 10. Return to Assignments
    const backBtn = page.locator('#btn-return-assignments');
    await backBtn.click();
    await expect(page.locator('.page-title')).toHaveText('Course Assignments');
  });
});
