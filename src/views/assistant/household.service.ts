import { showToaster } from "../../components/popup-message/popup-message";
import {
  SessionUser,
  changePassword,
  createUser,
  currentUser,
  deleteUser,
  listUsers,
  logout,
  updateUser,
} from "../../utils/auth";
import {
  enrollVoiceprint,
  forgetVoiceprint,
  getVoiceprintSamples,
  speakerAvailable,
  enrollFace,
  forgetFace,
  getFaceSamples,
  visionAvailable,
  listPeople,
  nameGuest,
  promoteGuest,
  listFaceReview,
  rejectFaceSuggestion,
  forgetGuest,
  mergeGuest,
  listMemberClusters,
  detachCluster,
  getFaceThresholds,
  setFaceThresholds,
  type ReviewCard,
  calendarStatus,
  calendarEnrollStart,
  calendarRevoke,
  calendarCalendars,
  calendarAddCalendar,
  calendarRecheck,
  calendarRemove,
  calendarSetFamily,
  calendarAssign,
  type CalendarsView,
} from "../../utils/server-handler";
import { blobToWav16k } from "../../utils/audio-wav";
import {
  VoiceSession,
  FaceSession,
  VOICE_SCRIPT,
  FACE_POSES,
  speakAura,
} from "../../utils/media-enroll";
import type { SettingsState } from "../settings/settings.model";

// Min mic peak (0..1) for a voice line to count — below this we ask the user to retry
// the same line instead of enrolling near-silence.
const MIN_VOICE_PEAK = 0.05;
// How long a face pose must stay framed before the auto-capture countdown fires (ms).
const FACE_STEADY_MS = 500;

/**
 * Household roster management for the assistant settings view: list members,
 * add a new one, tweak a member's display name / tone (the prefs the agent
 * reads), remove a member, and sign out. State lives on the assistant bind so
 * bindrjs re-renders; arrays are reassigned (not mutated) so the proxy notices.
 */
export class HouseholdServiceClass {
  private state!: SettingsState;

  attach(state: SettingsState) {
    this.state = state;
    this.state.meId = currentUser()?.id || "";
    this.refresh();
    this.refreshVoiceSamples();
    this.refreshFaceSamples();
    this.refreshCalendar();
  }

  // ── Google Calendar (per-member + family link) ────────────────────────────
  // calendar-service owns the credentials; this reflects connected state + drives linking. Two
  // real auth modes (CALENDAR_PLAN §2/§6): "service_account" (members share a calendar with the SA
  // email, then link it by id) and "oauth" (per-account consent). The control only appears once a
  // real backend is live; the null simulation backend has nothing to connect.
  async refreshCalendar() {
    const st = await calendarStatus();
    this.state.calendarEnabled = st.ok && !!st.auth;
    this.state.calendarAuth = st.auth;
    this.state.calendarSaEmail = st.saEmail;
    this.state.calendarHouseLinked = st.houseLinked;
    if (st.auth === "service_account") {
      await this.refreshCalendarDiscovery();
    } else {
      this.state.calendarMineLinked = !!this.state.meId && st.enrolled.includes(this.state.meId);
    }
  }

  // ── Service-account mode: auto-discovery (share in Google, pick here — no calendar ids) ──
  /** Pull every calendar shared with the SA + the current family/member assignment, and project it
   *  onto the picker state (which is mine, which is read-only). */
  private async refreshCalendarDiscovery() {
    this.projectCalendars(await calendarCalendars());
  }

  /** Project a /calendars view onto the picker state (which is mine, read-only, pending). */
  private projectCalendars(v: CalendarsView) {
    this.state.calendarSaEmail = v.saEmail || this.state.calendarSaEmail;
    this.state.calendarFamilyId = v.family;
    const mine = v.members[this.state.meId]?.calendars || [];
    this.state.calDiscovered = v.calendars.map((c) => ({
      id: c.id,
      summary: c.summary || c.id,
      writable: c.writable,
      reachable: c.reachable,
      mine: mine.includes(c.id),
    }));
    this.state.calendarMineLinked = mine.length > 0;
    this.state.calendarMsg = v.error ? `Couldn't reach Google: ${v.error}` : "";
  }

