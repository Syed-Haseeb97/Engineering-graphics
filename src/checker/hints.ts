import type { DraftEntity } from '../draft/types';
import type { TaggedSegment2 } from '../kernel/types';
import {
  HINT_TEMPLATES,
  type HintLevel,
  type HintLevelContent,
} from './hint-templates';
import type { EvaluationReport } from './types';

export type ViewCategory = 'FRONT' | 'TOP' | 'SIDE' | 'OVERALL';

/**
 * A pedagogical hint generated from drawing analysis.
 * Multiple repeated errors are grouped into a single hint with an occurrence count.
 */
export interface GeneratedHint {
  readonly id: string;
  readonly templateKey: string;
  readonly view: ViewCategory;
  readonly count: number;
  readonly level1: string;
  readonly level2: string;
  readonly level3: string;
}

export interface HintUnlockResult {
  readonly hintId: string;
  readonly level: HintLevel;
  readonly text: string;
  readonly isMaxLevel: boolean;
}

export interface FacultyHintAnalytics {
  readonly totalHintsAvailable: number;
  readonly totalUnlocks: number;
  readonly unlockedLevelCounts: {
    readonly level1: number;
    readonly level2: number;
    readonly level3: number;
  };
  readonly hintUsageById: Readonly<Record<string, HintLevel>>;
}

export interface HintContext {
  readonly studentEntities?: readonly DraftEntity[];
  readonly groundTruth?: readonly TaggedSegment2[];
  readonly params?: Readonly<Record<string, number>>;
}

/**
 * Look up content for a template key with a safe fallback.
 */
function getTemplateContent(key: string): HintLevelContent {
  const t = HINT_TEMPLATES[key];
  if (t) return t;
  return {
    level1: 'Please review this view for accuracy.',
    level2: `An issue was found in ${key.toLowerCase().replace(/_/g, ' ')}.`,
    level3: 'Refer to standard orthographic projection guidelines.',
  };
}

/**
 * Generate grouped pedagogical hints from the auto-checker evaluation report.
 *
 * Guaranteed Properties:
 * 1. Points to geometric CONCEPTS without revealing coordinates or values.
 * 2. Groups repeated errors (e.g. 6 missing hidden lines in top view -> 1 hint with count 6).
 * 3. Provides three graduated levels (vague location, specific view/error, concept reminder).
 */
