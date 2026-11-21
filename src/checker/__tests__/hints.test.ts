import { describe, expect, it } from 'vitest';
import { buildCorpus } from '../../../testing/checker-corpus/corpus';
import { TEMPLATES_BY_ID } from '../../problems/templates';
import { evaluateSubmission } from '../checker';
import { HINT_TEMPLATES } from '../hint-templates';
import { generateHints, StudentHintSession, type GeneratedHint } from '../hints';
import type { EvaluationReport } from '../types';

describe('Pedagogical Hints Suite', () => {
  const corpus = buildCorpus();

  describe('Corpus Snapshot & Zero-Numeric-Parameter Leak Guarantee', () => {
    it('snapshots hints for all 21 corpus cases and verifies no numeric parameter leaks', () => {
      const snapshotResults: Record<string, {
        score: number;
        hints: readonly {
          id: string;
          templateKey: string;
          view: string;
          count: number;
          level1: string;
          level2: string;
          level3: string;
        }[];
      }> = {};

      console.log('\n========================================================================');
      console.log('              AUTO-CHECKER CORPUS HINTS SNAPSHOT');
      console.log('========================================================================');

      for (const c of corpus) {
        const report = evaluateSubmission(c.studentEntities, c.groundTruth);
        const hints = generateHints(report, {
          studentEntities: c.studentEntities,
          groundTruth: c.groundTruth,
        });

        const caseKey = `${c.templateId}__${c.caseType}`;
        snapshotResults[caseKey] = {
          score: report.overallScore,
          hints: hints.map((h) => ({
            id: h.id,
            templateKey: h.templateKey,
            view: h.view,
            count: h.count,
            level1: h.level1,
            level2: h.level2,
            level3: h.level3,
          })),
        };

        console.log(`\nCase [${caseKey}] (Score: ${report.overallScore}%)`);
        console.log(`Description: ${c.description}`);
        if (hints.length === 0) {
          console.log('  No hints generated.');
        } else {
          for (const h of hints) {
            console.log(`  - [${h.id}] (Count: ${h.count}, View: ${h.view})`);
            console.log(`      L1: "${h.level1}"`);
            console.log(`      L2: "${h.level2}"`);
            console.log(`      L3: "${h.level3}"`);
          }
        }

        // 1. Verify hint objects are populated
        expect(hints.length).toBeGreaterThanOrEqual(1);

        // 2. Strict Zero-Numeric-Parameter Leak Guarantee
        // Extract all numeric parameter values defined in the template
        const tmpl = TEMPLATES_BY_ID[c.templateId];
        const forbiddenNumbers: number[] = [];
        if (tmpl) {
          for (const def of Object.values(tmpl.param_schema)) {
            forbiddenNumbers.push(def.min, def.max, def.step);
          }
        }

        for (const h of hints) {
          for (const text of [h.level1, h.level2, h.level3]) {
            // Must not contain any numerical digits [0-9]
            expect(text).not.toMatch(/\d+/);

            // Must not contain any problem parameter values
            for (const num of forbiddenNumbers) {
              expect(text).not.toContain(num.toString());
            }

            // Must not reveal coordinates, dimensions, or mm units
            expect(text).not.toMatch(/\b\d+(\.\d+)?\s*(mm|deg|°)\b/);
            expect(text.toLowerCase()).not.toContain('x=');
            expect(text.toLowerCase()).not.toContain('y=');
          }
        }
      }

      console.log('========================================================================\n');

      // Verify overall snapshot stability across all 21 corpus cases
      expect(snapshotResults).toMatchSnapshot();
    });
  });

  describe('Graduated Hint Levels (1 -> 2 -> 3) & Student Unlock Mechanics', () => {
    it('progressively unlocks levels 1, 2, and 3 one at a time and tracks faculty counts', () => {
      const mockHints: GeneratedHint[] = [
        {
          id: 'missing_top_hidden',
          templateKey: 'MISSING_HIDDEN_TOP',
          view: 'TOP',
          count: 2,
          level1: HINT_TEMPLATES['MISSING_HIDDEN_TOP']!.level1,
          level2: HINT_TEMPLATES['MISSING_HIDDEN_TOP']!.level2,
          level3: HINT_TEMPLATES['MISSING_HIDDEN_TOP']!.level3,
        },
        {
          id: 'wrong_line_type_front',
          templateKey: 'WRONG_LINE_TYPE_FRONT',
          view: 'FRONT',
          count: 1,
          level1: HINT_TEMPLATES['WRONG_LINE_TYPE_FRONT']!.level1,
          level2: HINT_TEMPLATES['WRONG_LINE_TYPE_FRONT']!.level2,
          level3: HINT_TEMPLATES['WRONG_LINE_TYPE_FRONT']!.level3,
        },
      ];

      const session = new StudentHintSession(mockHints);

      // Initial state: 0 hints unlocked
      expect(session.getUnlockedHints()).toHaveLength(0);
      let analytics = session.getFacultyAnalytics();
      expect(analytics.totalHintsAvailable).toBe(2);
      expect(analytics.totalUnlocks).toBe(0);
      expect(analytics.unlockedLevelCounts).toEqual({ level1: 0, level2: 0, level3: 0 });

      // Student unlocks first hint -> Level 1 (Vague, Where)
      const u1 = session.unlockNextLevel('missing_top_hidden');
      expect(u1.level).toBe(1);
      expect(u1.text).toBe('Check for missing internal details in the top view.');
      expect(u1.isMaxLevel).toBe(false);

      analytics = session.getFacultyAnalytics();
      expect(analytics.totalUnlocks).toBe(1);
      expect(analytics.unlockedLevelCounts.level1).toBe(1);

      // Student unlocks same hint again -> Level 2 (Specific view and error)
      const u2 = session.unlockNextLevel('missing_top_hidden');
      expect(u2.level).toBe(2);
      expect(u2.text).toBe('A hidden edge is missing in the top view.');
      expect(u2.isMaxLevel).toBe(false);

      analytics = session.getFacultyAnalytics();
      expect(analytics.totalUnlocks).toBe(2);
      expect(analytics.unlockedLevelCounts.level1).toBe(0);
      expect(analytics.unlockedLevelCounts.level2).toBe(1);

      // Student unlocks same hint again -> Level 3 (Concept reminder)
      const u3 = session.unlockNextLevel('missing_top_hidden');
      expect(u3.level).toBe(3);
      expect(u3.text).toBe(
        'Edges that are obscured by other parts of the solid when viewed from above must be drawn as dashed lines.',
      );
      expect(u3.isMaxLevel).toBe(true);

      analytics = session.getFacultyAnalytics();
      expect(analytics.totalUnlocks).toBe(3);
      expect(analytics.unlockedLevelCounts.level3).toBe(1);

      // Unlocking again at max level does not increment totalUnlocks
      const u4 = session.unlockNextLevel('missing_top_hidden');
      expect(u4.level).toBe(3);
      expect(u4.isMaxLevel).toBe(true);
      expect(session.getFacultyAnalytics().totalUnlocks).toBe(3);

      // Student unlocks second hint -> Level 1
      session.unlockNextLevel('wrong_line_type_front');
      const finalAnalytics = session.getFacultyAnalytics();
      expect(finalAnalytics.totalUnlocks).toBe(4);
      expect(finalAnalytics.unlockedLevelCounts).toEqual({ level1: 1, level2: 0, level3: 1 });
      expect(finalAnalytics.hintUsageById).toEqual({
        missing_top_hidden: 3,
        wrong_line_type_front: 1,
      });
    });
  });

  describe('Repeated Error Grouping', () => {
    it('groups multiple missing hidden edges in the top view into a single hint with count', () => {
      // Create a mock report with 6 missing hidden edges in the top view
      const mockReport: EvaluationReport = {
        success: true,
        overallScore: 60,
        metrics: { recall: 0.5, precision: 1.0, lineType: 1.0, dimensions: 1.0 },
        edges: [
          {
            id: 'e1',
            view: 'TOP',
            p1: { x: 10, y: -10 },
            p2: { x: 20, y: -10 },
            expectedLineType: 'hidden',
            status: 'missing',
            lengthMm: 10,
          },
          {
            id: 'e2',
            view: 'TOP',
            p1: { x: 20, y: -10 },
            p2: { x: 30, y: -10 },
            expectedLineType: 'hidden',
            status: 'missing',
            lengthMm: 10,
          },
          {
            id: 'e3',
            view: 'TOP',
            p1: { x: 30, y: -10 },
            p2: { x: 40, y: -10 },
            expectedLineType: 'hidden',
            status: 'missing',
            lengthMm: 10,
          },
          {
            id: 'e4',
            view: 'TOP',
            p1: { x: 40, y: -10 },
            p2: { x: 50, y: -10 },
            expectedLineType: 'hidden',
            status: 'missing',
            lengthMm: 10,
          },
          {
            id: 'e5',
            view: 'TOP',
            p1: { x: 50, y: -10 },
            p2: { x: 60, y: -10 },
            expectedLineType: 'hidden',
            status: 'missing',
            lengthMm: 10,
          },
          {
            id: 'e6',
            view: 'TOP',
            p1: { x: 60, y: -10 },
            p2: { x: 70, y: -10 },
            expectedLineType: 'hidden',
            status: 'missing',
            lengthMm: 10,
          },
        ],
        summary: {
          totalExpectedEdges: 6,
          matchedEdges: 0,
          missingEdges: 6,
          extraEdges: 0,
          wrongTypeEdges: 0,
        },
      };

      const hints = generateHints(mockReport);

      // Must generate exactly 1 hint for the 6 missing hidden edges
      expect(hints).toHaveLength(1);
      const topHint = hints[0]!;
      expect(topHint.id).toBe('missing_top_hidden');
      expect(topHint.templateKey).toBe('MISSING_HIDDEN_TOP');
      expect(topHint.view).toBe('TOP');
      expect(topHint.count).toBe(6);
      expect(topHint.level1).toBe('Check for missing internal details in the top view.');
      expect(topHint.level2).toBe('A hidden edge is missing in the top view.');
      expect(topHint.level3).toContain('dashed lines');
    });
  });

  describe('Alignment & Reference Line Pedagogical Diagnostics', () => {
    it('generates clear concept hints when reference line is missing or tilted', () => {
      const missingXyReport: EvaluationReport = {
        success: false,
        error: 'MISSING_XY_LINE',
        hint: 'Reference line XY is missing.',
        overallScore: 0,
        metrics: { recall: 0, precision: 0, lineType: 0, dimensions: 0 },
        edges: [],
        summary: { totalExpectedEdges: 10, matchedEdges: 0, missingEdges: 10, extraEdges: 0, wrongTypeEdges: 0 },
      };

      const hints = generateHints(missingXyReport);
      expect(hints).toHaveLength(1);
      expect(hints[0]!.templateKey).toBe('MISSING_XY_LINE');
      expect(hints[0]!.level1).toBe('A reference line is required on the drawing sheet.');
      expect(hints[0]!.level2).toContain('missing the horizontal reference line XY');
      expect(hints[0]!.level3).toContain('represents the intersection of the HP and VP');
    });
  });
});
