import { transact } from "../../backend/db";
import { getLastMutationID, setLastMutationID } from "../../backend/data";
import Pusher from "pusher";
import type { NextApiRequest, NextApiResponse } from "next";
import { WriteTransactionImpl } from "../../backend/write-transaction-impl";
import { mutators } from "../../frontend/mutators";
import { pushRequestSchema } from "../../schemas/push";

export default async (req: NextApiRequest, res: NextApiResponse) => {
  console.log("Processing push", JSON.stringify(req.body, null, ""));

  const docID = req.query["docID"].toString();
  const push = pushRequestSchema.safeParse(req.body);
  if (!push.success) {
    res.status(400).json(push.error.errors);
    return;
  }

  const t0 = Date.now();
  await transact(async (client) => {
    const tx = new WriteTransactionImpl(client, docID);

    let lastMutationID = await getLastMutationID(client, push.data.clientID);
    console.log("lastMutationID:", lastMutationID);

    for (let i = 0; i < push.data.mutations.length; i++) {
      const mutation = push.data.mutations[i];
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
      setLastMutationID(client, push.data.clientID, lastMutationID),
      tx.flush(),
    ]);
  });

  console.log("Processed all mutations in", Date.now() - t0);

  const pusher = new Pusher({
    appId: "1157097",
    key: "d9088b47d2371d532c4c",
    secret: "64204dab73c42e17afc3",
    cluster: "us3",
    useTLS: true,
  });

  const t2 = Date.now();
  pusher.trigger("default", "poke", {});
  console.log("Sent poke in", Date.now() - t2);

  res.status(200).send("OK");
};
