import { Executor, transact } from "./db";
import {
  setClientRecord,
  ClientRecord,
  mustGetClientRecords,
  getCookie,
} from "./data";
import { Mutation } from "../schemas/push";
import { ClientID, ClientMap } from "./server";
import { sendPokes, ClientPokeResponse, computePokes } from "./poke";
import { EntryCache } from "./entry-cache";
import { ReplicacheTransaction } from "./replicache-transaction";
import { PostgresStorage } from "./postgres-storage";

export type Now = typeof performance.now;
export type Sleep = (ms: number) => Promise<void>;
export type ClientMutation = Required<Mutation> & { clientID: ClientID };
export type RoomID = string;

// Returns false when there is no more work to do.
export type Step = () => Promise<void>;

/**
 * A game loop that runs some `Step` function periodically until the step has
 * no more work to do.
 */
export class Loop {
  private _step: Step;
  private _now: Now;
  private _sleep: Sleep;
  private _loopIntervalMs: number;
  private _running: boolean;
  private _runPending: boolean;

  constructor(step: Step, now: Now, sleep: Sleep, loopIntervalMs: number) {
    this._step = step;
    this._now = now;
    this._sleep = sleep;
    this._loopIntervalMs = loopIntervalMs;
    this._running = false;
    this._runPending = false;
  }

  async run() {
    if (this._running) {
      this._runPending = true;
      return;
    }

    this._running = true;
    try {
      for (;;) {
        const t0 = this._now();
        this._runPending = false;
        await this._step();
        const t1 = this._now();
        const elapsed = t1 - t0;
        if (!this._runPending) {
          break;
        }
        await this._sleep(Math.max(0, this._loopIntervalMs - elapsed));
      }
    } finally {
      this._running = false;
    }
  }
}

/**
 * Advances the game loop one step by running all mutations in all rooms that
 * are ready and sending out the relevant pokes on the coresponding Clients.
 *
 * @param clients All currently connected clients.
 * @param mutators All known mutators.
 */
export async function step(
  clients: ClientMap,
  mutators: Record<string, Function>
): Promise<void> {
  const t0 = Date.now();

  const mutationsByRoom = getPendingMutationsByRoom(clients);
  if (mutationsByRoom.size === 0) {
    return;
  }

  const pokes = await transact(async (executor) => {
    const pokes = [];
    // TODO: We could parallelize this.
    for (const [roomID, mutations] of mutationsByRoom) {
      pokes.push(
        ...(await stepRoom(
          executor,
          roomID,
          mutations,
          mutators,
          [...clients.values()]
            .filter((c) => c.roomID == roomID)
            .map((c) => c.clientID)
        ))
      );
    }
    return pokes;
  });

  // Remove processed mutations from pending.
  for (const p of pokes) {
    const client = clients.get(p.clientID)!;
    console.log(
      `Clearing client ${client.clientID} pending mutations to lmid ${p.poke.lastMutationID}`
    );
    clearPending(client.pending, p.poke.lastMutationID);
  }

  sendPokes(pokes, clients);
  const t1 = Date.now();
  const elapsed = t1 - t0;
  console.log(`Completed step in ${elapsed}ms`);
}

/**
 * Advances a single room forward by executing a set of mutations against it.
 *
 * @param executor A database executor to read and write to.
 * @param roomID The room to step.
 * @param mutations The mutations to execute.
 * @param mutators All currently registered mutators.
 * @param connectedClients Clients we will return pokes for.
 * @returns Pokes that need to be sent to clients after the changes to executor are committed.
 */
