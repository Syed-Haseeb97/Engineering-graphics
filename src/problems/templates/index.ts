import type { ProblemTemplate } from '../types';

import coneInclinedBoth from './cone_inclined_both.json';
import lineInclinedBoth from './line_inclined_both.json';
import planeInclinedHp from './plane_inclined_hp.json';
import pointQuadrant from './point_quadrant.json';
import prismInclinedHp from './prism_inclined_hp.json';
import pyramidInclinedVp from './pyramid_inclined_vp.json';

export const STARTER_TEMPLATES: readonly ProblemTemplate[] = [
  pointQuadrant as unknown as ProblemTemplate,
  lineInclinedBoth as unknown as ProblemTemplate,
  planeInclinedHp as unknown as ProblemTemplate,
  prismInclinedHp as unknown as ProblemTemplate,
  pyramidInclinedVp as unknown as ProblemTemplate,
  coneInclinedBoth as unknown as ProblemTemplate,
];

export const TEMPLATES_BY_ID: Readonly<Record<string, ProblemTemplate>> = {
  [pointQuadrant.id]: pointQuadrant as unknown as ProblemTemplate,
  [lineInclinedBoth.id]: lineInclinedBoth as unknown as ProblemTemplate,
  [planeInclinedHp.id]: planeInclinedHp as unknown as ProblemTemplate,
  [prismInclinedHp.id]: prismInclinedHp as unknown as ProblemTemplate,
  [pyramidInclinedVp.id]: pyramidInclinedVp as unknown as ProblemTemplate,
  [coneInclinedBoth.id]: coneInclinedBoth as unknown as ProblemTemplate,
};