  /** Re-probe added calendars — pending ones flip to connected once you've shared them with the SA. */
  async recheckCalendars() {
    if (this.state.calendarBusy) return;
    this.state.calendarBusy = true;
    this.state.calendarMsg = "";
    try {
      this.projectCalendars(await calendarRecheck());
    } catch (err: any) {
      this.state.calendarMsg = err?.message || "Could not recheck";
    } finally {
      this.state.calendarBusy = false;
    }
  }

  /** Forget a calendar (wrong address / no longer wanted). */
  async removeCalendar(id: string) {
    if (!id || this.state.calendarBusy) return;
    this.state.calendarBusy = true;
    this.state.calendarMsg = "";
    try {
      await calendarRemove(id);
      await this.refreshCalendar();
    } catch (err: any) {
      this.state.calendarMsg = err?.message || "Could not remove that calendar";
    } finally {
      this.state.calendarBusy = false;
    }
  }

  /** Add a calendar the SA can't auto-see (shared with it but not in its list) by its address —
   *  for a primary calendar, the account's email. Verifies + registers it, then it appears below. */
  async addCalendarById() {
    const id = (this.state.calAddId || "").trim();
    if (!id || this.state.calendarBusy) {
      if (!id) this.state.calendarMsg = "Enter the calendar's email/id.";
      return;
    }
    this.state.calendarBusy = true;
    this.state.calendarMsg = "";
    try {
      await calendarAddCalendar(id);
      this.state.calAddId = "";
      await this.refreshCalendar();
      showToaster({ from: "bottom", message: "Calendar added", timer: 1600 });
    } catch (err: any) {
      this.state.calendarMsg = err?.message || "Could not add that calendar";
    } finally {
      this.state.calendarBusy = false;
    }
  }

  /** Pick which shared calendar is the household's family calendar. */
  async setFamilyCal(id: string) {
    if (!id || id === this.state.calendarFamilyId) return;
    this.state.calendarBusy = true;
    this.state.calendarMsg = "";
    try {
      await calendarSetFamily(id);
      await this.refreshCalendar();
      showToaster({ from: "bottom", message: "Family calendar set", timer: 1600 });
    } catch (err: any) {
      this.state.calendarMsg = err?.message || "Could not set the family calendar";
    } finally {
      this.state.calendarBusy = false;
    }
  }

  /** Add/remove a shared calendar from the signed-in member's set (writes go to the writable one). */
  async toggleMine(id: string) {
    if (!this.state.meId || this.state.calendarBusy) return;
    const cur = this.state.calDiscovered.find((c) => c.id === id);
    const want = !cur?.mine;
    const ids = this.state.calDiscovered.filter((c) => (c.id === id ? want : c.mine)).map((c) => c.id);
    this.state.calendarBusy = true;
    this.state.calendarMsg = "";
    try {
      await calendarAssign(this.state.meId, ids);
      await this.refreshCalendar();
    } catch (err: any) {
      this.state.calendarMsg = err?.message || "Could not update your calendars";
    } finally {
      this.state.calendarBusy = false;
    }
  }

  /** Link the signed-in member's personal Google calendar. */
  async connectMyCalendar() {
    await this.connectCalendar(this.state.meId, () => this.state.calendarMineLinked);
  }

  /** Link the shared family (house) Google calendar — the always-available default target. */
  async connectHouseCalendar() {
    await this.connectCalendar("house", () => this.state.calendarHouseLinked);
  }

  /** Start a Google OAuth link for `userId`, open the consent tab, then poll until it lands. */
  private async connectCalendar(userId: string, linked: () => boolean) {
    if (!userId || this.state.calendarBusy) return;
    this.state.calendarMsg = "";
    let authUrl: string;
    try {
      authUrl = await calendarEnrollStart(userId);
    } catch (err: any) {
      this.state.calendarMsg = err?.message || "Could not start linking";
      return;
    }
    if (authUrl.startsWith("null://")) {
      // Simulated link (null backend already enrolled the user on /enroll/start).
      await this.refreshCalendar();
      showToaster({ from: "bottom", message: "Calendar linked (simulated)", timer: 1800 });
      return;
    }
    // Real Google: consent happens in a new tab; calendar-service stores the token on the
    // redirect. We can't see that tab, so poll /status until the link shows up.
    window.open(authUrl, "_blank", "noopener");
    this.state.calendarBusy = true;
    this.state.calendarMsg = "Finish the Google sign-in in the new tab…";
    let ok = false;
    for (let i = 0; i < 16 && !ok; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      await this.refreshCalendar();
      ok = linked();
    }
    this.state.calendarBusy = false;
    this.state.calendarMsg = ok ? "" : "Not linked yet — finish the Google sign-in, then reopen Settings.";
    if (ok) showToaster({ from: "bottom", message: "Calendar connected", timer: 1800 });
  }

