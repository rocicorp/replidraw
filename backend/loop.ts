import { Executor, transact } from "./db";
import { setClientRecord, ClientRecord, mustGetClientRecords } from "./data";
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
export type Step = () => Promise<boolean>;

export class Loop {
  private _step: Step;
  private _now: Now;
  private _sleep: Sleep;
  private _loopIntervalMs: number;
  private _running: boolean;

  constructor(step: Step, now: Now, sleep: Sleep, loopIntervalMs: number) {
    this._step = step;
    this._now = now;
    this._sleep = sleep;
    this._loopIntervalMs = loopIntervalMs;
    this._running = false;
  }

  async run() {
    if (this._running) {
      return;
    }
    this._running = true;
    try {
      for (;;) {
        const t0 = this._now();
        const more = await this._step();
        if (!more) {
          break;
        }
        const t1 = this._now();
        const elapsed = t1 - t0;
        await this._sleep(Math.max(0, this._loopIntervalMs - elapsed));
      }
    } finally {
      this._running = false;
    }
  }
}

export async function step(
  clients: ClientMap,
  mutators: Record<string, Function>
): Promise<boolean> {
  const t0 = Date.now();

  const mutationsByRoom = getPendingMutationsByRoom(clients);
  if (mutationsByRoom.size === 0) {
    return false;
  }

  const pokes = await transact(async (executor) => {
    const pokes = [];
    // TODO: We could parallelize this.
    for (const [roomID, mutations] of mutationsByRoom) {
      pokes.push(...(await stepRoom(executor, roomID, mutations, mutators)));
    }
    return pokes;
  });

  // Remove processed mutations from pending.
  for (const p of pokes) {
    const client = clients.get(p.clientID)!;
    clearPending(client.pending, p.poke.lastMutationID);
  }

  sendPokes(pokes, clients);
  const t1 = Date.now();
  const elapsed = t1 - t0;
  console.log(`Completed step in ${elapsed}ms`);

  return true;
}

export async function stepRoom(
  executor: Executor,
  roomID: string,
  mutations: ClientMutation[],
  mutators: Record<string, Function>
): Promise<ClientPokeResponse[]> {
  const t0 = Date.now();

  // Sort by time received by server.
  mutations.sort((a, b) => a.timestamp - b.timestamp);

  // Load records for clients who have mutations this step.
  const affectedClientsIDs = [...new Set(mutations.map((m) => m.clientID))];
  const affectedClientRecords = await mustGetClientRecords(
    executor,
    affectedClientsIDs
  );

  // Process mutations.
  const tx = new EntryCache(new PostgresStorage(executor, roomID));
  const t1 = Date.now();
  for (const m of mutations) {
    const clientRecord = affectedClientRecords.get(m.clientID)!;
    const consumed = await stepMutation(tx, m, clientRecord, mutators);
    if (consumed) {
      clientRecord.lastMutationID = m.id;
    }
  }
  const t2 = Date.now();
  console.log(`Processed ${mutations.length} in ${t2 - t1}ms`);

  // Flush changes to both objects and clients to tx.
  await Promise.all([
    tx.flush(),
    [...affectedClientRecords.values()].map((record) =>
      setClientRecord(executor, record)
    ),
  ]);
  const t3 = Date.now();
  console.log(`Flushed changes in ${t3 - t2}ms`);

  // Calculate pokes.
  const pokes = await computePokes(executor, roomID, [
    ...affectedClientRecords.values(),
  ]);
  const t4 = Date.now();
  console.log(`Computed pokes in ${t4 - t3}ms`);

  const elapsed = t4 - t0;
  console.log(`Completed step in ${elapsed}ms`);

  return pokes;
}

export async function stepMutation(
  parentCache: EntryCache,
  mutation: ClientMutation,
  clientRecord: ClientRecord,
  mutators: Record<string, Function>
): Promise<boolean> {
  const cache = new EntryCache(parentCache);
  const repTx = new ReplicacheTransaction(cache, clientRecord.id);
  const expectedMutationID = clientRecord.lastMutationID + 1;
  if (mutation.id < expectedMutationID) {
    console.log(
      `Mutation ${mutation.id} has already been processed - skipping`
    );
    return true;
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

export async function clearPending(pending: Mutation[], lmid: number) {
  if (pending.length === 0) {
    return;
  }

  // Find the first mutation bigger than lmid (that still need to be processed).
  const idx = pending.findIndex((m) => m.id > lmid);

  // Could not find any such mutation. They have all been processed.
  if (idx === -1) {
    pending.length = 0;
  }

  // Remove all mutations up to the first one that still needs to be processed.
  pending.splice(0, idx);
}
