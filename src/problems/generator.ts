import { deriveProblemSeed, Mulberry32PRNG } from './prng';
import type {
  ProblemTemplate,
  ServerProblemInstance,
  StudentProblemPayload,
} from './types';
import { validateProblemParameters } from './validator';

export interface GeneratorOptions {
  /** Server secret key for HMAC-SHA256 (defaults to process.env.PROBLEM_SERVER_SECRET). */
  serverSecret?: string;
  /** Maximum number of deterministic re-roll attempts before failing loudly. Default: 25. */
  maxReRolls?: number;
}

/**
 * Render template statement text by substituting {placeholder} tokens with parameter values.
 */
export function renderStatement(
  statementTemplate: string,
  params: Readonly<Record<string, number>>,
): string {
  return statementTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const val = params[key];
    if (val === undefined) {
      throw new Error(`Missing parameter value for statement placeholder "{${key}}".`);
    }
    return val.toString();
  });
}

/**
 * Generate a parametric problem instance for a specific student roll number.
 *
 * Guaranteed Properties:
 * 1. Strict Determinism: Given identical (serverSecret, rollNo, template.id, attemptNo), output is 100% identical.
 * 2. Uniform Step Grid: Every parameter lies precisely on the declared step grid.
 * 3. Verified Geometric Validity: Validates against first-quadrant, sheet area, and angle solvability rules.
 * 4. Deterministic Re-roll: Automatically re-rolls up to N times if a candidate violates geometric predicates.
 * 5. Strict Zero Ground-Truth Leaks: Client payload contains only public parameters, rendered text, and requirements.
 */
export function generateStudentProblem(
  template: ProblemTemplate,
  rollNo: string,
  attemptNo = 1,
  options?: GeneratorOptions,
): ServerProblemInstance {
  const secret = options?.serverSecret ?? process.env['PROBLEM_SERVER_SECRET'] ?? 'default_test_secret_3894729';
  const maxReRolls = options?.maxReRolls ?? 25;

  let lastValidationFailureReasons: readonly string[] = [];

  for (let reRollCount = 0; reRollCount < maxReRolls; reRollCount++) {
    const seed = deriveProblemSeed(secret, rollNo, template.id, attemptNo, reRollCount);
    const prng = new Mulberry32PRNG(seed);

    // Sample each parameter on the step grid
    const candidateParams: Record<string, number> = {};
    for (const [key, def] of Object.entries(template.param_schema)) {
      candidateParams[key] = prng.nextStep(def.min, def.max, def.step);
    }

    // Validate geometric predicates
    const outcome = validateProblemParameters(template, candidateParams);
    if (outcome.valid) {
      const renderedStatement = renderStatement(template.statement, candidateParams);

      const clientPayload: StudentProblemPayload = {
        problemId: template.id,
        topic: template.topic,
        statement: renderedStatement,
        publicParams: candidateParams,
        viewsRequired: [...template.views_required],
        attemptNo,
      };

      return {
        templateId: template.id,
        rollNo,
        attemptNo,
        seed,
        reRollCount,
        params: candidateParams,
        clientPayload,
      };
    }

    lastValidationFailureReasons = outcome.reasons;
  }

  throw new Error(
    `Failed to generate a valid problem for template "${template.id}" (rollNo: "${rollNo}") after ${maxReRolls} re-rolls.\nReasons:\n - ${lastValidationFailureReasons.join('\n - ')}`,
  );
}
