import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";
import { ExecuteStatementCommandOutput, Field } from "@aws-sdk/client-rds-data";
import { transact } from "../../backend/rds";
import { getCookieVersion, getLastMutationID } from "../../backend/data";
import { must } from "../../shared/decode";

export default async (req: NextApiRequest, res: NextApiResponse) => {
  console.log(`Processing pull`, JSON.stringify(req.body, null, ""));

  const pull = must(pullRequest.decode(req.body));
  let cookie = pull.baseStateID === "" ? 0 : parseInt(pull.baseStateID);

  const t0 = Date.now();
  let entries;
  let lastMutationID = 0;
  let serverTime;

  await transact(async (executor) => {
    [entries, lastMutationID, cookie, serverTime] = await Promise.all([
      executor(
        "SELECT K, V, Deleted, LastModified FROM Object WHERE Version > :version",
        {
          version: { longValue: cookie },
        }
      ),
      getLastMutationID(executor, pull.clientID),
      getCookieVersion(executor),
      executor("SELECT NOW()"),
    ]);
  });
  console.log("lastMutationID: ", lastMutationID);
  console.log("Read all objects in", Date.now() - t0);

  // Grump. Typescript seems to not understand that the argument to transact()
  // is guaranteed to have been called before transact() exits.
  entries = (entries as any) as ExecuteStatementCommandOutput;
  serverTime = must(
    t.string.decode(
      ((serverTime as any) as ExecuteStatementCommandOutput).records?.[0]?.[0]
        .stringValue
    )
  );

  const resp: PullResponse = {
    lastMutationID,
    stateID: String(cookie),
    patch: [],
    // TODO: Remove this as soon as Replicache stops requiring it.
    httpRequestInfo: {
      httpStatusCode: 200,
      errorMessage: "",
    },
  };

  if (entries.records) {
    for (let row of entries.records) {
      const [
        { stringValue: key },
        { stringValue: content },
        { booleanValue: deleted },
        { stringValue: lastModified },
      ] = row as [
        Field.StringValueMember,
        Field.StringValueMember,
        Field.BooleanValueMember,
        Field.StringValueMember
      ];
      if (deleted) {
        resp.patch.push({
          op: "remove",
          path: `/${key}`,
        });
      } else {
        const j = JSON.parse(content);
        j.serverLastModified = lastModified;
        resp.patch.push({
          op: "replace",
          path: `/${key}`,
          valueString: JSON.stringify(j),
        });
      }
    }
    resp.patch.push({
      op: "replace",
      path: "/server-time",
      valueString: JSON.stringify(serverTime),
    });
  }

  console.log(`Returning`, JSON.stringify(resp, null, ""));
  res.json(resp);
  res.end();
};

const pullRequest = t.type({
  clientID: t.string,
  baseStateID: t.string,
});

const pullResponse = t.type({
  stateID: t.string,
  lastMutationID: t.number,
  patch: t.array(
    t.union([
      t.type({
        op: t.literal("replace"),
        path: t.string,
        // TODO: This will change to be arbitrary JSON
        valueString: t.string,
      }),
      t.type({
        op: t.literal("add"),
        path: t.string,
        valueString: t.string,
      }),
      t.type({
        op: t.literal("remove"),
        path: t.string,
      }),
    ])
  ),
  // unused - will go away
  httpRequestInfo: t.type({
    httpStatusCode: t.number,
    errorMessage: t.literal(""),
  }),
});
type PullResponse = t.TypeOf<typeof pullResponse>;