  async disconnectMyCalendar() {
    await this.revokeCalendar(this.state.meId);
  }

  async disconnectHouseCalendar() {
    await this.revokeCalendar("house");
  }

  private async revokeCalendar(userId: string) {
    if (!userId) return;
    try {
      await calendarRevoke(userId);
      await this.refreshCalendar();
      showToaster({ from: "bottom", message: "Calendar disconnected", timer: 1600 });
    } catch (err: any) {
      this.state.calendarMsg = err?.message || "Could not disconnect calendar";
    }
  }

  private async refreshVoiceSamples() {
    // The Voice ID control only appears when the speaker-id service is up (the
    // feature's on/off switch); skip the sample lookup entirely when it's off.
    this.state.voiceIdEnabled = await speakerAvailable();
    const id = currentUser()?.id;
    if (this.state.voiceIdEnabled && id) {
      this.state.voiceSamples = await getVoiceprintSamples(id);
    }
  }

  private async refreshFaceSamples() {
    // The Face ID control + the People roster only appear when the vision-service is
    // up + routed — same on/off pattern as Voice ID.
    this.state.faceIdEnabled = await visionAvailable();
    this.state.peopleEnabled = this.state.faceIdEnabled;
    const id = currentUser()?.id;
    if (this.state.faceIdEnabled && id) {
      this.state.faceSamples = await getFaceSamples(id);
    }
    if (this.state.peopleEnabled) {
      this.refreshPeople();
      this.refreshReview();
      this.loadThresholds();
    }
  }

  // ── People roster (labeling lives in the review flow; the list just shows it) ──
  async refreshPeople() {
    this.state.people = await listPeople();
    // Named guests are review targets ("It's Abuela") — surfaced in the card's
    // someone-else picker alongside household members.
    this.state.namedGuests = this.state.people.filter(
      (p) => p.class === "guest" && p.named
    );
  }

  /** Forget a labelled guest — the mistake-eraser now that per-row labeling is
   * gone: delete the cluster and the person re-enters review on their next
   * sighting. Admin-gated server-side. */
  async forgetPerson(id: string) {
    try {
      await forgetGuest(id);
      this.state.peopleMsg = "Forgotten — they'll be reviewed again if seen";
      await this.refreshPeople();
      await this.refreshReview();
    } catch (err: any) {
      this.state.peopleMsg = err?.message || "Could not forget person";
    }
  }

  // ── Recognized-face audit (per member) + "that wasn't me" correction ────────
  // Every image the auto-heal/promote folded into a member is reviewable: open the
  // member's panel to see the faces behind their profile (worst-match first), and
  // detach any the thresholds got wrong — it un-merges + returns to the review queue.
  async toggleClusters(userId: string) {
    if (this.state.clustersOpenFor === userId) {
      this.state.clustersOpenFor = "";
      this.state.memberClusters = [];
      return;
    }
    this.state.clustersOpenFor = userId;
    this.state.clustersBusy = true;
    this.state.memberClusters = [];
    this.state.memberClusters = await listMemberClusters(userId);
    this.state.clustersBusy = false;
  }

  async detachClusterAction(guestId: string) {
    try {
      await detachCluster(guestId);
      this.state.memberClusters = this.state.memberClusters.filter(
        (c) => c.guest_id !== guestId
      );
      this.state.peopleMsg = "Removed — that face goes back to review";
      await this.refreshReview();
    } catch (err: any) {
      this.state.peopleMsg = err?.message || "Could not remove that face";
    }
  }

  // ── Recognition thresholds (view + live-tune the auto-heal ladder) ──────────
  async loadThresholds() {
    this.state.thresholds = await getFaceThresholds();
  }

