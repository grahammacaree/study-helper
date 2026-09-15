export type SessionKind = "debrief" | "quiz" | "quest" | "concept" | "find";

export type Phase =
  | "awaiting_summary"
  | "debrief"
  | "correction_gate"
  | "quiz_item"
  | "quiz_wrap"
  | "quest"
  | "quest_gate"
  | "concept"
  | "find"
  | "done";

export type LectureStatus = "incomplete" | "complete";

export type KnowledgeStatus = "known" | "shaky" | "unseen";

export type TeachbackKind =
  | "adequate"
  | "thin"
  | "question_before"
  | "question_after";

export interface CourseMeta {
  id: string;
  title: string;
  instructors: string;
  sourceUrl: string;
  /** currently = in flight; previously = finished; later = catalogued, not in the nav. */
  track?: "currently" | "previously" | "later";
  /** Latest lecture underway (1..latest-1 treated as complete). */
  latest?: number;
  /** Every lecture has been debriefed (complete). */
  complete?: boolean;
}

export interface Lecture {
  n: number;
  title: string;
  url: string;
  conceptIds: string[];
}

export interface ConceptDef {
  name: string;
  parentId?: string;
  seeAlso?: string[];
}

export type TheoremStatus = "asserted" | "proved";

export interface ConceptTheorem {
  claim: string;
  status: TheoremStatus;
  proof?: string;
}

export interface KnowledgeEntry {
  id: string;
  status: KnowledgeStatus;
  note: string;
  /** Working example from a summary. Never invented. */
  example?: string;
  /** Terms from a vocabulary-pass summary. Never invented. */
  vocab?: string[];
  /** Claims from a summary. Proved if he later wrote a sketch, even on another course. */
  theorems?: ConceptTheorem[];
}

export interface DecayEcho {
  at: number;
  via: string;
  courseId?: string;
  lectureN?: number;
  note?: string;
}

export interface DecayView {
  freshness: number;
  directAt?: number;
  seeded?: boolean;
  lastEcho?: DecayEcho;
}

export interface QuizLogEntry {
  lastAt: number;
  adequate: number;
  thin: number;
}

export interface SideQuest {
  id: string;
  title: string;
  status: "open" | "parked" | "done";
  source: "user" | "model";
  courseId?: string;
  lectureN?: number;
  notes: string;
  /** Learner-owned concept id, set when the quest is marked done. */
  conceptId?: string;
}

export interface OfferedQuest {
  title: string;
  why: string;
}

export interface OfferedCourse {
  title: string;
  url: string;
  why: string;
}

export interface DebriefCard {
  corrections: string[];
  gaps: string[];
  summaryNote: string;
  offeredQuests: OfferedQuest[];
}

export interface QuizChoice {
  id: string;
  text: string;
}

export interface QuizItem {
  conceptId: string;
  prompt: string;
  choices: QuizChoice[];
  correctId: string;
  noteHint?: string;
  why?: string;
  index: number;
  total: number;
  pickedId?: string;
}

export interface TeachbackResult {
  adequate: boolean;
  kind: TeachbackKind;
  message: string;
}

export type MessageRole = "user" | "assistant";

export type MessageKind =
  | "text"
  | "debrief"
  | "quiz"
  | "teachback"
  | "status";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  text: string;
  at: number;
  debrief?: DebriefCard;
  quiz?: QuizItem;
}

export interface InspectPayload {
  courseId: string;
  courseTitle: string;
  lecture?: Lecture;
  courseBlurb: string;
  knowledgeSlice: string;
  lectureSummary: string;
  sideQuests: SideQuest[];
}

export interface SessionSnapshot {
  id: string;
  kind: SessionKind;
  phase: Phase;
  courseId: string;
  lectureN?: number;
  questTitle?: string;
  questId?: string;
  conceptId?: string;
  offersConceptQuiz?: boolean;
  debrief?: DebriefCard;
  quiz?: QuizItem;
  quizQueue: string[];
  coveredConcepts: string[];
  quizMode?: "after_debrief" | "review" | "course_end" | "quest" | "concept";
  pendingCorrection?: string;
  wantQuestQuiz?: boolean;
  questTeachbackOk?: boolean;
  questQuizOk?: boolean;
  teachback?: TeachbackResult;
  inspect: InspectPayload;
  messages: ChatMessage[];
  offeredQuests: OfferedQuest[];
  offeredCourses?: OfferedCourse[];
  busy: boolean;
  workingOn?: string;
  generatingOutline?: string[];
  error?: string;
}

export interface CatalogCourse extends CourseMeta {
  blurb: string;
  lectures: Array<Lecture & { status: LectureStatus }>;
}

export interface CatalogPayload {
  courses: CatalogCourse[];
  concepts: Record<string, ConceptDef>;
  knowledge: KnowledgeEntry[];
  decay: Record<string, DecayView>;
  openQuests: SideQuest[];
  questConceptIds: string[];
  conceptTeachings?: Record<string, string>;
}

export interface AuthStatus {
  hasKey: boolean;
  configured: boolean;
  models?: string[];
  error?: string;
}
