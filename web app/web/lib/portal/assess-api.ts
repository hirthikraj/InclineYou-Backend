/**
 * THE CLIENT'S ASSESSMENTS — the wire of api-contract 1.2 pa-l1 … pa-a2. Types only: the reads go through `portalGet`, the writes through
 * server actions. A body is measured in an assessment and nowhere else, so every reading on a screen is an assessment's own.
 */
export interface AssessItemWire {
  id: string;
  name: string;
  systemKey: string | null;
  state: 'open' | 'done';
  sentAt: number;
  dueOn: string;
  late: boolean;
  completedAt: number | null;
  asks: { measurements: number; questions: number };
}

export interface AssessPageWire {
  items: AssessItemWire[];
  counts?: { open: number; done: number };
  canStart: boolean;
  nextCursor: string | null;
}

export interface QuestionWire {
  id: string;
  text: string;
  kind: 'rating' | 'yesno' | 'text' | 'choice' | string;
  scale: number | null;
  options: { id: string; text: string }[];
  allowMultiple: boolean;
  allowCustom: boolean;
}

export interface AnswerWire {
  yes?: boolean;
  rating?: number;
  text?: string;
  optionIds?: string[];
}

export interface AssessDetailWire {
  id: string;
  name: string;
  state: 'open' | 'done';
  sentAt: number;
  dueOn: string;
  late: boolean;
  completedAt: number | null;
  version: string;
  asked: { measurements: { key: string; label: string; group: string; unit: string; optional: boolean }[]; questions: QuestionWire[] };
  entry: { readings: Record<string, number>; answers: Record<string, AnswerWire> };
  weightHidden: boolean;
  healthNotice: string | null;
  readings?: { key: string; label: string; group: string; unit: string; value: number; previous: number | null; change: number | null }[];
  answers?: { questionId: string; text: string; kind: string; scale?: number; yes?: boolean; rating?: number; optionIds?: string[]; chosen?: string[]; answer?: string }[];
  history?: { key: string; points: { assessmentId: string; at: number; value: number }[] }[];
  returned?: { id: string; name: string; at: number }[];
}

export interface TemplateWire {
  id: string;
  name: string;
  description: string | null;
  systemKey: string | null;
  asks: { measurements: number; questions: number };
  openAssessmentId: string | null;
}