  async saveThreshold(key: string, raw: string) {
    const value = parseFloat(raw);
    if (Number.isNaN(value)) return;
    try {
      this.state.thresholds = await setFaceThresholds({ [key]: value });
      this.state.peopleMsg = "Threshold saved";
    } catch (err: any) {
      this.state.peopleMsg = err?.message || "Could not save threshold";
    }
  }

  async resetThreshold(key: string) {
    try {
      this.state.thresholds = await setFaceThresholds({ [key]: null });
    } catch (err: any) {
      this.state.peopleMsg = err?.message || "Could not reset threshold";
    }
  }

  // ── Face review — the "Is this you?" card stack ─────────────────────────────
  // The queue is confidence-tiered server-side (vision /people/review) across
  // EVERY known identity; the definitely-them tier auto-merges before we ever see
  // it. ANY household member can answer EVERY card — guests never log in, so
  // persisting them (and clearing the whole queue) is the household's job. The
  // ordering keeps self-identification first: cards suggested as YOU ("Is this
  // you?"), then named guests / unclaimed faces, then cards that look like OTHER
  // members ("Is this Ana?" — answer for them). Answers feed the gallery back
  // (promote / merge / reject), so every swipe makes tomorrow's recognition sharper.
  private reviewCursor = 0;
  private reviewGesturesOff: (() => void) | null = null;

  async refreshReview() {
    const { cards, healed } = await listFaceReview();
    const rank = (c: ReviewCard) =>
      c.suggested?.kind === "member"
        ? c.suggested.id === this.state.meId ? 0 : 3
        : c.suggested ? 1 : 2;
    this.state.reviewCards = [...cards].sort((a, b) => rank(a) - rank(b));
    this.state.reviewOthers = cards.filter((c) => rank(c) === 3).length;
    this.state.reviewHealed = healed;
    if (healed > 0) this.refreshPeople(); // auto-merges changed the roster
  }

  openReview() {
    if (!this.state.reviewCards.length) return;
    this.state.reviewTotal = this.state.reviewCards.length;
    this.state.reviewMsg = "";
    this.state.reviewBusy = false;
    this.state.reviewOpen = true;
    this.presentReviewCard(0);
    this.bindReviewGestures();
  }

  async closeReview() {
    this.reviewGesturesOff?.();
    this.reviewGesturesOff = null;
    this.state.reviewOpen = false;
    await this.refreshPeople(); // answers changed the roster + the queue
    await this.refreshReview();
  }

  /** Flatten cards[i] into the primitive fields the overlay renders (reassigning
   * primitives re-renders the gated region and is null-safe — lightbox posture). */
  private presentReviewCard(i: number) {
    this.reviewCursor = i;
    const card: ReviewCard | undefined = this.state.reviewCards[i];
    this.state.reviewHasCard = !!card;
    this.state.reviewIndex = Math.min(i + 1, this.state.reviewTotal);
    this.state.reviewThumbUrl = card?.thumbUrl || "";
    this.state.reviewLabel = card?.label || "";
    this.state.reviewSightings = card?.sightings || 0;
    this.state.reviewTier = card?.tier || "";
    this.state.reviewSuggestKind = card?.suggested?.kind || "";
    this.state.reviewSuggestName = card?.suggested?.name || "";
    // Self-identification ("Is this you?") vs answering for someone else ("Is this
    // Ana / Abuela?") — same yes/no mechanics, different phrasing.
    this.state.reviewSuggestIsMe =
      card?.suggested?.kind === "member" && card.suggested.id === this.state.meId;
    this.state.reviewScore = card?.suggested
      ? Math.round(card.suggested.score * 100)
      : 0;
    this.reviewFaceBox =
      card?.face_box && card.face_box.length === 4 ? card.face_box : null;
    this.state.reviewHasFaceBox = !!this.reviewFaceBox;
    this.state.reviewNoFace = !!card?.no_face;
    // The ring needs the RENDERED image's geometry — position it after this
    // state write has re-rendered the card (and again once the image loads).
    requestAnimationFrame(() => this.positionFaceRing());
  }

  /** Ring THE face the card is about. The photo renders object-fit:contain (so a
   * face can never be crop-cut out of view); this maps the normalized face box
   * through the contain transform onto the displayed image. Direct style writes —
   * same no-re-render posture as the drag. */
  private reviewFaceBox: number[] | null = null;

