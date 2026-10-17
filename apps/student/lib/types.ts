export type Question = {
  id: number; class: string; subject: string; topic: string; subtopic: string | null;
  tier: number; is_visual: boolean; kind: 'mcq' | 'typed';
  prompt: string; options: string[] | null; answer: string; explain?: string | null;
  image_url?: string | null;
};

export type Assignment = {
  user_id: string;
  forced_class: string | null; forced_subject: string | null;
  forced_topic: string | null; forced_subtopic?: string | null;
  forced_tier: number | null;
  allow_notes: boolean; allow_practice_with_answers: boolean;
  allow_practice_no_answers: boolean; note: string | null;
};

export type ExamAssignment = {
  id: number; exam_id: number; user_id: string;
  status: 'locked' | 'in_progress' | 'completed'; score: number | null;
};

export type Profile = {
  user_id: string; display_name: string | null; class: string | null; role: string;
};

// One topic's tier state, kept per user
export const TIER_UNLOCK_KEY = 'sp_tier_unlocks'; // { "P4|Math|Fractions": maxUnlockedTier }
export const PASS_MARK = 0.8;                      // 12/15 = 80% to level up
export const TIER_NAMES = ['Comfort', 'Language', 'Bridge', 'Easy Ops', 'PLE UNEB'];
