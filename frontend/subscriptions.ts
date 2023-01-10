import {useSubscribe} from 'replicache-react';
import {getClientState, clientStatePrefix} from './client-state';
import {getShape, getShapes} from './shape';
import type {Replicache} from 'replicache';
import type {M} from './mutators.js';

export function useShapes(rep: Replicache<M>) {
  return useSubscribe(
    rep,
    async tx => {
      return await getShapes(tx);
    },
    [],
  );
}

export function useShapeByID(rep: Replicache<M>, id: string) {
  return useSubscribe(
    rep,
    async tx => {
      return (await getShape(tx, id)) ?? null;
    },
    null,
  );
}

export function useUserInfo(rep: Replicache<M>) {
  return useSubscribe(
    rep,
    async tx => {
      return (await getClientState(tx, await rep.clientID)).userInfo;
    },
    null,
  );
}

export function useOverShape(rep: Replicache<M>) {
  return useSubscribe(
    rep,
    async tx => {
      const {overID} = await getClientState(tx, await rep.clientID);
      return overID ? (await getShape(tx, overID)) ?? null : null;
    },
    null,
  );
}

export function useSelectedShape(rep: Replicache<M>) {
  return useSubscribe(
    rep,
    async tx => {
      const {selectedID} = await getClientState(tx, await rep.clientID);
      return selectedID ? (await getShape(tx, selectedID)) ?? null : null;
    },
    null,
  );
}

export function useCollaboratorIDs(rep: Replicache<M>) {
  return useSubscribe(
    rep,
    async tx => {
      const clientIDs = await tx
        .scan({prefix: clientStatePrefix})
        .keys()
        .toArray();
      const myClientID = await rep.clientID;
      return clientIDs
        .filter(k => !k.endsWith(myClientID))
        .map(k => k.substr(clientStatePrefix.length));
    },
    [],
  );
}

export function useClientInfo(rep: Replicache<M>, clientID: string) {
  return useSubscribe(
    rep,
    async tx => {
      return await getClientState(tx, clientID);
    },
    null,
  );
}
