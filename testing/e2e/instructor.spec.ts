import { expect, test } from '@playwright/test';

test.describe('Instructor UI: Author -> Assign -> Review E2E Flow', () => {
  test('authors problem template with live preview, manages cohort dashboard, inspects drawing overlay, and performs grade override with audit log', async ({
    page,
  }) => {
    // Intercept backend API routes
    await page.route('**/templates', async (route) => {
      if (route.request().method() === 'POST') {
        const body = (await route.request().postDataJSON()) as { id?: string };
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            templateId: body.id ?? 'cylinder_demo_authoring',
            success: true,
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/grades/*/override', async (route) => {
      const body = (await route.request().postDataJSON()) as { score: number; feedback?: string };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'grd-override-demo-001',
          score: body.score,
          feedback: body.feedback,
          reviewed_by: '00000000-0000-0000-0000-000000000001',
          updated_at: new Date().toISOString(),
        }),
      });
    });

    // 1. Navigate to Instructor Studio
    await page.goto('/instructor.html');

    // Verify initial layout & faculty identity
    await expect(page.locator('.navbar-title')).toHaveText('Instructor Assessment & Authoring Studio');
    await expect(page.locator('#user-display-name')).toHaveText('Prof. H. Sharma');
    await expect(page.locator('#tab-btn-dashboard')).toHaveClass(/active/);

    // =========================================================================
    // 2. Problem Authoring Flow (Author)
    // =========================================================================
    const authoringTabBtn = page.locator('#tab-btn-authoring');
    await authoringTabBtn.click();

    // Verify authoring form loaded
    await expect(page.locator('.page-title')).toHaveText('Problem Authoring Studio');
    await expect(page.locator('#form-problem-authoring')).toBeVisible();

    // Choose Cylinder preset
    const shapeSelect = page.locator('#select-shape');
    await shapeSelect.selectOption('CYLINDER');

    // Edit template ID
    const templateIdInput = page.locator('#input-template-id');
    await templateIdInput.fill('cylinder_demo_authoring');

    // Verify Live Preview column generated 5 valid seeded candidate problems
    const previewList = page.locator('#preview-samples-list');
    await expect(previewList).toBeVisible();

    const sample0 = page.locator('#preview-sample-0');
    await expect(sample0).toBeVisible();
    await expect(sample0).toContainText('22BCE10001');
    await expect(sample0.locator('.badge-success')).toHaveText('✓ Valid Candidate');
    await expect(sample0.locator('.sample-statement-text')).toContainText('A cylinder of base');

    // Verify all 5 sample cards are present
    await expect(page.locator('.preview-sample-card')).toHaveCount(5);

    // Save problem template via API
    const saveTemplateBtn = page.locator('#btn-save-template');
    await saveTemplateBtn.click();

    // Verify success banner
    const saveStatusMsg = page.locator('#save-status-msg');
    await expect(saveStatusMsg).toBeVisible();
    await expect(saveStatusMsg).toContainText('cylinder_demo_authoring successfully saved to problem bank');

    // =========================================================================
    // 3. Cohort Dashboard & Similarity Detection Flow (Dashboard & Assign)
    // =========================================================================
    const dashboardTabBtn = page.locator('#tab-btn-dashboard');
    await dashboardTabBtn.click();

    // Verify dashboard metrics & table loaded
    await expect(page.locator('.submissions-table')).toBeVisible();
    await expect(page.locator('.summary-card').first()).toContainText('Total Enrolled');

    // Filter by Section A
    const sectionSelect = page.locator('#select-section');
    await sectionSelect.selectOption('A');

    // Check student rows in table
    const aaravRow = page.locator('#row-22BCE10001');
    const priyaRow = page.locator('#row-22BCE10002');
    const rohanRow = page.locator('#row-22BCE10003');

    await expect(aaravRow).toBeVisible();
    await expect(priyaRow).toBeVisible();
    await expect(rohanRow).toBeVisible();

    // Verify Structural Similarity Flag (Aarav & Priya have identical test geometry)
    await expect(aaravRow.locator('.similarity-flag-pill')).toBeVisible();
    await expect(aaravRow.locator('.similarity-flag-pill')).toContainText('100% match with 22BCE10002');

    await expect(priyaRow.locator('.similarity-flag-pill')).toBeVisible();
    await expect(priyaRow.locator('.similarity-flag-pill')).toContainText('100% match with 22BCE10001');

    // Test Search filter
    const searchInput = page.locator('#input-search-student');
    await searchInput.fill('Aarav');
    await expect(aaravRow).toBeVisible();
    await expect(priyaRow).toBeHidden();
    await searchInput.fill(''); // Clear search
    await expect(priyaRow).toBeVisible();

    // =========================================================================
    // 4. Submission Review & Faculty Override Flow (Review)
    // =========================================================================
    const reviewBtn = page.locator('#btn-review-22BCE10001');
    await reviewBtn.click();

    // Verify modal overlay opens
    const modal = page.locator('.modal-dialog');
    await expect(modal).toBeVisible();
    await expect(page.locator('#review-title')).toHaveText('Aarav Patel (22BCE10001)');

    // Verify overlay canvas & legend
    const canvas = page.locator('#review-canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('.overlay-legend-bar')).toContainText('Matched Correctly');
    await expect(page.locator('.overlay-legend-bar')).toContainText('Missing Required Edge');

    // Verify initial score
    const scoreVal = page.locator('#review-current-score');
    await expect(scoreVal).toHaveText('95');

    // Attempt override without comment (must fail validation)
    const overrideComment = page.locator('#input-override-comment');
    await overrideComment.fill(''); // clear comment
    const saveOverrideBtn = page.locator('#btn-save-override');
    await saveOverrideBtn.click();

    // Provide mandatory comment and new score
    const overrideScoreInput = page.locator('#input-override-score');
    await overrideScoreInput.fill('98');
    await overrideComment.fill(
      'Verified exact generator tangents and clean apex alignment under manual review.',
    );
    await saveOverrideBtn.click();

    // Verify updated score in modal
    await expect(scoreVal).toHaveText('98');

    // Verify audit log item recorded
    const auditItems = page.locator('#audit-log-items');
    await expect(auditItems).toContainText('GRADE_OVERRIDE');
    await expect(auditItems).toContainText('Score: 95 → 98');
    await expect(auditItems).toContainText('Verified exact generator tangents');

    // Close review modal
    await page.locator('#btn-close-modal').click();
    await expect(modal).toBeHidden();

    // Verify updated score reflected in dashboard table row
    await expect(aaravRow.locator('.score-cell')).toHaveText('98%');

    // =========================================================================
    // 5. Grade Export Actions (Export)
    // =========================================================================
    await expect(page.locator('#btn-export-csv')).toBeVisible();
    await expect(page.locator('#btn-export-json')).toBeVisible();
  });
});
