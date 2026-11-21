import { describe, expect, it } from 'vitest';
import type { DraftEntity } from '../../../draft/types';
import {
  computeCohortSimilarities,
  computeEntitySimilarity,
  SIMILARITY_REVIEW_THRESHOLD,
} from '../similarity';
import type { StudentSubmissionRow } from '../types';

describe('Instructor Similarity Detection Suite', () => {
  const cubeFrontViewA: readonly DraftEntity[] = [
    { id: 'l1', type: 'line', p1: { x: 20, y: 10 }, p2: { x: 70, y: 10 }, lineType: 'continuous' },
    { id: 'l2', type: 'line', p1: { x: 70, y: 10 }, p2: { x: 70, y: 60 }, lineType: 'continuous' },
    { id: 'l3', type: 'line', p1: { x: 70, y: 60 }, p2: { x: 20, y: 60 }, lineType: 'continuous' },
    { id: 'l4', type: 'line', p1: { x: 20, y: 60 }, p2: { x: 20, y: 10 }, lineType: 'continuous' },
  ];

  const cubeFrontViewBIdentical: readonly DraftEntity[] = [
    // Endpoints reversed on some lines to test canonical normalization
    { id: 'b1', type: 'line', p1: { x: 70, y: 10 }, p2: { x: 20, y: 10 }, lineType: 'continuous' },
    { id: 'b2', type: 'line', p1: { x: 70, y: 10 }, p2: { x: 70, y: 60 }, lineType: 'continuous' },
    { id: 'b3', type: 'line', p1: { x: 20, y: 60 }, p2: { x: 70, y: 60 }, lineType: 'continuous' },
    { id: 'b4', type: 'line', p1: { x: 20, y: 60 }, p2: { x: 20, y: 10 }, lineType: 'continuous' },
  ];

  const cubeFrontViewBJittered: readonly DraftEntity[] = [
    // Shifted by 0.3 mm (within 1.0 mm tolerance)
    { id: 'j1', type: 'line', p1: { x: 20.3, y: 10.2 }, p2: { x: 69.8, y: 10.1 }, lineType: 'continuous' },
    { id: 'j2', type: 'line', p1: { x: 69.8, y: 10.1 }, p2: { x: 70.1, y: 59.9 }, lineType: 'continuous' },
    { id: 'j3', type: 'line', p1: { x: 70.1, y: 59.9 }, p2: { x: 20.1, y: 60.2 }, lineType: 'continuous' },
    { id: 'j4', type: 'line', p1: { x: 20.1, y: 60.2 }, p2: { x: 20.3, y: 10.2 }, lineType: 'continuous' },
  ];

  const disjointDrawingC: readonly DraftEntity[] = [
    { id: 'c1', type: 'line', p1: { x: 120, y: 15 }, p2: { x: 180, y: 15 }, lineType: 'continuous' },
    { id: 'c2', type: 'line', p1: { x: 180, y: 15 }, p2: { x: 150, y: 80 }, lineType: 'continuous' },
    { id: 'c3', type: 'line', p1: { x: 150, y: 80 }, p2: { x: 120, y: 15 }, lineType: 'continuous' },
  ];

  it('computes 100% similarity for identical geometry with reversed endpoints', () => {
    const res = computeEntitySimilarity(cubeFrontViewA, cubeFrontViewBIdentical);
    expect(res.score).toBe(1.0);
    expect(res.matchedCount).toBe(4);
    expect(res.totalCount).toBe(4);
  });

  it('matches segments within 1.0 mm positional tolerance', () => {
    const res = computeEntitySimilarity(cubeFrontViewA, cubeFrontViewBJittered);
    expect(res.score).toBe(1.0);
    expect(res.matchedCount).toBe(4);
  });

  it('computes 0% similarity for disjoint geometries', () => {
    const res = computeEntitySimilarity(cubeFrontViewA, disjointDrawingC);
    expect(res.score).toBe(0.0);
    expect(res.matchedCount).toBe(0);
  });

  it('computes 0% similarity when either submission is empty', () => {
    const res = computeEntitySimilarity(cubeFrontViewA, []);
    expect(res.score).toBe(0.0);
    expect(res.matchedCount).toBe(0);
  });

  it('flags high similarity pairs in a cohort while leaving unique submissions unflagged', () => {
    const mockCohort: StudentSubmissionRow[] = [
      {
        studentId: 'stud_1',
        rollNo: '22BCE10001',
        name: 'Aarav Patel',
        section: 'A',
        attemptId: 'att_1',
        status: 'submitted',
        score: 95,
        hintsUsed: 1,
        unlockedHintLevels: ['L1'],
        timeSpentSec: 600,
        isLate: false,
        entities: cubeFrontViewA,
      },
      {
        studentId: 'stud_2',
        rollNo: '22BCE10002',
        name: 'Priya Sharma',
        section: 'A',
        attemptId: 'att_2',
        status: 'submitted',
        score: 94,
        hintsUsed: 1,
        unlockedHintLevels: ['L1'],
        timeSpentSec: 650,
        isLate: false,
        entities: cubeFrontViewBIdentical,
      },
      {
        studentId: 'stud_3',
        rollNo: '22BCE10003',
        name: 'Rohan Iyer',
        section: 'A',
        attemptId: 'att_3',
        status: 'submitted',
        score: 80,
        hintsUsed: 2,
        unlockedHintLevels: ['L1', 'L2'],
        timeSpentSec: 900,
        isLate: false,
        entities: disjointDrawingC,
      },
    ];

    const flags = computeCohortSimilarities(mockCohort, SIMILARITY_REVIEW_THRESHOLD);

    // Both stud_1 and stud_2 must be flagged pointing to each other
    expect(flags.has('stud_1')).toBe(true);
    expect(flags.has('stud_2')).toBe(true);
    expect(flags.has('stud_3')).toBe(false);

    const flag1 = flags.get('stud_1')!;
    expect(flag1.partnerStudentId).toBe('stud_2');
    expect(flag1.partnerRollNo).toBe('22BCE10002');
    expect(flag1.similarityScore).toBe(100);

    const flag2 = flags.get('stud_2')!;
    expect(flag2.partnerStudentId).toBe('stud_1');
    expect(flag2.partnerRollNo).toBe('22BCE10001');
    expect(flag2.similarityScore).toBe(100);
  });
});
