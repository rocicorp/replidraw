import { Client, ClientMap } from "./server";
import { JSONValue } from "replicache";
import { PushRequest } from "../schemas/push";
import { requestSchema } from "../schemas/network";
import { push } from "./push";
import WebSocket from "ws";
import { Loop } from "./loop";

export function dispatchMessage(
  source: Client,
  data: WebSocket.RawData,
  loop: Loop
) {
  let v: JSONValue;
  try {
    v = JSON.parse(data.toString());
  } catch (e) {
    source.socket.send(`invalid JSON: ${String(e)}`);
    return;
  }

  const message = requestSchema.safeParse(v);
  if (!message.success) {
    source.socket.send(`invalid request: ${message.error.issues}`);
    return;
  }

  const [type, payload] = message.data;
  switch (type) {
    case "push":
      push(payload as PushRequest, source, loop);
      break;
    default:
      source.socket.send(`invalid request type: ${type}`);
      break;
  }
}
