import { bus } from "../../../core/bus";
import { currentUser, fetchMe, updateUser } from "../../../utils/auth";
import { showToaster } from "../../../components/popup-message/popup-message";

/**
 * Per-member pinned devices — the "my shortcuts" strip that renders first on the
 * Home board. Stored in the signed-in user's `prefs.pins` (string[] of device ids)
 * via the existing `PATCH /auth/users/:id`, so each member (and the wall panel's
 * own login) keeps their own set with zero new backend.
 *
 * NB: the hub REPLACES the whole prefs blob on update — always send
 * `{ ...prefs, pins }`, never a bare `{ pins }`.
 */

let pins: string[] | null = null;

export function getPins(): string[] {
  if (pins === null) {
    const prefs = currentUser()?.prefs as { pins?: unknown } | undefined;
    pins = Array.isArray(prefs?.pins) ? (prefs!.pins as string[]).filter((p) => typeof p === "string") : [];
  }
  return pins;
}

export function isPinned(deviceId: string): boolean {
  return getPins().includes(deviceId);
}

/** Optimistically toggle + persist. Reverts (and says so) if the hub rejects it. */
export function togglePin(deviceId: string): boolean {
  const user = currentUser();
  if (!user) return false;
  const before = getPins();
  const next = before.includes(deviceId)
    ? before.filter((id) => id !== deviceId)
    : [...before, deviceId];
  pins = next;
  bus.emit("pins:changed", next);

  updateUser(user.id, { prefs: { ...user.prefs, pins: next } })
    .then(() => fetchMe()) // refresh the cached session user so prefs stay current
    .catch(() => {
      pins = before;
      bus.emit("pins:changed", before);
      showToaster({ message: "Couldn't save your pins", from: "bottom", timer: 2500 });
    });
  return next.includes(deviceId);
}
