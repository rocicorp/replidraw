import * as t from "io-ts";
import { ExecuteStatementFn, transact } from "../../backend/rds";
import {
  putShape,
  moveShape,
  resizeShape,
  rotateShape,
  shape,
  deleteShape,
  initShapes,
} from "../../shared/shape";
import {
  initClientState,
  overShape,
  selectShape,
  setCursor,
  userInfo,
} from "../../shared/client-state";
import {
  delAllShapes,
  getLastMutationID,
  setLastMutationID,
  storage,
} from "../../backend/data";
import { must } from "../../backend/decode";
import type { NextApiRequest, NextApiResponse } from "next";
import { computePullInTransaction } from "../../backend/pull";
import { createPusher } from "../../backend/pusher";
import { PullResponse } from "replicache/out/replicache";

const mutationType = t.union([
  t.type({
    id: t.number,
    name: t.literal("createShape"),
    args: t.type({
      id: t.string,
      shape,
    }),
  }),
  t.type({
    id: t.number,
    name: t.literal("deleteShape"),
    args: t.string,
  }),
  t.type({
    id: t.number,
    name: t.literal("moveShape"),
    args: t.type({
      id: t.string,
      dx: t.number,
      dy: t.number,
    }),
  }),
  t.type({
    id: t.number,
    name: t.literal("resizeShape"),
    args: t.type({
      id: t.string,
      ds: t.number,
    }),
  }),
  t.type({
    id: t.number,
    name: t.literal("rotateShape"),
    args: t.type({
      id: t.string,
      ddeg: t.number,
    }),
  }),
  t.type({
    id: t.number,
    name: t.literal("initShapes"),
    args: t.array(
      t.type({
        id: t.string,
        shape,
      })
    ),
  }),
  t.type({
    id: t.number,
    name: t.literal("initClientState"),
    args: t.type({
      id: t.string,
      defaultUserInfo: userInfo,
    }),
  }),
  t.type({
    id: t.number,
    name: t.literal("setCursor"),
    args: t.type({
      id: t.string,
      x: t.number,
      y: t.number,
    }),
  }),
  t.type({
    id: t.number,
    name: t.literal("overShape"),
    args: t.type({
      clientID: t.string,
      shapeID: t.string,
    }),
  }),
  t.type({
    id: t.number,
    name: t.literal("selectShape"),
    args: t.type({
      clientID: t.string,
      shapeID: t.string,
    }),
  }),
  t.type({
    id: t.number,
    name: t.literal("deleteAllShapes"),
  }),
]);

const pushRequestType = t.type({
  clientID: t.string,
  mutations: t.array(mutationType),
});

