import type { JSONValue } from "replicache";

export interface Storage {
  put(key: string, value: JSONValue): Promise<void>;
  del(key: string): Promise<void>;
  get(key: string): Promise<JSONValue | undefined>;
  // TODO: support for scanning.
}

/**
 * Implements a read/write cache for key/value pairs on top of some lower-level
 * storage.
 *
 * This is designed to be stacked: EntryCache itself implements Storage so that
 * you can create multiple layers of caches and control when they flush.
 */
export class EntryCache {
  private _storage: Storage;
  private _cache: Map<
    string,
    { value: JSONValue | undefined; dirty: boolean }
  > = new Map();

  constructor(storage: Storage) {
    this._storage = storage;
  }

  async put(key: string, value: JSONValue): Promise<void> {
    this._cache.set(key, { value, dirty: true });
  }
  async del(key: string): Promise<void> {
    this._cache.set(key, { value: undefined, dirty: true });
  }
  async get(key: string): Promise<JSONValue | undefined> {
    const entry = this._cache.get(key);
    if (entry) {
      return entry.value;
    }
    const value = await this._storage.get(key);
    this._cache.set(key, { value, dirty: false });
    return value;
  }
  async has(key: string): Promise<boolean> {
    const val = await this.get(key);
    return val !== undefined;
  }

  async flush(): Promise<void> {
    await Promise.all(
      [...this._cache.entries()]
        .filter(([, { dirty }]) => dirty)
        .map(([k, { value }]) => {
          if (value === undefined) {
            return this._storage.del(k);
          } else {
            return this._storage.put(k, value);
          }
        })
    );
  }
}
