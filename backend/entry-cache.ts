import type { JSONValue } from "replicache";
import { Entry, Version } from "./data";

export interface Storage {
  put(key: string, value: JSONValue, version: Version): Promise<void>;
  del(key: string, version: Version): Promise<void>;
  get(key: string): Promise<Entry>;
  // TODO: support for scanning.
}

/**
 * Implements a read/write cache for key/value pairs on top of some lower-level
 * storage.
 *
 * This is designed to be stacked: EntryCache itself implements Storage so that
 * you can create multiple layers of caches and control when they flush.
 */
export class EntryCache implements Storage {
  private _storage: Storage;
  private _cache: Map<string, { entry: Entry; dirty: boolean }> = new Map();

  constructor(storage: Storage) {
    this._storage = storage;
  }

  async put(key: string, value: JSONValue, version: Version): Promise<void> {
    this._cache.set(key, { entry: { value, version }, dirty: true });
  }
  async del(key: string, version: Version): Promise<void> {
    this._cache.set(key, { entry: { value: undefined, version }, dirty: true });
  }
  async get(key: string): Promise<Entry> {
    const cached = this._cache.get(key);
    if (cached) {
      return cached.entry;
    }
    const entry = await this._storage.get(key);
    this._cache.set(key, { entry, dirty: false });
    return entry;
  }
  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry.value !== undefined;
  }

  async flush(): Promise<void> {
    await Promise.all(
      [...this._cache.entries()]
        // Destructure ALL the things
        .filter(([, { dirty }]) => dirty)
        .map(([k, { entry }]) => {
          const { value, version } = entry;
          if (value === undefined) {
            return this._storage.del(k, version);
          } else {
            return this._storage.put(k, value, version);
          }
        })
    );
  }
}
