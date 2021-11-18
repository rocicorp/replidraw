import { IncomingMessage } from "http";
import { cookieSchema } from "../schemas/poke";
import { parse } from "url";
import { WebSocket } from "ws";
import { getClientRecord, setClientRecord } from "./data";
import { transact } from "./db";
import { dispatchMessage } from "./dispatch-message";
import { Client, ClientMap } from "./server";
import { Loop } from "./loop";

export async function connect(
  ws: WebSocket,
  req: IncomingMessage,
  clients: ClientMap,
  loop: Loop
) {
  const url = parse(req.url!, true);
  const parts = (url.pathname ?? "").split("/");

  if (parts[1] != "d" || !parts[2]) {
    ws.send("invalid url - no room id");
    ws.close();
    return;
  }

  const roomID = parts[2];
  const clientID = (url.query.clientID as string | undefined) ?? "";
  if (!clientID) {
    ws.send("invalid url - no client ID");
    ws.close();
    return;
  }
  const baseCookie = cookieSchema.safeParse(
    JSON.parse((url.query.baseCookie as string | undefined) ?? "null")
  );
  if (!baseCookie.success) {
    ws.send(`invalid base cookie in url: ${baseCookie.error.issues}`);
    ws.close();
    return;
  }

  const existingClient = clients.get(clientID);
  if (existingClient) {
    existingClient.socket.close();
  }

  await transact(async (tx) => {
    let record = await getClientRecord(tx, clientID);
    if (record) {
      if (record.documentID != roomID) {
        ws.send(`Cannot change roomID - already in room ${record.documentID}`);
        ws.close();
      }
      record.baseCookie = baseCookie.data;
    } else {
      record = {
        id: clientID,
        lastMutationID: 0,
        baseCookie: baseCookie.data,
        documentID: roomID,
      };
    }
    await setClientRecord(tx, record);
  });

  const client: Client = {
    clientID,
    roomID,
    socket: ws,
    pending: [],
  };
  clients.set(clientID, client);

  ws.on("close", () => {
    clients.delete(clientID);
  });

  ws.on("message", (data) => {
    dispatchMessage(client, data, loop);
  });
}
