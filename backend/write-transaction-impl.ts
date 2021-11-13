import type { JSONValue, ScanResult, WriteTransaction } from "replicache";
import { delObject, getObject, putObject } from "./data";
import { Executor } from "./db";

/**
 * Implements Replicache's WriteTransaction interface in terms of a MySQL
 * transaction.
 */
export class WriteTransactionImpl implements WriteTransaction {
  private _clientID: string;
  private _docID: string;
  private _executor: Executor;
  private _cache: Map<
    string,
    { value: JSONValue | undefined; dirty: boolean }
  > = new Map();

  constructor(executor: Executor, clientID: string, docID: string) {
    this._clientID = clientID;
    this._docID = docID;
    this._executor = executor;
  }

  get clientID(): string {
    return this._clientID;
  }

  async put(key: string, value: JSONValue): Promise<void> {
    this._cache.set(key, { value, dirty: true });
  }
  async del(key: string): Promise<boolean> {
    const had = await this.has(key);
    this._cache.set(key, { value: undefined, dirty: true });
    return had;
  }
  async get(key: string): Promise<JSONValue | undefined> {
    const entry = this._cache.get(key);
    if (entry) {
      return entry.value;
    }
    const value = await getObject(this._executor, this._docID, key);
    this._cache.set(key, { value, dirty: false });
    return value;
  }
  async has(key: string): Promise<boolean> {
    const val = await this.get(key);
    return val !== undefined;
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

  async flush(): Promise<void> {
    await Promise.all(
      [...this._cache.entries()]
        .filter(([, { dirty }]) => dirty)
        .map(([k, { value }]) => {
          if (value === undefined) {
            return delObject(this._executor, this._docID, k);
          } else {
            return putObject(this._executor, this._docID, k, value);
          }
        })
    );
  }
}
