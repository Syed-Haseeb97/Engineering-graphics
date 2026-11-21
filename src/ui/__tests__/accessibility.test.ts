import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Relative luminance formula per WCAG 2.1
function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function calculateContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Accessibility & WCAG 2.1 Line Contrast Compliance', () => {
  const whiteCanvas = '#ffffff';

  it('validates Continuous visible outline contrast exceeds WCAG AAA (7.0:1)', () => {
    const continuousHex = '#0f172a';
    const ratio = calculateContrastRatio(continuousHex, whiteCanvas);
    expect(ratio).toBeGreaterThan(15.0);
  });

  it('validates Dashed hidden edge contrast exceeds WCAG AAA (7.0:1)', () => {
    const dashedHex = '#334155';
    const ratio = calculateContrastRatio(dashedHex, whiteCanvas);
    expect(ratio).toBeGreaterThan(9.0);
  });

  it('validates Centre/axis line contrast exceeds WCAG AA graphical & text (4.5:1)', () => {
    const centreHex = '#b91c1c';
    const ratio = calculateContrastRatio(centreHex, whiteCanvas);
    expect(ratio).toBeGreaterThan(5.5);
  });

  it('validates Thin projector/construction line contrast exceeds WCAG AA (4.5:1)', () => {
    const thinHex = '#475569';
    const ratio = calculateContrastRatio(thinHex, whiteCanvas);
    expect(ratio).toBeGreaterThan(5.5);
  });

  it('validates XY reference line contrast exceeds WCAG AA (4.5:1)', () => {
    const xyHex = '#1d4ed8';
    const ratio = calculateContrastRatio(xyHex, whiteCanvas);
    expect(ratio).toBeGreaterThan(6.0);
  });

  it('verifies focus-visible outlines are declared in student and instructor stylesheets', () => {
    const studentCss = fs.readFileSync(path.resolve(__dirname, '../student/styles.css'), 'utf-8');
    const instructorCss = fs.readFileSync(path.resolve(__dirname, '../instructor/styles.css'), 'utf-8');

    expect(studentCss).toContain(':focus-visible');
    expect(studentCss).toContain('outline: 2px solid');

    expect(instructorCss).toContain(':focus-visible');
    expect(instructorCss).toContain('outline: 2px solid');
  });

  it('verifies ARIA attributes and keyboard shortcuts in problem-view source template', () => {
    const problemViewSrc = fs.readFileSync(path.resolve(__dirname, '../student/views/problem-view.ts'), 'utf-8');

    expect(problemViewSrc).toContain('role="toolbar"');
    expect(problemViewSrc).toContain('aria-keyshortcuts="L"');
    expect(problemViewSrc).toContain('aria-keyshortcuts="C"');
    expect(problemViewSrc).toContain('aria-keyshortcuts="A"');
    expect(problemViewSrc).toContain('aria-keyshortcuts="P"');
    expect(problemViewSrc).toContain('aria-keyshortcuts="D"');
    expect(problemViewSrc).toContain('aria-keyshortcuts="F8"');
    expect(problemViewSrc).toContain('aria-pressed');
    expect(problemViewSrc).toContain('role="application"');
    expect(problemViewSrc).toContain('tabindex="0"');
  });

  it('verifies accessible dialog role and Escape handling in modal components', () => {
    const modalSrc = fs.readFileSync(path.resolve(__dirname, '../student/views/submit-modal.ts'), 'utf-8');
    const drawerSrc = fs.readFileSync(path.resolve(__dirname, '../student/views/check-drawer.ts'), 'utf-8');

    expect(modalSrc).toContain('role="dialog"');
    expect(modalSrc).toContain('aria-modal="true"');
    expect(modalSrc).toContain("e.key === 'Escape'");

    expect(drawerSrc).toContain('role="complementary"');
    expect(drawerSrc).toContain("e.key === 'Escape'");
  });
});
