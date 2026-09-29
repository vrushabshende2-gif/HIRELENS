export interface User {
  id: string;
  name: string;
  email: string;
  role: "candidate" | "recruiter";
  verified: boolean;
  organization?: string;
}
export interface Skill {
  topic: string;
  weight: number;
  minimum: number;
}
export interface Position {
  id: string;
  title: string;
  description: string;
  experience: string;
  skills: Skill[];
  difficulty_min: number;
  difficulty_max: number;
  archived: boolean;
  created_at: string;
}
export interface Concept {
  name: string;
  description: string;
  weight: number;
  critical: boolean;
}
export interface Question {
  id: string;
  title: string;
  topic: string;
  difficulty: number;
  kind: "text" | "code";
  language: "javascript" | "typescript" | "python";
  prompt: string;
  expected_answer: string;
  concepts: Concept[];
  reasoning_criteria: string;
  code_checks: { kind: string; description: string }[];
  starter_code: string;
  weight: number;
  expected_seconds: number;
  version: number;
  archived: boolean;
  created_at: string;
}
export interface Candidate {
  id: string;
  name: string;
  email: string;
  status: string;
  score: number | null;
  recommendation: string | null;
  report_id: string | null;
  drive_id: string;
  drive: string;
  position: string;
  time_seconds: number | null;
  created_at: string;
  expires_at: string;
  progress: number;
  question_count: number;
}
export interface Drive {
  id: string;
  name: string;
  position_id: string;
  position: string;
  status: string;
  opens_at: string;
  expires_at: string;
  question_count: number;
  duration_minutes: number;
  instructions: string;
  demo_data: boolean;
  invited: number;
  completed: number;
  average_score: number | null;
  skills: Skill[];
  created_at: string;
  candidates?: Candidate[];
}
export interface Overview {
  stats: {
    candidates: number;
    completed: number;
    completion_rate: number;
    average_score: number;
    active_drives: number;
  };
  drives: Drive[];
  recent_candidates: Candidate[];
  ai: {
    configured: boolean;
    worker_ready: boolean;
    model: string;
    data_policy: string;
  };
  organization: string;
}
export interface Evidence {
  concept: string;
  coverage: number;
  quote: string;
  start: number | null;
  end: number | null;
  explanation: string;
  contradiction: boolean;
}
export interface Evaluation {
  score: number;
  technical: number;
  reasoning: number;
  communication: number;
  efficiency: number;
  semantic: number;
  coverage: number;
  code_structure: number | null;
  evidence: Evidence[];
  feedback: string;
  confidence: string;
  flags: string[];
  model: string;
  rubric_version: string;
}
export interface Insight {
  attempt_id: string;
  quote: string;
  observation: string;
}
export interface Report {
  id: string;
  interview_id: string;
  drive_id: string;
  candidate: { name: string; email: string };
  position: string;
  drive: string;
  overall: number;
  recommendation: string;
  confidence: string;
  components: Record<string, number>;
  topics: {
    topic: string;
    score: number;
    raw_score: number;
    count: number;
    weight: number;
    minimum: number;
    uncertainty: number;
  }[];
  strengths: Insight[];
  weaknesses: Insight[];
  summary: string;
  narrative_status: string;
  source: string;
  answering_seconds: number;
  completed_at: string;
  stop_reason: string;
  integrity_events: number;
  transcript: {
    id: string;
    ordinal: number;
    question: Question;
    answer: string;
    elapsed_seconds: number;
    issued_at: string;
    submitted_at: string | null;
    selection_reason: { trigger?: string; explanation?: string; previous_score?: number | null; selected_difficulty?: number; topic_counts?: Record<string, number> };
    clarification_count: number;
    evaluation: Evaluation | null;
  }[];
  reviews: {
    decision: string;
    note: string;
    reviewer: string;
    created_at: string;
  }[];
}
export interface Analytics {
  drives: { id: string; name: string }[];
  candidates: Candidate[];
  distribution: { label: string; count: number }[];
  topics: { topic: string; score: number; candidates: number }[];
  average_score: number;
  average_seconds: number;
  completion_rate: number;
  recommendations: Record<string, number>;
  total: number;
}
export interface InterviewState {
  id: string;
  status: string;
  position: string;
  drive: string;
  question_count: number;
  completed_questions: number;
  answering_seconds: number;
  budget_seconds: number;
  instructions: string;
  stop_reason: string;
  processing: boolean;
  processing_error: string;
  processing_failed?: boolean;
  server_time: string;
  attempt: {
    id: string;
    ordinal: number;
    issued_at: string;
    draft: string;
    title: string;
    topic: string;
    prompt: string;
    kind: "text" | "code";
    language: string;
    starter_code: string;
  } | null;
}