export function generateHints(
  report: EvaluationReport,
  context?: HintContext,
): readonly GeneratedHint[] {
  const hints: GeneratedHint[] = [];

  // 1. Handle Alignment Failures
  if (!report.success) {
    const errorKey = report.error ?? 'MISSING_XY_LINE';
    const tmpl = getTemplateContent(errorKey);
    hints.push({
      id: errorKey.toLowerCase(),
      templateKey: errorKey,
      view: 'OVERALL',
      count: 1,
      level1: tmpl.level1,
      level2: tmpl.level2,
      level3: tmpl.level3,
    });
    return hints;
  }

  // 2. Projector Misalignment and View Distance Checks (if context or edges permit)
  const frontEdges = report.edges.filter((e) => e.view === 'FRONT');
  const topEdges = report.edges.filter((e) => e.view === 'TOP');

  if (frontEdges.length > 0 && topEdges.length > 0) {
    const frontMinX = Math.min(...frontEdges.map((e) => Math.min(e.p1.x, e.p2.x)));
    const frontMaxX = Math.max(...frontEdges.map((e) => Math.max(e.p1.x, e.p2.x)));
    const topMinX = Math.min(...topEdges.map((e) => Math.min(e.p1.x, e.p2.x)));
    const topMaxX = Math.max(...topEdges.map((e) => Math.max(e.p1.x, e.p2.x)));

    let expectedDeltaMinX = 0;
    let expectedDeltaMaxX = 0;

    if (context?.groundTruth) {
      const gtFront = context.groundTruth.filter((g) => (g.p1.y + g.p2.y) / 2 > 0);
      const gtTop = context.groundTruth.filter((g) => (g.p1.y + g.p2.y) / 2 < 0);
      if (gtFront.length > 0 && gtTop.length > 0) {
        const gtFrontMinX = Math.min(...gtFront.map((e) => Math.min(e.p1.x, e.p2.x)));
        const gtFrontMaxX = Math.max(...gtFront.map((e) => Math.max(e.p1.x, e.p2.x)));
        const gtTopMinX = Math.min(...gtTop.map((e) => Math.min(e.p1.x, e.p2.x)));
        const gtTopMaxX = Math.max(...gtTop.map((e) => Math.max(e.p1.x, e.p2.x)));
        expectedDeltaMinX = gtFrontMinX - gtTopMinX;
        expectedDeltaMaxX = gtFrontMaxX - gtTopMaxX;
      }
    }

    const deltaMinX = frontMinX - topMinX;
    const deltaMaxX = frontMaxX - topMaxX;

    // Detect if student's relative projector alignment deviates from expected ground truth
    if (Math.abs(deltaMinX - expectedDeltaMinX) > 3.0 || Math.abs(deltaMaxX - expectedDeltaMaxX) > 3.0) {
      const tmpl = getTemplateContent('PROJECTOR_MISALIGNMENT');
      hints.push({
        id: 'projector_misalignment',
        templateKey: 'PROJECTOR_MISALIGNMENT',
        view: 'OVERALL',
        count: 1,
        level1: tmpl.level1,
        level2: tmpl.level2,
        level3: tmpl.level3,
      });
    }
  }

  // Check Elevation from HP / Distance from VP if ground truth is provided in context
  if (context?.groundTruth && context.groundTruth.length > 0 && frontEdges.length > 0) {
    const gtFront = context.groundTruth.filter((g) => (g.p1.y + g.p2.y) / 2 > 0);
    if (gtFront.length > 0) {
      const studentMinY = Math.min(...frontEdges.map((e) => Math.min(e.p1.y, e.p2.y)));
      const gtMinY = Math.min(...gtFront.map((e) => Math.min(e.p1.y, e.p2.y)));
      // If student front view elevation differs significantly from ground truth
      if (Math.abs(studentMinY - gtMinY) > 5.0) {
        const tmpl = getTemplateContent('FRONT_VIEW_HP_DISTANCE');
        hints.push({
          id: 'front_view_hp_distance',
          templateKey: 'FRONT_VIEW_HP_DISTANCE',
          view: 'FRONT',
          count: 1,
          level1: tmpl.level1,
          level2: tmpl.level2,
          level3: tmpl.level3,
        });
      }
    }
  }

  // 3. Group Missing Edges by View and Expected Line Type
  const missingByGroup = new Map<string, { view: ViewCategory; lineType: 'visible' | 'hidden'; count: number }>();

  for (const edge of report.edges) {
    if (edge.status === 'missing') {
      const view = (edge.view === 'UNKNOWN' ? 'FRONT' : edge.view) as ViewCategory;
      const lt = edge.expectedLineType ?? 'visible';
      const groupKey = `${view}_${lt}`;
      const existing = missingByGroup.get(groupKey);
      if (existing) {
        existing.count++;
      } else {
        missingByGroup.set(groupKey, { view, lineType: lt, count: 1 });
      }
    }
  }

  for (const [groupKey, group] of missingByGroup.entries()) {
    const templateKey = group.lineType === 'hidden'
      ? `MISSING_HIDDEN_${group.view}`
      : `MISSING_VISIBLE_${group.view}`;
    const tmpl = getTemplateContent(templateKey);

    hints.push({
      id: `missing_${groupKey.toLowerCase()}`,
      templateKey,
      view: group.view,
      count: group.count,
      level1: tmpl.level1,
      level2: tmpl.level2,
      level3: tmpl.level3,
    });
  }

  // 4. Group Wrong Line Type Edges by View
  const wrongTypeByView = new Map<ViewCategory, number>();
  for (const edge of report.edges) {
    if (edge.status === 'wrongType') {
      const view = (edge.view === 'UNKNOWN' ? 'FRONT' : edge.view) as ViewCategory;
      wrongTypeByView.set(view, (wrongTypeByView.get(view) ?? 0) + 1);
    }
  }

  for (const [view, count] of wrongTypeByView.entries()) {
    const templateKey = `WRONG_LINE_TYPE_${view}`;
    const tmpl = getTemplateContent(templateKey);
    hints.push({
      id: `wrong_line_type_${view.toLowerCase()}`,
      templateKey,
      view,
      count,
      level1: tmpl.level1,
      level2: tmpl.level2,
      level3: tmpl.level3,
    });
  }

  // 5. Group Extra / Stray Edges by View
  const extraByView = new Map<ViewCategory, number>();
  for (const edge of report.edges) {
    if (edge.status === 'extra') {
      const view = (edge.view === 'UNKNOWN' ? 'FRONT' : edge.view) as ViewCategory;
      extraByView.set(view, (extraByView.get(view) ?? 0) + 1);
    }
  }

  for (const [view, count] of extraByView.entries()) {
    const templateKey = `EXTRA_EDGE_${view}`;
    const tmpl = getTemplateContent(templateKey);
    hints.push({
      id: `extra_edge_${view.toLowerCase()}`,
      templateKey,
      view,
      count,
      level1: tmpl.level1,
      level2: tmpl.level2,
      level3: tmpl.level3,
    });
  }

  // 6. Complete and Correct Case
  if (hints.length === 0 && report.overallScore >= 95) {
    const tmpl = getTemplateContent('ALL_CORRECT');
    hints.push({
      id: 'all_correct',
      templateKey: 'ALL_CORRECT',
      view: 'OVERALL',
      count: 1,
      level1: tmpl.level1,
      level2: tmpl.level2,
      level3: tmpl.level3,
    });
  }

  return hints;
}

