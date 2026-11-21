import * as fs from 'fs';
import * as path from 'path';

/** Validation error representation */
export interface ValidationError {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

/** Lightweight strict schema validator for TextbookProblem JSON */
export function validateProblemJson(data: unknown, filePath: string): ValidationError[] {
  const errors: ValidationError[] = [];

  const addErr = (p: string, msg: string) => {
    errors.push({ file: filePath, path: p, message: msg });
  };

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    addErr('root', 'Problem data must be a non-null JSON object');
    return errors;
  }

  const obj = data as Record<string, unknown>;

  // 1. id
  if (typeof obj['id'] !== 'string' || !/^[a-z0-9_-]+$/.test(obj['id'])) {
    addErr('id', 'Missing or invalid "id". Must be a lowercase alphanumeric string with underscores/hyphens.');
  }

  // 2. source
  if (!obj['source'] || typeof obj['source'] !== 'object' || Array.isArray(obj['source'])) {
    addErr('source', 'Missing "source" object.');
  } else {
    const src = obj['source'] as Record<string, unknown>;
    if (typeof src['book'] !== 'string' || src['book'].trim() === '') {
      addErr('source.book', 'Missing or empty "book" name in source.');
    }
    if (typeof src['chapter'] !== 'string' && typeof src['chapter'] !== 'number') {
      addErr('source.chapter', 'Missing "chapter" in source.');
    }
  }

  // 3. statement
  if (typeof obj['statement'] !== 'string' || obj['statement'].trim() === '') {
    addErr('statement', 'Missing or empty "statement" text.');
  }

  // 4. solid
  if (!obj['solid'] || typeof obj['solid'] !== 'object' || Array.isArray(obj['solid'])) {
    addErr('solid', 'Missing "solid" definition.');
  } else {
    const s = obj['solid'] as Record<string, unknown>;
    const allowedTypes = ['PRISM', 'PYRAMID', 'CYLINDER', 'CONE', 'FRUSTUM_CONE', 'FRUSTUM_PYRAMID'];
    if (typeof s['type'] !== 'string' || !allowedTypes.includes(s['type'])) {
      addErr('solid.type', `Invalid solid type. Must be one of: ${allowedTypes.join(', ')}`);
    }
    if (s['type'] === 'PRISM' || s['type'] === 'PYRAMID' || s['type'] === 'FRUSTUM_PYRAMID') {
      const allowedSides = [3, 4, 5, 6];
      if (typeof s['sides'] !== 'number' || !allowedSides.includes(s['sides'])) {
        addErr('solid.sides', `Invalid or missing sides for polygon base. Must be 3, 4, 5, or 6.`);
      }
    }
    if (typeof s['baseSize'] !== 'number' || s['baseSize'] <= 0) {
      addErr('solid.baseSize', 'Missing or invalid baseSize. Must be positive number.');
    }
    if (typeof s['height'] !== 'number' || s['height'] <= 0) {
      addErr('solid.height', 'Missing or invalid height. Must be positive number.');
    }
    if (s['type'] === 'FRUSTUM_CONE' || s['type'] === 'FRUSTUM_PYRAMID') {
      if (typeof s['topSize'] !== 'number' || s['topSize'] <= 0) {
        addErr('solid.topSize', 'Missing topSize for frustum solid.');
      }
    }
  }

  // 5. placement
  if (!obj['placement'] || typeof obj['placement'] !== 'object' || Array.isArray(obj['placement'])) {
    addErr('placement', 'Missing "placement" configuration.');
  } else {
    const p = obj['placement'] as Record<string, unknown>;
    if (p['initialAxis'] !== undefined) {
      if (p['initialAxis'] !== 'PERPENDICULAR_TO_HP' && p['initialAxis'] !== 'PERPENDICULAR_TO_VP') {
        addErr('placement.initialAxis', 'initialAxis must be "PERPENDICULAR_TO_HP" or "PERPENDICULAR_TO_VP".');
      }
    }
    for (const numField of ['baseRotationDeg', 'baseRotationRad', 'thetaDeg', 'thetaRad', 'phiDeg', 'phiRad', 'distanceHP', 'distanceVP']) {
      if (p[numField] !== undefined && typeof p[numField] !== 'number') {
        addErr(`placement.${numField}`, `${numField} must be a number.`);
      }
    }
  }

  // 6. expected
  if (!obj['expected'] || typeof obj['expected'] !== 'object' || Array.isArray(obj['expected'])) {
    addErr('expected', 'Missing "expected" ground truth data.');
  }

  // 7. human check consistency
  if (obj['needsHumanCheck'] === true && (!obj['humanCheckReason'] || typeof obj['humanCheckReason'] !== 'string')) {
    addErr('humanCheckReason', 'When needsHumanCheck is true, humanCheckReason must be specified.');
  }

  return errors;
}

/** Validate all problem files in a given directory */
export function validateDirectory(dirPath: string): { total: number; valid: number; errors: ValidationError[] } {
  const allErrors: ValidationError[] = [];
  let total = 0;
  let valid = 0;

  if (!fs.existsSync(dirPath)) {
    return { total: 0, valid: 0, errors: [] };
  }

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      const sub = validateDirectory(fullPath);
      total += sub.total;
      valid += sub.valid;
      allErrors.push(...sub.errors);
    } else if (entry.endsWith('.json') && !entry.endsWith('.schema.json')) {
      total++;
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const json = JSON.parse(content);
        const errs = validateProblemJson(json, fullPath);
        if (errs.length === 0) {
          valid++;
        } else {
          allErrors.push(...errs);
        }
      } catch (err: unknown) {
        allErrors.push({
          file: fullPath,
          path: 'parse',
          message: `JSON Parse error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return { total, valid, errors: allErrors };
}

// CLI runner if executed directly
if (process.argv[1]?.includes('validate')) {
  const targetDir = process.argv[2] ?? path.join(__dirname, 'problems');
  console.log(`Validating textbook problems in: ${targetDir}`);
  const result = validateDirectory(targetDir);
  console.log(`Total problems scanned: ${result.total}`);
  console.log(`Valid problems: ${result.valid}`);
  if (result.errors.length > 0) {
    console.error(`Validation ERRORS (${result.errors.length}):`);
    for (const e of result.errors) {
      console.error(`  [${e.file}] at ${e.path}: ${e.message}`);
    }
    process.exit(1);
  } else {
    console.log('All textbook problem definitions are VALID.');
  }
}
