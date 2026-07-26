import type { Arm, ArmCondition, Effect, Trigger } from "./automations.model";

/**
 * D2 duplicate-detection canonicalization (docs/plans/EFFECT_CREATION_REPAIR.md Phase 3,
 * step 3.2) — a client-side port of the server's `server/src/automation/effect-canonical.ts`.
 * Same algorithm, verbatim: same field order, same value coercion, same condition sort key.
 * The dashboard has no jest runner, so the two files' agreement is proven behaviorally
 * through the Playwright duplicate-detection specs (`tests/visual/automation-create.spec.ts`)
 * rather than a shared unit-test file — if you change one side, change the other the same
 * way and re-run those specs.
 *
 * Two effects are "the same automation" when they would fire identically: same master
 * trigger, same ARM ORDER (first-match-wins is semantic — swapping two arms is a real
 * behavior change, never a duplicate), and each arm's conditions structurally equal
 * regardless of the order they were staged in. `enabled` and any row id are NOT part of an
 * effect's identity. The dashboard's `Effect` also carries extra display-only fields (`id`,
 * `sentence`, `editable`) the server's pure `Effect` type doesn't have — `canonicalEffect`
 * only ever reads `.trigger`/`.arms`, so those fields are ignored by construction, not by an
 * extra stripping step.
 */

/**
 * Form fields may arrive JSON-encoded ("true"/"80"); decode when they do, otherwise pass
 * the value through unchanged. Same implementation as the server's `parseMaybe`.
 */
export function parseMaybe(v: any): any {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function canonicalTrigger(t: Trigger): { source: string; [k: string]: unknown } {
  return t.source === "time"
    ? { source: "time", at: t.at }
    : { source: "sensor", nodeId: t.nodeId, channel: t.channel };
}

/** Fixed-key-order, value-coerced projection of one condition — shared by the sort key
 *  and the final canonical string so both see identical data. */
function canonicalCondition(c: ArmCondition): { kind: string; [k: string]: unknown } {
  switch (c.kind) {
    case "time":
      return { kind: "time", op: c.op, from: c.from, to: c.to ?? null };
    case "dow":
      return { kind: "dow", days: [...c.days].map(Number).sort((a, b) => a - b) };
    case "sensor":
      return { kind: "sensor", nodeId: c.nodeId, channel: c.channel, op: c.op, value: parseMaybe(c.value) };
    case "state":
      return { kind: "state", nodeId: c.nodeId, channel: c.channel, op: c.op, value: parseMaybe(c.value) };
  }
}

/** Sort key for a canonicalized condition: (kind, nodeId, channel, op, from, to, days,
 *  value) — every field stringified so heterogeneous condition kinds compare consistently
 *  and a missing field collapses to the same empty slot on both sides of a comparison. */
function conditionSortKey(cc: ReturnType<typeof canonicalCondition>): string {
  const field = (k: string) => (cc[k] === undefined || cc[k] === null ? "" : JSON.stringify(cc[k]));
  return ["kind", "nodeId", "channel", "op", "from", "to", "days", "value"].map(field).join(" ");
}

function canonicalArm(a: Arm): unknown {
  const when = a.when
    .map(canonicalCondition)
    .sort((x, y) => conditionSortKey(x).localeCompare(conditionSortKey(y)));
  return { when, set: { nodeId: a.set.nodeId, channel: a.set.channel, value: parseMaybe(a.set.value) } };
}

/**
 * Stable string form of an effect for duplicate detection. `enabled` and the row id are
 * deliberately excluded — they are not part of an automation's identity (D2). Arms stay IN
 * ORDER; only the conditions WITHIN each arm are order-independent.
 */
export function canonicalEffect(e: Effect): string {
  return JSON.stringify({
    trigger: canonicalTrigger(e.trigger),
    arms: e.arms.map(canonicalArm),
  });
}

/**
 * Whether `effect` structurally duplicates one already in `existing` (D2) — the client-side
 * pre-check mirror of the server's `EffectsRepo.findDuplicate`. This file has no repo/store
 * to read on its own, so the caller passes in the current `store.get('effects')` snapshot
 * explicitly. Returns the matching stored effect (so the caller can reference its id), or
 * undefined when nothing collides.
 */
export function findDuplicateEffect(effect: Effect, existing: Effect[]): Effect | undefined {
  const key = canonicalEffect(effect);
  return existing.find((e) => canonicalEffect(e) === key);
}
