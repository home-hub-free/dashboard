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
import { store } from "../../../store/store";
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
  private unsubs: Array<() => void> = [];

  mount() {
    this.createBind({
      id: "discovery-review",
      template,
      bind: {
        rows: [],
        loading: true,
        error: "",
        collapsed: true,
        accept: this.accept.bind(this),
        dismiss: this.dismiss.bind(this),
        refresh: this.refresh.bind(this),
        toggleCollapsed: () => { this.bind.collapsed = !this.bind.collapsed; },
      },
    });
    // Candidates and the device/sensor rosters load in parallel, so a row can
    // render before its names are resolvable — re-derive when a roster lands.
    this.unsubs = [
      store.subscribe("devices", () => this.redecorate()),
      store.subscribe("sensors", () => this.redecorate()),
    ];
    this.refresh();
  }

  unmount() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  /** Recompute the display fields of the rows already on screen (identity
   *  resolution only — no refetch), preserving any in-flight busy state. */
  private redecorate() {
    if (!this.mounted || !this.bind.rows.length) return;
    this.bind.rows = this.bind.rows.map((r) => ({ ...this.toRow(r.candidate), busy: r.busy }));
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
      line: candidate.line ? this.humanizeLine(candidate.line) : this.fallbackLine(candidate),
      actionDevice: this.deviceIdentity(candidate.arms[0]?.set?.nodeId),
      triggerDevice: this.deviceIdentity(candidate.trigger?.nodeId),
      zone: candidate.zone || "",
      support: ev?.support ?? 0,
      confidencePct: Math.round((ev?.confidence ?? 0) * 100),
      days: ev?.distinctDays ?? 0,
      matured: !!candidate.matured,
      busy: false,
    };
  }

  /** The miner's prose refers to devices by raw id ("the light (#10039254)"). Swap every #id token
   *  whose node we know for the device's real name, so the sentence reads "the light (Cocina)…"; the
   *  identity chips below keep the exact #id as the secondary, disambiguating datum. Unknown ids stay
   *  as-is. */
  private humanizeLine(line: string): string {
    return line.replace(/#([A-Za-z0-9_.:-]+)/g, (token, id) => this.nodeName(id) || token);
  }

  /** Display name of a device/sensor from the live store, or "" when unknown. */
  private nodeName(nodeId: string): string {
    const dev = store.get("devices").find((d) => d.id === nodeId);
    if (dev?.name) return dev.name;
    const sen = store.get("sensors").find((s) => s.id === nodeId);
    return sen?.name || "";
  }

  /** Resolve a node id to a concrete handle "name category · #id" using the live device/sensor store,
   *  falling back to just "#id" when the node isn't loaded. The #id is always shown so the user can pin
   *  the exact device — the fleet names units after their room, so names repeat and can't disambiguate. */
  private deviceIdentity(nodeId?: string): string {
    if (!nodeId) return "";
    const short = `#${nodeId}`;
    const dev = store.get("devices").find((d) => d.id === nodeId);
    if (dev) return this.identityLabel(dev.name, dev.deviceCategory, short);
    const sen = store.get("sensors").find((s) => s.id === nodeId);
    if (sen) return this.identityLabel(sen.name, sen.deviceCategory, short);
    return short;
  }

  private identityLabel(name: string, category: string, short: string): string {
    const label = [name, category].filter(Boolean).join(" ").trim();
    return label ? `${label} · ${short}` : short;
  }

  /** Minimal human line if memory-service didn't ship one (it normally does). */
  private fallbackLine(c: Candidate): string {
    const target = c.arms[0]?.set;
    const where = c.zone ? ` in the ${c.zone}` : "";
    return target
      ? `A pattern around ${this.nodeName(target.nodeId) || `#${target.nodeId}`}${where} — want to automate it?`
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
    const channel = this.realChannel(c.trigger.nodeId, c.trigger.channel);
    const trigger: Trigger = { source: "sensor", nodeId: c.trigger.nodeId, channel };
    const sensorGuard: ArmCondition = {
      kind: "sensor",
      nodeId: c.trigger.nodeId,
      channel,
      op: "eq",
      value: c.trigger.value,
    };
    const arms: Arm[] = c.arms.map((a) => ({ when: [sensorGuard, ...(a.when || [])], set: a.set }));
    return { trigger, arms, enabled: true };
  }

  /**
   * Defensive channel normalization. The hub publishes each sensor event twice: on its real
   * per-channel key (e.g. `presence`) AND on the legacy whole-value blob topic literally named
   * `sensor`. The Pattern Discovery miner keys some candidates off that blob topic, so a crystallized
   * rule would trigger on channel `sensor` — which the hub's evaluator (`Node.automations`) never
   * fires, making the rule inert (a presence "turn off" rule that never turns off). We remap the
   * legacy `sensor` channel to the node's real sensor channel here so the accepted rule fires. A
   * non-legacy channel, or a node we can't resolve, passes through unchanged (no regression).
   */
  private realChannel(nodeId: string, channel: string): string {
    if (channel !== "sensor") return channel;
    const sen = store.get("sensors").find((s) => s.id === nodeId);
    // Boolean motion/presence sensors project to the `presence` channel (server channels.ts);
    // temp/humidity carries a numeric guard and is already keyed on its real channel by the miner.
    if (sen && (sen.deviceCategory === "motion" || sen.deviceCategory === "presence")) return "presence";
    return channel;
  }
}

export const DiscoveryReview = new DiscoveryReviewClass();
