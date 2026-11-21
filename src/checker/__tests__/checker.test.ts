import { describe, expect, it } from 'vitest';
import { buildCorpus } from '../../../testing/checker-corpus/corpus';
import type { LineEntity } from '../../draft/types';
import { alignDrawing } from '../align';
import { evaluateSubmission } from '../checker';

describe('Auto-Checker Corpus Suite', () => {
  describe('Alignment & Reference Line Validation', () => {
    it('returns typed error and pedagogical hint when reference line is missing', () => {
      const entities: LineEntity[] = [
        {
          id: 'l1',
          type: 'line',
          p1: { x: 20, y: 30 },
          p2: { x: 50, y: 30 },
          lineType: 'continuous',
        },
      ];

      const res = alignDrawing(entities);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('MISSING_XY_LINE');
        expect(res.hint.toLowerCase()).toContain('reference line xy');
      }
    });

    it('returns typed error and hint when reference line is not horizontal', () => {
      const entities: LineEntity[] = [
        {
          id: 'student_xy_tilted',
          type: 'line',
          p1: { x: 10, y: 10 },
          p2: { x: 90, y: 25 }, // Tilted: dy = 15, dx = 80 -> ~10.6 degrees
          lineType: 'thin',
        },
        {
          id: 'shape_line',
          type: 'line',
          p1: { x: 30, y: 40 },
          p2: { x: 60, y: 40 },
          lineType: 'continuous',
        },
      ];

      const res = alignDrawing(entities);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('NON_HORIZONTAL_XY_LINE');
        expect(res.hint).toContain('strictly horizontal');
      }
    });

    it('neutralizes sheet translation when drawing is shifted along with XY line', () => {
      const originalLines: LineEntity[] = [
        {
          id: 'xy_ref',
          type: 'line',
          p1: { x: 0, y: 0 },
          p2: { x: 100, y: 0 },
          lineType: 'thin',
        },
        {
          id: 'f1',
          type: 'line',
          p1: { x: 20, y: 15 },
          p2: { x: 70, y: 45 },
          lineType: 'continuous',
        },
      ];

      // Shift entire drawing by (+50, +35)
      const shiftedLines: LineEntity[] = originalLines.map((l) => ({
        ...l,
        p1: { x: l.p1.x + 50, y: l.p1.y + 35 },
        p2: { x: l.p2.x + 50, y: l.p2.y + 35 },
      }));

      const aligned = alignDrawing(shiftedLines, 0);
      expect(aligned.success).toBe(true);
      if (aligned.success) {
        expect(aligned.translation.x).toBeCloseTo(-50, 4);
        expect(aligned.translation.y).toBeCloseTo(-35, 4);

        const alignedF1 = aligned.alignedEntities.find((e) => e.id === 'f1') as LineEntity;
        expect(alignedF1.p1.x).toBeCloseTo(20, 4);
        expect(alignedF1.p1.y).toBeCloseTo(15, 4);
      }
    });
  });

  describe('Corpus Evaluation across 3 Templates & 7 Conditions', () => {
    const corpus = buildCorpus();

    // Table of actual scores logged for review
    const resultsTable: Array<{
      template: string;
      condition: string;
      score: number;
      min: number;
      max: number;
      status: string;
    }> = [];

    for (const testCase of corpus) {
      it(`evaluates ${testCase.templateId} under condition [${testCase.caseType}] within [${testCase.expectedScoreRange.min}..${testCase.expectedScoreRange.max}]`, () => {
        const report = evaluateSubmission(testCase.studentEntities, testCase.groundTruth, {
          toleranceMm: 0.5,
          sampleStepMm: 1.0,
          coverageThreshold: 0.75,
        });

        expect(report.success).toBe(true);

        const score = report.overallScore;
        const minExpected = testCase.expectedScoreRange.min;
        const maxExpected = testCase.expectedScoreRange.max;

        const inRange = score >= minExpected && score <= maxExpected;
        resultsTable.push({
          template: testCase.templateId,
          condition: testCase.caseType,
          score,
          min: minExpected,
          max: maxExpected,
          status: inRange ? 'PASSED' : 'OUT_OF_RANGE',
        });

        expect(score).toBeGreaterThanOrEqual(minExpected);
        expect(score).toBeLessThanOrEqual(maxExpected);
      });
    }

    it('prints results table for all 21 corpus evaluations', () => {
      console.log('\n========================================================================');
      console.log('              AUTO-CHECKER CORPUS BENCHMARK RESULTS');
      console.log('========================================================================');
      console.log(
        'Template'.padEnd(20) +
          ' | ' +
          'Condition'.padEnd(16) +
          ' | ' +
          'Score'.padEnd(8) +
          ' | ' +
          'Expected Range'.padEnd(16) +
          ' | Status',
      );
      console.log('-'.repeat(74));

      for (const r of resultsTable) {
        console.log(
          r.template.padEnd(20) +
            ' | ' +
            r.condition.padEnd(16) +
            ' | ' +
            `${r.score}%`.padEnd(8) +
            ' | ' +
            `[${r.min} .. ${r.max}]%`.padEnd(16) +
            ' | ' +
            r.status,
        );
      }
      console.log('========================================================================\n');
    });
  });
});
