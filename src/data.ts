import { Replicache, ReadTransaction, WriteTransaction } from "replicache";
import type { JSONValue } from "replicache";
import { useSubscribe } from "replicache-react";
import {
  getShape,
  Shape,
  putShape,
  moveShape,
  resizeShape,
  rotateShape,
  deleteShape,
  keyPrefix as shapePrefix,
} from "./shape";
import {
  getClientState,
  overShape,
  initClientState,
  setCursor,
  keyPrefix as clientStatePrefix,
  selectShape,
} from "./client-state";
import type { UserInfo } from "./client-state";

export type Data = Await<ReturnType<typeof createData>>;
type Await<T> = T extends PromiseLike<infer U> ? U : T;

export async function createData(
  rep: Replicache<typeof mutators>,
  defaultUserInfo: UserInfo
) {
  let clientID = await rep.clientID;

  function subscribe<T extends JSONValue>(
    def: T,
    f: (tx: ReadTransaction) => Promise<T>
  ): T {
    return useSubscribe(rep, f, def);
  }

  await rep.mutate.initClientState({
    id: clientID,
    defaultUserInfo,
  });

  return {
    clientID,

    get rep(): Replicache {
      return rep;
    },

    ...rep.mutate,

    // subscriptions
    useShapeIDs: () =>
      subscribe([], async (tx: ReadTransaction) => {
        const shapes = await tx.scan({ prefix: "shape-" }).keys().toArray();
        return shapes.map((k) => k.split("-", 2)[1]);
      }),

    useShapeByID: (id: string) =>
      subscribe(null, (tx: ReadTransaction) => {
        return getShape(tx, id);
      }),

    useUserInfo: (clientID: string) =>
      subscribe(null, async (tx: ReadTransaction) => {
        return (await getClientState(tx, clientID)).userInfo;
      }),

    useOverShapeID: () =>
      subscribe("", async (tx: ReadTransaction) => {
        return (await getClientState(tx, clientID)).overID;
      }),

    useSelectedShapeID: () =>
      subscribe("", async (tx: ReadTransaction) => {
        return (await getClientState(tx, clientID)).selectedID;
      }),

    useCollaboratorIDs: (clientID: string) =>
      subscribe([], async (tx: ReadTransaction) => {
        const r = [];
        for await (let k of tx.scan({ prefix: clientStatePrefix }).keys()) {
          if (!k.endsWith(clientID)) {
            r.push(k.substr(clientStatePrefix.length));
          }
        }
        return r;
      }),

    useClientInfo: (clientID: string) =>
      subscribe(null, async (tx: ReadTransaction) => {
        return await getClientState(tx, clientID);
      }),
  };
}

export const mutators = {
  async createShape(tx: WriteTransaction, args: { id: string; shape: Shape }) {
    await putShape(tx, args);
  },

  async deleteShape(tx: WriteTransaction, id: string) {
    await deleteShape(tx, id);
  },

  async moveShape(
    tx: WriteTransaction,
    args: { id: string; dx: number; dy: number }
  ) {
    await moveShape(tx, args);
  },

  async resizeShape(tx: WriteTransaction, args: { id: string; ds: number }) {
    await resizeShape(tx, args);
  },

  async rotateShape(tx: WriteTransaction, args: { id: string; ddeg: number }) {
    await rotateShape(tx, args);
  },

  async initClientState(
    tx: WriteTransaction,
    args: { id: string; defaultUserInfo: UserInfo }
  ) {
    await initClientState(tx, args);
  },

  async setCursor(
    tx: WriteTransaction,
    args: { id: string; x: number; y: number }
  ) {
    await setCursor(tx, args);
  },

  async overShape(
    tx: WriteTransaction,
    args: { clientID: string; shapeID: string }
  ) {
    await overShape(tx, args);
  },

  async selectShape(
    tx: WriteTransaction,
    args: { clientID: string; shapeID: string }
  ) {
    await selectShape(tx, args);
  },

  async deleteAllShapes(tx: WriteTransaction) {
    await Promise.all(
      (await tx.scan({ prefix: shapePrefix }).keys().toArray()).map((k) =>
        tx.del(k)
      )
    );
  },
};
