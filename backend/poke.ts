import { Cookie, Patch, PokeResponse } from "../schemas/poke";
import { ClientRecord, getRoomVersion } from "./data";
import { Executor } from "./db";
import { getPatch } from "./get-patch";
import { ClientID, ClientMap } from "./server";

export type ClientPokeResponse = {
  clientID: ClientID;
  poke: PokeResponse;
};

export async function computePokes(
  executor: Executor,
  roomID: string,
  clientIDs: ClientID[],
  records: Map<ClientID, ClientRecord>
): Promise<[number, ClientPokeResponse[]]> {
  // Current cookie for this room.
  const cookie = await getRoomVersion(executor, roomID);

  // Typically every client will have same exact base cookie. Let's only compute the distinct patches we need to.
  const distinctBaseCookies = [
    ...new Set(clientIDs.map((id) => records.get(id)!.baseCookie)),
  ];

  // Calculate all distinct patches in parallel.
  const patches = new Map(
    await Promise.all(
      distinctBaseCookies.map(
        async (baseCookie) =>
          [baseCookie, await getPatch(executor, roomID, baseCookie)] as [
            Cookie,
            Patch
          ]
      )
    )
  );

  // ... and return resulting pokes
  const res = clientIDs.map((clientID) => {
    const cr = records.get(clientID)!;
    const patch = patches.get(cr.baseCookie)!;
    return {
      clientID: cr.id,
      poke: {
        baseCookie: cr.baseCookie,
        cookie: cookie,
        lastMutationID: cr.lastMutationID,
        patch,
        timestamp: 0,
      },
    } as ClientPokeResponse;
  });

  return [cookie, res];
}

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
