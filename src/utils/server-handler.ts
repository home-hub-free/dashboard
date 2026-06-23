import { AutoEffect } from "../views/automations/automations.model";

// Server URL. Defaults to the fixed Raspberry Pi IP on the home LAN, but can be
// overridden for local development/verification via the VITE_SERVER_URL env var.
export const server =
  (import.meta as any).env?.VITE_SERVER_URL || "http://192.168.1.232:8088/";

export type BlindsConfigureActions =
  | "spin"
  | "switch-direction"
  | "home-position"
  | "set-limit";

export const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

interface ServerResponse {
  data: any;
  success: boolean;
}

export function getEndPointData(endpoint: string) {
  return fetch(server + endpoint, {
    method: "GET",
  }).then((data) => data.json());
}

export function toggleServerDevice(device: any): Promise<ServerResponse> {
  return new Promise((resolve, reject) => {
    return fetch(server + "device-update", {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: device.id,
        value: device.value,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result) {
          resolve({
            data: result,
            success: true,
          });
        } else {
          reject();
        }
      });
  });
}

/** Channel-addressed device write (Stage 4c). Posts {id, channel, value} to
 * /device-update; the hub routes it to that one channel via node.setChannel. */
export function setServerChannel(
  id: string,
  channel: string,
  value: boolean | number,
): Promise<ServerResponse> {
  return fetch(server + "device-update", {
    method: "POST",
    headers,
    body: JSON.stringify({ id, channel, value }),
  })
    .then((res) => res.json())
    .then((result) => ({ data: result, success: !!result }));
}

export function submitDataChange(
  id: string,
  type: "devices" | "sensors",
  prop: string,
  value: any,
) {
  return fetch(server + `${type}-data-set`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id,
      data: {
        [prop]: value,
      },
    }),
  }).then(() => true);
}

export function getDeviceProgrammableActions(id: string) {
  return fetch(server + "device-get-actions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      id,
    }),
  })
    .then((res) => res.json())
    .then((actions) => {
      return actions;
    });
}

export function saveEffect(effect: any) {
  return fetch(server + "set-effect", {
    method: "POST",
    headers,
    body: JSON.stringify({ effect }),
  });
}

export function saveEffects(effects: AutoEffect[]) {
  return fetch(server + "set-effects", {
    method: "POST",
    headers,
    body: JSON.stringify({ effects }),
  });
}

export function requestCalendarData() {
  return fetch(server + "emma-calendar", {
    method: "GET",
    headers,
  }).then((res) => res.json());
}

export function requestWeatherData() {
  return fetch(server + "emma-weather", {
    method: "GET",
  }).then((res) => res.json());
}

export function updateHouseData(property: string, value: any) {
  return fetch(server + "update-house-data", {
    method: "POST",
    headers,
    body: JSON.stringify({
      property,
      value,
    }),
  });
}

export async function calibrateSensor(id: string) {
  const res = await fetch(server + "sensor-calibrate", {
    method: "POST",
    headers,
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => ({}));
  // The hub returns 400 (IP unknown / sensor not found), 409 (already
  // calibrating) or 5xx (device unreachable). Surface those so the UI can
  // toast and revert, rather than spin forever waiting on progress that the
  // server never started polling for.
  if (!res.ok) {
    throw new Error(data?.error || `Calibration failed (${res.status})`);
  }
  return data;
}
