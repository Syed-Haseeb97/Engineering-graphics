import { describe, expect, it } from 'vitest';
import { generateStudentProblem } from '../generator';
import { STARTER_TEMPLATES, TEMPLATES_BY_ID } from '../templates';
import type { StudentProblemPayload } from '../types';
import { validateProblemParameters } from '../validator';

describe('Parametric Problem Generator Suite', () => {
  const TEST_SECRET = 'antigravity_exam_secret_2026_xK9pQ';

  describe('Template Verification & Schema Conformance', () => {
    it('verifies that all 6 starter templates are registered and have valid structures', () => {
      expect(STARTER_TEMPLATES).toHaveLength(6);

      for (const tmpl of STARTER_TEMPLATES) {
        expect(tmpl.id).toBeDefined();
        expect(tmpl.topic).toBeDefined();
        expect(tmpl.shape).toBeDefined();
        expect(tmpl.statement).toContain('{');
        expect(tmpl.statement).toContain('}');
        expect(Object.keys(tmpl.param_schema).length).toBeGreaterThanOrEqual(2);

        // Sum of rubric weights should equal 1.0 within floating point tolerance
        const r = tmpl.rubric;
        const totalWeight = r.recall + r.precision + r.lineType + r.dimensions;
        expect(totalWeight).toBeCloseTo(1.0, 4);

        // Verify that every parameter placeholder in the statement exists in param_schema
        const placeholders = Array.from(tmpl.statement.matchAll(/\{([a-zA-Z0-9_]+)\}/g)).map(
          (m) => m[1]!,
        );
        for (const ph of placeholders) {
          expect(tmpl.param_schema[ph]).toBeDefined();
        }
      }
    });
  });

  describe('Determinism & Reproducibility', () => {
    it('guarantees identical outputs for identical (serverSecret, rollNo, problemId, attemptNo)', () => {
      const tmpl = TEMPLATES_BY_ID['cone_inclined_both']!;
      const rollNo = '22BCE10482';

      const run1 = generateStudentProblem(tmpl, rollNo, 1, { serverSecret: TEST_SECRET });
      const run2 = generateStudentProblem(tmpl, rollNo, 1, { serverSecret: TEST_SECRET });

      expect(run1.seed).toBe(run2.seed);
      expect(run1.params).toEqual(run2.params);
      expect(run1.clientPayload.statement).toBe(run2.clientPayload.statement);
    });

    it('generates a fresh problem instance when attemptNo increments', () => {
      const tmpl = TEMPLATES_BY_ID['line_inclined_both']!;
      const rollNo = '22BME10023';

      const attempt1 = generateStudentProblem(tmpl, rollNo, 1, { serverSecret: TEST_SECRET });
      const attempt2 = generateStudentProblem(tmpl, rollNo, 2, { serverSecret: TEST_SECRET });

      expect(attempt1.seed).not.toBe(attempt2.seed);
      expect(attempt1.clientPayload.attemptNo).toBe(1);
      expect(attempt2.clientPayload.attemptNo).toBe(2);
    });

    it('generates different problems for different roll numbers', () => {
      const tmpl = TEMPLATES_BY_ID['prism_inclined_hp']!;

      const studentA = generateStudentProblem(tmpl, '22BCE1001', 1, { serverSecret: TEST_SECRET });
      const studentB = generateStudentProblem(tmpl, '22BCE1002', 1, { serverSecret: TEST_SECRET });

      expect(studentA.seed).not.toBe(studentB.seed);
      expect(studentA.params).not.toEqual(studentB.params);
    });
  });

  describe('Step Grid & Value Discretisation', () => {
    it('places all sampled parameters exactly on the step grid', () => {
      const tmpl = TEMPLATES_BY_ID['cone_inclined_both']!;

      for (let i = 1; i <= 50; i++) {
        const student = generateStudentProblem(tmpl, `ROLL_${i}`, 1, { serverSecret: TEST_SECRET });
        for (const [key, val] of Object.entries(student.params)) {
          const def = tmpl.param_schema[key]!;
          expect(val).toBeGreaterThanOrEqual(def.min);
          expect(val).toBeLessThanOrEqual(def.max);

          // Verify grid step: (val - min) must be an exact multiple of step
          const stepsCount = (val - def.min) / def.step;
          expect(Math.abs(stepsCount - Math.round(stepsCount))).toBeLessThan(1e-6);
        }
      }
    });
  });

  describe('1000 Roll Numbers Validity Test', () => {
    it('produces 100% valid problems across 1000 random roll numbers across all templates', () => {
      const templates = STARTER_TEMPLATES;
      let totalGenerated = 0;

      for (let i = 1; i <= 1000; i++) {
        const template = templates[(i - 1) % templates.length]!;
        const rollNo = `2026_EG_${10000 + i}`;

        const instance = generateStudentProblem(template, rollNo, 1, {
          serverSecret: TEST_SECRET,
          maxReRolls: 25,
        });

        totalGenerated++;

        // Assert geometric validation outcome is true
        const validation = validateProblemParameters(template, instance.params);
        expect(validation.valid).toBe(true);
        expect(validation.reasons).toHaveLength(0);

        // Assert rendered statement contains no unreplaced placeholders
        expect(instance.clientPayload.statement).not.toMatch(/\{[a-zA-Z0-9_]+\}/);
      }

      expect(totalGenerated).toBe(1000);
    });
  });

  describe('Distribution & Entropy Check', () => {
    it('ensures parameters do not collapse to constant values over 500 samples', () => {
      const tmpl = TEMPLATES_BY_ID['line_inclined_both']!;
      const trueLengths = new Set<number>();
      const thetas = new Set<number>();
      const phis = new Set<number>();

      for (let i = 1; i <= 500; i++) {
        const problem = generateStudentProblem(tmpl, `DIST_TEST_${i}`, 1, {
          serverSecret: TEST_SECRET,
        });
        trueLengths.add(problem.params['trueLength']!);
        thetas.add(problem.params['theta']!);
        phis.add(problem.params['phi']!);
      }

      // Check that distinct values cover the expected discrete domain
      // trueLength: [60, 65, 70, 75, 80, 85] -> 6 possible values
      expect(trueLengths.size).toBeGreaterThanOrEqual(5);
      // theta: [25, 30, 35, 40] -> 4 possible values
      expect(thetas.size).toBeGreaterThanOrEqual(3);
      // phi: [20, 25, 30, 35] -> 4 possible values
      expect(phis.size).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Client Payload Security & Ground-Truth Decoupling', () => {
    it('ensures serialized client payload exposes ZERO secret or ground-truth data', () => {
      const tmpl = TEMPLATES_BY_ID['cone_inclined_both']!;
      const problem = generateStudentProblem(tmpl, '22BCE9999', 1, { serverSecret: TEST_SECRET });

      const clientJson = JSON.stringify(problem.clientPayload);
      const parsed = JSON.parse(clientJson) as StudentProblemPayload;

      // 1. Must contain client fields
      expect(parsed.problemId).toBe('cone_inclined_both');
      expect(parsed.topic).toBe('PROJECTION_OF_SOLIDS');
      expect(parsed.statement).toContain('cone of base');
      expect(parsed.publicParams).toBeDefined();
      expect(parsed.viewsRequired).toEqual(['FRONT_VIEW', 'TOP_VIEW']);

      // 2. Must NOT contain serverSecret or seed
      expect(clientJson).not.toContain(TEST_SECRET);
      expect(clientJson).not.toContain(problem.seed);
      expect((parsed as unknown as { serverSecret?: string }).serverSecret).toBeUndefined();
      expect((parsed as unknown as { seed?: string }).seed).toBeUndefined();

      // 3. Must NOT contain internal B-Rep shapes, vertices, or solving handles
      expect(clientJson).not.toContain('ShapeHandle');
      expect(clientJson).not.toContain('vertex');
      expect(clientJson).not.toContain('matrix');
      expect(clientJson).not.toContain('groundTruth');
    });
  });

  describe('Sample Statement Generations for Different Students', () => {
    it('renders and logs distinct student problem statements for 3 roll numbers across starter templates', () => {
      const rollNumbers = ['22BCE10045', '22BME10112', '22BEE10984'];

      console.log('\n========================================================================');
      console.log('       SAMPLE PARAMETRIC STATEMENTS FOR 3 STUDENTS');
      console.log('========================================================================');

      for (const tmpl of STARTER_TEMPLATES) {
        console.log(`\n--- Template: ${tmpl.id} (${tmpl.topic}) ---`);
        for (const roll of rollNumbers) {
          const p = generateStudentProblem(tmpl, roll, 1, { serverSecret: TEST_SECRET });
          console.log(`[Roll: ${roll}]`);
          console.log(`  Statement: "${p.clientPayload.statement}"`);
          console.log(`  Parameters: ${JSON.stringify(p.clientPayload.publicParams)}`);

          expect(p.clientPayload.statement).toBeDefined();
          expect(p.clientPayload.statement).not.toMatch(/\{[a-zA-Z0-9_]+\}/);
        }
      }
      console.log('========================================================================\n');
    });
  });
});
