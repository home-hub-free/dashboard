import { headers, server } from "../../../utils/server-handler";

export class AssistantMenuServiceClass {

  assistantSay(text: string) {
    return fetch(server + "emma-say", {
      method: "POST",
      headers,
      body: JSON.stringify({
        text,
      })
    }).then((res) => res.json());
  }
}
export const AssistantMenuService = new AssistantMenuServiceClass();