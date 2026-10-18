import { showToaster } from "../../components/popup-message/popup-message";
import {
  createHouseGuest,
  deleteHouseGuest,
  listHouseGuests,
  removeGuestRelation,
  setGuestRelation,
  updateHouseGuest,
  type HouseGuest,
  type Treatment,
} from "../../utils/guests";
import type { SettingsState } from "./settings.model";

/**
 * Settings → Household → Guests. Drives the guest registry half of the settings bind
 * (mirrors HouseholdService's attach() shape): the roster of non-member people the house
 * may address, each with a relationship per member and a tú/usted treatment. Everything
 * here is also sayable to the house ("Lupita es mi mamá", "a Lupita háblale de usted",
 * "olvida a Lupita"); both surfaces write the same hub rows.
 */
export class GuestsServiceClass {
  private state!: SettingsState;

  attach(state: SettingsState) {
    this.state = state;
    void this.refresh();
  }

  async refresh() {
    try {
      this.state.guests = await listHouseGuests();
      this.state.guestsError = "";
    } catch (err: any) {
      this.state.guestsError = err?.message || "Could not load guests";
    } finally {
      this.state.guestsLoading = false;
    }
  }

  async add() {
    const name = (this.state.guestNewName || "").trim();
    if (!name) {
      this.state.guestsError = "A name is required";
      return;
    }
    // The select's first option is what the browser shows when nothing was picked.
    const memberId = this.state.guestNewMember || this.state.households[0]?.id || "";
    const relation = (this.state.guestNewRelation || "").trim();
    try {
      await createHouseGuest({
        name,
        treatment: this.state.guestNewTreatment,
        relations: memberId && relation ? [{ memberId, relation }] : [],
      });
      this.state.guestNewName = "";
      this.state.guestNewRelation = "";
      this.state.guestNewTreatment = "";
      this.state.guestsError = "";
      await this.refresh();
      showToaster({ from: "bottom", message: "Guest added", timer: 1800 });
    } catch (err: any) {
      this.state.guestsError = err?.message || "Could not add guest";
    }
  }

  async remove(id: string) {
    try {
      await deleteHouseGuest(id);
      if (this.state.guestEditId === id) this.state.guestEditId = "";
      await this.refresh();
    } catch (err: any) {
      this.state.guestsError = err?.message || "Could not remove guest";
    }
  }

  async setTreatment(id: string, treatment: Treatment) {
    try {
      const g = await updateHouseGuest(id, { treatment });
      this.replace(g);
    } catch (err: any) {
      this.state.guestsError = err?.message || "Could not update guest";
    }
  }

  /** Open / close the per-guest "add relationship" row (one open at a time). */
  toggleEdit(id: string) {
    const opening = this.state.guestEditId !== id;
    this.state.guestEditId = opening ? id : "";
    const chosen = opening ? this.firstMemberWithout(id) : "";
    this.state.guestRelMember = chosen;
    // bindrjs can't drive :selected — order the chosen member first so the browser picks it.
    this.state.guestRelOptions = opening
      ? [...this.state.households.filter((u) => u.id === chosen), ...this.state.households.filter((u) => u.id !== chosen)]
      : [];
    this.state.guestRelText = "";
  }

  async saveRelation(id: string) {
    const memberId = this.state.guestRelMember || "";
    const relation = (this.state.guestRelText || "").trim();
    if (!memberId || !relation) {
      this.state.guestsError = "Pick a member and say what the guest is to them";
      return;
    }
    try {
      const g = await setGuestRelation(id, memberId, relation);
      this.replace(g);
      this.state.guestEditId = "";
      this.state.guestRelText = "";
      this.state.guestsError = "";
    } catch (err: any) {
      this.state.guestsError = err?.message || "Could not save relationship";
    }
  }

  async dropRelation(id: string, memberId: string) {
    try {
      const g = await removeGuestRelation(id, memberId);
      this.replace(g);
    } catch (err: any) {
      this.state.guestsError = err?.message || "Could not remove relationship";
    }
  }

  private replace(g: HouseGuest) {
    this.state.guests = this.state.guests.map((x) => (x.id === g.id ? g : x));
  }

  private firstMemberWithout(guestId: string): string {
    const g = this.state.guests.find((x) => x.id === guestId);
    const taken = new Set((g?.relations ?? []).map((r) => r.memberId));
    const free = this.state.households.find((u) => !taken.has(u.id));
    return (free ?? this.state.households[0])?.id ?? "";
  }
}

export const GuestsService = new GuestsServiceClass();
