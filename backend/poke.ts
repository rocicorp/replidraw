import { PokeResponse } from "../schemas/poke";
import { ClientID, ClientMap } from "./server";

export type ClientPokeResponse = {
  clientID: ClientID;
  poke: PokeResponse;
};

export async function sendPokes(
  pokes: ClientPokeResponse[],
  clients: ClientMap
) {
  for (const p of pokes) {
    // TODO: It is possible that client has gone away, handle this and test.
    const client = clients.get(p.clientID)!;
    const res = ["poke", p.poke];
    client.socket.send(JSON.stringify(res));
  }
}
