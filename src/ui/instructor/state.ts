import type {
  AssignmentSummary,
  InstructorProfile,
  InstructorTab,
  StudentSubmissionRow,
  SubmissionReviewDetails,
} from './types';

const STORAGE_KEY_INSTRUCTOR = 'eg_instructor_profile';

export class InstructorStateManager {
  public instructor: InstructorProfile = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Prof. H. Sharma',
    email: 'h.sharma@college.edu',
    role: 'instructor',
    sections: ['A', 'B', 'C'],
    token: btoa(
      JSON.stringify({
        sub: '00000000-0000-0000-0000-000000000001',
        email: 'h.sharma@college.edu',
        role: 'instructor',
        sections: ['A', 'B', 'C'],
      }),
    ),
  };

  public activeTab: InstructorTab = 'dashboard';
  public selectedSection = 'A';
  public assignments: readonly AssignmentSummary[] = [];
  public selectedAssignmentId: string | null = null;
  public submissions: readonly StudentSubmissionRow[] = [];
  public searchQuery = '';
  public statusFilter: 'all' | 'submitted' | 'flagged' = 'all';
  public sortBy: 'rollNo' | 'name' | 'score' | 'timeSpent' = 'rollNo';
  public sortDirection: 'asc' | 'desc' = 'asc';

  public activeReviewDetails: SubmissionReviewDetails | null = null;

  private listeners: Array<() => void> = [];

  constructor() {
    this.restoreSession();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private restoreSession(): void {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_INSTRUCTOR);
      if (saved) {
        this.instructor = JSON.parse(saved) as InstructorProfile;
      }
    } catch {
      // Keep default instructor
    }
  }

  public setTab(tab: InstructorTab): void {
    this.activeTab = tab;
    this.notify();
  }

  public setSection(section: string): void {
    this.selectedSection = section;
    this.notify();
  }

  public setAssignments(assignments: readonly AssignmentSummary[]): void {
    this.assignments = assignments;
    if (assignments.length > 0 && (!this.selectedAssignmentId || !assignments.some((a) => a.id === this.selectedAssignmentId))) {
      this.selectedAssignmentId = assignments[0]!.id;
    }
    this.notify();
  }

  public selectAssignment(assignmentId: string): void {
    this.selectedAssignmentId = assignmentId;
    this.notify();
  }

  public setSubmissions(submissions: readonly StudentSubmissionRow[]): void {
    this.submissions = submissions;
    this.notify();
  }

  public setSearchQuery(query: string): void {
    this.searchQuery = query;
    this.notify();
  }

  public setStatusFilter(filter: 'all' | 'submitted' | 'flagged'): void {
    this.statusFilter = filter;
    this.notify();
  }

  public setSorting(sortBy: 'rollNo' | 'name' | 'score' | 'timeSpent'): void {
    if (this.sortBy === sortBy) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = sortBy;
      this.sortDirection = 'asc';
    }
    this.notify();
  }

  public openReview(details: SubmissionReviewDetails): void {
    this.activeReviewDetails = details;
    this.notify();
  }

  public closeReview(): void {
    this.activeReviewDetails = null;
    this.notify();
  }

  public updateGradeInState(gradeId: string, newScore: number, feedback: string, reviewerId: string): void {
    this.submissions = this.submissions.map((sub) => {
      if (sub.gradeId === gradeId || (this.activeReviewDetails && sub.studentId === this.activeReviewDetails.studentRow.studentId)) {
        return {
          ...sub,
          score: newScore,
          feedback,
          reviewedBy: reviewerId,
          status: 'graded',
        };
      }
      return sub;
    });

    if (this.activeReviewDetails) {
      const updatedRow = this.submissions.find((s) => s.studentId === this.activeReviewDetails!.studentRow.studentId);
      if (updatedRow) {
        this.activeReviewDetails = {
          ...this.activeReviewDetails,
          studentRow: updatedRow,
          auditLog: [
            ...this.activeReviewDetails.auditLog,
            {
              id: `audit_${Date.now()}`,
              actor: reviewerId,
              action: 'GRADE_OVERRIDE',
              target: gradeId,
              at: new Date().toISOString(),
              metadata: {
                oldScore: this.activeReviewDetails.studentRow.score ?? 0,
                newScore,
                studentId: updatedRow.studentId,
                rollNo: updatedRow.rollNo,
                reason: feedback,
              },
            },
          ],
        };
      }
    }

    this.notify();
  }

  /**
   * Return filtered and sorted student submission rows for the active assignment.
   */
  public getVisibleSubmissions(): readonly StudentSubmissionRow[] {
    let list = [...this.submissions];

    // Filter by search query (roll number or name)
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => s.rollNo.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }

    // Filter by status tab
    if (this.statusFilter === 'submitted') {
      list = list.filter((s) => s.status === 'submitted' || s.status === 'graded');
    } else if (this.statusFilter === 'flagged') {
      list = list.filter((s) => Boolean(s.similarityFlag) || s.isLate);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (this.sortBy) {
        case 'rollNo':
          cmp = a.rollNo.localeCompare(b.rollNo);
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'score':
          cmp = (a.score ?? -1) - (b.score ?? -1);
          break;
        case 'timeSpent':
          cmp = a.timeSpentSec - b.timeSpentSec;
          break;
      }
      return this.sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }
}
