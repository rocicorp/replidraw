import { JSONValue, ScanResult, WriteTransaction } from "replicache";
import { EntryCache } from "./entry-cache";

/**
 * Implements Replicache's WriteTransaction in terms of EntryCache.
 */
export class ReplicacheTransaction implements WriteTransaction {
  private _clientID: string;
  private _inner: EntryCache;

  get clientID(): string {
    return this._clientID;
  }

  constructor(inner: EntryCache, clientID: string) {
    this._inner = inner;
    this._clientID = clientID;
  }
  async put(key: string, value: JSONValue): Promise<void> {
    await this._inner.put(key, value);
  }
  async del(key: string): Promise<boolean> {
    const had = await this.has(key);
    await this._inner.del(key);
    return had;
  }
  async get(key: string): Promise<JSONValue | undefined> {
    return await this._inner.get(key);
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
