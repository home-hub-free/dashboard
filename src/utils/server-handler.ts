export const server = "http://192.168.1.199:8080/";
// export const server = "http://localhost:8080/";

const headers = {
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

export function submitDataChange(
  id: string,
  type: "devices" | "sensors",
  prop: string,
  value: any
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
