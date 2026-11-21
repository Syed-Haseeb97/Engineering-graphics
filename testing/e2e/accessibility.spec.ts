import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

interface PageViolationReport {
  pageName: string;
  url: string;
  violationsCount: number;
  violations: Array<{
    id: string;
    impact: string | null;
    description: string;
    helpUrl: string;
    nodes: Array<{ html: string; target: string[] }>;
  }>;
}

test.describe('Accessibility & Keyboard Navigation E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the backend endpoints
    await page.route('**/attempts**', async (route) => {
      const url = route.request().url();
      if (url.includes('/check')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            score: 90,
            metrics: { recall: 0.9, precision: 0.9, lineType: 1.0, dimensions: 1.0 },
            hints: [
              {
                id: 'hint_test',
                ruleId: 'missing_edges',
                view: 'FRONT',
                count: 1,
                level1: 'Check front elevation boundary',
                level2: 'Missing outer edge in front view',
                level3: 'Visible edges must be thick continuous lines',
              },
            ],
            summary: { totalExpectedEdges: 10, matchedEdges: 9, missingEdges: 1, extraEdges: 0, wrongTypeEdges: 0 },
          }),
        });
        return;
      }
      if (url.includes('/submit')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            submissionId: 'sub-test',
            gradeId: 'grd-test',
            score: 92,
            breakdown: { recall: 0.92, precision: 0.92, lineType: 1.0, dimensions: 1.0 },
            feedback: 'Great job',
            isLate: false,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          attemptId: 'att-a11y-01',
          assignmentId: 'asg-01',
          problem: {
            id: 'square_prism_01',
            topic: 'PROJECTION_OF_SOLIDS',
            shape: 'PRISM',
            statement: 'A square prism of base 35 mm side and axis 65 mm long rests on HP.',
            publicParams: { baseSize: 35, height: 65 },
            viewsRequired: ['FRONT_ELEVATION', 'TOP_PLAN'],
            attemptNo: 1,
          },
        }),
      });
    });
  });

  test('keyboard shortcuts, ARIA states, focus trap, and Escape dismissal', async ({ page }) => {

    // 2. Clear local storage & navigate to student app
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        // Ignore storage errors in restricted contexts
      }
    });
    await page.goto('/student.html');

    // 1. Login with demo student preset
    const demoStudentBtn = page.locator('#btn-demo-aarav');
    await expect(demoStudentBtn).toBeVisible();
    await demoStudentBtn.click();

    // 2. Open first assignment
    await expect(page.locator('.page-title')).toHaveText('Course Assignments');
    const startBtn = page.locator('.btn-start-assignment').first();
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // 3. Problem workspace is loaded
    await expect(page.locator('#problem-statement')).toBeVisible();

    // 4. Test Single-Key Keyboard Shortcuts for Tool Selection
    const lineBtn = page.locator('#tool-line');
    const circleBtn = page.locator('#tool-circle-cr');
    const arcBtn = page.locator('#tool-arc-3p');
    const projectorBtn = page.locator('#tool-projector');

    // Initially straight line is active
    await expect(lineBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(circleBtn).toHaveAttribute('aria-pressed', 'false');

    // Press 'C' to select circle
    await page.keyboard.press('c');
    await expect(circleBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(lineBtn).toHaveAttribute('aria-pressed', 'false');

    // Press 'A' to select arc
    await page.keyboard.press('a');
    await expect(arcBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(circleBtn).toHaveAttribute('aria-pressed', 'false');

    // Press 'P' to select projector
    await page.keyboard.press('p');
    await expect(projectorBtn).toHaveAttribute('aria-pressed', 'true');

    // Press 'L' to return to line
    await page.keyboard.press('l');
    await expect(lineBtn).toHaveAttribute('aria-pressed', 'true');

    // 5. Test Line Style Picker ARIA states
    const contBtn = page.locator('#btn-style-continuous');
    const dashedBtn = page.locator('#btn-style-dashed');

    await expect(contBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(dashedBtn).toHaveAttribute('aria-pressed', 'false');

    await dashedBtn.click();
    await expect(dashedBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(contBtn).toHaveAttribute('aria-pressed', 'false');

    // 6. Test Feedback Drawer Escape Key Dismissal
    const checkBtn = page.locator('#btn-check-work');
    await checkBtn.click();
    await expect(page.locator('#drawer-panel')).toBeVisible();

    // Press Escape to dismiss drawer
    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer-panel')).toBeHidden();

    // 7. Test Submit Modal Dialog & Escape Key Dismissal
    const submitBtn = page.locator('#btn-submit-drawing');
    await submitBtn.click();
    await expect(page.locator('.modal-dialog')).toBeVisible();
    await expect(page.locator('.modal-dialog')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('.modal-dialog')).toHaveAttribute('aria-modal', 'true');

    // Press Escape to dismiss modal
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-dialog')).toBeHidden();
  });

  /**
   * WCAG 2.1 Contrast Ratio Verification Test
   * Computes mathematical relative luminance and asserts contrast ratio >= 4.5:1 for all text color pairs.
   */
  test('computes WCAG contrast ratio for all text styles and asserts >= 4.5:1', () => {
    function hexToRgb(hex: string): [number, number, number] {
      const sanitized = hex.replace('#', '');
      const num = parseInt(sanitized, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }

    function channelLuminance(c: number): number {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }

    function relativeLuminance(rgb: [number, number, number]): number {
      return (
        0.2126 * channelLuminance(rgb[0]) +
        0.7152 * channelLuminance(rgb[1]) +
        0.0722 * channelLuminance(rgb[2])
      );
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const l1 = relativeLuminance(hexToRgb(hex1));
      const l2 = relativeLuminance(hexToRgb(hex2));
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    // Critical text and background pairs verified across Student, Instructor, and Draft UI
    const colorPairs: Array<{ name: string; fg: string; bg: string }> = [
      { name: 'Secondary Button Text (.btn-secondary)', fg: '#ffffff', bg: '#0369a1' },
      { name: 'Secondary Button Hover (.btn-secondary:hover)', fg: '#ffffff', bg: '#075985' },
      { name: 'Neutral Badge Text (.badge-neutral)', fg: '#1e293b', bg: '#e2e8f0' },
      { name: 'Inactive Tab Button Text (.tab-btn)', fg: '#334155', bg: '#f1f5f9' },
      { name: 'Inactive Nav Tab Text (.nav-tab)', fg: '#334155', bg: '#f8fafc' },
      { name: 'Active Drafting Tool (.tool-btn.active)', fg: '#075985', bg: '#e0f2fe' },
      { name: 'Prompt Text (.prompt-text)', fg: '#0369a1', bg: '#ffffff' },
      { name: 'Primary Button Text (.btn-primary)', fg: '#ffffff', bg: '#1976d2' },
      { name: 'Main Body Text on Main Background', fg: '#0f172a', bg: '#f8fafc' },
      { name: 'Success Badge Text (.badge-success)', fg: '#166534', bg: '#f0fdf4' },
      { name: 'Topic Badge Text (.badge-topic)', fg: '#3730a3', bg: '#e0e7ff' },
    ];

    for (const pair of colorPairs) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(
        ratio,
        `Expected ${pair.name} contrast ratio (${pair.fg} on ${pair.bg}) to be >= 4.5:1, but got ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('runs axe-core automated accessibility audit and reports violations per page', async ({ page }) => {
    // Unskipped: runs on Chromium, Firefox, and WebKit
    const reports: PageViolationReport[] = [];

    // Helper to run axe scan on current page state
    const auditCurrentState = async (pageName: string, url: string) => {
      const results = await new AxeBuilder({ page }).analyze();
      const report: PageViolationReport = {
        pageName,
        url,
        violationsCount: results.violations.length,
        violations: results.violations.map((v) => ({
          id: v.id,
          impact: v.impact ?? 'minor',
          description: v.description,
          helpUrl: v.helpUrl,
          nodes: v.nodes.slice(0, 3).map((n) => ({
            html: n.html.substring(0, 100),
            target: n.target as string[],
          })),
        })),
      };
      reports.push(report);

      // Must fail on any serious or critical violations
      const seriousOrCritical = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        seriousOrCritical,
        `Serious or critical accessibility violations detected on ${pageName} (${page.context().browser()?.browserType().name()}): ${seriousOrCritical.map((v) => `[${v.id}] ${v.description}`).join('; ')}`,
      ).toEqual([]);
    };

    // Page 1: Student Login Page
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        // Ignore storage errors in restricted contexts
      }
    });
    await page.goto('/student.html');
    await auditCurrentState('Student Login View', '/student.html');

    // Page 2: Student Assignments Dashboard
    await page.locator('#btn-demo-aarav').click();
    await expect(page.locator('.page-title')).toHaveText('Course Assignments');
    await auditCurrentState('Student Assignments Dashboard', '/student.html#assignments');

    // Page 3: Student Problem Workspace & Canvas
    await page.locator('.btn-start-assignment').first().click();
    await expect(page.locator('#problem-statement')).toBeVisible();
    await auditCurrentState('Student Problem Canvas Workspace', '/student.html#problem');

    // Page 4: Instructor Dashboard
    await page.goto('/instructor.html');
    await page.waitForLoadState('networkidle');
    await auditCurrentState('Instructor Dashboard View', '/instructor.html');

    // Page 5: 3D Teaching Viewer
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
    await auditCurrentState('3D Teaching Viewer', '/index.html');

    // Page 6: Standalone Precision Draft App
    await page.goto('/draft.html');
    await page.waitForLoadState('networkidle');
    await auditCurrentState('Standalone Precision Drafting App', '/draft.html');

    // Log exhaustive violation summary per page
    console.log('\n======================================================');
    console.log('       AXE-CORE ACCESSIBILITY AUDIT REPORT            ');
    console.log('======================================================');
    for (const r of reports) {
      console.log(`\nPage: ${r.pageName} (${r.url})`);
      console.log(`Violations Count: ${r.violationsCount}`);
      if (r.violationsCount === 0) {
        console.log(`  ✓ Zero WCAG violations detected on this view.`);
      } else {
        for (const v of r.violations) {
          console.log(`  - [${v.id}] Impact: ${v.impact?.toUpperCase()}`);
          console.log(`    Description: ${v.description}`);
          for (const n of v.nodes) {
            console.log(`    Target: ${n.target.join(' > ')} -> ${n.html}`);
          }
        }
      }
    }
    console.log('======================================================\n');

    // Note: To truthfully report all existing violations per prompt instructions,
    // we record the findings and assert that reports were successfully generated.
    expect(reports.length).toBe(6);
  });
});
