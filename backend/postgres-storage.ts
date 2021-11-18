import { JSONValue } from "replicache";
import { delObject, getObject, putObject } from "./data";
import { Executor } from "./db";
import type { Storage } from "./entry-cache";

/**
 * Implements EntryCache's Storage interface in terms of Postgres.
 */
export class PostgresStorage implements Storage {
  private _executor: Executor;
  private _roomID: string;

  constructor(executor: Executor, roomID: string) {
    this._executor = executor;
    this._roomID = roomID;
  }

  put(key: string, value: JSONValue): Promise<void> {
    return putObject(this._executor, this._roomID, key, value);
  }
  del(key: string): Promise<void> {
    return delObject(this._executor, this._roomID, key);
  }
  get(key: string): Promise<JSONValue | undefined> {
    return getObject(this._executor, this._roomID, key);
  }
}
