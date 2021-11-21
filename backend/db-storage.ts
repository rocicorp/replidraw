import { JSONValue } from "replicache";
import { delEntry, Entry, getEntry, putEntry, Version } from "./data";
import { Executor } from "./db";
import type { Storage } from "./entry-cache";

/**
 * Implements EntryCache's Storage interface in terms of the database.
 */
export class DBStorage implements Storage {
  private _executor: Executor;
  private _roomID: string;

  constructor(executor: Executor, roomID: string) {
    this._executor = executor;
    this._roomID = roomID;
  }

  async put(key: string, value: JSONValue, version: Version): Promise<void> {
    return putEntry(this._executor, this._roomID, key, value, version);
  }
  async del(key: string, version: Version): Promise<void> {
    return delEntry(this._executor, this._roomID, key, version);
  }
  async get(key: string): Promise<Entry> {
    return await getEntry(this._executor, this._roomID, key);
  }
}
