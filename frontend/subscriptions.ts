import {useSubscribe} from 'replicache-react';
import {getClientState, clientStatePrefix} from './client-state';
import {getShape, shapePrefix} from './shape';
import type {Replicache} from 'replicache';
import type {M} from './mutators.js';

export function useShapeIDs(rep: Replicache<M>) {
  return useSubscribe(
    rep,
    async tx => {
      const shapes = await tx.scan({prefix: shapePrefix}).keys().toArray();
      return shapes.map(k => k.split('-', 2)[1]);
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

export function useOverShapeID(rep: Replicache<M>) {
  return useSubscribe(
    rep,
    async tx => {
      return (await getClientState(tx, await rep.clientID)).overID;
    },
    '',
  );
}

export function useSelectedShapeID(rep: Replicache<M>) {
  return useSubscribe(
    rep,
    async tx => {
      return (await getClientState(tx, await rep.clientID)).selectedID;
    },
    '',
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
