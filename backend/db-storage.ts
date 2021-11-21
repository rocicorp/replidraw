import { JSONValue } from "replicache";
import { delObject, getObject, putObject } from "./data";
import { Executor } from "./db";
import type { Storage } from "./entry-cache";

/**
 * Implements EntryCache's Storage interface in terms of the database.
 */
export class DBStorage implements Storage {
  private _executor: Executor;
  private _roomID: string;
  private _version: number;

  constructor(executor: Executor, roomID: string, version: number) {
    this._executor = executor;
    this._roomID = roomID;
    this._version = version;
  }

  async put(key: string, value: JSONValue): Promise<void> {
    return putObject(this._executor, this._roomID, key, value, this._version);
  }
  async del(key: string): Promise<void> {
    return delObject(this._executor, this._roomID, key, this._version);
  }
  async get(key: string): Promise<JSONValue | undefined> {
    const [v] = await getObject(this._executor, this._roomID, key);
    return v;
  }
}
