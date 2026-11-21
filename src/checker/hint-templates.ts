/**
 * Pedagogical Hint Templates for Engineering Graphics Auto-Checker.
 *
 * Faculty and instructors can edit wording, pedagogical framing, and guidance here
 * without modifying the underlying checking algorithms.
 *
 * CRITICAL RULE:
 * Hint templates must point at the underlying geometric CONCEPT and MUST NEVER
 * contain hard-coded numeric parameters, coordinates, or dimensions.
 */

export type HintLevel = 1 | 2 | 3;

export interface HintLevelContent {
  /** Level 1: Vague location / area where the student should look. */
  readonly level1: string;
  /** Level 2: Specific view and nature of the error (what kind of error). */
  readonly level2: string;
  /** Level 3: Conceptual reminder / underlying technical drawing standard rule. */
  readonly level3: string;
}

export const HINT_TEMPLATES: Record<string, HintLevelContent> = {
  // Alignment & Reference Line
  MISSING_XY_LINE: {
    level1: 'A reference line is required on the drawing sheet.',
    level2: 'Your drawing is missing the horizontal reference line XY separating elevation and plan.',
    level3:
      'In orthographic projection, the reference line XY represents the intersection of the HP and VP; front view is drawn above XY and top view below it.',
  },
  NON_HORIZONTAL_XY_LINE: {
    level1: 'Check the reference line orientation.',
    level2: 'The reference line XY is inclined or not horizontal.',
    level3:
      'The reference line XY must be drawn horizontally as the ground datum line separating elevation and plan.',
  },

  // Missing Hidden Edges
  MISSING_HIDDEN_FRONT: {
    level1: 'Check for missing internal details in the front view.',
    level2: 'A hidden edge is missing in the front view.',
    level3:
      'Edges that are obscured by solid material when viewed from the front must be drawn as dashed lines.',
  },
  MISSING_HIDDEN_TOP: {
    level1: 'Check for missing internal details in the top view.',
    level2: 'A hidden edge is missing in the top view.',
    level3:
      'Edges that are obscured by other parts of the solid when viewed from above must be drawn as dashed lines.',
  },
  MISSING_HIDDEN_SIDE: {
    level1: 'Check for missing internal details in the side view.',
    level2: 'A hidden edge is missing in the side view.',
    level3:
      'Edges that are obscured from the profile viewing direction must be drawn as dashed lines.',
  },

  // Missing Visible Edges
  MISSING_VISIBLE_FRONT: {
    level1: 'Check the outer boundary in the front view.',
    level2: 'A visible outline or edge is missing in the front view.',
    level3:
      'All visible boundaries and intersection edges in elevation must be drawn with continuous thick lines.',
  },
  MISSING_VISIBLE_TOP: {
    level1: 'Check the outer boundary in the top view.',
    level2: 'A visible outline or edge is missing in the top view.',
    level3:
      'All visible boundaries and intersection edges in plan must be drawn with continuous thick lines.',
  },
  MISSING_VISIBLE_SIDE: {
    level1: 'Check the outer boundary in the side view.',
    level2: 'A visible outline or edge is missing in the side view.',
    level3:
      'All visible profile boundaries and intersection edges must be drawn with continuous thick lines.',
  },

  // Wrong Line Type (e.g. continuous drawn as dashed, or dashed drawn as continuous)
  WRONG_LINE_TYPE_FRONT: {
    level1: 'Check line types in the front view.',
    level2: 'An edge in the front view is drawn with the wrong line type.',
    level3:
      'Distinguish carefully between continuous lines for visible edges and dashed lines for hidden edges.',
  },
  WRONG_LINE_TYPE_TOP: {
    level1: 'Check line types in the top view.',
    level2: 'An edge in the top view is drawn with the wrong line type.',
    level3:
      'Distinguish carefully between continuous lines for visible edges and dashed lines for hidden edges.',
  },
  WRONG_LINE_TYPE_SIDE: {
    level1: 'Check line types in the side view.',
    level2: 'An edge in the side view is drawn with the wrong line type.',
    level3:
      'Distinguish carefully between continuous lines for visible edges and dashed lines for hidden edges.',
  },

  // Extra / Spurious Lines
  EXTRA_EDGE_FRONT: {
    level1: 'Check for extra lines in the front view.',
    level2: 'There are unnecessary or stray lines in the front view.',
    level3:
      'Only true edges and silhouette boundaries of the solid should remain in the final drawing; erase construction marks.',
  },
  EXTRA_EDGE_TOP: {
    level1: 'Check for extra lines in the top view.',
    level2: 'There are unnecessary or stray lines in the top view.',
    level3:
      'Only true edges and silhouette boundaries of the solid should remain in the final drawing; erase construction marks.',
  },
  EXTRA_EDGE_SIDE: {
    level1: 'Check for extra lines in the side view.',
    level2: 'There are unnecessary or stray lines in the side view.',
    level3:
      'Only true edges and silhouette boundaries of the solid should remain in the final drawing; erase construction marks.',
  },

  // View Relationships & Projectors
  PROJECTOR_MISALIGNMENT: {
    level1: 'Check the alignment between views.',
    level2: 'Projectors between the front and top view are not aligned.',
    level3:
      'In first-angle projection, corresponding points in the front view and top view must lie on the same vertical projector.',
  },
  FRONT_VIEW_HP_DISTANCE: {
    level1: 'Check the vertical position of the front view.',
    level2: 'Your front view height does not match the distance from HP given in the problem.',
    level3:
      'Distances of points above the Horizontal Plane (HP) are measured vertically upwards from the XY reference line in the front view.',
  },
  TOP_VIEW_VP_DISTANCE: {
    level1: 'Check the vertical position of the top view.',
    level2: 'Your top view distance does not match the distance from VP given in the problem.',
    level3:
      'Distances of points in front of the Vertical Plane (VP) are measured vertically downwards from the XY reference line in the top view.',
  },
  INCLINATION_ANGLE: {
    level1: 'Check the inclination of the solid.',
    level2:
      'The inclination of the axis to HP does not look right; check which plane the true angle is measured in.',
    level3:
      'When an axis or edge is inclined to a principal plane, its true inclination appears in the view projected onto that plane, while the other view shows a foreshortened apparent angle.',
  },

  // Success / Perfect match
  ALL_CORRECT: {
    level1: 'Drawing is well aligned and complete.',
    level2: 'All required views and line types match the canonical projection.',
    level3:
      'Your orthographic projection satisfies first-angle technical drawing standards and accuracy criteria.',
  },
};
