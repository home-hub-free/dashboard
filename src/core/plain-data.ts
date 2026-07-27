/**
 * Deep de-proxy / plain-copy for data crossing a bind boundary.
 *
 * bindrjs proxifies assigned objects IN PLACE (its `_reactiveDeep` replaces nested
 * children with Proxies on the object you hand it) and re-wraps children that are
 * already proxies — so sharing one object between the store and a bind, or between
 * two binds, stacks proxy layers per assignment and retains every Bind that ever
 * wrapped it (see docs/BINDRJS_PERF_AUDIT_2026_07_26.md L1/L2). Until that is fixed
 * in the library, every object assigned into a bind must be a fresh plain copy.
 *
 * Copies plain objects and arrays (reading through any proxy layers); keeps
 * primitives, functions, and non-plain instances (DOM nodes, class instances)
 * by reference — those must never be handed to a bind anyway.
 */
export function plainData<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(plainData) as unknown as T;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    out[key] = plainData((value as Record<string, unknown>)[key]);
  }
  return out as T;
}
