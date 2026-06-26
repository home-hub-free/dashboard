import { showToaster } from "../../components/popup-message/popup-message";
import {
  SessionUser,
  createUser,
  currentUser,
  deleteUser,
  listUsers,
  logout,
  updateUser,
} from "../../utils/auth";
import { AssistantMenuState } from "./assistant.model";

/**
 * Household roster management for the assistant settings view: list members,
 * add a new one, tweak a member's display name / tone (the prefs the agent
 * reads), remove a member, and sign out. State lives on the assistant bind so
 * bindrjs re-renders; arrays are reassigned (not mutated) so the proxy notices.
 */
export class HouseholdServiceClass {
  private state!: AssistantMenuState;

  attach(state: AssistantMenuState) {
    this.state = state;
    this.state.meId = currentUser()?.id || "";
    this.refresh();
  }

  async refresh() {
    try {
      this.state.households = await listUsers();
    } catch (err: any) {
      this.state.householdError = err?.message || "Could not load household";
    }
  }

  async add() {
    const username = (this.state.newUsername || "").trim();
    const password = this.state.newPassword || "";
    if (!username || !password) {
      this.state.householdError = "Username and password are required";
      return;
    }
    try {
      await createUser({
        username,
        displayName: (this.state.newDisplayName || "").trim() || undefined,
        password,
        prefs: { tone: (this.state.newTone || "").trim() || undefined },
      });
      this.state.newUsername = "";
      this.state.newDisplayName = "";
      this.state.newPassword = "";
      this.state.newTone = "";
      this.state.householdError = "";
      await this.refresh();
      showToaster({ from: "bottom", message: "Member added", timer: 1800 });
    } catch (err: any) {
      this.state.householdError = err?.message || "Could not add member";
    }
  }

  /** Persist a tone edit for a member (the agent reads prefs.tone). */
  async saveTone(id: string, tone: string) {
    try {
      await updateUser(id, { prefs: { tone: tone.trim() || undefined } });
      await this.refresh();
      showToaster({ from: "bottom", message: "Saved", timer: 1400 });
    } catch (err: any) {
      this.state.householdError = err?.message || "Could not save";
    }
  }

  async remove(id: string) {
    try {
      await deleteUser(id);
      await this.refresh();
    } catch (err: any) {
      this.state.householdError = err?.message || "Could not remove member";
    }
  }

  async signOut() {
    await logout();
    window.location.reload();
  }
}

export const HouseholdService = new HouseholdServiceClass();
export type { SessionUser };
