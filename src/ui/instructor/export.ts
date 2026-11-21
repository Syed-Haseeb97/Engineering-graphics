import type { AssignmentSummary, StudentSubmissionRow } from './types';

/**
 * Format session drafting duration in minutes and seconds.
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

/**
 * Escape string for RFC 4180 CSV compliance.
 */
function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate CSV representation of cohort assignment grades.
 */
export function generateGradesCsv(
  assignment: AssignmentSummary,
  submissions: readonly StudentSubmissionRow[],
): string {
  const headers = [
    'Roll No',
    'Student Name',
    'Section',
    'Status',
    'Score',
    'Max Marks',
    'Recall %',
    'Precision %',
    'Line Type %',
    'Dimensions %',
    'Hints Used',
    'Time Spent',
    'Late Submission',
    'Similarity Review Flag',
    'Reviewed By',
    'Feedback',
  ];

  const rows = submissions.map((row) => {
    const simFlag = row.similarityFlag
      ? `${row.similarityFlag.similarityScore}% match with ${row.similarityFlag.partnerName} (${row.similarityFlag.partnerRollNo})`
      : 'None';

    return [
      escapeCsv(row.rollNo),
      escapeCsv(row.name),
      escapeCsv(row.section),
      escapeCsv(row.status.toUpperCase()),
      escapeCsv(row.score !== null ? row.score : 'N/A'),
      escapeCsv(assignment.maxMarks),
      escapeCsv(row.breakdown ? Math.round(row.breakdown.recall * 100) : 'N/A'),
      escapeCsv(row.breakdown ? Math.round(row.breakdown.precision * 100) : 'N/A'),
      escapeCsv(row.breakdown ? Math.round(row.breakdown.lineType * 100) : 'N/A'),
      escapeCsv(row.breakdown ? Math.round(row.breakdown.dimensions * 100) : 'N/A'),
      escapeCsv(row.hintsUsed),
      escapeCsv(formatDuration(row.timeSpentSec)),
      escapeCsv(row.isLate ? 'YES' : 'NO'),
      escapeCsv(simFlag),
      escapeCsv(row.reviewedBy ?? 'Automated'),
      escapeCsv(row.feedback ?? ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

/**
 * Generate structured JSON export of cohort assignment grades.
 */
export function generateGradesJson(
  assignment: AssignmentSummary,
  submissions: readonly StudentSubmissionRow[],
): string {
  const gradedList = submissions.filter((s) => s.score !== null);
  const totalScore = gradedList.reduce((acc, s) => acc + (s.score ?? 0), 0);
  const avgScore = gradedList.length > 0 ? Math.round((totalScore / gradedList.length) * 10) / 10 : null;

  const payload = {
    course: 'Engineering Graphics & Computer-Aided Design',
    assignment: {
      id: assignment.id,
      title: assignment.title,
      section: assignment.section,
      maxMarks: assignment.maxMarks,
      opensAt: assignment.opensAt,
      dueAt: assignment.dueAt,
    },
    exportTimestamp: new Date().toISOString(),
    statistics: {
      totalEnrolled: submissions.length,
      submittedCount: submissions.filter((s) => s.status === 'submitted' || s.status === 'graded').length,
      gradedCount: gradedList.length,
      averageScore: avgScore,
      flaggedCount: submissions.filter((s) => s.similarityFlag || s.isLate).length,
    },
    grades: submissions.map((row) => ({
      rollNo: row.rollNo,
      name: row.name,
      section: row.section,
      status: row.status,
      score: row.score,
      maxMarks: assignment.maxMarks,
      breakdown: row.breakdown ?? null,
      hintsUsed: row.hintsUsed,
      unlockedHintLevels: row.unlockedHintLevels,
      timeSpentSec: row.timeSpentSec,
      isLate: row.isLate,
      similarityFlag: row.similarityFlag ?? null,
      reviewedBy: row.reviewedBy ?? null,
      feedback: row.feedback ?? null,
      submittedAt: row.submittedAt ?? null,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Trigger browser file download for exported text/CSV/JSON content.
 */
export function triggerDownload(content: string, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
