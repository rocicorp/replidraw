import { StoreImpl as KVStore } from "./kv";
import { Store as DAGStore } from "./replicache/src/dag/store";
import { Map as ProllyMap } from "./replicache/src/prolly/map";
import { flushCommit, getLastMutationID, initChain, loadCommit, LoadedCommit, pushHistory, readCommit, setLastMutationID } from "./commit";
import { WriteTransaction } from "./replicache/src/transactions";
import { Read } from "./replicache/src/dag/read";
import { PullResponse } from "./replicache/src/puller";
import { deepThaw, JSONValue } from "./replicache/src/json";
import { PushRequest } from "./replicache/src/sync/push";
import { ScanResult } from "./replicache/src/scan-iterator";
import { PullRequest } from "./replicache/src/sync/pull";

const mutators = {
  "put": async (tx: WriteTransaction, args: {key: string, value: string}) => {
    await tx.put(args.key, args.value);
  },
  "del": async (tx: WriteTransaction, args: {key: string}) => {
    await tx.del(args.key);
  },
};

export class DurableReplicache {
  _store: DAGStore;

  constructor(state: DurableObjectState, env: Env) {
    this._store = new DAGStore(new KVStore(state));
  }

  // Handle HTTP requests from clients.
  async fetch(request: Request) {
    try {
      return await this._store.withWrite(async (tx) => {
        const read = tx.read();
        let mainHash = (await read.getHead("main")) ?? null;
        const commit = await (mainHash ? loadCommit(read, mainHash) : initChain(tx));
        if (!commit) {
          throw new Error(`Corrupt database: could not find headHash: ${mainHash}`);
        }

        // Apply requested action.
        try {
          let url = new URL(request.url);
          switch (url.pathname) {
            case "/replicache-pull":
              return await pull(commit, mainHash, read, request);
            case "/replicache-push":
              return await push(commit, mainHash, request);
          }
          return new Response("ok");
        } finally {
          await flushCommit(tx, commit);
        }
      });
    } catch (e) {
      return new Response(e.toString(), { status: 500 });
    }
  }
}

// TODO(aa): It would be nice to just use the WriteTransactionImpl from inside
// Replicache, but it's difficult to do so because of all the embed goop. Once
// that is cleaned up, can replace this with the real one.
class WriteTransactionImpl implements WriteTransaction {
  constructor(map: ProllyMap) {
    this._map = map;
  }

  private _map: ProllyMap;

  async put(key: string, value: JSONValue): Promise<void> {
    this._map.put(key, value);
  }
  async del(key: string): Promise<boolean> {
    const had = await this._map.has(key);
    if (had) {
      this._map.del(key);
    }
    return had;
  }
  async get(key: string): Promise<JSONValue | undefined> {
    const v = await this._map.get(key);
    if (v === undefined) {
      return v;
    }
    return deepThaw(v);
  }
  async has(key: string): Promise<boolean> {
    return await this._map.has(key);
  }
  async isEmpty(): Promise<boolean> {
    const {done} = (this._map.entries().next()) as {done: boolean};
    return done;
  }
  scan(): ScanResult<string> {
    throw new Error("not implemented");
  }
  scanAll(): Promise<[string, JSONValue][]> {
    throw new Error("not implemented");
  }
}

async function push(commit: LoadedCommit, headHash: string|null, request: Request): Promise<Response> {
  const pushRequest = (await request.json()) as PushRequest; // TODO: validate
  let lastMutationID = await getLastMutationID(commit, pushRequest.clientID);

  const tx = new WriteTransactionImpl(commit.userData);

  for (let mutation of pushRequest.mutations) {
    const expectedMutationID = lastMutationID + 1;

    if (mutation.id < expectedMutationID) {
      console.log(`Mutation ${mutation.id} has already been processed - skipping`);
      continue;
    }
    if (mutation.id > expectedMutationID) {
      return new Response(`Mutation ${mutation.id} is from the future`, {status: 500});
    }

    const mutator = (mutators as any)[mutation.name];
    if (!mutator) {
      console.error(`Unknown mutator: ${mutation.name} - skipping`);
    }

    try {
      await mutator(tx, mutation.args);
    } catch (e) {
      console.error(`Error execututation mutator: ${JSON.stringify(mutator)}: ${e.message}`);
    }

    lastMutationID = expectedMutationID;
  }

  await setLastMutationID(commit, pushRequest.clientID, lastMutationID);

  if (headHash !== null) {
    await pushHistory(commit, headHash);
  }

  return new Response("OK");
}

async function pull(commit: LoadedCommit, headHash: string|null, read: Read, request: Request): Promise<Response> {
  const pullRequest = (await request.json()) as PullRequest; // TODO: validate
  const lastMutationID = await getLastMutationID(commit, pullRequest.clientID);
  const requestCookie = pullRequest.cookie;

  // Load the historical commit
  let prevMap: ProllyMap|null = null;
  if (requestCookie !== null) {
    if (typeof requestCookie !== "string") {
      return new Response("Invalid cookie", {status: 400});
    }
    const prevCommit = await readCommit(read, requestCookie);
    if (prevCommit) {
      prevMap = await ProllyMap.load(prevCommit.userDataHash, read);
    } else {
      console.warn(`Could not find cookie "${requestCookie}" - sending reset patch`)
    }
  }

  const patch = [];
  if (prevMap === null) {
    patch.push({op: "clear" as const});
    patch.push(...[...commit.userData.entries()].map(([key, value]) => ({
      op: "put" as const,
      key,
      value: deepThaw(value),
    })));
  } else {
    for (const [nk, nv] of commit.userData.entries()) {
      if (!prevMap.has(nk) || prevMap.get(nk) !== nv) {
        patch.push({op: "put" as const, key: nk, value: deepThaw(nv)});
      }
    }
    for (const [pk] of prevMap.entries()) {
      if (!commit.userData.has(pk)) {
        patch.push({op: "del" as const, key: pk});
      }
    }
  }

  const pullResonse: PullResponse = {
    cookie: headHash,
    lastMutationID,
    patch,
  };

  return new Response(JSON.stringify(pullResonse), {
    headers: {
      "Content-type": "application/javascript",
    },
  });
}

interface Env {}

