import { transact } from "./pg";
import { getCookie, getLastMutationID, userPrefix } from "./data";
import { QueryResult } from "pg";
import { PullRequest, PullResponse } from "../protocol/pull";
import WebSocket from "ws";
import { Response } from "../protocol/socket";

export async function handlePullRequest(
  pull: PullRequest,
  roomID: string,
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
        `select key, value, deleted from object
        where roomid = $1 and lastmodified > to_timestamp($2 ::decimal)`,
        [roomID, requestCookie]
      ),
      getLastMutationID(executor, clientID),
      getCookie(executor, roomID),
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
    const { key: keyWithPrefix, value, deleted } = row;
    const key = keyWithPrefix.substring(userPrefix.length);
    if (deleted) {
      pullRes.patch.push({
        op: "del",
        key: key,
      });
    } else {
      pullRes.patch.push({
        op: "put",
        key: key,
        value: JSON.parse(value),
      });
    }
  }

  const res: Response = ["pullRes", pullRes];
  const ress = JSON.stringify(res, null, "");
  console.log(`Returning`, ress);
  socket.send(ress);
}