export default async (req: NextApiRequest, res: NextApiResponse) => {
  console.log("Processing push", JSON.stringify(req.body, null, ""));

  const docID = req.query["docID"].toString();
  const { clientID, mutations } = must(pushRequestType.decode(req.body));

  // Because we are implementing multiplayer, our pushes will tend to have
  // *lots* of very fine-grained events. Think, for example, of mouse moves.
  //
  // I hear you saying, dear reader: "It's silly to send and process all these
  // little teeny movemove events. Why not collapse consecutive runs of the
  // same mutation type either on client before sending, or server before
  // processing.
  //
  // We could do that, but there are cases that are more complicated. Consider
  // drags for example: when a user drags an object, the mutations we get are
  // like: moveCursor,moveShape,moveCursor,moveShape,etc.
  //
  // It's less clear how to collapse sequences like this. In the specific case
  // of moveCursor/moveShape, you could come up with something that make sense,
  // but generally Replicache mutations are arbitrary functions of the data
  // at a moment in time. We can't re-order or collapse them and get a correct
  // result without re-running them.
  //
  // Instead, we take a different tack:
  // * We send all the mutations, faithfully, from the client (and rely on gzip
  //   to compress it).
  // * We open a single, exclusive transaction against MySQL to process all
  //   mutations in a push.
  // * We heavily cache (in memory) within that transaction so that we don't
  //   have to go all the way back to MySQL for each tiny mutation.
  // * We flush all the mutations to MySQL in parallel at the end.
  //
  // As a nice bonus this means that (a) we don't have to have any special-case
  // collapse logic anywhere, and (b) we get a nice perf boost by parallelizing
  // the flush at the end.

  let pokes!: Poke[];

  const t0 = Date.now();
  await transact(async (executor) => {
    const s = storage(executor, docID);

    let lastMutationID = await getLastMutationID(executor, clientID, true);
    console.log("lastMutationID:", lastMutationID);

    for (const mutation of mutations) {
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
      switch (mutation.name) {
        case "createShape":
          await putShape(s, mutation.args);
          break;
        case "deleteShape":
          await deleteShape(s, mutation.args);
          break;
        case "moveShape":
          await moveShape(s, mutation.args);
          break;
        case "resizeShape":
          await resizeShape(s, mutation.args);
          break;
        case "rotateShape":
          await rotateShape(s, mutation.args);
          break;
        case "initShapes":
          await initShapes(s, mutation.args);
          break;
        case "initClientState":
          await initClientState(s, mutation.args);
          break;
        case "setCursor":
          await setCursor(s, mutation.args);
          break;
        case "overShape":
          await overShape(s, mutation.args);
          break;
        case "selectShape":
          await selectShape(s, mutation.args);
          break;
        case "deleteAllShapes":
          await delAllShapes(executor, docID);
      }

      lastMutationID = expectedMutationID;
      console.log("Processed mutation in", Date.now() - t1);
    }

    await Promise.all([
      s.flush(),
      setLastMutationID(executor, clientID, lastMutationID, docID),
    ]);

    console.log("Processed all mutations in", Date.now() - t0);

    pokes = await computePokes(executor, docID);
  });

  const pusher = createPusher();
  const pokeStart = Date.now();
  console.log("XXX sending", pokes.length, "pokes");
  for (const part of partition(pokes, 10)) {
    for (const poke of part) {
      console.log("XXX sending poke", poke);
    }
    await pusher.triggerBatch(part);
  }
  console.log(
    "XXX sending",
    pokes.length,
    "pokes DONE",
    Date.now() - pokeStart
  );

  res.status(200).end();
};

type ClientInfo = { lastCookie: string; clientID: string };

async function getClientIDsAndLastCookies(
  executor: ExecuteStatementFn,
  docID: string
): Promise<ClientInfo[]> {
  const res = await executor(
    "SELECT ID, LastCookie FROM Client WHERE DocumentID = :docID AND LastCookie IS NOT NULL",
    {
      docID: { stringValue: docID },
    }
  );
  return (
    res.records?.map((r) => ({
      clientID: r[0].stringValue!,
      lastCookie: r[1].stringValue!,
    })) ?? []
  );
}

type Poke = {
  channel: string;
  name: string;
  data:
    | {
        lastCookie: string;
        response: PullResponse;
      }
    | {};
};

async function computePokes(
  executor: ExecuteStatementFn,
  docID: string
): Promise<Poke[]> {
  const clientInfos = await getClientIDsAndLastCookies(executor, docID);
  const pokes: (Poke | null)[] = await Promise.all(
    clientInfos.map(async ({ lastCookie, clientID }) => {
      const response = await computePullInTransaction(
        executor,
        lastCookie,
        clientID,
        docID
      );

      if (response.cookie === lastCookie) {
        return null;
      }

      const data = { lastCookie, response };
      const size = JSON.stringify(data).length;
      if (size >= 10 * 2 ** 10) {
        return {
          channel: `replidraw-${docID}-${clientID}`,
          name: "poke",
          data: {},
        };
      }

      return {
        channel: `replidraw-${docID}-${clientID}`,
        name: "super-poke",
        data,
      };
    })
  );
  return pokes.filter(Boolean) as Poke[];
}

function partition<T>(arr: T[], size: number): T[][] {
  const n = Math.ceil(arr.length / size);
  const result: T[][] = [];
  for (let i = 0; i < n; i++) {
    result.push(arr.slice(i * size, (i + 1) * size));
  }
  return result;
}
