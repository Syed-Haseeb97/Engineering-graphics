import { describe, expect, it } from 'vitest';
import { generateGradesCsv, generateGradesJson } from '../export';
import type { AssignmentSummary, StudentSubmissionRow } from '../types';

describe('Instructor Grade Export Suite', () => {
  const mockAssignment: AssignmentSummary = {
    id: '10000000-0000-0000-0000-000000000001',
    templateId: 'cone_inclined_both',
    title: 'Problem 1: Cone Projections',
    section: 'A',
    opensAt: '2026-10-25T10:00:00.000Z',
    dueAt: '2026-10-31T23:59:59.000Z',
    maxMarks: 100,
    totalStudents: 2,
    submittedCount: 2,
    gradedCount: 2,
    averageScore: 90.0,
  };

  const mockSubmissions: StudentSubmissionRow[] = [
    {
      studentId: 'stud_1',
      rollNo: '22BCE10001',
      name: 'Aarav Patel',
      section: 'A',
      attemptId: 'att_1',
      status: 'graded',
      score: 95,
      breakdown: { recall: 0.95, precision: 0.95, lineType: 0.95, dimensions: 1.0 },
      hintsUsed: 1,
      unlockedHintLevels: ['L1'],
      timeSpentSec: 720,
      isLate: false,
      reviewedBy: 'FAC_001',
      feedback: 'Excellent work, neat projectors.',
      entities: [],
    },
    {
      studentId: 'stud_2',
      rollNo: '22BCE10002',
      name: 'Priya Sharma',
      section: 'A',
      attemptId: 'att_2',
      status: 'graded',
      score: 85,
      breakdown: { recall: 0.85, precision: 0.85, lineType: 0.85, dimensions: 1.0 },
      hintsUsed: 2,
      unlockedHintLevels: ['L1', 'L2'],
      timeSpentSec: 900,
      isLate: true,
      similarityFlag: {
        partnerStudentId: 'stud_1',
        partnerRollNo: '22BCE10001',
        partnerName: 'Aarav Patel',
        similarityScore: 92,
        matchedCount: 8,
        totalCount: 9,
      },
      reviewedBy: null,
      feedback: 'Late submission.',
      entities: [],
    },
  ];

  it('generates compliant CSV with proper escaping for commas and quotes', () => {
    const csv = generateGradesCsv(mockAssignment, mockSubmissions);

    expect(csv).toContain('Roll No,Student Name,Section,Status,Score');
    expect(csv).toContain('22BCE10001,Aarav Patel,A,GRADED,95,100,95,95,95,100,1,12m 0s,NO,None,FAC_001,"Excellent work, neat projectors."');
    expect(csv).toContain('22BCE10002,Priya Sharma,A,GRADED,85,100,85,85,85,100,2,15m 0s,YES,92% match with Aarav Patel (22BCE10001)');
  });

  it('generates structured JSON export with cohort summary statistics', () => {
    const jsonStr = generateGradesJson(mockAssignment, mockSubmissions);
    const parsed = JSON.parse(jsonStr) as {
      course: string;
      statistics: {
        totalEnrolled: number;
        submittedCount: number;
        gradedCount: number;
        averageScore: number;
        flaggedCount: number;
      };
      grades: Array<{ rollNo: string; score: number; isLate: boolean }>;
    };

    expect(parsed.course).toContain('Engineering Graphics');
    expect(parsed.statistics.totalEnrolled).toBe(2);
    expect(parsed.statistics.submittedCount).toBe(2);
    expect(parsed.statistics.gradedCount).toBe(2);
    expect(parsed.statistics.averageScore).toBe(90);
    expect(parsed.statistics.flaggedCount).toBe(1); // Priya has late & similarity flags
    expect(parsed.grades[0]?.rollNo).toBe('22BCE10001');
    expect(parsed.grades[0]?.score).toBe(95);
    expect(parsed.grades[1]?.isLate).toBe(true);
  });
});
