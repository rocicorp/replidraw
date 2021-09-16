import { Map as ProllyMap } from "./replicache/src/prolly/map";
import { Write } from "./replicache/src/dag/write"
import { deepThaw, JSONValue, ReadonlyJSONValue } from "./replicache/src/json"
import { Chunk } from "./replicache/src/dag/chunk";
import { Read } from "./replicache/src/dag/read";

const MAX_HISTORY_ENTRIES = 50;

export type LoadedCommit = {
  data: CommitData;
  userData: ProllyMap;
  clientData: ProllyMap;
}

type Client = {
  lastMutationID: number;
  lastCookie: string|null;
}

type CommitData = {
  date: string;
  operation: Init | Mutation;  // maybe also pull if that can add data?
  userDataHash: string;
  clientsHash: string;
  historyData: string[];
}

type Mutation = {
  type: "mutation";
  clientID: string;
  name: string;
  args: JSONValue;
}

type Init = {
  type: "init";
}

export async function pushHistory(commit: LoadedCommit, prevCommitHash: string) {
  commit.data.historyData.push(prevCommitHash);
  if (commit.data.historyData.length > MAX_HISTORY_ENTRIES) {
    commit.data.historyData = commit.data.historyData.slice(commit.data.historyData.length - MAX_HISTORY_ENTRIES);
  }
}

export async function getClient(commit: LoadedCommit, clientID: string): Promise<Client> {
  let val = commit.clientData.get(clientID);
  if (val) {
    return deepThaw(val) as Client;
  }
  const client: Client = {
    lastCookie: null,
    lastMutationID: 0,
  };
  setClient(commit, clientID, client);
  return client;
}

export function setClient(commit: LoadedCommit, clientID: string, client: Client) {
  commit.clientData.put(clientID, client);
}

export async function flushCommit(write: Write, commit: LoadedCommit): Promise<void> {
  commit.data.userDataHash = await commit.userData.flush(write);
  commit.data.clientsHash = await commit.clientData.flush(write);
  const chunk = await Chunk.new(commit.data,
    [...new Set(
      [commit.data.userDataHash, commit.data.clientsHash, ...commit.data.historyData])]);
  await write.putChunk(chunk);
  await write.setHead("main", chunk.hash);
}

export async function loadCommit(read: Read, hash: string): Promise<LoadedCommit|null> {
  const cd = await readCommit(read, hash);
  if (!cd) {
    return null;
  }
  return {
    data: cd,
    userData: await ProllyMap.load(cd.userDataHash, read),
    clientData: await ProllyMap.load(cd.clientsHash, read),
  };
}

export async function readCommit(read: Read, hash: string): Promise<CommitData|null> {
  const chunk = await read.getChunk(hash);
  if (!chunk) {
    return null;
  }
  return chunk.data as CommitData;
}

export async function initChain(write: Write) {
  const map = ProllyMap.new();
  const emptyMapHash = await map.flush(write);
  const commit: CommitData = {
    date: new Date().toISOString(),
    operation: { type: "init" },
    userDataHash: emptyMapHash,
    clientsHash: emptyMapHash,
    historyData: [],
  };
  const chunk = await Chunk.new(commit, [emptyMapHash]);
  await write.putChunk(chunk);
  const loaded: LoadedCommit = {
    data: commit,
    userData: map,
    clientData: ProllyMap.new(),
  };
  return [loaded, chunk.hash] as const;
}
