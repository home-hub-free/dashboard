import { server } from "./server-handler";
import { authHeaders } from "./auth";

/**
 * Hub guest registry (`/guests`): people who are not household members but whom the
 * house may need to address, with a free-text relationship to each member and a
 * treatment (tú / usted). The same routes reflex writes by voice, so Settings and the
 * assistant stay mirrored. (Not the vision-service face "guests" — those are unnamed
 * face clusters; see `listGuests` in server-handler.ts.)
 */
export type Treatment = "tu" | "usted" | "";

export type GuestRelation = { memberId: string; memberName: string; relation: string };

export type HouseGuest = {
  id: string;
  name: string;
  aliases: string[];
  treatment: Treatment;
  notes: string;
  relations: GuestRelation[];
  createdAt: string;
  updatedAt: string;
};

async function jsonOrThrow(res: Response, what: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `${what} (${res.status})`);
  return data;
}

export async function listHouseGuests(): Promise<HouseGuest[]> {
  const res = await fetch(server + "guests", { headers: authHeaders() });
  return (await jsonOrThrow(res, "Could not load guests")).guests || [];
}

export async function createHouseGuest(input: {
  name: string;
  treatment?: Treatment;
  aliases?: string[];
  notes?: string;
  relations?: Array<{ memberId: string; relation: string }>;
}): Promise<HouseGuest> {
  const res = await fetch(server + "guests", { method: "POST", headers: authHeaders(), body: JSON.stringify(input) });
  return (await jsonOrThrow(res, "Could not add guest")).guest;
}

export async function updateHouseGuest(
  id: string,
  patch: { name?: string; treatment?: Treatment; aliases?: string[]; notes?: string },
): Promise<HouseGuest> {
  const res = await fetch(server + `guests/${encodeURIComponent(id)}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(patch) });
  return (await jsonOrThrow(res, "Could not update guest")).guest;
}

export async function deleteHouseGuest(id: string): Promise<void> {
  const res = await fetch(server + `guests/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
  await jsonOrThrow(res, "Could not remove guest");
}

export async function setGuestRelation(id: string, memberId: string, relation: string): Promise<HouseGuest> {
  const res = await fetch(server + `guests/${encodeURIComponent(id)}/relations/${encodeURIComponent(memberId)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ relation }),
  });
  return (await jsonOrThrow(res, "Could not save relationship")).guest;
}

export async function removeGuestRelation(id: string, memberId: string): Promise<HouseGuest> {
  const res = await fetch(server + `guests/${encodeURIComponent(id)}/relations/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return (await jsonOrThrow(res, "Could not remove relationship")).guest;
}