  private positionFaceRing() {
    const ring = document.querySelector<HTMLElement>(".review-face-ring");
    if (!ring) return;
    const img = document.querySelector<HTMLImageElement>("img.review-card-img");
    const box = this.reviewFaceBox;
    if (!box || !img) {
      ring.style.display = "none";
      return;
    }
    if (!img.complete || !img.naturalWidth) {
      ring.style.display = "none";
      img.addEventListener("load", () => this.positionFaceRing(), { once: true });
      return;
    }
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cw = img.clientWidth, ch = img.clientHeight;
    const s = Math.min(cw / iw, ch / ih);
    const dw = iw * s, dh = ih * s;
    const ox = img.offsetLeft + (cw - dw) / 2;
    const oy = img.offsetTop + (ch - dh) / 2;
    const [fx, fy, fw, fh] = box;
    const px = fw * dw * 0.18, py = fh * dh * 0.18; // breathing room around the face
    ring.style.left = `${ox + fx * dw - px}px`;
    ring.style.top = `${oy + fy * dh - py}px`;
    ring.style.width = `${fw * dw + 2 * px}px`;
    ring.style.height = `${fh * dh + 2 * py}px`;
    ring.style.display = "block";
  }

  private async answerReview(
    action: "me" | "yes" | "no" | "skip" | "discard" | "assign" | "nameguest",
    value?: string
  ) {
    const card = this.state.reviewCards[this.reviewCursor];
    if (!card || this.state.reviewBusy) return;
    this.state.reviewBusy = true;
    try {
      if (action === "me") {
        const me = this.state.households.find((u) => u.id === this.state.meId);
        await promoteGuest(card.guest_id, this.state.meId, me?.displayName);
      } else if (action === "yes") {
        // Confirm the suggestion: a guest card merges into the named guest (so
        // "Abuela" keeps being recognised instead of respawning as Person N); a
        // member card promotes into that member — mine OR another member's, since
        // any of us can answer for the household.
        if (card.suggested?.kind === "guest") {
          await mergeGuest(card.guest_id, card.suggested.id);
        } else {
          const id = card.suggested?.id || this.state.meId;
          const member = this.state.households.find((u) => u.id === id);
          await promoteGuest(card.guest_id, id,
            member?.displayName || card.suggested?.name || undefined);
        }
      } else if (action === "assign") {
        // "It's someone else…" — a household member or a named guest.
        if (!value) { this.state.reviewBusy = false; return; }
        if (value.startsWith("guest:")) {
          await mergeGuest(card.guest_id, value);
        } else {
          const member = this.state.households.find((u) => u.id === value);
          await promoteGuest(card.guest_id, value, member?.displayName);
        }
      } else if (action === "nameguest") {
        // A brand-new guest: label them once; from now on the tiers recognise
        // them ("Is this <name>?" / silent merge) across re-appearances.
        const name = (value || "").trim();
        if (!name) { this.state.reviewBusy = false; return; }
        await nameGuest(card.guest_id, name);
      } else if (action === "no") {
        // "Not them" sticks: this cluster is never suggested as that identity
        // again — it falls to the next-best identity or the everyone-reviews tier.
        await rejectFaceSuggestion(
          card.guest_id,
          card.suggested?.id || this.state.meId
        );
      } else if (action === "discard") {
        await forgetGuest(card.guest_id);
      } // skip = defer, nothing recorded
      this.state.reviewMsg = "";
    } catch (err: any) {
      this.state.reviewMsg = err?.message || "Could not save that answer";
      this.state.reviewBusy = false;
      return;
    }
    this.state.reviewBusy = false;
    this.presentReviewCard(this.reviewCursor + 1);
  }

  reviewMe() { this.answerReview("me"); }
  reviewYes() { this.answerReview("yes"); }
  reviewNo() { this.answerReview("no"); }
  reviewSkip() { this.answerReview("skip"); }
  reviewDiscard() { this.answerReview("discard"); }
  reviewAssign(id: string) {
    if (id) this.answerReview("assign", id);
  }
  reviewNameGuest(name: string) {
    this.answerReview("nameguest", name);
  }

