import * as t from "io-ts";
import { PullResponse } from "replicache";
import { ExecuteStatementCommandOutput, Field } from "@aws-sdk/client-rds-data";
import { ExecuteStatementFn, transact } from "./rds";
import { getCookie, getLastMutationID, setLastCookie, storage } from "./data";
import { initShapes, randomShape } from "../shared/shape";

export const pullRequestType = t.type({
  clientID: t.string,
  cookie: t.union([t.string, t.null]),
});

export async function computePull(
  requestCookie: string,
  clientID: string,
  docID: string
): Promise<PullResponse> {
  let resp!: PullResponse;
  await transact(async (executor) => {
    resp = await computePullInTransaction(
      executor,
      requestCookie,
      clientID,
      docID
    );
  });
  return resp;
}

export async function computePullInTransaction(
  executor: ExecuteStatementFn,
  requestCookie: string,
  clientID: string,
  docID: string
): Promise<PullResponse> {
  const t0 = Date.now();
  let entries!: ExecuteStatementCommandOutput;
  let lastMutationID!: number;
  let responseCookie!: string;

  const s = storage(executor, docID);
  await initShapes(
    s,
    Array.from({ length: 5 }, () => randomShape())
  );
  await s.flush();
  [entries, lastMutationID, responseCookie] = await Promise.all([
    executor(
      `SELECT K, V, Deleted FROM Object
          WHERE DocumentID = :docID AND LastModified > FROM_UNIXTIME(:lastmod)`,
      {
        docID: { stringValue: docID },
        lastmod: { stringValue: requestCookie },
      }
    ),
    getLastMutationID(executor, clientID),
    getCookie(executor, docID),
  ]);

  console.log("lastMutationID: ", lastMutationID);
  console.log("Read all objects in", Date.now() - t0);

  const resp: PullResponse = {
    lastMutationID,
    cookie: responseCookie,
    patch: [],
  };

  if (entries.records) {
    for (let row of entries.records) {
      const [
        { stringValue: key },
        { stringValue: content },
        { booleanValue: deleted },
      ] = row as [
        Field.StringValueMember,
        Field.StringValueMember,
        Field.BooleanValueMember
      ];
      if (deleted) {
        resp.patch.push({
          op: "del",
          key,
        });
      } else {
        resp.patch.push({
          op: "put",
          key,
          value: JSON.parse(content),
        });
      }
    }
  }

  const setLastCookieStart = Date.now();
  await setLastCookie(executor, clientID, responseCookie, docID);
  console.log("xxx setting last cookie took", Date.now() - setLastCookieStart);

  return resp;
}
