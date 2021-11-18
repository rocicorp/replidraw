import { PokeResponse, Cookie, Patch } from "../schemas/poke";
import { ClientRecord, getCookie } from "./data";
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
  affectedClientRecords: ClientRecord[]
): Promise<ClientPokeResponse[]> {
  // Current cookie for this room.
  const cookie = await getCookie(executor, roomID);

  // Typically every client will have same exact base cookie. Let's only compute the distinct patches we need to.
  const distinctBaseCookies = [
    ...new Set(affectedClientRecords.map((c) => c.baseCookie)),
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
  const res = affectedClientRecords.map((cr) => {
    const patch = patches.get(cr.baseCookie)!;
    return {
      clientID: cr.id,
      poke: {
        baseCookie: cr.baseCookie,
        cookie: cookie,
        lastMutationID: cr.lastMutationID,
        patch,
      },
    };
  });

  return res;
}

export async function sendPokes(
  pokes: ClientPokeResponse[],
  clients: ClientMap
) {
  for (const p of pokes) {
    const client = clients.get(p.clientID)!;
    const res = ["poke", p.poke];
    client.socket.send(JSON.stringify(res));
  }
}
