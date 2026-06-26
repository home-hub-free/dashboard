import { server, headers } from "./server-handler";
import { storageGet, storageSet } from "./utils.service";

/**
 * Dashboard-side household login. The hub is the single front door: we log in
 * against `/auth/*`, keep an opaque bearer token in localStorage, and attach it
 * to every authed request (see `authHeaders` in server-handler.ts). The current
 * user's identity + prefs also ride along to the agent (askAgent → data.user) so
 * it knows who is asking and can adapt its replies.
 */

export interface UserPrefs {
  tone?: string;
  [key: string]: unknown;
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  prefs: UserPrefs;
  createdAt?: string;
}

const TOKEN_KEY = "authToken";
const USER_KEY = "authUser";

export function getToken(): string | null {
  return storageGet(TOKEN_KEY);
}

export function currentUser(): SessionUser | null {
  return storageGet(USER_KEY);
}

function setSession(token: string, user: SessionUser) {
  storageSet(TOKEN_KEY, token);
  storageSet(USER_KEY, user);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Log in; on success persists the token + user and returns the user. */
export async function login(username: string, password: string): Promise<SessionUser> {
  const res = await fetch(server + "auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Login failed (${res.status})`);
  }
  const data = await res.json();
  setSession(data.token, data.user);
  return data.user;
}

/** Validate the stored token against the hub; refreshes the cached user. */
export async function fetchMe(): Promise<SessionUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(server + "auth/me", { headers: authHeaders() });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const data = await res.json();
    storageSet(USER_KEY, data.user);
    return data.user;
  } catch {
    // Network error: keep the cached session rather than locking the user out.
    return currentUser();
  }
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    await fetch(server + "auth/logout", {
      method: "POST",
      headers: authHeaders(),
    }).catch(() => {});
  }
  clearSession();
}

/** Request headers including the bearer token (for authed/mutation calls). */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : { ...headers };
}

// ── household roster (settings UI) ──────────────────────────────────────────
export async function listUsers(): Promise<SessionUser[]> {
  const res = await fetch(server + "auth/users", { headers: authHeaders() });
  if (!res.ok) throw new Error(`Could not load users (${res.status})`);
  return (await res.json()).users;
}

export async function createUser(input: {
  username: string;
  displayName?: string;
  password: string;
  prefs?: UserPrefs;
}): Promise<SessionUser> {
  const res = await fetch(server + "auth/users", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not create user (${res.status})`);
  return data.user;
}

export async function updateUser(
  id: string,
  patch: { displayName?: string; prefs?: UserPrefs; password?: string },
): Promise<SessionUser> {
  const res = await fetch(server + `auth/users/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not update user (${res.status})`);
  return data.user;
}

/** Self-service: the signed-in member changes their own password. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(server + "auth/change-password", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Could not change password (${res.status})`);
  }
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(server + `auth/users/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Could not delete user (${res.status})`);
  }
}

/** Called by authed fetches on a 401 — clears the session and reloads to the gate. */
export function handleUnauthorized() {
  clearSession();
  window.location.reload();
}
