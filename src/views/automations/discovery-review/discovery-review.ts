import { Component } from "../../../core/component";
import template from "./discovery-review.html?raw";
import {
  acceptCandidate,
  declineCandidate,
  getCandidates,
  getEndPointData,
  saveEffect,
} from "../../../utils/server-handler";
import { showToaster } from "../../../components/popup-message/popup-message";
import { EffectActions } from "../../../store/actions";
import { Arm, ArmCondition, Effect, Trigger } from "../automations.model";
import { Candidate, CandidateRow, DiscoveryReviewState } from "./discovery-review.model";

/**
 * Pattern Discovery review surface (docs/DISCOVERY.md §3/§5 — the immediate dashboard surface).
 *
 * Lists the candidate chains the offline miner found (memory-service GET /memory/candidates, dashboard
 * floor support ≥ 2) and lets the user crystallize one into a real automation — or dismiss it so it
 * stops resurfacing. Acceptance creates the effect on the HUB (saveEffect) and records the decision on
 * memory-service (acceptCandidate); the two stores stay decoupled, matching the rest of the stack.
 */
class DiscoveryReviewClass extends Component<DiscoveryReviewState> {
  mount() {
    this.createBind({
      id: "discovery-review",
      template,
      bind: {
        rows: [],
        loading: true,
        error: "",
        accept: this.accept.bind(this),
        dismiss: this.dismiss.bind(this),
        refresh: this.refresh.bind(this),
      },
    });
    this.refresh();
  }

  private refresh() {
    if (!this.mounted) return;
    this.bind.loading = true;
    this.bind.error = "";
    getCandidates()
      .then((res) => {
        this.bind.rows = (res.candidates || []).map((c) => this.toRow(c));
        this.bind.loading = false;
      })
      .catch((e) => {
        // A down memory-service must not break the automations view — show a soft note instead.
        this.bind.error = "Pattern discovery is unavailable right now.";
        this.bind.rows = [];
        this.bind.loading = false;
        console.warn("discovery-review: failed to load candidates", e);
      });
  }

  private toRow(candidate: Candidate): CandidateRow {
    const ev = candidate.evidence;
    return {
      candidate,
      line: candidate.line || this.fallbackLine(candidate),
      zone: candidate.zone || "",
      support: ev?.support ?? 0,
      confidencePct: Math.round((ev?.confidence ?? 0) * 100),
      days: ev?.distinctDays ?? 0,
      matured: !!candidate.matured,
      busy: false,
    };
  }

  /** Minimal human line if memory-service didn't ship one (it normally does). */
  private fallbackLine(c: Candidate): string {
    const target = c.arms[0]?.set;
    const where = c.zone ? ` in the ${c.zone}` : "";
    return target
      ? `A pattern around ${target.nodeId}${where} — want to automate it?`
      : "A recurring pattern was noticed.";
  }

  private accept(row: CandidateRow) {
    if (row.busy) return;
    row.busy = true;
    this.bind.rows = [...this.bind.rows]; // reassign → re-render disabled state
    // Record the acceptance on memory-service FIRST, then create the durable hub effect.
    // memory-service is the flakier of the two; gating on it means a hiccup aborts cleanly
    // (no effect created, candidate stays pending → retryable) instead of leaving the effect
    // on the hub while the candidate keeps resurfacing and re-creates a duplicate on retry.
    acceptCandidate(row.candidate.id)
      .then(() => saveEffect(this.toEffect(row.candidate)))
      .then(() => getEndPointData("get-effects-dynamic"))
      .then((effects: Effect[]) => {
        EffectActions.load(effects || []);
        showToaster({ from: "bottom", message: "Automation created", timer: 2000 });
        this.refresh();
      })
      .catch((e) => {
        row.busy = false;
        this.bind.rows = [...this.bind.rows];
        showToaster({ from: "bottom", message: "Couldn't create the automation", timer: 2500 });
        console.warn("discovery-review: accept failed", e);
      });
  }

  private dismiss(row: CandidateRow) {
    if (row.busy) return;
    row.busy = true;
    this.bind.rows = [...this.bind.rows];
    declineCandidate(row.candidate.id)
      .then(() => {
        showToaster({ from: "bottom", message: "Dismissed", timer: 1500 });
        this.refresh();
      })
      .catch((e) => {
        row.busy = false;
        this.bind.rows = [...this.bind.rows];
        showToaster({ from: "bottom", message: "Couldn't dismiss", timer: 2500 });
        console.warn("discovery-review: decline failed", e);
      });
  }

  /**
   * Translate a candidate into the hub's dynamic `trigger + arms` contract. The candidate's trigger
   * carries the antecedent VALUE (e.g. presence=true); the hub's trigger does not, and an arm with an
   * empty `when` fires on EVERY sensor edge (dynamic-evaluate `armHolds`). So we restate the trigger
   * value as a sensor guard on each arm — mirroring the dashboard's own buildDynamicEffect — so the
   * rule fires on that edge only (e.g. presence=true), not on its inverse.
   */
  private toEffect(c: Candidate): Effect {
    const trigger: Trigger = { source: "sensor", nodeId: c.trigger.nodeId, channel: c.trigger.channel };
    const sensorGuard: ArmCondition = {
      kind: "sensor",
      nodeId: c.trigger.nodeId,
      channel: c.trigger.channel,
      op: "eq",
      value: c.trigger.value,
    };
    const arms: Arm[] = c.arms.map((a) => ({ when: [sensorGuard, ...(a.when || [])], set: a.set }));
    return { trigger, arms, enabled: true };
  }
}

export const DiscoveryReview = new DiscoveryReviewClass();
