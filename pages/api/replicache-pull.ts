import type { NextApiRequest, NextApiResponse } from "next";
import { transact } from "../../backend/db";
import { getCookie, getLastMutationID } from "../../backend/data";
import { QueryResult } from "pg";
import { pullRequestSchema, PullResponse } from "../../schemas/pull";

export default async (req: NextApiRequest, res: NextApiResponse) => {
  console.log(`Processing pull`, JSON.stringify(req.body, null, ""));

  const docID = req.query["docID"].toString();
  const pull = pullRequestSchema.safeParse(req.body);
  if (!pull.success) {
    res.status(400).json(pull.error.errors);
    return;
  }

  let requestCookie = pull.data.cookie ?? "0";
  let responseCookie = null;

  const t0 = Date.now();
  let entries;
  let lastMutationID = 0;

  await transact(async (executor) => {
    [entries, lastMutationID, responseCookie] = await Promise.all([
      executor(
        `select k, v, deleted from object
        where documentid = $1 and lastmodified > to_timestamp($2 ::decimal)`,
        [docID, requestCookie]
      ),
      getLastMutationID(executor, pull.data.clientID),
      getCookie(executor, docID),
    ]);
  });
  console.log("lastMutationID: ", lastMutationID);

  // Grump. Typescript seems to not understand that the argument to transact()
  // is guaranteed to have been called before transact() exits.
  entries = (entries as any) as QueryResult<any>;
  console.log(`Read ${entries.rows.length} objects in`, Date.now() - t0);

  const resp: PullResponse = {
    lastMutationID,
    cookie: responseCookie,
    patch: [],
  };

  for (let row of entries.rows) {
    const { k, v, deleted } = row;
    if (deleted) {
      resp.patch.push({
        op: "del",
        key: k,
      });
    } else {
      resp.patch.push({
        op: "put",
        key: k,
        value: JSON.parse(v),
      });
    }
  }

  console.log(`Returning`, JSON.stringify(resp, null, ""));
  res.json(resp);
  res.end();
};