export async function stepRoom(
  executor: Executor,
  roomID: string,
  mutations: ClientMutation[],
  mutators: Record<string, Function>,
  connectedClients: ClientID[]
): Promise<ClientPokeResponse[]> {
  const t0 = Date.now();

  // Sort by time received by server.
  // push() guarantees that timestamps increase monotonically with respect to mutation IDs within
  // each client. So sorting by timestamp globally should also give us mutation IDs sorted ascending.
  // However, this function's correctness doesn't depend on that: if a mutation is out of order,
  // it will not be processed. If this happens in real life, the result will be that that client
  // will stall, rather than have its mutations applied out of order.
  mutations.sort((a, b) => a.timestamp - b.timestamp);

  // Load records for affected clients.
  // We need the records for all clients who sent mutations even if they are no longer connected,
  // because we still need to execute those mutations.
  // We need the clients for everyone in the room, even if they didn't send a message, because we
  // need to send them pokes.
  const affectedClientsIDs = new Set([
    ...mutations.map((m) => m.clientID),
    ...connectedClients,
  ]);

  const affectedClientRecords = await mustGetClientRecords(executor, [
    ...affectedClientsIDs,
  ]);

  // Process mutations.
  const tx = new EntryCache(new PostgresStorage(executor, roomID));
  const t1 = Date.now();
  for (const m of mutations) {
    const cr = affectedClientRecords.get(m.clientID)!;
    const consumed = await stepMutation(tx, m, cr.lastMutationID, mutators);
    if (consumed) {
      cr.lastMutationID = m.id;
    }
  }
  const t2 = Date.now();
  console.log(`Processed ${mutations.length} in ${t2 - t1}ms`);

  // Flush changes to objects to the executor.
  await tx.flush();

  // Calculate pokes.
  const pokes = await computePokes(
    executor,
    roomID,
    connectedClients,
    affectedClientRecords
  );
  const t3 = Date.now();
  console.log(`Computed pokes in ${t3 - t2}ms`);

  // Now we can get the new room cookie and update all the CRs
  const roomCookie = await getCookie(executor, roomID);
  await Promise.all(
    [...affectedClientRecords.values()].map((cr) =>
      setClientRecord(executor, {
        ...cr,
        baseCookie: roomCookie,
      })
    )
  );

  const t4 = Date.now();
  console.log(`Flushed changes in ${t4 - t3}ms`);

  const elapsed = t4 - t0;
  console.log(`Completed stepRoom in ${elapsed}ms`);

  return pokes;
}

/**
 * Executes a single mutation against a room.
 * @param parentCache The object cache to read and write to.
 * @param mutation The mutation to execute.
 * @param clientLastMutationID The last mutation ID executed by this client.
 * @param mutators All known mutators.
 * @returns True if the mutation was processed, false otherwise.
 */
export async function stepMutation(
  parentCache: EntryCache,
  mutation: ClientMutation,
  clientLastMutationID: number,
  mutators: Record<string, Function>
): Promise<boolean> {
  const cache = new EntryCache(parentCache);
  const repTx = new ReplicacheTransaction(cache, mutation.clientID);
  const expectedMutationID = clientLastMutationID + 1;
  if (mutation.id < expectedMutationID) {
    console.log(
      `Mutation ${mutation.id} has already been processed - skipping`
    );
    return false;
  }
  if (mutation.id > expectedMutationID) {
    console.warn(
      `Mutation ${mutation.id} is out of order - expected ${expectedMutationID} - skipping`
    );
    return false;
  }

  console.log(`Processing mutation ${JSON.stringify(mutation)}`);
  const mutator = mutators[mutation.name]!;
  try {
    await mutator(repTx, mutation.args);
  } catch (e) {
    console.error(`Error executing mutator: ${JSON.stringify(mutator)}: ${e}`);
  }

  await cache.flush();
  return true;
}

/**
 * Gets all ready mutations and returns them grouped by room.
 * @param clients Clients to get mutations from.
 * @returns
 */
export function getPendingMutationsByRoom(
  clients: ClientMap
): Map<RoomID, ClientMutation[]> {
  const res: Map<string, ClientMutation[]> = new Map();
  for (const [clientID, client] of clients) {
    if (client.pending.length === 0) {
      continue;
    }
    let list = res.get(client.roomID);
    if (list === undefined) {
      list = [];
      res.set(client.roomID, list);
    }
    list.push(
      ...client.pending.map((m) => ({
        ...m,
        timestamp: m.timestamp!,
        clientID,
      }))
    );
  }
  return res;
}

/**
 * Clear pending mutations from a list.
 * @param pending list of pending mutations to edit, sorted by lmid.
 * @param lmid Last processed mutation ID.
 */
export async function clearPending(pending: Mutation[], lmid: number) {
  if (pending.length === 0) {
    return;
  }

  // Find the first mutation bigger than lmid (that still need to be processed).
  const idx = pending.findIndex((m) => m.id > lmid);

  // Could not find any such mutation. They have all been processed.
  if (idx === -1) {
    pending.length = 0;
    return;
  }

  // Remove all mutations up to the first one that still needs to be processed.
  pending.splice(0, idx);
}
