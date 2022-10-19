export const server = "http://localhost:8080/";

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
  // For immidiate feedback, update the value before the server call
  let newVal = !device.value;
  return new Promise((resolve, reject) => {
    device.value = newVal;
    return fetch(server + "device-update", {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: device.id,
        value: newVal,
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
  type: "device" | "sensor",
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
      // actions.forEach(action => {

      // });
      return actions;
    });
}
