import { Rep } from "./rep";
import { useSubscribe } from "replicache-react";
import { getClientState, clientStatePrefix } from "./client-state";
import { getShape, shapePrefix } from "./shape";

export function useShapeIDs(rep: Rep) {
  return useSubscribe(
    rep,
    async (tx) => {
      const shapes = await tx.scan({ prefix: shapePrefix }).keys().toArray();
      return shapes.map((k) => k.split("-", 2)[1]);
    },
    []
  );
}

export function useShapeByID(rep: Rep, id: string) {
  return useSubscribe(
    rep,
    async (tx) => {
      return await getShape(tx, id);
    },
    null
  );
}

export function useUserInfo(rep: Rep) {
  return useSubscribe(
    rep,
    async (tx) => {
      return (await getClientState(tx, rep.cid)).userInfo;
    },
    null
  );
}

export function useOverShapeID(rep: Rep) {
  return useSubscribe(
    rep,
    async (tx) => {
      return (await getClientState(tx, rep.cid)).overID;
    },
    ""
  );
}

export function useSelectedShapeID(rep: Rep) {
  return useSubscribe(
    rep,
    async (tx) => {
      return (await getClientState(tx, rep.cid)).selectedID;
    },
    ""
  );
}

export function useCollaboratorIDs(rep: Rep) {
  return useSubscribe(
    rep,
    async (tx) => {
      const clientIDs = await tx
        .scan({ prefix: clientStatePrefix })
        .keys()
        .toArray();
      return clientIDs
        .filter((k) => !k.endsWith(rep.cid))
        .map((k) => k.substr(clientStatePrefix.length));
    },
    []
  );
}

export function useClientInfo(rep: Rep, clientID: string) {
  return useSubscribe(
    rep,
    async (tx) => {
      return await getClientState(tx, clientID);
    },
    null
  );
}
