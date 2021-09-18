import { StoreImpl as KVStore } from "./kv";
import { Store as DAGStore } from "./replicache/src/dag/store";
import { Map as ProllyMap } from "./replicache/src/prolly/map";
import { flushCommit, getClient, initChain, loadCommit, LoadedCommit, pushHistory, readCommit, setClient } from "./commit";
import { WriteTransaction } from "./replicache/src/transactions";
import { Read } from "./replicache/src/dag/read";
import { PatchOperation, PullResponse } from "./replicache/src/puller";
import { deepThaw, JSONValue } from "./replicache/src/json";
import { PushRequest } from "./replicache/src/sync/push";
import { ScanResult } from "./replicache/src/scan-iterator";
import { PullRequest } from "./replicache/src/sync/pull";
import { mutators } from "../../src/data";

declare global {
  interface CloudflareWebsocket {
    accept(): unknown;
    addEventListener(event: 'close', callbackFunction: (code?: number, reason?: string) => unknown): unknown;
    addEventListener(event: 'error', callbackFunction: (e: unknown) => unknown): unknown;
    addEventListener(event: 'message', callbackFunction: (event: { data: any }) => unknown): unknown;

    /**
     * @param code https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
     * @param reason
     */
    close(code?: number, reason?: string): unknown;
    send(message: string|Uint8Array): unknown;

    // Cloudflare's workers don't support readyState, but minflare does, and we need
    // this in order to detect closed mf sockets.
    readyState: number|undefined;
  }

  class WebSocketPair {
    0: CloudflareWebsocket; // Client
    1: CloudflareWebsocket; // Server
  }

  interface ResponseInit {
    webSocket?: CloudflareWebsocket;
  }
}

export class DurableReplicache {
  _store: DAGStore;
  _sockets: Map<string, CloudflareWebsocket>;

  constructor(state: DurableObjectState, env: Env) {
    this._store = new DAGStore(new KVStore(state));
    this._sockets = new Map();
  }

