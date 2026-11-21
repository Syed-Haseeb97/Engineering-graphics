import type { ProblemTemplate, ValidationOutcome } from './types';

/**
 * Validate a set of generated problem parameters against template validity predicates.
 *
 * @param template The problem template containing validity_predicates and placement_rules.
 * @param params Candidate parameter map produced by PRNG.
 * @returns ValidationOutcome indicating whether parameters satisfy all geometric criteria.
 */
export function validateProblemParameters(
  template: ProblemTemplate,
  params: Readonly<Record<string, number>>,
): ValidationOutcome {
  const predicates = template.validity_predicates;
  const reasons: string[] = [];

  const maxSheetWidth = predicates.maxSheetWidthMm ?? 450;
  const maxSheetHeight = predicates.maxSheetHeightMm ?? 300;
  const minFeature = predicates.minFeatureSizeMm ?? 3;
  const minApparentLength = predicates.minApparentLengthMm ?? 15;
  const maxCombinedTilt = predicates.maxCombinedTiltDeg ?? 80;

  // 1. First Quadrant Rules
  if (predicates.requireFirstQuadrant ?? true) {
    if (params['distHP'] !== undefined && params['distHP'] < 0) {
      reasons.push(`distHP (${params['distHP']} mm) is below Horizontal Plane (must be >= 0).`);
    }
    if (params['distVP'] !== undefined && params['distVP'] < 0) {
      reasons.push(`distVP (${params['distVP']} mm) is behind Vertical Plane (must be >= 0).`);
    }
  }

  // 2. Minimum Feature Size (base dimensions, lengths)
  for (const [key, val] of Object.entries(params)) {
    if ((key.includes('size') || key.includes('dia') || key.includes('Side') || key.includes('Length')) && val < minFeature) {
      reasons.push(`Feature parameter ${key} (${val} mm) is less than minimum feature size (${minFeature} mm).`);
    }
  }

  // 3. Dual Inclination Geometric Solvability (Lines and Solids inclined to both planes)
  const theta = params['theta'];
  const phi = params['phi'];

  if (theta !== undefined && phi !== undefined) {
    const thetaRad = (theta * Math.PI) / 180;
    const phiRad = (phi * Math.PI) / 180;
    const sinSqSum = Math.sin(thetaRad) ** 2 + Math.sin(phiRad) ** 2;

    if (sinSqSum > 0.95) {
      reasons.push(
        `Dual inclination violation: sin²(θ) + sin²(φ) = ${sinSqSum.toFixed(3)} exceeds 0.95 threshold (geometrically impossible or degenerate).`,
      );
    }

    if (theta + phi > maxCombinedTilt) {
      reasons.push(
        `Combined inclination (θ + φ = ${theta + phi}°) exceeds maximum limit of ${maxCombinedTilt}°.`,
      );
    }
  }

  // 4. Apparent Length / Foreshortening Check
  if (params['trueLength'] !== undefined && theta !== undefined) {
    const apparentTop = params['trueLength'] * Math.cos((theta * Math.PI) / 180);
    if (apparentTop < minApparentLength) {
      reasons.push(
        `Foreshortened apparent top view length (${apparentTop.toFixed(1)} mm) is under minimum ${minApparentLength} mm.`,
      );
    }
  }

  if (params['trueLength'] !== undefined && phi !== undefined) {
    const apparentFront = params['trueLength'] * Math.cos((phi * Math.PI) / 180);
    if (apparentFront < minApparentLength) {
      reasons.push(
        `Foreshortened apparent front view length (${apparentFront.toFixed(1)} mm) is under minimum ${minApparentLength} mm.`,
      );
    }
  }

  // For solids: apparent axis length
  if (params['height'] !== undefined && theta !== undefined && theta > 0) {
    const apparentAxis = params['height'] * Math.cos((theta * Math.PI) / 180);
    if (apparentAxis < minApparentLength) {
      reasons.push(
        `Foreshortened apparent axis length (${apparentAxis.toFixed(1)} mm) is under minimum ${minApparentLength} mm.`,
      );
    }
  }

  // 5. Total Bounding Extent fits Sheet Area
  let estWidth: number;
  let estHeight: number;

  if (template.shape === 'POINT') {
    estWidth = (params['distVP'] ?? 20) + 50;
    estHeight = (params['distHP'] ?? 20) + 50;
  } else if (template.shape === 'LINE') {
    const len = params['trueLength'] ?? 60;
    estWidth = len + (params['distVP'] ?? 20) + 40;
    estHeight = len + (params['distHP'] ?? 20) + 40;
  } else {
    // Laminae or Solids
    const size = params['baseDia'] ?? params['baseSide'] ?? params['sideB'] ?? params['sideA'] ?? 40;
    const height = params['height'] ?? size;
    estWidth = size + height + (params['distVP'] ?? 20) + 60;
    estHeight = size + height + (params['distHP'] ?? 20) + 60;
  }

  if (estWidth > maxSheetWidth) {
    reasons.push(
      `Estimated horizontal projection span (${estWidth.toFixed(1)} mm) exceeds maximum sheet width (${maxSheetWidth} mm).`,
    );
  }

  if (estHeight > maxSheetHeight) {
    reasons.push(
      `Estimated vertical projection span (${estHeight.toFixed(1)} mm) exceeds maximum sheet height (${maxSheetHeight} mm).`,
    );
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}
