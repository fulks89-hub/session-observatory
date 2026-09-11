import type { Telemetry } from './telemetry.ts';
import type { Attention } from './attention.ts';
export type Provider = 'codex' | 'claude' | 'cursor';
export type Runtime =
  'working' | 'waiting_input' | 'waiting_approval' | 'idle' | 'interrupted' | 'error' | 'stale';
export type Message = { role: 'user' | 'assistant'; text: string; at: string; id: string };
export type Task = {
  text: string;
  state: 'pending' | 'in_progress' | 'completed';
  evidence: string;
};
export type Session = {
  id: string;
  sourceId: string;
  provider: Provider;
  title: string;
  project: string;
  cwd: string;
  model: string;
  goal: string;
  latest: string;
  runtime: Runtime;
  updatedAt: string;
  sourcePath: string;
  messages: Message[];
  tasks: Task[];
  truncated: boolean;
  provenance: 'history' | 'hook' | 'demo';
  reviewedAt?: string;
  acceptedAt?: string;
  pinnedGoal?: string;
  correctionCount?: number;
  skill?: string;
  telemetry?: Telemetry;
  attention?: Attention | null;
};
export type Connection = {
  provider: Provider;
  enabled: boolean;
  roots: string[];
  found: number;
  lastScan?: string;
  error?: string;
};
export type Check = {
  id: string;
  label: string;
  kind: 'contains' | 'not_contains' | 'html_title' | 'html_lang' | 'image_alt' | 'viewport';
  value?: string;
  required: boolean;
};
export type EvalCase = {
  id: string;
  prompt: string;
  split: 'train' | 'holdout';
  checks: Check[];
  baselineOutput?: string;
  candidateOutput?: string;
  synthetic?: boolean;
  familyId?: string;
};
export type SkillSuite = {
  id: string;
  name: string;
  baseline: string;
  candidate: string;
  cases: EvalCase[];
  revision: string;
};
export type CheckResult = {
  id: string;
  label: string;
  pass: boolean;
  required: boolean;
  detail: string;
};
export type EvalResult = {
  caseId: string;
  split: string;
  variant: string;
  checks: CheckResult[];
  passed: boolean;
  output: string;
};
export type Report = {
  id: string;
  suiteId: string;
  at: string;
  kind: 'artifact-check' | 'model-evaluation';
  baselineHash: string;
  candidateHash: string;
  policyHash: string;
  results: EvalResult[];
  eligible: boolean;
  reasons: string[];
  calls: number;
  model?: string;
  provider?: string;
  attempts?: number;
};
