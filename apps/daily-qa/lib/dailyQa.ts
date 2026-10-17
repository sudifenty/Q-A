import { supabase } from './supabase';

export type DailyQAItem = {
  question_id: string;
  position: number;
  grade: string;
  subject: string;
  topic: string;
  question: string;
  answer: string;
  completed_at: string | null;
};

export type DailyQAStatus = 'active' | 'complete' | 'paused' | 'exhausted';

export type DailyQASet = {
  status: DailyQAStatus;
  assignment_id?: string;
  set_number?: number;
  assigned_date?: string;
  target?: number;
  requested_target?: number;
  completed_count?: number;
  items?: DailyQAItem[];
  message?: string;
  grade?: string;
  subject?: string;
};

function normalizeSet(value: unknown): DailyQASet {
  if (!value || typeof value !== 'object') {
    throw new Error('The daily-set service returned an empty response.');
  }
  const row = value as Record<string, unknown>;
  const allowed: DailyQAStatus[] = ['active', 'complete', 'paused', 'exhausted'];
  if (!allowed.includes(row.status as DailyQAStatus)) {
    throw new Error('The daily-set service returned an unknown status.');
  }
  return {
    status: row.status as DailyQAStatus,
    assignment_id: typeof row.assignment_id === 'string' ? row.assignment_id : undefined,
    set_number: typeof row.set_number === 'number' ? row.set_number : undefined,
    assigned_date: typeof row.assigned_date === 'string' ? row.assigned_date : undefined,
    target: typeof row.target === 'number' ? row.target : undefined,
    requested_target: typeof row.requested_target === 'number' ? row.requested_target : undefined,
    completed_count: typeof row.completed_count === 'number' ? row.completed_count : undefined,
    items: Array.isArray(row.items) ? row.items as DailyQAItem[] : [],
    message: typeof row.message === 'string' ? row.message : undefined,
    grade: typeof row.grade === 'string' ? row.grade : undefined,
    subject: typeof row.subject === 'string' ? row.subject : undefined
  };
}

export async function getOrStartDailySet(): Promise<DailyQASet> {
  const { data, error } = await supabase.rpc('daily_qa_get_or_start_set');
  if (error) throw new Error(error.message);
  return normalizeSet(data);
}

export async function markQuestionStudied(assignmentId: string, questionId: string): Promise<DailyQASet> {
  const { data, error } = await supabase.rpc('daily_qa_complete_item', {
    p_assignment_id: assignmentId,
    p_question_id: questionId
  });
  if (error) throw new Error(error.message);
  return normalizeSet(data);
}
