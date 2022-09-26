import { server } from "./contants";

interface ServerResponse {
  data: any,
  success: boolean
}

export function getEndPointData(endpoint: string) {
  return fetch(server + endpoint, {
    method: "GET",
  }).then((data) => data.json());
}

export function toggleServerDevice(device: any): Promise<ServerResponse> {
  let newVal = !device.value;
  return new Promise((resolve, reject) => {
    return fetch(server + "manual-control", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device: device.id,
        value: newVal,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result) {
          device.value = newVal
          resolve({
            data: result,
            success: true,
          })
        } else {
          reject()
        }

      })
      .catch((err) => {
        reject(err)
      });
  });
}