  // Handle HTTP requests from clients.
  async fetch(request: Request) {
    const t0 = Date.now();
    try {
      return await this._store.withWrite(async (write) => {
        let url = new URL(request.url);
        if (url.pathname == "/replicache-poke") {
          return poke(url, request, this._sockets);
        }

        const read = write.read();
        let mainHash = (await read.getHead("main"));
        let commit: LoadedCommit;
        if (mainHash) {
          const loaded = await loadCommit(read, mainHash);
          if (!loaded) {
            throw new Error(`Corrupt database: could not find headHash: ${mainHash}`);
          }
          commit = loaded;
        } else {
          [commit, mainHash] = await initChain(write);
        }

        // Apply requested action.
        try {
          switch (url.pathname) {
            case "/replicache-pull":
              return await pull(commit, mainHash, read, request);
            case "/replicache-push":
              return await push(commit, mainHash, request, this._sockets, write.read());
          }
          return new Response("ok");
        } finally {
          await flushCommit(write, commit);
        }
      });
    } catch (e) {
      console.error("caught error", e.stack);
      if (request.headers.get("Upgrade") == "websocket") {
        // Annoyingly, if we return an HTTP error in response to a WebSocket request, Chrome devtools
        // won't show us the response body! So... let's send a WebSocket response with an error
        // frame instead.
        let pair = new WebSocketPair();
        pair[1].accept();
        pair[1].send(JSON.stringify({error: e.toString()}));
        pair[1].close(1011, "Uncaught exception during session setup");
        return new Response(null, { status: 101, webSocket: pair[0] });
      } else {
        return new Response(e.toString(), {status: 500});
      }
    } finally {
      console.log(`Processed ${request.url} in ${Date.now() - t0}ms`);
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

function poke(url: URL, request: Request, sockets: Map<string, CloudflareWebsocket>): Response{
  if (request.headers.get("Upgrade") != "websocket") {
    return new Response("expected websocket", {status: 400});
  }
  const clientID = url.searchParams.get("clientID");
  if (!clientID) {
    return new Response("missing clientID parameter", {status: 400});
  }
  console.log(`Initializing WebSocket for client: ${clientID}...`);
  const pair = new WebSocketPair();
  const {0: server, 1: client} = pair;
  server.addEventListener('error', e => {
    console.log("WebSocket server got error", e);
    sockets.delete(clientID);
  });
  server.addEventListener('close', () => {
    console.log("WebSocket has closed :-(");
    sockets.delete(clientID);
  });
  const existing = sockets.get(clientID);
  if (existing) {
    console.log(`Found existing server socket for client: ${clientID} - closing`);
    existing.close();
  }
  sockets.set(clientID, server);
  server.accept();
  console.log('Returning socket client');
  return new Response(null, { status: 101, webSocket: client });
}

async function push(commit: LoadedCommit, headHash: string|null, request: Request, sockets: Map<string, CloudflareWebsocket>, read: Read): Promise<Response> {
  const pushRequest = (await request.json()) as PushRequest; // TODO: validate
  const client = await getClient(commit, pushRequest.clientID);

  const tx = new WriteTransactionImpl(commit.userData);

  for (let mutation of pushRequest.mutations) {
    const expectedMutationID = client.lastMutationID + 1;

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
      console.error(`Error executing mutator: ${JSON.stringify(mutator)}: ${e.message}`);
    }

    client.lastMutationID = expectedMutationID;
  }

  await setClient(commit, pushRequest.clientID, client);

  if (headHash !== null) {
    await pushHistory(commit, headHash);
  }

  await sendSuperpokes(read, headHash, commit, sockets);

  return new Response("OK");
}

async function pull(commit: LoadedCommit, headHash: string|null, read: Read, request: Request): Promise<Response> {
  const pullRequest = (await request.json()) as PullRequest; // TODO: validate
  const client = await getClient(commit, pullRequest.clientID);
  const requestCookie = pullRequest.cookie;

  if (requestCookie !== null && typeof requestCookie !== "string") {
    return new Response("Invalid cookie", {status: 400});
  }

  const patch = await computePatch(requestCookie, commit, read);

  const pullResonse: PullResponse = {
    cookie: headHash,
    lastMutationID: client.lastMutationID,
    patch,
  };

  client.lastCookie = headHash;
  await setClient(commit, pullRequest.clientID, client);

  return new Response(JSON.stringify(pullResonse), {
    headers: {
      "Content-type": "application/javascript",
    },
  });
}

async function computePatch(sourceCookie: string|null, destCommit: LoadedCommit, read: Read): Promise<PatchOperation[]> {
  // Load the historical commit
  let sourceMap: ProllyMap|null = null;
  if (sourceCookie !== null) {
    const sourceCommit = await readCommit(read, sourceCookie);
    if (sourceCommit) {
      sourceMap = await ProllyMap.load(sourceCommit.userDataHash, read);
    } else {
      console.warn(`Could not find cookie "${sourceCookie}" - sending reset patch`)
    }
  }

  const patch: PatchOperation[] = [];
  if (sourceMap === null) {
    patch.push({op: "clear" as const});
    patch.push(...[...destCommit.userData.entries()].map(([key, value]) => ({
      op: "put" as const,
      key,
      value: deepThaw(value),
    })));
  } else {
    for (const [nk, nv] of destCommit.userData.entries()) {
      if (!sourceMap.has(nk) || sourceMap.get(nk) !== nv) {
        patch.push({op: "put" as const, key: nk, value: deepThaw(nv)});
      }
    }
    for (const [pk] of sourceMap.entries()) {
      if (!destCommit.userData.has(pk)) {
        patch.push({op: "del" as const, key: pk});
      }
    }
  }

  return patch;
}

async function sendSuperpokes(read: Read, destCookie: string | null, destCommit: LoadedCommit, sockets: Map<string, CloudflareWebsocket>): Promise<void> {
  console.log(`Sending poke to ${sockets.size} clients...`);

  const patchCache = new Map<string|null, PatchOperation[]>();

  const getPatch = async (sourceCookie: string|null) => {
    const cached = patchCache.get(sourceCookie);
    if (cached) {
      return  cached;
    }

    const computed = await computePatch(sourceCookie, destCommit, read);
    patchCache.set(sourceCookie, computed);
    return computed;
  };

  for (const [clientID, socket] of sockets.entries()) {
    // CF doesn't support `readyState`, but miniflare does and needs this to avoid sending to
    // a closed connection.
    if (typeof socket.readyState !== "undefined") {
      if (socket.readyState == WebSocket.CLOSED || socket.readyState == WebSocket.CLOSING) {
        console.log(`Found closed socket for client: ${clientID} - deleting`);
        sockets.delete(clientID);
        continue;
      }
    }

    const client = await getClient(destCommit, clientID);
    const patch = await getPatch(client.lastCookie);
    socket.send(JSON.stringify({
      baseCookie: client.lastCookie,
      response: {
        cookie: destCookie,
        lastMutationID: client.lastMutationID,
        patch,
      },
    }));
    client.lastCookie = destCookie;
    setClient(destCommit, clientID, client);
  }

}

interface Env {}

