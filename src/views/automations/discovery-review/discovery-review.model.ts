import { ArmCondition, SetAction } from "../automations.model";

// A Pattern Discovery candidate as served by memory-service GET /memory/candidates
// (docs/DISCOVERY.md §4). The JSON flattens Go's StoredCandidate (embedded Candidate), so trigger /
// arms / evidence sit alongside the queue metadata (id, status, line, …). The dashboard surface shows
// every pending candidate at the low floor (support ≥ 2) with its confidence displayed — the user is
// the gate (§5).

export type CandidateTrigger = {
  source: "sensor";
  nodeId: string;
  channel: string;
  // The antecedent state that fires the trigger (e.g. presence = true). Becomes the accepted rule's
  // sensor-value guard so it fires on that edge only.
  value: boolean | number;
};

export type CandidateArm = { when: ArmCondition[]; set: SetAction };

export type CandidateEvidence = {
  support: number;
  confidence: number;
  distinctDays: number;
  recencyScore: number;
  firstSeen: string;
  lastSeen: string;
};

export type Candidate = {
  id: number;
  fingerprint: string;
  status: string;
  trigger: CandidateTrigger;
  arms: CandidateArm[];
  evidence: CandidateEvidence;
  zone: string;
  timeBand: string;
  line: string;
  matured: boolean;
};

// View-model row: the raw candidate plus the pre-derived display fields the template binds to (so the
// template stays logic-free). `busy` disables the buttons while an accept/decline is in flight.
export type CandidateRow = {
  candidate: Candidate;
  line: string;
  zone: string;
  support: number;
  confidencePct: number;
  days: number;
  matured: boolean;
  busy: boolean;
};

export type DiscoveryReviewState = {
  rows: CandidateRow[];
  loading: boolean;
  error: string;
  accept: (row: CandidateRow) => void;
  dismiss: (row: CandidateRow) => void;
  refresh: () => void;
};