/**
 * Interactive Student Hint Session.
 *
 * Manages incremental unlocking of graduated hint levels (Level 1 -> 2 -> 3)
 * and maintains audit metrics for faculty analytics.
 */
export class StudentHintSession {
  private readonly hintsById = new Map<string, GeneratedHint>();
  private readonly unlockedLevels = new Map<string, HintLevel>();
  private unlockCounter = 0;

  constructor(public readonly hints: readonly GeneratedHint[]) {
    for (const h of hints) {
      this.hintsById.set(h.id, h);
    }
  }

  /**
   * Unlock the next progressive hint level for a given hint.
   * If already at level 3, returns level 3 with isMaxLevel = true.
   */
  public unlockNextLevel(hintId: string): HintUnlockResult {
    const hint = this.hintsById.get(hintId);
    if (!hint) {
      throw new Error(`Hint with id "${hintId}" does not exist in this session.`);
    }

    const currentLevel = this.unlockedLevels.get(hintId) ?? 0;
    let nextLevel: HintLevel;

    if (currentLevel === 0) {
      nextLevel = 1;
      this.unlockCounter++;
    } else if (currentLevel === 1) {
      nextLevel = 2;
      this.unlockCounter++;
    } else {
      nextLevel = 3;
      if (currentLevel < 3) {
        this.unlockCounter++;
      }
    }

    this.unlockedLevels.set(hintId, nextLevel);

    const text =
      nextLevel === 1 ? hint.level1 : nextLevel === 2 ? hint.level2 : hint.level3;

    return {
      hintId,
      level: nextLevel,
      text,
      isMaxLevel: nextLevel === 3,
    };
  }

  /**
   * Get all currently unlocked hints for the student.
   */
  public getUnlockedHints(): readonly {
    hintId: string;
    level: HintLevel;
    text: string;
    view: ViewCategory;
    count: number;
  }[] {
    const results: {
      hintId: string;
      level: HintLevel;
      text: string;
      view: ViewCategory;
      count: number;
    }[] = [];

    for (const [id, level] of this.unlockedLevels.entries()) {
      const hint = this.hintsById.get(id);
      if (hint) {
        const text =
          level === 1 ? hint.level1 : level === 2 ? hint.level2 : hint.level3;
        results.push({
          hintId: id,
          level,
          text,
          view: hint.view,
          count: hint.count,
        });
      }
    }

    return results;
  }

  /**
   * Retrieve aggregate hint usage metrics for faculty review.
   */
  public getFacultyAnalytics(): FacultyHintAnalytics {
    let l1 = 0;
    let l2 = 0;
    let l3 = 0;

    const usageById: Record<string, HintLevel> = {};

    for (const [id, level] of this.unlockedLevels.entries()) {
      usageById[id] = level;
      if (level === 1) l1++;
      else if (level === 2) l2++;
      else if (level === 3) l3++;
    }

    return {
      totalHintsAvailable: this.hints.length,
      totalUnlocks: this.unlockCounter,
      unlockedLevelCounts: {
        level1: l1,
        level2: l2,
        level3: l3,
      },
      hintUsageById: usageById,
    };
  }
}
