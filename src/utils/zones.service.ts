import { store } from "../store/store";
import { getZones, setZones } from "./server-handler";

/**
 * Zones registry — the shared, typo-free room list behind both edit overlays'
 * zone dropdowns. The canonical list lives server-side (kv_config); this module
 * mirrors it into the store and exposes add/remove plus the option-ordering helper
 * the dropdowns use. Both the device and sensor overlays drive the SAME list, so a
 * zone added on one side immediately shows on the other.
 */

/** Pull the canonical list into the store (called on boot + after edits). */
export async function loadZones(): Promise<string[]> {
  const zones = await getZones();
  store.set("zones", zones);
  return zones;
}

/** Add a zone to the registry; no-op for blanks/dupes (server normalizes too). */
export async function addZone(name: string): Promise<string[]> {
  const z = name.trim();
  if (!z) return store.get("zones");
  const next = await setZones([...store.get("zones"), z]);
  store.set("zones", next);
  return next;
}

/** Drop a zone from the registry. Existing device/sensor assignments keep their
 *  stored value; the caller decides whether to also clear them. */
export async function removeZone(name: string): Promise<string[]> {
  const next = await setZones(store.get("zones").filter((z) => z !== name));
  store.set("zones", next);
  return next;
}

/**
 * Options for a zone `<select>`, ordered so the element's first option is the one
 * to show selected — bindrjs can't reliably drive `:selected` (its attr binding
 * emits `selected=""` even for false), so we lean on the browser auto-selecting
 * the first option instead. Order: current value (if any), the Unassigned entry
 * (""), then the remaining zones. The empty string renders as "— Unassigned —".
 */
export function zoneOptions(current: string | undefined, zones: string[]): string[] {
  const cur = current || "";
  const rest = zones.filter((z) => z !== cur);
  return cur ? [cur, "", ...rest] : ["", ...rest];
}
