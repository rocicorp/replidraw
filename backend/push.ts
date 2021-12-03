import { transact } from "./pg";
import { getLastMutationID, setLastMutationID } from "./data";
import { WriteTransactionImpl } from "./write-transaction-impl";
import { mutators } from "../frontend/mutators";
import { PushRequest } from "../protocol/push";
import WebSocket from "ws";
import { Response } from "protocol/socket";

export async function handlePushRequest(
  push: PushRequest,
  roomID: string,
  clientID: string,
  socket: WebSocket
) {
  console.log(
    "Processing push",
    JSON.stringify(push, null, ""),
    "for client",
    clientID
  );

  const t0 = Date.now();
  await transact(async (executor) => {
    const tx = new WriteTransactionImpl(executor, clientID, roomID);

    let lastMutationID = await getLastMutationID(executor, clientID);
    console.log("lastMutationID:", lastMutationID);

    for (let i = 0; i < push.mutations.length; i++) {
      const mutation = push.mutations[i];
      const expectedMutationID = lastMutationID + 1;

      if (mutation.id < expectedMutationID) {
        console.log(
          `Mutation ${mutation.id} has already been processed - skipping`
        );
        continue;
      }
      if (mutation.id > expectedMutationID) {
        console.warn(`Mutation ${mutation.id} is from the future - aborting`);
        break;
      }

      console.log("Processing mutation:", JSON.stringify(mutation, null, ""));

      const t1 = Date.now();
      const mutator = (mutators as any)[mutation.name];
      if (!mutator) {
        console.error(`Unknown mutator: ${mutation.name} - skipping`);
      }

      try {
        await mutator(tx, mutation.args);
      } catch (e) {
        console.error(
          `Error executing mutator: ${JSON.stringify(mutator)}: ${e}`
        );
      }

      lastMutationID = expectedMutationID;
      console.log("Processed mutation in", Date.now() - t1);
    }

    await Promise.all([
      setLastMutationID(executor, clientID, lastMutationID),
      tx.flush(),
    ]);
  });

  console.log("Processed all mutations in", Date.now() - t0);

  const pushRes: Response = ["pushRes", { id: push.id }];
  socket.send(JSON.stringify(pushRes));
}
