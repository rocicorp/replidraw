import { pushRequestBodySchema } from "./replicache-protocol-schemas";
import type { Mutation } from "./replicache-protocol-types";
import { mutators } from "../../frontend/data";
import { z } from "zod";
import { Write } from "./write";

export async function handlePush(storage: DurableObjectStorage, req: Request): Promise<Response> {
  const body = pushRequestBodySchema.parse(await req.json());
  const runTransaction = async (txn: DurableObjectTransaction) => {
    let lastMutationID = await getLastMutationID(txn, body.clientID);
    const write = new Write(txn, Date.now()); 

    for (const mutation of body.mutations) {
      const expectedMutationID = lastMutationID + 1;

      if (mutation.id < expectedMutationID) {
        console.log(`Skipping already processed mutation id: ${mutation.id}`);
        continue;
      }

      if (mutation.id > expectedMutationID) {
        return new Response(`Mutation id too high - expected mutationID: ${expectedMutationID}, got: ${mutation.id}`, {status: 400});
      }

      try {
        await applyMutation(write, mutation);
        lastMutationID = mutation.id;
        await setLastMutationID(txn, body.clientID, lastMutationID);
      } catch (e) {
        console.error(e);
        return new Response(e.message, {status: 400});
      }
    }

    return new Response("OK", {status: 200});
  };

  let response: Response|undefined = undefined;
  storage.transaction(async (txn: DurableObjectTransaction) => {
    response = await runTransaction(txn);
  });

  return response as any as Response;
}

async function applyMutation(write: Write, mutation: Mutation): Promise<void> {
  // TODO: do better
  // TODO: validate inputs
  const mutator = (mutators as any)[mutation.name];
  if (!mutator) {
    throw new Error(`Unknown mutation: ${mutation.name}`);
  }
  await mutator(write, ...(mutation.args ?? []));
}

async function getLastMutationID(txn: DurableObjectTransaction, clientID: string): Promise<number> {
  const lastMutationID = await txn.get(lmidKey(clientID));
  return z.number().int().positive().optional().parse(lastMutationID) ?? 0;
}

async function setLastMutationID(txn: DurableObjectTransaction, clientID: string, value: number): Promise<void> {
  await txn.put(lmidKey(clientID), value);
}

const lmidKey = (clientID: string) => `/sys/client/${clientID}`;