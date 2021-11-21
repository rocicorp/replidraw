import { JSONValue, ScanResult, WriteTransaction } from "replicache";
import { Version } from "./data";
import { EntryCache } from "./entry-cache";

/**
 * Implements Replicache's WriteTransaction in terms of EntryCache.
 */
export class ReplicacheTransaction implements WriteTransaction {
  private _clientID: string;
  private _inner: EntryCache;
  private _version: Version;

  get clientID(): string {
    return this._clientID;
  }

  constructor(inner: EntryCache, clientID: string, version: Version) {
    this._inner = inner;
    this._clientID = clientID;
    this._version = version;
  }
  async put(key: string, value: JSONValue): Promise<void> {
    await this._inner.put(key, value, this._version);
  }
  async del(key: string): Promise<boolean> {
    const had = await this.has(key);
    await this._inner.del(key, this._version);
    return had;
  }
  async get(key: string): Promise<JSONValue | undefined> {
    const entry = await this._inner.get(key);
    return entry.value;
  }
  async has(key: string): Promise<boolean> {
    return await this._inner.has(key);
  }

  // TODO!
  async isEmpty(): Promise<boolean> {
    throw new Error("not implemented");
  }
  scan(): ScanResult<string> {
    throw new Error("not implemented");
  }
  scanAll(): Promise<[string, JSONValue][]> {
    throw new Error("not implemented");
  }
}
