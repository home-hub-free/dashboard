export const server = "http://192.168.1.72:8080/";

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
      })
      .catch((err) => {
        // Return to original if something went wrong
        device.value = !device.value;
        reject(err);
      });
  });
}

export function sibmitDataChange(
  id: string,
  type: "device" | "sensor",
  name: string
) {
  return fetch(server + `${type}-data-set`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id,
      data: {
        name,
      },
    }),
  }).then(() => true);
}
