import { transact } from "./pg";
import { getCookie, getLastMutationID } from "./data";
import { QueryResult } from "pg";
import { PullRequest, PullResponse } from "../schemas/pull";
import WebSocket from "ws";
import { Response } from "schemas/socket";

export async function handlePullRequest(
  pull: PullRequest,
  docID: string,
  clientID: string,
  socket: WebSocket
) {
  console.log(`Processing pull`, JSON.stringify(pull, null, ""));

  let requestCookie = pull.cookie ?? "0";
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
      getLastMutationID(executor, clientID),
      getCookie(executor, docID),
    ]);
  });
  console.log("lastMutationID: ", lastMutationID);

  // Grump. Typescript seems to not understand that the argument to transact()
  // is guaranteed to have been called before transact() exits.
  entries = (entries as any) as QueryResult<any>;
  console.log(`Read ${entries.rows.length} objects in`, Date.now() - t0);

  const pullRes: PullResponse = {
    baseCookie: pull.cookie,
    lastMutationID,
    cookie: responseCookie,
    patch: [],
  };

  for (let row of entries.rows) {
    const { k, v, deleted } = row;
    if (deleted) {
      pullRes.patch.push({
        op: "del",
        key: k,
      });
    } else {
      pullRes.patch.push({
        op: "put",
        key: k,
        value: JSON.parse(v),
      });
    }
  }

  const res: Response = ["pullRes", pullRes];
  const ress = JSON.stringify(res, null, "");
  console.log(`Returning`, ress);
  socket.send(ress);
}