  /** Tinder-style input: swipe right = confirm ("it's me" / "yes, it's Abuela"),
   * swipe left = "not them" (suggest tier) / "not sure" (unknown tier); ⇄ arrow
   * keys mirror it, Esc closes. The drag moves the card via direct style writes
   * (no state churn → no re-render per frame); listeners live on document so they
   * survive bindrjs region re-renders. */
  private bindReviewGestures() {
    let startX = 0;
    let dragging = false;
    const cardEl = () =>
      document.querySelector<HTMLElement>(".review-card");
    const swipeLeft = () =>
      this.state.reviewTier === "suggest" ? this.reviewNo() : this.reviewSkip();
    const swipeRight = () =>
      this.state.reviewTier === "suggest" ? this.reviewYes() : this.reviewMe();

    const onStart = (e: TouchEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".review-card")) return;
      dragging = true;
      startX = e.touches[0].clientX;
    };
    const onMove = (e: TouchEvent) => {
      if (!dragging) return;
      const dx = e.touches[0].clientX - startX;
      const el = cardEl();
      if (el) {
        el.style.transition = "none";
        el.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
        el.dataset.swipe = dx > 40 ? "yes" : dx < -40 ? "no" : "";
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!dragging) return;
      dragging = false;
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
      const el = cardEl();
      if (Math.abs(dx) > 90 && this.state.reviewHasCard && !this.state.reviewBusy) {
        if (dx > 0) swipeRight();
        else swipeLeft();
        // answering re-renders a fresh, untransformed card — nothing to reset
      } else if (el) {
        el.style.transition = "transform 0.18s ease";
        el.style.transform = "";
        el.dataset.swipe = "";
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!this.state.reviewOpen) return;
      if (e.key === "Escape") this.closeReview();
      if (!this.state.reviewHasCard || this.state.reviewBusy) return;
      if (e.key === "ArrowRight") swipeRight();
      if (e.key === "ArrowLeft") swipeLeft();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("keydown", onKey);
    this.reviewGesturesOff = () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("keydown", onKey);
    };
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

  /** Self-service password change for the signed-in member. */
  async changeOwnPassword() {
    const current = this.state.pwCurrent || "";
    const next = this.state.pwNew || "";
    if (!current || !next) {
      this.state.pwError = "Enter your current and new password";
      return;
    }
    try {
      await changePassword(current, next);
      this.state.pwCurrent = "";
      this.state.pwNew = "";
      this.state.pwError = "";
      showToaster({ from: "bottom", message: "Password changed", timer: 1800 });
    } catch (err: any) {
      this.state.pwError = err?.message || "Could not change password";
    }
  }

  // ── Voice ID (guided conversational enrollment) ───────────────────────────
  // Instead of a single blind recording, enrollment is a short chat: the member reads
  // a request to Aura, a live waveform shows the mic is hearing them, the sample is
  // enrolled, and Aura answers back in her real voice. Each line adds one sample to
  // the running-mean profile; the script is phonetically varied for a richer print.
  private voice?: VoiceSession;

  async startVoiceEnroll() {
    if (this.state.enrollActive) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.enrollMsg = "Microphone needs a secure (https) connection";
      return;
    }
    const session = new VoiceSession();
    try {
      await session.open();
    } catch {
      this.state.enrollMsg = "Microphone access denied";
      return;
    }
    this.voice = session;
    this.state.enrollTotal = VOICE_SCRIPT.length;
    this.state.enrollStep = 1;
    this.state.enrollAsk = VOICE_SCRIPT[0].ask;
    this.state.enrollReply = "";
    this.state.enrollHint = "";
    this.state.enrollMsg = "";
    this.state.enrollPhase = "ready";
    this.state.enrollActive = true; // renders the conversation card + canvas
    // The canvas only exists once bindrjs has rendered the gated region — grab it on
    // the next frame and start the (session-long) waveform draw loop.
    requestAnimationFrame(() => {
      const canvas = document.getElementById("voice-wave") as HTMLCanvasElement | null;
      if (canvas) session.bindCanvas(canvas);
    });
  }

  /** Record + enroll the current line, then let Aura reply and advance the script. */
  async recordVoiceLine() {
    const session = this.voice;
    if (!session || this.state.enrollPhase !== "ready") return;
    const line = VOICE_SCRIPT[this.state.enrollStep - 1];

    this.state.enrollReply = "";
    this.state.enrollPhase = "recording";
    this.state.enrollHint = "I'm listening — say it naturally.";
    let result;
    try {
      result = await session.recordLine();
    } catch {
      this.state.enrollHint = "";
      this.state.enrollMsg = "Couldn't record — try again";
      this.state.enrollPhase = "ready";
      return;
    }
    // Near-silence → retry the same line rather than enrolling a dud sample.
    if (result.peak < MIN_VOICE_PEAK) {
      this.state.enrollHint = "I barely heard you — speak up and try this line again.";
      this.state.enrollPhase = "ready";
      return;
    }

    this.state.enrollPhase = "saving";
    this.state.enrollHint = "";
    try {
      const wav = await blobToWav16k(result.blob);
      const { samples } = await enrollVoiceprint(wav);
      this.state.voiceSamples = samples;
    } catch (err: any) {
      this.state.enrollMsg = err?.message || "Enrollment failed";
      this.state.enrollPhase = "ready";
      return;
    }

    // Aura answers the request out loud — the payoff that makes this feel like talking
    // to the house, not filling a form.
    this.state.enrollPhase = "aura";
    this.state.enrollReply = line.reply;
    await speakAura(line.reply);

    if (this.state.enrollStep >= this.state.enrollTotal) {
      this.state.enrollPhase = "done";
      this.state.enrollMsg = `All set — your voice is enrolled (${this.state.voiceSamples} sample${this.state.voiceSamples === 1 ? "" : "s"}).`;
    } else {
      this.state.enrollStep += 1;
      this.state.enrollAsk = VOICE_SCRIPT[this.state.enrollStep - 1].ask;
      this.state.enrollPhase = "ready";
    }
  }

  /** Close a voice session — used by both "Cancel" mid-flow and "Done" at the end. */
  cancelVoiceEnroll() {
    this.voice?.close();
    this.voice = undefined;
    this.state.enrollActive = false;
    this.state.enrollPhase = "ready";
    this.state.enrollStep = 0;
    this.state.enrollAsk = "";
    this.state.enrollReply = "";
    this.state.enrollHint = "";
  }

  async forgetVoice() {
    try {
      await forgetVoiceprint();
      this.state.voiceSamples = 0;
      this.state.enrollMsg = "Voiceprint removed";
    } catch (err: any) {
      this.state.enrollMsg = err?.message || "Could not remove voiceprint";
    }
  }

  // ── Face ID (guided multi-angle enrollment) ───────────────────────────────
  // A live preview the member can actually see themselves in (centred in an oval
  // guide) replaces the old blind one-frame grab. We walk through a few poses, give
  // live coaching (lighting / face-in-frame), and capture one sample per pose. Where
  // the browser can detect faces we auto-capture once framed + steady; otherwise the
  // member taps Capture. The vision-service keeps the embeddings keyed to their id.
  private face?: FaceSession;
  private faceLoop = 0;
  private faceSteadySince = 0;
  private faceCountTimer = 0;
  private faceBusy = false; // a capture/countdown is in flight (don't double-fire)

  async startFaceEnroll() {
    if (this.state.faceActive) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.faceMsg = "Camera needs a secure (https) connection";
      return;
    }
    // The <video> only exists once the gated region renders — flip active, then attach
    // the stream to it on the next frame.
    this.state.faceTotal = FACE_POSES.length;
    this.state.faceStep = 1;
    this.state.facePose = FACE_POSES[0].label;
    this.state.facePoseHint = FACE_POSES[0].hint;
    this.state.faceHint = "";
    this.state.faceMsg = "";
    this.state.faceReady = false;
    this.state.faceCount = 0;
    this.state.facePhase = "preview";
    this.state.faceActive = true;

    const session = new FaceSession();
    const video = await new Promise<HTMLVideoElement | null>((resolve) =>
      requestAnimationFrame(() => resolve(document.getElementById("face-cam") as HTMLVideoElement | null)),
    );
    if (!video) {
      this.state.faceMsg = "Could not open the camera preview";
      this.state.faceActive = false;
      return;
    }
    try {
      await session.open(video);
    } catch {
      this.state.faceMsg = "Camera access denied";
      this.state.faceActive = false;
      return;
    }
    this.face = session;
    this.state.faceAuto = session.hasDetector;
    this.runFaceLoop();
  }

  /** Coaching/auto-capture loop: assess the frame ~5×/s, drive the ready ring, and —
   *  when a face stays framed and steady — count down and capture hands-free. */
  private runFaceLoop() {
    window.clearInterval(this.faceLoop);
    this.faceLoop = window.setInterval(async () => {
      const session = this.face;
      if (!session || this.state.facePhase === "saving" || this.faceBusy) return;
      const a = await session.assess();
      this.state.faceReady = a.faceOk;
      this.state.faceHint = a.hint;
      if (!session.hasDetector) return; // manual capture mode — no auto countdown
      if (a.faceOk) {
        if (!this.faceSteadySince) this.faceSteadySince = performance.now();
        if (performance.now() - this.faceSteadySince > FACE_STEADY_MS && this.state.faceCount === 0) {
          this.beginFaceCountdown();
        }
      } else {
        this.faceSteadySince = 0;
        this.cancelFaceCountdown();
      }
    }, 200);
  }

  private beginFaceCountdown() {
    window.clearInterval(this.faceCountTimer);
    this.state.faceCount = 3;
    this.faceCountTimer = window.setInterval(() => {
      // Abort if the face left the frame mid-count.
      if (!this.state.faceReady) {
        this.cancelFaceCountdown();
        return;
      }
      this.state.faceCount -= 1;
      if (this.state.faceCount <= 0) {
        window.clearInterval(this.faceCountTimer);
        this.faceCountTimer = 0;
        void this.captureFacePose();
      }
    }, 700);
  }

  private cancelFaceCountdown() {
    if (this.faceCountTimer) {
      window.clearInterval(this.faceCountTimer);
      this.faceCountTimer = 0;
    }
    if (this.state.faceCount !== 0) this.state.faceCount = 0;
  }

  /** Capture the current pose (auto at end of countdown, or the manual Capture tap). */
  async captureFacePose() {
    const session = this.face;
    if (!session || this.faceBusy || this.state.facePhase !== "preview") return;
    this.faceBusy = true;
    this.cancelFaceCountdown();
    this.faceSteadySince = 0;
    this.state.facePhase = "saving";
    this.state.faceHint = "";
    try {
      const jpeg = await session.capture();
      const { samples } = await enrollFace(jpeg);
      this.state.faceSamples = samples;
    } catch (err: any) {
      this.state.faceMsg = err?.message || "Face capture failed";
      this.state.facePhase = "preview";
      this.faceBusy = false;
      return;
    }

    if (this.state.faceStep >= this.state.faceTotal) {
      window.clearInterval(this.faceLoop);
      this.faceLoop = 0;
      this.state.facePhase = "done";
      this.state.faceMsg = `All set — your face is enrolled (${this.state.faceSamples} sample${this.state.faceSamples === 1 ? "" : "s"}).`;
      if (this.state.peopleEnabled) this.refreshPeople();
    } else {
      this.state.faceStep += 1;
      const pose = FACE_POSES[this.state.faceStep - 1];
      this.state.facePose = pose.label;
      this.state.facePoseHint = pose.hint;
      this.state.faceReady = false;
      this.state.facePhase = "preview";
    }
    this.faceBusy = false;
  }

  /** Close a face session — used by both "Cancel" mid-flow and "Done" at the end. */
  cancelFaceEnroll() {
    window.clearInterval(this.faceLoop);
    this.faceLoop = 0;
    this.cancelFaceCountdown();
    this.faceSteadySince = 0;
    this.faceBusy = false;
    this.face?.close();
    this.face = undefined;
    this.state.faceActive = false;
    this.state.facePhase = "preview";
    this.state.faceStep = 0;
    this.state.facePose = "";
    this.state.facePoseHint = "";
    this.state.faceHint = "";
    this.state.faceReady = false;
    this.state.faceCount = 0;
  }

  async forgetFace() {
    try {
      await forgetFace();
      this.state.faceSamples = 0;
      this.state.faceMsg = "Face profile removed";
    } catch (err: any) {
      this.state.faceMsg = err?.message || "Could not remove face profile";
    }
  }

  async signOut() {
    await logout();
    window.location.reload();
  }
}

export const HouseholdService = new HouseholdServiceClass();
export type { SessionUser };
