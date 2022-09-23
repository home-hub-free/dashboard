import { server } from "./contants";

export function getEndPointData(endpoint: string) {
  return fetch(server + endpoint, {
    method: "GET",
  }).then((data) => data.json());
}

export function toggleDevice(device: any) {
  let newVal = !device.value;
  // device.value = 
  return new Promise((resolve, reject) => {
    return fetch(server + "manual-control", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device: device.id,
        value: device.value,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        device.value = newVal;
        console.log(result);
      })
      .catch((err) => {
        console.log(err);
      });
  });
}