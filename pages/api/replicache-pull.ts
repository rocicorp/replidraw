import type { NextApiRequest, NextApiResponse } from "next";
import { transact } from "../../backend/pg";
import {
  createDatabase,
  getChangedEntries,
  getCookie,
  getLastMutationID,
} from "../../backend/data";
import { z } from "zod";
import { PullResponse, PullResponseOK } from "replicache";

const pullRequest = z.object({
  clientID: z.string(),
  lastMutationIDs: z.record(z.string(), z.number()),
  cookie: z.union([z.number(), z.null()]),
});

export default async (req: NextApiRequest, res: NextApiResponse) => {
  console.log(`Processing pull`, JSON.stringify(req.body, null, ""));
  if (!req.query["spaceID"]) {
    res.status(400).send("Missing spaceID");
    res.end();
    return;
  }
  const t0 = Date.now();
  const spaceID = req.query["spaceID"].toString();
  const pull = pullRequest.parse(req.body);
  let requestCookie = pull.cookie;

  console.log("spaceID", spaceID);
  console.log("clientID", pull.clientID);
  console.log("request lastMutationIDs", pull.lastMutationIDs);

  const [entries, lastMutationIDs, responseCookie] = await transact(
    async (executor) => {
      await createDatabase(executor);
      const lastMutationIDs: Record<string, number> = {};
      for (const [clientID, lastMutationID] of Object.entries(
        pull.lastMutationIDs
      )) {
        const persistedLmid = await getLastMutationID(executor, clientID);
        console.log(
          "clientID",
          clientID,
          "lastMutationID",
          lastMutationID,
          "persistedLmid",
          persistedLmid
        );
        lastMutationIDs[clientID] = persistedLmid || 0;
      }
      return Promise.all([
        getChangedEntries(executor, spaceID, requestCookie ?? 0),
        lastMutationIDs,
        getCookie(executor, spaceID),
      ]);
    }
  );

  console.log("response lastMutationIDs: ", lastMutationIDs);
  console.log("responseCookie: ", responseCookie);
  console.log("Read all objects in", Date.now() - t0);

  // change to PullResponseDD31
  const resp: PullResponseOK = ({
    lastMutationIDs,
    cookie: responseCookie ?? 0,
    patch: [],
  } as unknown) as PullResponseOK;

  for (let [key, value, deleted] of entries) {
    if (deleted) {
      resp.patch.push({
        op: "del",
        key,
      });
    } else {
      resp.patch.push({
        op: "put",
        key,
        value,
      });
    }
  }

  res.json(resp);
  res.end();
  console.log("Processing pull took", Date.now() - t0);
};
